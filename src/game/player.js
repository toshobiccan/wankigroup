// The player's saved progression: level, currencies, stats, inventory, daily
// quest counters. Pure functions over a plain JSON object -- the same object
// shape is stored in localStorage (local mode) and in the server database
// (online mode), so nothing here may touch the DOM, storage or the network.

import { XP_PER_LEVEL, GEMS_PER_LEVEL } from "./constants.js";

// Bump when the saved shape changes in a way normalizePlayer() can't fill in
// by itself, and add the migration step there.
export const PLAYER_SCHEMA_VERSION = 1;

export function createDefaultPlayer({ name = "Adventurer" } = {}) {
  return {
    schemaVersion: PLAYER_SCHEMA_VERSION,
    name,
    level: 1,
    xp: 0,
    coins: 0,
    gems: 0,
    stats: {
      hp: 100,
      attackDamage: 12,
      magicDamage: 0,
      armor: 2,
      magicResist: 2,
      attackSpeed: 10,
      luck: 0,
    },
    hp: 100, // current HP -- persists across fights, separate from the max in stats.hp
    // Held-but-not-equipped items (see src/items.js). No drop system exists yet.
    inventory: { equipables: [], materials: [] },
    // What's currently worn, one item per slot (or null) -- see src/items.js's EQUIP_SLOTS.
    equipment: { helmet: null, cape: null, chestplate: null, leggings: null, boots: null, weapon: null, book: null },
    // The Inventory screen's Status tab: one selected class, one active buff.
    status: { selectedClass: null, activeBuff: null },
    daily: emptyDaily(""),
  };
}

function emptyDaily(date) {
  return { date, reviewed: 0, battlesWon: 0, imported: 0, claimed: [] };
}

// Fills in anything missing from an older or partial save with defaults, one
// level deep for the nested groups -- so adding a new stat (or inventory list)
// later never leaves existing players with `undefined` there. Always returns a
// fresh object; the input is not modified.
export function normalizePlayer(saved, { name } = {}) {
  const defaults = createDefaultPlayer({ name });
  const source = saved && typeof saved === "object" ? structuredClone(saved) : {};
  const player = { ...defaults, ...source };
  for (const group of ["stats", "inventory", "equipment", "status", "daily"]) {
    player[group] = { ...defaults[group], ...(source[group] ?? {}) };
  }
  if (name) player.name = name;
  player.schemaVersion = PLAYER_SCHEMA_VERSION;
  return player;
}

// "YYYY-MM-DD" in UTC, the day boundary daily quests reset on.
export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Resets the daily counters when the day has changed. Returns player.daily.
export function ensureDaily(player, today = todayKey()) {
  if (player.daily?.date !== today) player.daily = emptyDaily(today);
  return player.daily;
}

export function gainXp(player, amount) {
  player.xp += Math.max(0, Math.floor(amount));
  while (player.xp >= XP_PER_LEVEL) {
    player.xp -= XP_PER_LEVEL;
    player.level += 1;
    player.gems += GEMS_PER_LEVEL;
  }
}

// Adds a { xp?, coins?, gems? } reward in place.
export function applyReward(player, reward) {
  gainXp(player, reward.xp ?? 0);
  player.coins += reward.coins ?? 0;
  player.gems += reward.gems ?? 0;
}

// What other players are allowed to see about someone -- never the full save.
export function publicProfile(player) {
  return { name: player.name, level: player.level };
}
