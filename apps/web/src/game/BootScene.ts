import Phaser from "phaser";
import { GAME_NAME, PROTOCOL_VERSION } from "@worldzero/shared";
import { getServerUrl } from "../net/serverUrl";

// Tela inicial: confere o servidor (opcional) e abre o mapa de teste.
export class BootScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private playButton!: Phaser.GameObjects.Text;
  private onlineButton!: Phaser.GameObjects.Text;
  private onResize = (): void => this.layout();

  constructor() {
    super("BootScene");
  }

  create(): void {
    this.title = this.add
      .text(0, 0, `${GAME_NAME}\nEtapa 4 - Multiplayer (protocolo v${PROTOCOL_VERSION})`, {
        fontFamily: "sans-serif",
        fontSize: "26px",
        color: "#d8e6d0",
        align: "center",
      })
      .setOrigin(0.5);
    this.status = this.add
      .text(0, 0, "Servidor: verificando...", { fontFamily: "sans-serif", fontSize: "18px", color: "#c9b458" })
      .setOrigin(0.5);
    this.playButton = this.add
      .text(0, 0, "JOGAR (mapa de teste)", {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: "#0b0f0c",
        backgroundColor: "#6fcf6f",
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.playButton.on("pointerdown", () => this.scene.start("GameScene"));
    this.onlineButton = this.add
      .text(0, 0, "JOGAR ONLINE", {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: "#0b0f0c",
        backgroundColor: "#6fb6f2",
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.onlineButton.on("pointerdown", () => this.scene.start("GameScene", { online: true }));

    this.layout();
    this.scale.on("resize", this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.onResize));
    void this.checkServer();
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.title.setPosition(width / 2, height / 2 - 70);
    this.status.setPosition(width / 2, height / 2 - 10);
    this.playButton.setPosition(width / 2, height / 2 + 70);
    this.onlineButton.setPosition(width / 2, height / 2 + 140);
  }

  private async checkServer(): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(`${getServerUrl().replace(/^ws/, "http")}/health`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (this.status.active) this.status.setText("Servidor: online").setColor("#6fcf6f");
    } catch {
      if (this.status.active) this.status.setText("Servidor: offline (o mapa offline funciona sem ele)").setColor("#d96b6b");
    } finally {
      clearTimeout(timer);
    }
  }
}
