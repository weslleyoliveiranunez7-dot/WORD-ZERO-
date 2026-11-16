// Etapa 17: teste de carga PROGRESSIVO contra o servidor REAL (clientes colyseus.js de verdade, nada simulado localmente).
// Sobe 1 -> 5 -> 10 -> 20 -> 35 -> 50 bots, segura cada degrau e mede: snapshots/s por bot, buracos entre snapshots,
// latencia "input -> movimento visto", latencia do /health, CPU/memoria do servidor, expulsoes, quedas e erros no log.
//
// Uso (dentro de apps/server):
//   LOAD_SPAWN=1 pnpm loadtest                      -> o proprio script liga o servidor (PID exato, arquivos em pasta temporaria)
//   SERVER_WS=wss://meu.onrender.com pnpm loadtest  -> servidor remoto (sem CPU/memoria/log do servidor)
//   SERVER_PID=1234 pnpm loadtest                   -> servidor local ja rodando (PID do processo node, so Linux)
// Variaveis: LOAD_STEPS="1,5,10,20,35,50"  LOAD_HOLD_S=60 (segundos por degrau)  WORLD=<id do mundo>  LOAD_REPORT=arquivo.json
//            LOAD_OVERFLOW=0 (nao testa o 51o jogador)
// Sai com codigo 1 se algum degrau FALHAR. A capacidade so e "comprovada" pelo maior degrau que passou junto com todos os anteriores.
import { Client, Room } from "colyseus.js";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { cpus, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { KICK_CODE, MAX_PLAYERS_PER_WORLD, PROTOCOL_VERSION, WORLD_ROOM_NAME, type WorldSnapshot } from "@worldzero/shared";

const url = process.env.SERVER_WS ?? "ws://localhost:2567";
const httpUrl = process.env.SERVER_HTTP ?? url.replace(/^ws/, "http");
const holdMs = Number(process.env.LOAD_HOLD_S ?? 60) * 1000;
const world = process.env.WORLD;
const reportFile = process.env.LOAD_REPORT ?? "loadtest-report.json";
const steps = (process.env.LOAD_STEPS ?? "1,5,10,20,35,50").split(",").map(Number);
if (steps.some((n, i) => !Number.isInteger(n) || n < 1 || n > MAX_PLAYERS_PER_WORLD || (i > 0 && n <= steps[i - 1]))) {
  throw new Error(`LOAD_STEPS invalido (inteiros crescentes de 1 a ${MAX_PLAYERS_PER_WORLD}): ${process.env.LOAD_STEPS}`);
}
if (!Number.isFinite(holdMs) || holdMs < 3000) throw new Error("LOAD_HOLD_S invalido (minimo 3)");

// Criterios de aprovacao de cada degrau (fixos e visiveis: nada de ajustar depois de ver o resultado).
const TICK_HZ = 20; // SERVER_TICK_RATE do servidor
const LIMITS = { minSnapshotHz: TICK_HZ * 0.9, maxGapRatio: 0.005, maxMoveLatencyP95Ms: 300, maxHealthP95Ms: 250, maxLoadgenLagP99Ms: 50 };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const pct = (a: number[], p: number): number => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const r1 = (n: number): number | null => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

interface Stats {
  snaps: number;
  gaps: number; // buracos > 250 ms (5 ticks sem snapshot)
  maxGapMs: number;
  rejected: Record<string, number>;
  leaves: number;
  kicks: number;
  lat: number[]; // ms entre mandar o 1o input e ver o jogador mexer (so bots-sonda)
  health: number[];
  cpu: number[]; // % de 1 nucleo
  rssMb: number[];
  seenMin: number;
  seenMax: number;
  logErrors: number;
}
const fresh = (): Stats => ({ snaps: 0, gaps: 0, maxGapMs: 0, rejected: {}, leaves: 0, kicks: 0, lat: [], health: [], cpu: [], rssMb: [], seenMin: Infinity, seenMax: 0, logErrors: 0 });
let cur = fresh();
let closing = false;

interface Bot {
  idx: number;
  room: Room;
  probe: boolean;
  last: number;
  pos?: { x: number; y: number };
  phase: "stop" | "go";
  phaseEnd: number;
  pend?: { x0: number; y0: number; t0: number };
  timer?: NodeJS.Timeout;
}
const bots: Bot[] = [];
const client = new Client(url);
const joinOpts = { protocol: PROTOCOL_VERSION, ...(world ? { world } : {}) };

async function addBot(idx: number): Promise<Bot> {
  const room = await client.joinOrCreate(WORLD_ROOM_NAME, joinOpts);
  const bot: Bot = { idx, room, probe: idx < 3, last: 0, phase: "stop", phaseEnd: 0 };
  room.onMessage("*", () => undefined); // demais mensagens (estado, inventario...) so precisam ser consumidas
  room.onMessage("ACTION_REJECTED", (m: { reason?: string }) => {
    const k = String(m?.reason ?? "?");
    cur.rejected[k] = (cur.rejected[k] ?? 0) + 1;
  });
  room.onMessage("WORLD_SNAPSHOT", (s: WorldSnapshot) => {
    const now = performance.now();
    cur.snaps++;
    if (bot.last) {
      const g = now - bot.last;
      if (g > cur.maxGapMs) cur.maxGapMs = g;
      if (g > 250) cur.gaps++;
    }
    bot.last = now;
    if (bot.idx === 0) {
      cur.seenMin = Math.min(cur.seenMin, s.players.length);
      cur.seenMax = Math.max(cur.seenMax, s.players.length);
    }
    if (bot.probe) {
      const me = s.players.find((p) => p.id === room.sessionId);
      if (me) {
        bot.pos = { x: me.x, y: me.y };
        if (bot.pend && Math.hypot(me.x - bot.pend.x0, me.y - bot.pend.y0) >= 1) {
          cur.lat.push(now - bot.pend.t0);
          bot.pend = undefined;
        }
      }
    }
  });
  room.onLeave((code: number) => {
    if (closing) return;
    cur.leaves++;
    if (code === KICK_CODE) cur.kicks++;
  });

  let seq = 0;
  let dir = { ix: 1, iy: 0 };
  let nextTurn = 0;
  bot.timer = setInterval(() => {
    const t = performance.now();
    if (bot.probe) {
      // sonda: parada 0,8 s -> anda 1,5 s; mede quanto demora para o servidor mostrar o movimento
      if (t >= bot.phaseEnd) {
        if (bot.phase === "stop") {
          bot.phase = "go";
          bot.phaseEnd = t + 1500;
          const a = Math.random() * 2 * Math.PI;
          dir = { ix: Math.cos(a), iy: Math.sin(a) };
          if (bot.pos) bot.pend = { x0: bot.pos.x, y0: bot.pos.y, t0: t };
        } else {
          bot.phase = "stop";
          bot.phaseEnd = t + 800;
          dir = { ix: 0, iy: 0 };
          bot.pend = undefined;
        }
      }
    } else if (t >= nextTurn) {
      const a = Math.random() * 2 * Math.PI;
      dir = { ix: Math.cos(a), iy: Math.sin(a) };
      nextTurn = t + 1000 + Math.random() * 2000;
    }
    try {
      room.send("PLAYER_INPUT", { seq: ++seq, ix: dir.ix, iy: dir.iy });
    } catch {
      /* conexao caiu: o onLeave ja conta */
    }
  }, 1000 / TICK_HZ);
  return bot;
}

// ---- servidor (opcional): ligado por este script para termos o PID exato e o log ----
let child: ChildProcess | undefined;
let serverPid = process.env.SERVER_PID ? Number(process.env.SERVER_PID) : undefined;
async function spawnServer(): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: new URL(httpUrl).port || "2567", DATA_DIR: mkdtempSync(join(tmpdir(), "wz-load-")) };
  for (const k of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_KEY"]) delete env[k]; // armazenamento em arquivos (bots nao tem chave: nada e salvo)
  child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  serverPid = child.pid;
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("servidor nao ficou pronto em 30 s")), 30_000);
    const onData = (b: Buffer): void => {
      for (const line of b.toString().split("\n")) {
        if (/ouvindo na porta/.test(line)) {
          clearTimeout(to);
          resolve();
        }
        if (/error|erro|uncaught|unhandled|EXPULSO/i.test(line)) cur.logErrors++;
      }
    };
    child!.stdout!.on("data", onData);
    child!.stderr!.on("data", onData);
    child!.once("exit", (c) => reject(new Error(`servidor saiu antes de ficar pronto (codigo ${c})`)));
  });
  child.once("exit", (c) => {
    if (!closing) console.error(`!! SERVIDOR MORREU durante o teste (codigo ${c})`);
  });
}

async function readProc(pid: number): Promise<{ ticks: number; rssMb: number } | undefined> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const f = stat.slice(stat.lastIndexOf(")") + 2).split(" "); // f[11]=utime, f[12]=stime (campos 14 e 15)
    const statm = await readFile(`/proc/${pid}/statm`, "utf8");
    return { ticks: Number(f[11]) + Number(f[12]), rssMb: (Number(statm.split(" ")[1]) * 4096) / 1048576 };
  } catch {
    return undefined; // sem /proc (nao e Linux) ou processo sumiu
  }
}

async function healthMs(): Promise<number> {
  const t = performance.now();
  try {
    const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(5000) });
    await res.text();
    return res.ok ? performance.now() - t : 5000;
  } catch {
    return 5000; // sem resposta em 5 s conta como 5000 ms
  }
}

interface Row {
  bots: number;
  joinFailed: number;
  joinErrors: string[];
  snapshotHzPerBot: number | null;
  gapsOver250msPct: number | null;
  maxGapMs: number | null;
  moveLatencyMs: { n: number; p50: number | null; p95: number | null; max: number | null };
  healthMs: { p50: number | null; p95: number | null; max: number | null };
  serverCpuPctOfOneCore: { avg: number | null; max: number | null };
  serverRssMb: { max: number | null };
  playersSeenByBot0: { min: number | null; max: number | null };
  unexpectedLeaves: number;
  kicks: number;
  rejected: Record<string, number>;
  serverLogErrors: number | null;
  loadgenLagP99Ms: number | null;
  status: "PASSOU" | "FALHOU" | "INCONCLUSIVO";
  reasons: string[];
}

async function runStep(n: number, lag: ReturnType<typeof monitorEventLoopDelay>): Promise<Row> {
  const joinErrors: string[] = [];
  let joinFailed = 0;
  cur = fresh(); // pega quedas durante a entrada
  while (bots.length < n) {
    try {
      bots.push(await addBot(bots.length));
    } catch (e) {
      joinFailed++;
      const err = e as { code?: number; message?: string };
      joinErrors.push(`${err.code ?? "?"}: ${err.message ?? e}`);
      break; // se um nao entrou, os proximos tambem nao (ex.: lotado)
    }
    await sleep(150);
  }
  const joinLeaves = cur.leaves;
  const joinKicks = cur.kicks;
  await sleep(3000); // assenta
  cur = fresh();
  lag.reset();
  const t0 = performance.now();
  let prev = serverPid ? await readProc(serverPid) : undefined;
  let prevT = performance.now();
  while (performance.now() - t0 < holdMs) {
    cur.health.push(await healthMs());
    await sleep(1000 - ((performance.now() - t0) % 1000));
    if (serverPid) {
      const now = await readProc(serverPid);
      const nowT = performance.now();
      if (prev && now) {
        cur.cpu.push(((now.ticks - prev.ticks) / 100 / ((nowT - prevT) / 1000)) * 100);
        cur.rssMb.push(now.rssMb);
      }
      prev = now;
      prevT = nowT;
    }
  }
  const dur = (performance.now() - t0) / 1000;
  const s = cur;
  const lagP99 = lag.percentile(99) / 1e6;
  const row: Row = {
    bots: bots.length,
    joinFailed,
    joinErrors,
    snapshotHzPerBot: bots.length ? r1(s.snaps / dur / bots.length) : null,
    gapsOver250msPct: s.snaps ? r1((s.gaps / s.snaps) * 100) : null,
    maxGapMs: r1(s.maxGapMs),
    moveLatencyMs: { n: s.lat.length, p50: r1(pct(s.lat, 0.5)), p95: r1(pct(s.lat, 0.95)), max: r1(Math.max(...s.lat, NaN)) },
    healthMs: { p50: r1(pct(s.health, 0.5)), p95: r1(pct(s.health, 0.95)), max: r1(Math.max(...s.health)) },
    serverCpuPctOfOneCore: { avg: s.cpu.length ? r1(s.cpu.reduce((a, b) => a + b, 0) / s.cpu.length) : null, max: s.cpu.length ? r1(Math.max(...s.cpu)) : null },
    serverRssMb: { max: s.rssMb.length ? r1(Math.max(...s.rssMb)) : null },
    playersSeenByBot0: { min: Number.isFinite(s.seenMin) ? s.seenMin : null, max: s.seenMax || null },
    unexpectedLeaves: s.leaves + joinLeaves,
    kicks: s.kicks + joinKicks,
    rejected: s.rejected,
    serverLogErrors: child ? s.logErrors : null,
    loadgenLagP99Ms: r1(lagP99),
    status: "PASSOU",
    reasons: [],
  };
  const bad = (why: string): void => {
    row.reasons.push(why);
  };
  if (joinFailed) bad(`${joinFailed} bot(s) nao entraram (${joinErrors.join("; ")})`);
  if (row.unexpectedLeaves) bad(`${row.unexpectedLeaves} queda(s)/saida(s) inesperada(s), ${row.kicks} expulsao(oes)`);
  if (row.snapshotHzPerBot === null || row.snapshotHzPerBot < LIMITS.minSnapshotHz) bad(`snapshots/s por bot ${row.snapshotHzPerBot} < ${LIMITS.minSnapshotHz}`);
  if (row.gapsOver250msPct !== null && row.gapsOver250msPct > LIMITS.maxGapRatio * 100) bad(`buracos > 250 ms em ${row.gapsOver250msPct}% dos snapshots (limite ${LIMITS.maxGapRatio * 100}%)`);
  if (row.moveLatencyMs.n >= 3 && (row.moveLatencyMs.p95 ?? 0) > LIMITS.maxMoveLatencyP95Ms) bad(`latencia input->movimento p95 ${row.moveLatencyMs.p95} ms > ${LIMITS.maxMoveLatencyP95Ms}`);
  if (row.moveLatencyMs.n < 3) bad(`poucas amostras de latencia (${row.moveLatencyMs.n})`);
  if ((row.healthMs.p95 ?? 0) > LIMITS.maxHealthP95Ms) bad(`/health p95 ${row.healthMs.p95} ms > ${LIMITS.maxHealthP95Ms}`);
  if (row.serverLogErrors) bad(`${row.serverLogErrors} linha(s) de erro/expulsao no log do servidor`);
  if (child && child.exitCode !== null) bad("servidor morreu");
  if (row.status === "PASSOU" && row.reasons.length) row.status = "FALHOU";
  if ((row.loadgenLagP99Ms ?? 0) > LIMITS.maxLoadgenLagP99Ms) {
    row.reasons.push(`gerador de carga saturado (atraso do event loop p99 ${row.loadgenLagP99Ms} ms): rode de outra maquina/processo; resultado nao conclusivo`);
    if (row.status === "PASSOU") row.status = "INCONCLUSIVO";
  }
  return row;
}

async function overflowProbe(): Promise<{ refused: boolean; detail: string }> {
  try {
    const r = await client.joinOrCreate(WORLD_ROOM_NAME, joinOpts);
    closing = true;
    await r.leave();
    closing = false;
    return { refused: false, detail: "o 51o jogador ENTROU (limite de 50 nao esta valendo)" };
  } catch (e) {
    const err = e as { code?: number; message?: string };
    return { refused: true, detail: `recusado: ${err.code ?? "?"} ${err.message ?? e}` };
  }
}

async function main(): Promise<void> {
  if (process.env.LOAD_SPAWN === "1") await spawnServer();
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  const started = new Date().toISOString();
  const rows: Row[] = [];
  console.log(`Teste de carga: degraus ${steps.join(",")} | ${holdMs / 1000} s por degrau | ${url}${child ? " (servidor ligado por este script)" : ""}`);
  for (const n of steps) {
    const row = await runStep(n, lag);
    rows.push(row);
    console.log(`[${row.status}] ${row.bots} bots: ${row.snapshotHzPerBot} snap/s/bot, latencia p95 ${row.moveLatencyMs.p95} ms, /health p95 ${row.healthMs.p95} ms, CPU srv ${row.serverCpuPctOfOneCore.avg ?? "n/d"}%, RAM ${row.serverRssMb.max ?? "n/d"} MB${row.reasons.length ? ` -> ${row.reasons.join(" | ")}` : ""}`);
    if (row.status === "FALHOU") break; // nao adianta subir mais
  }
  let overflow: { refused: boolean; detail: string } | undefined;
  if (process.env.LOAD_OVERFLOW !== "0" && bots.length === MAX_PLAYERS_PER_WORLD && rows.every((r) => r.status !== "FALHOU")) overflow = await overflowProbe();

  let proven = 0;
  for (const r of rows) {
    if (r.status !== "PASSOU") break;
    proven = r.bots;
  }
  const report = {
    started,
    finished: new Date().toISOString(),
    target: url,
    spawnedByScript: !!child,
    machine: { platform: platform(), cpus: cpus().length, node: process.version },
    params: { steps, holdSeconds: holdMs / 1000, world: world ?? null },
    limits: LIMITS,
    rows,
    overflow51: overflow ?? null,
    capacityProvenByThisRun: proven,
    notLimited: [
      "so movimento (PLAYER_INPUT) e leitura de snapshots; sem coleta, combate, fabricacao, construcao nem baus",
      "bots sem chave de personagem: nada e salvo, entao nao mede carga de persistencia (Etapa 12)",
      "todos os bots saem de um unico processo cliente; veja loadgenLagP99Ms de cada degrau",
      child ? "armazenamento em arquivos (pasta temporaria), nao PostgreSQL" : "CPU/memoria/log do servidor so existem com LOAD_SPAWN=1 ou SERVER_PID (Linux)",
    ],
  };
  writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log("\n| bots | status | snap/s/bot | gaps>250ms | lat p95 ms | /health p95 ms | CPU% (1 nucleo) | RAM MB | quedas | expulsoes |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.bots} | ${r.status} | ${r.snapshotHzPerBot} | ${r.gapsOver250msPct}% | ${r.moveLatencyMs.p95} | ${r.healthMs.p95} | ${r.serverCpuPctOfOneCore.avg ?? "n/d"} | ${r.serverRssMb.max ?? "n/d"} | ${r.unexpectedLeaves} | ${r.kicks} |`);
  if (overflow) console.log(`51o jogador: ${overflow.refused ? "OK" : "FALHA"} - ${overflow.detail}`);
  console.log(proven ? `Capacidade comprovada por ESTA execucao: ${proven} jogadores simultaneos (veja as limitacoes no relatorio).` : "Nenhum degrau passou: nada comprovado.");
  console.log(`Relatorio: ${reportFile}`);

  closing = true;
  for (const b of bots) {
    if (b.timer) clearInterval(b.timer);
    void b.room.leave().catch(() => undefined);
  }
  await sleep(500);
  child?.kill("SIGTERM");
  await sleep(child ? 1500 : 0);
  process.exit(rows.some((r) => r.status === "FALHOU") || (overflow !== undefined && !overflow.refused) ? 1 : 0);
}

main().catch((e) => {
  console.error("loadtest FALHOU:", e);
  child?.kill("SIGKILL");
  process.exit(1);
});
