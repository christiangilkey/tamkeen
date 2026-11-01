# 16-bit creature sample (waiting for the owner's verdict)

A sample of a new, cute 16-bit style for the creature game, made so the owner can decide whether it
beats the current art. **Nothing in the game uses these files yet**, and nothing in `web/game-art/` or
`game/art-src/` was changed.

## What is here

| Folder | Files | Size |
|---|---|---|
| `kindle/` | Kindle, an ember red-panda-like creature: `kindle_0_egg`, `kindle_1_hatchling_idle` (4-frame idle: rest, head dip, rest, blink; the ember tail-tip flickers), `kindle_2_juvenile`, `kindle_3_adult` | egg and hatchling 32x32, juvenile 48x48, adult 64x64 |
| `bloop/` | Bloop, a tide creature (blob body plan: round, droopy ear-fins, curled tentacle) | 48x48 |
| `lumoth/` | Lumoth, a dusk moth (floater body plan: feathered antennae, eyespot wings, a crescent moon on the forehead, sleepy eyes) | 48x48 |
| `previews/` | `sample_sheet_x6.png`, `before_after.png` (today's juveniles beside the new ones, same 6x scale), `kindle_hatchling_idle_x8.gif`, `actual_size.png` | enlarged with hard pixel edges |

Each creature has an `.aseprite` source and a `.png` export of the same name.

## How it was made

Every sprite was designed pixel by pixel and drawn in Aseprite through the Aseprite MCP (pixel
placement and flood fills). A small helper outside the repo only previewed the plans, listed pixel
coordinates for the MCP calls and checked each Aseprite export against its plan (all match exactly).
The idle frames were made by duplicating frame 1 in Aseprite and redrawing only what changes.

## Rules the sample follows

- One-pixel dark outline in each creature's own darkest shade, light from the top left, creatures face right.
- Every pixel fully opaque or fully clear.
- Each creature uses the same colour *roles* as the game's key palette (`game/ASSET_LIST.md`): four body
  shades with the darkest as the outline, three belly/cream shades, two accent shades, the eye black
  `#1b1420` and white. So the app's per-creature recolouring could still be used. The sample is drawn in
  each creature's own colours rather than the blue key colours so it can be judged as it would look.

## Open questions for the full set (only if the owner prefers this style)

1. **Whole sprites or parts.** Today a creature is assembled from separate parts (head, torso, ears,
   tail, eyes...) on fixed attachment points, which gives many combinations but limits how polished
   each one looks. This sample is drawn as whole creatures. The full set could be whole creatures per
   species, stage and adult form (fewer combinations, more polish), or the new style cut into parts.
2. **How it is produced.** Drawing through the MCP is slow for the full set (four body plans, three
   stages, three adult forms, special forms, animation frames, plus items re-fitted to the new bodies).
   Ask the owner before using any script.
