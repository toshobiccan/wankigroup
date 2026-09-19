import * as PIXI from "../../vendor/pixi.min.mjs";
import { loadHeadAssets } from "./head-renderer.js";
import { normalizeHead } from "./character-head.js";

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
  if (art.catalog) {
    const catalogResponse = await fetch(new URL(art.catalog, location.origin));
    if (!catalogResponse.ok) throw new Error("Could not load equipment catalog");
    const catalog = await catalogResponse.json();
    for (const path of catalog.packages ?? []) {
      const packageResponse = await fetch(new URL(path, location.origin));
      if (!packageResponse.ok) throw new Error(`Could not load equipment package: ${path}`);
      const pack = await packageResponse.json();
      art.equipment ??= {};
      for (const [slot, items] of Object.entries(pack.equipment ?? {})) {
        art.equipment[slot] = { ...art.equipment[slot], ...items };
      }
    }
  }
  const entries = collectEntries(art.body, collectEntries(art.equipment));
  const textures = new Map();
  await Promise.all([...new Set(entries.map(({ src }) => src))].map(async (src) => {
    textures.set(src, await PIXI.Assets.load(new URL(src, location.origin).href));
  }));
  let character = null;
  if (art.character) {
    // Optional head failure must not replace a working animated body with the
    // world's legacy still-image fallback.
    try {
      const [assets, response] = await Promise.all([
        loadHeadAssets(), fetch(art.character, { cache: "no-store" }),
      ]);
      if (!response.ok) throw new Error("Could not load standard character.");
      character = { ...assets, appearance: normalizeHead(await response.json()) };
      if (art.body?.neck?.src) {
        const neckImage = new Image(); neckImage.src = new URL(art.body.neck.src, location.origin).href;
        await neckImage.decode(); character.neckImage = neckImage;
      }
    } catch (error) { character = null; console.warn("Using original head artwork:", error); }
  }
  return { art, textures, character };
}
