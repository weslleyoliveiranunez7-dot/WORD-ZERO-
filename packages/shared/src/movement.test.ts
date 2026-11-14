import { describe, expect, it } from "vitest";
import {
  MAX_STEP_SECONDS,
  PLAYER_HALF_SIZE,
  PLAYER_SPEED,
  TILE_SIZE,
  collidesAt,
  createTestMap,
  inputToVelocity,
  isSolidTile,
  moveWithCollision,
} from "./index";
import type { Vec2 } from "./index";

const map = createTestMap();
const center = (tx: number, ty: number): Vec2 => ({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 });

function walk(start: Vec2, ix: number, iy: number, frames: number): Vec2 {
  let pos = start;
  const vel = inputToVelocity(ix, iy);
  for (let i = 0; i < frames; i++) pos = moveWithCollision(map, pos, vel, 1 / 60);
  return pos;
}

describe("mapa de teste", () => {
  it("e deterministico", () => {
    expect(createTestMap().tiles).toEqual(createTestMap().tiles);
  });

  it("tem borda solida, fora do mapa solido e spawn livre", () => {
    expect(isSolidTile(map, 0, 0)).toBe(true);
    expect(isSolidTile(map, map.width - 1, map.height - 1)).toBe(true);
    expect(isSolidTile(map, -1, 5)).toBe(true);
    expect(isSolidTile(map, 5, map.height)).toBe(true);
    expect(collidesAt(map, map.spawn.x, map.spawn.y)).toBe(false);
  });
});

describe("entrada -> velocidade", () => {
  it("sem entrada fica parado", () => {
    expect(inputToVelocity(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("diagonal nao e mais rapida que reta", () => {
    const v = inputToVelocity(1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(PLAYER_SPEED, 5);
  });

  it("joystick parcial anda mais devagar", () => {
    const v = inputToVelocity(0.5, 0);
    expect(v.x).toBeCloseTo(PLAYER_SPEED / 2, 5);
  });
});

describe("movimento e colisao", () => {
  it("anda livremente em campo aberto", () => {
    const end = walk(center(20, 5), 1, 0, 30);
    expect(end.x).toBeGreaterThan(center(20, 5).x + 40);
  });

  it("para na parede e nunca entra nela", () => {
    const end = walk(center(24, 5), 1, 0, 600);
    expect(end.x).toBeLessThanOrEqual(26 * TILE_SIZE - PLAYER_HALF_SIZE);
    expect(collidesAt(map, end.x, end.y)).toBe(false);
  });

  it("nao sai do mundo", () => {
    const end = walk(map.spawn, -1, 0, 1200);
    expect(end.x).toBeGreaterThanOrEqual(TILE_SIZE + PLAYER_HALF_SIZE);
    expect(collidesAt(map, end.x, end.y)).toBe(false);
  });

  it("desliza na parede em movimento diagonal", () => {
    const start = center(20, 1);
    const end = walk(start, 1, -1, 120);
    expect(end.x).toBeGreaterThan(start.x + 50);
    expect(end.y).toBeGreaterThanOrEqual(TILE_SIZE + PLAYER_HALF_SIZE);
  });

  it("atravessa a porta do muro", () => {
    const end = walk(center(24, 14), 1, 0, 300);
    expect(end.x).toBeGreaterThan(27 * TILE_SIZE);
  });

  it("nao atravessa o lago", () => {
    const end = walk(center(11, 3), 0, 1, 600);
    expect(end.y).toBeLessThanOrEqual(6 * TILE_SIZE - PLAYER_HALF_SIZE);
  });

  it("passo grande (lag) e limitado", () => {
    const end = moveWithCollision(map, center(20, 5), { x: PLAYER_SPEED, y: 0 }, 10);
    expect(end.x - center(20, 5).x).toBeCloseTo(PLAYER_SPEED * MAX_STEP_SECONDS, 5);
  });
});
