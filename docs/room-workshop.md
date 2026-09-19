# Room Workshop

Open `/dev/room-workshop.html` on the local offline development server.

For legacy areas, enter an area ID, name, brief and room count (1–8). For new regions, use the version 2 controls below. Set the shallow walking band and spawn. Update layout to inspect links and geometry. Prepare for Codex saves one immutable job in `output/room-workshop/jobs/<uuid>/`. Existing art is not copied into new rooms or presented as generated output.

Ask Codex to generate the queued rooms. Then Check generated rooms previews results with the walking band. Save rooms to game installs new PNGs in `assets/rooms/` and reciprocal room JSONs in `data/zones/`. Existing paths are rejected, so use a new area ID for a revision. Installation keeps `START_ZONE_ID` unchanged. Choose an open exit to attach the new area, or keep it separate.

## Codex generation recipe

1. Read the pending job's project.json and each room's prompt text.
2. Inspect and attach assets/art-reference/room-style-approved.png (approved Spawn cottage), the primary room style reference; Plains remains secondary. Follow src/world/room-art-style.js. Use the built-in image tool; no external generation API.
3. Generate rooms sequentially, referencing the first accepted room for palette and lighting consistency. Maintain the same aspect ratio and unobstructed walking band.
4. Save each result as `<room-id>.png` in that job folder. Target 1920×1080; native approximately 16:9 RGB/RGBA PNGs from 1024×576 through 4096×2304 are accepted without resampling. Verify dimensions before publishing; do not infer spawn coordinates from generated image landmarks.
5. Inspect every room in the workshop. If art puts obstacles in the band or fails the style, regenerate it before installation.

Generated art requires review. The code guarantees consistent metadata and reciprocal links; a prompt cannot guarantee exact geometry or visual style. Production has no enabled workshop write access. Players only load static art and small zone JSONs.

Current scope: linear room chains with rectangular shallow ground; no arbitrary polygons, branching doors, enemy placement UI, or automatic home/tutorial routing yet.

## World map and connections
Choose terrain, map X/Y and an existing open exit (or Separate area), then Update layout to preview the map. Prepare for Codex, ask Codex to generate the queued rooms, Check generated rooms, and Save rooms to game. Saving publishes the backgrounds, room metadata and map catalog together. An attached area receives reciprocal links to the chosen open exit; occupied exits and existing room IDs are rejected. Open Map in the bottom navigation to inspect the same graph. It does not teleport the player. Quests remains available on Home. Map positions control the illustrated map, not room movement. Generation references assets/art-reference/room-style-approved.png.


## Fixed regions (version 2)
Generation seeds apply only to a new authoring draft. Prepared projects preserve the actual room blueprint; installation saves static room files. Entering or revisiting rooms never calls a generator.

Choose Spawn (exactly 3), Plains (12–15), or Custom (3–24). Enter a brief and use Build from brief for preset/count detection, or set fields directly and Build region. This button recognizes simple preset/count wording; Codex can interpret a richer brief when preparing the batch. Try another layout is an explicit authoring action. The default ground plane is 58–90% down the image; supported region depth is 25–40%, with small room-to-room variation.

Test movement opens a playable draft with plain backgrounds, cardinal arrows and mob stand-ins. It preserves the queued job when inputs are unchanged. It does not install rooms or alter a game save. World Map now opens regions, then their room graphs. New rooms save a regionId, cardinal exits and stable spawn placements. The local installer also writes data/regions/<id>.json and refreshes the zone catalog. Existing regions are never overwritten.

Generation jobs include <room-id>-layout.svg guides. Render/view these alongside the primary Plains visual reference. Gold markers specify actual doorways; purple markers reserve encounter space. These overlays are geometry references only and must not be painted into the art. Keep the full ground area clear in this version; obstacle navigation and arbitrary walkable polygons are not implemented.

Mob placements reference src/game/mob-definitions.js. Replace a definition's art/stats later to update all matching placements; preserve placement IDs and positions. Boss rooms contain one boss stand-in. Spawn includes one tutorial encounter in its middle room. Provisional stats are not final balance.

Connections inside regions support all four directions. The initial region-attachment control connects an existing open east exit to the new entrance's west exit. Broader inter-region exit authoring can be added without changing the cardinal exit data model.

Load Spawn draft / Load Plains draft use saved blueprints in data/region-templates/. Install Spawn before Plains: the Plains template returns to spawn-3. These are authoring templates, not installed rooms; existing live rooms stay unchanged until Save rooms to game.

## Approved Spawn installation
The three fixed rooms are Home Cottage → Practice Clearing → Garden Gate, with reciprocal west/east exits. Spawn is now the starting region. The middle room retains a replaceable tutorial mob. Open foreground from 64–100% image height is walkable; scenery sits behind it. Room 3 keeps its east edge available for the future Plains region. Approved cottage pixels are preserved in assets/art-reference/room-style-approved.png.
