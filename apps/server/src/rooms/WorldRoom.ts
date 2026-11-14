import { Client, Room } from "colyseus";
import { MAX_PLAYERS_PER_WORLD } from "@worldzero/shared";

// Etapa 1: sala vazia, so prova que o servidor sobe e aceita conexao.
// Estado, movimento e regras autoritativas entram nas Etapas 4 e 5.
export class WorldRoom extends Room {
  maxClients = MAX_PLAYERS_PER_WORLD;

  onCreate(): void {
    console.log("[WorldRoom] criada");
  }

  onJoin(client: Client): void {
    console.log(`[WorldRoom] entrou: ${client.sessionId} (${this.clients.length}/${this.maxClients})`);
  }

  onLeave(client: Client): void {
    console.log(`[WorldRoom] saiu: ${client.sessionId}`);
  }
}
