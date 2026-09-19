import { roomExits } from './room-exits.js';
export function worldRegions(zones){
  const groups=new Map(),owners=new Map();
  for(const room of zones){
    const id=room.regionId??room.map?.areaId??'legacy';
    if(!groups.has(id))groups.set(id,{id,displayName:room.map?.areaName??'The Green March',rooms:[],exits:{},map:{areaId:id,areaName:'',biome:room.map?.biome??'plains',x:room.map?.worldX??room.map?.x??240,y:room.map?.worldY??room.map?.y??330}});
    groups.get(id).rooms.push(room);owners.set(room.id,id);
  }
  for(const room of zones)for(const exit of Object.values(roomExits(room))){
    const from=owners.get(room.id),to=owners.get(exit.roomId);
    if(to&&to!==from)groups.get(from).exits[to]={roomId:to};
  }
  return [...groups.values()];
}
export function mapGraph(zones) {
  const seen=new Set();
  const nodes=zones.filter(zone=>{if(!zone?.id||seen.has(zone.id))return false;seen.add(zone.id);return true;}).map((zone,i)=>({
    ...zone,x:Number.isFinite(zone.map?.x)?zone.map.x:240+(i%6)*85,
    y:Number.isFinite(zone.map?.y)?zone.map.y:330+Math.floor(i/6)*100,
    biome:zone.map?.biome??'plains',areaName:zone.map?.areaName??'The Green March',
  }));
  const ids=new Set(nodes.map(node=>node.id)),edges=[],keys=new Set();
  for(const node of nodes)for(const other of Object.values(roomExits(node)).map(exit=>exit.roomId)) {
    if(!ids.has(other)||other===node.id)continue;
    const key=[node.id,other].sort().join('|');
    if(!keys.has(key)){keys.add(key);edges.push([node.id,other]);}
  }
  return {nodes,edges};
}

export async function loadWorldMap() {
  const indexResponse=await fetch('/data/zones/index.json',{cache:'no-store'});
  if(!indexResponse.ok)throw new Error('World map is unavailable.');
  const index=await indexResponse.json();
  return Promise.all(index.map(async entry=>{
    if(!/^[a-z][a-z0-9-]{0,59}$/.test(entry.id))throw new Error('Invalid room in map catalog.');
    const response=await fetch(`/data/zones/${entry.id}.json`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Could not load room ${entry.id}.`);
    return response.json();
  }));
}

const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs={},text) {const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
function terrain(biome,x,y) {
  const g=svgNode('g',{transform:`translate(${x} ${y})`,'aria-hidden':'true'});
  const shape=(d,fill)=>g.append(svgNode('path',{d,fill,stroke:'#65583b','stroke-width':2,'stroke-linejoin':'round'}));
  if(biome==='mountains'){shape('M-30 10 L-10-27 L4-3 L18-37 L43 10Z','#a4a58a');shape('M9-23 L18-37 L28-16 L19-21 L15-16Z','#eee5c9');}
  else if(biome==='forest'){for(const dx of [-19,0,22]){g.append(svgNode('path',{d:`M${dx} 12v-19`,stroke:'#65583b','stroke-width':3}));shape(`M${dx-14} 1 L${dx}-31 L${dx+14} 1Z`,'#728866');}}
  else if(biome==='village'){shape('M-17 10V-15H18V10Z','#e6d3a3');shape('M-23-13L0-33L24-13Z','#a56f4d');shape('M-4 10V-3H5V10Z','#66553d');}
  else if(biome==='coast'){g.append(svgNode('path',{d:'M-30 0q10-10 20 0t20 0t20 0 M-20 12q10-10 20 0t20 0',fill:'none',stroke:'#698f94','stroke-width':3}));}
  else {g.append(svgNode('path',{d:'M-30 10Q-9-16 17 8 M4 13Q20-8 41 10',fill:'none',stroke:'#8c9b68','stroke-width':3}));}
  return g;
}

export function renderWorldMap(mount,zones,{currentId,onSelect,selectedId,title="THE KNOWN REALMS"}={}) {
  const {nodes,edges}=mapGraph(zones),byId=new Map(nodes.map(node=>[node.id,node]));
  const svg=svgNode('svg',{viewBox:'0 0 1000 680',class:'fantasy-map',role:'group','aria-label':'World map. Select a room to inspect its paths.'});
  svg.append(svgNode('image',{href:'/assets/world-map-adventure.png',width:1000,height:680,preserveAspectRatio:'xMidYMid slice','aria-hidden':'true'}));
  svg.append(svgNode('rect',{x:280,y:20,width:440,height:48,rx:4,fill:'#243d47',stroke:'#c3a566','stroke-width':2,opacity:.94}));
  svg.append(svgNode('text',{x:500,y:51,'text-anchor':'middle',fill:'#f2e6c2','font-family':'Georgia','font-size':21,'letter-spacing':3},title.slice(0,40)));
  for(const [from,to]of edges){const a=byId.get(from),b=byId.get(to);svg.append(svgNode('path',{d:`M${a.x} ${a.y}Q${(a.x+b.x)/2} ${(a.y+b.y)/2-16} ${b.x} ${b.y}`,fill:'none',stroke:'#fff0c1','stroke-width':4,'stroke-dasharray':'7 6'}));}
  const areas=new Set();
  for(const node of nodes){
    const key=node.map?.areaId??node.areaName;
    svg.append(terrain(node.biome,node.x,node.y-42));
    if(!areas.has(key)){areas.add(key);svg.append(svgNode('text',{x:node.x,y:node.y-94,fill:'#fff4d5',stroke:'#253d36','stroke-width':3,'paint-order':'stroke','font-family':'Georgia','font-size':20,'font-style':'italic'},node.areaName));}
    const active=node.id===currentId,selected=node.id===selectedId;
    const name=node.displayName??node.id;
    const label=node.map?.areaName && name.startsWith(node.map.areaName+' ')?'Room '+name.slice(node.map.areaName.length+1):name;
    const button=svgNode('g',{class:'map-room',role:'button',tabindex:0,'aria-label':`${node.displayName??node.id}${active?', you are here':''}${node.blank?', unfinished room':node.role==='boss'?', boss room':''}`,'aria-pressed':selected});
    button.append(svgNode('circle',{cx:node.x,cy:node.y,r:23,fill:'transparent'}));
    if(active)button.append(svgNode('circle',{cx:node.x,cy:node.y,r:17,fill:'none',stroke:'#ae7439','stroke-width':3}));
    button.append(svgNode('circle',{cx:node.x,cy:node.y,r:selected?11:9,fill:active?'#b9783e':node.blank?'#cbbd9a':'#617b5c',stroke:'#463e2c','stroke-width':3}));
    button.append(svgNode('text',{x:node.x,y:node.y+36,'text-anchor':'middle',fill:'#fff5d5',stroke:'#253d36','stroke-width':3,'paint-order':'stroke','font-family':'Georgia','font-size':16},label));
    const choose=()=>onSelect?.(node);button.addEventListener('click',choose);button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});svg.append(button);
  }
  mount.replaceChildren(svg);
}
