export function clampToZone(pos, zone) {
  return {
    x: Math.min(Math.max(pos.x, 0), zone.width),
    y: Math.min(Math.max(pos.y, zone.groundTop), zone.groundBottom),
  };
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
