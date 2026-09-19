# Registered wardrobe hairstyles

Ten new styles: textured crop, side part, quiff, messy spikes, swept fringe,
pixie, bob, high ponytail, braided crown, long waves. Legacy Adventurer and
Swept remain available, along with Bald.

Generated using the built-in Codex image tool. The approved head is the
registration reference for every asset. Preserve transparent canvas margins;
never trim each style to its visible bounds. Placement is recorded in
`data/rigs/character-head-v1.json`, under `hairstyles`.

The face, expression, eyes and ears keep their approved coordinates. The ear
stays below hair: overlapping locks cover it. All styles use the same recoloring and eyebrow palette.

## Generation recipe

Create only hair on a transparent 1230×1278 canvas, using
`assets/character/head-template-approved.png` as the skull registration and
style reference. Do not draw the face, skin, eyes, ears or neck. Keep the same
three-quarter view facing right. Crown (610,80), left temple (210,490), right
temple (995,420), forehead center (650,330). Add 30–65px of hair volume outside
the skull, keeping the silhouette inside the canvas. Hairline y=300–400;
sideburns may reach y=600. No ear-shaped holes. Leave transparent space below
bangs. Long hair frames the cheeks rather than covering the face.

Hand-drawn Flash fantasy style: almost-black 14–20px outer contour, thinner
bold interior accents, large angular curves and a few broad locks. No fine
strands, texture, hatching or realistic gloss. Use grayscale #c0c0c0 base,
#909090 shadow, #e5e5e5 highlight, #101010 ink for runtime recoloring.

Style variations specify the silhouette: compact textured crop; neat side
part; raised swept quiff; chunky asymmetric spikes; diagonal swept fringe;
short layered pixie; blunt chin-length bob; high ponytail with a plain band;
five-section braided crown and compact bun; shoulder-length broad waves.

Adventurer (spiky) and Swept now use individual v2 PNGs fitted to the approved skull. Their saved IDs are unchanged. Both were regenerated with a high y=280–340 front hairline, full crown coverage, and the same grayscale Flash recipe. The former hair atlas remains only as legacy fallback metadata.

Pixie v2 removes only the thin dangling lower-left strand from the v1 source using the built-in image editor; transparent canvas registration, crown and bangs are preserved. Later placement adjustments live only in the hairstyle rect metadata.

Messy Spikes v2: built-in image edit removes the dangling lower-left sideburn and thin right temple wisp, retaining the grayscale Flash silhouette. The tallest tip was shortened slightly to leave transparent top padding for the raised placement.
