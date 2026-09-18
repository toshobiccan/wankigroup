import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runPath = new URL("../data/animations/humanoid/run.json", import.meta.url);
const hasRun = existsSync(runPath);

describe("humanoid run animation", () => {
  it("provides a looping run clip", () => {
    expect(hasRun).toBe(true);
  });

  if (hasRun) {
    const run = JSON.parse(readFileSync(runPath, "utf8"));
    const limbBones = [
      "rearUpperArm", "rearForearm", "rearHand",
      "frontUpperArm", "frontForearm", "frontHand",
      "rearThigh", "rearShin", "rearFoot",
      "frontThigh", "frontShin", "frontFoot",
    ];

    it("uses a fast two-step loop with mirrored leg contacts and airborne poses", () => {
      expect(run.id).toBe("run");
      expect(run.loop).toBe(true);
      expect(run.durationMs).toBeGreaterThanOrEqual(600);
      expect(run.durationMs).toBeLessThanOrEqual(800);
      const frontOppositeContact = run.tracks.frontThigh.find((keyframe) => keyframe.time === 0.5);
      const rearOppositeContact = run.tracks.rearThigh.find((keyframe) => keyframe.time === 0.5);
      expect(run.tracks.frontThigh[0].rotation).toBeCloseTo(rearOppositeContact.rotation);
      expect(run.tracks.rearThigh[0].rotation).toBeCloseTo(frontOppositeContact.rotation);
      expect(run.tracks.hips.some((keyframe) => keyframe.y < -2)).toBe(true);
    });

    it("keeps every limb joint at its authored attachment point", () => {
      for (const boneId of limbBones) {
        expect(run.tracks[boneId], `${boneId} needs a rotation track`).toBeDefined();
        for (const keyframe of run.tracks[boneId]) {
          expect(keyframe.x, `${boneId} must not translate on x`).toBeUndefined();
          expect(keyframe.y, `${boneId} must not translate on y`).toBeUndefined();
        }
      }
    });

    it("has finite, ordered transforms and an exact loop seam", () => {
      for (const [boneId, track] of Object.entries(run.tracks)) {
        expect(track[0].time, `${boneId} starts at zero`).toBe(0);
        expect(track.at(-1).time, `${boneId} ends at one`).toBe(1);
        for (let index = 0; index < track.length; index += 1) {
          const keyframe = track[index];
          expect(Number.isFinite(keyframe.time)).toBe(true);
          if (index > 0) expect(keyframe.time).toBeGreaterThan(track[index - 1].time);
          for (const [key, value] of Object.entries(keyframe)) {
            if (key !== "time") expect(Number.isFinite(value), `${boneId}.${key} is finite`).toBe(true);
          }
        }
        const first = { ...track[0], time: 1 };
        expect(track.at(-1), `${boneId} closes without a pop`).toEqual(first);
      }
    });
  }
});
