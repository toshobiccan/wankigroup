// Owns every live Room instance. A zone page is split into numbered copies
// ("plains1-0001", "plains1-0002", ...): joining puts you in the lowest-numbered
// copy with space, and a copy is thrown away once its last player leaves.

import { Room } from "../../src/game/room.js";
import { START_ZONE_ID } from "../../src/game/constants.js";

export function instanceId(zoneId, number) {
  return `${zoneId}-${String(number).padStart(4, "0")}`;
}

export class RoomManager {
  // deliver(room, type, payload, target) sends a room event to its members.
  constructor({ zones, players, deliver, timers = globalThis, random = Math.random }) {
    this.zones = zones;
    this.players = players;
    this.deliver = deliver;
    this.timers = timers;
    this.random = random;
    this.rooms = new Map(); // roomId -> Room
    this.byPlayer = new Map(); // playerId -> Room
  }

  roomOf(playerId) {
    return this.byPlayer.get(playerId) ?? null;
  }

  // You can (re)enter the start zone or your current zone anytime, and walk
  // into a page that your current page links to.
  canEnter(playerId, zoneId) {
    if (!this.zones.has(zoneId)) return false;
    const current = this.roomOf(playerId);
    if (!current || zoneId === START_ZONE_ID || zoneId === current.zoneId) return true;
    const links = current.zone.links ?? {};
    return links.prev === zoneId || links.next === zoneId;
  }

  join(playerId, zoneId, position = null) {
    if (!this.canEnter(playerId, zoneId)) return { ok: false, error: "zone_not_reachable" };
    this.leave(playerId);

    const zone = this.zones.get(zoneId);
    let room = this._instancesOf(zoneId).find((r) => !r.isFull);
    if (!room) room = this._createRoom(zone);

    const joined = room.addPlayer(playerId, position);
    if (!joined.ok) return joined;
    this.byPlayer.set(playerId, room);
    return joined;
  }

  leave(playerId) {
    const room = this.byPlayer.get(playerId);
    if (!room) return;
    room.removePlayer(playerId);
    this.byPlayer.delete(playerId);
    if (room.isEmpty) {
      room.dispose();
      this.rooms.delete(room.id);
    }
  }

  stats() {
    return [...this.rooms.values()].map((room) => ({ id: room.id, players: room.size, capacity: room.capacity }));
  }

  disposeAll() {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.byPlayer.clear();
  }

  _instancesOf(zoneId) {
    return [...this.rooms.values()].filter((room) => room.zoneId === zoneId).sort((a, b) => a.id.localeCompare(b.id));
  }

  _createRoom(zone) {
    let number = 1;
    while (this.rooms.has(instanceId(zone.id, number))) number++;
    const room = new Room({
      id: instanceId(zone.id, number),
      zone,
      players: this.players,
      emit: (type, payload, target) => this.deliver(room, type, payload, target),
      timers: this.timers,
      random: this.random,
    });
    this.rooms.set(room.id, room);
    return room;
  }
}
