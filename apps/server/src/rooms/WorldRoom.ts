import { Client, Room, ServerError } from "colyseus";
import {
  CLIENT_MESSAGES,
  ChunkedWorld,
  KICK_CODE,
  MAX_REJECT_NOTICES_PER_SECOND,
  PROTOCOL_VERSION,
  PlayerGuard,
  PlayerSim,
  RECONNECT_WINDOW_SECONDS,
  SERVER_TICK_RATE,
  inspectInput,
  parseJoinOptions,
  type ActionRejectedMsg,
  type PlayerSnap,
  type WorldSnapshot,
} from "@worldzero/shared";

interface PlayerEntry {
  sim: PlayerSim;
  guard: PlayerGuard;
  lastNotice: number; // ultima vez que avisamos o cliente de uma recusa
  lastLog: Map<string, number>; // motivo -> ultima vez que registramos no log (evita encher o log)
}

// Etapa 5: o servidor e a unica fonte de verdade. O cliente so manda intencao (PLAYER_INPUT).
// Toda mensagem passa por: limite de frequencia -> validacao estrita -> simulacao autoritativa.
export class WorldRoom extends Room {
  private world = new ChunkedWorld(); // mundo de teste 8x8: no maximo 64 chunks em memoria
  private players = new Map<string, PlayerEntry>();
  private tick = 0;

  onCreate(options: { maxPlayers?: number }): void {
    this.maxClients = options.maxPlayers ?? this.maxClients;

    this.onMessage("PLAYER_INPUT", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectInput(raw);
      if (r.input) p.sim.setInput(r.input);
      else this.violation(client, p, r.reason, r.weight);
    });

    // Qualquer outra mensagem: acoes ainda nao existem (Etapas 6+) ou o tipo e desconhecido.
    this.onMessage("*", (client, type) => {
      const p = this.admit(client);
      if (!p) return;
      const known = typeof type === "string" && (CLIENT_MESSAGES as readonly string[]).includes(type);
      this.violation(client, p, known ? "acao_nao_implementada" : "tipo_desconhecido", known ? 1 : 3);
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
    this.players.set(client.sessionId, { sim: new PlayerSim({ x, y }), guard: new PlayerGuard(Date.now()), lastNotice: 0, lastLog: new Map() });
    console.log(`[WorldRoom] entrou: ${client.sessionId} (${this.players.size}/${this.maxClients})`);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    this.players.get(client.sessionId)?.sim.stop();
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

  // Limite de frequencia: chamado em TODA mensagem. Devolve o jogador, ou null se deve ser descartada.
  private admit(client: Client): PlayerEntry | null {
    const p = this.players.get(client.sessionId);
    if (!p) return null;
    if (!p.guard.allow(Date.now())) {
      this.violation(client, p, "excesso_de_mensagens", 1);
      return null;
    }
    return p;
  }

  private violation(client: Client, p: PlayerEntry, reason: string, weight: number): void {
    const now = Date.now();
    if (now - (p.lastLog.get(reason) ?? 0) >= 1000) {
      p.lastLog.set(reason, now);
      console.warn(`[seguranca] ${client.sessionId} ${reason} (violacoes: ${p.guard.totalViolations + 1})`);
    }
    if (p.guard.penalize(now, weight)) {
      console.warn(`[seguranca] ${client.sessionId} EXPULSO por comportamento suspeito`);
      this.players.delete(client.sessionId);
      client.leave(KICK_CODE, "comportamento suspeito");
      return;
    }
    if (now - p.lastNotice >= 1000 / MAX_REJECT_NOTICES_PER_SECOND) {
      p.lastNotice = now;
      const msg: ActionRejectedMsg = { reason };
      client.send("ACTION_REJECTED", msg);
    }
  }

  private update(dtMs: number): void {
    const dt = dtMs / 1000;
    const snaps: PlayerSnap[] = [];
    for (const [id, p] of this.players) {
      if (p.sim.step(this.world, dt).corrected) console.error(`[WorldRoom] BUG: movimento de ${id} corrigido pelo servidor`);
      snaps.push({ id, x: Math.round(p.sim.x * 10) / 10, y: Math.round(p.sim.y * 10) / 10, seq: p.sim.seq });
    }
    const snapshot: WorldSnapshot = { tick: ++this.tick, players: snaps };
    this.broadcast("WORLD_SNAPSHOT", snapshot);
  }
}
