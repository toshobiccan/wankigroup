# Multiplayer foundation — design

**Status:** built and verified (2026-09-17), branch `feature/multiplayer-foundation`.
**Decision it implements:** multiplayer is a goal, so the game is built multiplayer-ready now (team decision, 2026-09-17) — resolves ROADMAP backlog item 4 ("data storage / backend").

## Goal

Make the switch to real multiplayer testing a deploy, not a rewrite: accounts, server-side progression, shared rooms and a production setup exist and are tested, while the game still runs fully offline.

## Core idea: one game, two backends

```
            app.js / WorldScene (UI only)
                       │  session interface
          ┌────────────┴────────────┐
    LocalSession                OnlineSession
    (localStorage,              (HTTP API + WebSocket)
     in-browser Room)                  │
          │                      game server
          └──────── src/game/ ─────────┘
          shared rules: player, progression,
          quests, encounter, Room
```

- **`src/game/`** is pure JavaScript with no DOM, network or storage: the player save shape (`player.js`), non-combat rewards and quests (`progression.js`), one flashcard round (`encounter.js`) and a zone instance (`room.js`). The browser and the server import the same files.
- **`src/net/session.js`** chooses the mode at startup: online if `/api/config` says so, otherwise local (no server, `ONLINE=false`, `?offline`, static hosting). Both sessions expose the same methods and events, so `app.js` has no `if online` branches in game logic.
- **The UI never mutates the player.** It asks the session (`importedDeck`, `claimQuest`, `engage`, `grade`...) and re-renders on the `player` event.

## Authority: what the server decides vs. trusts

| Server decides | Client decides (validated) |
| --- | --- |
| XP, coins, gems, level, HP, stats, inventory | Movement (positions clamped to the zone's walkable band) |
| Damage, crits, turn order (`resolveRound`) | Card grades (decks never leave the device, so answers can't be checked) |
| Mob HP, deaths, 5 s respawns | Card scheduling (SM-2 on the device) |
| Kill rewards, quest claims, import rewards (capped 3/day) | Deck contents and card count (bounded) |
| Room membership, instance assignment, engage range | |

Card content is never sent to the server — privacy, size, and deck copyright all say it stays on the device.

## Rooms

- Each zone page is served as numbered instances: `plains1-0001`, `plains1-0002`, … (the naming the team specified). Joining picks the lowest-numbered instance with space; capacity defaults to 5 (`DEFAULT_ROOM_CAPACITY`), overridable per zone JSON with `"capacity"`. Empty instances are discarded.
- A player can enter the start zone, their current zone, or a page linked from their current page.
- **Shared mobs:** everyone in an instance sees the same mob HP. Several players can fight the same mob; all of them get the full reward when it dies (co-op friendly). A mob nobody is fighting heals back to full.
- **Defeat:** HP restored, back to the zone spawn, fight ends. **"Again":** counts as a review, no swing.
- Positions are zone fractions (0..1), never pixels — every screen renders the zone at its own size. Remote players are drawn walking toward their last target at normal speed and snapped when too far off.

## Accounts

- **Guest first:** pick a display name → account + session token. No email, no password needed to play.
- **Secure later:** add a username + password to the same account (keeps progress) and sign in on any device.
- Passwords: scrypt (Node crypto). Session tokens: 32 random bytes; only the SHA-256 is stored; 90-day sliding expiry; sent as `Authorization: Bearer` over HTTP and in the first WebSocket message (never in URLs).
- One live connection per account; a new tab/device takes over and the old one is told why.

## Protocol

HTTP (`server/api.js`): `GET /api/config`, `GET /api/health`, `POST /api/auth/{guest,login,register,logout}`, `GET /api/me`, `POST /api/actions/{deck-imported,claim-quest}`.

WebSocket `/ws` (`src/net/protocol.js`): client sends `hello`, `join`, `move`, `engage`, `grade`, `flee`, `ping`; requests carry an `rid` and get a `result`. Server pushes `welcome`, `player`, `playerJoined`, `playerLeft`, `playerMoved`, `playerUpdated`, `mob`, `mobHit`, `combatEnded`, `kicked`, `pong`. Every client message is validated and stripped of unknown fields; messages are capped at 2 KB and 20/s per connection.

## Server

`server.js` → `server/app.js` wires: static files from an **allowlist** (server code, docs and the database are never served), the API, the WebSocket world (`server/world/`), `PlayerService` (in-memory cache, debounced saves, flush on shutdown) and the store.

Storage is SQLite through Node's built-in `node:sqlite` (no native module to compile), behind a small `Store` interface (`server/store/`) with an in-memory twin for tests. Migrations are append-only in `sqlite-store.js`. Moving to Postgres = one new class with the same methods.

Security basics in place: rate limits on sign-in/guest creation (per IP) and reward actions (per account), origin checks for API and WebSocket (`ALLOWED_ORIGINS` for other origins), body size limits, heartbeat to drop dead sockets, graceful shutdown that saves every player.

## Deploy

Docker image + Fly.io (Stockholm), one machine with a volume, GitHub Actions workflow triggered by pushing the `deploy` branch. See `docs/DEPLOY.md`.

## Testing

`npm test` covers the shared rules, `Room` (shared fights, rewards to all participants, respawn timers, capacity, clamping), local mode, and the real server over HTTP + WebSocket (auth flows, rewards, static allowlist, two players in one room fighting one goblin, instance overflow, account takeover). `npm run bot` provides extra players against any server. Verified in the browser: guest sign-in, auto sign-in, register/sign out/sign in, import reward from the server, a bot appearing as a named remote player in the scene, shared kill with that bot, 5 s server respawn, reconnect + automatic rejoin, local mode end to end, and a production-like run of exactly the files the Docker image contains.

## Not built yet (deliberately)

- Chat, parties, trading, PvP.
- Server-authoritative movement / pathing (movement is cosmetic today; engaging checks range).
- Horizontal scaling (needs Postgres + sticky room routing).
- Moving existing local-mode progress into an online account (would let anyone edit localStorage into server progress; if wanted, cap what's imported).
- Password reset (no email collected). Guests who never set a password can't recover their account.
- Anti-cheat for grades beyond rate limits — impossible without sending decks to the server.

## Rules for new code

1. A new game rule goes in `src/game/` as a pure function (or `Room` method) **with a test** — never in `app.js` or `world-scene.js`.
2. Anything that changes the player goes through the session. If it's new, add it to both sessions and, for online, an API route or protocol message plus server test.
3. New zone pages need nothing on the server: drop the JSON in `data/zones/`, run `node tools/build-zones-index.mjs`.
4. New protocol messages: add to `src/net/protocol.js` (validation), `server/world/world-server.js` (handling), `session-online.js` + `session-local.js` (client).
