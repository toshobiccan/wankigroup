// Tiny IndexedDB wrapper for decks and cards (decks can be far too big for localStorage).
const DB = (() => {
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("cardslayer", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("decks")) db.createObjectStore("decks", { keyPath: "id" });
        if (!db.objectStoreNames.contains("cards")) {
          const cards = db.createObjectStore("cards", { keyPath: "id" });
          cards.createIndex("deckId", "deckId");
        }
        // Card front/back can reference an image by filename (see anki-import.js);
        // the Blob for it lives here, keyed by deck so a deck delete can sweep its media.
        if (!db.objectStoreNames.contains("media")) {
          const media = db.createObjectStore("media", { keyPath: "key" }); // key: `${deckId}::${filename}`
          media.createIndex("deckId", "deckId");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    // media: optional Map<filename, Blob> (or plain object), as returned by
    // AnkiImport.parse(). Stored under this deck's id so deleteDeck can sweep it.
    async addDeck(deck, cards, media) {
      const db = await open();
      const tx = db.transaction(["decks", "cards", "media"], "readwrite");
      tx.objectStore("decks").put(deck);
      const cardStore = tx.objectStore("cards");
      for (const card of cards) cardStore.put(card);
      if (media) {
        const mediaStore = tx.objectStore("media");
        for (const [filename, blob] of media instanceof Map ? media : Object.entries(media)) {
          mediaStore.put({ key: `${deck.id}::${filename}`, deckId: deck.id, filename, blob });
        }
      }
      await done(tx);
    },

    async listDecks() {
      const db = await open();
      const decks = await request(db.transaction("decks").objectStore("decks").getAll());
      return decks.sort((a, b) => b.importedAt - a.importedAt);
    },

    async cardsForDeck(deckId) {
      const db = await open();
      return request(db.transaction("cards").objectStore("cards").index("deckId").getAll(deckId));
    },

    // Map<filename, Blob> for every image referenced by this deck's cards.
    async mediaForDeck(deckId) {
      const db = await open();
      const rows = await request(db.transaction("media").objectStore("media").index("deckId").getAll(deckId));
      return new Map(rows.map((row) => [row.filename, row.blob]));
    },

    async putCard(card) {
      const db = await open();
      const tx = db.transaction("cards", "readwrite");
      tx.objectStore("cards").put(card);
      await done(tx);
    },

    async deleteDeck(deckId) {
      const db = await open();
      const [cards, media] = await Promise.all([this.cardsForDeck(deckId), this.mediaForDeck(deckId)]);
      const tx = db.transaction(["decks", "cards", "media"], "readwrite");
      tx.objectStore("decks").delete(deckId);
      const cardStore = tx.objectStore("cards");
      for (const c of cards) cardStore.delete(c.id);
      const mediaStore = tx.objectStore("media");
      for (const filename of media.keys()) mediaStore.delete(`${deckId}::${filename}`);
      await done(tx);
    },
  };
})();
