# Battle terrain art

Tiles and props for the live battles' arenas (the terrain list, effects and themes are in
`web/js/game/battlemap.js`, the Map chat's). All pixel art, 16x16 tiles, light from the top left, seen from the
same three-quarter angle as the creatures. Made by `game/art-src/terrain/terrain.py` and `props.py`; the layered
Aseprite sources are in `game/art-src/terrain/aseprite/` (one per PNG below, same name). Rebuild everything with
`.venv/Scripts/python game/art-src/terrain/terrain.py build --aseprite`.

## How to draw a tile

The map gives each tile a stack of layers, bottom to top (`drawLayers(map, tx, ty)` →
`[{ terrain, variant, fill }]`). For each layer:

- `variant` 0-14: draw tile `variant` of `<terrain>.png` — column `variant % 4`, row `floor(variant / 4)`, each
  16x16. The variant is which neighbours are the same terrain (north 1, east 2, south 4, west 8).
- `variant` 15 (all four neighbours the same): draw tile `fill` (0-3) of `<terrain>_fill.png` instead.

Edge tiles are **see-through** outside the terrain's shape, so the theme's ground (always the bottom layer)
shows round it. Some edge tiles also hold see-through **shadow** pixels (partly transparent, dark violet) on
their outside — under a cliff, a wall, a bridge, tall grass — so draw with normal alpha blending. Fill tiles are
opaque, except `shadow` (below).

**`shadow` is see-through on purpose**, fills included: it is a dark veil with moss and glowing spores that
darkens whatever ground is drawn under it, so it reads as shade on grass, cave floor or anything else.

## Animated terrains

`shallows`, `deep_water`, `lava`, `coals`, `crystals`, `spring` have 4 frames (about 5 frames a second looks
right; every tile on the map shows the same frame at the same time, which keeps them seamless).

- `<terrain>_fill.png` (64x16): as agreed, the 4 frames of middle tile 0. Simplest option.
- `<terrain>_fill_anim.png` (64x64): the better option: all 4 middle-tile variants, animated. Row = `fill`
  (0-3), column = frame (0-3).
- `<terrain>_anim.png` (256x64): the edge sheet for each frame side by side; frame `f`'s sheet starts at
  x = 64·f. Without it the edges of these terrains stand still while their middles move.
- `<terrain>.png` is frame 0 of the edge sheet.

## Props

Drawn standing on the bottom edge of their footprint, centred on it (`PROPS[id]` in battlemap.js says the
footprint: how many tiles wide; they block one row of tiles). Each image includes the prop's soft shadow on the
ground. Use the image's own size: trees are taller than their footprint and overlap the tiles behind them, so
sort props and creatures by their bottom edge. May be drawn mirrored (`flip`).

| file | size | footprint |
|---|---|---|
| prop_boulder.png | 16x16 | 1 tile |
| prop_rock_big.png | 32x32 | 2 tiles |
| prop_tree.png | 48x64 | 2 tiles |
| prop_pine.png | 32x64 | 2 tiles |
| prop_palm.png | 48x64 | 2 tiles |
| prop_bush.png | 16x16 | 1 tile |
| prop_cactus.png | 16x32 | 1 tile |
| prop_crystal.png | 16x32 | 1 tile |
| prop_stalagmite.png | 16x32 | 1 tile |
| prop_pillar.png | 16x32 | 1 tile |
| prop_obsidian.png | 16x16 | 1 tile |
| prop_mushroom.png | 16x32 | 1 tile |

## Every file

22 area terrains, each `<id>.png` 64x64 (4x4 edge tiles) and `<id>_fill.png` 64x16 (4 middle tiles):
grass, dirt, sand, snow, ash, cave_floor, tall_grass, flowers, forest_floor, mud, shallows, deep_water, ice, high,
cobbles, crystals, coals, lava, shadow, spring, bridge, wall.

The 6 animated ones also have `<id>_anim.png` 256x64 and `<id>_fill_anim.png` 64x64:
shallows, deep_water, lava, coals, crystals, spring.

Plus the 12 props above. 68 files in all:

| file | size |
|---|---|
| ash.png | 64x64 |
| ash_fill.png | 64x16 |
| bridge.png | 64x64 |
| bridge_fill.png | 64x16 |
| cave_floor.png | 64x64 |
| cave_floor_fill.png | 64x16 |
| coals.png | 64x64 |
| coals_anim.png | 256x64 |
| coals_fill.png | 64x16 |
| coals_fill_anim.png | 64x64 |
| cobbles.png | 64x64 |
| cobbles_fill.png | 64x16 |
| crystals.png | 64x64 |
| crystals_anim.png | 256x64 |
| crystals_fill.png | 64x16 |
| crystals_fill_anim.png | 64x64 |
| deep_water.png | 64x64 |
| deep_water_anim.png | 256x64 |
| deep_water_fill.png | 64x16 |
| deep_water_fill_anim.png | 64x64 |
| dirt.png | 64x64 |
| dirt_fill.png | 64x16 |
| flowers.png | 64x64 |
| flowers_fill.png | 64x16 |
| forest_floor.png | 64x64 |
| forest_floor_fill.png | 64x16 |
| grass.png | 64x64 |
| grass_fill.png | 64x16 |
| high.png | 64x64 |
| high_fill.png | 64x16 |
| ice.png | 64x64 |
| ice_fill.png | 64x16 |
| lava.png | 64x64 |
| lava_anim.png | 256x64 |
| lava_fill.png | 64x16 |
| lava_fill_anim.png | 64x64 |
| mud.png | 64x64 |
| mud_fill.png | 64x16 |
| prop_boulder.png | 16x16 |
| prop_bush.png | 16x16 |
| prop_cactus.png | 16x32 |
| prop_crystal.png | 16x32 |
| prop_mushroom.png | 16x32 |
| prop_obsidian.png | 16x16 |
| prop_palm.png | 48x64 |
| prop_pillar.png | 16x32 |
| prop_pine.png | 32x64 |
| prop_rock_big.png | 32x32 |
| prop_stalagmite.png | 16x32 |
| prop_tree.png | 48x64 |
| sand.png | 64x64 |
| sand_fill.png | 64x16 |
| shadow.png | 64x64 |
| shadow_fill.png | 64x16 |
| shallows.png | 64x64 |
| shallows_anim.png | 256x64 |
| shallows_fill.png | 64x16 |
| shallows_fill_anim.png | 64x64 |
| snow.png | 64x64 |
| snow_fill.png | 64x16 |
| spring.png | 64x64 |
| spring_anim.png | 256x64 |
| spring_fill.png | 64x16 |
| spring_fill_anim.png | 64x64 |
| tall_grass.png | 64x64 |
| tall_grass_fill.png | 64x16 |
| wall.png | 64x64 |
| wall_fill.png | 64x16 |

## Previews

`game/art-src/terrain/preview.py all` draws every terrain as a sample patch. Whole arenas straight from the game's
generator: `node game/art-src/terrain/dump_maps.mjs maps.json [theme:seed ...]`, then
`python game/art-src/terrain/arena.py maps.json` draws them (with props and creatures for scale) exactly as
described above.
