export function normalizeAppearance(appearance = {}, slots = {}) {
  const equipment = {};
  for (const slotId of Object.keys(slots)) {
    equipment[slotId] = appearance.equipment?.[slotId] ?? null;
  }
  return { equipment };
}

export function resolveSlotMode(slotId, slots = {}) {
  const slot = slots[slotId];
  if (!slot) throw new Error(`Unknown equipment slot: ${slotId}`);
  return slot.mode ?? slot.attachments?.[0]?.mode ?? "overlay";
}
