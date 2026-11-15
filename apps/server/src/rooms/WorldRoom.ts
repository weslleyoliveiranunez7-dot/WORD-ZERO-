import { Client, Room, ServerError } from "colyseus";
import {
  CLIENT_MESSAGES,
  ChunkedWorld,
  KICK_CODE,
  LootWorld,
  MobWorld,
  MAX_REJECT_NOTICES_PER_SECOND,
  PROTOCOL_VERSION,
  PlayerGuard,
  PlayerLife,
  PlayerSim,
  applySave,
  bestWeapon,
  killCredit,
  performAttack,
  makeSave,
  parseSave,
  RECONNECT_WINDOW_SECONDS,
  SERVER_TICK_RATE,
  StructureWorld,
  STRUCT_DAMAGE_MULT,
  TRUST_REACH,
  inspectBuild,
  inspectAttack,
  inspectCraft,
  inspectInput,
  inspectInteract,
  inspectRespawn,
  inspectTorch,
  inspectUseItem,
  parseJoinOptions,
  type ActionRejectedMsg,
  type ActionResult,
  type BuildResult,
  type ChestUpdateMsg,
  type ServerNoticeMsg,
  type StructureUpdateMsg,
  type CombatEventMsg,
  type Fighter,
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
const STRUCTURES_ID = "world-structures"; // registro unico das estruturas no mesmo armazenamento dos personagens (ids de jogador sao sha256 hex: sem colisao)
const STRUCTURES_SAVE_MS = 5000; // no maximo 1 gravacao a cada 5 s (so se algo mudou)
const STRUCTURES_RETRY_MS = 10_000;

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
  torchOn: boolean; // preferencia do jogador (REQUEST_TORCH); so vira luz se ele tiver uma tocha no inventario
  lastStructVersion: number; // versao das estruturas que este cliente ja recebeu (-1 = enviar tudo)
  keyId?: string; // hash da chave do jogador (sem chave = nada e salvo)
  lastSave: number;
  saving: boolean;
}

// Etapa 6: alem do movimento, o servidor mantem vida/fome/sede/energia/inventario de cada jogador.
// O cliente so manda intencoes (PLAYER_INPUT, REQUEST_USE_ITEM, REQUEST_CRAFT, REQUEST_RESPAWN) e recebe o estado pronto.
// Toda mensagem passa por: limite de frequencia -> validacao estrita -> regra de jogo no servidor.
export class WorldRoom extends Room {
  private world = new ChunkedWorld(); // mundo de teste 8x8: no maximo 64 chunks em memoria
  private loot = new LootWorld(); // Etapa 7: recursos esgotados e mochilas no chao (so o servidor decide)
  private mobs = new MobWorld(); // Etapa 8: zumbis e cervos (IA so aqui; cliente so desenha)
  private players = new Map<string, PlayerEntry>();
  private tick = 0;
  private survivalScale = 1;
  private joined = 0;
  private store?: PlayerStore;
  private activeKeys = new Map<string, string>(); // keyId -> sessionId (um personagem so entra uma vez por vez)
  // Etapa 11: construcoes. So o servidor cria/abre/danifica; `structuresReady` so vira true depois de LER o armazenamento
  // (construir antes disso e gravar por cima apagaria as bases de todo mundo).
  private structures!: StructureWorld;
  private structuresReady = false;
  private structuresSaving = false;
  private structuresLastSave = 0;
  private structuresLastTry = 0;

  onCreate(options: { maxPlayers?: number; survivalScale?: number; store?: PlayerStore }): void {
    this.store = options.store;
    this.structures = new StructureWorld(this.world.width, this.world.height, this.world.tileSize);
    this.world.extraSolid = this.structures.solidAt; // colisao de jogadores e criaturas
    this.world.extraOpaque = this.structures.opaqueAt; // linha de visao (janela deixa ver)
    void this.loadStructures();
    this.mobs.populate(this.world);
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

    // Etapa 8/9: golpe corpo a corpo. A mensagem so tem { actionId }. Arma, alvo, alcance, linha de visao, recarga e dano
    // saem do SERVIDOR (performAttack, em shared): posicao e inventario que o servidor conhece, nunca dados do cliente.
    this.onMessage("REQUEST_ATTACK", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectAttack(raw);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      const now = Date.now();
      const out = performAttack(this.world, this.mobs, this.fighter(client.sessionId, p), this.fighters(), r.msg.actionId, now);
      // Etapa 11: golpe que nao achou jogador nem criatura pode acertar uma estrutura (o golpe ja gastou a recarga normalmente).
      let events = out.events;
      if (out.res.ok && this.structuresReady && events.length === 1 && events[0].kind === "miss") {
        const w = bestWeapon(p.life.inventory);
        const t = this.structures.nearest(p.sim.x, p.sim.y, w.reach);
        const dmg = Math.max(1, Math.round(w.damage * STRUCT_DAMAGE_MULT));
        const d = t ? this.structures.damage(t.tx, t.ty, dmg) : null;
        if (d && d.hit) {
          events = [{ kind: "hit", attacker: client.sessionId, x: d.x, y: d.y, damage: dmg }];
          if (d.drops.length > 0) this.loot.addDrop(d.x, d.y, d.drops, now); // conteudo do bau destruido vira mochila no chao
        }
      }
      for (const ev of events) this.emitCombat(ev);
      if (out.drop) this.loot.addDrop(out.drop.x, out.drop.y, out.drop.items, now); // loot da criatura no chao
      this.finish(client, p, "REQUEST_ATTACK", out.res);
    });

    // Etapa 10: fabricar. A mensagem so tem { recipe, actionId }. Ingredientes, bancada, espaco e tempo saem do inventario
    // que o SERVIDOR guarda; a troca (ingredientes -> resultado) e uma transacao unica em PlayerLife.craft.
    this.onMessage("REQUEST_CRAFT", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectCraft(raw);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      this.finish(client, p, "REQUEST_CRAFT", p.life.craft(r.msg.recipe, r.msg.actionId, Date.now()));
    });

    // Etapa 11: construir, abrir/fechar porta, ver/usar bau, reparar e dar acesso (janela e telhado sao pecas como as outras). A mensagem so tem a operacao e o tile alvo; dono, alcance,
    // recursos, espaco e colisao saem do servidor (StructureWorld). Sem personagem salvo (sem chave) nao ha como ser dono.
    this.onMessage("REQUEST_BUILD", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectBuild(raw);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      const m = r.msg;
      const begin = p.life.beginBuild(m.actionId, Date.now());
      if (!begin.ok) return this.finish(client, p, "REQUEST_BUILD", begin);
      if (!p.keyId) return this.finish(client, p, "REQUEST_BUILD", { ok: false, reason: "sem_personagem_salvo", weight: 0 });
      if (!this.structuresReady) return this.finish(client, p, "REQUEST_BUILD", { ok: false, reason: "mundo_carregando", weight: 0 });
      let res: BuildResult;
      if (m.op === "trust") res = this.trustNearest(client, p);
      else {
        const base = { owner: p.keyId, tx: m.tx, ty: m.ty, px: p.sim.x, py: p.sim.y };
        const occupants = [...this.players.values()].map((q) => ({ x: q.sim.x, y: q.sim.y }));
        if (m.op === "place") res = this.structures.place({ ...base, kind: m.piece, inv: p.life.inventory, terrain: this.world, occupants });
        else if (m.op === "toggle") res = this.structures.toggle({ ...base, occupants });
        else if (m.op === "repair") res = this.structures.repair({ ...base, inv: p.life.inventory });
        else res = this.structures.move({ ...base, inv: p.life.inventory, slot: m.slot, toChest: m.op === "deposit" });
      }
      if (res.ok) {
        if (m.op !== "toggle" && m.op !== "trust") p.life.invVersion++; // recursos gastos / itens movidos
        if (res.chest && m.op !== "trust") this.sendChest(client, p, m.tx, m.ty);
      }
      this.finish(client, p, "REQUEST_BUILD", res);
    });

    // Tocha: o cliente so diz "quero acesa/apagada". Quem aparece com luz para os outros e decidido aqui no snapshot.
    this.onMessage("REQUEST_TORCH", (client, raw) => {
      const p = this.admit(client);
      if (!p) return;
      const r = inspectTorch(raw);
      if (!r.msg) return this.violation(client, p, r.reason, r.weight);
      p.torchOn = r.msg.on;
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

  // Etapa 9: todos os jogadores presentes (inclusive os da janela de reconexao: sair no meio da luta nao salva ninguem).
  private fighter(id: string, p: PlayerEntry): Fighter {
    return { id, x: p.sim.x, y: p.sim.y, life: p.life };
  }
  private fighters(): Fighter[] {
    const out: Fighter[] = [];
    for (const [id, p] of this.players) out.push(this.fighter(id, p));
    return out;
  }

  // Feedback visual para todos. Nao muda nenhum estado (vida, morte e loot chegam pelos canais normais).
  private emitCombat(ev: CombatEventMsg): void {
    this.broadcast("COMBAT_EVENT", ev);
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
      torchOn: true,
      lastStructVersion: -1,
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
          p.lastStructVersion = -1;
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

  // Le as estruturas salvas. Falha ou dado invalido: NAO libera construcao nem grava (tenta de novo a cada 10 s).
  private async loadStructures(): Promise<void> {
    this.structuresLastTry = Date.now();
    if (!this.store) {
      this.structuresReady = true; // sem armazenamento (testes): vale so enquanto a sala existir
      return;
    }
    try {
      const raw = await this.store.load(STRUCTURES_ID);
      if (raw === null) {
        this.structuresReady = true; // mundo novo, nada construido ainda
        return;
      }
      const w = StructureWorld.fromSave(raw, this.world.width, this.world.height, this.world.seed, this.world.tileSize);
      if (!w) {
        console.error("[WorldRoom] estruturas salvas invalidas (ou de outra seed): construcao DESLIGADA, nada sera sobrescrito");
        return;
      }
      this.structures = w;
      this.world.extraSolid = w.solidAt;
      this.world.extraOpaque = w.opaqueAt;
      this.structuresReady = true;
      console.log(`[WorldRoom] ${w.count} tiles com estrutura restaurados`);
    } catch (e) {
      console.error("[WorldRoom] falha ao carregar estruturas (construcao desligada, tentando de novo)", e);
    }
  }

  private async persistStructures(): Promise<void> {
    if (!this.store || !this.structuresReady || this.structuresSaving) return;
    this.structuresSaving = true;
    this.structuresLastSave = Date.now();
    this.structures.dirty = false; // mudancas durante a gravacao marcam de novo
    try {
      await this.store.save(STRUCTURES_ID, this.structures.toSave(this.world.seed));
    } catch (e) {
      this.structures.dirty = true;
      console.error("[WorldRoom] falha ao salvar estruturas", e);
    } finally {
      this.structuresSaving = false;
    }
  }

  // Da (ou tira) o acesso as portas/baus ao jogador MAIS PROXIMO do dono. Quem recebe e escolhido pelo servidor, pela posicao
  // que ele conhece; o cliente nunca manda id de ninguem. So jogadores conectados e com personagem salvo podem ser liberados.
  private trustNearest(client: Client, p: PlayerEntry): BuildResult {
    let best: { key: string; d: number } | null = null;
    for (const [id, q] of this.players) {
      if (id === client.sessionId || !q.connected || !q.keyId || q.keyId === p.keyId || q.life.dead) continue;
      const d = Math.hypot(q.sim.x - p.sim.x, q.sim.y - p.sim.y);
      if (d <= TRUST_REACH && (!best || d < best.d)) best = { key: q.keyId, d };
    }
    if (!best) return { ok: false, reason: "ninguem_perto", weight: 0 };
    const r = this.structures.toggleTrust(p.keyId!, best.key);
    if (r.ok) {
      const msg: ServerNoticeMsg = { text: r.added ? "Acesso as suas portas e baus concedido ao jogador mais proximo." : "Acesso removido do jogador mais proximo." };
      client.send("SERVER_NOTICE", msg);
    }
    return r;
  }

  // Conteudo do bau SO para o dono, perto do bau (a regra esta em StructureWorld.chestSlots).
  private sendChest(client: Client, p: PlayerEntry, tx: number, ty: number): void {
    if (!p.keyId) return;
    const slots = this.structures.chestSlots(p.keyId, tx, ty, p.sim.x, p.sim.y);
    if (!slots) return;
    const msg: ChestUpdateMsg = { tx, ty, slots };
    client.send("CHEST_UPDATE", msg);
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
    if (this.structures.dirty) {
      this.structuresSaving = false;
      await this.persistStructures();
    }
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
      weapon: bestWeapon(p.life.inventory).item,
    };
    const key = `${state.health}|${state.hunger}|${state.thirst}|${state.energy}|${state.speedMul}|${state.dead}|${state.weapon}`;
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
    if (p.lastStructVersion !== this.structures.version) {
      p.lastStructVersion = this.structures.version;
      const upd: StructureUpdateMsg = { rows: this.structures.view(p.keyId ?? "") };
      client.send("STRUCTURE_UPDATE", upd);
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
    if (!this.structuresReady && now - this.structuresLastTry >= STRUCTURES_RETRY_MS) void this.loadStructures();
    if (this.structures.dirty && now - this.structuresLastSave >= STRUCTURES_SAVE_MS) void this.persistStructures();
    // criaturas so enxergam jogadores vivos e conectados
    const targets = [];
    for (const [pid, q] of this.players) if (q.connected && !q.life.dead) targets.push({ id: pid, x: q.sim.x, y: q.sim.y });
    for (const h of this.mobs.tick(dt, now, targets, this.world)) this.players.get(h.playerId)?.life.survival.damage(h.damage);
    const snaps: PlayerSnap[] = [];
    for (const [id, p] of this.players) {
      if (p.life.dead) p.sim.stop();
      else {
        p.sim.speedMul = p.life.survival.speedMul;
        const x0 = p.sim.x;
        const y0 = p.sim.y;
        if (p.sim.step(this.world, dt).corrected) console.error(`[WorldRoom] BUG: movimento de ${id} corrigido pelo servidor`);
        const moving = Math.hypot(p.sim.x - x0, p.sim.y - y0) > 0.01;
        // Jogador desconectado (janela de reconexao) NAO envelhece (dt 0), mas pode ser ferido e morrer: tick com dt 0 registra a morte.
        if (p.life.tick(p.connected ? dt * this.survivalScale : 0, moving, now)) {
          p.sim.stop();
          this.loot.addDrop(p.sim.x, p.sim.y, p.life.lost, now); // mochila no local da morte (outros podem pegar)
          void this.persist(p); // salva ja: sem isso, reiniciar o servidor devolveria os itens que estao na mochila
          const killer = killCredit(p.life, id, now);
          if (killer && this.players.has(killer)) this.emitCombat({ kind: "kill", attacker: killer, victim: id, x: Math.round(p.sim.x * 10) / 10, y: Math.round(p.sim.y * 10) / 10 });
          console.log(`[WorldRoom] morreu: ${id} (perdeu ${p.life.lost.reduce((n, s) => n + s.qty, 0)} itens${killer ? `; morto por ${killer}` : ""})`);
        }
      }
      if (p.connected && now - p.lastSave >= AUTOSAVE_MS) void this.persist(p);
      snaps.push({ id, x: Math.round(p.sim.x * 10) / 10, y: Math.round(p.sim.y * 10) / 10, seq: p.sim.seq, dead: p.life.dead, ...(p.torchOn && !p.life.dead && p.life.inventory.count("torch") > 0 ? { torch: true } : {}) });
    }
    const snapshot: WorldSnapshot = { tick: ++this.tick, players: snaps, mobs: this.mobs.snaps() };
    this.broadcast("WORLD_SNAPSHOT", snapshot);
    for (const client of this.clients) {
      const p = this.players.get(client.sessionId);
      if (p && p.connected) this.sendState(client, p, now);
    }
  }
}
