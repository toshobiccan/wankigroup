# In-game character creation

Implemented steps:
1. Regenerate facial layers against human-base.png; preserve approved hair.
2. Register eyes, mouth, ears and face using a 50% reference overlay. Hair may cover eyes.
3. Render facial layers on the existing head bone, with linked hair/brow colors and independent iris colors. Blink swaps eye layers without moving joints.
4. Present a head-only fantasy wardrobe with arrow selectors at first start and from the avatar or World wardrobe button.
5. Save normalized appearance per player: local storage offline, authenticated account online. Saving updates the local world actor.
6. Verify persistence, account isolation, rig fallback and browser save/reopen behavior.

The old dev creator URL redirects into the game. Internal art registration remains at dev/head-art-check.html. Remote-player artwork still uses the existing renderer. Armor refinement follows character-style approval.
