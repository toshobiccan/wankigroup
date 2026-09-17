# World View Shell Integration — Design Spec

**Project:** Cardslayer
**Date:** 2026-09-15
**Status:** Verified working (implemented per `docs/superpowers/plans/2026-09-15-world-view-shell-integration.md`; manually verified in-browser 2026-09-15 — World tab reachable and correctly sized, position persists across tab switches, live resize redraws correctly, ticker pause/resume confirmed precisely via `worldScene.app.ticker.started`, all five other tabs unaffected)
**Scope:** Sub-project 2 of the open-world pivot. Wires the already-built, already-verified `WorldScene` (`src/world/world-scene.js`, previously reachable only via the standalone `dev/world-preview.html`) into the main app's shell and bottom navigation, so it fills the same content area as the other menu pages and stays reachable alongside them. Does not add encounters/mobs, real tile art, or any new movement/camera behavior — those were covered (or explicitly deferred) by `docs/superpowers/specs/2026-09-15-overworld-movement-prototype-design.md`, which this spec builds on unchanged.

---

## 1. Goals

1. Make the world view a normal peer of Home/Battle/Quests/Import Deck/Inventory: reachable from the bottom nav, switched via the app's existing `go(view)` mechanism, no special-casing.
2. Size the world's canvas to genuinely fill whatever space the app's content area (`.views`) actually has on the real device — not a fixed debug size — matching every other page.
3. Keep the bottom nav visible and usable while exploring the world, exactly as it already is on every other page (this falls out of the existing CSS structure once the world view is a normal `.view` section — no new nav behavior needed).
4. Preserve player position across nav switches (walk somewhere, check Inventory, come back, still standing there) — free from the existing `.view` show/hide mechanism, not something this spec builds new.
5. Don't waste CPU/battery rendering the world while a different tab is open.

## 2. Non-goals

- Any new movement, camera, or rendering behavior beyond what `2026-09-15-overworld-movement-prototype-design.md` already specifies. This is integration only.
- Encounters, mobs, or a hand-off into the battle screen — still deferred, as in the original spec.
- Real tile art — the placeholder flat-colour ground/player from the original spec is unchanged.
- Changing the order or behavior of the five existing nav items beyond the CSS grid column count.
- Persisting player position to `localStorage`/across page reloads — "preserved across nav switches" here means within one page load only, via the existing DOM-retention behavior of `.view.is-active` toggling. Reload-persistence is a separate, later concern (already noted as a non-goal in the original movement spec).

## 3. Nav and markup changes

`index.html`:
- Add `<section class="view" data-view="world"><div id="worldRoot" class="world-root"></div></section>` inside `<main class="views">`, alongside the existing five `<section class="view">` blocks. No `page-head` title bar, since the map itself is the content — the header would just eat into the play area on a small phone screen.
- Add a 6th `<button class="nav-item" data-target="world">…</button>` inside `<nav class="bottomnav">`, using the same markup shape as the other five (an inline SVG icon + `<span>` label "World"). Placed second, right after Home — the world is meant to become a central hub for finding things to fight later, so it belongs near the top of the list, not buried last.

No changes to `go()` in `app.js` (`app.js:87-92`) — it already generically toggles `.is-active` on any `[data-view]`/`[data-target]` pair and calls `renderers[view]?.()` if one exists, so `world` participates for free once `renderers.world` exists (§5).

## 4. Layout and sizing

`style.css`:
- `.bottomnav`'s `grid-template-columns: repeat(5, 1fr)` becomes `repeat(6, 1fr)` (`style.css:448`).
- The shared `.view.is-active { display: block }` rule (`style.css:142`) stays untouched — every other page keeps its current auto-height, scrolls-if-taller-than-viewport behavior. Only the world view gets a more specific override:
  ```css
  .view[data-view="world"].is-active {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .world-root { flex: 1; min-height: 0; display: flex; }
  ```
  `height: 100%` resolves against `.views`'s content-box height. `.views` is a `flex:1` child of the column-flex `.app` (`style.css:30-43`), so it already has a real, definite computed height — `.app`'s height (`100dvh`) minus `.topbar`'s height, since `.bottomnav` is `position: absolute` and so doesn't participate in that flex layout at all (`style.css:446-448`). `.views`'s own `padding-bottom: calc(var(--nav-h) + 6px)` (`style.css:137`) is *outside* its content-box, so a height-100% child naturally stops exactly above the nav rather than sliding underneath it. With the section itself now a flex column at a definite height, `#worldRoot`'s `flex: 1` inside it finally has a flex container to size against, and stretches to fill that section completely.

This gives the world view the same visible footprint as every other page's content area, without changing how any other page lays out or scrolls.

`src/world/world-scene.js` changes (see §6 for the full diff shape):
- The hardcoded `VIEWPORT_WIDTH = 400` constant is removed. `WorldScene.loadZone` instead measures `this.mountElement.getBoundingClientRect()` and initializes the Pixi `Application` at that measured width/height.
- The ground/sky rectangle heights are derived from the measured viewport height rather than `zone.groundBottom + 40` (the old dev-page-only sizing) — the walkable band (`groundTop`–`groundBottom`) stays fixed in world-space per the zone data, but how much sky is visible above/below it now depends on the real container height, same as how a real phone screen would show more or less sky depending on its own aspect ratio.

## 5. Lifecycle: lazy init, pause, resume

`app.js` gets one new renderer, following the exact shape `renderers.battle` already uses for its own lazy-init-once pattern (`app.js:268`):

```js
let worldScene = null;

renderers.world = async () => {
  if (worldScene) return;
  worldScene = new window.Cardslayer.WorldScene({ mountElement: $("#worldRoot") });
  await worldScene.loadZone("data/zones/plains.json");
};
```

`window.Cardslayer` is a small bridge object that lets a classic script like `app.js` (which cannot use `import`, per the repo's no-bundler setup) reach code written as ES modules. It does not exist in the codebase yet — the character-art-pipeline plan describes an equivalent `src/sprites/bootstrap.js` for `BattleScene`, but that plan has only been written, never implemented, so `window.Cardslayer` isn't there to extend. This spec creates it via a new `src/world/bootstrap.js`:

```js
import { WorldScene } from "./world-scene.js";

window.Cardslayer = window.Cardslayer || {};
Object.assign(window.Cardslayer, { WorldScene });
```

Written this way (merge onto whatever's already there, rather than overwrite) so that whenever the character-art-pipeline plan's own bootstrap module is eventually implemented — regardless of which lands first — the two compose instead of one clobbering the other's `<script type="module">` tag's contribution. `index.html` gets one new tag for this: `<script type="module" src="src/world/bootstrap.js"></script>`.

Because `.view` sections are hidden with CSS (`display:none`) rather than removed from the DOM, `worldScene`'s canvas and internal `position`/`target`/`cameraX` state simply persist when the user navigates to another tab and back — satisfying Goal 4 with no extra code.

To satisfy Goal 5 (don't burn CPU on a hidden tab), `go()` (`app.js:87-92`) gets one small addition: when leaving `"world"`, call `worldScene?.pause()`; when entering `"world"`, call `worldScene?.resume()`. `WorldScene` gains:

```js
pause() { this.app.ticker.stop(); }
resume() { this.app.ticker.start(); }
```

`pause()`/`resume()` are no-ops (safe to call) before `loadZone` has run — `this.app` is constructed in the `WorldScene` constructor (before any zone is loaded), so `this.app.ticker` always exists once a `WorldScene` instance exists at all; `go()` only calls them through `worldScene?.pause()` regardless, which handles the case where `renderers.world` has never even run yet (`worldScene` is still `null`).

## 6. Resize handling

`WorldScene` gains a `ResizeObserver` on `mountElement`, created in `loadZone` right after the Pixi `Application` is initialized:

```js
this._resizeObserver = new ResizeObserver((entries) => {
  const { width, height } = entries[0].contentRect;
  this.resize(width, height);
});
this._resizeObserver.observe(this.mountElement);
```

```js
resize(width, height) {
  this.app.renderer.resize(width, height);
  this.ground.clear().rect(0, this.zone.groundTop, this.zone.width, this.zone.groundBottom - this.zone.groundTop).fill(0x5fa14a);
}
```

No changes are needed to the camera math itself: `_onTick` already reads `this.app.screen.width` fresh every frame and passes it into `computeCameraX` (per the original spec's `world-scene.js`), so a resize is picked up automatically on the very next tick — clamping to the new width happens for free via the existing `[0, max(0, zoneWidth - viewportWidth)]` clamp in `computeCameraX`. Only the renderer's own pixel dimensions and the ground graphic's redraw (so it still covers the full new canvas height) need explicit handling here.

`ResizeObserver` fires once immediately upon `observe()` in every browser Cardslayer targets (iOS Safari via Capacitor, and desktop browsers for development), so no separate "initial size" code path is needed — the same callback that handles later resizes also performs the first sizing.

## 7. Testing

- No new pure-function logic is introduced (§4–6 are Pixi/DOM wiring, consistent with how `world-scene.js` itself has no unit tests today — only `world-movement.js`'s pure functions do, per the original spec, and that file is untouched here).
- **Manual/visual**, on top of the original spec's `dev/world-preview.html` checklist (still valid, unaffected):
  1. Open the app fresh (`npm start`), confirm World is reachable from the bottom nav and the map fills the same visible area Home/Quests/etc. do — no gap above the bottom nav, no overflow/scroll appearing on the page itself.
  2. Walk partway across the map, switch to Inventory, switch back to World — confirm the character is still standing where it was left, not reset to `spawnX`/`spawnY`.
  3. While on World, resize the browser window (or rotate the device/emulator) — confirm the map's ground/sky redraws to fill the new size with no stretched or clipped canvas, and the camera still clamps correctly at both zone edges afterward.
  4. Switch away from World to another tab, wait a couple of seconds, switch back — confirm the character hasn't silently kept moving/animating while hidden (i.e. `pause`/`resume` actually stopped and restarted the ticker — verified indirectly: position shouldn't have advanced toward a stale target during the time away beyond what a single resumed tick would cover).
  5. Check the browser console throughout for errors.

## 8. Error handling

Unchanged from the original spec (§10 there) — `loadZone`'s existing try/catch around the zone fetch still applies; nothing in this integration introduces a new failure path beyond what a `ResizeObserver` callback could throw, which it won't under normal DOM operation.

## 9. Order of work

1. `index.html`: add the `world` `<section>`/`<nav-item>` markup, and the new `<script type="module">` tag for `src/world/bootstrap.js`.
2. `style.css`: `.bottomnav` grid column count, `.world-root` rule.
3. `src/world/bootstrap.js`: bridge `WorldScene` onto `window.Cardslayer`, mirroring the sprite bootstrap pattern.
4. `src/world/world-scene.js`: replace the fixed `VIEWPORT_WIDTH`/height sizing with container-measured sizing; add `resize()`, `pause()`, `resume()`, and the `ResizeObserver` wiring.
5. `app.js`: add `renderers.world`, and the `pause`/`resume` calls inside `go()`.
6. Manual verification pass against §7's checklist.
