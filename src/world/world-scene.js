import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;
const VIEWPORT_WIDTH = 400; // matches the ~400px-wide mobile testing convention (docs/HANDOFF.md)

export class WorldScene {
  constructor({ mountElement }) {
    this.mountElement = mountElement;
    this.zone = null;
    this.position = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.cameraX = 0;
    this.app = new PIXI.Application();
    this.world = new PIXI.Container();
    this.ground = null;
    this.player = null;
  }

  async loadZone(zoneJsonUrl) {
    let zone;
    try {
      zone = await fetch(zoneJsonUrl).then((r) => r.json());
    } catch (err) {
      console.error(`WorldScene: failed to load zone at ${zoneJsonUrl}`, err);
      return;
    }

    this.zone = zone;
    this.position = { x: zone.spawnX, y: zone.spawnY };
    this.target = { x: zone.spawnX, y: zone.spawnY };

    await this.app.init({
      width: VIEWPORT_WIDTH,
      height: zone.groundBottom + 40,
      backgroundColor: 0x8fd0ff, // placeholder sky
      roundPixels: true,
    });
    this.mountElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);

    this.ground = new PIXI.Graphics()
      .rect(0, zone.groundTop, zone.width, zone.groundBottom - zone.groundTop)
      .fill(0x5fa14a); // placeholder grass
    this.world.addChild(this.ground);

    this.player = new PIXI.Graphics().circle(0, 0, 10).fill(0xffcc00); // placeholder player
    this.player.position.set(this.position.x, this.position.y);
    this.world.addChild(this.player);

    this.app.canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    this.app.ticker.add((ticker) => this._onTick(ticker));
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
