import { describe, expect, it } from "vitest";
import { alertThreshold, formatRemaining, newSeason, parseSeasonRecord, seasonDurationFromEnv, seasonRemainingMs, seasonSeed, SEASON_DURATION_MS } from "./season";

describe("temporada", () => {
  it("seed e deterministica e muda por temporada e por mundo", () => {
    expect(seasonSeed("mundo-1", 1)).toBe(seasonSeed("mundo-1", 1));
    expect(seasonSeed("mundo-1", 1)).not.toBe(seasonSeed("mundo-1", 2));
    expect(seasonSeed("mundo-1", 1)).not.toBe(seasonSeed("mundo-2", 1));
    for (let n = 1; n < 200; n++) {
      const s = seasonSeed("mundo-1", n);
      expect(Number.isInteger(s) && s >= 1 && s < 2 ** 31).toBe(true);
    }
  });
  it("nova temporada dura 7 dias e comeca ACTIVE", () => {
    const r = newSeason("mundo-1", 3, 1000, SEASON_DURATION_MS);
    expect(r.status).toBe("ACTIVE");
    expect(r.endsAt - r.startedAt).toBe(7 * 86400_000);
    expect(seasonRemainingMs(r, 1000 + 86400_000)).toBe(6 * 86400_000);
    expect(seasonRemainingMs(r, r.endsAt + 5)).toBe(0);
  });
  it("alertas: 24h, 1h, 10min, 1min, sempre o menor que cobre", () => {
    expect(alertThreshold(3 * 86400_000)).toBeNull();
    expect(alertThreshold(86400_000)).toBe(86400_000);
    expect(alertThreshold(3600_000 + 1)).toBe(86400_000);
    expect(alertThreshold(3600_000)).toBe(3600_000);
    expect(alertThreshold(9 * 60_000)).toBe(10 * 60_000);
    expect(alertThreshold(30_000)).toBe(60_000);
    expect(alertThreshold(0)).toBe(60_000);
  });
  it("formato do tempo restante", () => {
    expect(formatRemaining(6 * 86400_000 + 23 * 3600_000)).toBe("6d 23h");
    expect(formatRemaining(90 * 60_000)).toBe("1h 30min");
    expect(formatRemaining(61_000)).toBe("1min 1s");
    expect(formatRemaining(-5)).toBe("0s");
  });
  it("registro adulterado ou de outro mundo e recusado", () => {
    const ok = newSeason("mundo-1", 1, 0, 10_000);
    expect(parseSeasonRecord(JSON.parse(JSON.stringify(ok)), "mundo-1")).toEqual(ok);
    expect(parseSeasonRecord(ok, "mundo-2")).toBeNull();
    for (const bad of [null, 5, [], { ...ok, n: 0 }, { ...ok, n: 1.5 }, { ...ok, seed: -1 }, { ...ok, status: "X" }, { ...ok, endsAt: 0 }, { ...ok, startedAt: "a" }, { ...ok, v: 2 }, { ...ok, closingAt: "x" }])
      expect(parseSeasonRecord(bad, "mundo-1")).toBeNull();
  });
  it("duracao do ambiente", () => {
    expect(seasonDurationFromEnv(undefined)).toBe(SEASON_DURATION_MS);
    expect(seasonDurationFromEnv("12")).toBe(12_000);
    expect(() => seasonDurationFromEnv("1")).toThrow();
    expect(() => seasonDurationFromEnv("abc")).toThrow();
  });
});
