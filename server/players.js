// Keeps every connected player's progression in memory, writes changes to the
// store shortly after they happen, and tells listeners (the WebSocket layer)
// so the player's own client always shows the server's numbers.

import { EventEmitter } from "node:events";
import { normalizePlayer } from "../src/game/player.js";
import { DEFAULT_ROLE, normalizeRole } from "../src/game/roles.js";

export class PlayerService extends EventEmitter {
  constructor({ store, saveDelayMs = 1000, timers = globalThis }) {
    super();
    this.store = store;
    this.saveDelayMs = saveDelayMs;
    this.timers = timers;
    this.cache = new Map(); // accountId -> player
    this.roles = new Map(); // accountId -> role. Re-read on every load(), so a role
                             // change lands on the next load() (reconnect / API call);
                             // live mid-session updates are not supported.
    this.pendingSaves = new Map(); // accountId -> timer
  }

  // Loads (or creates) the player for an account. Safe to call repeatedly.
  load(account) {
    let player = this.cache.get(account.id);
    if (!player) {
      const saved = this.store.loadPlayer(account.id);
      player = normalizePlayer(saved, { name: account.displayName });
      this.cache.set(account.id, player);
      if (!saved) this.store.savePlayer(account.id, player);
    }
    this.roles.set(account.id, normalizeRole(account.role));
    return player;
  }

  getRole(accountId) {
    return this.roles.get(accountId) ?? DEFAULT_ROLE;
  }

  get(accountId) {
    const player = this.cache.get(accountId);
    if (!player) throw new Error(`player ${accountId} is not loaded`);
    return player;
  }

  // Call after mutating a player. Debounced save + immediate change event.
  changed(accountId) {
    const player = this.get(accountId);
    if (!this.pendingSaves.has(accountId)) {
      const timer = this.timers.setTimeout(() => this.flush(accountId), this.saveDelayMs);
      this.pendingSaves.set(accountId, timer);
    }
    this.emit("changed", accountId, player);
  }

  flush(accountId) {
    const timer = this.pendingSaves.get(accountId);
    if (timer !== undefined) {
      this.timers.clearTimeout(timer);
      this.pendingSaves.delete(accountId);
    }
    const player = this.cache.get(accountId);
    if (player) this.store.savePlayer(accountId, player);
  }

  // Saves and forgets a player who is no longer connected.
  release(accountId) {
    this.flush(accountId);
    this.cache.delete(accountId);
    this.roles.delete(accountId);
  }

  flushAll() {
    for (const accountId of this.cache.keys()) this.flush(accountId);
  }
}
