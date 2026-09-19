# Fixed region system

Approved: generation may use a seed, but visiting a saved room never regenerates anything. Runtime loads published JSON and images only.

1. Add a versioned region blueprint with cardinal exits, seeded authoring, stable mob placements and a boss endpoint. Preserve legacy room projects.
2. Use shared exit geometry for arrows, triggers and destination entry. Add mob Y positions and gentle vertical camera tracking. Keep old horizontal links compatible.
3. Extend Room Workshop with Spawn (3 rooms), Plains (12–15) and custom region presets, fixed layout variation and layout guides. Publish region metadata with rooms.
4. Show world regions first and drill into their actual room graph. Validate connections, endpoint placement, stable generation, movement and save behavior.

The workshop runs generation only during authoring. Changing a variation or brief creates a new draft; it cannot mutate installed regions. Existing art stays untouched. Placeholder mobs have stable definition IDs so a future mob editor can replace their art/stats centrally.

Image generation still uses a Codex batch handoff, not an API. Review generated backgrounds against guides before installation. No image model can guarantee that all painted paths obey the geometry.
