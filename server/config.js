// All server settings come from environment variables, so the same code runs
// on a laptop (`npm start`) and in production on Railway (see docs/DEPLOY.md).

import fs from "node:fs";
import path from "node:path";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 5173),
    // Unset = every interface (what containers need); set HOST=127.0.0.1 to keep it local-only.
    host: env.HOST || undefined,
    // ONLINE=false serves only the static app, which then runs in local (offline) mode.
    online: env.ONLINE !== "false",
    // SQLite file; ":memory:" for throwaway runs. On Railway it goes on the attached
    // volume automatically. Locally the .data/ folder is used (gitignored).
    databasePath:
      env.DATABASE_PATH ??
      (env.RAILWAY_VOLUME_MOUNT_PATH ? path.posix.join(env.RAILWAY_VOLUME_MOUNT_PATH, "cardslayer.db") : ".data/cardslayer.db"),
    // True when running on Railway without a volume: the database would be wiped on every deploy.
    missingVolume: Boolean(env.RAILWAY_ENVIRONMENT_NAME && !env.RAILWAY_VOLUME_MOUNT_PATH && !env.DATABASE_PATH),
    // Extra origins (comma separated) allowed to call the API/WebSocket, e.g. a
    // native app shell or a separately hosted frontend. Same-origin always works.
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    // Behind a proxy (Railway), take the client IP from the proxy's headers for rate limiting.
    trustProxy: env.TRUST_PROXY === "true",
    version: env.APP_VERSION || env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || pkg.version,
    logRequests: env.LOG_REQUESTS === "true",
    // Sign-in / guest-creation attempts allowed per IP per minute (burst).
    authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10),
  };
}
