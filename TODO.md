# TODO

The prioritized backlog. Read this first when picking up work with no other
instructions — it says what to build next and roughly why. `docs/ROADMAP.md`
is the complementary dev journal (dated entries on what already shipped and
the reasoning behind it); check there before starting an item here in case
it's already further along than this list assumes. `docs/HANDOFF.md` has
standing conventions (where game rules live, commit style, multiplayer
rules) that apply regardless of which item you're doing.

Priority is importance, not necessarily size — some P0s are one-line fixes,
some P2s are multi-day features. Within a tier, earlier items block or feed
later ones more often than not; that ordering is intentional.

Items marked **(exists)** already have real code behind them — the task is
extending or fixing that code, not building from zero. Don't re-architect
past them without a reason.

## P0 — Bugs and quick wins

Small, self-contained, clearly broken or clearly missing.

1. **Wardrobe button not visible when in combat.** Should stay reachable (or be deliberately hidden with a reason) regardless of fight state.
2. **A/B button placement looks wrong.** Fix positioning in `src/world/world-controls.css`.
3. **Remove the victory screen shown after defeating a mob.** Currently `finishWithVictory()` in `app.js` opens a modal ("You vanquished the X", +XP/+coins) — drop it, or fold the reward text into something that doesn't block the flow.
4. **Chat background transparent.** `.chat-log`/`.chat-input` in `src/world/world-scene.js` — small CSS change.
5. **Chats disappear after N seconds.** Chat log lines currently persist indefinitely; add a fade/removal timer (there's already a precedent — `CHAT_BUBBLE_MS` fades the above-head speech bubble after 4.5s in `world-scene.js` — the log itself is separate and doesn't yet time out).
6. **Rename "Menu" → "Decks"** across nav (`index.html`, `app.js`, `style.css`/`adventure-ui.css` classnames if any reference "menu" in copy). Do this *before* the Decks menu redesign below so that work lands with the right name from the start.
7. **No-deck fight guard (exists).** Already implemented: engaging with no active deck shows "Pick an active deck in Menu first" with a button straight to Home (`handleCombatStart` in `app.js`). Just needs its copy/target updated once "Menu" becomes "Decks".

## P1 — Combat screen redesign (builds on this session's work)

The fixed top-stage combat view (camera zoom, sticky grade buttons, instant
card transitions) landed this session in `src/world/world-scene.js` and
`src/world/encounter-panel.js`. These items are the next layer on top of it.

1. **Card-size-aware stage height.** Right now the top stage is a fixed 20% of the battle area for every card (`COMBAT_STAGE_FRACTION` in `world-scene.js`). Change it so a short card leaves more room for the fight animation (stage bigger) and a long/image card keeps the current ~20% floor. This reintroduces *some* per-card sizing, but the stage should still not zoom/re-pan — only its height changes, gradually, not the camera framing math.
2. **Bring the joystick + A/B buttons back during combat, in the same place, doing the same thing (move).** This session's work explicitly *hid* them during combat (`body.in-combat .world-controls{display:none}` in `world-controls.css`) on the reasoning that movement is locked in a fight. Reverse that: the ask now is muscle memory — the same controls in the same spot whether exploring or fighting, so a player never has to relearn where to tap. Figure out what the D-pad/A/B should *do* mid-fight (no-op? camera nudge? something else?) since movement itself is still locked.
3. **Joystick/A-B: more transparent, with their own dedicated space "between" (the stage and the sheet, presumably).** Pair with the item above — don't just restore the old overlay, give it a real spot in the new fixed layout so it can't collide with the grade buttons.
4. **Move the Explain button** from the status row (top of the card) to below the answer, above the grade buttons.
5. **Decks menu redesign** (see its own section below — large enough to plan separately, but it's a P1 because decks are the core loop).

## Decks menu redesign (referenced from P1 above)

1. **Deck list** with a clear active-deck indicator (exists in basic form today — `renderers.home` in `app.js`) and, per deck, an entry into full Deck Options (exists — `src/ui/study-settings.js`'s `deckOptionsForm`, see the "Uncategorized" note below for what's still missing from it).
2. Below the list, two entry points:
   - **Import your own deck**: short how-to text plus the import control (the import flow itself exists — `anki-import.js`/`db.js`) and a Help button.
   - **Browse deck library**: other users' decks, sorted by popularity/rating, searchable, categorized. Each entry shows name, star rating, category, card count, language flag, and uploader username.
3. **Upload to the public library**: a deck you've uploaded earns its owner Gold when others play it. This needs: a public deck catalog (server-side, since it's shared across accounts — depends on the Server system item below for real persistence), a rating/popularity mechanism, and a payout rule for "someone played my deck."

## P2 — Engagement systems

High retention value, not blocking the core loop.

1. **XP bar / deck-stats revamp.** Segmented bar with numbers, time-to-next-level, and a per-deck breakdown (solved count, % solved, color-coded new/learning/review/mature). This is a good pairing with the dopamine system below (XP orbs need a bar worth flying into) — consider doing them together.
2. **"Dopamine" reward layer**: sound, animation and color feedback for correct answers, mob kills, level-ups. Make it a togglable setting (distraction-free mode stays available) — a `cardslayer-controls`-style localStorage flag, following the existing pattern in `src/ui/control-settings.js`. Worth a short pass studying what mobile match-3/gacha games actually do (juice on every correct action, escalating feedback for streaks) before implementing, per the user's own note.
3. **XP orbs on mob kill** that visibly travel to the XP bar and fill it — the animated payoff moment for #1/#2 above.
4. **Quest automation.** Basic quest tracking already exists **(exists)** — `src/game/progression.js` has `QUESTS` (review 20 cards, win a battle, import a deck) with daily counters and a claim button in the Quests screen. What's missing: a persistent nav-bar indicator for "quest ready to claim", and likely auto-claiming so "no intervention needed" is literally true.
5. **Pomodoro timer**: 25-minute focus session, always-visible while running, "don't close the app" warning, big XP reward on completion, 5-minute break, then a queued prompt to start another cycle. Chat announcement on N cycles in a row (reuse the existing chat broadcast, see Leaderboard note below).
6. **Leaderboard**: top 3 by level shown with their character, rest a searchable scrollable list. **Depends on persistent accounts** (see Server system) — a leaderboard is meaningless against guest accounts that reset. Chat announcement when another player hits 200 cards solved can reuse the existing `Room.chat`/`session.chat` broadcast path (`src/game/room.js`) — no new transport needed, just a trigger.

## P3 — Content and world

1. **Inventory: show the whole body wearing equipped armor**, not just a portrait/head.
2. **Movement: scale the character up the further south they stand** on a zone (per the note, the current fixed scale is tuned for the northmost position). Small, isolated change in `src/world/world-scene.js`'s player scale logic.
3. **Fix animations** (unspecified — needs a concrete bug list from whoever picks this up; too vague to size as-is).
4. **Fix items / create an item library.** `src/items.js` has the shape (`createEquipable`, `createMaterial`, slots) but no real catalog and no drop system yet (noted as a known gap in `docs/ROADMAP.md`).
5. **Fix mobs: idle animation, attack animation.** Mobs are currently static art with a hand-rolled hit tween (`_playSingleHit` in `world-scene.js`), not a real animation rig like the player's.
6. **Asset generation tool.** Needs scoping — is this for mobs, rooms, items, or all three? `docs/art-reference/` has the prompt templates used so far; this item is presumably about tooling around that, not the prompts themselves.
7. **Expand the world** (more zones/rooms — `data/zones/`, `data/region-templates/`).
8. **Bots simulating players (exists, partial).** `npm run bot` / `tools/bot.mjs` already spins up fake players that join, walk and fight. This item likely means more of them, smarter behavior, or using them for load-testing the leaderboard/chat features above — not starting from scratch.

## P4 — Platform and infrastructure

1. **Server system: login, password, save state, hosting.** Bigger than it looks — **mostly exists already.** Guest accounts with optional username/password, SQLite-backed save state, and WebSocket multiplayer rooms shipped 2026-09-17 (`docs/specs/2026-09-17-multiplayer-foundation-design.md`, `server/`). Railway deploy config is already committed (`Dockerfile`, `railway.json`, `docs/DEPLOY.md`). Per `docs/ROADMAP.md`, the only step left to actually go live was the one-time Railway project setup — check whether that's since been done before treating this as greenfield work.

## Uncategorized / needs triage

- Deck options should let you "configure everything Anki has" per-deck — the deck-options screen and per-deck scheduler overrides already exist (`src/ui/study-settings.js`, `src/game/srs.js`); this is about auditing which Anki settings are still missing from it, not building the mechanism.
