import { formatRemaining } from "@worldzero/shared";
import Phaser from "phaser";
import type { WorldInfo, WorldStatus } from "@worldzero/shared";
import { fetchServerList, getLastWorld } from "../net/serverUrl";

const FONT = "sans-serif";
const ROW_H = 54; // alturas em unidades "sem escala": o conteudo todo e escalado por k para caber em tela pequena
const ROW_GAP = 6;
const REFRESH_MS = 5000;
const DRAG_PX = 8; // movimento menor que isto e um toque (entra no mundo); maior e rolagem da lista

const STATUS_LABEL: Record<WorldStatus, string> = { online: "ONLINE", iniciando: "INICIANDO", lotado: "LOTADO" };
const STATUS_COLOR: Record<WorldStatus, string> = { online: "#6fcf6f", iniciando: "#c9b458", lotado: "#d96b6b" };

type State = "carregando" | "ok" | "falhou";

// Etapa 13: lista de servidores (mundos). Mostra nome, regiao, jogadores/limite e status; toque numa linha entra naquele mundo.
// Mundo lotado fica desabilitado. A lista se atualiza sozinha. O ultimo mundo usado fica marcado e tem o botao CONTINUAR.
export class ServerListScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private maskGfx!: Phaser.GameObjects.Graphics;
  private bContinue!: Phaser.GameObjects.Text;
  private bRefresh!: Phaser.GameObjects.Text;
  private bBack!: Phaser.GameObjects.Text;
  private bDefault!: Phaser.GameObjects.Text;
  private servers: WorldInfo[] = [];
  private state: State = "carregando";
  private last: string | null = null;
  private scrollY = 0;
  private contentH = 0;
  private view = { top: 0, bottom: 0 };
  private k = 1;
  private down: { y: number; scroll: number; moved: boolean } | null = null;
  private loading = false;
  private notice = ""; // aviso vindo da tela anterior (ex.: servidor lotado)
  private onResize = (): void => this.layout();

  constructor() {
    super("ServerListScene");
  }

  create(data?: { notice?: string }): void {
    this.notice = data?.notice ?? "";
    this.down = null;
    this.last = getLastWorld();
    this.state = "carregando";
    this.servers = [];
    this.scrollY = 0;
    this.title = this.add.text(0, 0, "SERVIDORES", { fontFamily: FONT, fontSize: "26px", color: "#d8e6d0" }).setOrigin(0.5, 0);
    this.info = this.add.text(0, 0, "", { fontFamily: FONT, fontSize: "16px", color: "#c9b458", align: "center" }).setOrigin(0.5, 0);
    this.list = this.add.container(0, 0);
    this.maskGfx = this.make.graphics({}, false);
    this.list.setMask(this.maskGfx.createGeometryMask());
    this.bContinue = this.button("CONTINUAR", "#6fcf6f", () => this.continueLast());
    this.bRefresh = this.button("ATUALIZAR", "#6fb6f2", () => void this.refresh());
    this.bBack = this.button("VOLTAR", "#b0b8b0", () => this.scene.start("BootScene"));
    this.bDefault = this.button("ENTRAR NO SERVIDOR PADRAO", "#6fb6f2", () => this.scene.start("GameScene", { online: true }));

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.y >= this.view.top && p.y <= this.view.bottom) this.down = { y: p.y, scroll: this.scrollY, moved: false };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.down || !p.isDown) return;
      if (Math.abs(p.y - this.down.y) > DRAG_PX) this.down.moved = true;
      if (this.down.moved) this.setScroll(this.down.scroll + (this.down.y - p.y));
    });
    this.input.on("pointerup", () => {
      // solta depois do toque: o clique de linha olha `down.moved`; limpa no proximo ciclo para o clique conseguir ler
      this.time.delayedCall(0, () => (this.down = null));
    });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => this.setScroll(this.scrollY + dy));

    this.scale.on("resize", this.onResize);
    const timer = this.time.addEvent({ delay: REFRESH_MS, loop: true, callback: () => void this.refresh(true) });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onResize);
      timer.remove(false);
      this.maskGfx.destroy();
    });
    this.layout();
    void this.refresh();
  }

  private button(label: string, color: string, onTap: () => void): Phaser.GameObjects.Text {
    const t = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: "18px", color: "#0b0f0c", backgroundColor: color, padding: { x: 14, y: 9 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.on("pointerup", () => {
      if (!this.down?.moved) onTap();
    });
    return t;
  }

  private async refresh(quiet = false): Promise<void> {
    if (this.loading || (quiet && this.down)) return; // nao troca a lista no meio de um arrasto
    this.loading = true;
    if (!quiet && this.state !== "ok") {
      this.state = "carregando";
      this.layout();
    }
    const r = await fetchServerList();
    this.loading = false;
    if (!this.scene.isActive()) return; // saiu da tela enquanto carregava
    if (r) {
      this.servers = r.servers;
      this.state = "ok";
    } else if (this.state !== "ok") {
      this.state = "falhou"; // se ja tinha uma lista, mantem a ultima (uma falha rapida nao apaga a tela)
    }
    this.layout();
  }

  private join(w: WorldInfo): void {
    if (w.status === "lotado") return;
    this.scene.start("GameScene", { online: true, world: { id: w.id, name: w.name, roomId: w.roomId, seed: w.season?.seed } });
  }

  private continueLast(): void {
    const w = this.servers.find((s) => s.id === this.last);
    if (w) this.join(w);
  }

  private setScroll(v: number): void {
    const max = Math.max(0, this.contentH * this.k - (this.view.bottom - this.view.top));
    this.scrollY = Phaser.Math.Clamp(v, 0, max);
    this.list.y = this.view.top - this.scrollY;
  }

  private layout(): void {
    const { width, height } = this.scale;
    const k = Phaser.Math.Clamp(Math.min(width / 560, height / 360), 0.55, 1);
    this.k = k;

    this.title.setScale(k).setPosition(width / 2, 8 * k);
    const msg =
      this.state === "carregando"
        ? "Carregando a lista..."
        : this.state === "falhou"
          ? "Nao foi possivel carregar a lista (servidor fora do ar ou antigo)."
          : this.servers.length === 0
            ? "Nenhum servidor cadastrado."
            : this.notice || "Toque num servidor para entrar.";
    this.info
      .setText(msg)
      .setColor(this.state === "falhou" || (this.state === "ok" && this.notice) ? "#d96b6b" : "#c9b458")
      .setScale(k)
      .setWordWrapWidth((width * 0.94) / k, true)
      .setPosition(width / 2, this.title.y + this.title.displayHeight + 2 * k);

    // barra de botoes embaixo (so os que fazem sentido agora)
    const canContinue = this.state === "ok" && this.servers.some((s) => s.id === this.last && s.status !== "lotado");
    const showDefault = this.state === "falhou";
    const buttons: Phaser.GameObjects.Text[] = [];
    if (canContinue) buttons.push(this.bContinue);
    buttons.push(this.bRefresh, this.bBack);
    for (const b of [this.bContinue, this.bRefresh, this.bBack, this.bDefault]) b.setVisible(false).setScale(k);
    const barY = height - 26 * k;
    const gap = 10 * k;
    const total = buttons.reduce((n, b) => n + b.displayWidth, 0) + gap * (buttons.length - 1);
    let x = width / 2 - total / 2;
    for (const b of buttons) {
      b.setVisible(true).setPosition(x + b.displayWidth / 2, barY);
      x += b.displayWidth + gap;
    }
    let bottom = barY - 26 * k - 8 * k;
    if (showDefault) {
      this.bDefault.setVisible(true).setPosition(width / 2, bottom - 20 * k);
      bottom -= 50 * k;
    }

    this.view = { top: this.info.y + this.info.displayHeight + 8 * k, bottom: Math.max(bottom, this.info.y + 60) };
    const rw = Math.min(width * 0.94, 560);
    this.maskGfx.clear().fillStyle(0xffffff).fillRect(0, this.view.top, width, this.view.bottom - this.view.top);
    this.list.setScale(k).setPosition(width / 2 - rw / 2, this.view.top);
    this.renderRows(rw / k);
    this.setScroll(this.scrollY);
  }

  private renderRows(rowW: number): void {
    this.list.removeAll(true);
    let y = 0;
    for (const w of this.servers) {
      const full = w.status === "lotado";
      const mine = w.id === this.last;
      const bg = this.add.rectangle(0, y, rowW, ROW_H, mine ? 0x24402a : 0x18201a).setOrigin(0, 0).setStrokeStyle(2, mine ? 0x6fcf6f : 0x2c3a2f);
      const name = this.add.text(12, y + 7, `${mine ? "★ " : ""}${w.name}`, { fontFamily: FONT, fontSize: "20px", color: full ? "#8a8f8a" : "#d8e6d0" });
      const sub = this.add.text(12, y + 31, `${w.region.toUpperCase()}${mine ? "  -  ultimo servidor" : ""}${w.season ? (w.season.status === "ACTIVE" ? `  -  temporada ${w.season.n}: faltam ${formatRemaining(w.season.endsAt - w.season.now)}` : "  -  reiniciando...") : ""}`, { fontFamily: FONT, fontSize: "13px", color: "#8fa08f" });
      const count = this.add
        .text(rowW - 12, y + 7, `${w.players}/${w.capacity}`, { fontFamily: FONT, fontSize: "20px", color: full ? "#d96b6b" : "#d8e6d0" })
        .setOrigin(1, 0);
      const st = this.add.text(rowW - 12, y + 31, STATUS_LABEL[w.status], { fontFamily: FONT, fontSize: "13px", color: STATUS_COLOR[w.status] }).setOrigin(1, 0);
      this.list.add([bg, name, sub, count, st]);
      if (!full) {
        bg.setInteractive({ useHandCursor: true });
        bg.on("pointerup", (p: Phaser.Input.Pointer) => {
          // toque (nao arrasto) dentro da area visivel da lista
          if (!this.down?.moved && p.y >= this.view.top && p.y <= this.view.bottom) this.join(w);
        });
      }
      y += ROW_H + ROW_GAP;
    }
    this.contentH = Math.max(0, y - ROW_GAP);
  }
}
