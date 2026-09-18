function findTarget(art, target) {
  if (target.kind === "body") return art.body?.[target.boneId];
  return art.equipment?.[target.slotId]?.[target.itemId]?.[target.boneId];
}

export function adjustArtTarget(art, target, delta) {
  const next = structuredClone(art);
  const config = findTarget(next, target);
  if (!config) throw new Error("Unknown art target");
  config.x = (config.x ?? 0) + (delta.x ?? 0);
  config.y = (config.y ?? 0) + (delta.y ?? 0);
  config.rotation = (config.rotation ?? 0) + (delta.rotation ?? 0);
  return next;
}

export function exportArtTemplate(art) {
  return JSON.stringify(art, null, 2);
}

export function localPointDelta(previous, next) {
  return { x: next.x - previous.x, y: next.y - previous.y };
}
