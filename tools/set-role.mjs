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
