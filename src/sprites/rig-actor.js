import * as PIXI from "../../vendor/pixi.min.mjs";
import { advanceClip, sampleClip } from "./animation-player.js";
import { normalizeAppearance } from "./appearance.js";
import { validateClips, validateRig } from "./load-rig.js";

const BODY_COLORS = {
  hips: 0x51437a,
  torso: 0x836cc2,
  head: 0xf0b48d,
  rearUpperArm: 0xb8866d,
  rearForearm: 0xb8866d,
  rearHand: 0xf0b48d,
  frontUpperArm: 0xe3a17d,
  frontForearm: 0xe3a17d,
  frontHand: 0xf0b48d,
  rearThigh: 0x3f376d,
  rearShin: 0x4c4689,
  rearFoot: 0x2d2a55,
  frontThigh: 0x6257aa,
  frontShin: 0x7468c7,
  frontFoot: 0x393362,
  cape: 0xd95764,
};

const EQUIPMENT_COLORS = {
  helmet: 0xf2c66e,
  cape: 0xa94a72,
  chestplate: 0x6ba8d8,
  leggings: 0x8291dc,
  boots: 0x6c5549,
  weapon: 0xeacb72,
  book: 0x75b67d,
};

const SEGMENT_LENGTHS = {
  torso: 28,
  rearUpperArm: 16,
  rearForearm: 14,
  frontUpperArm: 16,
  frontForearm: 14,
  rearThigh: 19,
  rearShin: 17,
  frontThigh: 19,
  frontShin: 17,
};

function makeBodyShape(id) {
  const graphic = new PIXI.Graphics();
  const color = BODY_COLORS[id] ?? 0xffffff;
  if (id === "head") graphic.circle(0, -8, 10).fill(color).stroke({ color: 0x402e54, width: 1.5 });
  else if (id === "hips") graphic.roundRect(-11, -5, 22, 10, 3).fill(color);
  else if (id === "cape") graphic.poly([-10, 0, 10, 0, 5, 35, -7, 30]).fill(color);
  else if (id.endsWith("Foot")) graphic.roundRect(-6, 0, 14, 6, 3).fill(color);
  else if (SEGMENT_LENGTHS[id]) {
    const width = id.includes("Arm") ? 7 : id.includes("Shin") ? 9 : 11;
    graphic.roundRect(-width / 2, 0, width, SEGMENT_LENGTHS[id], width / 2).fill(color);
  }
  return graphic;
}

function makeEquipmentShape(slotId) {
  const graphic = new PIXI.Graphics();
  const color = EQUIPMENT_COLORS[slotId];
  if (slotId === "helmet") graphic.arc(0, -8, 12, Math.PI, 0).lineTo(12, -5).lineTo(-12, -5).fill(color);
  else if (slotId === "cape") graphic.poly([-13, 0, 13, 0, 7, 42, -10, 35]).fill({ color, alpha: 0.9 });
  else if (slotId === "chestplate") graphic.roundRect(-14, -2, 28, 27, 5).fill(color);
  else if (slotId === "leggings") graphic.roundRect(-13, -6, 26, 14, 4).fill(color);
  else if (slotId === "boots") graphic.roundRect(-7, -1, 17, 8, 3).fill(color);
  else if (slotId === "weapon") graphic.rect(-2, -28, 4, 33).fill(color).rect(-10, -25, 20, 5).fill(0xc0d2e5);
  else if (slotId === "book") graphic.roundRect(-10, -14, 20, 25, 2).fill(color).stroke({ color: 0x344d3b, width: 2 });
  return graphic;
}

export class RigActor extends PIXI.Container {
  constructor({ rig, clips = {}, appearance } = {}) {
    super();
    this.rig = validateRig(rig);
    this.clips = validateClips(this.rig, clips);
    this.bones = new Map();
    this.bodyVisuals = new Map();
    this.equipmentVisuals = new Map();
    this.elapsedMs = 0;
    this.currentClip = "idle";
    this.isPlayingOnce = false;
    this._displayScale = 1;
    this._facingLeft = false;
    this.visual = new PIXI.Container();
    this.visual.position.y = -(this.rig.bounds?.groundY ?? 0);
    this.addChild(this.visual);

    for (const bone of this.rig.bones) {
      const container = new PIXI.Container();
      const layers = {
        rear: new PIXI.Container(),
        base: new PIXI.Container(),
        armor: new PIXI.Container(),
        front: new PIXI.Container(),
        effects: new PIXI.Container(),
      };
      Object.values(layers).forEach((layer) => container.addChild(layer));
      container.label = bone.id;
      container.position.set(bone.x ?? 0, bone.y ?? 0);
      container.rotation = bone.rotation ?? 0;
      this.bones.set(bone.id, { container, layers, bindPose: bone });
      (bone.parent ? this.bones.get(bone.parent).container : this.visual).addChild(container);
      const body = makeBodyShape(bone.id);
      if (body) {
        layers.base.addChild(body);
        this.bodyVisuals.set(bone.id, body);
      }
    }

    this.applyAppearance(appearance);
    this.play(this.clips.idle ? "idle" : Object.keys(this.clips)[0]);
  }

  play(clipId) {
    if (!this.clips[clipId]) throw new Error(`Unknown actor clip: ${clipId}`);
    if (this.currentClip !== clipId) this.elapsedMs = 0;
    this.currentClip = clipId;
    this.isPlayingOnce = false;
  }

  playOnce(clipId) {
    const clip = this.clips[clipId];
    if (!clip) throw new Error(`Unknown actor clip: ${clipId}`);
    this.currentClip = clipId;
    this.elapsedMs = 0;
    this.isPlayingOnce = true;
  }

  update(deltaMs) {
    const clip = this.clips[this.currentClip];
    if (!clip) return;
    const next = advanceClip(clip, this.elapsedMs + deltaMs);
    this.elapsedMs = next.elapsedMs;
    for (const [boneId, entry] of this.bones) {
      const pose = sampleClip(clip, boneId, this.elapsedMs, entry.bindPose);
      entry.container.position.set(pose.x, pose.y);
      entry.container.rotation = pose.rotation;
      entry.container.scale.set(pose.scaleX, pose.scaleY);
    }
    if (next.finished && !clip.loop && this.clips.idle) this.play("idle");
  }

  faceLeft(isFacingLeft) {
    this._facingLeft = Boolean(isFacingLeft);
    this.scale.set(this._facingLeft ? -this._displayScale : this._displayScale, this._displayScale);
  }

  setDisplayHeight(height) {
    this._displayScale = height / (this.rig.bounds?.height ?? 88);
    this.faceLeft(this._facingLeft);
  }

  applyAppearance(appearance) {
    this.appearance = normalizeAppearance(appearance, this.rig.slots);
    for (const visuals of this.equipmentVisuals.values()) {
      for (const visual of visuals) visual.destroy();
    }
    this.equipmentVisuals.clear();
    for (const body of this.bodyVisuals.values()) body.visible = true;

    for (const [slotId, itemId] of Object.entries(this.appearance.equipment)) {
      if (!itemId) continue;
      const slot = this.rig.slots[slotId];
      const visuals = [];
      for (const attachment of slot.attachments) {
        const bone = this.bones.get(attachment.bone);
        const visual = makeEquipmentShape(slotId);
        bone.layers[attachment.layer].addChild(visual);
        visuals.push(visual);
        if (attachment.mode === "replace") {
          const baseBody = this.bodyVisuals.get(attachment.bone);
          if (baseBody) baseBody.visible = false;
        }
      }
      this.equipmentVisuals.set(slotId, visuals);
    }
  }
}
