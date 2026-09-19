import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_HEAD, HAIR_STYLES, normalizeHead, HeadBlink, blinkFrame } from "../src/sprites/character-head.js";
import { RigActor } from "../src/sprites/rig-actor.js";
import { masterPixelRegion } from "../src/sprites/master-head-renderer.js";

it("classifies amber iris and brow pixels before skin even at the default eye color", () => {
  expect(masterPixelRegion(140, 125, 20, false, true)).toBe("iris");
  expect(masterPixelRegion(200, 145, 20, false, true)).toBe("iris");
  expect(masterPixelRegion(24, 15, 8, false, true)).toBe("ink");
  expect(masterPixelRegion(255, 255, 255, false, true)).toBe("ink");
  // Actual skin samples east of the rear iris must never receive eye tint.
  expect(masterPixelRegion(174, 124, 91, false, true)).toBe("skin");
  expect(masterPixelRegion(164, 114, 81, false, true)).toBe("skin");
  expect(masterPixelRegion(80, 50, 25, true, false)).toBe("brow");
  expect(masterPixelRegion(220, 160, 100, false, false)).toBe("skin");
});

it("retains the animated rig and original head if optional character artwork is invalid", () => {
  const rig = JSON.parse(readFileSync(new URL("../data/rigs/humanoid.json", import.meta.url), "utf8"));
  const idle = JSON.parse(readFileSync(new URL("../data/animations/humanoid/idle.json", import.meta.url), "utf8"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  let actor;
  try {
    actor = new RigActor({ rig, clips: { idle }, character: { manifest: { parts: null } } });
    expect(actor.characterHead).toBeNull();
    expect(actor.bodyVisuals.get("head").destroyed).toBe(false);
    expect(actor.bodyVisuals.get("head").parent).toBe(actor.bones.get("head").layers.base);
    actor.update(16);
    expect(actor.currentClip).toBe("idle");
    expect(warning).toHaveBeenCalled();
  } finally { actor?.destroy({ children: true }); warning.mockRestore(); }
});

it("normalizes legacy or invalid head settings without accepting paths or CSS", () => {
  expect(normalizeHead(null)).toEqual(DEFAULT_HEAD);
  expect(normalizeHead({ hair: "../../file", hairColor: "url(x)", eyeColor: "#ABCDEF", autoBlink: "false", src: "/bad" }))
    .toEqual({ ...DEFAULT_HEAD, eyeColor: "#abcdef" });
  expect(normalizeHead({ hair: "swept", ears: "pointed", eyeShape: "lashes", mouth: "smile", autoBlink: false })).toMatchObject({ hair: "swept", eyeShape: "lashes", mouth: "smile", autoBlink: false });
  expect(normalizeHead({ ears: "pointed" })).not.toHaveProperty("ears");
  expect(normalizeHead({ eyeShape: "unknown" }).eyeShape).toBe("standard");
});

it("blinks through half, closed, half and open without touching facial placements", () => {
  expect([0, 44, 45, 114, 115, 179, 180].map(blinkFrame)).toEqual(["half", "half", "closed", "closed", "half", "half", "open"]);
  const blink = new HeadBlink(() => 0);
  for (let i = 0; i < 100; i++) expect(blink.update(100, false)).toBe("open");
  blink.trigger();
  expect(blink.update(20, false)).toBe("half");
  expect(blink.update(60, false)).toBe("closed");
  expect(blink.update(50, false)).toBe("half");
  expect(blink.update(50, false)).toBe("open");
  for (let i = 0; i < 25; i++) expect(blink.update(100, true)).toBe("open");
  expect(blink.update(100, true)).toBe("half");
});

it("keeps every authored part inside the atlas and the common head canvas", () => {
  const manifest = JSON.parse(readFileSync(new URL("../data/rigs/character-head-v1.json", import.meta.url), "utf8"));
  for (const [id, part] of Object.entries(manifest.parts)) {
    const png = readFileSync(new URL(`..${id.startsWith("hair") ? manifest.hairAtlas : manifest.atlas}`, import.meta.url));
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    const [x, y, w, h] = part.source;
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
    expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0);
    expect(x + w).toBeLessThanOrEqual(width); expect(y + h).toBeLessThanOrEqual(height);
    expect(part.rect[0] + part.rect[2]).toBeLessThanOrEqual(512);
    expect(part.rect[1] + part.rect[3]).toBeLessThanOrEqual(512);
  }
});

it("uses the unchanged approved master and native coordinates for every facial region", () => {
  const manifest = JSON.parse(readFileSync(new URL("../data/rigs/character-head-v1.json", import.meta.url), "utf8"));
  const png = readFileSync(new URL(`..${manifest.atlas}`, import.meta.url));
  expect(png.equals(readFileSync(new URL("../dev/reference/original-bald-head-v3.png", import.meta.url)))).toBe(true);
  expect(manifest.master.width).toBe(png.readUInt32BE(16));
  expect(manifest.master.height).toBe(png.readUInt32BE(20));
  for (const [key, polygons] of Object.entries(manifest.master.regions)) {
    for (const [x,y] of (["eyes", "brows", "irises"].includes(key) ? polygons.flat() : polygons)) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(manifest.master.width);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(manifest.master.height);
    }
  }
  expect(Object.keys(manifest.parts)).toEqual(["hairSpiky", "hairSwept"]);
});

it("registers all twelve hairstyles without dropping saved style IDs", () => {
  const manifest = JSON.parse(readFileSync(new URL("../data/rigs/character-head-v1.json", import.meta.url), "utf8"));
  expect(Object.keys(manifest.hairstyles)).toHaveLength(12);
  expect(new Set(HAIR_STYLES.map(([id]) => id)).size).toBe(13);
  for (const [id] of HAIR_STYLES) expect(normalizeHead({ hair: id }).hair).toBe(id);
  for (const [id, part] of Object.entries(manifest.hairstyles)) {
    expect(HAIR_STYLES.some(([value]) => value === id)).toBe(true);
    const png = readFileSync(new URL(`..${part.image}`, import.meta.url));
    expect(png.readUInt32BE(16)).toBeGreaterThan(0);
    expect(png.readUInt32BE(20)).toBeGreaterThan(0);
    expect(png[25]).toBe(6); // RGBA, retaining registration margins.
    expect(part.rect).toHaveLength(4);
    expect(part.rect[2]).toBeGreaterThan(0);
    expect(part.rect[3]).toBeGreaterThan(0);
    expect(part.rect[0]).toBeGreaterThanOrEqual(0);
    // Full-image registration may put transparent top padding outside the canvas.
    expect(part.rect[1]).toBeGreaterThanOrEqual(-16);
    expect(part.rect[0] + part.rect[2]).toBeLessThanOrEqual(512);
    expect(part.rect[1] + part.rect[3]).toBeLessThanOrEqual(512);
  }
});
