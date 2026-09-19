const KEY='cardslayer-controls';
export const DEFAULT_CONTROLS={mode:'both',haptics:true,keys:{up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',confirm:'KeyE',cancel:'Escape'}};
export function loadControls(){try{const p=JSON.parse(localStorage.getItem(KEY));return {...DEFAULT_CONTROLS,...p,mode:['tap','joystick','both'].includes(p?.mode)?p.mode:'both',keys:{...DEFAULT_CONTROLS.keys,...p?.keys}};}catch{return structuredClone(DEFAULT_CONTROLS);}}
export function saveControls(p){localStorage.setItem(KEY,JSON.stringify(p));window.dispatchEvent(new Event('cardslayer-controls'));}
export function controlsForm({compact=false}={}){
 const form=document.createElement('div');form.className='controls-settings';const p=loadControls();
 const label=document.createElement('p');label.textContent='Move your way. You can change this in Settings.';form.append(label);
 const group=document.createElement('div');group.className='control-options';
 for(const [mode,title]of [['both','Joystick + tap'],['tap','Tap to move'],['joystick','Joystick']]){
  const button=document.createElement('button');button.type='button';button.className='btn-small btn-ghost';button.textContent=title;button.setAttribute('aria-pressed',String(p.mode===mode));button.onclick=()=>{p.mode=mode;saveControls(p);for(const b of group.children)b.setAttribute('aria-pressed',String(b===button));};group.append(button);
 }form.append(group);
 const haptic=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=p.haptics;check.onchange=()=>{p.haptics=check.checked;saveControls(p);};haptic.append(check,' Subtle vibration (supported phones)');form.append(haptic);
 const tip=document.createElement('p');tip.textContent='Desktop: WASD / arrows to move. E selects the nearest nearby enemy; press again to fight. Escape goes back.';form.append(tip);
 if(!compact){
 const fields=document.createElement('div');fields.className='key-bindings';
 for(const [action,code]of Object.entries(p.keys)){
 const label=document.createElement('label'),button=document.createElement('button');label.textContent=action+' ';button.type='button';button.className='btn-small btn-ghost';button.textContent=code.replace('Key','');
 button.onclick=()=>{button.textContent='Press a key';button.onkeydown=e=>{e.preventDefault();e.stopPropagation();if(e.ctrlKey||e.metaKey||e.altKey||['Tab','ShiftLeft','ShiftRight'].includes(e.code))return;if(e.code.startsWith('Arrow') || e.code==='Space'){button.textContent='Reserved key';return;}for(const [other,value]of Object.entries(p.keys))if(other!==action&&value===e.code){button.textContent='Already used';return;}p.keys[action]=e.code;saveControls(p);button.textContent=e.code.replace('Key','');button.onkeydown=null;};};button.onblur=()=>{button.onkeydown=null;button.textContent=p.keys[action].replace('Key','');};label.append(button);fields.append(label);
 }form.append(fields);
 }return form;
}
