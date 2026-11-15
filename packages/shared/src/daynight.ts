// Ciclo de dia e noite. Logica pura e DETERMINISTICA: o horario do jogo e funcao do relogio (ms), entao todos os
// aparelhos mostram o mesmo horario sem mensagem de rede. E so aparencia: nada aqui muda regra de jogo.
// (Quando o relogio do backend da temporada existir, basta passar o "agora" dele para estas funcoes.)

export const DAY_REAL_MS = 24 * 60 * 1000; // 1 dia do jogo = 24 min reais (1 min do jogo = 1 s real)
export const MINUTES_PER_DAY = 1440;

// Minutos do jogo (0..1439) para um instante em ms.
export function gameMinutesAt(nowMs: number): number {
  const frac = (((nowMs % DAY_REAL_MS) + DAY_REAL_MS) % DAY_REAL_MS) / DAY_REAL_MS;
  return frac * MINUTES_PER_DAY;
}

export function formatClock(minutes: number): string {
  const m = Math.floor(((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function dayPeriod(minutes: number): "madrugada" | "manha" | "tarde" | "noite" {
  const h = (((minutes / 60) % 24) + 24) % 24;
  if (h < 5.5) return "madrugada";
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export interface Sky {
  color: number; // cor da camada que cobre o mundo (0xRRGGBB)
  alpha: number; // 0 = dia claro, perto de 1 = escuridao total
}

// [hora, cor, alpha]. A escuridao maxima e as 3h da manha. Entre dois pontos a mudanca e suave (smoothstep).
const KEYS: [number, number, number][] = [
  [0, 0x03050f, 0.96],
  [3, 0x020309, 0.985],
  [4.5, 0x05081a, 0.93],
  [5.5, 0x2a2147, 0.7],
  [6.5, 0xd9774a, 0.38],
  [8, 0xffd9a8, 0.1],
  [9, 0xffffff, 0],
  [17, 0xffffff, 0],
  [18, 0xffd9a8, 0.1],
  [19, 0xff8f4a, 0.3],
  [20, 0x4a2a52, 0.62],
  [21.5, 0x0a0d25, 0.88],
  [23, 0x03050f, 0.95],
  [24, 0x03050f, 0.96],
];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

export function skyAt(minutes: number): Sky {
  const h = (((minutes / 60) % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, c0, a0] = KEYS[i];
    const [h1, c1, a1] = KEYS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = smooth((h - h0) / (h1 - h0));
      return { color: lerpColor(c0, c1, t), alpha: lerp(a0, a1, t) };
    }
  }
  return { color: 0x03050f, alpha: 0.96 };
}
