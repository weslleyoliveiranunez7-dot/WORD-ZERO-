import { describe, expect, it } from "vitest";
import {
  CLIENT_MESSAGES,
  MAX_PLAYERS_PER_WORLD,
  PROTOCOL_VERSION,
  SEASON_DURATION_DAYS,
  SERVER_MESSAGES,
} from "./index";

describe("constantes compartilhadas", () => {
  it("segue o Documento Mestre", () => {
    expect(MAX_PLAYERS_PER_WORLD).toBe(50);
    expect(SEASON_DURATION_DAYS).toBe(7);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("nao repete nomes de mensagens", () => {
    expect(new Set(CLIENT_MESSAGES).size).toBe(CLIENT_MESSAGES.length);
    expect(new Set(SERVER_MESSAGES).size).toBe(SERVER_MESSAGES.length);
  });
});
