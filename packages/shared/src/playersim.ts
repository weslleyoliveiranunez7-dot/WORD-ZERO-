import { MAX_STEP_SECONDS, PLAYER_SPEED, collidesAt, inputToVelocity, moveWithCollision } from "./movement";
import type { SolidMap, Vec2 } from "./movement";
import type { PlayerInputMsg } from "./protocol";

// Estado autoritativo de UM jogador no servidor. O cliente so entrega "intencao" (ix, iy);
// posicao e velocidade sao sempre calculadas aqui.
export class PlayerSim {
  x: number;
  y: number;
  ix = 0;
  iy = 0;
  seq = 0;
  speedMul = 1; // 0..1, definido pelo servidor (energia baixa = mais lento). Nunca vem do cliente.

  constructor(start: Vec2) {
    this.x = start.x;
    this.y = start.y;
  }

  // Defesa em profundidade: mesmo que a validacao da rede falhe, valores ruins viram "parado".
  setInput(input: PlayerInputMsg): boolean {
    if (!Number.isFinite(input.seq) || input.seq < this.seq) return false;
    this.seq = input.seq;
    const ok = Number.isFinite(input.ix) && Number.isFinite(input.iy);
    this.ix = ok ? Math.max(-1, Math.min(1, input.ix)) : 0;
    this.iy = ok ? Math.max(-1, Math.min(1, input.iy)) : 0;
    return true;
  }

  // So o servidor chama (reaparecimento). Nunca a partir de dados do cliente.
  teleport(p: Vec2): void {
    this.x = p.x;
    this.y = p.y;
    this.stop();
  }

  stop(): void {
    this.ix = 0;
    this.iy = 0;
  }

  // Avanca a simulacao. Se o resultado violar velocidade maxima, colisao ou for invalido,
  // volta para a posicao anterior e devolve corrected=true (isso indica BUG no servidor, nao cheat).
  step(world: SolidMap, dtSeconds: number): { corrected: boolean } {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_STEP_SECONDS);
    const next = moveWithCollision(world, this, inputToVelocity(this.ix, this.iy, PLAYER_SPEED * Math.max(0, Math.min(1, this.speedMul))), dt);
    const moved = Math.hypot(next.x - this.x, next.y - this.y);
    const maxMove = PLAYER_SPEED * dt * 1.001 + 0.01;
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || moved > maxMove || collidesAt(world, next.x, next.y)) {
      return { corrected: true };
    }
    this.x = next.x;
    this.y = next.y;
    return { corrected: false };
  }
}
