import Phaser from "phaser";
import { GAME_NAME, PROTOCOL_VERSION } from "@worldzero/shared";

const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? "http://localhost:2567";

// Etapa 1: tela simples que prova (1) o cliente abre e (2) consegue falar com o servidor.
export class BootScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("BootScene");
  }

  create(): void {
    this.title = this.add
      .text(0, 0, `${GAME_NAME}\nEtapa 1 - Fundacao (protocolo v${PROTOCOL_VERSION})`, {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: "#d8e6d0",
        align: "center",
      })
      .setOrigin(0.5);
    this.status = this.add
      .text(0, 0, "Servidor: verificando...", { fontFamily: "sans-serif", fontSize: "20px", color: "#c9b458" })
      .setOrigin(0.5);

    this.layout();
    this.scale.on("resize", () => this.layout());
    void this.checkServer();
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.title.setPosition(width / 2, height / 2 - 30);
    this.status.setPosition(width / 2, height / 2 + 40);
  }

  private async checkServer(): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(`${SERVER_URL}/health`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.status.setText("Servidor: online").setColor("#6fcf6f");
    } catch {
      this.status.setText("Servidor: offline (inicie com pnpm dev:server)").setColor("#d96b6b");
    } finally {
      clearTimeout(timer);
    }
  }
}
