// Local (offline) mode: progression lives in localStorage and the world is a
// single Room with only you in it. Same Session interface as OnlineSession --
// see session.js -- so the rest of the app never checks which one it has.

import { Emitter, SessionError } from "./emitter.js";
import { Room } from "../game/room.js";
import { normalizePlayer } from "../game/player.js";
import { recordDeckImport, claimQuest } from "../game/progression.js";

const PLAYER_KEY = "cardslayer-player";
const LOCAL_ID = "local";

export class LocalSession extends Emitter {
  constructor({ storage, loadZone }) {
    super();
    this.mode = "local";
    this.storage = storage;
    this.loadZone = loadZone; // (zoneId) => Promise<zone JSON>
    this.account = null;
    this.playerId = LOCAL_ID;
    this.connection = "local";
    this._player = null;
    this._room = null;
  }

  get needsLogin() {
    return false;
  }

  get player() {
    return this._player;
  }

  async start() {
    let saved = null;
    try {
      saved = JSON.parse(this.storage.getItem(PLAYER_KEY));
    } catch {}
    this._player = normalizePlayer(saved);
    return this;
  }

  async importedDeck(cardCount) {
    return this._progression(recordDeckImport(this._player, cardCount));
  }

  async claimQuest(questId) {
    return this._progression(claimQuest(this._player, questId));
  }

  async joinZone(zoneId, position = null) {
    const zone = await this.loadZone(zoneId);
    this._room?.dispose();
    const room = new Room({
      id: `${zoneId}-local`,
      zone,
      players: { get: () => this._player, changed: () => this._changed(), getRole: () => "guest" },
      // Events addressed to "everyone but you" have no audience offline.
      emit: (type, payload, target) => {
        if (target?.except === LOCAL_ID) return;
        this.emit(type, payload);
      },
    });
    this._room = room;
    return room.addPlayer(LOCAL_ID, position).snapshot;
  }

  moveTo(position) {
    this._room?.move(LOCAL_ID, position);
  }

  async engage(mobId) {
    return this._roomCall((room) => room.engage(LOCAL_ID, mobId)).mob;
  }

  async grade(grade) {
    return this._roomCall((room) => room.grade(LOCAL_ID, grade)).result;
  }

  async flee() {
    this._roomCall((room) => room.flee(LOCAL_ID));
  }

  _roomCall(call) {
    if (!this._room) throw new SessionError("not_in_room");
    const result = call(this._room);
    if (!result.ok) throw new SessionError(result.error);
    return result;
  }

  _progression(outcome) {
    if (!outcome.ok) throw new SessionError(outcome.error);
    this._changed();
    return outcome;
  }

  _changed() {
    try {
      this.storage.setItem(PLAYER_KEY, JSON.stringify(this._player));
    } catch {}
    this.emit("player", this._player);
  }
}
