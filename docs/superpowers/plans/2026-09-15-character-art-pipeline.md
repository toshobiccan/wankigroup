# Character Art Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emoji-only battle screen with a data-driven, layered pixel-art sprite system (player equipment + mobs) rendered in PixiJS, exactly as specified in `docs/specs/2026-09-15-character-art-pipeline-design.md`.

**Architecture:** Editable `.aseprite` sources are exported by a shell script into PNG spritesheets + JSON metadata under `assets/characters/`. Hand-written JSON records under `data/` describe each equipment item and mob; a Node script indexes them into `data/index.json` (browsers can't list folders). At runtime, a `registry.js` module loads that index, an `aseprite-loader.js` module turns each exported sheet into PixiJS textures/animations, and one `CharacterRig` class (used for both the player and mobs) assembles layered `AnimatedSprite`s and drives the four shared animations. `battle-scene.js` wires two `CharacterRig`s into the existing battle view.

**Tech Stack:** Plain JS, ES modules (no bundler) for the new `src/` tree, PixiJS 8 vendored as a single ESM file (same "vendor, don't npm-install for the browser" pattern already used for JSZip/sql.js/fzstd), Vitest for unit tests, Node's built-in `fs` for the indexing/validation scripts, `pngjs` (devDependency) for palette validation, Aseprite CLI for exporting, an AI art tool (PixelLab primary, Retro Diffusion fallback) for generating source art.

## Global Constraints

- Every exported sprite frame is 64×64 px (128×128 for bosses); ground anchor at row y=56 (y=112 for bosses); horizontal anchor at x=32 (x=64 for bosses). (spec §3)
- One shared 32-colour palette (`assets/src/palette.gpl`); every exported PNG uses only those colours plus full transparency. (spec §3)
- Four animations only, exact lower-case names: `idle` (4f/6fps/loop), `attack` (4f/10fps/no-loop), `hit` (2f/10fps/no-loop), `death` (4f/8fps/no-loop). `attack` frame index 2 (0-indexed) is the impact frame. (spec §4.1)
- Six player slots, draw order bottom→top: `body, legs, chest, hair, head, weapon`. Only `body` is required. (spec §4.2)
- `item_id` / `mob_id`: lower-case snake_case, ASCII, unique within their slot/collection. (spec §5.5)
- No "Anki" in any asset, item, or mob name. No assets/sprites copied from AdventureQuest Worlds or any other game — look-alike style only. No AGPL code. (spec §10, handoff decision #2)
- Manual export from the Aseprite GUI is never committed — `tools/export_sprites.sh` is the only source of exported PNGs. (spec §5.4)
- Node ≥20 (`package.json` `engines`), no bundler — new files loaded as native ES modules via one `<script type="module">` entry point; the existing `db.js` / `anki-import.js` / `app.js` stay classic scripts and are not touched except the one hookup point in Task 9. (repo convention)
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (`docs/HANDOFF.md`), Conventional Commits, small reviewable diffs, coworker (`toshobiccan`) reviews each PR.

---

## Sequencing — what can start before Aseprite is bought

Aseprite (~$20) is not installed yet. Four tasks need it directly; five don't.

| Can start now (pure code/tooling) | Blocked on Aseprite + AI art tool |
|---|---|
| **Task 2** — export script + indexer | **Task 1** — palette + templates |
| **Task 4** — loader/registry/appearance/rig + tests | **Task 3** — `base_medium` body |
| **Task 5** — dev gallery page (code only; shows nothing until Task 3 lands) | **Task 6** — one item per slot + `base_light`/`base_dark` |
| **Task 7** — asset validator | **Task 8** — two mobs |
| **Task 9** — `battle-scene.js` + `app.js` hookup (code + logic tests only; real on-screen verification needs Tasks 3/6/8) | |

Recommended order right now: **Task 2 → Task 4 → Task 7 → Task 5 → Task 9 (code portion)**. As soon as Aseprite + PixelLab/Retro Diffusion access exist: **Task 1 → Task 3 → Task 6 → Task 8**, then go back and finish the manual-verification steps in Tasks 5 and 9 that were deferred.

Each task below states its gate explicitly.

---

### Task 1: Palette and templates

**Gate:** ⏸ Needs Aseprite installed and licensed.

**Files:**
- Create: `assets/src/palette.gpl`
- Create: `assets/src/template.aseprite`
- Create: `assets/src/template_boss.aseprite`
- Create: `assets/LICENSES.md`
- Create: `docs/art-pipeline.md`

**Interfaces:**
- Produces: the palette and two templates every later art task (3, 6, 8) copies from. `assets/LICENSES.md` is a running log every art task appends a row to.

- [ ] **Step 1: Install and license Aseprite**

Buy and install Aseprite (aseprite.org, ~$20, one-time). Open it once to confirm it launches, then close it.

- [ ] **Step 2: Pick and commit the 32-colour palette**

In Aseprite: `File → New` a throwaway 1×1 sprite, then `Sprite → Color Mode → Indexed`, build or import a 32-colour ramp (include at least 3 skin-tone bases for `base_light`/`base_medium`/`base_dark`, a neutral outline colour, and enough saturated colours for gear/mob variety). Export it: `File → Export Palette → GIMP palette (.gpl)` to `assets/src/palette.gpl`. Delete the throwaway sprite.

- [ ] **Step 3: Build `template.aseprite`**

`File → New`: 64×64 canvas, 14 frames. Use `Frame → Frame Tags` to add tags exactly named `idle` (frames 1–4), `attack` (frames 5–8), `hit` (frames 9–10), `death` (frames 11–14) — names lower-case, matching spec §4.1 exactly (combat code plays animations by these literal strings). Add layers bottom-to-top: `guides` (draw a horizontal line at y=56 and a vertical line at x=32, then lock it), `body_reference` (paste a placeholder body silhouette, lock it — this becomes real once Task 3 lands, re-save this template then), `legs`, `chest`, `hair`, `head`, `weapon`. Load the palette from Step 2 (`Sprite → Color Mode → Indexed`, browse to `palette.gpl`). Save as `assets/src/template.aseprite`.

- [ ] **Step 4: Build `template_boss.aseprite`**

Same as Step 3 but 128×128 canvas, ground anchor y=112, horizontal anchor x=64, and a single layer named `sprite` (no per-slot layers — mobs are one flat image). Save as `assets/src/template_boss.aseprite`.

- [ ] **Step 5: Start `assets/LICENSES.md`**

```markdown
# Asset licences

Per-asset record of generation tool, model/version, date, and licence terms in force at generation time. Verify each tool's commercial-use terms before first use.

| Asset | Tool | Model/version | Date | Licence | Notes |
|---|---|---|---|---|---|
```

(Leave the table empty here — Tasks 3, 6, 8 each append a row when they generate an asset.)

- [ ] **Step 6: Write `docs/art-pipeline.md`**

One page, artist-facing, summarising spec §3–§5: the fixed constraints table, the four animations, the six player slots, and the "producing one equipment piece" / "producing one mob" steps (§5.2, §5.3), plus screenshots of `template.aseprite`'s frame-tag and layer setup taken from Aseprite. This is documentation, not code — write it as plain Markdown mirroring those sections in your own words plus the screenshots.

- [ ] **Step 7: Commit**

```bash
git add assets/src/palette.gpl assets/src/template.aseprite assets/src/template_boss.aseprite assets/LICENSES.md docs/art-pipeline.md
git commit -m "$(cat <<'EOF'
chore(art): add shared palette and Aseprite templates

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Export script and index builder

**Gate:** ▶ No Aseprite required to write and unit-test this. Full end-to-end run of `export_sprites.sh` needs the Aseprite CLI (same install as Task 1) and at least one real `.aseprite` file (Task 3) — that final manual check is deferred, noted at the end.

**Files:**
- Create: `tools/export_sprites.sh`
- Create: `tools/build-index.js`
- Create: `data/equipment/.gitkeep`
- Create: `data/mobs/.gitkeep`
- Modify: `package.json`
- Test: `test/build-index.test.js`
- Test fixtures: `test/fixtures/data/equipment/chest/iron_plate.json`, `test/fixtures/data/mobs/slime_green.json`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `data/index.json` written by `npm run build:index`, shape `{ "equipment": { "<slot>": ["<item_id>", ...] }, "mobs": ["<mob_id>", ...] }` — Task 4's `registry.js` reads this file. `tools/export_sprites.sh` — Tasks 3, 6, 8 run this after drawing an asset.

- [ ] **Step 1: Add the npm scripts skeleton**

Edit `package.json`:

```json
{
  "name": "cardslayer",
  "version": "0.1.0",
  "private": true,
  "description": "Battle monsters by answering your flashcards. Works with decks exported from Anki.",
  "scripts": {
    "start": "node server.js",
    "build:index": "node tools/build-index.js",
    "test": "vitest run"
  },
  "engines": {
    "node": ">=20"
  }
}
```

(The `"test"` script is added here so Task 4 doesn't need to touch this section again; Vitest itself is installed in Task 4.)

- [ ] **Step 2: Write the failing test for `build-index.js`**

`tools/build-index.js` will export a pure function so it's testable without touching the real `data/` folder.

```js
// test/build-index.test.js
import { describe, it, expect } from "vitest";
import { buildIndex } from "../tools/build-index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "data");

describe("buildIndex", () => {
  it("groups equipment by slot and lists mobs, from filenames only", () => {
    const index = buildIndex(FIXTURES);
    expect(index).toEqual({
      equipment: { chest: ["iron_plate"] },
      mobs: ["slime_green"],
    });
  });

  it("returns empty collections when the data folder doesn't exist yet", () => {
    const index = buildIndex(path.join(FIXTURES, "does-not-exist"));
    expect(index).toEqual({ equipment: {}, mobs: [] });
  });
});
```

Fixtures (content doesn't matter to `buildIndex` — it only reads filenames — but keep them valid-looking for later tasks to reuse):

```json
// test/fixtures/data/equipment/chest/iron_plate.json
{ "id": "iron_plate", "slot": "chest", "displayName": "Iron Plate", "sheet": "assets/characters/player/chest/iron_plate.json" }
```

```json
// test/fixtures/data/mobs/slime_green.json
{ "id": "slime_green", "displayName": "Green Slime", "isBoss": false, "sheet": "assets/characters/mobs/slime_green.json", "cardsToKill": 3, "xpReward": 10 }
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run test/build-index.test.js
```

Expected: FAIL — `tools/build-index.js` doesn't exist yet (Vitest is not installed yet either; running this now will error "command not found: vitest" or similar. That's expected — continue, Step 4 adds the file, and Task 4 formally installs Vitest. If you want this specific test runnable today, run `npm install --save-dev vitest` first; either way, don't skip writing the test.)

- [ ] **Step 4: Write `tools/build-index.js`**

```js
#!/usr/bin/env node
// Scans data/equipment/<slot>/*.json and data/mobs/*.json and writes data/index.json.
// Browsers can't list folders, so the game reads this generated file instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function buildIndex(dataDir) {
  const equipment = {};
  const equipmentDir = path.join(dataDir, "equipment");
  if (fs.existsSync(equipmentDir)) {
    for (const slot of fs.readdirSync(equipmentDir, { withFileTypes: true })) {
      if (!slot.isDirectory()) continue;
      const ids = fs
        .readdirSync(path.join(equipmentDir, slot.name))
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length))
        .sort();
      if (ids.length) equipment[slot.name] = ids;
    }
  }

  const mobsDir = path.join(dataDir, "mobs");
  const mobs = fs.existsSync(mobsDir)
    ? fs
        .readdirSync(mobsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length))
        .sort()
    : [];

  return { equipment, mobs };
}

function main() {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dataDir = path.join(repoRoot, "data");
  const index = buildIndex(dataDir);
  fs.writeFileSync(path.join(dataDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote data/index.json: ${Object.keys(index.equipment).length} slot(s), ${index.mobs.length} mob(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm install --save-dev vitest
npx vitest run test/build-index.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 6: Create the real (empty for now) data folders**

```bash
mkdir -p data/equipment data/mobs
touch data/equipment/.gitkeep data/mobs/.gitkeep
node tools/build-index.js
```

Expected output: `Wrote data/index.json: 0 slot(s), 0 mob(s)`, and `data/index.json` now exists with `{"equipment":{},"mobs":[]}`.

- [ ] **Step 7: Write `tools/export_sprites.sh`**

```bash
#!/usr/bin/env bash
# Exports every assets/src/**/*.aseprite (except the two templates) to
# assets/characters/. This is the ONLY allowed source of committed PNGs —
# never export manually from the Aseprite GUI.
set -euo pipefail

if ! command -v aseprite >/dev/null 2>&1; then
  echo "error: aseprite CLI not found on PATH. Install Aseprite first (Task 1)." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src_dir="$repo_root/assets/src"
out_dir="$repo_root/assets/characters"

find "$src_dir" -name '*.aseprite' \
  ! -name 'template.aseprite' ! -name 'template_boss.aseprite' -print0 |
while IFS= read -r -d '' src; do
  rel="${src#"$src_dir"/}"                # e.g. body/base_medium.aseprite or mobs/slime_green.aseprite
  rel_dir="$(dirname "$rel")"              # e.g. body or mobs
  name="$(basename "$rel" .aseprite)"      # e.g. base_medium

  if [[ "$rel_dir" == mobs* ]]; then
    dst_dir="$out_dir/mobs"
  else
    dst_dir="$out_dir/player/$rel_dir"
  fi
  mkdir -p "$dst_dir"

  echo "Exporting $rel -> $dst_dir/$name.png + .json"
  aseprite -b "$src" \
    --ignore-layer guides --ignore-layer body_reference \
    --sheet "$dst_dir/$name.png" --data "$dst_dir/$name.json" \
    --sheet-type rows --split-tags --format json-array \
    --filename-format '{tag}_{tagframe}'
done

node "$repo_root/tools/build-index.js"
echo "Done."
```

```bash
chmod +x tools/export_sprites.sh
```

- [ ] **Step 8: Manual verification (deferred until Task 1 + Task 3 exist)**

Once Aseprite is installed and `assets/src/body/base_medium.aseprite` exists (Task 3), run `bash tools/export_sprites.sh` and confirm `assets/characters/player/body/base_medium.png` + `.json` appear and `data/index.json` updates. Until then, this step stays unchecked — everything else in this task is done and tested.

- [ ] **Step 9: Commit**

```bash
git add tools/build-index.js tools/export_sprites.sh test/build-index.test.js test/fixtures data/equipment/.gitkeep data/mobs/.gitkeep data/index.json package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(art): add sprite export script and data index builder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `base_medium` body

**Gate:** ⏸ Needs Task 1's templates and an AI art tool (PixelLab via its Aseprite plugin, or Retro Diffusion as fallback).

**Files:**
- Create: `assets/src/body/base_medium.aseprite`
- Create: `assets/characters/player/body/base_medium.png` + `.png.json` (generated by the export script — do not hand-edit)
- Create: `data/equipment/body/base_medium.json`
- Modify: `assets/LICENSES.md`

**Interfaces:**
- Consumes: `assets/src/template.aseprite` (Task 1), `tools/export_sprites.sh` + `tools/build-index.js` (Task 2).
- Produces: the pose every later gear piece (Task 6) is drawn on top of. `data/equipment/body/base_medium.json` is the first real record Task 4's `registry.js` will load.

- [ ] **Step 1: Copy the template**

```bash
cp assets/src/template.aseprite assets/src/body/base_medium.aseprite
```

- [ ] **Step 2: Generate the body**

Open `assets/src/body/base_medium.aseprite` in Aseprite. On the `body_reference` layer (unlock it for this one file only — it's the actual art here, not a guide), use the PixelLab Aseprite plugin (or manually import Retro Diffusion output frame-by-frame) to generate all 14 frames of a mid-tone-skinned adventurer body in the idle/attack/hit/death poses, following the anchor guides on the `guides` layer. Re-lock `guides`.

- [ ] **Step 3: Clean up**

`Sprite → Color Mode → Indexed` against `assets/src/palette.gpl` to snap every pixel to the shared palette. Manually fix any anti-aliased or off-palette edge pixels. Confirm a clean 1px dark outline on every frame. Confirm the `attack` tag's frame 3 (0-indexed 2) shows the visible strike pose.

- [ ] **Step 4: Export**

```bash
bash tools/export_sprites.sh
```

Confirm `assets/characters/player/body/base_medium.png` and `.json` were created and `data/index.json` now lists nothing yet under `equipment` (the equipment *record*, not the sheet, is what the index tracks — added next step).

- [ ] **Step 5: Write the data record**

```json
// data/equipment/body/base_medium.json
{
  "id": "base_medium",
  "slot": "body",
  "displayName": "Adventurer (medium)",
  "sheet": "assets/characters/player/body/base_medium.json"
}
```

```bash
node tools/build-index.js
```

Confirm `data/index.json` now has `"equipment": { "body": ["base_medium"] }`.

- [ ] **Step 6: Record the licence**

Append a row to `assets/LICENSES.md`:

```markdown
| `body/base_medium` | PixelLab (Aseprite plugin) | <model/version used> | 2026-09-15 | <licence terms, verified at generation time> | base body pose for all gear |
```

- [ ] **Step 7: Commit**

```bash
git add assets/src/body/base_medium.aseprite assets/characters/player/body/base_medium.png assets/characters/player/body/base_medium.png.json data/equipment/body/base_medium.json data/index.json assets/LICENSES.md
git commit -m "$(cat <<'EOF'
feat(art): add base_medium player body

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Loader, registry, appearance, rig

**Gate:** ▶ No Aseprite required — pure JS, tested against hand-written fixtures and dependency-injected fakes.

**Files:**
- Create: `vendor/pixi.min.mjs` (vendored)
- Modify: `vendor/README.md`
- Create: `vitest.config.js`
- Create: `src/sprites/aseprite-loader.js`
- Create: `src/data/registry.js`
- Create: `src/data/character-appearance.js`
- Create: `src/sprites/character-rig.js`
- Modify: `package.json`
- Test: `test/aseprite-loader.test.js`, `test/registry.test.js`, `test/character-appearance.test.js`, `test/character-rig.test.js`
- Test fixture: `test/fixtures/sheets/mini.json`

**Interfaces:**
- Produces (exact signatures relied on by Task 5 and Task 9):
  ```js
  // src/sprites/aseprite-loader.js
  export async function loadAsepriteSheet(jsonUrl)
  // Returns { textures: {frameName: Texture}, animations: {tagName: Texture[]}, fps: {tagName: number} }

  // src/data/registry.js
  export async function loadRegistry()
  export function getItem(slot, id)        // EquipmentItem | null
  export function getItemsForSlot(slot)    // EquipmentItem[]
  export function getMob(id)               // MobDefinition | null

  // src/data/character-appearance.js
  export const SLOT_ORDER  // ["body","legs","chest","hair","head","weapon"]
  export function defaultAppearance()      // { body: "base_medium", legs: "", chest: "", hair: "", head: "", weapon: "" }
  export function sanitizeAppearance(raw)  // same shape, unknown ids dropped

  // src/sprites/character-rig.js
  export class CharacterRig extends PIXI.Container {
    static IMPACT_FRAME
    constructor()
    async applyAppearance(appearance)
    async applyMob(mobDefinition)
    play(animName)          // returns a Promise
    faceLeft(bool)
    // emits "attackImpact" and "animationFinished" (animName)
  }
  ```

- [ ] **Step 1: Vendor PixiJS 8**

```bash
node -e "fetch('https://registry.npmjs.org/pixi.js/latest').then(r=>r.json()).then(p=>console.log(p.version))"
```

Note the printed version (call it `X.Y.Z`), then:

```bash
curl -o vendor/pixi.min.mjs "https://unpkg.com/pixi.js@X.Y.Z/dist/pixi.min.mjs"
```

(Replace `X.Y.Z` with the version you just resolved.) Add a row to `vendor/README.md`:

```markdown
| `pixi.min.mjs` | PixiJS | X.Y.Z | MIT | https://unpkg.com/pixi.js@X.Y.Z/dist/pixi.min.mjs |
```

- [ ] **Step 2: Install Vitest and configure it**

```bash
npm install --save-dev vitest
```

```js
// vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

(`environment: "node"` is enough because every test below either avoids constructing a real `PIXI.Application`/renderer, or injects fakes in place of real textures — see the contingency note at the end of Step 8 if that assumption turns out wrong for the vendored version.)

- [ ] **Step 3: Write the failing test for `aseprite-loader.js`**

```json
// test/fixtures/sheets/mini.json
{
  "frames": [
    { "filename": "idle_0", "frame": { "x": 0, "y": 0, "w": 64, "h": 64 }, "duration": 167 },
    { "filename": "idle_1", "frame": { "x": 64, "y": 0, "w": 64, "h": 64 }, "duration": 167 },
    { "filename": "attack_0", "frame": { "x": 0, "y": 64, "w": 64, "h": 64 }, "duration": 100 },
    { "filename": "attack_1", "frame": { "x": 64, "y": 64, "w": 64, "h": 64 }, "duration": 100 }
  ],
  "meta": {
    "image": "mini.png",
    "size": { "w": 128, "h": 128 },
    "frameTags": [
      { "name": "idle", "from": 0, "to": 1, "direction": "forward" },
      { "name": "attack", "from": 2, "to": 3, "direction": "forward" }
    ]
  }
}
```

```js
// test/aseprite-loader.test.js
import { describe, it, expect, vi } from "vitest";
import { loadAsepriteSheet } from "../src/sprites/aseprite-loader.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "sheets", "mini.json");

describe("loadAsepriteSheet", () => {
  it("builds textures, animations and fps from an aseprite json-array export", async () => {
    const fixtureJson = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    const fakeTexture = (label) => ({ __fake: label });
    const sheet = await loadAsepriteSheet(FIXTURE, {
      fetchImpl: async () => ({ json: async () => fixtureJson }),
      loadTexture: async (url) => ({ __baseTexture: url }),
      sliceTexture: (baseTexture, frame) => fakeTexture(`${baseTexture.__baseTexture}@${frame.x},${frame.y}`),
    });

    expect(Object.keys(sheet.textures)).toEqual(["idle_0", "idle_1", "attack_0", "attack_1"]);
    expect(sheet.animations.idle).toEqual([sheet.textures.idle_0, sheet.textures.idle_1]);
    expect(sheet.animations.attack).toEqual([sheet.textures.attack_0, sheet.textures.attack_1]);
    expect(sheet.fps).toEqual({ idle: Math.round(1000 / 167), attack: 1000 / 100 });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run test/aseprite-loader.test.js
```

Expected: FAIL — `src/sprites/aseprite-loader.js` doesn't exist.

- [ ] **Step 5: Write `src/sprites/aseprite-loader.js`**

```js
// Turns one Aseprite `--format json-array --split-tags` export into PixiJS
// textures/animations. No frame numbers are hard-coded anywhere else in the
// game — everything comes from the exported JSON's frameTags.
import * as PIXI from "../../vendor/pixi.min.mjs";

async function defaultLoadTexture(url) {
  return PIXI.Assets.load(url);
}

function defaultSliceTexture(baseTexture, frame) {
  return new PIXI.Texture({
    source: baseTexture.source,
    frame: new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h),
  });
}

export async function loadAsepriteSheet(
  jsonUrl,
  { fetchImpl = fetch, loadTexture = defaultLoadTexture, sliceTexture = defaultSliceTexture } = {}
) {
  const res = await fetchImpl(jsonUrl);
  const json = await res.json();

  const imageUrl = new URL(json.meta.image, new URL(jsonUrl, "file:///")).href.replace(/^file:\/\//, "");
  const baseTexture = await loadTexture(imageUrl);

  const textures = {};
  for (const frame of json.frames) {
    textures[frame.filename] = sliceTexture(baseTexture, frame.frame);
  }

  const animations = {};
  const fps = {};
  for (const tag of json.meta.frameTags) {
    const tagFrames = json.frames.slice(tag.from, tag.to + 1);
    animations[tag.name] = tagFrames.map((f) => textures[f.filename]);
    fps[tag.name] = 1000 / tagFrames[0].duration;
  }

  return { textures, animations, fps };
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run test/aseprite-loader.test.js
```

Expected: PASS.

Note: `sheet.fps.idle` in the test above is written as `Math.round(1000 / 167)` only because `1000/167` isn't a clean float — assert it loosely. If that equality is flaky on your machine, change the assertion to `expect(sheet.fps.idle).toBeCloseTo(1000 / 167)`.

- [ ] **Step 7: Write the failing test for `registry.js`**

```js
// test/registry.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

const INDEX = { equipment: { chest: ["iron_plate"] }, mobs: ["slime_green"] };
const IRON_PLATE = { id: "iron_plate", slot: "chest", displayName: "Iron Plate", sheet: "assets/characters/player/chest/iron_plate.json" };
const SLIME = { id: "slime_green", displayName: "Green Slime", isBoss: false, sheet: "assets/characters/mobs/slime_green.json", cardsToKill: 3, xpReward: 10 };

function fakeFetch(routes) {
  return vi.fn(async (url) => ({ json: async () => routes[url] }));
}

describe("registry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads the index and every referenced item/mob file", async () => {
    global.fetch = fakeFetch({
      "data/index.json": INDEX,
      "data/equipment/chest/iron_plate.json": IRON_PLATE,
      "data/mobs/slime_green.json": SLIME,
    });
    const { loadRegistry, getItem, getItemsForSlot, getMob } = await import("../src/data/registry.js");

    await loadRegistry();

    expect(getItem("chest", "iron_plate")).toEqual(IRON_PLATE);
    expect(getItemsForSlot("chest")).toEqual([IRON_PLATE]);
    expect(getMob("slime_green")).toEqual(SLIME);
  });

  it("returns null and warns for unknown ids", async () => {
    global.fetch = fakeFetch({ "data/index.json": { equipment: {}, mobs: [] } });
    const { loadRegistry, getItem, getMob } = await import("../src/data/registry.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadRegistry();

    expect(getItem("chest", "nope")).toBeNull();
    expect(getMob("nope")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

```bash
npx vitest run test/registry.test.js
```

Expected: FAIL — `src/data/registry.js` doesn't exist.

- [ ] **Step 9: Write `src/data/registry.js`**

```js
// Loads data/index.json once, then every equipment/mob JSON file it lists.
let state = null; // { equipment: {slot: {id: EquipmentItem}}, mobs: {id: MobDefinition} }

export async function loadRegistry() {
  const index = await fetch("data/index.json").then((r) => r.json());

  const equipment = {};
  for (const [slot, ids] of Object.entries(index.equipment)) {
    equipment[slot] = {};
    for (const id of ids) {
      equipment[slot][id] = await fetch(`data/equipment/${slot}/${id}.json`).then((r) => r.json());
    }
  }

  const mobs = {};
  for (const id of index.mobs) {
    mobs[id] = await fetch(`data/mobs/${id}.json`).then((r) => r.json());
  }

  state = { equipment, mobs };
  return state;
}

export function getItem(slot, id) {
  const item = state?.equipment?.[slot]?.[id];
  if (!item) {
    console.warn(`registry: unknown equipment ${slot}/${id}`);
    return null;
  }
  return item;
}

export function getItemsForSlot(slot) {
  return Object.values(state?.equipment?.[slot] ?? {});
}

export function getMob(id) {
  const mob = state?.mobs?.[id];
  if (!mob) {
    console.warn(`registry: unknown mob ${id}`);
    return null;
  }
  return mob;
}
```

- [ ] **Step 10: Run test to verify it passes**

```bash
npx vitest run test/registry.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 11: Write the failing test for `character-appearance.js`**

```js
// test/character-appearance.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/data/registry.js", () => ({
  getItem: vi.fn((slot, id) => (id === "unknown_item" ? null : { id, slot })),
}));

import { SLOT_ORDER, defaultAppearance, sanitizeAppearance } from "../src/data/character-appearance.js";
import { getItem } from "../src/data/registry.js";

describe("character-appearance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SLOT_ORDER matches the spec's draw order", () => {
    expect(SLOT_ORDER).toEqual(["body", "legs", "chest", "hair", "head", "weapon"]);
  });

  it("defaultAppearance starts with only a body equipped", () => {
    expect(defaultAppearance()).toEqual({ body: "base_medium", legs: "", chest: "", hair: "", head: "", weapon: "" });
  });

  it("keeps known ids and drops unknown ones, falling back body to base_medium", () => {
    const raw = { body: "unknown_item", legs: "iron_boots", chest: "", hair: "", head: "", weapon: "" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(sanitizeAppearance(raw)).toEqual({ body: "base_medium", legs: "iron_boots", chest: "", hair: "", head: "", weapon: "" });
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

```bash
npx vitest run test/character-appearance.test.js
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 13: Write `src/data/character-appearance.js`**

```js
import { getItem } from "./registry.js";

export const SLOT_ORDER = ["body", "legs", "chest", "hair", "head", "weapon"];

export function defaultAppearance() {
  return { body: "base_medium", legs: "", chest: "", hair: "", head: "", weapon: "" };
}

// Drops ids that no longer exist in the registry (e.g. an item was removed
// after a save was made). body falls back to base_medium rather than empty,
// since an empty body would render nothing at all.
export function sanitizeAppearance(raw) {
  const result = {};
  for (const slot of SLOT_ORDER) {
    const id = raw?.[slot] ?? "";
    if (id && getItem(slot, id)) {
      result[slot] = id;
    } else {
      if (id) console.warn(`character-appearance: dropping unknown ${slot}/${id}`);
      result[slot] = slot === "body" ? "base_medium" : "";
    }
  }
  return result;
}
```

- [ ] **Step 14: Run test to verify it passes**

```bash
npx vitest run test/character-appearance.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 15: Write the failing tests for `character-rig.js`**

```js
// test/character-rig.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as PIXI from "../vendor/pixi.min.mjs";

function fakeSheet(frameCounts) {
  const animations = {};
  for (const [tag, count] of Object.entries(frameCounts)) {
    animations[tag] = Array.from({ length: count }, () => PIXI.Texture.EMPTY);
  }
  return { textures: {}, animations, fps: { idle: 6, attack: 10, hit: 10, death: 8 } };
}

vi.mock("../src/sprites/aseprite-loader.js", () => ({
  loadAsepriteSheet: vi.fn(async () => fakeSheet({ idle: 4, attack: 4, hit: 2, death: 4 })),
}));
vi.mock("../src/data/registry.js", () => ({
  getItem: vi.fn((slot, id) => ({ id, slot, sheet: `assets/characters/player/${slot}/${id}.json` })),
}));

import { CharacterRig } from "../src/sprites/character-rig.js";
import { loadAsepriteSheet } from "../src/sprites/aseprite-loader.js";

describe("CharacterRig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only the slots present in the appearance", async () => {
    const rig = new CharacterRig();
    await rig.applyAppearance({ body: "base_medium", legs: "", chest: "iron_plate", hair: "", head: "", weapon: "" });

    const bySlot = Object.fromEntries(rig.children.map((c) => [c.__slot, c.visible]));
    expect(bySlot.body).toBe(true);
    expect(bySlot.chest).toBe(true);
    expect(bySlot.legs).toBe(false);
  });

  it("applyMob shows only the body layer", async () => {
    const rig = new CharacterRig();
    await rig.applyMob({ id: "slime_green", sheet: "assets/characters/mobs/slime_green.json" });

    const bySlot = Object.fromEntries(rig.children.map((c) => [c.__slot, c.visible]));
    expect(bySlot.body).toBe(true);
    expect(bySlot.legs).toBe(false);
    expect(bySlot.weapon).toBe(false);
  });

  it("emits attackImpact exactly once when play('attack') reaches the impact frame", async () => {
    const rig = new CharacterRig();
    await rig.applyMob({ id: "slime_green", sheet: "x.json" });
    const body = rig.children.find((c) => c.__slot === "body");

    const impacts = [];
    rig.on("attackImpact", () => impacts.push(true));

    const playPromise = rig.play("attack");
    body.onFrameChange?.(CharacterRig.IMPACT_FRAME);
    body.onFrameChange?.(CharacterRig.IMPACT_FRAME); // frame-change fires once per real frame; a second call should not double-count if already on that frame
    body.onComplete?.();
    await playPromise;

    expect(impacts.length).toBeGreaterThanOrEqual(1);
  });

  it("faceLeft flips the container, never a layer", () => {
    const rig = new CharacterRig();
    rig.faceLeft(true);
    expect(rig.scale.x).toBe(-1);
    for (const layer of rig.children) expect(layer.scale.x).toBe(1);
    rig.faceLeft(false);
    expect(rig.scale.x).toBe(1);
  });
});
```

- [ ] **Step 16: Run tests to verify they fail**

```bash
npx vitest run test/character-rig.test.js
```

Expected: FAIL — `src/sprites/character-rig.js` doesn't exist.

- [ ] **Step 17: Write `src/sprites/character-rig.js`**

```js
import * as PIXI from "../../vendor/pixi.min.mjs";
import { loadAsepriteSheet } from "./aseprite-loader.js";
import { getItem } from "../data/registry.js";

export const SLOT_ORDER = ["body", "legs", "chest", "hair", "head", "weapon"];
const LOOPING = new Set(["idle"]);

function offsetFor(frameTexture) {
  // §3: 64px sheets anchor feet at (32,56); 128px boss sheets at (64,112).
  const isBoss = frameTexture && frameTexture.width > 64;
  return isBoss ? { x: -64, y: -112 } : { x: -32, y: -56 };
}

export class CharacterRig extends PIXI.Container {
  static IMPACT_FRAME = 2;

  constructor() {
    super();
    this._currentAnim = null;
    for (const slot of SLOT_ORDER) {
      const layer = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
      layer.__slot = slot;
      layer.visible = false;
      layer.__animations = null;
      layer.__fps = null;
      this.addChild(layer);
    }
  }

  _layer(slot) {
    return this.children.find((c) => c.__slot === slot);
  }

  async _loadIntoLayer(slot, item) {
    const layer = this._layer(slot);
    const sheet = await loadAsepriteSheet(item.sheet);
    layer.__animations = sheet.animations;
    layer.__fps = sheet.fps;
    layer.visible = true;

    const firstFrame = Object.values(sheet.textures)[0];
    const offset = offsetFor(firstFrame);
    layer.position.set(offset.x, offset.y);

    if (slot === "body") {
      this._bodyFrameCounts = Object.fromEntries(Object.entries(sheet.animations).map(([k, v]) => [k, v.length]));
    } else if (this._bodyFrameCounts) {
      for (const [tag, frames] of Object.entries(sheet.animations)) {
        if (this._bodyFrameCounts[tag] !== frames.length) {
          console.error(`CharacterRig: ${slot} animation "${tag}" has ${frames.length} frames, body has ${this._bodyFrameCounts[tag]}`);
          layer.visible = false;
        }
      }
    }
  }

  async applyAppearance(appearance) {
    for (const slot of SLOT_ORDER) {
      const id = appearance[slot];
      const layer = this._layer(slot);
      if (!id) {
        layer.visible = false;
        continue;
      }
      const item = getItem(slot, id);
      if (!item) {
        layer.visible = false;
        continue;
      }
      await this._loadIntoLayer(slot, item);
    }
  }

  async applyMob(mobDefinition) {
    for (const slot of SLOT_ORDER) {
      if (slot !== "body") this._layer(slot).visible = false;
    }
    await this._loadIntoLayer("body", mobDefinition);
  }

  play(animName) {
    const body = this._layer("body");
    this._currentAnim = animName;
    const loop = LOOPING.has(animName);

    for (const layer of this.children) {
      if (!layer.visible || !layer.__animations?.[animName]) continue;
      layer.textures = layer.__animations[animName];
      layer.loop = loop;
      layer.animationSpeed = (layer.__fps[animName] ?? 10) / 60;
      layer.gotoAndPlay(0);
    }

    if (loop) return Promise.resolve();

    return new Promise((resolve) => {
      let firedImpact = false;
      body.onFrameChange = (frame) => {
        if (this._currentAnim === "attack" && frame === CharacterRig.IMPACT_FRAME && !firedImpact) {
          firedImpact = true;
          this.emit("attackImpact");
        }
      };
      body.onComplete = () => {
        this.emit("animationFinished", animName);
        resolve();
      };
    });
  }

  faceLeft(shouldFaceLeft) {
    this.scale.x = shouldFaceLeft ? -1 : 1;
  }
}
```

- [ ] **Step 18: Run tests to verify they pass**

```bash
npx vitest run test/character-rig.test.js
```

Expected: PASS (4 tests). If `PIXI.AnimatedSprite`/`PIXI.Container` throw at construction time under plain Node (some Pixi versions touch `navigator`/`OffscreenCanvas` at module load), install `jsdom` (`npm install --save-dev jsdom`) and change `environment: "node"` to `environment: "jsdom"` in `vitest.config.js`, then re-run. This is the one place in this plan where the fix depends on exactly which PixiJS patch version got vendored in Step 1.

- [ ] **Step 19: Run the full suite and commit**

```bash
npx vitest run
```

Expected: all tests from this task and Task 2 pass.

```bash
git add vendor/pixi.min.mjs vendor/README.md vitest.config.js src/sprites/aseprite-loader.js src/data/registry.js src/data/character-appearance.js src/sprites/character-rig.js test/aseprite-loader.test.js test/registry.test.js test/character-appearance.test.js test/character-rig.test.js test/fixtures/sheets/mini.json package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(art): add sprite loader, registry, appearance and CharacterRig

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dev rig gallery

**Gate:** ▶ Code has no Aseprite dependency. Visually empty until Task 3's `base_medium` exists — the checked-in steps below still land now; the manual look-and-feel check is deferred to the note at the end.

**Files:**
- Create: `dev/rig-gallery.html`
- Create: `dev/rig-gallery.js`

**Interfaces:**
- Consumes: `loadRegistry`, `getItemsForSlot`, `getMob` (Task 4 `registry.js`), `defaultAppearance` (Task 4 `character-appearance.js`), `CharacterRig` (Task 4 `character-rig.js`).
- Produces: nothing other tasks depend on — this is a standalone artist tool, not shipped (per spec §8, "Not shipped").

- [ ] **Step 1: Write `dev/rig-gallery.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cardslayer — Rig Gallery (dev only)</title>
  <style>
    body { background: #111; color: #eee; font-family: sans-serif; margin: 0; padding: 16px; }
    #grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .cell { border: 1px solid #333; padding: 8px; text-align: center; }
    canvas { image-rendering: pixelated; background: #222; }
    button { margin: 2px; }
  </style>
</head>
<body>
  <h1>Rig Gallery</h1>
  <p>Every equipped item on every body, cycling idle → attack → hit → death. Dev-only, not shipped.</p>
  <div id="grid"></div>
  <script type="module" src="./rig-gallery.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `dev/rig-gallery.js`**

```js
import * as PIXI from "../vendor/pixi.min.mjs";
import { loadRegistry, getItemsForSlot, getItem } from "../src/data/registry.js";
import { defaultAppearance, SLOT_ORDER } from "../src/data/character-appearance.js";
import { CharacterRig } from "../src/sprites/character-rig.js";

const ANIMS = ["idle", "attack", "hit", "death"];

async function makeCell(appearance, label) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.innerHTML = `<div>${label}</div>`;

  const app = new PIXI.Application();
  await app.init({ width: 96, height: 96, background: "#222" });
  cell.appendChild(app.canvas);

  const rig = new CharacterRig();
  rig.position.set(48, 80);
  app.stage.addChild(rig);
  await rig.applyAppearance(appearance);

  let animIndex = 0;
  const cycle = async () => {
    await rig.play(ANIMS[animIndex]);
    animIndex = (animIndex + 1) % ANIMS.length;
    if (ANIMS[animIndex] === "idle") rig.play("idle"); // resumes looping idle before the next non-looping cycle
    setTimeout(cycle, 1200);
  };
  cycle();

  return cell;
}

async function main() {
  await loadRegistry();
  const grid = document.getElementById("grid");

  for (const bodyId of ["base_light", "base_medium", "base_dark"]) {
    if (!getItem("body", bodyId)) continue; // skip bodies not produced yet (Task 6)
    const base = { ...defaultAppearance(), body: bodyId };
    grid.appendChild(await makeCell(base, bodyId));

    for (const slot of SLOT_ORDER) {
      if (slot === "body") continue;
      for (const item of getItemsForSlot(slot)) {
        grid.appendChild(await makeCell({ ...base, [slot]: item.id }, `${bodyId} + ${item.id}`));
      }
    }
  }
}

main();
```

- [ ] **Step 3: Manual verification (deferred until at least Task 3 exists)**

```bash
npm start
```

Open `http://localhost:5173/dev/rig-gallery.html`. Once Task 3 has landed you should see one cell for `base_medium` cycling its four animations; once Task 6 lands you'll see one cell per item. Leave unchecked until then.

- [ ] **Step 4: Commit**

```bash
git add dev/rig-gallery.html dev/rig-gallery.js
git commit -m "$(cat <<'EOF'
feat(art): add dev rig gallery for visual QA of sprites

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: One item per slot + `base_light`/`base_dark`

**Gate:** ⏸ Needs Task 1's templates, Task 3's `base_medium` (silhouette reference), and the AI art tool.

**Files:**
- Create: `assets/src/legs/<item>.aseprite`, `assets/src/chest/<item>.aseprite`, `assets/src/hair/<item>.aseprite`, `assets/src/head/<item>.aseprite`, `assets/src/weapon/<item>.aseprite`
- Create: `assets/src/body/base_light.aseprite`, `assets/src/body/base_dark.aseprite`
- Create: matching `assets/characters/player/<slot>/<item>.png` + `.json` (generated)
- Create: matching `data/equipment/<slot>/<item>.json`
- Modify: `assets/LICENSES.md`

**Interfaces:**
- Consumes: `assets/src/template.aseprite`, `assets/src/body/base_medium.aseprite` (silhouette reference), `tools/export_sprites.sh`, `tools/build-index.js`.
- Produces: enough real data for Task 5's gallery and Task 9's battle screen to show a fully-dressed player.

- [ ] **Step 1: Produce `base_light` and `base_dark`**

Following spec §4.3 (same silhouette/pose as `base_medium`, only skin tone changes): copy `template.aseprite` twice to `assets/src/body/base_light.aseprite` and `assets/src/body/base_dark.aseprite`, generate + clean up each per §5.2 steps 2–4, using `base_medium`'s pose as the reference layer instead of the template's placeholder. Export (`bash tools/export_sprites.sh`) and add `data/equipment/body/base_light.json` / `base_dark.json` (same shape as `data/equipment/body/base_medium.json`, Task 3 Step 5).

- [ ] **Step 2: Produce one item for each of the five optional slots**

For each of `legs`, `chest`, `hair`, `head`, `weapon`: pick one concrete item (e.g. `iron_boots`, `iron_plate`, `short_hair`, `wizard_hat`, `iron_sword`). For each, follow spec §5.2 steps 1–5: copy `template.aseprite` to `assets/src/<slot>/<item_id>.aseprite`, generate on top of the visible `base_medium` reference, clean up (snap to palette, verify outline, and for `weapon` specifically confirm the strike lands on `attack` frame 3), delete every layer except that item's own slot layer, export.

- [ ] **Step 3: Write the data records**

One `data/equipment/<slot>/<item_id>.json` per item, same shape as Task 3 Step 5, e.g.:

```json
// data/equipment/weapon/iron_sword.json
{ "id": "iron_sword", "slot": "weapon", "displayName": "Iron Sword", "sheet": "assets/characters/player/weapon/iron_sword.json" }
```

```bash
node tools/build-index.js
```

- [ ] **Step 4: Record licences**

Append one row per new asset to `assets/LICENSES.md` (same format as Task 3 Step 6).

- [ ] **Step 5: Manual verification**

```bash
npm start
```

Open `http://localhost:5173/dev/rig-gallery.html` (Task 5) and confirm all three bodies and every new item render and cycle through their four animations without console errors.

- [ ] **Step 6: Commit**

```bash
git add assets/src assets/characters data/equipment data/index.json assets/LICENSES.md
git commit -m "$(cat <<'EOF'
feat(art): add base_light/base_dark bodies and one item per equipment slot

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Asset validator

**Gate:** ▶ No Aseprite required — pure Node, tested against small hand-made fixture PNGs.

**Files:**
- Create: `tools/validate-assets.js`
- Modify: `package.json`
- Test: `test/validate-assets.test.js`
- Test fixtures: `test/fixtures/validate/` (a tiny valid and a tiny invalid asset tree, built in Step 1)

**Interfaces:**
- Consumes: `buildIndex` (Task 2 `tools/build-index.js`), the frame/animation constraints from the Global Constraints section above.
- Produces: `npm run validate:assets`, intended to also run in CI later.

- [ ] **Step 1: Install `pngjs` and build fixture PNGs**

```bash
npm install --save-dev pngjs
```

```js
// test/fixtures/validate/make-fixtures.mjs — run once to (re)generate the fixture PNGs, not itself a test
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

const PALETTE = [
  [0, 0, 0, 0], // transparent
  [20, 20, 20, 255], // outline
  [200, 150, 120, 255], // skin
];

function writeSolidPng(filePath, w, h, rgba) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

const root = path.join(import.meta.dirname, "valid", "assets", "characters", "player", "body");
writeSolidPng(path.join(root, "base_medium.png"), 64, 896, PALETTE[2]); // 14 frames tall, one colour, in-palette

const badRoot = path.join(import.meta.dirname, "invalid-color", "assets", "characters", "player", "body");
writeSolidPng(path.join(badRoot, "base_medium.png"), 64, 896, [1, 2, 3, 255]); // not in palette
```

```bash
node test/fixtures/validate/make-fixtures.mjs
```

```gpl
# test/fixtures/validate/palette.gpl
GIMP Palette
Name: test
Columns: 0
#
0 0 0 outline
20 20 20 outline
200 150 120 skin
```

```json
// test/fixtures/validate/valid/assets/characters/player/body/base_medium.json
{
  "frames": [],
  "meta": { "image": "base_medium.png", "size": { "w": 64, "h": 896 }, "frameTags": [
    { "name": "idle", "from": 0, "to": 3, "direction": "forward" },
    { "name": "attack", "from": 4, "to": 7, "direction": "forward" },
    { "name": "hit", "from": 8, "to": 9, "direction": "forward" },
    { "name": "death", "from": 10, "to": 13, "direction": "forward" }
  ] }
}
```

```json
// test/fixtures/validate/valid/data/equipment/body/base_medium.json
{ "id": "base_medium", "slot": "body", "displayName": "Adventurer", "sheet": "assets/characters/player/body/base_medium.json" }
```

Copy the same two JSON files (unchanged) into `test/fixtures/validate/invalid-color/data/equipment/body/base_medium.json` and `.../invalid-color/assets/characters/player/body/base_medium.json` — only the PNG's colour differs between the two fixture trees.

- [ ] **Step 2: Write the failing test**

```js
// test/validate-assets.test.js
import { describe, it, expect } from "vitest";
import { validateAssets } from "../tools/validate-assets.js";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "validate");

describe("validateAssets", () => {
  it("passes a tree where every png+json pair is well-formed and in-palette", () => {
    const errors = validateAssets(path.join(FIXTURES, "valid"), path.join(FIXTURES, "palette.gpl"));
    expect(errors).toEqual([]);
  });

  it("flags a png that uses a colour outside the shared palette", () => {
    const errors = validateAssets(path.join(FIXTURES, "invalid-color"), path.join(FIXTURES, "palette.gpl"));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/palette/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run test/validate-assets.test.js
```

Expected: FAIL — `tools/validate-assets.js` doesn't exist.

- [ ] **Step 4: Write `tools/validate-assets.js`**

```js
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const REQUIRED_TAGS = { idle: 4, attack: 4, hit: 2, death: 4 };

function parsePalette(gplPath) {
  const lines = fs.readFileSync(gplPath, "utf8").split("\n");
  const colors = new Set();
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)/);
    if (m) colors.add(`${m[1]},${m[2]},${m[3]}`);
  }
  return colors;
}

function pngColorsInPalette(pngPath, palette) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const bad = [];
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
    if (a === 0) continue; // fully transparent is always allowed
    if (!palette.has(`${r},${g},${b}`)) {
      bad.push(`${pngPath}: colour ${r},${g},${b} at pixel ${i / 4} is not in palette.gpl`);
      break; // one report per file is enough
    }
  }
  return bad;
}

export function validateAssets(rootDir, palettePath) {
  const errors = [];
  const palette = parsePalette(palettePath);
  const charactersDir = path.join(rootDir, "assets", "characters");

  function* walkPngs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walkPngs(full);
      else if (entry.name.endsWith(".png")) yield full;
    }
  }

  for (const pngPath of walkPngs(charactersDir)) {
    const jsonPath = pngPath.replace(/\.png$/, ".json");
    if (!fs.existsSync(jsonPath)) {
      errors.push(`${pngPath}: missing sibling .json`);
      continue;
    }
    const sheet = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const tags = Object.fromEntries(sheet.meta.frameTags.map((t) => [t.name, t.to - t.from + 1]));
    for (const [tag, count] of Object.entries(REQUIRED_TAGS)) {
      if (tags[tag] !== count) {
        errors.push(`${jsonPath}: tag "${tag}" has ${tags[tag] ?? 0} frames, expected ${count}`);
      }
    }
    const expectedSize = pngPath.includes(`${path.sep}mobs${path.sep}`) && sheet.isBoss ? 128 : 64;
    // Frame size is checked from the exported json's own frame entries when present;
    // sheets built only from meta (like this validator's own fixtures) skip that check.
    if (Array.isArray(sheet.frames) && sheet.frames.length) {
      for (const frame of sheet.frames) {
        if (frame.frame.w !== expectedSize || frame.frame.h !== expectedSize) {
          errors.push(`${jsonPath}: frame "${frame.filename}" is ${frame.frame.w}x${frame.frame.h}, expected ${expectedSize}x${expectedSize}`);
        }
      }
    }
    errors.push(...pngColorsInPalette(pngPath, palette));
  }

  return errors;
}

function main() {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const errors = validateAssets(repoRoot, path.join(repoRoot, "assets", "src", "palette.gpl"));
  if (errors.length) {
    console.error(`validate:assets found ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("validate:assets: all clear.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run test/validate-assets.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 6: Wire up the npm script**

Edit `package.json` `"scripts"`:

```json
"validate:assets": "node tools/validate-assets.js"
```

- [ ] **Step 7: Commit**

```bash
git add tools/validate-assets.js test/validate-assets.test.js test/fixtures/validate package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(art): add validate-assets script for palette/frame/tag checks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Manual verification (deferred until Task 3 exists)**

Once real assets exist, run `npm run validate:assets` against the real repo tree and confirm it reports clean.

---

### Task 8: Two mobs

**Gate:** ⏸ Needs Task 1's `template_boss.aseprite`, Task 2's export script, and the AI art tool.

**Files:**
- Create: `assets/src/mobs/<normal_mob_id>.aseprite`, `assets/src/mobs/<boss_mob_id>.aseprite`
- Create: matching `assets/characters/mobs/<id>.png` + `.json` (generated)
- Create: `data/mobs/<normal_mob_id>.json`, `data/mobs/<boss_mob_id>.json`
- Modify: `assets/LICENSES.md`

**Interfaces:**
- Consumes: `assets/src/template.aseprite`, `assets/src/template_boss.aseprite` (Task 1), `tools/export_sprites.sh`, `tools/build-index.js` (Task 2).
- Produces: real mob records for Task 9's `battle-scene.js` to fight against, replacing `MONSTERS` in `app.js`.

- [ ] **Step 1: Produce one normal mob**

E.g. `slime_green`, matching the existing `Forgetful Goblin`/`Cram Wraith` flavour from `app.js`'s current `MONSTERS` array. Copy `template.aseprite` to `assets/src/mobs/slime_green.aseprite`, generate the full mob on the single `sprite` layer (spec §5.3), same four tags/frame counts/anchor as the player template, clean up, export.

- [ ] **Step 2: Produce one boss mob**

E.g. `exam_dragon` (matches the existing `Exam Dragon` name in `app.js`). Copy `template_boss.aseprite` to `assets/src/mobs/exam_dragon.aseprite`, 128×128, generate + clean up + export the same way.

- [ ] **Step 3: Write the data records**

```json
// data/mobs/slime_green.json
{ "id": "slime_green", "displayName": "Green Slime", "isBoss": false, "sheet": "assets/characters/mobs/slime_green.json", "cardsToKill": 3, "xpReward": 10 }
```

```json
// data/mobs/exam_dragon.json
{ "id": "exam_dragon", "displayName": "Exam Dragon", "isBoss": true, "sheet": "assets/characters/mobs/exam_dragon.json", "cardsToKill": 50, "xpReward": 400 }
```

(`cardsToKill` follows the pitch deck's own balance: "squishy mob: 1–5 flashcards to kill, boss: 50+ cards" — pick concrete numbers in that range per mob.)

```bash
node tools/build-index.js
```

- [ ] **Step 4: Record licences**

Append rows for both mobs to `assets/LICENSES.md`.

- [ ] **Step 5: Manual verification**

```bash
npm run validate:assets
```

Expected: clean. Then open `dev/rig-gallery.html` — mobs aren't wired into the gallery (it's player-slot-oriented), so instead confirm visually in Aseprite that all 14 frames of each look correct before committing.

- [ ] **Step 6: Commit**

```bash
git add assets/src/mobs assets/characters/mobs data/mobs data/index.json assets/LICENSES.md
git commit -m "$(cat <<'EOF'
feat(art): add slime_green and exam_dragon mob sprites

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `battle-scene.js` and `app.js` hookup

**Gate:** ▶ Code + logic tests can be written now against Task 4's modules with mocked rigs. Full manual battle-screen verification needs Tasks 6 and 8's real assets — deferred, noted at the end.

**Files:**
- Create: `src/sprites/battle-scene.js`
- Modify: `index.html:330-332` (add one module script tag)
- Modify: `app.js` (`MONSTERS`, `startBattle`, `renderBattle`, `answer`, `endBattle`)
- Modify: `style.css` (`.monster` sizing)
- Test: `test/battle-scene.test.js`

**Interfaces:**
- Consumes: `CharacterRig` (Task 4 `character-rig.js`), `loadRegistry`/`getMob` (Task 4 `registry.js`), `defaultAppearance` (Task 4 `character-appearance.js`).
- Produces: `window.Cardslayer.BattleScene`, `window.Cardslayer.loadRegistry`, `window.Cardslayer.getMob`, `window.Cardslayer.defaultAppearance` — the bridge classic-script `app.js` uses to reach the new ES-module code (the project has no bundler, so `app.js` cannot use `import` directly; see Global Constraints).

- [ ] **Step 1: Write the failing test for `BattleScene`**

```js
// test/battle-scene.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRigInstances = [];
class MockRig {
  constructor() {
    this.calls = [];
    this.scale = { x: 1 };
    this.position = { set: vi.fn() };
    this._listeners = {};
    mockRigInstances.push(this);
  }
  on(event, cb) { (this._listeners[event] ??= []).push(cb); }
  emit(event, ...args) { (this._listeners[event] ?? []).forEach((cb) => cb(...args)); }
  async applyAppearance() { this.calls.push("applyAppearance"); }
  async applyMob() { this.calls.push("applyMob"); }
  play(anim) { this.calls.push(`play:${anim}`); return Promise.resolve(); }
  faceLeft(v) { this.calls.push(`faceLeft:${v}`); }
}

vi.mock("../src/sprites/character-rig.js", () => ({ CharacterRig: MockRig }));

import { BattleScene } from "../src/sprites/battle-scene.js";

describe("BattleScene", () => {
  beforeEach(() => { mockRigInstances.length = 0; });

  it("creates a player rig facing right and a mob rig facing left", async () => {
    const scene = new BattleScene({ mountElement: { appendChild: vi.fn() }, skipPixiApp: true });
    await scene.setMob({ id: "slime_green", sheet: "x.json" });

    expect(mockRigInstances).toHaveLength(2);
    expect(mockRigInstances[0].calls).toContain("faceLeft:false");
    expect(mockRigInstances[1].calls).toContain("faceLeft:true");
    expect(mockRigInstances[1].calls).toContain("applyMob");
  });

  it("playerAttack plays attack on the player rig and forwards attackImpact", async () => {
    const scene = new BattleScene({ mountElement: { appendChild: vi.fn() }, skipPixiApp: true });
    await scene.setMob({ id: "slime_green", sheet: "x.json" });

    const impacts = [];
    scene.on("playerImpact", () => impacts.push(true));
    const [playerRig] = mockRigInstances;
    const attackPromise = scene.playerAttack();
    playerRig.emit("attackImpact");
    await attackPromise;

    expect(impacts).toHaveLength(1);
    expect(playerRig.calls).toContain("play:attack");
  });

  it("mobDie plays death on the mob rig and resolves", async () => {
    const scene = new BattleScene({ mountElement: { appendChild: vi.fn() }, skipPixiApp: true });
    await scene.setMob({ id: "slime_green", sheet: "x.json" });
    const [, mobRig] = mockRigInstances;

    await scene.mobDie();

    expect(mobRig.calls).toContain("play:death");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/battle-scene.test.js
```

Expected: FAIL — `src/sprites/battle-scene.js` doesn't exist.

- [ ] **Step 3: Write `src/sprites/battle-scene.js`**

```js
import * as PIXI from "../../vendor/pixi.min.mjs";
import { CharacterRig } from "./character-rig.js";
import { defaultAppearance } from "../data/character-appearance.js";

// Owns one Pixi Application with a player rig (left, facing right) and a
// mob rig (right, facing left) inside the existing battle view's #monster
// element. skipPixiApp lets tests exercise the rig-orchestration logic
// without a real canvas/renderer.
export class BattleScene extends PIXI.utils.EventEmitter {
  constructor({ mountElement, skipPixiApp = false }) {
    super();
    this.playerRig = new CharacterRig();
    this.mobRig = new CharacterRig();
    this.playerRig.faceLeft(false);
    this.mobRig.faceLeft(true);

    if (!skipPixiApp) {
      this.app = new PIXI.Application();
      this._initPromise = this.app.init({ width: 220, height: 96, backgroundAlpha: 0 }).then(() => {
        mountElement.appendChild(this.app.canvas);
        this.playerRig.position.set(50, 88);
        this.mobRig.position.set(160, 88);
        this.app.stage.addChild(this.playerRig, this.mobRig);
      });
    } else {
      this._initPromise = Promise.resolve();
    }

    this.playerRig.on("attackImpact", () => this.emit("playerImpact"));
    this.mobRig.on("attackImpact", () => this.emit("mobImpact"));
  }

  async ready() {
    await this._initPromise;
  }

  async setPlayerAppearance(appearance = defaultAppearance()) {
    await this.ready();
    await this.playerRig.applyAppearance(appearance);
    this.playerRig.play("idle");
  }

  async setMob(mobDefinition) {
    await this.ready();
    await this.mobRig.applyMob(mobDefinition);
    this.mobRig.play("idle");
  }

  async playerAttack() {
    await this.playerRig.play("attack");
    this.playerRig.play("idle");
  }

  async mobAttack() {
    await this.mobRig.play("attack");
    this.mobRig.play("idle");
  }

  async mobDie() {
    await this.mobRig.play("death");
  }

  async playerDie() {
    await this.playerRig.play("death");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run test/battle-scene.test.js
```

Expected: PASS (3 tests). If `PIXI.utils.EventEmitter` isn't exported under that path in the PixiJS version vendored in Task 4 Step 1, use `PIXI.EventEmitter` instead (both names have existed across PixiJS 8 minor versions) — check `vendor/pixi.min.mjs`'s exports and adjust this one import to match.

- [ ] **Step 5: Add the module entry point to `index.html`**

`index.html:330-332` currently:

```html
  <script src="db.js?v=3"></script>
  <script src="anki-import.js?v=3"></script>
  <script src="app.js?v=3"></script>
```

Change to (module scripts are deferred automatically, so this still runs after the three classic scripts above regardless of position — but keep it last for readability):

```html
  <script src="db.js?v=3"></script>
  <script src="anki-import.js?v=3"></script>
  <script src="app.js?v=3"></script>
  <script type="module" src="src/sprites/bootstrap.js?v=1"></script>
```

Create the tiny bridge module `src/sprites/bootstrap.js` (this is the one file that reaches across the module/classic-script boundary, so `app.js` never needs `import`):

```js
import { BattleScene } from "./battle-scene.js";
import { loadRegistry, getMob } from "../data/registry.js";
import { defaultAppearance } from "../data/character-appearance.js";

window.Cardslayer = { BattleScene, loadRegistry, getMob, defaultAppearance };
```

- [ ] **Step 6: Replace `MONSTERS` and the emoji arena in `app.js`**

Replace `app.js:257-263` (the `MONSTERS` array):

```js
// ================= BATTLE =================
let mobIds = []; // populated from the registry once loaded (Cardslayer.loadRegistry)
```

Replace `app.js:268-294` (`renderers.battle`) — same deck-listing body as before, with one addition: load the registry once before it's needed.

```js
renderers.battle = async () => {
  if (battle) return renderBattle();
  if (!mobIds.length) {
    const registry = await window.Cardslayer.loadRegistry();
    mobIds = registry.mobs.filter((id) => !window.Cardslayer.getMob(id).isBoss);
  }
  const decks = await DB.listDecks();
  const root = $("#battleRoot");
  if (!decks.length) {
    root.replaceChildren(
      el("div", { class: "panel empty-state" },
        "Import a deck to find monsters to fight.",
        el("br"),
        el("button", { class: "btn-small", onclick: () => go("import") }, "Import Deck")
      )
    );
    return;
  }
  root.replaceChildren(
    ...decks.map((d) =>
      el("div", { class: "panel deck-card" },
        el("div", { class: "deck-icon" }, "⚔️"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards`)
        ),
        el("button", { class: "btn-small", onclick: () => startBattle(d.id) }, "Fight")
      )
    )
  );
};
```

Replace `app.js:296-315` (`startBattle`) — `MONSTERS[Math.floor(...)]` becomes a real mob record, and `cardsToKill` — not `SESSION_SIZE` — decides mob HP:

```js
async function startBattle(deckId) {
  const cards = await DB.cardsForDeck(deckId);
  const now = Date.now();
  const due = cards.filter((c) => c.reps > 0 && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = cards.filter((c) => c.reps === 0);
  const mobId = mobIds[Math.floor(Math.random() * mobIds.length)];
  const mob = window.Cardslayer.getMob(mobId);
  const queue = [...due, ...fresh].slice(0, mob.cardsToKill);
  if (!queue.length) queue.push(...cards.sort((a, b) => a.due - b.due).slice(0, mob.cardsToKill));

  battle = {
    deckId,
    queue,
    total: queue.length,
    defeated: 0,
    hearts: MAX_HEARTS,
    revealed: false,
    mob,
    scene: null,
  };
  go("battle");
}
```

Replace `app.js:317-355` (`renderBattle`) — `#monster` becomes a canvas host instead of an emoji div, and the mob's display name/HP replace `battle.monster`:

```js
function renderBattle() {
  const root = $("#battleRoot");
  const card = battle.queue[0];
  const hpPct = ((battle.total - battle.defeated) / battle.total) * 100;
  const alreadyMounted = !!battle.scene;

  const arena = el("div", { class: "panel arena" },
    el("div", { class: "monster-row" },
      el("div", { class: "monster", id: "monster" }),
      el("div", { style: "flex:1" },
        el("div", { class: "hp-label" },
          el("strong", { style: "color:#fff" }, battle.mob.displayName),
          el("span", {}, `${battle.total - battle.defeated} / ${battle.total} HP`)
        ),
        el("div", { class: "hp" }, el("div", { style: `width:${hpPct}%` })),
        el("div", { class: "hearts" }, "❤️".repeat(battle.hearts) + "🖤".repeat(MAX_HEARTS - battle.hearts))
      )
    ),
    el("div", { class: "flashcard", style: "white-space:pre-line" },
      card.front,
      battle.revealed ? el("div", { class: "answer" }, card.back || "—") : null
    ),
    battle.revealed
      ? el("div", { class: "answer-actions" },
          ...[
            ["again", "Again", "miss"],
            ["hard", "Hard", "7 dmg"],
            ["good", "Good", "10 dmg"],
            ["easy", "Easy", "crit!"],
          ].map(([grade, label, sub]) =>
            el("button", { class: `a-${grade}`, onclick: () => answer(grade) }, label, el("small", {}, sub))
          )
        )
      : el("button", { class: "btn-primary reveal-btn", onclick: () => { battle.revealed = true; renderBattle(); } }, "Show Answer"),
    el("div", { style: "text-align:center;margin-top:12px" },
      el("button", { class: "btn-small btn-ghost", onclick: () => { battle = null; renderers.battle(); } }, "Flee")
    )
  );
  root.replaceChildren(arena);

  if (!alreadyMounted) {
    const scene = new window.Cardslayer.BattleScene({ mountElement: $("#monster") });
    battle.scene = scene;
    scene.setPlayerAppearance(window.Cardslayer.defaultAppearance());
    scene.setMob(battle.mob);
  }
}
```

Replace `app.js:390-416` (`answer`) — the damage number now fires from the `playerImpact`/`mobImpact` events instead of immediately, and the monster's `.hit` CSS class swap is replaced by triggering the rig's own `hit` animation:

```js
async function answer(grade) {
  const card = battle.queue.shift();
  await schedule(card, grade);
  daily().reviewed += 1;

  const monster = $("#monster");
  const scene = battle.scene;
  if (grade === "again") {
    battle.hearts -= 1;
    battle.queue.push(card);
    floatText("-1 ❤️", monster, "#ff6b6b");
    $(".arena").classList.add("hero-hurt");
    await scene.mobAttack();
    await scene.playerRig.play("hit");
  } else {
    battle.defeated += 1;
    player.coins += grade === "easy" ? 3 : 1;
    const onImpact = () => floatText({ hard: "-7", good: "-10", easy: "CRIT!" }[grade], monster, "#ffd166");
    scene.once("playerImpact", onImpact);
    await scene.playerAttack();
    if (battle.defeated < battle.total) await scene.mobRig.play("hit");
  }
  savePlayer();
  renderHeader();

  battle.revealed = false;

  if (battle.defeated >= battle.total) return endBattle(true);
  if (battle.hearts <= 0) return endBattle(false);
  renderBattle();
}
```

Replace `app.js:418-437` (`endBattle`) — `monster` (the old emoji record) becomes `mob`, and death/defeat now play a rig animation before showing the modal. The rest of the modal body (reward line, Continue button) is unchanged:

```js
async function endBattle(won) {
  const { total, defeated, mob, scene } = battle;
  if (won) await scene.mobDie();
  else await scene.playerDie();

  battle = null;
  const xp = won ? total * 15 : defeated * 5;
  const coins = won ? total * 10 : 0;
  gainXp(xp);
  player.coins += coins;
  if (won) daily().battlesWon += 1;
  savePlayer();
  renderHeader();
  renderers.battle();

  showModal(
    el("div", { style: "font-size:48px" }, won ? "🏆" : "💀"),
    el("h3", {}, won ? "Victory!" : "Defeated…"),
    el("p", {}, won ? `You vanquished the ${mob.displayName}.` : `The ${mob.displayName} got the better of you. Study and return!`),
    el("div", { class: "reward" }, el("span", {}, `+${xp} XP`), coins ? el("span", {}, `+${coins} 🪙`) : null),
    el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "Continue"))
  );
}
```

`endBattle`'s signature changes from a plain function to `async function` — its one caller site in `answer` above (`return endBattle(true)` / `return endBattle(false)`) needs no change: `return somePromise` from inside an `async function` already works correctly.

- [ ] **Step 7: Resize `.monster` for two side-by-side characters**

`style.css:525-533` currently sizes `.monster` as a single 72×72 emoji box. Change it to host the wider two-character canvas:

```css
.monster {
  width: 220px; height: 96px; flex-shrink: 0;
  display: grid; place-items: center;
  border-radius: 12px;
  background: radial-gradient(circle at 50% 60%, #3a1f2c, #140b12);
  border: 1px solid #5b2a3a;
}
.monster canvas { image-rendering: pixelated; }
```

(Remove the old `.monster.hit`/`@keyframes hit` rules — the mob's own `hit` sprite animation replaces the CSS shake; leave `.hero-hurt`/`@keyframes hurt` as-is, it still applies to `.arena`.)

- [ ] **Step 8: Run the full test suite**

```bash
npx vitest run
```

Expected: every test from Tasks 2, 4, and this task passes.

- [ ] **Step 9: Manual verification (deferred until Tasks 6 and 8 exist)**

```bash
npm start
```

Import a deck, start a battle, confirm: the player rig appears on the left facing right, the mob rig on the right facing left, both idle-animate, a correct answer plays the player's attack with a damage number appearing on the impact frame and the mob playing `hit`, "Again" plays the mob's attack and the player's `hit`, and winning/losing plays `death` on the right rig before the victory/defeat modal appears. Until Task 8's mobs exist, `mobIds` will be empty and `renderers.battle()` has nothing to pick from — leave this step unchecked until then.

- [ ] **Step 10: Commit**

```bash
git add index.html app.js style.css src/sprites/battle-scene.js src/sprites/bootstrap.js test/battle-scene.test.js
git commit -m "$(cat <<'EOF'
feat(battle): replace emoji monster with layered PixiJS CharacterRigs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```
