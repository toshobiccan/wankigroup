# Overworld Movement Prototype — Design Spec

**Project:** Cardslayer
**Date:** 2026-09-15
**Status:** Approved in discussion, pending written review
**Scope:** Sub-project 1 of the open-world pivot. Proves click/tap-to-move + soft-follow camera in a single placeholder zone. Does not cover real tile art, encounters/mobs, zone transitions, or a walk animation for the character — those are separate sub-projects, sequenced after this one proves out.

---

## 1. Goals

1. Validate the new, uncertain tech first — click-to-move, walk-toward-point movement, and a soft-follow camera — before spending any art budget on the open world.
2. Match the already-approved character art direction: side-view, horizontal movement only, no new sprite angles. This keeps the world pivot compatible with `docs/specs/2026-09-15-character-art-pipeline-design.md` instead of reopening it.
3. Treat a "zone" as data (JSON), not hardcoded geometry, consistent with how `data/equipment/` and `data/mobs/` already work — so a real tileset can later replace the placeholder rendering without redoing the movement/camera code.
4. Keep this fully isolated from the working battle prototype. Nothing in `app.js`'s existing import/battle/quest flow is touched.

## 2. Non-goals (this sub-project)

- Real tile art or any AI-generated/Aseprite assets. Ground and player are flat-colour placeholder shapes.
- Obstacles, collision, or terrain height changes.
- Mobs, encounters, or any hand-off into the battle screen.
- Zone transitions or more than one zone.
- A `walk` animation for the character. The approved character spec (§2) has no walk cycle; this prototype's placeholder doesn't need one either. Whether to add a walk animation later is a decision for a future sub-project, once this movement model is proven and once real art direction for it is discussed.
- Vertical movement or jumping.
- Persisting the player's position in the world between sessions.
- Wiring this into the main app's navigation (`go(view)` / bottom nav). This stays a standalone dev page until it's proven and until the encounter sub-project defines how the world and battle screens hand off to each other.

## 3. Relationship to the character art pipeline spec

This is the first piece of work in the repo that needs PixiJS actually vendored. `docs/superpowers/plans/2026-09-15-character-art-pipeline.md` Task 4/Step 1 already covers fetching a pinned `vendor/pixi.min.mjs` build the same way JSZip/sql.js/fzstd are vendored (see `vendor/README.md`). Whichever of the two pieces of work is implemented first does that vendoring step; the other must reuse the same `vendor/pixi.min.mjs` and `vendor/README.md` row rather than re-fetching a possibly-different version. This spec assumes that step happens here, since the user chose to build the movement prototype first — if the art-pipeline plan's Task 4 lands first instead, this spec's Task 1 (below) should skip re-vendoring and just confirm the existing `vendor/pixi.min.mjs` is present.

No other coupling exists: this spec's code lives entirely under `src/world/`, `data/zones/`, and `dev/world-preview.*`, none of which the character-art-pipeline plan touches.

## 4. World representation

A zone is one JSON file under `data/zones/`:

```json
// data/zones/plains.json
{
  "id": "plains",
  "displayName": "Plains",
  "width": 2000,
  "groundY": 160,
  "spawnX": 100
}
```

| Field | Meaning |
|---|---|
| `id` | lower-case snake_case, matches the filename, unique across `data/zones/` |
| `displayName` | shown in UI later; unused by this prototype |
| `width` | total horizontal extent of the zone in world pixels. Deliberately wider than the viewport so the camera has something to pan across. |
| `groundY` | the fixed y-coordinate (world space) the player marker walks along. No vertical movement in this sub-project. |
| `spawnX` | player's starting x position when the zone loads |

`data/zones/` has no generated index file yet (unlike `data/equipment/`/`data/mobs/`) — with one zone, `dev/world-preview.js` just fetches `data/zones/plains.json` directly by name. A `data/index.json`-style zone list is deferred until a second zone exists and something needs to enumerate them.

## 5. Input and movement model

- Input is handled via the Pointer Events API (`pointerdown` on the Pixi canvas), so mouse clicks and touch taps share one code path — this matters since the stated reason for camera-follow-over-fixed-camera is mobile screen size.
- A pointer event's canvas-space x is converted to world-space x by adding the current camera offset, then clamped to `[0, zone.width]`. This becomes `targetX`.
- Every tick (Pixi's `app.ticker`), if `playerX !== targetX`, the player moves toward `targetX` at a fixed speed (`MOVE_SPEED` world-pixels/second, using the ticker's `deltaMS` for frame-independent motion) and stops exactly at `targetX` when within one frame's travel distance — no overshoot/oscillation.
- Clicking a new point while already moving simply replaces `targetX`; the character smoothly redirects, no queueing.

## 6. Camera model

Soft-follow with a horizontal dead-zone, the standard 2D-RPG pattern:

- The viewport has a central dead-zone, e.g. the middle 40% of its width. While the player marker's *screen* position stays inside that band, the camera doesn't move.
- Once the player would cross the dead-zone's edge, the camera offset shifts by exactly enough to keep the player at the dead-zone boundary — the player never visually leaves the dead-zone during continuous movement toward one target.
- Camera offset is clamped so it never scrolls past the zone's own edges (`0` to `zone.width - viewportWidth`; if `zone.width <= viewportWidth` the camera just stays at `0`).
- All of this — dead-zone check, clamped camera offset calculation — is one pure function of `(playerX, cameraX, viewportWidth, zoneWidth)` returning the new `cameraX`, kept separate from any Pixi/rendering code specifically so it's unit-testable without a canvas (see §8).

## 7. Rendering

- One `PIXI.Application` sized to the dev page's container.
- Ground: a single flat-colour `PIXI.Graphics` rectangle spanning `zone.width`, positioned so its top sits at `groundY`. Sky: a flat background colour on the application/stage.
- Player: a small flat-colour `PIXI.Graphics` circle (or rectangle — visually arbitrary, it's a placeholder) positioned at `(playerX, groundY)`, rendered inside a container whose x is offset by `-cameraX` each frame (equivalently: the ground/player container's x is set to `-cameraX`, everything scrolls together).
- `roundPixels: true` and nearest-neighbour scaling are not required for placeholder flat shapes, but are set anyway on the `PIXI.Application` so the eventual swap to real pixel-art tiles doesn't require touching renderer setup.

## 8. Source files and layout

```
data/
  zones/
    plains.json
src/
  world/
    world-movement.js     # pure functions: clampTarget, stepTowardTarget, computeCameraX — no Pixi/DOM imports
    world-scene.js         # PixiJS wiring: loads a zone, owns the Application, ground, player graphic, ticker loop; uses world-movement.js's pure functions
dev/
  world-preview.html
  world-preview.js         # loads data/zones/plains.json, constructs a WorldScene, mounts it
```

`world-movement.js` exports:

```js
export function clampTarget(x, zoneWidth)                                   // number
export function stepTowardTarget(currentX, targetX, deltaMS, speedPxPerSec) // number, new currentX
export function computeCameraX(playerWorldX, cameraX, viewportWidth, zoneWidth, deadZoneFraction) // number, new cameraX
// playerWorldX: player's x in world space (same space as zone.width).
// cameraX: the camera's current offset (world space of the viewport's left edge).
// The player's on-screen x is playerWorldX - cameraX; computeCameraX only
// changes cameraX once that screen x would leave the central dead-zone band
// (width = viewportWidth * deadZoneFraction), and always clamps the result
// to [0, max(0, zoneWidth - viewportWidth)].
```

`world-scene.js` exports:

```js
export class WorldScene {
  constructor({ mountElement })
  async loadZone(zoneJsonUrl)   // fetches the zone JSON, sets up ground/player at spawnX, starts the ticker
}
```

## 9. Testing

- **Unit (Vitest):** `world-movement.js`'s three pure functions — `clampTarget` clamps below 0 and above `zoneWidth`; `stepTowardTarget` moves by exactly `speed * deltaMS/1000` toward the target and never overshoots past it; `computeCameraX` stays put while the player is inside the dead-zone, pans exactly enough to keep the player at the dead-zone edge once outside it, and clamps at both zone edges (including the `zoneWidth <= viewportWidth` case, where it must stay at `0`).
- **Manual/visual:** `dev/world-preview.html`, same "not shipped, dev-only" status as the character-pipeline plan's `dev/rig-gallery.html`. Click/tap around the zone and confirm: the player walks toward the click point at a constant speed, the camera stays still while the player is central, pans smoothly once the player nears an edge, and never shows past the zone's boundaries in either direction.

## 10. Error handling

- Zone JSON fails to load (404, bad JSON): `WorldScene.loadZone` logs a `console.error` with the URL and leaves the scene empty rather than throwing past the caller — matches the error-handling posture already established in the character-art-pipeline spec (§9: never crash, degrade visibly and log).
- A pointer event outside the canvas bounds: ignored (Pixi's own hit-testing already scopes events to the canvas; no extra handling needed).

## 11. Order of work

1. `data/zones/plains.json`.
2. `src/world/world-movement.js` (pure functions) with Vitest tests — no PixiJS dependency, can be written and fully tested before anything renders.
3. Vendor PixiJS (`vendor/pixi.min.mjs`, `vendor/README.md`) — skip if the character-art-pipeline plan's Task 4/Step 1 already did this; reuse the same file.
4. `src/world/world-scene.js` — Pixi wiring, consuming Step 2's pure functions.
5. `dev/world-preview.html` + `dev/world-preview.js`.
6. Manual verification pass against §9's checklist.
