# Cutout Rig Foundation Implementation Plan

> **For implementation:** Execute this plan in order. Keep the existing visual-overhaul files intact; this plan only adds the reusable character-animation foundation.

**Goal:** Replace the static player presentation with a neutral, layered cutout rig that has idle, run, and attack motion, while preserving the current world controls and providing data-driven slots for future generated equipment art.

**Architecture:** A `RigActor` composes nested Pixi containers from a neutral humanoid rig file. Animation clips add offsets to a bind pose each frame, so parent movement propagates to every armor and weapon layer. A later `FrameActor` will expose the same small control surface for fixed-look mobs, but this foundation keeps mobs unchanged until their baked frames exist.

**Tech stack:** Browser-native ES modules, PixiJS 8, JSON data files, Vitest.

---

## 1. Animation math and rig validation

**Files:**
- Create `src/sprites/animation-player.js`
- Create `src/sprites/load-rig.js`
- Create `test/animation-player.test.js`
- Create `test/load-rig.test.js`

1. Write failing tests for looping/non-looping time, additive keyframe interpolation, missing-track bind poses, duplicate bone IDs, missing parents, and cyclic hierarchy rejection.
2. Run `npm test -- test/animation-player.test.js test/load-rig.test.js` and confirm the tests fail because the modules do not exist.
3. Implement deterministic, Pixi-free helpers: `sampleClip`, `advanceClip`, and `validateRig`.
4. Re-run the targeted tests and confirm they pass.

## 2. Author neutral rig and movement clips

**Files:**
- Create `data/rigs/humanoid.json`
- Create `data/animations/humanoid/idle.json`
- Create `data/animations/humanoid/run.json`
- Create `data/animations/humanoid/attack.json`

1. Add the one neutral bone hierarchy: hips, torso, head, rear/front arms, rear/front legs, cape, `weaponMount`, and `offhandMount`.
2. Encode the energetic run as alternating leg and arm swings with a small torso bob; do not create a walking clip.
3. Keep art references empty and store bind-pose values in the rig, so generated PNG layers can be inserted later without changing runtime code.
4. Validate the authored rig in the rig tests.

## 3. Implement a placeholder `RigActor`

**Files:**
- Create `src/sprites/rig-actor.js`
- Create `src/sprites/appearance.js`
- Create `test/appearance.test.js`

1. Write failing tests for equipment slot normalization and `overlay`/`replace` mode selection.
2. Implement the pure appearance helper, then pass its tests.
3. Build `RigActor` from nested Pixi containers. Give each body segment a deliberately simple colored debug shape, parented to its named bone.
4. Add `play`, `playOnce`, `update`, `faceLeft`, `setDisplayHeight`, and `applyAppearance`. `applyAppearance` initially installs visual placeholders at `helmet`, `cape`, `chestplate`, `leggings`, `boots`, `weapon`, and `book` mounts.
5. Ensure a direction flip occurs only at the actor root so equipment and body remain aligned.

## 4. Add a stand-alone rig preview

**Files:**
- Create `dev/rig-preview.html`
- Create `dev/rig-preview.js`
- Create `dev/rig-preview.css`

1. Show the placeholder actor on a simple ground line at a responsive canvas size.
2. Add focused controls for idle/run/attack, facing direction, and all equipment slots.
3. Use the preview to verify the fast run reads clearly and every mount follows its parent during all three clips.

## 5. Integrate the actor into the overworld

**Files:**
- Modify `src/world/world-scene.js`
- Create `test/rig-world-integration.test.js` if a pure boundary needs coverage

1. Replace the static player sprite creation with a `RigActor`, retaining the existing player position, height, and root flip behavior through the actor API.
2. In the world ticker, select `run` whenever the player is moving and `idle` once it reaches the target; retain the existing combat lunge/shake/fade effects at the actor root.
3. Keep the former static texture as a safe fallback only until final body art arrives.
4. Run the entire test suite and use `dev/rig-preview.html` plus the game at desktop and narrow mobile dimensions to inspect motion and touch interaction.

## 6. Prepare the fixed-mob path without changing live mobs

**Files:**
- Create `src/sprites/frame-actor.js`
- Create `data/actors/goblin-mace.json`
- Create `test/frame-actor.test.js`

1. Define the matching actor controls for frame-based animation.
2. Point the initial goblin manifest at its single existing image as an idle fallback.
3. Do not alter zone behavior until real goblin run/attack frames are generated.

## Verification

- `npm test`
- Open `/dev/rig-preview.html`: run alternates limbs; equipment mounts move with the skeleton; root facing flip preserves alignment.
- Open `/` at wide and narrow viewports: movement, targeting, combat selection, resizing, and review flow still work.

