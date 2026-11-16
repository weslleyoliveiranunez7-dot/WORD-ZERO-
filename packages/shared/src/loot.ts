import { hash2, type ChunkedWorld } from "./chunks";
import type { Inventory, ItemStack } from "./inventory";
import type { ItemId } from "./items";
import type { DropView, EntityUpdateMsg } from "./protocol";

// Etapa 7: recursos coletaveis e loot no chao. Logica pura (relogio por parametro), so no servidor.
// Recursos NAO sao objetos novos: sao derivados dos tiles do mapa (mesma seed = mesmos recursos):
//   arvore -> madeira; muro das ruinas -> pedra ou sucata. Fora disso, nada e coletavel.
// O servidor guarda apenas o que ja foi retirado de cada recurso; quem tira atualiza o contador na
// mesma chamada (sincrona), entao dois jogadores nunca retiram mais do que existe.

export const NODE_REACH_PX = 56; // distancia maxima jogador -> centro do tile do recurso / mochila
export const HARVEST_COOLDOWN_MS = 600;
export const NODE_RESPAWN_MS = 60_000; // recurso mexido volta ao normal apos este tempo sem ser tocado
export const DROP_TTL_MS = 300_000; // mochila de morte some apos 5 min (valor provisorio)
export const MAX_DROPS = 200; // limite de mochilas no mundo (protege a memoria)

// Etapa 10: ter a ferramenta no inventario faz cada coleta render 2 unidades (em vez de 1). Decidido so no servidor.
export const HARVEST_TOOL: Partial<Record<ItemId, ItemId>> = { wood: "axe", stone: "pickaxe", scrap: "pickaxe" };
export const TOOL_YIELD = 2;

export interface NodeDef {
  item: ItemId;
  max: number; // unidades disponiveis por recurso
}

// Qual recurso existe em (tx,ty)? null = nenhum. Deterministico: servidor e testes concordam.
export function nodeAt(world: ChunkedWorld, tx: number, ty: number): NodeDef | null {
  const t = world.tileAt(tx, ty);
  if (t === "tree") return { item: "wood", max: 3 };
  if (t === "wall") {
    if (tx === 0 || ty === 0 || tx === world.width - 1 || ty === world.height - 1) return null; // borda do mundo
    const c = world.getChunk(Math.floor(tx / 16), Math.floor(ty / 16));
    if (c?.region !== "ruins") return null;
    return hash2(world.seed + 7, tx, ty) < 0.5 ? { item: "stone", max: 3 } : { item: "scrap", max: 2 };
  }
  return null;
}

export interface LootDrop {
  id: number;
  x: number;
  y: number;
  items: ItemStack[];
  expiresAtMs: number;
}

export type LootResult = { ok: true; gained: ItemStack[]; tool?: ItemId } | { ok: false; reason: string }; // tool: ferramenta usada na coleta (gasta durabilidade)

export class LootWorld {
  private taken = new Map<string, { qty: number; lastMs: number }>();
  private drops = new Map<number, LootDrop>();
  private nextId = 1;
  version = 0; // sobe quando algo visivel muda (o servidor so reenvia quando muda)

  remaining(world: ChunkedWorld, tx: number, ty: number): number {
    const n = nodeAt(world, tx, ty);
    return n ? n.max - (this.taken.get(`${tx},${ty}`)?.qty ?? 0) : 0;
  }

  get dropCount(): number {
    return this.drops.size;
  }

  // Cria a mochila de morte (ou qualquer loot). Se passar do limite, descarta a mais antiga.
  addDrop(x: number, y: number, items: ItemStack[], nowMs: number): LootDrop | null {
    const copy = items.filter((s) => s.qty > 0).map((s) => ({ id: s.id, qty: s.qty, ...(s.dur !== undefined ? { dur: s.dur } : {}) }));
    if (copy.length === 0) return null;
    if (this.drops.size >= MAX_DROPS) {
      const oldest = this.drops.keys().next().value;
      if (oldest !== undefined) this.drops.delete(oldest);
    }
    const d: LootDrop = { id: this.nextId++, x, y, items: copy, expiresAtMs: nowMs + DROP_TTL_MS };
    this.drops.set(d.id, d);
    this.version++;
    return d;
  }

  // Interacao: mochila mais proxima dentro do alcance; se nao houver, o recurso mais proximo.
  interact(world: ChunkedWorld, inv: Inventory, px: number, py: number, nowMs: number): LootResult {
    this.tick(nowMs);
    let best: LootDrop | null = null;
    let bestD = NODE_REACH_PX;
    for (const d of this.drops.values()) {
      const dist = Math.hypot(d.x - px, d.y - py);
      if (dist <= bestD) {
        best = d;
        bestD = dist;
      }
    }
    if (best) return this.pickup(best, inv);
    return this.harvest(world, inv, px, py, nowMs);
  }

  private pickup(d: LootDrop, inv: Inventory): LootResult {
    const gained: ItemStack[] = [];
    const left: ItemStack[] = [];
    for (const s of d.items) {
      const rest = inv.add(s.id, s.qty, s.dur);
      if (s.qty - rest > 0) gained.push({ id: s.id, qty: s.qty - rest });
      if (rest > 0) left.push({ id: s.id, qty: rest, ...(s.dur !== undefined ? { dur: s.dur } : {}) });
    }
    if (gained.length === 0) return { ok: false, reason: "inventario_cheio" };
    d.items = left; // o que nao coube continua no chao
    if (left.length === 0) this.drops.delete(d.id);
    this.version++;
    return { ok: true, gained };
  }

  private harvest(world: ChunkedWorld, inv: Inventory, px: number, py: number, nowMs: number): LootResult {
    const ts = world.tileSize;
    const r = Math.ceil(NODE_REACH_PX / ts) + 1;
    const ptx = Math.floor(px / ts);
    const pty = Math.floor(py / ts);
    let best: { tx: number; ty: number; def: NodeDef } | null = null;
    let bestD = NODE_REACH_PX;
    let sawEmpty = false;
    for (let ty = pty - r; ty <= pty + r; ty++) {
      for (let tx = ptx - r; tx <= ptx + r; tx++) {
        const def = nodeAt(world, tx, ty);
        if (!def) continue;
        const dist = Math.hypot((tx + 0.5) * ts - px, (ty + 0.5) * ts - py);
        if (dist > NODE_REACH_PX) continue;
        if (this.remaining(world, tx, ty) <= 0) {
          sawEmpty = true;
          continue;
        }
        if (dist <= bestD) {
          best = { tx, ty, def };
          bestD = dist;
        }
      }
    }
    if (!best) return { ok: false, reason: sawEmpty ? "recurso_esgotado" : "nada_por_perto" };
    const tool = HARVEST_TOOL[best.def.item];
    const want = Math.min(tool && inv.count(tool) > 0 ? TOOL_YIELD : 1, this.remaining(world, best.tx, best.ty));
    const trial = inv.clone(); // transacao: so aplica se TUDO coube
    if (trial.add(best.def.item, want) > 0) return { ok: false, reason: "inventario_cheio" }; // nada foi retirado
    inv.copyFrom(trial);
    const k = `${best.tx},${best.ty}`;
    this.taken.set(k, { qty: (this.taken.get(k)?.qty ?? 0) + want, lastMs: nowMs });
    this.version++;
    return { ok: true, gained: [{ id: best.def.item, qty: want }], ...(tool && inv.count(tool) > 0 ? { tool } : {}) };
  }

  // Expira mochilas e devolve recursos ao normal.
  tick(nowMs: number): void {
    for (const [k, t] of this.taken) {
      if (nowMs - t.lastMs >= NODE_RESPAWN_MS) {
        this.taken.delete(k);
        this.version++;
      }
    }
    for (const [id, d] of this.drops) {
      if (nowMs >= d.expiresAtMs) {
        this.drops.delete(id);
        this.version++;
      }
    }
  }

  // O que o cliente precisa para desenhar: mochilas e recursos totalmente esgotados.
  view(world: ChunkedWorld): EntityUpdateMsg {
    const drops: DropView[] = [...this.drops.values()].map((d) => ({ id: d.id, x: Math.round(d.x), y: Math.round(d.y) }));
    const depleted: string[] = [];
    for (const k of this.taken.keys()) {
      const [tx, ty] = k.split(",").map(Number);
      if (this.remaining(world, tx, ty) <= 0) depleted.push(k);
    }
    return { drops, depleted };
  }
}
