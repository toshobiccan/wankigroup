import { OPPOSITE } from './room-exits.js';
import { MOB_DEFINITIONS } from '../game/mob-definitions.js';
// Validate saved authoring data without running the generator again.
export function readRegionSnapshot(p,rooms){
  if(!Array.isArray(rooms)||rooms.length!==p.count)throw new Error('Region room count does not match its blueprint.');
  const ids=new Set(rooms.map((_,i)=>`${p.id}-${i+1}`));
  const result=rooms.map((r,i)=>{
    if(r.id!==`${p.id}-${i+1}`||r.backgroundImage!==`assets/rooms/${r.id}.png`)throw new Error('Invalid saved room identity or image path.');
    const top=r.groundTopFrac,bottom=r.groundBottomFrac;
    if(!Number.isFinite(top)||!Number.isFinite(bottom)||top<.45||bottom>1||bottom-top<.22||bottom-top>.43)throw new Error('Invalid saved ground bounds.');
    const exits={};
    for(const [direction,e]of Object.entries(r.exits??{})){
      if(!OPPOSITE[direction]||e.entry!==OPPOSITE[direction]||!Number.isFinite(e.at)||e.at<.1||e.at>.9)throw new Error('Invalid saved exit.');
      if(!ids.has(e.roomId)&&!(i===0&&direction==='west'&&e.roomId===p.connectFrom))throw new Error('Unknown exit destination.');
      exits[direction]={roomId:e.roomId,entry:e.entry,at:e.at};
    }
    if(!Array.isArray(r.mobs)||r.mobs.length>8)throw new Error('Invalid mob placements.');
    const mobs=r.mobs.map((m,j)=>{
      if(!Object.hasOwn(MOB_DEFINITIONS,m.definitionId)||!Number.isFinite(m.xFrac)||!Number.isFinite(m.yFrac)||m.xFrac<.12||m.xFrac>.88||m.yFrac<top+.04||m.yFrac>bottom-.04)throw new Error('Invalid mob placement.');
      return {id:`${r.id}-mob-${j+1}`,definitionId:m.definitionId,role:m.definitionId==='placeholder-boss'?'boss':'normal',xFrac:m.xFrac,yFrac:m.yFrac};
    });
    if(!Number.isFinite(r.map?.x)||!Number.isFinite(r.map?.y)||r.map.x<50||r.map.x>950||r.map.y<100||r.map.y>590)throw new Error('Invalid room map coordinates.');
    return {id:r.id,displayName:`${p.name} ${i+1}`,regionId:p.id,role:p.regionType!=='spawn'&&i===p.count-1?'boss':i===0?'entrance':'encounter',composition:String(r.composition??'clearing').slice(0,100),backgroundImage:r.backgroundImage,groundTopFrac:top,groundBottomFrac:bottom,spawnXFrac:p.spawnXFrac,spawnYFrac:(top+bottom)/2,exits,links:{},mobs,map:{areaId:p.id,areaName:p.name,biome:p.biome,x:r.map.x,y:r.map.y,gridX:r.map.gridX,gridY:r.map.gridY,worldX:p.mapX,worldY:p.mapY}};
  });
  if(p.connectFrom&&result[0].exits.west?.roomId!==p.connectFrom)throw new Error('Connected regions require a return exit at their entrance.');
  const byId=new Map(result.map(r=>[r.id,r])),seen=new Set(),queue=[result[0].id];
  while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);for(const [direction,e]of Object.entries(byId.get(id).exits)){if(!ids.has(e.roomId))continue;const reverse=byId.get(e.roomId).exits[OPPOSITE[direction]];if(reverse?.roomId!==id)throw new Error('Room exits must connect in both directions.');queue.push(e.roomId);}}
  if(seen.size!==result.length)throw new Error('All rooms must be reachable.');
  if(p.regionType!=='spawn'&&(Object.keys(result.at(-1).exits).length!==1||result.at(-1).mobs.filter(m=>m.role==='boss').length!==1))throw new Error('The final room must contain one boss and one entrance.');
  return result;
}
