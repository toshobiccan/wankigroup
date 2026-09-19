import * as PIXI from '../vendor/pixi.min.mjs';
import { HeadRenderer, loadHeadAssets } from '../src/sprites/head-renderer.js';
import { HeadBlink } from '../src/sprites/character-head.js';
import { prepareWorldHead } from '../src/sprites/world-head-texture.js';

let moving = true;
document.getElementById('motion').onclick = event => {
  moving = !moving;
  event.target.textContent = moving ? 'Pause movement' : 'Start movement';
};
try {
  const resources = await loadHeadAssets();
  let appearance;
  try { appearance = JSON.parse(localStorage.getItem('cardslayer-player'))?.character; } catch {}
  const renderer = new HeadRenderer(resources, appearance);
  const variants = [
    { title: 'Original • direct filtering', mode: 'original' },
    { title: 'Previous • mipmaps', mode: 'mipmaps' },
    { title: 'New • balanced', mode: 'balanced' },
  ];
  for (const variant of variants) {
    const article = document.createElement('article');
    const heading = document.createElement('h2'); heading.textContent = variant.title;
    article.append(heading); document.getElementById('samples').append(article);
    variant.app = new PIXI.Application();
    await variant.app.init({ width: 220, height: 240, resolution: devicePixelRatio || 1, autoDensity: true, backgroundAlpha: 0 });
    article.append(variant.app.canvas);
    variant.frames = new Map();
    for (const frame of ['open', 'half', 'closed']) {
      renderer.draw(frame);
      const source = variant.mode === 'balanced' ? prepareWorldHead(renderer.canvas) : document.createElement('canvas');
      if (variant.mode !== 'balanced') {
        source.width = source.height = 512; source.getContext('2d').drawImage(renderer.canvas, 0, 0);
      }
      variant.frames.set(frame, new PIXI.Texture({ source: new PIXI.CanvasSource({
        resource: source, scaleMode: 'linear', autoGenerateMipmaps: variant.mode === 'mipmaps',
      }) }));
    }
    variant.sprites = [[54,45,35], [144,120,100]].map(([width,height,y]) => {
      const sprite = new PIXI.Sprite(variant.frames.get('open'));
      sprite.width = width; sprite.height = height; sprite.x = (220-width)/2; sprite.y = y;
      variant.app.stage.addChild(sprite); return sprite;
    });
  }
  const blink = new HeadBlink(); let elapsed = 0;
  variants[0].app.ticker.add(ticker => {
    if (moving) elapsed += ticker.deltaMS;
    const frame = blink.update(ticker.deltaMS, true);
    for (const variant of variants) for (const sprite of variant.sprites) {
      sprite.texture = variant.frames.get(frame);
      sprite.x = (220-sprite.width)/2 + (moving ? Math.sin(elapsed / 650)*14 : 0);
    }
  });
  document.getElementById('status').textContent = 'Balanced filtering is active in the game. World blink textures are cached locally; no server requests or image processing during steady movement.';
} catch (error) {
  document.getElementById('status').textContent = `Could not load comparison: ${error.message}`;
}
