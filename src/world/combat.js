// Pure combat math -- no PIXI, no DOM. hp/attackDamage/attackSpeed were the
// only stats read here at first; magicDamage/armor/magicResist/luck are now
// live too (see the formulas below), each guarded so a combatant with none
// of a given stat (the common case today -- most mobs/players have
// magicDamage: 0 and luck: 0) behaves exactly as before this was added.

export const GRADE_MULTIPLIERS = { hard: 0.7, good: 1.0, easy: 1.5 };
export const CRIT_MULTIPLIER = 1.5; // bonus damage on a crit, stacks with the grade multiplier
const CRIT_CHANCE_PER_LUCK = 0.01; // 1% crit chance per point of luck
const MAX_LUCK_CRIT_CHANCE = 0.5; // luck alone can never push crit chance past 50%
const COIN_BONUS_PER_LUCK = 0.02; // "better drops" -- +2% coin reward per point of luck
const MAX_COIN_BONUS = 1; // capped at +100% coins

// raw: pre-mitigation damage from one component (physical or magic).
// resist: the matching defensive stat (armor or magicResist).
// A raw amount of 0 (the attacker has none of this damage type) never deals
// damage; otherwise at least 1 always gets through, so stacking armor/resist
// can reduce a hit to a trickle but can never make a fight literally
// unwinnable by blocking every point of damage forever.
function mitigate(raw, resist) {
  if (raw <= 0) return 0;
  return Math.max(1, raw - resist);
}

function rollCrit(luck, guaranteed, random) {
  if (guaranteed) return true;
  const chance = Math.min(MAX_LUCK_CRIT_CHANCE, luck * CRIT_CHANCE_PER_LUCK);
  return random() < chance;
}

// Physical (attackDamage vs armor) and magic (magicDamage vs magicResist)
// components are mitigated independently, then summed -- a spellcaster-type
// attacker with both nonzero deals both at once. `multiplier` is the grade
// multiplier for the player's swing (always 1 for the mob's, since mobs
// don't grade cards); crits multiply the total on top of that.
function computeDamage(attacker, defender, { multiplier, isCrit }) {
  const physical = mitigate(attacker.stats.attackDamage, defender.stats.armor);
  const magic = mitigate(attacker.stats.magicDamage, defender.stats.magicResist);
  return Math.round((physical + magic) * multiplier * (isCrit ? CRIT_MULTIPLIER : 1));
}

// player, mob: { stats: {hp, attackDamage, magicDamage, armor, magicResist, attackSpeed, luck}, hp }
// grade: "hard" | "good" | "easy" -- callers never invoke this for "again"
// random: () => number in [0, 1) -- defaults to Math.random, overridable so
// crit rolls are deterministic in tests.
export function resolveRound({ player, mob, grade, random = Math.random }) {
  // Grading "easy" is a guaranteed crit (unchanged from before); luck gives
  // every grade -- and the mob's flat attack -- an independent chance too.
  const playerCrit = rollCrit(player.stats.luck, grade === "easy", random);
  const mobCrit = rollCrit(mob.stats.luck, false, random);

  const playerDamage = computeDamage(player, mob, { multiplier: GRADE_MULTIPLIERS[grade], isCrit: playerCrit });
  const mobDamage = computeDamage(mob, player, { multiplier: 1, isCrit: mobCrit });
  const playerFirst = player.stats.attackSpeed >= mob.stats.attackSpeed; // ties favor the player

  let playerHp = player.hp;
  let mobHp = mob.hp;
  let playerDamageDealt = 0;
  let mobDamageDealt = 0;
  let playerCritDealt = false;
  let mobCritDealt = false;

  if (playerFirst) {
    mobHp = Math.max(0, mobHp - playerDamage);
    playerDamageDealt = playerDamage;
    playerCritDealt = playerCrit;
    if (mobHp > 0) {
      playerHp = Math.max(0, playerHp - mobDamage);
      mobDamageDealt = mobDamage;
      mobCritDealt = mobCrit;
    }
  } else {
    playerHp = Math.max(0, playerHp - mobDamage);
    mobDamageDealt = mobDamage;
    mobCritDealt = mobCrit;
    if (playerHp > 0) {
      mobHp = Math.max(0, mobHp - playerDamage);
      playerDamageDealt = playerDamage;
      playerCritDealt = playerCrit;
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
    isCrit: playerCritDealt,
    mobIsCrit: mobCritDealt,
  };
}

// "Better drops" -- luck's second effect. A flat, deterministic bonus
// (not a random chance) so a player's actual coin take stays predictable
// and auditable; luck: 0 (the default today) leaves rewards unchanged.
export function applyLuckDropBonus(coinReward, luck) {
  const bonus = Math.min(MAX_COIN_BONUS, Math.max(0, luck) * COIN_BONUS_PER_LUCK);
  return Math.round(coinReward * (1 + bonus));
}
