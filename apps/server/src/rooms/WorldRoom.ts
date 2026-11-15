import { Client, Room, ServerError } from "colyseus";
import {
  CLIENT_MESSAGES,
  ChunkedWorld,
  KICK_CODE,
  LootWorld,
  MAX_REJECT_NOTICES_PER_SECOND,
  PROTOCOL_VERSION,
  PlayerGuard,
  PlayerLife,
  PlayerSim,
  applySave,
  makeSave,
  parseSave,
  RECONNECT_WINDOW_SECONDS,
  SERVER_TICK_RATE,
  inspectInput,
  inspectInteract,
  inspectRespawn,
  inspectUseItem,
  parseJoinOptions,
  type ActionRejectedMsg,
  type ActionResult,
  type EntityUpdateMsg,
  type InventoryUpdateMsg,
  type PlayerSnap,
  type PlayerSave,
  type PlayerStateMsg,
  type WorldSnapshot,
} from "@worldzero/shared";
import { keyToId, type PlayerStore } from "../store";

const STATE_HEARTBEAT_MS = 1000; // reenvia o estado mesmo sem mudanca (cobre entrada e reconexao)
const INVENTORY_HEARTBEAT_MS = 2000;
const LOOT_HEARTBEAT_MS = 2000;
const AUTOSAVE_MS = 30_000;
const DUPLICATE_SESSION_CODE = 4002;

interface PlayerEntry {
  sim: PlayerSim;
  life: PlayerLife;
  guard: PlayerGuard;
  connected: boolean; // false durante a janela de reconexao: o tempo de sobrevivencia fica CONGELADO
  lastNotice: number; // ultima vez que avisamos o cliente de uma recusa
  lastLog: Map<string, number>; // motivo -> ultima vez que registramos no log (evita encher o log)
  lastStateKey: string;
  lastStateSent: number;
  lastInvVersion: number;
  lastInvSent: number;
  lastLootVersion: number;
  lastLootSent: number;
  keyId?: string; // hash da chave do jogador (sem chave = nada e salvo)
  lastSave: number;
  saving: boolean;
}

// Etapa 6: alem do movimento, o servidor mantem vida/fome/sede/energia/inventario de cada jogador.
// O cliente so manda intencoes (PLAYER_INPUT, REQUEST_USE_ITEM, REQUEST_RESPAWN) e recebe o estado pronto.
// Toda mensagem passa por: limite de frequencia -> validacao estrita -> regra de jogo no servidor.
export class WorldRoom extends Room {
  private world = new ChunkedWorld(); // mundo de teste 8x8: no maximo 64 chunks em memoria
  private loot = new LootWorld(); // Etapa 7: recursos esgotados e mochilas no chao (so o servidor decide)
  private players = new Map<string, PlayerEntry>();
  private tick = 0;
  private survivalScale = 1;
  private joined = 0;
  private store?: PlayerStore;
  private activeKeys = new Map<string, string>(); // keyId -> sessionId (um personagem so entra uma vez por vez)

  onCreate(options: { maxPlayers?: number; survivalScale?: number; store?: PlayerStore }): void {
    this.store = options.store;
    this.maxClients = options.maxPlayers ?? this.maxClients;
    this.survivalScale = options.survivalScale ?? 1;

    this.onMessage("PLAYER_INPUT", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectInput(raw);
      if (r.input) p.sim.setInput(r.input);
      else this.violation(client, p, r.reason, r.weight);
    });

    this.onMessage("REQUEST_USE_ITEM", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectUseItem(raw, p.life.inventory.size);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      this.finish(client, p, "REQUEST_USE_ITEM", p.life.useItem(r.msg.slot, r.msg.actionId, Date.now()));
    });

    // Etapa 7: coletar recurso / pegar mochila. O alvo e a posicao saem do SERVIDOR, nunca da mensagem.
    this.onMessage("REQUEST_INTERACT", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectInteract(raw);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      this.finish(client, p, "REQUEST_INTERACT", p.life.interact(r.msg.actionId, Date.now(), this.world, this.loot, p.sim.x, p.sim.y));
    });

    this.onMessage("REQUEST_RESPAWN", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectRespawn(raw);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      const res = p.life.respawn(r.msg.actionId, Date.now());
      if (res.ok) {
        p.sim.teleport(this.spawnPoint());
        console.log(`[WorldRoom] reapareceu: ${client.sessionId}`);
      }
      this.finish(client, p, "REQUEST_RESPAWN", res);
    });

    // Qualquer outra mensagem: acao ainda nao existe (Etapas 7+) ou o tipo e desconhecido.
    this.onMessage("*", (client, type) => {
      const p = this.admit(client);
      if (!p) return;
      const known = typeof type === "string" && (CLIENT_MESSAGES as readonly string[]).includes(type);
      this.violation(client, p, known ? "acao_nao_implementada" : "tipo_desconhecido", known ? 1 : 3);
    });

    this.setSimulationInterval((dtMs) => this.update(dtMs), 1000 / SERVER_TICK_RATE);
    console.log(`[WorldRoom] criada (max ${this.maxClients} jogadores, ${SERVER_TICK_RATE} Hz, tempo de sobrevivencia x${this.survivalScale})`);
  }

  // Valida a versao, recusa personagem ja conectado e carrega o save (se houver). Falha de leitura: recusa a entrada
  // (entrar "zerado" e depois salvar por cima apagaria o personagem de verdade).
  async onAuth(_client: Client, options: unknown): Promise<{ keyId?: string; save?: PlayerSave }> {
    const join = parseJoinOptions(options);
    if (!join || join.protocol !== PROTOCOL_VERSION) throw new ServerError(4001, "versao de protocolo incompativel");
    if (!join.key || !this.store) return {};
    const keyId = keyToId(join.key);
    const other = this.activeKeys.get(keyId);
    if (other && this.players.has(other)) throw new ServerError(DUPLICATE_SESSION_CODE, "personagem ja esta conectado");
    let raw: unknown | null;
    try {
      raw = await this.store.load(keyId);
    } catch (e) {
      console.error("[WorldRoom] falha ao carregar personagem", e);
      throw new ServerError(4004, "armazenamento indisponivel");
    }
    const save = raw === null ? undefined : (parseSave(raw) ?? undefined);
    if (raw !== null && !save) console.error(`[WorldRoom] save invalido ignorado (${keyId.slice(0, 8)})`);
    return { keyId, save };
  }

  onJoin(client: Client, _options: unknown, auth?: { keyId?: string; save?: PlayerSave }): void {
    const keyId = auth?.keyId;
    const other = keyId ? this.activeKeys.get(keyId) : undefined;
    if (keyId && other && this.players.has(other)) {
      client.leave(DUPLICATE_SESSION_CODE, "personagem ja esta conectado"); // duas entradas simultaneas: a segunda perde
      return;
    }
    const life = new PlayerLife();
    let start = this.spawnPoint();
    if (auth?.save) {
      applySave(life, auth.save);
      const { x, y } = auth.save;
      if (x !== undefined && y !== undefined && !this.world.isSolid(Math.floor(x / this.world.tileSize), Math.floor(y / this.world.tileSize))) start = { x, y };
    }
    this.players.set(client.sessionId, {
      sim: new PlayerSim(start),
      life,
      guard: new PlayerGuard(Date.now()),
      connected: true,
      lastNotice: 0,
      lastLog: new Map(),
      lastStateKey: "",
      lastStateSent: 0,
      lastInvVersion: -1,
      lastInvSent: 0,
      lastLootVersion: -1,
      lastLootSent: 0,
      keyId,
      lastSave: Date.now(),
      saving: false,
    });
    if (keyId) this.activeKeys.set(keyId, client.sessionId);
    console.log(`[WorldRoom] entrou: ${client.sessionId}${auth?.save ? " (personagem restaurado)" : ""} (${this.players.size}/${this.maxClients})`);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.players.get(client.sessionId);
    p?.sim.stop();
    if (p) p.connected = false; // congela fome/sede/energia enquanto aguarda a reconexao
    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
        if (p) {
          p.connected = true;
          p.lastStateSent = 0; // reenvia o estado completo ao reconectar
          p.lastInvSent = 0;
          p.lastLootSent = 0;
        }
        console.log(`[WorldRoom] reconectou: ${client.sessionId}`);
        return;
      } catch {
        /* tempo esgotado: remove abaixo */
      }
    }
    this.release(client.sessionId);
    console.log(`[WorldRoom] saiu: ${client.sessionId} (${this.players.size} restantes)`);
  }

  // Salva sem travar o jogo: uma gravacao por vez por jogador; erro so vai para o log.
  private async persist(p: PlayerEntry): Promise<void> {
    if (!p.keyId || !this.store || p.saving) return;
    p.saving = true;
    p.lastSave = Date.now();
    try {
      await this.store.save(p.keyId, makeSave(p.life, p.sim.x, p.sim.y));
    } catch (e) {
      console.error("[WorldRoom] falha ao salvar personagem", e);
    } finally {
      p.saving = false;
    }
  }

  private release(sessionId: string): void {
    const p = this.players.get(sessionId);
    if (!p) return;
    void this.persist(p);
    if (p.keyId && this.activeKeys.get(p.keyId) === sessionId) this.activeKeys.delete(p.keyId);
    this.players.delete(sessionId);
  }

  async onDispose(): Promise<void> {
    for (const p of this.players.values()) await this.persist(p);
  }

  // Posicoes iniciais levemente diferentes dentro da area livre do spawn.
  private spawnPoint(): { x: number; y: number } {
    const i = this.joined++;
    return { x: this.world.spawn.x + ((i % 5) - 2) * 20, y: this.world.spawn.y + ((Math.floor(i / 5) % 5) - 2) * 20 };
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

  // Resultado de uma acao: recusa vira violacao (peso 0 = so avisa, nao conta ponto). Sucesso atualiza o cliente na hora.
  private finish(client: Client, p: PlayerEntry, action: string, res: ActionResult): void {
    if (!res.ok) return this.violation(client, p, res.reason, res.weight);
    console.log(`[WorldRoom] ${client.sessionId} ${action} ok`);
    this.sendState(client, p, Date.now(), true);
  }

  private violation(client: Client, p: PlayerEntry, reason: string, weight: number): void {
    const now = Date.now();
    if (now - (p.lastLog.get(reason) ?? 0) >= 1000) {
      p.lastLog.set(reason, now);
      console.warn(`[seguranca] ${client.sessionId} ${reason} (violacoes: ${p.guard.totalViolations + (weight > 0 ? 1 : 0)})`);
    }
    if (weight > 0 && p.guard.penalize(now, weight)) {
      console.warn(`[seguranca] ${client.sessionId} EXPULSO por comportamento suspeito`);
      this.release(client.sessionId);
      client.leave(KICK_CODE, "comportamento suspeito");
      return;
    }
    if (now - p.lastNotice >= 1000 / MAX_REJECT_NOTICES_PER_SECOND) {
      p.lastNotice = now;
      const msg: ActionRejectedMsg = { reason };
      client.send("ACTION_REJECTED", msg);
    }
  }

  // Envia PLAYER_STATE e INVENTORY_UPDATE ao DONO quando mudam (ou como batida de coracao).
  private sendState(client: Client, p: PlayerEntry, now: number, force = false): void {
    const v = p.life.survival;
    const state: PlayerStateMsg = {
      health: Math.ceil(v.health), // ceil: com 0,3 de vida o jogador ainda esta vivo e nao ve "0"
      hunger: Math.round(v.hunger),
      thirst: Math.round(v.thirst),
      energy: Math.round(v.energy),
      speedMul: Math.round(v.speedMul * 100) / 100,
      dead: p.life.dead,
      respawnInMs: p.life.respawnInMs(now),
      lost: p.life.lost,
    };
    const key = `${state.health}|${state.hunger}|${state.thirst}|${state.energy}|${state.speedMul}|${state.dead}`;
    if (force || key !== p.lastStateKey || now - p.lastStateSent >= STATE_HEARTBEAT_MS) {
      p.lastStateKey = key;
      p.lastStateSent = now;
      client.send("PLAYER_STATE", state);
    }
    if (force || p.life.invVersion !== p.lastInvVersion || now - p.lastInvSent >= INVENTORY_HEARTBEAT_MS) {
      p.lastInvVersion = p.life.invVersion;
      p.lastInvSent = now;
      const inv: InventoryUpdateMsg = { slots: p.life.inventory.snapshot() };
      client.send("INVENTORY_UPDATE", inv);
    }
    if (force || this.loot.version !== p.lastLootVersion || now - p.lastLootSent >= LOOT_HEARTBEAT_MS) {
      p.lastLootVersion = this.loot.version;
      p.lastLootSent = now;
      const ent: EntityUpdateMsg = this.loot.view(this.world);
      client.send("ENTITY_UPDATE", ent);
    }
  }

  private update(dtMs: number): void {
    const dt = dtMs / 1000;
    const now = Date.now();
    this.loot.tick(now);
    const snaps: PlayerSnap[] = [];
    for (const [id, p] of this.players) {
      if (p.life.dead) p.sim.stop();
      else {
        p.sim.speedMul = p.life.survival.speedMul;
        const x0 = p.sim.x;
        const y0 = p.sim.y;
        if (p.sim.step(this.world, dt).corrected) console.error(`[WorldRoom] BUG: movimento de ${id} corrigido pelo servidor`);
        const moving = Math.hypot(p.sim.x - x0, p.sim.y - y0) > 0.01;
        if (p.connected && p.life.tick(dt * this.survivalScale, moving, now)) {
          p.sim.stop();
          this.loot.addDrop(p.sim.x, p.sim.y, p.life.lost, now); // mochila no local da morte (outros podem pegar)
          void this.persist(p); // salva ja: sem isso, reiniciar o servidor devolveria os itens que estao na mochila
          console.log(`[WorldRoom] morreu: ${id} (perdeu ${p.life.lost.reduce((n, s) => n + s.qty, 0)} itens)`);
        }
      }
      if (p.connected && now - p.lastSave >= AUTOSAVE_MS) void this.persist(p);
      snaps.push({ id, x: Math.round(p.sim.x * 10) / 10, y: Math.round(p.sim.y * 10) / 10, seq: p.sim.seq, dead: p.life.dead });
    }
    const snapshot: WorldSnapshot = { tick: ++this.tick, players: snaps };
    this.broadcast("WORLD_SNAPSHOT", snapshot);
    for (const client of this.clients) {
      const p = this.players.get(client.sessionId);
      if (p && p.connected) this.sendState(client, p, now);
    }
  }
}
