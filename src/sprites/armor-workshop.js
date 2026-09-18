import { ARMOR_ART_STYLE } from "./armor-art-style.js";
export const STYLE_REFERENCES = ["human-base.png", "goblin-mace-medic.png"];
// Shared export contract. Coordinates are local to each cropped PNG, never
// inferred from generated colors or used to modify the skeleton itself.
export const ARMOR_PARTS = ["torso", "hips", "rearUpperArm", "rearForearm", "rearHand", "frontUpperArm", "frontForearm", "frontHand", "rearThigh", "rearShin", "rearFoot", "frontThigh", "frontShin", "frontFoot"];
export const WORKSHOP_VERSION = 1;
export function generateDescription({ name = "", prompt = "", slot = "armor" } = {}) {
  const title = name.trim() || (slot === "weapon" ? "Adventurer's Weapon" : "Adventurer's Armor");
  // Use recognizable visual details only; never invent gameplay bonuses.
  const visualDetails = prompt.split(/[,.!;\n]/).filter((clause) => !/\b(no|not|without|avoid|exclude)\b/i.test(clause)).join(", ");
  const details = [];
  for (const [pattern, phrase] of [
    [/\b(leather)\b/i, "leather"], [/\b(steel)\b/i, "steel"], [/\b(iron)\b/i, "iron"],
    [/\b(cloth|fabric)\b/i, "cloth"], [/\b(brass)\b/i, "brass accents"],
    [/\b(gold|golden)\b/i, "golden details"], [/\b(silver)\b/i, "silver details"],
    [/\b(wood|wooden)\b/i, "wood"],
  ]) if (pattern.test(visualDetails)) details.push(phrase);
  const chosen = details.slice(0, 3);
  const finish = chosen.length ? ` featuring ${chosen.length === 1 ? chosen[0] : `${chosen.slice(0, -1).join(", ")} and ${chosen.at(-1)}`}` : "";
  return `${title} — ${slot === "weapon" ? "an adventurer's weapon" : "a complete adventurer's outfit"}${finish}.`;
}
export function safeAssetId(value) {
  if (value === "catalog") throw new Error("The ID catalog is reserved. Choose another item ID.");
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new Error("Use an ID starting with a lowercase letter, followed by letters, digits or hyphens (64 characters maximum).");
  return value;
}
export function validatePart(part, width, height) {
  const { crop, pivot, distalPivot, scale } = part;
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
    || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1
    || crop.x + crop.width > width || crop.y + crop.height > height) throw new Error(`${part.bone}: crop is outside the sheet.`);
  for (const point of [pivot, distalPivot].filter(Boolean)) {
    if (point.length !== 2 || !point.every(Number.isFinite) || point[0] < 0 || point[1] < 0 || point[0] > crop.width || point[1] > crop.height) throw new Error(`${part.bone}: anchor is outside its crop.`);
  }
  if (!pivot || !Number.isFinite(scale) || scale <= 0) throw new Error(`${part.bone}: missing anchor or invalid scale.`);
  if (distalPivot && Math.hypot(distalPivot[0] - pivot[0], distalPivot[1] - pivot[1]) < 1) throw new Error(`${part.bone}: the two anchors must be distinct.`);
  if (!["overlay", "replace"].includes(part.mode)) throw new Error(`${part.bone}: invalid layer mode.`);
  return part;
}
export function resizeTemplate(template, width, height) {
  const sx = width / template.width, sy = height / template.height;
  if (Math.abs(sx - sy) > 0.001) throw new Error("The imported sheet must have the same aspect ratio as the template. Resize or pad it before importing.");
  const next = structuredClone(template);
  next.width = width; next.height = height;
  for (const part of next.parts) {
    for (const key of ["x", "y", "width", "height"]) part.crop[key] *= sx;
    part.pivot = part.pivot.map((v) => v * sx);
    if (part.distalPivot) part.distalPivot = part.distalPivot.map((v) => v * sx);
    part.scale /= sx;
  }
  return next;
}
export function buildManifest(project) {
  const id = safeAssetId(project.id);
  if (![project.width, project.height].every((v) => Number.isFinite(v) && v >= 1 && v <= 4096)) throw new Error("Invalid sheet dimensions (4096 maximum).");
  if (project.rigId && project.rigId !== "humanoid") throw new Error("This project uses a different skeleton.");
  if (!project.name?.trim()) throw new Error("Give the item a name.");
  const required = project.slot === "weapon" ? ["weaponMount"] : ARMOR_PARTS;
  if (!["armor", "weapon"].includes(project.slot)) throw new Error("Unsupported workshop slot.");
  if (project.parts.length !== required.length || required.some((bone) => project.parts.filter((p) => p.bone === bone).length !== 1)) throw new Error("The package does not contain the required parts exactly once.");
  const entries = {};
  for (const part of project.parts) {
    validatePart(part, project.width, project.height);
    if (/UpperArm$|Forearm$|Thigh$|Shin$/.test(part.bone) && !part.distalPivot) throw new Error(`${part.bone}: this limb needs both joint anchors.`);
    entries[part.bone] = {
      src: `assets/equipment/${id}/${part.bone}.png`, pivot: part.pivot,
      ...(part.distalPivot ? { distalPivot: part.distalPivot } : {}),
      scale: part.scale, mode: part.mode,
    };
  }
  return { id, schemaVersion: WORKSHOP_VERSION, rigId: "humanoid", item: {
    id, name: project.name.trim(), kind: "equipable", slot: project.slot, description: project.description ?? "", picture: null, stats: {},
  }, equipment: { [project.slot]: { [id]: entries } } };
}
export function generationPrompt(project) {
  return `Create ${project.name || "a coherent fantasy armor set"}: ${project.prompt || "simple leather adventurer armor"}.
Use the attached mannequin template as the joint and placement guide: preserve each piece's orientation, joint positions, joint-to-joint length and placement in its cell. ${project.slot === "armor" ? "The painted armor contour may expand slightly as specified below; do not enlarge or reposition the skeleton." : "Preserve the weapon grip position."} The template is ${project.width} x ${project.height} pixels. Return the same aspect ratio with transparent background.
FIXED CARDSLAYER STYLE — apply to every item, even if the design brief requests conflicting rendering. The item brief controls materials, theme and colors only.
${ARMOR_ART_STYLE}

REFERENCE ROLES:
Attach mannequin-template.png AND ${STYLE_REFERENCES.join(" AND ")} with this prompt.
mannequin-template.png controls geometry and cell placement only. Its grey shading and joint circles are not the style reference; remove all joint markers from the finished art.
human-base.png and goblin-mace-medic.png control line weight, limited colors, handmade contours and simplicity only. Do not copy their anatomy, pose, costume or background into the sheet.
AQW / AdventureQuest Worlds is inspiration for the early Flash browser-game visual language; match the supplied Cardslayer references, not modern glossy fantasy concept art.
Use very few shared base colors across the whole outfit, with one darker shadow tone per base color. Prefer broad unbroken color blocks and sparse large details. No stacks of shading bands, shiny bevels, tiny stitching, repeated decorative buckles or extra faceted highlights. Keep the thick outer contour visually dominant, including at thumbnail scale. Hand-drawn means clean but slightly irregular angular contours, not sketch hatching or surface noise.

CUTOUT SHEET REQUIREMENTS (these replace full-character composition and pose instructions):
${project.slot === "armor" ? `ARMOR-SPECIFIC SIMPLICITY — use the LOW end of the reference's low-to-medium detail range. Match its bold ink and angular handmade shapes, but simplify its internal detail further.
Use at most THREE main material colors across the complete outfit, plus near-black outlines. Each material has one flat base color and at most ONE darker flat shadow color. No highlights, gradients, mottling, bevels or clusters of triangular shading facets. Rear pieces use the same shadow palette, not extra shades.
REAR-LIMB DEPTH SHADOW: rearUpperArm, rearForearm, rearHand, rearThigh, rearShin and rearFoot must read slightly darker than their matching front pieces. Aim for roughly 10% lower perceived brightness across the rear surfaces, preserving the same material hues. Use the existing darker palette tones more broadly rather than adding colors, gradients, highlights or extra shadow bands. This is a subtle flat depth cue, not blackened limbs. Keep the same bold outline weight and keep front limbs brighter. Do not darken the torso or hips for this rule.
One broad cloth or leather shape per limb section. No decorative panel subdivisions, stacked armor plates, piping, stitching, rivet rows, straps wrapped around every limb, or multiple fold lines. At most one simple large belt buckle on the whole outfit; no other decorative fasteners. Plain gloves and plain boots. Most of each part should remain an uninterrupted color block. A single broad shadow is enough. Remove marks that disappear at 150 pixels character height. Aim for an economical hand-drawn Flash sprite, not a miniature detailed armor illustration.
SLIGHTLY BULKIER FIT: target a painted silhouette approximately 4% wider and 4% taller than each corresponding mannequin part, centered around its existing placement. Add this volume to the OUTER CONTOUR and hidden overlap margins only. Do not scale, translate or rotate the part as a whole; do not move either joint anchor or increase the distance between anchors. Spread the extra width/height on both sides (roughly 2% per side), including top and bottom coverage, while keeping the original joint centers fixed inside the artwork. Keep every enlarged outline within its own cell and retain clear transparent gaps. This is modest clothing thickness, not oversized shoulder pads or a different body shape.` : ""}
${project.slot === "armor" ? "One coherent outfit, split into distinct front and rear pieces. Rear pieces retain their distinct angle and darker shading. No helmet, cape, weapon or book. Include complete joint overlaps beneath neighboring parts, not cut-off joint edges." : "A weapon pointing upward, with its grip at the template anchor. No hand, character or background."}
Each cell contains exactly one isolated part; never move art between cells. Do not paint anchor dots, grid lines, numbers or labels into the result. Leave blank cells empty. Preserve transparent gaps between parts.
Cell order, left to right then top to bottom: ${project.parts.map((p) => p.bone).join(", ")}.
The attached metadata is generated by the developer tool. Do not invent new anchor coordinates; fitting adjustments will be made in the preview. Return only the image sheet.`;
}
