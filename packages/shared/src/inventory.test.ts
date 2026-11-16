import { describe, expect, it } from "vitest";
import {
  ITEMS,
  Inventory,
  ChunkedWorld,
  LootWorld,
  MAX_CARRY_WEIGHT,
  PlayerLife,
  StructureWorld,
  applyInvOp,
  bestWeapon,
  compareStacks,
  inspectInventoryMove,
  makeSave,
  parseSave,
  applySave,
  weaponSlot,
  type InventoryMoveMsg,
} from "./index";

// EXTRA 6.3 (inventario): peso, durabilidade, equipar, mover/dividir/descartar e validacao de mensagens.

const player = (): Inventory => new Inventory(12, MAX_CARRY_WEIGHT);
const msg = (o: Record<string, unknown>, id = 1): InventoryMoveMsg => ({ actionId: id, ...o }) as InventoryMoveMsg;

describe("peso", () => {
  it("soma o peso e recusa o que passa do limite (devolve o que nao coube)", () => {
    const inv = player();
    expect(inv.add("wood", 10)).toBe(0); // 10 kg
    expect(inv.add("stone", 10)).toBe(0); // +15 kg = 25 kg (no limite)
    expect(inv.totalWeight()).toBe(25);
    expect(inv.add("wood", 1)).toBe(1); // nao cabe: 26 kg
    expect(inv.count("wood")).toBe(10);
  });
  it("entra so o que o peso deixa, e o resto volta", () => {
    const inv = player();
    inv.add("stone", 10); // 15 kg
    expect(inv.add("wood", 10)).toBe(0); // 10 kg -> 25 kg
    const inv2 = player();
    inv2.add("stone", 10); // 15 kg
    inv2.add("stone", 3); // 4.5 kg -> 19.5
    expect(inv2.add("workbench", 1)).toBe(1); // 8 kg nao cabe (19.5 + 8 > 25)
  });
  it("bau e inventario sem limite (Infinity) nao sofrem a regra", () => {
    const chest = new Inventory(24);
    expect(chest.add("workbench", 5)).toBe(0);
    expect(chest.totalWeight()).toBe(40);
  });
  it("clone mantem o limite; transacao de coleta/fabricacao respeita o peso", () => {
    const inv = player();
    inv.add("stone", 10);
    inv.add("wood", 10);
    expect(inv.clone().maxWeight).toBe(MAX_CARRY_WEIGHT);
    expect(inv.clone().add("wood", 1)).toBe(1);
  });
  it("save acima do peso carrega sem perder nada (so nao deixa pegar mais)", () => {
    const life = new PlayerLife();
    const big = new Inventory();
    big.add("workbench", 4); // 32 kg
    const save = parseSave({ v: 1, health: 100, hunger: 50, thirst: 50, energy: 50, slots: big.snapshot() });
    expect(save).not.toBeNull();
    applySave(life, save!);
    expect(life.inventory.count("workbench")).toBe(4);
    expect(life.inventory.add("wood", 1)).toBe(1);
  });
});

describe("durabilidade", () => {
  it("item novo entra com durabilidade cheia; consumivel nao tem", () => {
    const inv = player();
    inv.add("club", 1);
    expect(inv.slots[0]).toEqual({ id: "club", qty: 1, dur: ITEMS.club.durability });
    inv.add("bandage", 1);
    expect(inv.slots[1]).toEqual({ id: "bandage", qty: 1 });
  });
  it("durabilidade de entrada invalida vira a maxima (nunca passa dela)", () => {
    const inv = player();
    inv.add("club", 1, 9999);
    inv.add("spear", 1, -4);
    expect(inv.slots[0]!.dur).toBe(40);
    expect(inv.slots[1]!.dur).toBe(35);
  });
  it("wear gasta, quebra em 0 e remove o item", () => {
    const inv = player();
    inv.add("club", 1, 2);
    expect(inv.wear(0, 1)).toBeNull();
    expect(inv.slots[0]!.dur).toBe(1);
    expect(inv.wear(0, 1)).toBe("club");
    expect(inv.slots[0]).toBeNull();
    expect(inv.wear(0, 1)).toBeNull(); // slot vazio nao quebra nada
  });
  it("a durabilidade viaja com o item: bau, chao (morte) e save", () => {
    const inv = player();
    inv.add("axe", 1, 12);
    expect(inv.clone().slots[0]!.dur).toBe(12);
    expect(inv.clear()[0]).toEqual({ id: "axe", qty: 1, dur: 12 });
    const loot = new LootWorld();
    const drop = loot.addDrop(0, 0, [{ id: "axe", qty: 1, dur: 12 }], 0)!;
    expect(drop.items[0].dur).toBe(12);
    const chest = new Inventory(24);
    chest.add("axe", 1, 7);
    expect(chest.snapshot()[0]!.dur).toBe(7);
    const life = new PlayerLife();
    life.inventory.add("spear", 1, 5);
    const sv = parseSave(JSON.parse(JSON.stringify(makeSave(life, 10, 10))));
    expect(sv!.slots.find((s) => s?.id === "spear")!.dur).toBe(5);
  });
  it("save com durabilidade/equipado invalidos nao derruba o save", () => {
    const slots = [{ id: "club", qty: 1, dur: -3, eq: true }, { id: "spear", qty: 1, dur: 9999, eq: true }, { id: "wood", qty: 1, eq: true }, ...new Array(9).fill(null)];
    const s = parseSave({ v: 1, health: 100, hunger: 50, thirst: 50, energy: 50, slots });
    expect(s).not.toBeNull();
    expect(s!.slots[0]).toEqual({ id: "club", qty: 1, eq: true }); // dur invalida some (volta cheia); 1o equipado vale
    expect(s!.slots[1]).toEqual({ id: "spear", qty: 1, dur: 35 }); // limitada ao maximo; 2o equipado ignorado
    expect(s!.slots[2]).toEqual({ id: "wood", qty: 1 }); // nao equipavel
  });
});

describe("mover, dividir, descartar", () => {
  it("move para slot vazio, junta pilhas e troca itens diferentes", () => {
    const inv = player();
    inv.slots[0] = { id: "wood", qty: 4 };
    inv.slots[3] = { id: "wood", qty: 8 };
    inv.slots[5] = { id: "stone", qty: 2 };
    expect(applyInvOp(inv, { op: "move", from: 0, to: 1 })).toEqual({ ok: true });
    expect(inv.slots[1]).toEqual({ id: "wood", qty: 4 });
    expect(inv.slots[0]).toBeNull();
    expect(applyInvOp(inv, { op: "move", from: 1, to: 3 })).toEqual({ ok: true }); // 8 + 4 -> 10 + 2 (max 10)
    expect(inv.slots[3]!.qty).toBe(10);
    expect(inv.slots[1]!.qty).toBe(2);
    expect(applyInvOp(inv, { op: "move", from: 1, to: 5 })).toEqual({ ok: true }); // troca
    expect(inv.slots[1]).toEqual({ id: "stone", qty: 2 });
    expect(inv.slots[5]).toEqual({ id: "wood", qty: 2 });
    expect(inv.count("wood")).toBe(12); // nada sumiu nem duplicou
  });
  it("recusas: slot vazio, mesmo slot, destino cheio, fora do intervalo", () => {
    const inv = player();
    inv.slots[0] = { id: "wood", qty: 10 };
    inv.slots[1] = { id: "wood", qty: 10 };
    expect(applyInvOp(inv, { op: "move", from: 4, to: 5 })).toMatchObject({ ok: false, reason: "slot_vazio" });
    expect(applyInvOp(inv, { op: "move", from: 0, to: 0 })).toMatchObject({ ok: false, reason: "nada_a_fazer" });
    expect(applyInvOp(inv, { op: "move", from: 0, to: 1 })).toMatchObject({ ok: false, reason: "nada_a_fazer" });
    expect(applyInvOp(inv, { op: "move", from: 0, to: 99 })).toMatchObject({ ok: false, reason: "valores_invalidos" });
  });
  it("divide a pilha no primeiro slot livre; nao divide o que nao empilha ou tudo", () => {
    const inv = player();
    inv.slots[0] = { id: "canned_food", qty: 5 };
    inv.slots[1] = { id: "club", qty: 1, dur: 10 };
    expect(applyInvOp(inv, { op: "split", slot: 0, qty: 2 })).toEqual({ ok: true });
    expect(inv.slots[0]!.qty).toBe(3);
    expect(inv.slots[2]).toEqual({ id: "canned_food", qty: 2 });
    expect(applyInvOp(inv, { op: "split", slot: 0, qty: 3 })).toMatchObject({ ok: false, reason: "nao_divisivel" });
    expect(applyInvOp(inv, { op: "split", slot: 1, qty: 1 })).toMatchObject({ ok: false, reason: "nao_divisivel" });
    const cheio = player();
    for (let i = 0; i < 12; i++) cheio.slots[i] = { id: "canned_food", qty: 5 };
    expect(applyInvOp(cheio, { op: "split", slot: 0, qty: 2 })).toMatchObject({ ok: false, reason: "sem_slot_livre" });
    expect(cheio.count("canned_food")).toBe(60);
  });
  it("descartar destroi so o que existe e confere a quantidade", () => {
    const inv = player();
    inv.slots[0] = { id: "wood", qty: 5 };
    expect(applyInvOp(inv, { op: "discard", slot: 0, qty: 6 })).toMatchObject({ ok: false, reason: "quantidade_invalida" });
    expect(applyInvOp(inv, { op: "discard", slot: 0, qty: 2 })).toEqual({ ok: true });
    expect(inv.slots[0]!.qty).toBe(3);
    expect(applyInvOp(inv, { op: "discard", slot: 0, qty: 3 })).toEqual({ ok: true });
    expect(inv.slots[0]).toBeNull();
    expect(applyInvOp(inv, { op: "discard", slot: 0, qty: 1 })).toMatchObject({ ok: false, reason: "slot_vazio" });
  });
});

describe("equipar", () => {
  it("equipa so itens equipaveis, um por vez, e a marca viaja com o item ao mover", () => {
    const inv = player();
    inv.add("club", 1);
    inv.add("spear", 1);
    inv.add("bandage", 1);
    expect(applyInvOp(inv, { op: "equip", slot: 2 })).toMatchObject({ ok: false, reason: "nao_equipavel" });
    expect(applyInvOp(inv, { op: "equip", slot: 0 })).toEqual({ ok: true });
    expect(applyInvOp(inv, { op: "equip", slot: 1 })).toEqual({ ok: true });
    expect(inv.slots.filter((s) => s?.eq).length).toBe(1);
    expect(inv.equippedSlot()).toBe(1);
    applyInvOp(inv, { op: "move", from: 1, to: 7 });
    expect(inv.equippedSlot()).toBe(7);
    expect(applyInvOp(inv, { op: "unequip" })).toEqual({ ok: true });
    expect(inv.equippedSlot()).toBe(-1);
    expect(applyInvOp(inv, { op: "unequip" })).toMatchObject({ ok: false, reason: "nada_a_fazer" });
  });
  it("a arma usada: equipada vale; ferramenta na mao = punho; nada equipado = a de maior dano (como antes)", () => {
    const inv = player();
    inv.add("club", 1); // 20
    inv.add("spear", 1); // 28
    inv.add("axe", 1);
    expect(bestWeapon(inv).item).toBe("spear"); // automatico
    applyInvOp(inv, { op: "equip", slot: 0 });
    expect(bestWeapon(inv).item).toBe("club"); // escolha do jogador mesmo sendo mais fraca
    applyInvOp(inv, { op: "equip", slot: 2 });
    expect(bestWeapon(inv).item).toBeNull(); // machado na mao: punho
    expect(weaponSlot(inv)).toBe(-1);
    applyInvOp(inv, { op: "unequip" });
    expect(bestWeapon(inv).item).toBe("spear");
  });
  it("equipado nao sai do inventario ao morrer: vai para o chao SEM a marca", () => {
    const inv = player();
    inv.add("club", 1);
    applyInvOp(inv, { op: "equip", slot: 0 });
    const lost = inv.clear();
    expect(lost[0]).toEqual({ id: "club", qty: 1, dur: 40 });
  });
});

describe("comparar equipamentos", () => {
  it("arma x arma: dano, alcance, recarga, dano/seg, durabilidade", () => {
    const rows = compareStacks({ id: "spear", qty: 1, dur: 35 }, { id: "club", qty: 1, dur: 10 })!;
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by["Dano"]).toMatchObject({ mine: "28", worn: "20", better: "mine" });
    expect(by["Recarga"].better).toBe("worn"); // 0.9s x 0.8s: menor e melhor
    expect(by["Durabilidade"]).toMatchObject({ mine: "35", worn: "10", better: "mine" });
  });
  it("mesmo item compara so a durabilidade; familias diferentes nao comparam", () => {
    expect(compareStacks({ id: "axe", qty: 1, dur: 5 }, { id: "axe", qty: 1, dur: 50 })).toMatchObject([{ label: "Durabilidade", better: "worn" }]);
    expect(compareStacks({ id: "axe", qty: 1 }, { id: "club", qty: 1 })).toBeNull();
  });
});

describe("desgaste em uso", () => {
  it("golpe que acerta gasta a arma; ao quebrar some e avisa o dono", () => {
    const life = new PlayerLife();
    life.inventory.add("club", 1, 1);
    life.wear(life.inventory.slots.findIndex((s) => s?.id === "club"), 1);
    expect(life.inventory.count("club")).toBe(0);
    expect(life.notices).toEqual(["Porrete quebrou!"]);
  });
});

describe("PlayerLife.inventoryOp", () => {
  it("vivo, actionId novo e intervalo minimo; repetir nao executa duas vezes", () => {
    const life = new PlayerLife();
    life.inventory.slots[5] = { id: "wood", qty: 2 };
    const v0 = life.invVersion;
    expect(life.inventoryOp(msg({ op: "move", from: 5, to: 6 }, 1), 1000)).toEqual({ ok: true });
    expect(life.invVersion).toBe(v0 + 1);
    expect(life.inventoryOp(msg({ op: "move", from: 6, to: 7 }, 1), 2000)).toMatchObject({ ok: false, reason: "acao_repetida" });
    expect(life.inventoryOp(msg({ op: "move", from: 6, to: 7 }, 2), 1050)).toMatchObject({ ok: false, reason: "em_recarga" });
    expect(life.inventoryOp(msg({ op: "move", from: 6, to: 7 }, 3), 1200)).toEqual({ ok: true });
    life.die(3000);
    expect(life.inventoryOp(msg({ op: "unequip" }, 4), 5000)).toMatchObject({ ok: false, reason: "morto" });
  });
  it("operacao recusada nao muda a versao nem o inventario", () => {
    const life = new PlayerLife();
    const before = JSON.stringify(life.inventory.snapshot());
    const v0 = life.invVersion;
    expect(life.inventoryOp(msg({ op: "discard", slot: 0, qty: 99 }, 1), 1000)).toMatchObject({ ok: false });
    expect(life.invVersion).toBe(v0);
    expect(JSON.stringify(life.inventory.snapshot())).toBe(before);
  });
});

describe("validacao da mensagem (nunca confiar na rede)", () => {
  const ok = (o: Record<string, unknown>): boolean => inspectInventoryMove(o, 12).msg !== null;
  it("aceita as 5 operacoes bem formadas", () => {
    expect(ok({ op: "move", actionId: 1, from: 0, to: 11 })).toBe(true);
    expect(ok({ op: "split", actionId: 1, slot: 3, qty: 2 })).toBe(true);
    expect(ok({ op: "discard", actionId: 1, slot: 3, qty: 2 })).toBe(true);
    expect(ok({ op: "equip", actionId: 1, slot: 3 })).toBe(true);
    expect(ok({ op: "unequip", actionId: 1 })).toBe(true);
  });
  it("recusa op desconhecida, valores ruins e campos de outra op", () => {
    expect(inspectInventoryMove({ op: "give", actionId: 1 }, 12)).toMatchObject({ msg: null, reason: "valores_invalidos" });
    expect(inspectInventoryMove({ op: "__proto__", actionId: 1 }, 12).msg).toBeNull();
    expect(ok({ op: "move", actionId: 1, from: 0, to: 12 })).toBe(false);
    expect(ok({ op: "move", actionId: 1, from: -1, to: 2 })).toBe(false);
    expect(ok({ op: "move", actionId: 1.5, from: 0, to: 2 })).toBe(false);
    expect(ok({ op: "split", actionId: 1, slot: 0, qty: 0 })).toBe(false);
    expect(ok({ op: "split", actionId: 1, slot: 0, qty: 1e9 })).toBe(false);
    expect(ok({ op: "discard", actionId: 1, slot: 0, qty: "2" })).toBe(false);
    expect(inspectInventoryMove({ op: "equip", actionId: 1, slot: 0, qty: 2 }, 12)).toMatchObject({ msg: null, reason: "campos_extras", weight: 5 });
    expect(inspectInventoryMove({ op: "equip", actionId: 1, slot: 0, extra: 1 }, 12)).toMatchObject({ msg: null, reason: "campos_extras" });
    expect(inspectInventoryMove(null, 12).msg).toBeNull();
    expect(inspectInventoryMove([], 12).msg).toBeNull();
  });
});

describe("bau (StructureWorld.move) com durabilidade e peso", () => {
  const world = new ChunkedWorld();
  const T = world.spawnTile;
  const at = { px: (T.x + 0.5) * 32, py: (T.y + 0.5) * 32 };
  const chestWorld = (): StructureWorld => {
    const s = new StructureWorld(world.width, world.height, world.tileSize);
    const rich = new Inventory(60);
    rich.add("wood", 30);
    rich.add("stone", 10);
    rich.add("scrap", 10);
    for (const kind of ["foundation", "chest"] as const) expect(s.place({ owner: "aaaa", kind, tx: T.x + 1, ty: T.y, inv: rich, terrain: world, occupants: [], ...at }).ok).toBe(true);
    return s;
  };
  const mv = (s: StructureWorld, inv: Inventory, slot: number, toChest: boolean) => s.move({ ...at, owner: "aaaa", tx: T.x + 1, ty: T.y, inv, slot, toChest });
  const chestOf = (s: StructureWorld) => s.chestSlots("aaaa", T.x + 1, T.y, at.px, at.py)!;

  it("guardar e retirar mantem a durabilidade; equipado volta sem a marca", () => {
    const s = chestWorld();
    const inv = player();
    inv.add("axe", 1, 9);
    applyInvOp(inv, { op: "equip", slot: 0 });
    expect(mv(s, inv, 0, true).ok).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(chestOf(s)[0]).toEqual({ id: "axe", qty: 1, dur: 9 });
    expect(mv(s, inv, 0, false).ok).toBe(true);
    expect(inv.slots[0]).toEqual({ id: "axe", qty: 1, dur: 9 });
  });

  it("retirar do bau respeita o peso: o que nao cabe fica no bau, nada some", () => {
    const s = chestWorld();
    const big = new Inventory(60); // so para encher o bau
    big.add("stone", 10);
    expect(mv(s, big, 0, true).ok).toBe(true); // 15 kg de pedra no bau
    const inv = player();
    inv.add("wood", 10); // 10 kg
    inv.add("stone", 6); // 9 kg: 19 kg carregados, sobram 6 kg (cabem 4 pedras)
    expect(mv(s, inv, 2, false)).toMatchObject({ ok: false }); // slot 2 vazio
    const chestStone = chestOf(s).findIndex((x) => x?.id === "stone");
    expect(mv(s, inv, chestStone, false).ok).toBe(true);
    expect(inv.count("stone")).toBe(6 + 4); // so cabem 4 (6 kg / 1.5)
    expect(chestOf(s).reduce((n, x) => n + (x?.id === "stone" ? x.qty : 0), 0)).toBe(6); // o resto continua no bau
    expect(inv.totalWeight()).toBeLessThanOrEqual(MAX_CARRY_WEIGHT);
    expect(mv(s, inv, chestStone, false)).toMatchObject({ ok: false, reason: "inventario_cheio" }); // sem espaco: nada se move
  });
});
