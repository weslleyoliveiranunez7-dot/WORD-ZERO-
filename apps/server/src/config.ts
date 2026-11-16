import { DEFAULT_SERVER_PORT, MAX_PLAYERS_PER_WORLD, parseWorldDefs, type WorldDef } from "@worldzero/shared";

export interface ServerConfig {
  port: number;
  corsOrigin: string;
  maxPlayers: number; // por mundo (1 a 50); configuravel por MAX_PLAYERS, nunca passa de 50
  worlds: WorldDef[]; // mundos cadastrados (WORLDS="id:Nome:regiao;..."); padrao: um mundo
  survivalScale: number; // multiplica a passagem do tempo de sobrevivencia (1 = normal; so para TESTES)
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
    maxPlayers: intEnv("MAX_PLAYERS", env.MAX_PLAYERS, MAX_PLAYERS_PER_WORLD, 1, MAX_PLAYERS_PER_WORLD),
    worlds: parseWorldDefs(env.WORLDS),
    survivalScale: intEnv("SURVIVAL_SCALE", env.SURVIVAL_SCALE, 1, 1, 1000),
  };
}
