// Bake side-view poses into existing local FK tracks; no new runtime solver.
// Reference: https://www.adobe.com/uk/creativecloud/animation/discover/animation-run-cycle.html
import { readFileSync, writeFileSync } from "node:fs";
import { sampleClip } from "../src/sprites/animation-player.js";

const rig = JSON.parse(readFileSync(new URL("../data/rigs/humanoid.json", import.meta.url)));
const bones = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone]));
const clip = { id: "run3", durationMs: 620, loop: true, interpolation: "smooth", tracks: {} };
// Contact, compression, push, flight; opposite contact, recovery, knee drive, reach.
// Angles measured clockwise from vertical down, so negative swings forward.
const thighs = [-0.48, -0.12, 0.32, 0.62, 0.45, 0.12, -0.68, -0.65];
const knees = [0.18, 0.9, 0.12, 1.1, 1.85, 1.85, 1.15, 0.42];
const arms = [0.48, 0.12, -0.32, -0.65, -0.48, -0.12, 0.32, 0.65];
const elbows = [-1.12, -1.22, -1.4, -1.5, -1.45, -1.35, -1.18, -1.08];
const feet = [-0.12, 0, 0.3, 0.48, 0.3, 0.12, -0.2, -0.25];
const rearFeet = [-0.12, 0, 0.45, 1.16, 1.2, 0.55, -0.15, -0.25];
const axis = (child) => Math.atan2(bones[child].y, bones[child].x) - Math.PI / 2;
const round = (value) => Number(value.toFixed(7));

for (let frame = 0; frame < 8; frame++) {
  const time = frame / 8;
  const phase = frame % 4;
  const hipRotation = 0.012 * Math.cos(time * Math.PI * 2);
  const torsoRotation = [0.205, 0.215, 0.205, 0.195][phase];
  const world = { hips: hipRotation, torso: torsoRotation };
  const key = (id, delta) => (clip.tracks[id] ??= []).push({ time, ...delta });
  const rotate = (id, angle) => {
    world[id] = angle;
    key(id, { rotation: round(angle - (world[bones[id].parent] ?? 0) - bones[id].rotation) });
  };
  key("hips", { y: 0, rotation: round(hipRotation) });
  rotate("torso", torsoRotation);
  rotate("head", 0.02);
  rotate("cape", [0.28, 0.35, 0.4, 0.33][phase]);
  for (const [side, offset] of [["front", 0], ["rear", 4]]) {
    const i = (frame + offset) % 8;
    rotate(`${side}Thigh`, thighs[i] - axis(`${side}Shin`));
    rotate(`${side}Shin`, thighs[i] + knees[i] - axis(`${side}Foot`));
    rotate(`${side}Foot`, (side === "rear" ? rearFeet : feet)[i]);
    rotate(`${side}UpperArm`, arms[i] - axis(`${side}Forearm`));
    rotate(`${side}Forearm`, arms[i] + elbows[i] - (side === "rear" ? 0.15 : 0) - axis(`${side}Hand`));
  }
}
for (const track of Object.values(clip.tracks)) track.push({ ...track[0], time: 1 });
// One gentle two-step bounce, rather than per-frame floor clamps which jerked
// the entire body. Choose a single height offset safe for the whole cycle.
// Sole guide is nine rig units below the ankle; this remains an in-place run.
const rootTrack = [];
let heightOffset = Infinity;
for (let step = 0; step <= 128; step++) {
  const time = step / 128;
  const poses = {};
  for (const bone of rig.bones) {
    const local = sampleClip(clip, bone.id, time * clip.durationMs, bone);
    const parent = poses[bone.parent] ?? { y: 0, rotation: 0 };
    poses[bone.id] = {
      y: parent.y + local.x * Math.sin(parent.rotation) + local.y * Math.cos(parent.rotation),
      rotation: parent.rotation + local.rotation,
    };
  }
  const lowestSole = Math.max(...["frontFoot", "rearFoot"].map((id) => poses[id].y + 9 * Math.cos(poses[id].rotation)));
  const bounce = 2.5 * Math.sin(4 * Math.PI * time);
  heightOffset = Math.min(heightOffset, rig.bounds.groundY - lowestSole - bounce);
  rootTrack.push({ time, y: bounce, rotation: round(poses.hips.rotation) });
}
// Lower the quiet path into leg reach; the support solve below handles clearance.
for (const key of rootTrack) key.y = round(key.y + heightOffset + 4 - 0.02);
clip.tracks.hips = rootTrack;
// Bake two-bone support corrections into rotations only. This lets the feet
// reach the floor under the quieter body path without stretching any bones.
const legTracks = Object.fromEntries(["front", "rear"].flatMap((side) =>
  ["Thigh", "Shin", "Foot"].map((part) => [`${side}${part}`, []])));
const ease = (t) => t * t * (3 - 2 * t);
// Blend into constraints before reaching full extension; a hard reach clamp
// near a straight knee amplified tiny target changes into visible twitching.
const softMin = (a, b, width) => {
  const blend = Math.max(0, 1 - Math.abs(a - b) / width);
  return Math.min(a, b) - width * blend * blend / 4;
};
for (let step = 0; step <= 256; step++) {
  const time = step / 256;
  const poses = {};
  for (const bone of rig.bones) {
    const local = sampleClip(clip, bone.id, time * clip.durationMs, bone);
    const p = poses[bone.parent] ?? { x: 0, y: 0, rotation: 0 };
    poses[bone.id] = {
      x: p.x + local.x * Math.cos(p.rotation) - local.y * Math.sin(p.rotation),
      y: p.y + local.x * Math.sin(p.rotation) + local.y * Math.cos(p.rotation),
      rotation: p.rotation + local.rotation,
    };
  }
  for (const [side, offset] of [["front", 0], ["rear", 0.5]]) {
    const phase = (time + offset) % 1;
    const weight = phase <= 0.25 ? 1 : phase < 0.375 ? 1 - ease((phase - 0.25) / 0.125)
      : phase > 0.875 ? ease((phase - 0.875) / 0.125) : 0;
    const thighId = `${side}Thigh`, shinId = `${side}Shin`, footId = `${side}Foot`;
    const hip = poses[thighId], ankle = poses[footId];
    const a = Math.hypot(bones[shinId].x, bones[shinId].y);
    const b = Math.hypot(bones[footId].x, bones[footId].y);
    const floorY = rig.bounds.groundY - 9 * Math.cos(ankle.rotation);
    const targetY = softMin(floorY, ankle.y + weight * (floorY - ankle.y), 0.01);
    const dy = targetY - hip.y;
    const maxX = Math.sqrt(Math.max(0, ((a + b) * 0.995) ** 2 - dy ** 2));
    const requestedX = ankle.x - hip.x;
    const dx = Math.sign(requestedX) * Math.max(0, softMin(Math.abs(requestedX), maxX, 2));
    const knee = Math.acos(Math.max(-1, Math.min(1, (dx * dx + dy * dy - a * a - b * b) / (2 * a * b))));
    const upper = Math.atan2(-dx, dy) - Math.atan2(b * Math.sin(knee), a + b * Math.cos(knee));
    const thighWorld = upper - axis(shinId);
    const shinWorld = upper + knee - axis(footId);
    for (const [id, rotation] of [
      [thighId, thighWorld - poses.hips.rotation - bones[thighId].rotation],
      [shinId, shinWorld - thighWorld - bones[shinId].rotation],
      [footId, ankle.rotation - shinWorld - bones[footId].rotation],
    ]) legTracks[id].push({ time, rotation: round(rotation) });
  }
}
Object.assign(clip.tracks, legTracks);
writeFileSync(new URL("../data/animations/humanoid/run3.json", import.meta.url), `${JSON.stringify(clip, null, 2)}\n`);
