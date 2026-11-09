"""Write web/game-art/battle/terrain/README.md from the files actually built (sizes read from the PNGs).

    .venv/Scripts/python game/art-src/terrain/readme.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from decals import DECALS_K  # noqa: E402
from terrain import OUT, all_terrains  # noqa: E402

TERRAINS = all_terrains()  # (with the ones drawn in the EXTRA recipe files)

# kind, footprint (tiles), themes — what the Map needs to place each prop
PROP_INFO = {
    "boulder": ("boulder", 1, "most themes"), "rock_big": ("rock_big", 2, "most themes"),
    "tree": ("tree", 2, "meadow, forest, night"), "pine": ("pine", 2, "forest, snow"), "palm": ("palm", 2, "shore, desert"),
    "bush": ("bush", 1, "meadow, forest, ruins, night"), "cactus": ("cactus", 1, "desert"), "crystal": ("crystal", 1, "cave"),
    "stalagmite": ("stalagmite", 1, "cave"), "pillar": ("pillar", 1, "ruins"), "obsidian": ("obsidian", 1, "volcanic"),
    "mushroom": ("mushroom", 1, "forest, night"),
    "tree_birch": ("tree", 1, "meadow, forest, ruins, night"), "tree_autumn": ("tree", 2, "forest, meadow, ruins"),
    "tree_fruit": ("tree", 2, "meadow"), "tree_willow": ("tree", 2, "meadow, night (by water)"),
    "tree_dead": ("tree", 1, "meadow, ruins, night, desert"), "tree_charred": ("tree", 1, "volcanic"),
    "tree_bare_snowy": ("tree", 2, "snow"), "mushroom_giant": ("mushroom", 2, "forest, night"),
    "pine_snowy": ("pine", 2, "snow"), "palm_small": ("palm", 1, "shore, desert"), "palm_date": ("palm", 2, "desert"),
    "boulder_mossy": ("boulder", 1, "meadow, forest, ruins, night"), "boulder_ice": ("boulder", 1, "snow"),
    "rock_big_flat": ("rock_big", 2, "meadow, shore, desert, ruins, snow"),
    "rock_big_cracked": ("rock_big", 2, "volcanic, desert, meadow"),
    "rock_big_cluster": ("rock_big", 2, "every theme"), "rock_big_sandstone": ("rock_big", 2, "desert, shore"),
    "rock_big_ice": ("rock_big", 2, "snow"), "crystal_cluster": ("crystal", 1, "cave"), "crystal_pink": ("crystal", 1, "cave"),
    "obsidian_big": ("obsidian", 2, "volcanic"), "bush_flower": ("bush", 1, "meadow, forest, ruins, night"),
    "bush_dry": ("bush", 1, "desert, shore"), "cactus_round": ("cactus", 1, "desert"), "pillar_fallen": ("pillar", 2, "ruins"),
    "barrel": ("barrel", 1, "village, fortress, dungeon"), "crate": ("crate", 1, "village, fortress, dungeon"),
    "well": ("well", 2, "village"), "brazier": ("brazier", 1, "dungeon, fortress"), "haystack": ("haystack", 2, "village"),
    "statue": ("statue", 1, "fortress, dungeon"), "cart": ("cart", 2, "village"), "banner": ("banner", 1, "fortress, village"),
    # the village (village_props.py)
    "stall": ("stall", 2, "village (the market)"), "stall_cloth": ("stall", 2, "village"), "stall_bread": ("stall", 2, "village"),
    "vendor_cart": ("vendor_cart", 2, "village"), "vendor_cart_flowers": ("vendor_cart", 2, "village"),
    "scarecrow": ("scarecrow", 1, "village (in the fields)"), "sign_tavern": ("sign", 1, "village (by the tavern door)"),
    "sign_bakery": ("sign", 1, "village (a shop)"), "sign_potion": ("sign", 1, "village (a shop)"), "sign_smith": ("sign", 1, "village (a shop)"),
    "lamp_post": ("lamp_post", 1, "village (the square)"), "bench": ("bench", 2, "village (the square, the Town Hall)"),
    "table": ("table", 2, "village (tavern, houses)"), "counter": ("counter", 3, "village (tavern, shops)"),
    "shelf": ("shelf", 2, "village (against a wall)"), "shelf_books": ("shelf", 2, "village (the Town Hall, against a wall)"),
    "sacks": ("sacks", 1, "village (bakery, barn)"), "anvil": ("anvil", 1, "village (smithy)"), "desk": ("desk", 2, "village (the Town Hall)"),
    # the dungeon (dungeon_art.py) and the fortress (fortress_art.py)
    "chest": ("chest", 1, "dungeon (hidden rooms)"), "cage": ("cage", 1, "dungeon"), "statue_gargoyle": ("statue", 1, "dungeon"),
    "statue_knight": ("statue", 1, "dungeon, fortress"), "weapon_rack": ("weapon_rack", 2, "fortress (towers)"),
    "weapon_rack_axes": ("weapon_rack", 2, "fortress (towers)"), "armor_stand": ("armor_stand", 1, "fortress (towers)"),
    "armor_stand_gold": ("armor_stand", 1, "fortress (the keep)"), "throne": ("throne", 2, "fortress (the keep)"),
    # more trees (trees_art.py)
    "tree_tall": ("tree", 2, "meadow, forest, fortress"), "tree_poplar": ("tree", 1, "meadow, village"),
    "tree_round": ("tree", 2, "meadow, forest, village, fortress"), "tree_twisted": ("tree", 2, "meadow, forest, ruins, night"),
    "tree_dead_tall": ("tree", 2, "forest, ruins, night"), "tree_dead_broken": ("tree", 1, "meadow, ruins, night, desert"),
    "pine_tall": ("pine", 2, "forest, snow"), "pine_dead": ("pine", 2, "forest, snow"),
    "log_fallen": ("log", 3, "meadow, forest, ruins"), "log_mossy": ("log", 3, "meadow, forest, ruins"),
    "stump": ("stump", 1, "meadow, forest, night, village"), "stump_big": ("stump", 2, "meadow, forest"),
    "stump_axe": ("stump", 1, "village"), "stump_mossy": ("stump", 1, "meadow, forest, night"),
}
DECAL_INFO = {
    "pebbles": ("grass, dirt, sand, cave_floor, ash, high, snow, cobbles", "every theme"),
    "twigs": ("grass, forest_floor, dirt", "meadow, forest, night, ruins"),
    "leaves": ("forest_floor, grass", "forest, meadow, night"),
    "tuft": ("grass, dirt, sand next to grass", "meadow, forest, ruins, night, shore, desert"),
    "flowers": ("grass", "meadow, forest, night, ruins, desert (oasis)"),
    "bones": ("sand, ash, dirt", "desert, volcanic, ruins"),
    "shells": ("sand near water", "shore"),
    "seaweed": ("sand near water", "shore"),
    "puddle": ("grass, dirt, mud, cave_floor, cobbles", "meadow, forest, night, ruins, cave"),
    "crack": ("sand, dirt, ash, high, cave_floor, cobbles", "desert, volcanic, ruins, cave"),
    "mushrooms": ("forest_floor, grass, shadow, cave_floor", "forest, night, cave (cell 2 glows: night, cave)"),
    "snowdrift": ("snow", "snow"),
    "cinders": ("ash", "volcanic"),
    "straw": ("wood_floor, dirt, stone_floor, cobbles", "village, fortress"),
    "rug": ("wood_floor", "village"),
    "cobweb": ("stone_floor, cave_floor", "dungeon (cells 0, 1: top-left / top-right corner, against a wall)"),
    "rubble": ("stone_floor, cobbles, dirt, cave_floor", "dungeon, fortress"),
    "coins": ("stone_floor", "dungeon (laid in the hidden rooms only)"),
}
GROUP_NAMES = {
    "grass": "plain, lush, dry, flowery", "sand": "plain, dunes, grit", "snow": "plain, wind-swept, drifts",
    "cave_floor": "plain, rubble, damp", "high": "plain, mossy, cracked", "ash": "plain, cinders, crust",
    "dirt": "plain, stony", "wood_floor": "plain (a knot, nails), aged (worn, darker, cracked planks)",
    "stone_floor": "plain (a darker, paler or chipped slab), worn (crack, stain), damp (moss, puddle, a drain in tile 10)",
    "farmland": "seedlings in rows, cabbages and lettuces (the edge tiles are bare tilled soil)",
    "wheat": "golden ripe, greener with poppies",
}


def size(name):
    im = Image.open(OUT / name)
    return f"{im.width}x{im.height}"


def main():
    L = []
    w = L.append
    w("# Battle terrain art")
    w("")
    w("Tiles, props and decals for the live battles' arenas (the terrain table, themes and placement are the Map")
    w("chat's, in `web/js/game/battlemap.js`). All pixel art, light from the top left, seen from the creatures'")
    w("three-quarter angle. Made by the scripts in `game/art-src/terrain/` (terrain.py, corners.py, props.py,")
    w("props_more.py, decals.py, and the EXTRA files village_ground.py, village_props.py, dungeon_art.py, fortress_art.py,")
    w("trees_art.py); one layered Aseprite source per PNG in `game/art-src/terrain/aseprite/`, same name.")
    w("Rebuild: `.venv/Scripts/python game/art-src/terrain/terrain.py build --aseprite`, then `readme.py` (this file); one file")
    w("at a time: `terrain.py build <terrain id | prop_<name> | decal_<id> | sprite name ...> --aseprite` (`props`, `decals`: all of them).")
    w("")
    w("## How the ground is drawn: the dual grid")
    w("")
    w("The map's 16x16 tiles say which ground a creature stands on. The art is drawn on cells **offset by half a")
    w("tile**, so outlines don't follow the tile grid: drawn cell (cx, cy), cx 0..cols, cy 0..rows, covers world")
    w("px x cx·16−8 … cx·16+8 (same for y), and its four corners are the centres of tiles (cx−1, cy−1),")
    w("(cx, cy−1), (cx−1, cy), (cx, cy). `drawCorners(map, cx, cy)` (battlemap.js) gives the layers to draw there,")
    w("bottom to top, as `{ terrain, mask, fill }`:")
    w("")
    w("- `mask` 1-14: draw tile `mask` of `<terrain>.png` (column `mask % 4`, row `floor(mask / 4)`); the mask is which")
    w("  of the cell's corners are that terrain: north-west 1, north-east 2, south-west 4, south-east 8.")
    w("- `mask` 15: draw tile `fill` of `<terrain>_fill.png` instead (for animated terrains: see below).")
    w("- Tile 0 of every sheet is empty (never drawn).")
    w("")
    w("Most terrains have smooth outlines (a lone tile draws as a round patch, a diagonal row of tiles as a")
    w("diagonal shore); the built ones (`wall`, `fort_wall`, `dungeon_wall`, `house_wall`, `wood_floor`, `stone_floor`,")
    w("`bridge`, `bridge_v`) keep square, tile-shaped ones. Draw with normal alpha")
    w("blending: edge tiles hold see-through shadow pixels, and `shadow` (fills too) is a see-through dark veil on")
    w("purpose, darkening whatever ground is under it. A bridge tile is `bridge` when its deck runs east-west,")
    w("`bridge_v` when it runs north-south.")
    w("")
    w("## Structures (village, dungeon, fortress)")
    w("")
    w("- Walls `fort_wall` (face 11 px), `dungeon_wall` (9), `house_wall` (10): a top (the fill tiles), a south face,")
    w("  a dark outline and a shadow. Part of the face is drawn in the wall tile's south half, the rest **hangs over")
    w("  the top of the tile to the south** (3, 1 and 2 px), so a 1-tile wall reads as high; creatures in that tile are")
    w("  drawn over it, as they stand in front. North-south runs show their top only, with the face at the south end.")
    w("  The outline sits on the wall tile's own edge pixel, so nothing shows between a wall and a floor beside it")
    w("  (the floor needn't run under the wall). Draw floors before walls, the fence after them.")
    w("- `fence` is a line, not an area: a post at the centre of every fence tile, rails to each fence tile beside it")
    w("  (north, south, east or west; diagonal neighbours get no rail). Its fill tiles are see-through too.")
    w("- `wood_floor`, `stone_floor`: level, square-edged, a thin dark seam where they meet other ground.")
    w("- `hall_wall` (the Town Hall's cream stone, face 10 px: 8 in the tile, 2 over the tile in front) is built like")
    w("  `house_wall`. `carpet`: a red runner with gold trim along its outline, on stone or wooden floor.")
    w("- `fountain`: the village fountain's basin, a block of 4x4 (2x2 on a small map) in the square: a low pale stone rim")
    w("  round clear water; animated. `farmland`, `wheat`: square-edged fields (fenced by the Map).")
    w("- `spikes`: an iron plate with holes. It has 4 frames, but they are **not** a loop: the game picks the frame from")
    w("  the battle's clock (livebattle.js `spikeFrame`): 0 down, 1 rising, 2 up (when they hurt), 3 going down.")
    w("- `cracked_wall`: a `dungeon_wall` with a crack, a hidden room's weak spot; broken open it becomes `stone_floor`")
    w("  with `decal_rubble`.")
    w("")
    w("## Roofs")
    w("")
    w("Every village building, the fortress keep and its towers have a roof, drawn over the building's footprint")
    w("(walls included) and sorted with props and creatures by the footprint's bottom edge; the game fades it out")
    w("while a creature is inside, and draws a shadow of it 3 px down and right (the roof's outline in the shadow")
    w("colour). `map.roofs`: { x0, y0, w, h, style, extras } in tiles (battlemap.js ROOFS, ROOF_EXTRAS).")
    w("")
    w("- `roof_<style>.png` (48x80; thatch, red, slate, shingle): 16x16 pieces, 3 columns (left end, middle, right end) by")
    w("  5 rows (back eave, back slope, ridge, front slope, front eave). A roof w x h tiles is (w·16 + 6) x h·16 px, drawn")
    w("  at (x0·16 − 3, y0·16 − 10): 3 px eaves, raised 10 px, so the south wall's face shows below it. Rows: back eave,")
    w("  `a` back slopes, ridge, `b` front slopes, front eave, with a = floor((h − 3)·0.4), b = h − 3 − a; columns: the")
    w("  left end, middles repeated (the last one cut), the right end. (village_ground.py `compose_roof` does the same.)")
    w("- `roof_tower.png` (150x176): one picture for a 9x9 tower, its bottom edge at (y0 + 9)·16 − 10, centred on it.")
    w("- Extras, centred at x tiles from the roof's left, their bottom edge `sit` px below the top of the ridge row:")
    w("  `roof_chimney.png` (16x32, sit 7: on the back slope), `roof_bell.png` (32x48, sit 16: the Town Hall's bell tower,")
    w("  astride the ridge), `roof_keep_flag.png` (16x32, sit 8; its pole is 4 px left of its middle).")
    w("")
    w("## Ornaments and traps")
    w("")
    w("Pictures that block nothing (`map.ornaments`: id, v = variant, x, y = the cell's top-left in world px).")
    w("")
    w("- On walls (the cell's top-left at the wall tile's top-left, 16x32: the wall tile, then the floor in front;")
    w("  drawn after the ground): `ornament_chains.png` (3 variants), `ornament_torch.png` (4 frames),")
    w("  `ornament_weapons.png` (3 variants: swords and shield, crossed axes, spear and kite shield; fort or hall wall).")
    w("- Standing (sorted by its bottom edge): `ornament_fountain.png` (4 frames of 32x48), its bottom centre on the")
    w("  fountain basin's centre.")
    w("- `hazard_axe.png`: 9 frames of 96x64, a pendulum blade swinging over a corridor; frame k at (k − 4)·15 degrees,")
    w("  the pivot at (48, 4) in every frame, the blade's lowest point at (48, 58), which the game puts on the floor point")
    w("  under the pivot (`map.hazards`). The game draws its moving floor shadow.")
    w("")
    w("## Fill textures (groups)")
    w("")
    w("Some grounds have several textures, in groups of 4 tiles along `<id>_fill.png`: tiles 0-3 the plain one,")
    w("4-7 the second, and so on. All share the same colour at their edges, so patches of different textures meet")
    w("without a seam; the Map picks the group by a slow noise (whole patches) and the tile in it by a hash.")
    w("")
    w("| terrain | groups | textures |")
    w("|---|---|---|")
    for tid, t in TERRAINS.items():
        if t.groups > 1:
            w(f"| {tid} | {t.groups} | {GROUP_NAMES.get(tid, '')} |")
    w("")
    w("Every other terrain has 1 group (4 tiles).")
    w("")
    w("## Animated terrains")
    w("")
    anims = [tid for tid, t in TERRAINS.items() if t.frames > 1]
    w(f"{', '.join('`' + a + '`' for a in anims)} have 4 frames (about 5 a second; every cell shows the same frame")
    w("at the same time, which keeps them seamless).")
    w("")
    w("- `<terrain>_anim.png` (256x64): the corner sheet for each frame side by side; frame f's sheet starts at x = 64·f.")
    w("- `<terrain>_fill_anim.png` (64x64): the 4 fill tiles animated: row = `fill` (0-3), column = frame.")
    w("- `<terrain>.png` / `<terrain>_fill.png`: frame 0 of the sheet / the 4 frames of fill tile 0 (the simple option).")
    w("")
    w("## Props")
    w("")
    w("Obstacles, drawn standing on the bottom edge of their footprint and centred on it (footprint = tiles wide, one")
    w("row). Each image includes its soft ground shadow. Use the image's own size: tall ones overlap the tiles behind")
    w("them, so sort props and creatures by their bottom edge. May be drawn mirrored. `kind` is the family the Map")
    w("treats it as.")
    w("")
    w("| file | size | footprint | kind | themes |")
    w("|---|---|---|---|---|")
    for pid, (kind, fp, themes) in PROP_INFO.items():
        w(f"| prop_{pid}.png | {size(f'prop_{pid}.png')} | {fp} | {kind} | {themes} |")
    w("")
    w("## Decals")
    w("")
    w("Small things lying on the ground that never block anything. Each file is a strip of 16x16 cells, one variant per")
    w("cell; the Map scatters them in clusters at any pixel position (`map.decals`: id, v = cell, x, y = the cell's")
    w("top-left in world px, flip). Draw them after the ground and before props and creatures, not sorted by y.")
    w("Nothing on water, bridges, walls or under props.")
    w("")
    w("| file | size | cells | lies on | themes |")
    w("|---|---|---|---|---|")
    for n, (k, f) in DECALS_K.items():
        on, themes = DECAL_INFO[n]
        w(f"| decal_{n}.png | {size(f'decal_{n}.png')} | {k} | {on} | {themes} |")
    from terrain import extra_modules
    for m in extra_modules():
        for name in getattr(m, "DECALS", {}):
            n = name[len("decal_"):]
            on, themes = DECAL_INFO[n]
            im = Image.open(OUT / f"{name}.png")
            w(f"| {name}.png | {im.width}x{im.height} | {im.width // 16} | {on} | {themes} |")
    w("")
    w("## Every file")
    w("")
    files = sorted(p.name for p in OUT.glob("*.png"))
    w(f"{len(files)} files:")
    w("")
    w("| file | size |")
    w("|---|---|")
    for f in files:
        w(f"| {f} | {size(f)} |")
    w("")
    w("## Previews")
    w("")
    w("`game/art-src/terrain/preview/`: `all_terrains.png` (every terrain as a patch), `textures.png` (the fill")
    w("textures in patches), `props.png`, `props_more.png`, `decals.png`, `props_structures.png` and")
    w("`decals_structures.png` (the village / dungeon / fortress props in the open and against a wall, and their decals),")
    w("`arenas.png` (a camera-sized view of an arena per theme) and `arena_full.png` (one whole arena). Arenas straight")
    w("from the game's generator:")
    w("`node game/art-src/terrain/dump_maps.mjs maps.json [theme:seed ...]`, then `arena.py maps.json`.")
    (OUT / "README.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    print("README.md:", len(files), "files")


if __name__ == "__main__":
    main()
