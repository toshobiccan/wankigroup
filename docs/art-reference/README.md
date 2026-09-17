# Art Reference

Reusable prompt templates and example outputs establishing Cardslayer's
visual style, so anyone generating new character or environment art gets
consistent, on-style results.

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

## The style, in short

Early-to-mid-2000s browser Flash fantasy RPG: thick near-black outlines,
flat cel shading (one base tone + one shadow tone, no gradients), simple
angular geometry, low-to-medium detail so the character reads clearly at
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
