import { Inventory, type ItemStack, type Slot } from "./inventory";
import { isItemId, type ItemId } from "./items";

// Etapa 11: construcao de base (Documento Mestre 5.5). Logica pura (sem rede, sem disco, sem relogio proprio).
// Regras: so o SERVIDOR cria, abre, fecha, danifica e salva pecas. O cliente manda INTENCOES (qual peca, qual tile);
// alcance, dono, recursos, espaco e colisao saem do que o servidor conhece. Um tile tem no maximo: 1 fundacao + 1 peca em cima.

export const PIECE_KINDS = ["foundation", "wall", "door", "window", "chest", "roof"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export type TopKind = Exclude<PieceKind, "foundation" | "roof">; // peca que ocupa o tile em cima da fundacao (telhado e outra camada)

export interface PieceDef {
  name: string;
  cost: ItemStack[]; // valores provisorios (balancear depois de jogar)
  hp: number;
}

export const PIECES: Record<PieceKind, PieceDef> = {
  foundation: { name: "Fundacao", cost: [{ id: "wood", qty: 4 }, { id: "stone", qty: 2 }], hp: 120 },
  wall: { name: "Parede", cost: [{ id: "wood", qty: 3 }], hp: 160 },
  door: { name: "Porta", cost: [{ id: "wood", qty: 4 }, { id: "scrap", qty: 1 }], hp: 100 },
  window: { name: "Janela", cost: [{ id: "wood", qty: 2 }, { id: "scrap", qty: 1 }], hp: 80 }, // bloqueia a passagem, NAO a visao
  chest: { name: "Bau", cost: [{ id: "wood", qty: 5 }, { id: "scrap", qty: 2 }], hp: 80 },
  roof: { name: "Telhado", cost: [{ id: "wood", qty: 3 }], hp: 100 }, // camada de cima; so com apoio (parede/porta/janela ou outro telhado seu por perto)
};

export function isPieceKind(v: unknown): v is PieceKind {
  return typeof v === "string" && (PIECE_KINDS as readonly string[]).includes(v);
}

export const BUILD_REACH = 80; // px: do jogador (posicao do servidor) ate o centro do tile
export const MAX_PIECES_PER_OWNER = 80; // fundacoes + pecas em cima; evita um jogador cobrir o mundo
export const CHEST_SLOTS = 8;
export const BUILD_COOLDOWN_MS = 250; // intervalo minimo entre duas acoes de construcao do mesmo jogador
export const STRUCT_DAMAGE_MULT = 0.5; // dano de arma contra estrutura = dano da arma x isto (provisorio)
export const REPAIR_HP_PER_WOOD = 25; // 1 madeira recupera ate 25 de vida (arredonda para cima)
export const MAX_TRUSTED = 8; // pessoas com acesso as portas/baus de um dono
export const TRUST_REACH = 96; // px: quem recebe/perde acesso precisa estar perto do dono
export const STRUCTURES_SAVE_VERSION = 1;
const PLAYER_HALF = 10; // igual a PLAYER_HALF_SIZE (movement.ts); duplicado para nao criar ciclo de importacao

export type BuildResult = { ok: true; chest?: boolean; added?: boolean } | { ok: false; reason: string; weight: number };
const fail = (reason: string, weight = 0): BuildResult => ({ ok: false, reason, weight }); // regra de jogo = peso 0 (so avisa)

interface Top {
  kind: TopKind;
  hp: number;
  open: boolean; // so porta
  items?: Inventory; // so bau
}
interface Tile {
  owner: string;
  floorHp: number;
  roofHp: number; // 0 = sem telhado
  top: Top | null;
}

export interface Occupant {
  x: number;
  y: number;
}
export interface BaseTerrain {
  tileAt(tx: number, ty: number): string | null;
}

// Linha enviada ao cliente: [tx, ty, fundacao(0/1), topo, acesso, telhado(0/1)]. topo: 0 nada, 1 parede, 2 porta fechada, 3 porta aberta, 4 bau, 5 janela.
// acesso: 0 sem acesso, 1 sou o dono, 2 tenho acesso (dono confiou em mim).
export type StructureRow = [number, number, number, number, number, number];

export interface DamageResult {
  hit: boolean;
  x: number; // centro do tile atingido (para o efeito visual)
  y: number;
  destroyed: boolean;
  drops: ItemStack[]; // conteudo do bau destruido (o servidor larga como mochila no chao)
}

export class StructureWorld {
  private tiles = new Map<number, Tile>();
  private trust = new Map<string, Set<string>>(); // dono -> quem pode usar suas portas e baus
  version = 0; // sobe a cada mudanca visivel (o servidor so reenvia quando muda)
  dirty = false; // mudou desde o ultimo salvamento

  constructor(
    readonly width: number,
    readonly height: number,
    readonly tileSize: number = 32,
  ) {}

  private key(tx: number, ty: number): number {
    return ty * this.width + tx;
  }
  private inside(tx: number, ty: number): boolean {
    return Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }
  private changed(): void {
    this.version++;
    this.dirty = true;
  }

  get count(): number {
    return this.tiles.size;
  }

  // Colisao: parede, bau e porta FECHADA bloqueiam; fundacao e porta aberta nao. Atribuivel a ChunkedWorld.extraSolid.
  solidAt = (tx: number, ty: number): boolean => {
    const t = this.tiles.get(this.key(tx, ty));
    if (!t || !t.top) return false;
    return t.top.kind === "door" ? !t.top.open : true;
  };

  // Bloqueia a LINHA DE VISAO: parede, baú e porta fechada sim; janela, porta aberta, fundacao e telhado nao.
  opaqueAt = (tx: number, ty: number): boolean => {
    const t = this.tiles.get(this.key(tx, ty));
    if (!t || !t.top || t.top.kind === "window") return false;
    return t.top.kind === "door" ? !t.top.open : true;
  };

  private trusts(owner: string, who: string): boolean {
    return this.trust.get(owner)?.has(who) === true;
  }

  // Dono da o acesso (portas e baus) a OUTRO jogador; repetir remove. Reparar, construir e destruir nao mudam: so o dono.
  toggleTrust(owner: string, who: string): BuildResult {
    if (!owner || !who || owner === who) return fail("valores_invalidos", 3);
    const set = this.trust.get(owner) ?? new Set<string>();
    if (set.has(who)) {
      set.delete(who);
      if (set.size === 0) this.trust.delete(owner);
      this.changed();
      return { ok: true, added: false };
    }
    if (set.size >= MAX_TRUSTED) return fail("limite_de_confianca");
    set.add(who);
    this.trust.set(owner, set);
    this.changed();
    return { ok: true, added: true };
  }

  piecesOf(owner: string): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.owner === owner) n += 1 + (t.top ? 1 : 0) + (t.roofHp > 0 ? 1 : 0);
    return n;
  }

  private reach(px: number, py: number, tx: number, ty: number): boolean {
    const d = Math.hypot(px - (tx + 0.5) * this.tileSize, py - (ty + 0.5) * this.tileSize);
    return Number.isFinite(d) && d <= BUILD_REACH;
  }

  // Alguem (jogador) com a caixa encostando no tile? Pecas solidas nunca prendem ninguem.
  private occupied(tx: number, ty: number, who: Occupant[]): boolean {
    const ts = this.tileSize;
    return who.some((o) => o.x + PLAYER_HALF > tx * ts && o.x - PLAYER_HALF < (tx + 1) * ts && o.y + PLAYER_HALF > ty * ts && o.y - PLAYER_HALF < (ty + 1) * ts);
  }

  place(a: { owner: string; kind: PieceKind; tx: number; ty: number; px: number; py: number; inv: Inventory; terrain: BaseTerrain; occupants: Occupant[] }): BuildResult {
    if (!isPieceKind(a.kind) || !this.inside(a.tx, a.ty)) return fail("valores_invalidos", 3);
    if (!this.reach(a.px, a.py, a.tx, a.ty)) return fail("longe_demais");
    if (a.terrain.tileAt(a.tx, a.ty) !== "grass") return fail("terreno_invalido");
    if (this.piecesOf(a.owner) + 1 > MAX_PIECES_PER_OWNER) return fail("limite_de_pecas");
    const cur = this.tiles.get(this.key(a.tx, a.ty));
    if (a.kind === "foundation") {
      if (cur) return fail("ocupado");
    } else if (a.kind === "roof") {
      if (!cur) return fail("precisa_de_fundacao");
      if (cur.owner !== a.owner) return fail("nao_e_seu");
      if (cur.roofHp > 0) return fail("ocupado");
      if (!this.roofSupported(a.tx, a.ty, a.owner)) return fail("sem_apoio");
    } else {
      if (!cur) return fail("precisa_de_fundacao");
      if (cur.owner !== a.owner) return fail("nao_e_seu");
      if (cur.top) return fail("ocupado");
      if (this.occupied(a.tx, a.ty, a.occupants)) return fail("alguem_no_local"); // porta nasce fechada; nada prende jogador
    }
    // transacao: tira os recursos numa copia e so aplica se tudo deu certo
    const def = PIECES[a.kind];
    const copy = a.inv.clone();
    for (const c of def.cost) if (!copy.removeById(c.id, c.qty)) return fail("faltam_recursos");
    a.inv.copyFrom(copy);
    if (a.kind === "foundation") this.tiles.set(this.key(a.tx, a.ty), { owner: a.owner, floorHp: def.hp, roofHp: 0, top: null });
    else if (a.kind === "roof") cur!.roofHp = def.hp;
    else cur!.top = { kind: a.kind, hp: def.hp, open: false, items: a.kind === "chest" ? new Inventory(CHEST_SLOTS) : undefined };
    this.changed();
    return { ok: true };
  }

  // Telhado precisa de apoio: parede/porta/janela/bau SEUS neste tile ou ao lado (4 direcoes), ou outro telhado seu ao lado.
  private roofSupported(tx: number, ty: number, owner: string): boolean {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!this.inside(tx + dx, ty + dy)) continue;
      const n = this.tiles.get(this.key(tx + dx, ty + dy));
      if (!n || n.owner !== owner) continue;
      if (n.top && n.top.kind !== "chest") return true;
      if ((dx !== 0 || dy !== 0) && n.roofHp > 0) return true;
    }
    return false;
  }

  private mine(owner: string, tx: number, ty: number, px: number, py: number, kinds: TopKind[]): { t: Tile; top: Top } | BuildResult {
    if (!this.inside(tx, ty)) return fail("valores_invalidos", 3);
    const t = this.tiles.get(this.key(tx, ty));
    if (!t || !t.top || !kinds.includes(t.top.kind)) return fail("nada_aqui");
    if (!this.reach(px, py, tx, ty)) return fail("longe_demais");
    if (t.owner !== owner && !this.trusts(t.owner, owner)) return fail("nao_e_seu"); // dono (ou quem ele liberou) usa porta e bau; os outros precisam destruir
    return { t, top: t.top };
  }

  // Porta: abre/fecha. Bau: so pede para ver o conteudo (ok + chest: true).
  toggle(a: { owner: string; tx: number; ty: number; px: number; py: number; occupants: Occupant[] }): BuildResult {
    const r = this.mine(a.owner, a.tx, a.ty, a.px, a.py, ["door", "chest"]);
    if ("ok" in r) return r;
    if (r.top.kind === "chest") return { ok: true, chest: true };
    if (r.top.open && this.occupied(a.tx, a.ty, a.occupants)) return fail("alguem_no_local"); // nao fecha em cima de alguem
    r.top.open = !r.top.open;
    this.changed();
    return { ok: true };
  }

  // Move UMA pilha inteira (slot) entre inventario e bau. O que nao couber fica na origem; nada some, nada duplica.
  move(a: { owner: string; tx: number; ty: number; px: number; py: number; inv: Inventory; slot: number; toChest: boolean }): BuildResult {
    const r = this.mine(a.owner, a.tx, a.ty, a.px, a.py, ["chest"]);
    if ("ok" in r) return r;
    const from = a.toChest ? a.inv : r.top.items!;
    const to = a.toChest ? r.top.items! : a.inv;
    const s = Number.isInteger(a.slot) ? from.slots[a.slot] : null;
    if (!s) return fail("slot_vazio");
    const left = to.add(s.id, s.qty);
    const moved = s.qty - left;
    if (moved <= 0) return fail(a.toChest ? "bau_cheio" : "inventario_cheio");
    from.removeFromSlot(a.slot, moved);
    this.changed();
    return { ok: true, chest: true };
  }

  chestSlots(owner: string, tx: number, ty: number, px: number, py: number): Slot[] | null {
    const r = this.mine(owner, tx, ty, px, py, ["chest"]);
    return "ok" in r ? null : r.top.items!.snapshot();
  }

  // Reparo (so o dono): devolve a vida cheia de TODAS as pecas do tile; custo = madeira pela vida que faltava. Transacao.
  repair(a: { owner: string; tx: number; ty: number; px: number; py: number; inv: Inventory }): BuildResult {
    if (!this.inside(a.tx, a.ty)) return fail("valores_invalidos", 3);
    const t = this.tiles.get(this.key(a.tx, a.ty));
    if (!t) return fail("nada_aqui");
    if (!this.reach(a.px, a.py, a.tx, a.ty)) return fail("longe_demais");
    if (t.owner !== a.owner) return fail("nao_e_seu");
    const lack = (max: number, hp: number): number => Math.max(0, max - hp);
    const missing = lack(PIECES.foundation.hp, t.floorHp) + (t.top ? lack(PIECES[t.top.kind].hp, t.top.hp) : 0) + (t.roofHp > 0 ? lack(PIECES.roof.hp, t.roofHp) : 0);
    if (missing <= 0) return fail("nada_a_reparar");
    const copy = a.inv.clone();
    if (!copy.removeById("wood", Math.ceil(missing / REPAIR_HP_PER_WOOD))) return fail("faltam_recursos");
    a.inv.copyFrom(copy);
    t.floorHp = Math.max(t.floorHp, PIECES.foundation.hp);
    if (t.top) t.top.hp = Math.max(t.top.hp, PIECES[t.top.kind].hp);
    if (t.roofHp > 0) t.roofHp = Math.max(t.roofHp, PIECES.roof.hp);
    this.changed();
    return { ok: true };
  }

  // Tile com estrutura mais proximo (dentro do alcance da arma). null = nenhum.
  nearest(px: number, py: number, reach: number): { tx: number; ty: number } | null {
    const ts = this.tileSize;
    const r = Math.ceil(reach / ts) + 1;
    const cx = Math.floor(px / ts);
    const cy = Math.floor(py / ts);
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (!this.inside(tx, ty) || !this.tiles.has(this.key(tx, ty))) continue;
        const d = Math.hypot(px - (tx + 0.5) * ts, py - (ty + 0.5) * ts);
        if (d <= reach && d < bestD) {
          bestD = d;
          best = { tx, ty };
        }
      }
    }
    return best;
  }

  // Dano estrutural: primeiro a peca de cima, depois a fundacao. Destruida = some; bau solta o conteudo.
  damage(tx: number, ty: number, amount: number): DamageResult {
    const none: DamageResult = { hit: false, x: 0, y: 0, destroyed: false, drops: [] };
    const t = this.inside(tx, ty) ? this.tiles.get(this.key(tx, ty)) : undefined;
    if (!t || !Number.isFinite(amount) || amount <= 0) return none;
    const x = (tx + 0.5) * this.tileSize;
    const y = (ty + 0.5) * this.tileSize;
    let destroyed = false;
    let drops: ItemStack[] = [];
    if (t.top) {
      t.top.hp -= amount;
      if (t.top.hp <= 0) {
        destroyed = true;
        drops = t.top.items ? t.top.items.clear() : [];
        t.top = null;
      }
    } else if (t.roofHp > 0) {
      t.roofHp -= amount;
      if (t.roofHp <= 0) {
        t.roofHp = 0;
        destroyed = true;
      }
    } else {
      t.floorHp -= amount;
      if (t.floorHp <= 0) {
        destroyed = true;
        this.tiles.delete(this.key(tx, ty));
      }
    }
    this.changed();
    return { hit: true, x, y, destroyed, drops };
  }

  // Visao para UM jogador (o dono ve "meu"=1). Nunca inclui conteudo de bau nem o id do dono.
  view(viewer: string): StructureRow[] {
    const out: StructureRow[] = [];
    for (const [k, t] of this.tiles) {
      const top = !t.top ? 0 : t.top.kind === "wall" ? 1 : t.top.kind === "door" ? (t.top.open ? 3 : 2) : t.top.kind === "window" ? 5 : 4;
      const access = viewer === "" ? 0 : t.owner === viewer ? 1 : this.trusts(t.owner, viewer) ? 2 : 0;
      out.push([k % this.width, Math.floor(k / this.width), 1, top, access, t.roofHp > 0 ? 1 : 0]);
    }
    return out;
  }

  // ---- persistencia ----
  toSave(seed: number): StructuresSave {
    const tiles: SavedTile[] = [];
    for (const [k, t] of this.tiles) {
      const s: SavedTile = { x: k % this.width, y: Math.floor(k / this.width), o: t.owner, f: Math.ceil(t.floorHp) };
      if (t.roofHp > 0) s.r = Math.ceil(t.roofHp);
      if (t.top) s.t = { k: t.top.kind, h: Math.ceil(t.top.hp), op: t.top.open || undefined, i: t.top.items ? t.top.items.snapshot() : undefined };
      tiles.push(s);
    }
    const out: StructuresSave = { v: STRUCTURES_SAVE_VERSION, seed, tiles };
    if (this.trust.size > 0) out.trust = Object.fromEntries([...this.trust].map(([o, set]) => [o, [...set]]));
    return out;
  }

  // Valida o que veio do armazenamento (dado salvo tambem nao e confiavel). null = invalido.
  static fromSave(raw: unknown, width: number, height: number, seed: number, tileSize = 32): StructureWorld | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (r.v !== STRUCTURES_SAVE_VERSION || r.seed !== seed || !Array.isArray(r.tiles) || r.tiles.length > width * height) return null;
    const w = new StructureWorld(width, height, tileSize);
    const hp = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1000 ? v : null);
    for (const e of r.tiles as unknown[]) {
      if (typeof e !== "object" || e === null) return null;
      const s = e as Record<string, unknown>;
      const { x, y, o, f } = s;
      if (typeof x !== "number" || typeof y !== "number" || !w.inside(x, y) || w.tiles.has(w.key(x, y))) return null;
      if (typeof o !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(o)) return null;
      const floorHp = hp(f);
      if (floorHp === null) return null;
      const tile: Tile = { owner: o, floorHp, roofHp: 0, top: null };
      if (s.r !== undefined) {
        const roof = hp(s.r);
        if (roof === null) return null;
        tile.roofHp = roof;
      }
      if (s.t !== undefined) {
        if (typeof s.t !== "object" || s.t === null) return null;
        const t = s.t as Record<string, unknown>;
        const topHp = hp(t.h);
        if (topHp === null || (t.k !== "wall" && t.k !== "door" && t.k !== "window" && t.k !== "chest")) return null;
        const top: Top = { kind: t.k, hp: topHp, open: t.k === "door" && t.op === true };
        if (t.k === "chest") {
          top.items = new Inventory(CHEST_SLOTS);
          if (!Array.isArray(t.i) || t.i.length !== CHEST_SLOTS) return null;
          for (const it of t.i as unknown[]) {
            if (it === null) continue;
            const q = it as Record<string, unknown>;
            if (typeof q !== "object" || !isItemId(q.id) || typeof q.qty !== "number" || !Number.isInteger(q.qty) || q.qty <= 0) return null;
            if (top.items.add(q.id as ItemId, q.qty) !== 0) return null;
          }
        }
        tile.top = top;
      }
      w.tiles.set(w.key(x, y), tile);
    }
    if (r.trust !== undefined) {
      if (typeof r.trust !== "object" || r.trust === null || Array.isArray(r.trust)) return null;
      const id = /^[A-Za-z0-9]{1,64}$/;
      for (const [o, list] of Object.entries(r.trust as Record<string, unknown>)) {
        if (!id.test(o) || !Array.isArray(list) || list.length === 0 || list.length > MAX_TRUSTED) return null;
        if (!list.every((x) => typeof x === "string" && id.test(x) && x !== o)) return null;
        w.trust.set(o, new Set(list as string[]));
      }
    }
    return w;
  }
}

export interface SavedTile {
  x: number;
  y: number;
  o: string; // dono (hash da chave do jogador; nunca a chave)
  f: number; // vida da fundacao
  r?: number; // vida do telhado (ausente = sem telhado)
  t?: { k: TopKind; h: number; op?: boolean; i?: Slot[] };
}
export interface StructuresSave {
  v: typeof STRUCTURES_SAVE_VERSION;
  seed: number;
  tiles: SavedTile[];
  trust?: Record<string, string[]>; // dono -> quem pode usar suas portas e baus
}
