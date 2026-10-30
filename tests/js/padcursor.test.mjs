// Run with: node --test tests/js/
// The controller's highlight inside text (web/js/padcursor.js): word by word the way the text runs
// on screen, line by line to the nearest word above or below, holding the look-up button to take in
// more words, and a book's page turning past its last word. Then the screens' wiring: each screen's
// buttons are claimed by the right page (padscreens.js, the players, the books), and the browser's
// own OK / Cancel boxes (which a controller can't answer) are gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

// A stand-in for the page: words laid out in lines, as rectangles, left to right or right to left.
let direction = "ltr";
globalThis.getComputedStyle = () => ({ direction });
function words(lines, { width = 60, gap = 10, height = 20, rtl = false } = {}) {
  const els = [];
  lines.forEach((count, row) => {
    for (let k = 0; k < count; k++) {
      const left = rtl ? 1000 - (k + 1) * (width + gap) : k * (width + gap);
      const top = row * (height + 10);
      const classes = new Set();
      els.push({
        i: els.length, row, isConnected: true, parentElement: {},
        classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), has: (c) => classes.has(c) },
        getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
        scrollIntoView: () => {},
      });
    }
  });
  return els;
}

const { wordCursor } = await import("../../web/js/padcursor.js");

function setup(lines, opts = {}) {
  const els = words(lines, opts);
  const picked = [];
  const moved = [];
  const cursor = wordCursor({
    count: () => els.length,
    elsOf: (i) => [els[i]],
    startAt: () => opts.start ?? 0,
    blockOf: (i) => els[i].row,
    onPick: (i, j) => picked.push([i, j]),
    onMove: (i) => moved.push(i),
    ...opts.extra,
  });
  return { els, cursor, picked, moved };
}

test("the first press shows the highlight on the word it starts on, without moving it", () => {
  direction = "ltr";
  const { cursor, els, moved } = setup([4, 4], { start: 2 });
  assert.equal(cursor.on, false);
  assert.ok(cursor.move("right"));
  assert.equal(cursor.at, 2);
  assert.ok(els[2].classList.has("pad-word"));
  assert.deepEqual(moved, [2]);
  cursor.move("right");
  assert.equal(cursor.at, 3);
  assert.ok(!els[2].classList.has("pad-word"), "the ring moves with it");
  assert.ok(els[3].classList.has("pad-word"));
});

test("left and right go word by word the way the text runs on screen (right to left: left is on)", () => {
  direction = "ltr";
  let { cursor } = setup([5]);
  cursor.show(1);
  cursor.move("left");
  assert.equal(cursor.at, 0);
  assert.equal(cursor.move("left"), false, "nothing before the first word");
  assert.equal(cursor.at, 0);
  direction = "rtl";
  ({ cursor } = setup([5], { rtl: true }));
  cursor.show(1);
  cursor.move("left");
  assert.equal(cursor.at, 2, "Arabic: the next word is to the left");
  cursor.move("right");
  cursor.move("right");
  assert.equal(cursor.at, 0);
  direction = "ltr";
});

test("up and down go to the nearest word on the line above or below", () => {
  direction = "ltr";
  const { cursor } = setup([6, 3, 6]);
  cursor.show(4);           // line 1, the fifth word
  cursor.move("down");      // line 2 has only three words: the nearest is its last
  assert.equal(cursor.at, 8);
  cursor.move("down");      // line 3, under it
  assert.equal(cursor.at, 11);
  cursor.move("up");
  assert.equal(cursor.at, 8);
  cursor.move("up");
  assert.equal(cursor.at, 2, "the word above it");
  assert.equal(cursor.move("up"), false, "nothing above the first line");
});

test("without a picture of the words, up and down go to the line's first word", () => {
  const els = words([3, 3, 3]);
  const cursor = wordCursor({ count: () => 9, elsOf: () => [], startAt: () => 4, blockOf: (i) => els[i].row, onPick: () => {} });
  cursor.show();
  cursor.move("down");
  assert.equal(cursor.at, 6);
  cursor.move("up");
  assert.equal(cursor.at, 3);
  cursor.move("up");
  assert.equal(cursor.at, 0);
});

test("held look-up button: the words passed over are taken in, and letting go looks them all up", () => {
  direction = "ltr";
  const { cursor, els, picked } = setup([8]);
  cursor.show(2);
  cursor.move("right", true);
  cursor.move("right", true);
  assert.deepEqual(cursor.range(), [2, 4]);
  assert.ok(cursor.taking);
  assert.ok(els[2].classList.has("phr") && els[3].classList.has("phr") && els[4].classList.has("phr"));
  assert.ok(els[2].classList.has("phr-a") && els[4].classList.has("phr-z"));
  cursor.pick();
  assert.deepEqual(picked, [[2, 4]]);
  assert.equal(cursor.taking, false, "a new look-up starts from one word");
  assert.ok(!els[3].classList.has("phr"));
  // backwards works too, always in the text's order
  cursor.move("left", true);
  cursor.move("left", true);
  cursor.pick();
  assert.deepEqual(picked[1], [2, 4]);
  // moving again without holding drops the words taken in
  cursor.move("right", true);
  cursor.move("right");
  assert.deepEqual(cursor.range(), [cursor.at, cursor.at]);
});

test("holding the button with no highlight out starts it and takes the next word in at once", () => {
  direction = "ltr";
  const { cursor } = setup([6], { start: 1 });
  cursor.move("right", true);
  assert.deepEqual(cursor.range(), [1, 2]);
});

test("A with no highlight out looks up the word it would start on; B puts the highlight away", () => {
  const hid = [];
  const { cursor, picked } = setup([6], { start: 3, extra: { onHide: () => hid.push(true) } });
  cursor.pick();
  assert.deepEqual(picked, [[3, 3]]);
  assert.equal(cursor.on, true);
  assert.equal(cursor.hide(), true);
  assert.equal(cursor.on, false);
  assert.equal(cursor.hide(), false, "nothing to put away");
  assert.deepEqual(hid, [true]);
});

test("a book: past the last word on the page the page turns, and the highlight goes on there", () => {
  direction = "ltr";
  const all = words([4, 4]);
  let page = 0;   // page 0 has words 0..3, page 1 words 4..7
  const onPage = (i) => (page === 0 ? i < 4 : i >= 4);
  const cursor = wordCursor({
    count: () => 8,
    elsOf: (i) => [onPage(i) ? all[i] : null],
    startAt: () => (page === 0 ? 0 : 4),
    blockOf: (i) => all[i].row,
    onPick: () => {},
    edge: (dir, i) => {
      if (i >= 4 && page === 0) { page = 1; return 4; }
      if (i < 4 && page === 1) { page = 0; return 3; }
      return -1;
    },
  });
  cursor.show(3);
  cursor.move("right");
  assert.equal(page, 1);
  assert.equal(cursor.at, 4);
  cursor.move("left");
  assert.equal(page, 0);
  assert.equal(cursor.at, 3);
});

test("no words: nothing to highlight", () => {
  const cursor = wordCursor({ count: () => 0, elsOf: () => [], startAt: () => 0, onPick: () => assert.fail("picked") });
  assert.equal(cursor.move("right"), false);
  assert.equal(cursor.pick(), false);
  assert.equal(cursor.on, false);
});

// ---------------------------------------------------------------- the screens' wiring

test("each screen with words claims its buttons, with the highlight and the popup's next word", () => {
  for (const [file, area] of [["web/js/pages/player.js", "video"], ["web/js/pages/reels.js", "video"],
    ["web/js/pages/book.js", "reader"], ["web/js/pages/reader.js", "reader"]]) {
    const src = read(file);
    assert.match(src, new RegExp(`controllerArea\\("${area}"`), file);
    assert.match(src, /wordCursor\(/, `${file}: the highlight in the words`);
    assert.match(src, /actionHeld\("lookUp"\)/, `${file}: hold A to take in more words`);
    assert.match(src, /popupStep:/, `${file}: ← → in the word popup`);
    assert.match(src, /offPad\(\)/, `${file}: given back when the page closes`);
  }
  const review = read("web/js/pages/review.js");
  assert.match(review, /highlightMove\(dir, \{ root: face, linear: true/, "the card's back: up and down walk its boxes");
  assert.match(review, /tapEdit\(box\)/, "A on a text of the back opens it, as a tap does");
});

test("the screens without a page area of their own (Home, Library, lessons, Vocab, Friends, Settings)", async () => {
  const { SECTION_IDS } = await import("../../web/js/padscreens.js");
  const settings = read("web/js/components/settingsui.js");
  const block = /export const SECTIONS = \[([\s\S]*?)\n\];/.exec(settings)[1];
  assert.deepEqual(SECTION_IDS, [...block.matchAll(/\{ id: "([a-z]+)"/g)].map((m) => m[1]), "Settings' sections in the same order");
  const src = read("web/js/padscreens.js");
  for (const area of ["home", "library", "lesson", "vocab", "friends", "settings"]) assert.match(src, new RegExp(`area: "${area}"`), area);
  // what they press is on those screens
  assert.match(read("web/js/pages/home.js"), /class="continue-btn"/);
  assert.match(read("web/js/pages/vocab.js"), /id="review"/);
  assert.match(read("web/js/pages/library.js"), /id="feed-list"/);
  assert.match(read("web/js/pages/library.js"), /id="add-fab"/);
  const lessons = read("web/js/components/grammarpanel.js");
  for (const c of ["gl-prev", "gl-next", "gl-all", "gl-back", "gb-playall"]) assert.ok(lessons.includes(c), c);
  assert.match(read("web/js/pages/chat.js"), /id="mic"/);
});

test("boxes the controller must stay inside, and no browser OK / Cancel box it can't answer", () => {
  const pad = read("web/js/gamepad.js");
  for (const box of [".modal-back", ".tour", ".sel-sheet-back", "dialog[open]", ".game-sheet-wrap", ".battle-wrap"]) {
    assert.ok(pad.includes(box), box);
  }
  for (const file of ["web/js/pages/library.js", "web/js/pages/vocab.js", "web/js/pages/chat.js", "web/js/game/battle-ui.js",
    "web/js/game/garden.js", "web/js/components/studycard.js", "web/js/components/ankisync.js"]) {
    assert.doesNotMatch(read(file), /(^|[^.\w])(window\.)?confirm\(/m, `${file}: the in-app yes/no box (modal.js confirmBox) instead`);
  }
  assert.match(read("web/js/components/modal.js"), /export function confirmBox/);
});

test("the phone and web app builds have the new files", () => {
  const shared = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/padcursor.js", "js/padscreens.js", "js/phrase.js", "js/components/modal.js", "js/components/selectsheet.js"]) {
    assert.ok(shared.includes(`"${f}"`), f);
  }
});
