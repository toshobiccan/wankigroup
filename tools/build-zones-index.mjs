#!/usr/bin/env node
// Scans data/zones/*.json (every zone except this script's own output) and
// writes data/zones/index.json -- browsers can't list a folder, so anything
// that needs to know which maps exist (a future map picker, etc.) reads this
// generated file instead. Run again any time a zone is added or renamed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function buildZonesIndex(zonesDir) {
  if (!fs.existsSync(zonesDir)) return [];
  return fs
    .readdirSync(zonesDir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => {
      const zone = JSON.parse(fs.readFileSync(path.join(zonesDir, f), "utf8"));
      return { id: zone.id, displayName: zone.displayName };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const zonesDir = path.join(repoRoot, "data", "zones");
  const index = buildZonesIndex(zonesDir);
  fs.writeFileSync(path.join(zonesDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote data/zones/index.json: ${index.length} map(s) -- ${index.map((z) => z.displayName).join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
