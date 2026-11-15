// Etapa 6: definicoes de itens (Documento Mestre 4.4). Fonte unica de verdade: o servidor decide o que
// cada item faz; o cliente so mostra nome/icone. Nunca confiar em nome, quantidade ou efeito vindos da rede.

export const ITEM_IDS = ["canned_food", "water_bottle", "bandage", "energy_bar", "wood", "stone", "scrap", "raw_meat", "club", "workbench", "axe", "pickaxe", "spear"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemCategory = "food" | "drink" | "medical" | "resource" | "weapon" | "tool";

// Todos os medidores vao de 0 a 100 (100 = cheio / saudavel).
export interface VitalEffects {
  health?: number;
  hunger?: number;
  thirst?: number;
  energy?: number;
}

// Etapa 9: o que uma arma faz. So o servidor le isto para decidir dano, alcance e recarga.
export interface WeaponStats {
  damage: number; // vida tirada por golpe que acerta
  reach: number; // px: distancia maxima atacante -> alvo (posicoes que o SERVIDOR conhece)
  cooldownMs: number; // tempo minimo entre dois golpes
}

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  weight: number; // kg (ainda nao limita nada; entra com a regra de peso)
  maxStack: number;
  effects: VitalEffects; // efeito de CONSUMIR 1 unidade
  weapon?: WeaponStats; // Etapa 9: se existir, o item e arma (usada automaticamente: a de maior dano no inventario)
}

export const ITEMS: Record<ItemId, ItemDef> = {
  canned_food: { id: "canned_food", name: "Comida enlatada", category: "food", weight: 0.4, maxStack: 5, effects: { hunger: 35 } },
  water_bottle: { id: "water_bottle", name: "Garrafa de agua", category: "drink", weight: 0.5, maxStack: 5, effects: { thirst: 40 } },
  bandage: { id: "bandage", name: "Bandagem", category: "medical", weight: 0.1, maxStack: 5, effects: { health: 25 } },
  energy_bar: { id: "energy_bar", name: "Barra de energia", category: "food", weight: 0.1, maxStack: 10, effects: { energy: 30, hunger: 10 } },
  raw_meat: { id: "raw_meat", name: "Carne crua", category: "food", weight: 0.3, maxStack: 5, effects: { hunger: 15 } },
  // Etapa 7: recursos coletaveis (sem efeito ao consumir; servem para crafting na Etapa 10)
  wood: { id: "wood", name: "Madeira", category: "resource", weight: 1, maxStack: 10, effects: {} },
  stone: { id: "stone", name: "Pedra", category: "resource", weight: 1.5, maxStack: 10, effects: {} },
  scrap: { id: "scrap", name: "Sucata", category: "resource", weight: 0.8, maxStack: 10, effects: {} },
  // Etapa 9: primeira arma (corpo a corpo). Valores provisorios, balancear depois de jogar.
  club: { id: "club", name: "Porrete", category: "weapon", weight: 2, maxStack: 1, effects: {}, weapon: { damage: 20, reach: 52, cooldownMs: 800 } },
  // Etapa 10: itens fabricaveis. Valores provisorios. Ferramentas NAO sao armas: servem para coletar (ver HARVEST_TOOL em loot.ts).
  workbench: { id: "workbench", name: "Bancada simples", category: "tool", weight: 8, maxStack: 1, effects: {} }, // estacao: precisa estar no inventario (nao e gasta)
  axe: { id: "axe", name: "Machado improvisado", category: "tool", weight: 2, maxStack: 1, effects: {} }, // arvore rende 2 madeiras por coleta
  pickaxe: { id: "pickaxe", name: "Picareta simples", category: "tool", weight: 2.5, maxStack: 1, effects: {} }, // pedra/sucata rendem 2 por coleta
  spear: { id: "spear", name: "Lanca", category: "weapon", weight: 2, maxStack: 1, effects: {}, weapon: { damage: 28, reach: 72, cooldownMs: 900 } },
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === "string" && (ITEM_IDS as readonly string[]).includes(v);
}
