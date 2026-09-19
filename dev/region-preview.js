import { WorldScene } from '../src/world/world-scene.js';
import { roomExits } from '../src/world/room-exits.js';
const status=document.getElementById('status');
const urls=new Map();let scene;
try{
  const project=JSON.parse(localStorage.getItem('cardslayer-room-workshop-v1'))?.project;
  if(!project?.rooms?.length)throw new Error('Build a region in Room Workshop first.');
  const ids=new Set(project.rooms.map(r=>r.id));
  for(const room of project.rooms){
    const copy={...room,blank:true,exits:Object.fromEntries(Object.entries(roomExits(room)).filter(([,exit])=>ids.has(exit.roomId)))};
    urls.set(room.id,URL.createObjectURL(new Blob([JSON.stringify(copy)],{type:'application/json'})));
  }
  scene=new WorldScene({mountElement:document.getElementById('stage'),zoneUrlForId:id=>urls.get(id),onPageEnter:id=>{
    const room=project.rooms.find(r=>r.id===id);document.getElementById('room-name').textContent=room.displayName+' — '+(room.role??'room');
    const controls=document.getElementById('destinations');controls.replaceChildren();
    for(const [direction,exit]of Object.entries(roomExits(room))){
      if(!ids.has(exit.roomId))continue;
      const button=document.createElement('button');button.textContent='Walk '+direction;
      button.onclick=()=>scene.walkToExit(direction);controls.append(button);
    }
    status.textContent='Fixed layout · '+project.rooms.length+' rooms · '+(room.mobs?.length??0)+' mob placements';
  },onCombatStart:()=>{scene.endCombat({mobDefeated:false});status.textContent='Movement preview only. Combat uses the normal game after installation.';}});
  await scene.loadZone(urls.get(project.rooms[0].id));
}catch(error){status.textContent=error.message;}
