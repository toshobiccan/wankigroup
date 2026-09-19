import { it,expect } from 'vitest';
import { buildRoomProject } from '../src/world/room-workshop.js';
import { roomExits,exitPoint,reachedExit,OPPOSITE } from '../src/world/room-exits.js';
import { resolveMob } from '../src/game/mob-definitions.js';
const input={version:2,regionType:'plains',id:'test-plains',name:'Plains',prompt:'Sunny green plains',count:14,seed:'test',groundTopFrac:.58,groundBottomFrac:.9};
it('creates a fixed, connected four-way region with reciprocal exits and a terminal boss',()=>{
 for(let seed=0;seed<60;seed++){
  const p=buildRoomProject({...input,seed:String(seed)}),byId=new Map(p.rooms.map(r=>[r.id,r]));
  expect(buildRoomProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  expect(p.rooms).toHaveLength(14);
  const visited=new Set(),queue=[p.rooms[0].id];
  while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);for(const [d,e]of Object.entries(byId.get(id).exits)){expect(byId.get(e.roomId).exits[OPPOSITE[d]].roomId).toBe(id);queue.push(e.roomId);}}
  expect(visited.size).toBe(14);
  expect(Object.keys(byId.get(p.region.bossRoomId).exits)).toHaveLength(1);
  for(const room of p.rooms)for(const mob of room.mobs){expect(mob.yFrac).toBeGreaterThan(room.groundTopFrac);expect(mob.yFrac).toBeLessThan(room.groundBottomFrac);expect(resolveMob(mob).stats.hp).toBeGreaterThan(0);}
 }
});
it('keeps spawn at three rooms and makes a new variation only during authoring',()=>{
 expect(()=>buildRoomProject({...input,regionType:'spawn'})).toThrow();
 for(const count of [1,2])expect(()=>buildRoomProject({...input,regionType:'custom',count})).toThrow();
 expect(()=>buildRoomProject({...input,groundTopFrac:.73,groundBottomFrac:.75})).toThrow();
 expect(buildRoomProject({...input,regionType:'spawn',count:3}).region.bossRoomId).toBeNull();
 expect(buildRoomProject({...input,seed:'other'}).rooms).not.toEqual(buildRoomProject(input).rooms);
});
it('uses bounded doorways and spawns safely beyond destination triggers',()=>{
 const room={groundTopFrac:.55,groundBottomFrac:.9,exits:{north:{roomId:'b',entry:'south',at:.5}}};
 expect(reachedExit(room,{x:.5,y:.55}).roomId).toBe('b');
 expect(reachedExit(room,{x:.2,y:.55})).toBeNull();
 expect(reachedExit(room,exitPoint(room,'north',.5,.025))).toBeNull();
 expect(roomExits({links:{next:'old'}}).east.roomId).toBe('old');
});

it('loads a saved blueprint without re-generating rooms from its authoring seed',()=>{
 const project=buildRoomProject(input);
 expect(buildRoomProject({...project,seed:'a different seed'}).rooms).toEqual(project.rooms);
 const broken=structuredClone(project);delete broken.rooms[1].exits[Object.keys(broken.rooms[1].exits)[0]];
 expect(()=>buildRoomProject(broken)).toThrow();
});

it('rejects incomplete external connections and inherited mob-definition names',()=>{
 const p=buildRoomProject(input);
 expect(()=>buildRoomProject({...p,connectFrom:'spawn-3'})).toThrow();
 const bad=structuredClone(p);bad.rooms[1].mobs[0].definitionId='constructor';
 expect(()=>buildRoomProject(bad)).toThrow();
 expect(()=>resolveMob({definitionId:'constructor'})).toThrow();
});
