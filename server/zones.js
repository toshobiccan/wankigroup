// Reads every zone page from data/zones/ once at startup. The server uses the
// same JSON the browser renders, so mob stats and rewards can't drift apart.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ZONES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/zones");

export function loadZones(dir = ZONES_DIR) {
  const zones = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const zone = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (!zone.id) throw new Error(`zone file ${file} has no "id"`);
    zones.set(zone.id, zone);
  }
  return zones;
}
