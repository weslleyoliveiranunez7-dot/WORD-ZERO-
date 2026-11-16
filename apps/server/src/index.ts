import { createServer } from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PROTOCOL_VERSION, WORLD_ROOM_NAME, worldCapacity, type ServerListResponse } from "@worldzero/shared";
import { loadConfig } from "./config";
import { WorldRoom } from "./rooms/WorldRoom";
import { createStore } from "./store";
import { WorldRegistry } from "./worlds";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = await createStore(); // PostgreSQL: liga e aplica as migracoes antes de aceitar jogadores
  console.log(`[server] personagens salvos em: ${store.kind}`);

  // Etapa 13: mundos cadastrados (WORLDS). Cada um e uma sala independente com no maximo 50 jogadores.
  const registry = new WorldRegistry(config.worlds, worldCapacity(config.maxPlayers));
  console.log(`[server] mundos: ${config.worlds.map((w) => `${w.id} (${w.name}, ${w.region})`).join(", ")} - ate ${registry.capacity} jogadores cada`);

  const app = express();
  app.get("/health", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    res.json({ status: "ok", protocol: PROTOCOL_VERSION, maxPlayers: registry.capacity, worlds: config.worlds.length, storage: store.kind });
  });
  // Lista de servidores: nome, regiao, jogadores/limite, status e a sala ativa. So leitura, sem dados de jogadores.
  app.get("/servers", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    res.setHeader("Cache-Control", "no-store");
    const body: ServerListResponse = { protocol: PROTOCOL_VERSION, servers: registry.list() };
    res.json(body);
  });

  const gameServer = new Server({
    // maxPayload: o servidor fecha a conexao de quem envia mensagem maior que 2 KB (as legitimas tem ~30 bytes)
    transport: new WebSocketTransport({ server: createServer(app), maxPayload: 2048 }),
    gracefullyShutdown: false, // quem desliga e este arquivo (abaixo): fecha as salas (salva tudo) e so depois o banco
  });
  // filterBy(["world"]): quem pede o mesmo mundo cai na MESMA sala; mundos diferentes, salas diferentes. Quem nao informa mundo (testes antigos) entra em qualquer sala.
  gameServer
    .define(WORLD_ROOM_NAME, WorldRoom, { maxPlayers: registry.capacity, survivalScale: config.survivalScale, store, registry })
    .filterBy(["world"]);

  await gameServer.listen(config.port);
  console.log(`[server] WORLD ZERO ouvindo na porta ${config.port} (tempo de sobrevivencia x${config.survivalScale})`);

  // Desligar (Render manda SIGTERM ao reiniciar/atualizar): fecha as salas, o que roda onDispose e salva jogadores e bases.
  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal}: salvando e desligando...`);
    const limit = setTimeout(() => {
      console.error("[server] desligamento demorou demais: saindo");
      process.exit(1);
    }, 15_000);
    limit.unref();
    gameServer
      .gracefullyShutdown(false)
      .catch((e: unknown) => console.error("[server] erro ao fechar as salas", e))
      .then(() => store.close?.())
      .catch((e: unknown) => console.error("[server] erro ao fechar o armazenamento", e))
      .finally(() => {
        console.log("[server] desligado");
        process.exit(0);
      });
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}

main().catch((err) => {
  console.error("[server] falha ao iniciar", err);
  process.exit(1);
});
