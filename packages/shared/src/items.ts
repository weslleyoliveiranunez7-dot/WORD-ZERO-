// Etapa 6: definicoes de itens (Documento Mestre 4.4). Fonte unica de verdade: o servidor decide o que
// cada item faz; o cliente so mostra nome/icone. Nunca confiar em nome, quantidade ou efeito vindos da rede.

import type { DamageType } from "./injuries";

export const ITEM_IDS = ["canned_food", "water_bottle", "bandage", "energy_bar", "wood", "stone", "scrap", "raw_meat", "club", "workbench", "axe", "pickaxe", "spear", "torch", "dressing", "splint", "painkiller", "antibiotic", "antiseptic", "first_aid_kit"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemCategory = "food" | "drink" | "medical" | "resource" | "weapon" | "tool";

// Todos os medidores vao de 0 a 100 (100 = cheio / saudavel).
export interface VitalEffects {
  health?: number;
  hunger?: number;
  thirst?: number;
  energy?: number;
}

// Etapa 6b: o que um item medico trata (so o servidor le; ver InjurySim.treat em injuries.ts).
export interface MedicalEffects {
  bleed?: "light" | "all"; // light: estanca corte leve e reduz os maiores; all: estanca qualquer sangramento
  dress?: boolean; // cobre a ferida: infecta menos e cicatriza mais rapido
  splint?: boolean; // imobiliza fratura
  painkillerSec?: number; // segundos de dor reduzida
  antibiotic?: boolean; // cura infeccoes
  disinfect?: boolean; // zera infeccao em formacao (ainda nao infectada)
  all?: boolean; // trata TODAS as feridas de uma vez (kit)
}

// Etapa 9: o que uma arma faz. So o servidor le isto para decidir dano, alcance e recarga.
export interface WeaponStats {
  damage: number; // vida tirada por golpe que acerta
  reach: number; // px: distancia maxima atacante -> alvo (posicoes que o SERVIDOR conhece)
  cooldownMs: number; // tempo minimo entre dois golpes
  damageType?: DamageType; // Etapa 6b: tipo de ferida que o golpe causa (padrao: contundente => contusao/fratura)
}

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  weight: number; // kg (ainda nao limita nada; entra com a regra de peso)
  maxStack: number;
  effects: VitalEffects; // efeito de CONSUMIR 1 unidade
  medical?: MedicalEffects; // Etapa 6b: se existir, trata ferimentos ao ser usado
  weapon?: WeaponStats; // Etapa 9: se existir, o item e arma (usada automaticamente: a de maior dano no inventario)
}

export const ITEMS: Record<ItemId, ItemDef> = {
  canned_food: { id: "canned_food", name: "Comida enlatada", category: "food", weight: 0.4, maxStack: 5, effects: { hunger: 35 } },
  water_bottle: { id: "water_bottle", name: "Garrafa de agua", category: "drink", weight: 0.5, maxStack: 5, effects: { thirst: 40 } },
  bandage: { id: "bandage", name: "Bandagem", category: "medical", weight: 0.1, maxStack: 5, effects: { health: 10 }, medical: { bleed: "all", dress: true } },
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
  torch: { id: "torch", name: "Tocha", category: "tool", weight: 0.5, maxStack: 3, effects: {} }, // ilumina a noite (a luz e so desenho no cliente)
  spear: { id: "spear", name: "Lanca", category: "weapon", weight: 2, maxStack: 1, effects: {}, weapon: { damage: 28, reach: 72, cooldownMs: 900, damageType: "pierce" } },
  // Etapa 6b: suprimentos medicos. Curativo/tala/kit sao fabricaveis; analgesico, antibiotico e antisseptico so por loot.
  dressing: { id: "dressing", name: "Curativo", category: "medical", weight: 0.05, maxStack: 10, effects: {}, medical: { bleed: "light", dress: true } },
  splint: { id: "splint", name: "Tala", category: "medical", weight: 0.6, maxStack: 3, effects: {}, medical: { splint: true } },
  painkiller: { id: "painkiller", name: "Analgesico", category: "medical", weight: 0.05, maxStack: 5, effects: {}, medical: { painkillerSec: 300 } },
  antibiotic: { id: "antibiotic", name: "Antibiotico", category: "medical", weight: 0.05, maxStack: 3, effects: {}, medical: { antibiotic: true } },
  antiseptic: { id: "antiseptic", name: "Antisseptico", category: "medical", weight: 0.1, maxStack: 5, effects: {}, medical: { disinfect: true } },
  first_aid_kit: { id: "first_aid_kit", name: "Kit de primeiros socorros", category: "medical", weight: 1, maxStack: 2, effects: { health: 20 }, medical: { bleed: "all", dress: true, disinfect: true, painkillerSec: 180, all: true } },
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === "string" && (ITEM_IDS as readonly string[]).includes(v);
}
