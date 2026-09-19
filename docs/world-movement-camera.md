# Shallow-ground movement and camera

The current room contract remains the zone JSON: `backgroundImage`, ground
top/bottom fractions, spawn fractions, mob x fractions and prev/next links.
Each image fills the room vertically without changing its aspect ratio. Ground
fractions refer to that image height. The camera crops the room, not the image
file; do not generate a separate mobile background.

WASD/arrow keys and the mobile D-pad feed the same normalized movement vector.
Held input takes over from a click target. Acceleration/release ease over a short
interval, with bounded frame deltas. Click-to-move remains available. Input stops
on blur, page hiding and leaving the world. Typing and modal dialogs exclude
game controls. A/E/Space selects a nearby enemy, then engages an already selected
enemy; B/Escape cancels navigation/selection before combat. Existing battle UI
continues to own combat actions and fleeing.

The camera follows horizontally through a small dead zone, with velocity-based
look-ahead and exponential easing. Vertical framing stays fixed relative to the
walkable band so shallow up/down movement does not bob the camera. Zoom keeps
characters readable and covers the viewport without exposing image edges.
Touch framing reserves lower space for the D-pad and A/B buttons. Desktop world
view can expand to 1100px; other menus retain their current width.

Use `/dev/world-preview.html` to compare desktop and phone layouts. This uses the
production renderer and input, including a toggle for visible touch controls.
Room transitions and resizing reposition the camera immediately; ordinary
movement and battle approach use smooth following.

## Next: room creator

Generate each connected room against the same background aspect, ground band,
palette, perspective and character scale. Export the existing zone JSON fields
alongside each image. Add polygon obstacles/doorways as an explicit extension
when building the creator; the current scene constrains movement to a rectangular
ground band and does not yet support arbitrary obstacle polygons.
