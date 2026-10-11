# Creature parts: design sheet for redrawing in Aseprite

Every creature part is being redrawn by hand in Aseprite, through the Aseprite MCP tools
(`mcp__plugin_pixel-plugin_aseprite__*`), by several sessions at once. This sheet is what keeps their
pieces fitting together. Read it all before drawing. Sizes, file names and attachment points are in
`game/ASSET_LIST.md` section 2 and `web/js/game/data.js` (`SIZES`, `HEAD`, `PART`); they are fixed.

**Do not generate these files with a script, and do not use `import_image`.** The owner asked for the
art to be made with Aseprite's own tools. Scripts are fine for *looking* at results.

## 1. What the creatures are

Four original animals. They follow the design rules of collectable-monster games, but **none may
resemble an existing character from any game or show**; if a part starts to look like one, change it.

| Body plan | Animal | Signature shape | Quirk |
|---|---|---|---|
| `blob` | a droplet: one soft mass, no limbs | a wisp curling off the top of the head, leaning right | a blush mark on the cheek |
| `biped` | an upright hatchling lizard | back fins in the accent colour: 1 on the small body, 2 on the medium, 3 on the large; a swept-back nub on the skull | two freckles |
| `quad` | a pup | a tuft of fur at the jaw; a pale muzzle with a dark nose | two whisker marks |
| `floater` | a round, fluffy flier | a crown tuft and a cheek tuft; the tail trails to a point in the accent colour | a small mark under the eye |

Rules for every part:

- **One mass, one interruption.** Filled solid, the part should still read. No texture, no scattered marks.
- **Two to four colours**: body, a paler belly, one accent, and the white of the eye.
- **Round forms, one sharp thing** (a fang, a claw, a pointed tuft).
- **Low detail.** If in doubt, leave it out.
- **Big eyes** with a white, a dark pupil and a highlight, looking right (the way the creature faces).
- **The young carry small versions of what the adult grows.**
- Creatures face **right**. Light comes from the **top left**: shade the lower right, one small highlight
  on heads only, none on bodies.

Adult forms (large body and head only) restyle the same animal:
`echo` two ripple arcs in the accent colour on the cheek, and two on the flank;
`sage` pale brows and a small accent dot on the forehead, a pale ruff at the throat;
`keeper` a darker cheek plate and a crystal in the forehead, a darker plate on the back and two small crystals in the hide.
(The heads are drawn, as of 2026-10-11: see `web/game-art/creature/head/`. The frill and beard first planned
for echo and sage heads were dropped, because adding to a silhouette after it has been outlined is not practical.)

`tools/game_art/creature.py` is the previous, script-drawn version of every part. Use it as the
reference for where shapes sit (its coordinates respect the attachment points), then draw better by hand.
`game/art-preview/creatures.png` shows that version assembled.

## 2. Colours (exact: the app swaps these per creature; one shade off and a pixel is not swapped)

| Role | Highlight to dark | Use |
|---|---|---|
| Body (P) | `#8fd3ff` `#4aa3e8` `#2f6fb8` `#1f4780` | highlight, base, shade, outline |
| Belly (S) | `#fff1c9` `#f5cf7a` `#d49a3f` | belly, muzzle, claws, horns, leaves |
| Accent (A) | `#ff7a9c` `#d6456e` | fins, markings, crystals, lower iris |
| Line | `#1b1420` | pupils, eyelids, mouths, noses only |
| White | `#ffffff` | eye whites, highlights, fangs |
| Pattern tiles only | `#ff00ff` | |

- **Outline:** one pixel, `#1f4780`, on every part except eyes, mouths and patterns. Where the light
  hits (top-left edges) it may be `#2f6fb8` instead.
- Every pixel fully opaque or fully clear. No pure black. No other colours.

## 3. How the Aseprite tools behave (learned the hard way)

- `create_canvas` gives a new file in a temp folder. The layer is `Layer 1`, the frame is `1`.
- `draw_rectangle`, `draw_circle`, `draw_line`, `draw_contour`, `fill_area` use true canvas coordinates.
  A circle of radius r is 2r+1 pixels across. A closed `draw_contour` plus `fill_area` inside it makes a
  filled polygon. There is no ellipse tool.
- **`draw_pixels` is offset.** On a brand-new canvas its coordinates are true. As soon as anything has
  been drawn, its coordinates are measured from the top-left corner of the box around everything
  drawn so far, and pixels outside that box are silently dropped. So either draw a part entirely with
  one `draw_pixels` call on a fresh canvas, or work out the box and subtract its corner.
- A colour of `#00000000` erases (in `draw_rectangle` and in `draw_pixels`).
- `apply_outline` adds one pixel around everything, in one colour, growing outward. Leave a one-pixel
  margin for it. It will also outline holes.
- Do not use `apply_auto_shading`: it lightens the middle of a shape instead of lighting it from one side.
- Calls on *different* files can be sent together in one message. Never send two calls for the *same*
  file in one message.
- Finish each part with `export_sprite` (png, frame 1) to `web/game-art/creature/<folder>/<name>.png`
  and `save_as` to `game/art-src/creature/<folder>/<name>.aseprite`. Use full Windows paths.
- To make a variant, `save_as` the finished base to a new file and keep drawing on the copy.
- Give `save_as` its output path with forward slashes (`C:/Users/...`). With backslashes it reports a
  "failed to parse output" error even though the file is saved.
- Never `fill_area` on a pixel that is already outlined or coloured unless you mean to recolour that whole
  connected patch: flood fill follows the colour, so a stray click on the outline repaints the entire outline.

## 4. Checking your work

From the `podcast-studio` folder:

- `.venv/Scripts/python tools/game_art/look.py OUT.png 8 6 FILE_OR_FOLDER ...` prints each file's size and
  colour count, flags partial transparency or pure black, and writes an enlarged sheet to look at.
  Add `-v` to list the colours used.
- `.venv/Scripts/python tools/game_art/preview.py web/game-art SHEET_DIR creatures` assembles 24 creatures the
  way the app does. Look at it: parts must join without gaps.
- `node --test tests/js/game.test.mjs` checks that every file exists.

Do not edit anything under `web/js/`, do not run `tools/game_art/build.py` (it would overwrite the
hand-drawn files with the script's), and do not commit.
