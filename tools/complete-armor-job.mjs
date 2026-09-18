// Publish an image generated in Codex, without editing its pixels.
// node tools/complete-armor-job.mjs <job-uuid> <generated-png-path>
import { readFile, copyFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const [id, source] = process.argv.slice(2);
if (!/^[a-f0-9-]{36}$/.test(id ?? "") || !source) throw new Error("Supply the job UUID and generated PNG path.");
const folder = fileURLToPath(new URL(`../output/armor-workshop/jobs/${id}/`, import.meta.url));
const project = JSON.parse(await readFile(join(folder, "project.json"), "utf8"));
const png = await readFile(source);
if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Expected PNG image.");
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
if (!width || !height || width > 4096 || height > 4096 || Math.abs(width / project.width - height / project.height) > 0.001) throw new Error("Generated image dimensions do not fit the template.");
await copyFile(source, join(folder, "result.pending.png"));
await rename(join(folder, "result.pending.png"), join(folder, "result.png"));
console.log(`Published ${id}. The waiting workshop will import it automatically.`);
