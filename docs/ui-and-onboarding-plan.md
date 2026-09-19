# UI and first-join implementation

- World is the primary/default leftmost tab. Menu combines deck selection and import.
- Warm parchment, brown frames and olive accents complement the approved room/character art. Reviews retain neutral readable sans-serif styling and pause world animation.
- Elder Rowan greets new players inside spawn-1. Character creation returns to that same world.
- Controls can use tap, joystick, or both; desktop keys can be changed in Settings.
- The practice goblin outside the house uses the shared Room combat system, normal attacks, card scheduling and rewards. No simulated tutorial combat exists.
- Capital cities supplies a recall card and a tutorial-only multiple-choice card. Dialogue never grants XP; the first actual goblin kill grants 30 XP once. Replay preserves the rewarded flag.
- After victory the guide offers deck selection or continued exploration. Premium document generation remains a labelled future feature.

Verification: automated combat/auth/progression tests and browser traversal of the actual encounter. Wizard image is a static asset; no server generation/runtime dependency.
