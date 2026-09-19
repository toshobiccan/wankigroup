// One flashcard answer inside a fight, from grade to consequences. Wraps the
// pure damage math in src/world/combat.js with the bookkeeping around it
// (review counter, kill rewards, defeat) so the local Room and the server
// Room resolve a round identically.

import { resolveRound, applyLuckDropBonus } from "../world/combat.js";
import { applyReward, ensureDaily, todayKey } from "./player.js";
import { recordReview } from "./progression.js";

export const GRADES = ["again", "hard", "good", "easy"];

// mob: the room's live mob state { stats, hp, ... }. Mutates player.hp and
// mob.hp. "again" is a free retry: it counts as a review but nobody swings.
export function resolveGrade({ player, mob, grade, today = todayKey(), random = Math.random }) {
  recordReview(player, today);
  if (grade === "again") return { again: true };

  const round = resolveRound({ player, mob, grade, random });
  player.hp = round.playerHp;
  mob.hp = round.mobHp;

  const hits = [
    { attacker: "player", damage: round.playerDamageDealt, isCrit: round.isCrit },
    { attacker: "mob", damage: round.mobDamageDealt, isCrit: round.mobIsCrit },
  ];
  if (round.order === "mob") hits.reverse();

  return {
    again: false,
    hits: hits.filter((hit) => hit.damage > 0),
    playerDamageDealt: round.playerDamageDealt,
    playerHp: round.playerHp,
    mobHp: round.mobHp,
    mobDefeated: round.mobDefeated,
    playerDefeated: round.playerDefeated,
  };
}

export function killReward(mob, player) {
  return { xp: mob.xpReward ?? 0, coins: applyLuckDropBonus(mob.coinReward ?? 0, player.stats.luck) };
}

// Everyone who was fighting the mob when it fell gets the full reward.
export function applyKill(player, mob, today = todayKey()) {
  if(mob.tutorialMob && player.tutorial?.rewarded) {
    if(player.tutorial.step==='combat')player.tutorial.step='reward';
    return {xp:0,coins:0};
  }
  const reward = killReward(mob, player);
  if(mob.tutorialMob)player.tutorial={...player.tutorial,rewarded:true,step:player.tutorial?.step==='combat'?'reward':(player.tutorial?.step??'done')};
  applyReward(player, reward);
  ensureDaily(player, today).battlesWon += 1;
  return reward;
}

// Losing costs nothing but the walk back: full HP, back at the zone spawn.
export function applyDefeat(player) {
  player.hp = player.stats.hp;
}
