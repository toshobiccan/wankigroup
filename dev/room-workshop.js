import { roomExits,exitPoint } from '../src/world/room-exits.js';
import { loadWorldMap, renderWorldMap } from '../src/world/world-map.js';
import { buildRoomProject, roomPrompt } from '../src/world/room-workshop.js';
const $=id=>document.getElementById(id), canvas=$('preview'), ctx=canvas.getContext('2d');
const key='cardslayer-room-workshop-v1';
let existingZones=[];
let project, selected=0, job=null, images=[], busy=false;
const say=message=>{$('status').textContent=message;};
function read() { const input={version:$('region-type').value==='legacy'?1:2,regionType:$('region-type').value,seed:$('seed').value,mapX:Number($('map-x').value),mapY:Number($('map-y').value),biome:$('biome').value,connectFrom:$('connect-from').value,id:$('area-id').value,name:$('area-name').value,prompt:$('brief').value,count:Number($('count').value),groundTopFrac:Number($('top').value)/100,groundBottomFrac:Number($('bottom').value)/100,spawnXFrac:Number($('spawn').value)/100};
 const same=(key)=>typeof input[key]==='number'?Math.abs(input[key]-project?.[key])<1e-9:input[key]===project?.[key];
 if(project?.version===2&&Object.keys(input).every(same))return project;
 if(project?.version===2&&input.version===2&&['id','regionType','count','seed','groundTopFrac','groundBottomFrac'].every(same)){
   input.rooms=structuredClone(project.rooms);
   if(input.connectFrom!==project.connectFrom){
     delete input.rooms[0].exits.west;
     if(input.connectFrom)input.rooms[0].exits.west={roomId:input.connectFrom,entry:'east',at:.5};
   }
 }
 return buildRoomProject(input); }
function fill(p) { $('region-type').value=p.regionType??'legacy';$('seed').value=p.seed??p.id; $('map-x').value=p.mapX;$('map-y').value=p.mapY;$('biome').value=p.biome; if(p.connectFrom && !Array.from($('connect-from').options).some(o=>o.value===p.connectFrom)) $('connect-from').add(new Option(p.connectFrom,p.connectFrom)); $('connect-from').value=p.connectFrom; $('area-id').value=p.id;$('area-name').value=p.name;$('brief').value=p.prompt;$('count').value=p.count;$('top').value=Number((p.groundTopFrac*100).toFixed(4));$('bottom').value=Number((p.groundBottomFrac*100).toFixed(4));$('spawn').value=p.spawnXFrac*100; }
function backup() { try {localStorage.setItem(key,JSON.stringify({project,job}));} catch {say('Draft could not be stored locally. Download a project backup.');} }
function paint() {
  if(!project)return;
  renderWorldMap($('area-map'),project.rooms,{title:project.name,selectedId:project.rooms[selected]?.id,onSelect:room=>{const i=project.rooms.findIndex(r=>r.id===room.id);if(i>=0){selected=i;paint();}}});
  selected=Math.min(selected,project.count-1);
  $('rooms').replaceChildren(...project.rooms.map((room,index)=>{
    const b=document.createElement('button');b.textContent=room.displayName;b.setAttribute('aria-pressed',String(index===selected));b.onclick=()=>{selected=index;paint();};return b;
  }));
  const room=project.rooms[selected];
  ctx.fillStyle='#4d7277';ctx.fillRect(0,0,960,540);
  if(images[selected]) ctx.drawImage(images[selected],0,0,960,540);
  else {ctx.fillStyle='#79935e';ctx.fillRect(0,room.groundTopFrac*540,960,540);ctx.fillStyle='#edf0db';ctx.font='22px Georgia';ctx.fillText('Layout only — background not generated',24,48);}
  const top=room.groundTopFrac*540,bottom=room.groundBottomFrac*540;
  ctx.fillStyle='#eed78333';ctx.fillRect(0,top,960,bottom-top);ctx.strokeStyle='#f4d77c';ctx.lineWidth=2;
  for(const y of [top,bottom]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}
  ctx.beginPath();ctx.arc(project.spawnXFrac*960,(top+bottom)/2,8,0,Math.PI*2);ctx.fillStyle='#ffe49a';ctx.fill();
  for(const [direction,exit]of Object.entries(roomExits(room))){
    const p=exitPoint(room,direction,exit.at,.015);ctx.fillStyle='#ffe49a';ctx.beginPath();ctx.arc(p.x*960,p.y*540,9,0,Math.PI*2);ctx.fill();
    ctx.font='14px system-ui';ctx.fillText(direction,Math.max(10,Math.min(890,p.x*960)),p.y*540-15);
  }
  for(const mob of room.mobs??[]){ctx.fillStyle=mob.role==='boss'?'#b84252':'#7253a0';ctx.beginPath();ctx.arc(mob.xFrac*960,(mob.yFrac??(room.groundTopFrac+room.groundBottomFrac)/2)*540,12,0,Math.PI*2);ctx.fill();}
  $('caption').textContent=`${room.id} · ${Object.entries(roomExits(room)).map(([d,e])=>d+': '+e.roomId).join(' | ')} · ${room.role??'room'} · ${images[selected]?'Generated background':'No generated background'}`;
  $('prompt').textContent=roomPrompt(project,selected);
  $('install').disabled=busy || !job || images.filter(Boolean).length!==project.count;
}
function guard(fn) { return async()=>{if(busy)return;busy=true;$('install').disabled=true;try{await fn();}catch(error){say(error.message);}finally{busy=false;paint();}}; }
async function api(path,body) {
  const r=await fetch(`/dev-api/rooms/${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({error:'Room API unavailable. Use the updated local offline server.'}));
  if(!r.ok)throw new Error(data.error??'Request failed');return data;
}
function update() {project=read();job=null;images=[];backup();paint();}
$('build').onclick=guard(()=>{update();say('Layout updated. Prepare for Codex when ready.');});
$('queue').onclick=guard(async()=>{
  const next=read(); const data=await api('jobs',next);
  project=data.project;job=data.id;images=[];backup();
  say(`Queued ${project.count} rooms. Ask Codex: “Generate the queued rooms.”\nJob: ${job}`);
});
$('refresh').onclick=guard(async()=>{
  if(!job)throw new Error('Prepare a Codex job first.');
  const data=await api(`jobs/${job}`);
  const decoded=await Promise.all(data.images.map(async src=>{if(!src)return null;const img=new Image();img.src=src;await img.decode();return img;}));
  project=data.project;images=decoded;fill(project);backup();say(`${data.ready}/${project.count} generated rooms ready for review.`);
});
$('install').onclick=guard(async()=>{
  const data=await api(`jobs/${job}/install`,{});await refreshMap();say(`Installed: ${data.installed.join(', ')}. Area links are ready; the current game spawn is unchanged.`);
});
$('export').onclick=guard(()=>{
  const p=read(),url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`${p.id}-project.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
});
$('load').onclick=()=>$('file').click();
$('file').onchange=guard(async()=>{const file=$('file').files[0];if(!file)return;if(file.size>128000)throw new Error('Project file too large.');const p=buildRoomProject(JSON.parse(await file.text()));fill(p);project=p;job=null;images=[];backup();paint();say('Project loaded.');});
canvas.onclick=event=>{
  if(busy || !project)return;const rect=canvas.getBoundingClientRect(),y=(event.clientY-rect.top)/rect.height;
  if(y<project.groundTopFrac || y>project.groundBottomFrac)return;
  $('spawn').value=Math.round(Math.max(.05,Math.min(.95,(event.clientX-rect.left)/rect.width))*100);
  try {update();say('Spawn updated. Prepare a new job to use this layout.');}catch(error){say(error.message);}
};
try {const saved=JSON.parse(localStorage.getItem(key));if(saved?.project){project=buildRoomProject(saved.project);job=/^[a-f0-9-]{36}$/.test(saved.job)?saved.job:null;fill(project);}}catch{}
project??=read();paint();if(job)say(`Restored pending job ${job}. Check generated rooms to load its images.`);

async function refreshMap(){
  existingZones=await loadWorldMap();
  const selectedExit=$('connect-from').value;
  $('connect-from').replaceChildren(new Option('Separate area',''));
  for(const room of existingZones.filter(r=>!roomExits(r).east)) $('connect-from').add(new Option(room.displayName??room.id,room.id));
  if(selectedExit && !Array.from($('connect-from').options).some(o=>o.value===selectedExit)) $('connect-from').add(new Option(selectedExit+' (occupied or not installed)',selectedExit));
  $('connect-from').value=selectedExit;
  paint();
}
refreshMap().catch(error=>say('Map catalog: '+error.message));

$('region-type').onchange=()=>{
 const type=$('region-type').value;
 $('count').value=type==='spawn'?3:type==='plains'?14:$('count').value;
 $('top').value=type==='legacy'?73:58;$('bottom').value=type==='legacy'?79:90;
};
$('variation').onclick=guard(()=>{$('seed').value=crypto.randomUUID();update();say('New draft variation. Installed rooms never change.');});
$('brief-layout').onclick=guard(()=>{
 const brief=$('brief').value;
 const type=/plains region|grassland region/i.test(brief)?'plains':/spawn|house|cottage/i.test(brief)?'spawn':/plains|grassland/i.test(brief)?'plains':'custom';
 $('region-type').value=type;$('region-type').onchange();
 const count=brief.match(/\b(\d{1,2})\s*rooms?\b/i);
 if(count)$('count').value=Number(count[1]);
 if(/forest|woods/i.test(brief))$('biome').value='forest';
 else if(type==='spawn')$('biome').value='village';
 else if(type==='plains')$('biome').value='plains';
 update();say('Fixed region draft built. Inspect the layout, then Prepare for Codex.');
});

$('preview-region').onclick=guard(()=>{const next=read();if(JSON.stringify(next)!==JSON.stringify(project))update();else backup();window.location.href='region-preview.html';});

for(const type of ['spawn','plains'])$('load-'+type).onclick=guard(async()=>{
 const response=await fetch('../data/region-templates/'+type+'.json');
 if(!response.ok)throw new Error('Region template unavailable.');
 project=buildRoomProject(await response.json());selected=0;job=null;images=[];fill(project);backup();paint();
 say('Loaded fixed '+type+' draft. Installed game rooms are unchanged.');
});
