import { describe, it, expect } from "vitest";
import { resolveRound, GRADE_MULTIPLIERS, CRIT_MULTIPLIER, applyLuckDropBonus } from "../src/world/combat.js";

function makeCombatant({ hp, attackDamage, attackSpeed, magicDamage = 0, armor = 0, magicResist = 0, luck = 0 }) {
  return {
    stats: { hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck },
    hp,
  };
}

describe("resolveRound", () => {
  it("scales the player's damage by GRADE_MULTIPLIERS for hard/good/easy", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 1, attackSpeed: 1 });
    expect(resolveRound({ player, mob, grade: "hard" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.hard));
    expect(resolveRound({ player, mob, grade: "good" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.good));
    // easy is also a guaranteed crit (see the next test), so its multiplier stacks with CRIT_MULTIPLIER
    expect(resolveRound({ player, mob, grade: "easy" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.easy * CRIT_MULTIPLIER));
  });

  it("marks easy grades as a crit and other grades as not", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 1, attackSpeed: 1 });
    expect(resolveRound({ player, mob, grade: "easy" }).isCrit).toBe(true);
    expect(resolveRound({ player, mob, grade: "good" }).isCrit).toBe(false);
  });

  it("player faster: a knockout hit skips the mob's retaliation", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 5, attackDamage: 6, attackSpeed: 5 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.order).toBe("player");
    expect(result.mobDefeated).toBe(true);
    expect(result.mobDamageDealt).toBe(0);
    expect(result.playerDefeated).toBe(false);
    expect(result.playerHp).toBe(100);
  });

  it("mob faster: a knockout hit skips the player's swing", () => {
    const player = makeCombatant({ hp: 5, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 40, attackDamage: 6, attackSpeed: 12 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.order).toBe("mob");
    expect(result.playerDefeated).toBe(true);
    expect(result.playerDamageDealt).toBe(0);
    expect(result.mobDefeated).toBe(false);
    expect(result.mobHp).toBe(40);
  });

  it("ties in attackSpeed favor the player", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 6, attackSpeed: 10 });
    expect(resolveRound({ player, mob, grade: "good" }).order).toBe("player");
  });

  it("when neither side is knocked out, both hits land and both HP totals drop", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 40, attackDamage: 6, attackSpeed: 8 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.playerDamageDealt).toBe(10);
    expect(result.mobDamageDealt).toBe(6);
    expect(result.mobHp).toBe(30);
    expect(result.playerHp).toBe(94);
    expect(result.playerDefeated).toBe(false);
    expect(result.mobDefeated).toBe(false);
  });

  it("a defender's armor reduces the physical damage they take", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 5, armor: 4 });
    const mob = makeCombatant({ hp: 100, attackDamage: 6, attackSpeed: 10 }); // faster -- hits the player
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.order).toBe("mob");
    expect(result.mobDamageDealt).toBe(2); // 6 attackDamage - 4 armor
    expect(result.playerHp).toBe(98);
  });

  it("a defender's armor mitigates the attacker's physical damage down to a floor of 1", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 6, attackSpeed: 1, armor: 1000 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.order).toBe("player");
    expect(result.playerDamageDealt).toBe(1); // 10 dmg vs 1000 armor -> floored at 1, never 0
    expect(result.mobHp).toBe(99);
  });

  it("magic damage is mitigated separately by magicResist, independent of armor", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 0, magicDamage: 20, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 0, attackSpeed: 1, armor: 50, magicResist: 5 });
    const result = resolveRound({ player, mob, grade: "good" });
    // physical component: attacker has 0 attackDamage -> 0, regardless of the mob's 50 armor
    // magic component: 20 magicDamage - 5 magicResist = 15
    expect(result.playerDamageDealt).toBe(15);
  });

  it("physical and magic damage stack when an attacker has both", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, magicDamage: 5, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 0, attackSpeed: 1 });
    const result = resolveRound({ player, mob, grade: "good" });
    expect(result.playerDamageDealt).toBe(15); // 10 physical + 5 magic, good = 1.0x
  });

  it("luck gives a deterministic crit chance via an injectable random source", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10, luck: 20 }); // 20% crit chance
    const mob = makeCombatant({ hp: 1000, attackDamage: 1, attackSpeed: 1 });
    const luckyRoll = () => 0.1; // below the 20% threshold -> crits
    const unluckyRoll = () => 0.5; // above the 20% threshold -> no crit
    const critResult = resolveRound({ player, mob, grade: "good", random: luckyRoll });
    const noCritResult = resolveRound({ player, mob, grade: "good", random: unluckyRoll });
    expect(critResult.isCrit).toBe(true);
    expect(critResult.playerDamageDealt).toBe(Math.round(10 * CRIT_MULTIPLIER));
    expect(noCritResult.isCrit).toBe(false);
    expect(noCritResult.playerDamageDealt).toBe(10);
  });

  it("luck-based crit chance is capped at 50%, even at very high luck", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10, luck: 1000 });
    const mob = makeCombatant({ hp: 1000, attackDamage: 1, attackSpeed: 1 });
    const result = resolveRound({ player, mob, grade: "good", random: () => 0.5 });
    expect(result.isCrit).toBe(false); // chance is capped at exactly 0.5; a roll of 0.5 is not < 0.5
  });

  it("a lucky mob can also crit on its own swing, reported via mobIsCrit", () => {
    const player = makeCombatant({ hp: 1000, attackDamage: 1, attackSpeed: 1 });
    const mob = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10, luck: 100 }); // capped at 50%
    const result = resolveRound({ player, mob, grade: "good", random: () => 0.01 });
    expect(result.order).toBe("mob");
    expect(result.mobIsCrit).toBe(true);
    expect(result.mobDamageDealt).toBe(Math.round(10 * CRIT_MULTIPLIER)); // mobs never get a grade multiplier
  });
});

describe("applyLuckDropBonus", () => {
  it("leaves the reward unchanged at 0 luck", () => {
    expect(applyLuckDropBonus(15, 0)).toBe(15);
  });

  it("scales the reward up by 2% per point of luck", () => {
    expect(applyLuckDropBonus(100, 10)).toBe(120); // +20%
  });

  it("caps the bonus at +100%, even at very high luck", () => {
    expect(applyLuckDropBonus(100, 1000)).toBe(200);
  });
});
