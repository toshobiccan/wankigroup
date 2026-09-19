// Vector tracing sheets: preserve source pixels; only rigidly move clipped parts.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sampleClip } from '../src/sprites/animation-player.js';
const root=new URL('../',import.meta.url), out=new URL('assets/art-reference/human-base-v3-tracing/',root);
await mkdir(out,{recursive:true});
const image=await readFile(new URL('assets/art-reference/human-base-v3-segmented.png',root));
const run=JSON.parse(await readFile(new URL('data/animations/humanoid/run3.json',root),'utf8'));
const labels=JSON.parse(await readFile(new URL('data/rigs/mannequin-axle-labels.json',root),'utf8'));
// Estimated source-image joint centers, not replacements for production rig data.
const parts=[
 ['hips',null,[515,697],[[410,582],[620,590],[644,670],[566,737],[511,748],[466,686],[387,659]]],
 ['torso','hips',[516,319],[[358,274],[425,247],[568,283],[608,307],[640,361],[620,435],[615,513],[622,592],[547,608],[412,587],[415,527],[353,456],[376,383],[394,330]]],
 ['head','torso',[514,261],[[406,0],[619,0],[641,149],[593,230],[550,238],[488,216],[415,177],[401,104]]],
 ['neck','head',[514,261],[[431,174],[490,219],[551,236],[537,277],[571,284],[558,305],[527,313],[467,292],[425,251]]],
 ['rearUpperArm','torso',[641,368],[[602,302],[659,304],[685,391],[720,539],[690,566],[648,568],[611,528],[626,445],[636,388]]],
 ['rearForearm','rearUpperArm',[683,550],[[648,552],[696,561],[719,538],[757,592],[796,723],[762,753],[730,697],[699,648],[649,598]]],
 ['rearHand','rearForearm',[767,739],[[750,737],[793,719],[830,820],[812,870],[780,899],[756,888],[778,848],[775,818],[760,800],[754,840],[733,850],[724,824],[728,788]]],
 ['frontUpperArm','torso',[335,341],[[358,272],[391,295],[398,341],[377,383],[356,452],[319,501],[294,538],[217,509],[236,437],[262,378],[270,322],[303,283]]],
 ['frontForearm','frontUpperArm',[258,522],[[218,503],[263,512],[294,535],[306,601],[263,677],[260,724],[199,728],[193,656],[181,574]]],
 ['frontHand','frontForearm',[231,728],[[198,722],[259,719],[289,767],[306,815],[301,842],[284,839],[273,813],[267,810],[277,856],[293,876],[285,892],[257,891],[209,870],[180,821]]],
 ['rearThigh','hips',[576,717],[[637,663],[670,738],[690,819],[704,888],[711,976],[655,994],[604,980],[574,903],[531,824],[511,750],[566,731]]],
 ['rearShin','rearThigh',[656,983],[[603,976],[656,990],[710,977],[701,1056],[707,1133],[713,1258],[659,1276],[634,1263],[608,1162],[568,1091],[577,1038]]],
 ['rearFoot','rearShin',[677,1268],[[624,1255],[650,1264],[709,1250],[728,1256],[740,1304],[725,1324],[766,1345],[815,1366],[854,1383],[876,1413],[875,1437],[798,1449],[708,1440],[617,1422],[610,1365],[624,1320],[613,1292]]],
 ['frontThigh','hips',[439,713],[[388,659],[435,660],[473,684],[512,739],[488,831],[453,919],[412,985],[362,986],[321,970],[331,915],[341,822],[344,741]]],
 ['frontShin','frontThigh',[368,978],[[321,965],[365,984],[412,985],[393,1036],[385,1093],[342,1173],[325,1268],[288,1273],[247,1260],[251,1191],[257,1090],[282,1026]]],
 ['frontFoot','frontShin',[287,1269],[[238,1251],[277,1265],[327,1261],[337,1272],[331,1320],[321,1328],[327,1370],[375,1414],[390,1458],[359,1478],[277,1475],[213,1447],[209,1404],[226,1351],[235,1320],[227,1302]]],
];
const order=['rearUpperArm','rearForearm','rearHand','rearThigh','rearShin','rearFoot','torso','neck','frontThigh','frontShin','frontFoot','hips','head','frontUpperArm','frontForearm','frontHand'];
const rotate=([x,y],a)=>[Math.cos(a)*x-Math.sin(a)*y,Math.sin(a)*x+Math.cos(a)*y];
function pose(time) {
 const result={};
 for(const [id,parent,p] of parts) {
  const delta=time===null?{rotation:0,x:0,y:0}:sampleClip(run,id,time,{});
  const a=(parent?result[parent].a:0)+delta.rotation;
  let point=p;
  if(parent){const parentP=parts.find(part=>part[0]===parent)[2],offset=rotate([p[0]-parentP[0],p[1]-parentP[1]],result[parent].a);point=[result[parent].p[0]+offset[0],result[parent].p[1]+offset[1]];}
  else point=[p[0]+delta.x*12,p[1]+delta.y*12];
  const rp=rotate(p,a);result[id]={a,p:point,m:[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),point[0]-rp[0],point[1]-rp[1]]};
 }
 return result;
}
const href=`data:image/png;base64,${image.toString('base64')}`;
const metadata={source:'assets/art-reference/human-base-v3-segmented.png',width:1024,height:1536,status:'approved artwork; estimated tracing anchors, not production calibration',clip:'run3',parts:parts.map(([id,parent,pivot,polygon],index)=>({number:index+1,id,label:labels.points[id],parent,pivot,polygon}))};
await writeFile(new URL('anchors.json',out),JSON.stringify(metadata,null,2));
const sheets=[['idle',null],['run-00',0],['run-25',155],['run-50',310],['run-75',465]];
for(const [name,time] of sheets) {
 const state=pose(time);
 const defs=`<defs><image id="art" width="1024" height="1536" href="${href}"/>${parts.map(([id,,,poly])=>`<clipPath id="${id}"><polygon points="${poly.map(p=>p.join(',')).join(' ')}"/></clipPath>`).join('')}</defs>`;
 const art=time===null?'<use href="#art"/>':order.map(id=>`<g transform="matrix(${state[id].m.join(' ')})"><use href="#art" clip-path="url(#${id})"/></g>`).join('');
 const lines=parts.filter(p=>p[1]).map(([id,parent])=>`<path d="M${state[parent].p.join(',')} L${state[id].p.join(',')}" stroke="#d5223a" stroke-width="3" stroke-dasharray="9 7" opacity=".65"/>`).join('');
 const dots=parts.map(([id],index)=>{const [x,y]=state[id].p;return `<circle cx="${x}" cy="${y}" r="9" fill="#ee1839" stroke="white" stroke-width="3"/><text x="${x+14}" y="${y+(id==='neck'?30:-12)}" font-size="24" font-family="Arial" fill="#a40722" stroke="white" stroke-width="4" paint-order="stroke">${index+1}</text>`;}).join('');
 const legend=parts.map(([id],i)=>`<text x="1130" y="${210+i*47}" font-size="25" font-family="Arial" fill="#20383a">${i+1}. ${labels.points[id]}</text>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-450 -220 2100 1900"><rect x="-450" y="-220" width="2100" height="1900" fill="#fff"/>${defs}<text x="-370" y="-120" font-family="Arial" font-size="40" fill="#20383a">${name==='idle'?'Idle — axle tracing guide':`Run 3 — ${time} ms`}</text><text x="-370" y="-65" font-family="Arial" font-size="24">Same source pieces · rigid rotations · estimated anchors</text>${art}${lines}${dots}${legend}<text x="-370" y="1630" font-size="24" font-family="Arial">Tracing only: overlap artwork and final anchor calibration still required.</text></svg>`;
 await writeFile(new URL(`${name}.svg`,out),svg);
}
console.log(`Saved ${sheets.length} tracing sheets and anchors.json to ${fileURLToPath(out)}`);
