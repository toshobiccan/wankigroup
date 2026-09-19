import { WorldScene } from "../src/world/world-scene.js";

const scene = new WorldScene({ mountElement: document.getElementById("stage") });
scene.loadZone("../data/zones/plains1.json");
setInterval(()=>{
  if(!scene._pageReady)return;
  document.getElementById('movement-status').textContent=`${scene.pageId} · Player ${scene.position.x.toFixed(1)}, ${scene.position.y.toFixed(1)} · Camera ${scene.cameraX.toFixed(1)}, ${scene.cameraY.toFixed(1)} · Zoom ${scene.zoom.toFixed(2)} · ${scene.inCombat?'Combat':scene._approaching?'Approaching':scene._wasMoving?'Running':'Idle'}`;
},200);
