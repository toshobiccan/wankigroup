import { OPPOSITE } from './room-exits.js';

const STEPS={east:[1,0],north:[0,-1],south:[0,1],west:[-1,0]};
function randomFor(seed){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}

// Authoring only. Runtime never calls this: installed JSON is the fixed world.
export function generateRegion(p){
  const random=randomFor(p.seed), cells=[{x:0,y:0}], used=new Set(['0,0']),edges=[];
  const mainCount=p.regionType==='spawn'?p.count:Math.max(3,Math.ceil(p.count*.75));
  // A monotonic east/north/south main path cannot cross itself. Reserve west
  // of the entrance for the external region connection.
  for(let i=1;i<mainCount;i++){
    const last=cells.at(-1);
    const choices=['east','north','south'].filter(d=>{const [dx,dy]=STEPS[d];return !used.has(`${last.x+dx},${last.y+dy}`)&&Math.abs(last.y+dy)<=2;});
    const direction=choices[Math.floor(random()*choices.length)];
    const [dx,dy]=STEPS[direction],next={x:last.x+dx,y:last.y+dy};
    edges.push([i-1,i]);cells.push(next);used.add(`${next.x},${next.y}`);
  }
  while(cells.length<p.count){
    const options=[];
    for(let a=1;a<cells.length;a++){
      if(a===mainCount-1)continue;
      for(const [dx,dy]of Object.values(STEPS)){
        const next={x:cells[a].x+dx,y:cells[a].y+dy};
        if(next.x<0||Math.abs(next.y)>3||used.has(`${next.x},${next.y}`))continue;
        options.push({a,next});
      }
    }
    if(!options.length)throw new Error('Unable to place region branch.');
    const {a,next}=options[Math.floor(random()*options.length)];
    edges.push([a,cells.length]);cells.push(next);used.add(`${next.x},${next.y}`);
  }
  // Keep the boss as the final room ID, although branches were authored later.
  const order=cells.map((_,i)=>i).filter(i=>i!==mainCount-1).concat(mainCount-1);
  const original=[...cells],remap=new Map(order.map((old,i)=>[old,i]));
  cells.splice(0,cells.length,...order.map(i=>original[i]));
  const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
  const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
  const scale=Math.min(95,740/Math.max(1,maxX-minX),360/Math.max(1,maxY-minY));
  const kinds=['meadow','wooded edge','stone ruins','open clearing','rocky verge'];
  const rooms=cells.map((cell,i)=>{
    const boss=p.regionType!=='spawn'&&i===p.count-1;
    const top=Math.max(.45,p.groundTopFrac+(random()-.5)*.035),bottom=p.groundBottomFrac;
    const room={id:`${p.id}-${i+1}`,displayName:`${p.name} ${i+1}`,regionId:p.id,role:boss?'boss':i===0?'entrance':'encounter',composition:boss?'boss clearing':kinds[Math.floor(random()*kinds.length)],backgroundImage:`assets/rooms/${p.id}-${i+1}.png`,groundTopFrac:top,groundBottomFrac:bottom,spawnXFrac:p.spawnXFrac,spawnYFrac:(top+bottom)/2,exits:{},links:{},mobs:[],map:{areaId:p.id,areaName:p.name,biome:p.biome,x:120+(cell.x-minX)*scale,y:180+(cell.y-minY)*scale,gridX:cell.x,gridY:cell.y,worldX:p.mapX,worldY:p.mapY}};
    const count=boss?1:p.regionType==='spawn'? (i===1?1:0):2+Math.floor(random()*3);
    for(let m=0;m<count;m++)room.mobs.push({id:`${room.id}-mob-${m+1}`,definitionId:boss?'placeholder-boss':['placeholder-melee','placeholder-ranged','placeholder-elite'][Math.floor(random()*3)],role:boss?'boss':'normal',xFrac:.22+(m+.5)/count*.56,yFrac:top+.08+random()*Math.max(.01,bottom-top-.16)});
    return room;
  });
  function connect(a,b){const dx=cells[b].x-cells[a].x,dy=cells[b].y-cells[a].y;const dir=Object.keys(STEPS).find(d=>STEPS[d][0]===dx&&STEPS[d][1]===dy);if(!dir)return;rooms[a].exits[dir]={roomId:rooms[b].id,entry:OPPOSITE[dir],at:.5};rooms[b].exits[OPPOSITE[dir]]={roomId:rooms[a].id,entry:dir,at:.5};}
  for(const [a,b]of edges)connect(remap.get(a),remap.get(b));
  // Occasional shortcuts form loops, but the boss remains a terminal room.
  for(let a=1;a<rooms.length-2;a++)for(let b=a+2;b<rooms.length-1;b++)if(Math.abs(cells[a].x-cells[b].x)+Math.abs(cells[a].y-cells[b].y)===1&&random()<.35)connect(a,b);
  if(p.connectFrom)rooms[0].exits.west={roomId:p.connectFrom,entry:p.connectDirection,at:.5};
  return rooms;
}
