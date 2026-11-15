import Phaser from "phaser";
import { BootScene } from "./game/BootScene";
import { GameScene } from "./game/GameScene";
import { setupLandscape } from "./ui/landscape";

let game: Phaser.Game | undefined;

// A area de jogo (#stage) e medida em pixels; sempre que ela muda, o Phaser e avisado.
setupLandscape((w, h) => {
  if (!game) return;
  game.scale.resize(w, h);
  game.scale.refresh();
});

game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0f0c",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  render: { antialias: false, pixelArt: true, powerPreference: "high-performance" },
  scene: [BootScene, GameScene],
});
