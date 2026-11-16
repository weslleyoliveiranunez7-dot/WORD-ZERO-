import { MAX_PLAYERS_PER_WORLD } from "./constants";
import type { SeasonStatus } from "./season";

// Etapa 13: mundos (servidores) independentes. Cada mundo tem id, nome, regiao, no maximo 50 jogadores e o proprio estado salvo.
// Este arquivo so tem tipos e regras puras (validacao, capacidade, status): o servidor e o cliente usam as MESMAS regras.

export const WORLD_ID_PATTERN = /^[a-z0-9-]{1,24}$/;
export const DEFAULT_WORLD_ID = "mundo-1"; // o mundo "legado": usa os mesmos ids de gravacao de antes da Etapa 13 (ninguem perde o personagem)
export const MAX_WORLDS = 20;

// Codigos de recusa na entrada (ServerError do Colyseus -> `code` no cliente).
export const JOIN_ERROR_UNKNOWN_WORLD = 4005; // mundo nao cadastrado (ou sala de outro mundo)
export const JOIN_ERROR_FULL = 4006; // mundo lotado

export type WorldStatus = "iniciando" | "online" | "lotado";

export interface WorldDef {
  id: string; // a-z, 0-9 e hifen
  name: string; // texto mostrado na lista
  region: string; // sigla curta (br, us, eu...), so informativa
}

export interface WorldInfo extends WorldDef {
  players: number; // jogadores no mundo agora (inclui quem esta na janela de reconexao: a vaga continua dele)
  capacity: number; // nunca passa de MAX_PLAYERS_PER_WORLD
  status: WorldStatus;
  season?: { n: number; seed: number; status: SeasonStatus; endsAt: number; now: number }; // Etapa 14: temporada atual (now = hora do servidor)
  roomId?: string; // sala ativa; ausente = ainda nao foi criada (e criada quando o primeiro jogador entra)
}

export interface ServerListResponse {
  protocol: number;
  servers: WorldInfo[];
}

export const DEFAULT_WORLDS: WorldDef[] = [{ id: DEFAULT_WORLD_ID, name: "Mundo 1", region: "br" }];

// Capacidade real de um mundo: o limite de 50 vale mesmo que alguem configure mais.
export function worldCapacity(configured: number): number {
  if (!Number.isFinite(configured)) return MAX_PLAYERS_PER_WORLD;
  return Math.max(1, Math.min(MAX_PLAYERS_PER_WORLD, Math.floor(configured)));
}

export function worldStatus(players: number, capacity: number, ready: boolean): WorldStatus {
  if (players >= capacity) return "lotado";
  return ready ? "online" : "iniciando";
}

const NAME_PATTERN = /^[^\u0000-\u001f\u007f;:|]{1,32}$/u;
const REGION_PATTERN = /^[a-z0-9-]{2,8}$/;

// Formato: "id:Nome:regiao;id2:Nome 2:regiao2". Ex.: "mundo-1:Mundo 1:br;mundo-2:Mundo 2:br".
// Vazio/ausente = mundo unico padrao. Erro de configuracao LANCA excecao (melhor nao ligar do que ligar com mundos trocados).
export function parseWorldDefs(raw: string | undefined): WorldDef[] {
  if (raw === undefined || raw.trim() === "") return DEFAULT_WORLDS.map((w) => ({ ...w }));
  const out: WorldDef[] = [];
  for (const part of raw.split(";")) {
    const item = part.trim();
    if (item === "") continue;
    const f = item.split(":");
    if (f.length !== 3) throw new Error(`WORLDS invalido: "${item}" (use id:Nome:regiao)`);
    const [id, name, region] = f.map((s) => s.trim()) as [string, string, string];
    if (!WORLD_ID_PATTERN.test(id)) throw new Error(`WORLDS: id invalido "${id}" (a-z, 0-9 e hifen, ate 24)`);
    if (!NAME_PATTERN.test(name)) throw new Error(`WORLDS: nome invalido em "${id}"`);
    if (!REGION_PATTERN.test(region)) throw new Error(`WORLDS: regiao invalida em "${id}"`);
    if (out.some((w) => w.id === id)) throw new Error(`WORLDS: id repetido "${id}"`);
    out.push({ id, name, region });
  }
  if (out.length === 0) throw new Error("WORLDS: nenhum mundo");
  if (out.length > MAX_WORLDS) throw new Error(`WORLDS: no maximo ${MAX_WORLDS} mundos`);
  return out;
}

const isSeasonInfo = (o: unknown): boolean => {
  if (typeof o !== "object" || o === null) return false;
  const s = o as Record<string, unknown>;
  return Number.isInteger(s.n) && (s.n as number) >= 1 && Number.isInteger(s.seed) && (s.seed as number) >= 1 && ["ACTIVE", "CLOSING", "ARCHIVED", "RESETTING"].includes(String(s.status)) && Number.isFinite(s.endsAt) && Number.isFinite(s.now);
};

const isWorldInfo = (o: unknown): o is WorldInfo => {
  if (typeof o !== "object" || o === null) return false;
  const w = o as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    WORLD_ID_PATTERN.test(w.id) &&
    typeof w.name === "string" &&
    w.name.length <= 64 &&
    typeof w.region === "string" &&
    w.region.length <= 16 &&
    Number.isInteger(w.players) &&
    (w.players as number) >= 0 &&
    Number.isInteger(w.capacity) &&
    (w.capacity as number) >= 1 &&
    (w.capacity as number) <= MAX_PLAYERS_PER_WORLD &&
    (w.status === "iniciando" || w.status === "online" || w.status === "lotado") &&
    (w.season === undefined || isSeasonInfo(w.season)) &&
    (w.roomId === undefined || (typeof w.roomId === "string" && w.roomId.length <= 64))
  );
};

// O cliente valida a resposta do servidor antes de usar (lista vinda da rede tambem nao e confiavel).
export function parseServerList(raw: unknown): ServerListResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { protocol, servers } = raw as Record<string, unknown>;
  if (typeof protocol !== "number" || !Array.isArray(servers) || servers.length > MAX_WORLDS) return null;
  if (!servers.every(isWorldInfo)) return null;
  return { protocol, servers: servers as WorldInfo[] };
}
