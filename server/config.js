// All server settings come from environment variables, so the same code runs
// on a laptop (`npm start`) and in production (see fly.toml / docs/DEPLOY.md).

import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 5173),
    // Unset = every interface (what containers need); set HOST=127.0.0.1 to keep it local-only.
    host: env.HOST || undefined,
    // ONLINE=false serves only the static app, which then runs in local (offline) mode.
    online: env.ONLINE !== "false",
    // SQLite file; ":memory:" for throwaway runs. The .data/ folder is gitignored.
    databasePath: env.DATABASE_PATH ?? ".data/cardslayer.db",
    // Extra origins (comma separated) allowed to call the API/WebSocket, e.g. a
    // native app shell or a separately hosted frontend. Same-origin always works.
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    // Behind a proxy (Fly.io), take the client IP from the proxy's header for rate limiting.
    trustProxy: env.TRUST_PROXY === "true",
    version: env.APP_VERSION || pkg.version,
    logRequests: env.LOG_REQUESTS === "true",
    // Sign-in / guest-creation attempts allowed per IP per minute (burst).
    authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10),
  };
}
