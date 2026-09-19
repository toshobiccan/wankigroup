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

  // Anki fields are HTML. Convert to a list of { t: "text", v } / { t: "img", v: filename }
  // parts -- plain text with line breaks preserved, images kept as a reference to a
  // filename resolved against the deck's media map, everything else (styling,
  // sound refs, other tags) dropped. Never HTML string output: the renderer
  // (src/world/encounter-panel.js) builds these into DOM nodes directly, so no
  // imported field content is ever parsed as, or inserted as, HTML/innerHTML.
  const IMG_SENTINEL_PREFIX = "IMG:";
  const IMG_SENTINEL_SUFFIX = "";

  function htmlToParts(html) {
    const withPlaceholders = html
      .replace(/\[sound:[^\]]*\]/g, "")
      .replace(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (_, src) => `${IMG_SENTINEL_PREFIX}${src}${IMG_SENTINEL_SUFFIX}`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li)>/gi, "\n");
    const doc = new DOMParser().parseFromString(withPlaceholders, "text/html");
    const text = (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

    const parts = [];
    const sentinel = new RegExp(`${IMG_SENTINEL_PREFIX}(.*?)${IMG_SENTINEL_SUFFIX}`, "g");
    let lastIndex = 0;
    let match;
    while ((match = sentinel.exec(text))) {
      const before = text.slice(lastIndex, match.index);
      if (before) parts.push({ t: "text", v: before });
      // Anki media filenames are URL-decoded already; strip any query/hash a
      // theme template might have appended and keep just the bare filename.
      parts.push({ t: "img", v: decodeURIComponent(match[1]).split(/[?#]/)[0] });
      lastIndex = sentinel.lastIndex;
    }
    const rest = text.slice(lastIndex);
    if (rest || !parts.length) parts.push({ t: "text", v: rest });
    return parts;
  }

  function mediaInParts(parts) {
    return parts.filter((p) => p.t === "img").map((p) => p.v);
  }

  const CLOZE = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/gs;

  function noteToCard(fields) {
    const first = fields[0] || "";
    let front, back;
    if (/\{\{c\d+::/.test(first)) {
      front = htmlToParts(first.replace(CLOZE, (_, _ans, hint) => `[${hint || "..."}]`));
      back = htmlToParts(first.replace(CLOZE, "$1") + (fields[1] ? "\n\n" + fields[1] : ""));
    } else {
      front = htmlToParts(first);
      back = htmlToParts(fields.slice(1).filter(Boolean).join("\n\n"));
    }
    return { front, back, media: [...new Set([...mediaInParts(front), ...mediaInParts(back)])] };
  }

  // True if a card has no visible content (no text, no image) -- same
  // "please update" placeholder check as before, generalized past plain text.
  function isBlankCard(card) {
    const hasText = (parts) => parts.some((p) => p.t === "text" && p.v);
    const hasImage = (parts) => parts.some((p) => p.t === "img");
    return !hasText(card.front) && !hasImage(card.front);
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
      const referencedMedia = new Set();
      for (const [nid, flds, did] of rows) {
        const card = noteToCard(String(flds).split("\x1f"));
        if (isBlankCard(card)) continue;
        // Legacy exports from new Anki contain a single "please update" placeholder note.
        if (/please update to the latest anki/i.test(textOf(card.front))) continue;
        deckCounts[did] = (deckCounts[did] || 0) + 1;
        for (const filename of card.media) referencedMedia.add(filename);
        const { media, ...cardFields } = card;
        cards.push({ noteId: nid, ...cardFields });
      }
      if (!cards.length) throw new Error("No cards found in this deck.");

      const mainDeckId = Object.entries(deckCounts).sort((a, b) => b[1] - a[1])[0][0];
      const fallback = file.name.replace(/\.(apkg|colpkg)$/i, "");
      const name = names[mainDeckId] && names[mainDeckId] !== "Default" ? names[mainDeckId] : fallback;
      const media = await extractMedia(zip, referencedMedia);
      return { name, cards, media };
    } finally {
      db.close();
    }
  }

  function textOf(parts) {
    return parts.filter((p) => p.t === "text").map((p) => p.v).join(" ");
  }

  const IMAGE_MIME_BY_EXT = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  };

  // The zip's "media" entry maps each numbered zip member ("0", "1", ...) to
  // the original filename referenced from card HTML. Only extracts files
  // actually referenced by a kept card, as Blobs -- decks are stored in
  // IndexedDB (db.js), which can hold Blobs directly, so no base64 bloat.
  // Read as raw bytes (not JSZip's own "blob" output) so the Blob gets an
  // explicit image/* type: an <img src="blob:...">'s renderer relies on that
  // type, not on sniffing, and JSZip doesn't set one on its own.
  async function extractMedia(zip, wantedFilenames) {
    const media = new Map();
    if (!wantedFilenames.size) return media;
    const manifestEntry = zip.file("media");
    if (!manifestEntry) return media;
    let manifest;
    try {
      manifest = JSON.parse(await manifestEntry.async("string"));
    } catch {
      return media;
    }
    const zipIndexByFilename = new Map(Object.entries(manifest).map(([index, filename]) => [filename, index]));
    for (const filename of wantedFilenames) {
      const zipIndex = zipIndexByFilename.get(filename);
      const entry = zipIndex !== undefined ? zip.file(zipIndex) : null;
      if (!entry) continue;
      const ext = filename.split(".").pop()?.toLowerCase();
      const type = IMAGE_MIME_BY_EXT[ext];
      if (!type) continue; // only images are rendered anywhere today; skip anything else
      const bytes = await entry.async("uint8array");
      media.set(filename, new Blob([bytes], { type }));
    }
    return media;
  }

  return { parse };
})();
