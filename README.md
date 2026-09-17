# Cardslayer

Turn your flashcards into a learning adventure. Works with decks exported from Anki. Import an `.apkg` deck exported from Anki, then walk the world and battle monsters by answering your cards — earn XP, coins and gems, and complete daily quests. Built multiplayer-ready: the same game runs offline on one device or online with other players.

## Run it

Requires [Node.js](https://nodejs.org) 22.13 or newer (24 recommended).

```bash
npm install
npm start
```

Open http://localhost:5173 (designed for a phone-sized screen, ~400 px wide — use your browser's device toolbar on desktop).

`npm start` runs the **online** game server locally: pick a name, and you play as a guest account stored in `.data/cardslayer.db`. Other useful commands:

| Command | What it does |
| --- | --- |
| `npm run start:offline` | Serve only the app; it runs in **local mode** (progress in the browser, no accounts) |
| `npm run bot` | Start a fake player that joins your local server, walks around and fights (`-- --count 3` for more) |
| `npm test` | Run the test suite (game rules, rooms, server API + WebSocket, local mode) |

Opening `http://localhost:5173/?offline` also forces local mode. Any static host without the server (e.g. GitHub Pages) falls back to local mode automatically.

## How it works

- **Import Deck** – drag in an `.apkg`/`.colpkg`. Supports legacy and new (zstd-compressed) Anki exports. Text only; images and audio are skipped. Decks are stored on the device (IndexedDB) and never uploaded.
- **World** – tap to walk, tap a monster to select it, tap again to fight. Each round is a flashcard: grade it Again / Hard / Good / Easy and the round's damage follows. Other players in the same room are visible and can fight the same monster; everyone fighting it when it falls gets the reward.
- **Home** – your decks with learned/due counts; choose the active deck for fights.
- **Quests** – daily goals with claimable rewards.
- **Inventory** – character stats and (future) items.

Architecture in one paragraph: game rules live in `src/game/` as pure functions and a `Room` class. In local mode the browser runs them; in online mode the server runs the exact same code and the browser only sends intents (move, engage, grade). `src/net/session.js` picks the mode and gives the app one interface for both. Details: `docs/specs/2026-09-17-multiplayer-foundation-design.md`.

## Deploy

One-time setup and the deploy button: **`docs/DEPLOY.md`**. After setup, deploying is `git push origin main:deploy`.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | App shell, screens, navigation, sign-in UI |
| `anki-import.js`, `db.js` | `.apkg` parsing and on-device deck storage |
| `src/game/` | Shared game rules: player, progression, quests, encounters, `Room` |
| `src/net/` | Sessions (local/online), WebSocket client, protocol |
| `src/world/` | PixiJS world, encounter panel, combat math |
| `server.js`, `server/` | Game server: static files, HTTP API, WebSocket rooms, SQLite |
| `data/zones/` | Zone pages (used by both browser and server) |
| `tools/` | Zone index builder, test bot |
| `Dockerfile`, `fly.toml`, `.github/workflows/` | Production image, Fly.io config, CI + deploy |
| `assets/` | Web-sized art; `assets/originals/` holds the full-resolution source images |
| `vendor/` | Third-party browser libraries, pinned versions (see `vendor/README.md`) |

## Naming

"Anki" is a registered trademark of Ankitects. The product name is **Cardslayer**. Saying that the app *works with Anki decks* is fine (descriptive use); putting "Anki" in the product name, app title, or store listing title is not.

## Docs

- `docs/HANDOFF.md` — decisions already made; read first.
- `docs/ROADMAP.md` — what's built and what's next.
- `docs/DEPLOY.md` — putting the multiplayer server online.
- `docs/specs/2026-09-17-multiplayer-foundation-design.md` — client/server architecture, protocol, security model.
- `docs/specs/2026-09-15-character-art-pipeline-design.md` — how player/mob sprites are produced, stored and rendered.
