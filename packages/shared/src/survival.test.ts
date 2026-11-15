import { describe, expect, it } from "vitest";
import {
  ChunkedWorld,
  INVENTORY_SLOTS,
  Inventory,
  ITEMS,
  PLAYER_SPEED,
  PlayerLife,
  PlayerSim,
  RESPAWN_DELAY_MS,
  START_VITALS,
  SURVIVAL,
  SurvivalSim,
  USE_COOLDOWN_MS,
  inspectRespawn,
  inspectUseItem,
} from "./index";

describe("SurvivalSim (fome, sede, energia, vida)", () => {
  it("fome e sede caem com o tempo, sede mais rapido que fome", () => {
    const s = new SurvivalSim();
    s.tick(600, false);
    expect(s.hunger).toBeLessThan(START_VITALS.hunger);
    expect(s.thirst).toBeLessThan(START_VITALS.thirst);
    expect(START_VITALS.hunger - s.hunger).toBeLessThan(START_VITALS.thirst - s.thirst);
  });
  it("andar gasta energia; parado recupera", () => {
    const s = new SurvivalSim({ ...START_VITALS, energy: 50 });
    s.tick(60, true);
    expect(s.energy).toBeLessThan(50);
    const low = s.energy;
    s.tick(60, false);
    expect(s.energy).toBeGreaterThan(low);
  });
  it("energia baixa reduz a velocidade aos poucos, nunca abaixo do minimo", () => {
    expect(new SurvivalSim({ ...START_VITALS, energy: 100 }).speedMul).toBe(1);
    expect(new SurvivalSim({ ...START_VITALS, energy: SURVIVAL.lowThreshold }).speedMul).toBe(1);
    const half = new SurvivalSim({ ...START_VITALS, energy: SURVIVAL.lowThreshold / 2 }).speedMul;
    expect(half).toBeLessThan(1);
    expect(half).toBeGreaterThan(SURVIVAL.minSpeedMul);
    expect(new SurvivalSim({ ...START_VITALS, energy: 0 }).speedMul).toBeCloseTo(SURVIVAL.minSpeedMul, 5);
  });
  it("sem dano durante a tolerancia; depois da tolerancia a vida cai", () => {
    const s = new SurvivalSim({ health: 100, hunger: 0, thirst: 50, energy: 100 });
    s.tick(SURVIVAL.starveGraceSec - 1, false);
    expect(s.health).toBe(100);
    s.tick(10, false);
    expect(s.health).toBeLessThan(100);
  });
  it("fome E sede zeradas causam o dobro de dano", () => {
    const a = new SurvivalSim({ health: 100, hunger: 0, thirst: 50, energy: 100 });
    const b = new SurvivalSim({ health: 100, hunger: 0, thirst: 0, energy: 100 });
    a.tick(SURVIVAL.starveGraceSec + 0.001, false);
    b.tick(SURVIVAL.starveGraceSec + 0.001, false);
    a.tick(10, false);
    b.tick(10, false);
    expect(100 - b.health).toBeGreaterThan((100 - a.health) * 1.9);
  });
  it("comer zera a tolerancia (o contador reinicia)", () => {
    const s = new SurvivalSim({ health: 100, hunger: 0, thirst: 50, energy: 100 });
    s.tick(SURVIVAL.starveGraceSec - 1, false);
    s.apply({ hunger: 30 });
    s.tick(5, false);
    expect(s.health).toBeGreaterThanOrEqual(100 - 1e-9);
  });
  it("recupera vida so com fome e sede acima do minimo", () => {
    const ok = new SurvivalSim({ health: 50, hunger: 90, thirst: 90, energy: 100 });
    ok.tick(20, false);
    expect(ok.health).toBeGreaterThan(50);
    const hungry = new SurvivalSim({ health: 50, hunger: 30, thirst: 90, energy: 100 });
    hungry.tick(20, false);
    expect(hungry.health).toBe(50);
  });
  it("tempo invalido (NaN, negativo, infinito) nao muda nada", () => {
    const s = new SurvivalSim();
    for (const dt of [NaN, -5, Infinity, 0]) s.tick(dt, true);
    expect(s.hunger).toBe(START_VITALS.hunger);
    expect(Number.isFinite(s.health)).toBe(true);
  });
  it("valores sempre ficam entre 0 e 100", () => {
    const s = new SurvivalSim({ health: 500, hunger: -20, thirst: NaN, energy: 1e9 });
    expect([s.health, s.hunger, s.thirst, s.energy].every((v) => v >= 0 && v <= 100)).toBe(true);
    s.apply({ health: 1e9, hunger: 1e9 });
    expect(s.health).toBe(100);
    s.damage(1e9);
    expect(s.health).toBe(0);
    expect(s.dead).toBe(true);
  });
  it("jogador parado sem beber nem comer so morre depois de varios minutos (nao e punicao rapida)", () => {
    const s = new SurvivalSim();
    let t = 0;
    while (!s.dead && t < 3 * 3600) {
      s.tick(1, false);
      t++;
    }
    expect(s.dead).toBe(true);
    expect(t).toBeGreaterThan(15 * 60); // sede zera em ~16 min, depois mais 30 s de tolerancia
    expect(t).toBeLessThan(60 * 60);
  });
});

describe("Inventory", () => {
  it("empilha ate o maximo e abre novo slot", () => {
    const inv = new Inventory();
    expect(inv.add("bandage", 7)).toBe(0); // maxStack 5
    expect(inv.slots[0]).toEqual({ id: "bandage", qty: 5 });
    expect(inv.slots[1]).toEqual({ id: "bandage", qty: 2 });
    expect(inv.count("bandage")).toBe(7);
  });
  it("devolve o que nao coube quando cheio", () => {
    const inv = new Inventory(2);
    expect(inv.add("bandage", 12)).toBe(2);
    expect(inv.count("bandage")).toBe(10);
  });
  it("remocao valida o slot e a quantidade", () => {
    const inv = Inventory.starter();
    expect(inv.removeFromSlot(-1, 1)).toBe(false);
    expect(inv.removeFromSlot(99, 1)).toBe(false);
    expect(inv.removeFromSlot(0, 1.5)).toBe(false);
    expect(inv.removeFromSlot(0, 0)).toBe(false);
    expect(inv.removeFromSlot(0, 999)).toBe(false);
    expect(inv.removeFromSlot(INVENTORY_SLOTS - 1, 1)).toBe(false); // vazio
    expect(inv.count("water_bottle")).toBe(2);
  });
  it("quantidade invalida em add nao cria itens", () => {
    const inv = new Inventory();
    inv.add("bandage", -3);
    inv.add("bandage", NaN);
    inv.add("bandage", 2.5);
    inv.add("item_inventado" as never, 3);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });
  it("snapshot e copia: mexer nela nao altera o inventario", () => {
    const inv = Inventory.starter();
    const copy = inv.snapshot();
    copy[0]!.qty = 999;
    expect(inv.slots[0]!.qty).toBe(2);
  });
});

describe("PlayerLife (regras do servidor)", () => {
  const T0 = 1_000_000;
  const slotOf = (l: PlayerLife, id: string): number => l.inventory.slots.findIndex((s) => s?.id === id);

  it("usar item consome exatamente 1 e aplica o efeito do servidor", () => {
    const l = new PlayerLife();
    const slot = slotOf(l, "water_bottle");
    const before = l.survival.thirst;
    expect(l.useItem(slot, 1, T0).ok).toBe(true);
    expect(l.survival.thirst).toBe(Math.min(100, before + ITEMS.water_bottle.effects.thirst!));
    expect(l.survival.thirst).toBeGreaterThan(before);
    expect(l.inventory.count("water_bottle")).toBe(1);
  });
  it("replay do mesmo actionId (duplo clique/pacote repetido) nao consome 2 vezes", () => {
    const l = new PlayerLife();
    const slot = slotOf(l, "canned_food");
    expect(l.useItem(slot, 7, T0).ok).toBe(true);
    const r = l.useItem(slot, 7, T0 + 5000);
    expect(r).toEqual({ ok: false, reason: "acao_repetida", weight: 0 });
    expect(l.useItem(slot, 3, T0 + 5000).ok).toBe(false); // id menor tambem e repetido
    expect(l.inventory.count("canned_food")).toBe(1);
  });
  it("cooldown entre consumos", () => {
    const l = new PlayerLife();
    expect(l.useItem(slotOf(l, "water_bottle"), 1, T0).ok).toBe(true);
    const r = l.useItem(slotOf(l, "canned_food"), 2, T0 + USE_COOLDOWN_MS - 1);
    expect(r.ok).toBe(false);
    expect(l.useItem(slotOf(l, "canned_food"), 3, T0 + USE_COOLDOWN_MS).ok).toBe(true);
  });
  it("item sem efeito (vida cheia) nao e gasto", () => {
    const l = new PlayerLife();
    const slot = slotOf(l, "bandage");
    const r = l.useItem(slot, 1, T0);
    expect(r).toEqual({ ok: false, reason: "sem_efeito", weight: 0 });
    expect(l.inventory.count("bandage")).toBe(1);
  });
  it("slot vazio, negativo, fracionado ou fora da grade e recusado", () => {
    const l = new PlayerLife();
    let id = 0;
    for (const slot of [INVENTORY_SLOTS - 1, -1, 1.5, 999, NaN]) {
      expect(l.useItem(slot, ++id, T0 + id * 1000).ok).toBe(false);
    }
    expect(l.inventory.count("water_bottle") + l.inventory.count("canned_food") + l.inventory.count("bandage")).toBe(5);
  });
  it("morte: perde o inventario, registra o que perdeu e bloqueia acoes", () => {
    const l = new PlayerLife();
    l.survival.damage(1e9);
    expect(l.tick(1, false, T0)).toBe(true);
    expect(l.dead).toBe(true);
    expect(l.inventory.snapshot().every((s) => s === null)).toBe(true);
    expect(l.lost.reduce((n, s) => n + s.qty, 0)).toBe(5);
    expect(l.useItem(0, 1, T0 + 10).ok).toBe(false);
    expect(l.tick(1, false, T0 + 20)).toBe(false); // nao "morre de novo"
    expect(l.deaths).toBe(1);
  });
  it("reaparecer: so morto, so depois do atraso, volta com kit e medidores iniciais", () => {
    const l = new PlayerLife();
    expect(l.respawn(1, T0)).toEqual({ ok: false, reason: "vivo", weight: 2 });
    l.die(T0);
    expect(l.respawnInMs(T0 + 1000)).toBe(RESPAWN_DELAY_MS - 1000);
    expect(l.respawn(2, T0 + RESPAWN_DELAY_MS - 1).ok).toBe(false);
    expect(l.respawn(3, T0 + RESPAWN_DELAY_MS).ok).toBe(true);
    expect(l.dead).toBe(false);
    expect(l.survival.health).toBe(START_VITALS.health);
    expect(l.inventory.count("water_bottle")).toBe(2);
    expect(l.lost).toEqual([]);
  });
  it("sem duplicacao: morrer e reaparecer varias vezes nunca gera mais que o kit inicial", () => {
    const l = new PlayerLife();
    let now = T0;
    let id = 0;
    for (let i = 0; i < 50; i++) {
      l.die(now);
      l.die(now); // morte dupla e ignorada
      now += RESPAWN_DELAY_MS;
      expect(l.respawn(++id, now).ok).toBe(true);
      expect(l.respawn(++id, now).ok).toBe(false); // reaparecer 2x nao da outro kit
      expect(l.inventory.count("water_bottle")).toBe(2);
      expect(l.inventory.count("canned_food")).toBe(2);
      expect(l.inventory.count("bandage")).toBe(1);
    }
  });
  it("3.000 acoes aleatorias hostis: invariantes sempre valem", () => {
    const l = new PlayerLife();
    let seed = 99;
    const rnd = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    let now = T0;
    for (let i = 0; i < 3000; i++) {
      now += Math.floor(rnd() * 800);
      const r = rnd();
      if (r < 0.5) l.useItem(Math.floor(rnd() * 16) - 2, Math.floor(rnd() * 5000), now);
      else if (r < 0.65) l.respawn(Math.floor(rnd() * 5000), now);
      else l.tick(rnd() * 200, rnd() < 0.5, now);
      const v = l.survival;
      expect([v.health, v.hunger, v.thirst, v.energy].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)).toBe(true);
      for (const s of l.inventory.slots) if (s) expect(s.qty).toBeGreaterThan(0);
      if (l.dead) expect(l.inventory.snapshot().every((s) => s === null)).toBe(true);
    }
  });
});

describe("validacao das mensagens de acao", () => {
  it("aceita so { slot, actionId } inteiros no intervalo", () => {
    expect(inspectUseItem({ slot: 3, actionId: 10 }, 12).msg).toEqual({ slot: 3, actionId: 10 });
    expect(inspectRespawn({ actionId: 5 }).msg).toEqual({ actionId: 5 });
  });
  it("campos extras (item, quantidade, efeito) sao manipulacao", () => {
    for (const evil of [
      { slot: 0, actionId: 1, id: "ouro" },
      { slot: 0, actionId: 1, qty: 999 },
      { slot: 0, actionId: 1, heal: 9999 },
    ]) {
      expect(inspectUseItem(evil, 12).reason).toBe("campos_extras");
    }
    expect(inspectRespawn({ actionId: 1, x: 0 }).reason).toBe("campos_extras");
  });
  it("tipos e intervalos invalidos", () => {
    for (const bad of [{ slot: -1, actionId: 1 }, { slot: 12, actionId: 1 }, { slot: 1.5, actionId: 1 }, { slot: "1", actionId: 1 }, { slot: 1, actionId: -1 }, { slot: 1 }, { slot: NaN, actionId: 1 }]) {
      expect(inspectUseItem(bad, 12).msg).toBe(null);
    }
    for (const bad of [null, undefined, 3, "x", [], [1]]) {
      expect(inspectUseItem(bad, 12).msg).toBe(null);
      expect(inspectRespawn(bad).msg).toBe(null);
    }
  });
});

describe("PlayerSim com penalidade de velocidade do servidor", () => {
  const world = new ChunkedWorld(20261114, 8, 8);
  const dist = (speedMul: number): number => {
    const s = new PlayerSim(world.spawn);
    s.speedMul = speedMul;
    s.setInput({ seq: 1, ix: 1, iy: 0 });
    for (let i = 0; i < 20; i++) s.step(world, 0.05);
    return s.x - world.spawn.x;
  };
  it("speedMul menor anda menos; acima de 1 ou negativo nao passa do limite", () => {
    expect(dist(0.6)).toBeLessThan(dist(1) * 0.7);
    expect(dist(50)).toBeLessThanOrEqual(PLAYER_SPEED * 1.01);
    expect(dist(-3)).toBe(0);
  });
  it("teleport (reaparecer) move e zera a entrada", () => {
    const s = new PlayerSim(world.spawn);
    s.setInput({ seq: 1, ix: 1, iy: 1 });
    s.teleport({ x: world.spawn.x + 20, y: world.spawn.y });
    expect(s.ix).toBe(0);
    expect(s.x).toBe(world.spawn.x + 20);
  });
});
