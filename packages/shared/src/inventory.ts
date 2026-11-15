import { ITEMS, isItemId, type ItemId } from "./items";

// Inventario em slots (cabe numa grade 4x3 em tela pequena). Todas as alteracoes passam por aqui,
// no servidor; o cliente recebe uma COPIA do estado e nunca decide quantidades.

export const INVENTORY_SLOTS = 12;

export interface ItemStack {
  id: ItemId;
  qty: number;
}
export type Slot = ItemStack | null;

export class Inventory {
  readonly slots: Slot[];

  constructor(size: number = INVENTORY_SLOTS) {
    this.slots = new Array<Slot>(size).fill(null);
  }

  get size(): number {
    return this.slots.length;
  }

  // Adiciona ate `qty` unidades (completa pilhas antes de abrir slot novo). Devolve o que NAO coube.
  add(id: ItemId, qty: number): number {
    if (!isItemId(id) || !Number.isInteger(qty) || qty <= 0) return Math.max(0, Number.isFinite(qty) ? Math.floor(qty) : 0);
    const max = ITEMS[id].maxStack;
    let left = qty;
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
        this.slots[i] = { id, qty: n };
        left -= n;
      }
    }
    return left;
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
    const c = new Inventory(this.size);
    c.copyFrom(this);
    return c;
  }

  copyFrom(o: Inventory): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = o.slots[i];
      this.slots[i] = s ? { id: s.id, qty: s.qty } : null;
    }
  }

  count(id: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  // Copia profunda (e o que vai para a rede).
  snapshot(): Slot[] {
    return this.slots.map((s) => (s ? { id: s.id, qty: s.qty } : null));
  }

  // Esvazia e devolve o que havia (usado na morte).
  clear(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s) out.push({ id: s.id, qty: s.qty });
      this.slots[i] = null;
    }
    return out;
  }

  static starter(): Inventory {
    const inv = new Inventory();
    inv.add("water_bottle", 2);
    inv.add("canned_food", 2);
    inv.add("bandage", 1);
    return inv;
  }
}
