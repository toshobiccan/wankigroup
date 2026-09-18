import * as PIXI from "../vendor/pixi.min.mjs";
import { loadRigArt } from "../src/sprites/load-rig-art.js";
import { adjustArtTarget, exportArtTemplate, localPointDelta } from "../src/sprites/rig-calibration.js";
import { RigActor } from "../src/sprites/rig-actor.js";

const stage = document.getElementById("stage");
const [rig, idle, run, attack, rigArt, referenceTexture] = await Promise.all([
  fetch("../data/rigs/humanoid-aqw-bind-preview.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/idle.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/run.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/attack.json").then((response) => response.json()),
  loadRigArt("../data/rigs/humanoid-art-mannequin.json"),
  PIXI.Assets.load("../assets/rigs/mannequin/mannequin-reference.png"),
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
app.ticker.add((ticker) => {
  if (!dragPoint) actor.update(ticker.deltaMS);
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
  const hit = hitTestBody(eventToGlobalPoint(event));
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
