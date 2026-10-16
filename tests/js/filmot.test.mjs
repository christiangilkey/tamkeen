// Run with: node --test tests/js/
// "Find in a video": the address the button opens, finding the word in a video's captions, and
// the script that hands a result from Filmot's page to the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { currentHunt, endHunt, filmotAddress, findSpoken, fold, lacksAudio, linesTranscript, startHunt } from "../../web/js/filmot.js";

const VIDEO = "lo3KyF50IGE";

test("the button opens Filmot's own results page for the word", () => {
  assert.equal(filmotAddress("كتاب"), `https://filmot.com/search/${encodeURIComponent("كتاب")}/1?gridView=1`);
  assert.equal(filmotAddress(" مُسْتَشْفَى "), filmotAddress("مستشفى"), "vowel marks are left out: captions have none");
  assert.equal(filmotAddress("على  فكرة"), `https://filmot.com/search/${encodeURIComponent('"على فكرة"')}/1?gridView=1`, "several words are looked for together");
  assert.equal(filmotAddress("either/or"), `https://filmot.com/search/${encodeURIComponent("either\\or")}/1?gridView=1`, "as Filmot's own search box writes a slash");
  assert.equal(filmotAddress(""), "https://filmot.com/");
});

test("only words with nothing to listen to get the button", () => {
  assert.equal(lacksAudio({ episode_id: null, start: null }), true, "typed in by hand");
  assert.equal(lacksAudio({ episode_id: 7, start: null }), true, "saved from a web page");
  assert.equal(lacksAudio({ episode_id: 7, start: 12.5 }), false, "saved from a player");
  assert.equal(lacksAudio({ episode_id: null, clip: 1, start: 0.3 }), false, "came from a friend with its own clip");
  assert.equal(lacksAudio({ episode_id: 7, start: 0 }), false, "the very first word of an episode");
});

test("text is compared without vowel marks, punctuation or spelling variants", () => {
  assert.equal(fold("الْمَدْرَسَةُ؟!"), fold("المدرسه"));
  assert.equal(fold("إلى"), fold("الي"));
  assert.equal(fold("Hello, World"), "hello world");
});

// Two caption lines, word by word, as GET /episodes/<id>/transcript returns them.
const data = {
  segments: [{ idx: 0, start: 1, end: 4, text: "ذهبت إلى المدرسة." }, { idx: 1, start: 20, end: 26, text: "والمدرسة بعيدة عن البيت يا صديقي" },
             { idx: 2, start: 40, end: 43, text: "المدرسة جميلة" }],
  words: {
    text: ["ذهبت", "إلى", "المدرسة.", "والمدرسة", "بعيدة", "عن", "البيت", "يا", "صديقي", "المدرسة", "جميلة"],
    start: [1, 2, 3, 20, 21, 22, 23, 24, 25, 40, 41],
    end: [2, 3, 4, 21, 22, 23, 24, 25, 26, 41, 43],
    seg: [0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2],
  },
};

test("the word is found with its own times and its whole sentence, as the player saves them", () => {
  assert.deepEqual(findSpoken(data, "المدرسة"), { start: 3, end: 4, sent_start: 1, sent_end: 4, sentence: "ذهبت إلى المدرسة." });
  assert.deepEqual(findSpoken(data, "الْمَدْرَسَة", 39), { start: 40, end: 41, sent_start: 40, sent_end: 43, sentence: "المدرسة جميلة" },
                   "said several times: the place nearest the moment the result pointed at");
  assert.equal(findSpoken(data, "المدرسة", 0).start, 3);
  assert.deepEqual(findSpoken(data, "عن البيت", 20), { start: 22, end: 24, sent_start: 20, sent_end: 26, sentence: "والمدرسة بعيدة عن البيت يا صديقي" },
                   "several words are found together");
});

test("a word only said with something joined on is still found; a word not said is not", () => {
  const joined = { segments: [data.segments[1]], words: { text: data.words.text.slice(3, 9), start: data.words.start.slice(3, 9),
                   end: data.words.end.slice(3, 9), seg: [1, 1, 1, 1, 1, 1] } };
  assert.equal(findSpoken(joined, "مدرسة").start, 20, "inside والمدرسة");
  assert.equal(findSpoken(data, "مستشفى"), null);
  assert.equal(findSpoken(data, ""), null);
  assert.equal(findSpoken({ segments: [], words: { text: [], start: [], end: [], seg: [] } }, "كتاب"), null);
});

test("the word being looked for is forgotten after half an hour", () => {
  startHunt({ id: 5, text: "كتاب" }, 1000);
  assert.equal(currentHunt(1000 + 29 * 60000).id, 5);
  assert.equal(currentHunt(1000 + 31 * 60000), null);
  startHunt({ id: 6, text: "قلم" });
  endHunt();
  assert.equal(currentHunt(), null);
});

// ----- the scripts that run inside the app's browser -----

/** A pretend browser window on `href` with `file` already run in it. */
function page(file, href, { bridge, api, find, nodes = [], ready = "complete" } = {}) {
  const source = readFileSync(new URL(`../../web/js/${file}`, import.meta.url), "utf8");
  const listeners = {};
  const gone = [];
  const timers = [];
  const address = new URL(href);
  const element = () => ({ style: {}, children: [], isConnected: true, textContent: "",
                           appendChild(c) { this.children.push(c); return c; }, attachShadow() { return element(); }, setAttribute() {} });
  const win = {
    location: { get href() { return address.href; }, set href(v) { gone.push(v); }, get hostname() { return address.hostname; },
                get pathname() { return address.pathname; }, get origin() { return address.origin; }, replace(v) { gone.push(v); } },
    URL, setTimeout: () => 0, clearTimeout() {}, history: { length: 2, back() { gone.push("back"); } },
    setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval(n) { timers[n - 1] = null; },
    document: { createElement: element, body: element(), documentElement: element(), querySelectorAll: () => nodes, readyState: ready },
    addEventListener(type, fn) { listeners[type] = fn; },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ text: async () => "" }),
  };
  win.window = win;
  win.top = win;
  if (bridge) win.__tamkeenBridge = bridge;
  if (api) win.pywebview = { api };
  if (find) win.__tamkeenFind = true;
  vm.runInNewContext(source, win);
  /** Let `ms` milliseconds of half-second ticks pass. */
  const wait = (ms) => { for (let t = 0; t < ms; t += 500) for (const fn of timers) if (fn) fn(); };
  /** Tap a link to `to`. Returns true when the script took the tap for itself. */
  const tap = (to) => {
    let taken = false;
    if (listeners.click) listeners.click({ button: 0, composedPath: () => [{ tagName: "SPAN" }, { tagName: "A", href: to }],
                                           preventDefault() { taken = true; }, stopImmediatePropagation() {} });
    return taken;
  };
  return { win, gone, tap, wait, listening: !!listeners.click };
}

test("on Filmot, tapping a result hands the video and its moment to the app (computer)", async () => {
  const asked = [];
  const p = page("filmot-browser.js", "https://filmot.com/search/x/1?gridView=1", { api: { watch_video: async (id, at) => { asked.push([id, at]); return { ok: true }; } } });
  assert.equal(p.tap(`https://www.youtube.com/watch?v=${VIDEO}&t=95s`), true);
  await new Promise((r) => setTimeout(r, 0)); // the script is "busy" until the app has answered
  assert.equal(p.tap(`https://youtu.be/${VIDEO}?t=1m35s`), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.tap(`https://www.youtube.com/watch?v=${VIDEO}`), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, [[VIDEO, 95], [VIDEO, 95], [VIDEO, 0]], "no moment in the link is sent as 0, never left out");
  assert.equal(p.tap("https://filmot.com/about"), false, "Filmot's own links are left alone");
  assert.equal(p.tap("https://www.youtube.com/@channel"), false, "so is a link that is not a video");
  assert.deepEqual(p.gone, []);
});

test("on Filmot, the phone is handed the video through the made-up address", () => {
  const p = page("filmot-browser.js", "https://filmot.com/search/x/1", { bridge: "address" });
  assert.equal(p.tap(`https://www.youtube.com/watch?v=${VIDEO}&t=3725`), true);
  assert.deepEqual(p.gone, [`tamkeen-video://watch?v=${VIDEO}&t=3725`]);
});

test("the Filmot script does nothing on any other website", () => {
  assert.equal(page("filmot-browser.js", "https://www.youtube.com/results?search_query=x").listening, false);
  assert.equal(page("filmot-browser.js", "https://notfilmot.com/search/x/1").listening, false);
  assert.equal(page("filmot-browser.js", "https://filmot.com.example.org/").listening, false);
});

test("a result that ends up on YouTube's own page still carries its moment", () => {
  const asked = [];
  page("youtube-browser.js", `https://www.youtube.com/watch?v=${VIDEO}&t=95s`, { api: { watch_video: async (...args) => { asked.push(args); return { ok: true }; } } });
  page("youtube-browser.js", `https://www.youtube.com/watch?v=${VIDEO}`, { api: { watch_video: async (...args) => { asked.push(args); return { ok: true }; } } });
  assert.deepEqual(asked, [[VIDEO, 95], [VIDEO]], "a page without a moment is handed over as before");
  const phone = page("youtube-browser.js", `https://m.youtube.com/watch?v=${VIDEO}&t=1m5s`, { bridge: "address" });
  assert.deepEqual(phone.gone, [`tamkeen-video://watch?v=${VIDEO}&t=65`]);
});

// ----- "Find in a video" takes the results by itself -----
// What a Filmot results page could show: a thumbnail, links to moments, an embedded player.
const A = "aaaaaaaaaaa";
const B = "bbbbbbbbbbb";
const C = "ccccccccccc";
const shown = [
  { tagName: "A", href: "https://filmot.com/about" },
  { tagName: "IMG", getAttribute: (k) => (k === "data-src" ? `https://i.ytimg.com/vi/${A}/mqdefault.jpg` : null) },
  { tagName: "A", href: `https://www.youtube.com/watch?v=${A}&t=42s` },
  { tagName: "A", href: `https://www.youtube.com/watch?v=${A}&t=90s` },
  { tagName: "IFRAME", getAttribute: () => `https://www.youtube.com/embed/${B}?start=7` },
  { tagName: "A", href: `https://youtu.be/${C}` },
  { tagName: "IMG", getAttribute: () => "https://filmot.com/logo.png" },
];

test("opened to find a word, the results page hands over its videos top first, once (computer)", async () => {
  const asked = [];
  const p = page("filmot-browser.js", "https://filmot.com/search/x/1?gridView=1",
                 { find: true, nodes: shown, api: { find_results: async (list) => { asked.push(JSON.parse(JSON.stringify(list))); return { ok: true }; } } });
  p.wait(1000);
  assert.deepEqual(asked, [[{ id: A, at: 42 }, { id: B, at: 7 }, { id: C, at: 0 }]], "a video's first moment; Filmot's own links and pictures left out");
  p.wait(10000);
  assert.equal(asked.length, 1, "only once per page");
});

test("opened to find a word, the phone is handed the list through the made-up address", () => {
  const p = page("filmot-browser.js", "https://filmot.com/search/x/1", { find: true, bridge: "address", nodes: shown });
  p.wait(1000);
  assert.deepEqual(p.gone, [`tamkeen-video://find?c=${A}.42,${B}.7,${C}.0`]);
});

test("the results are only taken once the page has loaded, and an empty page says so after a while", () => {
  const asked = [];
  const api = { find_results: async (list) => { asked.push(JSON.parse(JSON.stringify(list))); return { ok: false, error: "none" }; } };
  const loading = page("filmot-browser.js", "https://filmot.com/search/x/1", { find: true, nodes: shown, ready: "loading", api });
  loading.wait(5000);
  assert.deepEqual(asked, [], "nothing while the page is still loading");
  const empty = page("filmot-browser.js", "https://filmot.com/search/x/1", { find: true, nodes: [], api });
  empty.wait(5500);
  assert.deepEqual(asked, [], "results may still be on their way");
  empty.wait(1000);
  assert.deepEqual(asked, [[]], "then the app is told there were none");
});

test("nothing is taken by itself unless the browser was opened to find a word, or off the results page", () => {
  const asked = [];
  const api = { find_results: async (list) => { asked.push(JSON.parse(JSON.stringify(list))); return { ok: true }; } };
  page("filmot-browser.js", "https://filmot.com/search/x/1", { nodes: shown, api }).wait(20000);
  page("filmot-browser.js", "https://filmot.com/captcha-verify", { find: true, nodes: shown, api }).wait(20000);
  page("filmot-browser.js", "https://www.youtube.com/results?search_query=x", { find: true, nodes: shown, api }).wait(20000);
  assert.deepEqual(asked, [], "the human check is the user's to answer; nothing happens on it");
});

test("a video's caption lines take the shape of a stored transcript", () => {
  const lines = [
    { start: 3.2, end: 5.0, text: "أنا بقيت عمو؟!", words: [[3.2, 3.8, "أنا"], [3.8, 4.4, " بقيت "], [4.4, 5.0, "عمو؟!"]] },
    { start: 0.8, end: 3.2, text: "عمو! لو سمحت!", words: [[0.8, 1.5, "عمو!"], [1.5, 2.2, "لو"], [2.2, 3.2, "سمحت!"]] },
    { start: 6, end: 7, text: "", words: [] },
  ];
  const t = linesTranscript(lines);
  assert.deepEqual(t.segments.map((s) => [s.idx, s.text]), [[0, "عمو! لو سمحت!"], [1, "أنا بقيت عمو؟!"]], "in time order, empty lines left out");
  assert.deepEqual(t.words.text, ["عمو!", "لو", "سمحت!", "أنا", "بقيت", "عمو؟!"]);
  assert.deepEqual(t.words.seg, [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(findSpoken(t, "بقيت"), { start: 3.8, end: 4.4, sent_start: 3.2, sent_end: 5.0, sentence: "أنا بقيت عمو؟!" },
                   "the card's sentence starts where its line starts");
});
