import { roomExits } from '../src/world/room-exits.js';
import { roomLayoutGuide } from '../src/world/room-layout-guide.js';
import { buildZonesIndex } from '../tools/build-zones-index.mjs';
import { mkdir, writeFile, readFile, access, unlink, open, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildRoomProject, roomPrompt } from '../src/world/room-workshop.js';
import { validateRoomPng } from './room-png.js';

export function createRoomWorkshopApi({ enabled, gameRoot = fileURLToPath(new URL('../', import.meta.url)) }) {
  const root = join(gameRoot, 'output/room-workshop/jobs');
  let installing = Promise.resolve();
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/dev-api/rooms/')) return false;
    const reply = (code, data) => { res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
    let hostname;
    try { hostname = new URL(`http://${req.headers.host}`).hostname; } catch {}
    if (!enabled || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !['localhost','127.0.0.1','[::1]'].includes(hostname) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
      reply(403,{error:'Available only on the local offline development server.'}); return true;
    }
    try {
      if (req.method === 'POST' && url.pathname === '/dev-api/rooms/jobs') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON required.');
        let bytes=0; const chunks=[];
        for await(const chunk of req) { bytes+=chunk.length; if(bytes>128000) throw new Error('Request too large.'); chunks.push(chunk); }
        const project=buildRoomProject(JSON.parse(Buffer.concat(chunks).toString()));
        const id=randomUUID(), folder=join(root,id);
        await mkdir(folder,{recursive:true});
        await writeFile(join(folder,'project.json'),JSON.stringify(project,null,2));
        for(let i=0;i<project.count;i++){await writeFile(join(folder,`${project.rooms[i].id}.txt`),roomPrompt(project,i));await writeFile(join(folder,`${project.rooms[i].id}-layout.svg`),roomLayoutGuide(project.rooms[i]));}
        reply(201,{id,project}); return true;
      }
      const match=url.pathname.match(/^\/dev-api\/rooms\/jobs\/([a-f0-9-]{36})(\/install)?$/);
      if (!match) { reply(404,{error:'Unknown room workshop request.'}); return true; }
      const folder=join(root,match[1]);
      const project=buildRoomProject(JSON.parse(await readFile(join(folder,'project.json'),'utf8')));
      const images=await Promise.all(project.rooms.map(async room => {
        try { return await readFile(join(folder,`${room.id}.png`)); }
        catch(error) { if(error.code==='ENOENT') return null; throw error; }
      }));
      if(req.method==='GET' && !match[2]) {
        reply(200,{id:match[1],project,ready:images.filter(Boolean).length,images:images.map(image=>image ? `data:image/png;base64,${image.toString('base64')}` : null)}); return true;
      }
      if(req.method==='POST' && match[2]) {
        const operation=installing.then(async()=>{
          for(let i=0;i<images.length;i++) {
            const image=images[i];
            validateRoomPng(image);
            for(const path of [project.rooms[i].backgroundImage,`data/zones/${project.rooms[i].id}.json`]) {
              try { await access(join(gameRoot,path)); throw new Error(`Already exists: ${path}. Use a new area ID to preserve existing rooms.`); }
              catch(error) { if(error.code!=='ENOENT') throw error; }
            }
          }
          await mkdir(join(gameRoot,'assets/rooms'),{recursive:true});
          await mkdir(join(gameRoot,'data/zones'),{recursive:true});
          const regionPath=project.region?join(gameRoot,'data/regions',project.id+'.json'):null;
          if(regionPath){await mkdir(join(gameRoot,'data/regions'),{recursive:true});try{await access(regionPath);throw new Error('Region already exists. Use a new region ID.');}catch(error){if(error.code!=='ENOENT')throw error;}}
          const created=[], restored=[];
          const indexPath=join(gameRoot,'data/zones/index.json');
          let sourcePath,sourceBytes,source;
          if(project.connectFrom){
            sourcePath=join(gameRoot,'data/zones',project.connectFrom+'.json');
            sourceBytes=await readFile(sourcePath).catch(error=>{if(error.code==='ENOENT')throw new Error('Connecting room '+project.connectFrom+' is not installed. Save that region first.');throw error;});
            source=JSON.parse(sourceBytes);
            if(!source || Array.isArray(source) || source.id!==project.connectFrom)throw new Error('Connecting file is not a valid room.');
            if(roomExits(source).east)throw new Error('This room already has a next exit. Choose an open exit.');
          }
          const replace=async(path,content)=>{
            const temp=path+'.'+randomUUID()+'.tmp';
            try {await writeFile(temp,content,{flag:'wx'});await rename(temp,path);}
            finally {await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
          };
          try {
            for(let i=0;i<images.length;i++) {
              for(const [path,content] of [[project.rooms[i].backgroundImage,images[i]],[`data/zones/${project.rooms[i].id}.json`,JSON.stringify(project.rooms[i],null,2)]]) {
                const target=join(gameRoot,path),handle=await open(target,'wx');
                created.push(target);
                try {await handle.writeFile(content);} finally {await handle.close();}
              }
            }
            if(regionPath){
              const handle=await open(regionPath,'wx');created.push(regionPath);
              try{await handle.writeFile(JSON.stringify(project.region,null,2));}finally{await handle.close();}
            }
            if(source){
              await replace(sourcePath,JSON.stringify({...source,links:{...source.links,next:project.rooms[0].id},exits:{...roomExits(source),east:{roomId:project.rooms[0].id,entry:'west',at:.5}}},null,2));
              restored.push([sourcePath,sourceBytes]);
            }
            await replace(indexPath,JSON.stringify(buildZonesIndex(join(gameRoot,'data/zones')),null,2));
          } catch(error) {
            // Only remove files successfully created by this exact operation.
            const cleanup=await Promise.allSettled([...restored.map(([path,bytes])=>replace(path,bytes)),...created.map(path=>unlink(path))]);
            if(cleanup.some(result=>result.status==='rejected')) throw new Error(`Installation failed; partial files need manual review: ${created.join(', ')}`);
            throw error;
          }
        });
        installing=operation.catch(()=>{}); await operation;
        reply(201,{installed:project.rooms.map(room=>room.id)}); return true;
      }
      reply(405,{error:'Method not allowed.'});
    } catch(error) { reply(error.code==='ENOENT'?404:400,{error:error.message}); }
    return true;
  };
}
