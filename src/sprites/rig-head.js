import * as PIXI from "../../vendor/pixi.min.mjs";
import { HeadRenderer } from "./head-renderer.js";
import { HeadBlink, normalizeHead } from "./character-head.js";
import { prepareWorldHead } from "./world-head-texture.js";

function worldTexture(canvas) {
  return new PIXI.Texture({ source: new PIXI.CanvasSource({
    resource: prepareWorldHead(canvas), scaleMode: "linear", autoGenerateMipmaps: false,
  }) });
}

// A single rendered head is attached to the existing head bone. Its facial
// layers never participate in skeletal animation or acquire independent poses.
export class RigHead extends PIXI.Sprite {
  constructor(resources) {
    const renderer = new HeadRenderer(resources, resources.appearance);
    const texture = worldTexture(renderer.canvas);
    super(texture);
    this.renderer = renderer;
    this.blink = new HeadBlink();
    this.frames = new Map([["open", texture]]);
    this.frame = "open";
    const { x, y, width, height } = resources.manifest.rigPlacement;
    this.position.set(x, y); this.width = width; this.height = height;
  }
  update(deltaMs) {
    const frame = this.blink.update(deltaMs, this.renderer.appearance.autoBlink);
    if (frame === this.frame) return;
    if (!this.frames.has(frame)) {
      this.renderer.draw(frame);
      this.frames.set(frame, worldTexture(this.renderer.canvas));
    }
    this.texture = this.frames.get(frame);
    this.frame = frame;
  }
  setAppearance(appearance) {
    if (JSON.stringify(normalizeHead(appearance)) === JSON.stringify(this.renderer.appearance)) return;
    this.renderer.setAppearance(appearance);
    const oldFrames = this.frames;
    this.texture = worldTexture(this.renderer.canvas);
    this.frames = new Map([["open", this.texture]]);
    this.frame = "open";
    for (const texture of oldFrames.values()) texture.destroy(true);
  }
  destroy(options) {
    super.destroy(options);
    // This canvas texture belongs only to this head, never to the asset cache.
    for (const texture of this.frames.values()) if (!texture.destroyed) texture.destroy(true);
    this.frames.clear();
  }
}
