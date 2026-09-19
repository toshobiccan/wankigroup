> Current room authority: assets/art-reference/room-style-approved.png (approved Spawn cottage v3), with Plains as secondary reference. Follow room-art-style.md. This supersedes historical room instructions below; character references remain unchanged.

> Latest room-specific direction: use assets/world-background.png (Plains) and room-art-style.md for all room backgrounds. This overrides older environment-reference statements below; the human base remains the character/equipment reference. Both Spawn preview attempts were rejected.

# Art Reference

Reusable prompt templates and example outputs establishing Cardslayer's
visual style, so anyone generating new character or environment art gets
consistent, on-style results.

## Absolute reference

`assets/art-reference/human-base-v5-front-grip.png` is approved as the authority for ALL future art. Use it with `shared-art-style.md`. Old human/goblin outputs below are archived examples, not active style instructions.

## Files

- `character-prompt-template.txt` — prompt template for a full-body
  character sprite. Fill in `[CHARACTER DESCRIPTION]` and `[EXPRESSION]`
  and use as-is.
- `environment-prompt-template.txt` — prompt template for a gameplay
  background. Fill in `[ENVIRONMENT DESCRIPTION]` and use as-is.
- `goblin-sword.png`, `goblin-mace-medic.png` — two example outputs from
  the character template (both goblins; the "medic" one has a stethoscope,
  a deliberate flavor detail tying the art back to the flashcard/study
  theme).
- `human-base.png` — a third example output from the character template,
  a bare-chested human base body.
- `rig-asset-prompts.md` — the production recipe and copy-ready Astra
  prompts for the animated cutout rig, including body pieces, wearables,
  weapon, and book.

## The style, in short

Early-to-mid-2000s browser Flash fantasy RPG: thick near-black outlines,
cel shading (base plus two shadow tones; gradient irises), expressive
angular geometry, medium purposeful detail so the character reads clearly at
thumbnail size. See the two prompt templates for the full, exact brief —
don't paraphrase it, reuse it verbatim with just the bracketed fields
filled in, so every new piece of art stays on-model with these three.

## Note on the older pixel-art spec

`docs/specs/2026-09-15-character-art-pipeline-design.md` documents a
**different, earlier art direction** — 64×64 pixel art with an
Aseprite/layered-equipment pipeline. That direction was superseded before
any of it was built: nothing in the repo (`assets/world-character.png`,
`assets/mob-goblin.png`, etc.) follows it, and everything actually shipped
this session used full-size static illustrations in the Flash-vector style
documented here instead. That spec hasn't been rewritten or retired yet —
flagging so nobody starts implementing its Aseprite pipeline against a
style the project has already moved away from.

Current canonical recipe: shared-art-style.md. Its shading/detail rules supersede earlier prompt revisions.
