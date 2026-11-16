import { Inventory } from "./inventory";
import { ITEMS } from "./items";
import type { InventoryIntent } from "./protocol";

// EXTRA 6.3: operacoes de organizacao do inventario. Logica pura (sem rede, sem relogio), so o servidor aplica.
// Cada operacao e TUDO OU NADA: se recusar, o inventario fica exatamente como estava. Quantidades nunca vem prontas do
// cliente: ele diz "de qual slot, quanto", e o servidor confere contra o que realmente existe.

export type InvOpResult = { ok: true } | { ok: false; reason: string; weight: number };
const fail = (reason: string, weight: number): InvOpResult => ({ ok: false, reason, weight });
const okRes: InvOpResult = { ok: true };

const slotOk = (inv: Inventory, i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < inv.size;

// Mover: slot vazio = muda de lugar; mesmo item empilhavel = junta (ate o limite da pilha); item diferente = troca de lugar.
export function moveSlot(inv: Inventory, from: number, to: number): InvOpResult {
  if (!slotOk(inv, from) || !slotOk(inv, to)) return fail("valores_invalidos", 3);
  if (from === to) return fail("nada_a_fazer", 0);
  const a = inv.slots[from];
  const b = inv.slots[to];
  if (!a) return fail("slot_vazio", 2);
  if (!b) {
    inv.slots[to] = a;
    inv.slots[from] = null;
    return okRes;
  }
  const max = ITEMS[a.id].maxStack;
  if (a.id === b.id && max > 1) {
    const n = Math.min(a.qty, max - b.qty);
    if (n <= 0) return fail("nada_a_fazer", 0); // pilha de destino ja cheia
    b.qty += n;
    a.qty -= n;
    if (a.qty === 0) inv.slots[from] = null;
    return okRes;
  }
  inv.slots[from] = b;
  inv.slots[to] = a;
  return okRes;
}

// Dividir: tira `qty` de uma pilha e poe num slot livre (o primeiro vazio). So itens que empilham.
export function splitStack(inv: Inventory, slot: number, qty: number): InvOpResult {
  if (!slotOk(inv, slot) || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) return fail("valores_invalidos", 3);
  const s = inv.slots[slot];
  if (!s) return fail("slot_vazio", 2);
  if (ITEMS[s.id].maxStack <= 1 || s.qty < 2 || qty >= s.qty) return fail("nao_divisivel", 1);
  const free = inv.slots.findIndex((x) => x === null);
  if (free < 0) return fail("sem_slot_livre", 0);
  s.qty -= qty;
  inv.slots[free] = { id: s.id, qty };
  return okRes;
}

// Descartar: destroi `qty` unidades do slot (nao vira loot no chao: assim ninguem usa isso para lotar o mundo de mochilas).
export function discardSlot(inv: Inventory, slot: number, qty: number): InvOpResult {
  if (!slotOk(inv, slot) || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) return fail("valores_invalidos", 3);
  const s = inv.slots[slot];
  if (!s) return fail("slot_vazio", 2);
  if (qty > s.qty) return fail("quantidade_invalida", 2);
  inv.removeFromSlot(slot, qty);
  return okRes;
}

// Equipar: so item equipavel; troca o que estava equipado (so 1 por vez).
export function equipSlot(inv: Inventory, slot: number): InvOpResult {
  if (!slotOk(inv, slot)) return fail("valores_invalidos", 3);
  const s = inv.slots[slot];
  if (!s) return fail("slot_vazio", 2);
  if (!ITEMS[s.id].equip) return fail("nao_equipavel", 1);
  if (s.eq) return fail("nada_a_fazer", 0);
  for (const o of inv.slots) if (o) delete o.eq;
  s.eq = true;
  return okRes;
}

export function unequip(inv: Inventory): InvOpResult {
  const i = inv.equippedSlot();
  if (i < 0) return fail("nada_a_fazer", 0);
  delete inv.slots[i]!.eq;
  return okRes;
}

// Despacha UMA operacao ja validada (inspectInventoryMove) sobre o inventario.
export function applyInvOp(inv: Inventory, op: InventoryIntent): InvOpResult {
  switch (op.op) {
    case "move":
      return moveSlot(inv, op.from, op.to);
    case "split":
      return splitStack(inv, op.slot, op.qty);
    case "discard":
      return discardSlot(inv, op.slot, op.qty);
    case "equip":
      return equipSlot(inv, op.slot);
    case "unequip":
      return unequip(inv);
  }
}
