import type { ItemStack, Slot } from "./inventory";

// Nomes das mensagens (Documento Mestre, Parte 8.1) + formato das mensagens usadas desde a Etapa 4.
// Sem Colyseus Schema por enquanto: mensagens JSON simples, validadas no servidor (parseInput).
export const PROTOCOL_VERSION = 4; // 4 = Etapa 8 (mobs no snapshot, REQUEST_ATTACK); 3 = Etapa 7; 2 = Etapa 6

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
  key?: string; // Etapa 7: chave secreta do personagem (gerada no aparelho); sem ela nada e salvo
}

export const PLAYER_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

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
  dead: boolean; // Etapa 6: jogador morto (o cliente esconde o boneco)
}

// Etapa 8: criatura acordada (perto de algum jogador). k: 0 = zumbi, 1 = cervo. hp em % (1..100).
export interface MobSnap {
  id: number;
  k: number;
  x: number;
  y: number;
  hp: number;
}

export interface WorldSnapshot {
  tick: number;
  players: PlayerSnap[];
  mobs?: MobSnap[];
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
  const { protocol, key } = raw as Record<string, unknown>;
  if (typeof protocol !== "number") return null;
  if (key === undefined) return { protocol };
  return typeof key === "string" && PLAYER_KEY_PATTERN.test(key) ? { protocol, key } : null;
}

// Resposta do servidor quando recusa uma mensagem/acao (enviada no maximo 1x por segundo por jogador).
export interface ActionRejectedMsg {
  reason: string;
}

// ---- Etapa 6: estado de sobrevivencia (servidor -> dono do jogador) ----
export interface PlayerStateMsg {
  health: number; // inteiros 0..100
  hunger: number;
  thirst: number;
  energy: number;
  speedMul: number; // 0.6..1 (o cliente usa so para prever o proprio movimento)
  dead: boolean;
  respawnInMs: number; // quando morto: tempo que falta para poder reaparecer
  lost: ItemStack[]; // quando morto: o que foi perdido
}

export interface InventoryUpdateMsg {
  slots: Slot[];
}

// Acoes do cliente (cliente -> servidor). actionId e crescente por cliente: repetir um id nao repete a acao.
export interface UseItemMsg {
  slot: number;
  actionId: number;
}
export interface RespawnMsg {
  actionId: number;
}

// ---- Etapa 7: coleta e loot ----
// O cliente so diz "quero interagir" (sem alvo, sem posicao): o servidor escolhe o alvo mais proximo
// dentro do alcance, usando a posicao que ELE conhece do jogador.
export interface InteractMsg {
  actionId: number;
}
export interface DropView {
  id: number;
  x: number;
  y: number;
}
// Estado dos recursos/mochilas (servidor -> clientes). `depleted` = tiles de recurso esgotados ("tx,ty").
export interface EntityUpdateMsg {
  drops: DropView[];
  depleted: string[];
}

// Etapa 8: ataque corpo a corpo. Sem alvo na mensagem: o servidor escolhe a criatura mais proxima ao alcance.
export interface AttackMsg {
  actionId: number;
}
