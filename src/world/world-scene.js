import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;
const PLAYER_HEIGHT = 90; // world-pixels tall, roughly matches the ground band's scale
// Resolved relative to this module's own file (not whichever HTML page loaded
// it) since world-scene.js is used from both index.html and dev/world-preview.html.
const PLAYER_TEXTURE_URL = new URL("../../assets/world-character.png", import.meta.url).href;

export class WorldScene {
  constructor({ mountElement }) {
    this.mountElement = mountElement;
    this.zone = null;
    this.position = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.cameraX = 0;
    this.app = new PIXI.Application();
    this.world = new PIXI.Container();
    this.background = null;
    this.player = null;
    this._resizeObserver = null;
    this._backgroundTexture = null;
  }

  async loadZone(zoneJsonUrl) {
    let zone;
    try {
      zone = await fetch(zoneJsonUrl).then((r) => r.json());
    } catch (err) {
      console.error(`WorldScene: failed to load zone at ${zoneJsonUrl}`, err);
      return;
    }

    // backgroundImage is authored root-relative (e.g. "assets/foo.png"), same
    // convention as the rest of the project's data-referenced asset paths --
    // resolved against the server root, not the page that happened to load
    // this zone, so it's correct from both index.html and dev/world-preview.html.
    const backgroundUrl = new URL(zone.backgroundImage, `${location.origin}/`).href;
    this._backgroundTexture = await PIXI.Assets.load(backgroundUrl);

    const { width, height } = this.mountElement.getBoundingClientRect();

    await this.app.init({
      width,
      height,
      resolution: window.devicePixelRatio || 1, // otherwise the canvas renders soft/blocky on Retina screens
      autoDensity: true,
      backgroundColor: 0x000000,
      roundPixels: true,
    });
    this.mountElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);

    this.background = new PIXI.Sprite(this._backgroundTexture);
    this.world.addChild(this.background);

    // Ground bounds are stored as fractions of the background image's own
    // height, not fixed pixels -- the background always scales to fill the
    // canvas's current height exactly (see resize()), and this derives the
    // matching walkable band from that scale every time, in world-movement.js's
    // existing units. This is what "where the character can/cannot walk" comes
    // from: it's the actual dirt path in the artwork, not a guessed range.
    this.zone = { ...zone };
    this._applyBackgroundLayout(height);

    this.position = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.target = { x: this.zone.spawnX, y: this.zone.spawnY };

    const playerTexture = await PIXI.Assets.load(PLAYER_TEXTURE_URL);
    this.player = new PIXI.Sprite(playerTexture);
    this.player.anchor.set(0.5, 1); // feet at this.player.position
    this.player.scale.set(PLAYER_HEIGHT / playerTexture.height);
    this.player.position.set(this.position.x, this.position.y);
    this.world.addChild(this.player);

    this.app.canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    this.app.ticker.add((ticker) => this._onTick(ticker));

    this._resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      this.resize(width, height);
    });
    this._resizeObserver.observe(this.mountElement);
  }

  // Scales the background to fill the given height (preserving its aspect
  // ratio) and recomputes zone.width/groundTop/groundBottom/spawnX/spawnY
  // from the original zone JSON's *Frac fields against that new scale.
  _applyBackgroundLayout(displayHeight) {
    const scale = displayHeight / this._backgroundTexture.height;
    const displayWidth = this._backgroundTexture.width * scale;

    this.background.height = displayHeight;
    this.background.width = displayWidth;

    this.zone.width = displayWidth;
    this.zone.groundTop = this.zone.groundTopFrac * displayHeight;
    this.zone.groundBottom = this.zone.groundBottomFrac * displayHeight;
    this.zone.spawnX = this.zone.spawnXFrac * displayWidth;
    this.zone.spawnY = this.zone.spawnYFrac * displayHeight;
  }

  resize(width, height) {
    this.app.renderer.resize(width, height);
    this._applyBackgroundLayout(height);
  }

  pause() {
    this.app.ticker?.stop();
  }

  resume() {
    this.app.ticker?.start();
  }

  _onPointerDown(event) {
    const rect = this.app.canvas.getBoundingClientRect();
    const worldPoint = {
      x: event.clientX - rect.left + this.cameraX,
      y: event.clientY - rect.top,
    };
    this.target = clampToZone(worldPoint, this.zone);
  }

  _onTick(ticker) {
    this.position = stepTowardTarget(this.position, this.target, ticker.deltaMS, MOVE_SPEED);
    this.player.position.set(this.position.x, this.position.y);

    this.cameraX = computeCameraX(this.position.x, this.cameraX, this.app.screen.width, this.zone.width, DEAD_ZONE_FRACTION);
    this.world.x = -this.cameraX;
  }
}
