import { normalizeHead } from "./character-head.js";
import { MasterHeadRenderer } from "./master-head-renderer.js";

export const HEAD_MANIFEST = "/data/rigs/character-head-v1.json";

export async function loadHeadAssets() {
  const response = await fetch(HEAD_MANIFEST);
  if (!response.ok) throw new Error("Could not load character head metadata.");
  const manifest = await response.json();
  const image = new Image();
  image.src = manifest.atlas;
  await image.decode();
  let hairImage = image;
  if (manifest.hairAtlas) { hairImage = new Image(); hairImage.src = manifest.hairAtlas; await hairImage.decode(); }
  let cleanImage;
  if (manifest.cleanAtlas) { cleanImage = new Image(); cleanImage.src = manifest.cleanAtlas; await cleanImage.decode(); }
  const hairImages = Object.fromEntries(await Promise.all(Object.entries(manifest.hairstyles ?? {}).map(async ([id, entry]) => {
    const asset = new Image(); asset.src = entry.image; await asset.decode();
    return [id, asset];
  })));
  return { manifest, image, hairImage, cleanImage, hairImages };
}

function canvas(width, height) {
  const result = document.createElement("canvas"); result.width = width; result.height = height; return result;
}

// Trim transparent cell margins at load time. Authoring coordinates remain in
// the manifest; this never changes a joint or the character's skeleton.
function extract(image, manifest, entry) {
  const [sx, sy, width, height] = entry.source;
  const tile = canvas(width, height), ctx = tile.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error("The head atlas contains an empty part.");
  const trimmed = canvas(x1 - x0 + 1, y1 - y0 + 1);
  trimmed.getContext("2d").drawImage(tile, x0, y0, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed;
}

function tint(source, hex, inkOnly = false, preserveWhite = false, shadowThreshold = 200, gradient = false) {
  const result = canvas(source.width, source.height), ctx = result.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, result.width, result.height);
  const color = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < pixels.data.length; i += 4) {
    const luminance = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
    if (preserveWhite && luminance > 246) continue;
    // Preserve authored shadow edges and antialiasing instead of turning
    // small luminance variations into disconnected threshold bands.
    const factor = inkOnly ? 0.35 : luminance < 45 ? null
      : gradient ? 0.3 + luminance / 255 * 0.85
      : Math.min(1, Math.max(0.3, luminance / (shadowThreshold + 25)));
    for (let c = 0; c < 3; c++) pixels.data[i + c] = factor === null ? 15 : Math.min(255, Math.round(color[c] * factor));
  }
  ctx.putImageData(pixels, 0, 0); return result;
}

export function tintNeck(image, color) { return tint(image, color, false, false, 155); }

export class HeadRenderer {
  constructor({ manifest, image, hairImage = image, cleanImage, hairImages }, appearance) {
    if (manifest.master) return new MasterHeadRenderer({ manifest, image, hairImage, cleanImage, hairImages }, appearance);
    this.manifest = manifest;
    this.parts = new Map(Object.entries(manifest.parts).map(([id, entry]) => [id, extract(id.startsWith("hair") ? hairImage : image, manifest, entry)]));
    this.canvas = canvas(512, 512);
    this.eyeLayer = canvas(512, 512);
    this.eyeMasks = new Map();
    for (const id of ["eyesOpen", "eyesHalf"]) {
      const source = this.parts.get(id), mask = canvas(source.width, source.height), ctx = mask.getContext("2d");
      ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        if (pixels.data[i] < 80) pixels.data[i + 3] = 0;
      }
      ctx.putImageData(pixels, 0, 0); this.eyeMasks.set(id, mask);
    }
    this.setAppearance(appearance);
  }
  setAppearance(value) {
    this.appearance = normalizeHead(value);
    this.tinted = new Map();
    for (const [id, entry] of Object.entries(this.manifest.parts)) {
      this.tinted.set(id, entry.tint ? tint(this.parts.get(id), this.appearance[entry.tint], entry.inkOnly, id === "eyesHalf" || id === "irises", 200, id === "irises") : this.parts.get(id));
    }
    this.frame = null; this.draw("open");
  }
  draw(frame = "open") {
    if (this.frame === frame) return false;
    this.frame = frame;
    const ctx = this.canvas.getContext("2d"); ctx.clearRect(0, 0, 512, 512);
    const draw = id => {
      const part = this.manifest.parts[id]; if (!part) return;
      const [x, y, w, h] = part.rect;
      ctx.save(); ctx.translate(x, part.flipY ? y + h : y); ctx.scale(1, part.flipY ? -1 : 1);
      ctx.drawImage(this.tinted.get(id), 0, 0, w, h); ctx.restore();
    };
    draw("face");
    // Blink the assembled eye group; separately fitted lid art caused jumps
    // and disconnected skin-colored patches around the sockets.
    ctx.save();
    if (frame === "half") {
      const [, y, , h] = this.manifest.parts.eyesOpen.rect;
      ctx.translate(0, y + h); ctx.scale(1, 0.5); ctx.translate(0, -y - h);
    }
    draw(frame === "closed" ? "eyesClosed" : "eyesOpen");
    if (frame !== "closed") {
      const eyes = "eyesOpen";
      const eyeCtx = this.eyeLayer.getContext("2d");
      eyeCtx.clearRect(0, 0, 512, 512);
      eyeCtx.drawImage(this.tinted.get("irises"), ...this.manifest.parts.irises.rect);
      eyeCtx.globalCompositeOperation = "destination-in";
      eyeCtx.drawImage(this.eyeMasks.get(eyes), ...this.manifest.parts[eyes].rect);
      eyeCtx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.eyeLayer, 0, 0);
    }
    ctx.restore();
    draw("brows"); draw("nose"); draw(this.appearance.mouth === "smile" ? "mouthSmile" : "mouthNeutral");
    if (this.appearance.hair !== "none") draw(this.appearance.hair === "swept" ? "hairSwept" : "hairSpiky");
    draw(this.appearance.ears === "pointed" ? "earPointed" : "earHuman");
    return true;
  }
}
