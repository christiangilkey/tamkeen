// Run with: node --test tests/js/
// Game controllers (web/js/padmap.js): the default buttons, giving an action a new one ("press a
// button to assign"), saving and loading the setting, the sticks' dead zone, holds, and the names
// printed on each kind of controller. web/js/gamepad.js (the part that reads the controller in a
// page) is checked in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIONS, AREAS, AREA_IDS, DEAD_ZONE, HOLD_MS, REPEAT_MS, actionFor, assign, cleanMap, cleanSetting, deadZone,
  firstPressed, fullMap, inputName, isInput, newPressState, padKind, pressesFrom, readInputs, resetAction, resetArea,
  settingWins, shortOf,
} from "../../web/js/padmap.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

/** A standard controller's snapshot: `down` buttons pressed, axes as given. */
const pad = (down = [], axes = [0, 0, 0, 0], values = {}) => ({
  buttons: Array.from({ length: 17 }, (_, i) => {
    const value = values[i] ?? (down.includes(i) ? 1 : 0);
    return { pressed: down.includes(i) || value > 0.1, value };
  }),
  axes,
});

/// ---------------------------------------------------------------- the defaults

test("every screen has its actions, each with a known default, and no input does two things on one screen", () => {
  assert.deepEqual(AREA_IDS, ["video", "popup", "review", "reader", "home", "library", "lesson", "vocab", "friends",
    "settings", "dialog", "typing", "general"]);
  for (const area of AREA_IDS) {
    assert.ok(ACTIONS[area] && ACTIONS[area].length, area);
    const info = AREAS.find((a) => a.id === area);
    assert.ok(info.title && info.about, area);
    const ids = new Set();
    const inputs = new Set();
    for (const a of ACTIONS[area]) {
      assert.ok(!ids.has(a.id), `${area}/${a.id} twice`);
      ids.add(a.id);
      assert.ok(/^[A-Za-z0-9]{1,32}$/.test(a.id), a.id);
      assert.ok(a.label && a.label.length < 90, a.id);
      assert.ok(a.short && a.short.length <= 16, `${area}/${a.id}: a short name for the on-screen guide`);
      if (a.def) {
        assert.ok(isInput(a.def), `${area}/${a.id}: ${a.def}`);
        assert.ok(!inputs.has(a.def), `${area}: ${a.def} is the default of two actions`);
        inputs.add(a.def);
      }
    }
  }
  assert.equal(shortOf("video", "lookUp"), "Look up");
  assert.equal(shortOf("video", "nope"), "");
});

test("the Xbox-style defaults: A opens the highlighted word in a player, answers on a card, presses elsewhere", () => {
  const full = fullMap(undefined);
  // players and reels: A looks up (when let go), X plays, Y hears the line, the D-pad moves the highlight in the words
  assert.equal(full.video.lookUp, "b0");
  assert.equal(full.video.playPause, "b2");
  assert.equal(full.video.replayLine, "b3");
  assert.equal(full.video.wordLeft, "b14");
  assert.equal(full.video.wordRight, "b15");
  assert.equal(full.video.lineUp, "b12");
  assert.equal(full.video.lineDown, "b13");
  assert.equal(full.video.back5, "a0-", "the left stick seeks");
  assert.equal(full.video.fwd5, "a0+");
  assert.equal(full.video.prevLine, "a1-");
  assert.equal(full.video.saveWord, "b7");
  assert.equal(full.video.nextVideo, "b5");
  assert.equal(actionFor(full, "video", "b0"), "lookUp");
  // the word popup: A saves (or presses the highlighted button), X and Y play, ← → the next word
  assert.equal(full.popup.press, "b0");
  assert.equal(full.popup.close, "b1");
  assert.equal(full.popup.playWord, "b2");
  assert.equal(full.popup.playSentence, "b3");
  assert.equal(full.popup.wordRight, "b15");
  // cards: A turns (then presses the highlighted box), ← → answer, ↑ ↓ walk the back's boxes
  assert.equal(full.review.turn, "b0");
  assert.equal(full.review.again, "b14");
  assert.equal(full.review.good, "b15");
  assert.equal(full.review.up, "b12");
  assert.equal(full.review.down, "b13");
  // books: the same highlight as the players, LB / RB turn the page
  assert.equal(full.reader.lookUp, "b0");
  assert.equal(full.reader.prevPage, "b4");
  assert.equal(full.reader.nextPage, "b5");
  // the screens: X and Y do each one's main things, LB / RB its tabs
  assert.equal(full.home.continue, "b2");
  assert.equal(full.home.review, "b3");
  assert.equal(full.library.nextKind, "b5");
  assert.equal(full.library.add, "b2");
  assert.equal(full.lesson.nextLesson, "b5");
  assert.equal(full.vocab.review, "b2");
  assert.equal(full.vocab.nextFolder, "b5");
  assert.equal(full.settings.nextSection, "b5");
  assert.equal(full.dialog.confirm, "b2");
  assert.equal(full.typing.leave, "b1");
  assert.equal(full.typing.enter, "b9");
  // everywhere: A presses, B goes back, the D-pad moves, LB / RB tabs, the triggers a page, the right stick scrolls
  assert.equal(full.general.back, "b1");
  assert.equal(full.general.select, "b0");
  assert.equal(full.general.up, "b12");
  assert.equal(full.general.prevTab, "b4");
  assert.equal(full.general.nextTab, "b5");
  assert.equal(full.general.pageUp, "b6");
  assert.equal(full.general.pageDown, "b7");
  assert.equal(full.general.scrollDown, "a3+");
  assert.equal(full.general.menu, "b9");
  assert.equal(full.general.guide, "b8");
  assert.equal(actionFor(full, "general", "b0"), "select");
  // B is left to "back" on the screens (the popup and a text box close with it themselves)
  for (const area of ["video", "review", "reader", "home", "library", "lesson", "vocab", "friends", "settings", "dialog"]) {
    assert.equal(actionFor(full, area, "b1"), "", area);
  }
});

test("held: moving and seeking repeat, answering and looking up never do; looking up happens when A is let go", () => {
  const by = (area, id) => ACTIONS[area].find((a) => a.id === id);
  assert.ok(by("video", "back5").repeat);
  assert.ok(by("video", "wordRight").repeat);
  assert.ok(by("general", "down").repeat);
  assert.ok(by("general", "pageDown").repeat);
  assert.ok(!by("video", "playPause").repeat);
  assert.ok(!by("review", "good").repeat, "a held button must never answer several cards");
  assert.ok(!by("review", "again").repeat);
  assert.ok(!by("review", "turn").repeat);
  assert.ok(by("general", "scrollUp").scroll);
  assert.ok(by("video", "lookUp").hold, "hold A and move to take in more words; letting go looks them up");
  assert.ok(by("reader", "lookUp").hold);
  assert.ok(!by("video", "lookUp").repeat);
  for (const area of AREA_IDS) for (const a of ACTIONS[area]) assert.ok(!(a.hold && a.repeat), `${area}/${a.id}`);
});

// ---------------------------------------------------------------- assigning ("press a button to assign")

test("assigning a button to an action keeps only the change, with its time", () => {
  const { setting, took } = assign({}, "video", "playPause", "b9", 1000);
  assert.equal(took, null);
  assert.deepEqual(setting, { at: 1000, map: { video: { playPause: "b9" } } });
  assert.equal(fullMap(setting).video.playPause, "b9");
  assert.equal(fullMap(setting).video.lookUp, "b0", "the rest keep their defaults");
});

test("a button already used on the same screen moves: the other action is left with none", () => {
  const { setting, took } = assign({}, "video", "playPause", "b3", 5);  // Y did "hear the line"
  assert.equal(took, "replayLine");
  const full = fullMap(setting);
  assert.equal(full.video.playPause, "b3");
  assert.equal(full.video.replayLine, "");
  assert.equal(actionFor(full, "video", "b3"), "playPause");
  // other screens are not touched: Y still plays the sentence on a card
  assert.equal(full.review.playSentence, "b3");
  assert.equal(full.popup.playSentence, "b3");
});

test("a learner's buttons from before the screens had their own keep working", () => {
  // v0.39: A played; a learner who put "play / pause" on RB (and so took it from "next reel")
  const old = { at: 50, map: { video: { playPause: "b5", nextVideo: "" } } };
  let full = fullMap(old);
  assert.equal(full.video.playPause, "b5");
  assert.equal(full.video.nextVideo, "");
  assert.equal(actionFor(full, "video", "b5"), "playPause");
  // one who put "look up" on Start: now a default of no action on that screen, so nothing is lost
  full = fullMap({ at: 1, map: { video: { lookUp: "b9" } } });
  assert.equal(full.video.lookUp, "b9");
  assert.equal(actionFor(full, "video", "b0"), "", "A is free: the learner's look-up button stays where they put it");
  // a learner's button wins over a newer default of another action on the same screen
  full = fullMap({ at: 1, map: { video: { captions: "b2" } } });  // X: captions (X is play / pause now)
  assert.equal(full.video.captions, "b2");
  assert.equal(full.video.playPause, "", "the default that came later gives way");
  assert.equal(actionFor(full, "video", "b2"), "captions");
  // and saving another change doesn't undo that
  const { setting } = assign({ at: 1, map: { video: { captions: "b2" } } }, "video", "slower", "b10", 9);
  assert.equal(fullMap(setting).video.captions, "b2");
  assert.equal(fullMap(setting).video.loopLine, "", "LS press went to slow down");
});

test("clearing, resetting one action and resetting an area", () => {
  let s = assign({}, "review", "again", "", 1).setting;
  assert.equal(fullMap(s).review.again, "");
  assert.deepEqual(s.map, { review: { again: "" } }, "a cleared action is kept as cleared, not as the default");
  s = assign(s, "review", "good", "b7", 2).setting;
  s = resetAction(s, "review", "again", 3).setting;
  assert.equal(fullMap(s).review.again, "b14");
  assert.equal(fullMap(s).review.good, "b7");
  s = assign(s, "video", "slower", "b4", 4).setting;   // LB: "previous reel" loses it
  assert.equal(fullMap(s).video.prevVideo, "");
  const one = resetArea(s, "review", 9);
  assert.equal(one.at, 9);
  assert.deepEqual(one.map, { video: { slower: "b4", prevVideo: "" } });
  assert.deepEqual(resetArea(s, "", 10), { at: 10, map: {} });
});

test("resetting an action takes its default button back from the action that had it", () => {
  let s = assign({}, "video", "replayLine", "b9", 1).setting;   // hear the line on Menu; Y is free
  s = assign(s, "video", "saveWord", "b3", 2).setting;          // save on Y
  const { setting, took } = resetAction(s, "video", "replayLine", 3);
  assert.equal(took, "saveWord");
  assert.equal(fullMap(setting).video.replayLine, "b3");
  assert.equal(fullMap(setting).video.saveWord, "");
});

test("only real actions and inputs can be assigned", () => {
  assert.throws(() => assign({}, "video", "nope", "b0"));
  assert.throws(() => assign({}, "video", "playPause", "x9"));
  assert.throws(() => assign({}, "nowhere", "playPause", "b0"));
  assert.doesNotThrow(() => assign({}, "home", "review", "b0"));
});

// ---------------------------------------------------------------- saving and loading

test("a stored setting is cleaned: rubbish left out, a newer version's screens and actions kept", () => {
  const raw = {
    at: 1700000000123.7,
    map: {
      video: { playPause: "b2", lookUp: "", fly: "b3", bad: "b999", worse: 4, "no way": "b1" },
      review: "not an object",
      elsewhere: { x: "b1" },
      "Not an area": { x: "b1" },
      general: { back: "a1-" },
      vocab: { review: "b7" },
    },
  };
  assert.deepEqual(cleanSetting(raw), {
    at: 1700000000123,
    map: { video: { playPause: "b2", lookUp: "", fly: "b3" }, elsewhere: { x: "b1" }, general: { back: "a1-" }, vocab: { review: "b7" } },
  });
  assert.deepEqual(cleanSetting(null), { at: 0, map: {} });
  assert.deepEqual(cleanSetting("x"), { at: 0, map: {} });
  assert.deepEqual(cleanMap({ map: [] }), {});
  assert.equal(fullMap(raw).video.playPause, "b2");
  assert.equal(fullMap(raw).vocab.review, "b7");
  assert.equal(fullMap(raw).elsewhere, undefined, "a screen this version doesn't have does nothing here");
  // a newer version's action and screen survive this version's changes
  const { setting } = assign(raw, "video", "fwd5", "b5", 5);
  assert.equal(setting.map.video.fly, "b3");
  assert.deepEqual(setting.map.elsewhere, { x: "b1" });
});

test("the computer's twin knows the same screens (app/controller.py)", () => {
  const py = read("app/controller.py");
  const m = /AREAS = \(([^)]*)\)/.exec(py);
  assert.ok(m, "AREAS in app/controller.py");
  const names = [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
  assert.deepEqual(names, AREA_IDS);
});

test("saving and loading go through JSON unchanged (the settings store, Drive sync)", () => {
  let s = assign({}, "video", "nextVideo", "a0+", 10).setting;
  s = assign(s, "general", "menu", "", 11).setting;
  const back = cleanSetting(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
  assert.deepEqual(fullMap(back), fullMap(s));
});

test("between devices, the mapping changed last wins", () => {
  const older = { at: 100, map: { video: { playPause: "b1" } } };
  const newer = { at: 200, map: {} };
  assert.equal(settingWins(newer, older), true);
  assert.equal(settingWins(older, newer), false);
  assert.equal(settingWins(older, older), false, "the same one never replaces itself");
  assert.equal(settingWins(older, undefined), true, "anything set beats nothing set");
  assert.equal(settingWins({}, older), false);
});

test("the computer keeps and syncs the setting too (app/controller.py, the sync on both sides)", () => {
  assert.match(read("app/db.py"), /"controller_map": \{\}/);
  assert.match(read("app/sync/engine.py"), /"controller": controller\.clean\(db\.get_setting\("controller_map"\)\)/);
  assert.match(read("mobile/src/js/store.js"), /controller_map: \{\}/);
  const sync = read("mobile/src/js/sync.js");
  assert.match(sync, /controller: cleanController\(settings\.controller_map\)/);
  assert.match(sync, /controllerWins\(remote\.controller, settings\.controller_map\)/);
  assert.match(read("mobile/src/js/backend.js"), /\["GET", \/\^\\\/settings\$\//, "the phone answers GET /settings, which gamepad.js reads");
  const shared = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/padmap.js", "js/gamepad.js", "js/components/controllerpanel.js"]) assert.ok(shared.includes(`"${f}"`), f);
});

// ---------------------------------------------------------------- reading the controller

test("the dead zone: a resting stick's wobble is nothing, past it the push is scaled to 0..1", () => {
  assert.equal(deadZone(0), 0);
  assert.equal(deadZone(0.1), 0);
  assert.equal(deadZone(-DEAD_ZONE + 0.01), 0);
  assert.equal(deadZone(1), 1);
  assert.equal(deadZone(-1), -1);
  assert.ok(Math.abs(deadZone(0.625) - 0.5) < 1e-9);
  assert.equal(deadZone(1.3), 1, "never more than all the way");
  assert.equal(deadZone("x"), 0);
});

test("buttons, triggers and sticks become inputs; a stick is let go a little before it was pressed", () => {
  let r = readInputs(pad([0, 13]));
  assert.deepEqual([...r.down].sort(), ["b0", "b13"]);
  // a trigger touched lightly isn't pressed; past half way it is
  assert.ok(!readInputs(pad([], undefined, { 7: 0.2 })).down.has("b7"));
  assert.ok(readInputs(pad([], undefined, { 7: 0.8 })).down.has("b7"));
  // a stick: drift does nothing, a push is a direction
  assert.equal(readInputs(pad([], [0.2, -0.1, 0, 0])).down.size, 0);
  r = readInputs(pad([], [0, 0, 0, 0.9]));
  assert.ok(r.down.has("a3+"));
  assert.ok(r.strength["a3+"] > 0.8);
  r = readInputs(pad([], [-0.6, 0, 0, 0]));
  assert.ok(r.down.has("a0-"));
  // hysteresis: at 0.4 a stick that was pushed stays pushed, one that wasn't isn't
  assert.ok(readInputs(pad([], [0.4, 0, 0, 0]), new Set(["a0+"])).down.has("a0+"));
  assert.ok(!readInputs(pad([], [0.4, 0, 0, 0])).down.has("a0+"));
  assert.ok(!readInputs(pad([], [0.3, 0, 0, 0]), new Set(["a0+"])).down.has("a0+"));
  // the right stick a little past the dead zone scrolls slowly
  r = readInputs(pad([], [0, 0, 0, 0.3]));
  assert.ok(!r.down.has("a3+"));
  assert.ok(r.strength["a3+"] > 0 && r.strength["a3+"] < 0.1);
});

test("a press acts once; held, only a repeating action repeats, after a pause", () => {
  const st = newPressState();
  const repeats = (id) => id === "b14";
  assert.deepEqual(pressesFrom(st, new Set(["b0", "b14"]), 0, repeats), ["b0", "b14"]);
  assert.deepEqual(pressesFrom(st, new Set(["b0", "b14"]), HOLD_MS - 1, repeats), [], "nothing more before the hold starts");
  assert.deepEqual(pressesFrom(st, new Set(["b0", "b14"]), HOLD_MS, repeats), ["b14"]);
  assert.deepEqual(pressesFrom(st, new Set(["b0", "b14"]), HOLD_MS + 10, repeats), [], "then one every REPEAT_MS");
  assert.deepEqual(pressesFrom(st, new Set(["b0", "b14"]), HOLD_MS + REPEAT_MS, repeats), ["b14"]);
  assert.deepEqual(pressesFrom(st, new Set(), HOLD_MS + 500, repeats), []);
  assert.deepEqual(pressesFrom(st, new Set(["b0"]), HOLD_MS + 600, repeats), ["b0"], "let go and pressed again: a new press");
});

test("press a button to assign: the first new button, or a stick pushed well away from where it rested", () => {
  assert.equal(firstPressed(pad([5])), "b5");
  assert.equal(firstPressed(pad([])), "");
  // already held when the learner was asked (the A that pressed "Set"): not taken
  assert.equal(firstPressed(pad([0]), pad([0])), "");
  assert.equal(firstPressed(pad([0, 4]), pad([0])), "b4");
  // a drifting stick isn't a press, a push is
  assert.equal(firstPressed(pad([], [0.3, 0, 0, 0])), "");
  assert.equal(firstPressed(pad([], [0, -0.95, 0, 0])), "a1-");
  // a trigger reported as an axis resting at -1 (some controllers): resting isn't a press, pulling it is
  assert.equal(firstPressed(pad([], [0, 0, 0, 0, -1]), pad([], [0, 0, 0, 0, -1])), "");
  assert.equal(firstPressed(pad([], [0, 0, 0, 0, 0.9]), pad([], [0, 0, 0, 0, -1])), "a4+");
});

// ---------------------------------------------------------------- names on the buttons

test("which kind of controller, from the name the browser gives it", () => {
  assert.equal(padKind("Xbox 360 Controller (XInput STANDARD GAMEPAD)"), "xbox");
  assert.equal(padKind("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"), "xbox");
  assert.equal(padKind("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"), "playstation");
  assert.equal(padKind("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"), "playstation");
  assert.equal(padKind("054c-05c4-Wireless Controller"), "playstation"); // Firefox's way of naming
  assert.equal(padKind("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"), "switch");
  assert.equal(padKind("8BitDo SN30 Pro (STANDARD GAMEPAD)"), "generic");
  assert.equal(padKind(""), "generic");
});

test("button names in the style of the controller, or plain ones", () => {
  assert.equal(inputName("b0", "xbox"), "A");
  assert.equal(inputName("b0", "playstation"), "✕");
  assert.equal(inputName("b3", "playstation"), "△");
  assert.equal(inputName("b0", "switch"), "B", "the bottom button is B on a Switch controller");
  assert.equal(inputName("b0", "generic"), "Bottom button");
  assert.equal(inputName("b4", "xbox"), "LB");
  assert.equal(inputName("b6", "playstation"), "L2");
  assert.equal(inputName("b7", "switch"), "ZR");
  assert.equal(inputName("b9", "xbox"), "Menu");
  assert.equal(inputName("b9", "playstation"), "Options");
  assert.equal(inputName("b12", "xbox"), "D-pad up");
  assert.equal(inputName("b16", "playstation"), "PS button");
  assert.equal(inputName("a3+", "xbox"), "Right stick down");
  assert.equal(inputName("a0-", "generic"), "Left stick left");
  assert.equal(inputName("b20", "xbox"), "Button 21");
  assert.equal(inputName("b4", "xbox", false), "Button 5", "no standard layout: numbered");
  assert.equal(inputName("a5+", "xbox", false), "Axis 6 +");
  assert.equal(inputName("", "xbox"), "");
  assert.equal(inputName("b2", "unknown-kind"), "Left button");
});

test("Settings → Controller is a section of both Settings pages, found by the search", async () => {
  const { SECTIONS, FINDS } = await import("../../web/js/components/settingsui.js").catch(() => ({}));
  if (SECTIONS) {
    assert.ok(SECTIONS.some((s) => s.id === "controller"));
    assert.ok(FINDS.some((f) => f.s === "controller"));
  }
  assert.match(read("web/js/pages/settings.js"), /controller: controllerSection/);
  assert.match(read("mobile/src/js/pages/settings.js"), /controller: controllerSection/);
  assert.equal(AREAS.length, 13);
});

// ---------------------------------------------------------------- moving the highlight with the D-pad

test("the D-pad moves the highlight to the nearest button that way, row by row", async () => {
  const { nearest } = await import("../../web/js/padmap.js");
  const box = (left, top, width = 80, height = 30) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const items = {
    logo: box(10, 10), start: box(690, 120), allWords: box(10, 340), calendar: box(280, 270, 130), right: box(120, 10),
    below: box(10, 60), farBelow: box(10, 600),
  };
  const list = (...names) => names.map((n) => ({ name: n, rect: items[n] }));
  const pick = (from, dir, ...names) => (nearest(items[from], list(...names), dir) || {}).name;
  // the next row down, even when it is far to the right, before a row further down straight below
  assert.equal(pick("logo", "down", "start", "allWords", "calendar"), "start");
  // straight below wins over off to the side in the same row
  assert.equal(pick("logo", "down", "below", "start"), "below");
  assert.equal(pick("allWords", "up", "logo", "calendar", "start"), "calendar");
  // left and right stay on the line
  assert.equal(pick("logo", "right", "right", "start", "calendar"), "right");
  assert.equal(pick("right", "left", "logo", "below"), "logo");
  // nothing that way
  assert.equal(pick("farBelow", "down", "logo", "start"), undefined);
  assert.equal(pick("logo", "left", "right", "below"), undefined);
});
