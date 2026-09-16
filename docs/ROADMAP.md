# Cardslayer — Feature Roadmap

Living backlog and status log for the project, kept alongside `docs/HANDOFF.md` (which orients a new session on *decisions already made*) — this file tracks *what's built* and *what's next*. Update it whenever a feature lands or the team agrees on new scope, rather than letting status live only in chat.

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

1. **Stats.** HP, armor, magic resist, attack damage, magic damage (for magic attacks — can come later), attack speed (decides who attacks first, Pokémon-style — **already implemented**, see above), and luck (crit chance, better drops).
   - Current code state: the full 7-field stat block already exists on both the player and mobs (`stats.hp`, `attackDamage`, `magicDamage`, `armor`, `magicResist`, `attackSpeed`, `luck`), but only `hp`, `attackDamage`, and `attackSpeed` are actually read by any formula yet (`src/world/combat.js`). `magicDamage`/`armor`/`magicResist`/`luck` are declared and carried through data, deliberately deferred — this backlog item is "write the formulas," not "add the fields."
2. **Inventory**, three sections:
   - **Equipables** — armor/helmet/weapon slots etc.
   - **Materials** — mob drops (e.g. goblin "scraps"), spent at a smith to craft/upgrade armor.
   - **Buffs** — equip a class, then choose which buff is active if you have more than one unlocked.
3. **Map system, AQ-style.** Walking off the edge of one "page" loads the next. Each page gets its own id (e.g. `plains1`, `plains2`, ...). Note: the zone-loading infrastructure already in place (`data/zones/*.json` + `data/zones/index.json`) already supports multiple named zones — this backlog item is the *edge-to-next-zone transition*, not the underlying data format.
4. **Data storage / backend.** Where does a player's inventory and game state actually live? Should imported Anki decks be uploaded to a server? If multiplayer is wanted, a login/account system is required first. **This is flagged as an open question, not a committed decision** — see below.
5. **Sprites and animations.** Real per-frame character/mob animation, beyond the current single static image + hand-rolled tween "hit" effect.
6. **Aesthetic overhaul.** Restyle menus and buttons to match the intended flash-game look — current UI is functional but not final art direction.

---

## Recommended build order

Reasoning, not a decision — flag disagreement before starting any of these.

1. **Finish the stat formulas** (armor mitigation, magic-vs-physical damage split, luck → crit chance and drop-rate bonus) in `src/world/combat.js`. Small, contained, already has test coverage to extend — and both Inventory (#2) and the multiple-choice-card idea depend on stats actually *doing* something before they're worth building on top of.
2. **AQ-style map paging** (#3). The zone/camera/walkable-band infrastructure already exists for one page; this extends it rather than replacing anything, and turns the game into something that feels explorable instead of a single screen.
3. **Inventory** (#2), once stat formulas exist to make equipment meaningful. Equipables need armor/magic resist to matter (item 1); materials need at least one mob (goblin) already dropping something, which is a small data addition; buffs need the "class" concept defined, which isn't specified anywhere yet and would need its own quick design pass.
4. **Resolve the data storage / backend question** (#4) as a decision, before writing any server code: is multiplayer actually a goal for launch, or a later stretch goal? That answer changes the storage design completely (client-only IndexedDB/localStorage, which is what exists today, vs. a real backend + accounts). Worth a short dedicated design conversation rather than assuming an answer.
5. **Sprites and animations** (#5) — largely gated on an art pipeline decision that was researched earlier (Spine/PixiJS runtime, God Mode AI, Layer.ai, Character Animator) but never finalized. Revisit that decision before investing engineering time here, since it determines the actual file format/integration work.
6. **Aesthetic overhaul** (#6) — lowest urgency, no hard dependency on anything else. Good candidate to pick up opportunistically or hand to a design-focused pass whenever the team wants it, independent of the above order.

## Open questions (need a team decision, not just code)

- **Respawn timer:** 5s (Discord) vs. 6s (shipped) — which is correct?
- **Multiplayer:** in scope for launch, or a later stretch goal? Determines whether a login/account system and server-side storage are needed at all right now.
- **Buff "classes":** not defined anywhere yet — what are the classes, and what buffs does each grant?
- **Anki deck hosting:** decks currently live only in the player's own browser (IndexedDB). Uploading them to a server is only needed if multiplayer/cross-device sync is a goal — same dependency as the login-system question above.
