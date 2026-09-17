# Cutout Character Rig Design

**Project:** Cardslayer  
**Date:** 2026-09-17  
**Status:** Proposed for written review  
**Scope:** Runtime structure and asset contract for animated player characters with interchangeable equipment, plus the common interface used by fixed-appearance mobs.

## 1. Goal

Build the animation structure before producing final art. Players use an AQW-inspired raster cutout rig so one animation moves the body and every equipped item. Mobs keep simpler baked frame animation because their appearance does not change. Both renderers expose the same commands to world and combat code.

The system must work in the existing plain JavaScript and PixiJS 8 application on Windows, macOS, iOS, and Android webviews. It must preserve the current bottom-center world anchor, horizontal facing flip, movement, combat timing, camera behavior, and responsive scaling.

## 2. First-version boundaries

The first version includes:

- One male humanoid rig and one female humanoid rig.
- Identical bone names and hierarchy for both rigs.
- A female bind pose that is approximately 6% shorter, with narrower shoulders and adjusted torso, hip, and limb proportions.
- Shared additive animation clips: `idle`, `run`, and `attack`.
- Static body and equipment textures attached to bones.
- Existing procedural hit shake, damage text, death fade, and respawn behavior.
- Baked frame animation for fixed-appearance mobs.
- A placeholder rig preview built from colored shapes before final art exists.

The first version does not include pets, wings with independent flight animation, facial animation, cloth simulation, inverse kinematics, multiple player races, multiple weapon-specific attack clips, or runtime color masking. These can be added without replacing the core bone hierarchy.

## 3. Architecture

There are two renderer implementations behind one actor-facing API:

```js
actor.play("idle");
actor.play("run");
await actor.playOnce("attack");
actor.faceLeft(true);
actor.setDisplayHeight(90);
actor.destroy();
```

Player actors additionally expose:

```js
await actor.applyAppearance({ bodyType, skin, equipment });
```

`RigActor` animates nested Pixi `Container` bones and swaps body/equipment sprites. `FrameActor` wraps `PIXI.AnimatedSprite` for mobs. `WorldScene` depends only on the shared commands and a Pixi display object, so movement and combat do not branch on renderer type.

## 4. Humanoid skeleton

Both body types use this hierarchy:

```text
root
└── hips
    ├── cape
    ├── rearThigh
    │   └── rearShin
    │       └── rearFoot
    ├── torso
    │   ├── rearUpperArm
    │   │   └── rearForearm
    │   │       └── rearHand
    │   │           └── offhandMount
    │   ├── head
    │   └── frontUpperArm
    │       └── frontForearm
    │           └── frontHand
    │               └── weaponMount
    └── frontThigh
        └── frontShin
            └── frontFoot
```

Every bone is a `PIXI.Container`. Bone transforms are local to their parent. The rig origin is the point between the feet, matching the current `anchor.set(0.5, 1)` behavior.

The male and female rig JSON files define different bind-pose positions, rotations, display heights, and art scale. Animation clips contain additive offsets from the bind pose. One `run` clip therefore works for both bodies without forcing identical proportions.

Horizontal direction is applied only by flipping `root.scale.x`. Individual bones and equipment pieces are never separately mirrored.

## 5. Draw order

The renderer uses a fixed back-to-front layer order:

1. Cape
2. Rear weapon or offhand item
3. Rear arm and its equipment
4. Rear leg and its equipment
5. Base hips and torso
6. Chestplate and waist overlays
7. Head, hair, and helmet
8. Front leg and its equipment
9. Front arm and its equipment
10. Front-hand weapon
11. Effects

Each bone owns separate base and equipment sprite containers. This allows a chestplate to cover the base torso while sleeves cover the arm bones and continue moving with them.

## 6. Player appearance and equipment

The existing equipment slots remain canonical:

```js
["helmet", "cape", "chestplate", "leggings", "boots", "weapon", "book"]
```

Their visual mappings are:

| Slot | Supported bone pieces |
|---|---|
| `helmet` | `head` |
| `cape` | `cape` |
| `chestplate` | `torso`, both upper arms, optionally both forearms |
| `leggings` | `hips`, both thighs, optionally both shins |
| `boots` | both shins and both feet |
| `weapon` | `weaponMount` |
| `book` | `offhandMount` |

Fitted equipment supplies male and female art variants. Equipment that does not depend on body proportions may provide a `unisex` variant used by both bodies. The runtime lookup order is the selected body type followed by `unisex`. Missing art hides only the affected equipment piece and logs a warning; it never prevents gameplay.

The player appearance record extends the existing player data:

```json
{
  "bodyType": "male",
  "skin": "base_medium",
  "equipment": {
    "helmet": null,
    "cape": null,
    "chestplate": null,
    "leggings": null,
    "boots": null,
    "weapon": null,
    "book": null
  }
}
```

Equipment definitions keep their current gameplay fields and add an optional visual manifest path. Stats and appearance remain separate concerns.

## 7. Rig and equipment data

Runtime-authored data lives under:

```text
data/rigs/humanoid-male.json
data/rigs/humanoid-female.json
data/animations/humanoid/idle.json
data/animations/humanoid/run.json
data/animations/humanoid/attack.json
data/equipment/<slot>/<item-id>.json
```

A rig file defines the hierarchy, bind transforms, default display height, and base body texture per bone. All positions are authored in a shared rig coordinate system whose origin is between the feet.

An animation file defines duration, loop behavior, and sparse keyframes. Values are additive to the active bind pose:

```json
{
  "id": "run",
  "durationMs": 620,
  "loop": true,
  "tracks": {
    "hips": [
      { "time": 0, "y": 0, "rotation": 0 },
      { "time": 0.5, "y": 3, "rotation": 0.03 },
      { "time": 1, "y": 0, "rotation": 0 }
    ]
  }
}
```

Unspecified transform properties retain their bind-pose value. Keyframes use normalized time from `0` to `1`. The first version uses linear interpolation with optional clip-level easing; no third-party skeletal runtime is required.

Equipment JSON points from a bone name to a static transparent image and local pivot adjustment:

```json
{
  "id": "iron_plate",
  "slot": "chestplate",
  "visual": {
    "male": {
      "torso": { "image": "assets/equipment/iron_plate/male/torso.png", "x": 0, "y": 0 },
      "frontUpperArm": { "image": "assets/equipment/iron_plate/male/front-upper-arm.png", "x": 0, "y": 0 },
      "rearUpperArm": { "image": "assets/equipment/iron_plate/male/rear-upper-arm.png", "x": 0, "y": 0 }
    },
    "female": {
      "torso": { "image": "assets/equipment/iron_plate/female/torso.png", "x": 0, "y": 0 },
      "frontUpperArm": { "image": "assets/equipment/iron_plate/female/front-upper-arm.png", "x": 0, "y": 0 },
      "rearUpperArm": { "image": "assets/equipment/iron_plate/female/rear-upper-arm.png", "x": 0, "y": 0 }
    }
  }
}
```

## 8. Animation behavior

Animation priority is:

```text
attack > run > idle
```

- `idle` loops slowly with breathing, a slight weight shift, and minimal cape motion.
- `run` is an energetic side-view sprint rather than a walk. It uses a forward torso lean, alternating arm drive, clear airborne and contact phases, vertical hip motion, and mild cape lag.
- `attack` is non-looping. It drives the body and attached weapon together while the existing world-space lunge remains responsible for closing visual distance.
- `hit` remains the existing procedural shake.
- `death` remains the existing fade.

The animation player updates bone transforms from the existing Pixi ticker. It does not create its own animation loop. When `playOnce("attack")` finishes, the actor returns to `run` if movement is still active, otherwise `idle`.

## 9. Fixed-appearance mobs

Mobs use baked transparent frames because they do not combine equipment and may have arbitrary anatomy. Each mob manifest can provide `idle`, `run`, and `attack`; stationary mobs may omit `run`. Missing optional animations fall back to `idle`.

The mob renderer preserves the same feet anchor and common actor API. Existing mobs can temporarily use a single-frame `idle` manifest, allowing gradual migration without blocking the rig work.

Humanoid mobs may use `RigActor` later if procedural equipment variants become valuable, but the first version does not require it.

## 10. Runtime modules

```text
src/sprites/
  actor-view.js
  animation-player.js
  rig-actor.js
  frame-actor.js
  load-rig.js
  load-frame-manifest.js
  appearance.js
```

- `actor-view.js`: documents and normalizes the shared actor commands.
- `animation-player.js`: ticker-driven clip timing, interpolation, looping, and non-looping completion.
- `rig-actor.js`: creates the bone hierarchy, applies bind poses, installs base/equipment textures, and delegates clip playback.
- `frame-actor.js`: wraps `PIXI.AnimatedSprite` behind the same interface.
- `load-rig.js`: validates and loads rig, animation, and attachment data.
- `load-frame-manifest.js`: loads mob frames and playback metadata.
- `appearance.js`: validates body type and equipment slot ids and supplies safe defaults.

`WorldScene` receives a display object and actor controller instead of treating the visual itself as a plain `PIXI.Sprite`. Position, scale, alpha, and facing remain controlled at the actor root.

## 11. Structure-first preview

Before any final assets are generated, add `dev/rig-preview.html`. It displays male and female placeholder rigs side by side using colored geometric body parts. Controls switch among `idle`, `run`, and `attack`, flip direction, and toggle one placeholder item in every equipment slot.

The preview must make these issues visible before art production:

- Incorrect joint pivots
- Equipment appearing in the wrong layer
- Armor separating from limbs during the run
- Male/female proportion conflicts
- Weapons rotating around the wrong hand point
- Foot sliding or movement below the ground anchor
- Silhouette readability at the real 70–90 pixel gameplay size

Final Astra generation begins only after the placeholder rigs and animations are accepted in this preview.

## 12. Astra asset contract

Astra generates static body and equipment pieces in the neutral bind pose, not complete animation frames. Every generation uses a rendered rig template showing bone boundaries, joint centers, canvas scale, and the Cardslayer style reference.

For fitted armor, Astra produces a composed male and female design first. Each accepted design is then separated into the exact bone pieces required by its slot. Weapons, books, many helmets, and many capes may use one unisex output.

Every exported piece is transparent, contains no floor shadow or scenery, and includes enough overlap around joints to prevent gaps during rotation. A deterministic validation step checks referenced bone names, required files, transparent bounds, and pivots before an item is accepted.

## 13. Performance

A player rig contains approximately 15 bone containers and 20–30 small sprites with full equipment. This is inexpensive for one local player and one inventory preview. Mobs remain one `AnimatedSprite` each. Textures are cached through `PIXI.Assets`; multiple actors referencing the same item do not reload image data.

The system uses raster textures and GPU transforms. It does not redraw vector paths, deform meshes, or flatten the character every frame. No skeletal-animation dependency is added.

## 14. Error handling

- Unknown body type falls back to `male` and logs a warning.
- Missing base-body art renders a colored debug shape for that bone in development and an empty part in production.
- Missing equipment art hides only that part and logs item id, body type, and bone.
- Unknown animation name falls back to `idle`.
- Missing mob animation falls back to its first idle frame.
- Invalid parent names, hierarchy cycles, duplicate bones, and non-finite transforms reject the rig during loading with a clear error.
- Applying appearance uses a generation token so a slow older asset request cannot overwrite a newer equipment selection.

## 15. Testing and acceptance

Vitest covers:

- Additive animation interpolation at the beginning, midpoint, and end of a clip.
- Loop wrapping and `playOnce` completion.
- Male and female bind poses producing the same bone names.
- Rig validation rejecting cycles, missing parents, and invalid transforms.
- Equipment variant lookup: body-specific first, then `unisex`, then hidden.
- Appearance sanitization for unknown body types, slots, and item ids.
- Animation priority and return from `attack` to `run` or `idle`.
- Frame mob fallback behavior.

Browser verification covers:

- Both placeholder bodies at desktop and phone viewport sizes.
- Running in both directions without foot-anchor drift.
- Every placeholder equipment slot through a complete run cycle.
- Combat attack timing with the existing lunge, damage number, shake, and fade.
- Missing equipment art without a crash.
- Reduced-motion UI settings do not disable gameplay animation.

The structure is ready for asset production when the placeholder preview shows stable pivots, readable silhouettes, no visible armor gaps during a full run cycle, correct front/back layering, and identical gameplay behavior on desktop and mobile layouts.

## 16. Implementation sequence

1. Add pure rig-data validation and additive animation interpolation.
2. Build `RigActor` with colored placeholder body parts.
3. Author male and female bind-pose data.
4. Author placeholder `idle`, `run`, and `attack` clips.
5. Build the rig preview and validate all attachment layers.
6. Add appearance and placeholder equipment manifests for every slot.
7. Introduce the common actor API and adapt `WorldScene` while preserving a static-sprite fallback.
8. Add `FrameActor` and migrate the current goblin to a one-frame manifest.
9. Verify movement, combat, resizing, and mobile behavior.
10. Freeze the rig template and begin Astra body/equipment generation.

## 17. Reference boundary

AdventureQuest Worlds is a structural reference for layered body parts, shared animations, swappable equipment, and strong side-view silhouettes. Cardslayer does not copy AQW assets, characters, names, animation data, or exact proportions. Its final artwork continues to follow the existing Cardslayer Flash-fantasy reference prompts.
