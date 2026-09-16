# Cardslayer — Feature Roadmap

Living backlog and status log for the project, kept alongside `docs/HANDOFF.md` (which orients a new session on *decisions already made*) — this file tracks *what's built* and *what's next*. Update it whenever a feature lands or the team agrees on new scope, rather than letting status live only in chat.

---

## 2026-09-16 (later) — stat formulas finished

`src/world/combat.js` now reads all seven stats, not just three. **Armor**/**magic resist** each independently mitigate their matching damage component (`attackDamage`/`magicDamage`), floored so a nonzero hit always deals at least 1 — defense can slow a fight down, never make it literally unwinnable. **Luck** now does both of the things item 1 below asked for: an injectable-random crit chance (1% per point, capped 50%, stacks with the existing guaranteed crit on "easy") that multiplies total damage by 1.5x, and a deterministic +2%-per-point coin bonus (capped +100%) on victory — a flat bonus, not a random chance, so actual earnings stay predictable. Mobs can crit too now (symmetric with the player), though no mob has nonzero luck yet so this is inert in practice until one does. 10 new tests (`test/combat.test.js`, 16 in that file / 33 total), plus a live check against real game data confirming the goblin's mitigated hit lands correctly in the running app. **Not pushed yet** — committed locally on `feature/overworld-movement-prototype` (`48e8e77`), pending review before joining PR #2.

This retires backlog item 1 below and unblocks Inventory (item 2), which was waiting on stats actually doing something.

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

1. ~~Finish the stat formulas~~ **Done (2026-09-16).**
2. **AQ-style map paging** (#3). Next up. The zone/camera/walkable-band infrastructure already exists for one page; this extends it rather than replacing anything, and turns the game into something that feels explorable instead of a single screen.
3. **Inventory** (#2), once stat formulas exist to make equipment meaningful. Equipables need armor/magic resist to matter (item 1); materials need at least one mob (goblin) already dropping something, which is a small data addition; buffs need the "class" concept defined, which isn't specified anywhere yet and would need its own quick design pass.
4. **Resolve the data storage / backend question** (#4) as a decision, before writing any server code: is multiplayer actually a goal for launch, or a later stretch goal? That answer changes the storage design completely (client-only IndexedDB/localStorage, which is what exists today, vs. a real backend + accounts). Worth a short dedicated design conversation rather than assuming an answer.
5. **Sprites and animations** (#5) — largely gated on an art pipeline decision that was researched earlier (Spine/PixiJS runtime, God Mode AI, Layer.ai, Character Animator) but never finalized. Revisit that decision before investing engineering time here, since it determines the actual file format/integration work.
6. **Aesthetic overhaul** (#6) — lowest urgency, no hard dependency on anything else. Good candidate to pick up opportunistically or hand to a design-focused pass whenever the team wants it, independent of the above order.

## Open questions (need a team decision, not just code)

- **Respawn timer:** 5s (Discord) vs. 6s (shipped) — which is correct?
- **Multiplayer:** in scope for launch, or a later stretch goal? Determines whether a login/account system and server-side storage are needed at all right now.
- **Buff "classes":** not defined anywhere yet — what are the classes, and what buffs does each grant?
- **Anki deck hosting:** decks currently live only in the player's own browser (IndexedDB). Uploading them to a server is only needed if multiplayer/cross-device sync is a goal — same dependency as the login-system question above.
