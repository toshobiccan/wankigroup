import { it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installArmor } from "../server/install-armor.js";
it("installs a usable item and updates it without duplicate catalog entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "armor-install-"));
  try {
    const png = await readFile(new URL("../assets/art-reference/human-base.png", import.meta.url));
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    const project = { id: "test-sword", name: "Test Sword", description: "Plain sword", slot: "weapon", width, height, parts: [{ bone: "weaponMount", crop: { x: 0, y: 0, width, height }, pivot: [100, 100], scale: 1, mode: "overlay" }] };
    const payload = { project, images: { weaponMount: `data:image/png;base64,${png.toString("base64")}` } };
    const first = await installArmor(root, payload);
    expect(first).toMatchObject({ description: "Plain sword", kind: "equipable", stats: {} });
    expect(await readFile(join(root, first.picture))).toEqual(png);
    const second = await installArmor(root, payload);
    expect(second.picture).not.toBe(first.picture);
    expect(JSON.parse(await readFile(join(root, "data/equipment/catalog.json"), "utf8")).packages).toEqual(["data/equipment/test-sword.json"]);
    await expect(installArmor(root, { project, images: {} })).rejects.toThrow("Missing PNG");
    await expect(installArmor(root, { ...payload, project: { ...project, id: "catalog" } })).rejects.toThrow("reserved");
    expect(JSON.parse(await readFile(join(root, "data/equipment/catalog.json"), "utf8")).packages).toEqual(["data/equipment/test-sword.json"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
