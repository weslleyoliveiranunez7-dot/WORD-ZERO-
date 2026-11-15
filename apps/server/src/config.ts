import { DEFAULT_SERVER_PORT, MAX_PLAYERS_PER_WORLD } from "@worldzero/shared";

export interface ServerConfig {
  port: number;
  corsOrigin: string;
  maxPlayers: number; // por sala; configuravel por MAX_PLAYERS
}

function intEnv(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  const v = Number(raw ?? fallback);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${name} invalido: ${raw}`);
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: intEnv("PORT", env.PORT, DEFAULT_SERVER_PORT, 1, 65535),
    corsOrigin: env.CORS_ORIGIN ?? "*",
    maxPlayers: intEnv("MAX_PLAYERS", env.MAX_PLAYERS, MAX_PLAYERS_PER_WORLD, 1, 200),
  };
}
