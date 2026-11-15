import { describe, expect, it } from "vitest";
import { ChunkedWorld, DROP_TTL_MS, HARVEST_COOLDOWN_MS, Inventory, LootWorld, NODE_RESPAWN_MS, PlayerLife, nodeAt, inspectInteract } from "./index";

const world = new ChunkedWorld();

function findNode(item: string): { tx: number; ty: number } {
  for (let ty = 1; ty < world.height - 1; ty++) for (let tx = 1; tx < world.width - 1; tx++) if (nodeAt(world, tx, ty)?.item === item) return { tx, ty };
  throw new Error("sem recurso " + item);
}
// posicao do jogador = centro do tile (o servidor aqui so mede distancia; garante que este e o alvo mais proximo)
const near = (n: { tx: number; ty: number }) => ({ x: (n.tx + 0.5) * 32, y: (n.ty + 0.5) * 32 });

describe("coleta (Etapa 7)", () => {
  it("existem madeira, pedra e sucata, deterministicos", () => {
    for (const i of ["wood", "stone", "scrap"]) expect(findNode(i)).toEqual(findNode(i));
  });

  it("dois jogadores nao coletam alem da quantidade disponivel", () => {
    const loot = new LootWorld();
    const n = findNode("wood"); // 3 unidades
    const a = new Inventory(), b = new Inventory();
    const pos = near(n);
    let t = 0, got = 0;
    for (let i = 0; i < 6; i++) {
      const r = loot.interact(world, i % 2 ? b : a, pos.x, pos.y, (t += 1000));
      if (r.ok) got++;
    }
    expect(got).toBe(3);
    expect(a.count("wood") + b.count("wood")).toBe(3);
    expect(loot.remaining(world, n.tx, n.ty)).toBe(0);
    expect(loot.interact(world, a, pos.x, pos.y, t + 1)).toEqual({ ok: false, reason: "recurso_esgotado" });
  });

  it("valida distancia e volta apos o tempo de respawn", () => {
    const loot = new LootWorld();
    const n = findNode("stone");
    const inv = new Inventory();
    expect(loot.interact(world, inv, world.spawn.x, world.spawn.y, 0)).toEqual({ ok: false, reason: "nada_por_perto" });
    const pos = near(n);
    for (let i = 0; i < 3; i++) expect(loot.interact(world, inv, pos.x, pos.y, i * 1000).ok).toBe(true);
    expect(loot.remaining(world, n.tx, n.ty)).toBe(0);
    loot.tick(2000 + NODE_RESPAWN_MS);
    expect(loot.remaining(world, n.tx, n.ty)).toBe(3);
  });

  it("inventario cheio nao consome o recurso", () => {
    const loot = new LootWorld();
    const n = findNode("wood");
    const inv = new Inventory(1);
    inv.add("water_bottle", 5);
    const pos = near(n);
    expect(loot.interact(world, inv, pos.x, pos.y, 0)).toEqual({ ok: false, reason: "inventario_cheio" });
    expect(loot.remaining(world, n.tx, n.ty)).toBe(3);
  });

  it("mochila de morte: itens conservados entre dois jogadores, sem duplicar", () => {
    const loot = new LootWorld();
    const dead = new PlayerLife();
    const before = dead.inventory.count("water_bottle") + dead.inventory.count("canned_food") + dead.inventory.count("bandage");
    dead.die(0);
    loot.addDrop(100, 100, dead.lost, 0);
    const a = new Inventory(1); // so cabe 1 pilha
    const b = new Inventory();
    expect(loot.interact(world, a, 110, 100, 10).ok).toBe(true);
    expect(loot.dropCount).toBe(1); // sobrou no chao
    expect(loot.interact(world, b, 110, 100, 20).ok).toBe(true);
    expect(loot.dropCount).toBe(0);
    const total = (i: Inventory) => i.count("water_bottle") + i.count("canned_food") + i.count("bandage");
    expect(total(a) + total(b)).toBe(before);
  });

  it("mochila expira", () => {
    const loot = new LootWorld();
    loot.addDrop(0, 0, [{ id: "wood", qty: 1 }], 0);
    loot.tick(DROP_TTL_MS);
    expect(loot.dropCount).toBe(0);
  });

  it("PlayerLife.interact: id repetido, cooldown e morto", () => {
    const loot = new LootWorld();
    const life = new PlayerLife();
    const n = findNode("wood");
    const p = near(n);
    expect(life.interact(1, 1000, world, loot, p.x, p.y).ok).toBe(true);
    expect(life.interact(1, 5000, world, loot, p.x, p.y)).toMatchObject({ ok: false, reason: "acao_repetida" });
    expect(life.interact(2, 1000 + HARVEST_COOLDOWN_MS - 1, world, loot, p.x, p.y)).toMatchObject({ ok: false, reason: "em_recarga" });
    expect(life.interact(3, 1000 + HARVEST_COOLDOWN_MS, world, loot, p.x, p.y).ok).toBe(true);
    life.die(9000);
    expect(life.interact(4, 99999, world, loot, p.x, p.y)).toMatchObject({ ok: false, reason: "morto" });
  });

  it("inspectInteract rejeita campos extras", () => {
    expect(inspectInteract({ actionId: 1 }).msg).toEqual({ actionId: 1 });
    expect(inspectInteract({ actionId: 1, x: 5 }).msg).toBeNull();
  });
});
