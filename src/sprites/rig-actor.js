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
  else if (id === "cape") return null;
  else if (id.endsWith("Foot")) {
    const isRear = id.startsWith("rear");
    graphic.roundRect(isRear ? -5 : -6, 0, isRear ? 12 : 15, isRear ? 5 : 6, 3).fill(color);
  }
  else if (SEGMENT_LENGTHS[id]) {
    const isRear = id.startsWith("rear");
    const width = (id.includes("Arm") ? 7 : id.includes("Shin") ? 9 : 11) * (isRear ? 0.88 : 1);
    const length = SEGMENT_LENGTHS[id] * (isRear ? 0.92 : 1);
    graphic.roundRect(-width / 2, 0, width, length, width / 2).fill(color);
  }
  return graphic;
}

function makeSprite(config, textures) {
  if (!config?.src) return null;
  const texture = textures?.get(config.src);
  if (!texture) return null;
  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(...(config.anchor ?? [0.5, 0.5]));
  sprite.position.set(config.x ?? 0, config.y ?? 0);
  sprite.scale.set(config.scale ?? 1);
  sprite.rotation = config.rotation ?? 0;
  return sprite;
}

function artKey(target) {
  return target.kind === "body"
    ? `body:${target.boneId}`
    : `equipment:${target.slotId}:${target.itemId}:${target.boneId}`;
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
  constructor({ rig, clips = {}, appearance, art = null, textures = null } = {}) {
    super();
    this.rig = validateRig(rig);
    this.clips = validateClips(this.rig, clips);
    this.art = art;
    this.textures = textures;
    this.bones = new Map();
    this.bodyVisuals = new Map();
    this.equipmentVisuals = new Map();
    this.artVisuals = new Map();
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
      const body = makeSprite(this.art?.body?.[bone.id], this.textures) ?? makeBodyShape(bone.id);
      if (body) {
        layers.base.addChild(body);
        this.bodyVisuals.set(bone.id, body);
        if (this.art?.body?.[bone.id]) this.artVisuals.set(artKey({ kind: "body", boneId: bone.id }), body);
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

  syncArtPlacement(target, config) {
    const visual = this.artVisuals.get(artKey(target));
    if (!visual) return false;
    visual.position.set(config.x ?? 0, config.y ?? 0);
    return true;
  }

  applyAppearance(appearance) {
    this.appearance = normalizeAppearance(appearance, this.rig.slots);
    for (const visuals of this.equipmentVisuals.values()) {
      for (const visual of visuals) visual.destroy();
    }
    this.equipmentVisuals.clear();
    this.artVisuals.clear();
    for (const [boneId, body] of this.bodyVisuals) {
      body.visible = true;
      if (this.art?.body?.[boneId]) this.artVisuals.set(artKey({ kind: "body", boneId }), body);
    }

    for (const [slotId, itemId] of Object.entries(this.appearance.equipment)) {
      if (!itemId) continue;
      const slot = this.rig.slots[slotId];
      const assetId = typeof itemId === "object" ? itemId.id : itemId;
      const visuals = [];
      for (const attachment of slot.attachments) {
        const bone = this.bones.get(attachment.bone);
        const asset = this.art?.equipment?.[slotId]?.[assetId]?.[attachment.bone]
          ?? this.art?.equipment?.[slotId]?.preview?.[attachment.bone];
        const visual = makeSprite(asset, this.textures) ?? makeEquipmentShape(slotId);
        bone.layers[attachment.layer].addChild(visual);
        visuals.push(visual);
        if (asset) this.artVisuals.set(artKey({ kind: "equipment", slotId, itemId: typeof itemId === "object" ? itemId.id : itemId, boneId: attachment.bone }), visual);
        if (attachment.mode === "replace") {
          const baseBody = this.bodyVisuals.get(attachment.bone);
          if (baseBody) baseBody.visible = false;
        }
      }
      this.equipmentVisuals.set(slotId, visuals);
    }
  }
}
