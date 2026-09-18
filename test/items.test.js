import { describe, it, expect } from "vitest";
import { EQUIP_SLOTS, createEquipable, createMaterial, makeMaterialStack, createClass, createBuff } from "../src/items.js";

describe("createEquipable", () => {
  it("returns the full item shape for a valid slot", () => {
    const item = createEquipable({ id: "iron-helmet", name: "Iron Helmet", slot: "helmet", stats: { armor: 2 } });
    expect(item).toEqual({
      id: "iron-helmet",
      name: "Iron Helmet",
      picture: null,
      description: "",
      kind: "equipable",
      slot: "helmet",
      stats: { armor: 2 },
    });
  });

  it("accepts every documented slot type", () => {
    for (const slot of EQUIP_SLOTS) {
      expect(createEquipable({ id: "x", name: "X", slot }).slot).toBe(slot);
    }
  });

  it("throws on an unknown slot", () => {
    expect(() => createEquipable({ id: "x", name: "X", slot: "shield" })).toThrow(/not a valid slot/);
  });

  it("throws on an unknown stat bonus key", () => {
    expect(() => createEquipable({ id: "x", name: "X", slot: "armor", stats: { speed: 5 } })).toThrow(/invalid stat bonus key/);
  });

  it("requires an id and a name", () => {
    expect(() => createEquipable({ name: "X", slot: "armor" })).toThrow(/id and name are required/);
    expect(() => createEquipable({ id: "x", slot: "armor" })).toThrow(/id and name are required/);
  });
});

describe("createMaterial", () => {
  it("returns the material shape with no slot or stats fields", () => {
    const item = createMaterial({ id: "goblin-scrap", name: "Goblin Scrap", description: "Dropped by goblins." });
    expect(item).toEqual({
      id: "goblin-scrap",
      name: "Goblin Scrap",
      picture: null,
      description: "Dropped by goblins.",
      kind: "material",
    });
  });
});

describe("makeMaterialStack", () => {
  it("wraps an item with a quantity, defaulting to 1", () => {
    const item = createMaterial({ id: "goblin-scrap", name: "Goblin Scrap" });
    expect(makeMaterialStack(item)).toEqual({ item, quantity: 1 });
    expect(makeMaterialStack(item, 7)).toEqual({ item, quantity: 7 });
  });
});

describe("createClass / createBuff", () => {
  it("both produce the base item shape plus their own kind and stats", () => {
    const cls = createClass({ id: "warrior", name: "Warrior", stats: { attackDamage: 3 } });
    expect(cls.kind).toBe("class");
    expect(cls.stats).toEqual({ attackDamage: 3 });

    const buff = createBuff({ id: "rage", name: "Rage", stats: { luck: 5 } });
    expect(buff.kind).toBe("buff");
    expect(buff.stats).toEqual({ luck: 5 });
  });

  it("both validate stat bonus keys the same way an equipable does", () => {
    expect(() => createClass({ id: "x", name: "X", stats: { notAStat: 1 } })).toThrow(/invalid stat bonus key/);
    expect(() => createBuff({ id: "x", name: "X", stats: { notAStat: 1 } })).toThrow(/invalid stat bonus key/);
  });
});
