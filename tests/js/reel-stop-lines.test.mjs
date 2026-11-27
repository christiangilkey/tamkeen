// Run with: node --test tests/js/
// The reel player (the owner, 2026-11-23): "it seems like the Reels player doesn't stop at the word when I click it. It
// continues to play the whole sentence. It should just stop at the word when I click it, unless I press the continue
// playing button on the pop-up", and "show 2 lines at a time instead ... scrolling one line at a time to the next is
// too fast". A tapped word now stops the reel itself, inside its window (the reel's time reached the app a moment late,
// so a pause sent from there let the next words play), always, until Continue or Play; and the words are two lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/** A reel page with one of the window's scripts in it, and a clock to move it on: `run(ms)` plays the video meanwhile. */
function reelWindow(script, path) {
  const timers = new Map();
  let nextId = 1;
  let now = 1000;
  const v = {
    readyState: 4, currentTime: 0, duration: 20, paused: true, muted: false, loop: false, playbackRate: 1,
    addEventListener(type, fn) { this[`on${type}`] = fn; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 }),
    attrs: {}, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, val) { this.attrs[k] = val; }, removeAttribute(k) { delete this.attrs[k]; },
    parentElement: null,
  };
  const element = () => ({ style: {}, attrs: {}, setAttribute(k, val) { this.attrs[k] = val; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(type, fn) { this[`on${type}`] = fn; }, appendChild() {} });
  const win = {
    Date: { now: () => now }, innerWidth: 400, innerHeight: 800,
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms, due: now + ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    location: { hostname: "www.instagram.com", pathname: path },
    addEventListener() {},
    document: {
      cookie: "ds_user_id=1",
      head: { appendChild() {} }, documentElement: { appendChild() {} },
      body: { style: {}, appendChild() {} },
      createElement: element,
      getElementById: () => null,
      querySelectorAll: (sel) => (sel === "video" ? [v] : []),
      querySelector: (sel) => (sel === "video" ? v : null),
    },
  };
  win.window = win;
  win.top = win;
  vm.runInNewContext(read(script), win);
  /** `ms` milliseconds pass, 5 at a time: the video plays on while it isn't paused, and the page's timers run. */
  const run = (ms) => {
    for (let k = 0; k < ms; k += 5) {
      now += 5;
      if (!v.paused) v.currentTime += 0.005 * v.playbackRate;
      for (const t of [...timers.values()]) if (now >= t.due) { t.due = now + t.ms; t.fn(); }
    }
  };
  return { win, v, run, timers, state: () => JSON.parse(win.__tkReelState()) };
}

for (const [script, path] of [["web/js/reel-embed.js", "/reel/DeWoCVZJA3M/embed/"], ["web/js/reel-page.js", "/reel/DeWoCVZJA3M/"]]) {
  test(`${script}: a tapped word stops the reel itself, right at its end`, () => {
    const w = reelWindow(script, path);
    w.run(400);               // the page's own checks: the reel starts
    w.v.currentTime = 6.0;    // ... and is a few seconds in, past the tapped word
    w.win.__tkReelDo("seek", 3.1);
    w.win.__tkReelDo("stopAt", 3.6);
    w.win.__tkReelDo("play");
    w.run(300);
    assert.equal(w.v.paused, false, "the word is playing");
    w.run(400);
    assert.equal(w.v.paused, true, "stopped at the word's end");
    assert.ok(w.v.currentTime >= 3.6 && w.v.currentTime < 3.63, `within a few hundredths of it (${w.v.currentTime.toFixed(3)})`);
    w.run(2000);
    assert.deepEqual([w.v.paused, w.state().paused], [true, true], "and stays stopped, also through the page's own checks");
    assert.equal(w.timers.size, 1, "nothing left watching but the page's own check");
    w.win.__tkReelDo("play");
    w.run(1000);
    assert.equal(w.v.paused, false, "Continue or Play carries on from there");
  });

  test(`${script}: a stop that was taken back, or is at an old place, never pauses the reel`, () => {
    const w = reelWindow(script, path);
    w.run(400);
    w.v.currentTime = 8;
    w.win.__tkReelDo("stopAt", 5); // the reel is already past it and the jump back hasn't come: not stopped there
    w.run(200);
    assert.equal(w.v.paused, false);
    w.win.__tkReelDo("seek", 4.5);
    w.win.__tkReelDo("stopAt", 0); // Continue pressed before the word was over: no stop
    w.run(1500);
    assert.equal(w.v.paused, false, "plays on");
    assert.equal(w.timers.size, 1);
  });
}

test("the web app's video and the phone build's stand-in stop by themselves the same way", () => {
  const web = read("mobile/src/js/web-reels.js");
  assert.match(web, /else if \(what === "stopAt"\) stopAtTime\(time\);/);
  assert.match(web, /if \(video\.currentTime < stopAt\) armed = true;\n\s*else if \(armed && !video\.paused\) \{ stopWatching\(\); video\.pause\(\); \}/);
  assert.match(web, /close\(\) \{ turn\+\+; stopWatching\(\);/, "nothing left watching once the player is closed");
  const app = read("mobile/src/js/app.js");
  assert.match(app, /if \(stopAt && s\.t >= stopAt\) \{ s\.t = stopAt; s\.paused = true; stopAt = 0; \}/);
});

test("in the reel player a tapped word always stops the reel at its end, and only Continue or Play go on", () => {
  const page = read("web/js/pages/reels.js");
  assert.match(page, /clipEnd = end \+ after;\n\s*clip = \{[^\n]*\};\n\s*surface\.do\("seek", clip\.from\);\n\s*surface\.do\("stopAt", clip\.end\);\n\s*surface\.do\("play"\);/);
  assert.doesNotMatch(page, /pauseAfterWord|pauseSwitch/, "no keep-playing choice in the reel player");
  assert.match(page, /function noClip\(\) \{\n\s*clipEnd = null;\n\s*if \(surface\) surface\.do\("stopAt", 0\);/);
  assert.match(page, /onPlayFrom: \(\) => \{ if \(target && surface\) \{ noClip\(\); surface\.do\("seek", cur\.starts\[target\.i\]\); surface\.do\("play"\); \} \}/,
    "Continue plays on from the word, with no stop");
  // A tap opens the popup and plays the word (define); closing the popup leaves the reel as it is, as in the other players.
  assert.match(page, /playClip\(\.\.\.wordClip\(\{ starts: cur\.starts, ends: cur\.ends, texts: cur\.texts, i, j, lang: cur\.lang \}\)\);\n\s*bubble\.show\(/);
  assert.doesNotMatch(page.slice(page.indexOf("const onOutside")), /^\s*const onOutside[^\n]*surface\.do\("play"\)/m);
  assert.match(page, /setActive\(bubble\.open && target && s\.paused \? target\.i : activeWordIndex\(cur\.starts, cur\.ends, s\.t, 1\.5\)\);/,
    "stopped, the tapped word stays lit (not the next one, which its sound runs a moment into)");
  assert.doesNotMatch(read("web/css/reels.css"), /wb-mode/, "the switch's styles went with it");
  assert.doesNotMatch(read("web/js/components/guideart.js"), /target: "\.wb-mode"/, "and its step in the reel player's guide");
});

test("where reels play the words are two lines, the one being said on top, moving up one line at a time", () => {
  const css = read("web/css/reels.css");
  assert.match(css, /\.reelplay:not\(\.no-video\) \.reel-words \{ flex: none; box-sizing: content-box; height: 3\.2em; \/\* two lines of 1\.6 \*\/\n\s*overflow-x: hidden; overflow-y: auto;[^\n]*\n\s*padding: 0 var\(--s-12\); line-height: 1\.6;/);
  assert.match(css, /\.reelplay:not\(\.no-video\) \.reel-words \.seg \{ display: inline; margin: 0; unicode-bidi: isolate; \}/, "sentences wrap like a paragraph");
  assert.doesNotMatch(css, /\.reelplay:not\(\.no-video\) \.reel-words \{[^}]*white-space: nowrap/, "no longer one line sliding sideways");
  const page = read("web/js/pages/reels.js");
  const keep = page.slice(page.indexOf("function keepInView(el)"), page.indexOf("function inSight(el)"));
  assert.match(keep, /const line = parseFloat\(cs\.lineHeight\) \|\| r\.height;/);
  assert.match(keep, /if \(Math\.abs\(to - wordsEl\.scrollTop\) > line \/ 3\) wordsEl\.scrollTo\(\{ top: to, behavior: "smooth" \}\);/,
    "a word on the line already at the top doesn't move them; one on the next line moves them up by a line, smoothly");
  assert.doesNotMatch(keep, /scrollBy\(\{ left:/, "not sideways any more");
});
