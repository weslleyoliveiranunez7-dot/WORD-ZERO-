// Nomes das mensagens (Documento Mestre, Parte 8.1) + formato das mensagens usadas desde a Etapa 4.
// Sem Colyseus Schema por enquanto: mensagens JSON simples, validadas no servidor (parseInput).
export const PROTOCOL_VERSION = 1;

export const CLIENT_MESSAGES = [
  "PLAYER_INPUT",
  "REQUEST_INTERACT",
  "REQUEST_ATTACK",
  "REQUEST_PICKUP",
  "REQUEST_CRAFT",
  "REQUEST_BUILD",
  "REQUEST_INVENTORY_MOVE",
  "REQUEST_USE_ITEM",
  "REQUEST_RESPAWN",
] as const;

export const SERVER_MESSAGES = [
  "WORLD_SNAPSHOT",
  "PLAYER_STATE",
  "ENTITY_UPDATE",
  "INVENTORY_UPDATE",
  "COMBAT_EVENT",
  "SERVER_NOTICE",
  "SEASON_UPDATE",
  "ACTION_REJECTED",
] as const;

export type ClientMessage = (typeof CLIENT_MESSAGES)[number];
export type ServerMessage = (typeof SERVER_MESSAGES)[number];

export const SERVER_TICK_RATE = 20; // simulacao e snapshots por segundo
export const INTERPOLATION_DELAY_MS = 100; // jogadores remotos sao desenhados ~100 ms no passado
export const RECONNECT_WINDOW_SECONDS = 15; // servidor guarda o jogador por 15 s apos queda de conexao

export interface JoinOptions {
  protocol: number;
}

export interface PlayerInputMsg {
  seq: number; // contador crescente por cliente
  ix: number; // -1..1
  iy: number; // -1..1
}

export interface PlayerSnap {
  id: string;
  x: number; // pixels
  y: number;
  seq: number; // ultimo input processado deste jogador (usado na reconciliacao, Etapa 5)
}

export interface WorldSnapshot {
  tick: number;
  players: PlayerSnap[];
}

// Entrada vinda da rede NUNCA e confiavel: valida tipos e limita o intervalo.
export function parseInput(raw: unknown): PlayerInputMsg | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { seq, ix, iy } = raw as Record<string, unknown>;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0 || seq > 2_000_000_000) return null;
  if (typeof ix !== "number" || typeof iy !== "number" || !Number.isFinite(ix) || !Number.isFinite(iy)) return null;
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { seq, ix: clamp(ix), iy: clamp(iy) };
}

export function parseJoinOptions(raw: unknown): JoinOptions | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { protocol } = raw as Record<string, unknown>;
  return typeof protocol === "number" ? { protocol } : null;
}
