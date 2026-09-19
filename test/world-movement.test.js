import { describe, it, expect } from "vitest";
import { clampToZone, stepTowardTarget, computeCameraX, computeCenteredCameraX, movementVector, easeToward, worldFraming, smoothCameraX } from "../src/world/world-movement.js";

it('normalizes held diagonal controls and opposing directions',()=>{
  expect(Math.hypot(...Object.values(movementVector(1,1)))).toBeCloseTo(1);
  expect(movementVector(0,0)).toEqual({x:0,y:0});
});
it('camera easing is independent of refresh rate and never overshoots',()=>{
  let x=0;for(let i=0;i<60;i++)x=easeToward(x,300,1000/60);
  expect(x).toBeCloseTo(easeToward(0,300,1000),8);
  expect(x).toBeLessThan(300);
});
it('frames wide and portrait rooms without exposing background edges',()=>{
  for(const [w,h] of [[390,650],[1100,580],[844,280]]) {
    const f=worldFraming(w,h,h*16/9,h*.75,true);
    expect(h*16/9*f.zoom).toBeGreaterThanOrEqual(w);
    expect(f.cameraY).toBeGreaterThanOrEqual(0);
    expect(f.cameraY+h/f.zoom).toBeLessThanOrEqual(h+.001);
  }
});
it('smooth following stays bounded and holds still in its dead zone',()=>{
  expect(smoothCameraX(200,0,0,400,2000,16)).toBe(0);
  expect(smoothCameraX(1999,1900,220,400,2000,16)).toBeLessThanOrEqual(1600);
  const x=smoothCameraX(900,300,220,400,2000,16);
  expect(x).toBeGreaterThan(300);expect(x).toBeLessThan(600);
});
it('uses the room height rather than a short battle viewport for vertical bounds',()=>{
  const f=worldFraming(844,240,480*16/9,360,true,480);
  expect(f.zoom).toBeLessThan(1.25);
  expect(f.cameraY+240/f.zoom).toBeLessThanOrEqual(480);
  expect((360-f.cameraY)*f.zoom).toBeCloseTo(240*.65);
});
it('keeps the whole character visible in a short touch viewport',()=>{
  const f=worldFraming(390,180,480*16/9,360,true,480);
  expect((360-118-f.cameraY)*f.zoom).toBeGreaterThanOrEqual(0);
  expect((360-f.cameraY)*f.zoom).toBeLessThan(180);
});
it('zoomBoost scales zoom (and therefore the fighters) up without changing anything else about the framing formula',()=>{
  const base=worldFraming(844,700,480*16/9,360,true,480);
  const boosted=worldFraming(844,700,480*16/9,360,true,480,1.35);
  expect(boosted.zoom).toBeCloseTo(base.zoom*1.35,5);
});
it('a lower feetFraction frames the subject higher on screen, e.g. so combat keeps the fighters above a reading sheet',()=>{
  // A tall room (worldHeight 2000) so the vertical-bounds clamp tested above
  // doesn't bind here -- this test isolates feetFraction's own effect.
  const normal=worldFraming(844,700,480*16/9,1000,true,2000);
  const combat=worldFraming(844,700,480*16/9,1000,true,2000,1.35,.42);
  const feetScreenY=(f)=>(1000-f.cameraY)*f.zoom;
  expect(feetScreenY(combat)).toBeLessThan(feetScreenY(normal));
  expect(feetScreenY(combat)).toBeCloseTo(700*.42,1);
});
it('clampToRoomBottom:false lets a tight combat crop look past the exploration room-bottom limit, toward the feet', () => {
  // Reproduces a real room where the player stands well above the room's
  // authored bottom edge (groundY=508.4, worldHeight=620, gap 111.6) -- with
  // the room-bottom clamp on, this gap alone was enough to push the combat
  // shot almost all the way back down to the plain exploration framing.
  const width=375, height=620, zoneWidth=2000, groundY=508.4, worldHeight=620;
  const clamped=worldFraming(width,height,zoneWidth,groundY,true,worldHeight,1.35,.42,true);
  const unclamped=worldFraming(width,height,zoneWidth,groundY,true,worldHeight,1.35,.42,false);
  const feetScreenY=(f)=>(groundY-f.cameraY)*f.zoom;
  expect(feetScreenY(clamped)).toBeGreaterThan(400); // clamp forces feet low on screen despite feetFraction
  expect(feetScreenY(unclamped)).toBeCloseTo(height*.42,1); // unclamped actually reaches the requested framing
});
it('clampToRoomBottom still floors cameraY at 0 when false, so it never looks above the top of the world', () => {
  const f=worldFraming(844,700,480*16/9,50,true,2000,1.35,.05,false);
  expect(f.cameraY).toBe(0);
});
it('explicitZoom overrides the whole zoom formula, e.g. to exactly fill a fixed combat-stage rectangle', () => {
  const f=worldFraming(375,124,2000,508.4,true,620,1,.97,false,2.5);
  expect(f.zoom).toBe(2.5);
  expect(f.viewWidth).toBeCloseTo(375/2.5,5);
});

const ZONE = { id: "plains", width: 2000, groundTop: 110, groundBottom: 190 };

describe("clampToZone", () => {
  it("clamps x to [0, zone.width]", () => {
    expect(clampToZone({ x: -50, y: 150 }, ZONE)).toEqual({ x: 0, y: 150 });
    expect(clampToZone({ x: 5000, y: 150 }, ZONE)).toEqual({ x: 2000, y: 150 });
  });

  it("clamps y to [zone.groundTop, zone.groundBottom]", () => {
    expect(clampToZone({ x: 100, y: 0 }, ZONE)).toEqual({ x: 100, y: 110 });
    expect(clampToZone({ x: 100, y: 500 }, ZONE)).toEqual({ x: 100, y: 190 });
  });

  it("leaves an in-range position unchanged", () => {
    expect(clampToZone({ x: 100, y: 150 }, ZONE)).toEqual({ x: 100, y: 150 });
  });
});

describe("stepTowardTarget", () => {
  it("moves speed*deltaMS/1000 world-pixels toward the target on one axis", () => {
    const result = stepTowardTarget({ x: 0, y: 150 }, { x: 200, y: 150 }, 1000, 100);
    expect(result).toEqual({ x: 100, y: 150 });
  });

  it("snaps exactly to the target instead of overshooting", () => {
    const result = stepTowardTarget({ x: 190, y: 150 }, { x: 200, y: 150 }, 1000, 100);
    expect(result).toEqual({ x: 200, y: 150 });
  });

  it("moving diagonally covers the same distance per tick as moving on one axis (not faster)", () => {
    const straight = stepTowardTarget({ x: 0, y: 150 }, { x: 200, y: 150 }, 500, 100);
    const diagonal = stepTowardTarget({ x: 0, y: 150 }, { x: 200, y: 190 }, 500, 100);

    const straightDist = Math.hypot(straight.x - 0, straight.y - 150);
    const diagonalDist = Math.hypot(diagonal.x - 0, diagonal.y - 150);
    expect(diagonalDist).toBeCloseTo(straightDist, 5);
    expect(diagonalDist).toBeCloseTo(50, 5); // 100 px/s * 0.5s
  });

  it("returns the current position unchanged once already at the target", () => {
    const result = stepTowardTarget({ x: 200, y: 150 }, { x: 200, y: 150 }, 1000, 100);
    expect(result).toEqual({ x: 200, y: 150 });
  });
});

describe("computeCameraX", () => {
  const VIEWPORT = 400;
  const ZONE_WIDTH = 2000;
  const DEAD_ZONE = 0.4; // dead-zone spans screen x [120, 280]

  it("stays put while the player is inside the dead-zone", () => {
    expect(computeCameraX(150, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(0);
    expect(computeCameraX(250, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(0);
  });

  it("pans right just enough to keep the player at the dead-zone's right edge", () => {
    expect(computeCameraX(300, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(20);
  });

  it("pans left just enough to keep the player at the dead-zone's left edge", () => {
    expect(computeCameraX(300, 200, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(180);
  });

  it("clamps to 0 at the zone's left edge", () => {
    expect(computeCameraX(10, 0, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(0);
  });

  it("clamps to zoneWidth - viewportWidth at the zone's right edge", () => {
    expect(computeCameraX(1990, 1600, VIEWPORT, ZONE_WIDTH, DEAD_ZONE)).toBe(1600);
  });

  it("stays at 0 when the zone is narrower than the viewport", () => {
    expect(computeCameraX(50, 0, VIEWPORT, 300, DEAD_ZONE)).toBe(0);
  });
});

describe("computeCenteredCameraX", () => {
  const VIEWPORT = 400;
  const ZONE_WIDTH = 2000;

  it("centers the given midpoint on screen", () => {
    expect(computeCenteredCameraX(1000, VIEWPORT, ZONE_WIDTH)).toBe(800);
  });

  it("clamps to 0 when centering would go past the zone's left edge", () => {
    expect(computeCenteredCameraX(50, VIEWPORT, ZONE_WIDTH)).toBe(0);
  });

  it("clamps to zoneWidth - viewportWidth when centering would go past the right edge", () => {
    expect(computeCenteredCameraX(1990, VIEWPORT, ZONE_WIDTH)).toBe(1600);
  });

  it("stays at 0 when the zone is narrower than the viewport", () => {
    expect(computeCenteredCameraX(150, VIEWPORT, 300)).toBe(0);
  });
});
