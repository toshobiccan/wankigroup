import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;
const PLAYER_HEIGHT = 90; // world-pixels tall, roughly matches the ground band's scale
const MOB_HEIGHT = 70; // a bit shorter than the player -- these are the weak, early mobs
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
    this.mobs = []; // [{ data, container }] -- static placement only for now; no
                    // click/select/HP-damage yet, that's the in-world-encounters
                    // spec's job once it has its own implementation plan.
    this._resizeObserver = null;
    this._backgroundTexture = null;
    this._playerBaseScale = 1;
    this._facingLeft = false; // the source art faces right by default
    this._lastDisplayHeight = 0;
    this._pointerHeld = false;
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
    this._playerBaseScale = PLAYER_HEIGHT / playerTexture.height;
    this.player.scale.set(this._playerBaseScale);
    this.player.position.set(this.position.x, this.position.y);
    this.world.addChild(this.player);

    for (const mobData of zone.mobs ?? []) {
      const mobUrl = new URL(mobData.image, `${location.origin}/`).href;
      const mobTexture = await PIXI.Assets.load(mobUrl);

      const container = new PIXI.Container();

      const sprite = new PIXI.Sprite(mobTexture);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(MOB_HEIGHT / mobTexture.height);
      container.addChild(sprite);

      const label = new PIXI.Text({
        text: `${mobData.name} · Lv ${mobData.level}`,
        style: { fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, -MOB_HEIGHT - 16);
      container.addChild(label);

      const hpBack = new PIXI.Graphics().rect(-20, -MOB_HEIGHT - 10, 40, 5).fill(0x0a1120);
      container.addChild(hpBack);
      const hpFill = new PIXI.Graphics().rect(-20, -MOB_HEIGHT - 10, 40, 5).fill(0xb8262f);
      container.addChild(hpFill); // always full for now -- no combat wired up yet

      this.world.addChild(container);
      this.mobs.push({ data: mobData, container });
    }
    this._layoutMobs();

    this.app.canvas.addEventListener("pointerdown", (event) => {
      this._pointerHeld = true;
      this._setTargetFromPointer(event);
    });
    this.app.canvas.addEventListener("pointermove", (event) => {
      if (this._pointerHeld) this._setTargetFromPointer(event);
    });
    this.app.canvas.addEventListener("pointerup", () => { this._pointerHeld = false; });
    this.app.canvas.addEventListener("pointercancel", () => { this._pointerHeld = false; });
    this.app.canvas.addEventListener("pointerleave", () => { this._pointerHeld = false; });
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
    this._lastDisplayHeight = displayHeight;
  }

  // Mobs stand at a fixed xFrac of the zone width, on the same ground line the
  // player walks -- vertically centered in the walkable band, not per-mob.
  _layoutMobs() {
    const groundY = (this.zone.groundTop + this.zone.groundBottom) / 2;
    for (const { data, container } of this.mobs) {
      container.position.set(data.xFrac * this.zone.width, groundY);
    }
  }

  resize(width, height) {
    // A transient 0 (container briefly detached/hidden, a mid-layout
    // ResizeObserver callback) must never be treated as a real size -- it
    // would zero out zone.width and permanently corrupt the next resize's
    // fraction math into NaN. Skip degenerate sizes entirely.
    if (!(width > 0) || !(height > 0)) return;

    this.app.renderer.resize(width, height);

    // The player's x/y are absolute world-pixels tied to the *old* scale --
    // convert to fractions of the old zone size first, then re-derive
    // absolute coordinates from those fractions against the new scale, so
    // the character stays in the same relative spot instead of ending up
    // off the path (or off-screen) whenever the canvas size changes.
    const oldWidth = this.zone.width;
    const oldHeight = this._lastDisplayHeight;
    const canRescalePosition = oldWidth > 0 && oldHeight > 0;
    const posXFrac = canRescalePosition ? this.position.x / oldWidth : null;
    const posYFrac = canRescalePosition ? this.position.y / oldHeight : null;
    const targetXFrac = canRescalePosition ? this.target.x / oldWidth : null;
    const targetYFrac = canRescalePosition ? this.target.y / oldHeight : null;

    this._applyBackgroundLayout(height);
    this._layoutMobs();

    if (canRescalePosition) {
      this.position = { x: posXFrac * this.zone.width, y: posYFrac * height };
      this.target = { x: targetXFrac * this.zone.width, y: targetYFrac * height };
      this.player.position.set(this.position.x, this.position.y);
    }
  }

  pause() {
    this.app.ticker?.stop();
  }

  resume() {
    this.app.ticker?.start();
  }

  _setTargetFromPointer(event) {
    const rect = this.app.canvas.getBoundingClientRect();
    const worldPoint = {
      x: event.clientX - rect.left + this.cameraX,
      y: event.clientY - rect.top,
    };
    this.target = clampToZone(worldPoint, this.zone);
  }

  _onTick(ticker) {
    const previousX = this.position.x;
    this.position = stepTowardTarget(this.position, this.target, ticker.deltaMS, MOVE_SPEED);
    const dx = this.position.x - previousX;
    if (dx > 0.01) this._facingLeft = false;
    else if (dx < -0.01) this._facingLeft = true;

    this.player.scale.x = this._facingLeft ? -this._playerBaseScale : this._playerBaseScale;
    this.player.position.set(this.position.x, this.position.y);

    this.cameraX = computeCameraX(this.position.x, this.cameraX, this.app.screen.width, this.zone.width, DEAD_ZONE_FRACTION);
    this.world.x = -this.cameraX;
  }
}
