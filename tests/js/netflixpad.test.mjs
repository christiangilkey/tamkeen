// A game controller on Netflix's pages (web/js/netflix-pad.js): it reads controllers as padmap.js
// does, moves its highlight the right way, and is loaded where Netflix's pages are shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { isController, readInputs, standardize } from "../../web/js/padmap.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const SRC = read("web/js/netflix-pad.js");

/** The script run in a bare pretend window, for the functions it leaves for tests. */
function lib() {
  const win = {
    navigator: { getGamepads: () => [] },
    addEventListener() {},
    location: { hostname: "www.netflix.com", pathname: "/browse" },
    document: { hasFocus: () => true },
    requestAnimationFrame: () => 1,
  };
  win.window = win;
  win.top = win;
  vm.createContext(win);
  vm.runInContext(SRC, win);
  // (what it returns made plain: its arrays and objects are the pretend window's own kind)
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const l = win.__tamkeenNetflixPadLib;
  return { isController: l.isController, nextFrom: l.nextFrom, standardize: (p) => plain(l.standardize(p)), readInputs: (p, b) => plain(l.readInputs(p, b)) };
}

const btn = (pressed, value = pressed ? 1 : 0) => ({ pressed, value });
const PADS = {
  xbox: { id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)", mapping: "standard",
    buttons: Array.from({ length: 17 }, (_, i) => btn(i === 0)), axes: [0, 0.8, 0, -0.6] },
  bluetoothXbox: { id: "Unknown Gamepad (Vendor: 045e Product: 0b13)", mapping: "",
    buttons: Array.from({ length: 15 }, (_, i) => btn(i === 3)), axes: [0.01, -0.01, -0.03, 1, -1, 0, 0, 0, 0, 3 / 7 - 1] },
  pebble: { id: "Pebble V3 (Vendor: 041e Product: 3272)", mapping: "", buttons: [btn(false), btn(true), ...Array(5).fill(btn(false))], axes: [] },
  knob: { id: "Volume knob", mapping: "", buttons: Array(7).fill(btn(false)), axes: [-1] },
};

test("Netflix's pages read controllers just as the app does (padmap.js)", () => {
  const nf = lib();
  for (const [name, pad] of Object.entries(PADS)) {
    assert.equal(nf.isController(pad), isController(pad), `${name}: a controller or not`);
    if (!isController(pad)) continue;
    const mine = standardize(pad);
    const theirs = nf.standardize(pad);
    assert.deepEqual(theirs.buttons.map((b) => b.pressed), mine.buttons.map((b) => b.pressed), `${name}: buttons`);
    assert.deepEqual(theirs.axes, mine.axes, `${name}: sticks`);
    assert.deepEqual(Object.keys(nf.readInputs(theirs, {}).down).sort(), [...readInputs(mine).down].sort(), `${name}: what is down`);
  }
  // the speaker's knob never counts; the Bluetooth Xbox's Y, LT and D-pad right are read in their places
  assert.equal(nf.isController(PADS.pebble), false);
  assert.deepEqual(Object.keys(nf.readInputs(nf.standardize(PADS.bluetoothXbox), {}).down).sort(), ["b15", "b2", "b6"].sort());
});

test("the highlight moves to the nearest title that way, along its row first", () => {
  const nf = lib();
  const el = (left, top, w = 200, h = 110) => {
    const e = { getBoundingClientRect: () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h }) };
    e.contains = (o) => o === e;
    return e;
  };
  // two rows of titles, and Netflix's arrow at the end of the first row
  const r1 = [el(40, 200), el(250, 200), el(460, 200)];
  const arrow = el(670, 200, 40, 110);
  const r2 = [el(40, 420), el(250, 420), el(460, 420)];
  const all = [...r1, arrow, ...r2];
  assert.equal(nf.nextFrom(r1[0], "right", all), r1[1]);
  assert.equal(nf.nextFrom(r1[2], "right", all), arrow, "past the last title: the row's arrow");
  assert.equal(nf.nextFrom(r1[1], "down", all), r2[1], "down: the title under it");
  assert.equal(nf.nextFrom(r2[2], "up", all), r1[2]);
  assert.equal(nf.nextFrom(r1[0], "left", all), null, "nothing that way");
  assert.equal(nf.nextFrom(r1[0], "up", all), null);
});

test("the controller script is on Netflix's pages: the computer's Netflix window and the extension", () => {
  assert.match(read("app/desktop.py"), /"netflix-browser\.js",\s*\n\s*"netflix-pad\.js"\)\]/);
  for (const key of ["padSelect", "padBack", "padPage"]) {
    assert.match(read("app/desktop.py"), new RegExp(`NETFLIX_TEXTS = \\([^)]*"${key}"`), key);
    assert.match(read("web/js/netflix.js"), new RegExp(`${key}: t\\(`), key);
  }
  assert.match(read("extension/manifest.json"), /"js\/netflix-browser\.js", "js\/netflix-pad\.js", "content\/netflix\.js"/);
  assert.match(read("extension/scripts/build.mjs"), /"js\/netflix-pad\.js"\]\) copy\(rel\)/);
  // it stays out of a title's own page in the extension's tab (Tamkeen's player and its keys are there)
  assert.match(SRC, /!\/\^\\\/watch\\\/\/\.test\(location\.pathname\)/);
  // inside someone else's website: no innerHTML, a closed shadow root
  assert.doesNotMatch(SRC, /\.innerHTML\b/);
  assert.match(SRC, /attachShadow\(\{ mode: "closed" \}\)/);
});

test("only the window in front acts on the controller: Tamkeen's own page waits while the Netflix window has it", () => {
  const pad = read("web/js/gamepad.js");
  assert.match(pad, /if \(document\.hidden \|\| !windowInFront\(\)\) \{ pressesFrom\(state, down, now\); holding\.clear\(\); continue; \}/);
  assert.match(SRC, /var mine = document\.hasFocus\(\) && !document\.hidden;/);
});
