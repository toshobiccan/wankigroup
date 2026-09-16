# Cardslayer — Feature Roadmap

Living backlog and status log for the project, kept alongside `docs/HANDOFF.md` (which orients a new session on *decisions already made*) — this file tracks *what's built* and *what's next*. Update it whenever a feature lands or the team agrees on new scope, rather than letting status live only in chat.

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
  - ⚠️ **Discrepancy to resolve:** the Discord message says mobs respawn after **5 seconds**; the actual shipped behavior (this session, verified in-browser) is **6 seconds** (`RESPAWN_DELAY_MS` in `src/world/world-scene.js`). Not changed here — flagging so the team can confirm which number is intended.
- **Combat mechanics** — tap a mob once to select it, tap again (or use the Fight/Flee buttons) to engage. A flashcard appears; grading it Again/Hard/Good/Easy deals damage. Every exchange checks attack speed — whoever's higher swings first (Pokémon-style), turn-based, with a flashcard between each round. Explicitly called out as needing further tuning, but functional.
  - **Planned follow-up** (not yet built): auto-detect when an Anki card is multiple-choice and, for those cards specifically, deal damage on a correct pick and miss on a wrong one — instead of the player self-grading via Again/Hard/Good/Easy.
- **Map** — a background is generated from a prompt (shared with the team the day before this message). The prompt can also ask for the walkable ground vs. non-walkable sky to be auto-coded from the image. If the background is wider than the screen, the camera auto-scrolls as the character nears the edge.

### Backlog — not yet built

1. ~~**Stats.**~~ **Done (2026-09-16, see above).** All seven fields (`hp`, `attackDamage`, `magicDamage`, `armor`, `magicResist`, `attackSpeed`, `luck`) are now live in `src/world/combat.js`, not just declared.
2. **Inventory.** **UI shell done (2026-09-16, see above)** — the two-column screen, the three tabs, the stat-tooltip character panel. Still missing:
   - **Equipables** — armor/helmet/weapon slots etc. UI has no equip slots at all yet (deliberate, no sprite to show gear on); needs the slot UI once that's ready, plus actual equip/stat-bonus logic.
   - **Materials** — mob drops (e.g. goblin "scraps"), spent at a smith to craft/upgrade armor. The list renders and stacks correctly, but no drop system exists yet, so it's always empty in practice.
   - **Status** (renamed from "buffs" in the latest team message) — equip a class, then choose which buff is active if you have more than one unlocked. Same story: list renders, nothing to show yet, and the "class" concept still isn't defined anywhere (see Open Questions).
3. **Map system, AQ-style.** Walking off the edge of one "page" loads the next. Each page gets its own id (e.g. `plains1`, `plains2`, ...). Note: the zone-loading infrastructure already in place (`data/zones/*.json` + `data/zones/index.json`) already supports multiple named zones — this backlog item is the *edge-to-next-zone transition*, not the underlying data format.
4. **Data storage / backend.** Where does a player's inventory and game state actually live? Should imported Anki decks be uploaded to a server? If multiplayer is wanted, a login/account system is required first. **This is flagged as an open question, not a committed decision** — see below.
5. **Sprites and animations.** Real per-frame character/mob animation, beyond the current single static image + hand-rolled tween "hit" effect.
6. **Aesthetic overhaul.** Restyle menus and buttons to match the intended flash-game look — current UI is functional but not final art direction.

---

## Recommended build order

Reasoning, not a decision — flag disagreement before starting any of these.

1. ~~Finish the stat formulas~~ **Done (2026-09-16).**
2. ~~Inventory UI shell~~ **Done (2026-09-16)**, built directly on request ahead of this order — the real remaining work (drop system, item definitions, equip slots + stat bonuses, the "class"/buff concept) is unblocked by stats now being live, but still needs its own design pass; not yet scheduled below.
3. **AQ-style map paging** (#3). Next up. The zone/camera/walkable-band infrastructure already exists for one page; this extends it rather than replacing anything, and turns the game into something that feels explorable instead of a single screen.
4. **Resolve the data storage / backend question** (#4) as a decision, before writing any server code: is multiplayer actually a goal for launch, or a later stretch goal? That answer changes the storage design completely (client-only IndexedDB/localStorage, which is what exists today, vs. a real backend + accounts). Worth a short dedicated design conversation rather than assuming an answer.
5. **Sprites and animations** (#5) — largely gated on an art pipeline decision that was researched earlier (Spine/PixiJS runtime, God Mode AI, Layer.ai, Character Animator) but never finalized. Revisit that decision before investing engineering time here, since it determines the actual file format/integration work.
6. **Aesthetic overhaul** (#6) — lowest urgency, no hard dependency on anything else. Good candidate to pick up opportunistically or hand to a design-focused pass whenever the team wants it, independent of the above order.

## Open questions (need a team decision, not just code)

- **Respawn timer:** 5s (Discord) vs. 6s (shipped) — which is correct?
- **Multiplayer:** in scope for launch, or a later stretch goal? Determines whether a login/account system and server-side storage are needed at all right now.
- **Buff "classes":** not defined anywhere yet — what are the classes, and what buffs does each grant?
- **Anki deck hosting:** decks currently live only in the player's own browser (IndexedDB). Uploading them to a server is only needed if multiplayer/cross-device sync is a goal — same dependency as the login-system question above.
