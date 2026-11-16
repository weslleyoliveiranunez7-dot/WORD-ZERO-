import { Inventory, type ItemStack } from "./inventory";
import { isItemId, type ItemId } from "./items";

// Etapa 10: receitas e fabricacao (Documento Mestre 5.3). Logica pura, so o SERVIDOR chama `craftItem`.
// A fabricacao e uma TRANSACAO: ou consome tudo e entrega o resultado, ou nao altera nada.
// Valores provisorios (balancear depois de jogar).

export const RECIPE_IDS = ["club", "bandage", "workbench", "axe", "pickaxe", "spear", "torch", "dressing", "splint", "first_aid_kit"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface Recipe {
  id: RecipeId;
  inputs: ItemStack[]; // ingredientes (consumidos)
  output: ItemStack;
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
};

export function isRecipeId(v: unknown): v is RecipeId {
  return typeof v === "string" && (RECIPE_IDS as readonly string[]).includes(v);
}

// Confere so se da para fabricar agora (usado pelo cliente para destacar a receita; o servidor SEMPRE refaz a conta).
export function missingFor(inv: Inventory, id: RecipeId): string | null {
  const r = RECIPES[id];
  if (r.station && inv.count(r.station) < 1) return "sem_bancada";
  for (const i of r.inputs) if (inv.count(i.id) < i.qty) return "faltam_ingredientes";
  return null;
}

export type CraftResult = { ok: true; recipe: Recipe } | { ok: false; reason: string };

// Transacao atomica: trabalha numa COPIA do inventario e so aplica se tudo deu certo.
export function craftItem(inv: Inventory, id: unknown): CraftResult {
  if (!isRecipeId(id)) return { ok: false, reason: "receita_invalida" };
  const r = RECIPES[id];
  if (r.station && inv.count(r.station) < 1) return { ok: false, reason: "sem_bancada" };
  const trial = inv.clone();
  for (const i of r.inputs) if (!isItemId(i.id) || !trial.removeById(i.id, i.qty)) return { ok: false, reason: "faltam_ingredientes" };
  if (trial.add(r.output.id, r.output.qty) > 0) return { ok: false, reason: "inventario_cheio" }; // os ingredientes liberam espaco antes de entregar
  inv.copyFrom(trial);
  return { ok: true, recipe: r };
}
