// Client-only preprocessing, once per appearance/blink frame. Keep the
// registered 512px composition intact; only its display texture is resampled.
export function prepareWorldHead(source, density = globalThis.devicePixelRatio || 1) {
  const size = Math.round(128 * Math.min(2, Math.max(1, density)));
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size);
  const original = new Uint8ClampedArray(pixels.data);
  // Gentle local contrast, opaque interiors only: no alpha changes or edge halos.
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = (y * size + x) * 4;
    const neighbors = [i - 4, i + 4, i - size * 4, i + size * 4];
    if (original[i + 3] < 250 || neighbors.some(n => original[n + 3] < 250)) continue;
    for (let c = 0; c < 3; c++) {
      const average = neighbors.reduce((sum, n) => sum + original[n + c], 0) / 4;
      pixels.data[i + c] = original[i + c] + .18 * (original[i + c] - average);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
