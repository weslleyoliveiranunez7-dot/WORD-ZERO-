import { ITEMS, isItemId, type ItemId } from "./items";

// Inventario em slots (cabe numa grade 4x3 em tela pequena). Todas as alteracoes passam por aqui,
// no servidor; o cliente recebe uma COPIA do estado e nunca decide quantidades.

export const INVENTORY_SLOTS = 12;
// EXTRA 6.3: peso maximo carregado (kg). Valor provisorio, balancear jogando. So a mochila do JOGADOR tem limite (bau nao).
export const MAX_CARRY_WEIGHT = 25;

export interface ItemStack {
  id: ItemId;
  qty: number;
  dur?: number; // EXTRA 6.3: durabilidade restante (so itens com `durability`; ausente = nova/cheia)
  eq?: true; // EXTRA 6.3: item equipado na mao (no maximo 1 por mochila; viaja junto com a pilha)
}
export type Slot = ItemStack | null;

const round2 = (v: number): number => Math.round(v * 100) / 100;

// Durabilidade valida para o item (inteiro 1..max). Item que nao se desgasta nao tem durabilidade (undefined).
export function cleanDur(id: ItemId, dur: unknown): number | undefined {
  const max = ITEMS[id].durability;
  if (!max) return undefined;
  if (typeof dur !== "number" || !Number.isInteger(dur) || dur < 1) return max;
  return Math.min(dur, max);
}

const copyStack = (s: ItemStack, keepEq: boolean): ItemStack => ({ id: s.id, qty: s.qty, ...(s.dur !== undefined ? { dur: s.dur } : {}), ...(keepEq && s.eq ? { eq: true as const } : {}) });

export class Inventory {
  readonly slots: Slot[];

  // `maxWeight` (kg): so a mochila do jogador usa (Infinity = sem limite, como o bau).
  constructor(size: number = INVENTORY_SLOTS, readonly maxWeight: number = Infinity) {
    this.slots = new Array<Slot>(size).fill(null);
  }

  // Peso total carregado (kg, 2 casas).
  totalWeight(): number {
    let w = 0;
    for (const s of this.slots) if (s) w += ITEMS[s.id].weight * s.qty;
    return round2(w);
  }

  // Indice do item equipado (-1 = nada equipado).
  equippedSlot(): number {
    return this.slots.findIndex((s) => !!s && s.eq === true);
  }

  // Gasta `n` de durabilidade do slot. Devolve o id do item se ele QUEBROU (e foi removido); null caso contrario.
  wear(slot: number, n = 1): ItemId | null {
    const s = Number.isInteger(slot) ? this.slots[slot] : null;
    if (!s || !ITEMS[s.id].durability) return null;
    const left = (s.dur ?? ITEMS[s.id].durability!) - n;
    if (left <= 0) {
      this.slots[slot] = null;
      return s.id;
    }
    s.dur = left;
    return null;
  }

  get size(): number {
    return this.slots.length;
  }

  // Adiciona ate `qty` unidades (completa pilhas antes de abrir slot novo). Devolve o que NAO coube
  // (por falta de slot OU de peso). `dur` so vale para itens com durabilidade (item novo entra com a durabilidade cheia).
  add(id: ItemId, qty: number, dur?: number): number {
    if (!isItemId(id) || !Number.isInteger(qty) || qty <= 0) return Math.max(0, Number.isFinite(qty) ? Math.floor(qty) : 0);
    const max = ITEMS[id].maxStack;
    const room = Number.isFinite(this.maxWeight) ? Math.max(0, Math.floor((this.maxWeight - this.totalWeight() + 1e-9) / ITEMS[id].weight)) : Infinity;
    const want = Math.min(qty, room); // o que o peso deixa entrar
    let left = want;
    for (const s of this.slots) {
      if (left === 0) break;
      if (s && s.id === id && s.qty < max) {
        const n = Math.min(max - s.qty, left);
        s.qty += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i] === null) {
        const n = Math.min(max, left);
        const d = cleanDur(id, dur);
        this.slots[i] = d === undefined ? { id, qty: n } : { id, qty: n, dur: d };
        left -= n;
      }
    }
    return qty - (want - left);
  }

  // Remove `qty` unidades de UM slot. false se o slot nao existe, esta vazio ou tem menos que `qty`.
  removeFromSlot(slot: number, qty: number): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.slots.length) return false;
    if (!Number.isInteger(qty) || qty <= 0) return false;
    const s = this.slots[slot];
    if (!s || s.qty < qty) return false;
    s.qty -= qty;
    if (s.qty === 0) this.slots[slot] = null;
    return true;
  }

  // Etapa 10: remove `qty` unidades de um item, de qualquer slot. Tudo ou nada: false (sem mexer em nada) se nao houver o bastante.
  removeById(id: ItemId, qty: number): boolean {
    if (!isItemId(id) || !Number.isInteger(qty) || qty <= 0 || this.count(id) < qty) return false;
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(s.qty, left);
        s.qty -= n;
        left -= n;
        if (s.qty === 0) this.slots[i] = null;
      }
    }
    return true;
  }

  // Etapa 10: copia independente e "commit" de uma copia (base da transacao: mexe na copia, so aplica se tudo deu certo).
  clone(): Inventory {
    const c = new Inventory(this.size, this.maxWeight);
    c.copyFrom(this);
    return c;
  }

  copyFrom(o: Inventory): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = o.slots[i];
      this.slots[i] = s ? copyStack(s, true) : null;
    }
  }

  count(id: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  // Copia profunda (e o que vai para a rede).
  snapshot(): Slot[] {
    return this.slots.map((s) => (s ? copyStack(s, true) : null));
  }

  // Esvazia e devolve o que havia (usado na morte). Sai sem a marca de equipado; a durabilidade vai junto.
  clear(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s) out.push(copyStack(s, false));
      this.slots[i] = null;
    }
    return out;
  }

  static starter(): Inventory {
    const inv = new Inventory(INVENTORY_SLOTS, MAX_CARRY_WEIGHT);
    inv.add("water_bottle", 2);
    inv.add("canned_food", 2);
    inv.add("bandage", 1);
    return inv;
  }
}
