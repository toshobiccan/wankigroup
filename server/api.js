// The HTTP JSON API under /api. Accounts and anything that changes progression
// outside a fight go through here; fights go through the WebSocket.
//
//   GET  /api/config               { online, version, protocol, wsPath }
//   GET  /api/health               { ok, ...stats }
//   POST /api/auth/guest           { displayName }        -> { token, account, player }
//   POST /api/auth/login           { username, password } -> { token, account, player }
//   POST /api/auth/register  (auth) { username, password } -> { account }   (turns a guest into a real login)
//   POST /api/auth/logout    (auth)                        -> { ok }
//   GET  /api/me             (auth)                        -> { account, player }
//   POST /api/actions/deck-imported (auth) { cardCount }   -> { reward, rewarded, player }
//   POST /api/actions/claim-quest   (auth) { questId }     -> { reward, player }
//
// (auth) = header "Authorization: Bearer <token>". Errors: { error: "<code>" }.

import { PROTOCOL_VERSION, WS_PATH } from "../src/net/protocol.js";
import { recordDeckImport, claimQuest } from "../src/game/progression.js";
import { DEFAULT_ROLE } from "../src/game/roles.js";
import { normalizeHead } from "../src/sprites/character-head.js";
import {
  createSessionToken, hashSessionToken, hashPassword, verifyPassword,
  validateDisplayName, validateUsername, validatePassword,
} from "./auth.js";
import { HttpError, RateLimiter, applyCors, clientIp, isOriginAllowed, readJson, sendJson } from "./http-utils.js";

export function accountView(account) {
  return { id: account.id, displayName: account.displayName, username: account.username, isGuest: !account.username, role: account.role };
}

export function createApi({ config, store, players, world }) {
  const authPerMinute = config.authRateLimitPerMinute;
  const authLimiter = new RateLimiter({ capacity: authPerMinute, refillPerSecond: authPerMinute / 60 });
  const actionLimiter = new RateLimiter({ capacity: 30, refillPerSecond: 1 });

  const routes = {
    "GET /api/config": () => ({ online: config.online, version: config.version, protocol: PROTOCOL_VERSION, wsPath: WS_PATH }),

    "GET /api/health": () => ({ ok: true, version: config.version, ...(world ? world.stats() : {}) }),

    "POST /api/auth/guest": async ({ body, ip }) => {
      limit(authLimiter, ip);
      const name = check(validateDisplayName(body.displayName));
      const account = store.createAccount({ displayName: name });
      return startSession(account);
    },

    "POST /api/auth/login": async ({ body, ip }) => {
      limit(authLimiter, ip);
      const username = validateUsername(body.username);
      const account = username.ok ? store.getAccountByUsername(username.value) : null;
      // Same error whether the username or the password was wrong.
      if (!account || !(await verifyPassword(String(body.password ?? ""), account.passwordHash))) {
        throw new HttpError(401, "invalid_credentials");
      }
      return startSession(account);
    },

    "POST /api/auth/register": async ({ body, ip, account }) => {
      requireAuth(account);
      limit(authLimiter, ip);
      if (account.username) throw new HttpError(409, "already_registered");
      const username = check(validateUsername(body.username));
      const password = check(validatePassword(body.password));
      try {
        store.setCredentials(account.id, { username, passwordHash: await hashPassword(password) });
        if (account.role === DEFAULT_ROLE) store.setRole(account.id, "player");
      } catch (err) {
        if (err.message === "username_taken") throw new HttpError(409, "username_taken");
        throw err;
      }
      return { account: accountView(store.getAccount(account.id)) };
    },

    "POST /api/auth/logout": ({ account, token }) => {
      requireAuth(account);
      store.deleteSession(hashSessionToken(token));
      return { ok: true };
    },

    "GET /api/me": ({ account }) => {
      requireAuth(account);
      return withPlayer(account, () => ({ account: accountView(account) }));
    },

    "POST /api/actions/customize-character": ({ body, account }) => {
      requireAuth(account);
      limit(actionLimiter, account.id);
      if (!body.appearance || typeof body.appearance !== "object" || Array.isArray(body.appearance)) throw new HttpError(400, "invalid_appearance");
      return withPlayer(account, player => {
        player.character = normalizeHead(body.appearance);
        player.characterCreated = true;
        players.changed(account.id);
        return {};
      });
    },

    "POST /api/actions/deck-imported": ({ body, account }) => {
      requireAuth(account);
      limit(actionLimiter, account.id);
      return withPlayer(account, (player) => {
        const outcome = recordDeckImport(player, body.cardCount);
        if (!outcome.ok) throw new HttpError(400, outcome.error);
        players.changed(account.id);
        return { reward: outcome.reward, rewarded: outcome.rewarded };
      });
    },

    "POST /api/actions/claim-quest": ({ body, account }) => {
      requireAuth(account);
      limit(actionLimiter, account.id);
      return withPlayer(account, (player) => {
        const outcome = claimQuest(player, String(body.questId ?? ""));
        if (!outcome.ok) throw new HttpError(409, outcome.error);
        players.changed(account.id);
        return { reward: outcome.reward };
      });
    },
  };

  function startSession(account) {
    const token = createSessionToken();
    store.createSession(account.id, hashSessionToken(token));
    return withPlayer(account, () => ({ token, account: accountView(account) }));
  }

  // Runs fn against the loaded player and adds the resulting player to the
  // response. Players with no open WebSocket are saved and dropped from memory.
  function withPlayer(account, fn) {
    const player = players.load(account);
    try {
      return { ...fn(player), player };
    } finally {
      if (!world?.isOnline(account.id)) players.release(account.id);
    }
  }

  return async function handleApi(req, res) {
    const { pathname } = new URL(req.url, "http://x");
    if (!pathname.startsWith("/api/")) return false;

    applyCors(req, res, config.allowedOrigins);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return true;
    }
    if (!isOriginAllowed(req, config.allowedOrigins)) {
      sendJson(res, 403, { error: "origin_not_allowed" });
      return true;
    }

    const key = `${req.method} ${pathname}`;
    const route = routes[key];
    const offlineAllowed = key === "GET /api/config" || key === "GET /api/health";
    if (!route || (!config.online && !offlineAllowed)) {
      sendJson(res, 404, { error: "not_found" });
      return true;
    }

    try {
      const token = (req.headers.authorization ?? "").match(/^Bearer (.+)$/)?.[1] ?? null;
      const account = token ? store.getAccountBySession(hashSessionToken(token)) : null;
      const body = req.method === "POST" ? await readJson(req) : {};
      const result = await route({ body, account, token, ip: clientIp(req, config.trustProxy) });
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.code });
      } else {
        console.error("api: unhandled error", err);
        sendJson(res, 500, { error: "server_error" });
      }
    }
    return true;
  };
}

function requireAuth(account) {
  if (!account) throw new HttpError(401, "not_signed_in");
}

function check(validation) {
  if (!validation.ok) throw new HttpError(400, validation.error);
  return validation.value;
}

function limit(limiter, key) {
  if (!limiter.take(key)) throw new HttpError(429, "too_many_requests");
}
