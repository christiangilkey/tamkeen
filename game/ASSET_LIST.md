# Tamkeen creature game: art brief and asset list

This is the complete list of pixel art the creature game needs, written for the session that draws it.
Give this whole file to that session.

**How delivery works.** Every file below already exists as a crude placeholder in `web/game-art/`. Real art
replaces a placeholder by having **exactly the same path, file name and pixel size**. Nothing else needs to
change: drop the PNG in and the app shows it. Looking at the placeholder for any file shows where things sit.

Work in the order of the phases. Phase 1 is everything the app uses today (167 files). Phases 2 and 3 are
for features not built yet; their names and sizes are fixed now so art can be made ahead.

---

## 1. Rules for every file

- **PNG, transparent background, no anti-aliasing, no partial transparency** (every pixel fully opaque or
  fully clear). No glow or blur; the app adds effects.
- **Exact canvas size** as listed. Do not trim empty space.
- **Outline:** 1 pixel, colour `#1b1420` (the app's plum-black), on creature parts, eggs, items and icons.
  Habitat backgrounds have no outline.
- **Light comes from the top left.**
- **Creatures face right.** The app mirrors them to face left.
- **Style:** friendly, rounded, readable at small size; in the spirit of the Tamkeen logo (plum to teal,
  with gold). Original creatures only: nothing that resembles Pokémon or any existing character.
- The app shows this art at 2x to 4x with hard pixel edges, so every pixel is visible.

### The key palette (creature parts only)

Creature parts are drawn in **these exact colours**, and the app swaps them for each creature's own
colours. A pixel that is even one shade off will not be swapped. Use only these, plus the outline, for
anything that should take the creature's colours:

| Role | Colours (light to dark) | Use for |
|---|---|---|
| Primary | `#8fd3ff` `#4aa3e8` `#2f6fb8` `#1f4780` | body: highlight, base, shade, deep shade |
| Secondary | `#fff1c9` `#f5cf7a` `#d49a3f` | belly, inner ear, markings |
| Accent | `#ff7a9c` `#d6456e` | tips, gems, fins, flames: the "element" touches |
| Outline | `#1b1420` | never swapped |

Anything else (eye whites `#ffffff`, pupils) stays as drawn. **Pattern tiles** are the one exception: they
are drawn in pure `#ff00ff` only (see 2.6).

---

## 2. Phase 1: creatures, eggs, habitat, effects (needed now, 167 files)

### How a creature is built

A creature is assembled from separate parts placed on fixed attachment points ("sockets"). The app picks the
parts from the creature's seed, recolours them, and animates by moving parts a pixel or two (head bob, leg
swap, blink). So **no animation frames are needed** beyond the few listed (two leg frames, two wing frames,
five eye expressions, six mouths).

Growth changes proportions rather than scale: **the head is one size for life**, while the torso and limbs
come in three sizes. A hatchling is mostly head; an adult is mostly body.

There are four body plans ("species"): `blob` (no limbs), `biped` (two legs, arms), `quad` (four legs,
drawn as a front and a back leg), `floater` (wings, hovers). Each should have its own clear silhouette.

Each adult has three possible forms ("branches"), decided by how the owner studies. They must look like the
same animal grown up, with its features carried over, not a different creature:
- `echo` (listening): flowing, sound-wave or ripple motifs, larger ear area.
- `sage` (reading): calm and wise, a collar, brow or scroll-like motif.
- `keeper` (collecting words): sturdy, gem or treasure motifs.

### 2.1 Torsos: 24 files, folder `creature/torso/`

Sizes: small 20x16, medium 28x24, large 40x36. Sockets are pixel positions inside the canvas (x from the
left, y from the top). Keep the body's outline passing through or near them so parts join cleanly.

| Size | Canvas | neck | tail | back | arm | front leg | back leg |
|---|---|---|---|---|---|---|---|
| s | 20x16 | 12,3 | 2,10 | 8,2 | 13,9 | 13,15 | 6,15 |
| m | 28x24 | 18,4 | 2,15 | 11,3 | 19,13 | 19,23 | 8,23 |
| l | 40x36 | 27,6 | 3,23 | 16,4 | 28,19 | 28,35 | 11,35 |

- `neck`: where the bottom of the head sits (upper right, the creature faces right).
- `tail`: left edge. `back`: top, for wings, fins and shells. Legs hang from the bottom edge.
- `blob` and `floater` have no legs: their torso's bottom edge is what rests on (or hovers over) the ground.

Files: `<species>_<size>.png` for species `blob biped quad floater` and size `s m l` (12 files), plus the
adult branch forms `<species>_l_<branch>.png` for branch `echo sage keeper` (12 files, all 40x36).
Example: `creature/torso/quad_m.png`, `creature/torso/blob_l_sage.png`.

### 2.2 Heads: 16 files, folder `creature/head/`, all 32x28

| Socket | Position | What attaches |
|---|---|---|
| neck | 13,26 | joins the torso's neck socket |
| eye | 19,14 | centre of the eyes sprite (16x8) |
| mouth | 22,21 | centre of the mouth sprite (8x6) |
| back ear | 8,6 | bottom-centre of the ear behind the head |
| front ear | 19,5 | bottom-centre of the ear in front |
| horn | 14,3 | bottom-centre of a horn |
| hat | 14,4 | bottom-centre of a hat (phase 2) |
| face | 19,14 | centre of glasses (phase 2) |

Draw the head **without eyes, mouth, ears or horns** (they are separate parts), and leave the face area
around 19,14 and 22,21 clear and flat enough for them.

Files: `<species>.png` (4 files, used for hatchling and juvenile and as the basis of the adult) and
`<species>_<branch>.png` (12 files).

### 2.3 Limbs: 21 files

Anchor is the top-centre of each limb (it hangs from its socket).

| Folder and files | Sizes s / m / l | Count |
|---|---|---|
| `creature/leg/<species>_<size>_<a or b>.png`, species `biped quad` | 6x5 / 6x8 / 8x12 | 12 |
| `creature/arm/biped_<size>.png` | 5x6 / 6x9 / 8x12 | 3 |
| `creature/wing/floater_<size>_<a or b>.png` | 10x8 / 14x12 / 20x16 | 6 |

Frame `a` is standing (wing up); frame `b` is mid-step (wing down). Wings attach by their bottom-right corner.

### 2.4 Head and body features

All drawn in the key palette. Anchor = the pixel that sits on the socket.

| Folder | Canvas | Anchor | Files (ids) | Count |
|---|---|---|---|---|
| `creature/ear/` | 12x14 | 6,13 bottom-centre | `round point long floppy fin leaf tuft` | 7 |
| `creature/tail/` | 16x16 | 15,8 right-middle | `nub curl fluff spike fish leaf bolt` | 7 |
| `creature/horn/` | 12x12 | 6,11 bottom-centre | `nub pair antenna crest gem` | 5 |
| `creature/back/` | 16x16 | 8,15 bottom-centre | `spikes shell fin sprout flame` | 5 |

One ear file is drawn twice by the app (behind and in front of the head).

### 2.5 Faces

- **Eyes:** `creature/eyes/<style>_<expression>.png`, 16x8, 30 files. Both eyes on one sprite, centred.
  Styles: `dot round oval sleepy star wide`. Expressions: `open blink happy sad sleepy`.
- **Mouths:** `creature/mouth/<id>.png`, 8x6, 6 files: `neutral smile open eat sad sleep`.

### 2.6 Patterns: 5 files, folder `creature/pattern/`, 16x16

`spots stripes patch speckle rings`. Seamlessly tiling, drawn in pure `#ff00ff` on transparent. The app
paints the pattern onto the torso only where the body colour is, in the creature's secondary colour.

### 2.7 Eggs and element icons

Six elements: `ember` (fire), `tide` (water), `grove` (plants), `spark` (lightning), `stone` (earth),
`dusk` (night). These are full colour, not the key palette.

| Files | Canvas | Count | Notes |
|---|---|---|---|
| `egg/<element>.png` | 32x32 | 6 | egg stands on the bottom edge, centred; shell pattern hints at the element |
| `egg/crack_1.png` `crack_2.png` `crack_3.png` | 32x32 | 3 | cracks only, on transparent, drawn over any egg; each one more broken |
| `icon/type_<element>.png` | 16x16 | 6 | small element emblem |

### 2.8 Habitat: the meadow, folder `habitat/`

The scene is 320x144. Creatures stand with their feet at y = 124. Four layers stacked back to front, each a
full 320x144 image:

| File | Content |
|---|---|
| `habitat/meadow/sky.png` | opaque daytime sky gradient (the app darkens it for evening and night) |
| `habitat/meadow/far.png` | distant hills, transparent above them |
| `habitat/meadow/mid.png` | trees and bushes, transparent elsewhere; keep the middle of the scene fairly open |
| `habitat/meadow/ground.png` | ground from about y = 116 down to the bottom, transparent above |

Plus: `habitat/sun.png` 24x24, `habitat/moon.png` 24x24, `habitat/cloud_1.png` 48x16, `habitat/cloud_2.png` 32x12.

### 2.9 Effects, folder `fx/`

Single small sprites, 8x8 (6 files): `star plus gem heart zzz note`.

Animation strips: square frames side by side in one row, left to right (6 files):

| File | Frame | Frames | Full canvas | Shown when |
|---|---|---|---|---|
| `fx/sparkle.png` | 16x16 | 4 | 64x16 | small twinkle |
| `fx/dust.png` | 16x16 | 4 | 64x16 | landing after a hop |
| `fx/burst_lucky.png` | 48x48 | 6 | 288x48 | a "lucky" reward |
| `fx/burst_jackpot.png` | 64x64 | 8 | 512x64 | a "jackpot" reward, daily goal reached |
| `fx/hatch.png` | 64x64 | 8 | 512x64 | egg hatching (shell pieces flying out) |
| `fx/levelup.png` | 64x64 | 8 | 512x64 | level up, growing to a new stage |

### 2.10 Icons, folder `icon/`, 16x16 (6 files)

`xp` (a spark or star), `coin`, `streak` (flame), `freeze` (ice crystal: covers a missed day), `hint` (a
card), `goal` (target).

---

## 3. Phase 2: shop, cosmetics, the incremental habitat (not built yet)

Names and sizes are final; these can be drawn ahead.

### 3.1 Accessories (full colour, not the key palette)

Worn items snap to sockets, so they stay in place as the creature grows.

| Folder | Canvas | Anchor | Ids | Count |
|---|---|---|---|---|
| `item/hat/` | 20x14 | 10,13 bottom-centre (sits on the hat socket) | `cap beanie crown wizard flower headphones bow straw` | 8 |
| `item/face/` | 16x8 | 8,4 centre (over the eyes) | `round_glasses shades monocle star_glasses mask` | 5 |
| `item/neck/` | 16x10 | 8,1 top-centre (hangs from the neck socket) | `gold_chain scarf bowtie bell spiked_collar medal` | 6 |
| `item/held/` | 12x12 | 6,11 bottom-centre (in the hand) | `book lantern flag balloon microphone quill` | 6 |
| `item/shirt/` | 16x16 tile | tiling, masked to the torso by the app | `striped plain dotted checked star` | 5 |

### 3.2 More habitats: 3 themes x 4 layers = 12 files

`habitat/oasis/`, `habitat/forest/` (night woods with fireflies), `habitat/shore/`; each with `sky far mid
ground`, 320x144, same rules as the meadow.

### 3.3 Decorations to place in the habitat: 24 files, folder `decor/`

Bottom edge rests on the ground, transparent background, full colour.

- 16x16: `flower_red flower_blue mushroom rock_small grass_tuft lantern_small shell signpost`
- 32x32: `bush rock_big nest bed food_bowl toy_ball bookshelf radio pond campfire tent lamp_post`
- 48x48: `tree_fruit fountain arch statue`

### 3.4 Structures that produce resources (the idle game): 18 files, folder `structure/`

Six structures, each in three upgrade tiers that look like clear improvements of the same thing.
`<id>_<tier 1 2 3>.png`, 32x32 for tiers 1 and 2, 48x48 for tier 3.

| Id | Idea |
|---|---|
| `word_sprout` | a plant that grows glowing letters |
| `echo_shell` | a big shell that hums (listening) |
| `page_lantern` | a paper lantern made of pages (reading) |
| `ink_well` | a small well of ink |
| `star_loom` | a loom weaving starlight |
| `memory_stone` | a carved standing stone |

### 3.5 Items and currencies: 20 files, folder `icon/`, 16x16

Food: `food_berry food_fish food_leaf food_spark food_crystal food_cake`. Useful items: `xp_boost
incubator gift key ticket potion egg_mystery`. Currencies and misc: `gem stardust lock check heart_full
heart_empty arrow`.

### 3.6 Emotes shown above the creature: 8 files, folder `fx/`, 12x12

`emote_love emote_hungry emote_sleepy emote_music emote_question emote_exclaim emote_sweat emote_idea`.

### 3.7 Interface frames (optional; the app uses plain panels until these exist), folder `ui/`

- `panel.png`, `panel_dark.png`, `bubble.png`: 24x24 each, built to stretch from 8-pixel corners (9-slice).
- `button.png`, `button_pressed.png`, `button_disabled.png`: 24x24, 9-slice.
- `bar_frame.png` 48x8 and `bar_fill.png` 4x4.
- `rarity_common.png`, `rarity_lucky.png`, `rarity_jackpot.png`: 24x24 item frames.
- `digits.png`: a pixel font strip, glyphs 8x10 each in this order: `0123456789+-x.,%!?kM` (160x10), white.

---

## 4. Phase 3: battles, raids, leagues (not built yet)

| Files | Canvas | Count | Notes |
|---|---|---|---|
| `battle/pad_player.png` `battle/pad_rival.png` | 64x16 | 2 | ground pads the two creatures stand on |
| `battle/hit_<element>.png` | strip of 5 frames, 32x32 each (160x32) | 6 | impact when a move lands |
| `battle/shot_<element>.png` | strip of 3 frames, 16x16 each (48x16) | 6 | projectile flying right |
| `battle/shield.png` `battle/heal.png` `battle/boost.png` | strip of 6 frames, 48x48 each (288x48) | 3 | guard, heal and power-up effects |
| `icon/move_attack.png` `move_guard.png` `move_boost.png` `move_heal.png` | 16x16 | 4 | move categories |
| `icon/stat_hp.png` `stat_atk.png` `stat_def.png` `stat_spd.png` | 16x16 | 4 | |
| `icon/league_bronze.png` `league_silver.png` `league_gold.png` `league_diamond.png` | 24x24 | 4 | |
| `boss/<id>_idle.png` (strip of 2 frames), `boss/<id>_hurt.png`, `boss/<id>_down.png` | 96x96 per frame | 12 | four weekly raid bosses: `mumbler` (a fog of garbled speech), `blank_page`, `static` (radio noise), `forgetting` (a fading shape). Facing left. |
| `badge/<id>.png` | 24x24 | 16 | `first_hatch first_word streak_7 streak_30 streak_100 goal_10 words_100 words_1000 listener reader collector adult_echo adult_sage adult_keeper raid_win friend_battle` |

---

## 5. Totals

| Phase | Files | Status in the app |
|---|---|---|
| 1. Creatures, eggs, meadow, effects, icons | 167 | built, running on placeholders |
| 2. Accessories, habitats, decor, structures, items, emotes, interface | about 110 | not built |
| 3. Battles, bosses, leagues, badges | about 57 | not built |

Sound is not on this list: the app makes its own sound effects.

## 6. Checking the work

After copying finished files into `web/game-art/`, run this from the `podcast-studio` folder (it runs the
app's automated tests, one of which checks every Phase 1 file is present):

```bash
node --test tests/js/game.test.mjs
```

To see every creature combination with the new art, open Tamkeen's Home screen: the habitat at the bottom
shows the current creature.
