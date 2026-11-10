# A creature's rig (rig.json)

The game shows each creature with frame animations made from its finished drawing (idle, walk, and fly for the
winged ones: `tools/game_art/anim.py`, guide `ANIM_GUIDE.md`, since 2026-11-09). rig.json says what the game needs
to know about the drawing itself:
- the **head** polygon: the pixels the `blink` stamps belong to (the eyelids of every frame are worked out from
  them) and that a shirt never covers;
- the **leg** polygons (`legs_front`, `legs_back`): pixels a shirt never covers (the animation's own parts are in
  its parts grid, `_parts.txt`);
- the **blink** stamps: shut eyes, drawn with the creature's own letters;
- **sockets**: where worn things sit (pixel coordinates in the 64x64 drawing); each animation frame moves them with
  the part they ride on;
- the **shirt** area, **hover**, **wings**, and its name, element, look and body plan.

`tools/game_art/beasts.py` makes the game's art from it:

    .venv/Scripts/python.exe tools/game_art/beasts.py preview <id>    -> creatures/<id>/_rig_preview.png

The sheet shows: its parts (shirt area yellow), then as the game draws it: still, walking, blink, asleep, dressed
(cap, round glasses, scarf, book, red cape), dressed and walking, bat wings, a striped shirt, and flying if it has
wings. Worked example: `creatures/chick/rig.json`.

Fields:
- `art`: the final drawing file (e.g. `_ff2.txt`); `palette`: its full letter=hex string.
- `head`: polygon(s) [[x,y],...]; a pixel belongs if its centre (x+0.5, y+0.5) is inside. Follow the neck
  line; include ears, horns, crest, beak/muzzle, head fur; leave out wings, body and tail pixels.
  Only the real head: it is what blinks, and hats sit on it. A beetle's head is the small part with
  the eyes and antennae; the shell in front of its wing cases (the pronotum) and a horn on that shell are body
  (the firefly was cut with its whole front shell as head until 2026-11-09).
- `legs_front` / `legs_back`: polygon(s) round the near / far legs below the body (or null). A floater or
  a legless blob: null for both.
- `blink`: [{"at":[x,y], "rows":["..."]}], '.' = leave. Draw properly shut eyes with the creature's own
  letters: a lid line (dark/outline letter, slightly curved) and the surrounding skin/fur letter where the eye
  was. Cover every eye pixel (glints and glows too).
- `sockets` (all required):
  - `hat`: bottom-centre of a 20x14 hat = top of the skull, between/just in front of the ears;
  - `face`: centre of 16x8 glasses = between the eyes (3/4 face: a little toward the near eye);
  - `neck`: top-centre of a 16x10 collar/scarf = front of the neck where it meets the chest;
  - `held`: bottom-centre of a 12x12 held thing = the near hand/paw, or in front of the chest for a quad;
  - `back`: the point a 20x20 cape/pack's anchor (14,19 of the item) rests on = middle of the back. The item
    reaches up and back from there and is drawn behind the creature, so on a tall back put the socket near the
    top of the back, or nothing shows (check the "bat wings" panel).
  - Any socket may have a third number, an angle: `"hat": [53, 31, 20]` turns the item 20 degrees clockwise
    (negative: anticlockwise) about its anchor, taking the nearest pixel so it stays crisp. Use it for a head that
    leans (the firefly's cap tilts forward with its head) or a back that slopes. Keep it small: beyond about 30
    degrees pixel art looks ragged.
- `shirt`: {"box":[x0,y0,x1,y1], "letters":"..."} = which body pixels a shirt pattern covers (torso's main
  coat letters inside the box; not wings, tail, head, legs, glows), or null if a shirt makes no sense. Add
  `"not": polygon(s)` for an area inside the box the shirt leaves alone (the firefly's front shell).
- `hover`: pixels a floater stays above the ground (0 for walkers).
- `wings`: `true` for a creature drawn with wings of its own (leave it out otherwise). It then wears nothing
  on its back (no cape, pack or wings: the owner's rule), and the game reads it from here, so a new winged
  creature follows the rule without a code change.
- `name`, `type` (ember/tide/grove/spark/stone/dusk), `set` (original/cyberpunk/fantasy), `plan`
  (biped/quad/floater/blob: sets battle stats).

Check the preview at full size (crop it): shut eyes read as shut, items sit believably in every panel, the
shirt stays on the torso. Iterate until it's clean. Then animate it (ANIM_GUIDE.md): a new creature needs its
anim.json and parts grid for both looks, or the build stops.
