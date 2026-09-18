# Head and neck layering

The humanoid and rig-preview skeletons have a separate `neck` attachment. It shares the animated head transform through a zero-offset child, preserving existing head tracks and joint positions. Render order is neck (49), torso/body armor (50), head (70). Other limb layer ordering remains unchanged.

The mannequin and starter head artwork is split at the jawline using complementary `clipPolygon` regions in source-image pixels. Both attachments reuse the existing PNG, scale and anchor; no replacement image is generated. Pixi masks separate the visible regions without altering source pixels. Helmet replacement hides the head region while leaving the neck attached. Independent PNGs can later replace either region using the same attachment coordinates.

If editing head placement, keep head/neck art anchors consistent so their shared seam remains connected. Existing animation clips need no changes. The rig editor's alpha hit testing respects the masks when selecting either piece.
