// Stable IDs used by authored spawn placements. Future mob authoring can
// replace a definition without moving or renaming any room's placements.
export const MOB_DEFINITIONS=Object.fromEntries(['melee','ranged','elite','boss'].map((role,i)=>[
  `placeholder-${role}`,{name:`${role[0].toUpperCase()+role.slice(1)} placeholder`,placeholder:true,level:i+1,image:'assets/mob-placeholder.svg',portrait:'assets/mob-placeholder.svg',stats:{hp:30+i*20,attackDamage:4+i*2,magicDamage:0,armor:0,magicResist:0,attackSpeed:8,luck:0},xpReward:20+i*15,coinReward:5+i*5}
]));
export function resolveMob(spawn,definitions=MOB_DEFINITIONS){
  if(!spawn.definitionId)return spawn;
  const definition=definitions[spawn.definitionId];
  if(!Object.hasOwn(definitions,spawn.definitionId))throw new Error(`Unknown mob definition: ${spawn.definitionId}`);
  return {...definition,...spawn,stats:{...definition.stats,...spawn.stats}};
}
