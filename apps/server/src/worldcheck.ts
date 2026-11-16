// Teste de SERVIDORES (Etapa 13): servidor REAL com 2 mundos e limite de 3 jogadores por mundo (o limite real e 50; aqui e pequeno
// para o teste caber em segundos), clientes reais por WebSocket.
// Confere o aceite "jogadores entram no mesmo mundo e nao ultrapassam o limite":
//   1. /servers lista os mundos cadastrados com nome, regiao, populacao, capacidade (<= 50) e status;
//   2. quem escolhe o mesmo mundo cai na MESMA sala (se veem); mundos diferentes sao salas diferentes (nao se veem);
//   3. o 4o jogador num mundo de 3 e recusado ("lotado"), tanto por sala conhecida (joinById) quanto pelo mundo (joinOrCreate); a lista mostra "lotado";
//   4. a vaga de quem sai volta; mundo desconhecido e recusado; mundo escolhido errado numa sala de outro mundo e recusado;
//   5. mundos sao independentes: o mesmo personagem tem inventario separado em cada mundo (e o mundo-1 mantem o id antigo);
//   6. reconexao: a conexao cai de proposito e o jogador volta ao MESMO mundo, com a mesma vaga.
// Armazenamento: DATABASE_URL se existir, senao uma pasta temporaria.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { Client, Room } from "colyseus.js";
import { PROTOCOL_VERSION, WORLD_ROOM_NAME, parseServerList, type InventoryUpdateMsg, type WorldInfo, type WorldSnapshot } from "@worldzero/shared";
import { characterId } from "./worlds";

const PORT = Number(process.env.WORLDS_PORT ?? 2572);
const CAP = 3;
const url = `ws://localhost:${PORT}`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name: string, ok: boolean, detail: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "FALHA"} ${name} - ${detail}`);
};

async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) return false;
    await sleep(50);
  }
  return true;
}

function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { env: { ...process.env, ...env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(`   [servidor] ${d.toString().trimEnd().replace(/\n/g, "\n   [servidor] ")}\n`));
  child.stderr?.on("data", (d: Buffer) => process.stdout.write(`   [servidor!] ${d.toString().trimEnd().replace(/\n/g, "\n   [servidor!] ")}\n`));
  return child;
}

async function waitHealthy(child: ChildProcess): Promise<void> {
  let exited = false;
  child.once("exit", () => (exited = true));
  for (let i = 0; i < 90; i++) {
    if (exited) throw new Error("o servidor encerrou ao ligar");
    try {
      if ((await fetch(`http://localhost:${PORT}/health`)).ok) return;
    } catch {
      /* ainda ligando */
    }
    await sleep(500);
  }
  throw new Error("o servidor nao respondeu /health");
}

async function list(): Promise<WorldInfo[]> {
  const res = await fetch(`http://localhost:${PORT}/servers`);
  const parsed = parseServerList(await res.json());
  if (!parsed) throw new Error("resposta de /servers invalida");
  return parsed.servers;
}

interface Session {
  room: Room;
  snap: () => WorldSnapshot | undefined;
  inv: () => InventoryUpdateMsg | undefined;
  count: (id: string) => number;
  slotOf: (id: string) => number;
}

async function hook(room: Room): Promise<Session> {
  let snap: WorldSnapshot | undefined;
  let inv: InventoryUpdateMsg | undefined;
  room.onMessage("WORLD_SNAPSHOT", (m: WorldSnapshot) => (snap = m));
  room.onMessage("INVENTORY_UPDATE", (m: InventoryUpdateMsg) => (inv = m));
  for (const t of ["PLAYER_STATE", "ENTITY_UPDATE", "ACTION_REJECTED", "STRUCTURE_UPDATE", "CHEST_UPDATE", "COMBAT_EVENT", "SERVER_NOTICE"]) room.onMessage(t, () => undefined);
  await until(() => !!snap && !!inv, 10000);
  const count = (id: string): number => (inv?.slots ?? []).reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
  const slotOf = (id: string): number => (inv?.slots ?? []).findIndex((s) => s && s.id === id);
  return { room, snap: () => snap, inv: () => inv, count, slotOf };
}

// Entra como o cliente do jogo faz: pelo mundo (joinOrCreate filtrado) ou direto na sala da lista (joinById).
async function enter(world: string, key?: string, roomId?: string): Promise<Session> {
  const opts = { protocol: PROTOCOL_VERSION, world, ...(key ? { key } : {}) };
  const client = new Client(url);
  const room = roomId ? await client.joinById(roomId, opts) : await client.joinOrCreate(WORLD_ROOM_NAME, opts);
  return hook(room);
}

async function refused(p: Promise<Session>): Promise<string | null> {
  try {
    const s = await p;
    await s.room.leave(true);
    return null; // entrou: nao deveria
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// leave() que nunca trava: se a conexao ja caiu, desiste depois de 4 s.
async function safeLeave(room: Room): Promise<void> {
  await Promise.race([room.leave(true).catch(() => undefined), sleep(4000)]);
}

const find = (l: WorldInfo[], id: string): WorldInfo | undefined => l.find((w) => w.id === id);

async function main(): Promise<void> {
  const useDb = !!process.env.DATABASE_URL;
  const dir = useDb ? undefined : await mkdtemp(pathJoin(tmpdir(), "wz-worlds-"));
  const env: NodeJS.ProcessEnv = {
    ...(useDb ? {} : { DATA_DIR: dir, DATABASE_URL: "" }),
    WORLDS: "mundo-1:Mundo 1:br;mundo-2:Mundo 2:us",
    MAX_PLAYERS: String(CAP),
  };
  console.log(`armazenamento do teste: ${useDb ? "PostgreSQL (DATABASE_URL)" : `arquivos em ${dir}`}`);
  let server: ChildProcess | undefined;
  const open: Session[] = [];
  try {
    server = startServer(env);
    await waitHealthy(server);

    // ---- 1. lista ----
    let l = await list();
    const w1 = find(l, "mundo-1");
    const w2 = find(l, "mundo-2");
    check("/servers lista os 2 mundos cadastrados", l.length === 2 && !!w1 && !!w2, l.map((w) => w.id).join(", "));
    check("nome, regiao, populacao e capacidade corretos", w1?.name === "Mundo 1" && w1.region === "br" && w2?.region === "us" && w1.players === 0 && w1.capacity === CAP, JSON.stringify(w1));
    check("mundo vazio aparece como online", w1?.status === "online" && w2?.status === "online", `${w1?.status} / ${w2?.status}`);
    const health = (await (await fetch(`http://localhost:${PORT}/health`)).json()) as { maxPlayers: number; worlds: number };
    check("/health informa limite e numero de mundos", health.maxPlayers === CAP && health.worlds === 2, JSON.stringify(health));

    // ---- 2. mesmo mundo = mesma sala; mundos diferentes = salas diferentes ----
    const a = await enter("mundo-1");
    const b = await enter("mundo-1");
    open.push(a, b);
    const seeEachOther = await until(() => (a.snap()?.players.length ?? 0) === 2 && (b.snap()?.players.length ?? 0) === 2, 6000);
    check("2 jogadores no mundo-1 entram na MESMA sala (se veem)", seeEachOther, `A ve ${a.snap()?.players.length}, B ve ${b.snap()?.players.length}`);
    check("mesma sala (mesmo roomId)", a.room.roomId === b.room.roomId, a.room.roomId);
    const c = await enter("mundo-2");
    open.push(c);
    await sleep(600);
    check("jogador do mundo-2 esta em outra sala e nao ve os do mundo-1", c.room.roomId !== a.room.roomId && (c.snap()?.players.length ?? 0) === 1, `sala ${c.room.roomId}, ve ${c.snap()?.players.length}`);
    l = await list();
    check("a lista mostra a populacao de cada mundo (2 e 1)", find(l, "mundo-1")?.players === 2 && find(l, "mundo-2")?.players === 1, `${find(l, "mundo-1")?.players} / ${find(l, "mundo-2")?.players}`);
    check("a lista traz a sala ativa do mundo-1", find(l, "mundo-1")?.roomId === a.room.roomId, String(find(l, "mundo-1")?.roomId));

    // ---- 3. lotado ----
    const d = await enter("mundo-1", undefined, find(l, "mundo-1")?.roomId);
    open.push(d);
    check("3o jogador entra pela sala da lista (joinById)", d.room.roomId === a.room.roomId, d.room.roomId);
    l = await list();
    check("mundo-1 com 3/3 aparece como LOTADO", find(l, "mundo-1")?.players === CAP && find(l, "mundo-1")?.status === "lotado", `${find(l, "mundo-1")?.players}/${find(l, "mundo-1")?.capacity} ${find(l, "mundo-1")?.status}`);
    const fullById = await refused(enter("mundo-1", undefined, a.room.roomId));
    check("4o jogador RECUSADO ao tentar a sala lotada (joinById)", fullById !== null, String(fullById));
    const fullByWorld = await refused(enter("mundo-1"));
    check("4o jogador RECUSADO ao pedir o mundo lotado (nao abre 2a sala)", fullByWorld !== null, String(fullByWorld));
    l = await list();
    check("depois das recusas o mundo-1 continua com 3 e so uma sala", find(l, "mundo-1")?.players === CAP && find(l, "mundo-1")?.roomId === a.room.roomId, `${find(l, "mundo-1")?.players} jogadores`);
    check("o outro mundo continua aceitando (mundos independentes)", find(l, "mundo-2")?.status === "online", String(find(l, "mundo-2")?.status));

    // ---- 4. vaga volta; mundo desconhecido; sala de outro mundo ----
    await d.room.leave(true);
    open.splice(open.indexOf(d), 1); // ja saiu: um 2o leave() nunca responderia e travaria o teste
    await sleep(800);
    l = await list();
    check("quem sai libera a vaga (2/3, online)", find(l, "mundo-1")?.players === 2 && find(l, "mundo-1")?.status === "online", `${find(l, "mundo-1")?.players} ${find(l, "mundo-1")?.status}`);
    const e = await enter("mundo-1");
    open.push(e);
    check("a vaga liberada pode ser ocupada de novo", e.room.roomId === a.room.roomId, e.room.roomId);
    const unknown = await refused(enter("mundo-99"));
    check("mundo nao cadastrado e RECUSADO", unknown !== null, String(unknown));
    l = await list();
    check("mundo desconhecido nao abre sala nem aparece na lista", l.length === 2 && !find(l, "mundo-99"), `${l.length} mundos`);
    const wrongRoom = await refused(enter("mundo-2", undefined, a.room.roomId));
    check("pedir mundo-2 numa sala do mundo-1 e RECUSADO", wrongRoom !== null, String(wrongRoom));

    // ---- 5. independencia: mesmo personagem, inventario separado por mundo ----
    for (const s of open.splice(0)) await safeLeave(s.room);
    await sleep(1500);
    const key = randomBytes(24).toString("base64url");
    check("id de gravacao muda por mundo e por temporada", characterId(key, "mundo-1", 1) !== characterId(key, "mundo-2", 1) && characterId(key, "mundo-1", 1) !== characterId(key, "mundo-1", 2), "ids");
    let s1 = await enter("mundo-1", key);
    check("personagem novo no mundo-1 recebe o kit (2 aguas)", s1.count("water_bottle") === 2, `agua ${s1.count("water_bottle")}`);
    s1.room.send("REQUEST_USE_ITEM", { slot: s1.slotOf("water_bottle"), actionId: 1 });
    check("bebe no mundo-1 (1 agua)", await until(() => s1.count("water_bottle") === 1, 4000), `agua ${s1.count("water_bottle")}`);
    await sleep(2500); // janela de gravacao por mudanca de inventario
    await s1.room.leave(true);
    await sleep(1500);
    const s2 = await enter("mundo-2", key);
    check("o MESMO personagem no mundo-2 e outro (kit novo, 2 aguas)", s2.count("water_bottle") === 2, `agua ${s2.count("water_bottle")}`);
    await s2.room.leave(true);
    await sleep(1500);
    s1 = await enter("mundo-1", key);
    check("de volta ao mundo-1 o progresso dele continua (1 agua)", s1.count("water_bottle") === 1, `agua ${s1.count("water_bottle")}`);

    // ---- 6. reconexao ao mesmo mundo ----
    const before = find(await list(), "mundo-1")?.players ?? 0;
    const token = s1.room.reconnectionToken;
    const oldRoomId = s1.room.roomId;
    s1.room.connection.close(); // queda de rede simulada (sem LEAVE)
    await sleep(800);
    const mid = find(await list(), "mundo-1")?.players ?? -1;
    check("durante a queda a vaga continua reservada ao jogador", mid === before, `${mid} (antes ${before})`);
    const room = await new Client(url).reconnect(token);
    const back = await hook(room);
    check("reconectou no MESMO mundo e na mesma sala", back.room.roomId === oldRoomId && back.count("water_bottle") === 1, `sala ${back.room.roomId}, agua ${back.count("water_bottle")}`);
    await sleep(800);
    check("depois de reconectar a populacao e a mesma (sem vaga em duplicidade)", (find(await list(), "mundo-1")?.players ?? -1) === before, String(find(await list(), "mundo-1")?.players));
    await back.room.leave(true);
    await sleep(1000);
  } catch (err) {
    failed++;
    console.log(`FALHA erro no teste - ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    for (const s of open) {
      try {
        s.room.connection.close();
      } catch {
        /* ja caiu */
      }
    }
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          server?.kill("SIGKILL");
          resolve();
        }, 15000);
        server?.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  console.log(failed === 0 ? "\nTODOS OK" : `\n${failed} FALHA(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
