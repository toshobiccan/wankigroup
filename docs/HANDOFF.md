# Cardslayer — project handoff (2026-09-15)

Read this first. It summarises decisions made in an earlier Claude Code session so the current session can continue without re-deriving them.

**Note (2026-09-16):** this file is now partially stale — a full in-world combat system (real stats, `resolveRound()`, `WorldScene` walk-to-engage/camera-centering, `EncounterPanel`, mob respawn, Fight/Flee buttons) landed since this was written, and the "Next steps" below no longer reflect where the project actually is. See **`docs/ROADMAP.md`** for the current status log and feature backlog going forward — that file, not this section, is where "what's next" now lives.

**Note (2026-09-17):** the game is now **multiplayer-ready** — read `docs/specs/2026-09-17-multiplayer-foundation-design.md` before touching game logic, `app.js` or `world-scene.js`. The short version is in "Multiplayer rules" below.

## Multiplayer rules (2026-09-17)

- Game rules live in `src/game/` (pure, tested) and run **both** in the browser (local mode) and on the server (online mode). Never put a rule (damage, rewards, quest logic, respawn) in `app.js` or `world-scene.js`.
- `app.js` never changes `player` directly. It calls the session (`session.importedDeck`, `session.claimQuest`, `session.engage`, `session.grade`...) and re-renders on the `player` event.
- Positions sent anywhere are zone fractions (0..1), not pixels.
- `npm start` = online mode locally (guest sign-in, database in `.data/`). `npm run start:offline` or `?offline` = local mode. `npm run bot` = fake players to test with.
- Deploy: `docs/DEPLOY.md` (Railway builds the `deploy` branch after the GitHub tests pass; `git push origin main:deploy`).

## What the project is

A mobile/desktop game (iOS first, Windows second, Android later) where the player imports their own Anki flashcard decks (`.apkg`) and fights monsters by answering cards. Each correct answer (Hard/Good/Easy) damages the monster; "Again" costs a heart. XP, coins, gems, daily quests, later gear/inventory and possibly multiplayer. Art style: minimal 2D pixel art, side view, inspired by AdventureQuest Worlds but much simpler. The original pitch deck is `~/Desktop/wanki/wanki.pptx` (Norwegian, 27 slides).

## Team and skill level

- The user (GitHub `willdogkillerman`) is a **beginner** at programming and git. Explain steps concretely, one at a time, and prefer doing things from the terminal for them rather than sending them to GUIs.
- A coworker (GitHub `toshobiccan`) owns the repo and wrote the prototype. They are the reviewer for pull requests.

## Decisions already made (do not reopen unless asked)

1. **Name: Cardslayer.** Chosen for marketability (says what it does, one spelling, zero collisions found). Rejected: FlashQuest (taken), Enki Quest / Wanki Quest (too close to the Anki trademark), MemoQuest (three existing apps), Deckborne, Deck & Dagger (taken).
2. **"Anki" must never be in the product name, app title or store listing title** — registered trademark of Ankitects. "Works with Anki decks" (descriptive use) is fine. No AGPL code from the Anki project may be used.
3. **Engine: the existing web stack**, not Godot. Plain HTML/JS/CSS with no bundler, PixiJS 8 to be added for sprites, Capacitor for iOS packaging, Tauri for Windows. Reason: the coworker had already built a working JS prototype including the hard part (`.apkg` parsing in the browser).
4. **Art pipeline** is specified in `docs/specs/2026-09-15-character-art-pipeline-design.md`: 64×64 pixel art (128×128 bosses), four animations (`idle` 4f, `attack` 4f, `hit` 2f, `death` 4f), six player equipment slots (`body, legs, chest, hair, head, weapon`) as layered sprite sheets, Aseprite templates + CLI export, AI-generated art (PixelLab / Retro Diffusion) cleaned up in Aseprite, JSON data files + a generated `data/index.json`, one `CharacterRig` class for both player and mobs. The spec is approved by the user.

## Repo state

- Repo: `https://github.com/toshobiccan/wankigroup` — **to be renamed `cardslayer` by the coworker** (Settings → Repository name). After that, run `git remote set-url origin https://github.com/toshobiccan/cardslayer.git` here.
- Local clone: `~/Documents/GitHub/wankigroup` (the only clone; a duplicate on the Desktop was deleted).
- `main` = the coworker's original prototype, one commit ("Anki Quest: gamified Anki flashcard app").
- Branch `chore/housekeeping` is pushed and open as **PR #1** (`https://github.com/toshobiccan/wankigroup/pull/1`), awaiting the coworker's review/merge. It contains 4 commits:
  1. rename product to Cardslayer (title, README, storage keys `cardslayer` / `cardslayer-player`; README "Naming" section);
  2. new players start as "Adventurer", Lv 1, 0 XP/coins/gems (was demo profile EUGEEE23 Lv 19);
  3. JSZip / sql.js / fzstd vendored into `vendor/` with a licence table, server serves `.wasm` MIME;
  4. `package.json` (`npm start`) and the art spec under `docs/specs/`.
- Prototype files: `index.html`, `style.css`, `app.js` (state, nav, import, battle, SM-2 scheduling, quests), `anki-import.js` (apkg parser), `db.js` (IndexedDB), `server.js` (static server on :5173), `assets/` (AI illustrations, ~15 MB).
- Known gaps to schedule later: importer skips images/audio (medical decks are image-heavy); Google Fonts still load from the internet; no tests, no lint; monsters are emoji; no player sprite, no inventory.

## Tools installed on this Mac (verified)

- Xcode Command Line Tools, git 2.39 — working.
- Node 24, npm 11.
- VS Code (the `code` shell command is not installed; optional).
- GitHub Desktop (installed but the user prefers the terminal; not needed).
- `gh` 2.100 at `~/.local/bin/gh`, on PATH via `~/.zshrc`, logged in as `willdogkillerman`, and `gh auth setup-git` done — **plain `git push` works from the terminal.**
- Anki desktop app (for exporting test decks).
- Homebrew.
- **Not installed:** Aseprite (needed for the art pipeline, ~$20), full Xcode (needed only for the iOS build, later), PixiJS (not yet added to the repo).

## Conventions

- Conventional Commits, feature branches, PRs reviewed by the coworker, `--no-ff` merges. Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Keep code readable for non-experts: plain JS, small files, comments where intent is not obvious.
- Run the app with `npm start`, open http://localhost:5173, use the browser's device toolbar at ~400 px width.

## Next steps, in order

1. Coworker merges PR #1 and renames the repo; update the local remote.
2. Write the implementation plan for the art pipeline from spec §12 (use the writing-plans skill), as small PR-sized tasks.
3. User buys Aseprite; produce `palette.gpl`, `template.aseprite`, first base body.
4. Add PixiJS and implement `aseprite-loader.js`, `registry.js`, `character-appearance.js`, `character-rig.js` with Vitest tests, then hook into the battle view.
