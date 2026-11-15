import Phaser from "phaser";
import {
  PLAYER_HALF_SIZE,
  CHUNK_SIZE,
  ChunkedWorld,
  INTERPOLATION_DELAY_MS,
  SnapshotBuffer,
  TILE_ORDER,
  inputToVelocity,
  moveWithCollision,
  type Chunk,
  type TileType,
  type Vec2,
  type WorldSnapshot,
} from "@worldzero/shared";
import { Hud } from "../ui/Hud";
import { Minimap } from "../ui/Minimap";
import { NetClient } from "../net/NetClient";
import { getServerUrl } from "../net/serverUrl";
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
  // rede (so no modo online)
  private net?: NetClient;
  private snaps = new SnapshotBuffer();
  private remotes = new Map<string, Phaser.GameObjects.Arc>();
  private synced = false;
  private seq = 0;
  private lastIx = 0;
  private lastIy = 0;
  private inputTimer = 0;
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

  create(data?: { online?: boolean }): void {
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
    if (data?.online) {
      this.net = new NetClient(getServerUrl());
      this.net.onSnapshot = (snap) => this.onSnapshot(snap);
      this.net.connect().catch(() => undefined); // o erro fica em net.lastError e aparece no HUD
    }
    this.minimap = new Minimap(this.world);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize);
      this.joystick?.destroy();
      this.hud.destroy();
      this.minimap.destroy();
      this.net?.close();
      this.remotes.forEach((r) => r.destroy());
      this.remotes.clear();
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
    if (this.net) {
      this.sendInput(ix, iy, delta);
      this.renderRemotes();
    }

    this.hudTimer += delta;
    if (this.hudTimer >= 250) {
      this.hudTimer = 0;
      const ts = this.world.tileSize;
      const tx = Math.floor(this.pos.x / ts);
      const ty = Math.floor(this.pos.y / ts);
      const fps = Math.round(this.game.loop.actualFps);
      const cx = Math.floor(tx / CHUNK_SIZE);
      const cy = Math.floor(ty / CHUNK_SIZE);
      const net = this.net ? ` | ${this.net.status}${this.net.lastError ? " (" + this.net.lastError.slice(0, 40) + ")" : ""} ${this.remotes.size + (this.synced ? 1 : 0)} jog.` : "";
      this.hud.setText(`FPS ${fps} | tile ${tx},${ty} | chunk ${cx},${cy} | ${this.world.loadedCount} carregados${net}`);
      this.minimap.update(this.pos.x, this.pos.y);
    }
  }

  private sendInput(ix: number, iy: number, delta: number): void {
    const cx = Math.max(-1, Math.min(1, ix));
    const cy = Math.max(-1, Math.min(1, iy));
    this.inputTimer += delta;
    if (cx !== this.lastIx || cy !== this.lastIy || this.inputTimer >= 50) {
      this.lastIx = cx;
      this.lastIy = cy;
      this.inputTimer = 0;
      this.net?.sendInput({ seq: ++this.seq, ix: cx, iy: cy });
    }
  }

  private onSnapshot(snap: WorldSnapshot): void {
    this.snaps.push(performance.now(), snap);
    const me = snap.players.find((p) => p.id === this.net?.sessionId);
    if (!me) return;
    // 1o snapshot: assume a posicao do servidor. Depois: so corrige se divergir muito
    // (reconciliacao de verdade por seq fica para a Etapa 5).
    if (!this.synced || Math.hypot(me.x - this.pos.x, me.y - this.pos.y) > 64) {
      this.pos = { x: me.x, y: me.y };
      this.synced = true;
    }
  }

  // Jogadores remotos sao desenhados ~100 ms no passado, interpolando entre snapshots.
  private renderRemotes(): void {
    const sample = this.snaps.sample(performance.now() - INTERPOLATION_DELAY_MS);
    for (const [id, p] of sample) {
      if (id === this.net?.sessionId) continue;
      let r = this.remotes.get(id);
      if (!r) {
        r = this.add.circle(p.x, p.y, PLAYER_HALF_SIZE, 0x4ea1f2).setStrokeStyle(2, 0x222222).setDepth(9);
        this.remotes.set(id, r);
      }
      r.setPosition(p.x, p.y);
    }
    for (const [id, r] of this.remotes) {
      if (!sample.has(id)) {
        r.destroy();
        this.remotes.delete(id);
      }
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
