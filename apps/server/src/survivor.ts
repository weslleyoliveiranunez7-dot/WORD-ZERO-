// Teste de SOBREVIVENCIA (Etapa 6) contra um servidor com tempo acelerado (SURVIVAL_SCALE).
// Mostra, com um cliente real por WebSocket, que o SERVIDOR: reduz fome/sede, aplica itens, recusa replays,
// mata de fome depois da tolerancia, zera o inventario, impede mover/usar item morto e permite reaparecer.
import { Client, Room } from "colyseus.js";
import {
  PROTOCOL_VERSION,
  RESPAWN_DELAY_MS,
  START_VITALS,
  WORLD_ROOM_NAME,
  type InventoryUpdateMsg,
  type PlayerStateMsg,
  type WorldSnapshot,
} from "@worldzero/shared";

const url = process.env.SERVER_WS ?? "ws://localhost:2568";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  results.push({ name, ok });
  console.log(`${ok ? "OK   " : "FALHA"} ${name} - ${detail}`);
};

async function main(): Promise<void> {
  const room: Room = await new Client(url).joinOrCreate(WORLD_ROOM_NAME, { protocol: PROTOCOL_VERSION });
  const id = room.sessionId;
  let st: PlayerStateMsg | undefined;
  let inv: InventoryUpdateMsg | undefined;
  let me: { x: number; y: number; dead: boolean } | undefined;
  const reasons: string[] = [];
  room.onMessage("PLAYER_STATE", (m: PlayerStateMsg) => (st = m));
  room.onMessage("INVENTORY_UPDATE", (m: InventoryUpdateMsg) => (inv = m));
  room.onMessage("WORLD_SNAPSHOT", (s: WorldSnapshot) => {
    const p = s.players.find((q) => q.id === id);
    if (p) me = { x: p.x, y: p.y, dead: p.dead };
  });
  room.onMessage("ACTION_REJECTED", (m: { reason: string }) => reasons.push(m.reason));
  const until = async (cond: () => boolean, ms: number): Promise<boolean> => {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) return false;
      await sleep(50);
    }
    return true;
  };
  const count = (itemId: string): number => (inv?.slots ?? []).reduce((n, s) => n + (s && s.id === itemId ? s.qty : 0), 0);
  const slotOf = (itemId: string): number => (inv?.slots ?? []).findIndex((s) => s && s.id === itemId);
  let aid = 0;

  await until(() => !!st && !!inv && !!me, 10000);
  check("recebe estado inicial do servidor", !!st && st.health === START_VITALS.health && !st.dead, `vida ${st?.health}, fome ${st?.hunger}, sede ${st?.thirst}, energia ${st?.energy}`);
  check("recebe kit inicial", count("water_bottle") === 2 && count("canned_food") === 2 && count("bandage") === 1, `agua ${count("water_bottle")}, comida ${count("canned_food")}, bandagem ${count("bandage")}`);

  // fome e sede caem sozinhas (tempo acelerado no servidor de teste)
  const okDrop = await until(() => !!st && st.thirst < START_VITALS.thirst - 10 && st.hunger < START_VITALS.hunger, 8000);
  check("fome e sede diminuem com o tempo", okDrop, `fome ${st?.hunger}, sede ${st?.thirst}`);

  // beber: sede sobe e exatamente 1 garrafa some
  const thirstBefore = st!.thirst;
  room.send("REQUEST_USE_ITEM", { slot: slotOf("water_bottle"), actionId: ++aid });
  const okDrink = await until(() => count("water_bottle") === 1, 3000);
  const thirstJustAfter = st!.thirst;
  check("beber consome 1 garrafa e sobe a sede", okDrink && thirstJustAfter > thirstBefore, `sede ${thirstBefore} -> ${thirstJustAfter}, garrafas ${count("water_bottle")}`);

  // replay do mesmo actionId depois do cooldown
  await sleep(800);
  room.send("REQUEST_USE_ITEM", { slot: slotOf("water_bottle"), actionId: aid });
  await sleep(1200);
  check("replay do mesmo actionId nao consome de novo", count("water_bottle") === 1 && reasons.includes("acao_repetida"), `garrafas ${count("water_bottle")}, motivos: ${[...new Set(reasons)].join(",")}`);

  // bandagem com vida cheia: sem efeito, nao gasta
  await sleep(800);
  room.send("REQUEST_USE_ITEM", { slot: slotOf("bandage"), actionId: ++aid });
  await sleep(1200);
  check("item sem efeito nao e gasto", count("bandage") === 1 && reasons.includes("sem_efeito"), `bandagens ${count("bandage")}`);

  // nao faz mais nada: morre de fome/sede (apos a tolerancia)
  const died = await until(() => !!st && st.dead, 60000);
  check("sem comer nem beber o jogador morre", died, `vida ${st?.health}, fome ${st?.hunger}, sede ${st?.thirst}`);
  await until(() => !!me && me.dead && count("canned_food") === 0, 3000);
  check("morto: snapshot marca dead e inventario fica vazio", !!me?.dead && (inv?.slots ?? []).every((s) => s === null) && (st?.lost.length ?? 0) > 0, `perdeu ${st?.lost.reduce((n, s) => n + s.qty, 0)} itens`);

  // morto nao anda nem usa item
  const p0 = { x: me!.x, y: me!.y };
  for (let i = 1; i <= 20; i++) {
    room.send("PLAYER_INPUT", { seq: i, ix: 1, iy: 0 });
    await sleep(50);
  }
  check("morto nao anda", Math.hypot(me!.x - p0.x, me!.y - p0.y) < 1, `moveu ${Math.hypot(me!.x - p0.x, me!.y - p0.y).toFixed(1)} px`);
  room.send("REQUEST_USE_ITEM", { slot: 0, actionId: ++aid });
  await sleep(1100);
  check("morto nao usa item", reasons.includes("morto"), `motivos: ${[...new Set(reasons)].join(",")}`);

  // reaparecer cedo demais e recusado; depois do atraso funciona
  room.send("REQUEST_RESPAWN", { actionId: ++aid });
  await sleep(300);
  check("reaparecer antes do tempo e recusado", !!st?.dead && reasons.includes("cedo_demais"), `faltam ${st?.respawnInMs} ms`);
  await sleep(RESPAWN_DELAY_MS + 500);
  room.send("REQUEST_RESPAWN", { actionId: ++aid });
  const back = await until(() => !!st && !st.dead && !!me && !me.dead, 4000);
  await sleep(300);
  check("reaparece vivo com vida cheia e kit inicial", back && st!.health === START_VITALS.health && count("water_bottle") === 2 && count("canned_food") === 2, `vida ${st?.health}, agua ${count("water_bottle")}, comida ${count("canned_food")}`);
  room.send("REQUEST_RESPAWN", { actionId: ++aid });
  await sleep(1200);
  check("reaparecer de novo (vivo) nao da outro kit", count("water_bottle") === 2 && count("canned_food") === 2, `agua ${count("water_bottle")}, comida ${count("canned_food")}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`RESULT ${JSON.stringify({ total: results.length, falhas: failed.map((f) => f.name) })}`);
  await room.leave();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[survivor] erro inesperado:", e);
  process.exit(1);
});
