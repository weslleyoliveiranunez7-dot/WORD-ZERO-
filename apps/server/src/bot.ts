// Cliente de teste (bot) para provar multiplayer REAL: cada bot e um processo separado que se conecta
// por WebSocket ao servidor. Uso: tsx src/bot.ts --name A [--peers 1] [--reconnect] [--linger 4000]
import { Client, Room } from "colyseus.js";
import { PROTOCOL_VERSION, WORLD_ROOM_NAME, type WorldSnapshot } from "@worldzero/shared";

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const name = arg("name", "bot");
const peers = Number(arg("peers", "1"));
const linger = Number(arg("linger", "4000"));
const doReconnect = process.argv.includes("--reconnect");
const url = process.env.SERVER_WS ?? "ws://localhost:2567";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const log = (m: string): void => console.log(`[bot ${name}] ${m}`);

async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`tempo esgotado esperando: ${what}`);
    await sleep(50);
  }
}

async function main(): Promise<void> {
  const client = new Client(url);
  let last: WorldSnapshot | undefined;
  let start: { x: number; y: number } | undefined;
  let room: Room = await client.joinOrCreate(WORLD_ROOM_NAME, { protocol: PROTOCOL_VERSION });
  const sessionId = room.sessionId;
  const hook = (r: Room): void => {
    r.onMessage("WORLD_SNAPSHOT", (s: WorldSnapshot) => {
      last = s;
      const me = s.players.find((p) => p.id === sessionId);
      if (me && !start) start = { x: me.x, y: me.y };
    });
  };
  hook(room);
  log(`conectado como ${sessionId}`);

  let seq = 0;
  const timer = setInterval(() => {
    try {
      room.send("PLAYER_INPUT", { seq: ++seq, ix: 1, iy: 0.5 });
    } catch {
      /* conexao caiu (teste de reconexao) */
    }
  }, 50);

  await waitFor(() => (last?.players.length ?? 0) >= peers + 1, 20000, `ver ${peers} outro(s) jogador(es)`);
  log(`viu ${last!.players.length} jogadores no mesmo mundo`);
  await waitFor(() => {
    const me = last?.players.find((p) => p.id === sessionId);
    return !!me && !!start && Math.hypot(me.x - start.x, me.y - start.y) >= 40;
  }, 10000, "o servidor mover meu jogador 40 px");
  const me1 = last!.players.find((p) => p.id === sessionId)!;
  log(`servidor moveu meu jogador: (${start!.x},${start!.y}) -> (${me1.x},${me1.y})`);

  if (doReconnect) {
    const token = room.reconnectionToken;
    log("derrubando a conexao de proposito e reconectando...");
    room.connection.close(); // fecha o socket sem LEAVE (queda de rede simulada)
    await sleep(800);
    room = await client.reconnect(token);
    if (room.sessionId !== sessionId) throw new Error("reconectou com outro sessionId");
    last = undefined;
    hook(room);
    await waitFor(() => (last?.players.length ?? 0) >= peers + 1, 10000, "ver os outros jogadores apos reconectar");
    log(`reconectou como o mesmo jogador e viu ${last!.players.length} jogadores`);
  }

  clearInterval(timer);
  console.log(`RESULT ${JSON.stringify({ bot: name, sessionId, players: last!.players.length, moved: true, reconnected: doReconnect })}`);
  await sleep(linger); // fica conectado um pouco para o outro bot conseguir ver este
  await room.leave();
  process.exit(0);
}

main().catch((e) => {
  console.error(`[bot ${name}] FALHOU:`, e);
  process.exit(1);
});
