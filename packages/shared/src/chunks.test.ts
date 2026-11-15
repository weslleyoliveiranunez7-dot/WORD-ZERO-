import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  ChunkedWorld,
  TILE_SIZE,
  UNLOAD_RADIUS,
  generateChunk,
  inputToVelocity,
  moveWithCollision,
} from "./index";
import type { Vec2 } from "./index";

describe("chunks", () => {
  it("geracao e deterministica (mesma seed = mesmos tiles)", () => {
    const a = new ChunkedWorld(123, 8, 8);
    const b = new ChunkedWorld(123, 8, 8);
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) expect(a.getChunk(cx, cy)!.tiles).toEqual(b.getChunk(cx, cy)!.tiles);
  });

  it("seeds diferentes geram mundos diferentes", () => {
    const a = new ChunkedWorld(1, 8, 8).getChunk(2, 2)!.tiles;
    const b = new ChunkedWorld(2, 8, 8).getChunk(2, 2)!.tiles;
    expect(a).not.toEqual(b);
  });

  it("gerar um chunk nao depende da ordem de geracao", () => {
    const w1 = new ChunkedWorld(7, 8, 8);
    const w2 = new ChunkedWorld(7, 8, 8);
    w1.getChunk(0, 0);
    w1.getChunk(5, 5);
    expect(w2.getChunk(5, 5)!.tiles).toEqual(w1.getChunk(5, 5)!.tiles);
  });

  it("borda do mundo e fora do mundo sao solidos; spawn e livre", () => {
    const w = new ChunkedWorld(99, 8, 8);
    for (let i = 0; i < w.width; i++) {
      expect(w.isSolid(i, 0)).toBe(true);
      expect(w.isSolid(i, w.height - 1)).toBe(true);
      expect(w.isSolid(0, i)).toBe(true);
      expect(w.isSolid(w.width - 1, i)).toBe(true);
    }
    expect(w.isSolid(-1, 5)).toBe(true);
    expect(w.isSolid(w.width, 5)).toBe(true);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) expect(w.isSolid(w.spawnTile.x + dx, w.spawnTile.y + dy)).toBe(false);
  });

  it("tileAt concorda com os tiles do chunk em coordenadas globais", () => {
    const w = new ChunkedWorld(5, 4, 4);
    const c = generateChunk(5, 2, 3, w.width, w.height, w.spawnTile);
    const tx = 2 * CHUNK_SIZE + 5;
    const ty = 3 * CHUNK_SIZE + 9;
    expect(w.tileAt(tx, ty)).toBe(["grass", "wall", "water", "tree"][c.tiles[9 * CHUNK_SIZE + 5]]);
  });

  it("carrega 3x3 no centro, 2x3 na borda e descarrega os distantes", () => {
    const w = new ChunkedWorld(42, 8, 8);
    const px = (cx: number): number => cx * CHUNK_SIZE * TILE_SIZE + 10;
    const first = w.updateLoaded(px(4), px(4));
    expect(first.loaded.length).toBe(9);
    expect(w.loadedCount).toBe(9);
    const move = w.updateLoaded(px(5), px(4)); // um chunk a direita: 3 novos, nenhum fora do raio ainda
    expect(move.loaded.length).toBe(3);
    expect(move.unloaded.length).toBe(0);
    const far = w.updateLoaded(px(7), px(4)); // longe: os da esquerda saem
    expect(far.unloaded.length).toBeGreaterThan(0);
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) if (w.hasChunk(cx, cy)) expect(Math.max(Math.abs(cx - 7), Math.abs(cy - 4))).toBeLessThanOrEqual(UNLOAD_RADIUS);
    expect(w.evictedTotal).toBeGreaterThan(0);
    // chunk descarregado regenerado e identico
    const again = new ChunkedWorld(42, 8, 8).getChunk(4, 3)!.tiles;
    expect(w.getChunk(4, 3)!.tiles).toEqual(again);
  });

  it("atravessa varios chunks andando, sem perder posicao e com poucos chunks na memoria", () => {
    const w = new ChunkedWorld(20261114, 8, 8);
    let pos: Vec2 = { ...w.spawn };
    w.updateLoaded(pos.x, pos.y);
    const startCx = Math.floor(pos.x / (CHUNK_SIZE * TILE_SIZE));
    let maxLoaded = 0;
    // anda para a direita, depois para baixo, ate bater em algo ou dar 3000 frames
    for (const [ix, iy] of [[1, 0], [0, 1], [-1, 0]] as const) {
      const vel = inputToVelocity(ix, iy);
      for (let i = 0; i < 1500; i++) {
        const next = moveWithCollision(w, pos, vel, 1 / 60);
        expect(Number.isFinite(next.x) && Number.isFinite(next.y)).toBe(true);
        expect(next.x).toBeGreaterThan(0);
        expect(next.y).toBeGreaterThan(0);
        pos = next;
        w.updateLoaded(pos.x, pos.y);
        maxLoaded = Math.max(maxLoaded, w.loadedCount);
      }
    }
    expect(maxLoaded).toBeLessThanOrEqual((2 * UNLOAD_RADIUS + 1) ** 2);
    expect(w.isSolid(Math.floor(pos.x / TILE_SIZE), Math.floor(pos.y / TILE_SIZE))).toBe(false); // nunca dentro de solido
    expect(Math.floor(pos.x / (CHUNK_SIZE * TILE_SIZE))).not.toBe(startCx - 99); // sanidade
  });

  it("desempenho: gerar o mundo de teste inteiro (64 chunks) e rapido", () => {
    const w = new ChunkedWorld(1, 8, 8);
    const t0 = performance.now();
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) w.getChunk(cx, cy);
    const ms = performance.now() - t0;
    console.log(`[perf] 64 chunks gerados em ${ms.toFixed(1)} ms (${(ms / 64).toFixed(2)} ms/chunk)`);
    expect(ms).toBeLessThan(1000);
  });
});
