import { CHUNK_SIZE, REGION_COLORS, TILE_SIZE, regionAt, type ChunkedWorld } from "@worldzero/shared";

// Minimapa inicial: uma celula por chunk (cor da regiao), chunks carregados mais claros, ponto do jogador.
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cell: number;

  constructor(private world: ChunkedWorld) {
    this.cell = Math.max(4, Math.floor(112 / Math.max(world.chunksX, world.chunksY)));
    this.canvas = document.createElement("canvas");
    this.canvas.width = world.chunksX * this.cell;
    this.canvas.height = world.chunksY * this.cell;
    Object.assign(this.canvas.style, {
      position: "fixed",
      top: "8px",
      right: "8px",
      border: "2px solid rgba(0,0,0,0.6)",
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "20",
      opacity: "0.92",
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }

  update(px: number, py: number): void {
    const { ctx, cell, world } = this;
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
