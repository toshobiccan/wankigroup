import { describe, it, expect } from "vitest";
import { createDefaultPlayer, normalizePlayer, ensureDaily, gainXp } from "../src/game/player.js";
import { recordDeckImport, claimQuest, questView, recordReview } from "../src/game/progression.js";
import { resolveGrade, applyKill } from "../src/game/encounter.js";
import { MAX_REWARDED_IMPORTS_PER_DAY, XP_PER_LEVEL, GEMS_PER_LEVEL } from "../src/game/constants.js";

const TODAY = "2026-09-17";

describe("player", () => {
  it("normalizePlayer fills missing nested fields without mutating the input", () => {
    const saved = { name: "Old", level: 4, stats: { hp: 150 } };
    const player = normalizePlayer(saved);
    expect(player.level).toBe(4);
    expect(player.stats.hp).toBe(150);
    expect(player.stats.luck).toBe(0);
    expect(player.inventory).toEqual({ equipables: [], materials: [] });
    expect(saved.stats).toEqual({ hp: 150 });
  });

  it("normalizePlayer never shares nested objects between players", () => {
    const a = normalizePlayer(null);
    const b = normalizePlayer(null);
    a.inventory.materials.push("x");
    expect(b.inventory.materials).toEqual([]);
  });

  it("gainXp levels up and grants gems", () => {
    const player = createDefaultPlayer();
    gainXp(player, XP_PER_LEVEL * 2 + 5);
    expect(player.level).toBe(3);
    expect(player.xp).toBe(5);
    expect(player.gems).toBe(GEMS_PER_LEVEL * 2);
  });

  it("ensureDaily resets counters on a new day", () => {
    const player = createDefaultPlayer();
    ensureDaily(player, "2026-09-16").reviewed = 9;
    expect(ensureDaily(player, TODAY).reviewed).toBe(0);
  });
});

describe("progression", () => {
  it("rewards deck imports up to the daily cap", () => {
    const player = createDefaultPlayer();
    for (let i = 0; i < MAX_REWARDED_IMPORTS_PER_DAY; i++) {
      expect(recordDeckImport(player, 10, TODAY).rewarded).toBe(true);
    }
    const extra = recordDeckImport(player, 10, TODAY);
    expect(extra).toMatchObject({ ok: true, rewarded: false, reward: { xp: 0, coins: 0 } });
    expect(player.coins).toBe(100 * MAX_REWARDED_IMPORTS_PER_DAY);
  });

  it("rejects nonsense card counts", () => {
    const player = createDefaultPlayer();
    expect(recordDeckImport(player, -1, TODAY).ok).toBe(false);
    expect(recordDeckImport(player, 1.5, TODAY).ok).toBe(false);
    expect(recordDeckImport(player, "5", TODAY).ok).toBe(false);
  });

  it("only lets a finished quest be claimed once", () => {
    const player = createDefaultPlayer();
    expect(claimQuest(player, "import1", TODAY)).toEqual({ ok: false, error: "not_complete" });
    recordDeckImport(player, 1, TODAY);
    expect(questView(player, TODAY).find((q) => q.id === "import1").ready).toBe(true);
    expect(claimQuest(player, "import1", TODAY).ok).toBe(true);
    expect(claimQuest(player, "import1", TODAY)).toEqual({ ok: false, error: "already_claimed" });
    expect(claimQuest(player, "nope", TODAY)).toEqual({ ok: false, error: "unknown_quest" });
  });

  it("questView shows zero progress for a stale day", () => {
    const player = createDefaultPlayer();
    for (let i = 0; i < 25; i++) recordReview(player, "2026-09-16");
    expect(questView(player, TODAY).find((q) => q.id === "review20").progress).toBe(0);
  });
});

describe("encounter", () => {
  const goblin = () => ({ id: "g", stats: { hp: 40, attackDamage: 6, magicDamage: 0, armor: 0, magicResist: 0, attackSpeed: 8, luck: 0 }, hp: 40, xpReward: 50, coinReward: 15 });

  it("again counts a review but deals no damage", () => {
    const player = createDefaultPlayer();
    const mob = goblin();
    expect(resolveGrade({ player, mob, grade: "again", today: TODAY })).toEqual({ again: true });
    expect(mob.hp).toBe(40);
    expect(player.daily.reviewed).toBe(1);
  });

  it("a graded round updates both HP pools and lists hits in swing order", () => {
    const player = createDefaultPlayer();
    const mob = goblin();
    const result = resolveGrade({ player, mob, grade: "good", today: TODAY, random: () => 0.99 });
    expect(result.hits).toEqual([
      { attacker: "player", damage: 12, isCrit: false },
      { attacker: "mob", damage: 4, isCrit: false },
    ]);
    expect(mob.hp).toBe(28);
    expect(player.hp).toBe(96);
  });

  it("applyKill grants XP, coins and a battle win", () => {
    const player = createDefaultPlayer();
    expect(applyKill(player, goblin(), TODAY)).toEqual({ xp: 50, coins: 15 });
    expect(player.daily.battlesWon).toBe(1);
  });
});
