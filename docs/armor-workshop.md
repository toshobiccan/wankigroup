# Armor Workshop

Open `/dev/armor-workshop.html` while the game server is running. No API key or image service is used by this tool.

For the simpler no-API workflow, click **Prepare for Codex**, then ask Codex to **generate the queued armor**. The result loads into the preview automatically. See [Codex workflow](armor-codex-workflow.md). The ZIP steps below remain available as a manual alternative.

1. Choose Armor or Weapon, enter a stable lowercase item ID, name and design prompt.
2. Export the template ZIP. Give Codex `prompt.txt`, `mannequin-template.png`, `human-base.png` and `goblin-mace-medic.png`. The mannequin controls geometry; the human and goblin control style. Keep `anchor-guide.png` and `template.json` as authoring references. Generate a transparent image matching the template aspect ratio. Front and rear parts must remain separate.
3. Import the generated sheet. The tool uses canonical mannequin anchors, not AI-inferred joints. Uniform image resizing updates anchors and scale automatically. Generated art may drift; inspect every part.
4. Select each part and adjust its crop and red proximal / blue distal anchors. Anchor coordinates are local to the cropped PNG. Drag points or use numeric fields. Two-point limbs are fitted to the existing skeleton segment; single-point pieces use the Scale field. Replace hides the matching mannequin piece; Overlay retains it beneath the armor.
5. Update Preview and test Idle, Run 3, Slash and both facing directions. Use the mannequin test button to verify the whole workflow without spending an image generation.
6. Save an editable project JSON for later revisions. Export the equipment ZIP for transparent PNG parts and a runtime-compatible manifest. The project is not automatically saved: download it before leaving.

## Fixed art style

Every template export includes the shared Cardslayer recipe from `docs/art-reference/shared-art-style.md`: bold near-black contours, handmade angular lines, restrained material colors, base plus two darker cel-shadow tones, and medium structural detail. Full-character pose and background composition are excluded from cutout sheets. `src/sprites/armor-art-style.js` stores the recipe; tests verify the character and environment templates contain the same contract. The item prompt controls design, not rendering style. Both Armor and Weapon use this contract, including reopened older projects. Re-export old template packs to receive the style references and complete brief. Prompt consistency cannot guarantee model compliance: compare generated art with the references before accepting it.

## Installing a package

Extract the ZIP and copy its `assets/` and `data/` directories into the game project. Add the manifest path (for example `data/equipment/forest-guardian.json`) to `packages` in `data/equipment/catalog.json`. The world art loader loads registered packages. Use the manifest's `item` definition in inventory/reward content; merely registering artwork does not grant or equip an item for a player. Do not overwrite an existing package unless replacing that item is intentional.

Armor is a single inventory slot with 14 attachments: torso, hips, paired upper arms, forearms, hands, thighs, shins and feet. Helmet, cape, weapon and book remain independent. Existing equipped chest/leg/boot pieces migrate into one Armor record retaining the original records as `legacyComponents`; their stat fields are combined. Stored unequipped old pieces keep their IDs and original slot in `legacySlot` while using the new Armor slot.

The current generator contract is version 1, for `humanoid`. It exports two anchors for articulated limbs, one anchor for rigid pieces, per-piece scale and overlay/replacement mode. Layer order remains the skeleton's tested draw order. Generated outfits never change joint positions, bone names, animations or body proportions. Occluded joint areas need complete artwork; a composited full-body image alone cannot provide that, so generation uses separate cells with overlap margins.

Import limits: 32 MB images, 4096 × 4096 maximum decoded dimensions, 48 MB projects. Flat-color background removal is destructive to matching colors inside artwork; reimport the source sheet to undo. Transparency and visual fit require review before export. This is an asset authoring tool, not an automatic segmentation or semantic anchor-detection model.
