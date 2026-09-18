import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateRig, validateClips } from "../src/sprites/load-rig.js";

const VALID_RIG = {
  bones: [
    { id: "hips", parent: null },
    { id: "torso", parent: "hips" },
    { id: "head", parent: "torso" },
  ],
};

describe("validateRig", () => {
  it("returns a rig with parent-before-child bone order", () => {
    const rig = validateRig({ bones: [VALID_RIG.bones[2], VALID_RIG.bones[0], VALID_RIG.bones[1]] });
    expect(rig.bones.map((bone) => bone.id)).toEqual(["hips", "torso", "head"]);
  });

  it("rejects duplicate bone IDs", () => {
    expect(() => validateRig({ bones: [{ id: "hips" }, { id: "hips" }] })).toThrow(/duplicate bone id/i);
  });

  it("rejects a missing parent", () => {
    expect(() => validateRig({ bones: [{ id: "head", parent: "torso" }] })).toThrow(/unknown parent/i);
  });

  it("rejects cyclic hierarchy", () => {
    expect(() => validateRig({ bones: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }] })).toThrow(/cycle/i);
  });

  it("rejects an equipment attachment that targets an unknown bone", () => {
    expect(() => validateRig({
      bones: [{ id: "hips" }],
      slots: { boots: { attachments: [{ bone: "foot", mode: "replace", layer: "armor" }] } },
    })).toThrow(/unknown bone/i);
  });

  it("accepts the authored neutral humanoid rig", () => {
    const humanoid = JSON.parse(readFileSync(new URL("../data/rigs/humanoid.json", import.meta.url), "utf8"));
    expect(validateRig(humanoid).bones).toHaveLength(21);
  });
});

describe("validateClips", () => {
  it("rejects tracks for bones that are absent from the rig", () => {
    expect(() => validateClips(VALID_RIG, {
      idle: { durationMs: 500, tracks: { tail: [{ time: 0 }, { time: 1 }] } },
    })).toThrow(/unknown bone/i);
  });

  it("rejects keyframes whose times are not ordered within the clip", () => {
    expect(() => validateClips(VALID_RIG, {
      idle: { durationMs: 500, tracks: { hips: [{ time: 0.8 }, { time: 0.2 }] } },
    })).toThrow(/ordered/i);
  });
});
