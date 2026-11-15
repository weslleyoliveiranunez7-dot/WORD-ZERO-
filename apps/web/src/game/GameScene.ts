import Phaser from "phaser";
import {
  PLAYER_HALF_SIZE,
  CHUNK_SIZE,
  ChunkedWorld,
  INTERPOLATION_DELAY_MS,
  PLAYER_SPEED,
  SnapshotBuffer,
  TILE_ORDER,
  inputToVelocity,
  moveWithCollision,
  type Chunk,
  type EntityUpdateMsg,
  type TileType,
  type Vec2,
  type WorldSnapshot,
} from "@worldzero/shared";
import { Hud } from "../ui/Hud";
import { Minimap } from "../ui/Minimap";
import { NetClient } from "../net/NetClient";
import { getServerUrl } from "../net/serverUrl";
import { VirtualJoystick, isTouchDevice } from "../ui/VirtualJoystick";
import { SurvivalUi } from "../ui/SurvivalUi";

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
  private survivalUi?: SurvivalUi;
  private lootGfx?: Phaser.GameObjects.Graphics; // marcas de recurso esgotado e mochilas (so desenho)
  private actionBtn?: HTMLButtonElement;
  private attackBtn?: HTMLButtonElement;
  private mobSprites = new Map<number, Phaser.GameObjects.Arc>(); // criaturas (so desenho; posicao vem do servidor)
  private speedMul = 1; // vem do servidor (energia baixa = mais lento)
  private dead = false; // vem do servidor
  private deadIds = new Set<string>();
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
      this.survivalUi = new SurvivalUi();
      this.survivalUi.onUse = (slot) => this.net?.useItem(slot);
      this.survivalUi.onRespawn = () => this.net?.respawn();
      this.net.onPlayerState = (st) => {
        if (this.dead && !st.dead) this.synced = false; // reapareceu: assume a posicao do servidor
        this.dead = st.dead;
        this.speedMul = st.speedMul;
        this.survivalUi?.setState(st);
      };
      this.net.onEntities = (m) => this.drawEntities(m);
      this.lootGfx = this.add.graphics().setDepth(8);
      const btn = document.createElement("button");
      btn.textContent = "COLETAR";
      Object.assign(btn.style, { position: "fixed", right: "16px", bottom: "120px", width: "84px", height: "84px", borderRadius: "50%", border: "2px solid #fff", background: "#3a7d44", color: "#fff", font: "bold 12px monospace", zIndex: "16", touchAction: "manipulation" });
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.net?.interact();
      });
      document.body.appendChild(btn);
      this.actionBtn = btn;
      const atk = document.createElement("button");
      atk.textContent = "ATACAR";
      Object.assign(atk.style, { position: "fixed", right: "108px", bottom: "56px", width: "76px", height: "76px", borderRadius: "50%", border: "2px solid #fff", background: "#a63a3a", color: "#fff", font: "bold 12px monospace", zIndex: "16", touchAction: "manipulation" });
      atk.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.net?.attack();
      });
      document.body.appendChild(atk);
      this.attackBtn = atk;
      this.net.onInventory = (m) => this.survivalUi?.setInventory(m);
      this.net.connect().catch(() => undefined); // o erro fica em net.lastError e aparece no HUD
    }
    this.minimap = new Minimap(this.world);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize);
      this.joystick?.destroy();
      this.hud.destroy();
      this.minimap.destroy();
      this.survivalUi?.destroy();
      this.actionBtn?.remove();
      this.attackBtn?.remove();
      this.mobSprites.forEach((m) => m.destroy());
      this.mobSprites.clear();
      this.net?.close();
      this.remotes.forEach((r) => r.destroy());
      this.remotes.clear();
      this.chunkImgs.forEach((_img, k) => this.removeChunk(k));
      this.chunkImgs.clear();
    });
  }

  update(_time: number, delta: number): void {
    const down = (...names: string[]): number => (names.some((n) => this.keys[n]?.isDown) ? 1 : 0);
    let ix = down("d", "right") - down("a", "left") + (this.joystick?.vector.x ?? 0);
    let iy = down("s", "down") - down("w", "up") + (this.joystick?.vector.y ?? 0);
    if (this.dead) ix = iy = 0; // morto nao anda (o servidor tambem nao deixa)

    const vel = inputToVelocity(ix, iy, PLAYER_SPEED * this.speedMul);
    this.pos = moveWithCollision(this.world, this.pos, vel, delta / 1000);
    this.player.setPosition(this.pos.x, this.pos.y);
    this.player.setVisible(!this.dead);
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
    // no maximo ~30 mensagens/s (o servidor limita a frequencia e expulsa quem exagera)
    if (((cx !== this.lastIx || cy !== this.lastIy) && this.inputTimer >= 33) || this.inputTimer >= 50) {
      this.lastIx = cx;
      this.lastIy = cy;
      this.inputTimer = 0;
      this.net?.sendInput({ seq: ++this.seq, ix: cx, iy: cy });
    }
  }

  private onSnapshot(snap: WorldSnapshot): void {
    this.snaps.push(performance.now(), snap);
    this.drawMobs(snap);
    this.deadIds = new Set(snap.players.filter((p) => p.dead).map((p) => p.id));
    const me = snap.players.find((p) => p.id === this.net?.sessionId);
    if (!me) return;
    // 1o snapshot: assume a posicao do servidor. Depois: so corrige se divergir muito
    // (reconciliacao de verdade por seq fica para a Etapa 5).
    // Tolera atraso de rede: ate 96 px de diferenca nao corrige (o servidor so "enxerga" onde voce ja esteve).
    // Entre 96 e 200 px puxa aos poucos (sem pulo); acima disso (parede, reaparecer) assume o servidor.
    const d = Math.hypot(me.x - this.pos.x, me.y - this.pos.y);
    if (!this.synced || d > 200) {
      this.pos = { x: me.x, y: me.y };
      this.synced = true;
    } else if (d > 96) {
      this.pos = { x: this.pos.x + (me.x - this.pos.x) * 0.25, y: this.pos.y + (me.y - this.pos.y) * 0.25 };
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
      r.setVisible(!this.deadIds.has(id));
    }
    for (const [id, r] of this.remotes) {
      if (!sample.has(id)) {
        r.destroy();
        this.remotes.delete(id);
      }
    }
  }

  // Recurso esgotado = tile escurecido com X; mochila = quadrado marrom. O servidor decide; aqui so desenha.
  private drawEntities(m: EntityUpdateMsg): void {
    const g = this.lootGfx;
    if (!g) return;
    const ts = this.world.tileSize;
    g.clear();
    g.fillStyle(0x000000, 0.55);
    g.lineStyle(2, 0xaaaaaa, 0.9);
    for (const k of m.depleted) {
      const [tx, ty] = k.split(",").map(Number);
      g.fillRect(tx * ts, ty * ts, ts, ts);
      g.lineBetween(tx * ts + 6, ty * ts + 6, tx * ts + ts - 6, ty * ts + ts - 6);
      g.lineBetween(tx * ts + ts - 6, ty * ts + 6, tx * ts + 6, ty * ts + ts - 6);
    }
    for (const d of m.drops) {
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(d.x - 9, d.y - 9, 18, 18);
      g.lineStyle(2, 0xffd36b, 1);
      g.strokeRect(d.x - 9, d.y - 9, 18, 18);
    }
  }

  // Zumbi = vermelho, cervo = marrom claro. Anda suave ate a posicao do servidor; anel mais fino = menos vida.
  private drawMobs(snap: WorldSnapshot): void {
    const seen = new Set<number>();
    for (const m of snap.mobs ?? []) {
      seen.add(m.id);
      let s = this.mobSprites.get(m.id);
      if (!s) {
        s = this.add.circle(m.x, m.y, m.k === 0 ? 11 : 9, m.k === 0 ? 0xc0392b : 0xc8a165).setDepth(9);
        this.mobSprites.set(m.id, s);
      }
      s.setPosition(s.x + (m.x - s.x) * 0.5, s.y + (m.y - s.y) * 0.5);
      s.setStrokeStyle(Math.max(1, Math.round((m.hp / 100) * 4)), 0xffffff);
    }
    for (const [id, s] of this.mobSprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.mobSprites.delete(id);
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
