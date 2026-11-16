import { describe, expect, it } from "vitest";
import {
  INJURY,
  ITEMS,
  Inventory,
  InjurySim,
  PlayerLife,
  RECIPES,
  SPAWN_GRACE_MS,
  applySave,
  craftItem,
  inspectUseItem,
  makeSave,
  parseSave,
  rollInjury,
  type MedicalEffects,
} from "./index";

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};
// tick limita cada passo a 60 s (o servidor chama com 0,05 s); aqui avanca em passos de 5 s
const run = (s: InjurySim, sec: number, moving: boolean, fed: boolean): number => {
  let d = 0;
  for (let t = 0; t < sec; t += 5) d += s.tick(Math.min(5, sec - t), moving, fed);
  return d;
};
const med = (id: keyof typeof ITEMS): MedicalEffects => ITEMS[id].medical!;

describe("rollInjury (tipo, parte, gravidade)", () => {
  it("mordida de zumbi vira mordida (70%) ou corte; cabeca sobe 1 nivel", () => {
    expect(rollInjury("bite", 8, seq(0.3, 0, 0.5))).toEqual({ kind: "bite", part: "torso", sev: 1 });
    expect(rollInjury("bite", 8, seq(0.3, 0, 0.9))).toEqual({ kind: "cut", part: "torso", sev: 1 });
    expect(rollInjury("bite", 8, seq(0.05, 0, 0))).toEqual({ kind: "bite", part: "head", sev: 2 });
  });
  it("golpe fraco as vezes nao fere; golpe grave sempre fere", () => {
    expect(rollInjury("blunt", 8, seq(0.6, 0.9, 0))).toBeNull(); // sev 1: chance 50%
    expect(rollInjury("blunt", 30, seq(0.6, 0.99, 0))).not.toBeNull(); // sev 3: 100%
  });
  it("contundente: contusao; fratura so em braco/perna (ou costela grave)", () => {
    expect(rollInjury("blunt", 20, seq(0.6, 0, 0.9))?.kind).toBe("bruise");
    expect(rollInjury("blunt", 20, seq(0.9, 0, 0.1))).toEqual({ kind: "fracture", part: "legs", sev: 2 });
    expect(rollInjury("blunt", 20, seq(0.3, 0, 0.1))?.kind).toBe("bruise"); // tronco sev 2 nao quebra
    expect(rollInjury("blunt", 30, seq(0.3, 0, 0.1))?.kind).toBe("fracture"); // tronco sev 3: costela
  });
  it("perfurante e cortante; queimadura sempre fere e aceita parte forcada", () => {
    expect(rollInjury("pierce", 28, seq(0.9, 0, 0.5))?.kind).toBe("puncture");
    expect(rollInjury("slash", 12, seq(0.9, 0, 0))?.kind).toBe("cut");
    expect(rollInjury("burn", 5, seq(0.99), "arms")).toEqual({ kind: "burn", part: "arms", sev: 1 });
  });
  it("valores invalidos nao ferem", () => {
    for (const bad of [NaN, Infinity, -1, 0]) expect(rollInjury("bite", bad)).toBeNull();
  });
});

describe("sangramento, infeccao e cicatrizacao", () => {
  it("corte sangra, tira vida ao longo do tempo e o corte leve estanca sozinho", () => {
    const s = new InjurySim();
    s.add("cut", "arms", 1);
    expect(s.bleeding).toBeCloseTo(0.12, 5);
    expect(run(s, 10, true, true)).toBeCloseTo(1.2, 5);
    run(s, INJURY.clotSec, true, true);
    expect(s.bleeding).toBe(0);
  });
  it("ferida grave no tronco sangra mais que no braco", () => {
    const a = new InjurySim();
    const b = new InjurySim();
    a.add("bite", "torso", 3);
    b.add("bite", "arms", 3);
    expect(a.bleeding).toBeGreaterThan(b.bleeding);
  });
  it("sem cobrir, a ferida aberta infecta; infectada tira vida e nao cicatriza", () => {
    const s = new InjurySim();
    const i = s.add("bite", "legs", 2);
    run(s, INJURY.infectionSec.bite / 2, false, true);
    expect(i.infected).toBe(false);
    expect(i.infection).toBeGreaterThan(40);
    run(s, INJURY.infectionSec.bite, false, true);
    expect(i.infected).toBe(true);
    const heal = i.healLeft;
    const dmg = run(s, 10, false, true);
    expect(dmg).toBeGreaterThan(1);
    expect(i.healLeft).toBe(heal);
    expect(s.regenBlocked).toBe(true);
  });
  it("coberta infecta bem mais devagar", () => {
    const a = new InjurySim();
    const b = new InjurySim();
    const x = a.add("cut", "arms", 2);
    const y = b.add("cut", "arms", 2);
    b.treat(med("bandage"));
    run(a, 100, true, true);
    run(b, 100, true, true);
    expect(y.infection).toBeLessThan(x.infection / 4);
  });
  it("contusao cura sozinha e some; descansar cura mais rapido; fome atrasa", () => {
    const run = (moving: boolean, fed: boolean) => {
      const s = new InjurySim();
      s.add("bruise", "torso", 1);
      let t = 0;
      while (s.list.length && t < 10_000) {
        s.tick(1, moving, fed);
        t++;
      }
      return t;
    };
    expect(run(true, true)).toBeCloseTo(INJURY.healSec.bruise, -1);
    expect(run(false, true)).toBeLessThan(run(true, true));
    expect(run(true, false)).toBeGreaterThan(run(true, true));
  });
  it("mesma ferida sem tratamento agrava em vez de empilhar; limite de feridas", () => {
    const s = new InjurySim();
    s.add("cut", "arms", 1);
    s.add("cut", "arms", 1);
    expect(s.list).toHaveLength(1);
    expect(s.list[0].sev).toBe(2);
    for (let i = 0; i < 30; i++) s.add("bruise", i % 2 ? "legs" : "head", 1), s.treat(med("dressing")), s.add("burn", i % 2 ? "legs" : "arms", 1), s.treat(med("dressing"));
    expect(s.list.length).toBeLessThanOrEqual(INJURY.maxInjuries);
  });
  it("tempo invalido nao muda nada", () => {
    const s = new InjurySim();
    s.add("cut", "arms", 2);
    for (const bad of [NaN, -5, 0, Infinity]) expect(s.tick(bad, true, true)).toBe(0);
    expect(s.list[0].age).toBe(0);
  });
});

describe("tratamento (curativo, bandagem, tala, remedios, kit)", () => {
  it("bandagem estanca qualquer sangramento; curativo so alivia o grave", () => {
    const a = new InjurySim();
    const b = new InjurySim();
    a.add("bite", "arms", 3);
    b.add("bite", "arms", 3);
    const before = b.bleeding;
    expect(a.treat(med("bandage"))).toBe(true);
    expect(a.bleeding).toBe(0);
    expect(b.treat(med("dressing"))).toBe(true);
    expect(b.bleeding).toBeGreaterThan(0);
    expect(b.bleeding).toBeLessThan(before);
    expect(b.treat(med("dressing"))).toBe(false); // ja coberta: nao gasta outro
    expect(b.treat(med("bandage"))).toBe(true); // bandagem completa o servico
    expect(b.bleeding).toBe(0);
  });
  it("curativo estanca corte leve de vez", () => {
    const s = new InjurySim();
    s.add("cut", "legs", 1);
    expect(s.treat(med("dressing"))).toBe(true);
    expect(s.bleeding).toBe(0);
  });
  it("um item trata UMA ferida (a mais urgente) ou a parte escolhida", () => {
    const s = new InjurySim();
    s.add("cut", "arms", 2);
    s.add("bite", "legs", 3);
    s.treat(med("bandage"));
    expect(s.list.find((i) => i.part === "legs")!.bleed).toBe(0); // a mais urgente
    expect(s.list.find((i) => i.part === "arms")!.bleed).toBeGreaterThan(0);
    s.treat(med("bandage"), "arms");
    expect(s.bleeding).toBe(0);
    expect(s.treat(med("bandage"), "head")).toBe(false); // parte sem ferida
  });
  it("tala imobiliza fratura e so ela; fratura com tala cura, sem tala quase nao", () => {
    const s = new InjurySim();
    s.add("fracture", "legs", 2);
    s.add("cut", "arms", 1);
    const fr = s.list[0];
    const free = s.condition("legs");
    expect(s.treat(med("splint"))).toBe(true);
    expect(fr.care).toBe(2);
    expect(s.condition("legs")).toBeGreaterThan(free);
    expect(s.treat(med("splint"))).toBe(false);
    const a = new InjurySim();
    const b = new InjurySim();
    a.add("fracture", "arms", 1);
    b.add("fracture", "arms", 1);
    b.treat(med("splint"));
    run(a, 300, true, true);
    run(b, 300, true, true);
    expect(b.list[0].healLeft).toBeLessThan(a.list[0].healLeft - 100);
  });
  it("antibiotico cura infeccao; antisseptico so atua antes de infectar", () => {
    const s = new InjurySim();
    const i = s.add("puncture", "torso", 1);
    expect(s.treat(med("antiseptic"))).toBe(false); // nada a desinfetar ainda
    run(s, 200, true, true);
    expect(i.infection).toBeGreaterThan(0);
    expect(s.treat(med("antiseptic"))).toBe(true);
    expect(i.infection).toBe(0);
    run(s, INJURY.infectionSec.puncture * 2, true, true);
    expect(i.infected).toBe(true);
    expect(s.treat(med("antiseptic"))).toBe(false);
    expect(s.treat(med("antibiotic"))).toBe(true);
    expect(i.infected).toBe(false);
    expect(s.treat(med("antibiotic"))).toBe(false);
  });
  it("analgesico reduz a dor so se houver dor e nao se empilha", () => {
    const s = new InjurySim();
    expect(s.treat(med("painkiller"))).toBe(false);
    s.add("fracture", "legs", 3);
    const raw = s.pain;
    expect(raw).toBeGreaterThan(40);
    expect(s.treat(med("painkiller"))).toBe(true);
    expect(s.pain).toBeLessThan(raw / 2);
    expect(s.treat(med("painkiller"))).toBe(false);
    run(s, 400, false, true);
    expect(s.painLeft).toBe(0);
  });
  it("kit trata todas as feridas e a dor de uma vez", () => {
    const s = new InjurySim();
    s.add("bite", "arms", 3);
    s.add("cut", "legs", 2);
    s.add("burn", "torso", 1);
    run(s, 100, true, true);
    expect(s.treat(med("first_aid_kit"))).toBe(true);
    expect(s.bleeding).toBe(0);
    expect(s.list.every((i) => i.care === 1 && i.infection === 0)).toBe(true);
    expect(s.painLeft).toBeGreaterThan(0);
  });
});

describe("partes do corpo", () => {
  it("pernas feridas deixam mais lento; sem ferida a velocidade e 1", () => {
    const s = new InjurySim();
    expect(s.speedMul).toBe(1);
    s.add("fracture", "legs", 3);
    expect(s.speedMul).toBeLessThan(0.7);
    expect(s.speedMul).toBeGreaterThanOrEqual(INJURY.minSpeedMul);
    const h = new InjurySim();
    h.add("fracture", "head", 3);
    expect(h.condition("legs")).toBe(100);
    expect(h.speedMul).toBeGreaterThan(s.speedMul); // so a dor pesa
  });
  it("bracos feridos enfraquecem o golpe; sem ferida a arma e a mesma", () => {
    const w = ITEMS.club.weapon!;
    const s = new InjurySim();
    expect(s.adjustWeapon(w)).toBe(w);
    s.add("fracture", "arms", 3);
    const adj = s.adjustWeapon(w);
    expect(adj.damage).toBeLessThan(w.damage);
    expect(adj.cooldownMs).toBeGreaterThan(w.cooldownMs);
    expect(adj.reach).toBe(w.reach);
  });
  it("condicao volta conforme cicatriza", () => {
    const s = new InjurySim();
    s.add("bite", "arms", 2);
    s.treat(med("bandage"));
    const c0 = s.condition("arms");
    run(s, INJURY.healSec.bite * 1.5 * 0.6, true, true);
    expect(s.condition("arms")).toBeGreaterThan(c0);
    run(s, INJURY.healSec.bite * 3, true, true);
    expect(s.condition("arms")).toBe(100);
    expect(s.list).toHaveLength(0);
  });
});

describe("PlayerLife com ferimentos", () => {
  const rng0 = () => seq(0.3, 0, 0); // tronco, sempre fere, mordida
  it("mordida de criatura tira vida na hora e abre ferida que sangra e bloqueia a regeneracao", () => {
    const l = new PlayerLife();
    expect(l.takeMobHit(8, rng0())).toBe(true);
    expect(l.survival.health).toBe(92);
    expect(l.injuries.list).toHaveLength(1);
    const h = l.survival.health;
    l.tick(10, false, 1000);
    expect(l.survival.health).toBeLessThan(h); // sangrou e NAO regenerou
    l.useItem(0, 1, 1000); // slot 0 = comida? so confere que nada quebra
  });
  it("bandagem usada: estanca, cobre e (se ferido) cura um pouco; sem ferida e vida cheia, nao gasta", () => {
    const l = new PlayerLife();
    const slot = l.inventory.slots.findIndex((s) => s?.id === "bandage");
    expect(l.useItem(slot, 1, 1000)).toMatchObject({ ok: false, reason: "sem_efeito" });
    expect(l.inventory.count("bandage")).toBe(1);
    l.takeMobHit(8, rng0());
    expect(l.useItem(slot, 2, 2000).ok).toBe(true);
    expect(l.injuries.bleeding).toBe(0);
    expect(l.inventory.count("bandage")).toBe(0);
  });
  it("tratar a parte errada nao gasta; parte certa gasta", () => {
    const l = new PlayerLife();
    l.inventory.add("splint", 1);
    l.takeMobHit(8, rng0());
    const slot = l.inventory.slots.findIndex((s) => s?.id === "splint");
    expect(l.useItem(slot, 1, 1000, "legs")).toMatchObject({ ok: false, reason: "sem_efeito" });
    expect(l.inventory.count("splint")).toBe(1);
  });
  it("pode morrer sangrando; a morte limpa as feridas e reaparecer volta sem feridas", () => {
    const l = new PlayerLife();
    l.survival.health = 5;
    l.takeMobHit(3, seq(0.3, 0, 0.1));
    l.injuries.add("bite", "torso", 3);
    let died = false;
    for (let t = 0; t < 30 && !died; t++) died = l.tick(1, false, 1000 + t);
    expect(died).toBe(true);
    expect(l.injuries.list).toHaveLength(0);
    expect(l.respawn(99, 100_000).ok).toBe(true);
    expect(l.injuries.list).toHaveLength(0);
  });
  it("PvP: golpe com tipo fere; sem tipo (legado) so tira vida", () => {
    const a = new PlayerLife();
    const b = new PlayerLife();
    b.takeHit(10, "A", 1000);
    expect(b.injuries.list).toHaveLength(0);
    a.takeHit(28, "B", 1000, { type: "pierce", rng: seq(0.6, 0, 0.5) });
    expect(a.injuries.list[0].kind).toBe("puncture");
    expect(a.survival.health).toBe(72);
  });
  it("protecao de reaparecimento continua valendo para PvP", () => {
    const l = new PlayerLife();
    l.die(0);
    l.respawn(1, 10_000);
    expect(l.takeHit(10, "A", 10_000 + 1, { type: "bite" })).toBe(false);
    expect(l.injuries.list).toHaveLength(0);
    expect(l.takeHit(10, "A", 10_000 + SPAWN_GRACE_MS, { type: "blunt", rng: seq(0.6, 0, 0) })).toBe(true);
  });
  it("velocidade final mistura fome/energia e ferimentos", () => {
    const l = new PlayerLife();
    expect(l.speedMul).toBe(1);
    l.injuries.add("fracture", "legs", 2);
    expect(l.speedMul).toBeLessThan(1);
    l.survival.energy = 0;
    expect(l.speedMul).toBeGreaterThanOrEqual(0.3);
  });
  it("queimadura (tocha) fere os bracos", () => {
    const l = new PlayerLife();
    l.scorch(2);
    expect(l.injuries.list[0]).toMatchObject({ kind: "burn", part: "arms", sev: 2 });
  });
});

describe("salvar e carregar feridas", () => {
  it("feridas e analgesico sobrevivem ao salvar/carregar", () => {
    const l = new PlayerLife();
    l.injuries.add("bite", "legs", 2);
    l.injuries.add("fracture", "arms", 1);
    l.injuries.treat(med("splint"));
    run(l.injuries, 20, true, true);
    const save = parseSave(JSON.parse(JSON.stringify(makeSave(l, 100, 100))));
    expect(save?.inj?.list).toHaveLength(2);
    const l2 = new PlayerLife();
    applySave(l2, save!);
    expect(l2.injuries.list.map((i) => [i.kind, i.part, i.sev, i.care])).toEqual(l.injuries.list.map((i) => [i.kind, i.part, i.sev, i.care]));
    expect(l2.injuries.bleeding).toBeCloseTo(l.injuries.bleeding, 5);
  });
  it("save antigo (sem feridas) e dado invalido de feridas nao derrubam o save", () => {
    const l = new PlayerLife();
    const base = JSON.parse(JSON.stringify(makeSave(l, 1, 1)));
    expect(base.inj).toBeUndefined();
    expect(parseSave(base)).not.toBeNull();
    for (const bad of [{ list: [{ kind: "x" }], painLeft: 0 }, "oi", 5, { list: new Array(50).fill(0) }, { list: [{ kind: "cut", part: "arms", sev: 9, care: 0, bleed: 0, infection: 0, infected: false, healLeft: 1, healTotal: 1, age: 0 }] }]) {
      const s = parseSave({ ...base, inj: bad });
      expect(s).not.toBeNull();
      expect(s!.inj).toBeUndefined();
    }
  });
  it("morto salva como recomecar, sem feridas", () => {
    const l = new PlayerLife();
    l.injuries.add("bite", "legs", 3);
    l.die(1);
    expect(makeSave(l, 5, 5).inj).toBeUndefined();
  });
});

describe("itens, receitas e mensagens", () => {
  it("itens medicos tem efeito real e receitas fecham a conta", () => {
    for (const id of ["dressing", "splint", "painkiller", "antibiotic", "antiseptic", "first_aid_kit", "bandage"] as const) expect(ITEMS[id].medical).toBeDefined();
    const inv = new Inventory();
    inv.add("scrap", 3);
    inv.add("wood", 2);
    expect(craftItem(inv, "dressing").ok).toBe(true);
    expect(inv.count("dressing")).toBe(2);
    expect(craftItem(inv, "splint").ok).toBe(true);
    expect(inv.count("splint")).toBe(1);
    expect(RECIPES.first_aid_kit.station).toBe("workbench");
  });
  it("REQUEST_USE_ITEM aceita `part` valida e recusa invalida", () => {
    expect(inspectUseItem({ slot: 0, actionId: 1 }, 12).msg).toEqual({ slot: 0, actionId: 1 });
    expect(inspectUseItem({ slot: 0, actionId: 1, part: "legs" }, 12).msg).toEqual({ slot: 0, actionId: 1, part: "legs" });
    for (const part of ["pescoco", 3, null, {}]) expect(inspectUseItem({ slot: 0, actionId: 1, part }, 12).msg).toBeNull();
  });
});
