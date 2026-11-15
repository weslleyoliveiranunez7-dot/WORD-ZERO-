import { INVENTORY_SLOTS, Inventory, type Slot } from "./inventory";
import { ITEMS, isItemId } from "./items";
import type { PlayerLife } from "./life";
import { MAX_VITAL, START_VITALS, SurvivalSim } from "./survival";

// Etapa 7: o que se guarda de cada jogador entre sessoes. Logica pura (sem disco, sem rede).
// Tudo que volta do armazenamento e validado de novo: o dado salvo tambem nao e confiavel.

export const SAVE_VERSION = 1;

export interface PlayerSave {
  v: typeof SAVE_VERSION;
  x?: number; // ausente = jogador deve comecar no spawn
  y?: number;
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
  slots: Slot[]; // sempre INVENTORY_SLOTS posicoes
}

// Foto do jogador. Morto = salva como "recomecar" (kit inicial, spawn): a mochila de morte so existe na memoria.
export function makeSave(life: PlayerLife, x: number, y: number): PlayerSave {
  if (life.dead) {
    const kit = Inventory.starter().snapshot();
    return { v: SAVE_VERSION, ...START_VITALS, slots: kit };
  }
  const v = life.survival;
  return { v: SAVE_VERSION, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, health: v.health, hunger: v.hunger, thirst: v.thirst, energy: v.energy, slots: life.inventory.snapshot() };
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

// Valida o que veio do armazenamento. null = dado invalido (o servidor comeca do zero e nao apaga nada).
export function parseSave(raw: unknown): PlayerSave | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== SAVE_VERSION) return null;
  const health = num(r.health, 0.01, MAX_VITAL);
  const hunger = num(r.hunger, 0, MAX_VITAL);
  const thirst = num(r.thirst, 0, MAX_VITAL);
  const energy = num(r.energy, 0, MAX_VITAL);
  if (health === null || hunger === null || thirst === null || energy === null) return null;
  if (!Array.isArray(r.slots) || r.slots.length > INVENTORY_SLOTS) return null;
  const slots: Slot[] = [];
  for (const s of r.slots) {
    if (s === null) {
      slots.push(null);
      continue;
    }
    if (typeof s !== "object" || s === undefined) return null;
    const { id, qty } = s as Record<string, unknown>;
    if (!isItemId(id) || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > ITEMS[id].maxStack) return null;
    slots.push({ id, qty });
  }
  while (slots.length < INVENTORY_SLOTS) slots.push(null);
  const out: PlayerSave = { v: SAVE_VERSION, health, hunger, thirst, energy, slots };
  const x = num(r.x, 0, 1_000_000);
  const y = num(r.y, 0, 1_000_000);
  if (x !== null && y !== null) {
    out.x = x;
    out.y = y;
  }
  return out;
}

// Aplica o save a um PlayerLife recem-criado.
export function applySave(life: PlayerLife, save: PlayerSave): void {
  life.survival = new SurvivalSim({ health: save.health, hunger: save.hunger, thirst: save.thirst, energy: save.energy });
  const inv = new Inventory();
  save.slots.forEach((s, i) => {
    inv.slots[i] = s ? { id: s.id, qty: s.qty } : null;
  });
  life.inventory = inv;
  life.invVersion++;
}
