import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
const read = name => JSON.parse(readFileSync(new URL(`../data/rigs/${name}.json`, import.meta.url), "utf8"));
it("keeps neck attached to the animated head below torso armor", () => {
  for (const name of ["humanoid", "humanoid-aqw-bind-preview"]) {
    const bones = Object.fromEntries(read(name).bones.map(b => [b.id, b]));
    expect(bones.neck).toMatchObject({ parent: "head", x: 0, y: 0, rotation: 0 });
    expect(bones.neck.zIndex).toBeLessThan(bones.torso.zIndex);
    expect(bones.head.zIndex).toBeGreaterThan(bones.torso.zIndex);
  }
  for (const name of ["humanoid-art-mannequin", "humanoid-art-starter-v1"]) {
    const { head, neck } = read(name).body;
    expect(neck.src).toBe(head.src);
    expect(neck.anchor).toEqual(head.anchor);
    expect(neck.scale).toBe(head.scale);
    expect(head.clipPolygon.slice(2).reverse()).toEqual(neck.clipPolygon.slice(0, -2));
  }
});
