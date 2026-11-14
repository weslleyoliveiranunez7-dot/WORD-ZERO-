import Phaser from "phaser";
import {
  PLAYER_HALF_SIZE,
  createTestMap,
  inputToVelocity,
  moveWithCollision,
  type TileMap,
  type TileType,
  type Vec2,
} from "@worldzero/shared";
import { Hud } from "../ui/Hud";
import { VirtualJoystick, isTouchDevice } from "../ui/VirtualJoystick";

const TILE_COLORS: Record<TileType, number[]> = {
  grass: [0x2f5d34, 0x2a5530], // xadrez leve para o movimento ficar visivel
  wall: [0x5b5b66],
  water: [0x2b5f9e],
  tree: [0x1e4026],
};

const VISIBLE_TILES_SHORT_SIDE = 10; // quantos tiles cabem no lado menor da tela

// Etapa 2: mapa de teste, personagem temporario, colisao, camera, teclado e joystick.
export class GameScene extends Phaser.Scene {
  private map!: TileMap;
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
    this.map = createTestMap();
    this.pos = { ...this.map.spawn };

    this.drawMap();

    this.player = this.add.circle(this.pos.x, this.pos.y, PLAYER_HALF_SIZE, 0xf2c14e);
    this.player.setStrokeStyle(2, 0x222222);
    this.player.setDepth(10);

    const cam = this.cameras.main;
    cam.setBackgroundColor("#0b0f0c");
    cam.setBounds(0, 0, this.map.width * this.map.tileSize, this.map.height * this.map.tileSize);
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize);
      this.joystick?.destroy();
      this.hud.destroy();
    });
  }

  update(_time: number, delta: number): void {
    const down = (...names: string[]): number => (names.some((n) => this.keys[n]?.isDown) ? 1 : 0);
    const ix = down("d", "right") - down("a", "left") + (this.joystick?.vector.x ?? 0);
    const iy = down("s", "down") - down("w", "up") + (this.joystick?.vector.y ?? 0);

    const vel = inputToVelocity(ix, iy);
    this.pos = moveWithCollision(this.map, this.pos, vel, delta / 1000);
    this.player.setPosition(this.pos.x, this.pos.y);

    this.hudTimer += delta;
    if (this.hudTimer >= 250) {
      this.hudTimer = 0;
      const tx = Math.floor(this.pos.x / this.map.tileSize);
      const ty = Math.floor(this.pos.y / this.map.tileSize);
      const fps = Math.round(this.game.loop.actualFps);
      this.hud.setText(`FPS ${fps} | tile ${tx},${ty}`);
    }
  }

  private applyZoom(): void {
    const { width, height } = this.scale;
    const zoom = Math.min(width, height) / (this.map.tileSize * VISIBLE_TILES_SHORT_SIDE);
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.75, 3));
  }

  // Desenha todos os tiles uma unica vez num Graphics estatico (mapa pequeno de teste).
  private drawMap(): void {
    const g = this.add.graphics();
    const ts = this.map.tileSize;
    for (let ty = 0; ty < this.map.height; ty++) {
      for (let tx = 0; tx < this.map.width; tx++) {
        const type = this.map.tiles[ty * this.map.width + tx];
        const colors = TILE_COLORS[type];
        g.fillStyle(colors[(tx + ty) % colors.length], 1);
        g.fillRect(tx * ts, ty * ts, ts, ts);
        if (type === "tree") {
          g.fillStyle(0x3c7a43, 1);
          g.fillCircle(tx * ts + ts / 2, ty * ts + ts / 2, ts * 0.38);
        }
      }
    }
  }
}
