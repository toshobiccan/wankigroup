import * as PIXI from "../../vendor/pixi.min.mjs";

function collectEntries(section, entries = []) {
  for (const value of Object.values(section ?? {})) {
    if (value?.src) entries.push(value);
    else if (value && typeof value === "object") collectEntries(value, entries);
  }
  return entries;
}

export async function loadRigArt(artUrl) {
  const response = await fetch(artUrl);
  if (!response.ok) throw new Error(`Could not load rig art: ${response.status}`);
  const art = await response.json();
  const entries = collectEntries(art.body, collectEntries(art.equipment));
  const textures = new Map();
  await Promise.all([...new Set(entries.map(({ src }) => src))].map(async (src) => {
    textures.set(src, await PIXI.Assets.load(new URL(src, location.origin).href));
  }));
  return { art, textures };
}
