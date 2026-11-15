import Phaser from "phaser";
import {
  PLAYER_HALF_SIZE,
  CHUNK_SIZE,
  ChunkedWorld,
  TILE_ORDER,
  inputToVelocity,
  moveWithCollision,
  type Chunk,
  type TileType,
  type Vec2,
} from "@worldzero/shared";
import { Hud } from "../ui/Hud";
import { Minimap } from "../ui/Minimap";
import { VirtualJoystick, isTouchDevice } from "../ui/VirtualJoystick";

const TILE_COLORS: Record<TileType, number[]> = {
  grass: [0x2f5d34, 0x2a5530], // xadrez leve para o movimento ficar visivel
  wall: [0x5b5b66],
  water: [0x2b5f9e],
  tree: [0x1e4026],
};

const VISIBLE_TILES_SHORT_SIDE = 10; // quantos tiles cabem no lado menor da tela

// Etapa 3: mundo em chunks (gerados por seed), carrega os proximos e descarrega os distantes.
export class GameScene extends Phaser.Scene {
  private world!: ChunkedWorld;
  private chunkImgs = new Map<number, Phaser.GameObjects.Image>();
  private lastChunk = "";
  private minimap!: Minimap;
  private pos!: Vec2;
  private player!: Phaser.GameObjects.Arc;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick?: VirtualJoystick;
  private hud!: Hud;
  private hudTimer = 0;
  private onResize = (): void => this.applyZoom();

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.world = new ChunkedWorld();
    this.pos = { ...this.world.spawn };
    this.syncChunks();

    this.player = this.add.circle(this.pos.x, this.pos.y, PLAYER_HALF_SIZE, 0xf2c14e);
    this.player.setStrokeStyle(2, 0x222222);
    this.player.setDepth(10);

    const cam = this.cameras.main;
    cam.setBackgroundColor("#0b0f0c");
    cam.setBounds(0, 0, this.world.width * this.world.tileSize, this.world.height * this.world.tileSize);
    cam.startFollow(this.player, true, 0.12, 0.12);
    this.applyZoom();
    this.scale.on("resize", this.onResize);

    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = kb.addKeys({
        w: K.W,
        a: K.A,
        s: K.S,
        d: K.D,
        up: K.UP,
        left: K.LEFT,
        down: K.DOWN,
        right: K.RIGHT,
      }) as Record<string, Phaser.Input.Keyboard.Key>;
    } else {
      this.keys = {};
    }

    if (isTouchDevice()) this.joystick = new VirtualJoystick();
    this.hud = new Hud();
    this.minimap = new Minimap(this.world);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize);
      this.joystick?.destroy();
      this.hud.destroy();
      this.minimap.destroy();
      this.chunkImgs.forEach((_img, k) => this.removeChunk(k));
      this.chunkImgs.clear();
    });
  }

  update(_time: number, delta: number): void {
    const down = (...names: string[]): number => (names.some((n) => this.keys[n]?.isDown) ? 1 : 0);
    const ix = down("d", "right") - down("a", "left") + (this.joystick?.vector.x ?? 0);
    const iy = down("s", "down") - down("w", "up") + (this.joystick?.vector.y ?? 0);

    const vel = inputToVelocity(ix, iy);
    this.pos = moveWithCollision(this.world, this.pos, vel, delta / 1000);
    this.player.setPosition(this.pos.x, this.pos.y);
    this.syncChunks();

    this.hudTimer += delta;
    if (this.hudTimer >= 250) {
      this.hudTimer = 0;
      const ts = this.world.tileSize;
      const tx = Math.floor(this.pos.x / ts);
      const ty = Math.floor(this.pos.y / ts);
      const fps = Math.round(this.game.loop.actualFps);
      const cx = Math.floor(tx / CHUNK_SIZE);
      const cy = Math.floor(ty / CHUNK_SIZE);
      this.hud.setText(`FPS ${fps} | tile ${tx},${ty} | chunk ${cx},${cy} | ${this.world.loadedCount} carregados`);
      this.minimap.update(this.pos.x, this.pos.y);
    }
  }

  private applyZoom(): void {
    const { width, height } = this.scale;
    const zoom = Math.min(width, height) / (this.world.tileSize * VISIBLE_TILES_SHORT_SIDE);
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.75, 3));
  }

  // So mexe nos chunks quando o jogador troca de chunk.
  private syncChunks(): void {
    const cs = CHUNK_SIZE * this.world.tileSize;
    const key = `${Math.floor(this.pos.x / cs)},${Math.floor(this.pos.y / cs)}`;
    if (key === this.lastChunk) return;
    this.lastChunk = key;
    const { loaded, unloaded } = this.world.updateLoaded(this.pos.x, this.pos.y);
    for (const c of unloaded) {
      const k = c.cy * this.world.chunksX + c.cx;
      this.removeChunk(k);
    }
    for (const c of loaded) this.chunkImgs.set(c.cy * this.world.chunksX + c.cx, this.drawChunk(c));
  }

  private removeChunk(k: number): void {
    this.chunkImgs.get(k)?.destroy();
    this.chunkImgs.delete(k);
    if (this.textures.exists(`chunk-${k}`)) this.textures.remove(`chunk-${k}`);
  }

  // Desenha o chunk UMA vez num Graphics temporario e converte em textura: depois disso o chunk
  // custa 1 quadrado por frame (Graphics com ~256 comandos era redesenhado a cada frame = lento no celular).
  private drawChunk(chunk: Chunk): Phaser.GameObjects.Image {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const ts = this.world.tileSize;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const gx = chunk.cx * CHUNK_SIZE + lx;
        const gy = chunk.cy * CHUNK_SIZE + ly;
        const type = TILE_ORDER[chunk.tiles[ly * CHUNK_SIZE + lx]];
        const colors = TILE_COLORS[type];
        g.fillStyle(colors[(gx + gy) % colors.length], 1);
        g.fillRect(lx * ts, ly * ts, ts, ts);
        if (type === "tree") {
          g.fillStyle(0x3c7a43, 1);
          g.fillCircle(lx * ts + ts / 2, ly * ts + ts / 2, ts * 0.38);
        }
      }
    }
    const key = `chunk-${chunk.cy * this.world.chunksX + chunk.cx}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    const size = CHUNK_SIZE * ts;
    g.generateTexture(key, size, size);
    g.destroy();
    return this.add.image(chunk.cx * size, chunk.cy * size, key).setOrigin(0, 0);
  }
}
