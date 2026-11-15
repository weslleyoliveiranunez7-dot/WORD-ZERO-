import { Client, Room } from "colyseus.js";
import {
  KICK_CODE,
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_SECONDS,
  WORLD_ROOM_NAME,
  type EntityUpdateMsg,
  type InventoryUpdateMsg,
  type JoinOptions,
  type PlayerInputMsg,
  type PlayerStateMsg,
  type WorldSnapshot,
} from "@worldzero/shared";

export type NetStatus = "conectando" | "online" | "reconectando" | "desconectado";

// Conexao com a sala do servidor. Reconecta sozinho (ate RECONNECT_WINDOW_SECONDS) se a rede cair.
export class NetClient {
  status: NetStatus = "conectando";
  sessionId = "";
  lastError = "";
  onSnapshot: (s: WorldSnapshot) => void = () => {};
  onPlayerState: (s: PlayerStateMsg) => void = () => {};
  onEntities: (m: EntityUpdateMsg) => void = () => {};
  onInventory: (m: InventoryUpdateMsg) => void = () => {};
  private actionId = 0; // cresce sempre: o servidor ignora ids repetidos
  private client: Client;
  private room?: Room;
  private token = "";
  private closed = false;

  constructor(url: string) {
    this.client = new Client(url.replace(/^http/, "ws"));
  }

  async connect(): Promise<void> {
    try {
      const opts: JoinOptions = { protocol: PROTOCOL_VERSION };
      this.attach(await this.client.joinOrCreate(WORLD_ROOM_NAME, opts));
    } catch (e) {
      this.status = "desconectado";
      this.lastError = e instanceof Error ? e.message : String(e);
      throw e;
    }
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
    room.onMessage("ACTION_REJECTED", () => undefined); // o servidor ja corrige o estado; nada a fazer aqui
    room.onLeave((code) => {
      if (this.closed) return;
      if (code === KICK_CODE) {
        this.status = "desconectado";
        this.lastError = "expulso pelo servidor";
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

  respawn(): void {
    if (this.status === "online") this.room?.send("REQUEST_RESPAWN", { actionId: ++this.actionId });
  }

  close(): void {
    this.closed = true;
    void this.room?.leave();
  }
}
