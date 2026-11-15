import { describe, expect, it } from "vitest";
import { ATTACK_COOLDOWN_MS, ChunkedWorld, MOBS, MOB_RESPAWN_MS, MobWorld, PLAYER_ATTACK_DAMAGE, PlayerLife, inspectAttack } from "./index";

const world = new ChunkedWorld();
// terreno livre ao redor do spawn (chao limpo num raio de 3 tiles)
const sx = world.spawn.x;
const sy = world.spawn.y;
const seq = () => {
  let i = 0;
  return () => ((i = (i * 7 + 3) % 10) + 1) / 11;
};
const run = (mw: MobWorld, players: { id: string; x: number; y: number }[], ms: number, t0 = 0, hits: { playerId: string }[] = []) => {
  for (let t = t0; t < t0 + ms; t += 50) hits.push(...mw.tick(0.05, t, players, world, seq()));
  return hits;
};

describe("criaturas (Etapa 8)", () => {
  it("populate: deterministico, em chao livre e longe do spawn", () => {
    const a = new MobWorld(), b = new MobWorld();
    a.populate(world);
    b.populate(world);
    expect(a.mobs.length).toBe(46);
    expect(a.mobs.map((m) => [m.x, m.y])).toEqual(b.mobs.map((m) => [m.x, m.y]));
    for (const m of a.mobs) {
      expect(world.isSolid(Math.floor(m.x / 32), Math.floor(m.y / 32))).toBe(false);
      expect(Math.hypot(m.x - sx, m.y - sy)).toBeGreaterThan(300);
    }
  });

  it("zumbi persegue e ataca no ritmo da recarga (3 s = no maximo 3-4 golpes)", () => {
    const mw = new MobWorld();
    mw.add("zombie", sx + 150, sy);
    const hits = run(mw, [{ id: "A", x: sx, y: sy }], 3000);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(5);
    expect(hits.every((h) => h.playerId === "A")).toBe(true);
  });

  it("dois jogadores na area: uma unica criatura, ataca so o mais proximo, sem golpe duplicado", () => {
    const mw = new MobWorld();
    mw.add("zombie", sx + 60, sy);
    const hits = run(mw, [{ id: "perto", x: sx + 40, y: sy }, { id: "longe", x: sx - 120, y: sy }], 2000);
    expect(mw.mobs.length).toBe(1);
    expect(hits.every((h) => h.playerId === "perto")).toBe(true);
    expect(hits.length).toBeLessThan(4); // 1 golpe por recarga, nunca 2 ao mesmo tempo
  });

  it("sem jogador por perto a criatura fica congelada", () => {
    const mw = new MobWorld();
    const z = mw.add("zombie", sx + 100, sy);
    run(mw, [{ id: "A", x: sx - 2000, y: sy }], 2000);
    expect([z.x, z.y, z.awake]).toEqual([sx + 100, sy, false]);
    expect(mw.snaps().length).toBe(0);
  });

  it("zumbi perde o interesse longe demais", () => {
    const mw = new MobWorld();
    const z = mw.add("zombie", sx + 100, sy);
    run(mw, [{ id: "A", x: sx, y: sy }], 200);
    expect(z.state).toBe("chase");
    run(mw, [{ id: "A", x: sx - 450, y: sy }], 200, 200);
    expect(z.state).not.toBe("chase");
  });

  it("cervo foge", () => {
    const mw = new MobWorld();
    const d = mw.add("deer", sx + 60, sy);
    const before = Math.hypot(d.x - sx, d.y - sy);
    run(mw, [{ id: "A", x: sx, y: sy }], 500);
    expect(Math.hypot(d.x - sx, d.y - sy)).toBeGreaterThan(before);
    expect(d.state).toBe("flee");
  });

  it("morte: golpes necessarios, loot uma unica vez, nao leva dano depois de morto, renasce", () => {
    const mw = new MobWorld();
    const z = mw.add("zombie", sx, sy);
    const need = Math.ceil(MOBS.zombie.hp / PLAYER_ATTACK_DAMAGE);
    let kills = 0;
    let drops = 0;
    for (let i = 0; i < need + 3; i++) {
      const r = mw.damage(z, PLAYER_ATTACK_DAMAGE, 1000, () => 0); // rng 0: tudo cai
      if (r.killed) {
        kills++;
        drops = r.drops.length;
      }
    }
    expect(kills).toBe(1);
    expect(drops).toBe(2);
    expect(mw.nearest(sx, sy)).toBeNull();
    run(mw, [{ id: "A", x: sx + 5000, y: sy }], 100, 1000 + MOB_RESPAWN_MS);
    expect(z.state).not.toBe("dead");
    expect(z.hp).toBe(MOBS.zombie.hp);
  });

  it("nao renasce com jogador em cima", () => {
    const mw = new MobWorld();
    const z = mw.add("zombie", sx, sy);
    mw.damage(z, 999, 0);
    mw.tick(0.05, MOB_RESPAWN_MS + 1, [{ id: "A", x: sx + 50, y: sy }], world);
    expect(z.state).toBe("dead");
  });

  it("startAttack: id repetido, recarga e morto; inspectAttack rejeita extras", () => {
    const life = new PlayerLife();
    expect(life.startAttack(1, 1000).ok).toBe(true);
    expect(life.startAttack(1, 9000)).toMatchObject({ reason: "acao_repetida" });
    expect(life.startAttack(2, 1000 + ATTACK_COOLDOWN_MS - 1)).toMatchObject({ reason: "em_recarga" });
    expect(life.startAttack(3, 1000 + ATTACK_COOLDOWN_MS).ok).toBe(true);
    life.die(5000);
    expect(life.startAttack(4, 99999)).toMatchObject({ reason: "morto" });
    expect(inspectAttack({ actionId: 1, dano: 999 }).msg).toBeNull();
  });
});
