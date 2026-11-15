// Etapa 6: definicoes de itens (Documento Mestre 4.4). Fonte unica de verdade: o servidor decide o que
// cada item faz; o cliente so mostra nome/icone. Nunca confiar em nome, quantidade ou efeito vindos da rede.

export const ITEM_IDS = ["canned_food", "water_bottle", "bandage", "energy_bar", "wood", "stone", "scrap", "raw_meat"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemCategory = "food" | "drink" | "medical" | "resource";

// Todos os medidores vao de 0 a 100 (100 = cheio / saudavel).
export interface VitalEffects {
  health?: number;
  hunger?: number;
  thirst?: number;
  energy?: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  weight: number; // kg (ainda nao limita nada; entra com a regra de peso)
  maxStack: number;
  effects: VitalEffects; // efeito de CONSUMIR 1 unidade
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
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === "string" && (ITEM_IDS as readonly string[]).includes(v);
}
