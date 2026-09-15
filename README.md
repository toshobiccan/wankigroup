# Anki Quest

Turn your Anki flashcards into a learning adventure. Import an `.apkg` deck exported from Anki, then battle monsters by answering your cards — earn XP, coins and gems, and complete daily quests.

## Run it

Requires [Node.js](https://nodejs.org).

```bash
node server.js
```

Open http://localhost:5173 (designed for a phone-sized screen, ~400 px wide — use your browser's device toolbar on desktop).

It is a plain static site, so it also works on GitHub Pages or any static host. An internet connection is needed for the fonts and the libraries that read Anki files (JSZip, sql.js, fzstd, loaded from CDNs).

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
