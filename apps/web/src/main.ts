import Phaser from "phaser";
import { BootScene } from "./game/BootScene";
import { GameScene } from "./game/GameScene";
import { setupLandscape } from "./ui/landscape";

setupLandscape();

new Phaser.Game({
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
