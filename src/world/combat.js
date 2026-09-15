// Pure combat math -- no PIXI, no DOM. Only hp/attackDamage/attackSpeed are
// read here right now; magicDamage/armor/magicResist/luck are declared on
// every stats object and pass through untouched, reserved for whatever
// formulas get defined for them later (see the combat-resolution design spec).

export const GRADE_MULTIPLIERS = { hard: 0.7, good: 1.0, easy: 1.5 };

// player, mob: { stats: {hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck}, hp }
// grade: "hard" | "good" | "easy" -- callers never invoke this for "again"
export function resolveRound({ player, mob, grade }) {
  const playerDamage = Math.round(player.stats.attackDamage * GRADE_MULTIPLIERS[grade]);
  const mobDamage = mob.stats.attackDamage;
  const playerFirst = player.stats.attackSpeed >= mob.stats.attackSpeed; // ties favor the player

  let playerHp = player.hp;
  let mobHp = mob.hp;
  let playerDamageDealt = 0;
  let mobDamageDealt = 0;

  if (playerFirst) {
    mobHp = Math.max(0, mobHp - playerDamage);
    playerDamageDealt = playerDamage;
    if (mobHp > 0) {
      playerHp = Math.max(0, playerHp - mobDamage);
      mobDamageDealt = mobDamage;
    }
  } else {
    playerHp = Math.max(0, playerHp - mobDamage);
    mobDamageDealt = mobDamage;
    if (playerHp > 0) {
      mobHp = Math.max(0, mobHp - playerDamage);
      playerDamageDealt = playerDamage;
    }
  }

  return {
    order: playerFirst ? "player" : "mob",
    playerDamageDealt, // 0 if the player was knocked out before swinging
    mobDamageDealt, // 0 if the mob was knocked out before swinging
    playerHp,
    mobHp,
    playerDefeated: playerHp <= 0,
    mobDefeated: mobHp <= 0,
    isCrit: grade === "easy",
  };
}
