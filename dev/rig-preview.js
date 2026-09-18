import * as PIXI from "../vendor/pixi.min.mjs";
import { loadRigArt } from "../src/sprites/load-rig-art.js";
import { adjustArtTarget, exportArtTemplate, localPointDelta } from "../src/sprites/rig-calibration.js";
import { RigActor } from "../src/sprites/rig-actor.js";

const stage = document.getElementById("stage");
const [rig, idle, run, attack, rigArt] = await Promise.all([
  fetch("../data/rigs/humanoid-aqw-bind-preview.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/idle.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/run.json").then((response) => response.json()),
  fetch("../data/animations/humanoid/attack.json").then((response) => response.json()),
  loadRigArt("../data/rigs/humanoid-art-mannequin.json"),
]);

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

function buildActor() {
  actor?.destroy({ children: true });
  actor = new RigActor({ rig, clips: { idle, run, attack }, art: calibratedArt, textures: rigArt.textures });
  actor.setDisplayHeight(190);
  actor.applyAppearance({ equipment: previewEquipment });
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

function selectedTarget() {
  return targets[Number(targetPicker.value) || 0];
}

function showSelectedTarget() {
  activeTarget.textContent = `Moving: ${selectedTarget().label}`;
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
  if (current.x == null) delete current.x;
  if (current.y == null) delete current.y;
  actor.art = calibratedArt;
  actor.syncArtPlacement(target, current);
});

document.getElementById("export-template").addEventListener("click", () => {
  templateOutput.value = exportArtTemplate(calibratedArt);
  templateOutput.focus();
  templateOutput.select();
});

function targetConfig(art, target) {
  return target.kind === "body"
    ? art.body[target.boneId]
    : art.equipment[target.slotId][target.itemId][target.boneId];
}

function pointerToBoneLocal(event) {
  const rect = app.canvas.getBoundingClientRect();
  const global = new PIXI.Point(
    (event.clientX - rect.left) * app.screen.width / rect.width,
    (event.clientY - rect.top) * app.screen.height / rect.height,
  );
  return actor.bones.get(selectedTarget().boneId).container.toLocal(global);
}
stage.addEventListener("pointerdown", (event) => {
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
