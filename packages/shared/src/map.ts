export const TILE_SIZE = 32;

export type TileType = "grass" | "wall" | "water" | "tree";

export const SOLID_TILES: Record<TileType, boolean> = {
  grass: false,
  wall: true,
  water: true,
  tree: true,
};

export interface TileMap {
  width: number;
  height: number;
  tileSize: number;
  tiles: TileType[]; // linha por linha: indice = y * width + x
  spawn: { x: number; y: number }; // em pixels
}

export function tileAt(map: TileMap, tx: number, ty: number): TileType | null {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  return map.tiles[ty * map.width + tx];
}

// Fora do mapa conta como solido (ninguem sai do mundo).
export function isSolidTile(map: TileMap, tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty);
  return t === null ? true : SOLID_TILES[t];
}

// Mapa de teste da Etapa 2: pequeno, deterministico, sem arquivos externos.
// Na Etapa 3 isso sera substituido por chunks gerados.
export function createTestMap(): TileMap {
  const width = 40;
  const height = 30;
  const tiles: TileType[] = new Array(width * height).fill("grass");
  const set = (x: number, y: number, t: TileType): void => {
    tiles[y * width + x] = t;
  };

  const spawnTile = { x: 5, y: 15 };

  // arvores espalhadas (regra fixa, sem aleatorio)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const nearSpawn = Math.abs(x - spawnTile.x) <= 3 && Math.abs(y - spawnTile.y) <= 3;
      const nearDoor = x >= 25 && x <= 27;
      if (!nearSpawn && !nearDoor && (x * 7 + y * 13) % 31 === 0) set(x, y, "tree");
    }
  }

  // lago
  for (let y = 6; y <= 11; y++) for (let x = 8; x <= 14; x++) set(x, y, "water");

  // muro vertical com uma porta de 3 tiles
  for (let y = 1; y < height - 1; y++) {
    if (y < 13 || y > 15) set(26, y, "wall");
    else set(26, y, "grass");
  }

  // borda do mundo
  for (let x = 0; x < width; x++) {
    set(x, 0, "wall");
    set(x, height - 1, "wall");
  }
  for (let y = 0; y < height; y++) {
    set(0, y, "wall");
    set(width - 1, y, "wall");
  }

  return {
    width,
    height,
    tileSize: TILE_SIZE,
    tiles,
    spawn: { x: spawnTile.x * TILE_SIZE + TILE_SIZE / 2, y: spawnTile.y * TILE_SIZE + TILE_SIZE / 2 },
  };
}
