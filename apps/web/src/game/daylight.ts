import Phaser from "phaser";
import { gameMinutesAt, skyAt } from "@worldzero/shared";

// Escuridao da noite + luz da tocha. So DESENHO: o horario vem de uma funcao do relogio (shared/daynight) e a luz
// nao muda nenhuma regra de jogo. A camada escura e uma RenderTexture com um "buraco" suave onde a luz alcanca.

const LIGHT_KEY = "wz-light";
const TORCH_KEY = "wz-torch";
const LIGHT_SIZE = 256;
const AMBIENT_RADIUS = 34; // sem tocha: da para ver so o proprio personagem
const TORCH_RADIUS = 175;

export class DayNight {
  private rt: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image; // o "borrador": nao aparece, so apaga a escuridao
  private glow: Phaser.GameObjects.Image; // brilho laranja ao redor da tocha
  private torch: Phaser.GameObjects.Image; // a tocha na mao
  private minutes = 0;
  private otherTorches: Phaser.GameObjects.Image[] = []; // tochas na mao de outros jogadores (reaproveitadas)
  private otherGlows: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists(LIGHT_KEY)) {
      const tex = scene.textures.createCanvas(LIGHT_KEY, LIGHT_SIZE, LIGHT_SIZE);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(LIGHT_SIZE / 2, LIGHT_SIZE / 2, 0, LIGHT_SIZE / 2, LIGHT_SIZE / 2, LIGHT_SIZE / 2);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.45, "rgba(255,255,255,0.85)");
        grad.addColorStop(0.75, "rgba(255,255,255,0.35)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, LIGHT_SIZE, LIGHT_SIZE);
        tex.refresh();
      }
    }
    if (!scene.textures.exists(TORCH_KEY)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x7a5230, 1);
      g.fillRect(3, 7, 3, 10); // cabo
      g.fillStyle(0x3a2a1a, 1);
      g.fillRect(2, 6, 5, 3); // pano enrolado
      g.fillStyle(0xff7a1a, 1);
      g.fillEllipse(4.5, 4, 7, 9); // chama
      g.fillStyle(0xffc247, 1);
      g.fillEllipse(4.5, 4.5, 4, 6);
      g.fillStyle(0xfff0a0, 1);
      g.fillEllipse(4.5, 5, 2, 3);
      g.generateTexture(TORCH_KEY, 9, 18);
      g.destroy();
    }
    this.rt = scene.add.renderTexture(0, 0, 16, 16).setOrigin(0.5).setScrollFactor(0).setDepth(25).setVisible(false);
    this.stamp = scene.make.image({ key: LIGHT_KEY }, false);
    this.glow = scene.add.image(0, 0, LIGHT_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040).setDepth(26).setVisible(false);
    this.torch = scene.add.image(0, 0, TORCH_KEY).setOrigin(0.5, 0.9).setDepth(11).setVisible(false);
  }

  get gameMinutes(): number {
    return this.minutes;
  }

  // A camera usa zoom em torno do centro da tela. A camada escura tem tamanho (tela / zoom) e fica no centro:
  // assim ela cobre a tela inteira e a posicao dentro dela e simplesmente "mundo - centro da camera".
  resize(zoom: number): void {
    const { width, height } = this.scene.scale;
    this.rt.setPosition(width / 2, height / 2);
    this.rt.resize(Math.ceil(width / zoom) + 4, Math.ceil(height / zoom) + 4);
  }

  update(nowMs: number, px: number, py: number, dead: boolean, torchLit: boolean, tiltDeg: number, others: { x: number; y: number }[] = []): void {
    this.minutes = gameMinutesAt(nowMs);
    const sky = skyAt(this.minutes);
    const lit = torchLit && !dead;
    const flicker = 0.5 + 0.5 * Math.sin(nowMs / 90) * Math.sin(nowMs / 233 + 1);

    // tocha na mao (direita do personagem), balancando junto com ele
    this.torch.setVisible(lit);
    if (lit) {
      this.torch.setPosition(px + 10, py + 2);
      this.torch.setAngle(tiltDeg);
      this.torch.setScale(1, 1 + flicker * 0.08);
    }

    // tochas dos outros jogadores (o SERVIDOR diz quem esta com a tocha acesa)
    while (this.otherTorches.length < others.length) {
      this.otherTorches.push(this.scene.add.image(0, 0, TORCH_KEY).setOrigin(0.5, 0.9).setDepth(10.5).setVisible(false));
      this.otherGlows.push(this.scene.add.image(0, 0, LIGHT_KEY).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040).setDepth(26).setVisible(false));
    }
    for (let i = 0; i < this.otherTorches.length; i++) {
      const o = others[i];
      const t = this.otherTorches[i];
      const gl = this.otherGlows[i];
      if (!o) {
        t.setVisible(false);
        gl.setVisible(false);
        continue;
      }
      const fl = 0.5 + 0.5 * Math.sin(nowMs / 90 + i * 1.7) * Math.sin(nowMs / 233 + i);
      t.setVisible(true).setPosition(o.x + 10, o.y + 2).setScale(1, 1 + fl * 0.08);
      gl.setVisible(sky.alpha > 0.02).setPosition(o.x, o.y).setScale((TORCH_RADIUS * 1.5) / LIGHT_SIZE).setAlpha(Math.min(0.35, 0.1 + sky.alpha * 0.22) * (0.85 + fl * 0.15));
    }

    if (sky.alpha < 0.02) {
      this.rt.setVisible(false);
      this.glow.setVisible(false);
      return;
    }
    const wv = this.scene.cameras.main.worldView;
    const lx = px - wv.centerX + this.rt.width / 2;
    const ly = py - wv.centerY + this.rt.height / 2;
    const radius = lit ? TORCH_RADIUS + flicker * 10 : AMBIENT_RADIUS;
    this.rt.setVisible(true);
    this.rt.clear();
    this.rt.fill(sky.color, sky.alpha);
    this.stamp.setScale((radius * 2) / LIGHT_SIZE);
    this.rt.erase(this.stamp, lx, ly);
    this.stamp.setScale((TORCH_RADIUS * 2) / LIGHT_SIZE);
    for (const o of others) this.rt.erase(this.stamp, o.x - wv.centerX + this.rt.width / 2, o.y - wv.centerY + this.rt.height / 2);

    this.glow.setVisible(lit);
    if (lit) {
      this.glow.setPosition(px, py);
      this.glow.setScale((radius * 1.5) / LIGHT_SIZE);
      this.glow.setAlpha(Math.min(0.35, 0.1 + sky.alpha * 0.22) * (0.85 + flicker * 0.15));
    }
  }

  destroy(): void {
    this.rt.destroy();
    this.stamp.destroy();
    this.glow.destroy();
    this.torch.destroy();
    for (const i of this.otherTorches) i.destroy();
    for (const i of this.otherGlows) i.destroy();
  }
}
