export const OPPOSITE = { west:'east', east:'west', north:'south', south:'north' };
export function roomExits(room) {
  if(room.exits) return room.exits;
  const exits={};
  if(room.links?.prev) exits.west={roomId:room.links.prev,entry:'east',at:.5};
  if(room.links?.next) exits.east={roomId:room.links.next,entry:'west',at:.5};
  return exits;
}
export function exitPoint(room,direction,at=.5,inset=0) {
  const top=room.groundTopFrac??.72,bottom=room.groundBottomFrac??.8;
  if(direction==='west')return {x:inset,y:top+(bottom-top)*at};
  if(direction==='east')return {x:1-inset,y:top+(bottom-top)*at};
  return {x:at,y:direction==='north'?top+inset:bottom-inset};
}
export function reachedExit(room,position,margin=.008) {
  for(const [direction,exit]of Object.entries(roomExits(room))){
    const p=exitPoint(room,direction,exit.at);
    const horizontal=direction==='west'||direction==='east';
    if(Math.abs(position[horizontal?'x':'y']-p[horizontal?'x':'y'])<=margin && Math.abs(position[horizontal?'y':'x']-p[horizontal?'y':'x'])<=.06)return {direction,...exit};
  }
  return null;
}
