import type { PlayerSnap, WorldSnapshot } from "./protocol";

export interface Sampled {
  x: number;
  y: number;
}

// Guarda os ultimos snapshots (com a hora em que CHEGARAM no cliente) e devolve a posicao
// interpolada de cada jogador para um instante um pouco no passado. Sem extrapolacao.
export class SnapshotBuffer {
  private snaps: { t: number; byId: Map<string, PlayerSnap> }[] = [];

  push(timeMs: number, snap: WorldSnapshot): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && timeMs < last.t) return; // fora de ordem: ignora
    this.snaps.push({ t: timeMs, byId: new Map(snap.players.map((p) => [p.id, p])) });
    if (this.snaps.length > 20) this.snaps.shift();
  }

  get size(): number {
    return this.snaps.length;
  }

  sample(renderTimeMs: number): Map<string, Sampled> {
    const out = new Map<string, Sampled>();
    const n = this.snaps.length;
    if (n === 0) return out;
    let b = this.snaps[n - 1];
    let a = b;
    if (renderTimeMs < this.snaps[0].t) {
      a = b = this.snaps[0];
    } else if (renderTimeMs < b.t) {
      for (let i = n - 2; i >= 0; i--) {
        if (this.snaps[i].t <= renderTimeMs) {
          a = this.snaps[i];
          b = this.snaps[i + 1];
          break;
        }
      }
    }
    const k = b.t === a.t ? 1 : Math.min(1, Math.max(0, (renderTimeMs - a.t) / (b.t - a.t)));
    for (const [id, pb] of b.byId) {
      const pa = a.byId.get(id);
      out.set(id, pa ? { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k } : { x: pb.x, y: pb.y });
    }
    return out;
  }
}
