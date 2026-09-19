import { it, expect, vi } from 'vitest';
import { WorldScene } from '../src/world/world-scene.js';

it('broadcasts a final stop when leaving the world during held movement',()=>{
  const scene={position:{x:100,y:200},target:{x:126,y:200},velocity:{x:220,y:0},_directMovement:true,
    input:{setActive:vi.fn()},app:{ticker:{stop:vi.fn()}},_emitMove:vi.fn(),_moveSendTimer:null};
  WorldScene.prototype.pause.call(scene);
  expect(scene.target).toEqual(scene.position);
  expect(scene._emitMove).toHaveBeenCalledWith(true);
  expect(scene.input.setActive).toHaveBeenCalledWith(false);
  expect(scene.velocity).toEqual({x:0,y:0});
});

it('cancel stops an approach without starting or ending an active battle',()=>{
  const scene={_pageReady:true,inCombat:false,_transitioning:false,_approaching:true,position:{x:30,y:70},input:{reset:vi.fn()},_deselectMob:vi.fn(),_emitMove:vi.fn()};
  WorldScene.prototype._inputAction.call(scene,'cancel');
  expect(scene._approaching).toBe(false);expect(scene.target).toEqual(scene.position);
  scene.inCombat=true;scene._deselectMob.mockClear();
  WorldScene.prototype._inputAction.call(scene,'cancel');
  expect(scene._deselectMob).not.toHaveBeenCalled();
});
