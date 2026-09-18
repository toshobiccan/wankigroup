// Single source of truth for turning a bone id into the human-facing name
// verified against the actual mannequin art (see data/rigs/mannequin-axle-
// labels.json). Both the calibration tool's on-screen display and any
// future animation-authoring code must go through these functions rather
// than re-deriving a name from the bone id string -- rearX/frontX prefixes
// don't reliably match which side a bone renders on (see test/axle-labels
// .test.js's completeness check, and the "rig-bone-id-vs-visual-side"
// project note).

export function pointName(labels, boneId) {
  return labels.points?.[boneId] ?? boneId;
}

export function lineName(labels, boneId, fromId) {
  return labels.lines?.[boneId] ?? `${pointName(labels, fromId)} → ${pointName(labels, boneId)}`;
}
