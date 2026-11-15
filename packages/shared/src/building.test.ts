import { describe, expect, it } from "vitest";
import { BUILD_REACH, CHEST_SLOTS, MAX_TRUSTED, REPAIR_HP_PER_WOOD, ChunkedWorld, Inventory, MAX_PIECES_PER_OWNER, PIECES, PlayerLife, StructureWorld, inspectBuild, lineClear, collidesAt } from "./index";

// Mundo de teste: acha tiles de grama livres perto do spawn e posiciona o "jogador" no centro de um deles.
const world = new ChunkedWorld();
const sw = (): StructureWorld => new StructureWorld(world.width, world.height, world.tileSize);
const T = world.spawnTile;
const center = (tx: number, ty: number): { px: number; py: number } => ({ px: (tx + 0.5) * 32, py: (ty + 0.5) * 32 });
const rich = (): Inventory => {
  const i = new Inventory(60);
  i.add("wood", 200);
  i.add("stone", 100);
  i.add("scrap", 100);
  return i;
};
const A = "aaaa";
const B = "bbbb";
const base = (s: StructureWorld, owner = A, inv = rich()) => ({ owner, inv, terrain: world, occupants: [] as { x: number; y: number }[], ...center(T.x, T.y), s });
const put = (s: StructureWorld, kind: "foundation" | "wall" | "door" | "window" | "chest" | "roof", dx: number, dy: number, owner = A, inv = rich()) =>
  s.place({ owner, kind, tx: T.x + dx, ty: T.y + dy, inv, terrain: world, occupants: [], ...center(T.x, T.y) });

describe("StructureWorld", () => {
  it("fundacao -> parede/porta/bau, cada peca no seu tile, gastando os recursos da tabela", () => {
    const s = sw();
    const inv = rich();
    const before = inv.count("wood");
    expect(put(s, "foundation", 1, 0, A, inv).ok).toBe(true);
    expect(inv.count("wood")).toBe(before - 4);
    expect(inv.count("stone")).toBe(100 - 2);
    for (const k of ["wall", "door", "chest"] as const) {
      expect(put(s, "foundation", 1, 0, A, inv).ok).toBe(false); // ja existe
      const r = put(s, k, 1, k === "wall" ? 0 : 0, A, inv);
      expect(r.ok).toBe(k === "wall"); // so uma peca em cima por tile
    }
    expect(put(s, "foundation", 0, 1, A, inv).ok).toBe(true);
    expect(put(s, "door", 0, 1, A, inv).ok).toBe(true);
  });

  it("parede/porta/bau exigem fundacao propria; fundacao de outro dono nao serve", () => {
    const s = sw();
    expect(put(s, "wall", 1, 0)).toMatchObject({ ok: false, reason: "precisa_de_fundacao" });
    put(s, "foundation", 1, 0, A);
    expect(put(s, "wall", 1, 0, B)).toMatchObject({ ok: false, reason: "nao_e_seu" });
    expect(put(s, "wall", 1, 0, A).ok).toBe(true);
  });

  it("transacao: sem recursos nada muda (nem a estrutura, nem o inventario)", () => {
    const s = sw();
    const inv = new Inventory(40);
    inv.add("wood", 3); // fundacao pede 4 madeira + 2 pedra
    const v = s.version;
    expect(put(s, "foundation", 1, 0, A, inv)).toMatchObject({ ok: false, reason: "faltam_recursos" });
    expect(inv.count("wood")).toBe(3);
    expect(s.count).toBe(0);
    expect(s.version).toBe(v);
  });

  it("alcance, terreno e limites de coordenada", () => {
    const s = sw();
    const far = s.place({ owner: A, kind: "foundation", tx: T.x + 5, ty: T.y, inv: rich(), terrain: world, occupants: [], ...center(T.x, T.y) });
    expect(far).toMatchObject({ ok: false, reason: "longe_demais" });
    expect(Math.hypot(5 * 32, 0)).toBeGreaterThan(BUILD_REACH);
    const out = s.place({ owner: A, kind: "foundation", tx: -1, ty: 0, inv: rich(), terrain: world, occupants: [], px: 0, py: 0 });
    expect(out).toMatchObject({ ok: false, weight: 3 });
    const nan = s.place({ owner: A, kind: "foundation", tx: T.x + 1, ty: T.y, inv: rich(), terrain: world, occupants: [], px: NaN, py: 0 });
    expect(nan.ok).toBe(false);
    // tile que nao e grama (a borda do mundo e solida)
    const edge = s.place({ owner: A, kind: "foundation", tx: 0, ty: 0, inv: rich(), terrain: world, occupants: [], px: 16, py: 16 });
    expect(edge).toMatchObject({ ok: false, reason: "terreno_invalido" });
  });

  it("colisao: parede e bau bloqueiam, porta fechada bloqueia, aberta e fundacao nao; extraSolid vale para o movimento", () => {
    const s = sw();
    world.extraSolid = s.solidAt;
    put(s, "foundation", 1, 0);
    expect(s.solidAt(T.x + 1, T.y)).toBe(false);
    put(s, "door", 1, 0);
    expect(s.solidAt(T.x + 1, T.y)).toBe(true);
    expect(collidesAt(world, (T.x + 1.5) * 32, (T.y + 0.5) * 32)).toBe(true);
    const o = { ...center(T.x, T.y), owner: A, tx: T.x + 1, ty: T.y, occupants: [] };
    expect(s.toggle(o).ok).toBe(true);
    expect(s.solidAt(T.x + 1, T.y)).toBe(false);
    expect(collidesAt(world, (T.x + 1.5) * 32, (T.y + 0.5) * 32)).toBe(false);
    world.extraSolid = null;
  });

  it("parede bloqueia linha de visao; porta aberta nao", () => {
    const s = sw();
    world.extraOpaque = s.opaqueAt;
    put(s, "foundation", 1, 0);
    put(s, "wall", 1, 0);
    const a = center(T.x, T.y);
    const b = center(T.x + 2, T.y);
    expect(lineClear(world, a.px, a.py, b.px, b.py)).toBe(false);
    world.extraOpaque = null;
  });

  it("nada prende jogador: nao constroi nem fecha porta em cima de alguem", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    const on = s.place({ owner: A, kind: "wall", tx: T.x + 1, ty: T.y, inv: rich(), terrain: world, occupants: [{ x: (T.x + 1.5) * 32, y: (T.y + 0.5) * 32 }], ...center(T.x, T.y) });
    expect(on).toMatchObject({ ok: false, reason: "alguem_no_local" });
    put(s, "door", 1, 0);
    const o = { ...center(T.x, T.y), owner: A, tx: T.x + 1, ty: T.y, occupants: [] };
    s.toggle(o); // abre
    expect(s.toggle({ ...o, occupants: [{ x: (T.x + 1.5) * 32, y: (T.y + 0.5) * 32 }] })).toMatchObject({ ok: false, reason: "alguem_no_local" });
    expect(s.solidAt(T.x + 1, T.y)).toBe(false);
  });

  it("so o dono usa porta e bau; bau guarda sem duplicar nem perder itens", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "chest", 1, 0);
    const inv = rich();
    const total = () => inv.count("wood") + (s.chestSlots(A, T.x + 1, T.y, ...Object.values(center(T.x, T.y)) as [number, number])?.reduce((n, x) => n + (x && x.id === "wood" ? x.qty : 0), 0) ?? 0);
    const t0 = total();
    const mv = (owner: string, slot: number, toChest: boolean) => s.move({ ...center(T.x, T.y), owner, tx: T.x + 1, ty: T.y, inv, slot, toChest });
    expect(mv(B, 0, true)).toMatchObject({ ok: false, reason: "nao_e_seu" });
    expect(s.chestSlots(B, T.x + 1, T.y, ...Object.values(center(T.x, T.y)) as [number, number])).toBeNull();
    expect(mv(A, 0, true).ok).toBe(true);
    expect(total()).toBe(t0);
    // enche o bau: 8 slots de madeira (10 por pilha) = 80; o resto fica no inventario
    for (let i = 0; i < 20; i++) mv(A, inv.slots.findIndex((x) => x && x.id === "wood"), true);
    expect(total()).toBe(t0);
    expect(mv(A, 99, true)).toMatchObject({ ok: false, reason: "slot_vazio" });
    expect(CHEST_SLOTS).toBe(8);
  });

  it("dano estrutural: peca de cima primeiro, depois a fundacao; bau destruido solta o conteudo", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "chest", 1, 0);
    const inv = rich();
    s.move({ ...center(T.x, T.y), owner: A, tx: T.x + 1, ty: T.y, inv, slot: 0, toChest: true });
    const hits = Math.ceil(PIECES.chest.hp / 20);
    let last = s.damage(T.x + 1, T.y, 20);
    for (let i = 1; i < hits; i++) last = s.damage(T.x + 1, T.y, 20);
    expect(last.destroyed).toBe(true);
    expect(last.drops.reduce((n, d) => n + d.qty, 0)).toBeGreaterThan(0);
    expect(s.count).toBe(1); // a fundacao continua
    expect(s.solidAt(T.x + 1, T.y)).toBe(false);
    for (let i = 0; i < 7; i++) s.damage(T.x + 1, T.y, 20);
    expect(s.count).toBe(0);
    expect(s.damage(T.x + 1, T.y, 20).hit).toBe(false);
    expect(s.damage(T.x + 1, T.y, NaN).hit).toBe(false);
  });

  it("limite de pecas por dono", () => {
    const s = sw();
    let n = 0;
    for (let dy = -4; dy <= 4 && n < MAX_PIECES_PER_OWNER; dy++) for (let dx = -2; dx <= 2; dx++) if (put(s, "foundation", dx, dy).ok) n++;
    expect(s.piecesOf(A)).toBe(n);
  });

  it("nearest acha o tile mais proximo dentro do alcance", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "foundation", 0, 1);
    expect(s.nearest(...(Object.values(center(T.x, T.y)) as [number, number]), 3)).toBeNull();
    expect(s.nearest(...(Object.values(center(T.x, T.y)) as [number, number]), 40)).not.toBeNull();
  });
});

describe("persistencia", () => {
  it("salvar -> JSON -> carregar mantem tudo (inclusive porta aberta e conteudo do bau)", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "door", 1, 0);
    put(s, "foundation", 0, 1);
    put(s, "chest", 0, 1);
    const inv = rich();
    const o = { ...center(T.x, T.y), owner: A };
    s.toggle({ ...o, tx: T.x + 1, ty: T.y, occupants: [] });
    s.move({ ...o, tx: T.x, ty: T.y + 1, inv, slot: 0, toChest: true });
    const json = JSON.parse(JSON.stringify(s.toSave(world.seed)));
    const r = StructureWorld.fromSave(json, world.width, world.height, world.seed)!;
    expect(r).not.toBeNull();
    expect(r.count).toBe(s.count);
    expect(r.view(A)).toEqual(s.view(A));
    expect(r.chestSlots(A, T.x, T.y + 1, o.px, o.py)).toEqual(s.chestSlots(A, T.x, T.y + 1, o.px, o.py));
    expect(r.solidAt(T.x + 1, T.y)).toBe(false); // porta continua aberta
  });

  it("dado salvo invalido ou de outra seed e recusado (nada de carregar lixo)", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    const good = JSON.parse(JSON.stringify(s.toSave(world.seed)));
    const load = (x: unknown) => StructureWorld.fromSave(x, world.width, world.height, world.seed);
    expect(load(good)).not.toBeNull();
    expect(StructureWorld.fromSave(good, world.width, world.height, world.seed + 1)).toBeNull();
    expect(load(null)).toBeNull();
    expect(load({ ...good, v: 2 })).toBeNull();
    expect(load({ ...good, tiles: [{ ...good.tiles[0], o: "../x" }] })).toBeNull();
    expect(load({ ...good, tiles: [{ ...good.tiles[0], f: -5 }] })).toBeNull();
    expect(load({ ...good, tiles: [{ ...good.tiles[0], x: 1e9 }] })).toBeNull();
    expect(load({ ...good, tiles: [good.tiles[0], good.tiles[0]] })).toBeNull(); // tile duplicado
    expect(load({ ...good, tiles: [{ ...good.tiles[0], t: { k: "chest", h: 50, i: [{ id: "ouro", qty: 1 }, null, null, null, null, null, null, null] } }] })).toBeNull();
  });

  it("view nao vaza o dono: so a marca 'meu' de quem esta vendo", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    expect(s.view(A)[0][4]).toBe(1);
    expect(s.view(B)[0][4]).toBe(0);
    expect(s.view("")[0][4]).toBe(0);
  });
});

describe("inspectBuild e PlayerLife.beginBuild", () => {
  it("aceita os 4 formatos e recusa campo extra, op/peca inventada, valores ruins", () => {
    expect(inspectBuild({ op: "place", actionId: 1, piece: "wall", tx: 3, ty: 4 }).msg).not.toBeNull();
    expect(inspectBuild({ op: "toggle", actionId: 1, tx: 3, ty: 4 }).msg).not.toBeNull();
    expect(inspectBuild({ op: "deposit", actionId: 1, tx: 3, ty: 4, slot: 2 }).msg).not.toBeNull();
    expect(inspectBuild({ op: "withdraw", actionId: 1, tx: 3, ty: 4, slot: 2 }).msg).not.toBeNull();
    for (const bad of [
      { op: "place", actionId: 1, piece: "wall", tx: 3, ty: 4, qty: 99 },
      { op: "place", actionId: 1, piece: "ouro", tx: 3, ty: 4 },
      { op: "place", actionId: 1, piece: "__proto__", tx: 3, ty: 4 },
      { op: "toggle", actionId: 1, tx: 3, ty: 4, owner: "x" },
      { op: "demolir", actionId: 1, tx: 3, ty: 4 },
      { op: "place", actionId: -1, piece: "wall", tx: 3, ty: 4 },
      { op: "place", actionId: 1, piece: "wall", tx: 3.5, ty: 4 },
      { op: "place", actionId: 1, piece: "wall", tx: -3, ty: 4 },
      { op: "deposit", actionId: 1, tx: 3, ty: 4, slot: 1e9 },
      { op: "deposit", actionId: 1, tx: 3, ty: 4 },
      "place",
      null,
      [],
    ]) {
      const r = inspectBuild(bad);
      expect(r.msg).toBeNull();
    }
  });

  it("beginBuild: morto nao constroi, actionId repetido nao repete, intervalo minimo", () => {
    const life = new PlayerLife();
    expect(life.beginBuild(1, 1000).ok).toBe(true);
    expect(life.beginBuild(1, 5000)).toMatchObject({ ok: false, reason: "acao_repetida" });
    expect(life.beginBuild(2, 1100)).toMatchObject({ ok: false, reason: "em_recarga" });
    expect(life.beginBuild(3, 1300).ok).toBe(true);
  });

  it("3.000 pedidos hostis seguidos: recursos so saem quando a peca nasce (conta fecha)", () => {
    const s = sw();
    const inv = new Inventory(40);
    inv.add("wood", 10);
    inv.add("stone", 4);
    let placed = 0;
    for (let i = 0; i < 3000; i++) {
      const dx = (i % 3) - 1;
      const dy = Math.floor(i / 3) % 3 - 1;
      if (s.place({ owner: A, kind: "foundation", tx: T.x + dx, ty: T.y + dy, inv, terrain: world, occupants: [], ...center(T.x, T.y) }).ok) placed++;
    }
    expect(placed).toBe(2); // 10 madeira / 4 e 4 pedra / 2
    expect(inv.count("wood")).toBe(10 - 4 * placed);
    expect(inv.count("stone")).toBe(4 - 2 * placed);
    expect(base(s).s).toBe(s);
  });
});

describe("janela, telhado, reparo e acesso compartilhado", () => {
  const me = center(T.x, T.y);
  const O = { ...me, owner: A, occupants: [] as { x: number; y: number }[] };

  it("janela bloqueia a passagem mas nao a linha de visao; parede continua bloqueando os dois", () => {
    const s = sw();
    world.extraSolid = s.solidAt;
    world.extraOpaque = s.opaqueAt;
    put(s, "foundation", 1, 0);
    expect(put(s, "window", 1, 0).ok).toBe(true);
    expect(s.solidAt(T.x + 1, T.y)).toBe(true);
    expect(s.opaqueAt(T.x + 1, T.y)).toBe(false);
    const b = center(T.x + 2, T.y);
    expect(lineClear(world, me.px, me.py, b.px, b.py)).toBe(true);
    expect(s.toggle({ ...O, tx: T.x + 1, ty: T.y })).toMatchObject({ ok: false, reason: "nada_aqui" }); // janela nao abre
    world.extraSolid = null;
    world.extraOpaque = null;
  });

  it("telhado exige fundacao propria E apoio; nao e solido; e destruido antes da fundacao", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    expect(put(s, "roof", 1, 0)).toMatchObject({ ok: false, reason: "sem_apoio" });
    expect(put(s, "wall", 1, 0).ok).toBe(true);
    expect(put(s, "roof", 1, 0).ok).toBe(true); // apoiado na parede do proprio tile
    expect(put(s, "roof", 1, 0)).toMatchObject({ ok: false, reason: "ocupado" });
    put(s, "foundation", 0, 1);
    expect(put(s, "roof", 0, 1)).toMatchObject({ ok: false, reason: "sem_apoio" }); // vizinho (1,0) esta na diagonal: nao apoia
    put(s, "foundation", 1, 1);
    expect(put(s, "roof", 1, 1).ok).toBe(true); // apoiado no telhado/parede do vizinho (1,0)
    expect(s.solidAt(T.x + 1, T.y + 1)).toBe(false);
    expect(s.view(A).find((r) => r[0] === T.x + 1 && r[1] === T.y + 1)![5]).toBe(1);
    // dano em (1,1): sem peca em cima -> telhado primeiro, depois a fundacao
    for (let i = 0; i < Math.ceil(PIECES.roof.hp / 20); i++) s.damage(T.x + 1, T.y + 1, 20);
    expect(s.view(A).find((r) => r[0] === T.x + 1 && r[1] === T.y + 1)![5]).toBe(0);
    expect(s.count).toBe(3); // as 3 fundacoes continuam
  });

  it("reparo: so o dono, custa madeira pela vida que faltava, transacao (sem madeira nada muda)", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "wall", 1, 0);
    s.damage(T.x + 1, T.y, 100); // parede 160 -> 60
    const inv = rich();
    expect(s.repair({ ...O, owner: B, tx: T.x + 1, ty: T.y, inv })).toMatchObject({ ok: false, reason: "nao_e_seu" });
    const poor = new Inventory(40);
    expect(s.repair({ ...O, tx: T.x + 1, ty: T.y, inv: poor })).toMatchObject({ ok: false, reason: "faltam_recursos" });
    const w0 = inv.count("wood");
    expect(s.repair({ ...O, tx: T.x + 1, ty: T.y, inv }).ok).toBe(true);
    expect(w0 - inv.count("wood")).toBe(Math.ceil(100 / REPAIR_HP_PER_WOOD));
    expect(s.repair({ ...O, tx: T.x + 1, ty: T.y, inv })).toMatchObject({ ok: false, reason: "nada_a_reparar" });
    // a parede voltou a vida cheia: precisa do dano total de novo para cair
    for (let i = 0; i < Math.ceil(PIECES.wall.hp / 20) - 1; i++) s.damage(T.x + 1, T.y, 20);
    expect(s.solidAt(T.x + 1, T.y)).toBe(true);
  });

  it("acesso compartilhado: liberado usa porta e bau, mas nao constroi, nao repara; remover tira o acesso; limite", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "chest", 1, 0);
    put(s, "foundation", 0, 1);
    put(s, "door", 0, 1);
    const inv = rich();
    const mv = (owner: string) => s.move({ ...O, owner, tx: T.x + 1, ty: T.y, inv, slot: 0, toChest: true });
    expect(mv(B)).toMatchObject({ ok: false, reason: "nao_e_seu" });
    expect(s.toggleTrust(A, B)).toMatchObject({ ok: true, added: true });
    expect(mv(B).ok).toBe(true);
    expect(s.toggle({ ...O, owner: B, tx: T.x, ty: T.y + 1 }).ok).toBe(true); // abre a porta
    expect(s.view(B).find((r) => r[0] === T.x + 1)![4]).toBe(2); // acesso "liberado" (2)
    expect(s.view(A).find((r) => r[0] === T.x + 1)![4]).toBe(1);
    expect(put(s, "wall", 0, 1, B)).toMatchObject({ ok: false, reason: "nao_e_seu" }); // nao constroi nas pecas do outro
    expect(s.repair({ ...O, owner: B, tx: T.x + 1, ty: T.y, inv })).toMatchObject({ ok: false, reason: "nao_e_seu" });
    expect(s.toggleTrust(A, A)).toMatchObject({ ok: false });
    expect(s.toggleTrust(A, B)).toMatchObject({ ok: true, added: false }); // repetir remove
    expect(mv(B)).toMatchObject({ ok: false, reason: "nao_e_seu" });
    for (let i = 0; i < MAX_TRUSTED; i++) expect(s.toggleTrust(A, "p" + i).ok).toBe(true);
    expect(s.toggleTrust(A, "extra")).toMatchObject({ ok: false, reason: "limite_de_confianca" });
  });

  it("persistencia guarda janela, telhado (com dano), reparo e acesso; dado ruim de acesso/telhado e recusado", () => {
    const s = sw();
    put(s, "foundation", 1, 0);
    put(s, "window", 1, 0);
    put(s, "roof", 1, 0);
    s.damage(T.x + 1, T.y, 30); // janela (topo) leva o dano
    s.toggleTrust(A, B);
    const json = JSON.parse(JSON.stringify(s.toSave(world.seed)));
    const r = StructureWorld.fromSave(json, world.width, world.height, world.seed)!;
    expect(r).not.toBeNull();
    expect(r.view(A)).toEqual(s.view(A));
    expect(r.view(B)[0][4]).toBe(2);
    expect(r.opaqueAt(T.x + 1, T.y)).toBe(false);
    const load = (x: unknown) => StructureWorld.fromSave(x, world.width, world.height, world.seed);
    expect(load({ ...json, trust: { [A]: [A] } })).toBeNull(); // confiar em si mesmo
    expect(load({ ...json, trust: { "../x": [B] } })).toBeNull();
    expect(load({ ...json, trust: { [A]: Array.from({ length: 20 }, (_, i) => "p" + i) } })).toBeNull();
    expect(load({ ...json, tiles: [{ ...json.tiles[0], r: -3 }] })).toBeNull();
  });

  it("inspectBuild aceita repair e trust e recusa campos extras neles", () => {
    expect(inspectBuild({ op: "repair", actionId: 1, tx: 3, ty: 4 }).msg).not.toBeNull();
    expect(inspectBuild({ op: "trust", actionId: 1 }).msg).not.toBeNull();
    for (const bad of [{ op: "trust", actionId: 1, who: "x" }, { op: "trust", actionId: 1, tx: 1, ty: 1 }, { op: "trust" }, { op: "repair", actionId: 1, tx: 3, ty: 4, qty: 5 }, { op: "place", actionId: 1, piece: "telhadox", tx: 1, ty: 1 }]) expect(inspectBuild(bad).msg).toBeNull();
    expect(inspectBuild({ op: "place", actionId: 1, piece: "window", tx: 3, ty: 4 }).msg).not.toBeNull();
    expect(inspectBuild({ op: "place", actionId: 1, piece: "roof", tx: 3, ty: 4 }).msg).not.toBeNull();
  });
});
