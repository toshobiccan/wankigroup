# World View Shell Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-working `WorldScene` a normal tab in the main app — reachable from the bottom nav, sized to fill the same content area as every other page, with the character's position preserved when you switch away and back — exactly as specified in `docs/superpowers/specs/2026-09-15-world-view-shell-integration-design.md`.

**Architecture:** Add a sixth `<section class="view" data-view="world">` and a sixth bottom-nav button; both plug into the app's existing generic `go(view)` mechanism with zero changes to that mechanism itself. A new `src/world/bootstrap.js` module bridges `WorldScene` onto `window.Cardslayer` so the classic-script `app.js` can reach it. `WorldScene` itself changes from a fixed debug-sized canvas to one that measures its real container and reacts to `ResizeObserver`, plus gains `pause()`/`resume()` so it stops rendering while a different tab is open.

**Tech Stack:** Same as the prototype it extends — plain JS, ES modules for `src/world/`, PixiJS 8 (already vendored), no bundler.

## Global Constraints

- No changes to `go()`'s generic mechanism (`app.js:87-92`) beyond the one pause/resume addition in Task 5 — every other view keeps working exactly as today. (spec §3)
- The shared `.view.is-active { display: block }` rule stays untouched; only a more specific `.view[data-view="world"].is-active` selector changes that one view's layout. No other page's scroll/layout behavior may change. (spec §4)
- `window.Cardslayer` doesn't exist in the codebase yet — this plan creates it defensively (`window.Cardslayer = window.Cardslayer || {}`) so a later, independently-built sprite bootstrap can compose with it rather than clobber it. (spec §5)
- Player position must persist across nav switches within one page load (falls out of `.view` CSS-toggling + lazy-init-once, not new code) but does not need to survive a page reload — that's explicitly out of scope. (spec §2, §5)
- The world view must stop rendering (ticker paused) while any other tab is open, and resume when reopened. (spec §5)
- No new movement/camera/art behavior — `src/world/world-movement.js` is untouched by this plan. (spec §2)
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (`docs/HANDOFF.md`), Conventional Commits, continuing directly on the already-open `feature/overworld-movement-prototype` branch (PR #2).

---

### Task 1: `index.html` markup

**Files:**
- Modify: `index.html:306` (insert new nav button after this line)
- Modify: `index.html:298` (insert new view section after this line)
- Modify: `index.html:332` (insert new script tag after this line)

**Interfaces:**
- Produces: `<section data-view="world">` containing `<div id="worldRoot">`; `<button data-target="world">`; a `<script type="module" src="src/world/bootstrap.js?v=1">` tag. Task 2 styles `#worldRoot`/the nav grid; Task 5 populates `#worldRoot` at runtime.

- [ ] **Step 1: Add the world view section**

Current end of the views block (`index.html:294-299`):

```html
      <!-- ============ INVENTORY ============ -->
      <section class="view" data-view="inventory">
        <div class="page-head"><h2>Inventory</h2><p>Gear and treasures you have collected.</p></div>
        <div class="panel empty-state">Your bag is empty — win battles to earn loot.</div>
      </section>
    </main>
```

Change to:

```html
      <!-- ============ INVENTORY ============ -->
      <section class="view" data-view="inventory">
        <div class="page-head"><h2>Inventory</h2><p>Gear and treasures you have collected.</p></div>
        <div class="panel empty-state">Your bag is empty — win battles to earn loot.</div>
      </section>

      <!-- ============ WORLD ============ -->
      <section class="view" data-view="world">
        <div id="worldRoot" class="world-root"></div>
      </section>
    </main>
```

(No `page-head` title here, unlike the other pages — the map itself is the content; a header would eat into the play area on a small phone screen, per spec §3.)

- [ ] **Step 2: Add the World nav button**

Current Home/Battle buttons (`index.html:303-310`):

```html
      <button class="nav-item" data-target="home">
        <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 25 V12 L7 9 V5 H10 V8 L14 4 L18 8 V5 H21 V9 L24 12 V25 H17 V19 Q14 15 11 19 V25Z" fill="currentColor"/><path d="M4 12 h20" stroke="#0000" /></svg>
        <span>Home</span>
      </button>
      <button class="nav-item" data-target="battle">
```

Change to:

```html
      <button class="nav-item" data-target="home">
        <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 25 V12 L7 9 V5 H10 V8 L14 4 L18 8 V5 H21 V9 L24 12 V25 H17 V19 Q14 15 11 19 V25Z" fill="currentColor"/><path d="M4 12 h20" stroke="#0000" /></svg>
        <span>Home</span>
      </button>
      <button class="nav-item" data-target="world">
        <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M2 23 L9 9 L13 15 L17 6 L26 23Z" fill="currentColor"/><circle cx="20" cy="6" r="2.6" fill="currentColor"/></svg>
        <span>World</span>
      </button>
      <button class="nav-item" data-target="battle">
```

(Placed second, right after Home, per spec §3 — the world is meant to become a hub for finding fights later.)

- [ ] **Step 3: Add the bootstrap module script tag**

Current end of `index.html` (`index.html:330-333`):

```html
  <script src="db.js?v=3"></script>
  <script src="anki-import.js?v=3"></script>
  <script src="app.js?v=3"></script>
</body>
```

Change to:

```html
  <script src="db.js?v=3"></script>
  <script src="anki-import.js?v=3"></script>
  <script src="app.js?v=3"></script>
  <script type="module" src="src/world/bootstrap.js?v=1"></script>
</body>
```

- [ ] **Step 4: Verify — expect a temporary, known console error**

```bash
npm start
```

Open `http://localhost:5173`. Expected: page loads, 6 nav buttons now visible in the bottom bar (World between Home and Battle) — but the browser console shows a 404/module-load error for `src/world/bootstrap.js`. **This is expected at this point** — that file doesn't exist until Task 3. Clicking the World tab right now just shows an empty section; that's fine too, `#worldRoot` isn't populated until Task 5.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(world): add World tab markup to main app shell

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `style.css` layout rules

**Files:**
- Modify: `style.css:448` (`.bottomnav` grid column count)
- Modify: `style.css:142` (add a new rule after the shared `.view.is-active` rule)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `.world-root` sized to fill its `.view` section; `.view[data-view="world"].is-active` as the section that stretches to fill `.views`'s content-box height. Task 4/5's `#worldRoot` element relies on this to size the Pixi canvas correctly.

- [ ] **Step 1: Widen the nav grid**

Current (`style.css:446-448`):

```css
.bottomnav {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: var(--nav-h);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
```

Change the grid line to:

```css
  grid-template-columns: repeat(6, 1fr);
```

- [ ] **Step 2: Add the world-view sizing rules**

Current (`style.css:141-143`):

```css
.view { display: none; }
.view.is-active { display: block; animation: fadeIn .25s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
```

Change to:

```css
.view { display: none; }
.view.is-active { display: block; animation: fadeIn .25s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* World is the one view that fills the content area exactly, instead of
   scrolling like the other pages — it hosts a fixed-size canvas, not text. */
.view[data-view="world"].is-active {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.world-root {
  flex: 1;
  min-height: 0;
  display: flex;
}
```

- [ ] **Step 3: Verify**

```bash
npm start
```

Open `http://localhost:5173`, click the World tab. Expected: the (still-empty) section now visibly fills the space between the top bar and the bottom nav — no gap below it, no page-level scrollbar. Click Home, Battle, Quests, Inventory, Import Deck in turn — expected: none of their layout or scroll behavior changed from before this task.

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "$(cat <<'EOF'
feat(world): size the World tab to fill the app's content area

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `src/world/bootstrap.js`

**Files:**
- Create: `src/world/bootstrap.js`

**Interfaces:**
- Consumes: `WorldScene` (`src/world/world-scene.js`, unchanged export from the prior sub-project).
- Produces: `window.Cardslayer.WorldScene` — the bridge `app.js` (Task 5) reads.

- [ ] **Step 1: Write the file**

```js
import { WorldScene } from "./world-scene.js";

window.Cardslayer = window.Cardslayer || {};
Object.assign(window.Cardslayer, { WorldScene });
```

(Merges onto whatever's already on `window.Cardslayer` rather than overwriting it — so an independently-added sprite bootstrap, whenever it's built, composes with this one regardless of which lands first, per spec §5.)

- [ ] **Step 2: Verify**

```bash
npm start
```

Open `http://localhost:5173`, open the browser devtools console. Expected: the 404/module-load error from Task 1 Step 4 is gone. Type `window.Cardslayer` in the console — expected: `{ WorldScene: class WorldScene }`.

- [ ] **Step 3: Commit**

```bash
git add src/world/bootstrap.js
git commit -m "$(cat <<'EOF'
feat(world): add window.Cardslayer bridge for WorldScene

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `WorldScene` container-measured sizing, resize, pause/resume

**Files:**
- Modify: `src/world/world-scene.js` (full contents shown below — small file, easiest to review as a whole)
- Modify: `dev/world-preview.html` (its `<style>` block — see Step 1 note)

**Interfaces:**
- Consumes: nothing new.
- Produces (additions to the existing `WorldScene` class, relied on by Task 5):
  ```js
  resize(width, height)   // resizes the Pixi renderer and redraws the ground to match
  pause()                 // stops the render/update ticker
  resume()                // restarts it
  ```
  `constructor({ mountElement })` and `loadZone(zoneJsonUrl)` keep their existing signatures unchanged.

- [ ] **Step 1: Fix the dev-preview page first**

`WorldScene` is about to measure `mountElement`'s real rendered size instead of using a fixed constant. `dev/world-preview.html`'s `#stage` element currently has no defined size (`display: inline-block`, sized only by its children) — since it's empty before the canvas is appended, measuring it right now would measure `0×0`. Give it an explicit, responsive size so the standalone dev tool keeps working (and so you can actually test live resize on this page in Step 4):

Current (`dev/world-preview.html`):

```html
  <style>
    body { background: #111; color: #eee; font-family: sans-serif; margin: 0; padding: 16px; }
    #stage { border: 1px solid #333; display: inline-block; }
    canvas { image-rendering: pixelated; }
  </style>
```

Change to:

```html
  <style>
    body { background: #111; color: #eee; font-family: sans-serif; margin: 0; padding: 16px; }
    #stage { border: 1px solid #333; width: min(400px, 90vw); height: 60vh; }
    canvas { image-rendering: pixelated; }
  </style>
```

- [ ] **Step 2: Rewrite `src/world/world-scene.js`**

Full new contents:

```js
import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;

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
    this._resizeObserver = null;
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

    const { width, height } = this.mountElement.getBoundingClientRect();

    await this.app.init({
      width,
      height,
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

    this._resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      this.resize(width, height);
    });
    this._resizeObserver.observe(this.mountElement);
  }

  resize(width, height) {
    this.app.renderer.resize(width, height);
    this.ground
      .clear()
      .rect(0, this.zone.groundTop, this.zone.width, this.zone.groundBottom - this.zone.groundTop)
      .fill(0x5fa14a);
  }

  pause() {
    this.app.ticker?.stop();
  }

  resume() {
    this.app.ticker?.start();
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

Two deliberate deviations from the spec's literal code, both defensive and both cheap:
- `pause()`/`resume()` use `this.app.ticker?.stop()`/`?.start()` (optional chaining), not a bare call. `this.app` exists synchronously from the constructor, but `this.app.ticker` isn't guaranteed to exist until `app.init()` resolves inside `loadZone` — and Task 5's `go()` can call `pause()`/`resume()` before that promise settles (e.g. the user taps World then immediately taps away). The `?.` makes both calls safe no-ops in that window instead of throwing.
- `this._resizeObserver` is initialized to `null` in the constructor for clarity, even though nothing reads it before `loadZone` sets it.

- [ ] **Step 3: Sanity-check the file parses**

```bash
node --check src/world/world-scene.js
```

Expected: no output.

- [ ] **Step 4: Verify resize behavior on the (now-fixed) dev-preview page**

```bash
npm start
```

Open `http://localhost:5173/dev/world-preview.html`. Expected: the map renders filling the `#stage` box (now sized by CSS, not a fixed 400×230). Resize the browser window — expected: the ground/sky redraws to fill the new size within a moment, no stretched or leftover old-size canvas. Click around — expected: movement, vertical clamping, and camera panning all still work exactly as before (this logic didn't change).

- [ ] **Step 5: Commit**

```bash
git add src/world/world-scene.js dev/world-preview.html
git commit -m "$(cat <<'EOF'
feat(world): size WorldScene to its container; add resize/pause/resume

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `app.js` — `renderers.world` and pause/resume in `go()`

**Files:**
- Modify: `app.js:87-92` (`go()`)
- Modify: `app.js` (new section after the existing `renderers.battle`/battle code, before the `// ================= SCENE PLAY =================` comment)

**Interfaces:**
- Consumes: `window.Cardslayer.WorldScene` (Task 3).
- Produces: nothing further tasks depend on — this is the final wiring step.

- [ ] **Step 1: Add pause/resume to `go()`**

Current (`app.js:87-92`):

```js
function go(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.target === view));
  $(".views").scrollTop = 0;
  renderers[view]?.();
}
```

Change to:

```js
function go(view) {
  const previousView = document.querySelector(".view.is-active")?.dataset.view;
  if (previousView === "world" && previousView !== view) worldScene?.pause();

  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.target === view));
  $(".views").scrollTop = 0;
  renderers[view]?.();

  if (view === "world") worldScene?.resume();
}
```

(`worldScene` is declared in Step 2, further down the file — this is safe: `go()`'s body only runs when a nav button is actually clicked, long after the whole script — including that declaration — has finished its initial top-to-bottom run. `renderers.battle`/`renderers.home`/etc. already rely on this same fact.)

- [ ] **Step 2: Add the world renderer**

Find the end of the battle section in `app.js` — the `endBattle` function's closing brace, immediately before this existing comment:

```js
// ================= SCENE PLAY =================
const OWL_LINES = ["Hoo! Ready to study?", "Drop a deck here!", "Knowledge is power!", "Hoo-hoo! 📚", "Let's beat some cards!"];
```

Insert a new section directly before it:

```js
// ================= WORLD =================
let worldScene = null;

renderers.world = async () => {
  if (worldScene) return;
  worldScene = new window.Cardslayer.WorldScene({ mountElement: $("#worldRoot") });
  await worldScene.loadZone("data/zones/plains.json");
};

// ================= SCENE PLAY =================
const OWL_LINES = ["Hoo! Ready to study?", "Drop a deck here!", "Knowledge is power!", "Hoo-hoo! 📚", "Let's beat some cards!"];
```

- [ ] **Step 3: Sanity-check the file parses**

```bash
node --check app.js
```

Expected: no output.

- [ ] **Step 4: Verify in the real app**

```bash
npm start
```

Open `http://localhost:5173`. Click the World tab. Expected: the map now actually renders inside it (sky, grass band, yellow player circle), filling the tab's content area. Click around on the grass — expected: the character walks there. Switch to Inventory, then back to World — expected: the character is still standing where you left it, not reset.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
feat(world): wire WorldScene into the main app's World tab

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Manual verification

**Files:** none — this task only runs and observes the app built in Tasks 1–5, per spec §7.

- [ ] **Step 1: Fresh load and fill check**

```bash
npm start
```

Open `http://localhost:5173`. Click the World tab. Expected: reachable from the bottom nav, the map fills the same visible area Home/Quests/etc. do — no gap above the bottom nav, no scrollbar appearing on the page itself.

- [ ] **Step 2: Position persistence**

Click somewhere on the grass to walk there. Once the character has moved, switch to Inventory, then switch back to World. Expected: the character is still standing where it was left, not reset to the spawn point.

- [ ] **Step 3: Live resize**

While on the World tab, resize the browser window (or use devtools' device-toolbar to rotate/change device). Expected: the map's ground/sky redraws to fill the new size with no stretched or clipped canvas; clicking near either horizontal edge afterward still clamps the camera correctly at that (now-different) zone boundary.

- [ ] **Step 4: Pause/resume**

While on the World tab, note the character's exact position, then switch to another tab and wait a few seconds, then switch back. Expected: the character has not silently drifted or kept animating while the tab was hidden — it's exactly where it was when you left (beyond, at most, the tiny amount a single resumed tick would move it if a click target was still pending).

- [ ] **Step 5: Regression check on the other five tabs**

Click through Home, Battle, Quests, Import Deck, Inventory. Expected: all five behave exactly as they did before this plan — same layout, same scrolling, no visual or functional change.

- [ ] **Step 6: Console check**

Check the browser console (devtools, or an agent's console-reading tool) throughout Steps 1–5. Expected: no errors.

- [ ] **Step 7: Note the outcome**

If everything above passes, update the spec's `**Status:**` line and commit:

```bash
git add docs/superpowers/specs/2026-09-15-world-view-shell-integration-design.md
git commit -m "$(cat <<'EOF'
docs: mark world view shell integration spec as verified

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

If something fails, note exactly which step and what happened — that's the next thing to fix.
