import { parseInput, type PlayerInputMsg } from "./protocol";

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
