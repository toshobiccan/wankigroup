import {controlsForm} from './control-settings.js';
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
// This dialogue lives over the real WorldScene; it never simulates combat.
export function mountWizardGuide({mount,player,online,send,onCreate,onMenu,onClose,onAdvance}){
 const host=node('aside',null,'wizard-guide');host.setAttribute('aria-label','Wizard guide');
 const portrait=node('img');portrait.src='assets/wizard-guide.png';portrait.alt='Elder Rowan, your wizard guide';portrait.className='wizard-cutout';host.append(portrait);
 const panel=node('div',null,'wizard-dialogue');panel.append(node('span','ELDER ROWAN','eyebrow'));
 const title=node('h2'),copy=node('p');panel.append(title,copy);let closed=false,busy=false;
 const status=node('p',null,'guide-status');status.setAttribute('role','status');
 const button=(text,act,cls='btn-small')=>{const b=node('button',text,cls);b.type='button';b.onclick=act;return b;};
 const close=()=>{closed=true;host.remove();onClose?.();};
 const act=async action=>{if(busy||closed)return;busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await send(action);if(!closed){close();onAdvance?.();}}catch{if(!closed){status.textContent='Could not save. Please try again.';panel.querySelectorAll('button').forEach(b=>b.disabled=false);}}finally{busy=false;}};
 const step=player.tutorial?.step;
 if(step==='welcome'){
 title.textContent='Welcome home, adventurer.';
 copy.textContent='I’m Rowan. In this world, your knowledge is your strength. First, let’s see who you are.';
 if(!player.characterCreated)panel.append(button('Who are you?',()=>{close();onCreate();}));
 else{
 copy.textContent='That goblin outside your house is here for practice. I’ll show you how your flashcards become attacks.';
 let name;
 if(!online){const label=node('label','Your display name');name=node('input');name.className='text-input';name.value=player.name;name.maxLength=20;label.append(name);panel.append(label);}
 panel.append(button('Continue',()=>act({action:'welcome',...(name?{value:name.value}:{})})));
 }
 }else if(step==='controls'){
 title.textContent='Take your first steps.';copy.textContent='Tap the ground or use the joystick to walk. On a keyboard, use WASD or the arrows.';panel.append(controlsForm({compact:true}),button('Find the goblin',()=>act({action:'controls'})));
 }else if(step==='combat'){
 title.textContent='A little practice.';copy.textContent='Select the goblin outside the house, then press Fight. You’ll walk into range. Reveal each answer and grade your recall; correct answers strike the goblin.';
 panel.append(button('Let me try',close));
 }else if(step==='reward'){
 title.textContent='Well fought.';copy.textContent='You used the same movement, cards and combat you’ll use on every adventure. Your first goblin earns 30 XP once. Choose a deck from Menu whenever you’re ready.';
 panel.append(button('Choose a deck',async()=>{if(busy)return;busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await send({action:'reward'});if(closed)return;close();onMenu();}catch{if(closed)return;busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);status.textContent='Could not save. Please try again.';}}),button('Keep exploring',()=>act({action:'reward'}),'btn-small btn-ghost'));
 }
 panel.append(status);
 if(player.characterCreated && step!=='reward')panel.append(button('Skip guidance',()=>act({action:'skip'}),'link-btn'));
 host.append(panel);mount.append(host);return ()=>{closed=true;host.remove();};
}
