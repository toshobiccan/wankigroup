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
