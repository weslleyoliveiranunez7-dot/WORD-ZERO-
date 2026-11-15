// Cliente MALICIOSO de teste (Etapa 5): tenta impor posicao, velocidade, mensagens invalidas e flood.
// Cada ataque precisa FALHAR (o servidor ignora/recusa/expulsa). Sai com codigo 1 se algum ataque funcionar.
import { Client, Room } from "colyseus.js";
import {
  KICK_CODE,
  PLAYER_SPEED,
  PROTOCOL_VERSION,
  WORLD_ROOM_NAME,
  type InventoryUpdateMsg,
  type PlayerStateMsg,
  type WorldSnapshot,
} from "@worldzero/shared";

const url = process.env.SERVER_WS ?? "ws://localhost:2567";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK   " : "FALHA"} ${name} - ${detail}`);
};

async function main(): Promise<void> {
  const client = new Client(url);
  const room: Room = await client.joinOrCreate(WORLD_ROOM_NAME, { protocol: PROTOCOL_VERSION });
  const id = room.sessionId;
  let pos: { x: number; y: number } | undefined;
  const track: { t: number; x: number; y: number }[] = [];
  const reasons: string[] = [];
  let leftCode: number | undefined;
  room.onMessage("WORLD_SNAPSHOT", (s: WorldSnapshot) => {
    const me = s.players.find((p) => p.id === id);
    if (me) {
      pos = { x: me.x, y: me.y };
      track.push({ t: Date.now(), x: me.x, y: me.y });
    }
  });
  let state: PlayerStateMsg | undefined;
  let inv: InventoryUpdateMsg | undefined;
  room.onMessage("PLAYER_STATE", (m: PlayerStateMsg) => (state = m));
  room.onMessage("INVENTORY_UPDATE", (m: InventoryUpdateMsg) => (inv = m));
  room.onMessage("ENTITY_UPDATE", () => undefined);
  room.onMessage("ACTION_REJECTED", (m: { reason: string }) => reasons.push(m.reason));
  room.onLeave((code) => {
    leftCode = code;
  });
  while (!pos) await sleep(50);
  const start = { ...pos };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
  let seq = 0;

  // 1) impor posicao por campos extras
  room.send("PLAYER_INPUT", { seq: ++seq, ix: 0, iy: 0, x: 5000, y: 5000 });
  room.send("PLAYER_INPUT", { seq: ++seq, ix: 1, iy: 0, speed: 99999 });
  await sleep(1200);
  check("posicao enviada pelo cliente e ignorada", dist(pos!, start) < 5, `moveu ${dist(pos!, start).toFixed(1)} px`);
  check("campos extras recusados", reasons.includes("campos_extras"), `motivos: ${[...new Set(reasons)].join(",") || "nenhum"}`);

  // 2) input fora do intervalo (velocidade absurda)
  room.send("PLAYER_INPUT", { seq: ++seq, ix: 1e9, iy: 1e9 });
  room.send("PLAYER_INPUT", { seq: ++seq, ix: NaN, iy: 0 });
  await sleep(1200);
  check("input absurdo/NaN nao move o jogador", dist(pos!, start) < 5, `moveu ${dist(pos!, start).toFixed(1)} px`);
  check("valor fora do intervalo recusado", reasons.includes("valor_fora_do_intervalo"), `motivos: ${[...new Set(reasons)].join(",")}`);

  // 3) mensagens/acoes que nao existem ou ainda nao sao permitidas
  room.send("TELEPORT", { x: 100, y: 100 });
  await sleep(1100);
  room.send("REQUEST_ATTACK", { target: "alguem", damage: 9999 }); // Etapa 8: ataque existe, mas campos forjados sao recusados
  await sleep(1100);
  room.send("REQUEST_BUILD", { piece: "wall" }); // ainda nao implementado (Etapa 11)
  await sleep(1100);
  check("mensagem desconhecida recusada", reasons.includes("tipo_desconhecido"), `motivos: ${[...new Set(reasons)].join(",")}`);
  check("acao nao implementada recusada", reasons.includes("acao_nao_implementada"), `motivos: ${[...new Set(reasons)].join(",")}`);
  check("TELEPORT nao funcionou", dist(pos!, start) < 5, `moveu ${dist(pos!, start).toFixed(1)} px`);

  // 4) velocidade: input legitimo nao pode passar da velocidade maxima
  track.length = 0;
  const walkEnd = Date.now() + 2500;
  while (Date.now() < walkEnd) {
    room.send("PLAYER_INPUT", { seq: ++seq, ix: 1, iy: 0 });
    await sleep(50);
  }
  room.send("PLAYER_INPUT", { seq: ++seq, ix: 0, iy: 0 });
  let worst = 0;
  for (let i = 0; i < track.length; i++) {
    for (let j = i + 1; j < track.length; j++) {
      const dt = (track[j].t - track[i].t) / 1000;
      if (dt >= 0.8) worst = Math.max(worst, dist(track[i], track[j]) / dt);
    }
  }
  const walked = track.length > 0 ? dist(track[0], track[track.length - 1]) : 0;
  check("andou de verdade com input valido", walked > 20, `${walked.toFixed(0)} px`);
  check("velocidade nunca passa do maximo", worst <= PLAYER_SPEED * 1.15, `pior ${worst.toFixed(0)} px/s (max ${PLAYER_SPEED})`);

  // 4b) Etapa 6: o cliente nao consegue inventar estado, itens, cura nem reaparecer vivo
  while (!state || !inv) await sleep(50);
  const total = (): number => inv!.slots.reduce((n, sl) => n + (sl ? sl.qty : 0), 0);
  const items0 = total();
  reasons.length = 0; // a partir daqui cada checagem so enxerga os motivos NOVOS
  room.send("PLAYER_STATE", { health: 1e9, hunger: 1e9, thirst: 1e9, energy: 1e9, dead: false });
  room.send("INVENTORY_UPDATE", { slots: [{ id: "canned_food", qty: 999 }] });
  await sleep(1200);
  check("cliente nao consegue impor PLAYER_STATE/INVENTORY_UPDATE", state!.health <= 100 && total() === items0, `vida ${state!.health}, itens ${total()}/${items0}`);
  check("mensagens de estado enviadas pelo cliente recusadas", reasons.includes("tipo_desconhecido"), `motivos: ${[...new Set(reasons)].join(",")}`);

  let aid = 1000;
  reasons.length = 0;
  room.send("REQUEST_USE_ITEM", { slot: 0, actionId: ++aid, id: "ouro", qty: 999, heal: 9999 });
  await sleep(1100);
  check("uso de item com campos extras recusado", reasons.includes("campos_extras") && total() === items0, `itens ${total()}/${items0}`);
  reasons.length = 0;
  for (const bad of [{ slot: -1, actionId: ++aid }, { slot: 99, actionId: ++aid }, { slot: 1.5, actionId: ++aid }, { slot: "0", actionId: ++aid }, { slot: 0, actionId: -4 }]) {
    room.send("REQUEST_USE_ITEM", bad);
  }
  await sleep(1100);
  check("slot/actionId invalidos recusados", reasons.includes("valores_invalidos") && total() === items0, `itens ${total()}/${items0}`);

  reasons.length = 0;
  room.send("REQUEST_RESPAWN", { actionId: ++aid });
  await sleep(1100);
  check("reaparecer estando vivo recusado", reasons.includes("vivo") && !state!.dead, `motivos: ${[...new Set(reasons)].join(",")}`);

  // Etapa 9: golpes forjados (alvo, dano, arma, alcance, posicao) sao manipulacao; rajada de golpes respeita a recarga
  reasons.length = 0;
  room.send("REQUEST_ATTACK", { actionId: ++aid, victim: "qualquer-um", damage: 9999, weapon: "club", reach: 9999 });
  room.send("REQUEST_ATTACK", { actionId: ++aid, x: 1, y: 1 });
  await sleep(1100);
  check("golpe com alvo/dano/arma/alcance forjados recusado", reasons.includes("campos_extras") && state!.health <= 100, `motivos: ${[...new Set(reasons)].join(",")}`);
  reasons.length = 0;
  for (const bad of [{ actionId: -1 }, { actionId: 1.5 }, { actionId: "7" }, { actionId: NaN }, {}]) room.send("REQUEST_ATTACK", bad);
  await sleep(1100);
  check("golpe com actionId invalido recusado", reasons.includes("valores_invalidos") || reasons.includes("campos_extras"), `motivos: ${[...new Set(reasons)].join(",")}`);
  await sleep(3000); // deixa a pontuacao de violacoes decair
  reasons.length = 0;
  for (let i = 0; i < 15; i++) room.send("REQUEST_ATTACK", { actionId: ++aid });
  await sleep(1200);
  check("rajada de 15 golpes: so 1 passa, o resto cai na recarga", reasons.includes("em_recarga"), `motivos: ${[...new Set(reasons)].join(",")}`);
  await sleep(3000);

  // Etapa 10: fabricar com campos forjados / receita inventada / actionId invalido e recusado; sem ingredientes nada nasce
  reasons.length = 0;
  room.send("REQUEST_CRAFT", { recipe: "spear", actionId: ++aid, qty: 99, output: "spear" });
  room.send("REQUEST_CRAFT", { recipe: "ouro", actionId: ++aid });
  room.send("REQUEST_CRAFT", { recipe: "__proto__", actionId: ++aid });
  await sleep(1100);
  check("fabricar com campos extras / receita inventada recusado", reasons.includes("campos_extras") || reasons.includes("valores_invalidos"), `motivos: ${[...new Set(reasons)].join(",")}`);
  reasons.length = 0;
  for (const bad of [{ recipe: "club", actionId: -1 }, { recipe: "club", actionId: 1.5 }, { recipe: "club", actionId: "7" }, { recipe: "club" }, {}]) room.send("REQUEST_CRAFT", bad);
  await sleep(1100);
  check("fabricar com actionId invalido recusado", reasons.includes("valores_invalidos") || reasons.includes("campos_extras"), `motivos: ${[...new Set(reasons)].join(",")}`);
  await sleep(3000); // deixa a pontuacao de violacoes decair
  reasons.length = 0;
  room.send("REQUEST_CRAFT", { recipe: "club", actionId: ++aid }); // kit inicial nao tem madeira
  await sleep(1100);
  check("fabricar sem ingredientes recusado e nada aparece no inventario", reasons.includes("faltam_ingredientes") && !inv?.slots.some((x) => x && x.id === "club"), `motivos: ${[...new Set(reasons)].join(",")}`);

  // rajada de 15 usos do slot 0: so 1 pode ser consumido (cooldown no servidor)
  const slot0 = inv!.slots[0];
  const before0 = slot0 ? slot0.qty : 0;
  for (let i = 0; i < 15; i++) room.send("REQUEST_USE_ITEM", { slot: 0, actionId: ++aid });
  await sleep(1500);
  const after0 = inv!.slots[0] ? inv!.slots[0]!.qty : 0;
  check("rajada de usos consome no maximo 1 item (cooldown)", before0 - after0 <= 1, `slot 0: ${before0} -> ${after0}`);

  // replay: repetir o mesmo actionId depois do cooldown nao consome de novo
  const mid = total();
  const replayId = ++aid;
  room.send("REQUEST_USE_ITEM", { slot: 1, actionId: replayId });
  await sleep(700);
  const afterFirst = total();
  room.send("REQUEST_USE_ITEM", { slot: 1, actionId: replayId });
  await sleep(1500);
  check("repetir o mesmo actionId nao consome duas vezes", afterFirst - total() === 0 && mid - afterFirst <= 1, `itens ${mid} -> ${afterFirst} -> ${total()}`);
  await sleep(3000); // deixa a pontuacao de violacoes decair antes do flood

  // 5) flood: milhares de mensagens de uma vez
  for (let i = 0; i < 3000; i++) room.send("PLAYER_INPUT", { seq: ++seq, ix: 1, iy: 0 });
  const t0 = Date.now();
  while (leftCode === undefined && Date.now() - t0 < 8000) await sleep(100);
  check("flood leva a expulsao", leftCode === KICK_CODE, `codigo de saida: ${leftCode ?? "nenhum (nao foi expulso)"}`);

  // 6) payload gigante (conexao nova): o servidor deve derrubar a conexao
  const room2: Room = await new Client(url).joinOrCreate(WORLD_ROOM_NAME, { protocol: PROTOCOL_VERSION });
  let left2: number | undefined;
  room2.onLeave((code) => {
    left2 = code;
  });
  room2.send("PLAYER_INPUT", { seq: 1, ix: 0, iy: 0, pad: "x".repeat(100_000) });
  const t1 = Date.now();
  while (left2 === undefined && Date.now() - t1 < 6000) await sleep(100);
  check("payload gigante derruba a conexao", left2 !== undefined, `codigo de saida: ${left2 ?? "nenhum"}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`RESULT ${JSON.stringify({ total: results.length, falhas: failed.map((f) => f.name) })}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[atacante] erro inesperado:", e);
  process.exit(1);
});
