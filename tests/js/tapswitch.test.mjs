// Run with: node --test tests/js/
// "Tap words" on or off (web/js/components/tapswitch.js, prototype tap_switch): one choice for the whole app, kept on
// the device; while off the texts are plain (no popup, no word menu, no purple) and can be selected and copied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Small stand-ins for the browser: storage, the window's events, and elements with classes and listeners.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = new EventTarget();
class FakeEl {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    this.listeners = [];
    this.isConnected = true;
    this.innerHTML = "";
    this.title = "";
    const set = new Set();
    this.classList = {
      add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c),
      toggle: (c, on) => { const want = on === undefined ? !set.has(c) : !!on; if (want) set.add(c); else set.delete(c); return want; },
    };
  }
  set className(v) { for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture: !!capture }); }
  removeEventListener(type, fn, capture) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === !!capture)); }
  /** Sends an event the way the browser would reach this element's own listeners; says whether it got through. */
  fire(type) {
    let stopped = false;
    const ev = { type, currentTarget: this, stopImmediatePropagation: () => { stopped = true; }, stopPropagation: () => { stopped = true; } };
    for (const l of [...this.listeners.filter((x) => x.type === type && x.capture), ...this.listeners.filter((x) => x.type === type && !x.capture)]) {
      if (stopped) break;
      l.fn(ev);
    }
    return !stopped;
  }
  click() { return this.fire("click"); }
}
globalThis.document = { createElement: (tag) => new FakeEl(tag), getElementById: () => ({}), head: { append() {} } };

const proto = await import("../../web/js/prototype.js");
const tap = await import("../../web/js/components/tapswitch.js");
const { ICON_NAMES } = await import("../../web/js/icons.js");
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a prototype: hidden, and words always tappable, until prototype mode is on", () => {
  store.clear();
  assert.equal(proto.PROTOTYPES.tap_switch.released, false);
  store.set("tapWords", "off"); // (chosen while prototype mode was on)
  assert.equal(tap.tapWordsOn(), true, "with the prototype off the old choice does nothing");
  assert.equal(tap.tapSwitch(), null, "no button");
  const el = new FakeEl();
  const stop = tap.plainWhenOff([el]);
  assert.equal(el.classList.contains(tap.PLAIN_CLASS), false);
  assert.equal(el.listeners.length, 0, "nothing listens");
  assert.equal(el.click(), true);
  stop();
});

test("on by default; one choice for the whole app, kept on the device, announced when it changes", () => {
  store.clear();
  proto.setPrototype(true);
  assert.equal(tap.tapWordsOn(), true, "default: words can be tapped, as always");
  const heard = [];
  const on = (e) => heard.push(e.detail);
  window.addEventListener(tap.TAP_EVENT, on);
  tap.setTapWords(false);
  assert.equal(tap.tapWordsOn(), false);
  assert.equal(store.get("tapWords"), "off");
  tap.setTapWords(false); // no change: no event
  tap.setTapWords(true);
  assert.equal(tap.tapWordsOn(), true);
  assert.equal(store.has("tapWords"), false, "back on: nothing kept");
  assert.deepEqual(heard, [false, true]);
  window.removeEventListener(tap.TAP_EVENT, on);
  proto.setPrototype(false);
});

test("while off, a text is plain: taps, double clicks and right clicks never reach the word handlers", () => {
  store.clear();
  proto.setPrototype(true);
  const transcript = new FakeEl();
  const captions = new FakeEl();
  const looked = [];
  for (const el of [transcript, captions]) {
    el.addEventListener("click", () => looked.push("popup"));
    el.addEventListener("contextmenu", () => looked.push("menu"));
    el.addEventListener("dblclick", () => looked.push("loop"));
    el.addEventListener("pointerdown", () => looked.push("down"));
  }
  let closed = 0;
  const stop = tap.plainWhenOff([transcript, null, captions], { onPlain: () => { closed += 1; } });
  transcript.click();
  assert.deepEqual(looked, ["popup"], "on: a tap looks the word up");
  looked.length = 0;

  tap.setTapWords(false);
  for (const el of [transcript, captions]) assert.equal(el.classList.contains("plain-words"), true);
  assert.equal(closed, 1, "turning plain closes an open popup");
  for (const type of ["click", "contextmenu", "dblclick"]) assert.equal(transcript.fire(type), false, type);
  assert.equal(captions.click(), false);
  transcript.fire("pointerdown"); // (a book still sees the swipe that turns its page; the transcript still scrolls)
  assert.deepEqual(looked, ["down"], "only the press got through");
  looked.length = 0;

  tap.setTapWords(true);
  assert.equal(transcript.classList.contains("plain-words"), false);
  transcript.click();
  assert.deepEqual(looked, ["popup"], "back on: tapping works again");

  tap.setTapWords(false);
  stop(); // the screen is left
  assert.equal(transcript.classList.contains("plain-words"), false, "leaving takes the class away");
  looked.length = 0;
  transcript.click();
  assert.deepEqual(looked, ["popup"], "and its listeners");
  tap.setTapWords(true);
  assert.equal(closed, 2, "a stopped text no longer follows the switch");
  proto.setPrototype(false);
});

test("the button: filled while on, struck through while off, and a tap changes it", () => {
  store.clear();
  proto.setPrototype(true);
  assert.ok(ICON_NAMES.includes("tapword") && ICON_NAMES.includes("tapwordoff"));
  const b = tap.tapSwitch();
  assert.equal(b.getAttribute("aria-label"), "Tap words");
  assert.equal(b.classList.contains("on"), true);
  assert.equal(b.getAttribute("aria-pressed"), "true");
  assert.ok(b.innerHTML.includes("ic-tapword\""), "the pointer on a word");
  b.click();
  assert.equal(tap.tapWordsOn(), false);
  assert.equal(b.classList.contains("on"), false);
  assert.equal(b.getAttribute("aria-pressed"), "false");
  assert.ok(b.innerHTML.includes("ic-tapwordoff"), "struck through");
  assert.match(b.title, /plain/);
  const other = tap.tapSwitch(); // another screen's switch shows the same choice
  assert.equal(other.classList.contains("on"), false);
  b.click();
  assert.equal(tap.tapWordsOn(), true);
  assert.equal(other.classList.contains("on"), true, "and follows it");
  proto.setPrototype(false);
});

test("every view of tappable words has the switch and goes plain with it; the word gestures stand aside", () => {
  for (const p of ["web/js/pages/player.js", "web/js/pages/reader.js", "web/js/pages/book.js"]) {
    const src = read(p);
    assert.match(src, /import \{ plainWhenOff, tapSwitch \} from "\.\.\/components\/tapswitch\.js";/, p);
    assert.match(src, /tapSwitch\(\)/, `${p}: the button`);
    assert.match(src, /plainWhenOff\(\[/, `${p}: the text follows it`);
    assert.match(src, /stopPlain\(\);/, `${p}: and stops when the screen is left`);
  }
  assert.match(read("web/js/pages/player.js"), /plainWhenOff\(\[tr, capEl\]/, "the transcript and the video's captions");
  assert.match(read("web/js/pages/player.js"), /\$\("\.btnrow"\)\.append\(tapBtn\)/, "with the play controls");
  assert.match(read("web/js/pages/book.js"), /\$\("#next"\)\.after\(tapBtn\)/, "in the book's page bar");
  assert.match(read("web/js/pages/reader.js"), /reader-foot/, "in a bar under a page's text");
  assert.match(read("web/js/components/phrasepick.js"), /root\.classList\.contains\("plain-words"\)\) return;/,
    "a press on a plain text starts no phrase, so the system's selection can have it");
  const css = read("web/css/media.css");
  assert.match(css, /\.plain-words \.w:not\(\.cur\):not\(\.loop\) \{ color: inherit; background: none; \}/, "no purple; the spoken word stays lit");
  assert.match(css, /user-select: text/, "selectable");
  assert.ok(!/tap-switch[^}]*box-shadow/.test(css), "no shadow");
});
