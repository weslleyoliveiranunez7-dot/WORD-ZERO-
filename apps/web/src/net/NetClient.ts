import { Client, Room } from "colyseus.js";
import { setLastWorld } from "./serverUrl";
import {
  JOIN_ERROR_FULL,
  JOIN_ERROR_SEASON_CLOSED,
  type SeasonUpdateMsg,
  JOIN_ERROR_UNKNOWN_WORLD,
  KICK_CODE,
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_SECONDS,
  WORLD_ROOM_NAME,
  type ChestUpdateMsg,
  type CombatEventMsg,
  type EntityUpdateMsg,
  type InventoryUpdateMsg,
  type JoinOptions,
  type PlayerInputMsg,
  type PieceKind,
  type PlayerStateMsg,
  type RecipeId,
  type ServerNoticeMsg,
  type StructureUpdateMsg,
  type WorldSnapshot,
} from "@worldzero/shared";

// Chave secreta do personagem: gerada UMA vez neste aparelho. Quem tem a chave controla o personagem.
// Se o armazenamento do navegador for limpo, o personagem salvo nao pode mais ser recuperado.
function playerKey(): string {
  try {
    let k = localStorage.getItem("wz_key");
    if (!k || !/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
      k = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 48);
      localStorage.setItem("wz_key", k);
    }
    return k;
  } catch {
    return ""; // sem armazenamento: joga sem salvar
  }
}

export type NetStatus = "conectando" | "online" | "reconectando" | "desconectado";

// Mundo escolhido na lista (Etapa 13). roomId = sala ativa naquele momento; sem ele o servidor abre a sala do mundo.
export interface WorldChoice {
  id: string;
  name: string;
  roomId?: string;
  seed?: number; // Etapa 14: seed da temporada (vem da lista); o cliente gera o mesmo mapa do servidor
}

// Traduz a recusa do servidor em texto curto. O codigo pode vir no `code` ou so na mensagem, entao olha os dois.
export function describeJoinError(e: unknown): { text: string; full: boolean } {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  const msg = e instanceof Error ? e.message : String(e);
  if (code === JOIN_ERROR_FULL || /lotado/i.test(msg)) return { text: "servidor lotado", full: true };
  if (code === JOIN_ERROR_UNKNOWN_WORLD || /mundo desconhecido|outro mundo/i.test(msg)) return { text: "mundo desconhecido", full: false };
  if (code === JOIN_ERROR_SEASON_CLOSED || /temporada/i.test(msg)) return { text: "temporada encerrando: tente em instantes", full: false };
  if (code === 4002) return { text: "personagem ja conectado em outra aba/aparelho", full: false };
  return { text: msg, full: false };
}

// Conexao com a sala do servidor. Reconecta sozinho (ate RECONNECT_WINDOW_SECONDS) se a rede cair.
export class NetClient {
  status: NetStatus = "conectando";
  sessionId = "";
  lastError = "";
  lastErrorFull = false; // a ultima recusa foi "servidor lotado"
  onSnapshot: (s: WorldSnapshot) => void = () => {};
  onPlayerState: (s: PlayerStateMsg) => void = () => {};
  onEntities: (m: EntityUpdateMsg) => void = () => {};
  onCombat: (m: CombatEventMsg) => void = () => {};
  onInventory: (m: InventoryUpdateMsg) => void = () => {};
  onStructures: (m: StructureUpdateMsg) => void = () => {};
  onChest: (m: ChestUpdateMsg) => void = () => {};
  onNotice: (m: ServerNoticeMsg) => void = () => {};
  onSeason: (m: SeasonUpdateMsg) => void = () => {};
  seasonClosed = false; // o servidor avisou que a temporada acabou: a desconexao seguinte e definitiva (nao reconecta)
  private actionId = 0; // cresce sempre: o servidor ignora ids repetidos
  private client: Client;
  private room?: Room;
  private token = "";
  private closed = false;

  constructor(url: string, private world?: WorldChoice) {
    this.client = new Client(url.replace(/^http/, "ws"));
  }

  async connect(): Promise<void> {
    try {
      const key = playerKey();
      const opts: JoinOptions = { protocol: PROTOCOL_VERSION };
      if (key) opts.key = key;
      if (this.world) opts.world = this.world.id;
      let room: Room;
      try {
        room = await this.join(opts);
      } catch (e) {
        // sala trocou entre a lista e o toque (fechou e reabriu): tenta UMA vez pelo mundo, sem a sala antiga
        if (!this.world?.roomId || describeJoinError(e).full) throw e;
        this.world = { id: this.world.id, name: this.world.name };
        room = await this.join(opts);
      }
      this.attach(room);
      if (this.world) setLastWorld(this.world.id);
    } catch (e) {
      const d = describeJoinError(e);
      this.status = "desconectado";
      this.lastError = d.text;
      this.lastErrorFull = d.full;
      throw e;
    }
  }

  // Com sala conhecida entra direto nela (joinById); senao pede o mundo ao servidor (joinOrCreate filtrado por mundo).
  private join(opts: JoinOptions): Promise<Room> {
    if (this.world?.roomId) return this.client.joinById(this.world.roomId, opts);
    return this.client.joinOrCreate(WORLD_ROOM_NAME, opts);
  }

  private attach(room: Room): void {
    this.room = room;
    this.sessionId = room.sessionId;
    this.token = room.reconnectionToken;
    this.status = "online";
    room.onMessage("WORLD_SNAPSHOT", (s: WorldSnapshot) => this.onSnapshot(s));
    room.onMessage("PLAYER_STATE", (s: PlayerStateMsg) => this.onPlayerState(s));
    room.onMessage("INVENTORY_UPDATE", (m: InventoryUpdateMsg) => this.onInventory(m));
    room.onMessage("ENTITY_UPDATE", (m: EntityUpdateMsg) => this.onEntities(m));
    room.onMessage("COMBAT_EVENT", (m: CombatEventMsg) => this.onCombat(m)); // so feedback visual: o estado real vem do servidor
    room.onMessage("STRUCTURE_UPDATE", (m: StructureUpdateMsg) => this.onStructures(m));
    room.onMessage("SERVER_NOTICE", (m: ServerNoticeMsg) => this.onNotice(m));
    room.onMessage("SEASON_UPDATE", (m: SeasonUpdateMsg) => {
      if (m.status !== "ACTIVE") this.seasonClosed = true;
      this.onSeason(m);
    });
    room.onMessage("CHEST_UPDATE", (m: ChestUpdateMsg) => this.onChest(m));
    room.onMessage("ACTION_REJECTED", () => undefined); // o servidor ja corrige o estado; nada a fazer aqui
    room.onLeave((code) => {
      if (this.closed) return;
      if (this.seasonClosed) {
        this.status = "desconectado";
        this.lastError = "temporada encerrada";
        return;
      }
      if (code === KICK_CODE) {
        this.status = "desconectado";
        this.lastError = "expulso pelo servidor";
        return;
      }
      if (code === 4002) {
        this.status = "desconectado";
        this.lastError = "personagem ja conectado em outra aba/aparelho";
        return;
      }
      void this.tryReconnect();
    });
    room.onError((_code, message) => {
      this.lastError = message ?? "erro";
    });
  }

  private async tryReconnect(): Promise<void> {
    this.status = "reconectando";
    const deadline = Date.now() + RECONNECT_WINDOW_SECONDS * 1000;
    while (!this.closed && Date.now() < deadline) {
      try {
        this.attach(await this.client.reconnect(this.token));
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!this.closed) this.status = "desconectado";
  }

  sendInput(msg: PlayerInputMsg): void {
    if (this.status === "online") this.room?.send("PLAYER_INPUT", msg);
  }

  // Intencoes: o servidor decide se vale (vivo? item existe? cooldown?) e responde com o estado novo.
  useItem(slot: number): void {
    if (this.status === "online") this.room?.send("REQUEST_USE_ITEM", { slot, actionId: ++this.actionId });
  }

  interact(): void {
    if (this.status === "online") this.room?.send("REQUEST_INTERACT", { actionId: ++this.actionId });
  }

  attack(): void {
    if (this.status === "online") this.room?.send("REQUEST_ATTACK", { actionId: ++this.actionId });
  }

  craft(recipe: RecipeId): void {
    if (this.status === "online") this.room?.send("REQUEST_CRAFT", { recipe, actionId: ++this.actionId });
  }

  // Etapa 11: so intencoes (peca/operacao + tile). Dono, alcance, recursos e conteudo do bau sao decididos pelo servidor.
  build(piece: PieceKind, tx: number, ty: number): void {
    if (this.status === "online") this.room?.send("REQUEST_BUILD", { op: "place", piece, tx, ty, actionId: ++this.actionId });
  }

  toggleStructure(tx: number, ty: number): void {
    if (this.status === "online") this.room?.send("REQUEST_BUILD", { op: "toggle", tx, ty, actionId: ++this.actionId });
  }

  repair(tx: number, ty: number): void {
    if (this.status === "online") this.room?.send("REQUEST_BUILD", { op: "repair", tx, ty, actionId: ++this.actionId });
  }

  trust(): void {
    if (this.status === "online") this.room?.send("REQUEST_BUILD", { op: "trust", actionId: ++this.actionId });
  }

  moveChest(op: "deposit" | "withdraw", tx: number, ty: number, slot: number): void {
    if (this.status === "online") this.room?.send("REQUEST_BUILD", { op, tx, ty, slot, actionId: ++this.actionId });
  }

  setTorch(on: boolean): void {
    if (this.status === "online") this.room?.send("REQUEST_TORCH", { on });
  }

  respawn(): void {
    if (this.status === "online") this.room?.send("REQUEST_RESPAWN", { actionId: ++this.actionId });
  }

  close(): void {
    this.closed = true;
    void this.room?.leave();
  }
}
