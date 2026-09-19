import { describe, it, expect } from "vitest";
import {
  STATUS,
  DEFAULT_STUDY_SETTINGS,
  normalizeCardState,
  normalizeStudySettings,
  normalizeSettingsStore,
  isUnseen,
  cardLabel,
  gradeCard,
  buildStudyQueue,
  deckStats,
} from "../src/game/srs.js";

const NOW = new Date("2026-09-20T12:00:00.000Z").getTime();
const DAY_MS = 86_400_000;
function freshCard(overrides = {}) {
  return { id: "c1", deckId: "d1", front: "Q", back: "A", ...overrides };
}

describe("normalizeCardState", () => {
  it("treats an unreviewed legacy card ({reps:0}) as New", () => {
    const state = normalizeCardState({ reps: 0, interval: 0, ease: 2.5, due: 0 });
    expect(state.status).toBe(STATUS.NEW);
  });

  it("treats a legacy card that already has reps as Review, carrying its interval into stability", () => {
    const state = normalizeCardState({ reps: 3, interval: 12, ease: 2.5, due: 123 });
    expect(state.status).toBe(STATUS.REVIEW);
    expect(state.stability).toBe(12);
  });

  it("passes through a card that already has a status untouched", () => {
    const already = { status: STATUS.LEARNING, step: 1, reps: 1, difficulty: 5, stability: 0, due: 5 };
    expect(normalizeCardState(already)).toBe(already);
  });
});

describe("isUnseen / cardLabel", () => {
  it("a brand-new card is unseen and labeled New", () => {
    const card = freshCard();
    expect(isUnseen(card)).toBe(true);
    expect(cardLabel(card)).toBe("New");
  });

  it("labels learning, review and mature correctly", () => {
    expect(cardLabel({ status: STATUS.LEARNING, lapses: 0 })).toBe("Learning");
    expect(cardLabel({ status: STATUS.LEARNING, lapses: 1 })).toBe("Relearning");
    expect(cardLabel({ status: STATUS.REVIEW, stability: 5 })).toBe("Review");
    expect(cardLabel({ status: STATUS.REVIEW, stability: 30 })).toBe("Mature");
  });
});

describe("gradeCard - new/learning lifecycle", () => {
  it("Again on a brand-new card just resets it to the first step and moves on -- no lapse recorded", () => {
    const card = gradeCard(freshCard(), "again", { now: NOW });
    expect(card.status).toBe(STATUS.LEARNING);
    expect(card.lapses).toBe(0);
    expect(card.reps).toBe(1);
    expect(card.due).toBe(NOW + 1 * 60_000);
  });

  it("is no longer unseen after any first grade, even Again", () => {
    const card = gradeCard(freshCard(), "again", { now: NOW });
    expect(isUnseen(card)).toBe(false);
  });

  it("Good steps through learning steps in order before graduating", () => {
    let card = freshCard();
    card = gradeCard(card, "good", { now: NOW }); // step 0 -> 1 (10 min step)
    expect(card.status).toBe(STATUS.LEARNING);
    expect(card.step).toBe(1);
    expect(card.due).toBe(NOW + 10 * 60_000);

    card = gradeCard(card, "good", { now: NOW + 10 * 60_000 }); // graduates
    expect(card.status).toBe(STATUS.REVIEW);
    expect(card.stability).toBe(2.5);
  });

  it("Easy graduates a new card immediately, skipping remaining steps", () => {
    const card = gradeCard(freshCard(), "easy", { now: NOW });
    expect(card.status).toBe(STATUS.REVIEW);
    expect(card.stability).toBe(4);
    expect(card.due).toBe(NOW + 4 * DAY_MS);
  });

  it("Hard on a learning card comes back later than Again would", () => {
    const card = gradeCard(freshCard(), "hard", { now: NOW });
    expect(card.status).toBe(STATUS.LEARNING);
    expect(card.due).toBeGreaterThan(NOW + 1 * 60_000);
  });
});

describe("gradeCard - review lifecycle", () => {
  function reviewCard(overrides = {}) {
    return normalizeCardState({
      status: STATUS.REVIEW, step: 0, difficulty: 5, stability: 10, reps: 5, lapses: 0,
      interval: 10, due: NOW, lastReviewedAt: NOW - 10 * DAY_MS, firstSeenDate: "2026-08-01",
      lastReviewedDate: "2026-09-10", ...overrides,
    });
  }

  it("Again on a review card lapses it back into relearning and shrinks stability", () => {
    const card = gradeCard(reviewCard(), "again", { now: NOW });
    expect(card.status).toBe(STATUS.LEARNING);
    expect(card.lapses).toBe(1);
    expect(card.stability).toBeLessThan(10);
    expect(card.difficulty).toBeGreaterThan(5);
  });

  it("Good grows stability and schedules a future due date", () => {
    const card = gradeCard(reviewCard(), "good", { now: NOW });
    expect(card.status).toBe(STATUS.REVIEW);
    expect(card.stability).toBeGreaterThan(10);
    expect(card.due).toBeGreaterThan(NOW);
  });

  it("Easy grows stability more than Good; Hard grows it less", () => {
    const easy = gradeCard(reviewCard(), "easy", { now: NOW });
    const good = gradeCard(reviewCard(), "good", { now: NOW });
    const hard = gradeCard(reviewCard(), "hard", { now: NOW });
    expect(easy.stability).toBeGreaterThan(good.stability);
    expect(good.stability).toBeGreaterThan(hard.stability);
  });

  it("a lower requestRetention setting (OK to forget more) yields longer intervals, shown less often", () => {
    const strict = gradeCard(reviewCard(), "good", { now: NOW, settings: { ...DEFAULT_STUDY_SETTINGS, requestRetention: 0.99 } });
    const lenient = gradeCard(reviewCard(), "good", { now: NOW, settings: { ...DEFAULT_STUDY_SETTINGS, requestRetention: 0.75 } });
    expect(lenient.interval).toBeGreaterThan(strict.interval);
  });

  it("throws on an unknown grade", () => {
    expect(() => gradeCard(reviewCard(), "whatever", { now: NOW })).toThrow(/invalid grade/);
  });
});

describe("buildStudyQueue", () => {
  it("orders learning, then due review, then new", () => {
    const cards = [
      normalizeCardState({ id: "new1", status: STATUS.NEW }),
      normalizeCardState({ id: "review1", status: STATUS.REVIEW, due: NOW - 1000, lastReviewedDate: "old" }),
      normalizeCardState({ id: "learn1", status: STATUS.LEARNING, due: NOW - 1000 }),
    ];
    const queue = buildStudyQueue(cards, DEFAULT_STUDY_SETTINGS, { now: NOW });
    expect(queue.map((c) => c.id)).toEqual(["learn1", "review1", "new1"]);
  });

  it("caps new cards introduced today at newPerDay", () => {
    const today = "2026-09-20";
    const cards = Array.from({ length: 5 }, (_, i) => normalizeCardState({ id: `n${i}`, status: STATUS.NEW }));
    const queue = buildStudyQueue(cards, { ...DEFAULT_STUDY_SETTINGS, newPerDay: 2 }, { now: NOW });
    expect(queue.length).toBe(2);
    void today;
  });

  it("counts a card introduced earlier today against today's new-card cap even though it's no longer New", () => {
    const cards = [
      normalizeCardState({ id: "seen-today", status: STATUS.REVIEW, due: NOW + DAY_MS, firstSeenDate: "2026-09-20", lastReviewedDate: "2026-09-20" }),
      ...Array.from({ length: 3 }, (_, i) => normalizeCardState({ id: `n${i}`, status: STATUS.NEW })),
    ];
    const queue = buildStudyQueue(cards, { ...DEFAULT_STUDY_SETTINGS, newPerDay: 2 }, { now: NOW });
    // seen-today isn't due and isn't New, so it can't appear itself; it already used 1 of
    // today's 2 new-card slots, leaving room for only 1 of the 3 still-New cards.
    expect(queue.every((c) => c.id !== "seen-today")).toBe(true);
    expect(queue.length).toBe(1);
  });

  it("caps reviews introduced today at reviewsPerDay, counting reviews already done today", () => {
    const cards = [
      normalizeCardState({ id: "done-today", status: STATUS.REVIEW, due: NOW - 1000, lastReviewedDate: "2026-09-20" }),
      ...Array.from({ length: 3 }, (_, i) => normalizeCardState({ id: `r${i}`, status: STATUS.REVIEW, due: NOW - 1000, lastReviewedDate: "2026-09-19" })),
    ];
    const queue = buildStudyQueue(cards, { ...DEFAULT_STUDY_SETTINGS, reviewsPerDay: 2 }, { now: NOW });
    // "done-today" already counts as one of today's 2 reviews done, leaving room for 1 more due card
    expect(queue.length).toBe(1);
  });

  it("falls back to every card in due order when nothing is due and caps are exhausted", () => {
    const cards = [
      normalizeCardState({ id: "a", status: STATUS.REVIEW, due: NOW + 5 * DAY_MS }),
      normalizeCardState({ id: "b", status: STATUS.REVIEW, due: NOW + 1 * DAY_MS }),
    ];
    const queue = buildStudyQueue(cards, DEFAULT_STUDY_SETTINGS, { now: NOW });
    expect(queue.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("shuffles when order is random, using the injected random function", () => {
    const cards = Array.from({ length: 20 }, (_, i) => normalizeCardState({ id: `n${i}`, status: STATUS.NEW }));
    const queue = buildStudyQueue(cards, { ...DEFAULT_STUDY_SETTINGS, order: "random" }, { now: NOW, random: () => 0 });
    expect(queue.map((c) => c.id)).not.toEqual(cards.map((c) => c.id));
    expect(queue.length).toBe(cards.length);
  });
});

describe("normalizeStudySettings", () => {
  it("fills in defaults for missing fields", () => {
    expect(normalizeStudySettings(null)).toEqual(DEFAULT_STUDY_SETTINGS);
  });

  it("clamps out-of-range numbers instead of discarding them, and falls back on an invalid enum", () => {
    // 0 new cards/day is a legitimate "pure review" setting, so a negative
    // input clamps to 0 rather than silently being replaced by the default.
    expect(normalizeStudySettings({ newPerDay: -5, order: "sideways" })).toEqual({ ...DEFAULT_STUDY_SETTINGS, newPerDay: 0 });
  });

  it("keeps valid overrides", () => {
    const s = normalizeStudySettings({ newPerDay: 10, reviewsPerDay: 50, order: "random", requestRetention: 0.8, learningStepsMinutes: [5] });
    expect(s).toEqual({ newPerDay: 10, reviewsPerDay: 50, order: "random", requestRetention: 0.8, learningStepsMinutes: [5] });
  });
});

describe("normalizeSettingsStore", () => {
  it("treats a missing/empty value as an empty store with the default settings", () => {
    expect(normalizeSettingsStore(null)).toEqual({ default: DEFAULT_STUDY_SETTINGS, decks: {} });
  });

  it("migrates the old shape (the whole key was one flat settings object) into the shared default, no deck overrides", () => {
    const legacy = { newPerDay: 15, reviewsPerDay: 100, order: "random", requestRetention: 0.85, learningStepsMinutes: [1, 10] };
    expect(normalizeSettingsStore(legacy)).toEqual({ default: legacy, decks: {} });
  });

  it("normalizes both the default and every per-deck override", () => {
    const store = normalizeSettingsStore({ default: { newPerDay: -1 }, decks: { d1: { order: "random" }, d2: {} } });
    expect(store.default.newPerDay).toBe(0);
    expect(store.decks.d1).toEqual({ ...DEFAULT_STUDY_SETTINGS, order: "random" });
    expect(store.decks.d2).toEqual(DEFAULT_STUDY_SETTINGS);
  });

  it("drops a non-object decks value instead of throwing", () => {
    expect(normalizeSettingsStore({ default: {}, decks: "not an object" })).toEqual({ default: DEFAULT_STUDY_SETTINGS, decks: {} });
  });
});

describe("deckStats", () => {
  it("buckets cards into new/learning/review/mature and mirrors seen/unseen", () => {
    const cards = [
      normalizeCardState({ status: STATUS.NEW }),
      normalizeCardState({ status: STATUS.NEW }),
      normalizeCardState({ status: STATUS.LEARNING, due: NOW - 1000 }),
      normalizeCardState({ status: STATUS.REVIEW, stability: 5, due: NOW + DAY_MS }),
      normalizeCardState({ status: STATUS.REVIEW, stability: 30, due: NOW + DAY_MS }),
    ];
    const stats = deckStats(cards, DEFAULT_STUDY_SETTINGS, NOW);
    expect(stats).toMatchObject({ total: 5, new: 2, learning: 1, review: 1, mature: 1, seen: 3, unseen: 2 });
  });

  it("caps newDueToday and reviewsDueToday the same way buildStudyQueue caps its slices", () => {
    const cards = [
      ...Array.from({ length: 5 }, () => normalizeCardState({ status: STATUS.NEW })),
      ...Array.from({ length: 3 }, () => normalizeCardState({ status: STATUS.REVIEW, due: NOW - 1000, stability: 5 })),
    ];
    const stats = deckStats(cards, { ...DEFAULT_STUDY_SETTINGS, newPerDay: 2, reviewsPerDay: 1 }, NOW);
    expect(stats.newDueToday).toBe(2);
    expect(stats.reviewsDueToday).toBe(1);
  });

  it("an honestly-empty queue (nothing due, caps spent) reads as 0, unlike buildStudyQueue's combat fallback", () => {
    const cards = [normalizeCardState({ status: STATUS.REVIEW, due: NOW + DAY_MS, stability: 5 })];
    const stats = deckStats(cards, DEFAULT_STUDY_SETTINGS, NOW);
    expect(stats.reviewsDueToday).toBe(0);
    expect(stats.newDueToday).toBe(0);
    expect(stats.learningDueNow).toBe(0);
    // buildStudyQueue, by contrast, still returns this card so combat has something to show.
    expect(buildStudyQueue(cards, DEFAULT_STUDY_SETTINGS, { now: NOW }).length).toBe(1);
  });
});
