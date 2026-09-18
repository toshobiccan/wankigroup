# Cardslayer Cutout-Rig Asset Recipe

Use Astra for the next asset pass. Generate the neutral body first, approve it, then use that approved body image plus `human-base.png` as references for every wearable and held item. Do not generate a complete dressed character for the rig: the runtime needs separate transparent cutouts.

## Rules for every rig asset

Append this production contract verbatim to every prompt below.

> CARDSLAYER CUTOUT-RIG PRODUCTION CONTRACT: Create exactly one isolated game-sprite cutout on a transparent alpha background. Square 512 × 512 canvas. Do not crop, trim, add a drop shadow, ground, text, UI, border, background, or other objects. Place the named attachment point exactly at canvas center (256, 256); preserve at least 32 px of transparent margin around all painted pixels. The attachment point must be visually identifiable from the cutout but do not draw a marker. Keep the cutout aligned to a three-quarter right-facing adult fantasy adventurer. Early-2000s browser Flash fantasy RPG: thick near-black outer contour, dark-brown inner lines, angular simple shapes, flat base colour plus one hard cel shadow, moderate saturation, low-to-medium detail, readable at 90 px tall. No gradients, soft light, painterly texture, realism, anime, chibi, 3D, modern mobile splash-art styling, or white fringe. Match the supplied Cardslayer human reference exactly in line weight, palette restraint, and proportions.

## Reference order

1. Attach `human-base.png` for the shared visual language.
2. Once accepted, attach the approved neutral body cutouts when making every wearable, weapon, and book.
3. Keep one approved output as the **rig master reference**. Every future item prompt uses it; do not replace it casually.

## Neutral body: generate these first

The run rig mirrors equivalent left/right parts. Generate one version of each part below. Save with the exact filenames.

### `body-head.png`, `body-hair.png`, `body-eyes.png`, `body-nose.png`

The head is four separate pieces, not one — hair, eyes, and nose are each their own rig bone (`hair`, `eyes`, `nose`, all children of `head`) so they can be fitted and, later, animated independently. Generate all four against the same reference so they read as one face when composited; do not merge them back into a single image.

> Create `body-head.png`, a neutral adult human adventurer head for the Cardslayer rig, bald and bare-faced. Attachment point: bottom-centre of the neck. The head grows upward from that point. Warm light skin, smooth hairless scalp, plain closed-eyelid or eye-socket area with no iris or pupil detail, no nose detail beyond the underlying skull shape, no mouth beyond a simple closed line if unavoidable, no helmet, no earrings, no neckwear. Make the neck short and narrow enough to overlap the torso cleanly. [Append the production contract.]

> Create `body-hair.png`, a short tousled brown hairstyle cutout for the Cardslayer rig, to sit on top of and behind `body-head.png` as its own piece. Attachment point: top-centre of the skull, matching the `hair` bone. Hair only — no scalp, ears, face, or neck. Brown, two-tone cel shading, silhouette readable at 90 px tall. [Append the production contract.]

> Create `body-eyes.png`, a pair of simple calm eyes for the Cardslayer rig, to sit on `body-head.png` as their own piece. Attachment point: centre of the visible eye, matching the `eyes` bone. Eyes only — no eyebrows, skin, nose, or face outline beyond the eye shapes themselves. Simple dark iris, minimal detail, readable at 90 px tall. [Append the production contract.]

> Create `body-nose.png`, a simple small nose indication for the Cardslayer rig, to sit on `body-head.png` as its own piece. Attachment point: bridge of the nose, matching the `nose` bone. Nose only — no skin field, eyes, or face outline beyond the nose shape itself. Minimal shading, readable at 90 px tall. [Append the production contract.]

### `body-torso.png`

> Create `body-torso.png`, a neutral adult human adventurer torso for the Cardslayer rig. Attachment point: centre of the shoulder line. The torso grows downward from that point to the hips. Sleeveless simple dark-brown leather vest over a parchment-beige undershirt; keep both shoulders visibly open for arm overlays. No belt, cape, weapon, book, hands, head, legs, or background. [Append the production contract.]

### `body-upper-arm.png`

> Create `body-upper-arm.png`, a bare upper arm for the Cardslayer rig. Attachment point: centre of the shoulder joint. The arm hangs down and slightly forward from that point, ending just above the elbow. Warm light skin, simple short beige sleeve cap only, no hand and no armor. [Append the production contract.]

### `body-forearm.png`

> Create `body-forearm.png`, a bare forearm for the Cardslayer rig. Attachment point: centre of the elbow joint. The arm hangs down from that point to just above the wrist. Warm light skin, no hand, sleeve, armor, weapon, or book. [Append the production contract.]

### `body-hand.png`

> Create `body-hand.png`, an open relaxed hand for the Cardslayer rig. Attachment point: centre of the wrist. The hand extends down from that point, with a simple readable grip that can hold a weapon or book. Warm light skin; no item, glove, or sleeve. [Append the production contract.]

### `body-thigh.png`

> Create `body-thigh.png`, a neutral adventurer thigh for the Cardslayer rig. Attachment point: centre of the hip joint. The thigh extends downward to just above the knee. Simple muted indigo trousers, no boot, shin, foot, weapon, or background. [Append the production contract.]

### `body-shin.png`

> Create `body-shin.png`, a neutral adventurer lower leg for the Cardslayer rig. Attachment point: centre of the knee joint. The shin extends downward to the ankle. Simple muted indigo trousers, no foot or boot. [Append the production contract.]

### `body-foot.png`

> Create `body-foot.png`, a neutral adventurer foot for the Cardslayer rig. Attachment point: centre of the ankle joint. The foot extends down and slightly forward to the right. Simple dark-brown leather shoe, no shin or background. [Append the production contract.]

## First wearable set

Each item has its own item ID folder. Use the same name after every part, for example `starter-traveler-cape/cape.png`.

### Cape — `cape.png`

> Create `starter-traveler-cape/cape.png`, a short layered traveler cape for the Cardslayer rig. Attachment point: centre of the upper back at the base of the neck. The cape falls behind the body, mostly downward and slightly to the left, ending above the knees. Deep cranberry red cloth, one dark shadow plane, broad readable silhouette, no clasp, body, arms, or background. [Append the production contract.]

### Helmet — `helmet.png`

> Create `starter-scout-helmet/helmet.png`, a simple brass-and-leather open-face helmet overlay for the Cardslayer rig. Attachment point: centre of the head. It must frame, not cover, the eyes and hairline. Warm dull brass with dark brown leather trim; no face, body, or background. [Append the production contract.]

### Chest armor — `torso.png` and `upper-arm.png`

> Create `starter-leather-chest/torso.png`, a chest armor overlay for the Cardslayer rig. Attachment point: centre of the shoulder line. The armor grows downward to the hips, leaving the neck and both arm joints clear. Rich chestnut leather with a single muted gold buckle; no head, arms, hands, cape, weapon, or background. [Append the production contract.]

> Create `starter-leather-chest/upper-arm.png`, a short leather shoulder-and-upper-arm overlay for the Cardslayer rig. Attachment point: centre of the shoulder joint. It extends to just above the elbow and must overlap the neutral upper arm cleanly. Match the chest armor's chestnut leather and muted gold buckle language. No hand, forearm, torso, or background. [Append the production contract.]

### Leggings — `hips.png` and `thigh.png`

> Create `starter-traveler-leggings/hips.png`, a belt-and-hip overlay for the Cardslayer rig. Attachment point: centre of the hips. It should cover the top of the trousers and extend a small distance down both thighs. Deep navy cloth, brown belt, one brass buckle; no torso, legs below upper thigh, or background. [Append the production contract.]

> Create `starter-traveler-leggings/thigh.png`, a reinforced thigh overlay for the Cardslayer rig. Attachment point: centre of the hip joint. It extends from hip to just above knee, following the neutral trouser silhouette. Deep navy fabric with one darker shadow panel; no shin, foot, torso, or background. [Append the production contract.]

### Boots — `foot.png`

> Create `starter-traveler-boots/foot.png`, a rugged leather boot for the Cardslayer rig. Attachment point: centre of the ankle joint. The boot extends down and slightly forward to the right, matching `body-foot.png` dimensions. Brown leather, one dark shadow, one broad folded cuff; no shin, body, or background. [Append the production contract.]

## Held items

### Weapon — `weapon.png`

> Create `oak-practice-sword/weapon.png`, a simple one-handed practice sword for the Cardslayer rig. Attachment point: centre of the grip where the front hand closes around it. Blade rises upward from the grip at a slight right-facing diagonal; keep the silhouette compact and readable. Dull steel blade, warm oak handle, small brass crossguard. No hand, body, magic effects, background, or text. [Append the production contract.]

### Book — `book.png`

> Create `beginner-spellbook/book.png`, a closed small spellbook for the Cardslayer rig. Attachment point: centre of the lower spine where the rear hand grips it. The book extends upward and slightly outward from that point. Forest-green cover, parchment page edge, one small gold star sigil, thick dark outline. No hand, body, particles, background, or text. [Append the production contract.]

## Future item template

> Create `[item-id]/[part-name].png`, a `[slot]` cutout for the Cardslayer rig. Attachment point: `[named rig bone / joint]`. The part extends `[direction and end point]`. It must overlap `[base body part]` cleanly and preserve the silhouette needed at 90 px character height. Design: `[material, two or three colors, iconic feature]`. [Append the production contract.]

For a multi-part slot, repeat the template once per attachment in `data/rigs/humanoid.json`. Use the exact same item ID, palette, outline thickness, and materials across every part.

## Acceptance checklist

- Truly transparent PNG, no white or coloured background.
- Correct 512 × 512 canvas; no trimming after generation.
- Attachment point centred at 256, 256.
- One object only, no extra props or scenery.
- Same heavy outlines and one-shadow cel shading as `human-base.png`.
- Wearables leave adjacent joints clear and overlap their base piece.
- Weapon attaches at the **front hand grip**; book attaches at the **rear/off-hand grip**.
- Hair, eyes, and nose are each their own file — never re-merge them onto `body-head.png`.
