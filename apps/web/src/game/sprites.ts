import Phaser from "phaser";
import type { TileType } from "@worldzero/shared";

// Sprites e texturas desenhados por codigo (sem arquivos de imagem): tudo e gerado uma vez e vira textura.
// So visual: nada aqui muda regra de jogo (colisao, coleta e vida continuam no servidor / shared).

type G = Phaser.GameObjects.Graphics;

// Numero pseudo-aleatorio FIXO por tile (0..1): a mesma grama/pedra/agua aparece sempre igual no mesmo lugar.
export function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawGrass(g: G, x: number, y: number, gx: number, gy: number, ts: number): void {
  g.fillStyle((gx + gy) % 2 === 0 ? 0x2f5d34 : 0x2b5630, 1);
  g.fillRect(x, y, ts, ts);
  for (let i = 0; i < 4; i++) {
    const px = x + 3 + Math.floor(hash2(gx * 7 + i, gy * 13) * (ts - 6));
    const py = y + 3 + Math.floor(hash2(gx * 11, gy * 5 + i) * (ts - 8));
    g.fillStyle(i % 2 === 0 ? 0x3f7c45 : 0x244b29, 1);
    g.fillRect(px, py, 1, 3);
    g.fillRect(px + 2, py + 1, 1, 2);
  }
  const r = hash2(gx + 101, gy + 57);
  if (r > 0.94) {
    g.fillStyle(r > 0.97 ? 0xe8d86a : 0xe6a1c4, 1);
    g.fillRect(x + 8 + Math.floor(r * 100) % 14, y + 8 + Math.floor(r * 1000) % 14, 2, 2);
  }
}

function drawWater(g: G, x: number, y: number, gx: number, gy: number, ts: number): void {
  g.fillStyle((gx + gy) % 2 === 0 ? 0x2b5f9e : 0x275a98, 1);
  g.fillRect(x, y, ts, ts);
  for (let i = 0; i < 2; i++) {
    const hx = Math.floor(hash2(gx * 3 + i, gy * 17) * (ts - 12));
    const hy = 4 + Math.floor(hash2(gx * 19, gy * 3 + i) * (ts - 10));
    g.fillStyle(0x5a93d0, 0.85);
    g.fillRect(x + hx, y + hy, 8, 1);
    g.fillRect(x + hx + 3, y + hy + 1, 5, 1);
    g.fillStyle(0x20497f, 0.7);
    g.fillRect(x + hx + 2, y + hy + 4, 7, 1);
  }
}

function drawStone(g: G, x: number, y: number, gx: number, gy: number, ts: number): void {
  const shade = hash2(gx, gy) > 0.5 ? 0x5b5b66 : 0x555560;
  g.fillStyle(shade, 1);
  g.fillRect(x, y, ts, ts);
  g.fillStyle(0x4a4a55, 1); // juntas dos blocos
  g.fillRect(x, y + ts / 2 - 1, ts, 2);
  g.fillRect(x + ts / 2 - 1, y, 2, ts / 2);
  g.fillRect(x + ts / 4 - 1, y + ts / 2, 2, ts / 2);
  g.fillRect(x + (ts * 3) / 4 - 1, y + ts / 2, 2, ts / 2);
  g.fillStyle(0x7b7b88, 1); // luz em cima
  g.fillRect(x, y, ts, 2);
  g.fillStyle(0x3a3a44, 1); // sombra embaixo
  g.fillRect(x, y + ts - 2, ts, 2);
  g.fillStyle(0x6b6b78, 1);
  g.fillRect(x + 4, y + 5, 5, 2);
  g.fillRect(x + ts / 2 + 6, y + ts / 2 + 6, 5, 2);
}

function drawTree(g: G, x: number, y: number, gx: number, gy: number, ts: number): void {
  drawGrass(g, x, y, gx, gy, ts);
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(cx, cy + ts * 0.34, ts * 0.72, ts * 0.22);
  g.fillStyle(0x6b4423, 1);
  g.fillRect(cx - 3, cy + ts * 0.02, 6, ts * 0.32);
  g.fillStyle(0x173d1c, 1); // contorno da copa
  g.fillCircle(cx, cy - ts * 0.08, ts * 0.44);
  g.fillStyle(0x24602c, 1);
  g.fillCircle(cx, cy - ts * 0.08, ts * 0.4);
  g.fillStyle(0x2f7a38, 1);
  g.fillCircle(cx - ts * 0.07, cy - ts * 0.14, ts * 0.3);
  g.fillStyle(0x4a9a50, 1);
  g.fillCircle(cx - ts * 0.13, cy - ts * 0.22, ts * 0.13);
}

// Arvore ja cortada (recurso esgotado): a copa some e sobra o toco.
export function drawStumpTile(g: G, tx: number, ty: number, ts: number): void {
  const x = tx * ts;
  const y = ty * ts;
  drawGrass(g, x, y, tx, ty, ts);
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(cx, cy + 9, 18, 6);
  g.fillStyle(0x6b4423, 1);
  g.fillRect(cx - 5, cy, 10, 8);
  g.fillStyle(0xb58d57, 1);
  g.fillEllipse(cx, cy, 10, 5);
  g.fillStyle(0x8a6a3c, 1);
  g.fillEllipse(cx, cy, 5, 2.5);
}

// Pedra ja minerada (recurso esgotado): sobra um chao escuro com cascalho.
export function drawRubbleTile(g: G, tx: number, ty: number, ts: number): void {
  const x = tx * ts;
  const y = ty * ts;
  g.fillStyle(0x3f3f48, 1);
  g.fillRect(x, y, ts, ts);
  for (let i = 0; i < 6; i++) {
    const px = x + 4 + hash2(tx * 5 + i, ty * 3) * (ts - 10);
    const py = y + 4 + hash2(tx * 3, ty * 7 + i) * (ts - 10);
    g.fillStyle(i % 2 === 0 ? 0x77777f : 0x5d5d66, 1);
    g.fillEllipse(px + 2, py + 2, 5 + (i % 3), 3 + (i % 2));
  }
}

export function drawTile(g: G, type: TileType, lx: number, ly: number, gx: number, gy: number, ts: number): void {
  const x = lx * ts;
  const y = ly * ts;
  if (type === "water") drawWater(g, x, y, gx, gy, ts);
  else if (type === "wall") drawStone(g, x, y, gx, gy, ts);
  else if (type === "tree") drawTree(g, x, y, gx, gy, ts);
  else drawGrass(g, x, y, gx, gy, ts);
}

// Mochila deixada no chao (loot).
export function drawBackpack(g: G, x: number, y: number): void {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(x, y + 9, 20, 6);
  g.fillStyle(0x6e4521, 1);
  g.fillRoundedRect(x - 9, y - 8, 18, 17, 4);
  g.fillStyle(0x8b5a2b, 1);
  g.fillRoundedRect(x - 8, y - 7, 16, 8, 3);
  g.fillStyle(0xffd36b, 1);
  g.fillRect(x - 2, y + 1, 4, 4);
  g.fillStyle(0x4a2d14, 1);
  g.fillRect(x - 9, y + 5, 18, 1);
}

export const CHAR_ME = "char-me";
export const CHAR_OTHER = "char-other";

function makeCharacter(scene: Phaser.Scene, key: string, shirt: number, shirtDark: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.3); // sombra
  g.fillEllipse(12, 27, 16, 6);
  g.fillStyle(0x2b2f4a, 1); // pernas
  g.fillRect(7, 19, 4, 7);
  g.fillRect(13, 19, 4, 7);
  g.fillStyle(0x181818, 1); // sapatos
  g.fillRect(6, 25, 5, 2);
  g.fillRect(13, 25, 5, 2);
  g.fillStyle(shirt, 1); // bracos
  g.fillRect(3, 12, 3, 8);
  g.fillRect(18, 12, 3, 8);
  g.fillStyle(0xf1c9a0, 1); // maos
  g.fillRect(3, 19, 3, 2);
  g.fillRect(18, 19, 3, 2);
  g.fillStyle(shirtDark, 1); // corpo
  g.fillRoundedRect(5.5, 10.5, 13, 11, 3);
  g.fillStyle(shirt, 1);
  g.fillRoundedRect(6, 11, 12, 9, 3);
  g.fillStyle(0x3b2a18, 1); // cinto
  g.fillRect(6, 19, 12, 2);
  g.fillStyle(0xf1c9a0, 1); // cabeca
  g.fillCircle(12, 7, 6);
  g.fillStyle(0x4a2f1a, 1); // cabelo
  g.beginPath();
  g.arc(12, 7, 6.4, Math.PI, 0, false);
  g.closePath();
  g.fillPath();
  g.fillRect(6, 6, 2, 3);
  g.fillRect(16, 6, 2, 3);
  g.fillStyle(0x1a1a1a, 1); // olhos
  g.fillRect(9, 8, 2, 2);
  g.fillRect(13, 8, 2, 2);
  g.lineStyle(1, 0x1a1a1a, 0.9);
  g.strokeCircle(12, 7, 6.3);
  g.generateTexture(key, 24, 30);
  g.destroy();
}

// Cria as texturas dos personagens (uma vez). Amarelo/laranja = voce, azul = outros jogadores.
export function ensureCharacterTextures(scene: Phaser.Scene): void {
  makeCharacter(scene, CHAR_ME, 0xe39a2e, 0xa8691a);
  makeCharacter(scene, CHAR_OTHER, 0x3b82d6, 0x28578f);
}

// ---- Pecas de construcao (so desenho; tipo, dono e colisao vem do servidor) ----

export function drawFloorPiece(g: G, x: number, y: number, ts: number): void {
  g.fillStyle(0x9c8460, 1);
  g.fillRect(x, y, ts, ts);
  g.fillStyle(0x7d6a4a, 1); // frestas entre as tabuas
  for (let i = 1; i < 4; i++) g.fillRect(x, y + (ts / 4) * i - 1, ts, 1);
  g.fillStyle(0xb39a73, 1); // luz
  for (let i = 0; i < 4; i++) g.fillRect(x, y + (ts / 4) * i, ts, 1);
  g.fillStyle(0x5e4e36, 1); // pregos
  g.fillRect(x + 3, y + 3, 1, 1);
  g.fillRect(x + ts - 4, y + ts / 2 + 3, 1, 1);
  g.lineStyle(1, 0x6b5a3e, 1).strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
}

export function drawWallPiece(g: G, x: number, y: number, ts: number): void {
  g.fillStyle(0x6d4c41, 1);
  g.fillRect(x, y, ts, ts);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x8a6254, 1); // topo de cada tora
    g.fillRect(x + 1, y + i * 8 + 1, ts - 2, 2);
    g.fillStyle(0x3e2a1f, 1); // sombra entre toras
    g.fillRect(x + 1, y + i * 8 + 7, ts - 2, 1);
    g.fillStyle(0x5a3d33, 1); // veios
    g.fillRect(x + 4 + ((i * 9) % 14), y + i * 8 + 4, 6, 1);
  }
  g.lineStyle(2, 0x3e2a1f, 1).strokeRect(x + 1, y + 1, ts - 2, ts - 2);
}

export function drawDoorPiece(g: G, x: number, y: number, ts: number, open: boolean): void {
  if (open) {
    g.lineStyle(2, 0x5a3a14, 1).strokeRect(x + 2, y + 2, ts - 4, ts - 4);
    g.fillStyle(0xb07a3c, 1);
    g.fillRect(x + 2, y + 2, 5, ts - 4); // folha aberta, de lado
    g.fillStyle(0x5a3a14, 1);
    g.fillRect(x + 7, y + 2, 1, ts - 4);
    return;
  }
  g.fillStyle(0xb07a3c, 1);
  g.fillRect(x + 2, y + 2, ts - 4, ts - 4);
  g.fillStyle(0x8a5a26, 1);
  for (let i = 1; i < 4; i++) g.fillRect(x + 2 + ((ts - 4) / 4) * i, y + 2, 1, ts - 4); // tabuas
  g.fillStyle(0x5a3a14, 1); // dobradicas
  g.fillRect(x + 2, y + 7, ts - 4, 2);
  g.fillRect(x + 2, y + ts - 9, ts - 4, 2);
  g.fillStyle(0xffd36b, 1); // macaneta
  g.fillCircle(x + ts - 8, y + ts / 2, 2);
  g.lineStyle(2, 0x5a3a14, 1).strokeRect(x + 2, y + 2, ts - 4, ts - 4);
}

export function drawChestPiece(g: G, x: number, y: number, ts: number): void {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(x + ts / 2, y + ts - 4, ts - 6, 6);
  g.fillStyle(0x7a4a1f, 1); // corpo
  g.fillRect(x + 5, y + 14, ts - 10, 12);
  g.fillStyle(0x9a6430, 1); // tampa
  g.fillRoundedRect(x + 5, y + 8, ts - 10, 9, 3);
  g.fillStyle(0xc9c9d0, 1); // cintas de metal
  g.fillRect(x + 9, y + 8, 3, 18);
  g.fillRect(x + ts - 12, y + 8, 3, 18);
  g.fillStyle(0xffd36b, 1); // fechadura
  g.fillRect(x + ts / 2 - 2, y + 14, 4, 5);
  g.lineStyle(2, 0x3e2a1f, 1).strokeRect(x + 5, y + 8, ts - 10, 18);
}

export function drawWindowPiece(g: G, x: number, y: number, ts: number): void {
  g.fillStyle(0x4a3a2a, 1);
  g.fillRect(x, y, ts, ts);
  g.fillStyle(0x9fd8ee, 0.7);
  g.fillRect(x + 4, y + 4, ts - 8, ts - 8);
  g.fillStyle(0xffffff, 0.35); // reflexo
  g.fillRect(x + 6, y + 6, 4, ts - 12);
  g.fillStyle(0x4a3a2a, 1); // travessas
  g.fillRect(x + ts / 2 - 1, y + 4, 2, ts - 8);
  g.fillRect(x + 4, y + ts / 2 - 1, ts - 8, 2);
  g.lineStyle(1, 0x2a2018, 1).strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
}

export function drawRoofPiece(g: G, x: number, y: number, ts: number, alpha: number): void {
  g.fillStyle(0x8a3b2e, alpha);
  g.fillRect(x, y, ts, ts);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x5e281f, alpha);
    g.fillRect(x, y + i * 8 + 7, ts, 1);
    g.fillStyle(0xa24a3a, alpha);
    g.fillRect(x, y + i * 8, ts, 1);
    g.fillStyle(0x6e2f24, alpha);
    const off = i % 2 === 0 ? 0 : 8;
    for (let k = 0; k < 3; k++) g.fillRect(x + off + k * 16, y + i * 8 + 1, 1, 6);
  }
  g.lineStyle(1, 0x4d1f17, alpha).strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
}

// ---- Criaturas ----

export const MOB_ZOMBIE = "mob-zombie";
export const MOB_DEER = "mob-deer";

export function ensureMobTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(MOB_ZOMBIE)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(14, 28, 18, 6);
    g.fillStyle(0x34344f, 1); // pernas rasgadas
    g.fillRect(8, 20, 4, 7);
    g.fillRect(16, 20, 4, 8);
    g.fillStyle(0x7fa070, 1); // bracos esticados para frente
    g.fillRect(1, 11, 7, 3);
    g.fillRect(20, 11, 7, 3);
    g.fillStyle(0x5a4a6a, 1); // roupa
    g.fillRoundedRect(7, 11, 14, 11, 3);
    g.fillStyle(0x3d3350, 1);
    g.fillRect(9, 17, 3, 5); // rasgo
    g.fillRect(16, 19, 3, 3);
    g.fillStyle(0x8fb37f, 1); // cabeca
    g.fillCircle(14, 7, 6);
    g.fillStyle(0xd62f2f, 1); // olhos vermelhos
    g.fillRect(10, 6, 3, 3);
    g.fillRect(15, 6, 3, 3);
    g.fillStyle(0x2a1a1a, 1); // boca
    g.fillRect(11, 11, 6, 2);
    g.lineStyle(1, 0x1a1a1a, 0.9).strokeCircle(14, 7, 6.3);
    g.generateTexture(MOB_ZOMBIE, 28, 30);
    g.destroy();
  }
  if (!scene.textures.exists(MOB_DEER)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(15, 25, 22, 5);
    g.fillStyle(0x8a6a3a, 1); // pernas
    g.fillRect(8, 16, 2, 8);
    g.fillRect(11, 16, 2, 8);
    g.fillRect(19, 16, 2, 8);
    g.fillRect(22, 16, 2, 8);
    g.fillStyle(0xc8a165, 1); // corpo
    g.fillEllipse(15, 15, 22, 11);
    g.fillStyle(0xe3c58f, 1); // barriga e manchas
    g.fillEllipse(15, 18, 16, 4);
    g.fillCircle(12, 12, 1.2);
    g.fillCircle(17, 11, 1.2);
    g.fillCircle(20, 14, 1.2);
    g.fillStyle(0xc8a165, 1); // pescoco e cabeca
    g.fillTriangle(20, 12, 23, 5, 26, 12);
    g.fillEllipse(26, 7, 8, 6);
    g.fillStyle(0xffffff, 1); // rabo
    g.fillCircle(4, 12, 2.2);
    g.fillStyle(0x1a1a1a, 1); // olho e focinho
    g.fillRect(27, 6, 1, 1);
    g.fillRect(29, 8, 1, 1);
    g.lineStyle(1, 0x4a3018, 1); // chifres
    g.lineBetween(25, 4, 24, 0);
    g.lineBetween(24, 1, 22, 0);
    g.lineBetween(27, 4, 29, 0);
    g.lineBetween(28, 1, 30, 1);
    g.generateTexture(MOB_DEER, 32, 28);
    g.destroy();
  }
}
