// Tiny IndexedDB wrapper for decks and cards (decks can be far too big for localStorage).
const DB = (() => {
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("cardslayer", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("decks", { keyPath: "id" });
        const cards = db.createObjectStore("cards", { keyPath: "id" });
        cards.createIndex("deckId", "deckId");
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
    async addDeck(deck, cards) {
      const db = await open();
      const tx = db.transaction(["decks", "cards"], "readwrite");
      tx.objectStore("decks").put(deck);
      const store = tx.objectStore("cards");
      for (const card of cards) store.put(card);
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

    async putCard(card) {
      const db = await open();
      const tx = db.transaction("cards", "readwrite");
      tx.objectStore("cards").put(card);
      await done(tx);
    },

    async deleteDeck(deckId) {
      const db = await open();
      const cards = await this.cardsForDeck(deckId);
      const tx = db.transaction(["decks", "cards"], "readwrite");
      tx.objectStore("decks").delete(deckId);
      const store = tx.objectStore("cards");
      for (const c of cards) store.delete(c.id);
      await done(tx);
    },
  };
})();
