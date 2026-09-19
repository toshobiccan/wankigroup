export function clampToZone(pos, zone) {
  return {
    x: Math.min(Math.max(pos.x, 0), zone.width),
    y: Math.min(Math.max(pos.y, zone.groundTop), zone.groundBottom),
  };
}

export function movementVector(x, y) {
  const length = Math.hypot(x, y);
  return length ? { x: x / Math.max(1, length), y: y / Math.max(1, length) } : { x: 0, y: 0 };
}

export function easeToward(current, target, deltaMS, response = 9) {
  return current + (target - current) * (1 - Math.exp(-response * Math.max(0, deltaMS) / 1000));
}

// zoomBoost/feetFraction let a caller ask for a tighter, higher-framed shot
// (see world-scene.js's combat framing, so the fighters stay visible above
// the reading sheet) without this module knowing anything about combat --
// both default to the plain exploration framing this always had.
export function worldFraming(width, height, zoneWidth, groundY, touch = false, worldHeight = height, zoomBoost = 1, feetFraction = touch ? .65 : .76) {
  const zoom = Math.max(.9, Math.min(1.485, height * .234 / 118), width / zoneWidth, height / worldHeight) * zoomBoost;
  const viewWidth = width / zoom;
  const viewHeight = height / zoom;
  const feetScreenY = Math.min(height - 10, Math.max(height * feetFraction, 138 * zoom));
  const cameraY = Math.max(0, Math.min(worldHeight - viewHeight, groundY - feetScreenY / zoom));
  return { zoom, viewWidth, cameraY };
}

export function smoothCameraX(playerX, cameraX, velocityX, viewWidth, zoneWidth, deltaMS, focusX = null) {
  const desired = focusX === null
    ? computeCameraX(playerX + Math.max(-60, Math.min(60, velocityX * .22)), cameraX, viewWidth, zoneWidth, .22)
    : computeCenteredCameraX(focusX, viewWidth, zoneWidth);
  return Math.max(0, Math.min(Math.max(0, zoneWidth - viewWidth), easeToward(cameraX, desired, deltaMS)));
}

export function stepTowardTarget(current, target, deltaMS, speedPxPerSec) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: current.x, y: current.y };

  const maxStep = speedPxPerSec * (deltaMS / 1000);
  if (distance <= maxStep) return { x: target.x, y: target.y };

  const ratio = maxStep / distance;
  return { x: current.x + dx * ratio, y: current.y + dy * ratio };
}

export function computeCameraX(playerWorldX, cameraX, viewportWidth, zoneWidth, deadZoneFraction) {
  const deadZoneWidth = viewportWidth * deadZoneFraction;
  const deadZoneLeft = (viewportWidth - deadZoneWidth) / 2;
  const deadZoneRight = deadZoneLeft + deadZoneWidth;

  const playerScreenX = playerWorldX - cameraX;
  let newCameraX = cameraX;
  if (playerScreenX < deadZoneLeft) {
    newCameraX = playerWorldX - deadZoneLeft;
  } else if (playerScreenX > deadZoneRight) {
    newCameraX = playerWorldX - deadZoneRight;
  }

  const maxCameraX = Math.max(0, zoneWidth - viewportWidth);
  return Math.min(Math.max(newCameraX, 0), maxCameraX);
}

// Centers the given world-x point on screen, clamped the same way
// computeCameraX clamps -- used while approaching/fighting a mob, when the
// camera should frame the midpoint between player and mob instead of
// dead-zone-following the player alone.
export function computeCenteredCameraX(midpointX, viewportWidth, zoneWidth) {
  const maxCameraX = Math.max(0, zoneWidth - viewportWidth);
  return Math.min(Math.max(midpointX - viewportWidth / 2, 0), maxCameraX);
}
