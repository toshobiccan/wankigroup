import { readFileSync } from 'node:fs';
import { ROOM_ART_STYLE } from '../src/world/room-art-style.js';
import { expect, it } from 'vitest';
import { buildRoomProject, roomPrompt } from '../src/world/room-workshop.js';
const input = { id:'home', name:'Home', prompt:'Warm cottage and garden', count:3, groundTopFrac:.73, groundBottomFrac:.79, spawnXFrac:.2 };
it('builds reciprocal links and spawn points inside a common shallow band', () => {
  const p=buildRoomProject(input);
  expect(p.rooms[0].links).toEqual({prev:null,next:'home-2'});
  expect(p.rooms[1].links).toEqual({prev:'home-1',next:'home-3'});
  expect(p.rooms[2].links).toEqual({prev:'home-2',next:null});
  for(const r of p.rooms) { expect(r.spawnYFrac).toBeGreaterThan(r.groundTopFrac); expect(r.spawnYFrac).toBeLessThan(r.groundBottomFrac); }
});
it('rejects unsafe names and invalid geometry', () => {
  for(const patch of [{id:'../oops'},{count:9},{groundBottomFrac:.4},{spawnXFrac:2}]) expect(()=>buildRoomProject({...input,...patch})).toThrow();
});
it('accepts exactly two and twenty percent walking bands',()=>{
  expect(()=>buildRoomProject({...input,groundTopFrac:.45,groundBottomFrac:.47})).not.toThrow();
  expect(()=>buildRoomProject({...input,groundTopFrac:.73,groundBottomFrac:.93})).not.toThrow();
});
it('rebuilds room metadata instead of trusting supplied paths and links', () => {
  const p=buildRoomProject({...input,rooms:[{id:'../../outside'}]});
  expect(p.rooms[0].id).toBe('home-1');
  expect(roomPrompt(p,0)).toContain('Attach assets/art-reference/room-style-approved.png as the PRIMARY visual reference');
  expect(roomPrompt(p,0)).toContain('73.0%');
});

it('preserves map placement and attaches the first room to an external exit',()=>{
 const p=buildRoomProject({...input,count:8,mapX:400,mapY:200,biome:'forest',connectFrom:'plains2'});
 expect(p.rooms[0].links.prev).toBe('plains2');
 expect(p.rooms[0].map).toEqual({areaId:'home',areaName:'Home',biome:'forest',x:400,y:200});
 expect(p.rooms[7].map).toMatchObject({x:400,y:300});
 expect(buildRoomProject(p)).toEqual(p);
 for(const patch of [{mapX:Infinity},{mapY:700},{biome:'unknown'},{connectFrom:'../bad'},{connectFrom:'index'}]) expect(()=>buildRoomProject({...input,...patch})).toThrow();
});

it('keeps the Plains room style in both generated prompts and the reusable environment template',()=>{
 const prompt=roomPrompt(buildRoomProject(input),0);
 expect(prompt).toContain(ROOM_ART_STYLE);
 expect(prompt).toContain('AQW-inspired');
 expect(prompt).toContain('A dirt path is optional');
 expect(prompt).not.toContain('human-base-v5-front-grip.png as the absolute art reference');
 const doc=readFileSync(new URL('../docs/art-reference/environment-prompt-template.txt',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 expect(doc).toContain(ROOM_ART_STYLE);
});
