import { createServer } from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAX_PLAYERS_PER_WORLD, PROTOCOL_VERSION, WORLD_ROOM_NAME } from "@worldzero/shared";
import { loadConfig } from "./config";
import { WorldRoom } from "./rooms/WorldRoom";

const config = loadConfig();

const app = express();
app.get("/health", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
  res.json({ status: "ok", protocol: PROTOCOL_VERSION, maxPlayers: MAX_PLAYERS_PER_WORLD });
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: createServer(app) }),
});
gameServer.define(WORLD_ROOM_NAME, WorldRoom);

gameServer
  .listen(config.port)
  .then(() => console.log(`[server] WORLD ZERO ouvindo na porta ${config.port}`))
  .catch((err) => {
    console.error("[server] falha ao iniciar", err);
    process.exit(1);
  });
