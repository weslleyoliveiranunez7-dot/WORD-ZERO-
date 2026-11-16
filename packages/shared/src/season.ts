// Etapa 14: temporada de 7 dias. Regras PURAS (sem relogio, sem rede, sem armazenamento): servidor e testes usam as mesmas.
// Estados (Documento Mestre 7.5): ACTIVE -> CLOSING -> ARCHIVED -> RESETTING -> (nova temporada) ACTIVE.

export const SEASON_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SEASON_CLOSING_GRACE_MS = 30_000; // aviso final: jogadores ja nao agem, so veem a contagem, antes de serem desconectados
export const SEASON_ALERTS_MS = [24 * 3600_000, 3600_000, 10 * 60_000, 60_000] as const; // 24 h, 1 h, 10 min, 1 min
export const JOIN_ERROR_SEASON_CLOSED = 4007; // entrada recusada: temporada encerrando/encerrada

export type SeasonStatus = "ACTIVE" | "CLOSING" | "ARCHIVED" | "RESETTING";
const STATUSES: readonly string[] = ["ACTIVE", "CLOSING", "ARCHIVED", "RESETTING"];

export interface SeasonRecord {
  v: 1;
  worldId: string;
  n: number; // numero da temporada neste mundo (1, 2, 3...). Nunca repete: e a defesa contra temporada duplicada
  seed: number; // seed do mapa desta temporada (inteiro de 31 bits)
  status: SeasonStatus;
  startedAt: number; // ms (UTC)
  endsAt: number; // ms (UTC)
  closingAt?: number; // quando entrou em CLOSING
}

// SEASON_UPDATE (servidor -> clientes): o relogio e do servidor; `now` e a hora dele (o cliente calcula o tempo restante sem depender do relogio do aparelho).
export interface SeasonUpdateMsg {
  n: number;
  seed: number; // o cliente gera o MESMO mapa do servidor com esta seed
  status: SeasonStatus;
  endsAt: number;
  now: number;
  alert?: number; // limite de alerta que acabou de ser cruzado (ms restantes: 24h, 1h, 10min, 1min)
}

// Resultado gravado ao arquivar (nada de gameplay: so a historia da temporada).
export interface SeasonResult {
  v: 1;
  worldId: string;
  n: number;
  seed: number;
  startedAt: number;
  endsAt: number;
  closedAt: number;
  archivedAt: number;
}

// Seed derivada do mundo e do numero da temporada (FNV-1a): mesma entrada = mesma seed, e cada temporada tem um mapa diferente.
export function seasonSeed(worldId: string, n: number): number {
  let h = 0x811c9dc5;
  const s = `${worldId}|${n}|worldzero`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 1) || 1; // 1..2^31-1
}

export function newSeason(worldId: string, n: number, now: number, durationMs: number): SeasonRecord {
  return { v: 1, worldId, n, seed: seasonSeed(worldId, n), status: "ACTIVE", startedAt: now, endsAt: now + durationMs };
}

export function seasonRemainingMs(rec: Pick<SeasonRecord, "endsAt">, now: number): number {
  return Math.max(0, rec.endsAt - now);
}

// Limite de alerta em vigor: o MENOR da lista que ainda cobre o tempo restante (null = ainda longe do primeiro alerta).
// A sala guarda o ultimo valor enviado e avisa quando ele diminui (nunca repete, nunca avisa ao entrar).
export function alertThreshold(remainingMs: number): number | null {
  let best: number | null = null;
  for (const t of SEASON_ALERTS_MS) if (remainingMs <= t && (best === null || t < best)) best = t;
  return best;
}

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s % 60}s`;
  return `${s}s`;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// O que vem do armazenamento NUNCA e confiavel: valida tudo. null = invalido (o servidor NAO inventa uma temporada nova por cima).
export function parseSeasonRecord(raw: unknown, worldId: string): SeasonRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || r.worldId !== worldId) return null;
  if (!Number.isInteger(r.n) || (r.n as number) < 1) return null;
  if (!Number.isInteger(r.seed) || (r.seed as number) < 1) return null;
  if (typeof r.status !== "string" || !STATUSES.includes(r.status)) return null;
  if (!isNum(r.startedAt) || !isNum(r.endsAt) || (r.endsAt as number) <= (r.startedAt as number)) return null;
  if (r.closingAt !== undefined && !isNum(r.closingAt)) return null;
  const rec: SeasonRecord = { v: 1, worldId, n: r.n as number, seed: r.seed as number, status: r.status as SeasonStatus, startedAt: r.startedAt as number, endsAt: r.endsAt as number };
  if (r.closingAt !== undefined) rec.closingAt = r.closingAt as number;
  return rec;
}

// Durao em ms vinda do ambiente (SEASON_LENGTH_SECONDS). Padrao 7 dias; minimo 5 s (so para TESTES com relogio acelerado).
export function seasonDurationFromEnv(raw: string | undefined): number {
  if (raw === undefined || raw === "") return SEASON_DURATION_MS;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 5 || v > 30 * 86400) throw new Error(`SEASON_LENGTH_SECONDS invalido: ${raw} (5 a 2592000)`);
  return v * 1000;
}
