// Game-wide tuning numbers shared by the browser (local mode) and the server
// (online mode). Pure data -- change a number here and both modes follow.

export const XP_PER_LEVEL = 1000;
export const GEMS_PER_LEVEL = 10; // bonus gems granted on every level-up

export const RESPAWN_DELAY_MS = 5000; // how long a defeated mob stays gone before it's back at full HP

// Multiplayer room instances: each zone page (e.g. "plains1") runs as numbered
// copies ("plains1-0001", "plains1-0002", ...) holding at most this many
// players each. A zone JSON can override it with its own "capacity".
export const DEFAULT_ROOM_CAPACITY = 5;

export const START_ZONE_ID = "spawn-1";

// Rewarding a deck import is capped per day -- otherwise re-importing the same
// file over and over would be a free coin/XP farm once progress lives on a server.
export const MAX_REWARDED_IMPORTS_PER_DAY = 3;

// Loose server-side sanity check: a player may only engage a mob standing
// within this fraction of the zone's width. Movement is client-driven, so this
// stops "fight anything from anywhere" without needing server-side pathing.
export const ENGAGE_RANGE_FRAC = 0.25;

// A chat message longer than this is rejected outright by parseClientMessage.
export const CHAT_MAX_LENGTH = 240;
