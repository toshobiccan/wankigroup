import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { createGameServer } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { MemoryStore } from "../server/store/memory-store.js";
import { SqliteStore } from "../server/store/sqlite-store.js";

function startServer(env = {}) {
  const config = loadConfig({ PORT: "0", HOST: "127.0.0.1", AUTH_RATE_LIMIT_PER_MINUTE: "1000", ...env });
  const store = config.online ? new MemoryStore() : undefined;
  const server = createGameServer(config, { store, log: { info() {}, error() {} } });
  return server.listen().then((address) => ({ server, store, base: `http://127.0.0.1:${address.port}`, port: address.port }));
}

async function api(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Minimal test client: collects every message, lets tests wait for one.
function connect(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [];
  const waiters = [];
  let rid = 0;
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    inbox.push(msg);
    for (const waiter of [...waiters]) {
      if (waiter.match(msg)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(msg);
      }
    }
  });
  const client = {
    ws,
    inbox,
    waitFor(match, timeoutMs = 2000) {
      const found = inbox.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve };
        waiters.push(waiter);
        setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
      });
    },
    send(msg) {
      ws.send(JSON.stringify(msg));
    },
    async request(type, payload = {}) {
      const id = ++rid;
      client.send({ type, rid: id, ...payload });
      return client.waitFor((m) => m.type === "result" && m.rid === id);
    },
    close() {
      ws.close();
    },
  };
  return new Promise((resolve, reject) => {
    ws.on("open", async () => {
      if (token) {
        client.send({ type: "hello", token, protocol: 1 });
        await client.waitFor((m) => m.type === "welcome").then(() => resolve(client), reject);
      } else resolve(client);
    });
    ws.on("error", reject);
  });
}

describe("server (online)", () => {
  let ctx;
  beforeAll(async () => {
    ctx = await startServer();
  });
  afterAll(async () => {
    await ctx.server.close();
  });

  const guest = async (displayName) => (await api(ctx.base, "POST", "/api/auth/guest", { body: { displayName } })).data;

  it("reports online config", async () => {
    const { data } = await api(ctx.base, "GET", "/api/config");
    expect(data).toMatchObject({ online: true, protocol: 1, wsPath: "/ws" });
  });

  it("saves wardrobe appearance per authenticated account without accepting progression fields", async () => {
    const a = await guest("TailorA"), b = await guest("TailorB");
    const body = { appearance: { hair: "swept", eyeColor: "#538967", coins: 9999 }, accountId: b.account.id };
    expect((await api(ctx.base, "POST", "/api/actions/customize-character", { body })).status).toBe(401);
    const result = await api(ctx.base, "POST", "/api/actions/customize-character", { body, token: a.token });
    expect(result.status).toBe(200);
    expect(result.data.player).toMatchObject({ characterCreated: true, character: { hair: "swept", eyeColor: "#538967" }, coins: 0 });
    const restored = await api(ctx.base, "GET", "/api/me", { token: a.token });
    expect(restored.data.player.character).toEqual(result.data.player.character);
    expect((await api(ctx.base, "GET", "/api/me", { token: b.token })).data.player.characterCreated).toBe(false);
    expect((await api(ctx.base, "POST", "/api/actions/customize-character", { body: { appearance: [] }, token: a.token })).status).toBe(400);
  });

  it("only serves allowlisted static files", async () => {
    expect((await fetch(ctx.base + "/")).status).toBe(200);
    expect((await fetch(ctx.base + "/src/game/room.js")).status).toBe(200);
    for (const path of ["/server/api.js", "/package.json", "/.data/cardslayer.db", "/docs/HANDOFF.md", "/%2e%2e/secret", "/src/../server.js"]) {
      expect((await fetch(ctx.base + path)).status, path).toBe(404);
    }
  });

  it("creates guests, validates names and requires auth", async () => {
    expect((await api(ctx.base, "POST", "/api/auth/guest", { body: { displayName: "x" } })).data).toEqual({ error: "name_length" });
    const { token, account, player } = await guest("Ann");
    expect(account).toMatchObject({ displayName: "Ann", isGuest: true });
    expect(player).toMatchObject({ name: "Ann", level: 1, coins: 0 });
    expect((await api(ctx.base, "GET", "/api/me")).status).toBe(401);
    expect((await api(ctx.base, "GET", "/api/me", { token })).data.account.id).toBe(account.id);
  });

  it("applies import rewards and quest claims server-side", async () => {
    const { token } = await guest("Quester");
    const imported = await api(ctx.base, "POST", "/api/actions/deck-imported", { token, body: { cardCount: 20 } });
    expect(imported.data).toMatchObject({ rewarded: true, reward: { xp: 70, coins: 100 }, player: { coins: 100 } });
    expect((await api(ctx.base, "POST", "/api/actions/deck-imported", { token, body: { cardCount: -3 } })).status).toBe(400);
    const claimed = await api(ctx.base, "POST", "/api/actions/claim-quest", { token, body: { questId: "import1" } });
    expect(claimed.data.player.coins).toBe(150);
    expect((await api(ctx.base, "POST", "/api/actions/claim-quest", { token, body: { questId: "import1" } })).data).toEqual({ error: "already_claimed" });
  });

  it("registers a guest, logs in elsewhere, logs out", async () => {
    const { token } = await guest("Regi");
    expect((await api(ctx.base, "POST", "/api/auth/register", { token, body: { username: "regi", password: "short" } })).data).toEqual({ error: "password_too_short" });
    const registered = await api(ctx.base, "POST", "/api/auth/register", { token, body: { username: "Regi", password: "correct horse" } });
    expect(registered.data.account).toMatchObject({ username: "regi", isGuest: false });

    const other = await guest("Other");
    expect((await api(ctx.base, "POST", "/api/auth/register", { token: other.token, body: { username: "regi", password: "whatever123" } })).data).toEqual({ error: "username_taken" });

    expect((await api(ctx.base, "POST", "/api/auth/login", { body: { username: "regi", password: "wrong password" } })).data).toEqual({ error: "invalid_credentials" });
    const login = await api(ctx.base, "POST", "/api/auth/login", { body: { username: "regi", password: "correct horse" } });
    expect(login.data.account.displayName).toBe("Regi");

    await api(ctx.base, "POST", "/api/auth/logout", { token: login.data.token });
    expect((await api(ctx.base, "GET", "/api/me", { token: login.data.token })).status).toBe(401);
    expect((await api(ctx.base, "GET", "/api/me", { token })).status).toBe(200); // other session untouched
  });

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

  it("setRole rejects an unknown role", async () => {
    const created = await guest("Bad");
    expect(() => ctx.store.setRole(created.account.id, "wizard")).toThrow("invalid_role");
  });

  it("rejects a WebSocket with a bad token", async () => {
    const client = await connect(ctx.port);
    const closed = new Promise((resolve) => client.ws.on("close", (code) => resolve(code)));
    client.send({ type: "hello", token: "nope" });
    expect(await closed).toBe(4001);
  });

  it("puts two players in one instance, relays movement and shares a fight", async () => {
    const a = await guest("Alpha");
    const b = await guest("Beta");
    const ca = await connect(ctx.port, a.token);
    const cb = await connect(ctx.port, b.token);

    const joinA = await ca.request("join", { zoneId: "plains1" });
    expect(joinA).toMatchObject({ ok: true, data: { roomId: "plains1-0001", players: [] } });
    const joinB = await cb.request("join", { zoneId: "plains1" });
    expect(joinB.data.players.map((p) => p.name)).toEqual(["Alpha"]);
    await ca.waitFor((m) => m.type === "playerJoined" && m.player.name === "Beta");

    // walk both next to goblin_1 (xFrac 0.55)
    for (const c of [ca, cb]) c.send({ type: "move", x: 0.5, y: 0.75, tx: 0.5, ty: 0.75 });
    await cb.waitFor((m) => m.type === "playerMoved" && m.name === "Alpha" && m.x === 0.5);
    await ca.waitFor((m) => m.type === "playerMoved" && m.name === "Beta" && m.x === 0.5);

    expect(await ca.request("engage", { mobId: "goblin_1" })).toMatchObject({ ok: true, data: { mob: { hp: 40 } } });
    expect((await cb.request("engage", { mobId: "goblin_1" })).ok).toBe(true);

    const first = await ca.request("grade", { grade: "good" }); // 40 -> 28
    expect(first.data.result).toMatchObject({ mobHp: 28, mobDefeated: false });
    await cb.waitFor((m) => m.type === "mobHit" && m.hp === 28);

    await cb.request("grade", { grade: "good" }); // 16
    await ca.request("grade", { grade: "good" }); // 4
    const kill = await cb.request("grade", { grade: "good" }); // 0
    expect(kill.data.result).toMatchObject({ mobDefeated: true, rewards: { xp: 50, coins: 15 } });

    const ended = await ca.waitFor((m) => m.type === "combatEnded");
    expect(ended).toMatchObject({ mobId: "goblin_1", rewards: { xp: 50, coins: 15 } });
    await ca.waitFor((m) => m.type === "player" && m.player.coins === 15);
    await ca.waitFor((m) => m.type === "mob" && m.id === "goblin_1" && m.dead === true);

    ca.close();
    await cb.waitFor((m) => m.type === "playerLeft");
    cb.close();
  });

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
    // capacity 5: the burst is allowed, everything after it is refused.
    expect(results.slice(0, 5).every((r) => r.ok === true)).toBe(true);
    expect(results.slice(5).every((r) => r.ok === false && r.error === "rate_limited")).toBe(true);

    clientA.close();
  });

  it("opens a new instance when one is full and refuses unreachable zones", async () => {
    const clients = [];
    for (let i = 0; i < 6; i++) {
      const g = await guest(`Crowd${i}`);
      clients.push(await connect(ctx.port, g.token));
    }
    const rooms = [];
    for (const c of clients) rooms.push((await c.request("join", { zoneId: "plains2" })).data.roomId);
    expect(rooms).toEqual(["plains2-0001", "plains2-0001", "plains2-0001", "plains2-0001", "plains2-0001", "plains2-0002"]);
    expect((await clients[0].request("join", { zoneId: "nowhere" })).error).toBe("zone_not_reachable");
    clients.forEach((c) => c.close());
  });

  it("kicks the older connection when the same account connects twice", async () => {
    const g = await guest("Twice");
    const first = await connect(ctx.port, g.token);
    const closed = new Promise((resolve) => first.ws.on("close", (code) => resolve(code)));
    const second = await connect(ctx.port, g.token);
    expect(await closed).toBe(4003);
    second.close();
  });
});

describe("server (offline)", () => {
  it("serves only config and static files", async () => {
    const ctx = await startServer({ ONLINE: "false" });
    expect((await api(ctx.base, "GET", "/api/config")).data.online).toBe(false);
    expect((await api(ctx.base, "POST", "/api/auth/guest", { body: { displayName: "Ann" } })).status).toBe(404);
    expect((await fetch(ctx.base + "/index.html")).status).toBe(200);
    await ctx.server.close();
  });
});

describe("SqliteStore", () => {
  it("persists accounts, sessions and players", () => {
    const store = new SqliteStore({ filename: ":memory:" });
    const account = store.createAccount({ displayName: "Sql" });
    store.createSession(account.id, "hash1");
    expect(store.getAccountBySession("hash1").displayName).toBe("Sql");
    store.setCredentials(account.id, { username: "sql", passwordHash: "x" });
    const other = store.createAccount({ displayName: "Other" });
    expect(() => store.setCredentials(other.id, { username: "sql", passwordHash: "y" })).toThrow("username_taken");
    store.savePlayer(account.id, { level: 3 });
    store.savePlayer(account.id, { level: 4 });
    expect(store.loadPlayer(account.id)).toEqual({ level: 4 });
    store.deleteSession("hash1");
    expect(store.getAccountBySession("hash1")).toBeNull();
    expect(() => store.setRole(account.id, "wizard")).toThrow("invalid_role");
    store.close();
  });
});
