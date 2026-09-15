import { describe, it, expect } from "vitest";
import { resolveRound, GRADE_MULTIPLIERS } from "../src/world/combat.js";

function makeCombatant({ hp, attackDamage, attackSpeed }) {
  return {
    stats: { hp, attackDamage, magicDamage: 0, armor: 0, magicResist: 0, attackSpeed, luck: 0 },
    hp,
  };
}

describe("resolveRound", () => {
  it("scales the player's damage by GRADE_MULTIPLIERS for hard/good/easy", () => {
    const player = makeCombatant({ hp: 100, attackDamage: 10, attackSpeed: 10 });
    const mob = makeCombatant({ hp: 100, attackDamage: 1, attackSpeed: 1 });
    expect(resolveRound({ player, mob, grade: "hard" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.hard));
    expect(resolveRound({ player, mob, grade: "good" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.good));
    expect(resolveRound({ player, mob, grade: "easy" }).playerDamageDealt).toBe(Math.round(10 * GRADE_MULTIPLIERS.easy));
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
});
