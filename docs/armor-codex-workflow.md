# Armor generation through Codex (no API)

Run the local game server with `--offline`. In Armor Workshop enter the item brief and click **Prepare for Codex**, then ask Codex to generate the queued armor. No external image API, key, or background agent is used. The button cannot start a Codex conversation by itself.

After fitting, **Save item to game** installs the PNG parts and manifest into `assets/equipment/` and `data/equipment/`, registers the item in the catalog, and keeps a browser project backup. Reload the local game to receive saved development items under Inventory → Equip. Equipping keeps displaced gear in the inventory. The same Asset ID updates an item; a different ID creates another. Stats remain empty until stat authoring is implemented. Online accounts do not receive development items automatically.

**Clear** resets the draft and stops waiting for its job without removing installed items or the last browser backup. **Load last project** restores that backup. **Download project backup** is portable across browsers.

Requests are saved under `output/armor-workshop/jobs/<uuid>/`: project.json, prompt.txt and mannequin-template.png. The workshop checks its pending job every five seconds and restores that job after a page reload. Preparing another request changes which job the page watches. The result replaces the current fitting preview with that request's saved design and canonical anchors; save any manual fitting work before preparing a new request.

Armor follows the shared v5 reference: restrained material colors, two cel-shadow tones, broad readable shapes and sparse intentional details. Its silhouette targets 4% extra width and height (about 2% on each side). This expands the painted contour and overlap coverage only; joint centers, joint-to-joint lengths and skeleton transforms stay unchanged. Generated fitting still needs visual review. Previously queued prompt files are snapshots; prepare again to use updated rules.

## Codex execution recipe

1. Identify the user's pending UUID (shown in the workshop). If needed list the jobs and use the newest unfinished request, checking its project name and prompt.
2. Read project.json and prompt.txt. View mannequin-template.png and anchor-guide.png for geometry, and `assets/art-reference/human-base-v5-front-grip.png` for the absolute style reference.
3. Use the built-in image-generation tool with these reference images, the complete prompt, and a transparent background. Do not substitute an API or generate an assembled character. Keep distinct front/rear pieces and exact sheet cell order.
4. Inspect the output. Publish it with `node tools/complete-armor-job.mjs <uuid> <generated-png-path>`. This validates dimensions and copies the result atomically into the workspace. Never replace the skeleton or anchors with inferred model coordinates.
5. The open workshop automatically imports the image, scales the saved metadata, and builds its animated preview. Check the result there; manual fitting may still be needed. The user can save the editable project and approve the artwork before game installation.

The local queue endpoint is disabled in online mode and rejects non-loopback clients and cross-origin browser requests. Use the workshop on the development computer for this workflow.

Current authority: assets/art-reference/human-base-v5-front-grip.png replaces the older human/goblin style references in new exports. Mannequin and anchor guides remain geometry references.
