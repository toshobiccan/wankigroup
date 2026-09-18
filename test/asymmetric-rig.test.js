import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const previewRigPath = new URL("../data/rigs/humanoid-aqw-bind-preview.json", import.meta.url);
const hasPreviewRig = existsSync(previewRigPath);

describe("AQW bind-pose preview rig", () => {
  it("provides a dedicated asymmetric preview rig", () => {
    expect(hasPreviewRig).toBe(true);
  });

  if (hasPreviewRig) {
    it("keeps the front and rear limbs on distinct, wider stance transforms", () => {
      const rig = JSON.parse(readFileSync(previewRigPath, "utf8"));
      const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone]));

      expect(Math.sign(bones.frontThigh.x)).toBe(-Math.sign(bones.rearThigh.x));
      expect(Math.abs(bones.frontThigh.x - bones.rearThigh.x)).toBeGreaterThan(10);
      expect(bones.frontThigh.rotation).not.toBe(bones.rearThigh.rotation);
      expect(bones.frontUpperArm.rotation).not.toBe(bones.rearUpperArm.rotation);
    });
  }
});
