// The WebSocket protocol between the browser and the game server, in one
// place so both sides agree. Every message is a JSON object with a "type".
//
// Requests (client -> server) that expect an answer carry an "rid" (request
// id); the server answers with { type: "result", rid, ok, data } or
// { type: "result", rid, ok: false, error }. Everything else the server sends
// is a push event (see SERVER_EVENTS).
//
// Positions are zone fractions (0..1), never pixels -- see src/game/room.js.

import { GRADES } from "../game/encounter.js";
import { CHAT_MAX_LENGTH } from "../game/constants.js";

export const PROTOCOL_VERSION = 1;
export const WS_PATH = "/ws";
export const MAX_MESSAGE_BYTES = 2048;

export const CLIENT_MESSAGES = {
  hello: "hello", // { token, protocol } -- must be the first message
  join: "join", // { zoneId, x?, y? } -> data: room snapshot
  move: "move", // { x, y, tx, ty } -- fire and forget
  engage: "engage", // { mobId } -> data: { mob }
  grade: "grade", // { grade } -> data: { result }
  flee: "flee", // {} -> data: {}
  ping: "ping", // {} -> pushes "pong"
  chat: "chat", // { text } -> result; broadcasts a "chat" push to the whole room
};

export const SERVER_EVENTS = [
  "welcome", // { account, player } -- answer to hello
  "result", // answer to a request, see above
  "player", // { player } -- your own progression changed (rewards, HP, quests)
  "playerJoined", // { player: { id, name, level, x, y, tx, ty } }
  "playerLeft", // { id }
  "playerMoved", // { id, name, level, x, y, tx, ty, snap? }
  "playerUpdated", // { id, name, level }
  "mob", // { id, hp, maxHp, dead }
  "mobHit", // { mobId, byId, damage, hp } -- someone else hit a mob
  "combatEnded", // { mobId, reason, rewards } -- someone else finished your fight
  "chat", // { id, name, role, text, ts } -- someone in your room said something (including you)
  "kicked", // { reason } -- e.g. signed in from another tab
  "pong",
];

const ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const isFraction = (value) => typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 2;

// Returns { ok: true, message } or { ok: false, error }. Unknown fields are
// dropped so nothing unexpected ever reaches game logic.
export function parseClientMessage(raw) {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: "too_large" };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "bad_json" };
  }
  if (!data || typeof data !== "object") return { ok: false, error: "bad_message" };

  const rid = Number.isInteger(data.rid) ? data.rid : undefined;
  switch (data.type) {
    case "hello":
      if (typeof data.token !== "string" || data.token.length > 200) return { ok: false, error: "bad_token" };
      return { ok: true, message: { type: "hello", token: data.token, protocol: data.protocol } };
    case "join": {
      if (typeof data.zoneId !== "string" || !ID_PATTERN.test(data.zoneId)) return { ok: false, error: "bad_zone" };
      const hasPosition = isFraction(data.x) && isFraction(data.y);
      return { ok: true, message: { type: "join", rid, zoneId: data.zoneId, position: hasPosition ? { x: data.x, y: data.y } : null } };
    }
    case "move":
      if (![data.x, data.y, data.tx, data.ty].every(isFraction)) return { ok: false, error: "bad_position" };
      return { ok: true, message: { type: "move", x: data.x, y: data.y, tx: data.tx, ty: data.ty } };
    case "engage":
      if (typeof data.mobId !== "string" || !ID_PATTERN.test(data.mobId)) return { ok: false, error: "bad_mob" };
      return { ok: true, message: { type: "engage", rid, mobId: data.mobId } };
    case "grade":
      if (!GRADES.includes(data.grade)) return { ok: false, error: "bad_grade" };
      return { ok: true, message: { type: "grade", rid, grade: data.grade } };
    case "flee":
      return { ok: true, message: { type: "flee", rid } };
    case "chat":
      if (typeof data.text !== "string" || data.text.length === 0 || data.text.length > CHAT_MAX_LENGTH) {
        return { ok: false, error: "bad_chat" };
      }
      return { ok: true, message: { type: "chat", rid, text: data.text } };
    case "ping":
      return { ok: true, message: { type: "ping" } };
    default:
      return { ok: false, error: "unknown_type" };
  }
}
