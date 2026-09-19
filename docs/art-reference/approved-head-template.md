# Approved customizable head template

Approved source: assets/character/head-template-approved.png (byte-identical to dev/reference/original-bald-head-v3.png).
Native canvas: 1230 × 1278. Registration and masks: data/rigs/character-head-v1.json, version 2.

The standard open eyes and Friendly smile remain original master pixels. The head outline, nose and ears are fixed. Eye shape selects Classic or the same eyes with lashes. Expression selects the original Friendly smile or a Calm mouth. Hair, linked brow color, eye color and skin color remain supported.

Do not regenerate or independently trim/scale these facial features. src/sprites/master-head-renderer.js composites everything on the original canvas before applying ONE transform to the rig's 512px head texture. Ears remain at their original position inside the head layer. Hair is drawn above them and covers the ear wherever its pixels overlap. New variants must use the same native coordinates.

head-template-clean.png supplies only masked replacement skin behind blinks and alternative mouths. The approved master supplies all other pixels; generated cleanup is never substituted as the complete face. The lash variant adds ink to the original eye shapes without resizing them. Brow and eye colors use constrained native regions. Palette defaults preserve the source image unchanged.

Verification: dev/head-art-check.html compares native RGBA pixels with the approved image and reports zero differences for Bald + Classic + Friendly at the default palette. It also provides held blink states and variant controls. Browser downsampling can produce small differences when comparing an Image directly with a Canvas at reduced resolution, so the numerical check runs on the unscaled native canvases.

Legacy atlas metadata is retained as data/rigs/character-head-legacy-v7.json. Older saves with an ears field normalize to the fixed approved ears; missing eyeShape becomes standard.

Iris tint isolation uses dedicated native-coordinate irises polygons, separate from the larger eye/blink masks. Every iris pixel is excluded from skin tinting, including warm gold gradient pixels, pupils and highlights. Clean skin used for closed eyelids is tinted as skin. dev/eye-color-check.html compares iris samples across all six wardrobe skin colors.

Rear iris east-edge correction: the geometric region is tightened to the iris outline, and yellow/olive source-color classification rejects neighboring skin. Both eye-tint leakage into skin and skin-tint leakage into the iris are checked by dev/eye-color-check.html.
