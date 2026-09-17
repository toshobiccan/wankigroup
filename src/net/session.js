// Picks how this copy of the app runs:
//   online -- a Cardslayer server answered /api/config with online: true
//   local  -- no server (GitHub Pages, file://, a native build without one),
//             the server runs with ONLINE=false, or the URL has ?offline
//
// Both sessions expose the same interface, so the app is written once:
//   mode, player, playerId, account, needsLogin, connection
//   on(event, fn): "player", "account", "connection", "rejoined", "kicked",
//                  "playerJoined", "playerLeft", "playerMoved", "playerUpdated",
//                  "mob", "mobHit", "combatEnded"
//   importedDeck(cardCount), claimQuest(questId)
//   joinZone(zoneId, position?) -> room snapshot
//   moveTo({ x, y, tx, ty }), engage(mobId), grade(grade), flee()
//   online only: startAsGuest(name), login(username, password),
//                register(username, password), logout()

import { LocalSession } from "./session-local.js";
import { OnlineSession } from "./session-online.js";

const CONFIG_TIMEOUT_MS = 4000;

// Where the game server lives. Same origin by default; a native app shell (or
// a frontend hosted elsewhere) sets window.CARDSLAYER_SERVER_URL before loading.
export function serverBaseUrl() {
  if (typeof window !== "undefined" && window.CARDSLAYER_SERVER_URL) return window.CARDSLAYER_SERVER_URL.replace(/\/$/, "");
  if (typeof location !== "undefined" && /^https?:$/.test(location.protocol)) return location.origin;
  return null;
}

export async function createSession({ storage = window.localStorage, forceLocal = false } = {}) {
  const loadZone = (zoneId) => fetch(new URL(`data/zones/${zoneId}.json`, document.baseURI)).then((r) => r.json());
  const local = () => new LocalSession({ storage, loadZone }).start();

  const baseUrl = serverBaseUrl();
  if (forceLocal || !baseUrl || new URLSearchParams(location.search).has("offline")) return local();

  let config;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/api/config`, { signal: controller.signal });
    clearTimeout(timer);
    config = res.ok ? await res.json() : null;
  } catch {
    config = null;
  }
  if (!config?.online) return local();

  return new OnlineSession({ baseUrl, wsPath: config.wsPath, storage }).start();
}
