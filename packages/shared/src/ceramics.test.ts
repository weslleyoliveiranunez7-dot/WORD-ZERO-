import { describe, expect, it } from "vitest";
import { ChunkedWorld, ITEMS, Inventory, LootWorld, PlayerLife, RECIPES, craftItem, nodeAt, type ItemId } from "./index";

const inv = (items: Partial<Record<ItemId, number>>): Inventory => {
  const i = new Inventory(12, 200);
  for (const [id, q] of Object.entries(items)) expect(i.add(id as ItemId, q!)).toBe(0);
  return i;
};

describe("9.6 Ceramica: argila", () => {
  const world = new ChunkedWorld();
  it("argila so na margem de lago (agua encostada em chao); agua funda nao rende", () => {
    let shore = 0;
    let deep = 0;
    for (let ty = 1; ty < world.height - 1; ty++)
      for (let tx = 1; tx < world.width - 1; tx++) {
        if (world.tileAt(tx, ty) !== "water") continue;
        const n = nodeAt(world, tx, ty);
        if (n) {
          shore++;
          expect(n).toEqual({ item: "clay", max: 4 });
        } else deep++;
      }
    expect(shore).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(0);
  });
  it("coletar argila da margem funciona e esgota", () => {
    let t: { tx: number; ty: number } | null = null;
    for (let ty = 1; ty < world.height - 1 && !t; ty++) for (let tx = 1; tx < world.width - 1 && !t; tx++) if (nodeAt(world, tx, ty)?.item === "clay") t = { tx, ty };
    const l = new LootWorld();
    const i = inv({});
    const px = (t!.tx + 0.5) * world.tileSize;
    const py = (t!.ty + 0.5) * world.tileSize;
    const r = l.interact(world, i, px, py, 0);
    expect(r.ok).toBe(true);
    expect(i.count("clay")).toBeGreaterThan(0);
  });
});

describe("9.6 Ceramica: moldagem, secagem e queima", () => {
  it("cadeia completa: argila -> pote cru -> seco -> jarro (forno de barro, sorteio bom)", () => {
    const i = inv({ clay: 3, wood: 2, kiln: 1 });
    expect(craftItem(i, "mold_pot").ok).toBe(true);
    expect(i.count("raw_pot")).toBe(1);
    expect(craftItem(i, "fire_jar", () => 0.5)).toEqual({ ok: false, reason: "faltam_ingredientes" }); // nao queima pote cru
    expect(craftItem(i, "dry_pot").ok).toBe(true);
    const r = craftItem(i, "fire_jar", () => 0.99);
    expect(r.ok && !r.failed).toBe(true);
    expect(i.count("clay_jar")).toBe(1);
    expect(i.count("wood")).toBe(0);
  });
  it("queima sem forno: recusa", () => {
    expect(craftItem(inv({ dry_pot: 1, wood: 2 }), "fire_jar")).toEqual({ ok: false, reason: "sem_bancada" });
  });
  it("peca racha (sorteio baixo): ingredientes perdidos, saem cacos, jogador avisado", () => {
    const l = new PlayerLife();
    l.inventory = inv({ dry_pot: 1, wood: 2, kiln: 1 });
    expect(l.craft("fire_jar", 1, 0, () => 0).ok).toBe(true);
    expect(l.inventory.count("clay_jar")).toBe(0);
    expect(l.inventory.count("dry_pot") + l.inventory.count("wood")).toBe(0);
    expect(l.inventory.count("shards")).toBe(2);
    expect(l.notices).toContain("A peca rachou na queima!");
  });
  it("forno de tijolos racha menos (5%) e faz jarro refinado, mais resistente", () => {
    expect(RECIPES.fire_fine_jar.fail!.chance).toBeLessThan(RECIPES.fire_jar.fail!.chance);
    expect(ITEMS.fine_jar.durability!).toBeGreaterThan(ITEMS.clay_jar.durability!);
    const i = inv({ dry_pot: 1, wood: 2, brick_kiln: 1 });
    expect(craftItem(i, "fire_fine_jar", () => 0.06).ok).toBe(true); // 6% > 5%: nao racha
    expect(i.count("fine_jar")).toBe(1);
    const j = inv({ dry_pot: 1, wood: 2, brick_kiln: 1 });
    craftItem(j, "fire_fine_jar", () => 0.04); // 4% < 5%: racha
    expect(j.count("fine_jar")).toBe(0);
    expect(j.count("shards")).toBe(2);
  });
  it("tijolos: moldar, secar, queimar; cacos baratean o molde", () => {
    const i = inv({ clay: 2, wood: 2, kiln: 1 });
    expect(craftItem(i, "mold_brick").ok).toBe(true);
    expect(craftItem(i, "dry_brick").ok).toBe(true);
    expect(craftItem(i, "fire_brick", () => 0.9).ok).toBe(true);
    expect(i.count("brick")).toBe(2);
    const g = inv({ clay: 1, shards: 1 });
    expect(craftItem(g, "mold_brick_grog").ok).toBe(true);
    expect(g.count("raw_brick")).toBe(2);
  });
  it("forno de tijolos exige forno de barro e 10 tijolos (progressao sem circulo)", () => {
    expect(RECIPES.brick_kiln.station).toBe("kiln");
    expect(RECIPES.kiln.station).toBeUndefined();
    expect(craftItem(inv({ brick: 10, stone: 4, clay: 4 }), "brick_kiln")).toEqual({ ok: false, reason: "sem_bancada" });
    expect(craftItem(inv({ brick: 10, stone: 4, clay: 4, kiln: 1 }), "brick_kiln").ok).toBe(true);
  });
  it("jarro e recipiente reutilizavel: conserva carne, gasta durabilidade, quebra no fim", () => {
    const l = new PlayerLife();
    l.inventory = inv({ steak: 3, fat: 1, clean_rag: 1, butcher_table: 1, clay_jar: 1 });
    l.inventory.slots.find((s) => s?.id === "clay_jar")!.dur = 1;
    expect(l.craft("jar_preserve", 1, 0).ok).toBe(true);
    expect(l.inventory.count("preserved_meat")).toBe(5);
    expect(l.inventory.count("clay_jar")).toBe(0);
    expect(l.notices).toContain("Jarro de barro quebrou!");
  });
  it("jarro refinado rende mais que o comum", () => {
    expect(RECIPES.jar_preserve_fine.output.qty).toBeGreaterThan(RECIPES.jar_preserve.output.qty);
  });
});
