// Every way a player's progression can change outside of combat. Each function
// validates, mutates the player in place and returns what happened -- the
// server runs these on its own copy of the player, local mode runs them on the
// localStorage copy, so both modes award exactly the same things.

import { MAX_REWARDED_IMPORTS_PER_DAY } from "./constants.js";
import { applyReward, ensureDaily, todayKey } from "./player.js";

export const QUESTS = [
  { id: "review20", title: "Review 20 cards", goal: 20, key: "reviewed", reward: { coins: 150, xp: 100 } },
  { id: "win1", title: "Win a battle", goal: 1, key: "battlesWon", reward: { coins: 100, gems: 5 } },
  { id: "import1", title: "Import a deck", goal: 1, key: "imported", reward: { coins: 50, xp: 50 } },
];

export function deckImportReward(cardCount) {
  return { xp: Math.min(500, 50 + cardCount), coins: 100 };
}

// cardCount comes from the client (decks never leave the device), so it is
// only trusted to be a sane non-negative integer.
export function recordDeckImport(player, cardCount, today = todayKey()) {
  if (!Number.isInteger(cardCount) || cardCount < 1 || cardCount > 1_000_000) {
    return { ok: false, error: "invalid_card_count" };
  }
  const daily = ensureDaily(player, today);
  daily.imported += 1;
  const rewarded = daily.imported <= MAX_REWARDED_IMPORTS_PER_DAY;
  const reward = rewarded ? deckImportReward(cardCount) : { xp: 0, coins: 0 };
  applyReward(player, reward);
  return { ok: true, reward, rewarded };
}

export function recordReview(player, today = todayKey()) {
  ensureDaily(player, today).reviewed += 1;
}

// [{ ...quest, progress, claimed, ready }] for rendering the Quests screen.
export function questView(player, today = todayKey()) {
  const daily = player.daily?.date === today ? player.daily : { reviewed: 0, battlesWon: 0, imported: 0, claimed: [] };
  return QUESTS.map((quest) => {
    const progress = Math.min(daily[quest.key], quest.goal);
    const claimed = daily.claimed.includes(quest.id);
    return { ...quest, progress, claimed, ready: progress >= quest.goal && !claimed };
  });
}

export function claimQuest(player, questId, today = todayKey()) {
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest) return { ok: false, error: "unknown_quest" };
  const daily = ensureDaily(player, today);
  if (daily.claimed.includes(quest.id)) return { ok: false, error: "already_claimed" };
  if (daily[quest.key] < quest.goal) return { ok: false, error: "not_complete" };
  daily.claimed.push(quest.id);
  applyReward(player, quest.reward);
  return { ok: true, reward: quest.reward };
}
