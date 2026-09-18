import * as PIXI from "../vendor/pixi.min.mjs";
import { loadRigArt } from "../src/sprites/load-rig-art.js";
import { adjustArtTarget, exportArtTemplate, localPointDelta } from "../src/sprites/rig-calibration.js";
import { RigActor } from "../src/sprites/rig-actor.js";

const stage = document.getElementById("stage");
const [rig, idle, run, attack, rigArt, referenceTexture, axles, axleLabels] = await Promise.all([
  fetch("../data/rigs/humanoid-aqw-bind-preview.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/idle.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/run.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/attack.json").then((response) => response.json()),
  loadRigArt("../data/rigs/humanoid-art-mannequin.json"),
  PIXI.Assets.load("../assets/rigs/mannequin/mannequin-reference.png"),
  fetch("../data/rigs/mannequin-axles.json").then((response) => response.json()),
  fetch("../data/rigs/mannequin-axle-labels.json").then((response) => response.json()),
]);

// Same anchor/scale convention as every mannequin body-art entry (see
// data/rigs/humanoid-art-mannequin.json): the full reference image shares
// the rig's own coordinate system, anchored at the hips joint pivot.
const REFERENCE_ANCHOR = [0.5066, 0.4367];
const REFERENCE_SCALE = 0.084848;

const app = new PIXI.Application();
await app.init({ resizeTo: stage, backgroundAlpha: 0, autoDensity: true, resolution: window.devicePixelRatio || 1 });
stage.appendChild(app.canvas);

const ground = new PIXI.Graphics().rect(-1000, 0, 2000, 5).fill(0x405827);
let calibratedArt = structuredClone(rigArt.art);
let actor;
let dragPoint = null;
let dragPointerId = null;
// Keep the bind pose readable. Individual gear mounts remain available through the toggles.
const previewEquipment = Object.fromEntries(Object.keys(rig.slots).map((slotId) => [slotId, null]));

const referenceVisible = document.getElementById("reference-visible");
const referenceOpacity = document.getElementById("reference-opacity");
const axlesVisible = document.getElementById("axles-visible");

// Joint-axle overlay -- CONFIRMED CORRECT, do not change the math or the
// underlying data (data/rigs/mannequin-axles.json, data/rigs/humanoid-art-
// mannequin.json, data/rigs/humanoid*.json are all frozen). This is now the
// standard visual reference for where every joint actually sits.
//
// Each dot is the ACTUAL rendered position of that limb's joint marker (the
// small grey ring drawn in the mannequin art), not the bone's own kinematic
// origin -- those two only coincide when a piece's x/y offset is zero, and
// the frozen calibration has nonzero offsets. We forward-transform the
// joint's known texture-pixel position (mannequin-axles.json) through the
// same anchor/scale/x/y/rotation math RigActor uses for the sprite itself,
// landing the dot exactly where that ring renders on screen. hips/torso/
// head have no recorded joint marker (their offset is zero, so their bone
// origin already is correct) and fall back to the bone's own wrapper
// position.
//
// Bone-to-bone lines are a diagnostic overlay, not a literal parent-child
// skeleton drawing: which axle each line points to was set explicitly,
// confirmed correct joint by joint. Face decorations (hair/eyes/nose, and
// mouth/ears once they exist) are rigidly glued to the head and never
// rotate on their own -- they have no real "axle" of their own to connect,
// so they're excluded from the line drawing rather than drawing a
// meaningless segment.
const NO_AXLE_LINE = new Set(["hair", "eyes", "nose"]);
// CONFIRMED layout -- do not "fix" this back to bone.parent. The knee draws
// from the opposite hip and the ankle from the opposite knee (both legs);
// the item-mount point distal of each hand draws from the OTHER hand. The
// shoulder-elbow-hand chain itself is same-side (default, no entry needed).
const LINE_FROM_OVERRIDE = {
  rearFoot: "frontShin",
  frontFoot: "rearShin",
  rearShin: "frontThigh",
  frontShin: "rearThigh",
  offhandMount: "frontHand",
  weaponMount: "rearHand",
};
let axleOverlay;
let axleDots;
let boneLines;

function axleWorldPosition(boneId) {
  const jointId = axles.boneProximalJoint[boneId];
  const entry = actor.bones.get(boneId);
  if (!jointId) return entry.wrapper.position;
  const [px, py] = axles.joints[jointId];
  const [texW, texH] = axles.canvasSize;
  const config = calibratedArt.body[boneId];
  const [ax, ay] = config.anchor;
  const scale = config.scale ?? 1;
  const rotation = config.rotation ?? 0;
  const unscaled = { x: px - ax * texW, y: py - ay * texH };
  const scaled = { x: unscaled.x * scale, y: unscaled.y * scale };
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const local = {
    x: scaled.x * cos - scaled.y * sin + (config.x ?? 0),
    y: scaled.x * sin + scaled.y * cos + (config.y ?? 0),
  };
  return axleOverlay.toLocal(new PIXI.Point(local.x, local.y), entry.wrapper);
}

// Display names for every axle point and line -- purely cosmetic labels,
// stored separately from the frozen position data (mannequin-axle-labels.json)
// so renaming them is always safe. A line's name defaults to "<from> -> <to>"
// from its two point names unless a custom override is set for it.
function pointName(boneId) {
  return axleLabels.points[boneId] ?? boneId;
}
function lineFromId(boneId) {
  return LINE_FROM_OVERRIDE[boneId] ?? rig.bones.find((bone) => bone.id === boneId).parent;
}
function lineName(boneId) {
  return axleLabels.lines[boneId] ?? `${pointName(lineFromId(boneId))} → ${pointName(boneId)}`;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Hit-test in the same global/stage space as pointer events (see
// eventToGlobalPoint below) by converting each axle's overlay-local
// position out to that space with the overlay's own current transform.
function hitTestAxle(globalPoint) {
  const dotThreshold = 8;
  for (const bone of rig.bones) {
    const dot = axleOverlay.toGlobal(axleDots.get(bone.id).position);
    if (Math.hypot(dot.x - globalPoint.x, dot.y - globalPoint.y) <= dotThreshold) {
      return { kind: "point", boneId: bone.id };
    }
  }
  const lineThreshold = 5;
  for (const bone of rig.bones) {
    if (!bone.parent || NO_AXLE_LINE.has(bone.id)) continue;
    const from = axleOverlay.toGlobal(axleDots.get(lineFromId(bone.id)).position);
    const to = axleOverlay.toGlobal(axleDots.get(bone.id).position);
    if (distanceToSegment(globalPoint, from, to) <= lineThreshold) {
      return { kind: "line", boneId: bone.id };
    }
  }
  return null;
}

function buildActor() {
  actor?.destroy({ children: true });
  actor = new RigActor({ rig, clips: { idle, run, attack }, art: calibratedArt, textures: rigArt.textures });
  actor.setDisplayHeight(190);
  actor.applyAppearance({ equipment: previewEquipment });

  const reference = new PIXI.Sprite(referenceTexture);
  reference.anchor.set(...REFERENCE_ANCHOR);
  reference.scale.set(REFERENCE_SCALE);
  reference.visible = referenceVisible.checked;
  reference.alpha = Number(referenceOpacity.value) / 100;
  actor.visual.addChildAt(reference, 0);
  actor.reference = reference;

  axleOverlay = new PIXI.Container();
  axleOverlay.visible = axlesVisible.checked;
  boneLines = new PIXI.Graphics();
  axleOverlay.addChild(boneLines);
  axleDots = new Map();
  for (const bone of rig.bones) {
    const dot = new PIXI.Graphics().circle(0, 0, 1.5).fill({ color: 0xff2222 }).stroke({ color: 0xffffff, width: 0.4 });
    axleOverlay.addChild(dot);
    axleDots.set(bone.id, dot);
  }
  actor.visual.addChild(axleOverlay);

  app.stage.addChild(actor);
  layout();
}
app.stage.addChild(ground);

function layout() {
  ground.position.set(app.screen.width / 2, app.screen.height * 0.77);
  actor.position.set(app.screen.width / 2, ground.position.y);
}
buildActor();
app.renderer.on("resize", layout);

function syncAxleOverlay() {
  boneLines.clear();
  const positions = new Map(rig.bones.map((bone) => [bone.id, axleWorldPosition(bone.id)]));
  for (const bone of rig.bones) {
    axleDots.get(bone.id).position.copyFrom(positions.get(bone.id));
    if (bone.parent && !NO_AXLE_LINE.has(bone.id)) {
      const from = positions.get(LINE_FROM_OVERRIDE[bone.id] ?? bone.parent);
      const to = positions.get(bone.id);
      boneLines.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
  }
  boneLines.stroke({ color: 0xff2222, width: 0.6, alpha: 0.85 });
}
axlesVisible.addEventListener("change", () => { axleOverlay.visible = axlesVisible.checked; });

const axleInspector = document.getElementById("axle-inspector");
const axleInspectorLabel = document.getElementById("axle-inspector-label");
const axleRenameInput = document.getElementById("axle-rename-input");
let selectedAxle = null;

function nameOfAxle(hit) {
  return hit.kind === "point" ? pointName(hit.boneId) : lineName(hit.boneId);
}
function showAxleInfo(hit) {
  selectedAxle = hit;
  axleInspector.hidden = false;
  axleInspectorLabel.textContent = `${hit.kind === "point" ? "Point" : "Line"}: ${nameOfAxle(hit)}`;
  axleRenameInput.value = nameOfAxle(hit);
}
document.getElementById("axle-rename-save").addEventListener("click", () => {
  if (!selectedAxle) return;
  const value = axleRenameInput.value.trim();
  if (!value) return;
  if (selectedAxle.kind === "point") axleLabels.points[selectedAxle.boneId] = value;
  else axleLabels.lines[selectedAxle.boneId] = value;
  showAxleInfo(selectedAxle);
});
document.getElementById("export-axle-names").addEventListener("click", () => {
  templateOutput.value = JSON.stringify(axleLabels, null, 2);
  templateOutput.focus();
  templateOutput.select();
});

app.ticker.add((ticker) => {
  if (!dragPoint) actor.update(ticker.deltaMS);
  syncAxleOverlay();
});

for (const button of document.querySelectorAll("[data-clip]")) {
  button.addEventListener("click", () => {
    actor.playOnce(button.dataset.clip);
    document.querySelectorAll("[data-clip]").forEach((entry) => entry.classList.toggle("selected", entry === button));
  });
}

referenceVisible.addEventListener("change", () => {
  actor.reference.visible = referenceVisible.checked;
});
referenceOpacity.addEventListener("input", () => {
  actor.reference.alpha = Number(referenceOpacity.value) / 100;
});

let facingLeft = false;
document.getElementById("facing").addEventListener("click", (event) => {
  facingLeft = !facingLeft;
  actor.faceLeft(facingLeft);
  event.currentTarget.textContent = facingLeft ? "Face right" : "Face left";
});

const slots = document.getElementById("slot-controls");
for (const slotId of Object.keys(rig.slots)) {
  const button = document.createElement("button");
  button.textContent = `Toggle ${slotId}`;
  button.classList.toggle("selected", Boolean(previewEquipment[slotId]));
  button.addEventListener("click", () => {
    previewEquipment[slotId] = previewEquipment[slotId] ? null : "preview";
    actor.applyAppearance({ equipment: previewEquipment });
    button.classList.toggle("selected", Boolean(previewEquipment[slotId]));
  });
  slots.appendChild(button);
}

const targetPicker = document.getElementById("asset-target");
const templateOutput = document.getElementById("template-output");
const activeTarget = document.getElementById("active-target");
const originalArt = structuredClone(rigArt.art);
const originalZIndex = Object.fromEntries(rig.bones.map((bone) => [bone.id, bone.zIndex ?? 0]));
const targets = [
  ...Object.keys(calibratedArt.body).map((boneId) => ({ kind: "body", boneId, label: `Body · ${boneId}` })),
  ...Object.entries(calibratedArt.equipment).flatMap(([slotId, items]) => Object.entries(items).flatMap(([itemId, attachments]) =>
    Object.keys(attachments).map((boneId) => ({ kind: "equipment", slotId, itemId, boneId, label: `Gear · ${slotId} · ${boneId}` })))),
];
for (const [index, target] of targets.entries()) {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = target.label;
  targetPicker.appendChild(option);
}

// Alpha maps for click-to-select: every body piece is a full 1145x1374
// canvas with mostly-transparent padding, so a bounding-box hit test would
// match nearly every piece at once. Sample the actual pixel alpha instead.
const bodyAlphaData = new Map();
await Promise.all(Object.entries(calibratedArt.body).map(async ([boneId, config]) => {
  const img = new Image();
  img.src = `../${config.src}`;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  bodyAlphaData.set(boneId, { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
}));

function alphaAt(boneId, texX, texY) {
  const sheet = bodyAlphaData.get(boneId);
  if (!sheet || texX < 0 || texY < 0 || texX >= sheet.width || texY >= sheet.height) return 0;
  const index = (Math.floor(texY) * sheet.width + Math.floor(texX)) * 4 + 3;
  return sheet.data[index];
}

function hitTestBody(globalPoint) {
  const bodyTargets = targets.filter((t) => t.kind === "body" && bodyAlphaData.has(t.boneId));
  bodyTargets.sort((a, b) => (actor.bones.get(b.boneId).bindPose.zIndex ?? 0) - (actor.bones.get(a.boneId).bindPose.zIndex ?? 0));
  for (const target of bodyTargets) {
    const config = calibratedArt.body[target.boneId];
    const local = actor.bones.get(target.boneId).container.toLocal(globalPoint);
    const afterPosition = { x: local.x - (config.x ?? 0), y: local.y - (config.y ?? 0) };
    const rotation = config.rotation ?? 0;
    const cos = Math.cos(-rotation), sin = Math.sin(-rotation);
    const unrotated = { x: afterPosition.x * cos - afterPosition.y * sin, y: afterPosition.x * sin + afterPosition.y * cos };
    const scale = config.scale ?? 1;
    const unscaled = { x: unrotated.x / scale, y: unrotated.y / scale };
    const [anchorX, anchorY] = config.anchor ?? [0.5, 0.5];
    const sheet = bodyAlphaData.get(target.boneId);
    const texX = unscaled.x + anchorX * sheet.width;
    const texY = unscaled.y + anchorY * sheet.height;
    if (alphaAt(target.boneId, texX, texY) > 10) return target;
  }
  return null;
}

function selectedTarget() {
  return targets[Number(targetPicker.value) || 0];
}

function showSelectedTarget() {
  const target = selectedTarget();
  const zIndex = target.kind === "body" ? actor.bones.get(target.boneId).bindPose.zIndex ?? 0 : null;
  activeTarget.textContent = zIndex == null
    ? `Moving: ${target.label}`
    : `Moving: ${target.label} (layer ${zIndex})`;
}
targetPicker.addEventListener("change", showSelectedTarget);
showSelectedTarget();

function moveSelected(delta) {
  calibratedArt = adjustArtTarget(calibratedArt, selectedTarget(), delta);
  actor.art = calibratedArt;
  actor.syncArtPlacement(selectedTarget(), targetConfig(calibratedArt, selectedTarget()));
}

for (const button of document.querySelectorAll("[data-nudge]")) {
  button.addEventListener("click", () => {
    const [x, y] = button.dataset.nudge.split(",").map(Number);
    moveSelected({ x, y });
  });
}

for (const button of document.querySelectorAll("[data-rotate]")) {
  button.addEventListener("click", () => {
    moveSelected({ rotation: Number(button.dataset.rotate) });
  });
}

document.getElementById("layer-up").addEventListener("click", () => bumpLayer(1));
document.getElementById("layer-down").addEventListener("click", () => bumpLayer(-1));

function bumpLayer(delta) {
  const target = selectedTarget();
  if (target.kind !== "body") return;
  const bindPose = actor.bones.get(target.boneId).bindPose;
  actor.setBoneZIndex(target.boneId, (bindPose.zIndex ?? 0) + delta);
  showSelectedTarget();
}

document.getElementById("reset-target").addEventListener("click", () => {
  const target = selectedTarget();
  const initial = target.kind === "body"
    ? originalArt.body[target.boneId]
    : originalArt.equipment[target.slotId][target.itemId][target.boneId];
  const current = target.kind === "body"
    ? calibratedArt.body[target.boneId]
    : calibratedArt.equipment[target.slotId][target.itemId][target.boneId];
  current.x = initial.x;
  current.y = initial.y;
  current.rotation = initial.rotation;
  if (current.x == null) delete current.x;
  if (current.y == null) delete current.y;
  if (current.rotation == null) delete current.rotation;
  actor.art = calibratedArt;
  actor.syncArtPlacement(target, current);
  if (target.kind === "body") actor.setBoneZIndex(target.boneId, originalZIndex[target.boneId]);
  showSelectedTarget();
});

document.getElementById("export-template").addEventListener("click", () => {
  templateOutput.value = exportArtTemplate(calibratedArt);
  templateOutput.focus();
  templateOutput.select();
});

document.getElementById("export-layers").addEventListener("click", () => {
  const layers = Object.fromEntries([...actor.bones].map(([boneId, entry]) => [boneId, entry.bindPose.zIndex ?? 0]));
  templateOutput.value = JSON.stringify(layers, null, 2);
  templateOutput.focus();
  templateOutput.select();
});

function targetConfig(art, target) {
  return target.kind === "body"
    ? art.body[target.boneId]
    : art.equipment[target.slotId][target.itemId][target.boneId];
}

function eventToGlobalPoint(event) {
  const rect = app.canvas.getBoundingClientRect();
  return new PIXI.Point(
    (event.clientX - rect.left) * app.screen.width / rect.width,
    (event.clientY - rect.top) * app.screen.height / rect.height,
  );
}
function pointerToBoneLocal(event) {
  return actor.bones.get(selectedTarget().boneId).container.toLocal(eventToGlobalPoint(event));
}
stage.addEventListener("pointerdown", (event) => {
  const globalPoint = eventToGlobalPoint(event);
  if (axlesVisible.checked) {
    const axleHit = hitTestAxle(globalPoint);
    if (axleHit) {
      showAxleInfo(axleHit);
      return;
    }
  }
  const hit = hitTestBody(globalPoint);
  if (hit) {
    targetPicker.value = String(targets.indexOf(hit));
    showSelectedTarget();
  }
  dragPoint = pointerToBoneLocal(event);
  dragPointerId = event.pointerId;
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (!dragPoint || event.pointerId !== dragPointerId) return;
  const point = pointerToBoneLocal(event);
  const delta = localPointDelta(dragPoint, point);
  dragPoint = point;
  moveSelected(delta);
});
function endDrag(event) {
  if (event.pointerId !== dragPointerId) return;
  dragPoint = null;
  dragPointerId = null;
}
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
window.addEventListener("pointerup", endDrag);
