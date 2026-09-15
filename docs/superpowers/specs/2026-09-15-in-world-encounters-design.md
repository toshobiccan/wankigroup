# In-World Encounters — Design Spec

**Project:** Cardslayer
**Date:** 2026-09-15
**Status:** Approved in discussion, pending written review
**Scope:** Replaces the standalone Battle tab with mobs that live directly in the World view. Walking up and clicking a mob twice (select, then attack) starts a fight presented as a draggable bottom sheet over the world — flashcard grading damages the mob in place, with the sheet retracting briefly to show the hit. Builds on `docs/superpowers/specs/2026-09-15-overworld-movement-prototype-design.md` and `docs/superpowers/specs/2026-09-15-world-view-shell-integration-design.md`, both unchanged by this spec except where explicitly noted in §3.

---

## 1. Goals

1. One screen for exploring and fighting — no tab switch between "walking around" and "answering cards." The Battle tab is removed entirely.
2. Mobs are visible, clickable entities standing at fixed points in the world, each showing name, level, and an HP bar at a glance — not abstract deck-picker rows.
3. The flashcard/grading UI is a bottom sheet the player can drag taller to read a long card in full, or tap an image within a card to zoom it — while the world (character, mob, HP bar) stays visible above.
4. Grading a card is visually connected to the fight: Again does nothing (no attack to show); Hard/Good/Easy retract the sheet just long enough to see the hit land, then return to reading the next card.
5. Reuse the existing spaced-repetition scheduling (`schedule()`) and reward math unchanged — this spec only replaces *how battle is triggered and presented*, not the underlying study mechanics.

## 2. Non-goals (this sub-project)

- Real mob sprite art or attack/hit sprite animations. Mobs stay emoji placeholders (already the case today — see §9 for what "attack animation" concretely means without real animated art). Any richer animation is a separate future sub-project once the animation-pipeline decisions from earlier discussion (Spine/Character Animator) land.
- Roaming/wandering mobs — fixed spawn points only, per the approved decision.
- Per-mob deck assignment — one player-wide "active deck," set on Home, supplies every encounter (per the approved decision).
- Mob respawn or persistence beyond the current page load. A defeated mob is gone for the rest of that `WorldScene` instance's lifetime (i.e., until the page is reloaded) — no save/restore of which mobs are alive.
- Multiple zones, zone-to-zone travel, or per-zone mob pools beyond what's in `data/zones/plains.json`.
- Any change to `schedule()`'s SM-2-ish algorithm or to how decks are imported.

## 3. Relationship to other specs

- **Movement** (`2026-09-15-overworld-movement-prototype-design.md`): unchanged. `clampToZone`/`stepTowardTarget`/`computeCameraX` and their contracts are untouched. This spec adds a new *kind* of pointerdown target (a mob) that the existing click-to-move handling must not treat as a walk destination — see §5.
- **Shell integration** (`2026-09-15-world-view-shell-integration-design.md`): the Battle tab and nav item this spec removes were added *before* the World tab existed, back when Battle was the only way to fight. Removing them returns the bottom nav to 5 columns. `renderers.world`'s lazy-init-once pattern, `pause()`/`resume()`, and resize handling are all unchanged.
- **Character art pipeline** (`docs/specs/2026-09-15-character-art-pipeline-design.md`): still not implemented (confirmed — no `CharacterRig`, no `data/mobs/`, no Aseprite pipeline exists in the repo). This spec does not depend on it and does not implement any part of it. Mobs here are plain emoji + HP bar, not sprite rigs.

## 4. Data model

Mobs become part of the zone they're placed in — `data/zones/plains.json` gains a `mobs` array:

```jsonc
{
  "id": "plains",
  "displayName": "Plains",
  "backgroundImage": "assets/world-background.png",
  "groundTopFrac": 0.7354,
  "groundBottomFrac": 0.7737,
  "spawnXFrac": 0.25,
  "spawnYFrac": 0.7546,
  "mobs": [
    { "id": "goblin_1", "name": "Forgetful Goblin", "level": 3, "icon": "👺", "xFrac": 0.42, "cardsToKill": 5, "xpReward": 50, "coinReward": 15 },
    { "id": "wraith_1", "name": "Cram Wraith", "level": 5, "icon": "👻", "xFrac": 0.68, "cardsToKill": 8, "xpReward": 90, "coinReward": 25 }
  ]
}
```

- `xFrac` is a fraction of `zone.width`, same convention as `spawnXFrac` — resolved to world-pixels the same way, on load and on every resize.
- Every mob stands at the same y: the vertical center of the walkable band (`(zone.groundTop + zone.groundBottom) / 2`), computed once the band itself is known. No per-mob y — they're all on the same ground line the player walks on.
- `cardsToKill` replaces the old flat `SESSION_SIZE = 10` — each mob has its own HP now, in "cards remaining" units, matching the pitch deck's original squishy-mob/boss distinction (§12 of the original pitch deck research: small numbers for weak mobs, 50+ for a boss). The two mobs above are a deliberately easy first pair to place and test with.
- `icon`/`name`/`level`/rewards are authored directly per mob entry — no separate `data/mobs/` registry. With one zone and a handful of mobs, a shared registry is premature; revisit if a second zone needs to reuse mob definitions.

**Player state** (`app.js`'s `player` object, already persisted to `localStorage` via `savePlayer()`) gains one field:

```js
activeDeckId: null // set from Home; encounters read this to know which deck's cards to draw from
```

## 5. Selection and attack — the click state machine

Lives in `WorldScene`. Each mob is rendered as its own `PIXI.Container` (icon text + name/level label + HP bar, always visible per §6) with `eventMode = "static"` and its own `pointerdown` listener — this is what lets a mob capture a click before it reaches the canvas-wide ground-click handler that currently drives movement (`_setTargetFromPointer`, unchanged). A mob's listener calls `event.stopPropagation()`, so clicking a mob never also sets a walk target.

States, held as `this.selectedMob` (`null` | a mob object) and `this.inCombat` (`boolean`) on `WorldScene`:

- **Idle** — `selectedMob = null`. Clicking empty ground moves the player as it already does. Clicking a mob → **Selected** on that mob.
- **Selected** — `selectedMob = <mob>`, `inCombat = false`. The mob gets a glow outline (a `PIXI.Graphics` ring or a filter, drawn behind/around its icon). Player movement is locked (pointerdown on the ground is ignored while `selectedMob` is set — walking away requires deselecting first). Clicking the *same* mob again → **Combat**. Clicking a *different* mob → **Selected** on that one instead (glow moves, no combat starts). Clicking empty ground → back to **Idle** (glow removed, movement unlocked).
- **Combat** — `inCombat = true`. Movement stays locked. Clicking anything in the world is ignored until combat ends (no accidental deselect mid-fight). Ends when the mob's `cardsToKill` reaches 0 (defeat) or the player's hearts reach 0 (flee-by-defeat, matching the existing `endBattle(false)` case) — both return to **Idle**, movement unlocked, and (only on defeat) the mob is removed from the zone permanently for this session.

`WorldScene` exposes this state via constructor callbacks, since it has no built-in event emitter (it's a plain class, not a `PIXI.Container`):

```js
new WorldScene({
  mountElement,
  onMobSelected(mob),      // mob object, or null when deselected
  onCombatStart(mob),      // fires once, when the 2nd click lands
});
```

The reverse direction — the encounter UI driving visuals back into the world — is plain method calls on the `WorldScene` instance (not events), listed in §7.

## 6. Always-visible mob HUD

Every mob, whether selected or not, shows above its icon:

- Name + level (small text, e.g. "Forgetful Goblin · Lv 3").
- An HP bar reflecting `cardsRemaining / cardsToKill` (starts full, ticks down per successful hit during combat).

This matches the "you can see what's around without clicking anything" goal from earlier in the design discussion and gives the player information to decide which mob to engage before committing.

## 7. Combat presentation — the draggable sheet

A new DOM overlay, `EncounterPanel` (its own small ES module, `src/world/encounter-panel.js`, bridged onto `window.Cardslayer` the same way `WorldScene` already is via `src/world/bootstrap.js`), owns everything below the world canvas during Selected/Combat. `app.js` drives it — `EncounterPanel` has no knowledge of decks, scheduling, or `DB`; it only renders what it's told and reports gestures/taps back up.

```js
export class EncounterPanel {
  constructor({ mountElement })
  showPeek(mob)                      // Selected state: name/level/HP/rewards, "tap again to attack"
  showCard(card, mob)                // Combat state: card front, hearts row, grade buttons (disabled until revealed)
  reveal(card)                       // shows the back + enables grade buttons
  hide()                             // back to nothing shown (Idle)
  retract()                          // §7 retract-on-hit: collapse to a minimal height, keeping only the handle visible
  restore()                          // return to whichever of default/expanded was active before retract()
  onGrade(grade)                     // the one thing only EncounterPanel's own DOM can detect: "again" | "hard" | "good" | "easy"
}
```

`EncounterPanel` never detects mob clicks or ground clicks itself — those are hit-tested on the Pixi canvas (§5), not inside the panel's DOM. `app.js` is the only thing that listens to *both* sides and connects them: `WorldScene`'s `onMobSelected(mob)` calls `encounterPanel.showPeek(mob)` when `mob` is truthy and `encounterPanel.hide()` when it's `null` (covers both "clicked a different mob" and "deselected by clicking the ground"); `onCombatStart(mob)` calls `encounterPanel.showCard(...)` with the first real card. `EncounterPanel.onGrade` is the only callback flowing the other way.

**Sheet heights** — three, CSS-transitioned:
- `peek` (Selected): short, fixed, not draggable. Mob name/level, HP, reward preview, "Tap the goblin again to attack."
- `default` (Combat, normal): the height combat opens to. Card front/back, image thumbnail if present, hearts row, four grade buttons.
- `expanded` (Combat, dragged up): near the top of the world area, for reading a long card in full. Reached only by dragging the handle; snaps back to `default` if released closer to it than to `expanded`, and to `expanded` if released closer to that.

**The handle**: a small pill strip at the very top of the sheet, drag-only surface (Pointer Events, same mouse/touch-unifying approach already used for world movement). Dragging it changes the sheet's height live between `default` and `expanded`; releasing snaps to whichever of the two is nearer. The card content area below it (`overflow-y: auto`) scrolls independently — a touch/drag starting inside the card text scrolls that text, only a drag starting on the handle itself resizes the sheet, because the drag listener is attached to the handle element specifically, not the whole panel.

**Remembering height across a fight**: whichever of `default`/`expanded` the sheet is snapped to persists across cards within the same fight (`EncounterPanel` tracks this internally) — pulling up once for a long card doesn't force re-dragging for every card after it. Resets to `default` when a new fight starts (`showPeek` → next `showCard`).

**Image zoom**: any image inside a card's front/back gets a tap handler that opens a full-screen lightbox (`position: fixed`, covers the whole viewport including the world above) showing that image large; tapping anywhere or swiping down closes it back to the card. This is pure presentation inside `EncounterPanel`/the card-rendering helper — no new data beyond what's already in the card's `front`/`back` HTML.

**Retract-on-hit**: driven by `app.js` (which owns grading), not by `EncounterPanel` deciding on its own:
- Grade **Again**: no retraction. `EncounterPanel.showCard()` is called again immediately with the requeued/next card — nothing in the world needs to be seen, matching "if again is pressed, nothing happens (no attacks)." The hearts row (already part of the sheet, per §7's `showCard`) updates to reflect the lost heart, so the player sees that consequence without needing the world visible.
- Grade **Hard/Good/Easy**: `app.js` calls a new `WorldScene` method to play the hit (§8), *awaits* it, and only then calls `EncounterPanel.showCard()` for the next card (or ends the fight). While that hit plays, `app.js` temporarily collapses the sheet to a minimal height (smaller than `peek` — just enough to keep the handle visible) via a fourth, transient height the panel exposes as `EncounterPanel.retract()` / `EncounterPanel.restore()` (restore returns to whatever `default`/`expanded` state was active before retracting).

## 8. What "attack animation" actually means here

No animated character/mob art exists yet (confirmed — the player is one static image, mobs are emoji). So the "hit" the sheet retracts to reveal is built entirely from tweens on the existing static pieces, not sprite frames:

- `WorldScene.playHit(mob, damage)` — returns a `Promise` that resolves when the sequence finishes (~600ms):
  1. Player container does a short forward-lunge-and-back tween (position offset, no new art).
  2. On "impact," a floating damage number (`PIXI.Text`, e.g. `-10` or `CRIT!`) rises and fades above the mob — the in-world equivalent of the old DOM `floatText`.
  3. The mob's icon does a brief scale/shake tween (replaces the old CSS `.monster.hit` shake).
  4. The mob's HP bar animates down to its new fraction.
  5. If this hit brought `cardsRemaining` to 0, the mob's icon fades out and it's removed from the zone.
- Tweening is hand-rolled (`this.app.ticker`-driven interpolation over N frames) — no new dependency. The project already avoids adding libraries beyond what's vendored; this is a small enough need (a handful of linear/eased lerps) not to justify one.
- This is explicitly a placeholder-quality animation, not the endpoint. Once real animated art exists (via whichever path comes out of the earlier Spine/Character Animator discussion), `playHit` is the one function that gets rewritten — everything upstream of it (the state machine, the sheet, the grading flow) stays the same.

## 9. Deck selection (Home)

Home's deck rows (`renderers.home`, `app.js:188-218`) currently have a "⚔️" button calling the now-deleted `startBattle(d.id)`. Replace it with a "Set Active" toggle: tapping it sets `player.activeDeckId = d.id`, saves, and re-renders the list with the active deck visually marked (e.g. a star or highlighted border) so it's always clear which deck encounters are drawing from.

Starting a combat with no active deck set, or an active deck that no longer exists (was deleted since being set), shows a message in the sheet instead of a card front — "Pick an active deck on Home first" with a button that navigates there — matching the existing empty-state pattern already used elsewhere (e.g. `renderers.home`'s own "No decks yet" panel).

## 10. What gets removed

- `index.html`: the Battle `<section>` and its nav `<button>`. Bottom nav grid goes from `repeat(6, 1fr)` back to `repeat(5, 1fr)`.
- `app.js`: `MONSTERS`, `SESSION_SIZE`, `renderers.battle`, `startBattle`, `renderBattle`, the old `answer`/`endBattle`/`floatText` (DOM-`getBoundingClientRect`-based) — replaced by the World-integrated flow this spec describes. `schedule(card, grade)` is kept exactly as-is and called from the new flow unchanged.
- `style.css`: `.arena`, `.monster*`, `.flashcard`, `.answer-actions`, `.float-dmg`, `.hero-hurt` and related keyframes, once confirmed unused elsewhere (a grep pass during implementation, not assumed here) — replaced by new `.encounter-sheet`/`.sheet-handle`/`.lightbox` rules. Button styling for grade buttons (`.a-again` etc.) is likely reusable as-is inside the new sheet markup; the outer containers are what's actually new.

## 11. Error handling

- No active deck, or active deck deleted: handled in the sheet itself per §9, never a crash.
- Active deck has zero cards left overall (e.g. all deleted): same empty-state treatment, reusing whatever copy fits ("This deck has no cards - import more or pick another").
- `WorldScene`'s existing zone-load failure handling (§10 of the movement spec: log and leave the scene empty) is unchanged and unaffected by mobs — if the zone fails to load, there are no mobs to place either.

## 12. Testing

- No new pure-function logic comparable to `world-movement.js` — the state machine (§5) is event/callback-driven UI logic, tested manually.
- **Manual/visual**, on top of the existing World checklist (movement, resize, pause/resume, all still valid and unaffected):
  1. Click a mob — glow appears, peek sheet shows correct name/level/HP/rewards, movement is locked (clicking the ground does nothing).
  2. Click a different mob while one is selected — glow moves, peek updates, still not in combat.
  3. Click the ground while peeking — glow and sheet both clear, movement unlocked.
  4. Click the same mob twice — combat starts, sheet opens to `default` height with a real card from the active deck.
  5. Drag the handle up — sheet reaches `expanded`, card area is scrollable independently, releasing snaps correctly to whichever height is nearer.
  6. Tap an image in a card — full-screen zoom opens; tap/swipe-down closes it.
  7. Grade Again — no retraction, hearts row loses one heart, next card (with this one requeued later) appears immediately.
  8. Grade Hard/Good/Easy — sheet retracts, hit plays (lunge, damage number, mob shake, HP bar drop), sheet restores to whatever height it was at, next card appears.
  9. Defeat a mob (HP to 0) — mob fades out and is gone; sheet shows a reward summary then returns to Idle; the mob no longer exists if you walk back to that spot.
  10. Deplete hearts — same defeat-modal-equivalent flow for a loss, back to Idle, mob still alive (not removed on a loss).
  11. No active deck set — clicking to attack shows the "pick an active deck" message instead of a card, with a working link to Home.
  12. Home: setting a different deck active updates the marker and changes which deck the next encounter pulls from.
  13. Console check throughout — no errors.

## 13. Order of work

1. `data/zones/plains.json`: add the `mobs` array (two mobs, per §4).
2. `player.activeDeckId` + Home's "Set Active" toggle, replacing the old "⚔️" button (§9) — independently testable before any World changes.
3. `WorldScene`: mob rendering (icon + name/level label + HP bar, §6), click hit-testing and the selection/attack state machine (§5), including the movement-lock behavior.
4. `WorldScene.playHit()` (§8) — hand-rolled tween sequence, testable on its own via the dev preview page with a fake damage value before wiring up real grading.
5. `src/world/encounter-panel.js` (§7): the sheet itself — peek/default/expanded heights, drag-to-resize with snap, independent card-area scroll, image lightbox. Testable in isolation with fake card data before wiring to real decks.
6. `app.js` wiring: remove the old Battle code (§10), wire `WorldScene`'s callbacks to `EncounterPanel`, implement the real grading flow (deck/card queue, `schedule()` calls, reward math, retract-on-hit sequencing per §7).
7. Remove the Battle nav item and section, shrink the nav grid back to 5 columns.
8. Manual verification pass against §12's checklist.
