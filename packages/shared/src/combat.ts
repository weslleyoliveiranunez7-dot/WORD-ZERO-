import type { ChunkedWorld } from "./chunks";
import type { Inventory, ItemStack } from "./inventory";
import { ITEMS, type ItemId, type WeaponStats } from "./items";
import { ATTACK_COOLDOWN_MS, KILL_CREDIT_MS, type ActionResult, type PlayerLife } from "./life";
import { PLAYER_ATTACK_DAMAGE, PLAYER_ATTACK_REACH_PX, type Mob, type MobWorld } from "./mobs";
import type { CombatEventMsg } from "./protocol";

// Etapa 9: combate entre jogadores (PvP) e contra criaturas. Logica pura: so o servidor chama, o relogio vem por parametro.
// O cliente so diz "quero atacar" ({actionId}). Arma, alvo, alcance, linha de visao, recarga e dano saem DAQUI,
// a partir das posicoes e do inventario que o SERVIDOR conhece (Documento Mestre 2.3 e 6.3).

export const FIST: WeaponStats = { damage: PLAYER_ATTACK_DAMAGE, reach: PLAYER_ATTACK_REACH_PX, cooldownMs: ATTACK_COOLDOWN_MS };
const LOS_STEP_PX = 8; // passo da checagem de linha de visao

export interface EquippedWeapon extends WeaponStats {
  item: ItemId | null; // null = punho
}

// Arma usada no golpe: a de MAIOR DANO no inventario do servidor; sem arma, punho. Nao existe "equipar" vindo do cliente.
export function bestWeapon(inv: Inventory): EquippedWeapon {
  let best: EquippedWeapon = { ...FIST, item: null };
  for (const s of inv.slots) {
    const w = s ? ITEMS[s.id]?.weapon : undefined;
    if (s && w && w.damage > best.damage) best = { ...w, item: s.id };
  }
  return best;
}

// Parede e arvore bloqueiam golpe; agua nao (da para acertar quem esta do outro lado de um riacho, dentro do alcance).
// Amostra o segmento a cada 8 px, sem contar as pontas (cada um esta no proprio tile, que e livre).
export function lineClear(world: ChunkedWorld, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  if (!Number.isFinite(d)) return false;
  const ts = world.tileSize;
  for (let t = LOS_STEP_PX; t < d; t += LOS_STEP_PX) {
    const f = t / d;
    const tx = Math.floor((ax + (bx - ax) * f) / ts);
    const ty = Math.floor((ay + (by - ay) * f) / ts);
    const tile = world.tileAt(tx, ty);
    if (tile === null || tile === "wall" || tile === "tree" || (world.extraOpaque !== null && world.extraOpaque(tx, ty))) return false;
  }
  return true;
}

export interface PvpCandidate {
  id: string;
  x: number;
  y: number;
}

export type TargetChoice = { kind: "player"; id: string; x: number; y: number; dist: number } | { kind: "mob"; mob: Mob; dist: number } | null;

// Escolhe UM alvo: o mais proximo (jogador ou criatura) dentro do alcance e com linha de visao. Empate: criatura.
// `players` ja vem filtrado pelo servidor (sem o proprio atacante, sem mortos, sem protegidos).
// Jogador desconectado (janela de reconexao) continua na lista de proposito: sair no meio da luta nao salva ninguem (Documento Mestre 7.6).
export function chooseTarget(world: ChunkedWorld, from: { x: number; y: number }, reach: number, players: PvpCandidate[], mobs: MobWorld): TargetChoice {
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(reach) || reach <= 0) return null;
  let best: TargetChoice = null;
  const m = mobs.nearest(from.x, from.y, reach, (mm) => lineClear(world, from.x, from.y, mm.x, mm.y));
  if (m) best = { kind: "mob", mob: m, dist: Math.hypot(m.x - from.x, m.y - from.y) };
  for (const p of players) {
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    if (dist > reach || (best && dist >= best.dist)) continue;
    if (!lineClear(world, from.x, from.y, p.x, p.y)) continue;
    best = { kind: "player", id: p.id, x: p.x, y: p.y, dist };
  }
  return best;
}

// ---- Um golpe completo, de ponta a ponta (a unica porta de entrada de dano de jogador) ----
export interface Fighter {
  id: string;
  x: number; // posicao que o SERVIDOR conhece
  y: number;
  life: PlayerLife;
}

export interface AttackOutcome {
  res: ActionResult;
  events: CombatEventMsg[]; // feedback para os clientes (nao muda estado)
  drop?: { x: number; y: number; items: ItemStack[] }; // loot de criatura morta: o servidor cria a mochila no chao
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

// Valida e executa UM golpe. Ordem: atacante vivo -> actionId novo -> recarga DA ARMA -> alvo (alcance + linha de visao +
// vivo + sem protecao) -> dano. Errar tambem gasta a recarga (nao da para "martelar" o botao de graca).
// `others` = todos os outros jogadores presentes no mundo (inclusive em janela de reconexao).
export function performAttack(
  world: ChunkedWorld,
  mobs: MobWorld,
  attacker: Fighter,
  others: Fighter[],
  actionId: number,
  nowMs: number,
  rng: () => number = Math.random,
): AttackOutcome {
  const weapon = bestWeapon(attacker.life.inventory);
  const res = attacker.life.startAttack(actionId, nowMs, weapon.cooldownMs);
  if (!res.ok) return { res, events: [] };

  const candidates: PvpCandidate[] = [];
  const byId = new Map<string, Fighter>();
  for (const o of others) {
    if (o.id === attacker.id || o.life.dead || o.life.survival.dead || o.life.inGrace(nowMs)) continue;
    candidates.push({ id: o.id, x: o.x, y: o.y });
    byId.set(o.id, o);
  }
  const t = chooseTarget(world, attacker, weapon.reach, candidates, mobs);
  if (!t) return { res, events: [{ kind: "miss", attacker: attacker.id, x: r1(attacker.x), y: r1(attacker.y) }] };

  if (t.kind === "player") {
    const victim = byId.get(t.id);
    if (!victim || !victim.life.takeHit(weapon.damage, attacker.id, nowMs)) {
      return { res, events: [{ kind: "miss", attacker: attacker.id, x: r1(attacker.x), y: r1(attacker.y) }] };
    }
    return { res, events: [{ kind: "hit", attacker: attacker.id, victim: victim.id, x: r1(victim.x), y: r1(victim.y), damage: weapon.damage }] };
  }

  const hit = mobs.damage(t.mob, weapon.damage, nowMs, rng);
  const events: CombatEventMsg[] = [{ kind: "hit", attacker: attacker.id, mobId: t.mob.id, x: r1(t.mob.x), y: r1(t.mob.y), damage: weapon.damage }];
  if (!hit.killed) return { res, events };
  events.push({ kind: "kill", attacker: attacker.id, mobId: t.mob.id, x: r1(t.mob.x), y: r1(t.mob.y) });
  return { res, events, drop: hit.drops.length ? { x: t.mob.x, y: t.mob.y, items: hit.drops } : undefined };
}

// Quem recebe o credito pela morte de `life`: o ultimo jogador que causou dano dentro de KILL_CREDIT_MS (nunca a propria vitima).
export function killCredit(life: PlayerLife, victimId: string, nowMs: number): string | null {
  const h = life.lastHit;
  return h && h.by !== victimId && nowMs - h.atMs <= KILL_CREDIT_MS ? h.by : null;
}
