import { describe, expect, it } from "vitest";
import {
  ChunkedWorld,
  HARVEST_COOLDOWN_MS,
  INVENTORY_SLOTS,
  ITEMS,
  ITEM_IDS,
  Inventory,
  LootWorld,
  PlayerLife,
  RECIPES,
  RECIPE_IDS,
  bestWeapon,
  craftItem,
  inspectCraft,
  isRecipeId,
  makeSave,
  missingFor,
  nodeAt,
  parseSave,
  type ItemId,
} from "./index";

const world = new ChunkedWorld();
function findNode(item: string): { tx: number; ty: number } {
  for (let ty = 1; ty < world.height - 1; ty++) for (let tx = 1; tx < world.width - 1; tx++) if (nodeAt(world, tx, ty)?.item === item) return { tx, ty };
  throw new Error("sem recurso " + item);
}
const near = (n: { tx: number; ty: number }) => ({ x: (n.tx + 0.5) * 32, y: (n.ty + 0.5) * 32 });
const inv = (items: Partial<Record<ItemId, number>>): Inventory => {
  const i = new Inventory();
  for (const [id, q] of Object.entries(items)) expect(i.add(id as ItemId, q!)).toBe(0);
  return i;
};
const lifeWith = (items: Partial<Record<ItemId, number>>): PlayerLife => {
  const l = new PlayerLife();
  l.inventory = inv(items);
  return l;
};

describe("receitas (Etapa 10)", () => {
  it("toda receita usa itens que existem, cabe na pilha e a bancada e um item", () => {
    for (const id of RECIPE_IDS) {
      const r = RECIPES[id];
      expect(r.id).toBe(id);
      expect(ITEM_IDS).toContain(r.output.id);
      expect(r.output.qty).toBeGreaterThan(0);
      expect(r.output.qty).toBeLessThanOrEqual(ITEMS[r.output.id].maxStack);
      expect(r.craftMs).toBeGreaterThan(0);
      for (const i of r.inputs) {
        expect(ITEM_IDS).toContain(i.id);
        expect(i.qty).toBeGreaterThan(0);
      }
      if (r.station) expect(ITEM_IDS).toContain(r.station);
    }
  });

  it("todo item fabricavel pode ser obtido sem circulo: bancada nao exige bancada", () => {
    expect(RECIPES.workbench.station).toBeUndefined();
    expect(RECIPES.club.station).toBeUndefined();
  });

  it("isRecipeId recusa lixo (inclusive nomes de propriedades do JS)", () => {
    for (const bad of ["__proto__", "constructor", "toString", "", "CLUB", 5, null, undefined, {}, [], NaN]) expect(isRecipeId(bad)).toBe(false);
    expect(isRecipeId("club")).toBe(true);
  });
});

describe("fabricar e atomico", () => {
  it("consome exatamente os ingredientes e entrega o resultado", () => {
    const i = inv({ wood: 5 });
    const r = craftItem(i, "club");
    expect(r.ok).toBe(true);
    expect(i.count("wood")).toBe(2);
    expect(i.count("club")).toBe(1);
  });

  it("falta ingrediente: nada muda", () => {
    const i = inv({ wood: 2 });
    const before = JSON.stringify(i.snapshot());
    expect(craftItem(i, "club")).toEqual({ ok: false, reason: "faltam_ingredientes" });
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });

  it("falta o ULTIMO ingrediente: nada foi gasto dos outros (tudo ou nada)", () => {
    const i = inv({ wood: 6, scrap: 1 }); // bancada pede 6 madeira + 2 sucata
    const before = JSON.stringify(i.snapshot());
    expect(craftItem(i, "workbench")).toEqual({ ok: false, reason: "faltam_ingredientes" });
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });

  it("receita que pede bancada: sem bancada recusa, com bancada fabrica e NAO gasta a bancada", () => {
    const i = inv({ wood: 3, stone: 2 });
    expect(craftItem(i, "axe")).toEqual({ ok: false, reason: "sem_bancada" });
    expect(i.count("wood")).toBe(3);
    i.add("workbench", 1);
    expect(craftItem(i, "axe").ok).toBe(true);
    expect(i.count("workbench")).toBe(1);
    expect(i.count("axe")).toBe(1);
    expect(i.count("wood")).toBe(0);
    expect(i.count("stone")).toBe(0);
  });

  it("inventario cheio: nada muda; se os ingredientes liberam um slot, fabrica", () => {
    const fill = (last: { id: ItemId; qty: number }): Inventory => {
      const f = new Inventory();
      for (let s = 0; s < INVENTORY_SLOTS - 1; s++) f.slots[s] = { id: "canned_food", qty: 5 };
      f.slots[INVENTORY_SLOTS - 1] = last;
      return f;
    };
    // 2 sucatas ocupam o ultimo slot: gastar libera o slot e entram 2 bandagens
    const a = fill({ id: "scrap", qty: 2 });
    expect(craftItem(a, "bandage").ok).toBe(true);
    expect(a.count("scrap")).toBe(0);
    expect(a.count("bandage")).toBe(2);
    // 4 madeiras: gastar 3 deixa 1 no slot, que continua ocupado -> nao ha onde pôr o porrete -> recusa e nada muda
    const b = fill({ id: "wood", qty: 4 });
    const before = JSON.stringify(b.snapshot());
    expect(craftItem(b, "club")).toEqual({ ok: false, reason: "inventario_cheio" });
    expect(JSON.stringify(b.snapshot())).toBe(before);
  });

  it("receita inventada ou tipo errado: recusa sem mexer", () => {
    const i = inv({ wood: 9 });
    const before = JSON.stringify(i.snapshot());
    for (const bad of ["__proto__", "ouro", 3, null, undefined, { id: "club" }]) expect(craftItem(i, bad)).toEqual({ ok: false, reason: "receita_invalida" });
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });

  it("missingFor (so para a interface) concorda com craftItem", () => {
    const i = inv({ wood: 3, stone: 3 });
    for (const id of RECIPE_IDS) {
      const miss = missingFor(i, id);
      const r = craftItem(i.clone(), id);
      expect(r.ok).toBe(miss === null);
    }
  });
});

describe("PlayerLife.craft (idempotencia, tempo, morte)", () => {
  it("repetir o mesmo actionId nao fabrica duas vezes", () => {
    const l = lifeWith({ wood: 6 });
    expect(l.craft("club", 1, 0).ok).toBe(true);
    for (let k = 0; k < 20; k++) expect(l.craft("club", 1, 10_000 + k)).toMatchObject({ ok: false, reason: "acao_repetida" });
    expect(l.inventory.count("club")).toBe(1);
    expect(l.inventory.count("wood")).toBe(3);
  });

  it("tempo da receita: ocupado ate terminar, depois libera", () => {
    const l = lifeWith({ wood: 6 });
    const ms = RECIPES.club.craftMs;
    expect(l.craft("club", 1, 1000).ok).toBe(true);
    expect(l.craft("club", 2, 1000 + ms - 1)).toMatchObject({ ok: false, reason: "em_recarga" });
    expect(l.inventory.count("wood")).toBe(3); // a recusa nao gastou nada
    expect(l.craft("club", 3, 1000 + ms).ok).toBe(true);
    expect(l.inventory.count("club")).toBe(2);
  });

  it("falha por ingrediente nao ocupa o jogador nem gasta o actionId util", () => {
    const l = lifeWith({ wood: 2 });
    expect(l.craft("club", 1, 0)).toMatchObject({ ok: false, reason: "faltam_ingredientes" });
    l.inventory.add("wood", 1);
    expect(l.craft("club", 2, 1).ok).toBe(true); // nao ficou em recarga por causa da falha
  });

  it("morto nao fabrica; reaparecer nao herda a fabricacao em andamento", () => {
    const l = lifeWith({ wood: 9 });
    expect(l.craft("club", 1, 0).ok).toBe(true);
    l.die(100);
    expect(l.craft("club", 2, 5000)).toMatchObject({ ok: false, reason: "morto" });
    expect(l.respawn(3, 100 + 5000).ok).toBe(true);
    l.inventory.add("wood", 3);
    expect(l.craft("club", 4, 5001).ok).toBe(true);
  });

  it("incrementa invVersion so quando fabrica", () => {
    const l = lifeWith({ wood: 3 });
    const v = l.invVersion;
    l.craft("axe", 1, 0); // sem bancada
    expect(l.invVersion).toBe(v);
    l.craft("club", 2, 0);
    expect(l.invVersion).toBe(v + 1);
  });

  it("3.000 pedidos hostis: nenhum item nasce do nada (contas fecham) e o inventario continua valido", () => {
    const l = lifeWith({ wood: 10, stone: 10, scrap: 10 });
    l.inventory.add("workbench", 1);
    const start = new Map<ItemId, number>(ITEM_IDS.map((id) => [id, l.inventory.count(id)]));
    const made = new Map<string, number>();
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let now = 0;
    let aid = 0;
    const junk: unknown[] = ["x", null, 7, "__proto__", { a: 1 }];
    for (let k = 0; k < 3000; k++) {
      now += Math.floor(rnd() * 2500);
      if (rnd() < 0.3) aid = Math.max(0, aid - Math.floor(rnd() * 3)); // repete ids de proposito
      else aid++;
      const recipe = rnd() < 0.15 ? junk[Math.floor(rnd() * junk.length)] : RECIPE_IDS[Math.floor(rnd() * RECIPE_IDS.length)];
      const r = l.craft(recipe, aid, now);
      if (r.ok) made.set(recipe as string, (made.get(recipe as string) ?? 0) + 1);
      if (rnd() < 0.05) start.set("wood", (start.get("wood") ?? 0) + (2 - l.inventory.add("wood", 2))); // entra madeira "do mundo" (so conta o que coube)
    }
    // conta final: inicial + entradas - ingredientes + resultados
    for (const id of ITEM_IDS) {
      let expected = start.get(id) ?? 0;
      for (const [rid, n] of made) {
        const rc = RECIPES[rid as keyof typeof RECIPES];
        for (const i of rc.inputs) if (i.id === id) expected -= i.qty * n;
        if (rc.output.id === id) expected += rc.output.qty * n;
      }
      expect(l.inventory.count(id)).toBe(expected);
    }
    for (const s of l.inventory.slots) {
      if (!s) continue;
      expect(s.qty).toBeGreaterThan(0);
      expect(s.qty).toBeLessThanOrEqual(ITEMS[s.id].maxStack);
    }
    expect([...made.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(5); // o teste de fato fabricou
  });
});

describe("validacao da mensagem REQUEST_CRAFT", () => {
  it("aceita so { recipe, actionId } validos", () => {
    expect(inspectCraft({ recipe: "club", actionId: 1 })).toEqual({ msg: { recipe: "club", actionId: 1 } });
  });
  it("campos extras (quantidade, resultado, ingredientes) sao manipulacao", () => {
    for (const extra of [{ qty: 99 }, { output: "spear" }, { inputs: [] }, { slot: 0 }, { time: 0 }]) {
      const r = inspectCraft({ recipe: "club", actionId: 1, ...extra });
      expect(r.msg).toBeNull();
      expect(r).toMatchObject({ reason: "campos_extras", weight: 5 });
    }
  });
  it("receita inventada ou actionId ruim", () => {
    for (const bad of [{ recipe: "ouro", actionId: 1 }, { recipe: "__proto__", actionId: 1 }, { recipe: 3, actionId: 1 }, { recipe: "club", actionId: -1 }, { recipe: "club", actionId: 1.5 }, { recipe: "club", actionId: "1" }, { recipe: "club" }, {}]) {
      expect(inspectCraft(bad).msg).toBeNull();
    }
    for (const bad of [null, 5, "x", []]) expect(inspectCraft(bad)).toMatchObject({ msg: null, reason: "formato_invalido" });
  });
});

describe("itens novos no resto do jogo", () => {
  it("lanca: arma de maior dano; o servidor a escolhe sozinho", () => {
    const i = inv({ club: 1 });
    expect(bestWeapon(i).item).toBe("club");
    i.add("spear", 1);
    const w = bestWeapon(i);
    expect(w.item).toBe("spear");
    expect(w.damage).toBe(ITEMS.spear.weapon!.damage);
    expect(w.reach).toBe(ITEMS.spear.weapon!.reach);
  });
  it("ferramentas e bancada nao sao armas", () => {
    for (const id of ["workbench", "axe", "pickaxe"] as const) expect(ITEMS[id].weapon).toBeUndefined();
  });
  it("salvar e carregar mantem os itens fabricados; 2 ferramentas no mesmo slot sao recusadas", () => {
    const l = lifeWith({ spear: 1, workbench: 1, axe: 1, pickaxe: 1 });
    const save = parseSave(JSON.parse(JSON.stringify(makeSave(l, 100, 100))));
    expect(save).not.toBeNull();
    for (const id of ["spear", "workbench", "axe", "pickaxe"] as const) expect(save!.slots.some((s) => s?.id === id)).toBe(true);
    const bad = JSON.parse(JSON.stringify(makeSave(l, 100, 100)));
    bad.slots[0] = { id: "axe", qty: 2 };
    expect(parseSave(bad)).toBeNull();
  });
});

describe("ferramentas de coleta", () => {
  it("sem machado: 1 madeira por coleta; com machado: 2 (e nunca mais do que resta)", () => {
    const n = findNode("wood"); // 3 unidades
    const pos = near(n);
    const a = new Inventory();
    const loot = new LootWorld();
    expect(loot.interact(world, a, pos.x, pos.y, 0)).toMatchObject({ ok: true, gained: [{ id: "wood", qty: 1 }] });
    const n2 = findNode("wood");
    expect(n2).toEqual(n);
    const b = inv({ axe: 1 });
    const loot2 = new LootWorld();
    expect(loot2.interact(world, b, pos.x, pos.y, 0)).toMatchObject({ ok: true, gained: [{ id: "wood", qty: 2 }] });
    expect(loot2.remaining(world, n.tx, n.ty)).toBe(1);
    expect(loot2.interact(world, b, pos.x, pos.y, HARVEST_COOLDOWN_MS)).toMatchObject({ ok: true, gained: [{ id: "wood", qty: 1 }] }); // so sobrava 1
    expect(b.count("wood")).toBe(3); // total do recurso: 3, nunca mais
    expect(loot2.remaining(world, n.tx, n.ty)).toBe(0);
  });
  it("picareta rende 2 de pedra; machado nao ajuda na pedra", () => {
    const n = findNode("stone");
    const pos = near(n);
    const withAxe = inv({ axe: 1 });
    expect(new LootWorld().interact(world, withAxe, pos.x, pos.y, 0)).toMatchObject({ ok: true, gained: [{ id: "stone", qty: 1 }] });
    const withPick = inv({ pickaxe: 1 });
    expect(new LootWorld().interact(world, withPick, pos.x, pos.y, 0)).toMatchObject({ ok: true, gained: [{ id: "stone", qty: 2 }] });
  });
  it("inventario sem espaco para as 2 unidades: nada e retirado do recurso", () => {
    const n = findNode("wood");
    const pos = near(n);
    const f = new Inventory();
    for (let s = 0; s < INVENTORY_SLOTS - 1; s++) f.slots[s] = { id: "canned_food", qty: 5 };
    f.slots[INVENTORY_SLOTS - 1] = { id: "wood", qty: 9 }; // cabe so 1 madeira a mais
    f.slots[0] = { id: "axe", qty: 1 };
    const before = JSON.stringify(f.snapshot());
    const loot = new LootWorld();
    expect(loot.interact(world, f, pos.x, pos.y, 0)).toEqual({ ok: false, reason: "inventario_cheio" });
    expect(JSON.stringify(f.snapshot())).toBe(before);
    expect(loot.remaining(world, n.tx, n.ty)).toBe(3);
  });
});
