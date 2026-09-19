# Home, tutorial and connected world plan

User-approved direction, 2026-09-19. Saved backlog; features below are not all implemented.

## Visual baseline

Keep the approved original face, customization and balanced world filtering. Match apparent outline weight, intentional detail and cel shading across armor and terrain. Distant scenery has lower contrast. Compare at actual game size. Hair stays above ears. Keep generation and image processing out of the multiplayer server simulation.

## First launch: 60–120 seconds

1. Start at the player's house. Ask “Who are you?” Show the head-focused character creator and display-name entry. Paid renaming is a later feature.
2. A welcoming character portrait gives short instructions, one sentence at a time. Avoid an inventory tour.
3. Offer a nearly transparent virtual joystick with A/B, tap-to-move, or both together. Give subtle haptic feedback on supported phones, with a setting to disable it. PC controls are remappable (WASD/arrows defaults). Save preferences and expose them in Settings. A selects the closest mob during exploration, and confirms the highlighted answer/Anki grade in review; B goes back. Joystick/directional navigation selects review actions; never automatically rate the player's recall. The A behavior is the current interpretation of the user's request.
4. Supply a preloaded capital-cities deck. Run a very short demo fight with a standard Anki reveal-and-grade card (Again/Hard/Good/Easy) and a multiple-choice question. Good/Easy or a correct choice hits the target.
5. Defeat the introduction mob, grant XP once through shared game rules, return to the house.
6. A guide portrait introduces deck selection: Import your deck, Browse premade decks, premium Generate deck from document. Premium generation needs actual entitlement and generation support; do not imply it works before implemented.

Preserve returning players' progress. Persist tutorial steps; reload must not restart character creation or duplicate XP. Recommend skip/return support. Teach only movement, answering and deck selection. House becomes the initial home/spawn destination.

## Build order

1. Room creator: shared style prompt, connected room batches, image-relative shallow walking band and spawn, review preview, compatible zone export. Reuse the no-external-API Codex workflow.
2. Generate and visually accept house/tutorial rooms; verify camera and movement on desktop and phone.
3. Control preference, display-name entry, saved onboarding state using existing creator/account rules.
4. Preloaded deck, answer modes, demo fight and one-time rewards; test replay prevention.
5. Guide overlays and deck-choice screen, then premade deck browser. Premium document generation and paid renaming are deferred.
6. Time fresh onboarding and verify reload, skip, touch, keyboard and existing-account paths.

## Acceptance

- Original face assets and placement unchanged; wardrobe stays full resolution.
- Room links reciprocal, spawn inside walking band, missing art clearly identified.
- Generation is a developer action in Codex; players load static images and zone data.
- No public file-write endpoints or image generation in the production server.
