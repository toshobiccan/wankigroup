import * as PIXI from "../../vendor/pixi.min.mjs";
import { advanceClip, blendPose, sampleClip } from "./animation-player.js";
import { normalizeAppearance } from "./appearance.js";
import { validateClips, validateRig } from "./load-rig.js";

const BODY_COLORS = {
  hips: 0x51437a,
  torso: 0x836cc2,
  head: 0xf0b48d,
  hair: 0x5b3d29,
  eyes: 0x2b2118,
  nose: 0xc17f52,
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
  torso: 25,
  rearUpperArm: 17,
  rearForearm: 15,
  frontUpperArm: 18,
  frontForearm: 18,
  rearThigh: 26,
  rearShin: 26,
  frontThigh: 25,
  frontShin: 27,
};

function makeBodyShape(id) {
  const graphic = new PIXI.Graphics();
  const color = BODY_COLORS[id] ?? 0xffffff;
  if (id === "head") graphic.circle(0, -8, 10).fill(color).stroke({ color: 0x402e54, width: 1.5 });
  else if (id === "hair" || id === "eyes" || id === "nose") return null; // no mannequin art yet -- suppressed rather than showing the old geometric placeholder
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

function placeSprite(sprite, config, segment = null) {
  const texture = sprite.texture;
  const anchor = config.pivot
    ? [config.pivot[0] / texture.orig.width, config.pivot[1] / texture.orig.height]
    : (config.anchor ?? [0.5, 0.5]);
  sprite.anchor.set(...anchor);
  // Separate regions of existing artwork without redrawing or moving its pivot.
  if (config.clipPolygon) {
    let mask = sprite.getChildByLabel("art-region-mask");
    if (!mask) { mask = new PIXI.Graphics(); mask.label = "art-region-mask"; sprite.addChild(mask); }
    mask.clear().poly(config.clipPolygon.flatMap(([x, y]) => [x - anchor[0] * texture.orig.width, y - anchor[1] * texture.orig.height])).fill(0xffffff);
    sprite.mask = mask;
  }
  sprite.position.set(config.x ?? 0, config.y ?? 0);
  if (config.pivot && config.distalPivot && segment) {
    const imageX = config.distalPivot[0] - config.pivot[0];
    const imageY = config.distalPivot[1] - config.pivot[1];
    const imageLength = Math.hypot(imageX, imageY);
    const segmentLength = Math.hypot(segment.x, segment.y);
    sprite.scale.set(segmentLength / imageLength);
    sprite.rotation = Math.atan2(segment.y, segment.x) - Math.atan2(imageY, imageX);
  } else {
    sprite.scale.set(config.scale ?? 1);
    sprite.rotation = config.rotation ?? 0;
  }
}

function makeSprite(config, textures, segment = null) {
  if (!config?.src) return null;
  const texture = textures?.get(config.src);
  if (!texture) return null;
  const sprite = new PIXI.Sprite(texture);
  placeSprite(sprite, config, segment);
  return sprite;
}

// Bone containers nest parent->child for kinematics (so animation composes
// correctly), but PIXI only z-sorts direct siblings -- a bone nested under
// the rear-arm chain can never out-rank one nested under the front-arm
// chain no matter its zIndex, since they're never siblings. Layers render
// in a separate flat, globally-sortable container instead; this recomputes
// each bone's world pose every frame so its render wrapper can be placed
// there independently of the kinematic nesting.
function worldPose(bones, boneId) {
  const entry = bones.get(boneId);
  const local = entry.container;
  const parentId = entry.bindPose.parent;
  if (!parentId) {
    return { x: local.position.x, y: local.position.y, rotation: local.rotation, scaleX: local.scale.x, scaleY: local.scale.y };
  }
  const parent = worldPose(bones, parentId);
  const cos = Math.cos(parent.rotation);
  const sin = Math.sin(parent.rotation);
  const lx = local.position.x * parent.scaleX;
  const ly = local.position.y * parent.scaleY;
  return {
    x: parent.x + lx * cos - ly * sin,
    y: parent.y + lx * sin + ly * cos,
    rotation: parent.rotation + local.rotation,
    scaleX: parent.scaleX * local.scale.x,
    scaleY: parent.scaleY * local.scale.y,
  };
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

    this.renderRoot = new PIXI.Container();
    this.renderRoot.sortableChildren = true;
    this.visual.addChild(this.renderRoot);

    for (const bone of this.rig.bones) {
      const container = new PIXI.Container();
      container.label = bone.id;
      container.position.set(bone.x ?? 0, bone.y ?? 0);
      container.rotation = bone.rotation ?? 0;
      (bone.parent ? this.bones.get(bone.parent).container : this.visual).addChild(container);

      const wrapper = new PIXI.Container();
      wrapper.zIndex = bone.zIndex ?? 0;
      wrapper.label = bone.id;
      this.renderRoot.addChild(wrapper);
      const layers = {
        rear: new PIXI.Container(),
        base: new PIXI.Container(),
        armor: new PIXI.Container(),
        front: new PIXI.Container(),
        effects: new PIXI.Container(),
      };
      Object.values(layers).forEach((layer) => wrapper.addChild(layer));

      this.bones.set(bone.id, { container, wrapper, layers, bindPose: bone });
      const segmentChild = this.rig.bones.find((candidate) => candidate.parent === bone.id && this.art?.body?.[candidate.id]);
      const body = makeSprite(this.art?.body?.[bone.id], this.textures, segmentChild) ?? makeBodyShape(bone.id);
      if (body) {
        layers.base.addChild(body);
        this.bodyVisuals.set(bone.id, body);
        if (this.art?.body?.[bone.id]) this.artVisuals.set(artKey({ kind: "body", boneId: bone.id }), body);
      }
    }

    this.applyAppearance(appearance);
    this.play(this.clips.idle ? "idle" : Object.keys(this.clips)[0]);
    this.syncRenderWrappers();
  }

  syncRenderWrappers() {
    for (const [boneId, entry] of this.bones) {
      const world = worldPose(this.bones, boneId);
      entry.wrapper.position.set(world.x, world.y);
      entry.wrapper.rotation = world.rotation;
      entry.wrapper.scale.set(world.scaleX, world.scaleY);
    }
  }

  play(clipId, { transitionMs = 0 } = {}) {
    if (!this.clips[clipId]) throw new Error(`Unknown actor clip: ${clipId}`);
    if (this.currentClip !== clipId) {
      this.transition = Number.isFinite(transitionMs) && transitionMs > 0 ? {
        elapsedMs: 0,
        durationMs: transitionMs,
        from: new Map([...this.bones].map(([id, { container }]) => [id, {
          x: container.position.x, y: container.position.y, rotation: container.rotation,
          scaleX: container.scale.x, scaleY: container.scale.y,
        }])),
      } : null;
      this.elapsedMs = 0;
    }
    this.currentClip = clipId;
    this.isPlayingOnce = false;
    this.returnTransitionMs = 0;
  }

  playOnce(clipId, { transitionMs = 0, returnTransitionMs = 0 } = {}) {
    const clip = this.clips[clipId];
    if (!clip) throw new Error(`Unknown actor clip: ${clipId}`);
    if (this.currentClip === clipId) this.transition = null;
    this.play(clipId, { transitionMs });
    this.elapsedMs = 0;
    this.isPlayingOnce = true;
    this.returnTransitionMs = returnTransitionMs;
  }

  update(deltaMs) {
    const clip = this.clips[this.currentClip];
    if (!clip) return;
    const next = advanceClip(clip, this.elapsedMs + deltaMs);
    this.elapsedMs = next.elapsedMs;
    if (this.transition) this.transition.elapsedMs += deltaMs;
    for (const [boneId, entry] of this.bones) {
      let pose = sampleClip(clip, boneId, this.elapsedMs, entry.bindPose);
      if (this.transition) pose = blendPose(this.transition.from.get(boneId), pose,
        this.transition.elapsedMs / this.transition.durationMs);
      entry.container.position.set(pose.x, pose.y);
      entry.container.rotation = pose.rotation;
      entry.container.scale.set(pose.scaleX, pose.scaleY);
    }
    if (this.transition?.elapsedMs >= this.transition?.durationMs) this.transition = null;
    this.syncRenderWrappers();
    if (next.finished && !clip.loop && this.clips.idle) this.play("idle", { transitionMs: this.returnTransitionMs });
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
    const segmentChild = config.distalPivot
      ? this.rig.bones.find((candidate) => candidate.parent === target.boneId && this.art?.body?.[candidate.id])
      : null;
    placeSprite(visual, config, segmentChild);
    return true;
  }

  setBoneZIndex(boneId, zIndex) {
    const entry = this.bones.get(boneId);
    if (!entry) return false;
    entry.wrapper.zIndex = zIndex;
    entry.bindPose.zIndex = zIndex;
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
        if (slotId === "armor" && !asset) continue;
        const segment = asset?.distalPivot ? this.rig.bones.find((candidate) => candidate.parent === attachment.bone
          && this.art?.body?.[candidate.id]) : null;
        const visual = makeSprite(asset, this.textures, segment) ?? makeEquipmentShape(slotId);
        bone.layers[attachment.layer].addChild(visual);
        visuals.push(visual);
        if (asset) this.artVisuals.set(artKey({ kind: "equipment", slotId, itemId: typeof itemId === "object" ? itemId.id : itemId, boneId: attachment.bone }), visual);
        if ((asset?.mode ?? attachment.mode) === "replace") {
          const baseBody = this.bodyVisuals.get(attachment.bone);
          if (baseBody) baseBody.visible = false;
        }
      }
      this.equipmentVisuals.set(slotId, visuals);
    }
  }
}
