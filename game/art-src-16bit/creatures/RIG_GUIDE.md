# Cutting a creature for the game (rig.json)

The game animates each creature from layers cut out of its finished drawing:
- the **head** dips 1px on the walk's second step and 2px asleep (everything inside the head polygon moves);
- the **near legs** (`legs_front`, drawn in front of the body) lift 1px on the walk's second step;
- the **far legs** (`legs_back`) are drawn behind the body and never move;
- for a **blink** (and asleep, and happy) the `blink` stamps are painted over the head.
Worn things sit on **sockets** (pixel coordinates in the 64x64 drawing).

`tools/game_art/beasts.py` (don't edit it; ask the lead) does the cutting:

    .venv/Scripts/python.exe tools/game_art/beasts.py preview <id>    -> creatures/<id>/_rig_preview.png

The sheet shows: the cut (head red, far legs blue, near legs green, shirt area yellow, body grey), still,
walk frames, blink, asleep, dressed (cap, round glasses, scarf, book, red cape) and a striped shirt.
Worked example: `creatures/chick/rig.json`.

Fields:
- `art`: the final drawing file (e.g. `_ff2.txt`); `palette`: its full letter=hex string.
- `head`: polygon(s) [[x,y],...]; a pixel belongs if its centre (x+0.5, y+0.5) is inside. Follow the neck
  line; include ears, horns, crest, beak/muzzle, head fur; leave out wings, body and tail pixels.
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
  - `back`: the point a 20x20 cape/pack's anchor (14,19 of the item) rests on = middle of the back.
- `shirt`: {"box":[x0,y0,x1,y1], "letters":"..."} = which body pixels a shirt pattern covers (torso's main
  coat letters inside the box; not wings, tail, head, legs, glows), or null if a shirt makes no sense.
- `hover`: pixels a floater stays above the ground (0 for walkers).
- `name`, `type` (ember/tide/grove/spark/stone/dusk), `set` (original/cyberpunk/fantasy), `plan`
  (biped/quad/floater/blob: sets battle stats).

Check the preview at full size (crop it): no jagged seams when the head dips or legs lift, shut eyes read
as shut, items sit believably. Iterate until it's clean.
