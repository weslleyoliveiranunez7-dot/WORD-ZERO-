import Phaser from "phaser";
import { MenuScreen } from "../ui/MainMenu";

// Menu de servidores (Etapa 13, agora no estilo novo em ui/MainMenu.ts). Toque num servidor entra naquele mundo;
// lotado fica desabilitado; a lista se atualiza sozinha; o ultimo mundo usado fica marcado e tem CONTINUAR.
export class ServerListScene extends Phaser.Scene {
  constructor() {
    super("ServerListScene");
  }

  create(data?: { notice?: string }): void {
    this.cameras.main.setBackgroundColor("#161615");
    const menu = new MenuScreen(
      {
        join: (w) => this.scene.start("GameScene", { online: true, world: { id: w.id, name: w.name, roomId: w.roomId, seed: w.season?.seed } }),
        playDefault: () => this.scene.start("GameScene", { online: true }),
        playOffline: () => this.scene.start("GameScene"),
        back: () => this.scene.start("BootScene"),
      },
      data?.notice ?? "",
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => menu.destroy());
  }
}
