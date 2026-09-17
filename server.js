// Entry point: `npm start` -> http://localhost:5173
// Serves the app and, unless ONLINE=false, the multiplayer API + WebSocket.
// All settings are environment variables, see server/config.js.

import { loadConfig } from "./server/config.js";
import { createGameServer } from "./server/app.js";

const config = loadConfig({ ...process.env, ...(process.argv.includes("--offline") ? { ONLINE: "false" } : {}) });
const server = createGameServer(config);
await server.listen();

const mode = config.online ? `online mode, database ${config.databasePath}` : "offline mode (static files only)";
console.log(`Cardslayer ${config.version} running at http://localhost:${config.port} -- ${mode}`);
if (config.online && config.missingVolume) {
  console.warn("WARNING: no Railway volume attached -- accounts and progress will be lost on the next deploy. See docs/DEPLOY.md, step 4.");
}

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, saving players and shutting down...`);
    await server.close();
    process.exit(0);
  });
}
