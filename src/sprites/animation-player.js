const TRANSFORM_KEYS = ["x", "y", "rotation", "scaleX", "scaleY"];

function transformFrom(bindPose, delta = {}) {
  return {
    x: (bindPose.x ?? 0) + (delta.x ?? 0),
    y: (bindPose.y ?? 0) + (delta.y ?? 0),
    rotation: (bindPose.rotation ?? 0) + (delta.rotation ?? 0),
    scaleX: (bindPose.scaleX ?? 1) + (delta.scaleX ?? 0),
    scaleY: (bindPose.scaleY ?? 1) + (delta.scaleY ?? 0),
  };
}

export function advanceClip({ durationMs, loop = true }, elapsedMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Animation clips need a positive durationMs");
  }

  if (loop) {
    return { elapsedMs: ((elapsedMs % durationMs) + durationMs) % durationMs, finished: false };
  }

  const clamped = Math.max(0, Math.min(elapsedMs, durationMs));
  return { elapsedMs: clamped, finished: elapsedMs >= durationMs };
}

export function sampleClip(clip, boneId, elapsedMs, bindPose = {}) {
  const track = clip.tracks?.[boneId];
  if (!track?.length) return transformFrom(bindPose);

  const progress = Math.max(0, Math.min(elapsedMs / clip.durationMs, 1));
  let afterIndex = track.findIndex((keyframe) => keyframe.time >= progress);
  if (afterIndex === -1) afterIndex = track.length - 1;
  const after = track[afterIndex];
  const before = track[Math.max(0, afterIndex - 1)];
  const span = after.time - before.time;
  const amount = span > 0 ? (progress - before.time) / span : 0;
  const delta = {};

  for (const key of TRANSFORM_KEYS) {
    const start = before[key] ?? 0;
    const end = after[key] ?? start;
    delta[key] = start + (end - start) * amount;
  }

  return transformFrom(bindPose, delta);
}
