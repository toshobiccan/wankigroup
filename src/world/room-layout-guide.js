import { roomExits,exitPoint } from './room-exits.js';
export function roomLayoutGuide(room){
  const top=room.groundTopFrac*1080,bottom=room.groundBottomFrac*1080;
  const exits=Object.entries(roomExits(room)).map(([d,e])=>{const p=exitPoint(room,d,e.at,.012);return `<circle cx="${p.x*1920}" cy="${p.y*1080}" r="24" fill="#ffd15b"/><text x="${Math.max(45,Math.min(1740,p.x*1920))}" y="${p.y*1080-32}" font-size="26">${d}</text>`;}).join('');
  const mobs=(room.mobs??[]).map(m=>`<circle cx="${m.xFrac*1920}" cy="${(m.yFrac??(room.groundTopFrac+room.groundBottomFrac)/2)*1080}" r="24" fill="${m.role==='boss'?'#aa4355':'#665195'}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#b1c9ce"/><rect y="${top}" width="1920" height="${bottom-top}" fill="#92ad68" stroke="#423d2e" stroke-width="4"/><text x="50" y="70" font-size="32">LAYOUT GUIDE ONLY — do not paint markers into the background</text>${exits}${mobs}</svg>`;
}
