import { describe, expect, it } from "vitest";
import { ITEMS, Inventory, MOBS, PERISHABLE, PlayerLife, RECIPES, SPOIL_INTERVAL_MS, craftItem, missingFor, spoilPerishables, type ItemId } from "./index";

const inv = (items: Partial<Record<ItemId, number>>): Inventory => {
  const i = new Inventory(12, 100);
  for (const [id, q] of Object.entries(items)) expect(i.add(id as ItemId, q!)).toBe(0);
  return i;
};

describe("9.4 Acougue: processamento de carcacas", () => {
  it("cervo deixa uma carcaca (nao carne direto)", () => {
    expect(MOBS.deer.drops).toEqual([{ id: "deer_carcass", min: 1, max: 1, chance: 1 }]);
  });

  it("na bancada, com faca e pano limpo: carne + couro + gordura + ossos + tendoes", () => {
    const i = inv({ deer_carcass: 1, clean_rag: 1, knife: 1, butcher_table: 1 });
    const r = craftItem(i, "butcher_deer");
    expect(r.ok).toBe(true);
    expect(i.count("raw_meat")).toBe(3);
    expect(i.count("hide")).toBe(1);
    expect(i.count("fat")).toBe(2);
    expect(i.count("bone")).toBe(2);
    expect(i.count("sinew")).toBe(2);
    expect(i.count("deer_carcass")).toBe(0);
    expect(i.count("clean_rag")).toBe(0); // higiene: o pano foi gasto
    expect(i.count("knife")).toBe(1); // a faca fica
    expect(i.slots.find((s) => s?.id === "knife")!.dur).toBe(ITEMS.knife.durability! - 1);
  });

  it("sem faca, sem bancada ou sem pano: recusa e nao mexe em nada", () => {
    const base = { deer_carcass: 1, clean_rag: 1, knife: 1, butcher_table: 1 } as const;
    const expects: [keyof typeof base, string][] = [["knife", "sem_ferramenta"], ["butcher_table", "sem_bancada"], ["clean_rag", "faltam_ingredientes"], ["deer_carcass", "faltam_ingredientes"]];
    for (const [drop, reason] of expects) {
      const items = { ...base } as Partial<Record<ItemId, number>>;
      delete items[drop];
      const i = inv(items);
      const before = JSON.stringify(i.snapshot());
      expect(craftItem(i, "butcher_deer")).toEqual({ ok: false, reason });
      expect(JSON.stringify(i.snapshot())).toBe(before);
    }
  });

  it("esfolar no campo (so faca) funciona, mas a carne sai contaminada e sem gordura/ossos", () => {
    const i = inv({ deer_carcass: 1, knife: 1 });
    expect(craftItem(i, "field_dress").ok).toBe(true);
    expect(i.count("tainted_meat")).toBe(2);
    expect(i.count("hide")).toBe(1);
    expect(i.count("fat") + i.count("bone") + i.count("sinew") + i.count("raw_meat")).toBe(0);
  });

  it("mochila cheia: nada e processado (tudo ou nada, a carcaca nao se perde)", () => {
    const i = new Inventory(4, 100);
    i.add("deer_carcass", 1);
    i.add("knife", 1);
    i.add("butcher_table", 1);
    i.add("clean_rag", 1); // 4 slots cheios; sobram 2 depois dos ingredientes, mas as saidas pedem 5
    const before = JSON.stringify(i.snapshot());
    const r = craftItem(i, "butcher_deer");
    expect(r).toEqual({ ok: false, reason: "inventario_cheio" });
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });

  it("faca gasta e quebra no ultimo uso: o uso vale, a faca some e o jogador e avisado", () => {
    const l = new PlayerLife();
    l.inventory = inv({ knife: 1 });
    l.inventory.slots.find((s) => s?.id === "knife")!.dur = 1;
    l.inventory.add("deer_carcass", 1);
    const r = l.craft("field_dress", 1, 0);
    expect(r.ok).toBe(true);
    expect(l.inventory.count("knife")).toBe(0);
    expect(l.inventory.count("tainted_meat")).toBe(2);
    expect(l.notices).toContain("Faca de acougueiro quebrou!");
  });
});

describe("9.4 Acougue: cortes, couro e conservacao", () => {
  it("cortes: carne crua vira bife (+ gordura)", () => {
    const i = inv({ raw_meat: 3, clean_rag: 1, knife: 1, butcher_table: 1 });
    expect(craftItem(i, "cut_steak").ok).toBe(true);
    expect(i.count("steak")).toBe(2);
    expect(i.count("fat")).toBe(1);
    expect(i.count("raw_meat")).toBe(0);
  });

  it("pele + gordura viram couro na bancada; a pele sozinha nao", () => {
    const i = inv({ hide: 1, fat: 1, butcher_table: 1 });
    expect(craftItem(i, "tan_hide").ok).toBe(true);
    expect(i.count("leather")).toBe(1);
    expect(craftItem(inv({ hide: 1, butcher_table: 1 }), "tan_hide")).toEqual({ ok: false, reason: "faltam_ingredientes" });
  });

  it("ossos, tendao e couro servem de arma: lanca de osso (na bancada simples)", () => {
    const i = inv({ wood: 1, bone: 2, sinew: 1, leather: 1, workbench: 1 });
    expect(craftItem(i, "bone_spear").ok).toBe(true);
    expect(ITEMS.bone_spear.weapon!.damage).toBeGreaterThan(ITEMS.spear.weapon!.damage);
  });

  it("conservar: bife + gordura vira carne conservada, que nao apodrece", () => {
    const i = inv({ steak: 2, fat: 1, clean_rag: 1, butcher_table: 1 });
    expect(craftItem(i, "preserve_meat").ok).toBe(true);
    expect(i.count("preserved_meat")).toBe(2);
    expect(PERISHABLE.preserved_meat).toBeUndefined();
    expect(spoilPerishables(i, () => 0)).toBe(0);
    expect(i.count("preserved_meat")).toBe(2);
  });

  it("nao ha circulo: faca, pano e bancada de acougue saem de recursos comuns (bancada simples)", () => {
    expect(RECIPES.knife.station).toBeUndefined();
    expect(RECIPES.clean_rag.station).toBeUndefined();
    expect(RECIPES.butcher_table.station).toBe("workbench");
    expect(RECIPES.workbench.station).toBeUndefined();
    expect(missingFor(inv({}), "field_dress")).toBe("sem_ferramenta");
  });

  it("carne contaminada machuca ao comer", () => {
    const l = new PlayerLife();
    l.inventory = inv({ tainted_meat: 1 });
    const h = l.survival.health;
    expect(l.useItem(0, 1, 1000).ok).toBe(true);
    expect(l.survival.health).toBeLessThan(h);
  });
});

describe("9.4 Acougue: apodrecimento (conservacao)", () => {
  it("sorteio baixo: carne e bife viram carne contaminada 1 para 1; carcaca vira 3", () => {
    const i = inv({ raw_meat: 2, steak: 1, deer_carcass: 1 });
    expect(spoilPerishables(i, () => 0)).toBe(4);
    expect(i.count("raw_meat") + i.count("steak") + i.count("deer_carcass")).toBe(0);
    expect(i.count("tainted_meat")).toBe(2 + 1 + 3);
  });
  it("sorteio alto: nada muda", () => {
    const i = inv({ raw_meat: 2, steak: 1, deer_carcass: 1 });
    const before = JSON.stringify(i.snapshot());
    expect(spoilPerishables(i, () => 0.999)).toBe(0);
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });
  it("sem espaco para o podre: continua como estava (nada some, tenta de novo depois)", () => {
    const i = new Inventory(2, 100);
    i.add("raw_meat", 5);
    i.add("wood", 10); // 2 slots cheios: a carne podre nao teria onde ficar
    const before = JSON.stringify(i.snapshot());
    let k = 0;
    expect(spoilPerishables(i, () => (k++ === 0 ? 0 : 0.999))).toBe(0);
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });
  it("PlayerLife.tick: apodrece so apos 1 min conectado, avisa o dono e nao conta tempo desconectado", () => {
    const l = new PlayerLife();
    l.inventory = inv({ raw_meat: 1 });
    l.tick(1, false, 0, () => 0); // marca o relogio
    l.tick(1, false, SPOIL_INTERVAL_MS - 1, () => 0);
    expect(l.inventory.count("raw_meat")).toBe(1);
    l.tick(0, false, SPOIL_INTERVAL_MS * 3, () => 0); // desconectado (dt 0): nao conta
    expect(l.inventory.count("raw_meat")).toBe(1);
    const v = l.invVersion;
    l.tick(1, false, SPOIL_INTERVAL_MS, () => 0);
    expect(l.inventory.count("tainted_meat")).toBe(1);
    expect(l.invVersion).toBe(v + 1);
    expect(l.notices.some((t) => t.includes("apodreceu"))).toBe(true);
  });
});
