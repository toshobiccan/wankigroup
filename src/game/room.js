// One live copy of a zone page: who is in it, where they stand, every mob's
// HP, and who is fighting what. The server runs one Room per instance
// ("plains1-0001"); local mode runs a single Room with just you in it -- same
// class, so fights, kill rewards and respawns behave identically offline and
// online.
//
// Pure: no DOM, no sockets, no storage. Everything outside world comes in
// through the constructor:
//   players.get(id)      -> that player's progression object (mutated in place)
//   players.changed(id)  -> called after the room mutated that player (save/push it)
//   emit(type, payload, target) -> deliver an event; target is { to: id },
//                                  { except: id } or null for everyone
//
// Positions are fractions of the zone (x: 0..1 across its width, y: 0..1 down
// its height), never pixels -- every screen renders the zone at its own size.

import { CHAT_MAX_LENGTH, DEFAULT_ROOM_CAPACITY, ENGAGE_RANGE_FRAC, RESPAWN_DELAY_MS } from "./constants.js";
import { GRADES, applyDefeat, applyKill, resolveGrade } from "./encounter.js";
import { todayKey } from "./player.js";
import { DEFAULT_ROLE } from "./roles.js";

// Same fallbacks WorldScene uses for a "blank" page with no authored ground band.
const DEFAULT_GROUND_TOP_FRAC = 0.72;
const DEFAULT_GROUND_BOTTOM_FRAC = 0.8;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

export class Room {
  constructor({ id, zone, players, emit, timers = globalThis, random = Math.random, today = todayKey, now = () => Date.now() }) {
    this.id = id;
    this.zone = zone;
    this.zoneId = zone.id;
    this.capacity = zone.capacity ?? DEFAULT_ROOM_CAPACITY;
    this.players = players;
    this.emit = emit;
    this.timers = timers;
    this.random = random;
    this.today = today;
    this.now = now;

    this.groundTop = zone.groundTopFrac ?? DEFAULT_GROUND_TOP_FRAC;
    this.groundBottom = zone.groundBottomFrac ?? DEFAULT_GROUND_BOTTOM_FRAC;
    this.spawn = this._clampPosition({
      x: zone.spawnXFrac ?? 0.5,
      y: zone.spawnYFrac ?? (this.groundTop + this.groundBottom) / 2,
    });

    this.members = new Map(); // playerId -> { id, name, level, x, y, tx, ty, fightMobId }
    this.mobs = new Map(); // mobId -> { id, name, level, stats, hp, xFrac, xpReward, coinReward, dead }
    for (const mob of zone.mobs ?? []) {
      this.mobs.set(mob.id, { ...structuredClone(mob), hp: mob.stats.hp, dead: false });
    }
    this._respawnTimers = new Set();
  }

  get size() {
    return this.members.size;
  }

  get isFull() {
    return this.members.size >= this.capacity;
  }

  get isEmpty() {
    return this.members.size === 0;
  }

  // position: optional { x, y } -- where the player walked in (a page edge);
  // defaults to the zone's spawn point.
  addPlayer(playerId, position = null) {
    if (!this.members.has(playerId) && this.isFull) return { ok: false, error: "room_full" };
    const player = this.players.get(playerId);
    const role = this.players.getRole?.(playerId) ?? DEFAULT_ROLE;
    const pos = position ? this._clampPosition(position) : { ...this.spawn };
    const member = { id: playerId, name: player.name, level: player.level, role, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, fightMobId: null };
    this.members.set(playerId, member);
    this.emit("playerJoined", { player: this._memberView(member) }, { except: playerId });
    return { ok: true, snapshot: this.snapshot(playerId) };
  }

  removePlayer(playerId) {
    const member = this.members.get(playerId);
    if (!member) return;
    this._leaveFight(member);
    this.members.delete(playerId);
    this.emit("playerLeft", { id: playerId }, null);
  }

  // Client-driven movement, clamped to the zone's walkable band. Ignored mid-fight.
  move(playerId, { x, y, tx, ty }) {
    const member = this.members.get(playerId);
    if (!member) return { ok: false, error: "not_in_room" };
    if (member.fightMobId) return { ok: false, error: "in_combat" };
    if (![x, y, tx, ty].every(isFiniteNumber)) return { ok: false, error: "invalid_position" };
    Object.assign(member, this._clampPosition({ x, y }));
    const target = this._clampPosition({ x: tx, y: ty });
    member.tx = target.x;
    member.ty = target.y;
    this.emit("playerMoved", this._memberView(member), { except: playerId });
    return { ok: true };
  }

  engage(playerId, mobId) {
    const member = this.members.get(playerId);
    if (!member) return { ok: false, error: "not_in_room" };
    const mob = this.mobs.get(mobId);
    if (!mob) return { ok: false, error: "unknown_mob" };
    if (mob.dead) return { ok: false, error: "mob_gone" };
    if (member.fightMobId && member.fightMobId !== mobId) return { ok: false, error: "already_fighting" };
    if (Math.abs(member.x - mob.xFrac) > ENGAGE_RANGE_FRAC) return { ok: false, error: "too_far" };
    member.fightMobId = mobId;
    return { ok: true, mob: this._mobView(mob) };
  }

  flee(playerId) {
    const member = this.members.get(playerId);
    if (!member) return { ok: false, error: "not_in_room" };
    this._leaveFight(member);
    return { ok: true };
  }

  // Room-scoped: broadcast to everyone currently in this instance, including
  // the sender, so the client has one code path for rendering any chat
  // message rather than a separate "it's my own" optimistic-echo case.
  // Re-validates length here (not just trusting parseClientMessage) because
  // local/offline mode calls Room methods directly, bypassing the protocol
  // layer entirely -- same reasoning as why `grade`/`move` are validated in
  // both places.
  chat(playerId, text) {
    const member = this.members.get(playerId);
    if (!member) return { ok: false, error: "not_in_room" };
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return { ok: false, error: "empty_message" };
    if (trimmed.length > CHAT_MAX_LENGTH) return { ok: false, error: "too_long" };
    this.emit("chat", { id: member.id, name: member.name, role: member.role, text: trimmed, ts: this.now() }, null);
    return { ok: true };
  }

  grade(playerId, grade) {
    const member = this.members.get(playerId);
    if (!member) return { ok: false, error: "not_in_room" };
    if (!GRADES.includes(grade)) return { ok: false, error: "invalid_grade" };
    const mob = this.mobs.get(member.fightMobId);
    if (!mob) return { ok: false, error: "not_in_combat" };
    if (mob.dead) {
      member.fightMobId = null;
      return { ok: false, error: "mob_gone" };
    }

    const player = this.players.get(playerId);
    const today = this.today();
    const result = resolveGrade({ player, mob, grade, today, random: this.random });
    this.players.changed(playerId);
    if (result.again) return { ok: true, result };

    if (result.playerDamageDealt > 0) {
      this.emit("mobHit", { mobId: mob.id, byId: playerId, damage: result.playerDamageDealt, hp: mob.hp }, { except: playerId });
    }

    const response = { ...result, rewards: null };

    if (result.mobDefeated) {
      for (const participant of this.members.values()) {
        if (participant.fightMobId !== mob.id) continue;
        participant.fightMobId = null;
        const participantPlayer = participant.id === playerId ? player : this.players.get(participant.id);
        const reward = applyKill(participantPlayer, mob, today);
        this._syncProfile(participant, participantPlayer);
        this.players.changed(participant.id);
        if (participant.id === playerId) response.rewards = reward;
        else this.emit("combatEnded", { mobId: mob.id, reason: "mobDefeated", rewards: reward }, { to: participant.id });
      }
      mob.dead = true;
      this.emit("mob", this._mobView(mob), null);
      this._scheduleRespawn(mob);
    } else if (result.playerDefeated) {
      applyDefeat(player);
      this.players.changed(playerId);
      this._leaveFight(member);
      Object.assign(member, { ...this.spawn, tx: this.spawn.x, ty: this.spawn.y });
      this.emit("playerMoved", { ...this._memberView(member), snap: true }, { except: playerId });
    }

    return { ok: true, result: response };
  }

  // Name/level shown to others can change (a level-up, a rename) -- call after
  // progression changed outside the room, e.g. a quest reward.
  refreshProfile(playerId) {
    const member = this.members.get(playerId);
    if (member) this._syncProfile(member, this.players.get(playerId));
  }

  snapshot(forPlayerId) {
    const others = [...this.members.values()].filter((m) => m.id !== forPlayerId).map((m) => this._memberView(m));
    const you = this.members.get(forPlayerId);
    return {
      roomId: this.id,
      zoneId: this.zoneId,
      you: you ? this._memberView(you) : null,
      players: others,
      mobs: [...this.mobs.values()].map((mob) => this._mobView(mob)),
    };
  }

  dispose() {
    for (const timer of this._respawnTimers) this.timers.clearTimeout(timer);
    this._respawnTimers.clear();
  }

  _syncProfile(member, player) {
    if (member.name === player.name && member.level === player.level) return;
    member.name = player.name;
    member.level = player.level;
    this.emit("playerUpdated", { id: member.id, name: member.name, level: member.level }, { except: member.id });
  }

  // A mob nobody is fighting anymore heals back to full -- otherwise a fight
  // could be whittled down across flee/defeat cycles for free.
  _leaveFight(member) {
    const mob = this.mobs.get(member.fightMobId);
    member.fightMobId = null;
    if (!mob || mob.dead) return;
    const stillFought = [...this.members.values()].some((m) => m.fightMobId === mob.id);
    if (!stillFought && mob.hp !== mob.stats.hp) {
      mob.hp = mob.stats.hp;
      this.emit("mob", this._mobView(mob), null);
    }
  }

  _scheduleRespawn(mob) {
    const timer = this.timers.setTimeout(() => {
      this._respawnTimers.delete(timer);
      mob.hp = mob.stats.hp;
      mob.dead = false;
      this.emit("mob", this._mobView(mob), null);
    }, RESPAWN_DELAY_MS);
    this._respawnTimers.add(timer);
  }

  _clampPosition({ x, y }) {
    return { x: clamp(x, 0, 1), y: clamp(y, this.groundTop, this.groundBottom) };
  }

  _memberView(member) {
    return { id: member.id, name: member.name, level: member.level, role: member.role, x: member.x, y: member.y, tx: member.tx, ty: member.ty };
  }

  _mobView(mob) {
    return { id: mob.id, hp: mob.hp, maxHp: mob.stats.hp, dead: mob.dead };
  }
}
