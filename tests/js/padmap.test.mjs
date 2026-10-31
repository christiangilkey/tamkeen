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
  settingWins, shortOf, whatDoes, pairName, STICK_AS_DPAD, isController, standardize,
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

//// ---------------------------------------------------------------- the defaults

test("every screen has its actions, each with a known default, and no input does two things on one screen", () => {
  assert.deepEqual(AREA_IDS, ["video", "reels", "popup", "review", "reader", "home", "library", "lesson", "vocab", "friends",
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
      assert.ok(a.short && a.short.length <= 18, `${area}/${a.id}: a short name for the on-screen guide and the drawing`);
      assert.ok(a.def === "" || isInput(a.def), `${area}/${a.id}: ${a.def}`);
      if (a.def) {
        assert.ok(!inputs.has(a.def), `${area}: ${a.def} is the default of two actions`);
        inputs.add(a.def);
      }
    }
  }
  assert.equal(shortOf("video", "lookUp"), "Look up");
  assert.equal(shortOf("video", "nope"), "");
});

test("the Xbox dashboard's layout on every screen: A selects, B back, LB / RB tabs, LT / RT fast, View options, Menu more", () => {
  const full = fullMap(undefined);
  // everywhere
  assert.equal(full.general.select, "b0");
  assert.equal(full.general.back, "b1");
  assert.deepEqual([full.general.up, full.general.down, full.general.left, full.general.right], ["b12", "b13", "b14", "b15"]);
  assert.deepEqual([full.general.prevTab, full.general.nextTab], ["b4", "b5"]);
  assert.deepEqual([full.general.pageUp, full.general.pageDown], ["b6", "b7"]);
  assert.deepEqual([full.general.scrollUp, full.general.scrollDown], ["a3-", "a3+"], "the right stick scrolls");
  assert.equal(full.general.options, "b8", "View: the screen's options");
  assert.equal(full.general.more, "b9", "Menu: more options for the highlighted thing");
  assert.equal(full.general.menu, "", "the main tabs: up to the top bar, or B back to Home");
  // each screen's LB / RB are its own "tabs", LT / RT its fast way through, View its options, Menu more
  const lbrb = { video: ["prevLine", "nextLine"], reels: ["prevVideo", "nextVideo"], popup: ["wordLeft", "wordRight"],
    review: ["again", "good"], reader: ["prevPage", "nextPage"], library: ["prevKind", "nextKind"],
    lesson: ["prevLesson", "nextLesson"], vocab: ["prevFolder", "nextFolder"], settings: ["prevSection", "nextSection"] };
  for (const [area, [prev, next]] of Object.entries(lbrb)) {
    assert.equal(full[area][prev], "b4", `${area}: LB`);
    assert.equal(full[area][next], "b5", `${area}: RB`);
  }
  assert.deepEqual([full.video.back5, full.video.fwd5], ["b6", "b7"], "a player's LT / RT: back / forward 5 seconds");
  assert.deepEqual([full.reels.back5, full.reels.fwd5], ["b6", "b7"]);
  assert.deepEqual([full.popup.scrollUp, full.popup.scrollDown], ["b6", "b7"]);
  for (const area of ["video", "reels", "review", "reader", "vocab"]) assert.equal(actionFor(full, area, "b8"), "options", area);
  assert.equal(full.popup.source, "b8");
  assert.equal(actionFor(full, "video", "b9"), "wordMenu");
  assert.equal(actionFor(full, "reader", "b9"), "wordMenu");
  assert.equal(actionFor(full, "review", "b9"), "cardMenu");
  // A selects: in the players the highlighted word (when let go), on a card it turns it / presses the highlighted one
  assert.equal(full.video.lookUp, "b0");
  assert.equal(full.reels.lookUp, "b0");
  assert.equal(full.reader.lookUp, "b0");
  assert.equal(full.review.turn, "b0");
  assert.equal(full.popup.press, "b0");
  // X and Y: each screen's extra actions
  assert.deepEqual([full.video.playPause, full.video.replayLine], ["b2", "b3"]);
  assert.deepEqual([full.popup.playWord, full.popup.playSentence], ["b2", "b3"]);
  assert.deepEqual([full.review.playWord, full.review.playSentence], ["b2", "b3"]);
  assert.deepEqual([full.home.continue, full.home.review], ["b2", "b3"]);
  assert.deepEqual([full.library.add, full.library.search], ["b2", "b3"]);
  assert.deepEqual([full.lesson.hear, full.lesson.allLessons], ["b2", "b3"]);
  assert.deepEqual([full.vocab.review, full.vocab.search], ["b2", "b3"]);
  assert.equal(full.settings.search, "b3", "Y searches wherever there is a search");
  assert.deepEqual([full.friends.record, full.friends.write], ["b2", "b3"]);
  assert.equal(full.dialog.confirm, "b2");
  // typing: B done, Menu Enter (Xbox's on-screen keyboard)
  assert.equal(full.typing.leave, "b1");
  assert.equal(full.typing.enter, "b9");
  // the D-pad (and the left stick) move the highlight: in the words, on the card, in the popup
  assert.deepEqual([full.video.wordLeft, full.video.wordRight, full.video.lineUp, full.video.lineDown], ["b14", "b15", "b12", "b13"]);
  assert.deepEqual([full.popup.up, full.popup.down, full.popup.left, full.popup.right], ["b12", "b13", "b14", "b15"]);
  assert.deepEqual([full.review.up, full.review.down], ["b12", "b13"]);
  // nothing has the left stick by default: it does what the D-pad does
  for (const area of AREA_IDS) for (const s of Object.keys(STICK_AS_DPAD)) assert.equal(actionFor(full, area, s), "", `${area} ${s}`);
  // B is left to "back" on the screens (the popup and a text box close with it themselves)
  for (const area of ["video", "reels", "review", "reader", "home", "library", "lesson", "vocab", "friends", "settings", "dialog"]) {
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
  assert.ok(by("reels", "lookUp").hold);
  assert.ok(!by("video", "lookUp").repeat);
  for (const area of AREA_IDS) for (const a of ACTIONS[area]) assert.ok(!(a.hold && a.repeat), `${area}/${a.id}`);
});

test("what a button does on a screen (the drawing in Settings): the screen's, else Everywhere's; the left stick as the D-pad", () => {
  const full = fullMap(undefined);
  assert.deepEqual(whatDoes(full, "library", "b4"), { area: "library", action: "prevKind" });
  assert.deepEqual(whatDoes(full, "library", "b0"), { area: "general", action: "select" });
  assert.deepEqual(whatDoes(full, "home", "b8"), { area: "general", action: "options" });
  assert.deepEqual(whatDoes(full, "video", "a0+"), { area: "video", action: "wordRight" }, "the left stick moves the word highlight");
  assert.deepEqual(whatDoes(full, "home", "a1+"), { area: "general", action: "down" });
  assert.deepEqual(whatDoes(full, "home", "a3+"), { area: "general", action: "scrollDown" });
  assert.equal(whatDoes(full, "home", "b10"), null, "nothing on the left stick's press");
  // typing: only leaving the box (and moving on with the D-pad)
  assert.deepEqual(whatDoes(full, "typing", "b1"), { area: "typing", action: "leave" });
  assert.deepEqual(whatDoes(full, "typing", "b13"), { area: "general", action: "down" });
  assert.equal(whatDoes(full, "typing", "b0"), null);
  // a button given another job shows that job straight away; the left stick given one of its own keeps it
  let s = assign({}, "home", "review", "b8", 1).setting;
  assert.deepEqual(whatDoes(fullMap(s), "home", "b8"), { area: "home", action: "review" });
  s = assign({}, "general", "pageDown", "a1+", 2).setting;
  assert.deepEqual(whatDoes(fullMap(s), "home", "a1+"), { area: "general", action: "pageDown" });
  // LB / RB named together
  assert.equal(pairName(whatDoes(full, "library", "b4"), whatDoes(full, "library", "b5")), "Kind");
  assert.equal(pairName(whatDoes(full, "video", "b6"), whatDoes(full, "video", "b7")), "5 seconds");
  assert.equal(pairName(whatDoes(full, "home", "b2"), whatDoes(full, "home", "b3")), "");
});

// ---------------------------------------------------------------- assigning ("press a button to assign")

test("assigning a button to an action keeps only the change, with its time", () => {
  const { setting, took } = assign({}, "video", "playPause", "b11", 1000);
  assert.equal(took, null);
  assert.deepEqual(setting, { at: 1000, map: { video: { playPause: "b11" } } });
  assert.equal(fullMap(setting).video.playPause, "b11");
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

test("a learner's buttons from before keep working", () => {
  // v0.39: a learner who put "play / pause" on RB (RB is "next line" by default now)
  let full = fullMap({ at: 50, map: { video: { playPause: "b5", nextVideo: "" } } });
  assert.equal(full.video.playPause, "b5");
  assert.equal(full.video.nextLine, "", "the default that came later gives way");
  assert.equal(actionFor(full, "video", "b5"), "playPause");
  // one who put "look up" on Start
  full = fullMap({ at: 1, map: { video: { lookUp: "b9" } } });
  assert.equal(full.video.lookUp, "b9");
  assert.equal(full.video.wordMenu, "", "Menu was the learner's before it was More");
  assert.equal(actionFor(full, "video", "b0"), "", "A is free: the learner's look-up button stays where they put it");
  // a learner's button wins over a newer default of another action on the same screen
  full = fullMap({ at: 1, map: { video: { captions: "b2" } } });
  assert.equal(full.video.captions, "b2");
  assert.equal(full.video.playPause, "");
  assert.equal(actionFor(full, "video", "b2"), "captions");
  // and saving another change doesn't undo that
  const { setting } = assign({ at: 1, map: { video: { captions: "b2" } } }, "video", "slower", "b10", 9);
  assert.equal(fullMap(setting).video.captions, "b2");
  assert.equal(fullMap(setting).video.slower, "b10");
});

test("clearing, resetting one action and resetting an area", () => {
  let s = assign({}, "review", "again", "", 1).setting;
  assert.equal(fullMap(s).review.again, "");
  assert.deepEqual(s.map, { review: { again: "" } }, "a cleared action is kept as cleared, not as the default");
  s = assign(s, "review", "good", "b7", 2).setting;
  s = resetAction(s, "review", "again", 3).setting;
  assert.equal(fullMap(s).review.again, "b4");
  assert.equal(fullMap(s).review.good, "b7");
  s = assign(s, "reels", "saveWord", "b4", 4).setting;   // LB: "previous reel" loses it
  assert.equal(fullMap(s).reels.prevVideo, "");
  const one = resetArea(s, "review", 9);
  assert.equal(one.at, 9);
  assert.deepEqual(one.map, { reels: { saveWord: "b4", prevVideo: "" } });
  assert.deepEqual(resetArea(s, "", 10), { at: 10, map: {} });
});

test("resetting an action takes its default button back from the action that had it", () => {
  let s = assign({}, "video", "replayLine", "b11", 1).setting;  // hear the line on the right stick's press; Y is free
  s = assign(s, "video", "saveWord", "b3", 2).setting;           // save on Y
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
  let s = assign({}, "reels", "nextVideo", "a0+", 10).setting;
  s = assign(s, "general", "more", "", 11).setting;
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

test("devices that only say they are controllers are left out (speakers' volume keys)", () => {
  const pebble = { id: "Pebble V3 (Vendor: 041e Product: 3272)", mapping: "", buttons: Array(7).fill({ pressed: false, value: 0 }), axes: [] };
  assert.equal(isController(pebble), false);
  assert.equal(isController({ id: "x", mapping: "standard", buttons: [], axes: [] }), true);
  assert.equal(isController({ id: "Unknown Gamepad", mapping: "", buttons: Array(12).fill(0), axes: [0, 0, 0, 0] }), true);
  assert.equal(isController(null), false);
});

test("an Xbox controller over Bluetooth the browser doesn't know: its buttons, triggers and D-pad in the standard places", () => {
  // as the owner's Xbox Series controller (045e:0b13) shows up: 15 buttons, triggers resting at −1, the D-pad on axis 9
  const raw = (pressed = [], axes = {}) => ({
    id: "Unknown Gamepad (Vendor: 045e Product: 0b13)", index: 1, mapping: "", connected: true,
    buttons: Array.from({ length: 15 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes: Object.assign([0.01, -0.01, -0.03, -1, -1, 0, 0, 0, 0, 1227133568], axes),
  });
  const down = (pad) => [...readInputs(standardize(pad)).down].sort();
  // at rest nothing is down (the triggers at −1 used to read as the right stick pushed up: endless scrolling)
  assert.deepEqual(down(raw()), []);
  assert.equal(standardize(raw()).mapping, "standard");
  assert.equal(standardize(raw()).axes.length, 4);
  // A B X Y, LB RB, View Menu, the sticks' presses
  assert.deepEqual(down(raw([0])), ["b0"]);
  assert.deepEqual(down(raw([1])), ["b1"]);
  assert.deepEqual(down(raw([3])), ["b2"], "X");
  assert.deepEqual(down(raw([4])), ["b3"], "Y");
  assert.deepEqual(down(raw([6, 7])), ["b4", "b5"], "LB, RB");
  assert.deepEqual(down(raw([10, 11])), ["b8", "b9"], "View, Menu");
  assert.deepEqual(down(raw([13, 14])), ["b10", "b11"], "the sticks pressed");
  // the triggers pulled
  assert.deepEqual(down(raw([], { 3: 1 })), ["b6"]);
  assert.deepEqual(down(raw([], { 4: 0.9 })), ["b7"]);
  assert.deepEqual(down(raw([], { 3: 0 })), [], "a trigger never touched yet reads 0: not pressed");
  // the D-pad: up, right, down, left, and up-left (two at once)
  const hat = (dir) => -1 + (2 * dir) / 7;
  assert.deepEqual(down(raw([], { 9: hat(0) })), ["b12"]);
  assert.deepEqual(down(raw([], { 9: hat(2) })), ["b15"]);
  assert.deepEqual(down(raw([], { 9: hat(4) })), ["b13"]);
  assert.deepEqual(down(raw([], { 9: hat(6) })), ["b14"]);
  assert.deepEqual(down(raw([], { 9: hat(7) })), ["b12", "b14"]);
  assert.deepEqual(down(raw([], { 9: 1.2857 })), [], "no direction");
  // the right stick: axis 2 across, axis 5 up and down
  assert.deepEqual(down(raw([], { 5: 0.9 })), ["a3+"]);
  // a controller the browser knows is left as it is
  const known = { id: "Xbox 360 Controller (XInput STANDARD GAMEPAD)", mapping: "standard", buttons: [], axes: [] };
  assert.equal(standardize(known), known);
});

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
  assert.equal(AREAS.length, 14);
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
