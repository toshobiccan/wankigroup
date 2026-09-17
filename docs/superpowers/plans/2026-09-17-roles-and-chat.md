# Player Roles + Room Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color every player's name by role (grey guest / white player / yellow scholar / blue mod / red admin) and add room-scoped chat, shown as a fading bubble over the sender and a persistent line in a bottom-left scrollback box.

**Architecture:** `src/game/roles.js` is the single source of truth for role names/colors, shared by server and client. Role rides along on the account (`server/store/*`, `server/api.js`), flows into `Room` member views via `PlayerService.getRole()`, and out to clients as part of the existing `playerJoined`/`playerMoved`/snapshot data. Chat is a new WebSocket message type (`src/net/protocol.js`) handled by a new `Room.chat()` method and rendered by `WorldScene`. See `docs/superpowers/specs/2026-09-17-roles-and-chat-design.md` for full reasoning.

**Tech Stack:** No new dependencies — same `node:sqlite`, `ws`, `vitest`, PixiJS already in the project.

---

## Scope check

Two features (roles, chat) that share infrastructure and ship together — role is meaningless without something to color, and chat needs role for the sender's name. Not splitting further. Seven tasks, in execution order: role storage + API, a CLI to actually grant elevated roles, role flowing into room membership, the chat protocol + room logic, the realtime server wiring, the client sessions, and client rendering (manually verified, not unit-testable — see design spec §7).

## File structure

- `src/game/roles.js` — new. `ROLES`, `DEFAULT_ROLE`, `ROLE_COLORS`, `normalizeRole()`, `cssColor()`. Pure.
- `src/game/constants.js` — modified. Add `CHAT_MAX_LENGTH`.
- `server/store/memory-store.js`, `server/store/sqlite-store.js` — modified. `role` on accounts, `setRole()`.
- `server/api.js` — modified. `accountView()` includes `role`; register bumps guest→player.
- `server/players.js` — modified. `PlayerService` caches and exposes role.
- `src/game/room.js` — modified. Member view includes `role`; new `chat()` method.
- `src/net/protocol.js` — modified. New `chat` client message + `chat` server event.
- `server/world/world-server.js` — modified. `chat` case, dedicated rate limiter.
- `src/net/session-online.js`, `src/net/session-local.js` — modified. `sendChat()`, `chat` forwarded.
- `src/world/world-scene.js` — modified. Role-colored nameplates (own + remote), chat bubbles, bottom-left log + input.
- `app.js` — modified. Wires `session.on("chat", ...)`, own-profile updates, `onChatSend`.
- `style.css` — modified. `.chat-log`, `.chat-log-line`, `.chat-log-name`, `.chat-input`.
- `tools/set-role.mjs` — new. CLI to grant scholar/mod/admin.
- Tests: `test/roles.test.js` (new), `test/room.test.js` (extended), `test/protocol.test.js` (new — protocol.js currently has no dedicated test file; see Task 3), `test/server.test.js` (extended).

---

## Task 1: Roles module, account column, API surface

**Files:**
- Create: `src/game/roles.js`
- Modify: `server/store/memory-store.js`, `server/store/sqlite-store.js`, `server/api.js`
- Test: `test/roles.test.js`, `test/server.test.js`

- [ ] **Step 1: Write the failing test for `src/game/roles.js`**

```js
// test/roles.test.js
import { describe, it, expect } from "vitest";
import { ROLES, DEFAULT_ROLE, ROLE_COLORS, normalizeRole, cssColor } from "../src/game/roles.js";

describe("roles", () => {
  it("lists all five tiers with guest as the default", () => {
    expect(ROLES).toEqual(["guest", "player", "scholar", "mod", "admin"]);
    expect(DEFAULT_ROLE).toBe("guest");
  });

  it("has a color for every role", () => {
    for (const role of ROLES) expect(typeof ROLE_COLORS[role]).toBe("number");
  });

  it("normalizeRole passes through known roles and falls back to guest otherwise", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("wizard")).toBe("guest");
    expect(normalizeRole(undefined)).toBe("guest");
    expect(normalizeRole(null)).toBe("guest");
  });

  it("cssColor returns a lowercase #rrggbb string matching ROLE_COLORS", () => {
    expect(cssColor("mod")).toBe("#4d8df0");
    expect(cssColor("nonsense")).toBe(cssColor("guest"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/roles.test.js`
Expected: FAIL with "Cannot find module '../src/game/roles.js'".

- [ ] **Step 3: Write `src/game/roles.js`**

```js
// Player role -> display color. Pure data, no DOM -- shared by the server
// (assigns/validates roles) and the client (colors name tags and chat names).
//
// guest  = no account, or hasn't set a username/password (grey)
// player = signed in with a username + password (white)
// scholar= paid membership (yellow)
// mod    = moderator (blue -- matches --blue-light in style.css)
// admin  = administrator (red -- matches the net-dot "closed" red)

export const ROLES = ["guest", "player", "scholar", "mod", "admin"];
export const DEFAULT_ROLE = "guest";

// 0xRRGGBB, for PIXI.Text `fill`. cssColor() below derives the "#rrggbb" form
// the DOM chat log needs from these same numbers, so there is one source.
export const ROLE_COLORS = {
  guest: 0x9aa4b2,
  player: 0xffffff,
  scholar: 0xf0d43a,
  mod: 0x4d8df0,
  admin: 0xd1453b,
};

export function normalizeRole(value) {
  return ROLES.includes(value) ? value : DEFAULT_ROLE;
}

export function cssColor(role) {
  return "#" + ROLE_COLORS[normalizeRole(role)].toString(16).padStart(6, "0");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/roles.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for role on accounts (both stores) + API**

Add to `test/server.test.js` (it already has `describe("server (online)", ...)` with a `guest` helper — add near the existing auth tests, using the same `ctx`/`api` helpers already defined in that file):

```js
it("accounts default to guest and register bumps to player", async () => {
  const created = await guest("Tester");
  expect(created.account.role).toBe("guest");

  const { data } = await api(ctx.base, "POST", "/api/auth/register", {
    token: created.token,
    body: { username: "tester1", password: "hunter22" },
  });
  expect(data.account.role).toBe("player");
});

it("setRole elevates an account and register does not undo it", async () => {
  const created = await guest("Vip");
  ctx.store.setRole(created.account.id, "scholar");

  const { data } = await api(ctx.base, "POST", "/api/auth/register", {
    token: created.token,
    body: { username: "vip1", password: "hunter22" },
  });
  expect(data.account.role).toBe("scholar");
});
```

This needs `ctx.store` exposed — check `startServer()` in `test/server.test.js`: it returns `{ server, base, port }` but not `store`. Add it:

```js
// in startServer(), change the return to include store:
return server.listen().then((address) => ({ server, store, base: `http://127.0.0.1:${address.port}`, port: address.port }));
```

(`store` is already in scope in that function — it's just not on the returned object yet.)

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run test/server.test.js -t "role"`
Expected: FAIL — `created.account.role` is `undefined`, and `ctx.store.setRole` is not a function.

- [ ] **Step 7: Add `role` to both stores**

In `server/store/memory-store.js`, update `createAccount` and add `setRole`:

```js
  createAccount({ displayName }) {
    const account = { id: crypto.randomUUID(), displayName, username: null, passwordHash: null, role: "guest", createdAt: this.now() };
    this.accounts.set(account.id, account);
    return { ...account };
  }
```

Add after `setCredentials`:

```js
  setRole(accountId, role) {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("unknown_account");
    account.role = role;
  }
```

Update the file's header comment block to mention `role` in the account shape (it currently lists the shape explicitly):

```js
// account: { id, displayName, username, passwordHash, role, createdAt }
```

In `server/store/sqlite-store.js`, add migration #2 (append-only — do not edit migration #1):

```js
const MIGRATIONS = [
  `CREATE TABLE accounts (
     id TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     username TEXT UNIQUE,
     password_hash TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_account ON sessions(account_id);
   CREATE TABLE players (
     account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     state TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  `ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'guest';`,
];
```

Update `toAccount` and `createAccount`:

```js
const toAccount = (row) =>
  row
    ? { id: row.id, displayName: row.display_name, username: row.username, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at }
    : null;
```

```js
  createAccount({ displayName }) {
    const account = { id: crypto.randomUUID(), displayName, username: null, passwordHash: null, role: "guest", createdAt: this.now() };
    this.db.prepare("INSERT INTO accounts (id, display_name, role, created_at) VALUES (?, ?, ?, ?)").run(account.id, displayName, account.role, account.createdAt);
    return account;
  }
```

Add a `setRole` method (after `setCredentials`):

```js
  setRole(accountId, role) {
    const { changes } = this.db.prepare("UPDATE accounts SET role = ? WHERE id = ?").run(role, accountId);
    if (!changes) throw new Error("unknown_account");
  }
```

- [ ] **Step 8: Wire role into the API**

In `server/api.js`, update `accountView`:

```js
export function accountView(account) {
  return { id: account.id, displayName: account.displayName, username: account.username, isGuest: !account.username, role: account.role };
}
```

In the `"POST /api/auth/register"` route, bump `guest` to `player` after setting credentials:

```js
    "POST /api/auth/register": async ({ body, ip, account }) => {
      requireAuth(account);
      limit(authLimiter, ip);
      if (account.username) throw new HttpError(409, "already_registered");
      const username = check(validateUsername(body.username));
      const password = check(validatePassword(body.password));
      try {
        store.setCredentials(account.id, { username, passwordHash: await hashPassword(password) });
        if (account.role === "guest") store.setRole(account.id, "player");
      } catch (err) {
        if (err.message === "username_taken") throw new HttpError(409, "username_taken");
        throw err;
      }
      return { account: accountView(store.getAccount(account.id)) };
    },
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run test/roles.test.js test/server.test.js`
Expected: PASS, including the two new role tests. All pre-existing tests in `test/server.test.js` still pass (role defaulting to `'guest'` via the SQLite column default and the `MemoryStore` literal doesn't change any existing assertion, since none of them checked `account.role` before).

- [ ] **Step 10: Commit**

```bash
git add src/game/roles.js server/store/memory-store.js server/store/sqlite-store.js server/api.js test/roles.test.js test/server.test.js
git commit -m "feat: add player role tiers (guest/player/scholar/mod/admin) to accounts"
```

---

## Task 1a: `tools/set-role.mjs` CLI

**Files:**
- Create: `tools/set-role.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// Grants scholar/mod/admin -- there is no self-service or in-app way to get
// these roles yet (see docs/superpowers/specs/2026-09-17-roles-and-chat-design.md
// §2). Opens the same database file the running server uses.
//
//   node tools/set-role.mjs <username> <guest|player|scholar|mod|admin>

import { loadConfig } from "../server/config.js";
import { SqliteStore } from "../server/store/sqlite-store.js";
import { ROLES } from "../src/game/roles.js";

const [username, role] = process.argv.slice(2);

if (!username || !ROLES.includes(role)) {
  console.error(`usage: node tools/set-role.mjs <username> <${ROLES.join("|")}>`);
  process.exit(1);
}

const config = loadConfig();
const store = new SqliteStore({ filename: config.databasePath });

const account = store.getAccountByUsername(username);
if (!account) {
  console.error(`no account with username "${username}"`);
  store.close();
  process.exit(1);
}

store.setRole(account.id, role);
console.log(`${username} is now ${role}`);
store.close();
```

- [ ] **Step 2: Make it executable and smoke-test it against a throwaway database**

Run:
```bash
chmod +x tools/set-role.mjs
DATABASE_PATH=.data/smoke-test.db node tools/set-role.mjs nobody admin
```
Expected: prints `no account with username "nobody"` and exits 1 (there's no account yet in a fresh throwaway DB — this confirms the "not found" path works without needing a running server).

Clean up the throwaway file:
```bash
rm -f .data/smoke-test.db .data/smoke-test.db-*
```

- [ ] **Step 3: Commit**

```bash
git add tools/set-role.mjs
git commit -m "feat: add CLI to grant scholar/mod/admin roles"
```

---

## Task 2: Role flows into Room membership

**Files:**
- Modify: `server/players.js`, `src/game/room.js`, `src/net/session-local.js`
- Test: `test/room.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/room.test.js` (it already has a `setup()` helper building `players: { get, changed }` and a `join()` helper — extend both):

```js
function setup({ withRoles = false } = {}) {
  const store = new Map();
  const roles = new Map();
  const changed = [];
  const events = [];
  const players = { get: (id) => store.get(id), changed: (id) => changed.push(id) };
  if (withRoles) players.getRole = (id) => roles.get(id) ?? "guest";
  const room = new Room({
    id: "plains1-0001",
    zone,
    players,
    emit: (type, payload, target) => events.push({ type, payload, target }),
    random: () => 0.99,
    today: () => "2026-09-17",
  });
  const join = (id, role) => {
    store.set(id, createDefaultPlayer({ name: id }));
    if (role) roles.set(id, role);
    return room.addPlayer(id);
  };
  return { room, store, roles, changed, events, join };
}
```

(This replaces the existing `setup()` — every other test in the file calls `setup()` with no args, which still works identically since `withRoles` defaults to `false` and the returned shape is unchanged for them.)

```js
describe("Room roles", () => {
  it("defaults a member's role to guest when players.getRole is not implemented", () => {
    const ctx = setup(); // no getRole on the stub at all
    const { snapshot } = ctx.join("p1");
    expect(snapshot.you.role).toBe("guest");
  });

  it("uses players.getRole when available", () => {
    const ctx = setup({ withRoles: true });
    const { snapshot } = ctx.join("p1", "mod");
    expect(snapshot.you.role).toBe("mod");
  });

  it("includes role in the playerJoined broadcast others receive", () => {
    const ctx = setup({ withRoles: true });
    ctx.join("p1", "admin");
    ctx.events.length = 0;
    ctx.join("p2", "guest");
    const joinedEvent = ctx.events.find((e) => e.type === "playerJoined");
    expect(joinedEvent.payload.player.role).toBe("guest");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/room.test.js -t "Room roles"`
Expected: FAIL — `snapshot.you.role` is `undefined`.

- [ ] **Step 3: Add role to `Room`**

In `src/game/room.js`, add the import and use it in `addPlayer` + `_memberView`:

```js
import { DEFAULT_ROLE } from "./roles.js";
```

```js
  addPlayer(playerId, position = null) {
    if (!this.members.has(playerId) && this.isFull) return { ok: false, error: "room_full" };
    const player = this.players.get(playerId);
    const role = this.players.getRole?.(playerId) ?? DEFAULT_ROLE;
    const pos = position ? this._clampPosition(position) : { ...this.spawn };
    const member = { id: playerId, name: player.name, level: player.level, role, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, fightMobId: null };
    this.members.set(playerId, member);
    this.emit("playerJoined", { player: this._memberView(member) }, { except: playerId });
    return { ok: true, snapshot: this.snapshot(playerId) };
  }
```

```js
  _memberView(member) {
    return { id: member.id, name: member.name, level: member.level, role: member.role, x: member.x, y: member.y, tx: member.tx, ty: member.ty };
  }
```

- [ ] **Step 4: Extend `PlayerService` to expose role**

In `server/players.js`:

```js
export class PlayerService extends EventEmitter {
  constructor({ store, saveDelayMs = 1000, timers = globalThis }) {
    super();
    this.store = store;
    this.saveDelayMs = saveDelayMs;
    this.timers = timers;
    this.cache = new Map(); // accountId -> player
    this.roles = new Map(); // accountId -> role, cached from the account at load() time
    this.pendingSaves = new Map(); // accountId -> timer
  }

  load(account) {
    let player = this.cache.get(account.id);
    if (!player) {
      const saved = this.store.loadPlayer(account.id);
      player = normalizePlayer(saved, { name: account.displayName });
      this.cache.set(account.id, player);
      if (!saved) this.store.savePlayer(account.id, player);
    }
    this.roles.set(account.id, account.role ?? "guest");
    return player;
  }

  getRole(accountId) {
    return this.roles.get(accountId) ?? "guest";
  }

  // ... rest of the class unchanged (get, changed, flush, release, flushAll)
```

(Only `constructor` and `load` change; `getRole` is new. Everything else in the file — `get`, `changed`, `flush`, `release`, `flushAll` — stays exactly as it is.)

- [ ] **Step 5: Extend `LocalSession`'s inline players stub**

In `src/net/session-local.js`, `joinZone`:

```js
  async joinZone(zoneId, position = null) {
    const zone = await this.loadZone(zoneId);
    this._room?.dispose();
    const room = new Room({
      id: `${zoneId}-local`,
      zone,
      players: { get: () => this._player, changed: () => this._changed(), getRole: () => "guest" },
      emit: (type, payload, target) => {
        if (target?.except === LOCAL_ID) return;
        this.emit(type, payload);
      },
    });
    this._room = room;
    return room.addPlayer(LOCAL_ID, position).snapshot;
  }
```

(Local/offline mode has no account at all, so `guest` is the honest default — see design spec §4.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/room.test.js`
Expected: PASS — all pre-existing `Room` tests plus the 3 new ones.

- [ ] **Step 7: Run the full suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: all tests pass (`server.test.js`'s room-related assertions, `session-local.test.js`'s combat test, etc. — none of them inspect member `role`, so the new field being present doesn't change any existing `toMatchObject`/`toEqual` result, since those match by subset or by the exact fields they list).

- [ ] **Step 8: Commit**

```bash
git add server/players.js src/game/room.js src/net/session-local.js test/room.test.js
git commit -m "feat: thread player role through Room membership and PlayerService"
```

---

## Task 3: Chat protocol + `Room.chat()`

**Files:**
- Modify: `src/game/constants.js`, `src/net/protocol.js`, `src/game/room.js`
- Test: `test/protocol.test.js` (new), `test/room.test.js`

- [ ] **Step 1: Add `CHAT_MAX_LENGTH` to constants**

In `src/game/constants.js`, append:

```js
// A chat message longer than this is rejected outright by parseClientMessage.
export const CHAT_MAX_LENGTH = 240;
```

- [ ] **Step 2: Write the failing test for protocol validation**

`src/net/protocol.js` has no dedicated test file yet — create one:

```js
// test/protocol.test.js
import { describe, it, expect } from "vitest";
import { parseClientMessage, CLIENT_MESSAGES, SERVER_EVENTS } from "../src/net/protocol.js";
import { CHAT_MAX_LENGTH } from "../src/game/constants.js";

describe("parseClientMessage chat", () => {
  it("accepts a normal message", () => {
    const result = parseClientMessage(JSON.stringify({ type: "chat", rid: 1, text: "hi there" }));
    expect(result).toEqual({ ok: true, message: { type: "chat", rid: 1, text: "hi there" } });
  });

  it("rejects an empty string", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "" })).ok).toBe(false);
  });

  it("rejects a message over CHAT_MAX_LENGTH", () => {
    const tooLong = "x".repeat(CHAT_MAX_LENGTH + 1);
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: tooLong })).ok).toBe(false);
  });

  it("accepts exactly CHAT_MAX_LENGTH characters", () => {
    const atLimit = "x".repeat(CHAT_MAX_LENGTH);
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: atLimit })).ok).toBe(true);
  });

  it("rejects a non-string text field", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: 5 })).ok).toBe(false);
  });

  it("registers chat in the message/event tables", () => {
    expect(CLIENT_MESSAGES.chat).toBe("chat");
    expect(SERVER_EVENTS).toContain("chat");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/protocol.test.js`
Expected: FAIL — `chat` is `undefined` on `CLIENT_MESSAGES`, unknown message type.

- [ ] **Step 4: Add the `chat` message to `src/net/protocol.js`**

```js
import { GRADES } from "../game/encounter.js";
import { CHAT_MAX_LENGTH } from "../game/constants.js";
```

```js
export const CLIENT_MESSAGES = {
  hello: "hello",
  join: "join",
  move: "move",
  engage: "engage",
  grade: "grade",
  flee: "flee",
  ping: "ping",
  chat: "chat", // { text } -> result; broadcasts a "chat" push to the whole room
};
```

```js
export const SERVER_EVENTS = [
  "welcome",
  "result",
  "player",
  "playerJoined",
  "playerLeft",
  "playerMoved",
  "playerUpdated",
  "mob",
  "mobHit",
  "combatEnded",
  "chat", // { id, name, role, text, ts } -- someone in your room said something (including you)
  "kicked",
  "pong",
];
```

Add a case in `parseClientMessage`'s `switch`, next to `flee`:

```js
    case "chat":
      if (typeof data.text !== "string" || data.text.length === 0 || data.text.length > CHAT_MAX_LENGTH) {
        return { ok: false, error: "bad_chat" };
      }
      return { ok: true, message: { type: "chat", rid, text: data.text } };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/protocol.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Write the failing test for `Room.chat()`**

Add to `test/room.test.js`:

```js
describe("Room chat", () => {
  it("broadcasts to everyone in the room, including the sender", () => {
    const ctx = setup({ withRoles: true });
    ctx.join("p1", "scholar");
    ctx.join("p2", "guest");
    ctx.events.length = 0;

    const result = ctx.room.chat("p1", "hello world");
    expect(result).toEqual({ ok: true });

    const chatEvents = ctx.events.filter((e) => e.type === "chat");
    expect(chatEvents).toHaveLength(1);
    expect(chatEvents[0].target).toBeNull();
    expect(chatEvents[0].payload).toMatchObject({ id: "p1", name: "p1", role: "scholar", text: "hello world" });
    expect(typeof chatEvents[0].payload.ts).toBe("number");
  });

  it("trims whitespace and rejects an all-whitespace message", () => {
    const ctx = setup();
    ctx.join("p1");
    expect(ctx.room.chat("p1", "  padded  ").ok).toBe(true);
    ctx.events.length = 0;
    expect(ctx.room.chat("p1", "   ")).toEqual({ ok: false, error: "empty_message" });
    expect(ctx.events.filter((e) => e.type === "chat")).toHaveLength(0);
  });

  it("rejects chat from someone not in the room", () => {
    const ctx = setup();
    expect(ctx.room.chat("ghost", "hi")).toEqual({ ok: false, error: "not_in_room" });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run test/room.test.js -t "Room chat"`
Expected: FAIL — `room.chat is not a function`.

- [ ] **Step 8: Add `Room.chat()`**

In `src/game/room.js`, add the import and the method (placed near `flee`, before `grade` reads naturally):

```js
import { CHAT_MAX_LENGTH } from "./constants.js";
```

```js
  // Room-scoped: broadcast to everyone currently in this instance, including
  // the sender, so the client has one code path for rendering any chat
  // message rather than a separate "it's my own" optimistic-echo case.
  // Length is already bounded by parseClientMessage's CHAT_MAX_LENGTH before
  // this is ever called -- this only has to catch "trims down to nothing".
  chat(playerId, text) {
    const member = this.members.get(playerId);
    if (!member) return { ok: false, error: "not_in_room" };
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return { ok: false, error: "empty_message" };
    this.emit("chat", { id: member.id, name: member.name, role: member.role, text: trimmed, ts: Date.now() }, null);
    return { ok: true };
  }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run test/room.test.js test/protocol.test.js`
Expected: PASS, all tests in both files.

- [ ] **Step 10: Commit**

```bash
git add src/game/constants.js src/net/protocol.js src/game/room.js test/protocol.test.js test/room.test.js
git commit -m "feat: add chat protocol message and Room.chat()"
```

---

## Task 4: WorldServer wiring + end-to-end test

**Files:**
- Modify: `server/world/world-server.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Write the failing end-to-end test**

Add to `test/server.test.js`, in (or near) the existing WebSocket-focused `describe` block that already builds two connected clients for the "two players fighting one goblin" test — reuse that same `connect()`/`guest()` helper pattern:

```js
it("chat reaches everyone in the room, including the sender, with role attached", async () => {
  const a = await guest("Alice");
  const b = await guest("Bob");
  ctx.store.setRole(a.account.id, "mod");
  const clientA = await connect(ctx.port, a.token);
  const clientB = await connect(ctx.port, b.token);
  await clientA.request("join", { zoneId: "plains1" });
  await clientB.request("join", { zoneId: "plains1" });

  const result = await clientA.request("chat", { text: "hello room" });
  expect(result).toMatchObject({ ok: true });

  const seenByA = await clientA.waitFor((m) => m.type === "chat");
  const seenByB = await clientB.waitFor((m) => m.type === "chat");
  expect(seenByA).toMatchObject({ id: a.account.id, name: "Alice", role: "mod", text: "hello room" });
  expect(seenByB).toMatchObject({ id: a.account.id, name: "Alice", role: "mod", text: "hello room" });

  clientA.close();
  clientB.close();
});

it("rate-limits chat", async () => {
  const a = await guest("Spammer");
  const clientA = await connect(ctx.port, a.token);
  await clientA.request("join", { zoneId: "plains1" });

  const results = [];
  for (let i = 0; i < 10; i++) results.push(await clientA.request("chat", { text: `msg ${i}` }));
  expect(results.some((r) => r.ok === false && r.error === "rate_limited")).toBe(true);

  clientA.close();
});
```

(`guest()` in this file currently returns just the parsed body — confirm it includes `token` and `account`; it does, since `startSession`'s response shape is `{ token, account, player }` and `guest()` returns `.data` from that route directly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server.test.js -t "chat"`
Expected: FAIL — server replies `{ ok: false, error: "unknown_type" }` or similar; `chat` isn't handled yet in `_handle`.

- [ ] **Step 3: Wire chat into `WorldServer`**

In `server/world/world-server.js`, add a dedicated limiter alongside `messageLimiter`:

```js
    this.messageLimiter = new RateLimiter({ capacity: 40, refillPerSecond: 20 });
    // Tighter than the general flood guard above -- this specifically caps how
    // often one account can actually broadcast a chat message to a room.
    this.chatLimiter = new RateLimiter({ capacity: 5, refillPerSecond: 0.5 });
```

Add a case in `_handle`'s `switch`, next to `flee`:

```js
      case "chat": {
        if (!this.chatLimiter.take(id)) return this._reply(conn, message.rid, { ok: false, error: "rate_limited" });
        return this._reply(conn, message.rid, this._roomCall(room, () => room.chat(id, message.text), () => ({})));
      }
```

Clean up the limiter's bucket on disconnect, next to the existing `messageLimiter` cleanup in the `ws.on("close", ...)` handler:

```js
    ws.on("close", () => {
      clearTimeout(helloTimer);
      this.messageLimiter.buckets.delete(conn.id);
      if (!conn.accountId || this.connections.get(conn.accountId) !== conn) return;
      this.chatLimiter.buckets.delete(conn.accountId);
      this.connections.delete(conn.accountId);
      this.rooms.leave(conn.accountId);
      this.players.release(conn.accountId);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server.test.js`
Expected: PASS — the two new tests plus everything already in the file (existing fight/room/auth tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add server/world/world-server.js test/server.test.js
git commit -m "feat: wire chat into the WebSocket world server with rate limiting"
```

---

## Task 5: Client sessions

**Files:**
- Modify: `src/net/session-online.js`, `src/net/session-local.js`
- Test: `test/session-local.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/session-local.test.js` (reusing the file's existing `start()` helper):

```js
it("chat broadcasts to the local room (yourself included, since offline has no one else)", async () => {
  const session = await start();
  const onChat = vi.fn();
  session.on("chat", onChat);
  await session.joinZone("plains1");

  await session.sendChat("  hello  ");
  expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ id: "local", text: "hello", role: "guest" }));

  await expect(session.sendChat("   ")).rejects.toThrow(SessionError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session-local.test.js -t "chat"`
Expected: FAIL — `session.sendChat is not a function`.

- [ ] **Step 3: Add `sendChat` to `LocalSession`**

In `src/net/session-local.js`, next to `flee`:

```js
  async sendChat(text) {
    this._roomCall((room) => room.chat(LOCAL_ID, text));
  }
```

- [ ] **Step 4: Add `sendChat` to `OnlineSession`**

In `src/net/session-online.js`:

```js
const FORWARDED_EVENTS = ["playerJoined", "playerLeft", "playerMoved", "playerUpdated", "mob", "mobHit", "combatEnded", "chat"];
```

Next to `flee`:

```js
  async sendChat(text) {
    await this._requireSocket().request("chat", { text });
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/session-local.test.js`
Expected: PASS, including the pre-existing tests in the file.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass across the whole project.

- [ ] **Step 7: Commit**

```bash
git add src/net/session-online.js src/net/session-local.js test/session-local.test.js
git commit -m "feat: add sendChat to both online and local sessions"
```

---

## Task 6: Client rendering — nameplates, bubbles, chat log/input

**Files:**
- Modify: `src/world/world-scene.js`, `app.js`, `style.css`

This task has no `vitest` coverage — it's PixiJS canvas rendering and DOM styling, the same category of change this project already verifies manually (see `docs/specs/2026-09-17-multiplayer-foundation-design.md`'s Testing section). Step 7 below is a manual two-tab verification pass, not an automated one.

- [ ] **Step 1: Add role-driven colors to remote and own nameplates**

In `src/world/world-scene.js`, add the import and two new constants near the existing ones at the top of the file:

```js
import { ROLE_COLORS, DEFAULT_ROLE, normalizeRole } from "../game/roles.js";
```

```js
const CHAT_BUBBLE_MS = 4500; // how long a chat bubble stays up before fading
const CHAT_LOG_MAX_LINES = 50; // oldest lines drop off past this
```

In the constructor, add new tracked state next to the other `this._...` fields:

```js
    this._ownId = null;
    this._ownName = "";
    this._ownRole = DEFAULT_ROLE;
    this._ownLabel = null; // PIXI.Text nameplate above this.player
    this._ownBubble = null;
    this._ownBubbleTimer = null;
    this._chatLog = null; // DOM element, bottom-left scrollback (see loadZone)
    this._chatInput = null; // DOM element, next to _chatLog
```

In `loadZone`'s one-time setup block, right after `this.player` is created and added to `this.world` (after the existing `this.world.addChild(this.player);` line), add the own nameplate:

```js
      const ownLabel = new PIXI.Text({
        text: "",
        style: { fontSize: 11, fill: ROLE_COLORS[DEFAULT_ROLE], stroke: { color: 0x000000, width: 3 } },
      });
      ownLabel.anchor.set(0.5, 1);
      ownLabel.position.set(0, -PLAYER_HEIGHT - 4);
      this.player.addChild(ownLabel);
      this._ownLabel = ownLabel;
```

Immediately after (still in the same one-time setup block, alongside the existing `this._roomLabel` DOM element creation), add the chat log + input:

```js
      this._chatLog = document.createElement("div");
      this._chatLog.className = "chat-log";
      this.mountElement.appendChild(this._chatLog);

      this._chatInput = document.createElement("input");
      this._chatInput.className = "chat-input";
      this._chatInput.type = "text";
      this._chatInput.maxLength = 240; // matches CHAT_MAX_LENGTH in src/game/constants.js
      this._chatInput.placeholder = "Say something...";
      this._chatInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const text = this._chatInput.value.trim();
        if (!text) return;
        this._chatInput.value = "";
        this.onChatSend?.(text);
      });
      this.mountElement.appendChild(this._chatInput);
```

Add `onChatSend` to the constructor options destructuring (find the existing `constructor({ mountElement, onMobSelected, onCombatStart, onPageEnter, onMoveIntent })`-style signature and add it there, storing it the same way `onMoveIntent` already is: `this.onChatSend = onChatSend;`).

Update `upsertRemotePlayer`'s label creation to use the role color, and store the role on `remote.view` as already happens via the spread (`remote.view = { ...remote.view, ...view }` already picks up `role` automatically once the server sends it — Task 2 already ensures that). Change the label style and the two places that set `.text`:

```js
      const label = new PIXI.Text({
        text: "",
        style: { fontSize: 11, fill: ROLE_COLORS[DEFAULT_ROLE], stroke: { color: 0x000000, width: 3 } },
      });
```

```js
    remote.label.text = `${remote.view.name} · Lv ${remote.view.level}`;
    remote.label.style.fill = ROLE_COLORS[normalizeRole(remote.view.role)];
    this._placeRemote(remote, 0);
```

And in `updateRemotePlayerProfile` (role never changes there today — `playerUpdated` only ever carries `name`/`level`, per the design spec's noted limitation — so this method needs no role handling; leave it as-is).

Add `setOwnProfile` and `setOwnPlayerId` as new public methods (near `upsertRemotePlayer`):

```js
  // Called by app.js whenever the signed-in player's name or role is known/changes.
  setOwnProfile({ name, role } = {}) {
    if (name !== undefined) this._ownName = name;
    if (role !== undefined) this._ownRole = normalizeRole(role);
    if (!this._ownLabel) return;
    this._ownLabel.text = this._ownName;
    this._ownLabel.style.fill = ROLE_COLORS[this._ownRole];
  }

  setOwnPlayerId(id) {
    this._ownId = id;
  }
```

- [ ] **Step 2: Add chat bubble + log rendering**

Add a new public method, `showChatMessage`, near `showMobHit`:

```js
  // msg: { id, name, role, text } -- from the session's "chat" event (see app.js).
  showChatMessage({ id, name, role, text }) {
    this._showChatBubble(id, text);
    this._appendChatLogLine({ name, role, text });
  }

  _showChatBubble(id, text) {
    const isOwn = id === this._ownId;
    const target = isOwn ? this.player : this.remotePlayers.get(id)?.container;
    if (!target) return;

    if (isOwn) {
      if (this._ownBubbleTimer) clearTimeout(this._ownBubbleTimer);
      if (this._ownBubble) target.removeChild(this._ownBubble.destroy());
    } else {
      const remote = this.remotePlayers.get(id);
      if (remote.bubbleTimer) clearTimeout(remote.bubbleTimer);
      if (remote.bubble) { target.removeChild(remote.bubble); remote.bubble.destroy(); }
    }

    const bubble = new PIXI.Text({
      text,
      style: { fontSize: 11, fill: 0xffffff, stroke: { color: 0x1a2438, width: 3 }, wordWrap: true, wordWrapWidth: 160, align: "center" },
    });
    bubble.anchor.set(0.5, 1);
    bubble.position.set(0, -PLAYER_HEIGHT - 20);
    target.addChild(bubble);

    const timer = setTimeout(() => {
      this._animate(300, (t) => { bubble.alpha = 1 - t; }).then(() => {
        target.removeChild(bubble);
        bubble.destroy();
        if (isOwn) { this._ownBubble = null; this._ownBubbleTimer = null; }
        else {
          const remote = this.remotePlayers.get(id);
          if (remote) { remote.bubble = null; remote.bubbleTimer = null; }
        }
      });
    }, CHAT_BUBBLE_MS);

    if (isOwn) { this._ownBubble = bubble; this._ownBubbleTimer = timer; }
    else {
      const remote = this.remotePlayers.get(id);
      remote.bubble = bubble;
      remote.bubbleTimer = timer;
    }
  }

  _appendChatLogLine({ name, role, text }) {
    if (!this._chatLog) return;
    const line = document.createElement("div");
    line.className = "chat-log-line";
    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-log-name";
    nameSpan.style.color = cssColor(role);
    nameSpan.textContent = name;
    line.append(nameSpan, document.createTextNode(": " + text));
    this._chatLog.appendChild(line);
    while (this._chatLog.children.length > CHAT_LOG_MAX_LINES) this._chatLog.removeChild(this._chatLog.firstChild);
    this._chatLog.scrollTop = this._chatLog.scrollHeight;
  }
```

Add `cssColor` to the existing `roles.js` import line:

```js
import { ROLE_COLORS, DEFAULT_ROLE, normalizeRole, cssColor } from "../game/roles.js";
```

Extend `remotePlayers` map entries with `bubble`/`bubbleTimer` fields where the record is created in `upsertRemotePlayer` (the `remote = { view: { ...view }, container, sprite, label, facingLeft: false };` line):

```js
      remote = { view: { ...view }, container, sprite, label, facingLeft: false, bubble: null, bubbleTimer: null };
```

And clear any pending bubble timer in `removeRemotePlayer` (before the existing body):

```js
  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    if (remote.bubbleTimer) clearTimeout(remote.bubbleTimer);
    this.world.removeChild(remote.container);
    remote.container.destroy({ children: true });
    this.remotePlayers.delete(id);
  }
```

- [ ] **Step 3: Style the chat log + input**

In `style.css`, add near the existing `.room-label`/`.net-badge` rules (same section, since they're the same "DOM overlay on top of the PIXI canvas" family):

```css
/* Bottom-left chat: appended directly into #worldRoot by WorldScene, same
   pattern as .room-label. Same "transparent box, readable text" look as
   .net-badge (see ACCOUNT & CONNECTION section) so the whole HUD matches. */
.chat-log {
  position: absolute; left: 8px; bottom: 34px; z-index: 4;
  width: 62%; max-height: 96px;
  overflow-y: auto;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(8, 12, 22, .7);
  border: 1px solid rgba(255, 255, 255, .12);
  font-size: 11px; line-height: 1.4;
  color: rgba(255, 255, 255, .92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, .8);
}
.chat-log-line { word-wrap: break-word; }
.chat-log-name { font-weight: 700; }

.chat-input {
  position: absolute; left: 8px; bottom: 8px; z-index: 4;
  width: 62%;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(8, 12, 22, .7);
  border: 1px solid rgba(255, 255, 255, .12);
  color: var(--text);
  font: inherit; font-size: 11px;
}
.chat-input:focus { outline: none; border-color: var(--gold); background: rgba(8, 12, 22, .9); }
.chat-input::placeholder { color: rgba(255, 255, 255, .45); }
```

- [ ] **Step 4: Wire it up in `app.js`**

In `wireSessionEvents()`, add next to the other `session.on(...)` calls:

```js
  session.on("chat", (msg) => worldScene?.showChatMessage(msg));
```

In the `session.on("player", ...)` handler, keep the own nameplate's name in sync (add one line):

```js
  session.on("player", (updated) => {
    player = updated;
    worldScene?.setOwnProfile({ name: updated.name });
    renderHeader();
    const view = document.querySelector(".view.is-active")?.dataset.view;
    if (view === "quests") renderers.quests();
    if (view === "inventory") renderers.inventory();
  });
```

In the `session.on("account", ...)` handler, keep the own nameplate's role in sync:

```js
  session.on("account", (account) => {
    worldScene?.setOwnProfile({ role: account?.role ?? "guest" });
    if (!account && session.mode === "online") showLoginModal();
  });
```

In `renderers.world`, after `worldScene = new window.Cardslayer.WorldScene({...})` gains the new callback and, once loaded, both id and current profile are pushed in (since `session.on("player"/"account", ...)` may have already fired before `worldScene` existed):

```js
  worldScene = new window.Cardslayer.WorldScene({
    mountElement: $("#worldRoot"),
    onMobSelected: handleMobSelected,
    onCombatStart: handleCombatStart,
    onPageEnter: enterPage,
    onMoveIntent: (position) => session.moveTo(position),
    onChatSend: async (text) => {
      try {
        await session.sendChat(text);
      } catch (err) {
        console.error("chat failed", err);
      }
    },
  });
  await worldScene.loadZone(`data/zones/${window.Cardslayer.game.START_ZONE_ID}.json`);
  worldScene.setOwnPlayerId(session.playerId);
  worldScene.setOwnProfile({ name: player?.name, role: session.account?.role ?? "guest" });
```

- [ ] **Step 5: Confirm the shared test suite still passes**

Run: `npx vitest run`
Expected: all tests pass — this task touches only `world-scene.js`/`app.js`/`style.css`, none of which have `vitest` coverage, so this run is a regression check on everything from Tasks 1-5.

- [ ] **Step 6: Start the app and manually verify (two browser tabs)**

Run: `npm start`

In two separate browser tabs/windows at `http://localhost:5173`:
1. Sign in as two different guests (different display names).
2. Confirm each sees their own name above their own character, and the other player's name above theirs — both white (`player` role only applies after registering; fresh guests are grey — confirm **grey**, not white, for both, since neither has registered yet).
3. In one tab, run `node tools/set-role.mjs <username> mod` after registering that guest with a username/password (Task 1's CLI) — reload that tab, confirm the name turns blue for both viewers.
4. Type a chat message in one tab. Confirm: a speech bubble appears over that player's head in **both** tabs (including the sender's own tab), fades after ~4.5s, and a line appears in the bottom-left scrollback box in both tabs with the name in the correct role color.
5. Confirm the chat log box is legible against the game background (semi-transparent, not opaque, not illegible) and doesn't block movement clicks on the ground beneath it.
6. Type a message over 240 characters (or paste one) — confirm the input's `maxLength` simply stops you at 240, no broken behavior.
7. Send messages rapidly (10+ in a couple seconds) — confirm the app doesn't crash when a `rate_limited` result comes back (it's currently just logged to the console per Step 4's `onChatSend` — that's acceptable for this task; a visible "slow down" toast is a nice-to-have, not required here).

- [ ] **Step 7: Commit**

```bash
git add src/world/world-scene.js app.js style.css
git commit -m "feat: role-colored nameplates and room chat (bubbles + bottom-left log)"
```

---

## Self-review notes (already applied above)

- **Spec coverage:** role tiers + colors (Task 1, 6), account role storage + register bump (Task 1), CLI elevation tool (Task 1a), role flowing into `Room` (Task 2), chat protocol + `Room.chat()` (Task 3), realtime wiring + rate limit (Task 4), client sessions (Task 5), nameplates/bubbles/log/input (Task 6) — every §-numbered item in the design spec has a task.
- **Placeholder scan:** none.
- **Type consistency:** `role` is threaded as a plain string (`"guest"|"player"|"scholar"|"mod"|"admin"`) identically through `accountView`, `PlayerService.getRole`, `Room._memberView`, the `chat`/`playerJoined`/`playerMoved` payloads, and `ROLE_COLORS`/`cssColor` lookups — no renaming across files.
- **Execution order:** Task 1 → 1a → 2 → 3 → 4 → 5 → 6 (1a only needs Task 1's `setRole`/`ROLES`; Task 6's manual verification is the first point anything needs the CLI).
