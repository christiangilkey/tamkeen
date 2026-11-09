# Battle terrain art

Tiles, props and decals for the live battles' arenas (the terrain table, themes and placement are the Map
chat's, in `web/js/game/battlemap.js`). All pixel art, light from the top left, seen from the creatures'
three-quarter angle. Made by the scripts in `game/art-src/terrain/` (terrain.py, corners.py, props.py,
props_more.py, decals.py, and the EXTRA files village_ground.py, village_props.py, dungeon_art.py, fortress_art.py,
trees_art.py); one layered Aseprite source per PNG in `game/art-src/terrain/aseprite/`, same name.
Rebuild: `.venv/Scripts/python game/art-src/terrain/terrain.py build --aseprite`, then `readme.py` (this file); one file
at a time: `terrain.py build <terrain id | prop_<name> | decal_<id> | sprite name ...> --aseprite` (`props`, `decals`: all of them).

## How the ground is drawn: the dual grid

The map's 16x16 tiles say which ground a creature stands on. The art is drawn on cells **offset by half a
tile**, so outlines don't follow the tile grid: drawn cell (cx, cy), cx 0..cols, cy 0..rows, covers world
px x cx·16−8 … cx·16+8 (same for y), and its four corners are the centres of tiles (cx−1, cy−1),
(cx, cy−1), (cx−1, cy), (cx, cy). `drawCorners(map, cx, cy)` (battlemap.js) gives the layers to draw there,
bottom to top, as `{ terrain, mask, fill }`:

- `mask` 1-14: draw tile `mask` of `<terrain>.png` (column `mask % 4`, row `floor(mask / 4)`); the mask is which
  of the cell's corners are that terrain: north-west 1, north-east 2, south-west 4, south-east 8.
- `mask` 15: draw tile `fill` of `<terrain>_fill.png` instead (for animated terrains: see below).
- Tile 0 of every sheet is empty (never drawn).

Most terrains have smooth outlines (a lone tile draws as a round patch, a diagonal row of tiles as a
diagonal shore); the built ones (`wall`, `fort_wall`, `dungeon_wall`, `house_wall`, `wood_floor`, `stone_floor`,
`bridge`, `bridge_v`) keep square, tile-shaped ones. Draw with normal alpha
blending: edge tiles hold see-through shadow pixels, and `shadow` (fills too) is a see-through dark veil on
purpose, darkening whatever ground is under it. A bridge tile is `bridge` when its deck runs east-west,
`bridge_v` when it runs north-south.

## Structures (village, dungeon, fortress)

- Walls `fort_wall` (face 11 px), `dungeon_wall` (9), `house_wall` (10): a top (the fill tiles), a south face,
  a dark outline and a shadow. Part of the face is drawn in the wall tile's south half, the rest **hangs over
  the top of the tile to the south** (3, 1 and 2 px), so a 1-tile wall reads as high; creatures in that tile are
  drawn over it, as they stand in front. North-south runs show their top only, with the face at the south end.
  The outline sits on the wall tile's own edge pixel, so nothing shows between a wall and a floor beside it
  (the floor needn't run under the wall). Draw floors before walls, the fence after them.
- `fence` is a line, not an area: a post at the centre of every fence tile, rails to each fence tile beside it
  (north, south, east or west; diagonal neighbours get no rail). Its fill tiles are see-through too.
- `wood_floor`, `stone_floor`: level, square-edged, a thin dark seam where they meet other ground.
- `hall_wall` (the Town Hall's cream stone, face 10 px: 8 in the tile, 2 over the tile in front) is built like
  `house_wall`. `carpet`: a red runner with gold trim along its outline, on stone or wooden floor.
- `fountain`: the village fountain's basin, a block of 4x4 (2x2 on a small map) in the square: a low pale stone rim
  round clear water; animated. `farmland`, `wheat`: square-edged fields (fenced by the Map).
- `spikes`: an iron plate with holes. It has 4 frames, but they are **not** a loop: the game picks the frame from
  the battle's clock (livebattle.js `spikeFrame`): 0 down, 1 rising, 2 up (when they hurt), 3 going down.
- `cracked_wall`: a `dungeon_wall` with a crack, a hidden room's weak spot; broken open it becomes `stone_floor`
  with `decal_rubble`.

## Roofs

Every village building, the fortress keep and its towers have a roof, drawn over the building's footprint
(walls included) and sorted with props and creatures by the footprint's bottom edge; the game fades it out
while a creature is inside, and draws a shadow of it 3 px down and right (the roof's outline in the shadow
colour). `map.roofs`: { x0, y0, w, h, style, extras } in tiles (battlemap.js ROOFS, ROOF_EXTRAS).

- `roof_<style>.png` (48x80; thatch, red, slate, shingle): 16x16 pieces, 3 columns (left end, middle, right end) by
  5 rows (back eave, back slope, ridge, front slope, front eave). A roof w x h tiles is (w·16 + 6) x h·16 px, drawn
  at (x0·16 − 3, y0·16 − 10): 3 px eaves, raised 10 px, so the south wall's face shows below it. Rows: back eave,
  `a` back slopes, ridge, `b` front slopes, front eave, with a = floor((h − 3)·0.4), b = h − 3 − a; columns: the
  left end, middles repeated (the last one cut), the right end. (village_ground.py `compose_roof` does the same.)
- `roof_tower.png` (150x176): one picture for a 9x9 tower, its bottom edge at (y0 + 9)·16 − 10, centred on it.
- Extras, centred at x tiles from the roof's left, their bottom edge `sit` px below the top of the ridge row:
  `roof_chimney.png` (16x32, sit 7: on the back slope), `roof_bell.png` (32x48, sit 16: the Town Hall's bell tower,
  astride the ridge), `roof_keep_flag.png` (16x32, sit 8; its pole is 4 px left of its middle).

## Ornaments and traps

Pictures that block nothing (`map.ornaments`: id, v = variant, x, y = the cell's top-left in world px).

- On walls (the cell's top-left at the wall tile's top-left, 16x32: the wall tile, then the floor in front;
  drawn after the ground): `ornament_chains.png` (3 variants), `ornament_torch.png` (4 frames),
  `ornament_weapons.png` (3 variants: swords and shield, crossed axes, spear and kite shield; fort or hall wall).
- Standing (sorted by its bottom edge): `ornament_fountain.png` (4 frames of 32x48), its bottom centre on the
  fountain basin's centre.
- `hazard_axe.png`: 9 frames of 96x64, a pendulum blade swinging over a corridor; frame k at (k − 4)·15 degrees,
  the pivot at (48, 4) in every frame, the blade's lowest point at (48, 58), which the game puts on the floor point
  under the pivot (`map.hazards`). The game draws its moving floor shadow.

## Fill textures (groups)

Some grounds have several textures, in groups of 4 tiles along `<id>_fill.png`: tiles 0-3 the plain one,
4-7 the second, and so on. All share the same colour at their edges, so patches of different textures meet
without a seam; the Map picks the group by a slow noise (whole patches) and the tile in it by a hash.

| terrain | groups | textures |
|---|---|---|
| grass | 4 | plain, lush, dry, flowery |
| dirt | 2 | plain, stony |
| sand | 3 | plain, dunes, grit |
| snow | 3 | plain, wind-swept, drifts |
| ash | 3 | plain, cinders, crust |
| cave_floor | 3 | plain, rubble, damp |
| high | 3 | plain, mossy, cracked |
| wood_floor | 2 | plain (a knot, nails), aged (worn, darker, cracked planks) |
| stone_floor | 3 | plain (a darker, paler or chipped slab), worn (crack, stain), damp (moss, puddle, a drain in tile 10) |
| farmland | 2 | seedlings in rows, cabbages and lettuces (the edge tiles are bare tilled soil) |
| wheat | 2 | golden ripe, greener with poppies |

Every other terrain has 1 group (4 tiles).

## Animated terrains

`shallows`, `deep_water`, `crystals`, `coals`, `lava`, `spring`, `fountain`, `spikes` have 4 frames (about 5 a second; every cell shows the same frame
at the same time, which keeps them seamless).

- `<terrain>_anim.png` (256x64): the corner sheet for each frame side by side; frame f's sheet starts at x = 64·f.
- `<terrain>_fill_anim.png` (64x64): the 4 fill tiles animated: row = `fill` (0-3), column = frame.
- `<terrain>.png` / `<terrain>_fill.png`: frame 0 of the sheet / the 4 frames of fill tile 0 (the simple option).

## Props

Obstacles, drawn standing on the bottom edge of their footprint and centred on it (footprint = tiles wide, one
row). Each image includes its soft ground shadow. Use the image's own size: tall ones overlap the tiles behind
them, so sort props and creatures by their bottom edge. May be drawn mirrored. `kind` is the family the Map
treats it as.

| file | size | footprint | kind | themes |
|---|---|---|---|---|
| prop_boulder.png | 16x16 | 1 | boulder | most themes |
| prop_rock_big.png | 32x32 | 2 | rock_big | most themes |
| prop_tree.png | 48x64 | 2 | tree | meadow, forest, night |
| prop_pine.png | 32x64 | 2 | pine | forest, snow |
| prop_palm.png | 48x64 | 2 | palm | shore, desert |
| prop_bush.png | 16x16 | 1 | bush | meadow, forest, ruins, night |
| prop_cactus.png | 16x32 | 1 | cactus | desert |
| prop_crystal.png | 16x32 | 1 | crystal | cave |
| prop_stalagmite.png | 16x32 | 1 | stalagmite | cave |
| prop_pillar.png | 16x32 | 1 | pillar | ruins |
| prop_obsidian.png | 16x16 | 1 | obsidian | volcanic |
| prop_mushroom.png | 16x32 | 1 | mushroom | forest, night |
| prop_tree_birch.png | 32x64 | 1 | tree | meadow, forest, ruins, night |
| prop_tree_autumn.png | 48x64 | 2 | tree | forest, meadow, ruins |
| prop_tree_fruit.png | 48x64 | 2 | tree | meadow |
| prop_tree_willow.png | 48x64 | 2 | tree | meadow, night (by water) |
| prop_tree_dead.png | 32x48 | 1 | tree | meadow, ruins, night, desert |
| prop_tree_charred.png | 32x48 | 1 | tree | volcanic |
| prop_tree_bare_snowy.png | 48x64 | 2 | tree | snow |
| prop_mushroom_giant.png | 48x64 | 2 | mushroom | forest, night |
| prop_pine_snowy.png | 32x64 | 2 | pine | snow |
| prop_palm_small.png | 32x48 | 1 | palm | shore, desert |
| prop_palm_date.png | 48x64 | 2 | palm | desert |
| prop_boulder_mossy.png | 16x16 | 1 | boulder | meadow, forest, ruins, night |
| prop_boulder_ice.png | 16x16 | 1 | boulder | snow |
| prop_rock_big_flat.png | 32x16 | 2 | rock_big | meadow, shore, desert, ruins, snow |
| prop_rock_big_cracked.png | 32x32 | 2 | rock_big | volcanic, desert, meadow |
| prop_rock_big_cluster.png | 32x16 | 2 | rock_big | every theme |
| prop_rock_big_sandstone.png | 32x32 | 2 | rock_big | desert, shore |
| prop_rock_big_ice.png | 32x32 | 2 | rock_big | snow |
| prop_crystal_cluster.png | 16x16 | 1 | crystal | cave |
| prop_crystal_pink.png | 16x32 | 1 | crystal | cave |
| prop_obsidian_big.png | 32x32 | 2 | obsidian | volcanic |
| prop_bush_flower.png | 16x16 | 1 | bush | meadow, forest, ruins, night |
| prop_bush_dry.png | 16x16 | 1 | bush | desert, shore |
| prop_cactus_round.png | 16x16 | 1 | cactus | desert |
| prop_pillar_fallen.png | 32x16 | 2 | pillar | ruins |
| prop_barrel.png | 16x32 | 1 | barrel | village, fortress, dungeon |
| prop_crate.png | 16x16 | 1 | crate | village, fortress, dungeon |
| prop_well.png | 32x32 | 2 | well | village |
| prop_brazier.png | 16x32 | 1 | brazier | dungeon, fortress |
| prop_haystack.png | 32x32 | 2 | haystack | village |
| prop_statue.png | 16x48 | 1 | statue | fortress, dungeon |
| prop_cart.png | 32x32 | 2 | cart | village |
| prop_banner.png | 16x48 | 1 | banner | fortress, village |
| prop_stall.png | 32x48 | 2 | stall | village (the market) |
| prop_stall_cloth.png | 32x48 | 2 | stall | village |
| prop_stall_bread.png | 32x48 | 2 | stall | village |
| prop_vendor_cart.png | 32x40 | 2 | vendor_cart | village |
| prop_vendor_cart_flowers.png | 32x32 | 2 | vendor_cart | village |
| prop_scarecrow.png | 16x32 | 1 | scarecrow | village (in the fields) |
| prop_sign_tavern.png | 16x32 | 1 | sign | village (by the tavern door) |
| prop_sign_bakery.png | 16x32 | 1 | sign | village (a shop) |
| prop_sign_potion.png | 16x32 | 1 | sign | village (a shop) |
| prop_sign_smith.png | 16x32 | 1 | sign | village (a shop) |
| prop_lamp_post.png | 16x48 | 1 | lamp_post | village (the square) |
| prop_bench.png | 32x16 | 2 | bench | village (the square, the Town Hall) |
| prop_table.png | 32x32 | 2 | table | village (tavern, houses) |
| prop_counter.png | 48x32 | 3 | counter | village (tavern, shops) |
| prop_shelf.png | 32x32 | 2 | shelf | village (against a wall) |
| prop_shelf_books.png | 32x32 | 2 | shelf | village (the Town Hall, against a wall) |
| prop_sacks.png | 16x16 | 1 | sacks | village (bakery, barn) |
| prop_anvil.png | 16x16 | 1 | anvil | village (smithy) |
| prop_desk.png | 32x32 | 2 | desk | village (the Town Hall) |
| prop_chest.png | 16x16 | 1 | chest | dungeon (hidden rooms) |
| prop_cage.png | 16x32 | 1 | cage | dungeon |
| prop_statue_gargoyle.png | 16x32 | 1 | statue | dungeon |
| prop_statue_knight.png | 16x48 | 1 | statue | dungeon, fortress |
| prop_weapon_rack.png | 32x32 | 2 | weapon_rack | fortress (towers) |
| prop_weapon_rack_axes.png | 32x32 | 2 | weapon_rack | fortress (towers) |
| prop_armor_stand.png | 16x32 | 1 | armor_stand | fortress (towers) |
| prop_armor_stand_gold.png | 16x32 | 1 | armor_stand | fortress (the keep) |
| prop_throne.png | 32x48 | 2 | throne | fortress (the keep) |
| prop_tree_tall.png | 48x80 | 2 | tree | meadow, forest, fortress |
| prop_tree_poplar.png | 32x80 | 1 | tree | meadow, village |
| prop_tree_round.png | 48x64 | 2 | tree | meadow, forest, village, fortress |
| prop_tree_twisted.png | 48x64 | 2 | tree | meadow, forest, ruins, night |
| prop_tree_dead_tall.png | 48x80 | 2 | tree | forest, ruins, night |
| prop_tree_dead_broken.png | 32x48 | 1 | tree | meadow, ruins, night, desert |
| prop_pine_tall.png | 32x80 | 2 | pine | forest, snow |
| prop_pine_dead.png | 32x64 | 2 | pine | forest, snow |
| prop_log_fallen.png | 48x32 | 3 | log | meadow, forest, ruins |
| prop_log_mossy.png | 48x16 | 3 | log | meadow, forest, ruins |
| prop_stump.png | 16x16 | 1 | stump | meadow, forest, night, village |
| prop_stump_big.png | 32x24 | 2 | stump | meadow, forest |
| prop_stump_axe.png | 16x16 | 1 | stump | village |
| prop_stump_mossy.png | 16x16 | 1 | stump | meadow, forest, night |

## Decals

Small things lying on the ground that never block anything. Each file is a strip of 16x16 cells, one variant per
cell; the Map scatters them in clusters at any pixel position (`map.decals`: id, v = cell, x, y = the cell's
top-left in world px, flip). Draw them after the ground and before props and creatures, not sorted by y.
Nothing on water, bridges, walls or under props.

| file | size | cells | lies on | themes |
|---|---|---|---|---|
| decal_pebbles.png | 64x16 | 4 | grass, dirt, sand, cave_floor, ash, high, snow, cobbles | every theme |
| decal_twigs.png | 64x16 | 4 | grass, forest_floor, dirt | meadow, forest, night, ruins |
| decal_leaves.png | 64x16 | 4 | forest_floor, grass | forest, meadow, night |
| decal_tuft.png | 64x16 | 4 | grass, dirt, sand next to grass | meadow, forest, ruins, night, shore, desert |
| decal_flowers.png | 96x16 | 6 | grass | meadow, forest, night, ruins, desert (oasis) |
| decal_bones.png | 64x16 | 4 | sand, ash, dirt | desert, volcanic, ruins |
| decal_shells.png | 64x16 | 4 | sand near water | shore |
| decal_seaweed.png | 64x16 | 4 | sand near water | shore |
| decal_puddle.png | 64x16 | 4 | grass, dirt, mud, cave_floor, cobbles | meadow, forest, night, ruins, cave |
| decal_crack.png | 64x16 | 4 | sand, dirt, ash, high, cave_floor, cobbles | desert, volcanic, ruins, cave |
| decal_mushrooms.png | 64x16 | 4 | forest_floor, grass, shadow, cave_floor | forest, night, cave (cell 2 glows: night, cave) |
| decal_snowdrift.png | 64x16 | 4 | snow | snow |
| decal_cinders.png | 64x16 | 4 | ash | volcanic |
| decal_straw.png | 64x16 | 4 | wood_floor, dirt, stone_floor, cobbles | village, fortress |
| decal_rug.png | 64x16 | 4 | wood_floor | village |
| decal_cobweb.png | 64x16 | 4 | stone_floor, cave_floor | dungeon (cells 0, 1: top-left / top-right corner, against a wall) |
| decal_rubble.png | 64x16 | 4 | stone_floor, cobbles, dirt, cave_floor | dungeon, fortress |
| decal_coins.png | 64x16 | 4 | stone_floor | dungeon (laid in the hidden rooms only) |

## Every file

206 files:

| file | size |
|---|---|
| ash.png | 64x64 |
| ash_fill.png | 192x16 |
| bridge.png | 64x64 |
| bridge_fill.png | 64x16 |
| bridge_v.png | 64x64 |
| bridge_v_fill.png | 64x16 |
| carpet.png | 64x64 |
| carpet_fill.png | 64x16 |
| cave_floor.png | 64x64 |
| cave_floor_fill.png | 192x16 |
| coals.png | 64x64 |
| coals_anim.png | 256x64 |
| coals_fill.png | 64x16 |
| coals_fill_anim.png | 64x64 |
| cobbles.png | 64x64 |
| cobbles_fill.png | 64x16 |
| cracked_wall.png | 64x64 |
| cracked_wall_fill.png | 64x16 |
| crystals.png | 64x64 |
| crystals_anim.png | 256x64 |
| crystals_fill.png | 64x16 |
| crystals_fill_anim.png | 64x64 |
| decal_bones.png | 64x16 |
| decal_cinders.png | 64x16 |
| decal_cobweb.png | 64x16 |
| decal_coins.png | 64x16 |
| decal_crack.png | 64x16 |
| decal_flowers.png | 96x16 |
| decal_leaves.png | 64x16 |
| decal_mushrooms.png | 64x16 |
| decal_pebbles.png | 64x16 |
| decal_puddle.png | 64x16 |
| decal_rubble.png | 64x16 |
| decal_rug.png | 64x16 |
| decal_seaweed.png | 64x16 |
| decal_shells.png | 64x16 |
| decal_snowdrift.png | 64x16 |
| decal_straw.png | 64x16 |
| decal_tuft.png | 64x16 |
| decal_twigs.png | 64x16 |
| deep_water.png | 64x64 |
| deep_water_anim.png | 256x64 |
| deep_water_fill.png | 64x16 |
| deep_water_fill_anim.png | 64x64 |
| dirt.png | 64x64 |
| dirt_fill.png | 128x16 |
| dungeon_wall.png | 64x64 |
| dungeon_wall_fill.png | 64x16 |
| farmland.png | 64x64 |
| farmland_fill.png | 128x16 |
| fence.png | 64x64 |
| fence_fill.png | 64x16 |
| flowers.png | 64x64 |
| flowers_fill.png | 64x16 |
| forest_floor.png | 64x64 |
| forest_floor_fill.png | 64x16 |
| fort_wall.png | 64x64 |
| fort_wall_fill.png | 64x16 |
| fountain.png | 64x64 |
| fountain_anim.png | 256x64 |
| fountain_fill.png | 64x16 |
| fountain_fill_anim.png | 64x64 |
| grass.png | 64x64 |
| grass_fill.png | 256x16 |
| hall_wall.png | 64x64 |
| hall_wall_fill.png | 64x16 |
| hazard_axe.png | 864x64 |
| high.png | 64x64 |
| high_fill.png | 192x16 |
| house_wall.png | 64x64 |
| house_wall_fill.png | 64x16 |
| ice.png | 64x64 |
| ice_fill.png | 64x16 |
| lava.png | 64x64 |
| lava_anim.png | 256x64 |
| lava_fill.png | 64x16 |
| lava_fill_anim.png | 64x64 |
| mud.png | 64x64 |
| mud_fill.png | 64x16 |
| ornament_chains.png | 48x32 |
| ornament_fountain.png | 128x48 |
| ornament_torch.png | 64x32 |
| ornament_weapons.png | 48x32 |
| prop_anvil.png | 16x16 |
| prop_armor_stand.png | 16x32 |
| prop_armor_stand_gold.png | 16x32 |
| prop_banner.png | 16x48 |
| prop_barrel.png | 16x32 |
| prop_bench.png | 32x16 |
| prop_boulder.png | 16x16 |
| prop_boulder_ice.png | 16x16 |
| prop_boulder_mossy.png | 16x16 |
| prop_brazier.png | 16x32 |
| prop_bush.png | 16x16 |
| prop_bush_dry.png | 16x16 |
| prop_bush_flower.png | 16x16 |
| prop_cactus.png | 16x32 |
| prop_cactus_round.png | 16x16 |
| prop_cage.png | 16x32 |
| prop_cart.png | 32x32 |
| prop_chest.png | 16x16 |
| prop_counter.png | 48x32 |
| prop_crate.png | 16x16 |
| prop_crystal.png | 16x32 |
| prop_crystal_cluster.png | 16x16 |
| prop_crystal_pink.png | 16x32 |
| prop_desk.png | 32x32 |
| prop_haystack.png | 32x32 |
| prop_lamp_post.png | 16x48 |
| prop_log_fallen.png | 48x32 |
| prop_log_mossy.png | 48x16 |
| prop_mushroom.png | 16x32 |
| prop_mushroom_giant.png | 48x64 |
| prop_obsidian.png | 16x16 |
| prop_obsidian_big.png | 32x32 |
| prop_palm.png | 48x64 |
| prop_palm_date.png | 48x64 |
| prop_palm_small.png | 32x48 |
| prop_pillar.png | 16x32 |
| prop_pillar_fallen.png | 32x16 |
| prop_pine.png | 32x64 |
| prop_pine_dead.png | 32x64 |
| prop_pine_snowy.png | 32x64 |
| prop_pine_tall.png | 32x80 |
| prop_rock_big.png | 32x32 |
| prop_rock_big_cluster.png | 32x16 |
| prop_rock_big_cracked.png | 32x32 |
| prop_rock_big_flat.png | 32x16 |
| prop_rock_big_ice.png | 32x32 |
| prop_rock_big_sandstone.png | 32x32 |
| prop_sacks.png | 16x16 |
| prop_scarecrow.png | 16x32 |
| prop_shelf.png | 32x32 |
| prop_shelf_books.png | 32x32 |
| prop_sign_bakery.png | 16x32 |
| prop_sign_potion.png | 16x32 |
| prop_sign_smith.png | 16x32 |
| prop_sign_tavern.png | 16x32 |
| prop_stalagmite.png | 16x32 |
| prop_stall.png | 32x48 |
| prop_stall_bread.png | 32x48 |
| prop_stall_cloth.png | 32x48 |
| prop_statue.png | 16x48 |
| prop_statue_gargoyle.png | 16x32 |
| prop_statue_knight.png | 16x48 |
| prop_stump.png | 16x16 |
| prop_stump_axe.png | 16x16 |
| prop_stump_big.png | 32x24 |
| prop_stump_mossy.png | 16x16 |
| prop_table.png | 32x32 |
| prop_throne.png | 32x48 |
| prop_tree.png | 48x64 |
| prop_tree_autumn.png | 48x64 |
| prop_tree_bare_snowy.png | 48x64 |
| prop_tree_birch.png | 32x64 |
| prop_tree_charred.png | 32x48 |
| prop_tree_dead.png | 32x48 |
| prop_tree_dead_broken.png | 32x48 |
| prop_tree_dead_tall.png | 48x80 |
| prop_tree_fruit.png | 48x64 |
| prop_tree_poplar.png | 32x80 |
| prop_tree_round.png | 48x64 |
| prop_tree_tall.png | 48x80 |
| prop_tree_twisted.png | 48x64 |
| prop_tree_willow.png | 48x64 |
| prop_vendor_cart.png | 32x40 |
| prop_vendor_cart_flowers.png | 32x32 |
| prop_weapon_rack.png | 32x32 |
| prop_weapon_rack_axes.png | 32x32 |
| prop_well.png | 32x32 |
| roof_bell.png | 32x48 |
| roof_chimney.png | 16x32 |
| roof_keep_flag.png | 16x32 |
| roof_red.png | 48x80 |
| roof_shingle.png | 48x80 |
| roof_slate.png | 48x80 |
| roof_thatch.png | 48x80 |
| roof_tower.png | 150x176 |
| sand.png | 64x64 |
| sand_fill.png | 192x16 |
| shadow.png | 64x64 |
| shadow_fill.png | 64x16 |
| shallows.png | 64x64 |
| shallows_anim.png | 256x64 |
| shallows_fill.png | 64x16 |
| shallows_fill_anim.png | 64x64 |
| snow.png | 64x64 |
| snow_fill.png | 192x16 |
| spikes.png | 64x64 |
| spikes_anim.png | 256x64 |
| spikes_fill.png | 64x16 |
| spikes_fill_anim.png | 64x64 |
| spring.png | 64x64 |
| spring_anim.png | 256x64 |
| spring_fill.png | 64x16 |
| spring_fill_anim.png | 64x64 |
| stone_floor.png | 64x64 |
| stone_floor_fill.png | 192x16 |
| tall_grass.png | 64x64 |
| tall_grass_fill.png | 64x16 |
| wall.png | 64x64 |
| wall_fill.png | 64x16 |
| wheat.png | 64x64 |
| wheat_fill.png | 128x16 |
| wood_floor.png | 64x64 |
| wood_floor_fill.png | 128x16 |

## Previews

`game/art-src/terrain/preview/`: `all_terrains.png` (every terrain as a patch), `textures.png` (the fill
textures in patches), `props.png`, `props_more.png`, `decals.png`, `props_structures.png` and
`decals_structures.png` (the village / dungeon / fortress props in the open and against a wall, and their decals),
`arenas.png` (a camera-sized view of an arena per theme) and `arena_full.png` (one whole arena). Arenas straight
from the game's generator:
`node game/art-src/terrain/dump_maps.mjs maps.json [theme:seed ...]`, then `arena.py maps.json`.
