# Rig Bind-Pose and Layering Rework Implementation Plan

> **For implementation:** Execute in order. Phase 1 is a code fix and is unit-testable. Phases 2–3 depend on a reference image the user provides/generates — do not guess bind-pose numbers without it. Phases 4–6 are manual/visual verification, matching this project's existing convention (PixiJS rendering is verified in the browser, not unit-tested).

**Goal:** Make the placeholder skeleton actually look like the intended AQW-style stance and layer correctly (rear limbs genuinely behind the torso/hips, not just recolored), so Astra-generated assets have correct attachment points and layering to slot into.

**Root causes being fixed (see chat diagnosis):**
1. Every bone in `data/rigs/humanoid.json` has `rotation: 0` — no stance, arms/legs hang straight down.
2. `RigActor` parents each bone's *render* container under its *kinematic* parent's container. Because a parent's own body sprite is added before any child container, a child (e.g. `rearUpperArm` under `torso`) can never render behind its parent's own sprite. The rear-limb dark recolor is a workaround for this, not a real fix. There's also a smaller instance of the same bug: `cape` and the rear leg render in the wrong relative order versus the spec's §5 (`cape` should be layer 1, rear-leg layer 4 — the code currently renders rear-leg behind cape, the opposite).

**Architecture change:** Decouple *how a bone renders relative to its own parent's body* from *add order*, using PixiJS's built-in per-parent sibling sort (`sortableChildren` + `zIndex`) instead of a hand-rolled global draw list. This needed less invasive surgery than first sketched below, once the actual shape of the problem was confirmed: every cross-bone occlusion the spec requires (rear arm behind torso, rear leg behind hips, cape behind rear leg, offhand item behind the rear hand) is a conflict between *immediate siblings under a shared parent* — never a conflict that needs reordering across unrelated branches of the tree. PixiJS already sorts a container's direct children by `zIndex` when `sortableChildren` is set, which solves exactly this without touching the transform hierarchy or computing world matrices by hand.

**Status: implemented and verified** (2026-09-18). ~~The flat `drawRoot` + world-transform-copy approach originally planned below was not used~~ — superseded by the simpler fix actually shipped:

1. Added an optional `"zIndex"` field to every bone in both `data/rigs/humanoid.json` and `data/rigs/humanoid-aqw-bind-preview.json`, one numeric tier per spec §5 layer: `cape=10, offhandMount=20, rear-arm chain=30, rear-leg chain=40, hips/torso=50, head+hair+eyes+nose=70, front-leg chain=80, front-arm chain=90, weaponMount=100`.
2. `load-rig.js`'s `validateRig` rejects a non-numeric `zIndex`.
3. In `RigActor`, each bone's container gets `sortableChildren = true` and `zIndex = bone.zIndex ?? 0`; each bone's own 5 layer sub-containers (rear/base/armor/front/effects) get that *same* `zIndex`, so a bone's own body sprite and its child bones sort together correctly — a child with a lower `zIndex` than its parent (e.g. `rearUpperArm`=30 under `torso`=50) now renders behind the parent's own body, while a higher one (e.g. `frontUpperArm`=90) still renders in front, and same-tier successive limb segments (forearm over upper arm, etc.) keep rendering in front of each other via PixiJS's stable sort preserving original add order.
4. This is unchanged: the transform hierarchy (nested containers for position/rotation propagation) is untouched. Only sibling *render* order within each existing parent changed.

Verified two ways:
- Unit tests (`test/load-rig.test.js`): `validateRig` accepts/rejects `zIndex` correctly; full suite (122 tests) still green.
- Direct scene-graph inspection in `dev/rig-preview.html` (not screenshots, which proved unreliable for this): after `app.render()`, `torso.container.children` is ordered `[rearUpperArm(30), own 5 layers(50), head(70), frontUpperArm(90)]`; `hips.container.children` is `[cape(10), rearThigh(40), own 5 layers(50), torso(50), frontThigh(80)]`; `rearHand.container.children` is `[offhandMount(20), own 5 layers(30)]`. All three match spec §5 exactly. Also confirmed no console errors through every clip (`idle`/`run`/`attack`) and every equipment toggle on the real preview page.

## 2. Reference pose image

**Status: done (2026-09-18).** `docs/art-reference/mannequin.png` — a grey mannequin with an explicit circle marker at every joint (neck, shoulders, elbows, wrists, hips, knees, ankles), three-quarter view, flat 2D silhouette with no perspective foreshortening. Better than the plan asked for: the explicit joint markers made pixel measurement unambiguous, no guessing required.

## 3. Measure the reference and rewrite the bind pose

**Status: done (2026-09-18).**

**Files modified:**
- `data/rigs/humanoid.json`, `data/rigs/humanoid-aqw-bind-preview.json`
- `src/sprites/rig-actor.js` (`SEGMENT_LENGTHS`, to match the newly measured proportions — legs in particular are now proportionally much longer, closer to true AQW-style)

Process actually used, and one real bug caught along the way:

1. Detected each joint marker's pixel center from `mannequin.png` (grid-overlay crops, read manually — automatic blob detection failed because the markers are plain black rings on the same grey as the body, not a distinct fill color).
2. Converted each joint's pixel position into the rig's local, parent-relative bind-pose offset, and each bone's `rotation` from the direction to its own child joint.
3. **First pass was wrong**: PixiJS composes a child's rotation *relative to its parent's already-rotated frame*, not as an absolute world angle. The initial numbers treated every bone's measured direction as if it were already local, which is only correct when the parent has zero rotation — anything nested under a rotated parent (forearms, hands, shins, feet) came out visibly detached from the mannequin's own outline once rendered. Fixed by computing each bone's *world* rotation first (top-down, accumulating), then deriving `local rotation = own world rotation − parent's world rotation`, and rotating position offsets into the parent's local frame the same way.
4. `bounds.groundY` changed from `39` to `63` — a direct consequence of the legs now measuring proportionally much longer than the old placeholder assumed (hip-to-feet is ~56% of total height in the reference, not ~35%). Not touching this would have left the character floating above or sinking below the world's ground line.
5. Applied identical values to both rig files — no separate artificial "preview-only" rotation delta was needed, since the real reference pose is already asymmetric enough for the calibration tool's own purpose (front/rear parts no longer overlap identically).

Verified two ways, not just by eye:
- **Rigorous, screenshot-independent check**: a Python script re-implements PixiJS's exact parent→child transform composition over the committed JSON, walks the chain for every bone, and compares the resulting world position against the original measured reference-image joint position. Max error across all 15 measured joints: **1.09px on a 1320px-tall reference** (rounding artifact from 1–2 decimal precision in the JSON, nothing structural).
- **Visual overlay**: the reference image composited at 50% opacity behind a live `RigActor` render in the browser (temporarily copied into the publicly-served `dev/` directory for the test, then removed — `docs/` is deliberately not web-servable, confirmed via the server's static allowlist). The placeholder shapes track the mannequin's silhouette closely at every joint once the rotation-composition bug above was fixed.

Full suite (122 tests) green throughout; every clip and equipment toggle exercised on the real preview page with no console errors.

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
