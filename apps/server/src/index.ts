import { createServer } from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PROTOCOL_VERSION, WORLD_ROOM_NAME } from "@worldzero/shared";
import { loadConfig } from "./config";
import { WorldRoom } from "./rooms/WorldRoom";
import { createStore } from "./store";

const config = loadConfig();
const store = createStore();
console.log(`[server] personagens salvos em: ${store.kind}`);

const app = express();
app.get("/health", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
  res.json({ status: "ok", protocol: PROTOCOL_VERSION, maxPlayers: config.maxPlayers });
});

// TEMPORARIO: diagnostico do armazenamento. Remover depois.
app.get("/diag", async (_req, res) => {
  try {
    await store.load("0".repeat(64));
    res.json({ armazenamento: store.kind, ok: true });
  } catch (e) {
    res.json({ armazenamento: store.kind, ok: false, erro: String(e) });
  }
});

const gameServer = new Server({
  // maxPayload: o servidor fecha a conexao de quem envia mensagem maior que 2 KB (as legitimas tem ~30 bytes)
  transport: new WebSocketTransport({ server: createServer(app), maxPayload: 2048 }),
});
gameServer.define(WORLD_ROOM_NAME, WorldRoom, { maxPlayers: config.maxPlayers, survivalScale: config.survivalScale, store });

gameServer
  .listen(config.port)
  .then(() => console.log(`[server] WORLD ZERO ouvindo na porta ${config.port} (tempo de sobrevivencia x${config.survivalScale})`))
  .catch((err) => {
    console.error("[server] falha ao iniciar", err);
    process.exit(1);
  });
