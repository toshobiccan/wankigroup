// In-memory Store for tests and throwaway runs. Same interface as SqliteStore:
//   createAccount({ displayName }) -> account
//   getAccount(id) / getAccountByUsername(username) -> account | null
//   setCredentials(accountId, { username, passwordHash })  (throws "username_taken")
//   createSession(accountId, tokenHash) / deleteSession(tokenHash)
//   getAccountBySession(tokenHash) -> account | null
//   loadPlayer(accountId) -> saved player object | null
//   savePlayer(accountId, player)
//   close()
// account: { id, displayName, username, passwordHash, createdAt }

import crypto from "node:crypto";

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // sliding: every use extends it

export class MemoryStore {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.accounts = new Map();
    this.sessions = new Map();
    this.players = new Map();
  }

  createAccount({ displayName }) {
    const account = { id: crypto.randomUUID(), displayName, username: null, passwordHash: null, createdAt: this.now() };
    this.accounts.set(account.id, account);
    return { ...account };
  }

  getAccount(id) {
    const account = this.accounts.get(id);
    return account ? { ...account } : null;
  }

  getAccountByUsername(username) {
    for (const account of this.accounts.values()) {
      if (account.username === username) return { ...account };
    }
    return null;
  }

  setCredentials(accountId, { username, passwordHash }) {
    const existing = this.getAccountByUsername(username);
    if (existing && existing.id !== accountId) throw new Error("username_taken");
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("unknown_account");
    Object.assign(account, { username, passwordHash });
  }

  createSession(accountId, tokenHash) {
    this.sessions.set(tokenHash, { accountId, lastSeenAt: this.now() });
  }

  getAccountBySession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    if (this.now() - session.lastSeenAt > SESSION_TTL_MS) {
      this.sessions.delete(tokenHash);
      return null;
    }
    session.lastSeenAt = this.now();
    return this.getAccount(session.accountId);
  }

  deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }

  loadPlayer(accountId) {
    const saved = this.players.get(accountId);
    return saved ? structuredClone(saved) : null;
  }

  savePlayer(accountId, player) {
    this.players.set(accountId, structuredClone(player));
  }

  close() {}
}
