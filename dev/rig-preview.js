import * as PIXI from "../vendor/pixi.min.mjs";
import { lineName as sharedLineName, pointName as sharedPointName } from "../src/sprites/axle-labels.js";
import { loadRigArt } from "../src/sprites/load-rig-art.js";
import { exportArtTemplate, localPointDelta, translateBone } from "../src/sprites/rig-calibration.js";
import { RigActor } from "../src/sprites/rig-actor.js";

const stage = document.getElementById("stage");
const [rig, idle, run, rigArt, referenceTexture, axleLabels] = await Promise.all([
  fetch("../data/rigs/humanoid-aqw-bind-preview.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/idle.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/run.json").then((response) => response.json()),
  loadRigArt("../data/rigs/humanoid-art-mannequin.json"),
  PIXI.Assets.load("../assets/rigs/mannequin/mannequin-reference.png"),
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
// Keep the bind pose readable. Individual gear mounts remain available through the toggles.
const previewEquipment = Object.fromEntries(Object.keys(rig.slots).map((slotId) => [slotId, null]));

const referenceVisible = document.getElementById("reference-visible");
const referenceOpacity = document.getElementById("reference-opacity");
const axlesVisible = document.getElementById("axles-visible");

// The red overlay is the authoritative skeleton. PNG cutouts are anchored
// to these bone origins and follow them; image pixels never define motion.
// Face decorations are rigidly attached to the head and have no independent
// axle line.
const NO_AXLE_LINE = new Set(["hair", "eyes", "nose"]);
let axleOverlay;
let axleDots;
let boneLines;
let glowDot;
let glowLine;
let nameLabel;
let selectedAxle = null;
let glowElapsedMs = 0;
let dragPoint = null;
let dragPointerId = null;
const originalBonePositions = Object.fromEntries(rig.bones.map((bone) => [bone.id, { x: bone.x ?? 0, y: bone.y ?? 0 }]));

function axleWorldPosition(boneId) {
  return actor.bones.get(boneId).wrapper.position;
}

// Display names for every axle point and line come from the shared
// src/sprites/axle-labels.js module -- the SAME functions any future
// animation-authoring code must use, so what's on screen here can never
// drift from what the rest of the codebase calls a given bone. Renaming
// is always safe: this reads from mannequin-axle-labels.json, never the
// frozen position data.
function pointName(boneId) {
  return sharedPointName(axleLabels, boneId);
}
function lineFromId(boneId) {
  return rig.bones.find((bone) => bone.id === boneId).parent;
}
function lineName(boneId) {
  return sharedLineName(axleLabels, boneId, lineFromId(boneId));
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
  actor = new RigActor({ rig, clips: { idle, run }, art: calibratedArt, textures: rigArt.textures });
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
  // Selection glow -- soft blurred halo behind whichever point/line is
  // currently selected, pulsing so "glow" reads as alive, not just highlighted.
  glowDot = new PIXI.Graphics().circle(0, 0, 3).fill({ color: 0xfff2a8 });
  glowDot.filters = [new PIXI.BlurFilter({ strength: 4 })];
  glowDot.visible = false;
  axleOverlay.addChild(glowDot);
  glowLine = new PIXI.Graphics();
  glowLine.filters = [new PIXI.BlurFilter({ strength: 5 })];
  glowLine.visible = false;
  axleOverlay.addChild(glowLine);
  actor.visual.addChild(axleOverlay);

  // The name label sits directly on app.stage, as a sibling of the actor
  // rather than a child of it -- actor.scale.x flips negative when facing
  // left (see faceLeft), which would mirror the TEXT into unreadable
  // backwards glyphs if it lived inside actor.visual like the dots/lines do.
  nameLabel = new PIXI.Text({
    text: "",
    style: { fontSize: 13, fontWeight: "700", fill: 0xfff2a8, stroke: { color: 0x2a1842, width: 3 } },
  });
  nameLabel.anchor.set(0.5, 1);
  nameLabel.visible = false;
  app.stage.addChild(actor);
  app.stage.addChild(nameLabel);
  layout();
}
app.stage.addChild(ground);

function layout() {
  ground.position.set(app.screen.width / 2, app.screen.height * 0.77);
  actor.position.set(app.screen.width / 2, ground.position.y);
}
buildActor();
window.__debug = { app, actor: () => actor };
app.renderer.on("resize", layout);

function syncAxleOverlay(deltaMs) {
  boneLines.clear();
  const positions = new Map(rig.bones.map((bone) => [bone.id, axleWorldPosition(bone.id)]));
  for (const bone of rig.bones) {
    axleDots.get(bone.id).position.copyFrom(positions.get(bone.id));
    if (bone.parent && !NO_AXLE_LINE.has(bone.id)) {
      const from = positions.get(bone.parent);
      const to = positions.get(bone.id);
      boneLines.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
  }
  boneLines.stroke({ color: 0xff2222, width: 0.6, alpha: 0.85 });

  glowDot.visible = false;
  glowLine.visible = false;
  nameLabel.visible = false;
  if (selectedAxle && axlesVisible.checked) {
    glowElapsedMs += deltaMs ?? 0;
    const pulse = 1 + 0.25 * Math.sin(glowElapsedMs / 220);
    if (selectedAxle.kind === "point") {
      glowDot.visible = true;
      glowDot.position.copyFrom(positions.get(selectedAxle.boneId));
      glowDot.scale.set(pulse);
    } else {
      glowLine.visible = true;
      glowLine.clear();
      const from = positions.get(lineFromId(selectedAxle.boneId));
      const to = positions.get(selectedAxle.boneId);
      glowLine.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xfff2a8, width: 2 + pulse, alpha: 0.9 });
    }
    // The label lives on app.stage (see buildActor), not inside the mirrorable
    // actor, so it must be positioned in stage space via getBounds() rather
    // than the overlay-local coordinates used for the dots/lines above.
    const bounds = actor.getBounds();
    nameLabel.visible = true;
    nameLabel.text = nameOfAxle(selectedAxle);
    nameLabel.position.set(bounds.x + bounds.width / 2, bounds.y - 6);
  }
}
axlesVisible.addEventListener("change", () => { axleOverlay.visible = axlesVisible.checked; });

const axleInspector = document.getElementById("axle-inspector");
const axleInspectorLabel = document.getElementById("axle-inspector-label");
const axleRenameInput = document.getElementById("axle-rename-input");

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
  else actor.syncRenderWrappers();
  syncAxleOverlay(ticker.deltaMS);
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
const rearUpperArmIndex = targets.findIndex((target) => target.kind === "body" && target.boneId === "rearUpperArm");
if (rearUpperArmIndex >= 0) targetPicker.value = String(rearUpperArmIndex);

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
    const sprite = actor.bodyVisuals.get(target.boneId);
    if (!sprite) continue;
    const local = sprite.toLocal(globalPoint);
    const sheet = bodyAlphaData.get(target.boneId);
    const texX = local.x + sprite.anchor.x * sheet.width;
    const texY = local.y + sprite.anchor.y * sheet.height;
    if (alphaAt(target.boneId, texX, texY) > 10) return target;
  }
  return null;
}

function selectedTarget() {
  return targets[Number(targetPicker.value) || 0];
}

function showSelectedTarget() {
  const target = selectedTarget();
  const bindPose = target.kind === "body" ? actor.bones.get(target.boneId).bindPose : null;
  const zIndex = bindPose?.zIndex ?? null;
  activeTarget.textContent = zIndex == null
    ? `Selected: ${target.label}`
    : `Selected: ${target.label} · joint (${bindPose.x.toFixed(1)}, ${bindPose.y.toFixed(1)}) · layer ${zIndex}`;
}
targetPicker.addEventListener("change", showSelectedTarget);
showSelectedTarget();

document.getElementById("layer-up").addEventListener("click", () => bumpLayer(1));
document.getElementById("layer-down").addEventListener("click", () => bumpLayer(-1));

function bumpLayer(delta) {
  const target = selectedTarget();
  if (target.kind !== "body") return;
  const bindPose = actor.bones.get(target.boneId).bindPose;
  actor.setBoneZIndex(target.boneId, (bindPose.zIndex ?? 0) + delta);
  showSelectedTarget();
}

function setBonePosition(boneId, position) {
  const entry = actor.bones.get(boneId);
  entry.bindPose.x = position.x;
  entry.bindPose.y = position.y;
  entry.container.position.set(position.x, position.y);
  actor.syncRenderWrappers();
  showSelectedTarget();
}

function translateSelectedBone(delta) {
  const target = selectedTarget();
  if (target.kind !== "body") return;
  const entry = actor.bones.get(target.boneId);
  setBonePosition(target.boneId, translateBone(entry.bindPose, delta));
}

document.getElementById("reset-bone-position").addEventListener("click", () => {
  const target = selectedTarget();
  if (target.kind !== "body") return;
  setBonePosition(target.boneId, originalBonePositions[target.boneId]);
});

document.getElementById("export-skeleton-template").addEventListener("click", () => {
  templateOutput.value = JSON.stringify(actor.rig, null, 2);
  templateOutput.focus();
  templateOutput.select();
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

function eventToGlobalPoint(event) {
  const rect = app.canvas.getBoundingClientRect();
  return new PIXI.Point(
    (event.clientX - rect.left) * app.screen.width / rect.width,
    (event.clientY - rect.top) * app.screen.height / rect.height,
  );
}

function pointerToBoneParent(event, boneId) {
  const entry = actor.bones.get(boneId);
  const parentId = entry.bindPose.parent;
  const parentContainer = parentId ? actor.bones.get(parentId).container : actor.visual;
  return parentContainer.toLocal(eventToGlobalPoint(event));
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
    dragPointerId = event.pointerId;
    dragPoint = pointerToBoneParent(event, hit.boneId);
    stage.setPointerCapture(event.pointerId);
  }
});

stage.addEventListener("pointermove", (event) => {
  if (dragPoint == null || event.pointerId !== dragPointerId) return;
  const target = selectedTarget();
  if (target.kind !== "body") return;
  const nextPoint = pointerToBoneParent(event, target.boneId);
  translateSelectedBone(localPointDelta(dragPoint, nextPoint));
  dragPoint = nextPoint;
});

function finishDrag(event) {
  if (event.pointerId !== dragPointerId) return;
  dragPoint = null;
  dragPointerId = null;
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
}
stage.addEventListener("pointerup", finishDrag);
stage.addEventListener("pointercancel", finishDrag);
