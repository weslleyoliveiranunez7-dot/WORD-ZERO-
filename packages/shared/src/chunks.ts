import { TILE_SIZE } from "./map";
import type { TileType } from "./map";

// Etapa 3: mundo dividido em chunks, gerado de forma deterministica a partir de uma seed.
// Mesma seed + mesmas coordenadas = mesmo chunk, no cliente e no servidor.

export const CHUNK_SIZE = 16; // tiles por lado (16 x 32 px = 512 px)
export const TEST_WORLD_CHUNKS = 8; // mundo de teste: 8x8 chunks = 128x128 tiles
export const TEST_WORLD_SEED = 20261114;
export const LOAD_RADIUS = 1; // chunks carregados ao redor do jogador (3x3)
export const UNLOAD_RADIUS = 2; // chunks alem disso sao descarregados (histerese)

export const TILE_ORDER: TileType[] = ["grass", "wall", "water", "tree"];
const TILE_INDEX: Record<TileType, number> = { grass: 0, wall: 1, water: 2, tree: 3 };

export type Region = "plains" | "forest" | "lake" | "ruins";
export const REGION_COLORS: Record<Region, number> = {
  plains: 0x4f8a4a,
  forest: 0x25522c,
  lake: 0x2b5f9e,
  ruins: 0x7a7a86,
};

export interface Chunk {
  cx: number;
  cy: number;
  region: Region;
  tiles: Uint8Array; // CHUNK_SIZE*CHUNK_SIZE, indice = ly * CHUNK_SIZE + lx; valores de TILE_ORDER
}

// ---- ruido deterministico (so inteiros no hash; sem Math.random) ----
export function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, x0, y0);
  const b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1);
  const d = hash2(seed, x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function regionAt(seed: number, cx: number, cy: number): Region {
  const v = vnoise(seed + 11, cx / 3 + 0.5, cy / 3 + 0.5);
  if (v < 0.4) return "lake";
  if (v < 0.58) return "plains";
  if (v < 0.76) return "forest";
  return "ruins";
}

export function generateChunk(seed: number, cx: number, cy: number, worldTilesX: number, worldTilesY: number, spawnTile: { x: number; y: number }): Chunk {
  const region: Region =
    Math.floor(spawnTile.x / CHUNK_SIZE) === cx && Math.floor(spawnTile.y / CHUNK_SIZE) === cy ? "plains" : regionAt(seed, cx, cy);
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tx = cx * CHUNK_SIZE + lx;
      const ty = cy * CHUNK_SIZE + ly;
      const r = hash2(seed, tx, ty);
      let t: TileType = "grass";
      if (region === "plains") {
        if (r < 0.03) t = "tree";
      } else if (region === "forest") {
        if (r < 0.28) t = "tree";
      } else if (region === "lake") {
        if (vnoise(seed + 3, tx / 7, ty / 7) > 0.46) t = "water";
        else if (r < 0.04) t = "tree";
      } else {
        // ruinas: fragmentos de muro em grade + algumas arvores
        if ((tx % 7 === 0 && ty % 6 < 3) || (ty % 9 === 0 && tx % 5 < 3)) t = r < 0.8 ? "wall" : "grass";
        else if (r < 0.04) t = "tree";
      }
      // area livre ao redor do spawn
      if (Math.abs(tx - spawnTile.x) <= 3 && Math.abs(ty - spawnTile.y) <= 3) t = "grass";
      // borda do mundo
      if (tx === 0 || ty === 0 || tx === worldTilesX - 1 || ty === worldTilesY - 1) t = "wall";
      tiles[ly * CHUNK_SIZE + lx] = TILE_INDEX[t];
    }
  }
  return { cx, cy, region, tiles };
}

export interface ChunkUpdate {
  loaded: Chunk[]; // chunks que passaram a ficar residentes agora
  unloaded: Chunk[]; // chunks removidos agora
}

// Mundo em chunks. Usa a mesma interface de colisao do TileMap (tileSize + isSolid).
export class ChunkedWorld {
  readonly tileSize = TILE_SIZE;
  readonly width: number; // em tiles
  readonly height: number;
  readonly spawnTile: { x: number; y: number };
  readonly spawn: { x: number; y: number }; // em pixels
  generatedTotal = 0;
  evictedTotal = 0;
  private cache = new Map<number, Chunk>();
  extraOpaque: ((tx: number, ty: number) => boolean) | null = null; // Etapa 11: estruturas que bloqueiam a linha de visao (janela nao)
  extraSolid: ((tx: number, ty: number) => boolean) | null = null; // Etapa 11: estruturas construidas (parede, bau, porta fechada)

  constructor(
    readonly seed: number = TEST_WORLD_SEED,
    readonly chunksX: number = TEST_WORLD_CHUNKS,
    readonly chunksY: number = TEST_WORLD_CHUNKS,
  ) {
    this.width = chunksX * CHUNK_SIZE;
    this.height = chunksY * CHUNK_SIZE;
    this.spawnTile = { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
    this.spawn = { x: this.spawnTile.x * TILE_SIZE + TILE_SIZE / 2, y: this.spawnTile.y * TILE_SIZE + TILE_SIZE / 2 };
  }

  get loadedCount(): number {
    return this.cache.size;
  }

  hasChunk(cx: number, cy: number): boolean {
    return this.cache.has(this.key(cx, cy));
  }

  private key(cx: number, cy: number): number {
    return cy * this.chunksX + cx;
  }

  inWorldChunk(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.chunksX && cy < this.chunksY;
  }

  // Devolve o chunk (gera se ainda nao existe). Fora do mundo: null.
  getChunk(cx: number, cy: number): Chunk | null {
    if (!this.inWorldChunk(cx, cy)) return null;
    const k = this.key(cx, cy);
    let c = this.cache.get(k);
    if (!c) {
      c = generateChunk(this.seed, cx, cy, this.width, this.height, this.spawnTile);
      this.cache.set(k, c);
      this.generatedTotal++;
    }
    return c;
  }

  tileAt(tx: number, ty: number): TileType | null {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return null;
    const c = this.getChunk(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE));
    if (!c) return null;
    return TILE_ORDER[c.tiles[(ty - c.cy * CHUNK_SIZE) * CHUNK_SIZE + (tx - c.cx * CHUNK_SIZE)]];
  }

  // Fora do mundo conta como solido.
  isSolid(tx: number, ty: number): boolean {
    const t = this.tileAt(tx, ty);
    if (t === null) return true;
    return t !== "grass" || (this.extraSolid !== null && this.extraSolid(tx, ty));
  }

  // Carrega os chunks perto de (px,py) e descarta os distantes. Chame quando o jogador mudar de chunk.
  updateLoaded(px: number, py: number, loadRadius: number = LOAD_RADIUS, unloadRadius: number = UNLOAD_RADIUS): ChunkUpdate {
    const pcx = Math.floor(px / (CHUNK_SIZE * TILE_SIZE));
    const pcy = Math.floor(py / (CHUNK_SIZE * TILE_SIZE));
    const loaded: Chunk[] = [];
    const unloaded: Chunk[] = [];
    for (let cy = pcy - loadRadius; cy <= pcy + loadRadius; cy++) {
      for (let cx = pcx - loadRadius; cx <= pcx + loadRadius; cx++) {
        if (!this.inWorldChunk(cx, cy) || this.hasChunk(cx, cy)) continue;
        const c = this.getChunk(cx, cy);
        if (c) loaded.push(c);
      }
    }
    for (const [k, c] of this.cache) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cy - pcy)) > unloadRadius) {
        this.cache.delete(k);
        this.evictedTotal++;
        unloaded.push(c);
      }
    }
    return { loaded, unloaded };
  }
}
