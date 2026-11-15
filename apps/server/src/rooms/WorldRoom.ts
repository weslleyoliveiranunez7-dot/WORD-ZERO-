import { Client, Room, ServerError } from "colyseus";
import {
  ChunkedWorld,
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_SECONDS,
  SERVER_TICK_RATE,
  inputToVelocity,
  moveWithCollision,
  parseInput,
  parseJoinOptions,
  type PlayerSnap,
  type WorldSnapshot,
} from "@worldzero/shared";

interface PlayerState {
  x: number;
  y: number;
  ix: number;
  iy: number;
  seq: number;
}

// Etapa 4: o SERVIDOR simula o movimento (mesma funcao do cliente, em shared) e envia snapshots.
// Os clientes so mandam intencoes (PLAYER_INPUT). Validacao pesada/anti-cheat: Etapa 5.
export class WorldRoom extends Room {
  private world = new ChunkedWorld(); // mundo de teste 8x8: no maximo 64 chunks em memoria
  private players = new Map<string, PlayerState>();
  private tick = 0;

  onCreate(options: { maxPlayers?: number }): void {
    this.maxClients = options.maxPlayers ?? this.maxClients;
    this.onMessage("PLAYER_INPUT", (client, raw) => {
      const input = parseInput(raw);
      const p = this.players.get(client.sessionId);
      if (!input || !p || input.seq < p.seq) return; // lixo ou fora de ordem: ignora
      p.ix = input.ix;
      p.iy = input.iy;
      p.seq = input.seq;
    });
    this.setSimulationInterval((dtMs) => this.update(dtMs), 1000 / SERVER_TICK_RATE);
    console.log(`[WorldRoom] criada (max ${this.maxClients} jogadores, ${SERVER_TICK_RATE} Hz)`);
  }

  onAuth(_client: Client, options: unknown): boolean {
    const join = parseJoinOptions(options);
    if (!join || join.protocol !== PROTOCOL_VERSION) throw new ServerError(4001, "versao de protocolo incompativel");
    return true;
  }

  onJoin(client: Client): void {
    const i = this.players.size;
    // posicoes iniciais levemente diferentes dentro da area livre do spawn
    const x = this.world.spawn.x + ((i % 5) - 2) * 20;
    const y = this.world.spawn.y + ((Math.floor(i / 5) % 5) - 2) * 20;
    this.players.set(client.sessionId, { x, y, ix: 0, iy: 0, seq: 0 });
    console.log(`[WorldRoom] entrou: ${client.sessionId} (${this.players.size}/${this.maxClients})`);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.players.get(client.sessionId);
    if (p) {
      p.ix = 0;
      p.iy = 0;
    }
    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
        console.log(`[WorldRoom] reconectou: ${client.sessionId}`);
        return;
      } catch {
        /* tempo esgotado: remove abaixo */
      }
    }
    this.players.delete(client.sessionId);
    console.log(`[WorldRoom] saiu: ${client.sessionId} (${this.players.size} restantes)`);
  }

  private update(dtMs: number): void {
    const dt = dtMs / 1000;
    const snaps: PlayerSnap[] = [];
    for (const [id, p] of this.players) {
      const next = moveWithCollision(this.world, p, inputToVelocity(p.ix, p.iy), dt);
      p.x = next.x;
      p.y = next.y;
      snaps.push({ id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, seq: p.seq });
    }
    const snapshot: WorldSnapshot = { tick: ++this.tick, players: snaps };
    this.broadcast("WORLD_SNAPSHOT", snapshot);
  }
}
