// SQLite-backed Store (see memory-store.js for the interface). Uses Node's
// built-in node:sqlite, so there is no native module to compile on deploy.
// Swapping to Postgres later means writing one more class with these methods.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SESSION_TTL_MS } from "./memory-store.js";
import { ROLES, DEFAULT_ROLE } from "../../src/game/roles.js";

// Append-only: never edit a migration that has shipped, add a new one.
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
  // Literal 'guest' -- SQL can't reference the DEFAULT_ROLE JS constant. Keep in sync.
  `ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'guest';`,
];

const toAccount = (row) =>
  row
    ? { id: row.id, displayName: row.display_name, username: row.username, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at }
    : null;

export class SqliteStore {
  constructor({ filename, now = Date.now }) {
    if (filename !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.now = now;
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this._migrate();
    this._pruneSessions();
  }

  _migrate() {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
    const applied = new Set(this.db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version));
    MIGRATIONS.forEach((sql, index) => {
      const version = index + 1;
      if (applied.has(version)) return;
      this.db.exec("BEGIN");
      try {
        this.db.exec(sql);
        this.db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    });
  }

  _pruneSessions() {
    this.db.prepare("DELETE FROM sessions WHERE last_seen_at < ?").run(this.now() - SESSION_TTL_MS);
  }

  createAccount({ displayName }) {
    const account = { id: crypto.randomUUID(), displayName, username: null, passwordHash: null, role: DEFAULT_ROLE, createdAt: this.now() };
    this.db.prepare("INSERT INTO accounts (id, display_name, role, created_at) VALUES (?, ?, ?, ?)").run(account.id, displayName, account.role, account.createdAt);
    return account;
  }

  getAccount(id) {
    return toAccount(this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id));
  }

  getAccountByUsername(username) {
    return toAccount(this.db.prepare("SELECT * FROM accounts WHERE username = ?").get(username));
  }

  setCredentials(accountId, { username, passwordHash }) {
    try {
      const { changes } = this.db
        .prepare("UPDATE accounts SET username = ?, password_hash = ? WHERE id = ?")
        .run(username, passwordHash, accountId);
      if (!changes) throw new Error("unknown_account");
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) throw new Error("username_taken");
      throw err;
    }
  }

  setRole(accountId, role) {
    if (!ROLES.includes(role)) throw new Error("invalid_role");
    const { changes } = this.db.prepare("UPDATE accounts SET role = ? WHERE id = ?").run(role, accountId);
    if (!changes) throw new Error("unknown_account");
  }

  createSession(accountId, tokenHash) {
    const now = this.now();
    this.db.prepare("INSERT INTO sessions (token_hash, account_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)").run(tokenHash, accountId, now, now);
  }

  getAccountBySession(tokenHash) {
    const row = this.db.prepare("SELECT account_id, last_seen_at FROM sessions WHERE token_hash = ?").get(tokenHash);
    if (!row) return null;
    const now = this.now();
    if (now - row.last_seen_at > SESSION_TTL_MS) {
      this.deleteSession(tokenHash);
      return null;
    }
    this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash);
    return this.getAccount(row.account_id);
  }

  deleteSession(tokenHash) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  loadPlayer(accountId) {
    const row = this.db.prepare("SELECT state FROM players WHERE account_id = ?").get(accountId);
    return row ? JSON.parse(row.state) : null;
  }

  savePlayer(accountId, player) {
    this.db
      .prepare(
        `INSERT INTO players (account_id, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      )
      .run(accountId, JSON.stringify(player), this.now());
  }

  close() {
    this.db.close();
  }
}
