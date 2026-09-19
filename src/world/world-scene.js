import { roomExits, exitPoint, reachedExit } from './room-exits.js';
import { resolveMob } from '../game/mob-definitions.js';
import * as PIXI from "../../vendor/pixi.min.mjs";
import { clampToZone, stepTowardTarget, computeCenteredCameraX, easeToward, worldFraming, smoothCameraX } from "./world-movement.js";
import { WorldInput } from "./world-input.js";
import { ROLE_COLORS, DEFAULT_ROLE, normalizeRole, cssColor } from "../game/roles.js";
import { CHAT_MAX_LENGTH } from "../game/constants.js";
import { loadRigArt } from "../sprites/load-rig-art.js";
import { RigActor } from "../sprites/rig-actor.js";

const MOVE_SPEED = 220; // world-pixels/second
const PLAYER_HEIGHT = 118; // keeps the cutout equipment readable on a phone-sized world view
const MOB_HEIGHT = 70; // a bit shorter than the player -- these are the weak, early mobs
const APPROACH_DISTANCE = 60; // how close (world-pixels) the player walks before a fight actually starts
// While fighting, the world canvas itself shrinks to a fixed rectangle
// pinned to the top of the screen (see enterCombatStage()) -- a dedicated
// combat stage, not a variable peek behind the reading sheet, and it is set
// once at the start of the fight (with a brief animated transition into
// place, not a jump cut) and never resized or re-panned again between cards.
// COMBAT_STAGE_FRACTION is that rectangle's height as a fraction of the
// battle-viewable area (the view minus the deck-progress bar).
//
// The fighters' zoom is picked directly from the stage's own (often quite
// small) height -- see enterCombatStage()'s explicitZoom -- rather than
// exploration's absolute-character-size formula, so there's no dead space
// above/below regardless of how tall the stage ends up on a given screen.
// COMBAT_FILL_FRACTION is how much of the stage height the character's
// reference height (the "138" constant world-movement.js's feetScreenY
// clamp uses) should fill; COMBAT_FEET_FRACTION positions their feet near
// the stage's bottom edge so that fill lands with the head near the top.
const COMBAT_STAGE_FRACTION = 0.2;
const COMBAT_FILL_FRACTION = 0.95;
const COMBAT_FEET_FRACTION = 0.97;
const COMBAT_STAGE_TRANSITION_MS = 450;
const EDGE_TRANSITION_MARGIN = 4; // world-pixels from a page's exact edge that counts as "reached it"
const MOVE_SEND_INTERVAL_MS = 100; // at most this often, movement intents go to the session (and the server)
const CHAT_BUBBLE_MS = 4500; // how long a chat bubble stays up before fading
const NAMEPLATE_OFFSET_Y = -PLAYER_HEIGHT - 4; // world-pixels above the head a nameplate sits
const CHAT_BUBBLE_OFFSET_Y = -PLAYER_HEIGHT - 20; // world-pixels above the head a chat bubble sits
const CHAT_LOG_MAX_LINES = 50; // oldest lines drop off past this
// A page with no real art yet ("blank" in its JSON) gets a flat two-tone
// placeholder instead of a missing-texture error -- same aspect ratio as
// assets/world-background.png (1672x941) so it doesn't visually jar against
// a real neighboring page, and its own walkable band so movement/arrows
// still have somewhere sensible to sit.
const BLANK_ROOM_ASPECT = 16 / 9;
const BLANK_ROOM_GROUND_TOP_FRAC = 0.72;
const BLANK_ROOM_GROUND_BOTTOM_FRAC = 0.8;
const BLANK_SKY_COLOR = 0x2a3550;
const BLANK_GROUND_COLOR = 0x3a4436;
const ARROW_COLOR = 0xffd84d;
// Resolved relative to this module's own file (not whichever HTML page loaded
// it) since world-scene.js is used from both index.html and dev/world-preview.html.
const PLAYER_TEXTURE_URL = new URL("../../assets/world-character.png", import.meta.url).href;
const PLAYER_RIG_URL = new URL("../../data/rigs/humanoid.json", import.meta.url).href;
const PLAYER_CLIP_URLS = {
  idle: new URL("../../data/animations/humanoid/idle.json", import.meta.url).href,
  run: new URL("../../data/animations/humanoid/run.json", import.meta.url).href,
};
const PLAYER_ART_URL = new URL("../../data/rigs/humanoid-art-starter-v1.json", import.meta.url).href;

export class WorldScene {
  constructor({ mountElement, onMobSelected, onCombatStart, onPageEnter, onMoveIntent, onChatSend, playerAppearance = {}, characterAppearance = null, zoneUrlForId = null }) {
    this.zoneUrlForId=zoneUrlForId;
    this.mountElement = mountElement;
    this.onMobSelected = onMobSelected; // (mobData | null) -- fires on select, re-select of a different mob, and deselect
    this.onCombatStart = onCombatStart; // (mobData) -- fires once, when the player finishes walking up to an engaged mob
    // (pageId, { x, y }) -- a page finished loading with the player standing at
    // that zone-fraction position. app.js joins the matching room and hands the
    // room's state back through applyRoomSnapshot().
    this.onPageEnter = onPageEnter;
    // ({ x, y, tx, ty }) -- zone fractions of where the player is and is walking to.
    this.onMoveIntent = onMoveIntent;
    // (text) -- fires when the player submits a chat message from the chat input.
    this.onChatSend = onChatSend;
    this.playerAppearance = playerAppearance;
    this.characterAppearance = characterAppearance;
    this.zone = null;
    this.pageId = null; // the current page's own id, e.g. "plains1"
    this.links = { prev: null, next: null }; // neighboring page ids this page connects to, or null
    this.position = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.cameraX = 0;
    this.cameraY = 0;
    this.zoom = 1;
    this.velocity = { x: 0, y: 0 };
    this._directMovement = false;
    this.app = new PIXI.Application();
    this.world = new PIXI.Container();
    this.world.sortableChildren = true;
    this.background = null;
    this.player = null;
    this._roomLabel = null; // DOM element, bottom-left current-page name (see loadZone)
    this._arrows = { prev: null, next: null }; // PIXI.Graphics edge indicators, only where a link exists
    this._arrowPhase = 0; // drives the arrows' idle side-to-side wobble
    this._pixiReady = false; // true once the one-time PIXI app/canvas/ticker/listener setup has run
    this._pageReady = false; // true once _loadPage has fully finished -- guards resize() against a
                              // ResizeObserver firing mid-load (its initial fire, or one racing an
                              // in-flight page transition's background-texture await) hitting null state
    this._transitioning = false; // guards against re-triggering a page transition while one is in flight
    this.mobs = []; // [{ data, container, glow, hpFill, dead? }] -- click-to-select and
                    // combat are both wired up (see _onMobClick, playHit()). A defeated
                    // mob's entry stays here with dead:true and its container hidden
                    // until the room says it respawned (see endCombat, applyMobState).
    this.selectedMob = null; // the selected mob's own {data, container, glow, hpFill} record, or null
    this.inCombat = false;
    this._approaching = false; // true from the moment a fight is triggered until the walk-up finishes
    this._resizeObserver = null;
    this._backgroundTexture = null;
    this._playerBaseScale = 1;
    this._isRigPlayer = false;
    this._facingLeft = false; // the source art faces right by default
    this._lastDisplayHeight = 0;
    this._pointerHeld = false;
    this._suppressNextGroundClick = false;
    this._playerTexture = null;
    // Other players in the same room: id -> { view: {id,name,level,x,y,tx,ty}, container, sprite, label }.
    // Positions are kept as zone fractions and converted to pixels every tick.
    this.remotePlayers = new Map();
    // Mob updates that arrive while that mob is mid-fight with us are held until
    // endCombat(), so the server's "it died" never cuts our own hit animation short.
    this._pendingMobStates = new Map();
    this._lastMoveSentAt = 0;
    this._moveSendTimer = null;
    this._wasMoving = false;
    this._ownId = null;
    this._ownName = "";
    this._ownRole = DEFAULT_ROLE;
    this._ownLabel = null; // PIXI.Text nameplate above this.player
    this._ownBubble = null;
    this._ownBubbleTimer = null;
    this._chatLog = null; // DOM element, bottom-left scrollback (see loadZone)
    this._chatInput = null; // DOM element, next to _chatLog
  }

  // Public entry point -- called once by app.js with the starting page's
  // zone JSON. Does the one-time PIXI app/canvas/player/ticker/listener
  // setup exactly once (guarded by _pixiReady), then loads that first page
  // like any other. Later pages are loaded via _transitionToPage(), which
  // reuses the same app/canvas/player rather than recreating them.
  async loadZone(zoneJsonUrl) {
    if (!this._pixiReady) {
      const { width, height } = this.mountElement.getBoundingClientRect();

      await this.app.init({
        width,
        height,
        resolution: window.devicePixelRatio || 1, // otherwise the canvas renders soft/blocky on Retina screens
        autoDensity: true,
        backgroundColor: 0x000000,
        roundPixels: false,
      });
      this.mountElement.appendChild(this.app.canvas);
      this.mountElement.style.position = 'relative';
      this.app.canvas.style.touchAction = 'none';
      this.app.stage.addChild(this.world);
      this.input = new WorldInput(this.mountElement, action => this._inputAction(action));

      // Bottom-left page-name label -- a plain DOM element (not world-space),
      // so it stays fixed on screen instead of scrolling with the camera.
      this._roomLabel = document.createElement("div");
      this._roomLabel.className = "room-label";
      // Keep the internal label detached; the world HUD now shows deck progress.

      // Loaded unconditionally, regardless of which branch below the local
      // player ends up using: remote players in the room always render with
      // the plain sprite (upsertRemotePlayer), since the rig system hasn't
      // been extended to them yet -- so this._playerTexture has to be set
      // even when the local player successfully loads a RigActor instead.
      this._playerTexture = await PIXI.Assets.load(PLAYER_TEXTURE_URL);
      this._playerBaseScale = PLAYER_HEIGHT / this._playerTexture.height;

      try {
        const [rig, idle, run, rigArt] = await Promise.all([
          fetch(PLAYER_RIG_URL).then((response) => response.json()),
          fetch(PLAYER_CLIP_URLS.idle).then((response) => response.json()),
          fetch(PLAYER_CLIP_URLS.run).then((response) => response.json()),
          loadRigArt(PLAYER_ART_URL),
        ]);
        const character = rigArt.character && { ...rigArt.character, appearance: this.characterAppearance ?? rigArt.character.appearance };
        this.player = new RigActor({ rig, clips: { idle, run }, appearance: { equipment: this.playerAppearance }, art: rigArt.art, textures: rigArt.textures, character });
        this.player.setDisplayHeight(PLAYER_HEIGHT);
        this._isRigPlayer = true;
      } catch (error) {
        console.warn("WorldScene: rig failed to load; using the legacy player sprite", error);
        this.player = new PIXI.Sprite(this._playerTexture);
        this.player.anchor.set(0.5, 1); // feet at this.player.position
        this._playerBaseScale = PLAYER_HEIGHT / this._playerTexture.height;
        this.player.scale.set(this._playerBaseScale);
      }
      this.world.addChild(this.player);

      // NOT a child of this.player: this.player is itself the scaled sprite
      // (scale ~0.07, to bring the raw source art down to PLAYER_HEIGHT) --
      // unlike a remote player's {container, sprite, label} where only the
      // sprite is scaled and label/bubble are unscaled siblings, this.player
      // has no such wrapping container. A child of this.player would inherit
      // that scale and render at ~7% size, effectively invisible. So this
      // (and _ownBubble) live directly in this.world instead, world-space
      // positioned, and kept in sync with this.player every tick (_onTick) --
      // the same "text added straight to this.world" pattern _showFloatingDamage
      // already uses for exactly this reason.
      const ownLabel = new PIXI.Text({
        text: "",
        style: { fontSize: 11, fill: ROLE_COLORS[DEFAULT_ROLE], stroke: { color: 0x000000, width: 3 } },
      });
      ownLabel.anchor.set(0.5, 1);
      this.world.addChild(ownLabel);
      this._ownLabel = ownLabel;

      this._chatLog = document.createElement("div");
      this._chatLog.className = "chat-log";
      this.mountElement.appendChild(this._chatLog);

      this._chatInput = document.createElement("input");
      this._chatInput.className = "chat-input";
      this._chatInput.type = "text";
      this._chatInput.maxLength = CHAT_MAX_LENGTH;
      this._chatInput.placeholder = "Say something...";
      this._chatInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const text = this._chatInput.value.trim();
        if (!text) return;
        this._chatInput.value = "";
        this.onChatSend?.(text);
      });
      this.mountElement.appendChild(this._chatInput);

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
        // The combat stage's own shrink/restore (enterCombatStage/
        // exitCombatStage) resizes the renderer directly and deliberately
        // skips the zone/background re-layout the full resize() does -- if
        // this observer's generic handler also ran for that same size
        // change, it would re-layout the whole zone at the tiny stage size
        // and corrupt it. A real container resize (rotation, window resize)
        // is rare enough mid-fight to accept picking it back up once the
        // fight ends (exitCombatStage measures fresh at that point).
        if (this.inCombat) return;
        const { width, height } = entries[0].contentRect;
        this.resize(width, height);
      });
      this._resizeObserver.observe(this.mountElement);

      this._pixiReady = true;
    }

    await this._loadPage(zoneJsonUrl, { spawn: true });
  }

  // The inventory owns item state. This small bridge keeps the world actor in
  // sync when an equip screen is added, without coupling Pixi to app.js.
  setPlayerAppearance(equipment) {
    this.playerAppearance = equipment ?? {};
    if (this._isRigPlayer) this.player.applyAppearance({ equipment: this.playerAppearance });
  }

  setCharacterAppearance(appearance) {
    if (JSON.stringify(this.characterAppearance) === JSON.stringify(appearance)) return;
    this.characterAppearance = appearance;
    if (this._isRigPlayer) this.player.setCharacterAppearance(appearance);
  }

  // Tears down and rebuilds everything that's specific to one page: the
  // background (real image, or a flat placeholder for a "blank" page),
  // mobs, edge arrows, and the room label. The PIXI app/canvas/player/
  // ticker/listeners set up once in loadZone() are untouched.
  //
  // spawn: true only for the very first page ever loaded -- positions the
  // player at the zone's own authored spawn point. entryEdge: "left"|"right"
  // for every later page, reached by walking off a neighboring page's edge --
  // positions the player just inside the matching edge of the new page, so
  // continuing to walk the same direction feels continuous across the seam.
  async _loadPage(zoneJsonUrl, { spawn = false, entryEdge = null } = {}) {
    let zone;
    try {
      zone = await fetch(zoneJsonUrl).then((r) => r.json());
    } catch (err) {
      console.error(`WorldScene: failed to load zone at ${zoneJsonUrl}`, err);
      return;
    }

    this._pageReady = false;
    this._teardownPage();

    this.zone = { ...zone };
    this.pageId = zone.id;
    this.links = { prev: zone.links?.prev ?? null, next: zone.links?.next ?? null };

    const { height } = this.mountElement.getBoundingClientRect();

    if (zone.blank) {
      this._backgroundTexture = null;
      this.zone.groundTopFrac = zone.groundTopFrac ?? BLANK_ROOM_GROUND_TOP_FRAC;
      this.zone.groundBottomFrac = zone.groundBottomFrac ?? BLANK_ROOM_GROUND_BOTTOM_FRAC;
      this.zone.spawnXFrac = zone.spawnXFrac ?? 0.5;
      this.zone.spawnYFrac = zone.spawnYFrac ?? BLANK_ROOM_GROUND_TOP_FRAC + 0.02;
      this.background = new PIXI.Graphics();
    } else {
      // backgroundImage is authored root-relative (e.g. "assets/foo.png"),
      // same convention as the rest of the project's data-referenced asset
      // paths -- resolved against the server root, not the page that
      // happened to load this zone, so it's correct from both index.html
      // and dev/world-preview.html.
      const backgroundUrl = new URL(zone.backgroundImage, new URL('../../',import.meta.url)).href;
      this._backgroundTexture = await PIXI.Assets.load(backgroundUrl);
      this.background = new PIXI.Sprite(this._backgroundTexture);
    }
    this.world.addChildAt(this.background, 0); // always stays behind the player/mobs/arrows
    this.background.zIndex=-100000;

    // Ground bounds are stored as fractions of the display height, not fixed
    // pixels -- the background always scales to fill the canvas's current
    // height exactly (see resize()), and this derives the matching walkable
    // band from that scale every time, in world-movement.js's existing
    // units. This is what "where the character can/cannot walk" comes from:
    // it's the actual dirt path in the artwork (or the placeholder band, for
    // a blank page), not a guessed range.
    this._applyBackgroundLayout(Math.max(480,height));
    this._updateRoomLabel();

    if (spawn) {
      this.position = { x: this.zone.spawnX, y: this.zone.spawnY };
    } else if (entryEdge) {
      const direction=({left:'west',right:'east'})[entryEdge]??entryEdge;
      const point=exitPoint(this.zone,direction,roomExits(this.zone)[direction]?.at??.5,.025);
      this.position={x:point.x*this.zone.width,y:point.y*this._lastDisplayHeight};
    }
    this.position = clampToZone(this.position, this.zone);
    this.target = { ...this.position };
    this.velocity = { x: 0, y: 0 };
    this._directMovement = false;
    this.player.position.set(this.position.x, this.position.y);

    for (const rawMobData of zone.mobs ?? []) {
      const resolved=resolveMob(rawMobData);
      const mobData = { ...resolved, hp: resolved.stats.hp };
      const mobUrl = new URL(mobData.image, new URL('../../',import.meta.url)).href;
      const mobTexture = await PIXI.Assets.load(mobUrl);

      const container = new PIXI.Container();

      const mobScale = MOB_HEIGHT / mobTexture.height;

      // Ground marker stays readable with any character silhouette.
      const glow = new PIXI.Graphics()
        .ellipse(0, -3, 30, 8)
        .fill({ color: 0xc7b775, alpha: 0.4 })
        .stroke({ color: 0xf1d991, width: 2, alpha: 0.95 });
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
    this._pageReady = true;
    const bounds=this.mountElement.getBoundingClientRect();
    this.resize(bounds.width,bounds.height);
    this._updateCamera(0, true);
    this.onPageEnter?.(zone.id, this._positionFrac());
  }

  // Removes everything specific to whichever page was previously loaded
  // (harmless no-op the first time, when there's nothing to remove yet).
  // Movement lock state is reset defensively -- it should already be clear
  // by the time a transition can happen, since combat/approach both lock
  // the ground-clicks that would otherwise send the player toward an edge.
  _teardownPage() {
    if (this.background) {
      this.world.removeChild(this.background);
      this.background.destroy?.();
      this.background = null;
    }
    for (const entry of this.mobs) {
      this.world.removeChild(entry.container);
    }
    this.mobs = [];
    this.selectedMob = null;
    this.inCombat = false;
    this._approaching = false;
    this._pendingMobStates.clear();
    this.clearRemotePlayers();
    for (const key of Object.keys(this._arrows)) {
      if (this._arrows[key]) {
        this.world.removeChild(this._arrows[key]);
        this._arrows[key] = null;
      }
    }
  }

  // Scales the background to fill the given height (preserving its aspect
  // ratio -- or, for a blank page, BLANK_ROOM_ASPECT) and recomputes
  // zone.width/groundTop/groundBottom/spawnX/spawnY from the *Frac fields
  // against that new scale. Also re-lays-out the edge arrows, since their
  // x position depends on zone.width.
  _applyBackgroundLayout(displayHeight) {
    let displayWidth;
    if (this.zone.blank) {
      displayWidth = displayHeight * BLANK_ROOM_ASPECT;
      const groundY = displayHeight * this.zone.groundTopFrac;
      this.background.clear()
        .rect(0, 0, displayWidth, groundY).fill(BLANK_SKY_COLOR)
        .rect(0, groundY, displayWidth, displayHeight - groundY).fill(BLANK_GROUND_COLOR);
    } else {
      const scale = displayHeight / this._backgroundTexture.height;
      displayWidth = this._backgroundTexture.width * scale;
      this.background.height = displayHeight;
      this.background.width = displayWidth;
    }

    this.zone.width = displayWidth;
    this.zone.groundTop = this.zone.groundTopFrac * displayHeight;
    this.zone.groundBottom = this.zone.groundBottomFrac * displayHeight;
    this.zone.spawnX = this.zone.spawnXFrac * displayWidth;
    this.zone.spawnY = this.zone.spawnYFrac * displayHeight;
    this._lastDisplayHeight = displayHeight;
    this._layoutArrows();
  }

  // Rebuilds the left/right edge-arrow graphics from scratch (cheap -- at
  // most two small Graphics objects) wherever this.links says a neighboring
  // page exists. Called after every layout change, since arrow x position
  // depends on zone.width.
  walkToExit(direction) {
    if(this.inCombat||this._approaching||this._transitioning||!this._pageReady)return;
    const exit=roomExits(this.zone)[direction];if(!exit)return;
    const target=exitPoint(this.zone,direction,exit.at);
    this.target={x:target.x*this.zone.width,y:target.y*this._lastDisplayHeight};
    this._directMovement=false;this._emitMove(true);
  }

  _layoutArrows() {
    for(const arrow of Object.values(this._arrows))if(arrow){this.world.removeChild(arrow);arrow.destroy();}
    this._arrows={};
    for(const [direction,exit] of Object.entries(roomExits(this.zone))){
      const point=exitPoint(this.zone,direction,exit.at,.015);
      const graphic=new PIXI.Graphics().poly([-12,-16,12,0,-12,16]).fill({color:ARROW_COLOR,alpha:.85}).stroke({color:0x292619,width:2});
      graphic.rotation={east:0,south:Math.PI/2,west:Math.PI,north:-Math.PI/2}[direction];
      graphic.position.set(point.x*this.zone.width,point.y*this._lastDisplayHeight);
      graphic.eventMode='static';graphic.cursor='pointer';
      graphic.on('pointertap',event=>{
        event.stopPropagation();
        this.walkToExit(direction);
      });
      this.world.addChild(graphic);this._arrows[direction]=graphic;
    }
  }

  _updateRoomLabel() {
    if (this._roomLabel) this._roomLabel.textContent = this.zone.displayName ?? this.pageId;
  }

  // Triggered from _onTick when the player reaches a page's edge and a link
  // exists there. entryEdge is which edge of the *new* page the player
  // should appear at -- walking off this page's right edge (links.next)
  // means arriving at the new page's left edge, and vice versa.
  async _transitionToPage(pageId, entryEdge) {
    if (this._transitioning) return; // ignore a re-trigger while the fetch/rebuild is already in flight
    this._transitioning = true;
    const url = this.zoneUrlForId?this.zoneUrlForId(pageId):new URL(`../../data/zones/${pageId}.json`, import.meta.url).href;
    try {await this._loadPage(url, { entryEdge });}
    finally {this._transitioning = false;}
  }

  // Mobs stand at a fixed xFrac of the zone width, on the same ground line the
  // player walks -- vertically centered in the walkable band, not per-mob.
  _layoutMobs() {
    const groundY = (this.zone.groundTop + this.zone.groundBottom) / 2;
    for (const { data, container } of this.mobs) {
      container.position.set(data.xFrac * this.zone.width, Number.isFinite(data.yFrac)?data.yFrac*this._lastDisplayHeight:groundY);
    }
  }

  resize(width, height) {
    // A transient 0 (container briefly detached/hidden, a mid-layout
    // ResizeObserver callback) must never be treated as a real size -- it
    // would zero out zone.width and permanently corrupt the next resize's
    // fraction math into NaN. Skip degenerate sizes entirely.
    if (!(width > 0) || !(height > 0)) return;
    // A page load/transition is still in flight (background texture still
    // loading, mobs still being built) -- resizing now would touch zone/
    // background state that isn't fully assigned yet. The next real layout
    // (end of _loadPage) already accounts for the current size, so this
    // resize is safe to just skip.
    if (!this._pageReady) return;

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

    this._applyBackgroundLayout(Math.max(480,height));
    this._layoutMobs();

    if (canRescalePosition) {
      this.position = { x: posXFrac * this.zone.width, y: posYFrac * this._lastDisplayHeight };
      this.target = { x: targetXFrac * this.zone.width, y: targetYFrac * this._lastDisplayHeight };
      this.player.position.set(this.position.x, this.position.y);
    }
    this.velocity={x:0,y:0};
    this._updateCamera(0,true);
  }

  pause() {
    this.input?.setActive(false);
    this.velocity = { x: 0, y: 0 };
    if(this._directMovement){this.target={...this.position};this._emitMove(true);}
    this._directMovement=false;
    this._pointerHeld=false;
    this.app.ticker?.stop();
  }

  resume() {
    this.input?.setActive(true);
    this.app.ticker?.start();
  }

  _inputAction(action) {
    if(!this._pageReady || this.inCombat || this._transitioning)return;
    if(action==='cancel') {
      this._approaching=false;this.target={...this.position};this.velocity={x:0,y:0};this.input.reset();this._directMovement=false;this._deselectMob();this._emitMove(true);return;
    }
    if(this._approaching)return;
    if(this.selectedMob){this.engageSelectedMob();return;}
    const nearest=this.mobs.filter(m=>!m.dead).sort((a,b)=>Math.hypot(a.container.x-this.position.x,a.container.y-this.position.y)-Math.hypot(b.container.x-this.position.x,b.container.y-this.position.y))[0];
    if(nearest && Math.abs(nearest.container.x-this.position.x)<260)this._onMobClick(nearest);
  }

  _updateCamera(deltaMS, snap=false) {
    const frame=worldFraming(this.app.screen.width,this.app.screen.height,this.zone.width,this.zone.exits?this.position.y:(this.zone.groundTop+this.zone.groundBottom)/2,this.input?.touch,this._lastDisplayHeight,1,this.inCombat?COMBAT_FEET_FRACTION:undefined,!this.inCombat,this.inCombat?this._combatZoom:null);
    this.zoom=frame.zoom;this.cameraY=snap?frame.cameraY:easeToward(this.cameraY??frame.cameraY,frame.cameraY,deltaMS,5);
    const focus=this.selectedMob && (this.inCombat || this._approaching)?(this.position.x+this.selectedMob.container.x)/2:null;
    this.cameraX=snap?computeCenteredCameraX(this.position.x,frame.viewWidth,this.zone.width):smoothCameraX(this.position.x,this.cameraX,this.velocity.x,frame.viewWidth,this.zone.width,deltaMS,focus);
    this.world.scale.set(this.zoom);
    this.world.position.set(-this.cameraX*this.zoom,-this.cameraY*this.zoom);
  }

  // Shrinks the canvas to a fixed rectangle pinned to the top of the screen
  // for the whole fight -- a dedicated combat stage, set once here and never
  // resized or re-panned again until exitCombatStage(). Deliberately resizes
  // just the renderer + camera, not the full resize() pipeline: that also
  // re-lays-out the zone's background/ground/mobs to fit the new height,
  // which is right for a real container resize but would rescale the whole
  // room down to fit this tiny stage instead of just cropping into it.
  enterCombatStage() {
    const view = this.mountElement.closest(".view") ?? this.mountElement.parentElement;
    const viewRect = view?.getBoundingClientRect();
    const bottomBar = view?.querySelector(".world-progress");
    const battleHeight = (viewRect?.height ?? this.app.screen.height) - (bottomBar?.getBoundingClientRect().height ?? 0);
    const stageHeight = Math.max(60, battleHeight * COMBAT_STAGE_FRACTION);
    document.documentElement.style.setProperty("--combat-stage-height", `${stageHeight}px`);
    document.body.classList.add("in-combat");

    // Capture where the camera visually is right now, resize the renderer to
    // the new stage, then let _updateCamera(snap) compute (not yet render)
    // where it needs to end up -- the actual this.world.scale/position get
    // animated from the old values to those new ones below, rather than
    // jumping straight there.
    const startZoom = this.zoom, startX = this.cameraX, startY = this.cameraY;
    this.app.renderer.resize(this.app.screen.width, stageHeight);
    this._combatZoom = (stageHeight * COMBAT_FILL_FRACTION) / 138;
    this._updateCamera(0, true);
    const targetZoom = this.zoom, targetX = this.cameraX, targetY = this.cameraY;

    this._animate(COMBAT_STAGE_TRANSITION_MS, (t) => {
      const eased = 1 - (1 - t) ** 3; // ease-out: fast start, gentle settle
      const zoom = startZoom + (targetZoom - startZoom) * eased;
      const x = startX + (targetX - startX) * eased;
      const y = startY + (targetY - startY) * eased;
      this.world.scale.set(zoom);
      this.world.position.set(-x * zoom, -y * zoom);
    });
  }

  // Restores the canvas to its normal full size and framing once a fight ends.
  exitCombatStage() {
    document.body.classList.remove("in-combat");
    const { width, height } = this.mountElement.getBoundingClientRect();
    this.app.renderer.resize(width, height);
    this._updateCamera(0, true);
  }

  // Hit animations from successive grades must never visually overlap (both
  // would fight over the same sprites' positions) -- but showing the next
  // card must never wait for one to finish either (see app.js's handleGrade).
  // Queuing lets a caller fire-and-forget while still guaranteeing order.
  queueHit(hits) {
    this._hitQueue = (this._hitQueue ?? Promise.resolve())
      .then(() => this.playHit(hits))
      .catch((err) => console.error(err));
    return this._hitQueue;
  }

  _setTargetFromPointer(event) {
    if(this.input?.touch && this.input.preferences?.mode === "joystick")return;
    if (this.inCombat || this._approaching) return; // movement is scripted (walk-up) or locked (fight) -- never a ground click's job to change it
    if (this.selectedMob) {
      // A mob is selected -- this ground click (mob clicks never reach here,
      // see _onMobClick) only deselects. It doesn't also move the player;
      // the next click, now with nothing selected, is a normal move-click.
      this._deselectMob();
      return;
    }
    const rect = this.app.canvas.getBoundingClientRect();
    this.velocity={x:0,y:0};this._directMovement=false;
    const worldPoint = {
      x: (event.clientX - rect.left) / this.zoom + this.cameraX,
      y: (event.clientY - rect.top) / this.zoom + this.cameraY,
    };
    this.target = clampToZone(worldPoint, this.zone);
    this._emitMove();
  }

  _onMobClick(mobEntry) {
    if (this.inCombat || this._approaching) return; // a fight is already running or starting; mob clicks do nothing until it ends
    if (mobEntry.dead) return; // respawning -- not interactable yet
    if (this.selectedMob === mobEntry) {
      this.engageSelectedMob();
      return;
    }
    if (this.selectedMob) this.selectedMob.glow.visible = false;
    this.selectedMob = mobEntry;
    mobEntry.glow.visible = true;
    this.onMobSelected?.(mobEntry.data);
  }

  // Walks the player up to the currently selected mob; combat actually
  // starts once the walk finishes (see _onTick). Shared by a second click
  // on the selected mob (see _onMobClick above) and the encounter panel's
  // "Fight" button.
  engageSelectedMob() {
    if (!this.selectedMob || this.inCombat || this._approaching) return;
    this._approaching = true;
    const mobEntry = this.selectedMob;
    const mobX = mobEntry.container.position.x;
    const approachX = mobX + (this.position.x < mobX ? -APPROACH_DISTANCE : APPROACH_DISTANCE);
    this.target = clampToZone({ x: approachX, y: mobEntry.container.y }, this.zone);
    this._emitMove(true);
  }

  _deselectMob() {
    if (!this.selectedMob) return;
    this.selectedMob.glow.visible = false;
    this.selectedMob = null;
    this.onMobSelected?.(null);
  }

  // Public wrapper for _deselectMob() -- the encounter panel's "Flee" button.
  deselectMob() {
    this._deselectMob();
  }

  // mobDefeated: true hides the fought mob right away; false leaves it exactly
  // where it was (the player fled or lost). Either way, clears the selection
  // glow and unlocks movement. Respawning is the room's job (src/game/room.js):
  // it arrives later as a mob state through applyMobState().
  endCombat({ mobDefeated }) {
    const entry = this.selectedMob;
    if (mobDefeated && entry) {
      entry.dead = true;
      entry.container.visible = false;
    }
    if (entry) entry.glow.visible = false;
    this.selectedMob = null;
    this.inCombat = false;
    this._approaching = false; // defensive -- should already be false by the time a fight can end
    this.exitCombatStage();
    if (entry && this._pendingMobStates.has(entry.data.id)) {
      const pending = this._pendingMobStates.get(entry.data.id);
      this._pendingMobStates.delete(entry.data.id);
      this._applyMobStateNow(entry, pending);
    }
    this.onMobSelected?.(null);
  }

  // Snaps the player back to the zone's spawn point -- used after a defeat,
  // once the grey fade (owned by app.js) has fully covered the screen. No
  // walk animation: this is a teleport, not a walk.
  respawnPlayer() {
    this.velocity={x:0,y:0};this._directMovement=false;this.input?.reset();
    this.position = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.target = { x: this.zone.spawnX, y: this.zone.spawnY };
    this.player.position.set(this.position.x, this.position.y);
    this._syncOwnOverlays();
    this._updateCamera(0,true);
    this._emitMove(true);
  }

  // ---------- room state (from the session: local Room or the server) ----------

  // A room snapshot from joinZone(): every mob's live state and everyone else here.
  applyRoomSnapshot(snapshot) {
    if (!snapshot) return;
    for (const state of snapshot.mobs ?? []) this.applyMobState(state);
    this.clearRemotePlayers();
    for (const view of snapshot.players ?? []) this.upsertRemotePlayer(view, { snap: true });
  }

  // state: { id, hp, maxHp, dead }
  applyMobState(state) {
    const entry = this.mobs.find((m) => m.data.id === state.id);
    if (!entry) return;
    const fightingIt = this.selectedMob === entry && (this.inCombat || this._approaching);
    if (fightingIt) {
      this._pendingMobStates.set(state.id, state);
      return;
    }
    this._applyMobStateNow(entry, state);
  }

  _applyMobStateNow(entry, state) {
    entry.data.hp = state.hp;
    entry.dead = state.dead;
    entry.container.visible = !state.dead;
    if (!state.dead) entry.container.alpha = 1; // undo the death fade from _playSingleHit
    this._updateMobHpBar(entry);
    if (state.dead && this.selectedMob === entry) this._deselectMob();
  }

  // Our own fight's round result: set the mob's HP before playHit() animates it.
  setMobHp(mobId, hp) {
    const entry = this.mobs.find((m) => m.data.id === mobId);
    if (entry) entry.data.hp = hp;
  }

  // Someone else in the room hit a mob: show their damage number and the new HP.
  showMobHit({ mobId, damage, hp }) {
    const entry = this.mobs.find((m) => m.data.id === mobId);
    if (!entry || entry.dead) return;
    entry.data.hp = hp;
    this._showFloatingDamage(entry.container, damage, false);
    this._updateMobHpBar(entry);
  }

  // msg: { id, name, role, text } -- from the session's "chat" event (see app.js).
  showChatMessage({ id, name, role, text }) {
    this._showChatBubble(id, text);
    this._appendChatLogLine({ name, role, text });
  }

  _showChatBubble(id, text) {
    const isOwn = id === this._ownId;
    const remote = isOwn ? null : this.remotePlayers.get(id);
    // For a remote player, the bubble is a child of their (unscaled)
    // container, same as their label. For our own player, this.player IS
    // the scaled sprite (see the note by _ownLabel's creation in loadZone),
    // so the bubble goes straight into this.world instead and is repositioned
    // every tick in _onTick, not parented to this.player.
    if (!isOwn && !remote) return;

    if (isOwn) {
      if (this._ownBubbleTimer) clearTimeout(this._ownBubbleTimer);
      if (this._ownBubble) { const old = this._ownBubble; this._ownBubble = null; this.world.removeChild(old); old.destroy(); }
    } else {
      if (remote.bubbleTimer) clearTimeout(remote.bubbleTimer);
      if (remote.bubble) { const old = remote.bubble; remote.bubble = null; remote.container.removeChild(old); old.destroy(); }
    }

    const bubble = new PIXI.Text({
      text,
      style: { fontSize: 11, fill: 0xffffff, stroke: { color: 0x1a2438, width: 3 }, wordWrap: true, wordWrapWidth: 160, align: "center" },
    });
    bubble.anchor.set(0.5, 1);
    if (isOwn) {
      bubble.position.set(this.player.position.x, this.player.position.y + CHAT_BUBBLE_OFFSET_Y);
      this.world.addChild(bubble);
    } else {
      bubble.position.set(0, CHAT_BUBBLE_OFFSET_Y);
      remote.container.addChild(bubble);
    }

    // A second message for the same sender can arrive mid-fade and replace
    // this bubble in the slot (see the "clear prior bubble" block above,
    // which nulls the slot before destroying the old bubble). isCurrent()
    // lets both the per-frame write and the completion no-op once that has
    // happened, instead of writing to / double-destroying a stale bubble.
    const isCurrent = () => (isOwn ? this._ownBubble : this.remotePlayers.get(id)?.bubble) === bubble;

    const timer = setTimeout(() => {
      this._animate(300, (t) => { if (isCurrent()) bubble.alpha = 1 - t; }).then(() => {
        if (!isCurrent()) return;
        bubble.parent?.removeChild(bubble);
        bubble.destroy();
        if (isOwn) { this._ownBubble = null; this._ownBubbleTimer = null; }
        else {
          const r = this.remotePlayers.get(id);
          if (r) { r.bubble = null; r.bubbleTimer = null; }
        }
      });
    }, CHAT_BUBBLE_MS);

    if (isOwn) { this._ownBubble = bubble; this._ownBubbleTimer = timer; }
    else {
      remote.bubble = bubble;
      remote.bubbleTimer = timer;
    }
  }

  _appendChatLogLine({ name, role, text }) {
    if (!this._chatLog) return;
    const line = document.createElement("div");
    line.className = "chat-log-line";
    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-log-name";
    nameSpan.style.color = cssColor(role);
    nameSpan.textContent = name;
    line.append(nameSpan, document.createTextNode(": " + text));
    this._chatLog.appendChild(line);
    while (this._chatLog.children.length > CHAT_LOG_MAX_LINES) this._chatLog.removeChild(this._chatLog.firstChild);
    this._chatLog.scrollTop = this._chatLog.scrollHeight;
  }

  // view: { id, name, level, x, y, tx, ty } in zone fractions. snap: jump
  // straight to x/y (joining, respawn) instead of continuing from where we drew them.
  upsertRemotePlayer(view, { snap = false } = {}) {
    let remote = this.remotePlayers.get(view.id);
    if (!remote) {
      if (!this._playerTexture) return;
      const container = new PIXI.Container();
      const sprite = new PIXI.Sprite(this._playerTexture);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(this._playerBaseScale);
      sprite.alpha = 0.92;
      container.addChild(sprite);
      const label = new PIXI.Text({
        text: "",
        style: { fontSize: 11, fill: ROLE_COLORS[DEFAULT_ROLE], stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, NAMEPLATE_OFFSET_Y);
      container.addChild(label);
      // Behind our own character, so you always see yourself on top.
      this.world.addChildAt(container, Math.max(0, this.world.getChildIndex(this.player)));
      remote = { view: { ...view }, container, sprite, label, facingLeft: false, bubble: null, bubbleTimer: null };
      this.remotePlayers.set(view.id, remote);
      snap = true;
    }
    const drawn = { x: remote.view.x, y: remote.view.y };
    remote.view = { ...remote.view, ...view };
    // Keep gliding from where we drew them, unless told to jump or they are
    // too far off (lag, a missed message) to glide believably.
    const farOff = Math.hypot(view.x - drawn.x, view.y - drawn.y) > 0.15;
    if (!snap && !farOff) Object.assign(remote.view, drawn);
    remote.label.text = `${remote.view.name} · Lv ${remote.view.level}`;
    remote.label.style.fill = ROLE_COLORS[normalizeRole(remote.view.role)];
    this._placeRemote(remote, 0);
  }

  updateRemotePlayerProfile({ id, name, level }) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    Object.assign(remote.view, { name, level });
    remote.label.text = `${name} · Lv ${level}`;
  }

  // Called by app.js whenever the signed-in player's name or role is known/changes.
  setOwnProfile({ name, role } = {}) {
    if (name !== undefined) this._ownName = name;
    if (role !== undefined) this._ownRole = normalizeRole(role);
    if (!this._ownLabel) return;
    this._ownLabel.text = this._ownName;
    this._ownLabel.style.fill = ROLE_COLORS[this._ownRole];
  }

  setOwnPlayerId(id) {
    this._ownId = id;
  }

  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    if (remote.bubbleTimer) clearTimeout(remote.bubbleTimer);
    this.world.removeChild(remote.container);
    remote.container.destroy({ children: true });
    this.remotePlayers.delete(id);
  }

  clearRemotePlayers() {
    for (const id of [...this.remotePlayers.keys()]) this.removeRemotePlayer(id);
  }

  // Walks a remote player toward their target at the same speed we walk.
  _placeRemote(remote, deltaMS) {
    if (!this.zone?.width || !this._lastDisplayHeight) return;
    const width = this.zone.width;
    const height = this._lastDisplayHeight;
    const current = { x: remote.view.x * width, y: remote.view.y * height };
    const target = { x: remote.view.tx * width, y: remote.view.ty * height };
    const next = deltaMS > 0 ? stepTowardTarget(current, target, deltaMS, MOVE_SPEED) : current;
    const dx = next.x - current.x;
    if (dx > 0.01) remote.facingLeft = false;
    else if (dx < -0.01) remote.facingLeft = true;
    remote.view.x = next.x / width;
    remote.view.y = next.y / height;
    remote.container.position.set(next.x, next.y);
    remote.sprite.scale.set(remote.facingLeft ? -this._playerBaseScale : this._playerBaseScale, this._playerBaseScale);
  }

  // Keeps our own nameplate/bubble (both children of this.world, not of
  // this.player -- see the note in loadZone) glued to this.player's current
  // world position every tick.
  _syncOwnOverlays() {
    this.player.zIndex=this.position.y;
    for(const mob of this.mobs)mob.container.zIndex=mob.container.y;
    for(const remote of this.remotePlayers.values())remote.container.zIndex=remote.container.y;
    if(this._ownLabel)this._ownLabel.zIndex=10000;
    if(this._ownBubble)this._ownBubble.zIndex=10001;
    if (this._ownLabel) this._ownLabel.position.set(this.position.x, this.position.y + NAMEPLATE_OFFSET_Y);
    if (this._ownBubble) this._ownBubble.position.set(this.position.x, this.position.y + CHAT_BUBBLE_OFFSET_Y);
  }

  _positionFrac() {
    const width = this.zone?.width || 1;
    const height = this._lastDisplayHeight || 1;
    return { x: this.position.x / width, y: this.position.y / height };
  }

  // Throttled: at most one intent per MOVE_SEND_INTERVAL_MS, always sending the
  // latest one. force skips the wait (arriving, engaging, respawning).
  _emitMove(force = false) {
    if (!this.onMoveIntent || !this._pageReady) return;
    const send = () => {
      this._moveSendTimer = null;
      this._lastMoveSentAt = performance.now();
      const width = this.zone.width || 1;
      const height = this._lastDisplayHeight || 1;
      this.onMoveIntent({
        x: this.position.x / width,
        y: this.position.y / height,
        tx: this.target.x / width,
        ty: this.target.y / height,
      });
    };
    const wait = MOVE_SEND_INTERVAL_MS - (performance.now() - this._lastMoveSentAt);
    if (force || wait <= 0) {
      clearTimeout(this._moveSendTimer);
      send();
    } else if (!this._moveSendTimer) {
      this._moveSendTimer = setTimeout(send, wait);
    }
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
    text.zIndex=10002;
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
    // The ticker starts running during the one-time PIXI setup, before the
    // very first _loadPage() call ever completes -- and a page transition
    // clears this flag too, for the same reason. Without this guard, a tick
    // landing mid-load (this.zone assigned but zone.width not yet computed,
    // during the background texture's await) would silently corrupt
    // this.cameraX to NaN forever: computeCameraX's Math.min/Math.max chain
    // propagates a single NaN input into every future frame's output, the
    // same self-perpetuating-corruption failure mode already fixed once
    // this session for position/target via a degenerate-resize guard.
    if (!this._pageReady) return;

    const dt=Math.min(50,Math.max(0,ticker.deltaMS));
    const previousX = this.position.x, previousY=this.position.y;
    const axis=this.input?.vector ?? {x:0,y:0};
    const direct=!this.inCombat && !this._approaching && (axis.x || axis.y);
    if(direct || (this._directMovement && !this.inCombat && !this._approaching)) {
      this._directMovement=true;this._pointerHeld=false;
      this.velocity.x=easeToward(this.velocity.x,axis.x*MOVE_SPEED,dt,18);
      this.velocity.y=easeToward(this.velocity.y,axis.y*MOVE_SPEED,dt,18);
      if(!direct && Math.hypot(this.velocity.x,this.velocity.y)<2){this.velocity={x:0,y:0};this._directMovement=false;}
      this.position=clampToZone({x:this.position.x+this.velocity.x*dt/1000,y:this.position.y+this.velocity.y*dt/1000},this.zone);
      // Short prediction target lets remote clients follow held controls.
      this.target=clampToZone({x:this.position.x+this.velocity.x*.12,y:this.position.y+this.velocity.y*.12},this.zone);
      if(!this._directMovement)this.target={...this.position};
      this._emitMove();
    } else {
      this.position = stepTowardTarget(this.position, this.target, dt, MOVE_SPEED);
      this.velocity={x:dt?(this.position.x-previousX)*1000/dt:0,y:dt?(this.position.y-previousY)*1000/dt:0};
    }
    const dx = this.position.x - previousX;
    if (dx > 0.01) this._facingLeft = false;
    else if (dx < -0.01) this._facingLeft = true;
    const moving = Math.hypot(this.position.x-previousX,this.position.y-previousY)>.01;

    if (this._isRigPlayer) {
      this.player.play(moving ? "run" : "idle");
      this.player.faceLeft(this._facingLeft);
      this.player.update(moving ? dt * Math.min(1,Math.max(.3,Math.hypot(this.velocity.x,this.velocity.y)/MOVE_SPEED)) : dt);
    } else {
      this.player.scale.x = this._facingLeft ? -this._playerBaseScale : this._playerBaseScale;
    }
    this.player.position.set(this.position.x, this.position.y);
    this._syncOwnOverlays();

    if (this._wasMoving && !moving) this._emitMove(true); // arrived: tell others exactly where we stopped
    this._wasMoving = moving;

    for (const remote of this.remotePlayers.values()) this._placeRemote(remote, ticker.deltaMS);

    if (this._approaching && Math.hypot(this.position.x - this.target.x, this.position.y-this.target.y) < 2) {
      this._approaching = false;
      this.inCombat = true;
      // "Within 2px" can be a frame before we actually stop, so the last intent
      // sent may still be the walk-up's start. The room checks we really stand
      // next to the mob -- tell it exactly where we are before engaging.
      this.position = { ...this.target };
      this.player.position.set(this.position.x, this.position.y);
      this._wasMoving = false;
      this._emitMove(true);
      this.enterCombatStage();
      this.onCombatStart?.(this.selectedMob.data);
    }

    // Movement is already locked during combat/approach, so this can only
    // fire from ordinary walking -- never mid-fight. A degenerate zone width
    // (the canvas laid out at 0px, e.g. loaded while hidden) puts x=0 on both
    // edges at once and would bounce between two pages forever, so skip it.
    const hasRealWidth = this.zone.width > EDGE_TRANSITION_MARGIN * 4;
    if (!this.inCombat && !this._approaching && hasRealWidth) {
      const exit=reachedExit(this.zone,{x:this.position.x/this.zone.width,y:this.position.y/this._lastDisplayHeight});
      if(exit)this._transitionToPage(exit.roomId,exit.entry).catch(error=>console.error('Room transition failed',error));
    }
    this._arrowPhase += ticker.deltaMS / 400;
    for(const arrow of Object.values(this._arrows))if(arrow)arrow.alpha=.8+Math.sin(this._arrowPhase)*.15;

    // The combat stage is framed once (enterCombatStage) and never re-panned
    // or re-zoomed between cards -- only the fighters' own lunge/shake tweens
    // move within that fixed frame (see _playSingleHit), so skip the usual
    // per-tick camera recompute for the whole fight, not just this tick.
    if (!this.inCombat) this._updateCamera(dt);
  }
}
