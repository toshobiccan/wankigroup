import { tutorialAction } from "../game/tutorial.js";
// Local (offline) mode: progression lives in localStorage and the world is a
// single Room with only you in it. Same Session interface as OnlineSession --
// see session.js -- so the rest of the app never checks which one it has.

import { Emitter, SessionError } from "./emitter.js";
import { Room } from "../game/room.js";
import { normalizePlayer } from "../game/player.js";
import { recordDeckImport, claimQuest } from "../game/progression.js";
import { normalizeHead } from "../sprites/character-head.js";

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
    // Development-created items are available for trying on in the local game.
    if (typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
      try {
        const response = await fetch("/dev-api/armor/items");
        if (response.ok) {
          const { items } = await response.json();
          for (const item of items) {
            if (!item || item.kind !== "equipable") continue;
            const index = this._player.inventory.equipables.findIndex(entry => entry.id === item.id);
            if (index < 0) this._player.inventory.equipables.push(item);
            else this._player.inventory.equipables[index] = item;
            if (this._player.equipment[item.slot]?.id === item.id) this._player.equipment[item.slot] = item;
          }
          this._changed();
        }
      } catch { /* Local development catalog is optional. */ }
    }
    return this;
  }

  equipItem(id) {
    const item = this._player.inventory.equipables.find(entry => entry.id === id);
    if (!item || !["helmet", "armor", "cape", "weapon", "book"].includes(item.slot)) throw new Error("Item cannot be equipped.");
    const previous = this._player.equipment[item.slot];
    if (previous && !this._player.inventory.equipables.some(entry => entry.id === previous.id)) {
      this._player.inventory.equipables.push({ ...previous, kind: "equipable", slot: item.slot });
    }
    this._player.equipment[item.slot] = item; this._changed();
  }

  async customizeCharacter(appearance) {
    const character = normalizeHead(appearance);
    // Do not report success or alter the live player if device storage fails.
    this.storage.setItem(PLAYER_KEY, JSON.stringify({ ...this._player, character, characterCreated: true }));
    this._player.character = character;
    this._player.characterCreated = true;
    this.emit("player", this._player);
    return this._player.character;
  }

  async tutorialAction(action) {
    const next = structuredClone(this._player);
    const result = tutorialAction(next, action);
    if (!result.ok) throw new SessionError(result.error);
    this.storage.setItem(PLAYER_KEY, JSON.stringify(next));
    this._player = next; this.emit("player", next);
    return result;
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

  async sendChat(text) {
    this._roomCall((room) => room.chat(LOCAL_ID, text));
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
