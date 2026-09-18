# Rig Bind-Pose and Layering Rework Implementation Plan

> **For implementation:** Execute in order. Phase 1 is a code fix and is unit-testable. Phases 2–3 depend on a reference image the user provides/generates — do not guess bind-pose numbers without it. Phases 4–6 are manual/visual verification, matching this project's existing convention (PixiJS rendering is verified in the browser, not unit-tested).

**Goal:** Make the placeholder skeleton actually look like the intended AQW-style stance and layer correctly (rear limbs genuinely behind the torso/hips, not just recolored), so Astra-generated assets have correct attachment points and layering to slot into.

**Root causes being fixed (see chat diagnosis):**
1. Every bone in `data/rigs/humanoid.json` has `rotation: 0` — no stance, arms/legs hang straight down.
2. `RigActor` parents each bone's *render* container under its *kinematic* parent's container. Because a parent's own body sprite is added before any child container, a child (e.g. `rearUpperArm` under `torso`) can never render behind its parent's own sprite. The rear-limb dark recolor is a workaround for this, not a real fix. There's also a smaller instance of the same bug: `cape` and the rear leg render in the wrong relative order versus the spec's §5 (`cape` should be layer 1, rear-leg layer 4 — the code currently renders rear-leg behind cape, the opposite).

**Architecture change:** Decouple the *transform* hierarchy (nested containers, needed so rotations/positions compose correctly parent→child) from the *render* hierarchy (a flat, explicit draw order, independent of transform nesting depth). This is how real 2D skeletal rigs (Spine, DragonBones) do it. Bones keep their nested transform containers for kinematics; each bone's *visual* content is instead added to one flat top-level container in an explicit order, with its local transform synced from the bone's computed world transform every tick.

---

## 1. Explicit draw order, decoupled from the transform tree

**Files:**
- Modify `src/sprites/rig-actor.js`
- Modify `data/rigs/humanoid.json`, `data/rigs/humanoid-aqw-bind-preview.json` (add a `drawOrder` array)
- Create `test/rig-draw-order.test.js`

1. Add a top-level `"drawOrder"` array to both rig JSON files, listing every bone id in the exact sequence from spec §5 (cape, offhandMount, rearUpperArm, rearForearm, rearHand, rearThigh, rearShin, rearFoot, hips, torso, head, hair, eyes, nose, frontThigh, frontShin, frontFoot, frontUpperArm, frontForearm, frontHand, weaponMount). This is the single source of truth for front-to-back order — no more relying on array position or hierarchy traversal order.
2. Write a failing test asserting `validateRig` rejects a `drawOrder` that omits a bone or lists an unknown bone id, and that a valid rig's resolved draw order matches the authored array.
3. In `RigActor`, keep the existing nested `PIXI.Container` tree for **transform only** (position/rotation/scale propagation) — this part is unchanged and still drives correct kinematics.
4. Add one flat `this.drawRoot` container, added once to `this.visual`. For each bone, instead of adding its 5 layer-containers as children of the parent bone's container, add them to `this.drawRoot`, in `drawOrder` sequence.
5. Every tick (in `update()`, and once at construction), after computing each bone's local transform, copy each bone's **world** transform (`container.worldTransform` or an equivalent accumulated matrix) onto its corresponding entry in `drawRoot` so it renders at the correct screen position despite no longer being a literal child of its parent bone's container. PixiJS containers expose `getGlobalPosition()`/`worldTransform`; use whichever gives an exact position+rotation+scale copy without floating drift.
6. Run the new test, then the full suite (`npx vitest run`) — confirm all existing tests still pass unchanged (this must not alter any existing pure-function behavior, only how `RigActor` composites bones for rendering).
7. Load `dev/rig-preview.html`, toggle every equipment slot, and confirm: cape now renders behind the rear leg; the rear arm and rear leg are visibly behind the torso/hips base shape (not just darker) whenever they'd geometrically overlap.
8. Commit.

## 2. Reference pose image

This step is on you, not me — I can't generate the final art-direction call, only help measure it once it exists.

1. Generate one full-body, neutral, nude/unarmored reference in the exact stance you want, 3/4 view, matching the existing Cardslayer style (reuse `human-base.png`'s style as the visual anchor — same outline weight, same proportions). This image is for joint measurement, not for cutting into final assets yet.
2. Send it to me (or drop it in `docs/art-reference/`) once it exists.

## 3. Measure the reference and rewrite the bind pose

**Files:**
- Modify `data/rigs/humanoid.json`, `data/rigs/humanoid-aqw-bind-preview.json`

1. For each joint (hip, knee, ankle ×2; shoulder, elbow, wrist ×2; neck/head base), read its pixel position off the reference image.
2. Convert each joint's *global* pixel position into the rig's *local, parent-relative* bind-pose offset — e.g. `rearShin.y` is the knee-to-ankle distance along the rig's y-axis, not the ankle's absolute position. Do this chain by chain (hip→knee→ankle, shoulder→elbow→wrist) so each bone's x/y is relative to its immediate parent, matching the existing schema.
3. Set the corresponding `rotation` on each bone so the limb direction in the bind pose matches the reference's stance (this is what fixes "arms pointing the wrong way" — a natural stance needs real rotation values, not 0).
4. Update `bounds.height`/`bounds.groundY` if the reference's proportions change the character's overall height-to-ground-anchor ratio.
5. Apply the same measured values to `humanoid-aqw-bind-preview.json` too, so both rigs stay in sync (the preview rig can keep its extra per-side rotation delta *on top of* the new base values, for calibration visibility — but it should no longer be the only rig with any rotation at all).

## 4. Reference-overlay tool in the preview

**Files:**
- Modify `dev/rig-preview.html`, `dev/rig-preview.js`

1. Add a file input (or a hardcoded path once the reference image is committed under `docs/art-reference/`) that renders the reference image as a semi-transparent backdrop behind the rig canvas, scaled to the same display height as the actor.
2. Add an opacity slider (0–100%) so the reference can be faded in/out while comparing against the live placeholder rig.
3. This lets you drag-nudge bones (the existing calibration tool already supports this) directly against your own reference image instead of eyeballing from memory.

## 5. Decide the rear-limb depth treatment

Once draw order is actually correct (Phase 1), rear limbs will be genuinely occluded by the torso/hips wherever they overlap — which may be enough on its own. Open decision, needs your call before Phase 6:

- **Option A (recommended):** Remove the dark recolor entirely once real occlusion works. Real art will convey depth through actual overlap and perspective, the way AQW's own assets do — a flat tint on top of correct art would look artificial.
- **Option B:** Keep a *slight* darkening (much subtler than today's) purely as a placeholder-shape aid, removed once real per-part art exists.

## 6. Re-verify against the reference

1. With the reference overlay on, run through `idle`/`run`/`attack` and confirm the placeholder silhouette traces the reference's stance at every phase, not just the bind pose.
2. Toggle every equipment slot again and confirm layering (Phase 1's fix) holds up with the new bind pose.
3. Update `docs/superpowers/specs/2026-09-17-cutout-character-rig-design.md` §5 to note the draw order is now enforced by an explicit `drawOrder` array rather than implied by hierarchy, and add a short dated addendum recording the bind-pose source (the reference image) for future reference.
4. Commit, push.

## 7. Then: Astra generation

Only after Phases 1–6 land — attachment points and layering are correct before any final art gets generated, per your own stated workflow. `docs/art-reference/rig-asset-prompts.md` already has per-part prompts; re-derive each `[named rig bone / joint]` attachment point description from the corrected bind pose before running them.
