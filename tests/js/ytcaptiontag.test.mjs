// Run with: node --test tests/js/
// The "No captions · Gemini required" tag on lists of YouTube videos: which videos get it, how the
// answers are kept, and that a check that failed never tags (web/js/ytcaptiontag.js, ytcaptions.js
// checkCaptions, and the copy in web/js/youtube-browser.js that tags YouTube's own pages).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CLIENTS, CaptionError, captionVerdict, checkCaptions, dubbedAudio, fetchCaptions } from "../../web/js/ytcaptions.js";
import { AT_ONCE, DUB_TEXT, KEEP, PAUSE, TAG_TEXT, captionChecker, tagText } from "../../web/js/ytcaptiontag.js";

const TAUGHT = ["es", "ar", "fr", "ja", "zh", "ru", "tl", "la", "ko"];
const track = (languageCode, kind, extra = {}) => ({ baseUrl: `https://www.youtube.com/api/timedtext?v=x&lang=${languageCode}`, languageCode, kind, ...extra });

test("which caption lists count as captions, as the player judges them", () => {
  assert.equal(captionVerdict([], "ar", TAUGHT), "none", "no captions at all");
  assert.equal(captionVerdict([track("ar")], "ar", TAUGHT), "yes", "a person's Arabic captions");
  assert.equal(captionVerdict([track("ar", "asr")], "ar", TAUGHT), "yes", "YouTube's automatic Arabic captions");
  assert.equal(captionVerdict([track("ar-EG", "asr")], "ar", TAUGHT), "yes");
  assert.equal(captionVerdict([track("en", "asr")], "ar", TAUGHT), "yes", "YouTube's translation into Arabic counts: the player uses it");
  assert.equal(captionVerdict([track("en", undefined, { isTranslatable: false })], "ar", TAUGHT), "none", "only an English track that can't be translated");
  assert.equal(captionVerdict([track("ko", "asr", { isTranslatable: false })], "ar", TAUGHT), "other", "the player shows the spoken Korean instead");
  assert.equal(captionVerdict([track("it", "asr")], "la", TAUGHT), "none", "Latin: only a person's captions count");
  assert.equal(captionVerdict([track("la")], "la", TAUGHT), "yes");
  assert.equal(captionVerdict([track("fil", "asr")], "tl", TAUGHT), "yes", "YouTube's Filipino is the app's Tagalog");
  assert.equal(captionVerdict([{ languageCode: "ar", kind: "asr" }], "ar", TAUGHT), "none", "a track without an address can't be read");
});

// ----- the copy inside YouTube's pages (web/js/youtube-browser.js) must judge exactly the same -----
const browserSource = readFileSync(new URL("../../web/js/youtube-browser.js", import.meta.url), "utf8");

test("the copy in YouTube's pages judges every caption list as ytcaptions.js does", () => {
  const hooks = {};
  const win = { __tamkeenTestHooks: hooks, location: { hostname: "www.youtube.com", href: "https://www.youtube.com/", pathname: "/" },
    setInterval() {}, setTimeout() {}, clearTimeout() {}, URL, document: { querySelectorAll: () => [] }, addEventListener() {},
    __tamkeenBridge: "address" };
  win.window = win;
  win.top = win;
  vm.runInNewContext(browserSource, win, { filename: "youtube-browser.js" });
  assert.equal(typeof hooks.verdict, "function", "the page script exposes its copy to tests");
  const pieces = [
    track("ar"), track("ar", "asr"), track("ar-SA"), track("en"), track("en", "asr"), track("en", undefined, { isTranslatable: false }),
    track("ko", "asr", { isTranslatable: false }), track("de", undefined, { isTranslatable: false }), track("it", "asr"), track("la"),
    track("fil", "asr", { isTranslatable: false }), track("zh-Hans"), track("yue", "asr", { isTranslatable: false }), { languageCode: "ar" },
  ];
  let n = 0;
  for (const wanted of ["ar", "la", "tl", "zh", "ko", "en"]) {
    for (let mask = 0; mask < 1 << pieces.length; mask += 37) { // a spread of the 16 384 combinations
      const tracks = pieces.filter((_, i) => mask & (1 << i));
      assert.equal(hooks.verdict(tracks, wanted, TAUGHT), captionVerdict(tracks, wanted, TAUGHT), `${wanted}: ${JSON.stringify(tracks.map((t) => [t.languageCode, t.kind, t.isTranslatable]))}`);
      n++;
    }
  }
  assert.ok(n > 2000);
  const asked = browserSource.match(/var CLIENTS = (\[.*\]);/);
  assert.deepEqual(JSON.parse(asked[1].replace(/(\w+):/g, '"$1":')), CLIENTS, "it asks YouTube the same way as the app");
});

// ----- one video, as YouTube answers about it -----
function pretendYouTube(answers) {
  const seen = [];
  const request = async (req) => {
    seen.push(req);
    const client = JSON.parse(req.body).context.client.clientName;
    const a = typeof answers === "function" ? answers(client) : answers;
    if (a instanceof Error) throw a;
    if (typeof a === "number") return { status: a, text: "<html>Sorry</html>" };
    return { status: 200, text: JSON.stringify(a) };
  };
  return { request, seen };
}
const ok = (tracks, details = {}) => ({ playabilityStatus: { status: "OK" }, videoDetails: { title: "T", lengthSeconds: "300", ...details },
  captions: tracks ? { playerCaptionsTracklistRenderer: { captionTracks: tracks } } : undefined });
const check = (yt, language = "ar") => checkCaptions("lo3KyF50IGE", { language, taught: TAUGHT, request: yt.request });

test("a video is 'none' only when every way of asking says it has no captions", async () => {
  const yt = pretendYouTube(ok(null));
  assert.deepEqual(await check(yt), { captions: "none", seconds: 300, dub: false });
  assert.deepEqual(yt.seen.map((r) => JSON.parse(r.body).context.client.clientName), ["ANDROID", "IOS"]);
  assert.ok(yt.seen.every((r) => r.method === "POST" && r.url.startsWith("https://www.youtube.com/youtubei/v1/player")),
    "only the player's question: no captions, sound or video are downloaded");

  const second = pretendYouTube((client) => ok(client === "ANDROID" ? null : [track("ar", "asr")]));
  assert.equal((await check(second)).captions, "yes", "the second way found captions, as fetchCaptions would");
  assert.equal((await check(pretendYouTube(ok([track("en", undefined, { isTranslatable: false })])))).captions, "none");
  const one = pretendYouTube(ok([track("ar")]));
  assert.equal((await check(one)).captions, "yes");
  assert.equal(one.seen.length, 1, "one question when the first answer lists captions");
});

// The audio tracks YouTube lists in the same answer: [language id, is it the video's own sound].
const withAudio = (answer, tracks) => ({ ...answer, streamingData: { adaptiveFormats: [{ itag: 137 },
  ...tracks.map(([id, own]) => ({ itag: 251, audioTrack: { id: `${id}.${own ? 4 : 3}`, displayName: id, audioIsDefault: own } }))] } });

test("the same answer says whether the video is also dubbed in the language being learnt", async () => {
  const dub = async (answer, language = "ar") => (await check(pretendYouTube(answer), language)).dub;
  assert.equal(await dub(withAudio(ok([track("en", "asr")]), [["en", true], ["ar", false], ["es", false]])), true, "English video with an Arabic dub");
  assert.equal(await dub(withAudio(ok(null), [["en", true], ["ar", false]])), true, "no captions, but a dub");
  assert.equal(await dub(withAudio(ok([track("ar", "asr")]), [["ar", true], ["en", false]])), false, "Arabic is its own sound");
  assert.equal(await dub(withAudio(ok([track("en", "asr")]), [["en", true], ["es", false]])), false, "dubbed, but not in Arabic");
  assert.equal(await dub(withAudio(ok([track("en", "asr")]), [["en", true], ["es", false]]), "es"), true);
  assert.equal(await dub(ok([track("en", "asr")])), false, "one sound only");
  assert.equal(await dub(withAudio({ playabilityStatus: { status: "ERROR" } }, [["en", true], ["ar", false]])), false, "a failed check never says dubbed");
  const one = pretendYouTube(withAudio(ok([track("ar")]), [["en", true], ["ar", false]]));
  await check(one);
  assert.equal(one.seen.length, 1, "no extra question for it");
});

test("the copy in YouTube's pages finds a dub as ytcaptions.js does", () => {
  const hooks = {};
  const win = { __tamkeenTestHooks: hooks, location: { hostname: "www.youtube.com", href: "https://www.youtube.com/", pathname: "/" },
    setInterval() {}, setTimeout() {}, clearTimeout() {}, URL, document: { querySelectorAll: () => [] }, addEventListener() {},
    __tamkeenBridge: "address" };
  win.window = win;
  win.top = win;
  vm.runInNewContext(browserSource, win, { filename: "youtube-browser.js" });
  const pieces = [["en", true], ["ar", false], ["ar", true], ["es", false], ["fil", false], ["zh-Hans", false], ["en", false]];
  for (const wanted of ["ar", "en", "tl", "zh", "es"]) {
    for (let mask = 0; mask < 1 << pieces.length; mask++) {
      const data = withAudio({}, pieces.filter((_, i) => mask & (1 << i)));
      assert.equal(hooks.dubbed(data, wanted), !!dubbedAudio(data, wanted), `${wanted}: ${JSON.stringify(data.streamingData.adaptiveFormats)}`);
    }
  }
});

test("a check that failed is 'unknown', never 'none'", async () => {
  const unknown = async (answers, why) => assert.equal((await check(pretendYouTube(answers))).captions, "unknown", why);
  await unknown(new Error("offline"), "no connection");
  await unknown(429, "YouTube refused");
  await unknown((client) => (client === "IOS" ? 500 : ok(null)), "the second way failed: not sure there are none");
  await unknown({ playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } }, "the web app's go-between server refused");
  await unknown({ playabilityStatus: { status: "ERROR", reason: "Video unavailable" } }, "a removed video");
  await unknown({ playabilityStatus: { status: "OK" } }, "no details about the video");
  await unknown(ok(null, { isLiveContent: true, lengthSeconds: "0" }), "a live stream (Gemini can't caption one)");
  await unknown({ status: 200 }, "an answer that isn't YouTube's");
});

test("opening a video whose captions can't be used offers Gemini, as the tag says", async () => {
  // (youtube.js importVideo offers Gemini when the error carries `video`)
  for (const tracks of [[], [track("en", undefined, { isTranslatable: false })]]) {
    await assert.rejects(fetchCaptions("lo3KyF50IGE", { language: "ar", languageName: "Arabic", taught: ["ar"], request: pretendYouTube(ok(tracks)).request }),
      (e) => e instanceof CaptionError && ["no_captions", "no_language"].includes(e.code) && e.video && e.video.videoId === "lo3KyF50IGE" && e.video.duration === 300);
  }
});

test("the tag's words", () => {
  assert.equal(tagText({ captions: "none", seconds: 300 }), TAG_TEXT.nokey);
  assert.equal(TAG_TEXT.nokey, "No captions · Gemini required");
  assert.equal(tagText({ captions: "none", seconds: 300 }, { hasKey: true }), "No captions · Gemini will write them");
  assert.equal(tagText({ captions: "none", seconds: 2 * 3600 }, { hasKey: true }), "No captions on YouTube", "too long for Gemini");
  assert.equal(tagText({ captions: "none", seconds: 300 }, { made: true }), "", "Gemini's captions are already in the library");
  for (const captions of ["yes", "other", "unknown"]) assert.equal(tagText({ captions, seconds: 300 }), "", captions);
  assert.equal(tagText(null), "");
});

// ----- the checker: a few at a time, answers kept by video id -----
function pretendCheck(answer = { captions: "none", seconds: 60 }) {
  const calls = [];
  const pending = [];
  let running = 0;
  let most = 0;
  const check = (id) => {
    calls.push(id);
    running++;
    most = Math.max(most, running);
    return new Promise((resolve) => pending.push(() => { running--; resolve(typeof answer === "function" ? answer(id) : answer); }));
  };
  return { check, calls, finish: () => pending.splice(0).forEach((f) => f()), get most() { return most; } };
}
const settle = () => new Promise((r) => setImmediate(r));

test("videos are checked a few at a time, once each", async () => {
  const p = pretendCheck();
  const c = captionChecker({ check: p.check, scope: "ar" });
  const all = ["a", "b", "c", "d", "e", "a"].map((id) => c.want(id));
  await settle();
  assert.equal(p.calls.length, AT_ONCE, "at most three questions at once");
  while (p.calls.length < 5) { p.finish(); await settle(); }
  p.finish();
  const results = await Promise.all(all);
  assert.deepEqual(p.calls, ["a", "b", "c", "d", "e"], "the same video is asked once");
  assert.ok(results.every((r) => r.captions === "none"));
  assert.ok(p.most <= AT_ONCE);
  assert.deepEqual(await c.want("a"), { captions: "none", seconds: 60, dub: false });
  assert.equal(p.calls.length, 5, "a known answer isn't asked again");
});

test("answers last a while and survive a visit; failures don't", async () => {
  let t = 1_000_000;
  let saved = null;
  const store = { load: () => saved, save: (kept) => { saved = JSON.parse(JSON.stringify(kept)); } };
  const p = pretendCheck((id) => (id === "bad" ? { captions: "unknown", seconds: 0 } : { captions: id === "has" ? "yes" : "none", seconds: 60 }));
  const c = captionChecker({ check: p.check, scope: "ar", store, now: () => t });
  const asked = [c.want("has"), c.want("none"), c.want("bad")];
  await settle();
  p.finish();
  await Promise.all(asked);
  assert.deepEqual(Object.keys(saved).sort(), ["ar:has", "ar:none"], "a failed check is never stored");

  const again = captionChecker({ check: p.check, scope: "ar", store, now: () => t });
  assert.equal(again.known("none").captions, "none", "the next visit remembers");
  assert.equal(captionChecker({ check: p.check, scope: "es", store, now: () => t }).known("none"), null, "answers are per study language");
  assert.equal(c.known("bad").captions, "unknown");
  assert.equal(again.known("bad"), null, "a failed check isn't remembered by the next visit");
  t += KEEP.unknown + 1;
  assert.equal(c.known("bad"), null, "a failed check is tried again soon");
  t += KEEP.none;
  assert.equal(again.known("none"), null, "'no captions' is asked again after a few hours (YouTube adds them later)");
  assert.equal(again.known("has").captions, "yes");
});

test("a dubbed track is remembered with the answer", async () => {
  let saved = null;
  const store = { load: () => saved, save: (kept) => { saved = JSON.parse(JSON.stringify(kept)); } };
  const c = captionChecker({ check: async (id) => ({ captions: "yes", seconds: 60, dub: id === "dubbed" }), scope: "ar", store });
  assert.equal((await c.want("dubbed")).dub, true);
  assert.equal((await c.want("plain")).dub, false);
  const again = captionChecker({ check: async () => assert.fail("not asked again"), scope: "ar", store });
  assert.equal(again.known("dubbed").dub, true);
  assert.equal(again.known("plain").dub, false);
  assert.equal(DUB_TEXT, "{0} track available");
});

test("YouTube refusing again and again stops the checks for a while", async () => {
  let t = 0;
  const p = pretendCheck({ captions: "unknown", seconds: 0 });
  const c = captionChecker({ check: p.check, now: () => t, atOnce: 1 });
  const asked = ["1", "2", "3", "4", "5", "6"].map((id) => c.want(id));
  for (let i = 0; i < 6; i++) { await settle(); p.finish(); }
  const results = await Promise.all(asked);
  assert.equal(p.calls.length, 4, "after four failures in a row, the rest aren't asked");
  assert.ok(results.every((r) => r.captions === "unknown" && !tagText(r)), "and nothing is tagged");
  t += PAUSE + 1;
  c.want("7");
  await settle();
  assert.equal(p.calls.at(-1), "7", "asked again once the pause is over");
});

test("a video that left the screen before its turn isn't asked", async () => {
  const p = pretendCheck();
  const c = captionChecker({ check: p.check, atOnce: 1 });
  c.want("a");
  const b = c.want("b");
  c.drop("b");
  assert.equal(await b, null);
  await settle();
  p.finish();
  await settle();
  assert.deepEqual(p.calls, ["a"]);
});

// ----- YouTube's own pages in the app's browser (desktop and phones) -----
function youtubePage({ answers, cfg, links }) {
  const timers = [];
  const posts = [];
  const kept = new Map();
  const element = (tag) => {
    const el = { tag, style: {}, attrs: {}, children: [], isConnected: true, textContent: "", parentNode: null,
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); c.parentNode = this; c.isConnected = true; return c; },
      removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.isConnected = false; },
      attachShadow() { const root = element("shadow"); this.shadow = root; return root; } };
    return el;
  };
  const anchor = (href, top = 100) => Object.assign(element("a"), { href, querySelector: (s) => (s === "img" ? {} : null),
    getBoundingClientRect: () => ({ width: 320, top, bottom: top + 180 }) });
  const list = links.map(([href, top]) => anchor(href, top));
  const win = {
    location: { href: "https://www.youtube.com/results?search_query=x", hostname: "www.youtube.com", pathname: "/results", origin: "https://www.youtube.com" },
    URL, JSON, Promise, Date, Object, Number, String, setTimeout: () => 0, clearTimeout() {}, setInterval(fn) { timers.push(fn); return 0; },
    innerHeight: 800, addEventListener() {}, getComputedStyle: () => ({ position: "static" }),
    document: { createElement: element, body: element("body"), documentElement: element("html"), querySelectorAll: () => list },
    localStorage: { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)) },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: async (url, init) => {
      posts.push({ url, init });
      const id = JSON.parse(init.body).videoId;
      const a = answers(id, JSON.parse(init.body).context.client.clientName);
      if (a instanceof Error) throw a;
      return { status: typeof a === "number" ? a : 200, json: async () => a };
    },
    __tamkeenCaptionTag: cfg,
  };
  win.window = win;
  win.top = win;
  vm.runInNewContext(browserSource, win);
  const tagOf = (a) => a.children.find((c) => c.attrs["data-tamkeen"] === "captions");
  return {
    win, posts, list, kept,
    async tick() { timers.forEach((fn) => fn()); for (let i = 0; i < 6; i++) await settle(); timers.forEach((fn) => fn()); },
    tag: (i) => { const t = tagOf(list[i]); return t ? t.shadow.children[0].textContent : null; },
  };
}
const CFG = { lang: "ar", taught: TAUGHT, made: ["madeByGemin"], text: "بلا ترجمة · Gemini", long: "No captions on YouTube", max: 3600 };

test("YouTube's own lists: the videos with no captions get the tag, the rest don't", async () => {
  const answers = (id) => ({
    noCaptions1: ok(null), hasCaptions: ok([track("ar", "asr")]), refused0001: 429, offline0001: new Error("offline"),
    madeByGemin: ok(null), longVideo01: ok(null, { lengthSeconds: "7200" }), farDown0001: ok(null),
  })[id];
  const p = youtubePage({ answers, cfg: { ...CFG }, links: [
    ["https://www.youtube.com/watch?v=noCaptions1", 100], ["https://www.youtube.com/watch?v=hasCaptions", 300],
    ["https://www.youtube.com/watch?v=refused0001", 400], ["https://www.youtube.com/shorts/offline0001", 500],
    ["https://www.youtube.com/watch?v=madeByGemin", 600], ["https://www.youtube.com/watch?v=longVideo01", 700],
    ["https://www.youtube.com/watch?v=farDown0001", 5000],
  ] });
  assert.equal(p.win.__tamkeenCaptionTag, undefined, "the app's settings are taken off the page at once");
  await p.tick();
  assert.equal(p.tag(0), "بلا ترجمة · Gemini", "the tag in the user's language");
  assert.equal(p.tag(1), null, "YouTube has captions");
  assert.equal(p.tag(2), null, "YouTube refused: never tagged");
  assert.equal(p.tag(3), null, "no connection: never tagged");
  assert.equal(p.tag(4), null, "Gemini's captions are already in the library");
  assert.equal(p.tag(5), "No captions on YouTube", "too long for Gemini");
  assert.equal(p.tag(6), null, "far down the page: not asked yet");
  const asked = new Set(p.posts.map((r) => JSON.parse(r.init.body).videoId));
  assert.ok(!asked.has("farDown0001") && !asked.has("madeByGemin"));
  assert.ok(p.posts.every((r) => r.url === "https://www.youtube.com/youtubei/v1/player?prettyPrint=false" && r.init.method === "POST" && r.init.credentials === "omit"),
    "only the player's question, without the YouTube account's cookies");
  assert.equal(p.list[0].style.position, "relative", "the tag sits on the thumbnail");

  const before = p.posts.length;
  await p.tick();
  assert.equal(p.posts.length, before, "answers are kept: not asked again on the next check");
  assert.equal(p.tag(0), "بلا ترجمة · Gemini");
  assert.ok(JSON.parse(p.kept.get("tamkeen-captions"))["ar:noCaptions1"][0] === "none");
  assert.ok(!JSON.parse(p.kept.get("tamkeen-captions"))["ar:refused0001"], "a failure isn't stored");

  p.list[0].href = "https://www.youtube.com/watch?v=hasCaptions"; // YouTube reused the element for another video
  await p.tick();
  assert.equal(p.tag(0), null, "the tag goes with its video");
});

test("YouTube's own lists: a video also dubbed in the language being learnt says so", async () => {
  const answers = (id) => ({
    dubbedOnly1: withAudio(ok([track("en", "asr")]), [["en", true], ["ar", false]]),
    dubbedNoCap: withAudio(ok(null), [["en", true], ["ar", false]]),
    ownArabic01: withAudio(ok([track("ar", "asr")]), [["ar", true], ["en", false]]),
    madeByGemin: withAudio(ok(null), [["en", true], ["ar", false]]),
  })[id];
  const p = youtubePage({ answers, cfg: { ...CFG, dub: "مسار عربي متاح" }, links: [
    ["https://www.youtube.com/watch?v=dubbedOnly1", 100], ["https://www.youtube.com/watch?v=dubbedNoCap", 300],
    ["https://www.youtube.com/watch?v=ownArabic01", 500], ["https://www.youtube.com/watch?v=madeByGemin", 600],
  ] });
  await p.tick();
  const labels = (i) => { const t = p.list[i].children.find((c) => c.attrs["data-tamkeen"] === "captions"); return t ? t.shadow.children.map((l) => l.textContent) : []; };
  assert.deepEqual(labels(0), ["مسار عربي متاح"], "its own sound is English: the Arabic track is an extra");
  assert.deepEqual(labels(1), ["بلا ترجمة · Gemini", "مسار عربي متاح"], "both tags, one under the other");
  assert.deepEqual(labels(2), [], "Arabic is the video's own sound");
  assert.deepEqual(labels(3), ["مسار عربي متاح"], "Gemini's captions are in the library: only the dub tag");
  assert.equal(JSON.parse(p.kept.get("tamkeen-captions"))["ar:dubbedOnly1"][3], 1, "kept with the answer");
});

test("without the app's settings (an older app), YouTube's pages get no tags and nothing is asked", async () => {
  const p = youtubePage({ answers: () => ok(null), cfg: undefined, links: [["https://www.youtube.com/watch?v=noCaptions1", 100]] });
  await p.tick();
  assert.equal(p.tag(0), null);
  assert.equal(p.posts.length, 0);
});
