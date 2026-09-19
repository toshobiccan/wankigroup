// Our own spaced-repetition scheduler. Modeled on the same three ideas FSRS
// uses -- a per-card difficulty, a per-card stability (days until recall
// probability decays to a reference retention), and a retrievability curve
// derived from both -- but with our own formulas and constants, not FSRS's
// trained weights. Card lifecycle (new -> learning -> review, with lapses
// dropping a review card back into relearning) mirrors Anki's model so the
// study workflow feels familiar.
//
// Pure data in, pure data out -- no DOM, no storage, no randomness by default
// (a `random` hook is accepted where shuffling is needed, same convention as
// src/world/combat.js) -- so this can be unit tested directly and reused by
// both the fight queue and any future deck-browsing screen.

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export const STATUS = { NEW: "new", LEARNING: "learning", REVIEW: "review" };
export const GRADES = ["again", "hard", "good", "easy"];

// A review card at or above this stability reads as "Mature" instead of
// "Review" -- same threshold Anki uses for its own mature/young split.
export const MATURE_STABILITY_DAYS = 21;

const SETTINGS_KEY = "cardslayer-study-settings";

export const DEFAULT_STUDY_SETTINGS = {
  newPerDay: 20,
  reviewsPerDay: 200,
  // Minutes until a card graded "again"/"hard" while learning comes back.
  // Anki calls these "learning steps"; we keep exactly two, like Anki's default.
  learningStepsMinutes: [1, 10],
  // "due": due cards first, then new, in due order. "random": the day's queue is shuffled.
  order: "due",
  // Target recall probability a review interval is scheduled for. Lower = cards
  // come back sooner (more repetition); higher = longer gaps between reviews.
  requestRetention: 0.9,
};

// Stored as { default: Settings, decks: { [deckId]: Settings } } -- one shared
// default (edited from Settings > Study) plus an optional per-deck override
// (edited from that deck's own Deck Options), the same "shared preset unless
// this deck customizes it" relationship Anki's deck options have.
//
// Pure, so it's unit-testable without a real localStorage: given whatever
// JSON.parse produced (including the pre-per-deck flat-settings-object shape
// this key used to hold), always returns a well-formed store.
export function normalizeSettingsStore(raw) {
  if (raw && typeof raw === "object" && ("default" in raw || "decks" in raw)) {
    return { default: normalizeStudySettings(raw.default), decks: normalizeDeckOverrides(raw.decks) };
  }
  // Legacy shape: the whole key used to be one flat settings object (the shared default).
  return { default: normalizeStudySettings(raw), decks: {} };
}

function normalizeDeckOverrides(decks) {
  const out = {};
  if (decks && typeof decks === "object") {
    for (const [deckId, settings] of Object.entries(decks)) out[deckId] = normalizeStudySettings(settings);
  }
  return out;
}

function readSettingsStore() {
  try {
    return normalizeSettingsStore(JSON.parse(localStorage.getItem(SETTINGS_KEY)));
  } catch {
    return { default: { ...DEFAULT_STUDY_SETTINGS }, decks: {} };
  }
}

function writeSettingsStore(store) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("cardslayer-study-settings"));
}

// deckId omitted, or that deck has no override -> the shared default.
export function loadStudySettings(deckId) {
  const store = readSettingsStore();
  return (deckId && store.decks[deckId]) || store.default;
}

export function hasDeckOverride(deckId) {
  return Boolean(deckId && readSettingsStore().decks[deckId]);
}

// deckId omitted -> saves the shared default every deck without its own override follows.
export function saveStudySettings(settings, deckId) {
  const store = readSettingsStore();
  const normalized = normalizeStudySettings(settings);
  if (deckId) store.decks[deckId] = normalized;
  else store.default = normalized;
  writeSettingsStore(store);
  return normalized;
}

// Drops a deck's override so it goes back to following the shared default.
export function resetDeckSettings(deckId) {
  const store = readSettingsStore();
  if (!(deckId in store.decks)) return;
  delete store.decks[deckId];
  writeSettingsStore(store);
}

export function normalizeStudySettings(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const steps = Array.isArray(s.learningStepsMinutes) && s.learningStepsMinutes.length
    ? s.learningStepsMinutes.filter((m) => Number.isFinite(m) && m > 0)
    : DEFAULT_STUDY_SETTINGS.learningStepsMinutes;
  return {
    newPerDay: clampInt(s.newPerDay, DEFAULT_STUDY_SETTINGS.newPerDay, 0, 9999),
    reviewsPerDay: clampInt(s.reviewsPerDay, DEFAULT_STUDY_SETTINGS.reviewsPerDay, 0, 9999),
    learningStepsMinutes: steps.length ? steps : DEFAULT_STUDY_SETTINGS.learningStepsMinutes,
    order: s.order === "random" ? "random" : "due",
    requestRetention: clampNumber(s.requestRetention, DEFAULT_STUDY_SETTINGS.requestRetention, 0.7, 0.99),
  };
}

function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// "YYYY-MM-DD", matching src/game/player.js's todayKey so daily caps line up
// with the same day boundary as quests.
export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Fills in the scheduler fields on any persisted card, including a legacy
// card saved before this module existed ({ reps, interval, ease, due } only,
// from the old flat schedule() in app.js). A card already carrying `status`
// is assumed already-normalized and returned as-is.
export function normalizeCardState(card) {
  if (card.status) return card;
  const reps = card.reps ?? 0;
  return {
    ...card,
    status: reps > 0 ? STATUS.REVIEW : STATUS.NEW,
    step: 0,
    difficulty: 5,
    stability: Math.max(0, card.interval ?? 0),
    lapses: 0,
    reps,
    interval: Math.max(0, card.interval ?? 0),
    due: card.due ?? 0,
    lastReviewedAt: card.due ?? 0,
    firstSeenDate: reps > 0 ? "" : null,
    lastReviewedDate: null,
  };
}

// Never seen before, in any session -- the one thing the "New" indicator
// needs, checked before grading mutates the card.
export function isUnseen(card) {
  return normalizeCardState(card).status === STATUS.NEW;
}

// Label for the on-card status indicator.
export function cardLabel(card) {
  const c = normalizeCardState(card);
  if (c.status === STATUS.NEW) return "New";
  if (c.status === STATUS.LEARNING) return c.lapses > 0 ? "Relearning" : "Learning";
  return c.stability >= MATURE_STABILITY_DAYS ? "Mature" : "Review";
}

// Applies one grade to one card, returning the updated card (does not mutate
// the input). This is the only place that decides what "Again"/"Hard"/
// "Good"/"Easy" do to a card's schedule; combat damage is separate
// (src/game/encounter.js) and reads the same grade independently.
export function gradeCard(cardRaw, grade, { settings = DEFAULT_STUDY_SETTINGS, now = Date.now() } = {}) {
  if (!GRADES.includes(grade)) throw new Error(`invalid grade: ${grade}`);
  const card = normalizeCardState(cardRaw);
  const today = todayKey(new Date(now));
  card.lastReviewedDate = today;

  if (card.status === STATUS.NEW) card.firstSeenDate = today;

  if (card.status !== STATUS.REVIEW) return gradeLearningCard(card, grade, { settings, now });
  return gradeReviewCard(card, grade, { settings, now });
}

// New or (re)learning card. A brand-new card's first "Again" simply resets it
// to the first learning step and moves on -- no lapse, no difficulty/stability
// penalty, since nothing has been learned yet to be penalized for forgetting.
function gradeLearningCard(card, grade, { settings, now }) {
  card.status = STATUS.LEARNING;
  card.reps += 1;

  if (grade === "again") {
    card.step = 0;
    card.due = now + settings.learningStepsMinutes[0] * MINUTE_MS;
    return card;
  }
  if (grade === "hard") {
    const minutes = settings.learningStepsMinutes[card.step] ?? settings.learningStepsMinutes.at(-1);
    card.due = now + minutes * MINUTE_MS * 1.5;
    return card;
  }

  const nextStep = grade === "easy" ? settings.learningStepsMinutes.length : card.step + 1;
  if (nextStep >= settings.learningStepsMinutes.length) return graduateCard(card, grade, { now });
  card.step = nextStep;
  card.due = now + settings.learningStepsMinutes[nextStep] * MINUTE_MS;
  return card;
}

// Learning steps finished (or skipped via "easy") -- the card enters the
// review pool with a starting difficulty/stability set by how it graduated.
function graduateCard(card, grade, { now }) {
  card.status = STATUS.REVIEW;
  card.step = 0;
  card.difficulty = { hard: 7, good: 5, easy: 3 }[grade] ?? 5;
  card.stability = { hard: 1, good: 2.5, easy: 4 }[grade] ?? 2.5;
  card.interval = card.stability;
  card.due = now + card.interval * DAY_MS;
  card.lastReviewedAt = now;
  return card;
}

// Retrievability: our own exponential forgetting curve, chosen so that by
// definition R(stability) == 0.9 -- i.e. "stability" means "days until 90%
// recall odds", the same reference point FSRS's stability represents, without
// reusing FSRS's power-law formula or fitted constants.
function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(0.9, elapsedDays / stability);
}

function gradeReviewCard(card, grade, { settings, now }) {
  const elapsedDays = Math.max(1 / 1440, (now - (card.lastReviewedAt || now)) / DAY_MS); // floor: one minute
  const r = retrievability(elapsedDays, card.stability);

  if (grade === "again") {
    card.lapses += 1;
    card.difficulty = clamp(card.difficulty + 4, 1, 10);
    card.stability = Math.max(0.5, card.stability * 0.3);
    card.status = STATUS.LEARNING;
    card.step = 0;
    card.due = now + settings.learningStepsMinutes[0] * MINUTE_MS;
    card.lastReviewedAt = now;
    return card;
  }

  // The more a card was on the verge of being forgotten when it was
  // successfully recalled (low r), the more its stability grows -- the core
  // spaced-repetition principle, same one FSRS encodes, our own curve for it.
  const gradeMultiplier = { hard: 0.5, good: 1, easy: 1.4 }[grade];
  const difficultyFactor = (11 - card.difficulty) / 10;
  const growth = 1 + 1.5 * (1 - r) * gradeMultiplier * difficultyFactor;
  card.stability = Math.max(0.5, card.stability * growth);

  const difficultyDelta = { hard: 1, good: 0, easy: -1 }[grade];
  card.difficulty = clamp(card.difficulty + difficultyDelta - 0.2 * (card.difficulty - 5), 1, 10);

  card.interval = Math.max(1, card.stability * (Math.log(settings.requestRetention) / Math.log(0.9)));
  card.due = now + card.interval * DAY_MS;
  card.lastReviewedAt = now;
  return card;
}

function shuffle(list, random) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Builds today's study order for one deck, respecting the daily new/review
// caps and the shuffle setting. Caps are derived from the cards themselves
// (firstSeenDate/lastReviewedDate), not a separate counter, so they stay
// correct across separate sessions/fights on the same day with no extra
// state to keep in sync.
//
// Always returns at least one card when `cards` is non-empty (falls back to
// every card in due order), so combat never has nothing to show even once
// every cap is spent for the day -- same guarantee the old buildFightQueue had.
export function buildStudyQueue(cards, settings = DEFAULT_STUDY_SETTINGS, { now = Date.now(), random = Math.random } = {}) {
  const today = todayKey(new Date(now));
  const normalized = cards.map(normalizeCardState);

  const newIntroducedToday = normalized.filter((c) => c.firstSeenDate === today).length;
  const reviewsDoneToday = normalized.filter((c) => c.status !== STATUS.NEW && c.lastReviewedDate === today).length;

  const learning = normalized.filter((c) => c.status === STATUS.LEARNING && c.due <= now).sort((a, b) => a.due - b.due);
  const dueReview = normalized
    .filter((c) => c.status === STATUS.REVIEW && c.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, Math.max(0, settings.reviewsPerDay - reviewsDoneToday));
  const fresh = normalized.filter((c) => c.status === STATUS.NEW).slice(0, Math.max(0, settings.newPerDay - newIntroducedToday));

  let queue = [...learning, ...dueReview, ...fresh];
  if (!queue.length) queue = normalized.sort((a, b) => a.due - b.due);
  if (settings.order === "random") queue = shuffle(queue, random);
  return queue;
}

// The breakdown a Deck Options screen shows: composition (new/learning/review/
// mature, and the plain "seen at least once" vs "never seen" split) plus how
// many of each are actually queued up for a study session right now, given
// today's caps -- the same numbers buildStudyQueue's length would reflect,
// without its "always show at least one card" combat fallback, so an
// honestly-empty queue reads as 0 here rather than as "everything".
export function deckStats(cards, settings = DEFAULT_STUDY_SETTINGS, now = Date.now()) {
  const today = todayKey(new Date(now));
  const normalized = cards.map(normalizeCardState);

  const counts = { new: 0, learning: 0, review: 0, mature: 0 };
  for (const c of normalized) {
    if (c.status === STATUS.NEW) counts.new += 1;
    else if (c.status === STATUS.LEARNING) counts.learning += 1;
    else if (c.stability >= MATURE_STABILITY_DAYS) counts.mature += 1;
    else counts.review += 1;
  }

  const newIntroducedToday = normalized.filter((c) => c.firstSeenDate === today).length;
  const reviewsDoneToday = normalized.filter((c) => c.status !== STATUS.NEW && c.lastReviewedDate === today).length;
  const dueReviewCount = normalized.filter((c) => c.status === STATUS.REVIEW && c.due <= now).length;
  const dueLearningCount = normalized.filter((c) => c.status === STATUS.LEARNING && c.due <= now).length;
  const newAvailableToday = Math.min(counts.new, Math.max(0, settings.newPerDay - newIntroducedToday));

  return {
    total: normalized.length,
    new: counts.new,
    learning: counts.learning,
    review: counts.review,
    mature: counts.mature,
    seen: normalized.length - counts.new,
    unseen: counts.new,
    newDueToday: newAvailableToday,
    learningDueNow: dueLearningCount,
    reviewsDueToday: Math.min(dueReviewCount, Math.max(0, settings.reviewsPerDay - reviewsDoneToday)),
  };
}
