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
  // Held-but-not-equipped items. equipables: Item[] (see src/items.js, kind
  // "equipable"). materials: { item, quantity }[] -- quantity has no upper
  // bound, materials stack infinitely in theory. No item has been created
  // yet (no drop system exists), so both start empty for every player.
  inventory: { equipables: [], materials: [] },
  // The visible starter kit proves every rig mount in the live game. These
  // item ids remain stable when a later equip screen swaps in real loot.
  equipment: {
    helmet: { id: "starter-scout-helmet", name: "Scout Helmet" },
    cape: { id: "starter-traveler-cape", name: "Traveler Cape" },
    chestplate: { id: "starter-leather-chest", name: "Leather Tunic" },
    leggings: { id: "starter-traveler-leggings", name: "Traveler Leggings" },
    boots: { id: "starter-traveler-boots", name: "Traveler Boots" },
    weapon: { id: "oak-practice-sword", name: "Oak Practice Sword" },
    book: { id: "beginner-spellbook", name: "Beginner Spellbook" },
  },
  starterKitGranted: true,
  // The Inventory screen's Status tab: one selected class, one active buff
  // (both null until classes/buffs exist -- see src/items.js's createClass/createBuff).
  status: { selectedClass: null, activeBuff: null },
  daily: { date: "", reviewed: 0, battlesWon: 0, imported: 0, claimed: [] },
};

function loadPlayer() {
  // structuredClone, not a shallow spread of defaultPlayer itself -- otherwise every
  // first-run player's player.stats/player.inventory would be the *same* nested
  // object as defaultPlayer's, and the first push into inventory.materials would
  // silently mutate the shared default for every other player in this session too.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const defaults = structuredClone(defaultPlayer);
    return {
      ...defaults,
      ...saved,
      stats: { ...defaults.stats, ...(saved?.stats ?? {}) },
      inventory: { ...defaults.inventory, ...(saved?.inventory ?? {}) },
      equipment: saved?.starterKitGranted ? { ...defaults.equipment, ...(saved?.equipment ?? {}) } : defaults.equipment,
      status: { ...defaults.status, ...(saved?.status ?? {}) },
      daily: { ...defaults.daily, ...(saved?.daily ?? {}) },
    };
  } catch {
    return structuredClone(defaultPlayer);
  }
}

const player = loadPlayer();

function savePlayer() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(player)); } catch {}
}

// Persist the starter-kit migration before the player can leave or refresh.
savePlayer();

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

// ================= INVENTORY =================
// Plain-English explanation (shown in color) plus the exact formula (shown
// greyed out) for each stat, taken straight from src/world/combat.js's real
// math -- kept here as copy, not re-derived, so a stat's tooltip can never
// drift from what the game actually does with it.
const STAT_INFO = [
  { key: "hp", label: "HP", plain: "How much damage you can take before you're defeated.",
    math: "Current / max HP. Reaching 0 during a fight ends it in defeat." },
  { key: "attackDamage", label: "Attack Damage", plain: "How hard your physical hits land.",
    math: "dmg = round(max(1, attackDamage − target's armor) × grade × crit). Grade: Hard ×0.7, Good ×1.0, Easy ×1.5." },
  { key: "magicDamage", label: "Magic Damage", plain: "How hard your magic hits land, on top of physical damage.",
    math: "dmg = round(max(1, magicDamage − target's magicResist) × grade × crit). 0 today, so this adds nothing yet." },
  { key: "armor", label: "Armor", plain: "Reduces the physical damage you take.",
    math: "incoming physical dmg = max(1, attacker's attackDamage − armor). At least 1 always gets through." },
  { key: "magicResist", label: "Magic Resist", plain: "Reduces the magic damage you take.",
    math: "incoming magic dmg = max(1, attacker's magicDamage − magicResist). At least 1 always gets through if any magic damage lands." },
  { key: "attackSpeed", label: "Attack Speed", plain: "Decides who swings first each round.",
    math: "Higher attackSpeed swings first (ties favor you). A lethal first hit skips the other side's swing entirely." },
  { key: "luck", label: "Luck", plain: "Raises your crit chance and how much gold you earn from victories.",
    math: "Crit chance = min(50%, luck × 1%); crits deal ×1.5 damage. Coin reward × (1 + min(100%, luck × 2%))." },
];

const INVENTORY_TABS = [
  { key: "equipables", label: "Equip" },
  { key: "materials", label: "Materials" },
  { key: "status", label: "Status" },
];

let inventoryView = "character"; // "character" | "stats" -- what the left panel currently shows
let inventoryTab = "equipables"; // which of the three lists the right panel currently shows
const expandedStats = new Set(); // stat keys whose grey math line is currently shown
const CHARACTER_GEAR_SLOTS = [
  { key: "cape", label: "Cape" },
  { key: "weapon", label: "Weapon" },
  { key: "book", label: "Book" },
];

function renderInventoryLeft() {
  const root = $("#inventoryLeft");
  if (inventoryView === "stats") {
    const rows = STAT_INFO.map((stat) => {
      const expanded = expandedStats.has(stat.key);
      return el("div", {
        class: "stat-row",
        onclick: () => {
          if (expanded) expandedStats.delete(stat.key);
          else expandedStats.add(stat.key);
          renderInventoryLeft();
        },
      },
        el("div", { class: "stat-row-head" },
          el("span", { class: "stat-name" }, stat.label),
          el("span", { class: "stat-value" }, String(player.stats[stat.key]))
        ),
        el("div", { class: "stat-plain" }, stat.plain),
        expanded ? el("div", { class: "stat-math" }, stat.math) : null
      );
    });
    root.replaceChildren(
      el("div", { class: "inventory-stats" },
        el("button", { class: "btn-small btn-ghost stats-back", onclick: () => { inventoryView = "character"; renderInventoryLeft(); } }, "‹ Back"),
        el("div", { class: "stat-list" }, ...rows)
      )
    );
    return;
  }
  const gearSlots = CHARACTER_GEAR_SLOTS.map(({ key, label }) =>
    el("div", { class: "equipment-slot" },
      el("span", { class: "equipment-slot-label" }, label),
      el("span", { class: "equipment-slot-value" }, player.equipment[key]?.name ?? "Empty")
    )
  );
  root.replaceChildren(
    el("div", { class: "inventory-character" },
      el("img", { class: "inventory-portrait", src: "assets/world-character.png", alt: "" }),
      el("div", { class: "inventory-name" }, player.name),
      el("div", { class: "inventory-level" }, `Lv ${player.level}`),
      el("div", { class: "equipment-slots", "aria-label": "Equipped gear" }, ...gearSlots),
      el("button", { class: "btn-small", onclick: () => { inventoryView = "stats"; renderInventoryLeft(); } }, "Stats")
    )
  );
}

function renderInventoryTabs() {
  const root = $("#inventoryTabs");
  root.replaceChildren(
    ...INVENTORY_TABS.map((tab) =>
      el("button", {
        class: `inventory-tab-btn${tab.key === inventoryTab ? " is-active" : ""}`,
        onclick: () => { inventoryTab = tab.key; renderInventoryTabs(); renderInventoryList(); },
      }, tab.label)
    )
  );
}

// One held item row: optional picture thumbnail, name + optional
// description, optional stack-count badge for materials. item is a plain
// Item object (see src/items.js) -- picture/description render only when
// present, since no real item exists yet to supply either.
function renderItemRow(item, quantity) {
  return el("div", { class: "panel inventory-item" },
    item.picture ? el("img", { class: "inventory-item-pic", src: item.picture, alt: "" }) : null,
    el("div", { class: "inventory-item-info" },
      el("div", { class: "inventory-item-name" }, item.name),
      item.description ? el("div", { class: "inventory-item-desc" }, item.description) : null
    ),
    quantity != null ? el("div", { class: "inventory-item-qty" }, `×${quantity}`) : null
  );
}

// The Status tab isn't a list -- it's exactly two fixed slots (per spec:
// "status is selected class and active buff"), each either empty or
// holding one Item (kind "class"/"buff").
function renderStatusTab(root) {
  const rows = [
    { label: "Class", value: player.status.selectedClass, emptyText: "No class selected yet." },
    { label: "Active Buff", value: player.status.activeBuff, emptyText: "No buff active yet." },
  ].map(({ label, value, emptyText }) =>
    el("div", { class: "panel inventory-item status-row" },
      value?.picture ? el("img", { class: "inventory-item-pic", src: value.picture, alt: "" }) : null,
      el("div", { class: "inventory-item-info" },
        el("div", { class: "inventory-item-name" }, label),
        el("div", { class: "inventory-item-desc" }, value ? value.name : emptyText)
      )
    )
  );
  root.replaceChildren(...rows);
}

function renderInventoryList() {
  const root = $("#inventoryList");
  if (inventoryTab === "status") {
    renderStatusTab(root);
    return;
  }
  const entries = player.inventory[inventoryTab]; // equipables: Item[]; materials: {item, quantity}[]
  if (!entries.length) {
    const emptyText = inventoryTab === "equipables" ? "Nothing to equip yet." : "No materials yet.";
    root.replaceChildren(el("div", { class: "panel empty-state" }, emptyText));
    return;
  }
  root.replaceChildren(
    ...entries.map((entry) =>
      inventoryTab === "materials" ? renderItemRow(entry.item, entry.quantity) : renderItemRow(entry, null)
    )
  );
}

renderers.inventory = () => {
  renderInventoryLeft();
  renderInventoryTabs();
  renderInventoryList();
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
let gradeInFlight = false; // true while a single handleGrade() call is resolving -- blocks double-taps on the grade buttons

// Shared recovery path for handleCombatStart/handleGrade: any thrown/rejected
// error inside either leaves worldScene.inCombat latched true with no other
// way out (no Flee button, by design), so any failure bails all the way out
// to Idle using the same three-call pattern already used for a real loss.
function bailOutOfFight(err) {
  console.error(err);
  fight = null;
  encounterPanel.hide();
  worldScene.endCombat({ mobDefeated: false });
}

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
  try {
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
  } catch (err) {
    bailOutOfFight(err);
  }
}

async function handleGrade(grade) {
  if (!fight || gradeInFlight) return;
  gradeInFlight = true;
  try {
    const card = fight.queue.shift();
    await schedule(card, grade);
    daily().reviewed += 1;

    if (grade === "again") {
      savePlayer(); // schedule() already persisted the card itself via DB.putCard; this covers the daily().reviewed quest counter
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
      { attacker: "mob", damage: result.mobDamageDealt, isCrit: result.mobIsCrit },
    ];
    if (result.order === "mob") hits.reverse();
    await worldScene.playHit(hits.filter((hit) => hit.damage > 0));
    // Skip restore() on a fight-ending result -- the victory/defeat paths below
    // call hide() a couple statements later, and restore() then hide() back to
    // back would fire two competing CSS height transitions for nothing visible.
    if (!result.mobDefeated && !result.playerDefeated) encounterPanel.restore();

    if (result.mobDefeated) {
      const mob = fight.mob;
      worldScene.endCombat({ mobDefeated: true });
      encounterPanel.hide();
      fight = null;
      const coinReward = window.Cardslayer.applyLuckDropBonus(mob.coinReward, player.stats.luck);
      gainXp(mob.xpReward);
      player.coins += coinReward;
      daily().battlesWon += 1;
      savePlayer();
      renderHeader();
      showModal(
        el("div", { style: "font-size:48px" }, "🏆"),
        el("h3", {}, "Victory!"),
        el("p", {}, `You vanquished the ${mob.name}.`),
        el("div", { class: "reward" }, el("span", {}, `+${mob.xpReward} XP`), el("span", {}, `+${coinReward} 🪙`)),
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

    // The active deck's card queue is consumed one card per non-"again" grade
    // (buildFightQueue() hands back the whole active deck once); combat keeps
    // going until the mob or the player drops, not until cards run out, so an
    // empty queue here just means the deck is small -- recycle it from the same
    // active deck rather than crashing on fight.queue[0] === undefined below.
    if (!fight.queue.length) {
      const cards = await DB.cardsForDeck(player.activeDeckId);
      fight.queue = buildFightQueue(cards);
    }
    encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
  } catch (err) {
    bailOutOfFight(err);
  } finally {
    gradeInFlight = false;
  }
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
    onFight: () => worldScene.engageSelectedMob(),
    onFlee: () => worldScene.deselectMob(),
  });
  worldScene = new window.Cardslayer.WorldScene({
    mountElement: $("#worldRoot"),
    onMobSelected: handleMobSelected,
    onCombatStart: handleCombatStart,
    playerAppearance: player.equipment,
  });
  await worldScene.loadZone("data/zones/plains1.json");
};

// ================= BOOT =================
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
daily();
renderHeader();
