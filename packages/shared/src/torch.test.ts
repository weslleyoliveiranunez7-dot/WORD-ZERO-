import { describe, expect, it } from "vitest";
import { CLIENT_MESSAGES, PROTOCOL_VERSION, SnapshotBuffer, inspectTorch, type WorldSnapshot } from "./index";

const snap = (tick: number, ...ps: [string, number, number, boolean?][]): WorldSnapshot => ({
  tick,
  players: ps.map(([id, x, y, torch]) => ({ id, x, y, seq: 0, dead: false, ...(torch ? { torch: true } : {}) })),
});

describe("tocha visivel para todos", () => {
  it("o protocolo foi versionado e a mensagem existe", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(8);
    expect(CLIENT_MESSAGES).toContain("REQUEST_TORCH");
  });
  it("aceita so { on: boolean }", () => {
    expect(inspectTorch({ on: true }).msg).toEqual({ on: true });
    expect(inspectTorch({ on: false }).msg).toEqual({ on: false });
  });
  it("recusa campos extras, tipos errados e formatos estranhos", () => {
    expect(inspectTorch({ on: true, torch: true }).reason).toBe("campos_extras");
    expect(inspectTorch({ on: "sim" }).reason).toBe("valores_invalidos");
    expect(inspectTorch({ on: 1 }).msg).toBeNull();
    expect(inspectTorch({}).msg).toBeNull();
    expect(inspectTorch(null).msg).toBeNull();
    expect(inspectTorch([true]).msg).toBeNull();
    expect(inspectTorch("on").msg).toBeNull();
  });
  it("a interpolacao repassa a tocha so quando acesa", () => {
    const b = new SnapshotBuffer();
    b.push(1000, snap(1, ["a", 0, 0, true], ["b", 0, 0]));
    b.push(1050, snap(2, ["a", 10, 0, true], ["b", 10, 0]));
    const s = b.sample(1025);
    expect(s.get("a")!.torch).toBe(true);
    expect(s.get("b")!.torch).toBeUndefined();
    expect(s.get("b")).toEqual({ x: 5, y: 0 });
  });
  it("apagar a tocha no snapshot seguinte some na hora", () => {
    const b = new SnapshotBuffer();
    b.push(1000, snap(1, ["a", 0, 0, true]));
    b.push(1050, snap(2, ["a", 0, 0]));
    expect(b.sample(1100).get("a")!.torch).toBeUndefined();
  });
});
