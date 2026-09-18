import { describe, expect, it } from "vitest";
import { adjustArtTarget, exportArtTemplate, localPointDelta } from "../src/sprites/rig-calibration.js";

const art = {
  body: { head: { src: "head.png", x: 2, y: -3 } },
  equipment: { helmet: { preview: { head: { src: "helmet.png" } } } },
};

describe("adjustArtTarget", () => {
  it("returns a new manifest with the dragged body-part offset applied", () => {
    const adjusted = adjustArtTarget(art, { kind: "body", boneId: "head" }, { x: 7, y: -4 });

    expect(adjusted.body.head).toMatchObject({ x: 9, y: -7 });
    expect(art.body.head).toMatchObject({ x: 2, y: -3 });
  });

  it("accumulates a rotation delta alongside position", () => {
    const adjusted = adjustArtTarget(art, { kind: "body", boneId: "head" }, { rotation: 0.1 });

    expect(adjusted.body.head).toMatchObject({ x: 2, y: -3, rotation: 0.1 });
    expect(art.body.head.rotation).toBeUndefined();
  });

  it("creates offsets for an equipment attachment that has none", () => {
    const adjusted = adjustArtTarget(art, { kind: "equipment", slotId: "helmet", itemId: "preview", boneId: "head" }, { x: -5, y: 8 });

    expect(adjusted.equipment.helmet.preview.head).toMatchObject({ x: -5, y: 8 });
  });

  it("rejects a target that is not present in the manifest", () => {
    expect(() => adjustArtTarget(art, { kind: "body", boneId: "tail" }, { x: 1, y: 1 })).toThrow(/unknown art target/i);
  });
});

describe("localPointDelta", () => {
  it("uses consecutive coordinates in the selected bone's local space", () => {
    expect(localPointDelta({ x: 14, y: -2 }, { x: 9, y: 7 })).toEqual({ x: -5, y: 9 });
  });
});

describe("exportArtTemplate", () => {
  it("exports formatted JSON that can be saved as the placement template", () => {
    expect(exportArtTemplate(art)).toBe(JSON.stringify(art, null, 2));
  });
});
