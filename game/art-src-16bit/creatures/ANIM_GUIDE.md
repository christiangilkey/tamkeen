# Animating a creature (walk, idle, fly)

The owner approved real frame animations for every creature, both looks (juvenile and hatchling), on 2026-11-09:
- **walk**: 6 frames, legs in alternating pairs, the body dips a pixel when the feet land, the tail sways;
- **idle**: 4 frames, a breath (back and chest rise a pixel, the head and wings ride up with it) and a tail swish;
  the game adds the **blink** itself (the eyelids are worked out for every frame), so don't draw one.
  **Idle frame 0 is the drawing exactly as drawn** (no breath, no tail bend, nothing): it is the still picture
  shown on the Creatures page, in portraits and the shop (the test checks it);
- **fly**: 4 frames, only for a creature with `"wings": true` in its rig.json: wings beat (up, level, down,
  level), legs tucked back, the whole creature rising and falling with the beat (`lift`).
The owner's taste: detailed, cool Final Fantasy-style monsters with a splash of cute. Motion should read clearly
at game size (about 2x) and never smear the drawing.

`tools/game_art/anim.py` makes every frame from the finished drawing: no redrawing. Each pixel belongs to a **part**
(the parts grid), and each frame moves parts with **steps** (swing a leg from its hip, turn a wing about its root,
bend a tail, breathe). Unmoved pixels stay identical; moved ones are resampled RotSprite-style so outlines stay
crisp. Worked example: `griffin/` (`_parts.txt`, `anim.json`, `_parts_hatchling.txt`, `anim_hatchling.json`).

## More actions later (mini-games)
Animations are named **actions**. Besides idle, walk and fly, anim.json may define any other, e.g. a run or a jump:
`"run": {"like": "walk", "swing": 3, "lift": 3, "ms": 80}` (a built-in preset with its own numbers) or
`"jump": {"custom": [...per-frame steps...], "ms": [...], "loop": false}` (`"loop": false` plays it once and holds
the last frame). The build writes `<action>.png` for each and beasts.js lists it; the game asks for an action by
name with `render.animAt(look, name, ms, seed, speed)` and a creature that lacks it falls back to walk (run, swim,
climb...) or idle (anything else): `render.js ACTION_FALLBACK`. A held thing turns with a part that turns (an arm's
`rot` step): the frame's offset for it gets a third number, degrees, so a rod or watering can swings with the arm.

## Files (per look; the hatchling's names in brackets)
- `_parts.txt` (`_parts_hatchling.txt`): a copy of the drawing's grid where each drawn pixel is a part letter, `.`
  where the drawing is empty (it must match the drawing's empty pixels exactly).
- `anim.json` (`anim_hatchling.json`): hips, pivots and how big the moves are.
- Generated, for checking: `_grid*.png`, `_anim*_preview.png`, `_anim_zoom*.png`, `_anim*_<name>.gif` (GIFs are
  not committed).

## Part letters
`b` body (everything not listed elsewhere), `h` head (follow rig.json's head: the real head, with ears, horns,
crest), `t` tail, `W` near wing / `w` far wing, `F` near fore leg / `f` far fore leg, `R` near hind leg / `r` far
hind leg (a biped's two legs are `R` near and `r` far), `A` near arm / `a` far arm, `e` an ear that flicks (only
with `extra` steps). Any other letter is allowed for a part you move with `extra` steps (a jellyfish's bell, a
seal's flipper); otherwise it rides on the body.

Where parts meet, the line matters: a leg's part should start inside the body (above where it shows), so a swing
never opens a gap at the hip; a tail starts where it leaves the rump; a wing starts at its root on the back.

## Commands
    .venv/Scripts/python tools/game_art/anim.py grid <id> [--hatchling]          the drawing at 14x with coordinates
    .venv/Scripts/python tools/game_art/anim.py start <id> spec.json [--hatchling] [--force]
    .venv/Scripts/python tools/game_art/anim.py preview <id> [--hatchling]
    .venv/Scripts/python tools/game_art/anim.py zoom <id> walk|idle|fly [--hatchling]

`start` writes a first parts grid from polygons (pixel centres inside, like rig.json), e.g.
`{"legs": "auto", "t": [[0,25],[18,25],[18,51],[0,51]], "W": [...], "w": [...]}`: `"legs": "auto"` takes rig.json's
leg polygons (near legs = legs_front, far = legs_back; the right-most of each is the fore leg; check it!), the head
comes from rig.json. Then fix single pixels by editing the text file directly. `grid` shows the parts in colour
beside the drawing once the file exists (head red, tail orange, wings blue, F/f green, R/r yellow, body grey).

## anim.json
```json
{
  "z": "wWrftbRFh",                 // parts back to front (default "wrfatbRFAhW")
  "legs": {"F": [hipX, hipY, footY], "f": [...], "R": [...], "r": [...]},
  "pivot": {"t": [x, y], "W": [x, y], "w": [x, y], "A": [x, y], "a": [x, y]},  // tail root, wing roots, shoulders
  "breathe": [top, mid, x0, x1],    // idle: body rows above `mid` rise, fully at `top`, between columns x0..x1
  "sockets": {"held": "F"},         // which part a worn thing rides (defaults: hat, face: h; neck, back, held: b)
  "tail_radius": 16, "tail_power": 1.3,   // optional: how the tail bend grows toward the tip
  "walk": {"frames": 6, "ms": 120, "swing": 2, "lift": 2, "bob": 1, "tail": 6, "arm": 8,
           "gait": {"F": 0.5, "f": 0, "R": 0, "r": 0.5}, "flap": [..per frame..]},
  "idle": {"ms": [420, 300, 520, 300], "breath": [0, 1, 1, 0], "tail": [0, 2, 4, 2], "rides": "hWwAae"},
  "fly":  {"ms": 100, "flap": [18, -12, -62, -12], "flap_w": [..], "lift": [8, 9, 10, 9],
           "tail": [-6, -3, 0, -3], "tuck": {"F": [-4, 3], "f": [-3, 3], "R": [-5, 2], "r": [-4, 2]}},
  "extra": ...,                      // see below (inside walk/idle/fly)
  "fix": {"walk": {"2": [{"at": [x, y], "rows": ["4a.", "_44"]}]}}
}
```
All coordinates are the drawing's own pixels (0..63). Everything has a default except `legs`, `pivot`, `breathe`.
- **swing**: how far a foot moves forward/back (px); **lift**: how high a foot rises while it swings forward;
  **bob**: how far the body drops when the feet land. Hatchlings: smaller (swing 1-2, lift 1).
- **gait**: when each leg moves (0..1 of the cycle). Quads pair near-hind with far-fore; bipeds alternate R/r.
  A beetle's six legs: tripods (give the middle legs their own letters and phases with `extra` or name them F/R).
- Angles are degrees **clockwise**. For a wing pointing up-left, negative = the tip goes down; a tail bend
  positive = the tip swings clockwise.
- A creature with no legs (floater, blob) drifts up and down a pixel as it walks (the `bob`), and its tail sways.
- **extra** (inside an animation): a list, one entry per frame, of `{part: [steps]}` added after the preset's
  steps, e.g. a jellyfish's tentacles: `"extra": [{"x": [["sway", 40, 60, 1, 12, 0]]}, ...]`.
- **custom** (inside an animation): replace the preset entirely with your own list of per-frame `{part: [steps]}`
  (a bunny's hop, a seal's galumph). Give `ms` with as many times as frames.
- **fix**: hand repairs on one frame of one animation: stamps like rig.json's blink (letters from the palette,
  `.` leave, `_` erase), in the drawing's coordinates *of that frame* (after the move). Use them for the last
  few pixels the moves can't get right: a knee, a gap at a joint, a stray dot.

Steps (what a part does in one frame, applied in order):
`["move", dx, dy]`, `["rot", px, py, deg]`, `["bend", px, py, deg, radius, power]` (more turn further from the
pivot: tails, necks, tentacles), `["scale", px, py, fx, fy]` (a bell's pulse), `["sway", y0, y1, amp, wavelength,
phase]` (rows shift sideways, more lower down: hanging tentacles, flames), `["leg", hipX, hipY, footY, swing, lift,
bob]`, `["breathe", top, mid, x0, x1, amount]`.

## How to check (do all of it)
0. `.venv/Scripts/python.exe -m pytest -q tests/test_creature_anim.py -k <id>` passes (frame counts, idle frame 0,
   fly only for winged creatures, nothing reaching the edge of the working margin).
1. `preview` and look at each GIF's frames (`_anim_preview.png` shows all frames; red = eyelids, yellow = shirt
   area; they must sit on the eyes and torso in every frame).
2. `zoom` each animation and look at every frame at 8x: no see-through gaps inside the creature, no smeared or
   doubled outlines, no lost eye, feet that should be on the ground are on it, the far legs never show in front
   of the near ones, a wing or tail never cuts through the head.
3. The dressed copy in the GIFs: the cap, glasses and book must stay on the head and paw in every frame.
4. Fix with the parts grid first (a pixel in the wrong part), then the anim.json numbers, then `fix` stamps.
Don't run `beasts.py build` (the lead does), and don't edit rig.json (another chat edits sockets).
