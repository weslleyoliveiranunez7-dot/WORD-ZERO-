import { Inventory, type ItemStack } from "./inventory";
import { isItemId, type ItemId } from "./items";

// Etapa 10: receitas e fabricacao (Documento Mestre 5.3). Logica pura, so o SERVIDOR chama `craftItem`.
// A fabricacao e uma TRANSACAO: ou consome tudo e entrega o resultado, ou nao altera nada.
// Valores provisorios (balancear depois de jogar).

export const RECIPE_IDS = ["club", "bandage", "workbench", "axe", "pickaxe", "spear", "torch", "dressing", "splint", "first_aid_kit", "knife", "butcher_table", "clean_rag", "field_dress", "butcher_deer", "cut_steak", "tan_hide", "preserve_meat", "bone_spear", "kiln", "brick_kiln", "mold_pot", "mold_brick", "mold_brick_grog", "dry_pot", "dry_brick", "fire_jar", "fire_brick", "fire_fine_jar", "jar_preserve", "jar_preserve_fine", "sickle", "fiber_dressing", "herbal_salve"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface Recipe {
  id: RecipeId;
  inputs: ItemStack[]; // ingredientes (consumidos)
  output: ItemStack;
  extra?: ItemStack[]; // 9.4: saidas adicionais (subprodutos). Entram na mesma transacao do `output`
  fail?: { chance: number; output: ItemStack[] }; // 9.6: chance (0..1) de a peca RACHAR na queima: no lugar do resultado saem estes itens
  tool?: ItemId; // 9.4: ferramenta que precisa estar no INVENTARIO; NAO e consumida, mas perde 1 de durabilidade por uso
  station?: ItemId; // estacao de trabalho: precisa estar no INVENTARIO e NAO e consumida (na Etapa 11 vira "perto da bancada")
  craftMs: number; // tempo da fabricacao: o jogador fica ocupado (nao pode fabricar de novo) por este tempo
}

export const RECIPES: Record<RecipeId, Recipe> = {
  club: { id: "club", inputs: [{ id: "wood", qty: 3 }], output: { id: "club", qty: 1 }, craftMs: 1500 },
  bandage: { id: "bandage", inputs: [{ id: "scrap", qty: 2 }], output: { id: "bandage", qty: 2 }, craftMs: 1000 },
  workbench: { id: "workbench", inputs: [{ id: "wood", qty: 6 }, { id: "scrap", qty: 2 }], output: { id: "workbench", qty: 1 }, craftMs: 3000 },
  axe: { id: "axe", inputs: [{ id: "wood", qty: 3 }, { id: "stone", qty: 2 }], output: { id: "axe", qty: 1 }, station: "workbench", craftMs: 2000 },
  pickaxe: { id: "pickaxe", inputs: [{ id: "wood", qty: 3 }, { id: "stone", qty: 3 }], output: { id: "pickaxe", qty: 1 }, station: "workbench", craftMs: 2000 },
  torch: { id: "torch", inputs: [{ id: "wood", qty: 2 }], output: { id: "torch", qty: 1 }, craftMs: 1200 },
  spear: { id: "spear", inputs: [{ id: "wood", qty: 2 }, { id: "stone", qty: 1 }], output: { id: "spear", qty: 1 }, station: "workbench", craftMs: 2000 },
  // Etapa 6b: medicina de campo
  dressing: { id: "dressing", inputs: [{ id: "scrap", qty: 1 }], output: { id: "dressing", qty: 2 }, craftMs: 800 },
  splint: { id: "splint", inputs: [{ id: "wood", qty: 2 }, { id: "scrap", qty: 1 }], output: { id: "splint", qty: 1 }, craftMs: 1500 },
  first_aid_kit: { id: "first_aid_kit", inputs: [{ id: "bandage", qty: 2 }, { id: "dressing", qty: 2 }, { id: "scrap", qty: 2 }], output: { id: "first_aid_kit", qty: 1 }, station: "workbench", craftMs: 2500 },
  // 9.4 Acougue (valores provisorios). Higiene: o pano limpo e consumido nas receitas feitas na bancada; sem bancada, a carne sai contaminada.
  knife: { id: "knife", inputs: [{ id: "scrap", qty: 2 }, { id: "wood", qty: 1 }], output: { id: "knife", qty: 1 }, craftMs: 1500 },
  butcher_table: { id: "butcher_table", inputs: [{ id: "wood", qty: 6 }, { id: "scrap", qty: 3 }, { id: "stone", qty: 2 }], output: { id: "butcher_table", qty: 1 }, station: "workbench", craftMs: 3500 },
  clean_rag: { id: "clean_rag", inputs: [{ id: "scrap", qty: 1 }, { id: "water_bottle", qty: 1 }], output: { id: "clean_rag", qty: 2 }, craftMs: 800 },
  field_dress: { id: "field_dress", inputs: [{ id: "deer_carcass", qty: 1 }], output: { id: "tainted_meat", qty: 2 }, extra: [{ id: "hide", qty: 1 }], tool: "knife", craftMs: 4000 },
  butcher_deer: { id: "butcher_deer", inputs: [{ id: "deer_carcass", qty: 1 }, { id: "clean_rag", qty: 1 }], output: { id: "raw_meat", qty: 3 }, extra: [{ id: "hide", qty: 1 }, { id: "fat", qty: 2 }, { id: "bone", qty: 2 }, { id: "sinew", qty: 2 }], station: "butcher_table", tool: "knife", craftMs: 5000 },
  cut_steak: { id: "cut_steak", inputs: [{ id: "raw_meat", qty: 3 }, { id: "clean_rag", qty: 1 }], output: { id: "steak", qty: 2 }, extra: [{ id: "fat", qty: 1 }], station: "butcher_table", tool: "knife", craftMs: 2500 },
  tan_hide: { id: "tan_hide", inputs: [{ id: "hide", qty: 1 }, { id: "fat", qty: 1 }], output: { id: "leather", qty: 1 }, station: "butcher_table", craftMs: 4000 },
  preserve_meat: { id: "preserve_meat", inputs: [{ id: "steak", qty: 2 }, { id: "fat", qty: 1 }, { id: "clean_rag", qty: 1 }], output: { id: "preserved_meat", qty: 2 }, station: "butcher_table", craftMs: 3000 },
  // 9.6 Ceramica (valores provisorios). Moldar -> secar -> queimar. Forno de barro racha 20%; forno de tijolos 5% e faz jarro refinado.
  kiln: { id: "kiln", inputs: [{ id: "clay", qty: 6 }, { id: "stone", qty: 4 }], output: { id: "kiln", qty: 1 }, craftMs: 4000 },
  brick_kiln: { id: "brick_kiln", inputs: [{ id: "brick", qty: 10 }, { id: "stone", qty: 4 }, { id: "clay", qty: 4 }], output: { id: "brick_kiln", qty: 1 }, station: "kiln", craftMs: 5000 },
  mold_pot: { id: "mold_pot", inputs: [{ id: "clay", qty: 3 }], output: { id: "raw_pot", qty: 1 }, craftMs: 2000 },
  mold_brick: { id: "mold_brick", inputs: [{ id: "clay", qty: 2 }], output: { id: "raw_brick", qty: 2 }, craftMs: 1500 },
  mold_brick_grog: { id: "mold_brick_grog", inputs: [{ id: "clay", qty: 1 }, { id: "shards", qty: 1 }], output: { id: "raw_brick", qty: 2 }, craftMs: 1500 },
  dry_pot: { id: "dry_pot", inputs: [{ id: "raw_pot", qty: 1 }], output: { id: "dry_pot", qty: 1 }, craftMs: 6000 },
  dry_brick: { id: "dry_brick", inputs: [{ id: "raw_brick", qty: 2 }], output: { id: "dry_brick", qty: 2 }, craftMs: 6000 },
  fire_jar: { id: "fire_jar", inputs: [{ id: "dry_pot", qty: 1 }, { id: "wood", qty: 2 }], output: { id: "clay_jar", qty: 1 }, station: "kiln", fail: { chance: 0.2, output: [{ id: "shards", qty: 2 }] }, craftMs: 8000 },
  fire_brick: { id: "fire_brick", inputs: [{ id: "dry_brick", qty: 2 }, { id: "wood", qty: 2 }], output: { id: "brick", qty: 2 }, station: "kiln", fail: { chance: 0.2, output: [{ id: "shards", qty: 1 }] }, craftMs: 8000 },
  fire_fine_jar: { id: "fire_fine_jar", inputs: [{ id: "dry_pot", qty: 1 }, { id: "wood", qty: 2 }], output: { id: "fine_jar", qty: 1 }, station: "brick_kiln", fail: { chance: 0.05, output: [{ id: "shards", qty: 2 }] }, craftMs: 8000 },
  // O jarro e recipiente reutilizavel: conserva mais carne por vez (liga com 9.4 Conservacao).
  jar_preserve: { id: "jar_preserve", inputs: [{ id: "steak", qty: 3 }, { id: "fat", qty: 1 }, { id: "clean_rag", qty: 1 }], output: { id: "preserved_meat", qty: 5 }, station: "butcher_table", tool: "clay_jar", craftMs: 3500 },
  jar_preserve_fine: { id: "jar_preserve_fine", inputs: [{ id: "steak", qty: 3 }, { id: "fat", qty: 1 }, { id: "clean_rag", qty: 1 }], output: { id: "preserved_meat", qty: 6 }, station: "butcher_table", tool: "fine_jar", craftMs: 3500 },
  // 9.3 Coleta: ferramenta adequada e usos dos recursos de chao.
  sickle: { id: "sickle", inputs: [{ id: "scrap", qty: 2 }, { id: "wood", qty: 1 }, { id: "components", qty: 1 }], output: { id: "sickle", qty: 1 }, craftMs: 1800 },
  fiber_dressing: { id: "fiber_dressing", inputs: [{ id: "fiber", qty: 3 }], output: { id: "dressing", qty: 2 }, craftMs: 1000 },
  herbal_salve: { id: "herbal_salve", inputs: [{ id: "herb", qty: 3 }, { id: "fat", qty: 1 }], output: { id: "antiseptic", qty: 1 }, craftMs: 2000 },
  bone_spear: { id: "bone_spear", inputs: [{ id: "wood", qty: 1 }, { id: "bone", qty: 2 }, { id: "sinew", qty: 1 }, { id: "leather", qty: 1 }], output: { id: "bone_spear", qty: 1 }, station: "workbench", craftMs: 2500 },
};

export function isRecipeId(v: unknown): v is RecipeId {
  return typeof v === "string" && (RECIPE_IDS as readonly string[]).includes(v);
}

// Confere so se da para fabricar agora (usado pelo cliente para destacar a receita; o servidor SEMPRE refaz a conta).
export function missingFor(inv: Inventory, id: RecipeId): string | null {
  const r = RECIPES[id];
  if (r.station && inv.count(r.station) < 1) return "sem_bancada";
  if (r.tool && inv.count(r.tool) < 1) return "sem_ferramenta";
  for (const i of r.inputs) if (inv.count(i.id) < i.qty) return "faltam_ingredientes";
  return null;
}

// broke: a ferramenta quebrou neste uso; failed: a peca rachou na queima (saiu `fail.output`, ingredientes perdidos)
export type CraftResult = { ok: true; recipe: Recipe; broke?: ItemId; failed?: boolean } | { ok: false; reason: string };

// Transacao atomica: trabalha numa COPIA do inventario e so aplica se tudo deu certo.
export function craftItem(inv: Inventory, id: unknown, rng: () => number = Math.random): CraftResult {
  if (!isRecipeId(id)) return { ok: false, reason: "receita_invalida" };
  const r = RECIPES[id];
  if (r.station && inv.count(r.station) < 1) return { ok: false, reason: "sem_bancada" };
  if (r.tool && inv.count(r.tool) < 1) return { ok: false, reason: "sem_ferramenta" };
  const trial = inv.clone();
  for (const i of r.inputs) if (!isItemId(i.id) || !trial.removeById(i.id, i.qty)) return { ok: false, reason: "faltam_ingredientes" };
  let broke: ItemId | undefined;
  if (r.tool) {
    const slot = trial.slots.findIndex((s) => s?.id === r.tool);
    broke = trial.wear(slot, 1) ?? undefined; // quebrou = sumiu da copia; o uso atual ainda vale
  }
  // os ingredientes (e a ferramenta quebrada) liberam espaco antes de entregar; tudo ou nada
  const failed = !!r.fail && rng() < r.fail.chance; // so o servidor sorteia
  for (const o of failed ? r.fail!.output : [r.output, ...(r.extra ?? [])]) if (trial.add(o.id, o.qty) > 0) return { ok: false, reason: "inventario_cheio" };
  inv.copyFrom(trial);
  return { ok: true, recipe: r, ...(broke ? { broke } : {}), ...(failed ? { failed: true } : {}) };
}
