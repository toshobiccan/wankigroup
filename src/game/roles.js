// Player role -> display color. Pure data, no DOM -- shared by the server
// (assigns/validates roles) and the client (colors name tags and chat names).
//
// guest  = no account, or hasn't set a username/password (grey)
// player = signed in with a username + password (white)
// scholar= paid membership (yellow)
// mod    = moderator (blue -- matches --blue-light in style.css)
// admin  = administrator (red -- matches the net-dot "closed" red)

export const ROLES = ["guest", "player", "scholar", "mod", "admin"];
export const DEFAULT_ROLE = "guest";

// 0xRRGGBB, for PIXI.Text `fill`. cssColor() below derives the "#rrggbb" form
// the DOM chat log needs from these same numbers, so there is one source.
export const ROLE_COLORS = {
  guest: 0x9aa4b2,
  player: 0xffffff,
  scholar: 0xf0d43a,
  mod: 0x4d8df0,
  admin: 0xd1453b,
};

export function normalizeRole(value) {
  return ROLES.includes(value) ? value : DEFAULT_ROLE;
}

export function cssColor(role) {
  return "#" + ROLE_COLORS[normalizeRole(role)].toString(16).padStart(6, "0");
}
