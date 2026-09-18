import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildManifest } from "../src/sprites/armor-workshop.js";

export async function installArmor(root, { project, images }) {
  const manifest = buildManifest(project), revision = randomUUID();
  const parts = manifest.equipment[project.slot][manifest.id];
  const buffers = project.parts.map(part => {
    const value = images?.[part.bone];
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value ?? "")) throw new Error(`Missing PNG: ${part.bone}`);
    const bytes = Buffer.from(value.split(",")[1], "base64");
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== Math.round(part.crop.width) || bytes.readUInt32BE(20) !== Math.round(part.crop.height)) throw new Error(`Invalid PNG dimensions: ${part.bone}`);
    return [part.bone, bytes];
  });
  const assetPath = `assets/equipment/${manifest.id}/${revision}`;
  await mkdir(join(root, assetPath), { recursive: true });
  for (const [bone, bytes] of buffers) {
    await writeFile(join(root, assetPath, `${bone}.png`), bytes);
    parts[bone].src = `${assetPath}/${bone}.png`;
  }
  manifest.item.picture = parts.torso?.src ?? parts.weaponMount.src;
  const directory = join(root, "data/equipment"); await mkdir(directory, { recursive: true });
  const packagePath = `data/equipment/${manifest.id}.json`;
  const temp = join(directory, `${revision}.tmp`);
  await writeFile(temp, JSON.stringify(manifest, null, 2));
  await rename(temp, join(root, packagePath));
  let catalog = { packages: [] };
  try { catalog = JSON.parse(await readFile(join(directory, "catalog.json"), "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
  catalog.packages = [...new Set([...catalog.packages, packagePath])];
  await writeFile(temp, JSON.stringify(catalog, null, 2)); await rename(temp, join(directory, "catalog.json"));
  return manifest.item;
}
