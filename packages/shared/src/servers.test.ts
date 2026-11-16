import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORLD_ID,
  MAX_PLAYERS_PER_WORLD,
  MAX_WORLDS,
  PROTOCOL_VERSION,
  parseJoinOptions,
  parseServerList,
  parseWorldDefs,
  worldCapacity,
  worldStatus,
} from "./index";

describe("worldCapacity: o limite de 50 nunca e ultrapassado", () => {
  it("limita a 50 e mantem pelo menos 1", () => {
    expect(worldCapacity(50)).toBe(50);
    expect(worldCapacity(51)).toBe(50);
    expect(worldCapacity(10_000)).toBe(50);
    expect(worldCapacity(3)).toBe(3);
    expect(worldCapacity(0)).toBe(1);
    expect(worldCapacity(-5)).toBe(1);
    expect(worldCapacity(Number.NaN)).toBe(MAX_PLAYERS_PER_WORLD);
    expect(worldCapacity(7.9)).toBe(7);
  });
});

describe("worldStatus", () => {
  it("lotado, iniciando e online", () => {
    expect(worldStatus(50, 50, true)).toBe("lotado");
    expect(worldStatus(49, 50, true)).toBe("online");
    expect(worldStatus(0, 50, false)).toBe("iniciando");
    expect(worldStatus(3, 3, false)).toBe("lotado");
  });
});

describe("parseWorldDefs", () => {
  it("sem configuracao: um mundo padrao", () => {
    expect(parseWorldDefs(undefined)).toEqual([{ id: DEFAULT_WORLD_ID, name: "Mundo 1", region: "br" }]);
    expect(parseWorldDefs("  ")).toHaveLength(1);
  });
  it("le varios mundos", () => {
    const w = parseWorldDefs("mundo-1:Mundo 1:br; mundo-2:Mundo Dois:us;");
    expect(w.map((x) => x.id)).toEqual(["mundo-1", "mundo-2"]);
    expect(w[1]).toEqual({ id: "mundo-2", name: "Mundo Dois", region: "us" });
  });
  it("recusa configuracao ruim (em vez de ligar errado)", () => {
    for (const bad of ["x", "a:b", "A:Nome:br", "a b:Nome:br", "a:Nome:b", "a:Nome:br;a:Outro:br", "a:N|ome:br", "../x:Nome:br", ";"]) {
      expect(() => parseWorldDefs(bad)).toThrow();
    }
    const many = Array.from({ length: MAX_WORLDS + 1 }, (_, i) => `m${i}:Mundo ${i}:br`).join(";");
    expect(() => parseWorldDefs(many)).toThrow();
    expect(parseWorldDefs(Array.from({ length: MAX_WORLDS }, (_, i) => `m${i}:Mundo ${i}:br`).join(";"))).toHaveLength(MAX_WORLDS);
  });
});

describe("parseJoinOptions com mundo", () => {
  it("aceita id valido e recusa lixo", () => {
    expect(parseJoinOptions({ protocol: 8, world: "mundo-2" })).toEqual({ protocol: 8, world: "mundo-2" });
    for (const bad of ["", "Mundo", "a/b", "x".repeat(25), 5, null, { a: 1 }]) {
      expect(parseJoinOptions({ protocol: 8, world: bad })).toBe(null);
    }
  });
});

describe("parseServerList", () => {
  const ok = { id: "mundo-1", name: "Mundo 1", region: "br", players: 2, capacity: 50, status: "online" };
  it("aceita lista valida", () => {
    const r = parseServerList({ protocol: PROTOCOL_VERSION, servers: [ok, { ...ok, id: "mundo-2", roomId: "abc" }] });
    expect(r?.servers).toHaveLength(2);
  });
  it("recusa lista adulterada", () => {
    for (const bad of [
      null,
      {},
      { protocol: 1, servers: "x" },
      { protocol: 1, servers: [{ ...ok, capacity: 51 }] },
      { protocol: 1, servers: [{ ...ok, players: -1 }] },
      { protocol: 1, servers: [{ ...ok, status: "?" }] },
      { protocol: 1, servers: [{ ...ok, id: "../x" }] },
      { protocol: 1, servers: Array.from({ length: MAX_WORLDS + 1 }, () => ok) },
    ]) {
      expect(parseServerList(bad)).toBe(null);
    }
  });
});
