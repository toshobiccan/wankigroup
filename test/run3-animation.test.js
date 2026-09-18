import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleClip } from "../src/sprites/animation-player.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const run = read("../data/animations/humanoid/run3.json");
const run2 = read("../data/animations/humanoid/run.json");
const rig = read("../data/rigs/humanoid.json");
function poseAt(time) {
  const poses = {};
  for (const bone of rig.bones) {
    const local = sampleClip(run, bone.id, time * run.durationMs, bone);
    const p = poses[bone.parent] ?? { x: 0, y: 0, rotation: 0 };
    poses[bone.id] = {
      x: p.x + local.x * Math.cos(p.rotation) - local.y * Math.sin(p.rotation),
      y: p.y + local.x * Math.sin(p.rotation) + local.y * Math.cos(p.rotation),
      rotation: p.rotation + local.rotation,
    };
  }
  return poses;
}
const angle = (a, b) => Math.atan2(-(b.x - a.x), b.y - a.y);

describe("Run 3 reference poses", () => {
  it("is modestly faster and closes every smooth track", () => {
    expect(run2.durationMs / run.durationMs).toBeGreaterThan(1.05);
    expect(run2.durationMs / run.durationMs).toBeLessThan(1.12);
    for (const track of Object.values(run.tracks)) {
      expect(track.at(-1)).toEqual({ ...track[0], time: 1 });
    }
  });
  it("coordinates opposing arms and legs using actual world-space segments", () => {
    for (let frame = 0; frame < 8; frame++) {
      const p = poseAt(frame / 8);
      for (const side of ["front", "rear"]) {
        const thigh = angle(p[`${side}Thigh`], p[`${side}Shin`]);
        const arm = angle(p[`${side}UpperArm`], p[`${side}Forearm`]);
        // During compression the supporting thigh can pass through vertical
        // while its knee absorbs weight. Contact/flight must remain opposing.
        if (frame % 4 !== 1) expect(thigh * arm).toBeLessThan(0);
        else expect(Math.abs(thigh)).toBeLessThan(0.25);
      }
      expect(angle(p.frontUpperArm, p.frontForearm))
        .toBeCloseTo(-angle(p.rearUpperArm, p.rearForearm), 5);
    }
  });
  it("compresses after landing and lifts both feet in flight", () => {
    for (const start of [0, 0.5]) {
      const contact = poseAt(start);
      const down = poseAt(start + 0.125);
      const flight = poseAt(start + 0.375);
      expect(down.hips.y).toBeGreaterThan(contact.hips.y);
      expect(flight.hips.y).toBeLessThan(contact.hips.y);
      for (const id of ["frontFoot", "rearFoot"]) {
        expect(flight[id].y + 9).toBeLessThan(rig.bounds.groundY - 4);
      }
    }
  });
  it("keeps the sole guides above ground between authored poses", () => {
    for (let ms = 0; ms <= run.durationMs; ms++) {
      const p = poseAt(ms / run.durationMs);
      for (const id of ["frontFoot", "rearFoot"]) {
        const soleY = p[id].y + 9 * Math.cos(p[id].rotation);
        expect(soleY).toBeLessThanOrEqual(rig.bounds.groundY + 0.1);
      }
    }
  });
  it("uses one gentle bounce per step without extra body reversals", () => {
    const ys = Array.from({ length: 621 }, (_, ms) => poseAt(ms / 620).hips.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(5.01);
    const signs = ys.slice(1).map((y, i) => Math.sign(y - ys[i])).filter(Boolean);
    expect(signs.filter((sign, i) => i && sign !== signs[i - 1])).toHaveLength(4);
  });
  it("lands both supporting feet under the quieter body", () => {
    for (const [id, phase] of [["frontFoot", 0], ["rearFoot", 0.5]]) {
      const foot = poseAt(phase)[id];
      expect(foot.y + 9 * Math.cos(foot.rotation)).toBeCloseTo(rig.bounds.groundY, 2);
    }
  });
  it("flexes the rear elbow and rolls the rear foot during the back swing", () => {
    const rearBackSwing = poseAt(0.875);
    expect(rearBackSwing.rearFoot.rotation).toBeCloseTo(1.16, 5);
    const rearForward = poseAt(0);
    const upper = angle(rearForward.rearUpperArm, rearForward.rearForearm);
    const lower = angle(rearForward.rearForearm, rearForward.rearHand);
    expect(lower - upper).toBeCloseTo(-1.6, 5);
  });
  it("avoids sharp front-leg rotation spikes at the reach limit", () => {
    for (const id of ["frontThigh", "frontShin"]) {
      for (let ms = 1; ms < run.durationMs; ms++) {
        const before = sampleClip(run, id, ms - 1).rotation;
        const current = sampleClip(run, id, ms).rotation;
        const after = sampleClip(run, id, ms + 1).rotation;
        expect(Math.abs(after - 2 * current + before)).toBeLessThan(0.025);
      }
    }
  });
  it("keeps hand and equipment motion inherited, and moves limbs only by rotation", () => {
    for (const id of ["rearHand", "frontHand", "offhandMount", "weaponMount"]) {
      expect(run.tracks[id]).toBeUndefined();
    }
    for (const [id, track] of Object.entries(run.tracks)) {
      if (id !== "hips") for (const key of track) expect(Object.keys(key).sort()).toEqual(["rotation", "time"]);
    }
  });
});
