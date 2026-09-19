import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ARMOR_PARTS, buildManifest, generationPrompt, resizeTemplate, safeAssetId } from "../src/sprites/armor-workshop.js";
import { createDefaultPlayer, normalizePlayer } from "../src/game/player.js";
import { EQUIP_SLOTS } from "../src/items.js";
import { ARMOR_ART_STYLE } from "../src/sprites/armor-art-style.js";
const project = () => ({ id: "test-armor", name: "Test Armor", prompt: "Green leather", slot: "armor", width: 2048, height: 2048,
  parts: ARMOR_PARTS.map((bone, i) => ({ bone, crop: { x: i % 4 * 512, y: Math.floor(i / 4) * 512, width: 512, height: 512 }, pivot: [200, 100], distalPivot: [220, 400], scale: 0.03, mode: "replace" })) });
describe("armor workshop metadata", () => {
  it("preserves the canonical style sections in armor and weapon prompts", () => {
    for (const file of ["shared-art-style.md", "character-prompt-template.txt"]) {
      const source = readFileSync(new URL(`../docs/art-reference/${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
      expect(source).toContain(ARMOR_ART_STYLE);
    }
    for (const slot of ["armor", "weapon"]) {
      const prompt = generationPrompt({ ...project(), slot, prompt: "glossy detailed steel" });
      expect(prompt).toContain(ARMOR_ART_STYLE);
      expect(prompt).toContain("human-base-v5-front-grip.png controls line weight");
      expect(prompt).toContain("even if the design brief requests conflicting rendering");
      expect(prompt).not.toContain("Plain white background.");
      expect(prompt).toContain("TWO darker");
      expect(prompt).not.toContain("at most ONE darker");
    }
  });
  it("exports exactly one item with all body pieces and local anchors", () => {
    const manifest = buildManifest(project());
    expect(manifest.item.slot).toBe("armor");
    expect(Object.keys(manifest.equipment.armor["test-armor"])).toEqual(ARMOR_PARTS);
    expect(manifest.equipment.armor["test-armor"].rearUpperArm.pivot).toEqual([200, 100]);
  });
  it("rescales sheet crops, anchors and single-point scale consistently", () => {
    const smaller = resizeTemplate(project(), 1024, 1024);
    expect(smaller.parts[1].crop.x).toBe(256);
    expect(smaller.parts[1].pivot).toEqual([100, 50]);
    expect(smaller.parts[1].scale).toBe(0.06);
    expect(() => resizeTemplate(project(), 1024, 900)).toThrow(/aspect ratio/);
  });
  it("rejects unsafe names, missing pieces and invalid anchors", () => {
    expect(() => safeAssetId("../outside")).toThrow();
    const missing = project(); missing.parts.pop(); expect(() => buildManifest(missing)).toThrow(/required parts/);
    const bad = project(); bad.parts[0].pivot = [-1, 0]; expect(() => buildManifest(bad)).toThrow(/anchor/);
    bad.parts[0].pivot = [...bad.parts[0].distalPivot]; expect(() => buildManifest(bad)).toThrow(/distinct/);
  });
  it("exports a weapon grip separately and includes front/rear recipe in prompts", () => {
    const p = project(); p.slot = "weapon"; p.parts = [{ ...p.parts[0], bone: "weaponMount" }];
    expect(buildManifest(p).item.slot).toBe("weapon");
    expect(generationPrompt(project())).toContain("Rear pieces retain their distinct angle");
  });
});
describe("unified armor slot", () => {
  it("has matching item and skeleton slots", () => {
    const rig = JSON.parse(readFileSync(new URL("../data/rigs/humanoid.json", import.meta.url)));
    expect(Object.keys(rig.slots).sort()).toEqual([...EQUIP_SLOTS].sort());
    expect(rig.slots.armor.attachments.map((a) => a.bone).sort()).toEqual([...ARMOR_PARTS].sort());
  });
  it("migrates all equipped legacy pieces without losing their data", () => {
    const old = createDefaultPlayer(); delete old.equipment.armor;
    old.equipment.chestplate = { id: "chest-a", name: "A", stats: { armor: 2 } };
    old.equipment.boots = { id: "boots-b", name: "B", stats: { armor: 1 } };
    old.equipment.leggings = null;
    old.inventory.equipables.push({ id: "spare", name: "Spare", slot: "boots" });
    const next = normalizePlayer(old);
    expect(next.equipment.armor.stats.armor).toBe(3);
    expect(next.equipment.armor.legacyComponents.boots.id).toBe("boots-b");
    expect(next.equipment).not.toHaveProperty("boots");
    expect(next.inventory.equipables[0]).toMatchObject({ slot: "armor", legacySlot: "boots" });
    expect(normalizePlayer(next)).toEqual(next);
    expect(old.equipment).toHaveProperty("boots");
  });
  it("preserves unequipped armor and does not regrant a starter outfit", () => {
    const p = createDefaultPlayer(); p.equipment.armor = null;
    expect(normalizePlayer(p).equipment.armor).toBeNull();
    delete p.equipment.armor; p.equipment.chestplate = null; p.equipment.boots = null;
    expect(normalizePlayer(p).equipment.armor).toBeNull();
  });
});
