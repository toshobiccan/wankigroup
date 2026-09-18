import { describe, expect, it } from "vitest";
import { advanceClip, sampleClip } from "../src/sprites/animation-player.js";

const BIND_POSE = { x: 10, y: -4, rotation: 0.2, scaleX: 1, scaleY: 1 };

describe("advanceClip", () => {
  it("wraps a looping clip at its duration", () => {
    expect(advanceClip({ durationMs: 500, loop: true }, 620)).toEqual({ elapsedMs: 120, finished: false });
  });

  it("clamps a one-shot clip and marks it complete", () => {
    expect(advanceClip({ durationMs: 500, loop: false }, 620)).toEqual({ elapsedMs: 500, finished: true });
  });
});

describe("sampleClip", () => {
  it("smooths velocity through keys and the loop seam without overshooting poses", () => {
    const clip = { durationMs: 1000, loop: true, interpolation: "smooth", tracks: {
      arm: [{ time: 0, rotation: 0 }, { time: 0.2, rotation: 1 },
        { time: 0.5, rotation: 2 }, { time: 0.8, rotation: -1 }, { time: 1, rotation: 0 }],
    } };
    const value = (t) => sampleClip(clip, "arm", t).rotation;
    for (const t of [200, 500, 800]) {
      expect((value(t) - value(t - 0.01)) / 0.01).toBeCloseTo((value(t + 0.01) - value(t)) / 0.01, 5);
    }
    expect((value(1000) - value(999.99)) / 0.01).toBeCloseTo((value(0.01) - value(0)) / 0.01, 5);
    for (let t = 0; t <= 1000; t += 1) {
      const track = clip.tracks.arm;
      const index = Math.max(1, track.findIndex(k => k.time >= t / 1000));
      const lo = Math.min(track[index - 1].rotation, track[index].rotation);
      const hi = Math.max(track[index - 1].rotation, track[index].rotation);
      expect(value(t)).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(value(t)).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it("adds interpolated keyframe values to a bone bind pose", () => {
    const clip = {
      durationMs: 1000,
      tracks: {
        arm: [
          { time: 0, rotation: 0 },
          { time: 0.5, rotation: 0.6, x: 8 },
          { time: 1, rotation: 0 },
        ],
      },
    };

    expect(sampleClip(clip, "arm", 250, BIND_POSE)).toEqual({
      x: 14,
      y: -4,
      rotation: 0.5,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("returns an unchanged bind pose when a bone has no track", () => {
    expect(sampleClip({ durationMs: 1000, tracks: {} }, "head", 500, BIND_POSE)).toEqual(BIND_POSE);
  });
});
