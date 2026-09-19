// All attachments use a single 512px head-local coordinate space.
export const HAIR_STYLES = Object.freeze([
  ["spiky", "Adventurer"], ["swept", "Swept"],
  ["crop", "Textured crop"], ["sidepart", "Side part"], ["quiff", "Quiff"],
  ["messy", "Messy spikes"], ["fringe", "Swept fringe"], ["pixie", "Pixie"],
  ["bob", "Bob"], ["ponytail", "High ponytail"], ["braid", "Braided crown"],
  ["waves", "Long waves"], ["none", "Bald"],
]);
export const HEAD_OPTIONS = Object.freeze({
  hair: HAIR_STYLES.map(([id]) => id), eyeShape: ["standard", "lashes"], mouth: ["neutral", "smile"],
});
export const DEFAULT_HEAD = Object.freeze({ version: 2, hair: "spiky", eyeShape: "standard", mouth: "smile",
  hairColor: "#56351f", eyeColor: "#b99a48", skinColor: "#dda568", autoBlink: true });

export function normalizeHead(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  const result = { ...DEFAULT_HEAD };
  for (const [key, options] of Object.entries(HEAD_OPTIONS)) if (options.includes(value[key])) result[key] = value[key];
  for (const key of ["hairColor", "eyeColor", "skinColor"]) {
    if (typeof value[key] === "string" && /^#[\da-f]{6}$/i.test(value[key])) result[key] = value[key].toLowerCase();
  }
  if (typeof value.autoBlink === "boolean") result.autoBlink = value.autoBlink;
  return result;
}

export function blinkFrame(elapsed) {
  if (elapsed < 0 || elapsed >= 180) return "open";
  return elapsed < 45 || elapsed >= 115 ? "half" : "closed";
}

export class HeadBlink {
  constructor(random = Math.random) { this.random = random; this.elapsed = 180; this.wait = this.nextDelay(); }
  nextDelay() { return 2600 + this.random() * 2600; }
  trigger() { this.elapsed = 0; this.wait = this.nextDelay(); }
  update(deltaMs, enabled = true) {
    const dt = Math.max(0, Math.min(Number.isFinite(deltaMs) ? deltaMs : 0, 100));
    if (this.elapsed < 180) this.elapsed += dt;
    else if (enabled) { this.wait -= dt; if (this.wait <= 0) this.trigger(); }
    return blinkFrame(this.elapsed);
  }
}
