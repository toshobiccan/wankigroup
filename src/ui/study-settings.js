// Player-facing controls over src/game/srs.js's scheduler -- how many cards
// show up per day, how they're ordered, and how often a card comes back --
// plus the Anki-style "Deck Options" screen: per-deck overrides of the same
// settings, alongside a live breakdown of that deck's cards (new/learning/
// review/mature, seen/unseen, how many are queued up right now).
// Same load/save/form pattern as src/ui/control-settings.js.
import {
  loadStudySettings, saveStudySettings, hasDeckOverride, resetDeckSettings, deckStats,
} from "../game/srs.js";

const RETENTION_PRESETS = [
  { value: 0.95, label: "Often", hint: "Shorter gaps, more repetition" },
  { value: 0.9, label: "Normal", hint: "Anki's own default" },
  { value: 0.8, label: "Less often", hint: "Longer gaps between reviews" },
];

// deckId omitted -> edits the shared default (from Settings > Study).
// deckId given -> edits that deck's own override, starting from whatever it's
// currently following (its override, or the shared default), with a way to
// drop back to following the default again. onChange fires after every save
// or reset, with the field widgets already rebuilt from the new settings --
// a caller showing something derived from settings (e.g. deckOptionsForm's
// stats) just needs to react, never rebuild this form itself.
export function studySettingsForm(deckId, { onChange } = {}) {
  const container = document.createElement("div");

  function render() {
    container.replaceChildren(buildForm());
  }

  function buildForm() {
    const form = document.createElement("div");
    form.className = "controls-settings study-settings";
    const p = loadStudySettings(deckId);

    const intro = document.createElement("p");
    intro.textContent = "Controls how your decks are scheduled -- new cards, due reviews, and how they're mixed.";
    form.append(intro);

    if (deckId) {
      const overrideRow = document.createElement("p");
      overrideRow.className = "study-override-row";
      const note = document.createElement("span");
      const usesOverride = hasDeckOverride(deckId);
      note.textContent = usesOverride ? "Custom settings for this deck." : "Following the shared default.";
      overrideRow.append(note);
      if (usesOverride) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "btn-small btn-ghost";
        reset.textContent = "Use default instead";
        reset.onclick = () => {
          resetDeckSettings(deckId);
          render();
          onChange?.();
        };
        overrideRow.append(reset);
      }
      form.append(overrideRow);
    }

    const save = (patch) => {
      Object.assign(p, patch);
      saveStudySettings(p, deckId);
      render();
      onChange?.();
    };

  form.append(numberField("New cards per day", p.newPerDay, (value) => save({ newPerDay: value })));
  form.append(numberField("Reviews per day", p.reviewsPerDay, (value) => save({ reviewsPerDay: value })));

  const orderLabel = document.createElement("p");
  orderLabel.textContent = "Card order";
  form.append(orderLabel);
  const orderGroup = document.createElement("div");
  orderGroup.className = "control-options";
  for (const [order, title] of [["due", "Due first"], ["random", "Shuffle"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-small btn-ghost";
    button.textContent = title;
    button.setAttribute("aria-pressed", String(p.order === order));
    button.onclick = () => save({ order }); // triggers render(), which rebuilds this group from the new p.order
    orderGroup.append(button);
  }
  form.append(orderGroup);

  const retentionLabel = document.createElement("p");
  retentionLabel.textContent = "How often cards come back";
  form.append(retentionLabel);
  const retentionGroup = document.createElement("div");
  retentionGroup.className = "control-options";
  for (const preset of RETENTION_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-small btn-ghost";
    button.textContent = preset.label;
    button.title = preset.hint;
    button.setAttribute("aria-pressed", String(Math.abs(p.requestRetention - preset.value) < 0.001));
    button.onclick = () => save({ requestRetention: preset.value });
    retentionGroup.append(button);
  }
  form.append(retentionGroup);

  const tip = document.createElement("p");
  tip.textContent = "New, Learning, Review and Mature are shown on each card during a fight so you always know how well you know it.";
  form.append(tip);

    return form;
  }

  render();
  return container;
}

function numberField(labelText, value, onChange) {
  const label = document.createElement("label");
  label.textContent = labelText + " ";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "9999";
  input.value = String(value);
  input.className = "text-input study-number-input";
  input.addEventListener("change", () => {
    const parsed = Math.round(Number(input.value));
    onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : value);
    input.value = String(Number.isFinite(parsed) ? Math.max(0, parsed) : value);
  });
  label.append(input);
  return label;
}

function statTile(label, value) {
  const tile = document.createElement("div");
  tile.className = "deck-stat-tile";
  const v = document.createElement("div");
  v.className = "deck-stat-value";
  v.textContent = String(value);
  const l = document.createElement("div");
  l.className = "deck-stat-label";
  l.textContent = label;
  tile.append(v, l);
  return tile;
}

// deck: { id, name, ... } (a DB.listDecks() row). cards: DB.cardsForDeck(deck.id)'s result.
// The whole "Deck Options" screen: live stats for this deck, then its
// (possibly-overridden) scheduling settings.
export function deckOptionsForm(deck, cards) {
  const root = document.createElement("div");
  root.className = "deck-options";

  const statsGrid = document.createElement("div");
  statsGrid.className = "deck-stats-grid";
  root.append(statsGrid);

  function renderStats() {
    const settings = loadStudySettings(deck.id);
    const stats = deckStats(cards, settings, Date.now());
    statsGrid.replaceChildren(
      statTile("New", stats.new),
      statTile("Learning", stats.learning),
      statTile("Review", stats.review),
      statTile("Mature", stats.mature),
      statTile("Seen", stats.seen),
      statTile("Unseen", stats.unseen),
      statTile("Ready now", stats.newDueToday + stats.learningDueNow + stats.reviewsDueToday),
      statTile("Total", stats.total),
    );
  }
  renderStats();

  // A setting change can shift "Ready now" (the caps) -- keep the numbers honest.
  root.append(studySettingsForm(deck.id, { onChange: renderStats }));

  return root;
}
