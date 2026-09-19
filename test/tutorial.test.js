import {it,expect} from 'vitest';
import {createDefaultPlayer,normalizePlayer} from '../src/game/player.js';
import {tutorialAction} from '../src/game/tutorial.js';
import {LocalSession} from '../src/net/session-local.js';
import {Room} from '../src/game/room.js';
import {resolveMob} from '../src/game/mob-definitions.js';
it('dialogue requires a character and cannot award combat XP',()=>{
 const p=createDefaultPlayer();
 expect(tutorialAction(p,{action:'welcome'}).ok).toBe(false);
 p.characterCreated=true;
 tutorialAction(p,{action:'welcome',value:'Learner'});tutorialAction(p,{action:'controls'});
 expect(p.tutorial.step).toBe('combat');
 for(const action of ['choice','reward','combat'])expect(tutorialAction(p,{action,value:'Oslo'}).ok).toBe(false);
 expect(p.xp).toBe(0);
});
it('actual Room combat advances the tutorial and rewards only once',()=>{
 const p=createDefaultPlayer();p.tutorial={step:'combat',rewarded:false};
 const zone={id:'spawn-1',groundTopFrac:.64,groundBottomFrac:1,spawnXFrac:.36,spawnYFrac:.82,mobs:[resolveMob({id:'practice',definitionId:'tutorial-goblin',xFrac:.36,yFrac:.82})]};
 const fight=()=>{const room=new Room({id:'test',zone,players:{get:()=>p,changed:()=>{}},emit:()=>{},random:()=>.99});
 try{room.addPlayer('hero');expect(room.engage('hero','practice').ok).toBe(true);for(let i=0;i<4&&p.tutorial.step==='combat';i++)room.grade('hero','good');}finally{room.dispose();}};
 fight();expect(p.tutorial).toMatchObject({step:'reward',rewarded:true});expect(p.xp).toBe(30);
 tutorialAction(p,{action:'reward'});tutorialAction(p,{action:'restart'});p.characterCreated=true;
 tutorialAction(p,{action:'welcome'});tutorialAction(p,{action:'controls'});fight();expect(p.xp).toBe(30);expect(p.tutorial.step).toBe('reward');
});
it('preserves returning characters and skipping never awards XP',()=>{
 expect(normalizePlayer({characterCreated:true,xp:120}).tutorial.step).toBe('done');
 expect(normalizePlayer({tutorial:{step:'recall',rewarded:false}}).tutorial.step).toBe('combat');
 const p=createDefaultPlayer();tutorialAction(p,{action:'skip'});expect(p.tutorial.step).toBe('done');expect(p.xp).toBe(0);
});
it('does not advance local tutorial when persistence fails',async()=>{
 const session=await new LocalSession({storage:{getItem:()=>null,setItem:()=>{throw Error('full');}},loadZone:()=>null}).start();
 session.player.characterCreated=true;
 await expect(session.tutorialAction({action:'welcome',value:'Learner'})).rejects.toThrow('full');expect(session.player.tutorial.step).toBe('welcome');
});
