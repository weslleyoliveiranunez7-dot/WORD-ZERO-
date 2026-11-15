import { hash2, type ChunkedWorld } from "./chunks";
import type { ItemStack } from "./inventory";
import type { ItemId } from "./items";
import { PLAYER_HALF_SIZE, moveWithCollision } from "./movement";
import type { MobSnap } from "./protocol";

// Etapa 8: zumbis (perseguem e atacam) e cervos (fogem). Logica pura: roda so no servidor, relogio e sorteio por parametro.
// Cada criatura existe UMA vez no servidor; o cliente so recebe posicao e vida. Simulacao por proximidade:
// criatura sem jogador perto fica congelada (nao gasta CPU).

export type MobKind = "zombie" | "deer";
export const MOB_KIND_ID: Record<MobKind, number> = { zombie: 0, deer: 1 };

export const ACTIVE_RADIUS_PX = 640; // so simula criaturas a ate esta distancia de algum jogador
export const MOB_RESPAWN_MS = 60_000;
export const MOB_RESPAWN_CLEAR_PX = 300; // nao renasce com jogador por perto
export const PLAYER_ATTACK_REACH_PX = 48;
export const PLAYER_ATTACK_DAMAGE = 10; // punho (armas entram na Etapa 9)
const MAX_STEP = 0.05;

interface DropRule {
  id: ItemId;
  min: number;
  max: number;
  chance: number;
}
export interface MobDef {
  hp: number;
  speed: number; // px/s (jogador anda a 140)
  sense: number; // zumbi: distancia para perceber; cervo: distancia para fugir
  lose: number; // zumbi: distancia em que perde o interesse
  attackRange: number;
  attackDmg: number;
  attackCdMs: number;
  wanderRadius: number;
  drops: DropRule[];
}

export const MOBS: Record<MobKind, MobDef> = {
  zombie: { hp: 40, speed: 80, sense: 220, lose: 380, attackRange: 26, attackDmg: 8, attackCdMs: 1000, wanderRadius: 120, drops: [{ id: "scrap", min: 1, max: 2, chance: 0.6 }, { id: "bandage", min: 1, max: 1, chance: 0.15 }] },
  deer: { hp: 16, speed: 120, sense: 150, lose: 0, attackRange: 0, attackDmg: 0, attackCdMs: 0, wanderRadius: 160, drops: [{ id: "raw_meat", min: 1, max: 2, chance: 1 }] },
};

export type MobState = "idle" | "wander" | "chase" | "flee" | "dead";
export interface Mob {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  hp: number;
  state: MobState;
  awake: boolean;
  tx: number;
  ty: number;
  nextThinkMs: number;
  nextAttackMs: number;
  deadAtMs: number;
}

export interface MobHit {
  mobId: number;
  playerId: string;
  damage: number;
}
export interface PlayerPos {
  id: string;
  x: number;
  y: number;
}

export class MobWorld {
  readonly mobs: Mob[] = [];
  private nextId = 1;

  // Posicoes iniciais deterministicas (mesma seed = mesmo mapa de criaturas), longe do spawn e em chao livre.
  populate(world: ChunkedWorld, zombies = 30, deer = 16): void {
    const place = (kind: MobKind, n: number, salt: number): void => {
      let placed = 0;
      for (let i = 0; placed < n && i < n * 60; i++) {
        const tx = 1 + Math.floor(hash2(world.seed + salt, i, 1) * (world.width - 2));
        const ty = 1 + Math.floor(hash2(world.seed + salt, i, 2) * (world.height - 2));
        if (world.isSolid(tx, ty)) continue;
        if (Math.hypot(tx - world.spawnTile.x, ty - world.spawnTile.y) < 12) continue;
        this.add(kind, (tx + 0.5) * world.tileSize, (ty + 0.5) * world.tileSize);
        placed++;
      }
    };
    place("zombie", zombies, 101);
    place("deer", deer, 202);
  }

  add(kind: MobKind, x: number, y: number): Mob {
    const m: Mob = { id: this.nextId++, kind, x, y, homeX: x, homeY: y, hp: MOBS[kind].hp, state: "idle", awake: false, tx: x, ty: y, nextThinkMs: 0, nextAttackMs: 0, deadAtMs: 0 };
    this.mobs.push(m);
    return m;
  }

  private nearestPlayer(m: Mob, players: PlayerPos[]): { p: PlayerPos; d: number } | null {
    let best: { p: PlayerPos; d: number } | null = null;
    for (const p of players) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (!best || d < best.d) best = { p, d };
    }
    return best;
  }

  private move(world: ChunkedWorld, m: Mob, dirX: number, dirY: number, speed: number, dt: number): void {
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-6) return;
    const to = moveWithCollision(world, { x: m.x, y: m.y }, { x: (dirX / len) * speed, y: (dirY / len) * speed }, dt, PLAYER_HALF_SIZE);
    m.x = to.x;
    m.y = to.y;
  }

  // players: so jogadores VIVOS e CONECTADOS. Devolve os golpes que acertaram jogadores neste passo.
  tick(dtSec: number, nowMs: number, players: PlayerPos[], world: ChunkedWorld, rng: () => number = Math.random): MobHit[] {
    const hits: MobHit[] = [];
    const dt = Math.min(Math.max(dtSec, 0), MAX_STEP);
    for (const m of this.mobs) {
      const def = MOBS[m.kind];
      if (m.state === "dead") {
        m.awake = false;
        if (nowMs - m.deadAtMs >= MOB_RESPAWN_MS && !players.some((p) => Math.hypot(p.x - m.homeX, p.y - m.homeY) < MOB_RESPAWN_CLEAR_PX)) {
          m.hp = def.hp;
          m.x = m.homeX;
          m.y = m.homeY;
          m.state = "idle";
        }
        continue;
      }
      const near = this.nearestPlayer(m, players);
      m.awake = !!near && near.d <= ACTIVE_RADIUS_PX;
      if (!m.awake || !near) continue; // simulacao por proximidade

      if (m.kind === "zombie") {
        if (near.d <= def.sense || (m.state === "chase" && near.d <= def.lose)) m.state = "chase";
        else if (m.state === "chase") {
          m.state = "wander"; // perdeu o interesse: volta para a area de origem
          m.tx = m.homeX;
          m.ty = m.homeY;
        }
        if (m.state === "chase") {
          if (near.d > def.attackRange) this.move(world, m, near.p.x - m.x, near.p.y - m.y, def.speed, dt);
          else if (nowMs >= m.nextAttackMs) {
            m.nextAttackMs = nowMs + def.attackCdMs;
            hits.push({ mobId: m.id, playerId: near.p.id, damage: def.attackDmg });
          }
          continue;
        }
      } else if (near.d <= def.sense) {
        m.state = "flee";
        this.move(world, m, m.x - near.p.x, m.y - near.p.y, def.speed, dt);
        continue;
      } else if (m.state === "flee") m.state = "idle";

      // vagar: escolhe um ponto perto da origem de tempos em tempos e anda devagar ate ele
      if (nowMs >= m.nextThinkMs) {
        m.nextThinkMs = nowMs + 3000 + rng() * 3000;
        if (m.state !== "wander" || rng() < 0.5) {
          const a = rng() * Math.PI * 2;
          const r = rng() * def.wanderRadius;
          m.tx = m.homeX + Math.cos(a) * r;
          m.ty = m.homeY + Math.sin(a) * r;
          m.state = "wander";
        } else m.state = "idle";
      }
      if (m.state === "wander") {
        if (Math.hypot(m.tx - m.x, m.ty - m.y) < 4) m.state = "idle";
        else this.move(world, m, m.tx - m.x, m.ty - m.y, def.speed * 0.4, dt);
      }
    }
    return hits;
  }

  // Criatura viva mais proxima de (x,y) dentro do alcance.
  nearest(x: number, y: number, reach: number = PLAYER_ATTACK_REACH_PX): Mob | null {
    let best: Mob | null = null;
    let bestD = reach;
    for (const m of this.mobs) {
      if (m.state === "dead") continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  // Aplica dano. Morreu: some do mundo (renasce depois) e devolve o loot. Criatura morta nao leva dano de novo.
  damage(m: Mob, amount: number, nowMs: number, rng: () => number = Math.random): { killed: boolean; drops: ItemStack[] } {
    if (m.state === "dead" || !Number.isFinite(amount) || amount <= 0) return { killed: false, drops: [] };
    m.hp -= amount;
    if (m.hp > 0) return { killed: false, drops: [] };
    m.hp = 0;
    m.state = "dead";
    m.awake = false;
    m.deadAtMs = nowMs;
    const drops: ItemStack[] = [];
    for (const r of MOBS[m.kind].drops) {
      if (rng() < r.chance) drops.push({ id: r.id, qty: r.min + Math.floor(rng() * (r.max - r.min + 1)) });
    }
    return { killed: true, drops };
  }

  // So criaturas acordadas e vivas vao para a rede.
  snaps(): MobSnap[] {
    const out: MobSnap[] = [];
    for (const m of this.mobs) {
      if (!m.awake || m.state === "dead") continue;
      out.push({ id: m.id, k: MOB_KIND_ID[m.kind], x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, hp: Math.max(1, Math.ceil((m.hp / MOBS[m.kind].hp) * 100)) });
    }
    return out;
  }
}
