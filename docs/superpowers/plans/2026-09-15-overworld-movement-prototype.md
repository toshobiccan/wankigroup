# Overworld Movement Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, throwaway-art prototype proving click/tap-to-move (free 2D, within a flat walkable band) plus a horizontally-panning soft-follow camera, exactly as specified in `docs/superpowers/specs/2026-09-15-overworld-movement-prototype-design.md`.

**Architecture:** A zone is one JSON data file (`data/zones/plains.json`) describing its width and walkable y-band. Three pure functions (`clampToZone`, `stepTowardTarget`, `computeCameraX`) own all the movement/camera math and are unit-tested in isolation. A `WorldScene` class wires those functions to PixiJS: it owns one `PIXI.Application`, draws a flat-colour ground band and a flat-colour player marker, and drives both from pointer input and the render ticker. `dev/world-preview.html` is a standalone dev page (not linked from the main app) that loads `WorldScene` against the real `plains.json`.

**Tech Stack:** Plain JS, ES modules (no bundler), PixiJS 8 vendored as a single ESM file (same pattern as JSZip/sql.js/fzstd — see `vendor/README.md`), Vitest for the pure-function unit tests, Pointer Events API for input.

## Global Constraints

- Side-view only. No new sprite angles; the character's facing is driven only by the x-component of travel direction. (spec §1.2)
- Movement is free 2D (x and y) but the camera pans **horizontally only** — the zone's walkable band height is authored to fit within the viewport height. (spec §2, §6)
- "Up/down" is repositioning within one flat band, not jumping/platforms/elevation — no gravity, no jump input, no y-based scale or draw-order changes. (spec §2)
- Moving diagonally must not be faster than moving on one axis — speed applies to the direction vector's length, not to each axis independently. (spec §5, §8)
- Placeholder art only (flat-colour `PIXI.Graphics` shapes) — no real tile art in this sub-project. (spec §2, §7)
- This stays a standalone dev page (`dev/world-preview.html`), not wired into the main app's nav — nothing in `app.js`'s import/battle/quest flow is touched. (spec §1.4, §2)
- Node ≥20, no bundler — new files are native ES modules; `import` specifiers resolve relative to the importing module's own file, `fetch()` URLs resolve relative to the document (matters for `dev/world-preview.js`, Task 5). (repo convention)
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (`docs/HANDOFF.md`), Conventional Commits, small reviewable diffs.

---

### Task 1: Zone data file

**Files:**
- Create: `data/zones/plains.json`

**Interfaces:**
- Produces: the zone shape every later task reads — `{ id, displayName, width, groundTop, groundBottom, spawnX, spawnY }`.

- [ ] **Step 1: Create the folder and file**

```bash
mkdir -p data/zones
```

```json
// data/zones/plains.json
{
  "id": "plains",
  "displayName": "Plains",
  "width": 2000,
  "groundTop": 110,
  "groundBottom": 190,
  "spawnX": 100,
  "spawnY": 150
}
```

(`spawnY` = 150 sits inside `[groundTop=110, groundBottom=190]`, per spec §4.)

- [ ] **Step 2: Validate it's well-formed JSON**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/zones/plains.json','utf8')))"
```

Expected: prints the object with no error.

- [ ] **Step 3: Commit**

```bash
git add data/zones/plains.json
git commit -m "$(cat <<'EOF'
feat(world): add plains zone data

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Movement/camera pure functions

**Files:**
- Create: `src/world/world-movement.js`
- Create: `vitest.config.js`
- Modify: `package.json`
- Test: `test/world-movement.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (exact signatures relied on by Task 4):
  ```js
  export function clampToZone(pos, zone)                                     // {x,y}
  export function stepTowardTarget(current, target, deltaMS, speedPxPerSec)  // {x,y}
  export function computeCameraX(playerWorldX, cameraX, viewportWidth, zoneWidth, deadZoneFraction) // number
  ```

- [ ] **Step 1: Install Vitest and configure it**

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

Edit `package.json`'s `"scripts"` to add:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing tests for `clampToZone`**

```js
// test/world-movement.test.js
import { describe, it, expect } from "vitest";
import { clampToZone, stepTowardTarget, computeCameraX } from "../src/world/world-movement.js";

const ZONE = { id: "plains", width: 2000, groundTop: 110, groundBottom: 190 };

describe("clampToZone", () => {
  it("clamps x to [0, zone.width]", () => {
    expect(clampToZone({ x: -50, y: 150 }, ZONE)).toEqual({ x: 0, y: 150 });
    expect(clampToZone({ x: 5000, y: 150 }, ZONE)).toEqual({ x: 2000, y: 150 });
  });

  it("clamps y to [zone.groundTop, zone.groundBottom]", () => {
    expect(clampToZone({ x: 100, y: 0 }, ZONE)).toEqual({ x: 100, y: 110 });
    expect(clampToZone({ x: 100, y: 500 }, ZONE)).toEqual({ x: 100, y: 190 });
  });

  it("leaves an in-range position unchanged", () => {
    expect(clampToZone({ x: 100, y: 150 }, ZONE)).toEqual({ x: 100, y: 150 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run test/world-movement.test.js
```

Expected: FAIL — `src/world/world-movement.js` doesn't exist.

- [ ] **Step 4: Write `clampToZone`**

```js
// src/world/world-movement.js
export function clampToZone(pos, zone) {
  return {
    x: Math.min(Math.max(pos.x, 0), zone.width),
    y: Math.min(Math.max(pos.y, zone.groundTop), zone.groundBottom),
  };
}
```

- [ ] **Step 5: Run tests to verify `clampToZone` passes**

```bash
npx vitest run test/world-movement.test.js
```

Expected: PASS (3 tests) — the other two `describe` blocks don't exist yet, that's fine, Vitest only runs what's there.

- [ ] **Step 6: Write the failing tests for `stepTowardTarget`**

```js
// append to test/world-movement.test.js

describe("stepTowardTarget", () => {
  it("moves speed*deltaMS/1000 world-pixels toward the target on one axis", () => {
    const result = stepTowardTarget({ x: 0, y: 150 }, { x: 200, y: 150 }, 1000, 100);
    expect(result).toEqual({ x: 100, y: 150 });
  });

  it("snaps exactly to the target instead of overshooting", () => {
    const result = stepTowardTarget({ x: 190, y: 150 }, { x: 200, y: 150 }, 1000, 100);
    expect(result).toEqual({ x: 200, y: 150 });
  });

  it("moving diagonally covers the same distance per tick as moving on one axis (not faster)", () => {
    const straight = stepTowardTarget({ x: 0, y: 150 }, { x: 200, y: 150 }, 500, 100);
    const diagonal = stepTowardTarget({ x: 0, y: 150 }, { x: 200, y: 190 }, 500, 100);

    const straightDist = Math.hypot(straight.x - 0, straight.y - 150);
    const diagonalDist = Math.hypot(diagonal.x - 0, diagonal.y - 150);
    expect(diagonalDist).toBeCloseTo(straightDist, 5);
    expect(diagonalDist).toBeCloseTo(50, 5); // 100 px/s * 0.5s
  });

  it("returns the current position unchanged once already at the target", () => {
    const result = stepTowardTarget({ x: 200, y: 150 }, { x: 200, y: 150 }, 1000, 100);
    expect(result).toEqual({ x: 200, y: 150 });
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
npx vitest run test/world-movement.test.js
```

Expected: FAIL — `stepTowardTarget` isn't exported yet.

- [ ] **Step 8: Write `stepTowardTarget`**

```js
// append to src/world/world-movement.js

export function stepTowardTarget(current, target, deltaMS, speedPxPerSec) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: current.x, y: current.y };

  const maxStep = speedPxPerSec * (deltaMS / 1000);
  if (distance <= maxStep) return { x: target.x, y: target.y };

  const ratio = maxStep / distance;
  return { x: current.x + dx * ratio, y: current.y + dy * ratio };
}
```

- [ ] **Step 9: Run tests to verify `stepTowardTarget` passes**

```bash
npx vitest run test/world-movement.test.js
```

Expected: PASS (7 tests).

- [ ] **Step 10: Write the failing tests for `computeCameraX`**

```js
// append to test/world-movement.test.js

describe("computeCameraX", () => {
  const VIEWPORT = 400;
  const ZONE_WIDTH = 2000;
  const DEAD_ZONE = 0.4; // dead-zone spans screen x [120, 280]

  it("stays put while the player is inside the dead-zone", () => {
    expect(computeCameraX(150, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(0);
    expect(computeCameraX(250, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(0);
  });

  it("pans right just enough to keep the player at the dead-zone's right edge", () => {
    // player world x = 300, camera 0 -> screen x 300, past right edge (280)
    expect(computeCameraX(300, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(20);
  });

  it("pans left just enough to keep the player at the dead-zone's left edge", () => {
    // camera already at 200; player world x = 300 -> screen x 100, past left edge (120)
    expect(computeCameraX(300, 200, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(180);
  });

  it("clamps to 0 at the zone's left edge", () => {
    expect(computeCameraX(10, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(0);
  });

  it("clamps to zoneWidth - viewportWidth at the zone's right edge", () => {
    expect(computeCameraX(1990, 1600, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(1600);
  });

  it("stays at 0 when the zone is narrower than the viewport", () => {
    expect(computeCameraX(50, 0, VIEWPORT, 300, DEAD_ZONE)).toBe(0);
  });
});
```

- [ ] **Step 11: Run tests to verify they fail**

```bash
npx vitest run test/world-movement.test.js
```

Expected: FAIL — `computeCameraX` isn't exported yet.

- [ ] **Step 12: Write `computeCameraX`**

```js
// append to src/world/world-movement.js

export function computeCameraX(playerWorldX, cameraX, viewportWidth, zoneWidth, deadZoneFraction) {
  const deadZoneWidth = viewportWidth * deadZoneFraction;
  const deadZoneLeft = (viewportWidth - deadZoneWidth) / 2;
  const deadZoneRight = deadZoneLeft + deadZoneWidth;

  const playerScreenX = playerWorldX - cameraX;
  let newCameraX = cameraX;
  if (playerScreenX < deadZoneLeft) {
    newCameraX = playerWorldX - deadZoneLeft;
  } else if (playerScreenX > deadZoneRight) {
    newCameraX = playerWorldX - deadZoneRight;
  }

  const maxCameraX = Math.max(0, zoneWidth - viewportWidth);
  return Math.min(Math.max(newCameraX, 0), maxCameraX);
}
```

- [ ] **Step 13: Run the full suite and commit**

```bash
npx vitest run
```

Expected: PASS (13 tests total).

```bash
git add src/world/world-movement.js test/world-movement.test.js vitest.config.js package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(world): add movement/camera pure functions with tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Vendor PixiJS 8

**Files:**
- Create: `vendor/pixi.min.mjs`
- Modify: `vendor/README.md`

**Interfaces:**
- Produces: `vendor/pixi.min.mjs`, imported by Task 4's `world-scene.js` as `import * as PIXI from "../../vendor/pixi.min.mjs"`.

- [ ] **Step 1: Check it isn't already vendored**

```bash
ls vendor/pixi.min.mjs 2>&1
```

If this prints a file (not "No such file or directory"), **skip the rest of this task** — someone (e.g. the character-art-pipeline plan) already vendored it; just confirm the `vendor/README.md` row exists and move to Task 4.

- [ ] **Step 2: Resolve the latest PixiJS 8.x version**

```bash
npm view pixi.js versions --json | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    const versions = JSON.parse(data).filter(v => v.startsWith('8.'));
    console.log(versions[versions.length - 1]);
  });
"
```

Note the printed version — call it `X.Y.Z` in the next step.

- [ ] **Step 3: Download the pinned ESM build**

```bash
curl -fo vendor/pixi.min.mjs "https://unpkg.com/pixi.js@X.Y.Z/dist/pixi.min.mjs"
```

(Replace `X.Y.Z` with the version from Step 2.) Verify it downloaded a real file, not an error page:

```bash
head -c 200 vendor/pixi.min.mjs
```

Expected: minified JS (starts with something like `var`/`class`/an IIFE or ESM export, not `<html>` or `{"error"`).

- [ ] **Step 4: Record it in `vendor/README.md`**

Add a row to the table (keep the existing three rows as-is):

```markdown
| `pixi.min.mjs` | PixiJS | X.Y.Z | MIT | https://unpkg.com/pixi.js@X.Y.Z/dist/pixi.min.mjs |
```

- [ ] **Step 5: Commit**

```bash
git add vendor/pixi.min.mjs vendor/README.md
git commit -m "$(cat <<'EOF'
chore(world): vendor PixiJS 8

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `WorldScene` (PixiJS wiring)

**Files:**
- Create: `src/world/world-scene.js`

**Interfaces:**
- Consumes: `clampToZone`, `stepTowardTarget`, `computeCameraX` (Task 2 `world-movement.js`), `vendor/pixi.min.mjs` (Task 3).
- Produces (relied on by Task 5):
  ```js
  export class WorldScene {
    constructor({ mountElement })
    async loadZone(zoneJsonUrl)
  }
  ```

- [ ] **Step 1: Write `src/world/world-scene.js`**

```js
import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;
const VIEWPORT_WIDTH = 400; // matches the ~400px-wide mobile testing convention (docs/HANDOFF.md)

export class WorldScene {
  constructor({ mountElement }) {
    this.mountElement = mountElement;
    this.zone = null;
    this.position = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.cameraX = 0;
    this.app = new PIXI.Application();
    this.world = new PIXI.Container();
    this.ground = null;
    this.player = null;
  }

  async loadZone(zoneJsonUrl) {
    let zone;
    try {
      zone = await fetch(zoneJsonUrl).then((r) => r.json());
    } catch (err) {
      console.error(`WorldScene: failed to load zone at ${zoneJsonUrl}`, err);
      return;
    }

    this.zone = zone;
    this.position = { x: zone.spawnX, y: zone.spawnY };
    this.target = { x: zone.spawnX, y: zone.spawnY };

    await this.app.init({
      width: VIEWPORT_WIDTH,
      height: zone.groundBottom + 40,
      backgroundColor: 0x8fd0ff, // placeholder sky
      roundPixels: true,
    });
    this.mountElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);

    this.ground = new PIXI.Graphics()
      .rect(0, zone.groundTop, zone.width, zone.groundBottom - zone.groundTop)
      .fill(0x5fa14a); // placeholder grass
    this.world.addChild(this.ground);

    this.player = new PIXI.Graphics().circle(0, 0, 10).fill(0xffcc00); // placeholder player
    this.player.position.set(this.position.x, this.position.y);
    this.world.addChild(this.player);

    this.app.canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    this.app.ticker.add((ticker) => this._onTick(ticker));
  }

  _onPointerDown(event) {
    const rect = this.app.canvas.getBoundingClientRect();
    const worldPoint = {
      x: event.clientX - rect.left + this.cameraX,
      y: event.clientY - rect.top,
    };
    this.target = clampToZone(worldPoint, this.zone);
  }

  _onTick(ticker) {
    this.position = stepTowardTarget(this.position, this.target, ticker.deltaMS, MOVE_SPEED);
    this.player.position.set(this.position.x, this.position.y);

    this.cameraX = computeCameraX(this.position.x, this.cameraX, this.app.screen.width, this.zone.width, DEAD_ZONE_FRACTION);
    this.world.x = -this.cameraX;
  }
}
```

- [ ] **Step 2: Sanity-check the file parses**

```bash
node --check src/world/world-scene.js
```

Expected: no output (valid syntax). This only catches syntax errors, not behavior — real verification happens in Task 6 once `dev/world-preview.html` (Task 5) exists to load it in a browser.

- [ ] **Step 3: Commit**

```bash
git add src/world/world-scene.js
git commit -m "$(cat <<'EOF'
feat(world): add WorldScene PixiJS wiring

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dev preview page

**Files:**
- Create: `dev/world-preview.html`
- Create: `dev/world-preview.js`

**Interfaces:**
- Consumes: `WorldScene` (Task 4 `world-scene.js`).
- Produces: nothing other tasks depend on — standalone dev tool, not shipped, matching `dev/rig-gallery.html`'s status in the character-art-pipeline plan.

- [ ] **Step 1: Write `dev/world-preview.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cardslayer — World Preview (dev only)</title>
  <style>
    body { background: #111; color: #eee; font-family: sans-serif; margin: 0; padding: 16px; }
    #stage { border: 1px solid #333; display: inline-block; }
    canvas { image-rendering: pixelated; }
  </style>
</head>
<body>
  <h1>World Preview</h1>
  <p>Click or tap anywhere on the grass to walk there. Dev-only, not shipped.</p>
  <div id="stage"></div>
  <script type="module" src="./world-preview.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `dev/world-preview.js`**

```js
import { WorldScene } from "../src/world/world-scene.js";

const scene = new WorldScene({ mountElement: document.getElementById("stage") });
scene.loadZone("../data/zones/plains.json");
```

(The `import` path resolves relative to this file's own URL; the `fetch()` inside `loadZone` resolves relative to the page's URL, `dev/world-preview.html` — both land on the same repo-root-relative targets: `src/world/world-scene.js` and `data/zones/plains.json`.)

- [ ] **Step 3: Commit**

```bash
git add dev/world-preview.html dev/world-preview.js
git commit -m "$(cat <<'EOF'
feat(world): add dev world-preview page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Manual verification

**Files:** none — this task only runs and observes the app built in Tasks 1–5.

- [ ] **Step 1: Start the server**

```bash
npm start
```

- [ ] **Step 2: Open the preview**

Open `http://localhost:5173/dev/world-preview.html`. Expected: a light-blue sky over a green ground band, with a small yellow circle (the player) standing near the left.

- [ ] **Step 3: Verify basic movement**

Click/tap a point on the grass to the right of the player. Expected: the player walks smoothly toward that point at a constant speed and stops exactly there — no jitter, no overshoot past the point.

- [ ] **Step 4: Verify vertical movement**

Click points at different heights within the grass band (near its top edge, near its bottom edge). Expected: the player can reach anywhere within the green band; clicking above or below the band has no effect on where it stops (clamped to the band).

- [ ] **Step 5: Verify diagonal speed**

Click a point that's both far to the right and at a different height (a true diagonal). Time roughly how long it takes to arrive versus clicking a point at the same horizontal distance but the same height. Expected: both take about the same time — diagonal movement is not faster.

- [ ] **Step 6: Verify the camera**

Click near the player's current position (small move). Expected: the camera does not pan — the background stays still. Now click far to the right, past where the visible ground ends. Expected: as the player approaches the edge of the visible screen, the camera starts panning to keep up, and the player never visually reaches the very edge of the canvas.

- [ ] **Step 7: Verify the camera clamps at zone edges**

Walk the player all the way to the zone's right edge (repeatedly click far right). Expected: once the camera has panned as far as it can, further rightward clicks move the player right up to the visible edge of the canvas (the camera stops panning, per the `zone.width - viewportWidth` clamp) rather than the view going blank or scrolling past the zone. Repeat walking back to x=0 on the left; expected the same at the left edge.

- [ ] **Step 8: Check the console for errors**

If a human is running this: open browser devtools (Cmd+Option+J in Chrome/Safari on Mac) and look at the Console tab. If an agent with the Browser pane tool is running this: use its console-reading tool against the `dev/world-preview.html` tab.

Expected: no errors logged during any of Steps 3–7.

- [ ] **Step 9: Note the outcome**

If everything above passes, the prototype is proven — update the spec's `**Status:**` line from "Approved in discussion, pending written review" to "Prototype verified working" and commit:

```bash
git add docs/superpowers/specs/2026-09-15-overworld-movement-prototype-design.md
git commit -m "$(cat <<'EOF'
docs: mark overworld movement prototype spec as verified

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

If something fails, note exactly which step and what happened — that's the next thing to fix before this sub-project is done.
