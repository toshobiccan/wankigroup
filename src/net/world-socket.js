// The browser end of the WebSocket: authenticates with "hello", matches
// request/response pairs by rid, and reconnects with backoff when the
// connection drops. Emits:
//   "status"   "connecting" | "open" | "reconnecting" | "closed"
//   "welcome"  the server's welcome message (after every (re)connect)
//   "push"     every other server event ({ type, ... })
//   "authFailed" / "kicked"  -- terminal, no reconnect

import { Emitter, SessionError } from "./emitter.js";
import { PROTOCOL_VERSION } from "./protocol.js";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_BACKOFF_MS = 15_000;

export class WorldSocket extends Emitter {
  constructor({ url, getToken }) {
    super();
    this.url = url;
    this.getToken = getToken;
    this.ws = null;
    this.status = "closed";
    this._rid = 0;
    this._pending = new Map(); // rid -> { resolve, reject, timer }
    this._attempt = 0;
    this._stopped = true;
    this._reconnectTimer = null;
  }

  // Resolves with the first welcome; later reconnects just emit "welcome".
  connect() {
    this._stopped = false;
    return new Promise((resolve, reject) => {
      const offWelcome = this.on("welcome", (msg) => { cleanup(); resolve(msg); });
      const offAuth = this.on("authFailed", () => { cleanup(); reject(new SessionError("not_signed_in", 401)); });
      const cleanup = () => { offWelcome(); offAuth(); };
      this._open();
    });
  }

  close() {
    this._stopped = true;
    clearTimeout(this._reconnectTimer);
    this.ws?.close(1000, "client_closed");
    this._setStatus("closed");
  }

  send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, ...payload }));
  }

  request(type, payload = {}) {
    if (this.status !== "open") return Promise.reject(new SessionError("offline"));
    const rid = ++this._rid;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(rid);
        reject(new SessionError("timeout"));
      }, REQUEST_TIMEOUT_MS);
      this._pending.set(rid, { resolve, reject, timer });
      this.send(type, { ...payload, rid });
    });
  }

  _open() {
    this._setStatus(this._attempt === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "hello", token: this.getToken(), protocol: PROTOCOL_VERSION }));
    });
    ws.addEventListener("message", (event) => this._onMessage(event.data));
    ws.addEventListener("close", (event) => this._onClose(ws, event));
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "welcome") {
      this._attempt = 0;
      this._setStatus("open");
      this.emit("welcome", msg);
    } else if (msg.type === "result") {
      const pending = this._pending.get(msg.rid);
      if (!pending) return;
      clearTimeout(pending.timer);
      this._pending.delete(msg.rid);
      if (msg.ok) pending.resolve(msg.data);
      else pending.reject(new SessionError(msg.error));
    } else if (msg.type === "kicked") {
      this._stopped = true;
      this.emit("kicked", msg);
    } else {
      this.emit("push", msg);
    }
  }

  _onClose(ws, event) {
    if (ws !== this.ws) return;
    for (const { reject, timer } of this._pending.values()) {
      clearTimeout(timer);
      reject(new SessionError("offline"));
    }
    this._pending.clear();
    if (event.code === 4001) {
      this._stopped = true;
      this._setStatus("closed");
      this.emit("authFailed");
      return;
    }
    if (this._stopped) {
      this._setStatus("closed");
      return;
    }
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this._attempt) * (0.75 + Math.random() * 0.5);
    this._attempt += 1;
    this._setStatus("reconnecting");
    this._reconnectTimer = setTimeout(() => this._open(), delay);
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}
