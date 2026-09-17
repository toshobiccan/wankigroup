// Parses Anki .apkg / .colpkg files in the browser.
// An .apkg is a zip holding a SQLite collection: "collection.anki21b" (zstd-compressed, Anki 2.1.50+),
// "collection.anki21" or the legacy "collection.anki2".
const AnkiImport = (() => {
  // Bundled locally (see vendor/README.md) so importing works offline and inside the packaged apps.
  const LIBS = {
    jszip: "vendor/jszip.min.js",
    sqljs: "vendor/sql-wasm.js",
    sqlwasm: "vendor/sql-wasm.wasm",
    fzstd: "vendor/fzstd.umd.js",
  };

  const loaded = {};
  function loadScript(src) {
    loaded[src] ??= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  let sqlPromise;
  async function getSql() {
    await loadScript(LIBS.sqljs);
    sqlPromise ??= initSqlJs({ locateFile: () => LIBS.sqlwasm });
    return sqlPromise;
  }

  // Anki fields are HTML. Convert to plain text with line breaks; drop media references.
  function htmlToText(html) {
    const withBreaks = html
      .replace(/\[sound:[^\]]*\]/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li)>/gi, "\n");
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  const CLOZE = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/gs;

  function noteToCard(fields) {
    const first = fields[0] || "";
    if (/\{\{c\d+::/.test(first)) {
      return {
        front: htmlToText(first.replace(CLOZE, (_, _ans, hint) => `[${hint || "..."}]`)),
        back: htmlToText(first.replace(CLOZE, "$1")) + (fields[1] ? "\n\n" + htmlToText(fields[1]) : ""),
      };
    }
    return { front: htmlToText(first), back: htmlToText(fields.slice(1).filter(Boolean).join("\n\n")) };
  }

  function deckNames(db) {
    const names = {};
    try {
      // Schema 18+ (anki21b)
      const res = db.exec("SELECT id, name FROM decks");
      for (const [id, name] of res[0]?.values || []) names[id] = String(name).replaceAll("\x1f", "::");
    } catch {
      // Legacy schema: decks stored as JSON in col
      const res = db.exec("SELECT decks FROM col");
      const json = JSON.parse(res[0].values[0][0]);
      for (const d of Object.values(json)) names[d.id] = d.name;
    }
    return names;
  }

  async function parse(file) {
    await loadScript(LIBS.jszip);
    const zip = await JSZip.loadAsync(file);

    let bytes;
    if (zip.file("collection.anki21b")) {
      await loadScript(LIBS.fzstd);
      bytes = fzstd.decompress(await zip.file("collection.anki21b").async("uint8array"));
    } else if (zip.file("collection.anki21")) {
      bytes = await zip.file("collection.anki21").async("uint8array");
    } else if (zip.file("collection.anki2")) {
      bytes = await zip.file("collection.anki2").async("uint8array");
    } else {
      throw new Error("This file doesn't look like an Anki deck.");
    }

    const SQL = await getSql();
    const db = new SQL.Database(bytes);
    try {
      const names = deckNames(db);
      const res = db.exec(
        "SELECT n.id, n.flds, MIN(c.did) FROM notes n JOIN cards c ON c.nid = n.id GROUP BY n.id ORDER BY n.id"
      );
      const rows = res[0]?.values || [];

      const deckCounts = {};
      const cards = [];
      for (const [nid, flds, did] of rows) {
        const card = noteToCard(String(flds).split("\x1f"));
        if (!card.front) continue;
        // Legacy exports from new Anki contain a single "please update" placeholder note.
        if (/please update to the latest anki/i.test(card.front)) continue;
        deckCounts[did] = (deckCounts[did] || 0) + 1;
        cards.push({ noteId: nid, ...card });
      }
      if (!cards.length) throw new Error("No cards found in this deck.");

      const mainDeckId = Object.entries(deckCounts).sort((a, b) => b[1] - a[1])[0][0];
      const fallback = file.name.replace(/\.(apkg|colpkg)$/i, "");
      const name = names[mainDeckId] && names[mainDeckId] !== "Default" ? names[mainDeckId] : fallback;
      return { name, cards };
    } finally {
      db.close();
    }
  }

  return { parse };
})();
