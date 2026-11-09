"""Write web/game-art/battle/terrain/README.md from the files actually built (sizes read from the PNGs).

    .venv/Scripts/python game/art-src/terrain/readme.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from decals import DECALS_K  # noqa: E402
from terrain import OUT, TERRAINS  # noqa: E402

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
}
GROUP_NAMES = {
    "grass": "plain, lush, dry, flowery", "sand": "plain, dunes, grit", "snow": "plain, wind-swept, drifts",
    "cave_floor": "plain, rubble, damp", "high": "plain, mossy, cracked", "ash": "plain, cinders, crust",
    "dirt": "plain, stony", "wood_floor": "plain (a knot, nails), aged (worn, darker, cracked planks)",
    "stone_floor": "plain (a darker, paler or chipped slab), worn (crack, stain), damp (moss, puddle, a drain in tile 10)",
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
    w("props_more.py, decals.py); one layered Aseprite source per PNG in `game/art-src/terrain/aseprite/`, same name.")
    w("Rebuild: `.venv/Scripts/python game/art-src/terrain/terrain.py build --aseprite`, then `readme.py` (this file).")
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
