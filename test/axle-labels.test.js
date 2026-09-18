import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lineName, pointName } from "../src/sprites/axle-labels.js";

const rig = JSON.parse(readFileSync(new URL("../data/rigs/humanoid-aqw-bind-preview.json", import.meta.url), "utf8"));
const labels = JSON.parse(readFileSync(new URL("../data/rigs/mannequin-axle-labels.json", import.meta.url), "utf8"));

describe("pointName", () => {
  it("returns the labeled name for a bone", () => {
    expect(pointName({ points: { rearShin: "Rear Knee" } }, "rearShin")).toBe("Rear Knee");
  });

  it("falls back to the bone id when no label is set", () => {
    expect(pointName({ points: {} }, "rearShin")).toBe("rearShin");
  });
});

describe("lineName", () => {
  it("returns a custom override when set", () => {
    const withOverride = { points: {}, lines: { rearShin: "Custom segment" } };
    expect(lineName(withOverride, "rearShin", "rearThigh")).toBe("Custom segment");
  });

  it("auto-generates '<from> -> <to>' from the two point names otherwise", () => {
    const withoutOverride = { points: { rearThigh: "Rear Hip", rearShin: "Rear Knee" }, lines: {} };
    expect(lineName(withoutOverride, "rearShin", "rearThigh")).toBe("Rear Hip → Rear Knee");
  });
});

// This is the guarantee the user asked for: the labels file is the single
// source of truth for every joint's display name, so it must never drift
// out of sync with the actual rig -- no bone missing a name, no stale name
// left over for a bone that no longer exists. This runs against the real
// project files, not a fixture, because a fixture could pass while the
// real files silently drift apart.
describe("mannequin-axle-labels.json stays in sync with the rig", () => {
  const boneIds = rig.bones.map((bone) => bone.id);

  it("has a display name for every bone in the rig", () => {
    const missing = boneIds.filter((id) => !(id in labels.points));
    expect(missing).toEqual([]);
  });

  it("has no leftover name for a bone that no longer exists", () => {
    const boneIdSet = new Set(boneIds);
    const orphaned = Object.keys(labels.points).filter((id) => !boneIdSet.has(id));
    expect(orphaned).toEqual([]);
  });

  it("only overrides lines for bones that actually have a parent (draw a line)", () => {
    const bonesWithoutParent = new Set(rig.bones.filter((bone) => !bone.parent).map((bone) => bone.id));
    const invalid = Object.keys(labels.lines ?? {}).filter((id) => bonesWithoutParent.has(id));
    expect(invalid).toEqual([]);
  });
});
