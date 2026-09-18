// Item type structure -- no items exist yet (no drop system exists), this
// defines the shape every future item will have so the Inventory UI,
// drops, crafting, and equip logic can all agree on one format from the
// start. Pure data/validation only -- no PIXI, no DOM, nothing stateful.

export const EQUIP_SLOTS = ["helmet", "cape", "armor", "weapon", "book"];

// Same stat names used throughout src/world/combat.js -- an item's stats
// bonus can only use these keys, so a typo in content data fails loudly
// here instead of silently doing nothing once equipped.
const STAT_KEYS = ["hp", "attackDamage", "magicDamage", "armor", "magicResist", "attackSpeed", "luck"];

function assertValidStats(stats) {
  for (const key of Object.keys(stats)) {
    if (!STAT_KEYS.includes(key)) {
      throw new Error(`items: invalid stat bonus key "${key}" (expected one of ${STAT_KEYS.join(", ")})`);
    }
  }
}

// Every item, regardless of kind, has at least these player-facing fields.
// `picture` is a root-relative asset path (same convention as mob/portrait
// images elsewhere in this project) or null until real art exists.
function createBaseItem({ id, name, picture = null, description = "" }) {
  if (!id || !name) throw new Error("items: id and name are required");
  return { id, name, picture, description };
}

// kind: "equipable". slot: one of EQUIP_SLOTS. stats: a partial stat bonus
// (e.g. { armor: 2 }) applied while equipped -- equip logic can just add
// these onto the wearer's base stats.
export function createEquipable({ id, name, picture, description, slot, stats = {} }) {
  if (!EQUIP_SLOTS.includes(slot)) {
    throw new Error(`createEquipable: "${slot}" is not a valid slot (expected one of ${EQUIP_SLOTS.join(", ")})`);
  }
  assertValidStats(stats);
  return { ...createBaseItem({ id, name, picture, description }), kind: "equipable", slot, stats };
}

// kind: "material". No per-item stat effect -- materials are spent
// elsewhere (a smith, crafting) rather than equipped.
export function createMaterial({ id, name, picture, description }) {
  return { ...createBaseItem({ id, name, picture, description }), kind: "material" };
}

// A held stack of a material item. Quantity has no upper bound -- materials
// stack infinitely in theory.
export function makeMaterialStack(item, quantity = 1) {
  return { item, quantity };
}

// kind: "class" | "buff" -- what the Inventory screen's Status tab selects
// between (one selected class, one active buff at a time). Neither exists
// yet; stats works the same way as on an equipable, a partial bonus applied
// while selected/active.
export function createClass({ id, name, picture, description, stats = {} }) {
  assertValidStats(stats);
  return { ...createBaseItem({ id, name, picture, description }), kind: "class", stats };
}

export function createBuff({ id, name, picture, description, stats = {} }) {
  assertValidStats(stats);
  return { ...createBaseItem({ id, name, picture, description }), kind: "buff", stats };
}
