// Dump arenas from the game's own map generator (web/js/game/battlemap.js) for arena.py: per tile its layers,
// per dual-grid cell what drawCorners() says to draw, the props and the decals.
//   node game/art-src/terrain/dump_maps.mjs OUT.json [theme:seed ...]
// With no theme:seed list it makes one arena per theme (seed 11).
import { writeFileSync } from "node:fs";
import { generateMap, drawLayers, drawCorners, THEME_IDS } from "../../../web/js/game/battlemap.js";

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
  // exactly what the game draws: the dual-grid cells (cx 0..cols, cy 0..rows) and the decals
  const corners = [];
  for (let cy = 0; cy <= m.rows; cy++) {
    corners.push([]);
    for (let cx = 0; cx <= m.cols; cx++) corners[cy].push(drawCorners(m, cx, cy).map((l) => [l.terrain, l.mask, l.fill]));
  }
  return { theme: m.theme, seed: m.seed, base: m.base, cols: m.cols, rows: m.rows, starts: m.starts, props: m.props,
           decals: m.decals || [], grid, layers, corners };
});
writeFileSync(out, JSON.stringify({ about: "from battlemap.js generateMap + drawLayers", maps }));
console.log(`wrote ${maps.length} maps to ${out}`);
