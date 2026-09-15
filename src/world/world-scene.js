import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;
const PLAYER_HEIGHT = 90; // world-pixels tall, roughly matches the ground band's scale
const MOB_HEIGHT = 70; // a bit shorter than the player -- these are the weak, early mobs
// Resolved relative to this module's own file (not whichever HTML page loaded
// it) since world-scene.js is used from both index.html and dev/world-preview.html.
const PLAYER_TEXTURE_URL = new URL("../../assets/world-character.png", import.meta.url).href;

// Two-tier selection glow for assets/mob-goblin.png specifically, extracted
// from its own alpha channel via a real contour trace (cv2.findContours on
// the alpha mask, dilated outward before tracing so the result already sits
// clear of the body, then simplified) -- not a per-row min/max bridge, which
// was cutting straight across gaps (between the sword arm and torso, between
// the legs) and made the outline balloon outward as if it included the
// ground. INNER is dilated ~90px (a close, soft glow); OUTER ~130px -- a
// small additional dilation of the *same* base mask, at the same
// simplification level, so it tracks the inner shape closely instead of
// being an independently-traced, much coarser blob (which read as "boxy"
// and disconnected from the glow beneath it). Both normalized so (0,0) is
// the sprite's own anchor point (feet, horizontally centered), same space
// as anchor(0.5, 1). A different mob image would need its own two contours
// the same way.
const GOBLIN_GLOW_INNER_POINTS = [
  [-157, -1247], [-203, -1207], [-214, -1151], [-203, -1116], [-145, -1045], [-151, -994],
  [-144, -967], [-178, -931], [-219, -906], [-282, -886], [-411, -772], [-430, -734],
  [-433, -687], [-467, -670], [-521, -595], [-525, -550], [-558, -497], [-608, -452],
  [-627, -381], [-627, -120], [-590, -106], [-544, -110], [-517, -125], [-466, -182],
  [-498, -108], [-502, -71], [-490, -34], [-464, -1], [-137, -1], [-121, -30],
  [-117, -67], [-148, -150], [-84, -243], [-59, -223], [-43, -189], [-19, -166],
  [-6, -94], [41, -53], [253, -31], [378, -41], [424, -81], [434, -145],
  [424, -173], [384, -224], [334, -258], [339, -307], [404, -296], [454, -321],
  [511, -334], [571, -391], [610, -469], [610, -513], [580, -606], [516, -670],
  [448, -699], [466, -755], [481, -772], [581, -836], [617, -873], [626, -896],
  [620, -958], [595, -990], [563, -1007], [447, -1005], [373, -1091], [292, -1129],
  [228, -1145], [150, -1126], [104, -1173], [12, -1213], [-103, -1252],
];
const GOBLIN_GLOW_OUTER_POINTS = [
  [-217, -1254], [-246, -1209], [-254, -1149], [-237, -1095], [-189, -1035], [-189, -979],
  [-233, -945], [-306, -918], [-438, -802], [-464, -759], [-472, -714], [-510, -684],
  [-541, -643], [-561, -601], [-566, -565], [-590, -524], [-627, -493], [-627, -75],
  [-593, -66], [-542, -69], [-516, -1], [-90, -1], [-77, -69], [-101, -148],
  [-82, -175], [-58, -146], [-53, -103], [-35, -65], [-7, -35], [28, -15],
  [140, -1], [398, -6], [453, -52], [475, -114], [465, -180], [409, -256],
  [510, -289], [547, -310], [587, -347], [626, -404], [626, -606], [550, -694],
  [500, -722], [516, -750], [626, -821], [626, -1016], [559, -1049], [466, -1047],
  [403, -1118], [354, -1147], [245, -1184], [164, -1172], [118, -1211], [17, -1254],
];

export class WorldScene {
  constructor({ mountElement, onMobSelected }) {
    this.mountElement = mountElement;
    this.onMobSelected = onMobSelected; // (mobData | null) -- fires on select, re-select of a different mob, and deselect
    this.zone = null;
    this.position = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.cameraX = 0;
    this.app = new PIXI.Application();
    this.world = new PIXI.Container();
    this.background = null;
    this.player = null;
    this.mobs = []; // [{ data, container, glow }] -- click-to-select is wired up
                    // (see _onMobClick); attack/combat is still the in-world-encounters
                    // spec's job once it has its own implementation plan.
    this.selectedMob = null; // the selected mob's own {data, container, glow} record, or null
    this._resizeObserver = null;
    this._backgroundTexture = null;
    this._playerBaseScale = 1;
    this._facingLeft = false; // the source art faces right by default
    this._lastDisplayHeight = 0;
    this._pointerHeld = false;
    this._suppressNextGroundClick = false;
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

    for (const rawMobData of zone.mobs ?? []) {
      const mobData = { ...rawMobData, cardsRemaining: rawMobData.cardsToKill };
      const mobUrl = new URL(mobData.image, `${location.origin}/`).href;
      const mobTexture = await PIXI.Assets.load(mobUrl);

      const container = new PIXI.Container();

      const mobScale = MOB_HEIGHT / mobTexture.height;

      // Selection glow -- drawn first so it sits behind the sprite. Two
      // layers, both tracing the goblin's real contour (already expanded
      // outward from the actual alpha edge, see the constants above) rather
      // than a generic shape: a soft filled glow close to the body, and a
      // crisp stroked line further out. The sprite itself is flipped
      // (-mobScale) to face left; both outlines' x gets the same negation
      // so they line up with the flipped sprite.
      const glow = new PIXI.Graphics()
        .poly(GOBLIN_GLOW_INNER_POINTS.flatMap(([x, y]) => [x * -mobScale, y * mobScale]))
        .fill({ color: 0xffd84d, alpha: 0.4 })
        .poly(GOBLIN_GLOW_OUTER_POINTS.flatMap(([x, y]) => [x * -mobScale, y * mobScale]))
        .stroke({ color: 0xffe27a, width: 3, alpha: 0.95 });
      glow.visible = false;
      container.addChild(glow);

      const sprite = new PIXI.Sprite(mobTexture);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(-mobScale, mobScale); // flipped to face left, toward the player approaching from spawn
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
      // Green at full HP; once combat exists this should shift toward red as
      // cardsRemaining/cardsToKill drops -- always full for now, no damage yet.
      const hpFill = new PIXI.Graphics().rect(-20, -MOB_HEIGHT - 10, 40, 5).fill(0x4cd137);
      container.addChild(hpFill);

      container.eventMode = "static";
      container.cursor = "pointer";
      const mobEntry = { data: mobData, container, glow };
      container.on("pointerdown", (event) => {
        // Pixi's federated event system and the plain native "pointerdown"
        // listener below are two separate dispatch systems on the same
        // canvas -- event.stopPropagation() here only stops *Pixi's own*
        // propagation to parent containers, it does not stop that other,
        // independently-registered native listener from also firing for
        // this same click. Without this flag, a mob click would set
        // selectedMob here and then immediately have it undone by the
        // native handler treating the same click as "move here".
        event.stopPropagation();
        this._suppressNextGroundClick = true;
        this._onMobClick(mobEntry);
      });

      this.world.addChild(container);
      this.mobs.push(mobEntry);
    }
    this._layoutMobs();

    this.app.canvas.addEventListener("pointerdown", (event) => {
      if (this._suppressNextGroundClick) {
        this._suppressNextGroundClick = false;
        return;
      }
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
    if (this.selectedMob) {
      // A mob is selected -- this ground click (mob clicks never reach here,
      // see _onMobClick) only deselects. It doesn't also move the player;
      // the next click, now with nothing selected, is a normal move-click.
      this._deselectMob();
      return;
    }
    const rect = this.app.canvas.getBoundingClientRect();
    const worldPoint = {
      x: event.clientX - rect.left + this.cameraX,
      y: event.clientY - rect.top,
    };
    this.target = clampToZone(worldPoint, this.zone);
  }

  _onMobClick(mobEntry) {
    if (this.selectedMob === mobEntry) return; // already selected; attacking it is a future step
    if (this.selectedMob) this.selectedMob.glow.visible = false;
    this.selectedMob = mobEntry;
    mobEntry.glow.visible = true;
    this.onMobSelected?.(mobEntry.data);
  }

  _deselectMob() {
    if (!this.selectedMob) return;
    this.selectedMob.glow.visible = false;
    this.selectedMob = null;
    this.onMobSelected?.(null);
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
