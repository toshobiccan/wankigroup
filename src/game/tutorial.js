// Dialogue state only. Combat and XP are exclusively handled by Room/applyKill.
export const TUTORIAL_STEPS=['welcome','controls','combat','reward','done'];
export function tutorialAction(player,{action,value}={}) {
 const state=player.tutorial??{step:'done',rewarded:false};
 if(action==='restart'){player.tutorial={...state,step:'welcome'};return {ok:true};}
 if(action==='skip'){player.tutorial={...state,step:'done'};return {ok:true};}
 if(action!==state.step)return {ok:false,error:'tutorial_step_changed'};
 if(action==='welcome'){
  if(!player.characterCreated)return {ok:false,error:'create_character_first'};
  if(value!==undefined){if(typeof value!=='string'||value.trim().length<2||value.trim().length>20||/[<>\x00-\x1f]/.test(value))return {ok:false,error:'invalid_name'};player.name=value.trim();}
  player.tutorial={...state,step:'controls'};
 }else if(action==='controls')player.tutorial={...state,step:'combat'};
 else if(action==='reward')player.tutorial={...state,step:'done'};
 else return {ok:false,error:'tutorial_requires_combat'};
 return {ok:true};
}
