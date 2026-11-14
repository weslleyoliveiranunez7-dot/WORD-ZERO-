// Etapa 1: apenas os NOMES das mensagens (Documento Mestre, Parte 8.1).
// Schemas concretos com validacao e limite de tamanho entram na Etapa 4/5.
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
