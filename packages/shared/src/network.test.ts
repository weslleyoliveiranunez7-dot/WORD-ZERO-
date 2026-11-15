import { describe, expect, it } from "vitest";
import { SnapshotBuffer, parseInput, parseJoinOptions } from "./index";
import type { WorldSnapshot } from "./index";

const snap = (tick: number, ...ps: [string, number, number][]): WorldSnapshot => ({
  tick,
  players: ps.map(([id, x, y]) => ({ id, x, y, seq: 0, dead: false })),
});

describe("parseInput", () => {
  it("aceita entrada valida e limita -1..1", () => {
    expect(parseInput({ seq: 3, ix: 5, iy: -9 })).toEqual({ seq: 3, ix: 1, iy: -1 });
  });
  it("rejeita lixo", () => {
    for (const bad of [null, undefined, 5, "x", {}, { seq: -1, ix: 0, iy: 0 }, { seq: 1.5, ix: 0, iy: 0 }, { seq: 1, ix: NaN, iy: 0 }, { seq: 1, ix: Infinity, iy: 0 }, { seq: 1, ix: "1", iy: 0 }, { seq: 3e9, ix: 0, iy: 0 }]) {
      expect(parseInput(bad)).toBe(null);
    }
  });
  it("parseJoinOptions", () => {
    expect(parseJoinOptions({ protocol: 2 })).toEqual({ protocol: 2 });
    expect(parseJoinOptions({})).toBe(null);
    expect(parseJoinOptions(null)).toBe(null);
  });
});

describe("SnapshotBuffer", () => {
  it("interpola entre dois snapshots", () => {
    const b = new SnapshotBuffer();
    b.push(1000, snap(1, ["a", 0, 0]));
    b.push(1050, snap(2, ["a", 10, 20]));
    const p = b.sample(1025).get("a")!;
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(10);
  });
  it("nao extrapola alem do ultimo e nao recua antes do primeiro", () => {
    const b = new SnapshotBuffer();
    b.push(1000, snap(1, ["a", 0, 0]));
    b.push(1050, snap(2, ["a", 10, 0]));
    expect(b.sample(5000).get("a")!.x).toBe(10);
    expect(b.sample(0).get("a")!.x).toBe(0);
  });
  it("jogador novo aparece e quem saiu some", () => {
    const b = new SnapshotBuffer();
    b.push(1000, snap(1, ["a", 0, 0], ["b", 5, 5]));
    b.push(1050, snap(2, ["a", 1, 0], ["c", 7, 7]));
    const s = b.sample(1025);
    expect(s.has("b")).toBe(false);
    expect(s.get("c")).toEqual({ x: 7, y: 7 });
    expect(s.has("a")).toBe(true);
  });
  it("buffer vazio e snapshots fora de ordem", () => {
    const b = new SnapshotBuffer();
    expect(b.sample(10).size).toBe(0);
    b.push(2000, snap(2, ["a", 1, 1]));
    b.push(1000, snap(1, ["a", 9, 9]));
    expect(b.size).toBe(1);
  });
});
