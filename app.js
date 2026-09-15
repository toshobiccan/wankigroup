// ================= PLAYER STATE =================
const XP_PER_LEVEL = 1000;
const STORAGE_KEY = "cardslayer-player";

const defaultPlayer = {
  name: "Adventurer",
  level: 1,
  xp: 0,
  coins: 0,
  gems: 0,
  activeDeckId: null,
  stats: {
    hp: 100,
    attackDamage: 12,
    magicDamage: 0,
    armor: 2,
    magicResist: 2,
    attackSpeed: 10,
    luck: 0,
  },
  hp: 100, // current HP -- persists across fights, separate from the max in stats.hp
  daily: { date: "", reviewed: 0, battlesWon: 0, imported: 0, claimed: [] },
};

function loadPlayer() {
  try {
    return { ...defaultPlayer, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return { ...defaultPlayer };
  }
}

const player = loadPlayer();

function savePlayer() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(player)); } catch {}
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daily() {
  if (player.daily?.date !== today()) {
    player.daily = { date: today(), reviewed: 0, battlesWon: 0, imported: 0, claimed: [] };
  }
  return player.daily;
}

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= XP_PER_LEVEL) {
    player.xp -= XP_PER_LEVEL;
    player.level += 1;
    player.gems += 10;
  }
}

function renderHeader() {
  const fmt = (n) => n.toLocaleString("en-US");
  document.getElementById("playerName").textContent = player.name;
  document.getElementById("playerLevel").textContent = `Lv ${player.level}`;
  document.getElementById("xpText").textContent = `${player.xp} / ${XP_PER_LEVEL}`;
  document.getElementById("xpFill").style.width = `${(player.xp / XP_PER_LEVEL) * 100}%`;
  document.getElementById("coins").textContent = fmt(player.coins);
  document.getElementById("gems").textContent = fmt(player.gems);
}

// ================= HELPERS =================
const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child != null) node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

function showModal(...content) {
  const card = $("#modalCard");
  card.replaceChildren(...content);
  $("#modal").hidden = false;
}

function closeModal() {
  $("#modal").hidden = true;
}

// ================= NAVIGATION =================
const renderers = {};

function go(view) {
  const previousView = document.querySelector(".view.is-active")?.dataset.view;
  if (previousView === "world" && previousView !== view) worldScene?.pause();

  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.target === view));
  $(".views").scrollTop = 0;
  renderers[view]?.();

  if (view === "world") worldScene?.resume();
}

document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.target)));

// ================= IMPORT =================
const dropzone = $("#dropzone");
const fileInput = $("#fileInput");

["dragenter", "dragover"].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-over");
  })
);
["dragleave", "drop"].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-over");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) importFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) importFile(fileInput.files[0]);
  fileInput.value = "";
});

async function importFile(file) {
  const title = $("#dropTitle");
  const hint = $("#dropHint");
  if (!/\.(apkg|colpkg)$/i.test(file.name)) {
    hint.textContent = "Please choose an .apkg file exported from Anki";
    return;
  }

  dropzone.classList.add("is-busy");
  title.textContent = `Reading ${file.name}…`;
  try {
    const { name, cards } = await AnkiImport.parse(file);
    const deckId = `deck-${Date.now()}`;
    const now = Date.now();
    await DB.addDeck(
      { id: deckId, name, cardCount: cards.length, importedAt: now },
      cards.map((c, i) => ({
        id: `${deckId}-${i}`,
        deckId,
        front: c.front,
        back: c.back,
        due: 0,
        interval: 0,
        ease: 2.5,
        reps: 0,
      }))
    );

    const xp = Math.min(500, 50 + cards.length);
    const coins = 100;
    gainXp(xp);
    player.coins += coins;
    daily().imported += 1;
    savePlayer();
    renderHeader();

    showModal(
      el("h3", {}, "Deck Imported!"),
      el("p", {}, `“${name}” — ${cards.length} cards are ready for battle.`),
      el("div", { class: "reward" }, el("span", {}, `+${xp} XP`), el("span", {}, `+${coins} 🪙`)),
      el(
        "div",
        { class: "modal-actions" },
        el("button", { class: "btn-small btn-ghost", onclick: closeModal }, "Later"),
        el("button", { class: "btn-small", onclick: () => { closeModal(); startBattle(deckId); } }, "⚔️ Start Battle")
      )
    );
  } catch (err) {
    console.error(err);
    showModal(
      el("h3", {}, "Import failed"),
      el("p", {}, err.message || "Something went wrong reading this file."),
      el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "OK"))
    );
  } finally {
    dropzone.classList.remove("is-busy");
    title.textContent = "Drag and drop your Anki deck here";
    hint.textContent = "Supports .apkg files from Anki";
  }
}

// ================= HOME (deck list) =================
renderers.home = async () => {
  const root = $("#deckList");
  const decks = await DB.listDecks();
  if (!decks.length) {
    root.replaceChildren(
      el("div", { class: "panel empty-state" },
        "No decks yet.",
        el("br"),
        el("button", { class: "btn-small", onclick: () => go("import") }, "Import your first deck")
      )
    );
    return;
  }
  const now = Date.now();
  const rows = await Promise.all(
    decks.map(async (d) => {
      const cards = await DB.cardsForDeck(d.id);
      const due = cards.filter((c) => c.due <= now).length;
      const learned = cards.filter((c) => c.reps > 0).length;
      return el("div", { class: "panel deck-card" },
        el("div", { class: "deck-icon" }, d.name.trim()[0]?.toUpperCase() || "A"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards · ${learned} learned · ${due} due`)
        ),
        el("button", { class: "btn-small", onclick: () => startBattle(d.id) }, "⚔️")
      );
    })
  );
  root.replaceChildren(...rows);
};

// ================= QUESTS =================
const QUESTS = [
  { id: "review20", title: "Review 20 cards", goal: 20, key: "reviewed", reward: { coins: 150, xp: 100 } },
  { id: "win1", title: "Win a battle", goal: 1, key: "battlesWon", reward: { coins: 100, gems: 5 } },
  { id: "import1", title: "Import a deck", goal: 1, key: "imported", reward: { coins: 50, xp: 50 } },
];

renderers.quests = () => {
  const d = daily();
  const rows = QUESTS.map((q) => {
    const progress = Math.min(d[q.key], q.goal);
    const claimed = d.claimed.includes(q.id);
    const ready = progress >= q.goal && !claimed;
    const rewardText = Object.entries(q.reward)
      .map(([k, v]) => `+${v} ${{ coins: "🪙", gems: "💎", xp: "XP" }[k]}`)
      .join("  ");
    return el("div", { class: "panel deck-card" },
      el("div", { class: "deck-icon" }, claimed ? "✓" : "!"),
      el("div", { class: "deck-meta" },
        el("div", { class: "deck-name" }, q.title),
        el("div", { class: "deck-sub" }, `${progress} / ${q.goal} · ${rewardText}`),
        el("div", { class: "quest-bar" }, el("div", { style: `width:${(progress / q.goal) * 100}%` }))
      ),
      el("button", {
        class: `btn-small ${ready ? "" : "btn-ghost"}`,
        onclick: () => {
          if (!ready) return;
          d.claimed.push(q.id);
          player.coins += q.reward.coins || 0;
          player.gems += q.reward.gems || 0;
          gainXp(q.reward.xp || 0);
          savePlayer();
          renderHeader();
          renderers.quests();
        },
      }, claimed ? "Done" : "Claim")
    );
  });
  $("#questList").replaceChildren(...rows);
};

// ================= BATTLE =================
const MONSTERS = [
  { name: "Forgetful Goblin", icon: "👺" },
  { name: "Cram Wraith", icon: "👻" },
  { name: "Procrastination Wolf", icon: "🐺" },
  { name: "Syllabus Spider", icon: "🕷️" },
  { name: "Exam Dragon", icon: "🐉" },
];
const SESSION_SIZE = 10;
const MAX_HEARTS = 3;
let battle = null;

renderers.battle = async () => {
  if (battle) return renderBattle();
  const decks = await DB.listDecks();
  const root = $("#battleRoot");
  if (!decks.length) {
    root.replaceChildren(
      el("div", { class: "panel empty-state" },
        "Import a deck to find monsters to fight.",
        el("br"),
        el("button", { class: "btn-small", onclick: () => go("import") }, "Import Deck")
      )
    );
    return;
  }
  root.replaceChildren(
    ...decks.map((d) =>
      el("div", { class: "panel deck-card" },
        el("div", { class: "deck-icon" }, "⚔️"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards`)
        ),
        el("button", { class: "btn-small", onclick: () => startBattle(d.id) }, "Fight")
      )
    )
  );
};

async function startBattle(deckId) {
  const cards = await DB.cardsForDeck(deckId);
  const now = Date.now();
  const due = cards.filter((c) => c.reps > 0 && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = cards.filter((c) => c.reps === 0);
  const queue = [...due, ...fresh].slice(0, SESSION_SIZE);
  // Nothing due: practise the cards whose review is closest anyway.
  if (!queue.length) queue.push(...cards.sort((a, b) => a.due - b.due).slice(0, SESSION_SIZE));

  battle = {
    deckId,
    queue,
    total: queue.length,
    defeated: 0,
    hearts: MAX_HEARTS,
    revealed: false,
    monster: MONSTERS[Math.floor(Math.random() * MONSTERS.length)],
  };
  go("battle");
}

function renderBattle() {
  const root = $("#battleRoot");
  const card = battle.queue[0];
  const hpPct = ((battle.total - battle.defeated) / battle.total) * 100;

  const arena = el("div", { class: "panel arena" },
    el("div", { class: "monster-row" },
      el("div", { class: "monster", id: "monster" }, battle.monster.icon),
      el("div", { style: "flex:1" },
        el("div", { class: "hp-label" },
          el("strong", { style: "color:#fff" }, battle.monster.name),
          el("span", {}, `${battle.total - battle.defeated} / ${battle.total} HP`)
        ),
        el("div", { class: "hp" }, el("div", { style: `width:${hpPct}%` })),
        el("div", { class: "hearts" }, "❤️".repeat(battle.hearts) + "🖤".repeat(MAX_HEARTS - battle.hearts))
      )
    ),
    el("div", { class: "flashcard", style: "white-space:pre-line" },
      card.front,
      battle.revealed ? el("div", { class: "answer" }, card.back || "—") : null
    ),
    battle.revealed
      ? el("div", { class: "answer-actions" },
          ...[
            ["again", "Again", "miss"],
            ["hard", "Hard", "7 dmg"],
            ["good", "Good", "10 dmg"],
            ["easy", "Easy", "crit!"],
          ].map(([grade, label, sub]) =>
            el("button", { class: `a-${grade}`, onclick: () => answer(grade) }, label, el("small", {}, sub))
          )
        )
      : el("button", { class: "btn-primary reveal-btn", onclick: () => { battle.revealed = true; renderBattle(); } }, "Show Answer"),
    el("div", { style: "text-align:center;margin-top:12px" },
      el("button", { class: "btn-small btn-ghost", onclick: () => { battle = null; renderers.battle(); } }, "Flee")
    )
  );
  root.replaceChildren(arena);
}

function schedule(card, grade) {
  const DAY = 86_400_000;
  card.reps += 1;
  if (grade === "again") {
    card.interval = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.due = Date.now() + 60_000;
  } else {
    if (grade === "hard") {
      card.interval = Math.max(1, card.interval * 1.2);
      card.ease = Math.max(1.3, card.ease - 0.15);
    } else if (grade === "good") {
      card.interval = card.interval ? card.interval * card.ease : 1;
    } else {
      card.interval = card.interval ? card.interval * card.ease * 1.3 : 4;
      card.ease += 0.15;
    }
    card.due = Date.now() + card.interval * DAY;
  }
  return DB.putCard(card);
}

function floatText(text, target, color) {
  const rect = target.getBoundingClientRect();
  const appRect = $(".app").getBoundingClientRect();
  const node = el("div", {
    class: "float-dmg",
    style: `left:${rect.left - appRect.left + rect.width / 2 - 20}px;top:${rect.top - appRect.top}px;color:${color}`,
  }, text);
  $(".app").append(node);
  setTimeout(() => node.remove(), 900);
}

async function answer(grade) {
  const card = battle.queue.shift();
  await schedule(card, grade);
  daily().reviewed += 1;

  const monster = $("#monster");
  if (grade === "again") {
    battle.hearts -= 1;
    battle.queue.push(card);
    floatText("-1 ❤️", monster, "#ff6b6b");
    $(".arena").classList.add("hero-hurt");
  } else {
    battle.defeated += 1;
    player.coins += grade === "easy" ? 3 : 1;
    monster.classList.add("hit");
    floatText({ hard: "-7", good: "-10", easy: "CRIT!" }[grade], monster, "#ffd166");
  }
  savePlayer();
  renderHeader();

  await new Promise((r) => setTimeout(r, 380));
  battle.revealed = false;

  if (battle.defeated >= battle.total) return endBattle(true);
  if (battle.hearts <= 0) return endBattle(false);
  renderBattle();
}

function endBattle(won) {
  const { total, defeated, monster } = battle;
  battle = null;
  const xp = won ? total * 15 : defeated * 5;
  const coins = won ? total * 10 : 0;
  gainXp(xp);
  player.coins += coins;
  if (won) daily().battlesWon += 1;
  savePlayer();
  renderHeader();
  renderers.battle();

  showModal(
    el("div", { style: "font-size:48px" }, won ? "🏆" : "💀"),
    el("h3", {}, won ? "Victory!" : "Defeated…"),
    el("p", {}, won ? `You vanquished the ${monster.name}.` : `The ${monster.name} got the better of you. Study and return!`),
    el("div", { class: "reward" }, el("span", {}, `+${xp} XP`), coins ? el("span", {}, `+${coins} 🪙`) : null),
    el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "Continue"))
  );
}

// ================= WORLD =================
let worldScene = null;

function renderMobInfoPanel(mob) {
  const panel = $("#mobInfoPanel");
  if (!mob) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  panel.replaceChildren(
    el("div", { class: "mob-info-head" },
      el("img", { class: "mob-info-portrait", src: mob.portrait, alt: "" }),
      el("div", { class: "mob-info-text" },
        el("div", { class: "mob-info-name" }, mob.name, el("span", { class: "tag" }, `Lv ${mob.level}`)),
        el("div", { class: "mob-info-hp" }, `${mob.cardsRemaining} / ${mob.cardsToKill} HP`)
      )
    )
  );
  panel.hidden = false;
}

renderers.world = async () => {
  if (worldScene) return;
  worldScene = new window.Cardslayer.WorldScene({
    mountElement: $("#worldRoot"),
    onMobSelected: renderMobInfoPanel,
  });
  await worldScene.loadZone("data/zones/plains.json");
};

// ================= SCENE PLAY =================
const OWL_LINES = ["Hoo! Ready to study?", "Drop a deck here!", "Knowledge is power!", "Hoo-hoo! 📚", "Let's beat some cards!"];
let owlLine = 0;
let bubbleTimer;

function owlSay(text) {
  const bubble = $("#owlBubble");
  bubble.textContent = text;
  bubble.classList.add("is-showing");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove("is-showing"), 2200);
}

document.querySelectorAll("[data-poke]").forEach((node) => {
  node.addEventListener("click", () => {
    // Restart the poke animation even if it is already running.
    node.classList.remove("is-poked");
    void node.offsetWidth;
    node.classList.add("is-poked");
    // Hand back to the idle animation once the longest poke animation (0.7s) is done.
    clearTimeout(node.pokeTimer);
    node.pokeTimer = setTimeout(() => node.classList.remove("is-poked"), 750);
    if (node.dataset.poke === "owl") owlSay(OWL_LINES[owlLine++ % OWL_LINES.length]);
  });
});

// The owl greets you shortly after the import screen opens.
setTimeout(() => {
  if ($('[data-view="import"]').classList.contains("is-active")) owlSay(OWL_LINES[owlLine++]);
}, 1200);

// ================= BOOT =================
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
daily();
renderHeader();
