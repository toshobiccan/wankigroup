import {isPublicPath} from '../server/static.js';
import { it,expect } from 'vitest';
import { mapGraph, worldRegions } from '../src/world/world-map.js';
it('draws actual links once, without inventing links between separate areas',()=>{
 const graph=mapGraph([{id:'a',links:{next:'b'},map:{x:100,y:200,biome:'forest'}},{id:'b',links:{prev:'a',next:'missing'}},{id:'c',links:{}},{id:'a'}]);
 expect(graph.nodes).toHaveLength(3);
 expect(graph.edges).toEqual([['a','b']]);
 expect(graph.nodes[0]).toMatchObject({x:100,y:200,biome:'forest'});
});

it('groups fixed room graphs into regions and keeps cross-region connections',()=>{
 const zones=[{id:'a1',regionId:'a',map:{areaName:'Home',worldX:100,worldY:200},exits:{east:{roomId:'b1'}}},{id:'a2',regionId:'a',exits:{west:{roomId:'a1'}}},{id:'b1',regionId:'b',map:{areaName:'Plains',worldX:400,worldY:200},exits:{west:{roomId:'a1'}}}];
 const regions=worldRegions(zones);expect(regions).toHaveLength(2);expect(regions[0].rooms).toHaveLength(2);
 expect(mapGraph(regions).edges).toEqual([['a','b']]);
});

it('serves region templates and manifests without exposing private server files',()=>{expect(isPublicPath('data/region-templates/spawn.json')).toBe(true);expect(isPublicPath('data/regions/spawn.json')).toBe(true);expect(isPublicPath('server/zones.js')).toBe(false);});
