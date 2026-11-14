import { DEFAULT_SERVER_PORT } from "@worldzero/shared";

export interface ServerConfig {
  port: number;
  corsOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? DEFAULT_SERVER_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalida: ${env.PORT}`);
  }
  return { port, corsOrigin: env.CORS_ORIGIN ?? "*" };
}
