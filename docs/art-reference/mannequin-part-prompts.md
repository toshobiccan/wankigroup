CURRENT STYLE: use shared-art-style.md for shading, detail and gradient rules; it supersedes older style wording below. Preserve geometry and attachment requirements.

# Mannequin Body-Part Segmentation Prompts

Purpose: replace the placeholder colored shapes in `dev/rig-preview.html` with real cutouts of the actual `mannequin.png` reference — same grey mannequin, same exact pose, same exact pixel scale, just sliced into per-bone layers. This is **not** the final Cardslayer-style art pass (that's `rig-asset-prompts.md`, a separate, later step, still using this same rig once it's validated). This pass exists only to prove the rig's joints and gap-free stacking against real pixels instead of rough geometric guesses.

**This is a segmentation task, not a generation task.** Every output must be pixel-identical to the corresponding region of `mannequin.png` — same linework, same grey shading, same exact scale and position. Nothing is redrawn, restyled, recolored, or resized, except the deliberate joint-overlap extension described below.

**Output location:** save every piece to `assets/rigs/mannequin/<part-name>.png`. Not `docs/art-reference/` — that folder is deliberately blocked from the dev server (confirmed: fetching a `docs/` path 404s), so anything meant to actually load in `dev/rig-preview.html` has to live under `assets/`, matching where `assets/rigs/starter-v1/` already lives.

## The shared contract

Attach `mannequin.png` as the one and only reference for every part below. Append this to every prompt:

> CARDSLAYER MANNEQUIN SEGMENTATION CONTRACT: This is a segmentation and isolation task on the exact supplied mannequin image, not new art generation. Do not redraw, restyle, recolor, resize, re-pose, or redesign any part of the mannequin — reproduce its existing linework and grey cel-shading exactly as they already appear. Output canvas is exactly 1145 × 1374 pixels, identical to the source image's own dimensions — do not crop, trim, resize, or recenter the canvas. Place the named part at the exact same pixel position and pixel scale it already occupies in the source image. Every other pixel on the canvas is fully transparent. Do not draw the joint markers (the small circles) — remove them from the isolated part; they exist in the source only to mark pivot points, not as part of the character. Extend the part's silhouette by the stated overlap margin past each joint boundary, into the neighboring part's territory — this is the only intentional deviation from the source's exact shape, and it exists so no gap appears at the joint when the rig rotates the part away from this bind pose. No background, no shadow, no added outline beyond what the source already has.

## Measured joint coordinates (pixels, in `mannequin.png`'s own 1145×1374 canvas)

These come directly from the joint markers already drawn on the mannequin, measured once so every part below cuts at the same, consistent boundary. "Front" = the larger/nearer limb (left side of the image as you look at it); "rear" = the smaller/farther limb (right side of the image).

| Joint | x | y |
|---|---|---|
| neck | 583 | 272 |
| shoulder (front) | 450 | 283 |
| shoulder (rear) | 690 | 320 |
| elbow (front) | 335 | 465 |
| elbow (rear) | 730 | 512 |
| wrist (front) | 318 | 672 |
| wrist (rear) | 803 | 678 |
| hip (front) | 505 | 600 |
| hip (rear) | 655 | 600 |
| knee (front) | 460 | 890 |
| knee (rear) | 725 | 895 |
| ankle (front) | 358 | 1188 |
| ankle (rear) | 705 | 1195 |

Overlap margin: **20px**, extended past every joint boundary listed below, into the neighboring part.

## Per-part prompts

Generate one at a time, attaching `mannequin.png` fresh to each. Append the shared contract above to every one.

### `body-head.png`

> Isolate the head and neck only. Top boundary: the top of the canvas (the head's natural top edge). Bottom boundary: 20px below the neck joint at (583, 272) — down to approximately y=292, overlapping into the torso's territory. Include the full head shape left-to-right with no side cropping; the head does not reach the canvas edges.

### `body-torso.png`

> Isolate the torso (chest, back, ribcage) only — not the head, not the arms, not the hips/pelvis. Top boundary: 20px above the neck/shoulder line, overlapping up into the head and both shoulders. Side boundaries: 20px into each shoulder joint — (450, 283) and (690, 320) — overlapping into both upper arms; the arms themselves are separate parts. Bottom boundary: 20px past the visible waist seam in the source image (where the torso panel already meets the hip/brief panel) — do not include the pelvis/brief shape itself, only overlap 20px into it.

### `body-hips.png`

> Isolate the hips and pelvis (the brief/shorts-shaped panel below the waist) only — not the torso above it, not the thighs below it. Top boundary: 20px above the visible waist seam, overlapping up into the torso. Bottom boundary: 20px below both hip joints — (505, 600) and (655, 600) — overlapping down into both thighs.

### `body-rear-upper-arm.png`

> Isolate the rear (farther, smaller) upper arm only — shoulder to elbow. Top boundary: 20px above the rear shoulder joint (690, 320), overlapping into the torso. Bottom boundary: 20px below the rear elbow joint (730, 512), overlapping into the rear forearm.

### `body-rear-forearm.png`

> Isolate the rear forearm only — elbow to wrist. Top boundary: 20px above the rear elbow joint (730, 512), overlapping into the rear upper arm. Bottom boundary: 20px below the rear wrist joint (803, 678), overlapping into the rear hand.

### `body-rear-hand.png`

> Isolate the rear hand only. Top boundary: 20px above the rear wrist joint (803, 678), overlapping into the rear forearm. Include the entire hand shape to its natural fingertip boundary — no further joint below it, so no bottom overlap needed.

### `body-front-upper-arm.png`

> Isolate the front (nearer, larger) upper arm only — shoulder to elbow. Top boundary: 20px above the front shoulder joint (450, 283), overlapping into the torso. Bottom boundary: 20px below the front elbow joint (335, 465), overlapping into the front forearm.

### `body-front-forearm.png`

> Isolate the front forearm only — elbow to wrist. Top boundary: 20px above the front elbow joint (335, 465), overlapping into the front upper arm. Bottom boundary: 20px below the front wrist joint (318, 672), overlapping into the front hand.

### `body-front-hand.png`

> Isolate the front hand only. Top boundary: 20px above the front wrist joint (318, 672), overlapping into the front forearm. Include the entire hand shape to its natural fingertip boundary.

### `body-rear-thigh.png`

> Isolate the rear thigh only — hip to knee. Top boundary: 20px above the rear hip joint (655, 600), overlapping into the hips. Bottom boundary: 20px below the rear knee joint (725, 895), overlapping into the rear shin.

### `body-rear-shin.png`

> Isolate the rear shin only — knee to ankle. Top boundary: 20px above the rear knee joint (725, 895), overlapping into the rear thigh. Bottom boundary: 20px below the rear ankle joint (705, 1195), overlapping into the rear foot.

### `body-rear-foot.png`

> Isolate the rear foot only. Top boundary: 20px above the rear ankle joint (705, 1195), overlapping into the rear shin. Include the entire foot shape to its natural boundary.

### `body-front-thigh.png`

> Isolate the front thigh only — hip to knee. Top boundary: 20px above the front hip joint (505, 600), overlapping into the hips. Bottom boundary: 20px below the front knee joint (460, 890), overlapping into the front shin.

### `body-front-shin.png`

> Isolate the front shin only — knee to ankle. Top boundary: 20px above the front knee joint (460, 890), overlapping into the front thigh. Bottom boundary: 20px below the front ankle joint (358, 1188), overlapping into the front foot.

### `body-front-foot.png`

> Isolate the front foot only. Top boundary: 20px above the front ankle joint (358, 1188), overlapping into the front shin. Include the entire foot shape to its natural boundary.

## Acceptance checklist

- Every file is exactly 1145 × 1374 — same canvas as `mannequin.png`, never cropped or resized.
- Stacking all 15 files at (0, 0) in the rig's z-order reproduces the original mannequin with no visible seams and no leftover joint-marker circles.
- No part's linework, shading, or proportions differ from the source — only the stated 20px overlap extends past a true joint boundary.
- Every part is otherwise fully transparent outside its own silhouette.
- Hands exist as their own pieces (`body-rear-hand.png`, `body-front-hand.png`) — these were missing from the placeholder shapes entirely.
