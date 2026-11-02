# Live-battle effects

Pixel-art effects for the real-time battles. Every file is a **horizontal strip of square frames** (frame `i` is at
`x = i * size`), drawn at the game's pixel scale (a map tile is 16x16, a creature frame 88x88 with the creature
about 64 px tall). Nothing is semi-transparent: every pixel is either fully drawn or empty.

Sources: one `.aseprite` file per effect in `game/art-src/battle-fx/` (frames, timings and palette inside), built
by `game/art-src/battle-fx/build_fx.py`. Preview of everything playing: `game/art-src/battle-fx/_preview.gif`;
every frame large: `_preview_sheet.png`.

**Timing** is the suggested milliseconds per frame (also stored in the `.aseprite` files). "Once" effects play
through and disappear; "loop" effects repeat while the thing they show lasts.

**Anchor** is the point of the frame that goes on the spot in the world (x, y in frame pixels from the top left).

## Per element (6 elements x 5 kinds = 30 files)

`<element>` is one of `ember`, `tide`, `grove`, `spark`, `stone`, `dusk` (as `data.TYPES`).

| File | Frames | Size | Timing (ms per frame) | Anchor | What it is for |
|---|---|---|---|---|---|
| `<element>_projectile.png` | 4 | 16x16 | 70 each, loop | (8, 8) = the shot's position | A shot in flight. Faces **right**; flip it for shots going left. The leading edge is at about x = 14. |
| `<element>_impact.png` | 6 | 32x32 | 60, 90, 70, 70, 90, 110, once | (16, 16) on the hit point (the creature's body) | A hit landing: a small wind-up flash, the hit itself (frame 2, held longest), then it breaks up and fades. |
| `<element>_burst.png` | 8 | 64x64 | 90, 60, 80, 110, 80, 80, 100, 120, once | (32, 48) on the ground at the area's centre | An area attack. Its ground ring is about 52 px across (3 tiles) and 19 px deep; flames, spikes etc. rise up to 45 px above the ground point. Frame 1 is the wind-up, 2 the strike, 4 the peak. |
| `<element>_beam.png` | 4 | 16x16 | 60 each, loop | (0, 8) = where the segment starts, on the beam's line | One segment of a beam that **tiles left to right**: repeat it every 16 px from the caster to the target (all copies on the same frame). It scrolls toward the right as it plays; flip every copy for beams going left. Cut the last copy to the length needed. |
| `<element>_trail.png` | 4 | 8x8 | 80 each, once | (4, 4) where the shot just was | Bits a shot leaves behind (embers, droplets, leaves, sparks, grit, wisps). Drop one every 6 to 10 px of flight and let each play once. |

What each element looks like: **ember** fire tongues with white-hot cores, embers and grey smoke; **tide** glossy
water with white glints, splashes, ripples and foam; **grove** spinning razor leaves and thorny curling vines;
**spark** zig-zag lightning (white core, yellow glow) with cyan side-arcs and sparks; **stone** faceted rocks,
rock spikes from cracked ground, tan dust; **dusk** dark shapes with glowing violet rims, curling wisps and
magenta-white glints.

## Shared by every element (10 files)

| File | Frames | Size | Timing (ms per frame) | Anchor | What it is for |
|---|---|---|---|---|---|
| `guard.png` | 6 | 48x48 | 50, 60, 90, 120, 80, 90, once | (24, 24) on the creature's body | A hex-cell barrier bubble: forms (frames 1-2), holds (3-4), flickers (5), breaks into shards (6). For a guard that lasts, loop frames 3-4 until it ends, then play 5-6. |
| `heal.png` | 6 | 48x48 | 70, 80, 90, 100, 100, 110, once | (24, 40) on the creature's feet | A ring of green light at the feet, streaks and crosses rising. |
| `power.png` | 6 | 48x48 | 60, 70, 80, 100, 90, 100, once | (24, 40) on the creature's feet | Power-up: a red-gold aura flaring up both sides and chevrons rising through the middle. |
| `charge.png` | 4 | 48x48 | 80 each, loop | (24, 24) on the creature's body | Winding up a charge move: light streaming in to a pulsing gold core. Loop it for as long as the charge lasts. |
| `delay.png` | 4 | 32x32 | 120 each, loop | (16, 16) just above the creature's head | A delay move slowing the rival: an hourglass running, with ripples of slowed time. Loop it while the delay lasts. |
| `interrupt.png` | 4 | 32x32 | 50, 90, 70, 90, once | (16, 16) on the creature's body | An interrupt breaking the rival's wind-up: a white flash, a jagged break, shards flying off. |
| `terrain.png` | 6 | 32x32 | 80, 80, 80, 60, 90, 110, once | (16, 16) on the centre of the tile | A terrain move changing a tile. The tile is the middle 16x16 square of the frame (pixels 8 to 23). Corners light up, the square is traced, it fills with light, **frame 4 is a full flash: swap the tile's art on that frame**, then the light spreads out and fades. |
| `faint.png` | 6 | 48x48 | 70, 80, 110, 100, 100, 120, once | (24, 40) on the creature's feet | A creature fainting: a white poof of smoke with dizzy stars. Hide the creature from frame 3 on (the cloud covers it). |
| `dust.png` | 4 | 16x16 | 60, 70, 80, 90, once | (8, 12) on the foot | Footstep puffs while walking: start one at a foot every few steps (or every 12 to 16 px moved). |
| `miss.png` | 4 | 32x32 | 70, 90, 90, 110, once | (16, 16) where the move was aimed | The "failed" puff for a wrong or timed-out answer: a grey puff with a fizzle curling up out of it. |

## Status particles (6 files)

| File | Frames | Size | Timing | Anchor | Shows |
|---|---|---|---|---|---|
| `status_burn.png` | 4 | 8x8 | 120 each, loop | (4, 4) | a small flame (fire) |
| `status_wet.png` | 4 | 8x8 | 120 each, loop | (4, 4) | a drop gathering and dripping (water) |
| `status_spark.png` | 4 | 8x8 | 120 each, loop | (4, 4) | a flickering zig-zag of static (electric) |
| `status_leaf.png` | 4 | 8x8 | 120 each, loop | (4, 4) | a seed-leaf twirling (plant) |
| `status_rock.png` | 4 | 8x8 | 120 each, loop | (4, 4) | a pebble bobbing (stone) |
| `status_dark.png` | 4 | 8x8 | 120 each, loop | (4, 4) | a small shadow flame with a glint (shadow) |

Show one or two drifting around the affected creature's upper body while the status lasts.

## Reading on any ground

Every effect has a dark edge or a dark core plus bright highlights, so it stays readable on grass, sand, water,
stone, snow, lava rock and dark moss (the preview GIF plays them over a patchwork of all of these).
