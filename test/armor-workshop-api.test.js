import { it, expect } from "vitest";
import http from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkshopApi } from "../server/armor-workshop.js";
import { isPublicPath } from "../server/static.js";

it("queues the exact template and returns a completed image only when published", async () => {
  const root = await mkdtemp(join(tmpdir(), "armor-queue-"));
  const handler = createWorkshopApi({ enabled: true, root });
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/dev-api/armor/jobs`;
  try {
    const png = await readFile(new URL("../assets/art-reference/human-base.png", import.meta.url));
    const project = { id: "test", name: "Test", slot: "weapon", width: png.readUInt32BE(16), height: png.readUInt32BE(20), parts: [{ bone: "weaponMount", crop: { x: 0, y: 0, width: 512, height: 512 }, pivot: [256, 256], scale: 1, mode: "overlay" }] };
    const body = JSON.stringify({ project, templatePng: `data:image/png;base64,${png.toString("base64")}` });
    expect((await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://other.example" }, body })).status).toBe(403);
    const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(response.status).toBe(201); const { id } = await response.json();
    expect(await readFile(join(root, id, "mannequin-template.png"))).toEqual(png);
    expect(await readFile(join(root, id, "prompt.txt"), "utf8")).toContain("base plus TWO darker cel-shadow tones");
    expect((await (await fetch(`${base}/${id}`)).json()).state).toBe("waiting");
    await writeFile(join(root, id, "result.png"), png);
    const ready = await (await fetch(`${base}/${id}`)).json();
    expect(ready.state).toBe("ready"); expect(ready.project.id).toBe("test"); expect(ready.sheet).toContain("data:image/png;base64,");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

it("disables the development bridge on online servers", async () => {
  let code;
  await createWorkshopApi({ enabled: false })({ url: "/dev-api/armor/jobs", socket: { remoteAddress: "127.0.0.1" }, headers: {} }, { writeHead(value) { code = value; }, end() {} });
  expect(code).toBe(403);
});
it("rejects rebound hosts and serves only public equipment paths", async () => {
  let code;
  await createWorkshopApi({ enabled: true })({ url: "/dev-api/armor/jobs", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "attacker.example", origin: "http://attacker.example" } }, { writeHead(value) { code = value; }, end() {} });
  expect(code).toBe(403);
  expect(isPublicPath("data/equipment/catalog.json")).toBe(true);
  expect(isPublicPath("data/equipment/starter.json")).toBe(true);
  expect(isPublicPath("output/armor-workshop/jobs/project.json")).toBe(false);
});
