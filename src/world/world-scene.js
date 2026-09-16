import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCameraX, computeCenteredCameraX } from "./world-movement.js";

const MOVE_SPEED = 220; // world-pixels/second
const DEAD_ZONE_FRACTION = 0.4;
const PLAYER_HEIGHT = 90; // world-pixels tall, roughly matches the ground band's scale
const MOB_HEIGHT = 70; // a bit shorter than the player -- these are the weak, early mobs
const APPROACH_DISTANCE = 60; // how close (world-pixels) the player walks before a fight actually starts
// Resolved relative to this module's own file (not whichever HTML page loaded
// it) since world-scene.js is used from both index.html and dev/world-preview.html.
const PLAYER_TEXTURE_URL = new URL("../../assets/world-character.png", import.meta.url).href;

// Two-tier selection glow for assets/mob-goblin.png specifically, extracted
// from its own alpha channel via a real contour trace (cv2.findContours on
// the alpha mask, dilated outward before tracing so the result already sits
// clear of the body, then simplified) -- not a per-row min/max bridge, which
// was cutting straight across gaps (between the sword arm and torso, between
// the legs) and made the outline balloon outward as if it included the
// ground. INNER is dilated ~55px (a close, soft glow); OUTER ~80px -- a
// small additional dilation of the *same* base mask, at the same
// simplification level, so it tracks the inner shape closely instead of
// being an independently-traced, much coarser blob (which read as "boxy"
// and disconnected from the glow beneath it). Both then rounded with one
// pass of Chaikin corner-cutting to soften the polygon's angles into a
// smoother curve. Both normalized so (0,0) is the sprite's own anchor point
// (feet, horizontally centered), same space as anchor(0.5, 1). A different
// mob image would need its own two contours the same way.
const GOBLIN_GLOW_INNER_POINTS = [
  [569, -961], [547, -971], [508, -974], [452, -970], [408.8, -989], [378.2, -1031],
  [348.8, -1060.5], [320.2, -1077.5], [286.5, -1092], [247.5, -1104], [206, -1103.5], [162, -1090.5],
  [116.8, -1103.2], [70.2, -1141.8], [8.5, -1175], [-68.5, -1203], [-118.5, -1215.2], [-141.5, -1211.8],
  [-159.2, -1194.5], [-171.8, -1163.5], [-161.2, -1125.8], [-127.8, -1081.2], [-112.2, -1043.2], [-114.8, -1011.8],
  [-111.8, -986.5], [-103.2, -967.5], [-113.5, -943.8], [-142.5, -915.2], [-183, -890.2], [-235, -868.8],
  [-292.8, -829.5], [-356.2, -772.5], [-391.5, -723.8], [-398.5, -683.2], [-416.2, -654.2], [-444.8, -636.8],
  [-466.5, -616], [-481.5, -592], [-488, -568.8], [-486, -546.2], [-509.2, -507.5], [-557.8, -452.5],
  [-592.5, -396.8], [-613.5, -340.2], [-624, -275.5], [-624, -202.5], [-614.8, -159.8], [-596.2, -147.2],
  [-575.8, -143.2], [-553.2, -147.8], [-517.2, -173.5], [-467.8, -220.5], [-428.2, -267.2], [-398.8, -313.8],
  [-383.2, -326], [-381.8, -304], [-402.5, -241.5], [-445.5, -138.5], [-464.8, -77.5], [-460.2, -58.5],
  [-446.8, -38.2], [-424.2, -16.8], [-359.5, -4.8], [-252.5, -2.2], [-192.2, -4.2], [-178.8, -10.8],
  [-167, -26.8], [-157, -52.2], [-163, -85.5], [-185, -126.5], [-175.5, -179.5], [-134.5, -244.5],
  [-104, -281.8], [-84, -291.2], [-58.5, -273.5], [-27.5, -228.5], [-4, -201.5], [12, -192.5],
  [20, -171.2], [20, -137.8], [28.8, -112], [46.2, -94], [104.5, -80.2], [203.5, -70.8],
  [283.2, -69], [343.8, -75], [380.2, -86.8], [392.8, -104.2], [397.2, -124.2], [393.8, -146.8],
  [380.8, -171.5], [358.2, -198.5], [332.5, -218.5], [303.5, -231.5], [296.8, -275.5], [312.2, -350.5],
  [334.5, -373.8], [363.5, -345.2], [393.5, -338.2], [424.5, -352.8], [450.8, -359.8], [472.2, -359.2],
  [499.2, -374], [531.8, -404], [555.2, -439], [569.8, -479], [571.2, -519.8], [559.8, -561.2],
  [538.5, -597.5], [507.5, -628.5], [471.8, -650.2], [431.2, -662.8], [396.5, -661], [367.5, -645],
  [339, -644.5], [311, -659.5], [299.8, -671], [305.2, -679], [322.2, -680.8], [350.8, -676.2],
  [375.5, -680.5], [396.5, -693.5], [421, -726], [449, -778], [493, -824.2], [553, -864.8],
  [582.2, -902.8], [580.8, -938.2],
];
const GOBLIN_GLOW_OUTER_POINTS = [
  [-164.5, -1228.8], [-183.5, -1212.2], [-195.8, -1191], [-201.2, -1165], [-186.5, -1125.8], [-151.5, -1073.2],
  [-133.5, -1026.5], [-132.5, -985.5], [-142.2, -954.2], [-162.8, -932.8], [-196.8, -912.2], [-244.2, -892.8],
  [-303.5, -851.2], [-374.5, -787.8], [-413.5, -736.8], [-420.5, -698.2], [-444, -661.2], [-484, -625.8],
  [-506.5, -592.5], [-511.5, -561.5], [-535, -521.8], [-577, -473.2], [-605.2, -428], [-619.8, -386],
  [-627, -307], [-627, -191], [-617.8, -128.8], [-599.2, -120.2], [-577.8, -117.5], [-553.2, -120.5],
  [-517, -144], [-469, -188], [-456.8, -179.5], [-480.2, -118.5], [-481.5, -66.2], [-460.5, -22.8],
  [-375, -1], [-225, -1], [-144.2, -17.2], [-132.8, -49.8], [-135.2, -87], [-151.8, -129],
  [-141.5, -178], [-104.5, -234], [-66.8, -239.5], [-28.2, -194.5], [-7.5, -156.8], [-4.5, -126.2],
  [8.5, -99], [31.5, -75], [95.5, -57.5], [200.5, -46.5], [283.8, -43.5], [345.2, -48.5],
  [385.5, -59.2], [404.5, -75.8], [416.5, -99], [421.5, -129], [412, -162.5], [388, -199.5],
  [362.5, -226.2], [335.5, -242.8], [325.5, -269.2], [332.5, -305.8], [353, -319.5], [387, -310.5],
  [428.8, -314.8], [478.2, -332.2], [524.8, -366.8], [568.2, -418.2], [593, -458], [599, -486],
  [595.5, -523.5], [582.5, -570.5], [559.5, -611], [526.5, -645], [490.8, -670], [452.2, -686],
  [445.5, -717.8], [470.5, -765.2], [513, -809.2], [573, -849.8], [605.5, -889.8], [610.5, -929.2],
  [599.2, -961.2], [571.8, -985.8], [528.8, -997.2], [470.2, -995.8], [422.5, -1017], [385.5, -1061],
  [332.2, -1096], [262.8, -1122], [207.8, -1129.8], [167.2, -1119.2], [136.2, -1125.8], [114.8, -1149.2],
  [52, -1181.2], [-52, -1221.8], [-116.8, -1240.8], [-142.2, -1238.2],
];

export class WorldScene {
  constructor({ mountElement, onMobSelected, onCombatStart }) {
    this.mountElement = mountElement;
    this.onMobSelected = onMobSelected; // (mobData | null) -- fires on select, re-select of a different mob, and deselect
    this.onCombatStart = onCombatStart; // (mobData) -- fires once, when the player finishes walking up to an engaged mob
    this.zone = null;
    this.position = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.cameraX = 0;
    this.app = new PIXI.Application();
    this.world = new PIXI.Container();
    this.background = null;
    this.player = null;
    this.mobs = []; // [{ data, container, glow, hpFill }] -- click-to-select and combat
                    // are both wired up (see _onMobClick, playHit()).
    this.selectedMob = null; // the selected mob's own {data, container, glow, hpFill} record, or null
    this.inCombat = false;
    this._approaching = false; // true from the moment a fight is triggered until the walk-up finishes
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
      const mobData = { ...rawMobData, hp: rawMobData.stats.hp };
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
      // Starts full/green; _updateMobHpBar() repaints this as hp drops during combat.
      const hpFill = new PIXI.Graphics().rect(-20, -MOB_HEIGHT - 10, 40, 5).fill(0x4cd137);
      container.addChild(hpFill);

      container.eventMode = "static";
      container.cursor = "pointer";
      const mobEntry = { data: mobData, container, glow, hpFill };
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
    if (this.inCombat || this._approaching) return; // movement is scripted (walk-up) or locked (fight) -- never a ground click's job to change it
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
    if (this.inCombat || this._approaching) return; // a fight is already running or starting; mob clicks do nothing until it ends
    if (this.selectedMob === mobEntry) {
      this._approaching = true;
      const mobX = mobEntry.container.position.x;
      const approachX = mobX + (this.position.x < mobX ? -APPROACH_DISTANCE : APPROACH_DISTANCE);
      this.target = clampToZone({ x: approachX, y: this.position.y }, this.zone);
      return;
    }
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

  // mobDefeated: true removes the fought mob from the zone for good (victory);
  // false leaves it exactly where it was (the player fled or lost).  Either
  // way, clears the selection glow and unlocks movement.
  endCombat({ mobDefeated }) {
    const entry = this.selectedMob;
    if (mobDefeated && entry) {
      this.world.removeChild(entry.container);
      this.mobs = this.mobs.filter((e) => e !== entry);
    }
    if (entry) entry.glow.visible = false;
    this.selectedMob = null;
    this.inCombat = false;
    this._approaching = false; // defensive -- should already be false by the time a fight can end
    this.onMobSelected?.(null);
  }

  // Snaps the player back to the zone's spawn point -- used after a defeat,
  // once the grey fade (owned by app.js) has fully covered the screen. No
  // walk animation: this is a teleport, not a walk.
  respawnPlayer() {
    this.position = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.target = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.player.position.set(this.position.x, this.position.y);
  }

  // Runs onFrame(t) every tick for durationMs, t going from 0 to 1 linearly.
  // The one piece of tweening infrastructure every hit-animation step below
  // uses -- hand-rolled against the ticker rather than a library, per the
  // combat-resolution design spec.
  _animate(durationMs, onFrame) {
    return new Promise((resolve) => {
      let elapsed = 0;
      const tick = (ticker) => {
        elapsed += ticker.deltaMS;
        const t = Math.min(1, elapsed / durationMs);
        onFrame(t);
        if (t >= 1) {
          this.app.ticker.remove(tick);
          resolve();
        }
      };
      this.app.ticker.add(tick);
    });
  }

  // hits: ordered list of {attacker: "player"|"mob", damage, isCrit?},
  // already filtered by the caller to only the swings that actually
  // happened (a knocked-out combatant's would-be retaliation is never
  // included). Plays each in order against the current this.selectedMob.
  async playHit(hits) {
    for (const hit of hits) {
      await this._playSingleHit(hit);
    }
  }

  async _playSingleHit(hit) {
    const mobEntry = this.selectedMob;
    const isPlayerAttacking = hit.attacker === "player";
    const attackerContainer = isPlayerAttacking ? this.player : mobEntry.container;
    const defenderContainer = isPlayerAttacking ? mobEntry.container : this.player;
    const lungeDir = Math.sign(defenderContainer.position.x - attackerContainer.position.x) || 1;
    const baseX = attackerContainer.position.x;

    await this._animate(150, (t) => { attackerContainer.position.x = baseX + lungeDir * 20 * t; });
    await this._animate(150, (t) => { attackerContainer.position.x = baseX + lungeDir * 20 * (1 - t); });
    attackerContainer.position.x = baseX;

    this._showFloatingDamage(defenderContainer, hit.damage, hit.isCrit);

    const defenderBaseX = defenderContainer.position.x;
    await this._animate(120, (t) => {
      defenderContainer.position.x = defenderBaseX + Math.sin(t * Math.PI * 4) * 6 * (1 - t);
    });
    defenderContainer.position.x = defenderBaseX;

    if (!isPlayerAttacking) return; // the mob's own HP bar only changes when it's the one taking the hit
    this._updateMobHpBar(mobEntry);
    if (mobEntry.data.hp <= 0) {
      await this._animate(300, (t) => { mobEntry.container.alpha = 1 - t; });
    }
  }

  _showFloatingDamage(targetContainer, damage, isCrit) {
    const text = new PIXI.Text({
      text: isCrit ? "CRIT!" : `-${damage}`,
      style: { fontSize: 18, fontWeight: "900", fill: 0xffd166, stroke: { color: 0x000000, width: 3 } },
    });
    text.anchor.set(0.5, 1);
    const startY = targetContainer.position.y - MOB_HEIGHT - 30;
    text.position.set(targetContainer.position.x, startY);
    this.world.addChild(text);
    const RISE_DISTANCE = 36; // total world-pixels risen over the animation -- frame-rate independent, unlike a fixed per-frame offset
    this._animate(700, (t) => {
      text.position.y = startY - RISE_DISTANCE * t;
      text.alpha = 1 - t;
    }).then(() => this.world.removeChild(text));
  }

  _updateMobHpBar(mobEntry) {
    const frac = Math.max(0, mobEntry.data.hp / mobEntry.data.stats.hp);
    const color = frac > 0.5 ? 0x4cd137 : frac > 0.25 ? 0xe8c547 : 0xd1453b;
    mobEntry.hpFill.clear().rect(-20, -MOB_HEIGHT - 10, 40 * frac, 5).fill(color);
  }

  _onTick(ticker) {
    const previousX = this.position.x;
    this.position = stepTowardTarget(this.position, this.target, ticker.deltaMS, MOVE_SPEED);
    const dx = this.position.x - previousX;
    if (dx > 0.01) this._facingLeft = false;
    else if (dx < -0.01) this._facingLeft = true;

    this.player.scale.x = this._facingLeft ? -this._playerBaseScale : this._playerBaseScale;
    this.player.position.set(this.position.x, this.position.y);

    if (this._approaching && Math.abs(this.position.x - this.target.x) < 2) {
      this._approaching = false;
      this.inCombat = true;
      this.onCombatStart?.(this.selectedMob.data);
    }

    if (this.selectedMob && (this.inCombat || this._approaching)) {
      const midpointX = (this.position.x + this.selectedMob.container.position.x) / 2;
      this.cameraX = computeCenteredCameraX(midpointX, this.app.screen.width, this.zone.width);
    } else {
      this.cameraX = computeCameraX(this.position.x, this.cameraX, this.app.screen.width, this.zone.width, DEAD_ZONE_FRACTION);
    }
    this.world.x = -this.cameraX;
  }
}
