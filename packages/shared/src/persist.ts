import { INVENTORY_SLOTS, MAX_CARRY_WEIGHT, Inventory, type ItemStack, type Slot } from "./inventory";
import { InjurySim, type InjurySave } from "./injuries";
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
  inj?: InjurySave; // Etapa 6b: feridas (ausente = sem feridas; saves antigos continuam validos)
}

// Foto do jogador. Morto = salva como "recomecar" (kit inicial, spawn): a mochila de morte so existe na memoria.
export function makeSave(life: PlayerLife, x: number, y: number): PlayerSave {
  if (life.dead) {
    const kit = Inventory.starter().snapshot();
    return { v: SAVE_VERSION, ...START_VITALS, slots: kit };
  }
  const v = life.survival;
  const save: PlayerSave = { v: SAVE_VERSION, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, health: v.health, hunger: v.hunger, thirst: v.thirst, energy: v.energy, slots: life.inventory.snapshot() };
  if (life.injuries.list.length > 0 || life.injuries.painLeft > 0) save.inj = life.injuries.snapshot();
  return save;
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
    const { id, qty, dur, eq } = s as Record<string, unknown>;
    if (!isItemId(id) || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > ITEMS[id].maxStack) return null;
    // EXTRA 6.3: durabilidade e "equipado" invalidos nao derrubam o save: a durabilidade volta cheia, o equipado e ignorado.
    const st: ItemStack = { id, qty };
    const max = ITEMS[id].durability;
    if (max && typeof dur === "number" && Number.isInteger(dur) && dur >= 1) st.dur = Math.min(dur, max);
    if (eq === true && ITEMS[id].equip && !slots.some((o) => o?.eq)) st.eq = true;
    slots.push(st);
  }
  while (slots.length < INVENTORY_SLOTS) slots.push(null);
  const out: PlayerSave = { v: SAVE_VERSION, health, hunger, thirst, energy, slots };
  if (r.inj !== undefined) {
    const inj = InjurySim.restore(r.inj); // dado invalido de ferida nao derruba o save: volta sem feridas
    if (inj.list.length > 0 || inj.painLeft > 0) out.inj = inj.snapshot();
  }
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
  const inv = new Inventory(INVENTORY_SLOTS, MAX_CARRY_WEIGHT); // slots entram direto: save acima do peso nao perde itens
  save.slots.forEach((s, i) => {
    inv.slots[i] = s ? { id: s.id, qty: s.qty, ...(s.dur !== undefined ? { dur: s.dur } : {}), ...(s.eq ? { eq: true as const } : {}) } : null;
  });
  life.inventory = inv;
  life.injuries = InjurySim.restore(save.inj);
  life.invVersion++;
}
