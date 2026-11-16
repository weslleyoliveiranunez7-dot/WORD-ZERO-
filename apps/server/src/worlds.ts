import { createHash } from "node:crypto";
import { worldStatus, type WorldDef, type WorldInfo } from "@worldzero/shared";

// Etapa 13: cadastro de mundos. Cada mundo e INDEPENDENTE: sala propria, jogadores, criaturas, bases e personagens salvos separados.

// Etapa 14: TODO registro de jogo pertence a uma temporada. O escopo `${mundo}_s${n}_` e o prefixo que o wipe apaga; ele termina em "_" e
// ids de mundo nao tem "_", entao uma temporada (ou um mundo) nunca alcanca os registros de outra. Registros da temporada em si
// (`meta_season_*`) nao comecam por nenhum escopo, logo o wipe nunca os toca.
export function seasonScope(worldId: string, n: number): string {
  return `${worldId}_s${n}_`;
}

// Id de gravacao do personagem DENTRO de um mundo e de uma temporada. Mistura a chave com o mundo e a temporada (o hash nao revela a chave).
// Mudanca da Etapa 14: os ids de antes (sem temporada) deixam de ser lidos; a temporada 1 comeca limpa.
export function characterId(key: string, worldId: string, n: number): string {
  return seasonScope(worldId, n) + createHash("sha256").update(`${key}|${worldId}|${n}`).digest("hex");
}

// Id do registro das bases do mundo naquela temporada.
export function structuresId(worldId: string, n: number): string {
  return `${seasonScope(worldId, n)}structures`;
}

interface Live {
  roomId: string;
  players: number;
  ready: boolean;
  close?: () => void; // Etapa 14: a sala sabe se desconectar (o wipe fecha a sala antes de apagar)
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
  claim(id: string, roomId: string, close?: () => void): boolean {
    if (!this.defs.has(id)) return false;
    const cur = this.live.get(id);
    // Sala vazia ainda registrada = esta fechando (o Colyseus fecha a sala 1 tick depois do ultimo jogador sair): a nova pode assumir.
    if (cur && cur.roomId !== roomId && cur.players > 0) return false;
    this.live.set(id, { roomId, players: 0, ready: false, close });
    return true;
  }

  update(id: string, roomId: string, players: number, ready: boolean): void {
    const cur = this.live.get(id);
    if (cur && cur.roomId === roomId) this.live.set(id, { roomId, players, ready, close: cur.close });
  }

  release(id: string, roomId: string): void {
    if (this.live.get(id)?.roomId === roomId) this.live.delete(id);
  }

  // Etapa 14: pede para a sala do mundo se fechar (desconecta todos). false = nao havia sala.
  closeRoom(id: string): boolean {
    const l = this.live.get(id);
    if (!l?.close) return false;
    l.close();
    return true;
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
