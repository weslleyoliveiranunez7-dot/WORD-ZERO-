import type { PieceKind } from "./building";
import type { RecipeId } from "./crafting";
import type { ItemStack, Slot } from "./inventory";
import type { ItemId } from "./items";

// Nomes das mensagens (Documento Mestre, Parte 8.1) + formato das mensagens usadas desde a Etapa 4.
// Sem Colyseus Schema por enquanto: mensagens JSON simples, validadas no servidor (parseInput).
export const PROTOCOL_VERSION = 7; // 7 = Etapa 11 (REQUEST_BUILD, STRUCTURE_UPDATE, CHEST_UPDATE); 6 = Etapa 10 (REQUEST_CRAFT); 5 = Etapa 9 (COMBAT_EVENT, PLAYER_STATE.weapon); 4 = Etapa 8 (mobs, REQUEST_ATTACK); 3 = Etapa 7; 2 = Etapa 6

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
  "STRUCTURE_UPDATE",
  "CHEST_UPDATE",
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
  weapon: ItemId | null; // Etapa 9: arma que o SERVIDOR usa nos seus golpes (null = punho)
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

// ---- Etapa 9: eventos de combate (servidor -> todos), so para FEEDBACK visual. Nao muda nenhum estado:
// vida, morte e loot vem pelo PLAYER_STATE / snapshot / ENTITY_UPDATE. O cliente nunca "confirma" dano por aqui.
export type CombatEventKind = "hit" | "miss" | "kill";
export interface CombatEventMsg {
  kind: CombatEventKind;
  attacker: string; // sessionId de quem atacou
  victim?: string; // sessionId do jogador atingido (ausente se o alvo foi criatura ou se errou)
  mobId?: number; // id da criatura atingida
  x: number; // onde mostrar o efeito (alvo; no "miss", o atacante)
  y: number;
  damage?: number; // dano aplicado (so "hit")
}

// ---- Etapa 10: fabricar. O cliente so diz QUAL receita quer; ingredientes, bancada, espaco e tempo saem do servidor.
export interface CraftMsg {
  recipe: RecipeId;
  actionId: number;
}

// ---- Etapa 11: construcao. O cliente so diz O QUE quer fazer e ONDE (tile); dono, alcance, recursos, espaco e colisao saem do servidor.
export type BuildMsg =
  | { op: "place"; actionId: number; piece: PieceKind; tx: number; ty: number }
  | { op: "toggle" | "repair"; actionId: number; tx: number; ty: number } // toggle: porta abre/fecha, bau pede o conteudo; repair: so o dono
  | { op: "trust"; actionId: number } // da/tira o acesso do jogador MAIS PROXIMO (o servidor escolhe quem)
  | { op: "deposit" | "withdraw"; actionId: number; tx: number; ty: number; slot: number }; // uma pilha inteira por vez

// Servidor -> dono: todas as estruturas. Linha = [tx, ty, fundacao, topo, acesso, telhado]; topo: 0 nada, 1 parede, 2 porta fechada, 3 porta aberta, 4 bau, 5 janela; acesso: 0 nenhum, 1 dono, 2 liberado.
export interface StructureUpdateMsg {
  rows: [number, number, number, number, number, number][];
}
// Servidor -> dono do bau: o conteudo atual (so o dono, perto do bau, recebe).
export interface ChestUpdateMsg {
  tx: number;
  ty: number;
  slots: Slot[];
}

// Aviso curto do servidor (so texto para mostrar; nao muda estado).
export interface ServerNoticeMsg {
  text: string;
}
