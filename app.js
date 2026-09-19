// ================= PLAYER STATE =================
// The session (src/net/session.js) owns the player: localStorage in local
// mode, the game server in online mode. `player` below is only the latest copy
// to render -- never change it directly; ask the session instead
// (session.importedDeck, session.claimQuest, session.grade, ...), which applies
// the shared rules in src/game/ and hands back the updated player.
let session = null;
let player = null;

// Which imported deck fights draw cards from. Decks live only on this device
// (IndexedDB), so this is a per-device setting, not part of the synced player.
const DEVICE_KEY = "cardslayer-device";
const device = loadDevice();

function loadDevice() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(DEVICE_KEY)) ?? {};
  } catch {}
  if (saved.activeDeckId === undefined) {
    // Before sessions existed, the active deck was stored inside the player save.
    try {
      saved.activeDeckId = JSON.parse(localStorage.getItem("cardslayer-player"))?.activeDeckId ?? null;
    } catch {
      saved.activeDeckId = null;
    }
  }
  return saved;
}

function setActiveDeck(deckId) {
  device.activeDeckId = deckId;
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  } catch {}
}

function xpPerLevel() {
  return window.Cardslayer?.game?.XP_PER_LEVEL ?? 1000;
}

function renderHeader() {
  if (!player) return;
  const XP_PER_LEVEL = xpPerLevel();
  const fmt = (n) => n.toLocaleString("en-US");
  document.getElementById("playerName").textContent = player.name;
  document.getElementById("playerLevel").textContent = `Lv ${player.level}`;
  document.getElementById("xpText").textContent = `${player.xp} / ${XP_PER_LEVEL}`;
  document.getElementById("xpFill").style.width = `${(player.xp / XP_PER_LEVEL) * 100}%`;
  document.getElementById("worldLevel").textContent = `Lv ${player.level}`;
  document.getElementById("worldXp").max = XP_PER_LEVEL;
  document.getElementById("worldXp").value = player.xp;
  document.getElementById("worldXpText").textContent = `${player.xp} / ${XP_PER_LEVEL} XP`;
  document.getElementById("coins").textContent = fmt(player.coins);
  document.getElementById("gems").textContent = fmt(player.gems);
  const avatarKey = JSON.stringify(player.character);
  if (avatarKey !== lastAvatarKey && window.Cardslayer?.renderCharacterAvatar) {
    lastAvatarKey = avatarKey;
    window.Cardslayer.renderCharacterAvatar($("#characterAvatar"), player.character).catch(() => { lastAvatarKey = null; });
  }
}

let lastAvatarKey = null;

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

// A locked modal (signing in, "playing elsewhere") can't be dismissed by
// clicking the backdrop.
let modalLocked = false;

function lockModal() {
  modalLocked = true;
}

function unlockModal() {
  modalLocked = false;
}

function closeModal() {
  $("#modal").hidden = true;
  modalLocked = false;
}

// ================= NAVIGATION =================
const renderers = {};
let wardrobeDispose = null;
let wardrobeReturn = "home";

function go(view) {
  if (view === "import") { go("home"); $("#importDrawer").open = true; $("#importDrawer").scrollIntoView({block:"nearest"}); return; }
  if (player && !player.characterCreated && view !== "wardrobe") { openWardrobe(); return; }
  const previousView = document.querySelector(".view.is-active")?.dataset.view;
  if (previousView === "wardrobe") { wardrobeDispose?.(); wardrobeDispose = null; }
  document.body.classList.toggle("creating-character", view === "wardrobe" && !player?.characterCreated);
  document.body.classList.toggle("world-open", view === "world");
  document.body.classList.toggle("map-open", view === "map");
  if (previousView === "world" && previousView !== view) worldScene?.pause();

  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.target === view));
  $(".views").scrollTop = 0;
  renderers[view]?.();

  if (view === "world") worldScene?.resume();
}

document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.target)));
document.getElementById('homeWorldBtn').addEventListener('click',()=>go('world'));
document.getElementById('browseDecksBtn').addEventListener('click',browsePremadeDecks);
document.getElementById('tutorialBtn').addEventListener('click',()=>startTutorial(true));
document.getElementById('homeQuestsBtn').addEventListener('click',()=>go('quests'));
document.getElementById('mapReturnBtn').addEventListener('click',()=>go('world'));
let mapLoadRequest=0;
renderers.map=async()=>{
  const request=++mapLoadRequest,root=$('#worldMap'),detail=$('#mapDetails');
  detail.textContent='Unrolling the map…';
  try {
    const zones=await window.Cardslayer.loadWorldMap();
    if(request!==mapLoadRequest)return;
    const currentId=worldScene?.pageId??window.Cardslayer.game.START_ZONE_ID;
    const regions=window.Cardslayer.worldRegions(zones);
    const currentRegion=regions.find(region=>region.rooms.some(room=>room.id===currentId));
    const showWorld=()=>{
      window.Cardslayer.renderWorldMap(root,regions,{currentId:currentRegion?.id,onSelect:showRegion});
      detail.replaceChildren(el('strong',{},'Regions'),el('p',{},'Select a region to explore its rooms.'));
    };
    const showRegion=region=>{
      const choose=node=>{
        window.Cardslayer.renderWorldMap(root,region.rooms,{title:region.displayName,currentId,selectedId:node.id,onSelect:choose});
        const exits=node.exits?Object.values(node.exits).map(e=>e.roomId):[node.links?.prev,node.links?.next].filter(Boolean);
        const paths=exits.map(id=>zones.find(zone=>zone.id===id)?.displayName??id);
        detail.replaceChildren(el('button',{class:'btn-small',onclick:showWorld},'All regions'),el('strong',{},node.displayName??node.id),el('p',{},node.id===currentId?'You are here.':region.displayName),el('p',{},paths.length?'Paths: '+paths.join(' · '):'No connected paths.'),el('p',{},node.role==='boss'?'Region boss':node.blank?'This room is still being built.':(node.mobs?.length??0)+' encounters'));
      };
      choose(region.rooms.find(room=>room.id===currentId)??region.rooms[0]);
    };
    if(zones.length)showWorld();
    else {root.replaceChildren();detail.textContent='No rooms have been installed yet.';}
  }catch(error){if(request!==mapLoadRequest)return;root.replaceChildren();detail.textContent=error.message;}
};

function openWardrobe() {
  if (!session || !player || session.needsLogin) return;
  if (worldScene?.inCombat) {
    showModal(el("h3", {}, "Finish your battle first"), el("p", {}, "Your wardrobe will be waiting."), el("button", { class: "btn-small", onclick: closeModal }, "OK"));
    return;
  }
  const view = document.querySelector(".view.is-active")?.dataset.view;
  if (view && view !== "wardrobe") wardrobeReturn = player.characterCreated ? view : "home";
  go("wardrobe");
}

renderers.wardrobe = () => {
  wardrobeDispose?.();
  wardrobeDispose = window.Cardslayer.mountCharacterCreator($("#wardrobeRoot"), {
    appearance: player.character, firstTime: !player.characterCreated,
    onSave: appearance => session.customizeCharacter(appearance),
    onSaved: () => go(wardrobeReturn),
    onCancel: () => go(wardrobeReturn),
  });
};

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
  if (!session || session.needsLogin) {
    hint.textContent = "Sign in first, then import your deck";
    return;
  }
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

    // The deck is already saved on this device; the reward goes through the
    // session (the server, when online) and is capped per day.
    let rewardLine;
    try {
      const { reward, rewarded } = await session.importedDeck(cards.length);
      rewardLine = rewarded
        ? el("div", { class: "reward" }, el("span", {}, `+${reward.xp} XP`), el("span", {}, `+${reward.coins} 🪙`))
        : el("p", {}, "No reward this time -- you've hit today's import reward limit.");
    } catch (err) {
      console.error("import reward failed", err);
      rewardLine = el("p", {}, "Your deck is saved, but the reward couldn't be collected (no connection).");
    }

    showModal(
      el("h3", {}, "Deck Imported!"),
      el("p", {}, `“${name}” — ${cards.length} cards are ready for battle.`),
      rewardLine,
      el(
        "div",
        { class: "modal-actions" },
        el("button", { class: "btn-small btn-ghost", onclick: closeModal }, "Later"),
        el("button", {
          class: "btn-small",
          onclick: () => { closeModal(); setActiveDeck(deckId); go("world"); },
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
        el("button", { class: "btn-small", onclick: () => go("import") }, "Import your first deck"), el("p",{},"Or start with a short capital-cities deck below.")
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
      const isActive = device.activeDeckId === d.id;
      return el("div", { class: `panel deck-card${isActive ? " is-active-deck" : ""}` },
        el("div", { class: "deck-icon" }, d.name.trim()[0]?.toUpperCase() || "A"),
        el("div", { class: "deck-meta" },
          el("div", { class: "deck-name" }, d.name, isActive ? el("span", { class: "tag" }, "Active") : null),
          el("div", { class: "deck-sub" }, `${d.cardCount} cards · ${learned} learned · ${due} due`)
        ),
        el("button", {
          class: `btn-small${isActive ? " btn-ghost" : ""}`,
          onclick: () => { setActiveDeck(d.id); renderers.home(); },
        }, isActive ? "Active ✓" : "Set Active")
      );
    })
  );
  root.replaceChildren(...rows);
};

// ================= QUESTS =================
renderers.quests = () => {
  if (!player) return;
  const rows = window.Cardslayer.game.questView(player).map((q) => {
    const rewardText = Object.entries(q.reward)
      .map(([k, v]) => `+${v} ${{ coins: "🪙", gems: "💎", xp: "XP" }[k]}`)
      .join("  ");
    return el("div", { class: "panel deck-card" },
      el("div", { class: "deck-icon" }, q.claimed ? "✓" : "!"),
      el("div", { class: "deck-meta" },
        el("div", { class: "deck-name" }, q.title),
        el("div", { class: "deck-sub" }, `${q.progress} / ${q.goal} · ${rewardText}`),
        el("div", { class: "quest-bar" }, el("div", { style: `width:${(q.progress / q.goal) * 100}%` }))
      ),
      el("button", {
        class: `btn-small ${q.ready ? "" : "btn-ghost"}`,
        onclick: async (event) => {
          if (!q.ready) return;
          event.currentTarget.disabled = true;
          try {
            await session.claimQuest(q.id); // the "player" event re-renders header and this list
          } catch (err) {
            console.error("claiming quest failed", err);
            renderers.quests();
          }
        },
      }, q.claimed ? "Done" : "Claim")
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
  { key: "helmet", label: "Helmet" },
  { key: "armor", label: "Armor" },
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
      el("canvas", { class: "inventory-portrait", id:"inventoryAvatar", width:"256", height:"256", "aria-label":"Your character" }),
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
let selectedItemId = null;
function showItemDetails(item) {
  selectedItemId = item.id;
  document.querySelectorAll('.inventory-item').forEach(row => row.classList.toggle('is-selected', row.dataset.itemId === item.id));
  const equipped = player.equipment[item.slot]?.id === item.id;
  const stats = Object.entries(item.stats ?? {}).filter(([,value])=>Number.isFinite(value));
  $('#itemDetails').replaceChildren(el('span',{class:'eyebrow'},item.slot ?? 'Material'),el('h3',{},item.name),el('p',{},item.description || 'An item for your adventures.'),stats.length ? el('p',{class:'item-stats'},stats.map(([key,value])=>`${key}: ${value > 0 ? '+' : ''}${value}`).join(' · ')) : null,item.kind==='equipable' && session?.mode==='local' ? el('button',{class:'btn-small',...(equipped?{disabled:''}:{}),onclick:()=>{session.equipItem(item.id);showItemDetails(item);}},equipped?'Equipped':'Equip item') : null);
}
function renderItemRow(item, quantity) {
  const equipped = player.equipment[item.slot]?.id === item.id;
  return el('button', {type:'button',class:'inventory-item'+(selectedItemId===item.id?' is-selected':''),'data-item-id':item.id,onclick:()=>showItemDetails(item)},
    item.picture ? el('img',{class:'inventory-item-pic',src:item.picture,alt:''}) : el('span',{class:'inventory-item-pic item-monogram','aria-hidden':'true'},(item.name||'?').slice(0,1)),
    el('span',{class:'inventory-item-info'},el('strong',{class:'inventory-item-name'},item.name),el('span',{class:'inventory-item-desc'},item.slot ?? 'Crafting material')),
    quantity != null ? el('span',{class:'inventory-item-qty'},`×${quantity}`) : el('span',{class:'item-state'},equipped?'Equipped':'›'));
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
  $("#itemDetails").replaceChildren(el("p",{},"Select an item to inspect it."));
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
  if (!player) return;
  renderInventoryLeft();
  renderInventoryTabs();
  renderInventoryList();
  const portrait = $("#inventoryAvatar");
  if (portrait) window.Cardslayer.renderCharacterAvatar(portrait, player.character);
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
// Card scheduling stays on this device (decks never leave it); everything else
// about a fight -- damage, mob HP, rewards, defeat -- is decided by the session's
// Room (src/game/room.js), locally or on the server.
let worldScene = null;
let encounterPanel = null;
let fight = null; // { mob, queue, endedWithRewards? } while a fight is in progress; null otherwise
let gradeInFlight = false; // true while a single handleGrade() call is resolving -- blocks double-taps on the grade buttons
const roomPeople = new Set(); // ids of the other players in our current room (for the badge)
let currentRoomId = null;

let deckProgressRequest = 0;
async function renderWorldDeckProgress() {
  const request = ++deckProgressRequest;
  const deckId = device.activeDeckId;
  try {
    const [decks, cards] = await Promise.all([DB.listDecks(), deckId ? DB.cardsForDeck(deckId) : Promise.resolve([])]);
    if (request !== deckProgressRequest || deckId !== device.activeDeckId) return;
    const deck = decks.find((entry) => entry.id === deckId);
    const name = $("#worldDeckName");
    name.textContent = deck?.name ?? "No active deck";
    name.title = name.textContent;
    // A card is complete for now only after a successful grade, until due again.
    // 'Again' leaves interval at zero and must remain in the unfinished count.
    const now = Date.now();
    const done = cards.filter((card) => card.reps > 0 && card.interval > 0 && card.due > now).length;
    $("#worldDeckCounts").textContent = deck ? `${done} done · ${cards.length - done} left` : "Choose a deck on Home";
    $("#worldDeckCounts").title = "Cards currently reviewed; new, due and retry cards remain unfinished.";
    $("#worldDeckPercent").textContent = deck && cards.length ? `${Math.round(done / cards.length * 100)}%` : "—";
  } catch (error) {
    if (request !== deckProgressRequest) return;
    $("#worldDeckName").textContent = "Deck unavailable";
    $("#worldDeckCounts").textContent = "Reopen World to retry";
    $("#worldDeckPercent").textContent = "—";
    console.error("Deck progress unavailable", error);
  }
}

const FIGHT_ERRORS = {
  mob_gone: "Too late -- that monster is already down.",
  too_far: "Get a little closer first.",
  already_fighting: "You're already in a fight.",
  offline: "No connection to the server right now.",
  timeout: "The server didn't answer. Try again.",
};

// Shared recovery path for handleCombatStart/handleGrade: any thrown/rejected
// error inside either leaves worldScene.inCombat latched true with no other
// way out (no Flee button, by design), so any failure bails all the way out
// to Idle using the same three-call pattern already used for a real loss.
function bailOutOfFight(err) {
  console.error(err);
  fight = null;
  encounterPanel.hide();
  worldScene.endCombat({ mobDefeated: false });
  session.flee().catch(() => {});
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
    if (!device.activeDeckId) {
      // Bail out of the engaged state entirely (not just skip the fight) --
      // otherwise WorldScene stays latched in inCombat/_approaching and every
      // later click on this mob or the ground is silently swallowed.
      worldScene.endCombat({ mobDefeated: false });
      encounterPanel.showMessage({
        text: "Pick an active deck on Home first.",
        actionLabel: "Go to Home",
        onAction: () => go("home"),
      });
      return;
    }
    const cards = await DB.cardsForDeck(device.activeDeckId);
    if (!cards.length) {
      worldScene.endCombat({ mobDefeated: false });
      encounterPanel.showMessage({ text: "This deck has no cards - import more or pick another." });
      return;
    }
    try {
      await session.engage(mobData.id);
    } catch (err) {
      worldScene.endCombat({ mobDefeated: false });
      encounterPanel.showMessage({ text: FIGHT_ERRORS[err.code] ?? "Couldn't start that fight." });
      return;
    }
    fight = { mob: mobData, queue: buildFightQueue(cards) };
    encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
  } catch (err) {
    bailOutOfFight(err);
  }
}

// Someone else landed the killing blow on the mob we were fighting. We still
// get the reward (the room already gave it); just end our side of the fight.
function handleCombatEnded({ mobId, rewards }) {
  if (!fight || fight.mob.id !== mobId) return;
  if (gradeInFlight) {
    fight.endedWithRewards = rewards; // handleGrade finishes its animation first, then wraps up
    return;
  }
  finishWithVictory(rewards);
}

function finishWithVictory(rewards) {
  const mob = fight.mob;
  worldScene.endCombat({ mobDefeated: true });
  encounterPanel.hide();
  fight = null;
  showModal(
    el("div", { style: "font-size:48px" }, "🏆"),
    el("h3", {}, "Victory!"),
    el("p", {}, `You vanquished the ${mob.name}.`),
    el("div", { class: "reward" }, el("span", {}, `+${rewards?.xp ?? 0} XP`), el("span", {}, `+${rewards?.coins ?? 0} 🪙`)),
    el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "Continue"))
  );
}

async function handleGrade(grade) {
  if (!fight || gradeInFlight) return;
  gradeInFlight = true;
  try {
    const card = fight.queue.shift();
    await schedule(card, grade);
    void renderWorldDeckProgress();
    const result = await session.grade(grade);
    if (!fight) return;
    if (fight.endedWithRewards) return finishWithVictory(fight.endedWithRewards);

    if (result.again) {
      fight.queue.push(card);
      encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
      return;
    }

    worldScene.setMobHp(fight.mob.id, result.mobHp);
    encounterPanel.retract();
    await worldScene.playHit(result.hits);
    // Skip restore() on a fight-ending result -- the victory/defeat paths below
    // call hide() a couple statements later, and restore() then hide() back to
    // back would fire two competing CSS height transitions for nothing visible.
    const fightOver = result.mobDefeated || result.playerDefeated || fight.endedWithRewards;
    if (!fightOver) encounterPanel.restore();

    if (result.mobDefeated) return finishWithVictory(result.rewards);
    if (fight.endedWithRewards) return finishWithVictory(fight.endedWithRewards);

    if (result.playerDefeated) {
      fight = null;
      encounterPanel.hide();
      worldScene.endCombat({ mobDefeated: false });
      await playerDefeatAndRespawn();
      return;
    }

    // The deck's queue is consumed one card per non-"again" grade; combat keeps
    // going until the mob or the player drops, so recycle a small deck.
    if (!fight.queue.length) {
      const cards = await DB.cardsForDeck(device.activeDeckId);
      fight.queue = buildFightQueue(cards);
    }
    encounterPanel.showCard(fight.queue[0], fight.mob, playerHpState());
  } catch (err) {
    if (fight?.endedWithRewards) return finishWithVictory(fight.endedWithRewards);
    bailOutOfFight(err);
  } finally {
    gradeInFlight = false;
  }
}

// The room already restored HP and moved us to spawn; this is the visual half.
async function playerDefeatAndRespawn() {
  const fade = $("#defeatFade");
  fade.hidden = false;
  await new Promise((r) => setTimeout(r, 20));
  fade.classList.add("is-visible");
  await new Promise((r) => setTimeout(r, 500));

  worldScene.respawnPlayer();

  await new Promise((r) => setTimeout(r, 200));
  fade.classList.remove("is-visible");
  await new Promise((r) => setTimeout(r, 500));
  fade.hidden = true;
}

// WorldScene finished loading a page: join that page's room and show who and
// what is already there.
async function enterPage(pageId, position) {
  if (fight) {
    fight = null;
    encounterPanel.hide();
  }
  try {
    const snapshot = await session.joinZone(pageId, position);
    if (worldScene.pageId !== pageId) return; // already walked on to another page
    applyRoom(snapshot);
  } catch (err) {
    console.error("joining the room failed", err);
    currentRoomId = null;
    updateNetBadge();
  }
}

function applyRoom(snapshot) {
  worldScene.applyRoomSnapshot(snapshot);
  currentRoomId = snapshot.roomId;
  roomPeople.clear();
  for (const other of snapshot.players) roomPeople.add(other.id);
  updateNetBadge();
}

renderers.world = async () => {
  if (!session || !player) return;
  void renderWorldDeckProgress();
  if (worldScene) {
    // Re-entering World from another tab: the encounter sheet is a plain
    // absolute-positioned overlay (see .encounter-sheet in style.css), so it
    // does not get reset just because this view was hidden -- only clear it
    // when no fight is actually in progress.
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
    onPageEnter: enterPage,
    onMoveIntent: (position) => session.moveTo(position),
    onChatSend: async (text) => {
      try {
        await session.sendChat(text);
      } catch (err) {
        console.error("chat failed", err);
      }
    },
    playerAppearance: player.equipment,
    characterAppearance: player.character,
  });
  await worldScene.loadZone(`data/zones/${window.Cardslayer.game.START_ZONE_ID}.json`);
  worldScene.setOwnPlayerId(session.playerId);
  worldScene.setOwnProfile({ name: player?.name, role: session.account?.role ?? "guest" });
};

// ================= SESSION & ACCOUNT =================
function wireSessionEvents() {
  session.on("player", (updated) => {
    player = updated;
    worldScene?.setOwnProfile({ name: updated.name });
    worldScene?.setPlayerAppearance(updated.equipment);
    worldScene?.setCharacterAppearance(updated.character);
    renderHeader();
    const view = document.querySelector(".view.is-active")?.dataset.view;
    if (view === "quests") renderers.quests();
    if (view === "inventory") renderers.inventory();
  });

  session.on("playerJoined", ({ player: other }) => {
    worldScene?.upsertRemotePlayer(other, { snap: true });
    roomPeople.add(other.id);
    updateNetBadge();
  });
  session.on("playerLeft", ({ id }) => {
    worldScene?.removeRemotePlayer(id);
    roomPeople.delete(id);
    updateNetBadge();
  });
  session.on("playerMoved", (other) => worldScene?.upsertRemotePlayer(other, { snap: Boolean(other.snap) }));
  session.on("playerUpdated", (profile) => worldScene?.updateRemotePlayerProfile(profile));
  session.on("mob", (state) => worldScene?.applyMobState(state));
  session.on("mobHit", (hit) => worldScene?.showMobHit(hit));
  session.on("combatEnded", handleCombatEnded);
  session.on("chat", (msg) => worldScene?.showChatMessage(msg));

  session.on("connection", updateNetBadge);
  session.on("rejoined", (snapshot) => {
    // The server lost track of any fight while we were disconnected.
    if (fight) {
      fight = null;
      encounterPanel.hide();
      worldScene.endCombat({ mobDefeated: false });
    }
    if (worldScene && snapshot.zoneId === worldScene.pageId) applyRoom(snapshot);
  });
  session.on("kicked", () => {
    lockModal();
    showModal(
      el("h3", {}, "Playing somewhere else"),
      el("p", {}, "This account just signed in on another tab or device."),
      el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: () => location.reload() }, "Play here instead"))
    );
  });
  session.on("account", (account) => {
    worldScene?.setOwnPlayerId(session.playerId);
    worldScene?.setOwnProfile({ role: account?.role ?? "guest" });
    if (!account && session.mode === "online") showLoginModal();
  });
}

const AUTH_ERRORS = {
  name_length: "Names are 2-20 characters.",
  name_characters: "Use letters, numbers, spaces, - or _.",
  username_format: "Usernames are 3-20 characters: a-z, 0-9 or _.",
  password_too_short: "Passwords need at least 8 characters.",
  password_too_long: "That password is too long.",
  username_taken: "That username is taken.",
  invalid_credentials: "Wrong username or password.",
  already_registered: "This account already has a login.",
  too_many_requests: "Too many attempts -- wait a minute and try again.",
  offline: "Can't reach the server.",
};

function authErrorText(err) {
  return AUTH_ERRORS[err.code] ?? "Something went wrong. Try again.";
}

function input(attrs) {
  return el("input", { class: "text-input", ...attrs });
}

// A small form inside the modal: fields, one submit button, an error line.
function authForm({ title, intro, fields, submitLabel, onSubmit, footer }) {
  const error = el("p", { class: "form-error", role: "alert" });
  const submit = el("button", { class: "btn-small", type: "submit" }, submitLabel);
  const form = el("form", { class: "auth-form" }, ...fields, error, el("div", { class: "modal-actions" }, submit));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    try {
      await onSubmit();
    } catch (err) {
      error.textContent = authErrorText(err);
      submit.disabled = false;
    }
  });
  showModal(el("h3", {}, title), intro ? el("p", {}, intro) : null, form, footer ?? null);
  fields[0]?.focus();
}

async function afterSignIn() {
  player = session.player;
  renderHeader();
  unlockModal();
  closeModal();
  updateNetBadge();
  if (worldScene?.pageId) enterPage(worldScene.pageId, worldScene._positionFrac());
  if (!player.characterCreated || new URLSearchParams(location.search).has("wardrobe")) { openWardrobe(); return; }
  const view = document.querySelector(".view.is-active")?.dataset.view;
  renderers[view]?.();
}

function showLoginModal() {
  lockModal();
  const name = input({ name: "displayName", maxlength: "20", placeholder: "Adventurer name", autocomplete: "nickname", required: "" });
  authForm({
    title: "Welcome, adventurer",
    intro: "Pick a name to start playing. You can protect your account with a password later.",
    fields: [name],
    submitLabel: "Start playing",
    onSubmit: async () => {
      await session.startAsGuest(name.value);
      await afterSignIn();
    },
    footer: el("button", { class: "link-btn", type: "button", onclick: showSignInModal }, "I already have an account"),
  });
}

function showSignInModal() {
  lockModal();
  const username = input({ name: "username", maxlength: "20", placeholder: "Username", autocomplete: "username", required: "" });
  const password = input({ name: "password", type: "password", placeholder: "Password", autocomplete: "current-password", required: "" });
  authForm({
    title: "Sign in",
    fields: [username, password],
    submitLabel: "Sign in",
    onSubmit: async () => {
      await session.login(username.value, password.value);
      await afterSignIn();
    },
    footer: el("button", { class: "link-btn", type: "button", onclick: showLoginModal }, "New here? Play as a guest"),
  });
}

function showAccountModal() {
  if (!session) return;
  if (session.mode === "local") {
    showModal(
      el("h3", {}, "Offline mode"),
      el("p", {}, "No game server here, so your progress is saved on this device only."),
      el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "OK"))
    );
    return;
  }
  if (session.needsLogin) return showLoginModal();

  const { account } = session;
  const signOut = el("button", {
    class: "btn-small btn-ghost",
    onclick: async () => {
      if (account.isGuest && !confirm("You haven't set a password, so you won't be able to get this guest account back. Sign out anyway?")) return;
      await session.logout();
      location.reload();
    },
  }, "Sign out");

  if (!account.isGuest) {
    showModal(
      el("h3", {}, account.displayName),
      el("p", {}, `Signed in as @${account.username}.`),
      el("div", { class: "modal-actions" }, signOut, el("button", { class: "btn-small", onclick: closeModal }, "Close"))
    );
    return;
  }

  const username = input({ name: "username", maxlength: "20", placeholder: "Choose a username", autocomplete: "username", required: "" });
  const password = input({ name: "password", type: "password", placeholder: "Choose a password (8+ characters)", autocomplete: "new-password", required: "" });
  authForm({
    title: account.displayName,
    intro: "You're playing as a guest. Add a username and password to keep this character and sign in on other devices.",
    fields: [username, password],
    submitLabel: "Secure my account",
    onSubmit: async () => {
      await session.register(username.value, password.value);
      showModal(
        el("h3", {}, "Account secured"),
        el("p", {}, `You can now sign in anywhere as @${session.account.username}.`),
        el("div", { class: "modal-actions" }, el("button", { class: "btn-small", onclick: closeModal }, "Nice"))
      );
    },
    footer: el("div", { class: "modal-actions" }, signOut),
  });
}

// Header dot on the settings button + the world view's room badge.
function updateNetBadge() {
  const dot = $("#netDot");
  const badge = $("#netBadge");
  if (!session) return;
  const state = session.mode === "local" ? "local" : session.connection;
  dot.dataset.state = state;
  dot.hidden = false;
  dot.title = { local: "Offline mode", open: "Online", reconnecting: "Reconnecting…", connecting: "Connecting…", closed: "Not connected" }[state] ?? state;

  if (session.mode === "local") {
    badge.textContent = "Offline mode";
  } else if (state !== "open") {
    badge.textContent = state === "reconnecting" ? "Reconnecting…" : "Not connected";
  } else {
    const count = currentRoomId ? roomPeople.size + 1 : 0;
    badge.textContent = currentRoomId ? `${currentRoomId} · ${count} ${count === 1 ? "player" : "players"}` : "Online";
  }
  badge.dataset.state = state;
  badge.hidden = false;
}

// ================= BOOT =================
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" && !modalLocked) closeModal(); });
$("#settingsBtn").addEventListener("click", showAccountModal);
$("#wardrobeBtn").addEventListener("click", openWardrobe);
$("#worldWardrobeBtn").addEventListener("click", openWardrobe);

// src/world/bootstrap.js is an ES module, so it runs after this script.
function whenModulesReady() {
  if (window.Cardslayer?.ready) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("cardslayer:ready", resolve, { once: true }));
}

async function boot() {
  await whenModulesReady();
  try {
    session = await window.Cardslayer.createSession();
  } catch (err) {
    // A server said it was online but then failed us (e.g. down mid-start):
    // keep the app usable offline rather than showing a dead screen.
    console.error("game server unavailable, starting in offline mode", err);
    session = await window.Cardslayer.createSession({ forceLocal: true });
  }
  wireSessionEvents();
  updateNetBadge();
  if (session.needsLogin) {
    showLoginModal();
    return;
  }
  player = session.player;
  renderHeader();
  if (!player.characterCreated || new URLSearchParams(location.search).has("wardrobe")) { openWardrobe(); return; }
  const view = document.querySelector(".view.is-active")?.dataset.view;
  if (view && view !== "import") renderers[view]?.();
}

boot();
