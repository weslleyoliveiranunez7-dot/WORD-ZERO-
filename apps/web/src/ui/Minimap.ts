import { CHUNK_SIZE, REGION_COLORS, TILE_SIZE, regionAt, type ChunkedWorld } from "@worldzero/shared";
import { uiRoot } from "./landscape";

// Minimapa compacto (canto superior direito): uma celula por chunk (cor da regiao), chunks carregados mais claros, ponto do jogador.
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cell: number;
  private lastKey = "";

  constructor(private world: ChunkedWorld) {
    this.cell = Math.max(4, Math.floor(112 / Math.max(world.chunksX, world.chunksY)));
    this.canvas = document.createElement("canvas");
    this.canvas.width = world.chunksX * this.cell;
    this.canvas.height = world.chunksY * this.cell;
    Object.assign(this.canvas.style, {
      position: "fixed",
      top: "52px",
      right: "8px",
      border: "1px solid #3a463a",
      borderRadius: "3px",
      background: "#0a0d0a",
      pointerEvents: "none",
      zIndex: "20",
    });
    uiRoot().appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }

  // largura total (com borda), para alinhar o relogio acima
  get outerWidth(): number {
    return this.canvas.width + 2;
  }

  update(px: number, py: number): void {
    const { ctx, cell, world } = this;
    // so redesenha se o ponto andou ou se um chunk carregou (evita trabalho a toa)
    const key = `${Math.round(px / 4)},${Math.round(py / 4)},${world.loadedCount}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const spawnCx = Math.floor(world.spawnTile.x / CHUNK_SIZE);
    const spawnCy = Math.floor(world.spawnTile.y / CHUNK_SIZE);
    for (let cy = 0; cy < world.chunksY; cy++) {
      for (let cx = 0; cx < world.chunksX; cx++) {
        const region = cx === spawnCx && cy === spawnCy ? "plains" : regionAt(world.seed, cx, cy);
        ctx.fillStyle = "#" + REGION_COLORS[region].toString(16).padStart(6, "0");
        ctx.fillRect(cx * cell, cy * cell, cell, cell);
        if (!world.hasChunk(cx, cy)) {
          ctx.fillStyle = "rgba(0,0,0,0.45)"; // nao carregado = escurecido
          ctx.fillRect(cx * cell, cy * cell, cell, cell);
        }
      }
    }
    const k = cell / (CHUNK_SIZE * TILE_SIZE);
    ctx.fillStyle = "#ffeb3b";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.arc(px * k, py * k, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  destroy(): void {
    this.canvas.remove();
  }
}
