const TRANSFORM_KEYS = ["x", "y", "rotation", "scaleX", "scaleY"];

export function blendPose(from, to, progress) {
  const t = Math.max(0, Math.min(progress, 1));
  if (t === 0) return { ...from };
  if (t === 1) return { ...to };
  const weight = t * t * (3 - 2 * t);
  const pose = {};
  for (const key of TRANSFORM_KEYS) {
    const difference = to[key] - from[key];
    const delta = key === "rotation" ? Math.atan2(Math.sin(difference), Math.cos(difference)) : difference;
    pose[key] = from[key] + delta * weight;
  }
  return pose;
}

// Shape-preserving tangents keep authored poses bounded while removing velocity
// jumps. Closed loops share a tangent across the duplicated first/last key.
function smoothTangent(track, index, key, loop) {
  const last = track.length - 1;
  const current = track[index];
  const closed = loop && track[0].time === 0 && track[last].time === 1
    && track[0][key] === track[last][key];
  const previous = index > 0 ? track[index - 1] : closed ? track[last - 1] : null;
  const next = index < last ? track[index + 1] : closed ? track[1] : null;
  const leftSpan = previous ? current.time - previous.time + (index === 0 ? 1 : 0) : 0;
  const rightSpan = next ? next.time - current.time + (index === last ? 1 : 0) : 0;
  const left = leftSpan > 0 ? (current[key] - previous[key]) / leftSpan : 0;
  const right = rightSpan > 0 ? (next[key] - current[key]) / rightSpan : 0;
  if (!previous) return right;
  if (!next) return left;
  if (left * right <= 0) return 0;
  const leftWeight = 2 * rightSpan + leftSpan;
  const rightWeight = rightSpan + 2 * leftSpan;
  return (leftWeight + rightWeight) / (leftWeight / left + rightWeight / right);
}

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
    if (clip.interpolation === "smooth" && span > 0 && track.length >= 3
      && amount >= 0 && amount <= 1 && track.every((frame) => Number.isFinite(frame[key]))) {
      const t = amount;
      const t2 = t * t;
      const t3 = t2 * t;
      const startSlope = smoothTangent(track, afterIndex - 1, key, clip.loop !== false);
      const endSlope = smoothTangent(track, afterIndex, key, clip.loop !== false);
      delta[key] = (2 * t3 - 3 * t2 + 1) * start + (t3 - 2 * t2 + t) * span * startSlope
        + (-2 * t3 + 3 * t2) * end + (t3 - t2) * span * endSlope;
    }
  }

  return transformFrom(bindPose, delta);
}
