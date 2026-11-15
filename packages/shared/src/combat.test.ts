import { describe, expect, it } from "vitest";
import {
  ATTACK_COOLDOWN_MS,
  ChunkedWorld,
  FIST,
  ITEMS,
  Inventory,
  KILL_CREDIT_MS,
  MobWorld,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_REACH_PX,
  PlayerLife,
  RESPAWN_DELAY_MS,
  SPAWN_GRACE_MS,
  bestWeapon,
  chooseTarget,
  inspectAttack,
  killCredit,
  lineClear,
  parseSave,
  makeSave,
  performAttack,
  type Fighter,
} from "./index";

const world = new ChunkedWorld();
const sx = world.spawn.x;
const sy = world.spawn.y;
const fighter = (id: string, x: number, y: number, life = new PlayerLife()): Fighter => ({ id, x, y, life });
const withClub = (life: PlayerLife): PlayerLife => {
  life.inventory.add("club", 1);
  return life;
};

// acha um tile de arvore com grama dos dois lados (esquerda e direita) para testar linha de visao
function findTreeRow(): { tx: number; ty: number } {
  for (let ty = 2; ty < world.height - 2; ty++) {
    for (let tx = 2; tx < world.width - 2; tx++) {
      if (world.tileAt(tx, ty) === "tree" && world.tileAt(tx - 1, ty) === "grass" && world.tileAt(tx + 1, ty) === "grass") return { tx, ty };
    }
  }
  throw new Error("mapa de teste sem arvore isolada");
}

describe("armas (Etapa 9)", () => {
  it("sem arma = punho; com porrete usa o porrete; o porrete bate mais forte que o punho", () => {
    const inv = new Inventory();
    expect(bestWeapon(inv)).toEqual({ ...FIST, item: null });
    inv.add("club", 1);
    const w = bestWeapon(inv);
    expect(w.item).toBe("club");
    expect(w.damage).toBeGreaterThan(PLAYER_ATTACK_DAMAGE);
    expect(w.damage).toBe(ITEMS.club.weapon!.damage);
  });
  it("itens que nao sao arma nunca viram arma", () => {
    const inv = Inventory.starter();
    inv.add("wood", 5);
    expect(bestWeapon(inv).item).toBe(null);
  });
  it("porrete: nao empilha (1 por slot) e sobrevive a salvar/carregar", () => {
    const life = withClub(new PlayerLife());
    const save = parseSave(JSON.parse(JSON.stringify(makeSave(life, sx, sy))));
    expect(save).not.toBe(null);
    expect(save!.slots.some((s) => s?.id === "club")).toBe(true);
    const raw = JSON.parse(JSON.stringify(makeSave(life, sx, sy)));
    raw.slots[0] = { id: "club", qty: 2 };
    expect(parseSave(raw)).toBe(null); // 2 porretes num slot = save adulterado
  });
});

describe("linha de visao", () => {
  it("terreno livre deixa passar; arvore entre os dois bloqueia", () => {
    const { tx, ty } = findTreeRow();
    const ts = world.tileSize;
    const ax = (tx - 1 + 0.5) * ts;
    const bx = (tx + 1 + 0.5) * ts;
    const y = (ty + 0.5) * ts;
    expect(lineClear(world, ax, y, bx, y)).toBe(false);
    expect(lineClear(world, sx, sy, sx + 40, sy)).toBe(true);
  });
  it("coordenada invalida nunca passa", () => {
    expect(lineClear(world, sx, sy, NaN, sy)).toBe(false);
  });
});

describe("chooseTarget", () => {
  const mobs = new MobWorld();
  it("escolhe o jogador mais proximo dentro do alcance; fora do alcance = ninguem", () => {
    const near = { id: "B", x: sx + 30, y: sy };
    const far = { id: "C", x: sx + 40, y: sy };
    const t = chooseTarget(world, { x: sx, y: sy }, PLAYER_ATTACK_REACH_PX, [far, near], mobs);
    expect(t).toMatchObject({ kind: "player", id: "B" });
    expect(chooseTarget(world, { x: sx, y: sy }, PLAYER_ATTACK_REACH_PX, [{ id: "D", x: sx + PLAYER_ATTACK_REACH_PX + 1, y: sy }], mobs)).toBe(null);
  });
  it("alcance invalido ou posicao NaN: ninguem", () => {
    expect(chooseTarget(world, { x: sx, y: sy }, 0, [{ id: "B", x: sx + 1, y: sy }], mobs)).toBe(null);
    expect(chooseTarget(world, { x: NaN, y: sy }, 50, [{ id: "B", x: sx + 1, y: sy }], mobs)).toBe(null);
  });
  it("arvore no meio impede o golpe mesmo dentro do alcance", () => {
    const { tx, ty } = findTreeRow();
    const ts = world.tileSize;
    const a = { x: (tx - 1 + 0.5) * ts, y: (ty + 0.5) * ts };
    const b = { id: "B", x: (tx + 1 + 0.5) * ts, y: (ty + 0.5) * ts };
    expect(chooseTarget(world, a, 80, [b], mobs)).toBe(null);
  });
  it("criatura mais proxima que o jogador vence; empate vai para a criatura", () => {
    const mw = new MobWorld();
    mw.add("zombie", sx + 20, sy);
    expect(chooseTarget(world, { x: sx, y: sy }, 48, [{ id: "B", x: sx + 30, y: sy }], mw)).toMatchObject({ kind: "mob" });
    expect(chooseTarget(world, { x: sx, y: sy }, 48, [{ id: "B", x: sx + 20, y: sy }], mw)).toMatchObject({ kind: "mob" });
    expect(chooseTarget(world, { x: sx, y: sy }, 48, [{ id: "B", x: sx + 10, y: sy }], mw)).toMatchObject({ kind: "player" });
  });
});

describe("PlayerLife: dano de jogador, protecao e credito", () => {
  it("takeHit tira vida, registra quem bateu e recusa valores invalidos", () => {
    const l = new PlayerLife();
    expect(l.takeHit(10, "A", 1000)).toBe(true);
    expect(l.survival.health).toBe(90);
    expect(l.lastHit).toEqual({ by: "A", atMs: 1000 });
    for (const bad of [NaN, Infinity, -5, 0]) expect(l.takeHit(bad, "A", 1001)).toBe(false);
    expect(l.survival.health).toBe(90);
  });
  it("vida zerada (mesmo antes do proximo tick) conta como morto: sem dano nem credito duplicado", () => {
    const l = new PlayerLife();
    expect(l.takeHit(100, "A", 1000)).toBe(true);
    expect(l.survival.dead).toBe(true);
    expect(l.takeHit(10, "B", 1001)).toBe(false);
    expect(l.lastHit!.by).toBe("A");
    l.tick(0, false, 1002); // o tick do servidor registra a morte
    expect(l.dead).toBe(true);
    expect(l.takeHit(10, "B", 1003)).toBe(false);
  });
  it("reaparecer da protecao curta; atacar encerra a protecao; ela acaba sozinha", () => {
    const l = new PlayerLife();
    l.die(0);
    expect(l.respawn(1, RESPAWN_DELAY_MS).ok).toBe(true);
    const t0 = RESPAWN_DELAY_MS;
    expect(l.takeHit(10, "A", t0 + 1)).toBe(false);
    expect(l.takeHit(10, "A", t0 + SPAWN_GRACE_MS - 1)).toBe(false);
    expect(l.takeHit(10, "A", t0 + SPAWN_GRACE_MS)).toBe(true);

    const m = new PlayerLife();
    m.die(0);
    m.respawn(1, RESPAWN_DELAY_MS);
    expect(m.startAttack(2, t0 + 100).ok).toBe(true); // atacou: perdeu a protecao
    expect(m.takeHit(10, "A", t0 + 200)).toBe(true);
  });
  it("killCredit: so dentro da janela e nunca para a propria vitima", () => {
    const l = new PlayerLife();
    l.takeHit(10, "A", 1000);
    expect(killCredit(l, "V", 1000 + KILL_CREDIT_MS)).toBe("A");
    expect(killCredit(l, "V", 1000 + KILL_CREDIT_MS + 1)).toBe(null);
    expect(killCredit(l, "A", 1500)).toBe(null);
    expect(killCredit(new PlayerLife(), "V", 0)).toBe(null);
  });
  it("startAttack usa a recarga da ARMA", () => {
    const l = new PlayerLife();
    expect(l.startAttack(1, 1000, 800).ok).toBe(true);
    expect(l.startAttack(2, 1000 + 799, 800)).toMatchObject({ reason: "em_recarga" });
    expect(l.startAttack(3, 1000 + 800, 800).ok).toBe(true);
  });
});

describe("performAttack (o golpe inteiro, no servidor)", () => {
  const mobs = new MobWorld();
  const pair = (): { a: Fighter; b: Fighter } => ({ a: fighter("A", sx, sy), b: fighter("B", sx + 30, sy) });

  it("soco acerta jogador ao alcance: tira exatamente o dano do punho e gera evento hit", () => {
    const { a, b } = pair();
    const r = performAttack(world, mobs, a, [a, b], 1, 1000);
    expect(r.res.ok).toBe(true);
    expect(b.life.survival.health).toBe(100 - PLAYER_ATTACK_DAMAGE);
    expect(r.events).toEqual([{ kind: "hit", attacker: "A", victim: "B", x: sx + 30, y: sy, damage: PLAYER_ATTACK_DAMAGE }]);
  });
  it("porrete tira o dano do porrete", () => {
    const a = fighter("A", sx, sy, withClub(new PlayerLife()));
    const b = fighter("B", sx + 30, sy);
    performAttack(world, mobs, a, [a, b], 1, 1000);
    expect(b.life.survival.health).toBe(100 - ITEMS.club.weapon!.damage);
  });
  it("fora do alcance: errou, sem dano; a recarga foi gasta", () => {
    const a = fighter("A", sx, sy);
    const b = fighter("B", sx + PLAYER_ATTACK_REACH_PX + 5, sy);
    const r = performAttack(world, mobs, a, [a, b], 1, 1000);
    expect(r.res.ok).toBe(true);
    expect(b.life.survival.health).toBe(100);
    expect(r.events[0].kind).toBe("miss");
    expect(performAttack(world, mobs, a, [a, b], 2, 1000 + 10).res).toMatchObject({ ok: false, reason: "em_recarga" });
  });
  it("recarga: rajada de 50 golpes no mesmo instante = 1 dano so", () => {
    const { a, b } = pair();
    for (let i = 1; i <= 50; i++) performAttack(world, mobs, a, [a, b], i, 1000);
    expect(b.life.survival.health).toBe(100 - PLAYER_ATTACK_DAMAGE);
  });
  it("repetir o mesmo actionId (replay) nunca bate duas vezes, nem depois da recarga", () => {
    const { a, b } = pair();
    performAttack(world, mobs, a, [a, b], 7, 1000);
    const r = performAttack(world, mobs, a, [a, b], 7, 1000 + ATTACK_COOLDOWN_MS * 5);
    expect(r.res).toMatchObject({ ok: false, reason: "acao_repetida" });
    expect(b.life.survival.health).toBe(100 - PLAYER_ATTACK_DAMAGE);
  });
  it("nao acerta a si mesmo, nem morto, nem protegido de reaparecimento", () => {
    const a = fighter("A", sx, sy);
    performAttack(world, mobs, a, [a], 1, 1000);
    expect(a.life.survival.health).toBe(100);

    const dead = fighter("D", sx + 10, sy);
    dead.life.die(0);
    const r = performAttack(world, mobs, a, [a, dead], 2, 10_000);
    expect(r.events[0].kind).toBe("miss");

    const fresh = fighter("F", sx + 10, sy);
    fresh.life.die(0);
    fresh.life.respawn(1, 20_000 + RESPAWN_DELAY_MS);
    const r2 = performAttack(world, mobs, a, [a, fresh], 3, 20_000 + RESPAWN_DELAY_MS + 100);
    expect(r2.events[0].kind).toBe("miss");
    expect(fresh.life.survival.health).toBe(100);
    const r3 = performAttack(world, mobs, a, [a, fresh], 4, 20_000 + RESPAWN_DELAY_MS + SPAWN_GRACE_MS + 100);
    expect(r3.events[0].kind).toBe("hit");
  });
  it("atacante morto nao ataca", () => {
    const { a, b } = pair();
    a.life.die(0);
    expect(performAttack(world, mobs, a, [a, b], 1, 1000).res).toMatchObject({ ok: false, reason: "morto" });
    expect(b.life.survival.health).toBe(100);
  });
  it("matar: vida zera, o credito vai para o atacante e o golpe seguinte nao acerta de novo", () => {
    const { a, b } = pair();
    let t = 1000;
    let id = 0;
    let hits = 0;
    while (!b.life.survival.dead && hits < 30) {
      const r = performAttack(world, mobs, a, [a, b], ++id, t);
      if (r.events[0]?.kind === "hit") hits++;
      t += ATTACK_COOLDOWN_MS;
    }
    expect(hits).toBe(Math.ceil(100 / PLAYER_ATTACK_DAMAGE));
    expect(b.life.tick(0, false, t)).toBe(true); // o servidor registra a morte
    expect(killCredit(b.life, "B", t)).toBe("A");
    const after = performAttack(world, mobs, a, [a, b], ++id, t + 5000);
    expect(after.events[0].kind).toBe("miss");
  });
  it("jogador desconectado (janela de reconexao) continua sendo alvo: sair no meio da luta nao salva", () => {
    const { a, b } = pair(); // o servidor passa todos os presentes, conectados ou nao
    performAttack(world, mobs, a, [a, b], 1, 1000);
    expect(b.life.survival.health).toBe(90);
  });
  it("criatura: acerta, mata e devolve o loot para o servidor criar a mochila; morta nao leva dano de novo", () => {
    const mw = new MobWorld();
    const z = mw.add("deer", sx + 20, sy);
    const a = fighter("A", sx, sy, withClub(new PlayerLife()));
    let t = 1000;
    let id = 0;
    let drop: ReturnType<typeof performAttack>["drop"];
    const kinds: string[] = [];
    for (let i = 0; i < 4 && !drop; i++) {
      const r = performAttack(world, mw, a, [a], ++id, t, () => 0);
      kinds.push(...r.events.map((e) => e.kind));
      drop = r.drop;
      t += 1000;
    }
    expect(z.state).toBe("dead");
    expect(kinds).toContain("kill");
    expect(drop?.items[0]).toMatchObject({ id: "raw_meat" });
    const again = performAttack(world, mw, a, [a], ++id, t);
    expect(again.events[0].kind).toBe("miss");
  });
  it("zumbi pode largar porrete (sorteio controlado)", () => {
    const mw = new MobWorld();
    mw.add("zombie", sx + 20, sy);
    const a = fighter("A", sx, sy, withClub(new PlayerLife()));
    let drop: ReturnType<typeof performAttack>["drop"];
    for (let i = 1; i <= 3 && !drop; i++) drop = performAttack(world, mw, a, [a], i, i * 1000, () => 0).drop;
    expect(drop?.items.some((s) => s.id === "club")).toBe(true);
  });
  it("3.000 golpes hostis (ids repetidos, tempo parado, vitima ao lado): nunca mais dano que o permitido", () => {
    const { a, b } = pair();
    let t = 0;
    let total = 0;
    for (let i = 0; i < 3000; i++) {
      const before = b.life.survival.health;
      const r = performAttack(world, mobs, a, [a, b], i % 7, t); // ids se repetem a cada 7
      t += (i % 5) * 50; // tempo anda devagar e as vezes nao anda
      total += before - b.life.survival.health;
      if (r.res.ok && r.events[0]?.kind === "hit") expect(before - b.life.survival.health).toBe(PLAYER_ATTACK_DAMAGE);
    }
    // em 3.000 tentativas so cabem alguns golpes: ids estritamente crescentes sao poucos (0..6) e a recarga limita
    expect(total).toBeLessThanOrEqual(PLAYER_ATTACK_DAMAGE * 7);
    expect(b.life.survival.health).toBeGreaterThan(0);
  });
});

describe("inspectAttack (formato do golpe)", () => {
  it("so aceita { actionId }; alvo, dano, arma e alcance forjados sao manipulacao", () => {
    expect(inspectAttack({ actionId: 5 }).msg).toEqual({ actionId: 5 });
    for (const forged of [{ actionId: 1, target: "B" }, { actionId: 1, damage: 9999 }, { actionId: 1, weapon: "club" }, { actionId: 1, reach: 9999 }, { actionId: 1, victim: "B", x: 1, y: 2 }]) {
      const r = inspectAttack(forged);
      expect(r.msg).toBe(null);
      expect(r).toMatchObject({ reason: "campos_extras", weight: 5 });
    }
    for (const bad of [null, 3, "x", [], { actionId: -1 }, { actionId: 1.5 }, { actionId: "1" }, {}]) expect(inspectAttack(bad).msg).toBe(null);
  });
});
