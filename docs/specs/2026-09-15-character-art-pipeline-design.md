# Character Art Pipeline — Design Spec

**Project:** Cardslayer (working title)
**Date:** 2026-09-15
**Status:** Approved in discussion, pending written review
**Revision:** 2026-09-15 — engine changed from Godot 4 to the existing web stack (PixiJS) after review of the `wankigroup` prototype
**Scope:** How player and mob models/animations are produced, stored, imported, and rendered. Does not cover combat rules, deck parsing, UI, or save-file format beyond the appearance record.

---

## 1. Goals

1. A player character whose look is assembled from swappable equipment pieces.
2. Mobs (normal and boss) that share the same animation vocabulary as the player, so combat code is generic.
3. Any team member can add a new equipment piece or mob by adding files in the right folders — no code changes.
4. Assets are produced by AI generation + manual cleanup in Aseprite, with enough constraints that the output looks like one game.
5. Everything is reproducible from committed source files and scripts.

## 2. Non-goals (first version)

- Skeletal / cutout animation.
- Walking, running, or overworld movement animations.
- Directional facing beyond horizontal flip.
- Palette-swap variants of gear (skin tone is handled by `body` variants, see §4.3).
- Runtime download of assets. Everything ships in the build.

## 3. Fixed art constraints

These are locked. Changing any of them after assets exist means redrawing every asset.

| Constraint | Value |
|---|---|
| Engine | Web stack: plain JS + PixiJS 8 for sprites (wrapped by Capacitor for iOS, Tauri for Windows) |
| Style | Pixel art, side view, character faces **right** in source; left is a horizontal flip |
| Frame canvas (player, normal mob) | 64 × 64 px |
| Frame canvas (boss) | 128 × 128 px |
| Ground anchor | Feet on row **y = 56** (0-indexed from top) for 64 px; **y = 112** for 128 px |
| Horizontal anchor | Character horizontally centred on **x = 32** (64 px) / **x = 64** (128 px) |
| Palette | One shared 32-colour palette, committed as `assets/src/palette.gpl`. Every exported PNG must use only these colours plus full transparency. |
| Outline | 1 px dark outline on all pieces |
| Render scale | Game renders at integer scale; sprites are never rotated or non-integer scaled |
| Texture scaling | PixiJS `scaleMode: 'nearest'`, `roundPixels: true`; canvas CSS `image-rendering: pixelated` |

## 4. Animation vocabulary

### 4.1 Animations

Every player part and every mob has exactly these four animations, with these names and frame counts:

| Name | Frames | FPS | Loop | Trigger |
|---|---|---|---|---|
| `idle` | 4 | 6 | yes | default |
| `attack` | 4 | 10 | no | player answered a card correctly (player), or mob retaliates (mob) |
| `hit` | 2 | 10 | no | received damage |
| `death` | 4 | 8 | no | HP reached 0; final frame holds |

Total: 14 frames per asset. Frame order within a tag is left-to-right.

Rules:
- Names are lower-case, exactly as above. Combat code plays animations by these strings.
- `attack` frame 3 (0-indexed 2) is the **impact frame**; the combat controller emits the damage number on that frame. Every attack animation must have its visible strike on frame 3.
- `death` last frame is the corpse pose and is held until the mob is removed.

### 4.2 Player slots

Six slots, drawn bottom to top:

| Order | Slot | Required | Notes |
|---|---|---|---|
| 1 | `body` | yes | Skin + underclothes + face. Skin tone = different `body` items. |
| 2 | `legs` | no | Trousers, boots |
| 3 | `chest` | no | Armour, robes, shirts. May cover arms. |
| 4 | `hair` | no | Drawn under `head` so helmets cover it |
| 5 | `head` | no | Helmets, hats, glasses |
| 6 | `weapon` | no | Held in the right hand. Weapon sprite includes only the weapon, not the hand. |

The draw order lives in exactly one place in code (`SLOT_ORDER` in `src/sprites/character-rig.js`).

### 4.3 Base body

- `body/base_light`, `body/base_medium`, `body/base_dark` are the first three assets produced. All gear is drawn on top of `base_medium` and must fit all three (same silhouette).
- The base body defines the pose of every frame. Gear does not change pose.

## 5. Source files and production workflow

### 5.1 Template

`assets/src/template.aseprite` — committed. Contains:
- 64 × 64 canvas, 14 frames.
- Frame tags `idle`, `attack`, `hit`, `death` with the counts from §4.1.
- Layers, bottom to top: `guides` (locked, not exported: anchor line + centre line), `body_reference` (the `base_medium` body, locked, not exported), then one layer per slot: `legs`, `chest`, `hair`, `head`, `weapon`.
- The shared palette loaded.

`assets/src/template_boss.aseprite` — same, 128 × 128, single layer `sprite`.

### 5.2 Producing one equipment piece

1. Copy `template.aseprite` to `assets/src/<slot>/<item_id>.aseprite`.
2. Generate the piece with the AI tool (PixelLab via its Aseprite plugin is the default; Retro Diffusion is the fallback). Generate **on top of the visible body reference** so the piece follows the pose in every frame.
3. Clean up: snap to palette (Sprite → Color Mode → Indexed with the project palette), fix the outline, verify the piece stays inside the silhouette rules (§4.3), verify the strike lands on `attack` frame 3 for weapons.
4. Delete everything except the piece's own slot layer.
5. Run the export script (§5.4). Commit the `.aseprite`, the exported `.png` + `.json`, and the `data/equipment/<slot>/<item_id>.json` (§6.2).

### 5.3 Producing one mob

1. Copy `template.aseprite` (or `template_boss.aseprite`) to `assets/src/mobs/<mob_id>.aseprite`.
2. Generate the full mob on layer `sprite`. Same four tags, same frame counts, same anchor.
3. Clean up, export, add `data/mobs/<mob_id>.json`.

### 5.4 Export

`tools/export_sprites.sh` — committed, run from repo root. For every `.aseprite` under `assets/src/` it runs:

```
aseprite -b "$src" \
  --ignore-layer guides --ignore-layer body_reference \
  --sheet "$dst.png" --data "$dst.json" \
  --sheet-type rows --split-tags --format json-array \
  --filename-format '{tag}_{tagframe}'
```

Output layout is one row per animation tag, frames left-to-right. The `.json` carries tag names, frame counts, and durations, so the importer never needs hard-coded frame numbers.

Manual export from the Aseprite GUI is not allowed for committed assets; the script is the only source of exported PNGs.

### 5.5 Exported asset layout

```
assets/
  src/                                  # editable sources (.aseprite)
    palette.gpl
    template.aseprite
    template_boss.aseprite
    body/  legs/  chest/  hair/  head/  weapon/  mobs/
  characters/
    player/
      body/<item_id>.png  + .json
      legs/<item_id>.png  + .json
      chest/ hair/ head/ weapon/ ...
    mobs/<mob_id>.png + .json
  LICENSES.md                           # per-asset tool + terms
```

`item_id` and `mob_id`: lower-case snake_case, ASCII, unique within their slot. Examples: `iron_plate`, `wizard_hat`, `slime_green`.

## 6. Game integration (PixiJS)

This repo is plain HTML/JS with no bundler. Sprite rendering is added as one PixiJS canvas inside the existing battle view; the rest of the app is untouched.

### 6.1 Loading exported sheets

Aseprite's `--format json-array` output is almost the PixiJS spritesheet format; the only missing piece is `animations`. `src/sprites/aseprite-loader.js` exports one function:

```js
// Returns { textures: {frameName: Texture}, animations: {tagName: Texture[]}, fps: {tagName: number} }
export async function loadAsepriteSheet(jsonUrl)
```

It fetches the `.json`, loads `meta.image` as a texture, slices frames, and turns `meta.frameTags` into `animations`. FPS per tag is `1000 / duration` of the tag's first frame. No frame numbers are typed anywhere in game code.

### 6.2 Data files

All under `data/`. One JSON file per object, hand-editable.

```
data/
  equipment/<slot>/<item_id>.json
  mobs/<mob_id>.json
  index.json          # generated, never edited by hand
```

```jsonc
// data/equipment/chest/iron_plate.json
{ "id": "iron_plate", "slot": "chest", "displayName": "Iron Plate",
  "sheet": "assets/characters/player/chest/iron_plate.json" }

// data/mobs/slime_green.json
{ "id": "slime_green", "displayName": "Green Slime", "isBoss": false,
  "sheet": "assets/characters/mobs/slime_green.json",
  "cardsToKill": 3, "xpReward": 10 }
```

Browsers cannot list folders, so `tools/build-index.js` (Node) scans `data/equipment/**` and `data/mobs/**` and writes `data/index.json`:

```json
{ "equipment": { "chest": ["iron_plate", "..."], "head": ["..."] }, "mobs": ["slime_green", "..."] }
```

It runs from `npm run build:index` and is also called by the export script (§5.4). Adding an item = add the `.aseprite`, run the export script, add one JSON file. No JS edits.

### 6.3 Registry

`src/data/registry.js` loads `data/index.json` once at startup, then every referenced JSON file, and exposes:

```js
export async function loadRegistry()
export function getItem(slot, id)          // EquipmentItem | null
export function getItemsForSlot(slot)      // EquipmentItem[]
export function getMob(id)                 // MobDefinition | null
```

Unknown ids return `null` and log a `console.warn` with slot and id.

### 6.4 Appearance record

`src/data/character-appearance.js`:

```js
export const SLOT_ORDER = ["body", "legs", "chest", "hair", "head", "weapon"];

export function defaultAppearance() {
  return { body: "base_medium", legs: "", chest: "", hair: "", head: "", weapon: "" };
}

// Drops ids that no longer exist in the registry (with a warning). Used when loading a save.
export function sanitizeAppearance(raw)
```

The appearance object is stored in the existing `player` object in `app.js` (`player.appearance`) and therefore persists through the existing `savePlayer()` / localStorage path. Empty string means "slot empty".

### 6.5 CharacterRig

`src/sprites/character-rig.js`. One class used for both player and mobs.

```js
export class CharacterRig extends PIXI.Container {
  static IMPACT_FRAME = 2;

  constructor()                       // creates one AnimatedSprite per slot, in SLOT_ORDER, anchor at feet
  async applyAppearance(appearance)   // loads sheets via registry, shows/hides layers
  async applyMob(mobDefinition)       // body layer only
  play(animName)                      // plays on every visible layer; resolves when body finishes (non-looping)
  faceLeft(bool)                      // sets this.scale.x = ±1 on the container, never on a layer
}
```

Events (Pixi `EventEmitter`): `attackImpact` when the body layer reaches frame `IMPACT_FRAME` of `attack`; `animationFinished(animName)` when a non-looping animation ends. Only the `body` layer emits; the other layers have identical frame counts and FPS (§4.1) so they stay in sync.

Layer offset is `(-32, -56)` for 64 px sheets and `(-64, -112)` for boss sheets, so the container's origin is the feet. The rig checks that every loaded layer has the same frame count as `body` for each animation; a mismatched layer is hidden and an error is logged.

### 6.6 Hooking into the existing battle

In `app.js`, `renderBattle()` currently draws an emoji in `#monster`. Change: `#monster` becomes a `<canvas>` host; a `BattleScene` (`src/sprites/battle-scene.js`) owns one Pixi `Application`, a player `CharacterRig` on the left facing right, and a mob `CharacterRig` on the right facing left. `answer(grade)` calls `scene.playerAttack()` (correct) or `scene.mobAttack()` (Again); the existing `floatText` damage number is triggered from the `attackImpact` event instead of immediately. `endBattle` calls `scene.mobDie()` or `scene.playerDie()` and waits for `animationFinished` before showing the modal.

Mob choice: `MONSTERS` in `app.js` is replaced by `getMob(id)` from the registry; `cardsToKill` becomes the mob's HP instead of the session size.

### 6.7 Wardrobe UI (interface only)

Out of scope except the contract: the inventory tab edits `player.appearance`, previews it with a `CharacterRig` in a small canvas, and lists items via `getItemsForSlot(slot)`.

## 7. Validation

`tools/validate-assets.js` (Node, `npm run validate:assets`; also run in CI):

- Every `.png` under `assets/characters/` has a sibling `.json`.
- Every `.json` has exactly the four tags with the frame counts from §4.1.
- Every frame is 64 × 64 (or 128 × 128 when the mob JSON has `isBoss: true`).
- Every colour in every PNG (read with `pngjs`) is in `palette.gpl` or fully transparent.
- Every `data/equipment/<slot>/<id>.json` has `slot` matching its folder, `id` matching its filename, and a `sheet` path that exists.
- Every `data/mobs/<id>.json` has `id` matching its filename and an existing `sheet`.
- `data/index.json` matches what `build-index.js` would produce (fails if someone forgot to regenerate it).

Exits non-zero and prints the offending path on any failure.

## 8. Testing

- **Unit (Vitest):** `sanitizeAppearance` drops unknown ids and keeps known ones; `getItem` returns `null` and warns for unknown ids; `loadAsepriteSheet` turns `frameTags` into `animations` with the right lengths; `CharacterRig.applyAppearance` hides empty slots and shows populated ones (Pixi in headless mode); `attackImpact` fires exactly once per `play("attack")`.
- **Visual smoke page:** `dev/rig-gallery.html` — shows every item in every slot on all three bodies, cycling through the four animations. Used by artists to check fit after adding an asset. Not shipped.

## 9. Error handling

- Missing sheet at runtime: slot rendered empty, `console.warn` with id and slot. Never a crash; the battle continues with whatever loaded.
- Mismatched frame count between layers: caught by `validate-assets.js` before commit; at runtime the rig hides the offending layer with `console.error`.
- Save references a removed item: `sanitizeAppearance` replaces it with `""` and warns.

## 10. Licensing

- `assets/LICENSES.md` records, per asset: generation tool, model/version if known, date, and the licence terms in force at that time. Verify each tool's commercial-use terms before its first use and record the URL.
- No assets, sprites, or names taken from AdventureQuest Worlds or any other game. Only the general look (side view, chunky proportions, layered gear) is a reference.
- No Anki trademark in asset names, item names, or file names.

## 11. Documentation to commit alongside

- `docs/art-pipeline.md` — a one-page artist-facing summary of §3–§5 with screenshots of the template.
- This spec.

## 12. Order of work

1. `palette.gpl`, `template.aseprite`, `template_boss.aseprite`.
2. `tools/export_sprites.sh`, `tools/build-index.js`, `package.json` with the npm scripts.
3. `base_medium` body, all 14 frames. This validates the template and the AI tool.
4. `aseprite-loader.js`, `registry.js`, `character-appearance.js`, `character-rig.js`, with Vitest tests.
5. `dev/rig-gallery.html`.
6. One item per slot + `base_light`, `base_dark`.
7. `tools/validate-assets.js`.
8. Two mobs (one normal, one boss).
9. `battle-scene.js` and the `app.js` hook-up (§6.6).
