// Online mode: the server owns progression and the world. Accounts and
// non-combat rewards go over HTTP, the world over one WebSocket.

import { Emitter, SessionError } from "./emitter.js";
import { WorldSocket } from "./world-socket.js";

const TOKEN_KEY = "cardslayer-token";

// Events the server pushes that the app listens to directly (see protocol.js).
const FORWARDED_EVENTS = ["playerJoined", "playerLeft", "playerMoved", "playerUpdated", "mob", "mobHit", "combatEnded", "chat"];

export class OnlineSession extends Emitter {
  constructor({ baseUrl, wsPath, storage }) {
    super();
    this.mode = "online";
    this.baseUrl = baseUrl;
    this.wsUrl = baseUrl.replace(/^http/, "ws") + wsPath;
    this.storage = storage;
    this.account = null;
    this.connection = "closed";
    this._player = null;
    this._socket = null;
    this._lastJoin = null; // { zoneId, position } -- replayed after a reconnect
  }

  get needsLogin() {
    return !this.account;
  }

  get player() {
    return this._player;
  }

  get playerId() {
    return this.account?.id ?? null;
  }

  get token() {
    try {
      return this.storage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  // Resumes a saved sign-in if there is one; otherwise needsLogin stays true.
  async start() {
    if (!this.token) return this;
    try {
      const { account, player } = await this._api("GET", "/api/me");
      await this._signedIn({ account, player });
    } catch (err) {
      if (err.status === 401) this._setToken(null);
      else throw err;
    }
    return this;
  }

  async startAsGuest(displayName) {
    await this._signedIn(await this._api("POST", "/api/auth/guest", { displayName }));
  }

  async login(username, password) {
    await this._signedIn(await this._api("POST", "/api/auth/login", { username, password }));
  }

  // Adds a username + password to the current (guest) account.
  async register(username, password) {
    const { account } = await this._api("POST", "/api/auth/register", { username, password });
    this.account = account;
    this.emit("account", account);
    return account;
  }

  async logout() {
    try {
      await this._api("POST", "/api/auth/logout");
    } catch {}
    this._socket?.close();
    this._socket = null;
    this._setToken(null);
    this.account = null;
    this._player = null;
    this.emit("account", null);
  }

  async importedDeck(cardCount) {
    const outcome = await this._api("POST", "/api/actions/deck-imported", { cardCount });
    this._setPlayer(outcome.player);
    return outcome;
  }

  async customizeCharacter(appearance) {
    const outcome = await this._api("POST", "/api/actions/customize-character", { appearance });
    this._setPlayer(outcome.player);
    return outcome.player.character;
  }

  async claimQuest(questId) {
    const outcome = await this._api("POST", "/api/actions/claim-quest", { questId });
    this._setPlayer(outcome.player);
    return outcome;
  }

  async joinZone(zoneId, position = null) {
    this._lastJoin = { zoneId, position };
    return this._requireSocket().request("join", { zoneId, ...(position ?? {}) });
  }

  moveTo(position) {
    if (this._lastJoin) this._lastJoin.position = { x: position.x, y: position.y };
    this._socket?.send("move", position);
  }

  async engage(mobId) {
    return (await this._requireSocket().request("engage", { mobId })).mob;
  }

  async grade(grade) {
    return (await this._requireSocket().request("grade", { grade })).result;
  }

  async flee() {
    await this._requireSocket().request("flee");
  }

  async sendChat(text) {
    await this._requireSocket().request("chat", { text });
  }

  async _signedIn({ token, account, player }) {
    if (token) this._setToken(token);
    this.account = account;
    this._setPlayer(player);
    this._socket?.close();
    const socket = new WorldSocket({ url: this.wsUrl, getToken: () => this.token });
    this._socket = socket;

    socket.on("status", (status) => {
      this.connection = status;
      this.emit("connection", status);
    });
    socket.on("push", (msg) => {
      if (msg.type === "player") this._setPlayer(msg.player);
      else if (FORWARDED_EVENTS.includes(msg.type)) this.emit(msg.type, msg);
    });
    socket.on("kicked", () => this.emit("kicked"));
    socket.on("authFailed", () => {
      this._setToken(null);
      this.account = null;
      this.emit("account", null);
    });
    let firstWelcome = true;
    socket.on("welcome", async (msg) => {
      this._setPlayer(msg.player);
      if (firstWelcome) {
        firstWelcome = false;
        return;
      }
      // Reconnected: the server forgot which room we were in.
      if (!this._lastJoin) return;
      try {
        const snapshot = await socket.request("join", { zoneId: this._lastJoin.zoneId, ...(this._lastJoin.position ?? {}) });
        this.emit("rejoined", snapshot);
      } catch (err) {
        console.error("rejoin after reconnect failed", err);
      }
    });

    await socket.connect();
    this.emit("account", account);
  }

  _requireSocket() {
    if (!this._socket) throw new SessionError("not_signed_in", 401);
    return this._socket;
  }

  _setPlayer(player) {
    if (!player) return;
    this._player = player;
    this.emit("player", player);
  }

  _setToken(token) {
    try {
      if (token) this.storage.setItem(TOKEN_KEY, token);
      else this.storage.removeItem(TOKEN_KEY);
    } catch {}
  }

  async _api(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await fetch(this.baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new SessionError("offline");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new SessionError(data.error ?? "server_error", res.status);
    return data;
  }
}
