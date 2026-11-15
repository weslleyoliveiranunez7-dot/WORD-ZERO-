// Teste de REINICIO (Etapa 12): servidor REAL ligado e desligado varias vezes, com um cliente real por WebSocket.
// Confere o aceite "reiniciar o servidor nao apaga o progresso confirmado":
//   1. queda brusca (SIGKILL, sem aviso): o que o jogador fez ha mais de ~2 s continua la;
//   2. desligamento normal (SIGTERM) depois de sair: tudo continua la;
//   3. registro quebrado no banco: o servidor recupera do snapshot em vez de zerar o personagem.
// Usa DATABASE_URL se existir; senao uma pasta temporaria (arquivos). Portas e tempos pensados para o workflow (~40 s).
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Room } from "colyseus.js";
import { PROTOCOL_VERSION, WORLD_ROOM_NAME, type InventoryUpdateMsg } from "@worldzero/shared";
import { createStore, keyToId } from "./store";

const PORT = Number(process.env.RESTART_PORT ?? 2570);
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
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return;
    } catch {
      /* ainda ligando */
    }
    await sleep(500);
  }
  throw new Error("o servidor nao respondeu /health");
}

const waitExit = (child: ChildProcess, ms: number): Promise<number | null> =>
  new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const t = setTimeout(() => resolve(null), ms);
    child.once("exit", (code) => {
      clearTimeout(t);
      resolve(code);
    });
  });

interface Session {
  room: Room;
  inv: () => InventoryUpdateMsg | undefined;
  count: (id: string) => number;
  slotOf: (id: string) => number;
}

async function join(key: string): Promise<Session> {
  const room = await new Client(url).joinOrCreate(WORLD_ROOM_NAME, { protocol: PROTOCOL_VERSION, key });
  let inv: InventoryUpdateMsg | undefined;
  room.onMessage("INVENTORY_UPDATE", (m: InventoryUpdateMsg) => (inv = m));
  for (const t of ["PLAYER_STATE", "WORLD_SNAPSHOT", "ENTITY_UPDATE", "ACTION_REJECTED", "STRUCTURE_UPDATE", "CHEST_UPDATE", "COMBAT_EVENT", "SERVER_NOTICE"]) room.onMessage(t, () => undefined);
  const ok = await until(() => !!inv, 10000);
  if (!ok) throw new Error("nao recebeu o inventario");
  const count = (id: string): number => (inv?.slots ?? []).reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
  const slotOf = (id: string): number => (inv?.slots ?? []).findIndex((s) => s && s.id === id);
  return { room, inv: () => inv, count, slotOf };
}

async function main(): Promise<void> {
  const useDb = !!process.env.DATABASE_URL;
  const dir = useDb ? undefined : await mkdtemp(join(tmpdir(), "wz-restart-"));
  const env: NodeJS.ProcessEnv = useDb ? {} : { DATA_DIR: dir, DATABASE_URL: "" };
  console.log(`armazenamento do teste: ${useDb ? "PostgreSQL (DATABASE_URL)" : `arquivos em ${dir}`}`);
  const key = randomBytes(24).toString("base64url"); // 32 caracteres [A-Za-z0-9_-]
  const keyId = keyToId(key);
  let server: ChildProcess | undefined;
  try {
    // ---- 1. queda brusca ----
    server = startServer(env);
    await waitHealthy(server);
    let s = await join(key);
    check("personagem novo recebe o kit inicial", s.count("water_bottle") === 2 && s.count("canned_food") === 2, `agua ${s.count("water_bottle")}, comida ${s.count("canned_food")}`);
    s.room.send("REQUEST_USE_ITEM", { slot: s.slotOf("water_bottle"), actionId: 1 });
    const drank = await until(() => s.count("water_bottle") === 1, 4000);
    check("beber consome 1 garrafa", drank, `agua ${s.count("water_bottle")}`);
    await sleep(4500); // passa a janela de gravacao por mudanca de inventario (~2 s)
    server.kill("SIGKILL"); // sem aviso: nenhum onDispose roda
    await waitExit(server, 5000);
    check("servidor caiu de repente (SIGKILL)", true, "processo encerrado sem salvar nada na hora");
    try {
      s.room.connection.close();
    } catch {
      /* ja caiu */
    }

    // ---- 2. volta e confere; faz mais uma mudanca; sai e desliga normalmente ----
    server = startServer(env);
    await waitHealthy(server);
    s = await join(key);
    check("apos QUEDA BRUSCA o progresso confirmado continua (1 garrafa)", s.count("water_bottle") === 1 && s.count("canned_food") === 2, `agua ${s.count("water_bottle")}, comida ${s.count("canned_food")}`);
    s.room.send("REQUEST_USE_ITEM", { slot: s.slotOf("canned_food"), actionId: 1 });
    await until(() => s.count("canned_food") === 1, 4000);
    await s.room.leave(true); // saida normal: grava e faz snapshot "saida"
    await sleep(1500);
    server.kill("SIGTERM");
    const code = await waitExit(server, 20000);
    check("desligamento normal (SIGTERM) termina limpo", code === 0, `codigo de saida ${code}`);

    server = startServer(env);
    await waitHealthy(server);
    s = await join(key);
    check("apos REINICIO NORMAL tudo continua (1 garrafa, 1 comida)", s.count("water_bottle") === 1 && s.count("canned_food") === 1, `agua ${s.count("water_bottle")}, comida ${s.count("canned_food")}`);
    await s.room.leave(true);
    await sleep(1500);

    // ---- 3. registro quebrado: recupera do snapshot ----
    const store = await createStore({ ...process.env, ...env });
    try {
      if (store.snapshots) {
        const snaps = await store.snapshots(keyId, 10);
        check("existem snapshots do personagem (saida/desligamento)", snaps.length >= 1, `${snaps.length} snapshot(s): ${snaps.map((x) => x.reason).join(", ")}`);
        await store.save(keyId, { v: 999, lixo: true }); // simula corrupcao
        s = await join(key);
        check("registro quebrado: o servidor recupera do snapshot em vez de zerar", s.count("water_bottle") === 1 && s.count("canned_food") === 1, `agua ${s.count("water_bottle")}, comida ${s.count("canned_food")}`);
        await s.room.leave(true);
        await sleep(1500);
        const cur = (await store.load(keyId)) as { v?: number } | null;
        check("o registro atual foi regravado com o dado recuperado", cur?.v === 1, `v=${cur?.v}`);
      } else {
        console.log("(este armazenamento nao tem snapshots: parte de recuperacao pulada)");
      }
    } finally {
      await store.close?.();
    }
  } catch (e) {
    failed++;
    console.log(`FALHA erro no teste - ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGKILL");
      await waitExit(server, 3000);
    }
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  console.log(failed === 0 ? "\nTODOS OK" : `\n${failed} FALHA(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
