# Cardslayer

Turn your flashcards into a learning adventure. Works with decks exported from Anki. Import an `.apkg` deck exported from Anki, then battle monsters by answering your cards — earn XP, coins and gems, and complete daily quests.

## Run it

Requires [Node.js](https://nodejs.org).

```bash
node server.js
```

Open http://localhost:5173 (designed for a phone-sized screen, ~400 px wide — use your browser's device toolbar on desktop).

It is a plain static site, so it also works on GitHub Pages or any static host. The libraries that read Anki files (JSZip, sql.js, fzstd) are bundled in `vendor/`, so importing works offline. Only the Google Fonts still load from the internet; the app falls back to system fonts without them.

## How it works

- **Import Deck** – drag in an `.apkg`/`.colpkg`. Supports legacy and new (zstd-compressed) Anki exports. Text only; images and audio are skipped. Decks are stored in the browser (IndexedDB).
- **Battle** – reveal each card and grade it Again / Hard / Good / Easy. Correct answers damage the monster, "Again" costs a heart. Cards are scheduled with a simplified SM-2 algorithm.
- **Home** – your decks with learned/due counts.
- **Quests** – daily goals with claimable rewards.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Layout and the illustrated scene |
| `style.css` | Styling and scene animations |
| `app.js` | Player state, navigation, import flow, battle, quests |
| `anki-import.js` | `.apkg` parsing in the browser |
| `db.js` | IndexedDB storage |
| `server.js` | Tiny static file server |
| `assets/` | Web-sized art; `assets/originals/` holds the full-resolution source images |
| `vendor/` | Third-party browser libraries, pinned versions (see `vendor/README.md`) |

## Naming

"Anki" is a registered trademark of Ankitects. The product name is **Cardslayer**. Saying that the app *works with Anki decks* is fine (descriptive use); putting "Anki" in the product name, app title, or store listing title is not.
