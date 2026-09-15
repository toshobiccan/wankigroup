# Combat Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make in-world combat real: mobs and the player get actual stats, clicking an already-selected mob starts a fight, grading a flashcard resolves a speed-ordered exchange of damage, and the whole thing is presented in a draggable bottom sheet instead of the old standalone Battle tab.

**Architecture:** A new pure module (`src/world/combat.js`) does all the damage/turn-order math with no DOM/PIXI dependency, unit-tested directly. `WorldScene` (existing) gets the missing half of its click state machine plus hit animations and a respawn method. A new `EncounterPanel` (DOM, no PIXI) owns the sheet UI and reports only "which grade button was tapped" back upward. `app.js` is the only thing that knows about decks, `DB`, and `player` — it wires the other three together and owns the actual game-flow sequencing.

**Tech Stack:** Plain JS/ES modules (no bundler), PixiJS 8 (vendored), Vitest for pure-function tests, manual/visual verification via the Claude_Browser tools for everything else — matching this project's existing convention (`test/world-movement.test.js` is the only other test file).

## Global Constraints

- No new dependencies. Tweening in `WorldScene.playHit()` is hand-rolled against `this.app.ticker`, not a library.
- `resolveRound()` only reads `hp`, `attackDamage`, and `attackSpeed` from stat objects. `magicDamage`, `armor`, `magicResist`, `luck` are carried through data but must not be referenced by any formula in this plan.
- `EncounterPanel` must not read `player`, `DB`, or any global — everything it needs is passed into its methods as parameters. Only `app.js` touches those.
- `schedule()` (`app.js`, spaced-repetition scheduling) is called exactly as it exists today, for every grade including "again" — do not modify its body.
- Keep committing to the existing branch `feature/overworld-movement-prototype` (already open as PR #2). No new branch/worktree.

---

## Task 1: Stats on mobs and the player

**Files:**
- Modify: `data/zones/plains.json`
- Modify: `app.js:5-12` (`defaultPlayer`)

**Interfaces:**
- Produces: every mob object in `data/zones/plains.json` has a `stats: { hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck }` object instead of `cardsToKill`. `player` (the object created from `defaultPlayer` by `loadPlayer()`) has `player.stats` (same shape) and a top-level `player.hp` (current HP) and `player.activeDeckId` (string deck id or `null`).

- [ ] **Step 1: Replace `cardsToKill` with `stats` on both goblins**

Edit `data/zones/plains.json` — both mob entries change from:

```jsonc
"cardsToKill": 5,
"xpReward": 50,
"coinReward": 15
```

to:

```jsonc
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
```

The full file becomes:

```json
{
  "id": "plains",
  "displayName": "Plains",
  "backgroundImage": "assets/world-background.png",
  "groundTopFrac": 0.7354,
  "groundBottomFrac": 0.7737,
  "spawnXFrac": 0.25,
  "spawnYFrac": 0.7546,
  "mobs": [
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
    },
    {
      "id": "goblin_2",
      "name": "Forgetful Goblin",
      "level": 3,
      "image": "assets/mob-goblin.png",
      "portrait": "assets/mob-goblin-head.png",
      "xFrac": 0.72,
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
  ]
}
```

- [ ] **Step 2: Add stats/hp/activeDeckId to the player**

In `app.js`, replace lines 5-12:

```js
const defaultPlayer = {
  name: "Adventurer",
  level: 1,
  xp: 0,
  coins: 0,
  gems: 0,
  daily: { date: "", reviewed: 0, battlesWon: 0, imported: 0, claimed: [] },
};
```

with:

```js
const defaultPlayer = {
  name: "Adventurer",
  level: 1,
  xp: 0,
  coins: 0,
  gems: 0,
  activeDeckId: null,
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

No change needed to `loadPlayer()`/`savePlayer()` (`app.js:14-26`) — they already spread `defaultPlayer` under whatever is in `localStorage`, so existing saved players pick up the new fields automatically on next load.

- [ ] **Step 3: Verify by hand**

Run:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/zones/plains.json', 'utf8')).mobs[0].stats)"
```

Expected output: `{ hp: 40, attackDamage: 6, magicDamage: 0, armor: 0, magicResist: 0, attackSpeed: 8, luck: 0 }`

Then open `app.js` and confirm `defaultPlayer` reads exactly as in Step 2 (visual check — there's no automated test for this step, it's plain data).

- [ ] **Step 4: Commit**

```bash
git add data/zones/plains.json app.js
git commit -m "feat(combat): add stats to mobs and the player"
```

---

## Task 2: `resolveRound()` — the pure combat math

**Files:**
- Create: `src/world/combat.js`
- Test: `test/combat.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports from the rest of the project).
- Produces: `resolveRound({ player, mob, grade })` and `GRADE_MULTIPLIERS`, both exported from `src/world/combat.js`. `player`/`mob` shape: `{ stats: { hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck }, hp }`. `grade`: `"hard" | "good" | "easy"` (never `"again"` — callers never invoke this for Again). Returns `{ order: "player" | "mob", playerDamageDealt, mobDamageDealt, playerHp, mobHp, playerDefeated, mobDefeated, isCrit }`.

- [ ] **Step 1: Write the failing tests**

Create `test/combat.test.js`:

```js
import { describe, it, expect } from "vitest";
import { resolveRound, GRADE_MULTIPLIERS } from "../src/world/combat.js";

function makeCombatant({ hp, attackDamage, attackSpeed }) {
  return {
    stats: { hp, attackDamage, magicDamage: 0, armor: 0, magicResist: 0, attackSpeed, luck: 0 },
    hp,
  };
}

describe("resolveRound", () => {
  it("scales the player's damage by GRADE_MULTIPLIERS for hard/good/easy", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 1, attackSpeed: 1 });
    expect(resolveRound({ player, mob, grade: "hard" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.hard));
    expect(resolveRound({ player, mob, grade: "good" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.good));
    expect(resolveRound({ player, mob, grade: "easy" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.easy));
  });

  it("marks easy grades as a crit and other grades as not", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 1, attackSpeed: 1 });
    expect(resolveRound({ player, mob, grade: "easy" }).isCrit).toBe(true);
    expect(resolveRound({ player, mob, grade: "good" }).isCrit).toBe(false);
  });

  it("player faster: a knockout hit skips the mob's retaliation", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 5, attackDamage: 6, attackSpeed: 5 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.order).toBe("player");
    expect(result.mobDefeated).toBe(true);
    expect(result.mobDamageDealt).toBe(0);
    expect(result.playerDefeated).toBe(false);
    expect(result.playerHp).toBe(100);
  });

  it("mob faster: a knockout hit skips the player's swing", () => {
    const player = makeCombatant({ hp: 5, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 40, attackDamage: 6, attackSpeed: 12 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.order).toBe("mob");
    expect(result.playerDefeated).toBe(true);
    expect(result.playerDamageDealt).toBe(0);
    expect(result.mobDefeated).toBe(false);
    expect(result.mobHp).toBe(40);
  });

  it("ties in attackSpeed favor the player", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 6, attackSpeed: 10 });
    expect(resolveRound({ player, mob, grade: "good" }).order).toBe("player");
  });

  it("when neither side is knocked out, both hits land and both HP totals drop", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 40, attackDamage: 6, attackSpeed: 8 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.playerDamageDealt).toBe(10);
    expect(result.mobDamageDealt).toBe(6);
    expect(result.mobHp).toBe(30);
    expect(result.playerHp).toBe(94);
    expect(result.playerDefeated).toBe(false);
    expect(result.mobDefeated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/combat.test.js`
Expected: FAIL — `Cannot find module '../src/world/combat.js'` (or similar resolution error), since the file doesn't exist yet.

- [ ] **Step 3: Implement `resolveRound()`**

Create `src/world/combat.js`:

```js
// Pure combat math -- no PIXI, no DOM. Only hp/attackDamage/attackSpeed are
// read here right now; magicDamage/armor/magicResist/luck are declared on
// every stats object and pass through untouched, reserved for whatever
// formulas get defined for them later (see the combat-resolution design spec).

export const GRADE_MULTIPLIERS = { hard: 0.7, good: 1.0, easy: 1.5 };

// player, mob: { stats: {hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck}, hp }
// grade: "hard" | "good" | "easy" -- callers never invoke this for "again"
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
    playerDamageDealt, // 0 if the player was knocked out before swinging
    mobDamageDealt, // 0 if the mob was knocked out before swinging
    playerHp,
    mobHp,
    playerDefeated: playerHp <= 0,
    mobDefeated: mobHp <= 0,
    isCrit: grade === "easy",
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/combat.test.js`
Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: `Test Files 2 passed (2)`, `Tests 19 passed (19)` (the existing 13 in `test/world-movement.test.js` plus these 6).

- [ ] **Step 6: Commit**

```bash
git add src/world/combat.js test/combat.test.js
git commit -m "feat(combat): add resolveRound() pure combat resolution"
```

---

## Task 3: `WorldScene` — real combat state, hit animation, respawn

**Files:**
- Modify: `src/world/world-scene.js`

**Interfaces:**
- Consumes: nothing new from other tasks (this task doesn't import `combat.js` or `encounter-panel.js` — it just exposes the hooks `app.js` will call in Task 6).
- Produces: constructor now accepts `onCombatStart` in addition to `onMobSelected`. New public methods: `playHit(hits)` where `hits` is an array of `{ attacker: "player" | "mob", damage: number, isCrit?: boolean }` (already filtered to non-zero damage by the caller), returns a `Promise` that resolves when the animation sequence finishes; `endCombat({ mobDefeated })`; `respawnPlayer()`. New instance field `this.inCombat` (boolean). Mob HP bars now read `data.hp`/`data.stats.hp` and shift color by fraction.

- [ ] **Step 1: Accept `onCombatStart` and add `inCombat`**

In `src/world/world-scene.js`, change the constructor (currently lines 72-94):

```js
  constructor({ mountElement, onMobSelected }) {
    this.mountElement = mountElement;
    this.onMobSelected = onMobSelected; // (mobData | null) -- fires on select, re-select of a different mob, and deselect
```

to:

```js
  constructor({ mountElement, onMobSelected, onCombatStart }) {
    this.mountElement = mountElement;
    this.onMobSelected = onMobSelected; // (mobData | null) -- fires on select, re-select of a different mob, and deselect
    this.onCombatStart = onCombatStart; // (mobData) -- fires once, when a second click on the selected mob starts a fight
```

and change this line inside the same constructor:

```js
    this.selectedMob = null; // the selected mob's own {data, container, glow} record, or null
```

to:

```js
    this.selectedMob = null; // the selected mob's own {data, container, glow, hpFill} record, or null
    this.inCombat = false;
```

- [ ] **Step 2: Store the mob's HP bar fill graphic on its entry**

In `loadZone()`, the mob-creation loop currently does (around line 149):

```js
      const mobData = { ...rawMobData, cardsRemaining: rawMobData.cardsToKill };
```

Change to:

```js
      const mobData = { ...rawMobData, hp: rawMobData.stats.hp };
```

Further down in the same loop, the `mobEntry` is currently created as (around line 194):

```js
      const mobEntry = { data: mobData, container, glow };
```

Change to:

```js
      const mobEntry = { data: mobData, container, glow, hpFill };
```

(`hpFill` is already in scope — it's the `PIXI.Graphics` created two lines above this for the HP bar's colored fill, around line 189.)

Also update the now-stale comment directly above the HP bar creation (currently around line 187-188):

```js
      // Green at full HP; once combat exists this should shift toward red as
      // cardsRemaining/cardsToKill drops -- always full for now, no damage yet.
```

to:

```js
      // Starts full/green; _updateMobHpBar() repaints this as hp drops during combat.
```

- [ ] **Step 3: Make the second click on a selected mob start combat**

Replace `_onMobClick()` (currently lines 320-326):

```js
  _onMobClick(mobEntry) {
    if (this.selectedMob === mobEntry) return; // already selected; attacking it is a future step
    if (this.selectedMob) this.selectedMob.glow.visible = false;
    this.selectedMob = mobEntry;
    mobEntry.glow.visible = true;
    this.onMobSelected?.(mobEntry.data);
  }
```

with:

```js
  _onMobClick(mobEntry) {
    if (this.inCombat) return; // a fight is already running; mob clicks do nothing until it ends
    if (this.selectedMob === mobEntry) {
      this.inCombat = true;
      this.onCombatStart?.(mobEntry.data);
      return;
    }
    if (this.selectedMob) this.selectedMob.glow.visible = false;
    this.selectedMob = mobEntry;
    mobEntry.glow.visible = true;
    this.onMobSelected?.(mobEntry.data);
  }
```

- [ ] **Step 4: Lock ground clicks during combat too**

`_setTargetFromPointer()` (currently lines 304-318) starts with:

```js
  _setTargetFromPointer(event) {
    if (this.selectedMob) {
```

Change to:

```js
  _setTargetFromPointer(event) {
    if (this.inCombat) return; // movement stays locked for the whole fight; combat ends via endCombat(), not a ground click
    if (this.selectedMob) {
```

- [ ] **Step 5: Add `endCombat()` and `respawnPlayer()`**

Add these two methods to the `WorldScene` class, right after `_deselectMob()` (currently ending at line 333):

```js
  // mobDefeated: true removes the fought mob from the zone for good (victory);
  // false leaves it exactly where it was (the player fled or lost).  Either
  // way, clears the selection glow and unlocks movement.
  endCombat({ mobDefeated }) {
    const entry = this.selectedMob;
    if (mobDefeated && entry) {
      this.world.removeChild(entry.container);
      this.mobs = this.mobs.filter((e) => e !== entry);
    }
    if (entry) entry.glow.visible = false;
    this.selectedMob = null;
    this.inCombat = false;
    this.onMobSelected?.(null);
  }

  // Snaps the player back to the zone's spawn point -- used after a defeat,
  // once the grey fade (owned by app.js) has fully covered the screen. No
  // walk animation: this is a teleport, not a walk.
  respawnPlayer() {
    this.position = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.target = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.player.position.set(this.position.x, this.position.y);
  }
```

- [ ] **Step 6: Add the hit-animation sequence**

Add these methods right after `respawnPlayer()`:

```js
  // Runs onFrame(t) every tick for durationMs, t going from 0 to 1 linearly.
  // The one piece of tweening infrastructure every hit-animation step below
  // uses -- hand-rolled against the ticker rather than a library, per the
  // combat-resolution design spec.
  _animate(durationMs, onFrame) {
    return new Promise((resolve) => {
      let elapsed = 0;
      const tick = (ticker) => {
        elapsed += ticker.deltaMS;
        const t = Math.min(1, elapsed / durationMs);
        onFrame(t);
        if (t >= 1) {
          this.app.ticker.remove(tick);
          resolve();
        }
      };
      this.app.ticker.add(tick);
    });
  }

  // hits: ordered list of {attacker: "player"|"mob", damage, isCrit?},
  // already filtered by the caller to only the swings that actually
  // happened (a knocked-out combatant's would-be retaliation is never
  // included). Plays each in order against the current this.selectedMob.
  async playHit(hits) {
    for (const hit of hits) {
      await this._playSingleHit(hit);
    }
  }

  async _playSingleHit(hit) {
    const mobEntry = this.selectedMob;
    const isPlayerAttacking = hit.attacker === "player";
    const attackerContainer = isPlayerAttacking ? this.player : mobEntry.container;
    const defenderContainer = isPlayerAttacking ? mobEntry.container : this.player;
    const lungeDir = Math.sign(defenderContainer.position.x - attackerContainer.position.x) || 1;
    const baseX = attackerContainer.position.x;

    await this._animate(150, (t) => { attackerContainer.position.x = baseX + lungeDir * 20 * t; });
    await this._animate(150, (t) => { attackerContainer.position.x = baseX + lungeDir * 20 * (1 - t); });
    attackerContainer.position.x = baseX;

    this._showFloatingDamage(defenderContainer, hit.damage, hit.isCrit);

    const defenderBaseX = defenderContainer.position.x;
    await this._animate(120, (t) => {
      defenderContainer.position.x = defenderBaseX + Math.sin(t * Math.PI * 4) * 6 * (1 - t);
    });
    defenderContainer.position.x = defenderBaseX;

    if (!isPlayerAttacking) return; // the mob's own HP bar only changes when it's the one taking the hit
    this._updateMobHpBar(mobEntry);
    if (mobEntry.data.hp <= 0) {
      await this._animate(300, (t) => { mobEntry.container.alpha = 1 - t; });
    }
  }

  _showFloatingDamage(targetContainer, damage, isCrit) {
    const text = new PIXI.Text({
      text: isCrit ? "CRIT!" : `-${damage}`,
      style: { fontSize: 18, fontWeight: "900", fill: 0xffd166, stroke: { color: 0x000000, width: 3 } },
    });
    text.anchor.set(0.5, 1);
    text.position.set(targetContainer.position.x, targetContainer.position.y - MOB_HEIGHT - 30);
    this.world.addChild(text);
    this._animate(700, (t) => {
      text.position.y -= 0.6;
      text.alpha = 1 - t;
    }).then(() => this.world.removeChild(text));
  }

  _updateMobHpBar(mobEntry) {
    const frac = Math.max(0, mobEntry.data.hp / mobEntry.data.stats.hp);
    const color = frac > 0.5 ? 0x4cd137 : frac > 0.25 ? 0xe8c547 : 0xd1453b;
    mobEntry.hpFill.clear().rect(-20, -MOB_HEIGHT - 10, 40 * frac, 5).fill(color);
  }
```

- [ ] **Step 7: Manual verification**

Run: `npm test` — expected: still `Test Files 2 passed (2)`, `Tests 19 passed (19)` (this task touches no tested pure functions, but confirms nothing else regressed).

Then start the dev server and load the World tab in a browser (see Task 8 for the full checklist this feeds into) — for now just confirm no console errors on load and that clicking a mob still shows its glow (the existing Selected-state behavior, unchanged by this task). Combat itself can't be exercised yet — `onCombatStart` has no listener until Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/world/world-scene.js
git commit -m "feat(world): wire real combat state, hit animation, and respawn into WorldScene"
```

---

## Task 4: `EncounterPanel` — the draggable sheet

**Files:**
- Create: `src/world/encounter-panel.js`
- Modify: `style.css` (new rules, appended near the bottom, before `/* ================= MODAL ================= */`)

**Interfaces:**
- Consumes: nothing from other tasks — this class has no knowledge of `player`, `DB`, or decks. Everything it needs comes in as parameters.
- Produces: `new EncounterPanel({ mountElement, onGrade })` where `onGrade` is called with `"again" | "hard" | "good" | "easy"`. Methods: `showPeek(mob)`, `showCard(card, mob, playerState)`, `reveal(card, mob, playerState)`, `showMessage({ text, actionLabel, onAction })`, `hide()`, `retract()`, `restore()`. `mob` shape: `{ name, level, portrait, hp, stats: { hp } }`. `card` shape: `{ front, back }` (plain strings — see Step 4's note on why no HTML rendering is needed here). `playerState` shape: `{ hp, maxHp }`.

- [ ] **Step 1: The class shell, height states, and mounting**

Create `src/world/encounter-panel.js`:

```js
// DOM-only (no PIXI). Owns the sheet shown below the world canvas during
// mob selection and combat. Knows nothing about players, decks, or DB --
// app.js passes in exactly what each method needs to render, and the only
// thing flowing back out is onGrade(). This keeps the panel testable and
// reusable on its own, and keeps app.js as the single place that
// understands the actual game flow.

const HEIGHTS = {
  hidden: 0,
  peek: 110,
  default: 320,
  expanded: 560,
  retracted: 40, // smaller than peek -- just enough to keep the handle visible during a hit
};

export class EncounterPanel {
  constructor({ mountElement, onGrade }) {
    this.onGrade = onGrade; // (grade: "again"|"hard"|"good"|"easy") => void

    this.root = document.createElement("div");
    this.root.className = "encounter-sheet";
    this.root.style.height = "0px";

    this.handle = document.createElement("div");
    this.handle.className = "sheet-handle";
    this.root.appendChild(this.handle);

    this.content = document.createElement("div");
    this.content.className = "sheet-content";
    this.root.appendChild(this.content);

    this.lightbox = document.createElement("div");
    this.lightbox.className = "lightbox";
    this.lightbox.hidden = true;
    this.lightboxImg = document.createElement("img");
    this.lightboxImg.className = "lightbox-img";
    this.lightbox.appendChild(this.lightboxImg);
    this.lightbox.addEventListener("pointerdown", () => this._closeLightbox());

    mountElement.appendChild(this.root);
    mountElement.appendChild(this.lightbox);

    this._state = "hidden"; // "hidden" | "peek" | "default" | "expanded" | "retracted"
    this._preferredCombatHeight = "default"; // remembered default/expanded choice, per fight
    this._beforeRetractState = null;

    this.handle.addEventListener("pointerdown", (event) => this._onHandlePointerDown(event));
  }

  _setHeight(state) {
    this._state = state;
    this.root.style.height = `${HEIGHTS[state]}px`;
  }

  hide() {
    this._setHeight("hidden");
    this.content.replaceChildren();
  }

  retract() {
    this._beforeRetractState = this._state;
    this._setHeight("retracted");
  }

  restore() {
    this._setHeight(this._beforeRetractState || "default");
  }
}
```

- [ ] **Step 2: Peek content**

Add this method to the class, after `restore()`:

```js
  showPeek(mob) {
    this._preferredCombatHeight = "default"; // a fresh fight (if one starts) begins at default height
    const wrap = document.createElement("div");
    wrap.className = "sheet-peek";

    const portrait = document.createElement("img");
    portrait.className = "sheet-portrait";
    portrait.src = mob.portrait;
    portrait.alt = "";

    const text = document.createElement("div");
    text.className = "sheet-peek-text";

    const name = document.createElement("div");
    name.className = "sheet-peek-name";
    name.append(mob.name + " ");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `Lv ${mob.level}`;
    name.appendChild(tag);

    const hp = document.createElement("div");
    hp.className = "sheet-peek-hp";
    hp.textContent = `${mob.hp} / ${mob.stats.hp} HP`;

    const hint = document.createElement("div");
    hint.className = "sheet-peek-hint";
    hint.textContent = `Tap the ${mob.name} again to attack.`;

    text.append(name, hp, hint);
    wrap.append(portrait, text);

    this.content.replaceChildren(wrap);
    this._setHeight("peek");
  }
```

- [ ] **Step 3: A generic message state (no active deck / empty deck)**

Add this method after `showPeek()`:

```js
  showMessage({ text, actionLabel, onAction }) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-message";

    const p = document.createElement("p");
    p.textContent = text;
    wrap.appendChild(p);

    if (actionLabel) {
      const btn = document.createElement("button");
      btn.className = "btn-small";
      btn.textContent = actionLabel;
      btn.addEventListener("click", onAction);
      wrap.appendChild(btn);
    }

    this.content.replaceChildren(wrap);
    this._setHeight("default");
  }
```

- [ ] **Step 4: Card content — front/back, grade buttons, player HP bar**

Add this method after `showMessage()`:

```js
  // card.front/card.back are plain text today (anki-import.js strips HTML
  // and media on import), so this renders them as text, never innerHTML --
  // matching how the rest of this codebase (app.js's el() helper) already
  // treats card content. The <img> lookup below is real and wired up (any
  // future card that does contain an <img> gets a working zoom tap) but
  // finds nothing until a media-preserving import pipeline exists -- that's
  // a separate, not-yet-planned piece of work, not a bug in this one.
  _buildCardContent(card, mob, playerState, { revealed }) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-combat";

    const hpRow = document.createElement("div");
    hpRow.className = "sheet-hp-row";
    const hpLabel = document.createElement("div");
    hpLabel.className = "sheet-hp-label";
    const hpLabelLeft = document.createElement("span");
    hpLabelLeft.textContent = "You";
    const hpLabelRight = document.createElement("span");
    hpLabelRight.textContent = `${playerState.hp} / ${playerState.maxHp} HP`;
    hpLabel.append(hpLabelLeft, hpLabelRight);
    const hpBar = document.createElement("div");
    hpBar.className = "sheet-hp-bar";
    const hpFill = document.createElement("div");
    hpFill.style.width = `${Math.max(0, (playerState.hp / playerState.maxHp) * 100)}%`;
    hpBar.appendChild(hpFill);
    hpRow.append(hpLabel, hpBar);
    wrap.appendChild(hpRow);

    const cardEl = document.createElement("div");
    cardEl.className = "sheet-card-content";
    const frontEl = document.createElement("div");
    frontEl.style.whiteSpace = "pre-line";
    frontEl.textContent = card.front;
    cardEl.appendChild(frontEl);

    if (revealed) {
      const backEl = document.createElement("div");
      backEl.className = "sheet-card-answer";
      backEl.style.whiteSpace = "pre-line";
      backEl.textContent = card.back || "—";
      cardEl.appendChild(backEl);
    }
    wrap.appendChild(cardEl);

    cardEl.querySelectorAll("img").forEach((img) => {
      img.addEventListener("click", () => this._openLightbox(img.src));
    });

    if (revealed) {
      const actions = document.createElement("div");
      actions.className = "answer-actions";
      for (const [grade, label, sub] of [
        ["again", "Again", "miss"],
        ["hard", "Hard", "hit"],
        ["good", "Good", "hit"],
        ["easy", "Easy", "crit!"],
      ]) {
        const btn = document.createElement("button");
        btn.className = `a-${grade}`;
        const labelText = document.createElement("span");
        labelText.textContent = label;
        const subText = document.createElement("small");
        subText.textContent = sub;
        btn.append(labelText, subText);
        btn.addEventListener("click", () => this.onGrade?.(grade));
        actions.appendChild(btn);
      }
      wrap.appendChild(actions);
    } else {
      const revealBtn = document.createElement("button");
      revealBtn.className = "btn-primary sheet-reveal-btn";
      revealBtn.textContent = "Show Answer";
      revealBtn.addEventListener("click", () => this.reveal(card, mob, playerState));
      wrap.appendChild(revealBtn);
    }

    return wrap;
  }

  showCard(card, mob, playerState) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: false }));
    this._setHeight(this._preferredCombatHeight);
  }

  reveal(card, mob, playerState) {
    this.content.replaceChildren(this._buildCardContent(card, mob, playerState, { revealed: true }));
  }
```

- [ ] **Step 5: Image lightbox and drag-to-resize**

Add these methods after `reveal()`:

```js
  _openLightbox(src) {
    this.lightboxImg.src = src;
    this.lightbox.hidden = false;
  }

  _closeLightbox() {
    this.lightbox.hidden = true;
  }

  _onHandlePointerDown(event) {
    if (this._state !== "default" && this._state !== "expanded") return; // only draggable during combat, not peek/retracted
    const dragStartY = event.clientY;
    const dragStartHeight = HEIGHTS[this._state];

    const onMove = (moveEvent) => {
      const delta = dragStartY - moveEvent.clientY; // dragging up increases height
      const nextHeight = Math.min(HEIGHTS.expanded, Math.max(HEIGHTS.default, dragStartHeight + delta));
      this.root.style.height = `${nextHeight}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const currentHeight = this.root.getBoundingClientRect().height;
      const midpoint = (HEIGHTS.default + HEIGHTS.expanded) / 2;
      this._preferredCombatHeight = currentHeight > midpoint ? "expanded" : "default";
      this._setHeight(this._preferredCombatHeight);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
```

- [ ] **Step 6: Styling**

Add to `style.css`, immediately before the `/* ================= MODAL ================= */` block (currently line 607):

```css
/* ================= ENCOUNTER SHEET ================= */
.encounter-sheet {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, #16243b, #111d31);
  border-top: 1px solid #2a3a58;
  box-shadow: 0 -6px 16px rgba(0,0,0,.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: height .25s ease;
  z-index: 5;
}
.sheet-handle {
  flex-shrink: 0;
  height: 18px;
  display: flex; align-items: center; justify-content: center;
  cursor: grab;
  touch-action: none;
}
.sheet-handle::before {
  content: ""; width: 36px; height: 4px; border-radius: 2px; background: #3a4a66;
}
.sheet-content { flex: 1; min-height: 0; padding: 4px 12px 12px; overflow-y: auto; }

.sheet-peek { display: flex; align-items: center; gap: 10px; }
.sheet-portrait {
  width: 56px; height: 56px; border-radius: 10px; object-fit: cover;
  background: radial-gradient(circle at 50% 40%, #2a3a1f, #10160c);
  border: 1px solid #3a5525;
}
.sheet-peek-text { flex: 1; min-width: 0; }
.sheet-peek-name { font-size: 14px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px; }
.sheet-peek-hp { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
.sheet-peek-hint { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

.tag {
  font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 8px;
  background: rgba(212,164,65,.25); color: var(--gold-light);
}

.sheet-message { padding: 20px 10px; text-align: center; color: var(--text-dim); font-size: 13px; }
.sheet-message .btn-small { margin-top: 12px; }

.sheet-hp-row { margin-bottom: 10px; }
.sheet-hp-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); }
.sheet-hp-bar { height: 10px; border-radius: 3px; background: #0a1120; border: 1px solid #2a3a58; overflow: hidden; margin-top: 4px; }
.sheet-hp-bar > div { height: 100%; background: linear-gradient(#5ecb5e, #2f8a4a); transition: width .35s ease; }

.sheet-card-content {
  padding: 14px;
  border-radius: 8px;
  background: linear-gradient(#f6ecd0, #e3cf9f);
  color: #2b1e0e;
  box-shadow: inset 0 0 0 2px #b8975c;
  font-size: 15px; line-height: 1.4; text-align: center;
  overflow-wrap: anywhere;
}
.sheet-card-content img { max-width: 100%; cursor: zoom-in; }
.sheet-card-answer {
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed #a4844c;
  font-weight: 500; text-align: center;
}
.sheet-reveal-btn { width: 100%; margin-top: 12px; }

.lightbox {
  position: fixed; inset: 0; z-index: 30;
  background: rgba(0,0,0,.9);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.lightbox-img { max-width: 100%; max-height: 100%; object-fit: contain; }
```

- [ ] **Step 7: Manual verification (standalone, before wiring)**

There's no `mountElement` for this yet in the running app (Task 6 adds it) — verify by temporarily exercising it from the browser console against the dev server's already-open World tab:

```js
const testRoot = document.createElement("div");
testRoot.style.position = "absolute";
testRoot.style.inset = "0";
document.querySelector('[data-view="world"]').appendChild(testRoot);
const panel = new window.Cardslayer.EncounterPanel({ mountElement: testRoot, onGrade: (g) => console.log("graded", g) });
panel.showCard({ front: "What is 2+2?", back: "4" }, { name: "Test Mob" }, { hp: 80, maxHp: 100 });
```

Expected: a sheet slides up from the bottom showing "What is 2+2?", a player HP bar at 80%, and a "Show Answer" button. Clicking it reveals "4" and four grade buttons; clicking one logs `graded <name>` to the console. Drag the handle up — the sheet grows toward `expanded`; release and it snaps to whichever of `default`/`expanded` is nearer. This is a manual, throwaway check — remove `testRoot` by reloading the page afterward (Task 6's real wiring replaces this entirely, this file doesn't need `window.Cardslayer.EncounterPanel` yet since that export happens in Task 6).

Run `npm test` too: expected unchanged, `Tests 19 passed (19)` (this task adds no pure-function tests, `encounter-panel.js` is DOM-only per this project's testing convention).

- [ ] **Step 8: Commit**

```bash
git add src/world/encounter-panel.js style.css
git commit -m "feat(world): add EncounterPanel draggable sheet component"
```

---

## Task 5: Markup and bootstrap changes

**Files:**
- Modify: `index.html`
- Modify: `src/world/bootstrap.js`

**Interfaces:**
- Produces: `window.Cardslayer.EncounterPanel` and `window.Cardslayer.resolveRound` (alongside the existing `window.Cardslayer.WorldScene`), for Task 6 to consume. `#encounterPanelRoot` and `#defeatFade` elements exist in the World view for Task 6 to mount into. The old `#battleRoot`/`#mobInfoPanel` elements and the Battle nav button are gone.

- [ ] **Step 1: Remove the Battle section and nav button**

In `index.html`, delete the entire Battle section (currently lines 276-280):

```html
      <!-- ============ BATTLE ============ -->
      <section class="view" data-view="battle">
        <div class="page-head"><h2>Battle</h2><p>Defeat monsters by answering your cards.</p></div>
        <div id="battleRoot"></div>
      </section>

```

And delete the Battle nav button (currently lines 317-320):

```html
      <button class="nav-item" data-target="battle">
        <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 3 L19 17 L17 19 L3 5 L3 3Z M16 20 L20 16 M18 22 L22 18 L25 21 L21 25Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M23 3 L9 17 L11 19 L25 5 L25 3Z M12 20 L8 16 M10 22 L6 18 L3 21 L7 25Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        <span>Battle</span>
      </button>

```

- [ ] **Step 2: Replace the World section's overlay markup**

The World section currently reads (lines 300-304):

```html
      <!-- ============ WORLD ============ -->
      <section class="view" data-view="world">
        <div id="worldRoot" class="world-root"></div>
        <div id="mobInfoPanel" class="mob-info-panel" hidden></div>
      </section>
```

Replace with:

```html
      <!-- ============ WORLD ============ -->
      <section class="view" data-view="world">
        <div id="worldRoot" class="world-root"></div>
        <div id="encounterPanelRoot"></div>
        <div id="defeatFade" class="defeat-fade" hidden></div>
      </section>
```

(`EncounterPanel`'s constructor appends its own `.encounter-sheet` and `.lightbox` elements into whatever `mountElement` it's given — `#encounterPanelRoot` is just that mount point, styled as a plain non-positioned wrapper so its absolutely-positioned children still lay out relative to the World section itself.)

- [ ] **Step 3: Export `EncounterPanel` and `resolveRound`**

Replace `src/world/bootstrap.js` entirely:

```js
import { WorldScene } from "./world-scene.js";
import { EncounterPanel } from "./encounter-panel.js";
import { resolveRound } from "./combat.js";

window.Cardslayer = window.Cardslayer || {};
Object.assign(window.Cardslayer, { WorldScene, EncounterPanel, resolveRound });
```

- [ ] **Step 4: Verify by hand**

Start the dev server (`npm start` or however it's currently run — check `package.json`'s `scripts` if unsure) and open it in the browser. Open the console and confirm:

```js
typeof window.Cardslayer.EncounterPanel === "function" && typeof window.Cardslayer.resolveRound === "function"
```

prints `true`. Confirm the bottom nav now shows 5 items with no "Battle" entry (it will visually still be a 6-column grid until Task 7 — that's expected here, not a bug in this task).

- [ ] **Step 5: Commit**

```bash
git add index.html src/world/bootstrap.js
git commit -m "feat(world): remove Battle markup, add encounter panel mount points"
```

---

## Task 6: `app.js` — remove the old Battle system, wire the new combat flow

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `resolveRound({ player, mob, grade })` from Task 2 (via `window.Cardslayer.resolveRound`). `WorldScene`'s `onCombatStart(mobData)` callback, `playHit(hits)`, `endCombat({ mobDefeated })`, `respawnPlayer()` from Task 3. `EncounterPanel`'s `showPeek/showCard/reveal/showMessage/hide/retract/restore` and `onGrade` callback from Task 4. `#encounterPanelRoot`/`#defeatFade` from Task 5.
- Produces: nothing further downstream — this is the last task that touches game logic (Task 7 is CSS cleanup only).

- [ ] **Step 1: Remove the old Battle code, keeping only `schedule()`**

`app.js` currently has one big `// ================= BATTLE =================` section (lines 261-442) containing, in order: `MONSTERS`, `SESSION_SIZE`, `MAX_HEARTS`, `battle`, `renderers.battle`, `startBattle`, `renderBattle`, `schedule`, `floatText`, `answer`, `endBattle`. Everything in it is deleted **except** `schedule()`, which is relocated to its own small section in the same spot.

First, cut `schedule()` (currently lines 362-382) out of the middle of the block and replace the entire lines 261-442 range with just:

```js
// ================= SCHEDULING =================
function schedule(card, grade) {
  const DAY = 86_400_000;
  card.reps += 1;
  if (grade === "again") {
    card.interval = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.due = Date.now() + 60_000;
  } else {
    if (grade === "hard") {
      card.interval = Math.max(1, card.interval * 1.2);
      card.ease = Math.max(1.3, card.ease - 0.15);
    } else if (grade === "good") {
      card.interval = card.interval ? card.interval * card.ease : 1;
    } else {
      card.interval = card.interval ? card.interval * card.ease * 1.3 : 4;
      card.ease += 0.15;
    }
    card.due = Date.now() + card.interval * DAY;
  }
  return DB.putCard(card);
}
```

This deletes `MONSTERS`, `SESSION_SIZE`, `MAX_HEARTS`, `battle`, `renderers.battle`, `startBattle`, `renderBattle`, `floatText`, `answer`, and `endBattle` in one pass, and leaves `schedule()` — unchanged, just relocated — as its own top-level section. `floatText()` is not kept anywhere: it was only ever called from the old `answer()`, and its replacement is `WorldScene._showFloatingDamage()` from Task 3.

- [ ] **Step 2: Fix the now-dangling "Start Battle" button in the import-success modal**

`importFile()` currently ends with (around line 162-172):

```js
    showModal(
      el("h3", {}, "Deck Imported!"),
      el("p", {}, `“${name}” — ${cards.length} cards are ready for battle.`),
      el("div", { class: "reward" }, el("span", {}, `+${xp} XP`), el("span", {}, `+${coins} 🪙`)),
      el(
        "div",
        { class: "modal-actions" },
        el("button", { class: "btn-small btn-ghost", onclick: closeModal }, "Later"),
        el("button", { class: "btn-small", onclick: () => { closeModal(); startBattle(deckId); } }, "⚔️ Start Battle")
      )
    );
```

Replace the last button (`startBattle` no longer exists) so it sets this deck active and heads to World instead:

```js
    showModal(
      el("h3", {}, "Deck Imported!"),
      el("p", {}, `“${name}” — ${cards.length} cards are ready for battle.`),
      el("div", { class: "reward" }, el("span", {}, `+${xp} XP`), el("span", {}, `+${coins} 🪙`)),
      el(
        "div",
        { class: "modal-actions" },
        el("button", { class: "btn-small btn-ghost", onclick: closeModal }, "Later"),
        el("button", {
          class: "btn-small",
          onclick: () => { closeModal(); player.activeDeckId = deckId; savePlayer(); go("world"); },
        }, "⚔️ Fight With This Deck")
      )
    );
```

- [ ] **Step 3: Home — "Set Active" instead of "⚔️"**

Replace `renderers.home` (currently lines 188-218):

```js
renderers.home = async () => {
  const root = $("#deckList");
  const decks = await DB.listDecks();
  if (!decks.length) {
    root.replaceChildren(
      el("div", { class: "panel empty-state" },
        "No decks yet.",
        el("br"),
        el("button", { class: "btn-small", onclick: () => go("import") }, "Import your first deck")
      )
    );
    return;
  }
  const now = Date.now();
  const rows = await Promise.all(
    decks.map(async (d) => {
      const cards = await DB.cardsForDeck(d.id);
      const due = cards.filter((c) => c.due <= now).length;
      const learned = cards.filter((c) => c.reps > 0).length;
      return el("div", { class: "panel deck-card" },
        el("div", { class: "deck-icon" }, d.name.trim()[0]?.toUpperCase() || "A"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards · ${learned} learned · ${due} due`)
        ),
        el("button", { class: "btn-small", onclick: () => startBattle(d.id) }, "⚔️")
      );
    })
  );
  root.replaceChildren(...rows);
};
```

with:

```js
renderers.home = async () => {
  const root = $("#deckList");
  const decks = await DB.listDecks();
  if (!decks.length) {
    root.replaceChildren(
      el("div", { class: "panel empty-state" },
        "No decks yet.",
        el("br"),
        el("button", { class: "btn-small", onclick: () => go("import") }, "Import your first deck")
      )
    );
    return;
  }
  const now = Date.now();
  const rows = await Promise.all(
    decks.map(async (d) => {
      const cards = await DB.cardsForDeck(d.id);
      const due = cards.filter((c) => c.due <= now).length;
      const learned = cards.filter((c) => c.reps > 0).length;
      const isActive = player.activeDeckId === d.id;
      return el("div", { class: `panel deck-card${isActive ? " is-active-deck" : ""}` },
        el("div", { class: "deck-icon" }, d.name.trim()[0]?.toUpperCase() || "A"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name, isActive ? el("span", { class: "tag" }, "Active") : null),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards · ${learned} learned · ${due} due`)
        ),
        el("button", {
          class: `btn-small${isActive ? " btn-ghost" : ""}`,
          onclick: () => { player.activeDeckId = d.id; savePlayer(); renderers.home(); },
        }, isActive ? "Active ✓" : "Set Active")
      );
    })
  );
  root.replaceChildren(...rows);
};
```

- [ ] **Step 4: Replace `renderMobInfoPanel`/`renderers.world` with the full combat flow**

Replace the current `// ================= WORLD =================` section (currently lines 444-473):

```js
// ================= WORLD =================
let worldScene = null;

function renderMobInfoPanel(mob) {
  const panel = $("#mobInfoPanel");
  if (!mob) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  panel.replaceChildren(
    el("div", { class: "mob-info-head" },
      el("img", { class: "mob-info-portrait", src: mob.portrait, alt: "" }),
      el("div", { class: "mob-info-text" },
        el("div", { class: "mob-info-name" }, mob.name, el("span", { class: "tag" }, `Lv ${mob.level}`)),
        el("div", { class: "mob-info-hp" }, `${mob.cardsRemaining} / ${mob.cardsToKill} HP`)
      )
    )
  );
  panel.hidden = false;
}

renderers.world = async () => {
  if (worldScene) return;
  worldScene = new window.Cardslayer.WorldScene({
    mountElement: $("#worldRoot"),
    onMobSelected: renderMobInfoPanel,
  });
  await worldScene.loadZone("data/zones/plains.json");
};
```

with:

```js
// ================= WORLD / COMBAT =================
let worldScene = null;
let encounterPanel = null;
let fight = null; // { mob, queue } while a fight is in progress; null otherwise

function buildFightQueue(deckCards) {
  const now = Date.now();
  const due = deckCards.filter((c) => c.reps > 0 && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = deckCards.filter((c) => c.reps === 0);
  const queue = [...due, ...fresh];
  if (!queue.length) queue.push(...deckCards.sort((a, b) => a.due - b.due));
  return queue;
}

function playerHpState() {
  return { hp: player.hp, maxHp: player.stats.hp };
}

function handleMobSelected(mob) {
  if (!mob) {
    encounterPanel.hide();
    return;
  }
  encounterPanel.showPeek(mob);
}

async function handleCombatStart(mobData) {
  if (!player.activeDeckId) {
    encounterPanel.showMessage({
      text: "Pick an active deck on Home first.",
      actionLabel: "Go to Home",
      onAction: () => go("home"),
    });
    return;
  }
  const cards = await DB.cardsForDeck(player.activeDeckId);
  if (!cards.length) {
    encounterPanel.showMessage({ text: "This deck has no cards - import more or pick another." });
    return;
  }
  fight = { mob: mobData, queue: buildFightQueue(cards) };
  encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
}

async function handleGrade(grade) {
  const card = fight.queue.shift();
  await schedule(card, grade);
  daily().reviewed += 1;

  if (grade === "again") {
    fight.queue.push(card);
    encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
    return;
  }

  const result = window.Cardslayer.resolveRound({ player, mob: fight.mob, grade });
  player.hp = result.playerHp;
  fight.mob.hp = result.mobHp;
  savePlayer();

  encounterPanel.retract();
  const hits = [
    { attacker: "player", damage: result.playerDamageDealt, isCrit: result.isCrit },
    { attacker: "mob", damage: result.mobDamageDealt },
  ];
  if (result.order === "mob") hits.reverse();
  await worldScene.playHit(hits.filter((hit) => hit.damage > 0));
  encounterPanel.restore();

  if (result.mobDefeated) {
    const mob = fight.mob;
    worldScene.endCombat({ mobDefeated: true });
    encounterPanel.hide();
    fight = null;
    gainXp(mob.xpReward);
    player.coins += mob.coinReward;
    daily().battlesWon += 1;
    savePlayer();
    renderHeader();
    showModal(
      el("div", { style: "font-size:48px" }, "🏆"),
      el("h3", {}, "Victory!"),
      el("p", {}, `You vanquished the ${mob.name}.`),
      el("div", { class: "reward" }, el("span", {}, `+${mob.xpReward} XP`), el("span", {}, `+${mob.coinReward} 🪙`)),
      el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "Continue"))
    );
    return;
  }

  if (result.playerDefeated) {
    fight = null;
    encounterPanel.hide();
    worldScene.endCombat({ mobDefeated: false });
    await playerDefeatAndRespawn();
    return;
  }

  encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
}

async function playerDefeatAndRespawn() {
  const fade = $("#defeatFade");
  fade.hidden = false;
  await new Promise((r) => setTimeout(r, 20));
  fade.classList.add("is-visible");
  await new Promise((r) => setTimeout(r, 500));

  player.hp = player.stats.hp;
  savePlayer();
  renderHeader();
  worldScene.respawnPlayer();

  await new Promise((r) => setTimeout(r, 200));
  fade.classList.remove("is-visible");
  await new Promise((r) => setTimeout(r, 500));
  fade.hidden = true;
}

renderers.world = async () => {
  if (worldScene) return;
  encounterPanel = new window.Cardslayer.EncounterPanel({
    mountElement: $("#encounterPanelRoot"),
    onGrade: handleGrade,
  });
  worldScene = new window.Cardslayer.WorldScene({
    mountElement: $("#worldRoot"),
    onMobSelected: handleMobSelected,
    onCombatStart: handleCombatStart,
  });
  await worldScene.loadZone("data/zones/plains.json");
};
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: `Test Files 2 passed (2)`, `Tests 19 passed (19)` — this task is all UI wiring, no new pure functions, but must not have broken the existing ones.

- [ ] **Step 6: Manual smoke test**

Start the dev server, open the World tab, click a goblin (peek sheet with name/level/HP appears), click it again with no active deck set (message sheet: "Pick an active deck on Home first" with a working "Go to Home" button). Go to Home, tap "Set Active" on any imported deck (if none exist, import `~/Desktop/wanki/Hematologi.apkg` or any `.apkg` first), return to World, engage the same goblin again — a real card should appear. Check the console for errors. (The full checklist is Task 8 — this step is just confirming the wiring didn't crash before moving on.)

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat(combat): remove old Battle tab, wire real combat flow into World"
```

---

## Task 7: CSS cleanup — nav grid, defeat overlay, remove dead rules

**Files:**
- Modify: `style.css`

**Interfaces:**
- Consumes: `.defeat-fade`/`.is-visible` used by `app.js`'s `playerDefeatAndRespawn()` (Task 6). `.a-again`/`.a-hard`/`.a-good`/`.a-easy` used by `encounter-panel.js` (Task 4) — kept, not removed.
- Produces: nothing further downstream — last code-writing task in this plan.

- [ ] **Step 1: Shrink the nav grid to 5 columns**

Change (currently line 487):

```css
  grid-template-columns: repeat(6, 1fr);
```

to:

```css
  grid-template-columns: repeat(5, 1fr);
```

- [ ] **Step 2: Remove the old mob-info-panel rules (superseded by the encounter sheet)**

Delete (currently lines 159-180):

```css
/* Docked overlay shown when a mob is selected -- sits on top of the canvas
   without resizing it (position: absolute, not part of the flex column). */
.mob-info-panel {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, #16243b, #111d31);
  border-top: 1px solid #2a3a58;
  box-shadow: 0 -6px 16px rgba(0,0,0,.5);
  padding: 10px 12px;
  z-index: 5;
}
.mob-info-head { display: flex; align-items: center; gap: 10px; }
.mob-info-portrait {
  width: 56px; height: 56px;
  border-radius: 10px;
  object-fit: cover;
  background: radial-gradient(circle at 50% 40%, #2a3a1f, #10160c);
  border: 1px solid #3a5525;
}
.mob-info-text { flex: 1; min-width: 0; }
.mob-info-name { font-size: 14px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px; }
.mob-info-hp { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
```

- [ ] **Step 3: Remove the old Battle CSS, keeping the grade-button colors**

Delete (currently lines 559-597 and 599-605 — i.e. everything in the `/* ================= BATTLE ================= */` block except the `.a-again`/`.a-hard`/`.a-good`/`.a-easy` line):

```css
/* ================= BATTLE ================= */
.arena { padding: 12px 14px 14px; }
.monster-row { display: flex; align-items: center; gap: 12px; }
.monster {
  width: 72px; height: 72px; flex-shrink: 0;
  display: grid; place-items: center;
  font-size: 46px;
  border-radius: 12px;
  background: radial-gradient(circle at 50% 60%, #3a1f2c, #140b12);
  border: 1px solid #5b2a3a;
  transition: transform .15s;
}
.monster.hit { animation: hit .35s ease; }
@keyframes hit { 20% { transform: translateX(-6px) rotate(-6deg); filter: brightness(2); } 60% { transform: translateX(5px); } }
.hero-hurt { animation: hurt .4s ease; }
@keyframes hurt { 30% { box-shadow: inset 0 0 40px rgba(255,40,40,.5); } }
.hp-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); }
.hp { height: 12px; border-radius: 3px; background: #0a1120; border: 1px solid #4a2530; overflow: hidden; margin-top: 4px; }
.hp > div { height: 100%; background: linear-gradient(#ff6b6b, #b8262f); transition: width .35s ease; }
.hearts { margin-top: 8px; font-size: 16px; letter-spacing: 2px; }

.flashcard {
  margin-top: 14px;
  min-height: 170px;
  padding: 18px 16px;
  border-radius: 8px;
  background: linear-gradient(#f6ecd0, #e3cf9f);
  color: #2b1e0e;
  box-shadow: inset 0 0 0 2px #b8975c, 0 4px 12px rgba(0,0,0,.4);
  font-size: 16px;
  line-height: 1.45;
  text-align: center;
  overflow-wrap: anywhere;
}
.flashcard img { max-width: 100%; }
.flashcard .answer { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #a4844c; font-weight: 500; }
.answer-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; }
.answer-actions button { padding: 10px 4px; border-radius: 6px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
.answer-actions small { display: block; font-weight: 400; font-size: 10px; opacity: .8; }
.a-again { background: #b8323a; } .a-hard { background: #9a6a22; } .a-good { background: #2f8a4a; } .a-easy { background: #2560c8; }
.reveal-btn { width: 100%; margin-top: 12px; height: 42px; }
.float-dmg {
  position: absolute; font-family: Cinzel, serif; font-weight: 900; font-size: 22px;
  color: #ffd166; text-shadow: 0 2px 0 #000; pointer-events: none;
  animation: floatUp .9s ease forwards;
}
@keyframes floatUp { to { transform: translateY(-40px); opacity: 0; } }
```

Replace it with just:

```css
/* ================= GRADE BUTTONS (reused inside the encounter sheet) ================= */
.answer-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; }
.answer-actions button { padding: 10px 4px; border-radius: 6px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
.answer-actions small { display: block; font-weight: 400; font-size: 10px; opacity: .8; }
.a-again { background: #b8323a; } .a-hard { background: #9a6a22; } .a-good { background: #2f8a4a; } .a-easy { background: #2560c8; }
```

(`.answer-actions` itself is kept and moved here too, since `encounter-panel.js`'s grade-button row uses that exact class name — only its container's *layout* rule survives, the flashcard/hearts/monster/float-dmg presentation rules are genuinely dead now that `encounter-panel.js`'s own `.sheet-*` rules from Task 4 replace them.)

- [ ] **Step 4: Add the defeat overlay and the active-deck highlight**

Add near the bottom of `style.css`, after the `/* ================= ENCOUNTER SHEET ================= */` block added in Task 4:

```css
.defeat-fade {
  position: absolute; inset: 0; z-index: 15;
  background: #05060a;
  opacity: 0;
  transition: opacity .5s ease;
  pointer-events: none;
}
.defeat-fade.is-visible { opacity: 1; }

.deck-card.is-active-deck { box-shadow: inset 0 0 0 1px var(--gold); }
```

- [ ] **Step 5: Grep to confirm nothing else references the removed classes**

Run:

```bash
grep -rn "mob-info-panel\|mob-info-head\|mob-info-portrait\|mob-info-text\|mob-info-name\|mob-info-hp\|class=\"arena\|monster-row\|hero-hurt\|flashcard\|float-dmg\|reveal-btn\b" app.js index.html src/
```

Expected: no output (everything that referenced these was already removed in Tasks 5-6, or — for `.answer-actions`/`.a-again` etc. — intentionally kept).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: `Test Files 2 passed (2)`, `Tests 19 passed (19)`.

- [ ] **Step 7: Commit**

```bash
git add style.css
git commit -m "style(world): remove dead Battle CSS, shrink nav to 5 columns, add defeat overlay"
```

---

## Task 8: Full manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Console-check baseline**

Start the dev server, open the browser's console (via the Claude_Browser tools), navigate through every tab once (Home, World, Quests, Import Deck, Inventory). Expected: no errors, and the bottom nav shows exactly 5 items with no "Battle".

- [ ] **Step 2: Selection and peek**

Click a goblin in World. Expected: yellow glow appears, sheet rises to peek height showing portrait/name/level/HP and "Tap the ... again to attack.", ground clicks do nothing while peeking.

- [ ] **Step 3: No active deck**

With no active deck set, click the same goblin again. Expected: sheet shows "Pick an active deck on Home first." with a working "Go to Home" button; clicking it navigates to Home.

- [ ] **Step 4: Set an active deck**

On Home, import a deck if none exists (`~/Desktop/wanki/Hematologi.apkg` works, or any `.apkg`), then tap "Set Active" on it. Expected: that deck's row shows an "Active" tag and its button now reads "Active ✓".

- [ ] **Step 5: Combat start**

Back in World, click the goblin, then click it again. Expected: sheet opens to `default` height with a real card front and a player HP bar at full width; a "Show Answer" button is visible with no grade buttons yet.

- [ ] **Step 6: Reveal and grade — Again**

Tap "Show Answer" (card back + 4 grade buttons appear), tap "Again". Expected: no hit animation, sheet stays open, the same or a different card appears immediately (requeued), neither HP bar changed.

- [ ] **Step 7: Grade Hard/Good/Easy — non-lethal**

Reveal a card and grade Good (or Hard/Easy). Expected: sheet retracts to a sliver, a lunge+floating-damage-number+shake plays for the player's hit, the mob's Pixi HP bar drops and shifts color once below half/quarter, then (since the goblin has 40 HP and default stats deal far less per hit) the mob's counter-hit plays the same sequence against the player, sheet restores to `default`, next card appears with the player's sheet HP bar now reduced.

- [ ] **Step 8: Drag to expand**

During a fight, drag the sheet's handle up. Expected: sheet grows toward `expanded`; the card text area scrolls independently if long; releasing snaps to whichever of `default`/`expanded` is nearer. Grade another card — the sheet should keep whichever height you snapped to (not reset to `default`) for the rest of this fight.

- [ ] **Step 9: Defeat the mob**

Keep grading until the goblin's `hp` reaches 0 (5 hits at the ~6-10 damage a "good" grade deals against 40 HP, fewer with "easy"). Expected: only the player's hit animates on the killing blow (no mob counter, since it died first per the Pokémon-style knockout rule), the goblin fades out and disappears, a "Victory!" modal shows the XP/coin reward, and after closing it the goblin is genuinely gone if you walk back to where it stood.

- [ ] **Step 10: Engineer a mob-faster scenario**

Temporarily edit `data/zones/plains.json`'s remaining goblin's `stats.attackSpeed` to `20` (above the player's default `10`), reload, and fight it. Expected: the mob's hit animates *first* in the sequence, then the player's (if it survived). Revert the edit afterward (`git checkout -- data/zones/plains.json` or just change it back by hand) so the committed data matches Task 1's values — confirm with `git diff data/zones/plains.json` showing no changes before moving on.

- [ ] **Step 11: Player defeat and respawn**

Temporarily edit the player's `stats.hp` in `defaultPlayer` (`app.js`) down to something a couple of goblin hits will deplete (e.g. `10`), or just clear `localStorage`'s `cardslayer-player` key and reload so `loadPlayer()` picks up a fresh low-HP test value, then lose a fight. Expected: grey fade covers the screen, then fades back in with the player standing at the zone's spawn point at full HP, and the goblin that beat them still standing exactly where it was. Revert any temporary `app.js` edit afterward and confirm `git diff app.js` is clean.

- [ ] **Step 12: Image lightbox (known-inert check)**

Confirm no console error occurs from the (currently always-empty) `cardEl.querySelectorAll("img")` lookup on every card render — expected: none, since it's a no-op when there are no images, per Task 4 Step 4's note.

- [ ] **Step 13: Regression check on movement**

Walk around normally (click-to-move, hold-to-drag, resize the browser window) with no mob selected. Expected: unchanged from before this plan — this plan never touches `stepTowardTarget`/`clampToZone`/`computeCameraX` or the resize logic.

- [ ] **Step 14: Final test run and report**

Run: `npm test`
Expected: `Test Files 2 passed (2)`, `Tests 19 passed (19)`.

No commit for this task — it's verification only. If any step surfaces a bug, fix it in the relevant earlier task's files and commit the fix there (e.g. `git commit -m "fix(combat): <what was wrong>"`), then re-run the affected steps.
