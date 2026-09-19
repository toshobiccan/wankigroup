import * as PIXI from "../vendor/pixi.min.mjs";
import { RigActor } from "../src/sprites/rig-actor.js";
import { loadRigArt } from "../src/sprites/load-rig-art.js";
import { ARMOR_PARTS, WORKSHOP_VERSION, STYLE_REFERENCES, buildManifest, generationPrompt, generateDescription, resizeTemplate, validatePart } from "../src/sprites/armor-workshop.js";

const $ = (id) => document.getElementById(id);
const status = (message) => { $("status").textContent = message; };
const canvas = (width, height) => Object.assign(document.createElement("canvas"), { width, height });
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`Could not load ${url}`); return r.json(); };
const loadImage = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not decode image.")); image.src = src; });
const download = (name, blob) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
const blob = (value) => new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
const guard = (fn) => async () => { try { await fn(); } catch (error) { status(error.message); } };
const editor = $("editor"), ctx = editor.getContext("2d");
let project, template, templateSheet, sheet, actor, previewTextures = [];
let facing = false, dragAnchor = null, hasImported = false;
let templateGeneration = 0;
const [rig, mannequin, idle, run3, slash] = await Promise.all([
  json("../data/rigs/humanoid.json"), loadRigArt("../data/rigs/humanoid-art-mannequin.json"),
  json("../data/animations/humanoid/idle.json"), json("../data/animations/humanoid/run3.json"), json("../data/animations/humanoid/slash.json"),
]);
const app = new PIXI.Application();
await app.init({ resizeTo: $("stage"), backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio || 1, autoDensity: true });
$("stage").appendChild(app.canvas);
app.ticker.add((ticker) => { if (actor) { actor.update(ticker.deltaMS); actor.position.set(app.screen.width / 2, app.screen.height * 0.86); } });

function readIdentity() {
  project.id = $("asset-id").value.trim().toLowerCase(); project.name = $("asset-name").value;
  $("asset-id").value = project.id;
  project.prompt = $("prompt").value;
  project.description = $("description").value;
}
function bounds(image, points) {
  const c = canvas(image.width, image.height), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(image, 0, 0); const pixels = g.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (pixels[(y * c.width + x) * 4 + 3] > 10) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX + 1), height: Math.max(1, maxY - minY + 1) };
}
async function makeTemplate() {
  const generation = ++templateGeneration;
  const slot = $("slot").value;
  const nextSheet = canvas(slot === "armor" ? 2048 : 512, slot === "armor" ? 2048 : 512);
  const g = nextSheet.getContext("2d");
  const parts = [];
  if (slot === "armor") {
    const images = await Promise.all(ARMOR_PARTS.map((id) => loadImage(`../${mannequin.art.body[id].src}`)));
    if (generation !== templateGeneration) return;
    ARMOR_PARTS.forEach((bone, index) => {
      const config = mannequin.art.body[bone], image = images[index];
      const pivot = config.pivot ?? [config.anchor[0] * image.width, config.anchor[1] * image.height];
      const b = bounds(image, [pivot, config.distalPivot].filter(Boolean));
      const fit = Math.min(380 / b.width, 380 / b.height);
      const x = (index % 4) * 512, y = Math.floor(index / 4) * 512;
      const ox = 256 - b.width * fit / 2, oy = 256 - b.height * fit / 2;
      g.drawImage(image, b.x, b.y, b.width, b.height, x + ox, y + oy, b.width * fit, b.height * fit);
      const point = ([px, py]) => [(px - b.x) * fit + ox, (py - b.y) * fit + oy];
      parts.push({ bone, crop: { x, y, width: 512, height: 512 }, pivot: point(pivot),
        ...(config.distalPivot ? { distalPivot: point(config.distalPivot) } : {}), scale: (config.scale ?? 1) / fit, mode: "replace" });
    });
  } else {
    // A template guide only: grip is fixed and the blade extends upward.
    g.fillStyle = "#8e9698"; g.beginPath(); g.moveTo(256, 35); g.lineTo(277, 90); g.lineTo(269, 330); g.lineTo(243, 330); g.lineTo(235, 90); g.closePath(); g.fill();
    g.fillStyle = "#665445"; g.fillRect(246, 330, 20, 115); g.fillRect(207, 325, 98, 14);
    parts.push({ bone: "weaponMount", crop: { x: 0, y: 0, width: 512, height: 512 }, pivot: [256, 382], scale: 0.1, mode: "overlay" });
  }
  if (generation !== templateGeneration) return;
  templateSheet = nextSheet;
  template = { schemaVersion: WORKSHOP_VERSION, rigId: rig.id, slot, width: templateSheet.width, height: templateSheet.height, parts };
  project = { ...structuredClone(template), id: $("asset-id").value, name: $("asset-name").value, prompt: $("prompt").value, description: $("description").value };
  sheet = templateSheet; hasImported = false;
  populateParts(); drawPart(); await updatePreview();
  status("Template ready. Export it for Codex, then import the generated sheet. The mannequin is shown as a fitting reference.");
}
function populateParts() {
  $("part").replaceChildren(...project.parts.map((part, i) => new Option(part.bone, i)));
  showFields();
}
const selected = () => project.parts[Number($("part").value) || 0];
function cropped(part) {
  validatePart(part, project.width, project.height);
  const c = canvas(Math.round(part.crop.width), Math.round(part.crop.height));
  c.getContext("2d").drawImage(sheet, part.crop.x, part.crop.y, part.crop.width, part.crop.height, 0, 0, c.width, c.height);
  return c;
}
function showFields() {
  const p = selected(), fields = $("fields"); fields.replaceChildren();
  const add = (label, get, set, step = "0.1") => {
    const wrap = document.createElement("label"); wrap.textContent = label;
    const input = document.createElement("input"); input.type = "number"; input.step = step; input.value = Number(get().toFixed(4));
    input.addEventListener("change", () => { set(Number(input.value)); drawPart(); }); wrap.append(input); fields.append(wrap);
  };
  for (const key of ["x", "y", "width", "height"]) add(`Crop ${key}`, () => p.crop[key], (v) => { p.crop[key] = v; }, "1");
  for (const [key, label] of [["pivot", "Joint"], ["distalPivot", "End"]]) if (p[key]) {
    for (let i = 0; i < 2; i++) add(`${label} ${i ? "Y" : "X"}`, () => p[key][i], (v) => { p[key][i] = v; });
  }
  if (!p.distalPivot) add("Scale", () => p.scale, (v) => { p.scale = v; }, "0.001");
  const label = document.createElement("label"); label.textContent = "Coverage"; const select = document.createElement("select");
  select.append(new Option("Replace body", "replace"), new Option("Overlay body", "overlay")); select.value = p.mode;
  select.onchange = () => { p.mode = select.value; }; label.append(select); fields.append(label);
}
function drawPart() {
  const p = selected(); ctx.clearRect(0, 0, 512, 512);
  if (!p || !sheet) return;
  try {
    const cut = cropped(p); ctx.drawImage(cut, 0, 0, 512, 512);
    for (const [key, color] of [["pivot", "#dc3636"], ["distalPivot", "#217dd6"]]) if (p[key]) {
      const [x, y] = p[key]; ctx.beginPath(); ctx.arc(x / p.crop.width * 512, y / p.crop.height * 512, 8, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
    }
  } catch (error) { status(error.message); }
}
editor.addEventListener("pointerdown", (event) => {
  const rect = editor.getBoundingClientRect(), p = selected();
  const x = (event.clientX - rect.left) / rect.width * p.crop.width, y = (event.clientY - rect.top) / rect.height * p.crop.height;
  dragAnchor = ["pivot", "distalPivot"].filter((key) => p[key]).find((key) => Math.hypot((p[key][0] - x) / p.crop.width, (p[key][1] - y) / p.crop.height) < 0.045);
  if (dragAnchor) editor.setPointerCapture(event.pointerId);
});
editor.addEventListener("pointermove", (event) => {
  if (!dragAnchor) return; const p = selected(), rect = editor.getBoundingClientRect();
  p[dragAnchor] = [Math.max(0, Math.min(p.crop.width, (event.clientX - rect.left) / rect.width * p.crop.width)), Math.max(0, Math.min(p.crop.height, (event.clientY - rect.top) / rect.height * p.crop.height))];
  drawPart(); showFields();
});
editor.addEventListener("pointerup", () => { if (dragAnchor) { dragAnchor = null; guard(updatePreview)(); } });
editor.addEventListener("pointercancel", () => { dragAnchor = null; });
async function updatePreview() {
  readIdentity(); const manifest = buildManifest(project);
  actor?.destroy({ children: true }); for (const texture of previewTextures) texture.destroy(true); previewTextures = [];
  const textures = new Map(mannequin.textures), art = structuredClone(mannequin.art);
  art.equipment = manifest.equipment;
  for (const p of project.parts) { const texture = PIXI.Texture.from(cropped(p)); previewTextures.push(texture); textures.set(manifest.equipment[project.slot][project.id][p.bone].src, texture); }
  actor = new RigActor({ rig, clips: { idle, run3, slash }, art, textures,
    appearance: { equipment: { [project.slot]: $("show-gear").checked && hasImported ? project.id : null } } });
  actor.setDisplayHeight(270); actor.faceLeft(facing); app.stage.addChild(actor);
}
function projectFile() { readIdentity(); buildManifest(project); const c = canvas(project.width, project.height); c.getContext("2d").drawImage(sheet, 0, 0); return { ...project, sheet: c.toDataURL("image/png"), imported: hasImported }; }
async function exportTemplate() {
  readIdentity(); buildManifest(project);
  const zip = new JSZip(); zip.file("mannequin-template.png", templateSheet.toDataURL("image/png").split(",")[1], { base64: true });
  const guide = canvas(template.width, template.height), g = guide.getContext("2d"); g.drawImage(templateSheet, 0, 0);
  for (const p of template.parts) {
    g.font = "bold 20px sans-serif"; g.fillStyle = "#243e39"; g.fillText(p.bone, p.crop.x + 12, p.crop.y + 28);
    for (const [key, color] of [["pivot", "#ff2222"], ["distalPivot", "#2277ff"]]) if (p[key]) { g.fillStyle = color; g.beginPath(); g.arc(p.crop.x + p[key][0], p.crop.y + p[key][1], 6, 0, Math.PI * 2); g.fill(); }
  }
  zip.file("anchor-guide.png", guide.toDataURL("image/png").split(",")[1], { base64: true });
  zip.file("template.json", JSON.stringify(template, null, 2)); zip.file("prompt.txt", generationPrompt({ ...project, ...template }));
  for (const filename of STYLE_REFERENCES) {
    const directory = filename === "head-template-approved.png" ? "character" : "art-reference";
    const response = await fetch(`../assets/${directory}/${filename}`);
    if (!response.ok) throw new Error(`Missing style reference: ${filename}. Template export stopped.`);
    zip.file(filename, await response.blob());
  }
  download(`${project.id}-template.zip`, await zip.generateAsync({ type: "blob" })); status(`Template pack exported. Attach prompt.txt, mannequin-template.png and ${STYLE_REFERENCES.join(", ")} in Codex. Keep anchor-guide.png as your fitting reference.`);
}
async function exportPackage() {
  if (!hasImported) throw new Error("Import a generated sheet or use the mannequin test first.");
  readIdentity(); const manifest = buildManifest(project), zip = new JSZip();
  for (const p of project.parts) zip.file(`assets/equipment/${project.id}/${p.bone}.png`, cropped(p).toDataURL("image/png").split(",")[1], { base64: true });
  zip.file(`data/equipment/${project.id}.json`, JSON.stringify(manifest, null, 2));
  zip.file("workshop-project.json", JSON.stringify(projectFile()));
  zip.file("README.txt", `Cardslayer equipment: ${project.name}\nExtract this ZIP into a temporary folder. Copy assets/ and data/ into the game project. Add "data/equipment/${project.id}.json" to the packages array in data/equipment/catalog.json. This registers the artwork; the item definition is in that file for inventory/reward authoring. Reopen workshop-project.json in Armor Workshop to revise it.\nAnchors are PNG-local pixels. Do not resize PNGs without updating anchors and scale. Two-anchor limbs follow the skeleton at both ends.\n`);
  download(`${project.id}-equipment.zip`, await zip.generateAsync({ type: "blob" })); status("Equipment package exported. Your PNGs, anchors, item definition and editable project are included.");
}
$("template-export").onclick = guard(exportTemplate);
$("description-generate").onclick = () => {
  $("description").value = generateDescription({ name: $("asset-name").value, prompt: $("prompt").value, slot: $("slot").value });
  status("Description generated locally. Edit it if you like; it will be included when you save or export.");
};
$("package-export").onclick = guard(exportPackage);
$("project-export").onclick = guard(() => download(`${project.id}-project.json`, blob(projectFile())));
$("preview-update").onclick = guard(updatePreview);
$("part").onchange = () => { showFields(); drawPart(); };
$("slot").onchange = guard(makeTemplate);
$("show-gear").onchange = guard(updatePreview);
$("demo").onclick = guard(async () => { sheet = templateSheet; project = { ...project, ...structuredClone(template) }; hasImported = true; populateParts(); drawPart(); await updatePreview(); status("Mannequin test loaded. Use this to test anchors, animation and ZIP export; this is not generated armor."); });
$("reset-part").onclick = guard(async () => { const index = Number($("part").value); project.parts[index] = structuredClone(resizeTemplate(template, project.width, project.height).parts[index]); showFields(); drawPart(); await updatePreview(); });
$("sheet-file").onchange = guard(async () => {
  const file = $("sheet-file").files[0]; if (!file) return;
  if (file.size > 32 * 1024 * 1024) throw new Error("Use a sheet smaller than 32 MB.");
  const url = URL.createObjectURL(file); let image;
  try { image = await loadImage(url); } finally { URL.revokeObjectURL(url); }
  if (image.width > 4096 || image.height > 4096) throw new Error("Maximum sheet size is 4096 × 4096.");
  const next = resizeTemplate(template, image.width, image.height);
  project = { ...project, ...next }; sheet = image; hasImported = true; populateParts(); drawPart(); await updatePreview(); status("Sheet imported. Review each crop and anchor, then test all three animations before export.");
});
$("project-file").onchange = guard(async () => {
  const file = $("project-file").files[0]; if (!file) return;
  if (file.size > 48 * 1024 * 1024) throw new Error("Project is too large (48 MB maximum).");
  const saved = JSON.parse(await file.text());
  await restoreProject(saved);
});
async function restoreProject(saved) {
  if (saved.schemaVersion !== WORKSHOP_VERSION || !/^data:image\/png;base64,/.test(saved.sheet ?? "")) throw new Error("Not a supported Workshop project.");
  buildManifest(saved); if (saved.width > 4096 || saved.height > 4096) throw new Error("Project sheet is too large.");
  const image = await loadImage(saved.sheet); if (image.width !== saved.width || image.height !== saved.height) throw new Error("Project image and metadata dimensions disagree.");
  $("asset-id").value = saved.id; $("asset-name").value = saved.name; $("prompt").value = saved.prompt ?? "";
  $("description").value = saved.description ?? "";
  $("slot").value = saved.slot; await makeTemplate(); project = saved; sheet = image; hasImported = Boolean(saved.imported);
  populateParts(); drawPart(); await updatePreview(); status("Editable project restored.");
}
$("remove-bg").onclick = guard(async () => {
  if (!hasImported) throw new Error("Import a sheet first.");
  const c = canvas(project.width, project.height), g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(sheet, 0, 0);
  const pixels = g.getImageData(0, 0, c.width, c.height), color = $("key-color").value.match(/[a-f0-9]{2}/gi).map((v) => parseInt(v, 16));
  const tolerance = Math.max(0, Math.min(100, Number($("key-tolerance").value)));
  for (let i = 0; i < pixels.data.length; i += 4) if (color.every((v, j) => Math.abs(v - pixels.data[i + j]) <= tolerance)) pixels.data[i + 3] = 0;
  g.putImageData(pixels, 0, 0); sheet = c; drawPart(); await updatePreview(); status("Background color removed. Reimport the original sheet to undo.");
});
for (const button of document.querySelectorAll("[data-clip]")) button.onclick = () => {
  if (button.dataset.clip === "slash") actor.playOnce("slash", { transitionMs: 100, returnTransitionMs: 160 });
  else actor.play(button.dataset.clip, { transitionMs: 180 });
};
$("face").onclick = () => { facing = !facing; actor.faceLeft(facing); $("face").textContent = facing ? "Face right" : "Face left"; };
await makeTemplate();

// Codex generates images outside the browser; the local queue bridges the files.
let pendingJob = localStorage.getItem("armor-workshop-pending-job"), checkingJob = false;
const jobStatus = (message) => { $("codex-status").textContent = message; };
function localProject(action, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("cardslayer-armor-workshop", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("projects", action === "save" ? "readwrite" : "readonly");
      const store = tx.objectStore("projects");
      const op = action === "save" ? store.put(value, "current") : store.get("current");
      tx.oncomplete = () => { db.close(); resolve(op.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("Browser save failed.")); };
    };
  });
}
function requireQueueIdle() {
  if (checkingJob || $("codex-prepare").disabled) throw new Error("Wait a moment for the current request to finish, then try again.");
}
function stopWaiting() {
  pendingJob = null; localStorage.removeItem("armor-workshop-pending-job"); jobStatus("");
}
$("save-local").onclick = guard(async () => {
  requireQueueIdle();
  if (!hasImported) throw new Error("Generate or import an armor sheet before saving an item.");
  const saved = projectFile(), images = {};
  const saveButton = $("save-local");
  saveButton.disabled = true; saveButton.textContent = "Saving…";
  status("Saving item and artwork to the game…");
  try {
  for (const part of project.parts) images[part.bone] = cropped(part).toDataURL("image/png");
  const response = await fetch("/dev-api/armor/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, images }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error);
  try { await localProject("save", saved); } catch { status(`Installed “${result.item.name}”. Browser project backup failed; download a project backup instead.`); return; }
  status(`Installed “${result.item.name}” as an equippable item. Reload the local game and open Inventory → Equip. Project backup also saved.`);
  } finally { saveButton.disabled = false; saveButton.textContent = "Save item to game"; }
});
$("load-local").onclick = guard(async () => {
  requireQueueIdle();
  const saved = await localProject("load");
  if (!saved) throw new Error("No project saved in this browser yet.");
  requireQueueIdle(); stopWaiting(); await restoreProject(saved);
});
$("clear-workshop").onclick = guard(async () => {
  requireQueueIdle(); stopWaiting();
  $("slot").value = "armor"; $("asset-id").value = "new-armor"; $("asset-name").value = "New Armor";
  $("prompt").value = ""; $("description").value = "";
  $("sheet-file").value = ""; $("project-file").value = "";
  facing = false; $("face").textContent = "Face left"; $("show-gear").checked = true;
  await makeTemplate(); status("Cleared. Enter a new design and click Prepare for Codex. Your browser save is unchanged.");
});
$("codex-prepare").onclick = guard(async () => {
  if (checkingJob) { jobStatus("Checking the current result. Try preparing again in a moment."); return; }
  $("codex-prepare").disabled = true;
  try {
  readIdentity();
  const requestProject = { ...project, ...structuredClone(template) };
  buildManifest(requestProject);
  const response = await fetch("/dev-api/armor/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: requestProject, templatePng: templateSheet.toDataURL("image/png") }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error);
  pendingJob = result.id; localStorage.setItem("armor-workshop-pending-job", pendingJob);
  jobStatus(`Ready for Codex. Say “generate the queued armor.” Request: ${pendingJob}. Waiting for the generated image…`);
  } finally { $("codex-prepare").disabled = false; }
});
async function checkCodexResult() {
  if (!pendingJob || checkingJob || $("codex-prepare").disabled) return;
  checkingJob = true; const id = pendingJob;
  try {
    const response = await fetch(`/dev-api/armor/jobs/${id}`);
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    if (id !== pendingJob) return;
    if (result.state !== "ready") { jobStatus(`Waiting for Codex. Say “generate the queued armor.” Request: ${id}`); return; }
    const image = await loadImage(result.sheet);
    if (image.width > 4096 || image.height > 4096) throw new Error("Generated sheet exceeds 4096 pixels.");
    const next = resizeTemplate(result.project, image.width, image.height);
    if (id !== pendingJob) return;
    for (const [field, key] of [["asset-id", "id"], ["asset-name", "name"], ["description", "description"], ["prompt", "prompt"]]) $(field).value = result.project[key] ?? "";
    $("slot").value = result.project.slot;
    await makeTemplate();
    if (id !== pendingJob) return;
    project = next; sheet = image; hasImported = true;
    populateParts(); drawPart(); await updatePreview();
    pendingJob = null; localStorage.removeItem("armor-workshop-pending-job");
    jobStatus("Generated armor loaded automatically. Check Idle, Run 3 and Slash, then save your fitted project.");
  } catch (error) { jobStatus(`Could not load the Codex result: ${error.message}. Retrying automatically.`); }
  finally { checkingJob = false; }
}
setInterval(checkCodexResult, 5000);
checkCodexResult();
