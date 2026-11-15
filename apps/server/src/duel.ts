// Teste de COMBATE PvP (Etapa 9) com 2 clientes reais por WebSocket contra um servidor NOVO (ninguem mais conectado).
// Mostra que o SERVIDOR decide: dano exato, recarga, replay de actionId, alcance, golpe forjado, desconexao no meio da luta,
// morte + mochila + credito, morto nao ataca nem apanha, e a protecao curta de reaparecimento.
// Sai com codigo 1 se qualquer checagem falhar. Dura ~40 s (relogio real).
import { Client, Room } from "colyseus.js";
import {
  ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_REACH_PX,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_MS,
  SPAWN_GRACE_MS,
  WORLD_ROOM_NAME,
  type CombatEventMsg,
  type EntityUpdateMsg,
  type PlayerStateMsg,
  type WorldSnapshot,
} from "@worldzero/shared";

const url = process.env.SERVER_WS ?? "ws://localhost:2569";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  results.push({ name, ok });
  console.log(`${ok ? "OK   " : "FALHA"} ${name} - ${detail}`);
};
const until = async (cond: () => boolean, ms: number): Promise<boolean> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) return false;
    await sleep(50);
  }
  return true;
};

class Peer {
  room!: Room;
  id = "";
  st?: PlayerStateMsg;
  players = new Map<string, { x: number; y: number; dead: boolean }>();
  events: CombatEventMsg[] = [];
  reasons: string[] = [];
  drops = 0;
  private aid = 1000;
  private seq = 0;
  private token = "";

  constructor(
    readonly name: string,
    readonly client: Client,
  ) {}

  async join(): Promise<void> {
    this.attach(await this.client.joinOrCreate(WORLD_ROOM_NAME, { protocol: PROTOCOL_VERSION }));
    this.id = this.room.sessionId;
  }

  attach(room: Room): void {
    this.room = room;
    this.token = room.reconnectionToken;
    room.onMessage("PLAYER_STATE", (m: PlayerStateMsg) => (this.st = m));
    room.onMessage("INVENTORY_UPDATE", () => undefined);
    room.onMessage("ENTITY_UPDATE", (m: EntityUpdateMsg) => (this.drops = m.drops.length));
    room.onMessage("COMBAT_EVENT", (m: CombatEventMsg) => this.events.push(m));
    room.onMessage("ACTION_REJECTED", (m: { reason: string }) => this.reasons.push(m.reason));
    room.onMessage("WORLD_SNAPSHOT", (s: WorldSnapshot) => {
      for (const p of s.players) this.players.set(p.id, { x: p.x, y: p.y, dead: p.dead });
      for (const id of [...this.players.keys()]) if (!s.players.some((p) => p.id === id)) this.players.delete(id);
    });
  }

  forgetState(): void {
    this.st = undefined; // metodo (e nao atribuicao direta) para o TypeScript nao "travar" o tipo de st em undefined
  }

  get pos(): { x: number; y: number } | undefined {
    return this.players.get(this.id);
  }
  get hp(): number {
    return this.st?.health ?? -1;
  }
  nextId(): number {
    return ++this.aid;
  }
  attack(): number {
    const id = this.nextId();
    this.room.send("REQUEST_ATTACK", { actionId: id });
    return id;
  }
  input(ix: number, iy: number): void {
    this.room.send("PLAYER_INPUT", { seq: ++this.seq, ix, iy });
  }
  async dropConnection(): Promise<string> {
    const token = this.token;
    this.room.connection.close(); // queda de rede simulada (sem LEAVE)
    return token;
  }
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const lossBetween = (before: number, after: number): number => before - after;
// regeneracao de vida (0,5/s) pode "devolver" ate ~1 ponto entre duas leituras: tolerancia de 2 para baixo e 1 para cima
const tookOneHit = (loss: number): boolean => loss >= PLAYER_ATTACK_DAMAGE - 2 && loss <= PLAYER_ATTACK_DAMAGE + 1;
const noDamage = (loss: number): boolean => loss <= 0 && loss >= -2;

async function main(): Promise<void> {
  const A = new Peer("A", new Client(url));
  const B = new Peer("B", new Client(url));
  await A.join();
  await B.join();
  await until(() => !!A.st && !!B.st && !!A.pos && !!B.pos && A.players.size === 2 && B.players.size === 2, 10000);
  const gap = A.pos && B.pos ? dist(A.pos, B.pos) : 9999;
  check("pre-condicao: os dois nasceram ao alcance do soco", gap <= PLAYER_ATTACK_REACH_PX - 4, `distancia ${gap.toFixed(1)} px (alcance ${PLAYER_ATTACK_REACH_PX})`);
  if (gap > PLAYER_ATTACK_REACH_PX - 4) return finish();
  check("os dois comecam com 100 de vida", A.hp === 100 && B.hp === 100, `A ${A.hp}, B ${B.hp}`);

  // 1) um soco: dano exato e evento para os dois lados
  let before = B.hp;
  A.attack();
  await until(() => B.hp < before, 3000);
  await sleep(300);
  check("um soco tira o dano do punho (decidido no servidor)", tookOneHit(lossBetween(before, B.hp)), `vida de B ${before} -> ${B.hp}`);
  const hitEv = (p: Peer): boolean => p.events.some((e) => e.kind === "hit" && e.attacker === A.id && e.victim === B.id && e.damage === PLAYER_ATTACK_DAMAGE);
  check("os dois recebem o evento de acerto (so feedback)", hitEv(A) && hitEv(B), `eventos A ${A.events.length}, B ${B.events.length}`);
  check("o atacante nao perde vida", A.hp >= 100 - 1, `vida de A ${A.hp}`);

  // 2) rajada: 10 golpes de uma vez, so 1 passa (recarga do servidor)
  await sleep(ATTACK_COOLDOWN_MS + 150);
  before = B.hp;
  A.reasons.length = 0;
  for (let i = 0; i < 10; i++) A.attack();
  await sleep(450); // menos que a recarga: no maximo 1 golpe
  check("rajada de 10 golpes causa so 1 acerto (recarga)", tookOneHit(lossBetween(before, B.hp)), `vida de B ${before} -> ${B.hp}`);
  check("o servidor avisou recarga", A.reasons.includes("em_recarga"), `motivos: ${[...new Set(A.reasons)].join(",")}`);

  // 3) replay: o mesmo actionId depois da recarga nao bate de novo
  await sleep(ATTACK_COOLDOWN_MS + 150);
  before = B.hp;
  A.reasons.length = 0;
  const replayId = A.attack();
  await sleep(ATTACK_COOLDOWN_MS + 150);
  const afterFirst = B.hp;
  A.room.send("REQUEST_ATTACK", { actionId: replayId });
  await sleep(500);
  check("repetir o mesmo actionId nao bate duas vezes", tookOneHit(lossBetween(before, afterFirst)) && noDamage(lossBetween(afterFirst, B.hp)), `vida de B ${before} -> ${afterFirst} -> ${B.hp}`);
  check("replay foi recusado como acao repetida", A.reasons.includes("acao_repetida"), `motivos: ${[...new Set(A.reasons)].join(",")}`);

  // 4) golpe forjado: alvo/dano/arma na mensagem sao manipulacao
  await sleep(ATTACK_COOLDOWN_MS + 150);
  before = B.hp;
  A.reasons.length = 0;
  A.room.send("REQUEST_ATTACK", { actionId: A.nextId(), victim: B.id, target: B.id, damage: 9999, weapon: "club", reach: 9999 });
  await sleep(1100);
  check("golpe forjado (alvo/dano/arma) nao causa dano e e recusado", noDamage(lossBetween(before, B.hp)) && A.reasons.includes("campos_extras"), `vida de B ${before} -> ${B.hp}; motivos: ${[...new Set(A.reasons)].join(",")}`);

  // 5) alcance: B anda para longe e o golpe no ar nao acerta
  const farEnough = PLAYER_ATTACK_REACH_PX + 30;
  let away = false;
  for (const [ix, iy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t0 = Date.now();
    while (Date.now() - t0 < 1500 && !(A.pos && B.pos && dist(A.pos, B.pos) > farEnough)) {
      B.input(ix, iy);
      await sleep(50);
    }
    B.input(0, 0);
    await sleep(150);
    if (A.pos && B.pos && dist(A.pos, B.pos) > farEnough) {
      away = true;
      break;
    }
  }
  const gap2 = A.pos && B.pos ? dist(A.pos, B.pos) : 0;
  check("pre-condicao: B conseguiu se afastar alem do alcance", away, `distancia ${gap2.toFixed(1)} px`);
  if (away) {
    await sleep(ATTACK_COOLDOWN_MS + 150);
    before = B.hp;
    const nEv = A.events.length;
    A.attack();
    await sleep(500);
    check("golpe fora do alcance nao causa dano", noDamage(lossBetween(before, B.hp)), `distancia ${gap2.toFixed(0)} px; vida de B ${before} -> ${B.hp}`);
    check("o servidor mandou 'miss' (errou)", A.events.slice(nEv).some((e) => e.kind === "miss" && e.attacker === A.id), `eventos novos: ${A.events.slice(nEv).map((e) => e.kind).join(",") || "nenhum"}`);
  }
  // B volta para perto de A
  const tBack = Date.now();
  while (Date.now() - tBack < 4000 && !(A.pos && B.pos && dist(A.pos, B.pos) < 30)) {
    if (A.pos && B.pos) {
      const dx = A.pos.x - B.pos.x;
      const dy = A.pos.y - B.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      B.input(dx / len, dy / len);
    }
    await sleep(50);
  }
  B.input(0, 0);
  await sleep(300);

  // 6) desconectar no meio da luta nao salva: o personagem fica no mundo e continua apanhando
  await sleep(ATTACK_COOLDOWN_MS + 150);
  const hpBeforeDrop = B.hp;
  const token = await B.dropConnection();
  await sleep(800);
  A.attack();
  await sleep(500);
  B.attach(await B.client.reconnect(token));
  B.forgetState();
  await until(() => !!B.st, 5000);
  check("desconectar no meio da luta nao evita o dano (personagem fica 15 s no mundo)", B.st !== undefined && tookOneHit(lossBetween(hpBeforeDrop, B.hp)), `vida de B ${hpBeforeDrop} -> ${B.hp}`);

  // 7) matar: golpes validos ate B morrer; credito, mochila e morto nao apanha nem ataca
  let swings = 0;
  const aHpBeforeKill = A.hp;
  while (!B.st?.dead && swings < 20) {
    await sleep(ATTACK_COOLDOWN_MS + 150); // folga contra atraso de rede (o servidor mede a recarga na chegada)
    A.attack();
    swings++;
  }
  await until(() => !!B.st?.dead, 2000);
  check("B morreu so por golpes validos do servidor", B.st?.dead === true && swings <= 14, `${swings} golpes, vida de B ${B.hp}`);
  check("o dono do golpe nao perdeu vida matando", A.hp >= aHpBeforeKill - 2, `vida de A ${aHpBeforeKill} -> ${A.hp}`);
  await sleep(300);
  check("evento de morte com credito para A", [A, B].every((p) => p.events.some((e) => e.kind === "kill" && e.attacker === A.id && e.victim === B.id)), `eventos de B: ${B.events.filter((e) => e.kind === "kill").length} kill`);
  check("B perdeu o inventario (aparece na tela de morte)", (B.st?.lost.length ?? 0) > 0, `perdeu ${(B.st?.lost ?? []).map((l) => `${l.qty}x${l.id}`).join(",")}`);
  await until(() => A.drops >= 1, 3500);
  check("a mochila de B apareceu no chao para os outros", A.drops >= 1, `mochilas vistas por A: ${A.drops}`);
  check("B aparece como morto no snapshot", A.players.get(B.id)?.dead === true, `dead=${A.players.get(B.id)?.dead}`);

  const hitsOnDead = A.events.length;
  await sleep(ATTACK_COOLDOWN_MS + 150);
  A.attack();
  await sleep(ATTACK_COOLDOWN_MS + 150);
  A.attack();
  await sleep(400);
  check("morto nao leva mais golpes", !A.events.slice(hitsOnDead).some((e) => e.kind === "hit" && e.victim === B.id), `eventos novos: ${A.events.slice(hitsOnDead).map((e) => e.kind).join(",")}`);
  B.reasons.length = 0;
  const aHp = A.hp;
  B.attack();
  await sleep(1100);
  check("morto nao ataca", B.reasons.includes("morto") && A.hp >= aHp - 1, `motivos de B: ${[...new Set(B.reasons)].join(",")}`);

  // 8) reaparecer: protecao curta contra jogadores, depois o PvP volta; atacar encerra a protecao
  await until(() => (B.st?.respawnInMs ?? 1) <= 0 || !B.st?.dead, RESPAWN_DELAY_MS + 3000);
  await sleep(Math.max(0, (B.st?.respawnInMs ?? 0) + 200));
  B.room.send("REQUEST_RESPAWN", { actionId: B.nextId() });
  await until(() => B.st?.dead === false, 3000);
  const tAlive = Date.now();
  check("B reapareceu vivo com vida cheia", B.st?.dead === false && B.hp === 100, `vida de B ${B.hp}`);
  await until(() => !!(A.pos && B.pos && !A.players.get(B.id)?.dead), 2000);
  const gap3 = A.pos && B.pos ? dist(A.pos, B.pos) : 9999;
  check("pre-condicao: B reapareceu ao alcance de A", gap3 <= PLAYER_ATTACK_REACH_PX - 2, `distancia ${gap3.toFixed(1)} px`);
  await sleep(Math.max(0, ATTACK_COOLDOWN_MS + 150 - (Date.now() - tAlive)));
  const hpGrace = B.hp;
  const evGrace = A.events.length;
  A.attack();
  await sleep(400);
  const inGraceStill = Date.now() - tAlive < SPAWN_GRACE_MS - 200;
  check("logo apos reaparecer o golpe de jogador nao acerta (protecao curta)", !inGraceStill || (noDamage(lossBetween(hpGrace, B.hp)) && !A.events.slice(evGrace).some((e) => e.kind === "hit")), `vida de B ${hpGrace} -> ${B.hp}; ${Date.now() - tAlive} ms depois de reaparecer`);
  await sleep(Math.max(0, SPAWN_GRACE_MS + 400 - (Date.now() - tAlive)));
  await sleep(ATTACK_COOLDOWN_MS);
  const hpAfterGrace = B.hp;
  A.attack();
  await until(() => B.hp < hpAfterGrace, 2500);
  await sleep(250);
  check("passada a protecao, o PvP volta", tookOneHit(lossBetween(hpAfterGrace, B.hp)), `vida de B ${hpAfterGrace} -> ${B.hp}`);

  finish();
}

function finish(): never {
  const failed = results.filter((r) => !r.ok);
  console.log(`RESULT ${JSON.stringify({ total: results.length, falhas: failed.map((f) => f.name) })}`);
  process.exit(failed.length || results.length === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[duelo] erro inesperado:", e);
  process.exit(1);
});
