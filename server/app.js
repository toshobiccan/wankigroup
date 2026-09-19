// Wires the whole server together: static files + /api + /ws on one port.
// Used by server.js (the real entry point) and by the integration tests.

import http from "node:http";
import { serveStatic } from "./static.js";
import { createApi } from "./api.js";
import { PlayerService } from "./players.js";
import { SqliteStore } from "./store/sqlite-store.js";
import { WorldServer } from "./world/world-server.js";
import { loadZones } from "./zones.js";
import { createWorkshopApi } from "./armor-workshop.js";
import { createRoomWorkshopApi } from "./room-workshop.js";

export function createGameServer(config, { store, zones, log = console } = {}) {
  const httpServer = http.createServer();

  let world = null;
  let players = null;
  if (config.online) {
    store ??= new SqliteStore({ filename: config.databasePath });
    players = new PlayerService({ store });
    world = new WorldServer({ httpServer, store, players, zones: zones ?? loadZones(), config, log });
  }
  const handleApi = createApi({ config, store, players, world });
  const handleWorkshop = createWorkshopApi({ enabled: !config.online });
  const handleRoomWorkshop = createRoomWorkshopApi({ enabled: !config.online });

  httpServer.on("request", async (req, res) => {
    if (config.logRequests) log.info(`${req.method} ${req.url}`);
    try {
      if (await handleWorkshop(req, res)) return;
      if (await handleRoomWorkshop(req, res)) return;
      if (await handleApi(req, res)) return;
      serveStatic(req, res);
    } catch (err) {
      log.error("http: unhandled error", err);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  return {
    httpServer,
    world,
    listen() {
      return new Promise((resolve) => {
        httpServer.listen(config.port, config.host, () => resolve(httpServer.address()));
      });
    },
    // Graceful: stop accepting, save every player, close the database.
    async close() {
      world?.close();
      players?.flushAll();
      await new Promise((resolve) => httpServer.close(resolve));
      httpServer.closeAllConnections?.();
      store?.close();
    },
  };
}
