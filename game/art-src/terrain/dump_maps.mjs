// Dump arenas from the game's own map generator (web/js/game/battlemap.js) in the JSON shape arena.py draws:
//   node game/art-src/terrain/dump_maps.mjs OUT.json [theme:seed ...]
// With no theme:seed list it makes one arena per theme (seed 11).
import { writeFileSync } from "node:fs";
import { generateMap, drawLayers, THEME_IDS } from "../../../web/js/game/battlemap.js";

const [out, ...picks] = process.argv.slice(2);
const wanted = picks.length ? picks.map((p) => p.split(":")) : THEME_IDS.map((t) => [t, "11"]);
const maps = wanted.map(([theme, seed]) => {
  const m = generateMap(Number(seed), { theme });
  const grid = [], layers = [];
  for (let y = 0; y < m.rows; y++) {
    grid.push([]);
    layers.push([]);
    for (let x = 0; x < m.cols; x++) {
      grid[y].push(m.tiles[y * m.cols + x]);
      layers[y].push(drawLayers(m, x, y).map((l) => [l.terrain, l.variant, l.fill]));
    }
  }
  return { theme: m.theme, seed: m.seed, base: m.base, cols: m.cols, rows: m.rows, starts: m.starts, props: m.props, grid, layers };
});
writeFileSync(out, JSON.stringify({ about: "from battlemap.js generateMap + drawLayers", maps }));
console.log(`wrote ${maps.length} maps to ${out}`);
