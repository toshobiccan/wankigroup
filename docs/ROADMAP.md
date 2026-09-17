# Cardslayer — Feature Roadmap

Living backlog and status log for the project, kept alongside `docs/HANDOFF.md` (which orients a new session on *decisions already made*) — this file tracks *what's built* and *what's next*. Update it whenever a feature lands or the team agrees on new scope, rather than letting status live only in chat.

---

## 2026-09-17 — Multiplayer foundation (decision + build)

**Decision (toshobiccan):** multiplayer is a goal, so everything is built multiplayer-ready from now on, prepared so that starting multiplayer tests is just a deploy. Resolves backlog item 4 and the "Multiplayer" / "Anki deck hosting" open questions below.

Built on `feature/multiplayer-foundation` (design: `docs/specs/2026-09-17-multiplayer-foundation-design.md`):

- **Shared rules** in `src/game/` (player save, rewards, quests, one flashcard round, `Room`), used unchanged by the browser (local mode) and the server (online mode).
- **Game server** (`server/`): guest accounts → optional username/password, SQLite storage, server-side rewards, WebSocket rooms with the agreed instance ids (`plains1-0001`, 5 players each), shared mob HP, rewards to everyone fighting a mob when it falls, server-side 5 s respawns, reconnect + rejoin.
- **Client**: sign-in screens, connection dot + room badge, other players visible and walking in World, local mode kept for offline/static hosting (`?offline`).
- **Decks stay on the device** in both modes; only grades and card counts reach the server.
- **Deploy ready**: Dockerfile, Railway config (`railway.json`, switched from Fly.io the same day at toshobiccan's request), GitHub Actions tests, `docs/DEPLOY.md`. One-time Railway project setup is the only step left.
- **Testing aids**: `npm run bot` (fake players), 75 automated tests incl. real HTTP + WebSocket runs.
- Behaviour changes: deck-import rewards capped at 3 per day; a mob nobody is fighting heals to full; mob respawn moved from `WorldScene` into `Room`.
- Fixed along the way: page transitions could loop forever between two pages when the canvas had zero width; engaging a mob could send a stale position one frame before arrival.

---

## 2026-09-16 (later still) — AQ-style multi-page maps

`src/world/world-scene.js` (`13390c6`): `WorldScene` now hosts a chain of connected pages instead of one static zone, AQ-style — walk to a page's edge and it loads the next one, landing you just inside the matching edge of the new page. Zone JSON gains `"links": {"prev", "next"}`; the existing zone is renamed `plains.json` → `plains1.json` (id `"plains1"`) and links forward to a new `plains2.json` — a **blank** page (no background image, no mobs) rendered as a flat placeholder at the same aspect ratio as the real art, exactly per spec ("make rooms blank except for the one that has been created"). A small pulsing arrow marks any edge that has a link, and the current page's `displayName` shows in small text, bottom-left.

The multiplayer room-instance idea from the same message (`plains1-0001`, `plains1-0002`, ...) is **not built** — deliberately out of scope for now, per the message's own framing ("later, on multiplayer..."). Noted in Open Questions below since it'll shape the id scheme whenever multiplayer is actually tackled.

Caught and fixed a real bug during manual verification: the ticker and resize observer both start running during one-time setup, before the first page (or a later transition) has actually finished loading — a tick landing in that window read `zone.width` while still `undefined`, silently corrupting the camera position to `NaN` forever (same self-perpetuating-corruption class as a bug already fixed once this session for player position/target). Fixed with a `_pageReady` guard.

Pushed to `feature/overworld-movement-prototype` (PR #2). Retires backlog item 3 below.

---

## 2026-09-16 (later) — stat formulas finished, Inventory screen built

**Stat formulas** (`src/world/combat.js`, `48e8e77`): all seven stats are read now, not just three. Armor/magic resist each independently mitigate their matching damage component, floored so a nonzero hit always deals at least 1 — defense can slow a fight down, never make it literally unwinnable. Luck gives an injectable-random crit chance (1%/point, capped 50%, stacks with the guaranteed crit on "easy") that multiplies damage 1.5x, plus a deterministic +2%/point coin bonus (capped +100%) on victory. Mobs can crit too now, symmetric with the player. 10 new tests.

**Inventory screen** (`app.js`/`index.html`/`style.css`, `4ee125a`): two-column layout. Left: character image/name/level, with a "Stats" button that swaps in a tappable stat list (plain-English explanation always shown, exact formula revealed on tap, copied straight from `combat.js` so it can't drift from the real math) — no equip slots yet, deliberately, since there's no sprite to show gear on. Right: three tabs (Equipables/Materials/Status) over a scrollable list; materials carry a `quantity` and render a stack badge. No items exist yet (no drop system), so every tab starts empty — the rendering itself (both empty and populated) was verified by temporarily injecting test entries in the browser, not by shipping fake starter items.

Both pushed to `feature/overworld-movement-prototype` (PR #2). This retires backlog items 1 and the UI-shell part of 2 below; Inventory still needs an actual drop system and item definitions before it holds anything real.

---

## 2026-09-16 status update

Source: team Discord conversation (hoye4083), summarizing what's done and what's still needed. Reproduced here (translated/organized from Norwegian) so it doesn't stay buried in chat history.

### Built and working

- **Movement** — mouse and touch both work. Tap the ground to walk there; hold down to keep moving continuously (like League of Legends). A click/tap indicator animation is planned but not yet built.
- **Mobs** — goblins only so far. They have the same stat block as the player (HP, attack speed, attack damage, etc.). Defeated mobs respawn so they can be farmed.
  - **Resolved (2026-09-17):** respawn is **5 seconds**, as in the Discord message (`RESPAWN_DELAY_MS` in `src/world/world-scene.js`, was 6s).
- **Combat mechanics** — tap a mob once to select it, tap again (or use the Fight/Flee buttons) to engage. A flashcard appears; grading it Again/Hard/Good/Easy deals damage. Every exchange checks attack speed — whoever's higher swings first (Pokémon-style), turn-based, with a flashcard between each round. Explicitly called out as needing further tuning, but functional.
  - **Planned follow-up** (not yet built): auto-detect when an Anki card is multiple-choice and, for those cards specifically, deal damage on a correct pick and miss on a wrong one — instead of the player self-grading via Again/Hard/Good/Easy.
- **Map** — a background is generated from a prompt (shared with the team the day before this message). The prompt can also ask for the walkable ground vs. non-walkable sky to be auto-coded from the image. If the background is wider than the screen, the camera auto-scrolls as the character nears the edge.

### Backlog — not yet built

1. ~~**Stats.**~~ **Done (2026-09-16, see above).** All seven fields (`hp`, `attackDamage`, `magicDamage`, `armor`, `magicResist`, `attackSpeed`, `luck`) are now live in `src/world/combat.js`, not just declared.
2. **Inventory.** **UI shell done (2026-09-16, see above)** — the two-column screen, the three tabs, the stat-tooltip character panel. Still missing:
   - **Equipables** — armor/helmet/weapon slots etc. UI has no equip slots at all yet (deliberate, no sprite to show gear on); needs the slot UI once that's ready, plus actual equip/stat-bonus logic.
   - **Materials** — mob drops (e.g. goblin "scraps"), spent at a smith to craft/upgrade armor. The list renders and stacks correctly, but no drop system exists yet, so it's always empty in practice.
   - **Status** (renamed from "buffs" in the latest team message) — equip a class, then choose which buff is active if you have more than one unlocked. Same story: list renders, nothing to show yet, and the "class" concept still isn't defined anywhere (see Open Questions).
3. ~~**Map system, AQ-style.**~~ **Done (2026-09-16, see above).** Edge-to-next-page transitions, blank placeholder pages, edge arrows, and the page-name label are all live. Not built (deliberately, per the request): the multiplayer per-room instancing (`plains1-0001` etc.) — see Open Questions.
4. ~~**Data storage / backend.**~~ **Decided and built (2026-09-17, see above).** Progression lives on the server in online mode (SQLite), in localStorage in local mode; decks stay on the device; guest accounts with optional password.
5. **Sprites and animations.** Real per-frame character/mob animation, beyond the current single static image + hand-rolled tween "hit" effect.
6. **Aesthetic overhaul.** Restyle menus and buttons to match the intended flash-game look — current UI is functional but not final art direction.

---

## Recommended build order

Reasoning, not a decision — flag disagreement before starting any of these.

1. ~~Finish the stat formulas~~ **Done (2026-09-16).**
2. ~~Inventory UI shell~~ **Done (2026-09-16)**, built directly on request ahead of this order — the real remaining work (drop system, item definitions, equip slots + stat bonuses, the "class"/buff concept) is unblocked by stats now being live, but still needs its own design pass; not yet scheduled below.
3. ~~AQ-style map paging~~ **Done (2026-09-16).**
4. ~~Resolve the data storage / backend question~~ **Done (2026-09-17)** — multiplayer foundation built. Next multiplayer step when the team wants to test: one-time Railway setup in `docs/DEPLOY.md`, then deploy.
5. **Sprites and animations** (#5) — largely gated on an art pipeline decision that was researched earlier (Spine/PixiJS runtime, God Mode AI, Layer.ai, Character Animator) but never finalized. Revisit that decision before investing engineering time here, since it determines the actual file format/integration work.
6. **Aesthetic overhaul** (#6) — lowest urgency, no hard dependency on anything else. Good candidate to pick up opportunistically or hand to a design-focused pass whenever the team wants it, independent of the above order.

## Open questions (need a team decision, not just code)

- ~~**Multiplayer:** in scope?~~ **Decided 2026-09-17: yes, built in from the start** (see the 2026-09-17 entry). Still open within it: shared-mob reward split (today everyone fighting gets the full reward), chat/parties, and whether guests should be allowed at public launch.
- **Buff "classes":** not defined anywhere yet — what are the classes, and what buffs does each grant?
- ~~**Anki deck hosting:**~~ **Decided 2026-09-17: decks stay on the device** (privacy, size, deck copyright). Consequence: grades can't be verified by the server, and a player's decks don't follow them to a new device — they re-import there. Revisit only if cross-device deck sync becomes a real request.
