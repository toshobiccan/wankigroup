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
        el("button", {
          class: "btn-small",
          onclick: () => { closeModal(); player.activeDeckId = deckId; savePlayer(); go("world"); },
        }, "⚔️ Fight With This Deck")
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
      const isActive = player.activeDeckId === d.id;
      return el("div", { class: `panel deck-card${isActive ? " is-active-deck" : ""}` },
        el("div", { class: "deck-icon" }, d.name.trim()[0]?.toUpperCase() || "A"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name, isActive ? el("span", { class: "tag" }, "Active") : null),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards · ${learned} learned · ${due} due`)
        ),
        el("button", {
          class: `btn-small${isActive ? " btn-ghost" : ""}`,
          onclick: () => { player.activeDeckId = d.id; savePlayer(); renderers.home(); },
        }, isActive ? "Active ✓" : "Set Active")
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

// ================= SCHEDULING =================
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

// ================= WORLD / COMBAT =================
let worldScene = null;
let encounterPanel = null;
let fight = null; // { mob, queue } while a fight is in progress; null otherwise

function buildFightQueue(deckCards) {
  const now = Date.now();
  const due = deckCards.filter((c) => c.reps > 0 && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = deckCards.filter((c) => c.reps === 0);
  const queue = [...due, ...fresh];
  if (!queue.length) queue.push(...deckCards.sort((a, b) => a.due - b.due));
  return queue;
}

function playerHpState() {
  return { hp: player.hp, maxHp: player.stats.hp };
}

function handleMobSelected(mob) {
  if (!mob) {
    encounterPanel.hide();
    return;
  }
  encounterPanel.showPeek(mob);
}

async function handleCombatStart(mobData) {
  if (!player.activeDeckId) {
    // Bail out of the engaged state entirely (not just skip the fight) --
    // otherwise WorldScene stays latched in inCombat/_approaching and every
    // later click on this mob or the ground is silently swallowed, since
    // both _onMobClick and _setTargetFromPointer early-return while either
    // flag is set. endCombat({mobDefeated:false}) is the same recovery path
    // already used for an actual combat loss below.
    worldScene.endCombat({ mobDefeated: false });
    encounterPanel.showMessage({
      text: "Pick an active deck on Home first.",
      actionLabel: "Go to Home",
      onAction: () => go("home"),
    });
    return;
  }
  const cards = await DB.cardsForDeck(player.activeDeckId);
  if (!cards.length) {
    worldScene.endCombat({ mobDefeated: false });
    encounterPanel.showMessage({ text: "This deck has no cards - import more or pick another." });
    return;
  }
  fight = { mob: mobData, queue: buildFightQueue(cards) };
  encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
}

async function handleGrade(grade) {
  const card = fight.queue.shift();
  await schedule(card, grade);
  daily().reviewed += 1;

  if (grade === "again") {
    fight.queue.push(card);
    encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
    return;
  }

  const result = window.Cardslayer.resolveRound({ player, mob: fight.mob, grade });
  player.hp = result.playerHp;
  fight.mob.hp = result.mobHp;
  savePlayer();

  encounterPanel.retract();
  const hits = [
    { attacker: "player", damage: result.playerDamageDealt, isCrit: result.isCrit },
    { attacker: "mob", damage: result.mobDamageDealt },
  ];
  if (result.order === "mob") hits.reverse();
  await worldScene.playHit(hits.filter((hit) => hit.damage > 0));
  encounterPanel.restore();

  if (result.mobDefeated) {
    const mob = fight.mob;
    worldScene.endCombat({ mobDefeated: true });
    encounterPanel.hide();
    fight = null;
    gainXp(mob.xpReward);
    player.coins += mob.coinReward;
    daily().battlesWon += 1;
    savePlayer();
    renderHeader();
    showModal(
      el("div", { style: "font-size:48px" }, "🏆"),
      el("h3", {}, "Victory!"),
      el("p", {}, `You vanquished the ${mob.name}.`),
      el("div", { class: "reward" }, el("span", {}, `+${mob.xpReward} XP`), el("span", {}, `+${mob.coinReward} 🪙`)),
      el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "Continue"))
    );
    return;
  }

  if (result.playerDefeated) {
    fight = null;
    encounterPanel.hide();
    worldScene.endCombat({ mobDefeated: false });
    await playerDefeatAndRespawn();
    return;
  }

  encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
}

async function playerDefeatAndRespawn() {
  const fade = $("#defeatFade");
  fade.hidden = false;
  await new Promise((r) => setTimeout(r, 20));
  fade.classList.add("is-visible");
  await new Promise((r) => setTimeout(r, 500));

  player.hp = player.stats.hp;
  savePlayer();
  renderHeader();
  worldScene.respawnPlayer();

  await new Promise((r) => setTimeout(r, 200));
  fade.classList.remove("is-visible");
  await new Promise((r) => setTimeout(r, 500));
  fade.hidden = true;
}

renderers.world = async () => {
  if (worldScene) {
    // Re-entering World from another tab: the encounter sheet is a plain
    // absolute-positioned overlay (see .encounter-sheet in style.css), so it
    // does not get reset just because this view was hidden -- a message left
    // over from a previous handleCombatStart bail-out (e.g. "Pick an active
    // deck") would otherwise keep covering the mobs, unclickable, forever.
    // Only clear it when no fight is actually in progress.
    if (!fight) encounterPanel.hide();
    return;
  }
  encounterPanel = new window.Cardslayer.EncounterPanel({
    mountElement: $("#encounterPanelRoot"),
    onGrade: handleGrade,
  });
  worldScene = new window.Cardslayer.WorldScene({
    mountElement: $("#worldRoot"),
    onMobSelected: handleMobSelected,
    onCombatStart: handleCombatStart,
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
