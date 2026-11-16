import Phaser from "phaser";
import {
  BUILD_REACH,
  type StructureUpdateMsg,
  CHUNK_SIZE,
  ChunkedWorld,
  INTERPOLATION_DELAY_MS,
  ITEMS,
  PLAYER_SPEED,
  SnapshotBuffer,
  dayPeriod,
  formatClock,
  TILE_ORDER,
  inputToVelocity,
  moveWithCollision,
  type Chunk,
  type CombatEventMsg,
  type EntityUpdateMsg,
  type Vec2,
  type WorldSnapshot,
} from "@worldzero/shared";
import { formatRemaining, type SeasonStatus, type SeasonUpdateMsg } from "@worldzero/shared";
import { Hud } from "../ui/Hud";
import { uiRoot } from "../ui/landscape";
import { Minimap } from "../ui/Minimap";
import { NetClient, type WorldChoice } from "../net/NetClient";
import { getServerUrl } from "../net/serverUrl";
import { VirtualJoystick, isTouchDevice } from "../ui/VirtualJoystick";
import { SurvivalUi } from "../ui/SurvivalUi";
import { BuildUi } from "../ui/BuildUi";
import {
  CHAR_ME,
  CHAR_OTHER,
  MOB_DEER,
  MOB_ZOMBIE,
  drawBackpack,
  drawChestPiece,
  drawDoorPiece,
  drawFloorPiece,
  drawRoofPiece,
  drawRubbleTile,
  drawStumpTile,
  drawTile,
  drawWallPiece,
  drawWindowPiece,
  ensureCharacterTextures,
  ensureMobTextures,
} from "./sprites";
import { DayNight } from "./daylight";

const VISIBLE_TILES_SHORT_SIDE = 10; // quantos tiles cabem no lado menor da tela

// Etapa 3: mundo em chunks (gerados por seed), carrega os proximos e descarrega os distantes.
export class GameScene extends Phaser.Scene {
  private world!: ChunkedWorld;
  private chunkImgs = new Map<number, Phaser.GameObjects.Image>();
  private lastChunk = "";
  private minimap!: Minimap;
  // rede (so no modo online)
  private net?: NetClient;
  private season?: { n: number; status: SeasonStatus; localEnd: number }; // Etapa 14: relogio da temporada (so mostra o que o servidor mandou)
  private seasonEnding = false;
  private worldName = ""; // Etapa 13: servidor escolhido na lista (vazio = servidor padrao)
  private snaps = new SnapshotBuffer();
  private remotes = new Map<string, Phaser.GameObjects.Image>();
  private synced = false;
  private survivalUi?: SurvivalUi;
  private lootGfx?: Phaser.GameObjects.Graphics; // marcas de recurso esgotado e mochilas (so desenho)
  private actionBtn?: HTMLButtonElement;
  // Etapa 11: estruturas (so desenho + colisao para a previsao local; o servidor e quem decide tudo)
  private buildUi?: BuildUi;
  private structGfx?: Phaser.GameObjects.Graphics;
  private roofGfx?: Phaser.GameObjects.Graphics;
  private roofFadeKey = ""; // grupo de telhado em que o jogador esta (fica transparente para ver o interior)
  private ghostGfx?: Phaser.GameObjects.Graphics;
  private structRows: StructureUpdateMsg["rows"] = [];
  private structSolid = new Set<number>();
  private nearStruct: { tx: number; ty: number; kind: "door" | "chest" } | null = null;
  private chestAt: { tx: number; ty: number } | null = null;
  private lastDir = { x: 0, y: 1 }; // ultima direcao andada: define o tile "a frente" onde se constroi
  private attackBtn?: HTMLButtonElement;
  private mobSprites = new Map<number, Phaser.GameObjects.Image>();
  private mobHpGfx?: Phaser.GameObjects.Graphics; // barrinhas de vida das criaturas (so desenho)
  // criaturas (so desenho; posicao vem do servidor)
  private fxCount = 0; // efeitos de combate ao mesmo tempo (limite: protege o A04)
  private weaponCooldownMs = 700;
  private speedMul = 1; // vem do servidor (energia baixa = mais lento)
  private dead = false; // vem do servidor
  private deadIds = new Set<string>();
  private seq = 0;
  private lastIx = 0;
  private lastIy = 0;
  private inputTimer = 0;
  private pos!: Vec2;
  private player!: Phaser.GameObjects.Image;
  private walkT = 0; // relogio so da animacao de andar
  private dayNight?: DayNight;
  private clockEl?: HTMLDivElement;
  private torchBtn?: HTMLButtonElement;
  private torchKey?: Phaser.Input.Keyboard.Key;
  private torchOn = true; // jogador quer a tocha acesa
  private litOthers: { x: number; y: number }[] = []; // outros jogadores com tocha acesa (o servidor decide)
  private hasTorch = true; // tem tocha no inventario (offline: sempre, para testar)
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick?: VirtualJoystick;
  private hud!: Hud;
  private hudTimer = 0;
  private onResize = (): void => this.applyZoom();

  constructor() {
    super("GameScene");
  }

  // Etapa 14: relogio e alertas da temporada. Se o mapa que o cliente gerou nao e o da temporada do servidor (lista velha, wipe no meio),
  // reinicia a cena UMA vez com a seed certa.
  private onSeason(m: SeasonUpdateMsg, data?: { online?: boolean; world?: WorldChoice; seed?: number }): void {
    if (m.seed !== this.world.seed && data?.seed !== m.seed) {
      this.scene.restart({ online: true, world: data?.world, seed: m.seed });
      return;
    }
    this.season = { n: m.n, status: m.status, localEnd: Date.now() + (m.endsAt - m.now) }; // tempo restante pelo relogio do servidor
    if (m.alert !== undefined) this.buildUi?.showNotice(`Temporada ${m.n}: faltam ${formatRemaining(m.alert)} para o fim e o wipe`);
    if (m.status !== "ACTIVE" && !this.seasonEnding) {
      this.seasonEnding = true;
      this.buildUi?.showNotice("A temporada acabou! O mundo sera reiniciado.");
    }
  }

  create(data?: { online?: boolean; world?: WorldChoice; seed?: number }): void {
    this.world = new ChunkedWorld(data?.seed ?? data?.world?.seed); // Etapa 14: o mapa e o da temporada do servidor (sem seed: mapa de teste)
    this.season = undefined;
    this.seasonEnding = false;
    this.pos = { ...this.world.spawn };
    this.syncChunks();

    ensureCharacterTextures(this);
    ensureMobTextures(this);
    this.player = this.add.image(this.pos.x, this.pos.y, CHAR_ME).setOrigin(0.5, 0.68).setDepth(10);
    this.dayNight = new DayNight(this);

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
    this.clockEl = document.createElement("div");
    this.clockEl.dataset.ui = "clock";
    Object.assign(this.clockEl.style, { position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)", color: "#fff", font: "bold 14px monospace", background: "rgba(0,0,0,0.5)", padding: "4px 10px", borderRadius: "12px", pointerEvents: "none", zIndex: "20", whiteSpace: "nowrap" });
    uiRoot().appendChild(this.clockEl);
    const tb = document.createElement("button");
    tb.textContent = "TOCHA";
    tb.dataset.ui = "torch";
    Object.assign(tb.style, { position: "fixed", right: "108px", bottom: "140px", width: "60px", height: "60px", borderRadius: "50%", border: "2px solid #fff", background: "#b5651d", color: "#fff", font: "bold 11px monospace", zIndex: "16", touchAction: "manipulation" });
    tb.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.toggleTorch();
    });
    uiRoot().appendChild(tb);
    this.torchBtn = tb;
    this.torchKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.torchOn = true;
    this.hasTorch = !data?.online; // online: so com uma tocha no inventario (fabricada); offline: sempre, para testar
    this.refreshTorchBtn();
    if (data?.online) {
      this.worldName = data.world?.name ?? "";
      this.net = new NetClient(getServerUrl(), data.world);
      this.net.onSnapshot = (snap) => this.onSnapshot(snap);
      this.net.onSeason = (m) => this.onSeason(m, data);
      this.survivalUi = new SurvivalUi();
      this.survivalUi.onUse = (slot) => this.net?.useItem(slot);
      this.survivalUi.onRespawn = () => this.net?.respawn();
      this.survivalUi.onCraft = (recipe) => this.net?.craft(recipe);
      this.net.onPlayerState = (st) => {
        if (this.dead && !st.dead) this.synced = false; // reapareceu: assume a posicao do servidor
        this.dead = st.dead;
        this.speedMul = st.speedMul;
        this.weaponCooldownMs = st.weapon ? (ITEMS[st.weapon]?.weapon?.cooldownMs ?? 700) : 700;
        this.survivalUi?.setState(st);
      };
      this.net.onEntities = (m) => this.drawEntities(m);
      this.net.onCombat = (ev) => this.onCombat(ev);
      this.lootGfx = this.add.graphics().setDepth(8);
      const btn = document.createElement("button");
      btn.textContent = "COLETAR";
      btn.dataset.ui = "collect";
      Object.assign(btn.style, { position: "fixed", right: "16px", bottom: "120px", width: "84px", height: "84px", borderRadius: "50%", border: "2px solid #fff", background: "#3a7d44", color: "#fff", font: "bold 12px monospace", zIndex: "16", touchAction: "manipulation" });
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.net?.interact();
      });
      uiRoot().appendChild(btn);
      this.actionBtn = btn;
      const atk = document.createElement("button");
      atk.textContent = "ATACAR";
      atk.dataset.ui = "attack";
      Object.assign(atk.style, { position: "fixed", right: "108px", bottom: "56px", width: "76px", height: "76px", borderRadius: "50%", border: "2px solid #fff", background: "#a63a3a", color: "#fff", font: "bold 12px monospace", zIndex: "16", touchAction: "manipulation" });
      atk.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.net?.attack();
        atk.style.opacity = "0.55"; // so cosmetico: o servidor e quem aplica a recarga
        window.setTimeout(() => (atk.style.opacity = "1"), this.weaponCooldownMs);
      });
      uiRoot().appendChild(atk);
      this.attackBtn = atk;
      this.net.onInventory = (m) => {
        this.survivalUi?.setInventory(m);
        this.hasTorch = m.slots.some((s) => s?.id === "torch");
        this.refreshTorchBtn();
        this.buildUi?.setInventory(m.slots);
      };
      this.structGfx = this.add.graphics().setDepth(7);
      this.ghostGfx = this.add.graphics().setDepth(8);
      this.roofGfx = this.add.graphics().setDepth(20); // telhado fica POR CIMA do jogador
      this.buildUi = new BuildUi();
      this.buildUi.onPlace = (piece) => {
        const t = this.frontTile();
        this.net?.build(piece, t.tx, t.ty);
      };
      this.buildUi.onToggle = () => {
        if (this.nearStruct) this.net?.toggleStructure(this.nearStruct.tx, this.nearStruct.ty);
      };
      this.buildUi.onRepair = () => {
        const t = this.frontTile();
        this.net?.repair(t.tx, t.ty);
      };
      this.buildUi.onTrust = () => this.net?.trust();
      this.net.onNotice = (m) => this.buildUi?.showNotice(m.text);
      this.buildUi.onMove = (op, slot) => {
        if (this.chestAt) this.net?.moveChest(op, this.chestAt.tx, this.chestAt.ty, slot);
      };
      this.net.onStructures = (m) => this.setStructures(m);
      this.net.onChest = (m) => {
        this.chestAt = { tx: m.tx, ty: m.ty };
        this.buildUi?.setChest(m);
      };
      this.net.connect().catch(() => {
        // o erro fica em net.lastError e aparece no HUD. Servidor lotado: volta para a lista (com aviso) para escolher outro.
        const net = this.net;
        if (net?.lastErrorFull && data.world) this.time.delayedCall(1200, () => this.scene.start("ServerListScene", { notice: `${data.world?.name ?? "Servidor"} esta lotado. Escolha outro.` }));
      });
    }
    this.minimap = new Minimap(this.world);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize);
      this.joystick?.destroy();
      this.hud.destroy();
      this.minimap.destroy();
      this.survivalUi?.destroy();
      this.buildUi?.destroy();
      this.world.extraSolid = null;
      this.actionBtn?.remove();
      this.attackBtn?.remove();
      this.dayNight?.destroy();
      this.dayNight = undefined;
      this.clockEl?.remove();
      this.torchBtn?.remove();
      this.mobSprites.forEach((m) => m.destroy());
      this.mobSprites.clear();
      this.mobHpGfx = undefined; // o Graphics morre junto com a cena; recria na proxima
      this.net?.close();
      this.remotes.forEach((r) => r.destroy());
      this.remotes.clear();
      this.chunkImgs.forEach((_img, k) => this.removeChunk(k));
      this.chunkImgs.clear();
    });
  }

  // Tile a frente do jogador (so uma SUGESTAO enviada como intencao; o servidor confere alcance, terreno, dono e recursos).
  private frontTile(): { tx: number; ty: number } {
    const ts = this.world.tileSize;
    return { tx: Math.floor(this.pos.x / ts) + this.lastDir.x, ty: Math.floor(this.pos.y / ts) + this.lastDir.y };
  }

  private setStructures(m: StructureUpdateMsg): void {
    this.structRows = m.rows;
    this.structSolid.clear();
    for (const [tx, ty, , top] of m.rows) if (top === 1 || top === 2 || top === 4 || top === 5) this.structSolid.add(ty * this.world.width + tx);
    this.world.extraSolid = (tx, ty) => this.structSolid.has(ty * this.world.width + tx); // previsao local igual a do servidor
    const g = this.structGfx;
    if (!g) return;
    const ts = this.world.tileSize;
    g.clear();
    for (const [tx, ty, floor, top, mine] of m.rows) {
      const x = tx * ts;
      const y = ty * ts;
      if (floor) drawFloorPiece(g, x, y, ts);
      if (top === 1) drawWallPiece(g, x, y, ts);
      if (top === 2) drawDoorPiece(g, x, y, ts, false);
      if (top === 3) drawDoorPiece(g, x, y, ts, true);
      if (top === 4) drawChestPiece(g, x, y, ts);
      if (top === 5) drawWindowPiece(g, x, y, ts);
      if (mine === 1) g.lineStyle(2, 0x7bdc65, 0.9).strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      if (mine === 2) g.lineStyle(2, 0x65b8dc, 0.9).strokeRect(x + 1, y + 1, ts - 2, ts - 2); // acesso liberado pelo dono
    }
    this.roofFadeKey = "?"; // forca redesenhar o telhado
    this.drawRoofs();
  }

  // Telhado: opaco por cima de tudo; o grupo conectado em que o jogador esta fica quase transparente (para ver o interior).
  private drawRoofs(): void {
    const g = this.roofGfx;
    if (!g) return;
    const ts = this.world.tileSize;
    const roofs = new Set<number>();
    for (const [tx, ty, , , , roof] of this.structRows) if (roof) roofs.add(ty * this.world.width + tx);
    const me = Math.floor(this.pos.y / ts) * this.world.width + Math.floor(this.pos.x / ts);
    const group = new Set<number>();
    if (roofs.has(me)) {
      const stack = [me];
      while (stack.length > 0) {
        const k = stack.pop()!;
        if (group.has(k) || !roofs.has(k)) continue;
        group.add(k);
        stack.push(k + 1, k - 1, k + this.world.width, k - this.world.width);
      }
    }
    const key = [...group].sort((a, b) => a - b).join(",") + "|" + roofs.size;
    if (key === this.roofFadeKey) return;
    this.roofFadeKey = key;
    g.clear();
    for (const k of roofs) {
      const x = (k % this.world.width) * ts;
      const y = Math.floor(k / this.world.width) * ts;
      drawRoofPiece(g, x, y, ts, group.has(k) ? 0.2 : 0.95);
    }
  }

  // Sombra do tile a frente (com o painel CONSTRUIR aberto), botao PORTA/BAU perto de peca minha, bau fecha ao se afastar.
  private updateBuildHints(): void {
    const ts = this.world.tileSize;
    this.drawRoofs();
    const gh = this.ghostGfx;
    if (gh) {
      gh.clear();
      if (this.buildUi?.panelOpen && !this.dead) {
        const t = this.frontTile();
        gh.lineStyle(2, 0xffffff, 0.8).strokeRect(t.tx * ts + 1, t.ty * ts + 1, ts - 2, ts - 2);
      }
    }
    let best: { tx: number; ty: number; kind: "door" | "chest" } | null = null;
    let bestD = BUILD_REACH;
    for (const [tx, ty, , top, mine] of this.structRows) {
      if (!mine || (top !== 2 && top !== 3 && top !== 4)) continue; // mine: 1 dono, 2 acesso liberado (o servidor confere)
      const d = Math.hypot(this.pos.x - (tx + 0.5) * ts, this.pos.y - (ty + 0.5) * ts);
      if (d <= bestD) {
        bestD = d;
        best = { tx, ty, kind: top === 4 ? "chest" : "door" };
      }
    }
    this.nearStruct = best;
    this.buildUi?.setNear(this.dead ? null : (best?.kind ?? null));
    if (this.chestAt) {
      const d = Math.hypot(this.pos.x - (this.chestAt.tx + 0.5) * ts, this.pos.y - (this.chestAt.ty + 0.5) * ts);
      if (d > BUILD_REACH || this.dead) {
        this.chestAt = null;
        this.buildUi?.setChest(null);
      }
    }
  }

  update(_time: number, delta: number): void {
    const down = (...names: string[]): number => (names.some((n) => this.keys[n]?.isDown) ? 1 : 0);
    let ix = down("d", "right") - down("a", "left") + (this.joystick?.vector.x ?? 0);
    let iy = down("s", "down") - down("w", "up") + (this.joystick?.vector.y ?? 0);
    if (this.dead) ix = iy = 0; // morto nao anda (o servidor tambem nao deixa)

    if (ix !== 0 || iy !== 0) this.lastDir = Math.abs(ix) >= Math.abs(iy) ? { x: Math.sign(ix), y: 0 } : { x: 0, y: Math.sign(iy) };
    const vel = inputToVelocity(ix, iy, PLAYER_SPEED * this.speedMul);
    this.pos = moveWithCollision(this.world, this.pos, vel, delta / 1000);
    this.player.setPosition(this.pos.x, this.pos.y);
    this.player.setVisible(!this.dead);
    if (ix !== 0 || iy !== 0) {
      this.walkT += delta;
      this.player.setAngle(Math.sin(this.walkT / 80) * 7); // balanca ao andar
    } else {
      this.walkT = 0;
      this.player.setAngle(0);
    }
    if (this.torchKey && Phaser.Input.Keyboard.JustDown(this.torchKey)) this.toggleTorch();
    this.dayNight?.update(Date.now(), this.pos.x, this.pos.y, this.dead, this.hasTorch && this.torchOn, this.player.angle, this.litOthers);
    this.syncChunks();
    if (this.net) {
      this.updateBuildHints();
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
      const net = this.net ? ` | ${this.worldName ? this.worldName + " " : ""}${this.net.status}${this.net.lastError ? " (" + this.net.lastError.slice(0, 40) + ")" : ""} ${this.remotes.size + (this.synced ? 1 : 0)} jog.` : "";
      if (this.seasonEnding && this.net?.status === "desconectado") {
        this.scene.start("ServerListScene", { notice: "A temporada acabou e o mundo foi reiniciado. Escolha onde jogar." }); // fim definitivo: volta para a lista
        return;
      }
      const sea = this.season ? ` | T${this.season.n} ${this.season.status === "ACTIVE" ? formatRemaining(this.season.localEnd - Date.now()) : "ENCERRADA"}` : "";
      this.hud.setText(`FPS ${fps} | tile ${tx},${ty} | chunk ${cx},${cy} | ${this.world.loadedCount} carregados${net}${sea}`);
      this.minimap.update(this.pos.x, this.pos.y);
      if (this.clockEl && this.dayNight) {
        const mins = this.dayNight.gameMinutes;
        const p = dayPeriod(mins);
        const h = mins / 60;
        const icon = h >= 6 && h < 18 ? "\u2600" : "\u263E"; // sol de dia, lua de noite
        this.clockEl.textContent = `${icon} ${formatClock(mins)} - ${p === "manha" ? "manh\u00e3" : p}`;
      }
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
    this.litOthers = [];
    for (const [id, p] of sample) {
      if (id === this.net?.sessionId) continue;
      if (p.torch && !this.deadIds.has(id)) this.litOthers.push({ x: p.x, y: p.y });
      let r = this.remotes.get(id);
      if (!r) {
        r = this.add.image(p.x, p.y, CHAR_OTHER).setOrigin(0.5, 0.68).setDepth(9);
        this.remotes.set(id, r);
      }
      if (Math.hypot(p.x - r.x, p.y - r.y) > 0.3) r.setAngle(Math.sin(performance.now() / 80) * 7);
      else r.setAngle(0);
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

  // Recurso esgotado: arvore vira toco e pedra vira cascalho; mochila = desenho de mochila. O servidor decide; aqui so desenha.
  private drawEntities(m: EntityUpdateMsg): void {
    const g = this.lootGfx;
    if (!g) return;
    const ts = this.world.tileSize;
    g.clear();
    for (const k of m.depleted) {
      const [tx, ty] = k.split(",").map(Number);
      const type = this.world.tileAt(tx, ty);
      if (type === "tree") drawStumpTile(g, tx, ty, ts);
      else if (type === "wall") drawRubbleTile(g, tx, ty, ts);
    }
    for (const d of m.drops) drawBackpack(g, d.x, d.y);
  }

  // Etapa 9: feedback do combate. So DESENHO a partir do que o servidor mandou (COMBAT_EVENT); nada aqui calcula dano ou vida.
  private onCombat(ev: CombatEventMsg): void {
    if (this.fxCount > 30) return;
    const mineHit = ev.victim !== undefined && ev.victim === this.net?.sessionId;
    const mineAttack = ev.attacker === this.net?.sessionId;
    const rise = (text: string, color: string, size: number, ms: number): void => {
      const t = this.add.text(ev.x, ev.y - 14, text, { fontFamily: "monospace", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 3 }).setOrigin(0.5).setDepth(30);
      this.fxCount++;
      this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: ms, onComplete: () => { t.destroy(); this.fxCount--; } });
    };
    const ring = (radius: number, color: number, alpha: number, ms: number): void => {
      const c = this.add.circle(ev.x, ev.y, radius, color, alpha).setDepth(29);
      this.fxCount++;
      this.tweens.add({ targets: c, scale: 1.7, alpha: 0, duration: ms, onComplete: () => { c.destroy(); this.fxCount--; } });
    };
    if (ev.kind === "miss") {
      ring(12, 0xffffff, 0.25, 160); // golpe no ar (so mostra de quem foi: no proprio personagem ou no de outro)
      return;
    }
    if (ev.kind === "hit") {
      ring(10, 0xffffff, 0.8, 180);
      rise(`-${ev.damage ?? "?"}`, mineHit ? "#ff3b3b" : "#ffd84a", 14, 650);
      if (mineHit) this.cameras.main.flash(120, 170, 0, 0);
      if (mineAttack && "vibrate" in navigator) navigator.vibrate(15);
      return;
    }
    ring(16, 0xff3b3b, 0.7, 320);
    rise("MORTE", "#ff5555", 16, 900);
  }

  // Zumbi e cervo: anda suave ate a posicao do servidor; a barrinha de vida em cima mostra quanta vida resta.
  private drawMobs(snap: WorldSnapshot): void {
    const seen = new Set<number>();
    const hg = (this.mobHpGfx ??= this.add.graphics().setDepth(11));
    hg.clear();
    for (const m of snap.mobs ?? []) {
      seen.add(m.id);
      let s = this.mobSprites.get(m.id);
      if (!s) {
        s = this.add.image(m.x, m.y, m.k === 0 ? MOB_ZOMBIE : MOB_DEER).setOrigin(0.5, 0.68).setDepth(9);
        this.mobSprites.set(m.id, s);
      }
      const dx = m.x - s.x;
      const nx = s.x + dx * 0.5;
      const ny = s.y + (m.y - s.y) * 0.5;
      const moving = Math.hypot(m.x - s.x, m.y - s.y) > 0.6;
      if (m.k !== 0 && Math.abs(dx) > 0.6) s.setFlipX(dx < 0); // cervo olha para onde anda
      s.setAngle(moving && m.k === 0 ? Math.sin(performance.now() / 110) * 6 : 0); // zumbi cambaleia
      s.setPosition(nx, ny);
      const frac = Math.max(0, Math.min(1, m.hp / 100));
      hg.fillStyle(0x000000, 0.6).fillRect(nx - 10, ny - 24, 20, 4);
      hg.fillStyle(frac > 0.5 ? 0x6fcf6f : frac > 0.25 ? 0xe0b030 : 0xd94a4a, 1).fillRect(nx - 9, ny - 23, 18 * frac, 2);
    }
    for (const [id, s] of this.mobSprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.mobSprites.delete(id);
      }
    }
  }

  private toggleTorch(): void {
    if (!this.hasTorch) return;
    this.torchOn = !this.torchOn;
    this.net?.setTorch(this.torchOn);
    this.refreshTorchBtn();
  }

  private refreshTorchBtn(): void {
    if (!this.torchBtn) return;
    this.torchBtn.style.display = this.hasTorch ? "block" : "none";
    this.torchBtn.style.background = this.torchOn ? "#d9822b" : "#4a4a4a";
    this.torchBtn.textContent = this.torchOn ? "TOCHA ON" : "TOCHA OFF";
  }

  private applyZoom(): void {
    const { width, height } = this.scale;
    const zoom = Math.min(width, height) / (this.world.tileSize * VISIBLE_TILES_SHORT_SIDE);
    const z = Phaser.Math.Clamp(zoom, 0.75, 3);
    this.cameras.main.setZoom(z);
    this.dayNight?.resize(z);
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
        drawTile(g, type, lx, ly, gx, gy, ts);
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
