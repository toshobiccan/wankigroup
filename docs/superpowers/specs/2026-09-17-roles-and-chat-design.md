# Player roles + room chat — design spec

**Project:** Cardslayer
**Date:** 2026-09-17
**Status:** Design — not yet implemented
**Builds on:** `docs/specs/2026-09-17-multiplayer-foundation-design.md` (accounts, rooms, WebSocket protocol — all already built and deployed). This spec adds the two items explicitly listed there as "not built yet": a role/permission tier and chat.

## 1. Goal

1. Every player's name renders in a color that tells you their tier at a glance: grey **guest**, white **player**, yellow **scholar** (paid membership), blue **mod**, red **admin**.
2. Room-scoped chat: anyone in the same room instance can talk. Each message shows two places at once — a fading speech bubble over the sender's head, and a line in a persistent scrollback box, bottom-left, semi-transparent but readable (matching the existing `.net-badge` visual language already in `style.css`).

## 2. Non-goals

- **A payment/admin UI.** Scholar/mod/admin are assigned by a server-side CLI tool (`tools/set-role.mjs`), not self-service. Building a purchase flow or an in-app admin panel is separate, larger scope.
- **Live role updates mid-session.** A role change takes effect next time that account connects (reconnects, or a fresh sign-in) — same limitation the existing `playerUpdated` mechanism has for anything not already covered by it. Not fixing this now; flagged so it's a conscious gap, not a bug someone reports later.
- **Global chat / DMs / channels.** One channel per room instance, exactly matching how mobs and movement already work (`plains1-0001` sees its own chat, `plains1-0002` doesn't). A wider channel is a separate feature if wanted later.
- **Chat moderation tooling** (mute, ban, profanity filter). Rate limiting only, same spirit as the existing `messageLimiter`/`actionLimiter`.
- **Persisting chat history.** Messages are ephemeral, delivered live only — nobody joining a room later sees what was said before they arrived. Matches "bubble + scrollback" being a live presence feature, not a log.

## 3. Roles

New shared module `src/game/roles.js` (pure, no DOM — same rule every file in `src/game/` already follows): the ordered list, the default, and one color table both the server (assigns/validates) and the client (renders) import from.

| Role | Meaning | Color |
|---|---|---|
| `guest` | No account, or hasn't set a username/password | grey `#9aa4b2` |
| `player` | Signed in with a username + password | white `#ffffff` |
| `scholar` | Paid membership | yellow `#f0d43a` |
| `mod` | Moderator | blue `#4d8df0` (already `--blue-light` in `style.css`) |
| `admin` | Administrator | red `#d1453b` (already the net-dot "closed" red) |

`role` becomes a new column on `accounts` (default `'guest'`), append-only migration #2 in `sqlite-store.js` per that file's own rule ("never edit a migration that has shipped, add a new one"). `POST /api/auth/register` (the existing "turn a guest into a real login" route) bumps `role` from `guest` to `player` the moment a username/password is set — an already-elevated guest (scholar/mod/admin assigned before they registered) keeps that role.

`tools/set-role.mjs` is the only way to grant scholar/mod/admin for now: `node tools/set-role.mjs <username> <role>`, opens the real database directly (same `DATABASE_PATH` the server uses), same style as the existing `tools/bot.mjs`/`tools/build-zones-index.mjs` scripts.

## 4. Where role travels

- `accountView()` (`server/api.js`) already shapes what the client's `account` object looks like (`id`, `displayName`, `username`, `isGuest`) — add `role`.
- `PlayerService` (`server/players.js`) is what `Room` already asks for a connected player's name/level (`this.players.get(id)`). It's given the full `account` at `load(account)` time but doesn't keep it — add a small `accountId -> role` cache there and a `getRole(accountId)` reader, so `Room` can ask it the same way it asks for progression, without `Room` needing to know about accounts/store at all.
- `Room._memberView()` (`src/game/room.js`) gains `role`, so `playerJoined`/`playerMoved`/the room `snapshot` all carry it — the client colors a remote player's nameplate from data it already receives on join, no extra round trip.
- Your **own** role comes from `session.account.role` (client-side) once signed in; in local/offline mode `session.account` is always `null` (no account exists at all offline), so the client falls back to `guest` there. `Room.addPlayer()` calls `this.players.getRole?.(id) ?? DEFAULT_ROLE` (optional chaining) so the existing local-mode `Room` — constructed in `session-local.js` with an inline `{ get, changed }` stub that has no `getRole` — keeps working unchanged, defaulting to `guest`. (`session-local.js`'s stub is extended to implement it explicitly too, for the label going *into* the room; see Task 2.)

## 5. Chat protocol

One new WebSocket message type, `chat`, following the exact shape every existing type already uses (`src/net/protocol.js`):

- **Client → server:** `{ type: "chat", rid, text }`. Validated like everything else in `parseClientMessage`: `text` must be a non-empty string, capped at `CHAT_MAX_LENGTH` (240 — new constant in `src/game/constants.js`, the shared tuning-numbers file). Answered with the existing `{ type: "result", rid, ok, ... }` shape so the client can show "message too long" / "not in a room" feedback the same way `engage`/`grade`/`flee` already do.
- **Server → clients (push):** `{ type: "chat", id, name, role, text, ts }`, broadcast to **every** member of the sender's room, including the sender — one code path renders your own bubble/log line the same way a remote player's does, instead of a separate "optimistic local echo" special case.
- **Room-level:** `Room.chat(playerId, text)` — new method on `src/game/room.js`, same shape as `move`/`engage`/`flee`: looks up the member, trims/validates, `this.emit("chat", {...}, null)` (target `null` = everyone, the same convention `mob`/`combatEnded`-with-no-target already use).
- **Rate limiting:** a dedicated per-account limiter in `server/world/world-server.js` (`chatLimiter`, alongside the existing `messageLimiter`), tighter than the general message flood guard — burst of 5, refills 1 every 2s. A limited message gets `{ ok: false, error: "rate_limited" }` and is never broadcast.

`FORWARDED_EVENTS` in `src/net/session-online.js` gains `"chat"`; `OnlineSession` gains `sendChat(text)`. `LocalSession` gains `sendChat(text)` too, calling the same `Room.chat()` directly — so typing in local/offline mode still shows you your own bubble and log line (harmless, and useful for testing without a server running).

## 6. Client rendering

- **Nameplates.** Remote players already get a `PIXI.Text` label above their sprite (`upsertRemotePlayer` in `src/world/world-scene.js`) — currently a fixed color. It now reads `ROLE_COLORS[role]`. The local player's own sprite (`this.player`) currently has **no** nameplate at all (confirmed: nothing adds one) — this adds one, same look, driven by `session.account?.role ?? "guest"` and the player's own name.
- **Chat bubble.** A `PIXI.Text` child positioned above the nameplate (mirroring how the nameplate itself sits above the sprite), created on receipt of a `chat` event for that player (own or remote), auto-removed after `CHAT_BUBBLE_MS` (4.5s) via a short fade using the existing `_animate()` helper already used for floating damage numbers/hit flinches. A new message before the old one expires replaces it outright rather than stacking.
- **Chat log.** A plain DOM element appended directly into `#worldRoot` by `WorldScene` itself — the exact existing pattern `_roomLabel` (the bottom-left page-name tag) already uses, so no `index.html` changes are needed. Styled with the same "transparent box, readable text" tokens `.net-badge` already established (`background: rgba(8,12,22,.7); border: 1px solid rgba(255,255,255,.12)`), capped at `CHAT_LOG_MAX_LINES` (50) lines, auto-scrolling to the latest. Each line shows the sender's name in their role color (reusing the same color table) followed by the message.
- **Chat input.** A plain `<input>` also appended by `WorldScene` next to the log (reusing the existing `.text-input` style already defined for the login/register forms), Enter-to-send, calling a new `onChatSend` constructor callback — the same wiring shape `onMoveIntent` already uses. `app.js` wires it to `session.sendChat(text)` and surfaces a rejection (too long / rate limited) inline rather than silently swallowing it.

## 7. Testing approach

Everything that's pure logic gets a real test, matching this repo's existing split:

- `src/game/roles.js` — unit tests (`normalizeRole`, `cssColor`, unknown values fall back to `guest`).
- Store role read/write (both `MemoryStore` and `SqliteStore`), `PlayerService.getRole`, `Room.addPlayer`'s role resolution, `Room.chat()` (broadcasts to everyone including sender, rejects empty/not-in-room, respects `CHAT_MAX_LENGTH` via `parseClientMessage`) — all via `vitest`, following `test/room.test.js`'s existing setup helper.
- `parseClientMessage`'s new `chat` case — valid/empty/too-long/wrong-type, same table-style tests the file's other cases already get.
- End-to-end: extend `test/server.test.js`'s real WebSocket harness — two clients join the same room, one sends chat, both receive it with the right `role`; a message over the rate limit comes back `ok: false`.

What's **not** covered by `vitest` — PIXI canvas rendering, bubble fade timing, DOM chat log/input styling — gets the same treatment this codebase already gives that category of change (see `docs/specs/2026-09-17-multiplayer-foundation-design.md`'s own Testing section: "Verified in the browser..."): a manual pass with two browser tabs signed in as different guests, confirming colors, bubbles, the log, and the rate-limit/length-limit feedback actually look right.
