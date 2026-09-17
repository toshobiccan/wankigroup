import { describe, expect, it } from "vitest";
import { normalizeAppearance, resolveSlotMode } from "../src/sprites/appearance.js";

const SLOTS = {
  helmet: { bone: "head", mode: "overlay" },
  chestplate: { bone: "torso", mode: "replace" },
};

describe("normalizeAppearance", () => {
  it("keeps only known equipment slots and assigns null to omitted slots", () => {
    expect(normalizeAppearance({ equipment: { helmet: "leaf-cap", fake: "ignore" } }, SLOTS)).toEqual({
      equipment: { helmet: "leaf-cap", chestplate: null },
    });
  });
});

describe("resolveSlotMode", () => {
  it("returns the authored overlay or replace behavior for a slot", () => {
    expect(resolveSlotMode("helmet", SLOTS)).toBe("overlay");
    expect(resolveSlotMode("chestplate", SLOTS)).toBe("replace");
  });

  it("rejects an unknown equipment slot", () => {
    expect(() => resolveSlotMode("fake", SLOTS)).toThrow(/unknown equipment slot/i);
  });
});
