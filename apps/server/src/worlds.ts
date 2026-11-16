import { createHash } from "node:crypto";
import { DEFAULT_WORLD_ID, worldStatus, type WorldDef, type WorldInfo } from "@worldzero/shared";
import { keyToId } from "./store";

// Etapa 13: cadastro de mundos. Cada mundo e INDEPENDENTE: sala propria, jogadores, criaturas, bases e personagens salvos separados.

// Id de gravacao do personagem DENTRO de um mundo. O mundo padrao (mundo-1) mantem o id de antes da Etapa 13: ninguem perde o personagem.
// Nos demais, o id mistura a chave com o mundo (o mesmo aparelho tem um personagem diferente em cada mundo; o hash continua nao revelando a chave).
export function characterId(key: string, worldId: string): string {
  if (worldId === DEFAULT_WORLD_ID) return keyToId(key);
  return createHash("sha256").update(`${key}|${worldId}`).digest("hex");
}

// Id do registro das bases do mundo (mesmo armazenamento dos personagens; ids de jogador sao hash hex: sem colisao).
export function structuresId(worldId: string): string {
  return worldId === DEFAULT_WORLD_ID ? "world-structures" : `world-structures-${worldId}`;
}

interface Live {
  roomId: string;
  players: number;
  ready: boolean;
}

// Quem sabe, em tempo real, quantos jogadores ha em cada mundo e qual sala esta viva. As salas avisam (WorldRoom.publish);
// a lista de servidores (/servers) so le daqui. No maximo UMA sala por mundo: e isso que garante "mesmo mundo" e "limite de 50".
export class WorldRegistry {
  private defs = new Map<string, WorldDef>();
  private live = new Map<string, Live>();
  readonly defaultId: string;

  constructor(defs: WorldDef[], readonly capacity: number) {
    if (defs.length === 0) throw new Error("nenhum mundo cadastrado");
    for (const d of defs) this.defs.set(d.id, d);
    this.defaultId = defs[0].id;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  roomOf(id: string): string | undefined {
    return this.live.get(id)?.roomId;
  }

  // Chamado no onCreate da sala (sincrono, antes de qualquer await). false = ja existe outra sala viva deste mundo.
  claim(id: string, roomId: string): boolean {
    if (!this.defs.has(id)) return false;
    const cur = this.live.get(id);
    // Sala vazia ainda registrada = esta fechando (o Colyseus fecha a sala 1 tick depois do ultimo jogador sair): a nova pode assumir.
    if (cur && cur.roomId !== roomId && cur.players > 0) return false;
    this.live.set(id, { roomId, players: 0, ready: false });
    return true;
  }

  update(id: string, roomId: string, players: number, ready: boolean): void {
    const cur = this.live.get(id);
    if (cur && cur.roomId === roomId) this.live.set(id, { roomId, players, ready });
  }

  release(id: string, roomId: string): void {
    if (this.live.get(id)?.roomId === roomId) this.live.delete(id);
  }

  list(): WorldInfo[] {
    const out: WorldInfo[] = [];
    for (const def of this.defs.values()) {
      const l = this.live.get(def.id);
      const players = Math.min(l?.players ?? 0, this.capacity);
      const info: WorldInfo = {
        ...def,
        players,
        capacity: this.capacity,
        status: l ? worldStatus(l.players, this.capacity, l.ready) : "online", // sem sala = vazio e pronto para abrir ao primeiro jogador
      };
      if (l) info.roomId = l.roomId;
      out.push(info);
    }
    return out;
  }
}
