# Hatchling (baby) looks

The game shows a creature's hatchling look while it is a hatchling, then its juvenile look (the `_ffN` drawing).
The owner said yes to baby versions of all 18. Each baby must be unmistakably the same creature, younger.

- **Canvas** 64x64 like the juvenile; the baby stands on the bottom row (a floater hovers as the juvenile does).
  **Size:** about 65-70% of the juvenile's visible height (a 58px-tall juvenile -> a 38-42px baby), width to match.
- **Proportions of a young animal:** head about 40-45% of the total height, short limbs, short snout/muzzle/beak,
  rounder chest and belly (still structured forms, never a plain ball), slightly bigger eyes than the juvenile
  but the same eye style (the neon cat keeps green-only slanted slits; glowing eyes stay glowing).
- **Features as babies have them:** stubby or smaller versions of the signature parts, never dropped: shorter
  crest flames, horn nubs, small wings, antler nubs with a leaf, small crystal shards, short gills, short tentacles.
  Every creature keeps what makes it itself (headphones, cable tail with plug, neon lines, crescent, stripes...).
- **Style:** the same detailed Final Fantasy rendering as the juveniles (textures, 5-6 tone ramps, rim light,
  dark outer outline, coloured inner lines). Babies may be a little cuter than juveniles, but not mascot-cute.
- **Palette:** exactly the juvenile's final palette (same letters, same hex).
- **View:** three-quarter, facing right, light from the top left; a pose that fits the juvenile's (a resting stag
  baby can lie down or stand; say which).

Files in the creature's folder: `_hatch1.txt`, `_hatch1.png`, `_build_hatch1.py`, `_palette_hatch1.txt`, and
`_hatch1_compare.png` made with the notes folder's `compare_forms.py JUVENILE.png HATCHLING.png OUT.png`
(juvenile = the final `_ffN.png`): both at the same scale on one ground line, plus real size.

Then cut it: `rig_hatchling.json` (same fields as RIG_GUIDE.md; art `_hatch1.txt`; same name/type/set/plan as
rig.json), checked with `.venv/Scripts/python.exe tools/game_art/beasts.py preview <id> --hatchling`
(-> `_rig_preview_hatchling.png`). Don't run `beasts.py build` (the lead does).
