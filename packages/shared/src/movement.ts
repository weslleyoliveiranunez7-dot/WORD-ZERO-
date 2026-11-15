import { isSolidTile } from "./map";
import type { TileMap } from "./map";

// Aceita o mapa fixo (TileMap) ou o mundo em chunks (ChunkedWorld).
export type SolidMap = TileMap | { tileSize: number; isSolid(tx: number, ty: number): boolean };
const solid = (m: SolidMap, tx: number, ty: number): boolean => ("isSolid" in m ? m.isSolid(tx, ty) : isSolidTile(m, tx, ty));

// Logica pura de movimento e colisao. Fica no shared porque na Etapa 5 o
// SERVIDOR vai usar exatamente a mesma funcao para validar o movimento.

export interface Vec2 {
  x: number;
  y: number;
}

export const PLAYER_SPEED = 140; // pixels por segundo (valor inicial, ajustar na Etapa 6)
export const PLAYER_HALF_SIZE = 10; // o personagem e uma caixa de 20x20 px
export const MAX_STEP_SECONDS = 0.05; // limite por passo: evita atravessar paredes em lag

const EPS = 1e-4;

// Entrada (teclado ou joystick) -> velocidade. Na diagonal nao anda mais rapido.
export function inputToVelocity(ix: number, iy: number, speed: number = PLAYER_SPEED): Vec2 {
  const len = Math.hypot(ix, iy);
  if (len === 0) return { x: 0, y: 0 };
  const k = (len > 1 ? 1 / len : 1) * speed;
  return { x: ix * k, y: iy * k };
}

export function collidesAt(map: SolidMap, x: number, y: number, half: number = PLAYER_HALF_SIZE): boolean {
  const ts = map.tileSize;
  const x0 = Math.floor((x - half) / ts);
  const x1 = Math.floor((x + half - EPS) / ts);
  const y0 = Math.floor((y - half) / ts);
  const y1 = Math.floor((y + half - EPS) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solid(map, tx, ty)) return true;
    }
  }
  return false;
}

// Move um eixo por vez: assim o personagem DESLIZA na parede em vez de grudar.
export function moveWithCollision(
  map: SolidMap,
  pos: Vec2,
  vel: Vec2,
  dt: number,
  half: number = PLAYER_HALF_SIZE,
): Vec2 {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
  const ts = map.tileSize;
  let x = pos.x;
  let y = pos.y;

  const dx = vel.x * step;
  if (dx !== 0) {
    let nx = x + dx;
    if (collidesAt(map, nx, y, half)) {
      nx = dx > 0 ? Math.floor((nx + half) / ts) * ts - half - EPS : (Math.floor((nx - half) / ts) + 1) * ts + half + EPS;
      if (collidesAt(map, nx, y, half)) nx = x;
    }
    x = nx;
  }

  const dy = vel.y * step;
  if (dy !== 0) {
    let ny = y + dy;
    if (collidesAt(map, x, ny, half)) {
      ny = dy > 0 ? Math.floor((ny + half) / ts) * ts - half - EPS : (Math.floor((ny - half) / ts) + 1) * ts + half + EPS;
      if (collidesAt(map, x, ny, half)) ny = y;
    }
    y = ny;
  }

  return { x, y };
}
