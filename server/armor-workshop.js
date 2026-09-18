import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildManifest, generationPrompt } from "../src/sprites/armor-workshop.js";
import { installArmor } from "./install-armor.js";

const ROOT = fileURLToPath(new URL("../output/armor-workshop/jobs/", import.meta.url));
export function createWorkshopApi({ enabled, root = ROOT, gameRoot = fileURLToPath(new URL("../", import.meta.url)) }) {
  let saving = Promise.resolve();
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/dev-api/armor/")) return false;
    const reply = (code, data) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
    const peer = req.socket.remoteAddress;
    if (!enabled || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) { reply(403, { error: "Available only on the local offline development server." }); return true; }
    let hostname;
    try { hostname = new URL(`http://${req.headers.host}`).hostname; } catch { /* Invalid Host is rejected below. */ }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) { reply(403, { error: "A localhost address is required." }); return true; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { reply(403, { error: "Same-origin requests only." }); return true; }
    try {
      if (req.method === "GET" && url.pathname === "/dev-api/armor/items") {
        const catalog = JSON.parse(await readFile(join(gameRoot, "data/equipment/catalog.json"), "utf8"));
        const items = [];
        for (const path of catalog.packages) {
          if (!/^data\/equipment\/[a-z][a-z0-9-]*\.json$/.test(path)) continue;
          items.push(JSON.parse(await readFile(join(gameRoot, path), "utf8")).item);
        }
        reply(200, { items }); return true;
      }
      if (req.method === "POST" && url.pathname === "/dev-api/armor/items") {
        if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("JSON required.");
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 48 * 1024 * 1024) throw new Error("Item too large."); chunks.push(chunk); }
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const operation = saving.then(() => installArmor(gameRoot, payload));
        saving = operation.catch(() => {});
        reply(201, { item: await operation }); return true;
      }
      if (req.method === "POST" && url.pathname === "/dev-api/armor/jobs") {
        if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("JSON required.");
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 24 * 1024 * 1024) throw new Error("Template request too large."); chunks.push(chunk); }
        const { project, templatePng } = JSON.parse(Buffer.concat(chunks).toString());
        buildManifest(project);
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(templatePng ?? "")) throw new Error("PNG template required.");
        const png = Buffer.from(templatePng.split(",")[1], "base64");
        if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || png.readUInt32BE(16) !== project.width || png.readUInt32BE(20) !== project.height) throw new Error("Template dimensions do not match.");
        const id = randomUUID(), folder = join(root, id);
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "project.json"), JSON.stringify(project, null, 2));
        await writeFile(join(folder, "prompt.txt"), generationPrompt(project));
        await writeFile(join(folder, "mannequin-template.png"), png);
        reply(201, { id }); return true;
      }
      const match = url.pathname.match(/^\/dev-api\/armor\/jobs\/([a-f0-9-]{36})$/);
      if (req.method === "GET" && match) {
        const folder = join(root, match[1]);
        const project = JSON.parse(await readFile(join(folder, "project.json"), "utf8"));
        let image;
        try { image = await readFile(join(folder, "result.png")); } catch (error) { if (error.code !== "ENOENT") throw error; }
        reply(200, { id: match[1], state: image ? "ready" : "waiting", project, ...(image ? { sheet: `data:image/png;base64,${image.toString("base64")}` } : {}) }); return true;
      }
      reply(404, { error: "Unknown workshop request." });
    } catch (error) { reply(error.code === "ENOENT" ? 404 : 400, { error: error.message }); }
    return true;
  };
}
