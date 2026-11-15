import { Client, Room } from "colyseus.js";
import {
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_SECONDS,
  WORLD_ROOM_NAME,
  type JoinOptions,
  type PlayerInputMsg,
  type WorldSnapshot,
} from "@worldzero/shared";

export type NetStatus = "conectando" | "online" | "reconectando" | "desconectado";

// Conexao com a sala do servidor. Reconecta sozinho (ate RECONNECT_WINDOW_SECONDS) se a rede cair.
export class NetClient {
  status: NetStatus = "conectando";
  sessionId = "";
  lastError = "";
  onSnapshot: (s: WorldSnapshot) => void = () => {};
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
    room.onLeave(() => {
      if (!this.closed) void this.tryReconnect();
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

  close(): void {
    this.closed = true;
    void this.room?.leave();
  }
}
