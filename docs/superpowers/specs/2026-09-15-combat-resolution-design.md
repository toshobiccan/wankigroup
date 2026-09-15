# Combat Resolution — Design Spec

**Project:** Cardslayer
**Date:** 2026-09-15
**Status:** Approved in discussion, pending written review
**Scope:** Gives the in-world encounter system real stats and real damage. Builds directly on `docs/superpowers/specs/2026-09-15-in-world-encounters-design.md` (the "encounters" spec), which designed the click-to-engage state machine and the draggable `EncounterPanel` sheet but explicitly left combat unimplemented — mob HP was a flat `cardsToKill` counter, the player had no HP at all, and clicking an already-selected mob was a no-op. This spec fills that gap.

---

## 1. Goals

1. Every mob and the player have the same seven stats: `hp`, `attackDamage`, `magicDamage`, `armor`, `magicResist`, `attackSpeed`, `luck`.
2. Clicking an already-selected mob starts combat for real (the encounters spec's `onCombatStart(mob)` callback stops being a no-op).
3. Grading a card is the player's action for the round: **Again** does nothing (no round, no HP change, matching the encounters spec). **Hard/Good/Easy** commits a round — both combatants attack, in an order decided by comparing `attackSpeed`, exactly once each (Pokémon-style: a knockout skips the loser's retaliation).
4. The exact formulas for `magicDamage`, `armor`, `magicResist`, and `luck` are explicitly deferred — this spec declares them on the data model and reserves them as a seam, but only `hp`, `attackDamage`, and `attackSpeed` are read by any code right now.
5. Player HP persists across fights (no passive regen). Reaching 0 ends the fight, respawns the player at the zone's spawn point with full HP, and leaves the mob alive.

## 2. Non-goals (this sub-project)

- Defining what `magicDamage`, `armor`, `magicResist`, or `luck` actually do. They exist in the data and are carried through the round result, untouched by any formula, until a future pass defines them.
- Any change to the encounters spec's sheet mechanics (drag-to-expand/`expanded` height, image lightbox, independent card-area scroll) or to `schedule()`'s scheduling algorithm. Both are reused exactly as speced.
- Healing items, rest spots, or any other HP-recovery mechanic besides the death/respawn described in §6. "No regen yet" is a deliberate, explicit gap.
- Stat growth from leveling, gear, or quests. Both player and mob stat blocks are static for this pass.
- Multiple mobs ganging up, ranged/AoE effects, or anything beyond a strict 1v1 exchange.

## 3. Relationship to other specs

- **In-world encounters** (`2026-09-15-in-world-encounters-design.md`): this spec supersedes only the parts of it that depended on `cardsToKill`-as-health and the old hearts model. Specifically:
  - §4's mob JSON shape: `cardsToKill` is replaced by a `stats` object (§4 below). `xpReward`/`coinReward` are unchanged.
  - §5's click state machine (Idle → Selected → Combat, `onMobSelected`/`onCombatStart` callbacks, movement-lock behavior) is unchanged in shape. This spec is what finally makes the **Selected → Combat** transition (second click on an already-selected mob) do something real.
  - §6's always-visible mob HUD (name/level/HP bar) is unchanged in structure; the HP bar now reflects real `hp`/max `stats.hp` instead of `cardsRemaining`/`cardsToKill`.
  - §7's `EncounterPanel` sheet (peek/default/expanded heights, drag-to-resize, image lightbox) is unchanged and reused as designed. Its "hearts row" is replaced by a player HP bar (same slot in the sheet, different content) since hearts no longer exist.
  - §7's retract-on-hit sequencing is extended: a round can now involve *two* hits (player's and the mob's, in speed order) instead of one, and the second hit is skipped visually if the first one was a knockout.
  - §8's `WorldScene.playHit()` is extended to accept and play an ordered list of one or two hits (see §5 below) instead of a single fixed hit.
  - §9 (deck selection / `activeDeckId`), §10 (removal of the old Battle tab/code), and §11 (error handling) are unchanged and still apply as-is.
- **Movement** and **shell integration** specs: untouched, not referenced further here.

## 4. Data model

### Mob stats (`data/zones/plains.json`)

Each mob's `cardsToKill` field is replaced by a `stats` object:

```jsonc
{
  "id": "goblin_1",
  "name": "Forgetful Goblin",
  "level": 3,
  "image": "assets/mob-goblin.png",
  "portrait": "assets/mob-goblin-head.png",
  "xFrac": 0.55,
  "stats": {
    "hp": 40,
    "attackDamage": 6,
    "magicDamage": 0,
    "armor": 0,
    "magicResist": 0,
    "attackSpeed": 8,
    "luck": 0
  },
  "xpReward": 50,
  "coinReward": 15
}
```

The numbers above are illustrative starting values, not final balance — easy to retune later since they live in plain zone data, not code.

`WorldScene.loadZone()` currently builds a runtime copy of each mob with `{ ...rawMobData, cardsRemaining: rawMobData.cardsToKill }` (`world-scene.js:149`). This becomes `{ ...rawMobData, hp: rawMobData.stats.hp }` — the runtime `hp` field is the mob's *current* HP and ticks down during combat; `stats.hp` stays fixed as the max, exactly mirroring how `cardsToKill`/`cardsRemaining` worked before.

### Player stats (`app.js`)

`defaultPlayer` (`app.js:5`) gains a `stats` block and a top-level current-`hp` field:

```js
const defaultPlayer = {
  name: "Adventurer",
  level: 1,
  xp: 0,
  coins: 0,
  gems: 0,
  stats: {
    hp: 100,
    attackDamage: 12,
    magicDamage: 0,
    armor: 2,
    magicResist: 2,
    attackSpeed: 10,
    luck: 0,
  },
  hp: 100, // current HP -- persists across fights, separate from the max in stats.hp
  daily: { date: "", reviewed: 0, battlesWon: 0, imported: 0, claimed: [] },
};
```

`hp` is saved/restored by the existing `savePlayer()`/`loadPlayer()` (`app.js:14-26`) with no changes needed there — it's just another field on the same object.

### What's live vs. reserved

Only three of the seven stats are read by any code after this spec: `hp` (health pool), `attackDamage` (damage dealt), `attackSpeed` (turn order). `magicDamage`, `armor`, `magicResist`, and `luck` are present on every stat block, serialized and carried through `resolveRound()`'s inputs (§5), but not consulted by its math. This is intentional — the seam for later formulas is "add a read of these fields inside `resolveRound()`," not "add new fields."

## 5. Combat math: `resolveRound()`

A new pure module, `src/world/combat.js` — no PIXI, no DOM, nothing but stat objects in and a result object out. This is the project's second hand-testable pure module alongside `world-movement.js`.

```js
export const GRADE_MULTIPLIERS = { hard: 0.7, good: 1.0, easy: 1.5 };

// player, mob: { stats: {hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck}, hp }
// grade: "hard" | "good" | "easy" -- never "again" (the caller never calls this for Again)
export function resolveRound({ player, mob, grade }) {
  const playerDamage = Math.round(player.stats.attackDamage * GRADE_MULTIPLIERS[grade]);
  const mobDamage = mob.stats.attackDamage;
  const playerFirst = player.stats.attackSpeed >= mob.stats.attackSpeed; // ties favor the player

  let playerHp = player.hp;
  let mobHp = mob.hp;
  let playerDamageDealt = 0;
  let mobDamageDealt = 0;

  if (playerFirst) {
    mobHp = Math.max(0, mobHp - playerDamage);
    playerDamageDealt = playerDamage;
    if (mobHp > 0) {
      playerHp = Math.max(0, playerHp - mobDamage);
      mobDamageDealt = mobDamage;
    }
  } else {
    playerHp = Math.max(0, playerHp - mobDamage);
    mobDamageDealt = mobDamage;
    if (playerHp > 0) {
      mobHp = Math.max(0, mobHp - playerDamage);
      playerDamageDealt = playerDamage;
    }
  }

  return {
    order: playerFirst ? "player" : "mob",
    playerDamageDealt,   // 0 if the player was knocked out before swinging
    mobDamageDealt,      // 0 if the mob was knocked out before swinging
    playerHp,
    mobHp,
    playerDefeated: playerHp <= 0,
    mobDefeated: mobHp <= 0,
    isCrit: grade === "easy",
  };
}
```

Notes:

- `GRADE_MULTIPLIERS` is exported specifically so it's easy to find and retune without reading the rest of the function.
- The knockout check (`if (mobHp > 0)` / `if (playerHp > 0)`) is what makes this Pokémon-style: whoever is slower only gets to swing if they survived the faster combatant's hit.
- This function is synchronous and has no side effects — it doesn't touch `WorldScene`, `EncounterPanel`, or `player`/mob objects in place. The caller (`app.js`) takes the returned `playerHp`/`mobHp` and writes them back into `player.hp` and the mob's runtime `hp` itself, then persists/animates.
- This is the entire seam for later work: adding armor mitigation, a magic/physical split, or luck-based crit/dodge means editing the body of this one function. Its inputs/outputs don't need to change shape to do that.

## 6. Fight flow

Extends the encounters spec's state machine (`WorldScene._onMobClick`, `world-scene.js:320-326`) without changing its shape:

- **Selected → Combat**: the guard `if (this.selectedMob === mobEntry) return;` (currently the entire body of the "already selected" case) becomes the trigger: instead of returning, it fires `this.onCombatStart?.(mobEntry.data)` and sets `this.inCombat = true`. Movement stays locked (already true in Selected).
- `app.js`'s `onCombatStart` handler reads the active deck (`player.activeDeckId`, per the encounters spec §9), builds the card queue the same way `startBattle()` used to (`app.js:302-308`), and calls `EncounterPanel.showCard(card, mob)` for the first card.
- **Grading Again**: no call into `resolveRound()`. `EncounterPanel.showCard()` is called again immediately with the requeued/next card, exactly as the encounters spec §7 describes. No HP changes on either side.
- **Grading Hard/Good/Easy**: `app.js` calls `resolveRound({ player, mob: mobEntry.data, grade })`, then:
  1. Writes the result back: `player.hp = result.playerHp`, `mobEntry.data.hp = result.mobHp`, `savePlayer()`.
  2. Retracts the sheet (`EncounterPanel.retract()`, per encounters spec §7).
  3. Calls an extended `WorldScene.playHit()` with the ordered list of hits to animate — one entry if either side was knocked out before swinging, two otherwise:
     ```js
     const hits = [
       { attacker: "player", damage: result.playerDamageDealt, isCrit: result.isCrit },
       { attacker: "mob", damage: result.mobDamageDealt },
     ];
     if (result.order === "mob") hits.reverse();
     worldScene.playHit(mobEntry, hits.filter((hit) => hit.damage > 0));
     ```
     Each entry plays the encounters spec §8 sequence (lunge, floating damage number, shake, HP bar drop) for whichever side is attacking in that entry, in array order — reversed first when the mob went first, so the list always plays in actual resolution order. A `damage: 0` entry (the knocked-out side never swinging, per §5 — the side that *does* swing always deals non-zero damage) is filtered out so nothing animates for a hit that didn't happen.
  4. Restores the sheet (`EncounterPanel.restore()`).
  5. If `result.mobDefeated`: victory flow — reward payout (`xpReward`/`coinReward`, unchanged from the encounters spec), remove the mob from the zone, return to Idle.
     If `result.playerDefeated`: defeat/respawn flow (§7 below) instead of showing another card.
     Otherwise: `EncounterPanel.showCard()` with the next card.

## 7. Player defeat and respawn

When `resolveRound()` returns `playerDefeated: true`:

1. The fight ends immediately — no further cards, no rewards. The mob is untouched (still alive, still at whatever `hp` it had going into this round) and stays exactly where it stood.
2. A full-viewport overlay fades the screen to grey (plain CSS opacity transition on a fixed-position div, not a modal — this is a world event, not a dialog box).
3. While hidden behind the grey fade: `player.hp` is reset to `player.stats.hp` (full, `app.js` writes this directly since it already owns `player`), and `app.js` calls a new public method `worldScene.respawnPlayer()` — mirroring the existing `pause()`/`resume()` pattern of thin public methods rather than reaching into `WorldScene`'s internal `position`/`target` fields from outside. `respawnPlayer()` resets both to the zone's spawn point (`zone.spawnX`/`zone.spawnY` — the same values `loadZone()` already uses on first entry, `world-scene.js:137-138`) and snaps the player sprite there immediately (no walk animation).
4. The overlay fades back out, revealing the player standing at spawn, at full HP, combat state back to Idle.

This is the only HP-recovery mechanism that exists after this spec — HP otherwise persists across fights and idle walking with no passive regen, per Goal 5.

## 8. What changes in existing files

- **`data/zones/plains.json`**: both goblin entries' `cardsToKill` field replaced by `stats` (§4).
- **`app.js`**: `defaultPlayer` gains `stats` + `hp` (§4). `renderMobInfoPanel()` (`app.js:447-464`) reads `mob.hp`/`mob.stats.hp` instead of `mob.cardsRemaining`/`mob.cardsToKill`. New: the `onCombatStart` handler, the grading flow described in §6, and the defeat/respawn flow in §7. Everything the encounters spec already marked for removal (`MONSTERS`, `SESSION_SIZE`, `MAX_HEARTS`, `renderers.battle`, `startBattle`, `renderBattle`, `schedule`-adjacent `answer`/`endBattle`/`floatText`) is still removed exactly as that spec's §10 describes — `schedule()` itself is kept and called from the new flow unchanged.
- **`src/world/world-scene.js`**: `_onMobClick` fires `onCombatStart` on a second click instead of no-op-ing (§6). New `inCombat` flag. `playHit()` (not yet implemented — this is its first real implementation) takes an ordered hit list instead of a single fixed value. New public method `respawnPlayer()` (§7). Mob HP bar fill (`world-scene.js:189`) now reflects `data.hp / data.stats.hp` and shifts color as it drops (green → yellow → red), replacing the "always full" placeholder.
- **New file: `src/world/combat.js`** — `resolveRound()` and `GRADE_MULTIPLIERS` (§5).
- **`src/world/encounter-panel.js`** (not yet implemented — first implementation, per the encounters spec §7): built as that spec describes, with its hearts-row slot showing a player HP bar instead.
- **`style.css`**: new rules for the grey defeat overlay, the player HP bar inside the sheet, and the mob HP bar's color-shift-by-fraction — on top of whatever the encounters spec's own sheet/lightbox styling already needs.

## 9. Error handling

- No active deck / active deck deleted / deck has no cards: unchanged from the encounters spec §11 — handled in the sheet, never a crash.
- `resolveRound()` receiving a mob or player already at 0 HP going in should never happen (both defeat paths end the fight before another round can start) — not defended against defensively, since it would indicate a caller bug, not a real input to handle.

## 10. Testing

- **Unit tests** (new): `test/combat.test.js`, covering `resolveRound()` directly — the project's existing pattern from `test/world-movement.test.js` (13 tests on pure functions, everything else manual). Cases to cover:
  - Good/Hard/Easy each produce the expected multiplied damage.
  - Player faster → player swings first; if that's a knockout, `mobDamageDealt` is 0 and `playerDefeated` is false.
  - Mob faster → mob swings first; if that's a knockout, `playerDamageDealt` is 0 and `mobDefeated` is false.
  - Equal `attackSpeed` → player goes first (tie-break rule).
  - Neither side knocked out → both damage values are non-zero and both HP values drop.
- **Manual/visual**, on top of the encounters spec §12 checklist (still valid, still to be run once `EncounterPanel` exists):
  1. Click a selected mob a second time — combat starts, first card appears.
  2. Grade Again — no HP change on either side, next card appears with no hit animation.
  3. Grade Hard/Good/Easy with the player faster and the hit not lethal — both hits animate in order, both HP bars drop.
  4. Grade Hard/Good/Easy where the player's hit defeats the mob — only the player's hit animates, mob's HP bar hits 0, victory flow fires, mob is gone from the zone afterward.
  5. Engineer a mob-faster scenario (temporarily edit a mob's `attackSpeed` above the player's in zone JSON) and confirm the mob's hit animates first.
  6. Deplete the player's HP to 0 — grey fade plays, player reappears at spawn with full HP, the mob that beat them is still standing where it was.
  7. Console check throughout — no errors.

## 11. Order of work

1. `data/zones/plains.json`: replace `cardsToKill` with `stats` on both mobs (§4).
2. `app.js`: add `stats`/`hp` to `defaultPlayer` (§4).
3. `src/world/combat.js`: `resolveRound()` + `GRADE_MULTIPLIERS`, with `test/combat.test.js` written test-first (§5, §10).
4. `src/world/world-scene.js`: wire `onCombatStart` on the second mob click, add `inCombat`, implement `playHit()` for an ordered hit list, switch the mob HP bar to read `hp`/`stats.hp` with a color shift (§6, §8).
5. `src/world/encounter-panel.js`: first implementation, per the encounters spec §7, with a player HP bar in place of the hearts row.
6. `app.js` wiring: remove the old Battle code (encounters spec §10), connect `WorldScene`'s callbacks to `EncounterPanel`, implement the grading flow (§6) and the defeat/respawn flow (§7).
7. Remove the Battle nav item/section (encounters spec §10), nav grid back to 5 columns.
8. Manual verification pass against §10's checklist above plus the encounters spec §12 checklist.
