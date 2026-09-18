import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rig = readJson("../data/rigs/humanoid.json");
const previewRig = readJson("../data/rigs/humanoid-aqw-bind-preview.json");
const art = readJson("../data/rigs/humanoid-art-mannequin.json").body;
const starterArt = readJson("../data/rigs/humanoid-art-starter-v1.json").body;
const axles = readJson("../data/rigs/mannequin-axles.json");
const labels = readJson("../data/rigs/mannequin-axle-labels.json");

const EXPECTED_PARENTS = {
  rearShin: "rearThigh",
  rearFoot: "rearShin",
  frontShin: "frontThigh",
  frontFoot: "frontShin",
  offhandMount: "rearHand",
  weaponMount: "frontHand",
};

const EXPECTED_LABELS = {
  rearShin: "Rear Knee",
  frontShin: "Front Knee",
  offhandMount: "Rear Item Mount",
  weaponMount: "Front Item Mount",
};

function byId(sourceRig) {
  return Object.fromEntries(sourceRig.bones.map((bone) => [bone.id, bone]));
}

function worldPoses(sourceRig, rotationDeltas = {}) {
  const result = new Map();
  for (const bone of sourceRig.bones) {
    const parent = bone.parent ? result.get(bone.parent) : { x: 0, y: 0, rotation: 0 };
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const x = bone.x ?? 0;
    const y = bone.y ?? 0;
    result.set(bone.id, {
      x: parent.x + x * cos - y * sin,
      y: parent.y + x * sin + y * cos,
      rotation: parent.rotation + (bone.rotation ?? 0) + (rotationDeltas[bone.id] ?? 0),
    });
  }
  return result;
}

function artJointPosition(boneId, jointId, poses) {
  const config = art[boneId];
  const pose = poses.get(boneId);
  const [width, height] = axles.canvasSize;
  const [jointX, jointY] = axles.joints[jointId];
  const [pivotX, pivotY] = config.pivot;
  const scale = config.scale ?? 1;
  const localX = (jointX - pivotX) * scale;
  const localY = (jointY - pivotY) * scale;
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  return {
    x: pose.x + localX * cos - localY * sin,
    y: pose.y + localX * sin + localY * cos,
  };
}

describe("canonical rig joint identities", () => {
  it("uses the visible red-skeleton names and topology in both runtime rigs", () => {
    for (const sourceRig of [rig, previewRig]) {
      const bones = byId(sourceRig);
      for (const [boneId, parentId] of Object.entries(EXPECTED_PARENTS)) {
        expect(bones[boneId].parent).toBe(parentId);
      }
    }
    for (const [boneId, label] of Object.entries(EXPECTED_LABELS)) {
      expect(labels.points[boneId]).toBe(label);
    }
  });

  it("keeps the rear wrist and item mount on one rigid elbow-to-item line", () => {
    for (const sourceRig of [rig, previewRig]) {
      const bones = byId(sourceRig);
      const forearm = bones.rearHand;
      const item = bones.offhandMount;
      const rotation = forearm.rotation ?? 0;
      const itemX = (item.x ?? 0) * Math.cos(rotation) - (item.y ?? 0) * Math.sin(rotation);
      const itemY = (item.x ?? 0) * Math.sin(rotation) + (item.y ?? 0) * Math.cos(rotation);
      const cross = (forearm.x ?? 0) * itemY - (forearm.y ?? 0) * itemX;
      expect(cross, `${sourceRig.id} rear wrist must not kink`).toBeCloseTo(0, 5);
    }
  });
});

describe("mannequin art follows the skeleton", () => {
  it("does not give body PNGs independent position or rotation transforms", () => {
    for (const manifest of [art, starterArt]) {
      for (const config of Object.values(manifest)) {
        expect(config.x ?? 0).toBe(0);
        expect(config.y ?? 0).toBe(0);
        expect(config.rotation ?? 0).toBe(0);
      }
    }
  });

  it("anchors every articulated PNG pivot directly to its red bone point", () => {
    for (const [boneId, jointId] of Object.entries(axles.boneProximalJoint)) {
      expect(art[boneId].pivot).toEqual(axles.joints[jointId]);
      expect(art[boneId].x ?? 0).toBe(0);
      expect(art[boneId].y ?? 0).toBe(0);
      expect(art[boneId].rotation ?? 0).toBe(0);
    }
  });

  it("binds every two-joint limb PNG to both skeleton endpoints", () => {
    for (const [boneId, jointId] of Object.entries(axles.boneDistalJoint)) {
      expect(art[boneId].distalPivot).toEqual(axles.joints[jointId]);
    }
  });

  it("keeps parent distal joints and child pivots coincident through rotation", () => {
    const rotations = {
      rearUpperArm: 0.47,
      rearForearm: -0.31,
      frontUpperArm: -0.52,
      frontForearm: 0.28,
      rearThigh: -0.36,
      rearShin: 0.41,
      frontThigh: 0.33,
      frontShin: -0.44,
    };
    const poses = worldPoses(rig, rotations);
    expect(axles.boneDistalJoint).toBeDefined();
    for (const [parentId, distalJointId] of Object.entries(axles.boneDistalJoint ?? {})) {
      const childId = rig.bones.find((bone) => bone.parent === parentId && art[bone.id])?.id;
      expect(childId, `${parentId} needs one articulated child`).toBeTruthy();
      const distal = artJointPosition(parentId, distalJointId, poses);
      const child = poses.get(childId);
      expect(distal.x).toBeCloseTo(child.x, 6);
      expect(distal.y).toBeCloseTo(child.y, 6);
    }
  });
});
