import { loadControls } from '../ui/control-settings.js';
import { movementVector } from './world-movement.js';

const KEYS = { KeyW: [0,-1], ArrowUp: [0,-1], KeyS: [0,1], ArrowDown: [0,1], KeyA: [-1,0], ArrowLeft: [-1,0], KeyD: [1,0], ArrowRight: [1,0] };
function modalOpen(){const modal=document.getElementById('modal');return modal && !modal.hidden;}
export class WorldInput {
  constructor(mount, onAction) {
    this.preferences=loadControls();
    this.active = true; this.keys = new Set(); this.pad = {x:0,y:0};
    this.controller = new AbortController(); const signal = this.controller.signal;
    if (!document.querySelector('link[data-world-controls]')) {
      const link = document.createElement('link'); link.rel='stylesheet'; link.href=new URL('./world-controls.css',import.meta.url).href; link.dataset.worldControls=''; document.head.append(link);
    }
    this.root=document.createElement('div'); this.root.className='world-controls';
    this.root.innerHTML='<div class="world-dpad" role="group" aria-label="Movement"><span>▲</span><span>◀</span><span>●</span><span>▶</span><span>▼</span></div><div class="world-actions"><button type="button" aria-label="Cancel movement or selection">B</button><button type="button" aria-label="Select nearest enemy or engage selected enemy">A</button></div>';
    mount.append(this.root);
    const sync=()=>{this.preferences=loadControls();this.root.dataset.mode=this.preferences.mode;this.reset();};
    window.addEventListener('cardslayer-controls',sync,{signal});sync();
    const vibrate=()=>{if(this.preferences.haptics)navigator.vibrate?.(8);};
    const pad=this.root.querySelector('.world-dpad'); let pointer=null;
    const update=e=>{const r=pad.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);this.pad=movementVector(Math.abs(x)>.15?x:0,Math.abs(y)>.15?y:0);};
    pad.addEventListener('pointerdown',e=>{if(!this.active || pointer!==null)return;e.preventDefault();pointer=e.pointerId;pad.setPointerCapture(pointer);vibrate();update(e);});
    pad.addEventListener('pointermove',e=>{if(e.pointerId===pointer)update(e);});
    const release=e=>{if(e.pointerId===pointer){pointer=null;this.pad={x:0,y:0};}};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,release);
    this.root.querySelectorAll('button').forEach((b,i)=>b.addEventListener('click',()=>{if(this.active && !modalOpen()){vibrate();onAction(i?'confirm':'cancel');}}));
    window.addEventListener('keydown',e=>{
      if(!this.active || modalOpen() || !mount.getBoundingClientRect().height || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
      if(e.code==='Space' && e.target.closest?.('button'))return;
      if(this.keyVector(e.code)){e.preventDefault();this.keys.add(e.code);}
      else if(!e.repeat && [this.preferences.keys.confirm,'Space',this.preferences.keys.cancel].includes(e.code)){e.preventDefault();onAction(e.code===this.preferences.keys.cancel?'cancel':'confirm');}
    },{signal});
    window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal});
    window.addEventListener('blur',()=>this.reset(),{signal});
    document.addEventListener('focusin',e=>{if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))this.reset();},{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();},{signal});
  }
  keyVector(code){const directions={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};for(const [action,vector]of Object.entries(directions))if(this.preferences.keys[action]===code)return vector;return code.startsWith("Arrow")?KEYS[code]:null;}
  get vector(){if(modalOpen()){this.reset();return {x:0,y:0};}let x=this.pad.x,y=this.pad.y;for(const key of this.keys){const v=this.keyVector(key);if(v){x+=v[0];y+=v[1];}}return this.active?movementVector(x,y):{x:0,y:0};}
  get touch(){return matchMedia('(pointer: coarse)').matches || this.root.parentElement.classList.contains('preview-touch');}
  reset(){this.keys.clear();this.pad={x:0,y:0};}
  setActive(active){this.active=active;this.root.hidden=!active;if(!active)this.reset();}
  destroy(){this.controller.abort();this.root.remove();}
}
