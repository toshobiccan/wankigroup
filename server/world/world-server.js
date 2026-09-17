// The real-time half of the server: one WebSocket per signed-in player.
// Authenticates with the first "hello" message (tokens never go in URLs, which
// end up in logs), then routes protocol messages into the player's Room.

import { WebSocketServer } from "ws";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, WS_PATH, parseClientMessage } from "../../src/net/protocol.js";
import { hashSessionToken } from "../auth.js";
import { RateLimiter, isOriginAllowed } from "../http-utils.js";
import { RoomManager } from "./room-manager.js";
import { accountView } from "../api.js";

const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;

export class WorldServer {
  constructor({ httpServer, store, players, zones, config, timers = globalThis, random = Math.random, log = console }) {
    this.store = store;
    this.players = players;
    this.config = config;
    this.log = log;
    this.connections = new Map(); // accountId -> connection
    this.rooms = new RoomManager({
      zones,
      players,
      timers,
      random,
      deliver: (room, type, payload, target) => this._deliver(room, type, payload, target),
    });
    // Mid-fight rewards (someone else's kill) are pushed by the room; quest and
    // import rewards come from the HTTP API -- either way the owner sees it now.
    this._onPlayerChanged = (accountId, player) => {
      this._sendTo(accountId, { type: "player", player });
      this.rooms.roomOf(accountId)?.refreshProfile(accountId);
    };
    players.on("changed", this._onPlayerChanged);

    this.messageLimiter = new RateLimiter({ capacity: 40, refillPerSecond: 20 });
    // Tighter than the general flood guard above -- this specifically caps how
    // often one account can actually broadcast a chat message to a room.
    this.chatLimiter = new RateLimiter({ capacity: 5, refillPerSecond: 0.5 });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

    this._onUpgrade = (req, socket, head) => {
      const { pathname } = new URL(req.url, "http://x");
      if (pathname !== WS_PATH || !isOriginAllowed(req, config.allowedOrigins)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this._onConnection(ws));
    };
    httpServer.on("upgrade", this._onUpgrade);

    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  isOnline(accountId) {
    return this.connections.has(accountId);
  }

  stats() {
    return { connections: this.connections.size, rooms: this.rooms.stats() };
  }

  close() {
    clearInterval(this.heartbeat);
    this.players.off("changed", this._onPlayerChanged);
    for (const conn of this.connections.values()) conn.ws.close(1001, "server_shutdown");
    this.rooms.disposeAll();
    this.wss.close();
  }

  _onConnection(ws) {
    const conn = { ws, accountId: null, id: Symbol("conn") };
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    const helloTimer = setTimeout(() => ws.close(4000, "hello_timeout"), HELLO_TIMEOUT_MS);

    ws.on("message", (data, isBinary) => {
      if (isBinary) return ws.close(4002, "binary_not_supported");
      if (!this.messageLimiter.take(conn.id)) return ws.close(4008, "rate_limited");
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return this._send(ws, { type: "error", error: parsed.error });
      try {
        this._handle(conn, parsed.message, helloTimer);
      } catch (err) {
        this.log.error("world: message handler failed", err);
        if (parsed.message.rid !== undefined) this._reply(conn, parsed.message.rid, { ok: false, error: "server_error" });
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      this.messageLimiter.buckets.delete(conn.id);
      if (!conn.accountId || this.connections.get(conn.accountId) !== conn) return;
      this.chatLimiter.buckets.delete(conn.accountId);
      this.connections.delete(conn.accountId);
      this.rooms.leave(conn.accountId);
      this.players.release(conn.accountId);
    });
  }

  _handle(conn, message, helloTimer) {
    if (!conn.accountId) {
      if (message.type !== "hello") return conn.ws.close(4001, "hello_required");
      clearTimeout(helloTimer);
      const account = this.store.getAccountBySession(hashSessionToken(message.token));
      if (!account) return conn.ws.close(4001, "invalid_token");

      // One live connection per account: a new tab/device takes over.
      const previous = this.connections.get(account.id);
      if (previous) {
        this._send(previous.ws, { type: "kicked", reason: "signed_in_elsewhere" });
        this.rooms.leave(account.id);
        previous.ws.close(4003, "signed_in_elsewhere");
      }
      conn.accountId = account.id;
      this.connections.set(account.id, conn);
      const player = this.players.load(account);
      this._send(conn.ws, { type: "welcome", protocol: PROTOCOL_VERSION, account: accountView(account), player });
      return;
    }

    const id = conn.accountId;
    const room = this.rooms.roomOf(id);
    switch (message.type) {
      case "join": {
        const joined = this.rooms.join(id, message.zoneId, message.position);
        return this._reply(conn, message.rid, joined.ok ? { ok: true, data: joined.snapshot } : joined);
      }
      case "move":
        room?.move(id, message);
        return;
      case "engage":
        return this._reply(conn, message.rid, this._roomCall(room, () => room.engage(id, message.mobId), (r) => ({ mob: r.mob })));
      case "grade":
        return this._reply(conn, message.rid, this._roomCall(room, () => room.grade(id, message.grade), (r) => ({ result: r.result })));
      case "flee":
        return this._reply(conn, message.rid, this._roomCall(room, () => room.flee(id), () => ({})));
      case "chat": {
        if (!this.chatLimiter.take(id)) return this._reply(conn, message.rid, { ok: false, error: "rate_limited" });
        return this._reply(conn, message.rid, this._roomCall(room, () => room.chat(id, message.text), () => ({})));
      }
      case "ping":
        return this._send(conn.ws, { type: "pong" });
      default:
        return undefined;
    }
  }

  _roomCall(room, call, pick) {
    if (!room) return { ok: false, error: "not_in_room" };
    const result = call();
    return result.ok ? { ok: true, data: pick(result) } : result;
  }

  _reply(conn, rid, { ok, data, error }) {
    if (rid === undefined) return;
    this._send(conn.ws, ok ? { type: "result", rid, ok: true, data } : { type: "result", rid, ok: false, error });
  }

  _deliver(room, type, payload, target) {
    const message = { type, ...payload };
    for (const memberId of room.members.keys()) {
      if (target?.to && memberId !== target.to) continue;
      if (target?.except && memberId === target.except) continue;
      this._sendTo(memberId, message);
    }
    // removePlayer() emits after the member is gone; nobody else needs special casing.
  }

  _sendTo(accountId, message) {
    const conn = this.connections.get(accountId);
    if (conn) this._send(conn.ws, message);
  }

  _send(ws, message) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }
}
