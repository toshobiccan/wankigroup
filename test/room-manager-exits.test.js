import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RoomManager } from '../server/world/room-manager.js';

it('allows installed Spawn neighbors, blocks skipping rooms, and retains legacy links', () => {
  const rooms = [1,2,3].map(i => JSON.parse(readFileSync(new URL(`../data/zones/spawn-${i}.json`, import.meta.url))));
  const manager = new RoomManager({ zones: new Map(rooms.map(r => [r.id,r])) });
  manager.byPlayer.set('p', { zoneId: rooms[0].id, zone: rooms[0] });
  expect(manager.canEnter('p','spawn-2')).toBe(true);
  expect(manager.canEnter('p','spawn-3')).toBe(false);
  manager.byPlayer.set('p', { zoneId: rooms[1].id, zone: rooms[1] });
  expect(manager.canEnter('p','spawn-3')).toBe(true);
  manager.byPlayer.set('p', { zoneId: rooms[2].id, zone: rooms[2] });
  expect(manager.canEnter('p','spawn-2')).toBe(true);
  for (const direction of ['north','south']) {
    manager.byPlayer.set('p', { zoneId: 'other', zone: { exits: { [direction]: { roomId: 'spawn-2' } } } });
    expect(manager.canEnter('p','spawn-2')).toBe(true);
  }
  manager.byPlayer.set('p', { zoneId: 'other', zone: { links: { next: 'spawn-2' } } });
  expect(manager.canEnter('p','spawn-2')).toBe(true);
});
