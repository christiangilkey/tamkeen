// Run with: node --test tests/js/
// The arenas for the live battles: the terrain table, random maps (same seed = same map, always a way
// between the starts, fair to both sides, every terrain used), drawing layers, and finding a way.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROPS, PROP_IDS, TERRAIN, TERRAIN_IDS, THEMES, THEME_IDS, TILE, blocksShot, canEnter, canRepaint, canStand,
  drawLayers, edgeIndex, effectsAt, effectsFor, fairness, fillIndex, findPath, generateMap, terrainArtFiles, terrainAt, tileCenter,
} from "../../web/js/game/battlemap.js";

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 7919 + 13);
const maps = Object.fromEntries(THEME_IDS.map((th) => [th, SEEDS.map((s) => generateMap(s, { theme: th }))]));
const all = Object.values(maps).flat();
const walker = { type: "grove", species: "quad" };

/** A small hand-made map from text rows; `legend` maps each letter to a terrain id (or "p:<prop>"). */
function handMap(rows, legend, base = "grass") {
  const cols = rows[0].length;
  const tiles = [], propTiles = [], props = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const v = legend[ch] || base;
    if (v.startsWith("p:")) {
      tiles.push(base); propTiles.push(v.slice(2));
      props.push({ id: v.slice(2), x, y, w: 1, flip: false });
    } else { tiles.push(v); propTiles.push(null); }
  }));
  return { seed: 1, seedNum: 1, theme: "meadow", cols, rows: rows.length, width: cols * TILE, height: rows.length * TILE, base, light: "day",
    tiles, propTiles, props, starts: { me: tileCenter(0, 0), foe: tileCenter(cols - 1, rows.length - 1) } };
}

/** Tiles an ordinary walker can reach from a start (4 ways, by tile). */
function reach(map, from, creature = walker) {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) {
    const i = todo.pop();
    const x = i % map.cols, y = Math.floor(i / map.cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const j = ny * map.cols + nx;
      const c = tileCenter(nx, ny);
      if (!seen.has(j) && canStand(map, c.x, c.y, creature)) { seen.add(j); todo.push(j); }
    }
  }
  return seen;
}
const tileIndex = (map, p) => Math.floor(p.y / TILE) * map.cols + Math.floor(p.x / TILE);

test("the terrain table: every field filled, the ids other parts use, art names", () => {
  assert.equal(TERRAIN_IDS.length, 22);
  assert.equal(PROP_IDS.length, 12);
  for (const t of Object.values(TERRAIN)) {
    for (const k of ["id", "name", "text", "walk", "cross", "shots", "speed", "grip", "atk", "def", "heal", "burn", "favours", "bonus",
      "status", "fixed", "under", "anim", "art", "likes", "hinders"]) assert.ok(k in t, `${t.id} has ${k}`);
    assert.equal(t.art.edges, `battle/terrain/${t.id}.png`);
    assert.equal(t.art.fill, `battle/terrain/${t.id}_fill.png`);
    assert.ok(t.name && t.text.endsWith("."), t.id);
    if (t.under) assert.ok(TERRAIN[t.under], `${t.id} sits on a real terrain`);
  }
  for (const id of ["spring", "coals", "mud"]) assert.ok(canRepaintable(id), `${id} can be painted by a terrain move`);
  for (const id of ["deep_water", "lava", "wall", "bridge"]) assert.ok(TERRAIN[id].fixed, `${id} is never repainted`);
  assert.deepEqual(TERRAIN.deep_water.cross.sort(), ["floater", "tide"]);
  assert.deepEqual(TERRAIN.lava.cross.sort(), ["ember", "floater"]);
  assert.equal(TERRAIN.wall.shots, false);
  assert.ok(TERRAIN.shallows.likes.includes("tide") && TERRAIN.shallows.hinders.includes("ember"));
  assert.deepEqual(TERRAIN.coals.likes, ["ember"]);
  assert.deepEqual(TERRAIN.grass.likes, []);
  assert.ok(TERRAIN.crystals.likes.includes("spark") && TERRAIN.shadow.likes.includes("dusk"));
  for (const p of Object.values(PROPS)) {
    assert.equal(p.walk, false); assert.equal(p.shots, false);
    assert.equal(p.art, `battle/terrain/prop_${p.id}.png`);
    assert.ok(p.foot === 1 || p.foot === 2);
  }
  const files = terrainArtFiles();
  assert.equal(files.length, 22 * 2 + 12);
  assert.equal(new Set(files).size, files.length);
  for (const [id, th] of Object.entries(THEMES)) {
    assert.ok(th.uses.includes(th.base), `${id}: base ground listed`);
    for (const t of th.uses) assert.ok(TERRAIN[t], `${id}: ${t}`);
    for (const p of th.props) assert.ok(PROPS[p], `${id}: ${p}`);
  }
});
function canRepaintable(id) { const t = TERRAIN[id]; return t.walk && t.shots && !t.fixed; }

test("what a terrain does to one creature: element bonuses, no burn when favoured, floaters hover", () => {
  assert.deepEqual(effectsFor("grass", walker), { speed: 1, grip: 1, atk: 1, def: 1, heal: 0, burn: 0 });
  assert.equal(effectsFor("tall_grass", { type: "ember" }).speed, 0.85);
  assert.equal(effectsFor("tall_grass", { type: "grove" }).speed, 1, "grove moves freely in tall grass");
  assert.equal(effectsFor("tall_grass", { type: "grove" }).def, 1.2);
  const coalsEmber = effectsFor("coals", { type: "ember" });
  assert.equal(coalsEmber.burn, 0); assert.equal(coalsEmber.atk, 1.2);
  assert.ok(effectsFor("coals", { type: "tide" }).burn > 0);
  assert.equal(effectsFor("shallows", { type: "ember" }).atk, 0.85);
  assert.ok(Math.abs(effectsFor("shallows", { type: "tide" }).atk - 1.15) < 1e-9);
  assert.equal(effectsFor("spring", { type: "tide" }).heal, 0.03);
  assert.equal(effectsFor("mud", { type: "spark", species: "floater" }).speed, 1, "floaters aren't slowed by the ground");
  assert.equal(effectsFor("ice", { type: "spark", species: "floater" }).grip, 1, "nor do they slide");
  assert.equal(effectsFor("ice", { type: "spark" }).grip, 0.15);
  assert.ok(effectsFor("lava", { type: "tide", species: "floater" }).burn > 0, "lava still burns a floater");
  assert.equal(effectsFor("high", { type: "stone" }).def, 1.15);
  assert.ok(canEnter("deep_water", { type: "tide" }) && canEnter("deep_water", { type: "ember", species: "floater" }));
  assert.ok(!canEnter("deep_water", walker) && !canEnter("lava", { type: "tide" }));
  assert.ok(canEnter("lava", { type: "ember" }));
  assert.ok(!canEnter("wall", { type: "tide", species: "floater" }), "nobody crosses a wall");
});

test("the same seed always makes the same map; other seeds make other maps", () => {
  for (const th of THEME_IDS) {
    assert.deepEqual(generateMap(42, { theme: th }), generateMap(42, { theme: th }), th);
    const looks = new Set(maps[th].map((m) => m.tiles.join(",")));
    assert.equal(looks.size, SEEDS.length, `${th}: every seed different`);
  }
  assert.deepEqual(generateMap("friend-battle-17"), generateMap("friend-battle-17"), "string seeds too");
  const picked = new Set(SEEDS.map((s) => generateMap(s).theme));
  assert.ok(picked.size >= 5, "with no theme given, seeds pick many themes");
  for (const m of all) {
    assert.equal(m.cols, 30); assert.equal(m.rows, 18);
    assert.equal(m.tiles.length, 540); assert.equal(m.propTiles.length, 540);
    assert.equal(m.width, 480); assert.equal(m.height, 288);
  }
  const big = generateMap(5, { theme: "forest", cols: 40, rows: 24 });
  assert.equal(big.tiles.length, 960);
});

test("there is always a walkable way between the two starts", () => {
  for (const m of all) {
    const from = tileIndex(m, m.starts.me), to = tileIndex(m, m.starts.foe);
    assert.ok(m.starts.me.x < m.starts.foe.x, "the player starts on the left");
    assert.ok(reach(m, from).has(to), `${m.theme} ${m.seed}: start to start`);
    const path = findPath(m, m.starts.me, m.starts.foe, walker);
    assert.ok(path && path.length, `${m.theme} ${m.seed}: findPath`);
    assert.deepEqual(path[path.length - 1], m.starts.foe);
    for (const p of path) assert.ok(canStand(m, p.x, p.y, walker));
  }
});

test("fair to both sides: the same ground around each start, halves alike, the arena shared evenly", () => {
  for (const m of all) {
    const around = (p) => {
      const counts = {};
      const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
      for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
        if (Math.hypot(x - cx, y - cy) > 5) continue;
        const i = y * m.cols + x;
        counts[m.tiles[i]] = (counts[m.tiles[i]] || 0) + 1;
        if (m.propTiles[i]) counts["prop " + m.propTiles[i]] = (counts["prop " + m.propTiles[i]] || 0) + 1;
      }
      return counts;
    };
    assert.deepEqual(around(m.starts.me), around(m.starts.foe), `${m.theme} ${m.seed}: start areas`);
    for (const s of [m.starts.me, m.starts.foe]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.hypot(dx, dy) > 2.5) continue; // the promise: 2.5 tiles round each start
        const x = s.x + dx * TILE, y = s.y + dy * TILE;
        if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
        const t = terrainAt(m, x, y);
        assert.ok(canStand(m, x, y, walker) && t.burn === 0, `${m.theme} ${m.seed}: clear and safe around the start`);
      }
    }
    const f = fairness(m);
    assert.ok(f.ok, `${m.theme} ${m.seed}: ${JSON.stringify(f.worst)} share ${f.share}`);
  }
});

test("every terrain and prop is used by some theme, and each theme keeps to its own list", () => {
  const seenT = new Set(), seenP = new Set();
  for (const [th, list] of Object.entries(maps)) {
    const mineT = new Set(list.flatMap((m) => m.tiles));
    const mineP = new Set(list.flatMap((m) => m.props.map((p) => p.id)));
    for (const t of mineT) { assert.ok(THEMES[th].uses.includes(t), `${th} uses ${t}`); seenT.add(t); }
    for (const p of mineP) { assert.ok(THEMES[th].props.includes(p), `${th} has ${p}`); seenP.add(p); }
    for (const t of THEMES[th].uses) assert.ok(mineT.has(t), `${th}: ${t} shows up in ${SEEDS.length} maps`);
    for (const p of THEMES[th].props) assert.ok(mineP.has(p), `${th}: ${p} shows up`);
  }
  assert.deepEqual([...seenT].sort(), [...TERRAIN_IDS].sort());
  assert.deepEqual([...seenP].sort(), [...PROP_IDS].sort());
});

test("maps look natural: terrain comes in patches, props stand on their footprint, nothing is left half-placed", () => {
  for (const m of all) {
    let lone = 0, other = 0;
    for (let i = 0; i < m.tiles.length; i++) {
      if (m.tiles[i] === m.base) continue;
      other++;
      const x = i % m.cols, y = Math.floor(i / m.cols);
      const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < m.cols && ny < m.rows && m.tiles[ny * m.cols + nx] === m.tiles[i];
      });
      if (!same) lone++;
    }
    assert.ok(lone <= other * 0.15, `${m.theme} ${m.seed}: ${lone} lone tiles of ${other}`);
    assert.ok(other >= m.tiles.length * 0.15, `${m.theme} ${m.seed}: something besides the base ground`);
    const blocked = m.propTiles.filter(Boolean).length;
    assert.equal(blocked, m.props.reduce((s, p) => s + p.w, 0), "propTiles match the props list");
    for (const p of m.props) {
      assert.equal(p.w, PROPS[p.id].foot);
      for (let k = 0; k < p.w; k++) assert.equal(m.propTiles[p.y * m.cols + p.x + k], p.id);
      assert.ok(TERRAIN[m.tiles[p.y * m.cols + p.x]].walk, "props stand on walkable ground");
    }
    for (let i = 1; i < m.props.length; i++) assert.ok(m.props[i - 1].y <= m.props[i].y, "props come sorted by y (draw order)");
  }
});

test("drawing: base ground first, deep water on shallows, edge bits N1 E2 S4 W8, bridges join the banks", () => {
  const m = handMap([
    "gggggg",
    "gsssgg",
    "gsdsgg",
    "gsssgg",
    "ggggww",
    "gbbsgw",
  ], { g: "grass", s: "shallows", d: "deep_water", b: "bridge", w: "wall" });
  assert.deepEqual(drawLayers(m, 0, 0).map((l) => [l.terrain, l.variant]), [["grass", 15]]);
  const pond = drawLayers(m, 2, 2);
  assert.deepEqual(pond.map((l) => l.terrain), ["grass", "shallows", "deep_water"]);
  assert.equal(pond[1].variant, 15, "the shallows under the deep water join all round");
  assert.equal(pond[2].variant, 0, "the deep water stands alone");
  assert.equal(edgeIndex(m, 1, 1), 2 | 4, "top-left of the pond: shallows to the east and south");
  assert.equal(edgeIndex(m, 2, 1), 2 | 4 | 8, "shallows count deep water as their own");
  assert.equal(edgeIndex(m, 4, 4) & 2, 2, "wall joins wall to the east");
  assert.equal(edgeIndex(m, 5, 4) & 2, 2, "outside the map counts as the same");
  const bridge = drawLayers(m, 1, 5);
  assert.deepEqual(bridge.map((l) => l.terrain), ["grass", "shallows", "deep_water", "bridge"]);
  assert.equal(edgeIndex(m, 1, 5), 2 | 4 | 8, "a bridge joins the next bridge tile and the dry ground at its end (and the map's edge)");
  assert.equal(edgeIndex(m, 2, 5), 4 | 8, "...but not the shallow water at its other end, nor the grass beside it");
  m.under = m.tiles.map((t, i) => (i === 5 * 6 + 2 ? ["shallows"] : null));
  assert.deepEqual(drawLayers(m, 2, 5).map((l) => l.terrain), ["grass", "shallows", "bridge"], "a bridge over the bank sits on shallow water");
  assert.deepEqual(drawLayers(m, 1, 5).map((l) => l.terrain), ["grass", "shallows", "deep_water", "bridge"]);
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
    for (const l of drawLayers(m, x, y)) { assert.ok(l.fill >= 0 && l.fill <= 3); assert.ok(l.variant >= 0 && l.variant <= 15); }
  }
  assert.equal(fillIndex(m, 3, 3, "grass"), fillIndex(m, 3, 3, "grass"), "a tile's fill never changes");
  const fills = new Set(); for (let x = 0; x < 30; x++) fills.add(fillIndex(m, x, 0, "grass"));
  assert.equal(fills.size, 4, "all four fill tiles get used");
});

test("bridges run on over the shallow bank to dry ground, and mostly draw as straight runs", () => {
  let overBank = 0, straight = 0, total = 0;
  for (const m of [...maps.meadow, ...maps.forest, ...maps.night]) {
    for (let i = 0; i < m.tiles.length; i++) {
      if (m.tiles[i] !== "bridge") continue;
      const x = i % m.cols, y = Math.floor(i / m.cols);
      const layers = drawLayers(m, x, y).map((l) => l.terrain);
      if (m.under[i]) { overBank++; assert.deepEqual(m.under[i], ["shallows"]); assert.deepEqual(layers, [m.base, "shallows", "bridge"]); }
      else assert.deepEqual(layers, [m.base, "shallows", "deep_water", "bridge"]);
      const v = edgeIndex(m, x, y);
      total++;
      if (v === 10 || v === 5) straight++;
    }
  }
  assert.ok(overBank > 0, "some bridges cross a bank");
  assert.ok(straight >= total * 0.85, `${straight} of ${total} bridge tiles are straight runs`);
});

test("a patch painted over another ground keeps it beneath: flowers on the oasis grass, not on the sand", () => {
  const seen = {};
  for (const m of all) {
    for (let i = 0; i < m.tiles.length; i++) {
      const x = i % m.cols, y = Math.floor(i / m.cols);
      const layers = drawLayers(m, x, y).map((l) => l.terrain);
      assert.equal(layers[0], m.base, "the base ground is always at the bottom");
      assert.equal(layers[layers.length - 1], m.tiles[i], "the tile's own terrain is always on top");
      assert.equal(new Set(layers).size, layers.length, "no layer twice");
      assert.ok(layers.length <= 4);
      for (const u of m.under[i] || []) assert.ok(TERRAIN[u] && TERRAIN[u].walk && u !== m.base, `${m.theme} ${m.seed}: ${u} beneath`);
      const key = layers.join(">");
      seen[key] = (seen[key] || 0) + 1;
    }
  }
  for (const stack of ["sand>grass>flowers", "sand>grass>tall_grass", "cave_floor>shadow>crystals", "grass>tall_grass>dirt"]) {
    assert.ok(seen[stack] > 0, `${stack} happens`);
  }
  assert.ok(!seen["sand>flowers"] || seen["sand>flowers"] < seen["sand>grass>flowers"] / 4, "desert flowers grow on the grass");
});

test("reading a map at a point: terrain, effects, standing, shots, repainting", () => {
  const m = handMap([
    "gtdc",
    "gBwl",
  ], { g: "grass", t: "tall_grass", d: "deep_water", c: "coals", B: "p:boulder", w: "wall", l: "lava" });
  assert.equal(terrainAt(m, 20, 5).id, "tall_grass");
  assert.equal(terrainAt(m, 15.9, 15.9).id, "grass");
  assert.equal(terrainAt(m, -1, 5), null);
  assert.equal(terrainAt(m, 64, 0), null);
  assert.equal(effectsAt(m, 20, 5, { type: "ember" }).def, 1.2);
  assert.ok(canStand(m, 8, 8, walker));
  assert.ok(!canStand(m, 40, 8, walker) && canStand(m, 40, 8, { type: "tide" }));
  assert.ok(!canStand(m, 24, 24, { type: "tide", species: "floater" }), "nobody stands on a boulder");
  assert.ok(canStand(m, 56, 24, { type: "ember" }) && !canStand(m, 56, 24, walker));
  assert.ok(blocksShot(m, 24, 24) && blocksShot(m, 40, 24) && !blocksShot(m, 40, 8) && !blocksShot(m, 56, 24));
  assert.ok(blocksShot(m, -5, 5), "outside the map");
  assert.ok(canRepaint(m, 0, 0) && canRepaint(m, 1, 0) && canRepaint(m, 3, 0));
  assert.ok(!canRepaint(m, 2, 0) && !canRepaint(m, 1, 1) && !canRepaint(m, 2, 1) && !canRepaint(m, 3, 1));
});

test("finding a way: around walls, through gaps, round slow mud, and to the nearest spot it can reach", () => {
  const m = handMap([
    "gggwgggg",
    "gggwgggg",
    "gggggggg",
    "gggwgggg",
    "gggwwwww",
    "gggwgggg",
  ], { g: "grass", w: "wall" });
  const path = findPath(m, tileCenter(0, 0), tileCenter(6, 0), walker);
  assert.ok(path.length >= 2, "it can't go straight through the wall");
  const pts = [tileCenter(0, 0), ...path];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    for (let s = 0; s <= 20; s++) {
      const x = a.x + ((b.x - a.x) * s) / 20, y = a.y + ((b.y - a.y) * s) / 20;
      assert.ok(canStand(m, x, y, walker), `point ${x},${y} on the way is walkable`);
    }
  }
  assert.deepEqual(path[path.length - 1], tileCenter(6, 0));
  assert.deepEqual(findPath(m, { x: 20, y: 20 }, { x: 20, y: 20 }, walker), []);
  const boxed = findPath(m, tileCenter(0, 0), tileCenter(6, 5), walker);
  assert.ok(boxed.length, "the walled-in corner can't be reached...");
  const end = boxed[boxed.length - 1];
  assert.ok(Math.floor(end.y / TILE) <= 3, "...so it goes to the nearest reachable spot");
  const tide = findPath(m, tileCenter(0, 0), { x: 7 * 16 + 3, y: 2 * 16 + 9 }, walker);
  assert.deepEqual(tide[tide.length - 1], { x: 115, y: 41 }, "it ends on the exact point clicked");
  const muddy = handMap([
    "gggggg",
    "gmmmmg",
    "gmmmmg",
  ], { g: "grass", m: "mud" });
  const way = findPath(muddy, tileCenter(0, 1), tileCenter(5, 1), walker);
  assert.ok(way.every((p) => terrainAt(muddy, p.x, p.y).id !== "mud" || p === way[way.length - 1]), "it goes round the mud");
  assert.ok(findPath(muddy, tileCenter(0, 1), tileCenter(5, 1), { type: "spark", species: "floater" }).length <= 2,
    "a floater isn't slowed by mud, so it goes straight");
});
