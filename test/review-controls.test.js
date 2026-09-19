import {it,expect} from 'vitest';
import {reviewKeyAction} from '../src/ui/review-controls.js';
const keys={confirm:'KeyE',cancel:'Escape'};
it('never grades through a held key, modifier shortcut, or pending submission',()=>{
 expect(reviewKeyAction({key:'e',code:'KeyE',repeat:true},keys)).toBe(null);
 expect(reviewKeyAction({key:'a',code:'KeyA',ctrlKey:true},keys)).toBe(null);
 expect(reviewKeyAction({key:'Escape',code:'Escape'},keys,true)).toBe(null);
 expect(reviewKeyAction({key:'e',code:'KeyE'},keys,true)).toBe(null);
 expect(reviewKeyAction({key:'e',code:'KeyE'},keys)).toBe('confirm');
});
it('explicit A/B bindings take precedence over controller aliases',()=>{
 expect(reviewKeyAction({key:'b',code:'KeyB'},{confirm:'KeyB',cancel:'KeyA'})).toBe('confirm');
 expect(reviewKeyAction({key:'a',code:'KeyA'},{confirm:'KeyB',cancel:'KeyA'})).toBe('cancel');
 expect(reviewKeyAction({key:'ArrowLeft',code:'ArrowLeft'},keys)).toBe('previous');
});
