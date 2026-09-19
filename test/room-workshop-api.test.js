import { it, expect } from 'vitest';
import http from 'node:http';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoomWorkshopApi } from '../server/room-workshop.js';
import { validateRoomPng } from '../server/room-png.js';
function png(width=1920,height=1080) {
  const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,data])),out.length-4);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc((width*3+1)*height))),chunk('IEND',Buffer.alloc(0))]);
}
it('rejects incomplete or damaged PNGs before publishing',()=>{
  const valid=png();expect(()=>validateRoomPng(valid)).not.toThrow();
  expect(()=>validateRoomPng(valid.subarray(0,24))).toThrow();
  const damaged=Buffer.from(valid);damaged[damaged.length-8]^=1;
  expect(()=>validateRoomPng(damaged)).toThrow();
});
it('queues validated projects locally, reports missing images, and rejects cross-origin writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'room-workshop-'));
  const handler=createRoomWorkshopApi({enabled:true,gameRoot:root});
  const server=http.createServer((req,res)=>handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  await mkdir(join(root,'data/zones'),{recursive:true});
  await writeFile(join(root,'data/zones/plains.json'),JSON.stringify({id:'plains',displayName:'Plains',links:{prev:null,next:null}}));
  const body=JSON.stringify({connectFrom:'plains',mapX:420,biome:'forest',id:'garden',name:'Garden',prompt:'Sunny cottage garden',count:2,groundTopFrac:.73,groundBottomFrac:.79});
  try {
    const denied=await fetch(`${base}/dev-api/rooms/jobs`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body});
    expect(denied.status).toBe(403);
    const response=await fetch(`${base}/dev-api/rooms/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body});
    expect(response.status).toBe(201);const {id}=await response.json();
    expect(await readFile(join(root,'output/room-workshop/jobs',id,'garden-1.txt'),'utf8')).toContain('GROUND CONTRACT');
    const status=await (await fetch(`${base}/dev-api/rooms/jobs/${id}`)).json();
    expect(status.ready).toBe(0);expect(status.images).toEqual([null,null]);
    const install=await fetch(`${base}/dev-api/rooms/jobs/${id}/install`,{method:'POST'});
    expect(install.status).toBe(400);
    for(const name of ['garden-1','garden-2'])await writeFile(join(root,'output/room-workshop/jobs',id,`${name}.png`),png());
    const finished=await fetch(`${base}/dev-api/rooms/jobs/${id}/install`,{method:'POST'});
    expect(finished.status).toBe(201);
    expect(JSON.parse(await readFile(join(root,'data/zones/garden-1.json'),'utf8')).links.next).toBe('garden-2');
    const catalog=JSON.parse(await readFile(join(root,'data/zones/index.json'),'utf8'));
    expect(catalog.map(r=>r.id)).toEqual(['garden-1','garden-2','plains']);
    expect(JSON.parse(await readFile(join(root,'data/zones/plains.json'),'utf8')).links.next).toBe('garden-1');
    const first=JSON.parse(await readFile(join(root,'data/zones/garden-1.json'),'utf8'));
    expect(first.links.prev).toBe('plains');expect(first.map).toMatchObject({x:420,biome:'forest'});
    expect((await fetch(`${base}/dev-api/rooms/jobs/${id}/install`,{method:'POST'})).status).toBe(400);
    const blockedJob=await (await fetch(`${base}/dev-api/rooms/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(body),id:'grove',count:1})})).json();
    await writeFile(join(root,'output/room-workshop/jobs',blockedJob.id,'grove-1.png'),png());
    expect((await fetch(`${base}/dev-api/rooms/jobs/${blockedJob.id}/install`,{method:'POST'})).status).toBe(400);
    await expect(readFile(join(root,'data/zones/grove-1.json'))).rejects.toMatchObject({code:'ENOENT'});

  } finally {await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});

it('publishes a fixed region manifest, layout guides and replaceable mob placements',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fixed-region-'));
 const handler=createRoomWorkshopApi({enabled:true,gameRoot:root});
 const server=http.createServer((req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/dev-api/rooms/jobs`;
 try{
  const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:2,regionType:'spawn',id:'spawn',name:'Home',prompt:'Sunny cottage',count:3,seed:'fixed',groundTopFrac:.58,groundBottomFrac:.9})});
  expect(response.status).toBe(201);
  const {id,project}=await response.json(),folder=join(root,'output/room-workshop/jobs',id);
  expect(await readFile(join(folder,'spawn-1-layout.svg'),'utf8')).toContain('LAYOUT GUIDE');
  for(const room of project.rooms)await writeFile(join(folder,room.id+'.png'),png());
  expect((await fetch(base+'/'+id+'/install',{method:'POST'})).status).toBe(201);
  expect(JSON.parse(await readFile(join(root,'data/regions/spawn.json'),'utf8')).roomIds).toEqual(project.rooms.map(r=>r.id));
  expect(JSON.parse(await readFile(join(root,'data/zones/spawn-2.json'),'utf8'))).toEqual(project.rooms[1]);
  const again=await (await fetch(base+'/'+id)).json();expect(again.project.rooms).toEqual(project.rooms);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});

it('accepts native generated widescreen images without resampling, rejects wrong aspect',()=>{
 expect(()=>validateRoomPng(png(1672,941))).not.toThrow();
 expect(()=>validateRoomPng(png(1024,1024))).toThrow();
});
