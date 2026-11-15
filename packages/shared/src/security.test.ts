import { describe, expect, it } from "vitest";
import {
  CLIENT_BURST,
  ChunkedWorld,
  KICK_SCORE,
  MAX_STEP_SECONDS,
  PLAYER_SPEED,
  PlayerGuard,
  PlayerSim,
  inspectInput,
} from "./index";

describe("PlayerGuard (limite de frequencia e expulsao)", () => {
  it("aceita ate a rajada e depois descarta", () => {
    const g = new PlayerGuard(0);
    let ok = 0;
    for (let i = 0; i < 1000; i++) if (g.allow(0)) ok++;
    expect(ok).toBe(CLIENT_BURST);
  });
  it("recupera fichas com o tempo", () => {
    const g = new PlayerGuard(0);
    for (let i = 0; i < 200; i++) g.allow(0);
    expect(g.allow(0)).toBe(false);
    expect(g.allow(1000)).toBe(true); // 1 s depois ja tem fichas
  });
  it("cliente normal (30 msg/s) nunca e limitado", () => {
    const g = new PlayerGuard(0);
    for (let i = 0; i < 3000; i++) expect(g.allow(i * 33)).toBe(true);
  });
  it("expulsa quem acumula violacoes e perdoa quem para", () => {
    const g = new PlayerGuard(0);
    let kicked = false;
    for (let i = 0; i < 30 && !kicked; i++) kicked = g.penalize(0, 5);
    expect(kicked).toBe(true);
    const h = new PlayerGuard(0);
    expect(h.penalize(0, KICK_SCORE - 10)).toBe(false);
    expect(h.penalize(60000, 5)).toBe(false); // 1 min depois, score decaiu
  });
});

describe("inspectInput (mensagens do cliente)", () => {
  it("aceita so { seq, ix, iy } validos", () => {
    expect(inspectInput({ seq: 1, ix: 0.5, iy: -1 }).input).toEqual({ seq: 1, ix: 0.5, iy: -1 });
  });
  it("rejeita posicao/velocidade/dano enviados pelo cliente", () => {
    for (const evil of [
      { seq: 1, ix: 0, iy: 0, x: 5000, y: 5000 },
      { seq: 1, ix: 1, iy: 0, speed: 9999 },
      { seq: 1, ix: 1, iy: 0, damage: 1000 },
      { seq: 1, ix: 1, iy: 0, __proto__x: 1 },
    ]) {
      const r = inspectInput(evil);
      expect(r.input).toBe(null);
      expect(r.reason).toBe("campos_extras");
    }
  });
  it("rejeita valores gigantes, NaN, tipos errados e formatos estranhos", () => {
    expect(inspectInput({ seq: 1, ix: 1e9, iy: 0 }).reason).toBe("valor_fora_do_intervalo");
    expect(inspectInput({ seq: 1, ix: NaN, iy: 0 }).input).toBe(null);
    expect(inspectInput({ seq: 1, ix: "1", iy: 0 }).input).toBe(null);
    expect(inspectInput({ seq: -5, ix: 0, iy: 0 }).input).toBe(null);
    for (const bad of [null, undefined, 7, "x", [1, 2, 3], []]) expect(inspectInput(bad).input).toBe(null);
  });
});

describe("PlayerSim (servidor e autoridade)", () => {
  const world = new ChunkedWorld(20261114, 8, 8);

  it("ignora input mais antigo (replay) e valores nao numericos viram parado", () => {
    const s = new PlayerSim(world.spawn);
    expect(s.setInput({ seq: 5, ix: 1, iy: 0 })).toBe(true);
    expect(s.setInput({ seq: 4, ix: -1, iy: 0 })).toBe(false);
    expect(s.ix).toBe(1);
    s.setInput({ seq: 6, ix: NaN, iy: Infinity });
    expect(s.ix).toBe(0);
    expect(s.iy).toBe(0);
  });

  it("mesmo com input absurdo direto no simulador, a velocidade nunca passa do maximo", () => {
    const s = new PlayerSim(world.spawn);
    s.setInput({ seq: 1, ix: 1e12, iy: 1e12 });
    let maxPerSec = 0;
    for (let sec = 0; sec < 5; sec++) {
      const x0 = s.x;
      const y0 = s.y;
      for (let i = 0; i < 20; i++) s.step(world, 0.05);
      maxPerSec = Math.max(maxPerSec, Math.hypot(s.x - x0, s.y - y0));
    }
    expect(maxPerSec).toBeLessThanOrEqual(PLAYER_SPEED * 1.01);
  });

  it("lag do servidor (dt enorme) nao teleporta: passo limitado", () => {
    const s = new PlayerSim(world.spawn);
    s.setInput({ seq: 1, ix: 1, iy: 0 });
    const x0 = s.x;
    s.step(world, 60); // 1 minuto de "lag"
    expect(s.x - x0).toBeLessThanOrEqual(PLAYER_SPEED * MAX_STEP_SECONDS * 1.01);
  });

  it("20.000 passos com input aleatorio hostil: nunca dentro de solido, nunca acima da velocidade, nunca 'corrigido'", () => {
    const s = new PlayerSim(world.spawn);
    let seed = 12345;
    const rnd = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    let corrected = 0;
    for (let i = 0; i < 20000; i++) {
      if (i % 7 === 0) s.setInput({ seq: i, ix: rnd() * 2 - 1, iy: rnd() * 2 - 1 });
      const before = { x: s.x, y: s.y };
      if (s.step(world, rnd() * 0.2).corrected) corrected++;
      expect(Math.hypot(s.x - before.x, s.y - before.y)).toBeLessThanOrEqual(PLAYER_SPEED * MAX_STEP_SECONDS * 1.01);
      expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
    }
    expect(corrected).toBe(0);
    expect(world.isSolid(Math.floor(s.x / world.tileSize), Math.floor(s.y / world.tileSize))).toBe(false);
  });
});
