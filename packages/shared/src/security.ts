import { parseInput, type PlayerInputMsg, type AttackMsg, type InteractMsg, type RespawnMsg, type UseItemMsg } from "./protocol";

// Etapa 5: regras de seguranca puras (sem rede, sem relogio proprio) para o servidor e para os testes.

export const CLIENT_RATE_PER_SECOND = 60; // mensagens por segundo, em media
export const CLIENT_BURST = 100; // rajada maxima tolerada
export const KICK_SCORE = 100; // pontos de violacao para expulsar
export const VIOLATION_DECAY_PER_SECOND = 10; // quem se comporta "esquece" violacoes aos poucos
export const KICK_CODE = 4003; // codigo de fechamento enviado ao cliente expulso
export const MAX_REJECT_NOTICES_PER_SECOND = 1;

// Limite de frequencia (balde de fichas) + pontuacao de violacoes (balde furado).
export class PlayerGuard {
  private tokens = CLIENT_BURST;
  private score = 0;
  private last: number;
  totalViolations = 0;

  constructor(nowMs: number) {
    this.last = nowMs;
  }

  private refill(nowMs: number): void {
    const dt = Math.max(0, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.tokens = Math.min(CLIENT_BURST, this.tokens + dt * CLIENT_RATE_PER_SECOND);
    this.score = Math.max(0, this.score - dt * VIOLATION_DECAY_PER_SECOND);
  }

  // Chamar em TODA mensagem recebida. false = acima do limite de frequencia (descartar).
  allow(nowMs: number): boolean {
    this.refill(nowMs);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  // Registra uma violacao. true = deve expulsar.
  penalize(nowMs: number, weight: number): boolean {
    this.refill(nowMs);
    this.totalViolations++;
    this.score += weight;
    return this.score >= KICK_SCORE;
  }
}

export type InputInspection = { input: PlayerInputMsg; reason?: undefined } | { input: null; reason: string; weight: number };

const INPUT_KEYS = new Set(["seq", "ix", "iy"]);

// Validacao ESTRITA do PLAYER_INPUT: so aceita exatamente { seq, ix, iy } dentro do intervalo.
// Campos extras (x, y, speed, dano...) sao tentativa de manipulacao e valem mais pontos.
export function inspectInput(raw: unknown): InputInspection {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { input: null, reason: "formato_invalido", weight: 3 };
  const keys = Object.keys(raw);
  if (keys.length > 8 || keys.some((k) => !INPUT_KEYS.has(k))) return { input: null, reason: "campos_extras", weight: 5 };
  const { ix, iy } = raw as Record<string, unknown>;
  if (typeof ix === "number" && typeof iy === "number" && (Math.abs(ix) > 1.0001 || Math.abs(iy) > 1.0001)) {
    return { input: null, reason: "valor_fora_do_intervalo", weight: 5 };
  }
  const input = parseInput(raw);
  return input ? { input } : { input: null, reason: "valores_invalidos", weight: 3 };
}

// ---- Etapa 6: validacao estrita das acoes (so aceita exatamente os campos esperados) ----
export type ActionInspection<T> = { msg: T; reason?: undefined } | { msg: null; reason: string; weight: number };

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const MAX_ACTION_ID = 2_000_000_000;

function inspectKeys(raw: unknown, allowed: string[]): { reason: string; weight: number } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { reason: "formato_invalido", weight: 3 };
  const keys = Object.keys(raw);
  if (keys.length > 8 || keys.some((k) => !allowed.includes(k))) return { reason: "campos_extras", weight: 5 };
  return null;
}

export function inspectUseItem(raw: unknown, slots: number): ActionInspection<UseItemMsg> {
  const bad = inspectKeys(raw, ["slot", "actionId"]);
  if (bad) return { msg: null, ...bad };
  const { slot, actionId } = raw as Record<string, unknown>;
  if (!isInt(slot, 0, slots - 1) || !isInt(actionId, 0, MAX_ACTION_ID)) return { msg: null, reason: "valores_invalidos", weight: 3 };
  return { msg: { slot, actionId } };
}

export function inspectRespawn(raw: unknown): ActionInspection<RespawnMsg> {
  const bad = inspectKeys(raw, ["actionId"]);
  if (bad) return { msg: null, ...bad };
  const { actionId } = raw as Record<string, unknown>;
  if (!isInt(actionId, 0, MAX_ACTION_ID)) return { msg: null, reason: "valores_invalidos", weight: 3 };
  return { msg: { actionId } };
}

// Etapa 7: REQUEST_INTERACT so aceita { actionId }.
export function inspectInteract(raw: unknown): ActionInspection<InteractMsg> {
  const bad = inspectKeys(raw, ["actionId"]);
  if (bad) return { msg: null, ...bad };
  const { actionId } = raw as Record<string, unknown>;
  if (!isInt(actionId, 0, MAX_ACTION_ID)) return { msg: null, reason: "valores_invalidos", weight: 3 };
  return { msg: { actionId } };
}

// Etapa 8: REQUEST_ATTACK so aceita { actionId }.
export function inspectAttack(raw: unknown): ActionInspection<AttackMsg> {
  const bad = inspectKeys(raw, ["actionId"]);
  if (bad) return { msg: null, ...bad };
  const { actionId } = raw as Record<string, unknown>;
  if (!isInt(actionId, 0, MAX_ACTION_ID)) return { msg: null, reason: "valores_invalidos", weight: 3 };
  return { msg: { actionId } };
}
