import { readRegionSnapshot } from './region-snapshot.js';
import { generateRegion } from './region-generator.js';
import { ROOM_ART_STYLE, ROOM_STYLE_REFERENCE } from './room-art-style.js';

export function buildRoomProject(input) {
  const id = String(input.id ?? '').trim();
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(id)) throw new Error('Use a lowercase area ID with letters, numbers and hyphens.');
  const modern=input.version===2;
  const regionType=modern?String(input.regionType??"custom"):"legacy";
  if(!["legacy","spawn","plains","custom"].includes(regionType))throw new Error("Unknown region type.");
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < (modern?3:1) || count > (modern?24:8)) throw new Error('Choose 3–24 rooms for regions (1–8 for legacy areas).');
  if(regionType==="spawn"&&count!==3)throw new Error("Spawn requires exactly 3 rooms.");
  if(regionType==="plains"&&(count<12||count>15))throw new Error("Plains requires 12–15 rooms.");
  const top = Number(input.groundTopFrac), bottom = Number(input.groundBottomFrac);
  if (!(top >= .45 && bottom <= (modern?1:.94) && bottom - top >= (modern?.25:.02) - 1e-9 && bottom - top <= (modern?.4:.2) + 1e-9)) throw new Error('Walking band must be 25–40% tall for regions (2–20% for legacy rooms), between 45% and 100% of image height (94% for legacy rooms).');
  const name = String(input.name ?? '').trim().slice(0, 80);
  const prompt = String(input.prompt ?? '').trim().slice(0, 6000);
  if (!name || !prompt) throw new Error('Enter an area name and scene description.');
  const spawnXFrac = Number(input.spawnXFrac ?? .2);
  const mapX=Number(input.mapX??440),mapY=Number(input.mapY??340);
  const biome=String(input.biome??'plains');
  const connectFrom=String(input.connectFrom??'').trim();
  if(!Number.isFinite(mapX)||!Number.isFinite(mapY)||mapX<80||mapX>600||mapY<120||mapY>460) throw new Error('Map origin must be X 80–600, Y 120–460.');
  if(!['plains','forest','mountains','coast','village'].includes(biome))throw new Error('Choose a supported landscape.');
  if(connectFrom==='index')throw new Error('Choose a room, not the map catalog.');
  if(connectFrom&&!/^[a-z][a-z0-9-]{0,59}$/.test(connectFrom))throw new Error('Invalid connecting room ID.');
  if (!(spawnXFrac >= .05 && spawnXFrac <= .95)) throw new Error('Spawn must be between 5% and 95% across the room.');
  const result={ version: modern?2:1, id, name, prompt, count, width: 1920, height: 1080,
    groundTopFrac: top, groundBottomFrac: bottom, spawnXFrac,mapX,mapY,biome,connectFrom,
    rooms: Array.from({ length: count }, (_, i) => ({
      id: `${id}-${i+1}`, displayName: `${name} ${i+1}`,
      backgroundImage: `assets/rooms/${id}-${i+1}.png`,
      groundTopFrac: top, groundBottomFrac: bottom, spawnXFrac,
      spawnYFrac: (top + bottom) / 2,
      links: { prev: i ? `${id}-${i}` : connectFrom||null, next: i < count-1 ? `${id}-${i+2}` : null }, mobs: [],
      map: { areaId:id,areaName:name,biome,x:mapX+(Math.floor(i/4)%2?3-i%4:i%4)*85,y:mapY+Math.floor(i/4)*100 },
    })),
  };
  if(modern){
    result.regionType=regionType;result.seed=String(input.seed??id).slice(0,100);result.connectDirection="east";
    result.rooms=readRegionSnapshot(result,input.rooms??generateRegion(result));
    result.region={id,name,biome,seed:result.seed,entryRoomId:result.rooms[0].id,bossRoomId:regionType==="spawn"?null:result.rooms.at(-1).id,roomIds:result.rooms.map(r=>r.id),worldX:mapX,worldY:mapY};
  }
  return result;
}

export function roomPrompt(project, index) {
  const p = buildRoomProject(project);
  if (!Number.isInteger(index) || !p.rooms[index]) throw new Error('Unknown room.');
  const room=p.rooms[index];
  return `${ROOM_ART_STYLE}

AREA: ${p.name}. Brief: ${p.prompt}
Create room ${index+1} of ${p.count}: ${p.rooms[index].id}. One 1920×1080 opaque PNG background, no text, UI, characters or monsters. Do not make a collage.
The entire batch shares the exact same palette, light from upper-left, camera perspective, horizon and ground elevation. Give each room a distinct composition within that area. Use the first accepted room, once available, as an additional reference for later rooms. Never use rejected previews.
Attach ${ROOM_STYLE_REFERENCE} as the PRIMARY visual reference. Landscape: ${p.biome}. Match the existing Plains level of detail, angular facets, selective linework and layered scenery; change the subject and geometry to fit this room.
ROOM COMPOSITION: ${room.composition??"open path"}. Keep the same regional grass/material colors in every room.
EXITS: ${Object.entries(room.exits??{}).map(([d,e])=>d+" at center of that walkable boundary, to "+e.roomId).join("; ")||"Legacy west/east path"}. Keep access to those exits visibly open. A dirt path is optional, never a required yellow strip; never paint arrows (the game draws them). Match the layout guide.
GROUND CONTRACT: current saved collision bounds (geometry only, not a painted lane): traversable ground plane from ${(room.groundTopFrac*100).toFixed(1)}% to ${(room.groundBottomFrac*100).toFixed(1)}% down the image. Keep this entire band continuously passable from left to right. No stairs, holes, rocks, fences or objects blocking it. Exit edges must connect at the same elevation. Spawn is ${(p.spawnXFrac*100).toFixed(1)}% across at ${((p.groundTopFrac+p.groundBottomFrac)*50).toFixed(1)}% down. Allow clear space for a character about 18% of image height. Buildings and trees stay behind the band. No baked shadows shaped like a player.
Foreground and distant scenery must match the Plains reference rather than character-outline rules. Render one coherent still room, not separate mobile/desktop variants. Output filename: ${p.rooms[index].id}.png.
`;
}
