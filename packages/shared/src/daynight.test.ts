import { describe, expect, it } from "vitest";
import { DAY_REAL_MS, dayPeriod, formatClock, gameMinutesAt, skyAt } from "./index";

describe("ciclo de dia e noite", () => {
  it("o horario e deterministico e fica entre 0 e 1440", () => {
    expect(gameMinutesAt(0)).toBe(0);
    expect(gameMinutesAt(DAY_REAL_MS / 2)).toBeCloseTo(720, 5);
    expect(gameMinutesAt(DAY_REAL_MS * 7 + DAY_REAL_MS / 4)).toBeCloseTo(360, 5);
    for (const t of [-5000, 1, 123456789, 9e12]) {
      const m = gameMinutesAt(t);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(1440);
    }
  });
  it("formata o relogio", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(3 * 60)).toBe("03:00");
    expect(formatClock(13 * 60 + 5)).toBe("13:05");
    expect(formatClock(1440)).toBe("00:00");
  });
  it("de dia nao escurece e as 3h da manha e o mais escuro", () => {
    expect(skyAt(12 * 60).alpha).toBe(0);
    let darkest = 0;
    let at = -1;
    for (let m = 0; m < 1440; m++) {
      const a = skyAt(m).alpha;
      if (a > darkest) {
        darkest = a;
        at = m;
      }
    }
    expect(at).toBe(180);
    expect(darkest).toBeGreaterThanOrEqual(0.97);
  });
  it("a transicao e suave: sem saltos grandes de um minuto para o outro, inclusive na virada do dia", () => {
    for (let m = 0; m < 1440; m++) {
      const a = skyAt(m).alpha;
      const b = skyAt((m + 1) % 1440).alpha;
      expect(Math.abs(a - b)).toBeLessThan(0.03);
    }
  });
  it("periodos do dia", () => {
    expect(dayPeriod(3 * 60)).toBe("madrugada");
    expect(dayPeriod(9 * 60)).toBe("manha");
    expect(dayPeriod(15 * 60)).toBe("tarde");
    expect(dayPeriod(22 * 60)).toBe("noite");
  });
});
