import Phaser from "phaser";
import { TitleScreen } from "../ui/MainMenu";

// Tela inicial: so a logo e "toque para comecar". Ao tocar abre o menu de servidores (ServerListScene).
// A tela em si e DOM (ui/MainMenu.ts); a cena so a liga e desliga.
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#000000");
    const title = new TitleScreen(() => this.scene.start("ServerListScene"));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => title.destroy());
  }
}
