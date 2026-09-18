import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RigActor } from "../src/sprites/rig-actor.js";
import { sampleClip } from "../src/sprites/animation-player.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const rig = read("../data/rigs/humanoid.json");
const clips = { idle: read("../data/animations/humanoid/idle.json"), run3: read("../data/animations/humanoid/run3.json") };
clips.slash = read("../data/animations/humanoid/slash.json");
const vector = (x, y) => ({ x, y, set(x, y) { this.x = x; this.y = y; } });
// Exercise real actor playback methods without requiring a GPU or artwork.
function actorStub() {
  const actor = {
    clips, currentClip: "idle", elapsedMs: 0,
    bones: new Map(rig.bones.map((bone) => [bone.id, { bindPose: bone, container: {
      position: vector(bone.x ?? 0, bone.y ?? 0), rotation: bone.rotation ?? 0, scale: vector(1, 1),
    } }])),
    syncRenderWrappers() {}, play: RigActor.prototype.play,
    playOnce: RigActor.prototype.playOnce, update: RigActor.prototype.update,
  };
  actor.update(0);
  return actor;
}
const poses = (actor) => [...actor.bones.values()].map(({ container: c }) => [c.position.x, c.position.y, c.rotation]);

describe("idle / Run 3 transitions", () => {
  it("plays Slash once and blends back to idle automatically", () => {
    const actor = actorStub();
    const initial = poses(actor);
    actor.playOnce("slash", { transitionMs: 100, returnTransitionMs: 160 });
    actor.update(0);
    expect(poses(actor)).toEqual(initial);
    actor.update(clips.slash.durationMs);
    expect(actor.currentClip).toBe("idle");
    expect(actor.transition.durationMs).toBe(160);
    const finish = poses(actor);
    actor.update(0);
    expect(poses(actor)).toEqual(finish);
    actor.update(160);
    expect(actor.transition).toBeNull();
  });
  it("keeps Slash joints and sword grip fixed through the full action", () => {
    const actor = actorStub();
    actor.playOnce("slash", { transitionMs: 100, returnTransitionMs: 160 });
    for (let ms = 0; ms < 800; ms++) {
      actor.update(1);
      for (const [id, { container, bindPose }] of actor.bones) {
        if (id !== "hips") {
          expect(container.position.x).toBe(bindPose.x ?? 0);
          expect(container.position.y).toBe(bindPose.y ?? 0);
        }
        if (["frontHand", "rearHand", "weaponMount", "offhandMount"].includes(id)) {
          expect(container.rotation).toBe(bindPose.rotation ?? 0);
        }
      }
    }
  });
  it("starts from the visible pose and reaches the moving target exactly", () => {
    const actor = actorStub();
    const idlePose = poses(actor);
    actor.play("run3", { transitionMs: 180 });
    actor.update(0);
    expect(poses(actor)).toEqual(idlePose);
    for (let i = 0; i < 18; i++) actor.update(10);
    expect(actor.transition).toBeNull();
    for (const [id, { container, bindPose }] of actor.bones) {
      expect(container.rotation).toBe(sampleClip(clips.run3, id, 180, bindPose).rotation);
    }
  });
  it("can reverse a transition without snapping or restarting repeated commands", () => {
    const actor = actorStub();
    actor.play("run3", { transitionMs: 180 });
    actor.update(60);
    const visible = poses(actor);
    actor.play("idle", { transitionMs: 240 });
    actor.update(0);
    expect(poses(actor)).toEqual(visible);
    actor.update(30);
    actor.play("idle", { transitionMs: 240 });
    expect(actor.transition.elapsedMs).toBe(30);
    actor.update(210);
    expect(actor.transition).toBeNull();
  });
  it("preserves limb attachments and rigid rear wrist at every transition step", () => {
    const actor = actorStub();
    for (const [target, duration] of [["run3", 180], ["idle", 240]]) {
      actor.play(target, { transitionMs: duration });
      for (let t = 0; t < duration; t++) {
        actor.update(1);
        for (const [id, { container, bindPose }] of actor.bones) {
          if (id !== "hips") {
            expect(container.position.x).toBe(bindPose.x ?? 0);
            expect(container.position.y).toBe(bindPose.y ?? 0);
          }
          if (["rearHand", "offhandMount"].includes(id)) expect(container.rotation).toBe(bindPose.rotation);
        }
      }
    }
  });
  it("clears blending when an explicit one-shot interrupts it", () => {
    const actor = actorStub();
    actor.play("run3", { transitionMs: 180 });
    actor.playOnce("idle");
    expect(actor.transition).toBeNull();
    expect(actor.elapsedMs).toBe(0);
  });
});
