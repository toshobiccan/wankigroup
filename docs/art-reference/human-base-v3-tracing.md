# Approved human base and axle tracing

User accepted human-base-v3-segmented.png on 2026-09-19. Preserve that source as the approved body aesthetic. The actual registered customizable head remains authoritative for gameplay.

Open `/dev/human-base-tracing.html` for idle and four stills sampled at 0, 155, 310 and 465ms of the existing 620ms run3 clip.

Files: `assets/art-reference/human-base-v3-tracing/idle.svg`, `run-00.svg`, `run-25.svg`, `run-50.svg`, `run-75.svg`, and `anchors.json`. Each SVG embeds the source PNG and can be opened independently. Regenerate with `node tools/build-human-tracing.mjs`.

The JSON maps numbered markers to existing bone IDs and canonical labels, with source-image pivots and mask polygons. Coordinates are initial visual estimates, not automatically detected or calibrated production anchors. Head and neck share an axle, matching current rig parentage.

Idle uses the untouched full source. Running uses clipped copies of those same pixels, only rigid rotation/translation, retaining segment lengths. Run3 angular offsets are retargeted onto the source's estimated rest joints. These are deterministic tracing guides, not new AI-drawn poses or exact installed-rig screenshots.

Visible cut-edge gaps/wedges identify missing concealed overlap and rough mask boundaries. Those require fitting and overlap completion before shipping. Do not mistake these sheets for a completed cutout package or use their estimated coordinates to overwrite the existing rig.

Verified source dimensions 1024×1536, constant segment lengths, consistent parent/child joint positions and viewBox coverage. Production skeleton, animation clips, character customization and server unchanged.
