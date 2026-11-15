import { describe, expect, it } from "vitest";
import { Inventory, PlayerLife, applySave, makeSave, parseJoinOptions, parseSave } from "./index";

describe("persistencia (Etapa 7)", () => {
  it("salvar e restaurar mantem inventario, medidores e posicao", () => {
    const a = new PlayerLife();
    a.inventory.add("wood", 7);
    a.survival.hunger = 42;
    const save = makeSave(a, 123.456, 78);
    const parsed = parseSave(JSON.parse(JSON.stringify(save)));
    expect(parsed).not.toBeNull();
    const b = new PlayerLife();
    applySave(b, parsed!);
    expect(b.inventory.count("wood")).toBe(7);
    expect(b.inventory.count("water_bottle")).toBe(2);
    expect(b.survival.hunger).toBe(42);
    expect(parsed!.x).toBe(123.5);
  });

  it("morto e salvo como recomecar (kit inicial, sem posicao)", () => {
    const a = new PlayerLife();
    a.inventory.add("stone", 5);
    a.die(0);
    const s = makeSave(a, 50, 50);
    expect(s.x).toBeUndefined();
    const b = new PlayerLife();
    applySave(b, s);
    expect(b.inventory.count("stone")).toBe(0);
    expect(b.inventory.count("canned_food")).toBe(2);
  });

  it("rejeita dados adulterados ou invalidos", () => {
    const ok = makeSave(new PlayerLife(), 1, 1);
    expect(parseSave({ ...ok, slots: [{ id: "diamante", qty: 1 }] })).toBeNull();
    expect(parseSave({ ...ok, slots: [{ id: "wood", qty: 999 }] })).toBeNull();
    expect(parseSave({ ...ok, slots: [{ id: "wood", qty: 1.5 }] })).toBeNull();
    expect(parseSave({ ...ok, health: 0 })).toBeNull();
    expect(parseSave({ ...ok, hunger: NaN })).toBeNull();
    expect(parseSave({ ...ok, v: 99 })).toBeNull();
    expect(parseSave(null)).toBeNull();
    expect(parseSave({ ...ok, slots: new Array(50).fill(null) })).toBeNull();
  });

  it("chave do jogador: opcional, mas se vier precisa ser valida", () => {
    expect(parseJoinOptions({ protocol: 3 })).toEqual({ protocol: 3 });
    expect(parseJoinOptions({ protocol: 3, key: "abcdefghijklmnop1234" })).toEqual({ protocol: 3, key: "abcdefghijklmnop1234" });
    expect(parseJoinOptions({ protocol: 3, key: "curta" })).toBeNull();
    expect(parseJoinOptions({ protocol: 3, key: "../../etc/passwd/xxxxxxxx" })).toBeNull();
    expect(new Inventory().size).toBe(12);
  });
});
