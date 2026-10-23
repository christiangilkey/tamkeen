// Run with: node --test tests/js/
// Netflix: the browse address and language names (netflix.js), where it can play, the track choice
// and title descriptions shared by the two scripts that run inside Netflix's pages
// (netflix-common.js), those scripts against pretend pages, and the media object the player drives
// (nfmedia.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { EXTENSION_PAGE, EXTENSION_STORES, browseAddresses, browseStart, browserTexts, drmAvailable, extensionBrowserTexts, extensionHere,
  extensionLink, languageNames, subtitleNote, unavailableReason, unavailableText } from "../../web/js/netflix.js";
import { coveredBy, createNetflixMedia, watchPlacement } from "../../web/js/nfmedia.js";

const read = (name) => readFileSync(new URL(`../../web/js/${name}`, import.meta.url), "utf8");
const COMMON = read("netflix-common.js");
const PLAYER = read("netflix-player.js");
const BROWSER = read("netflix-browser.js");

/** netflix-common.js's rules, run as the windows run them. */
/** A plain copy (objects made inside the pretend windows have another realm's prototypes). */
const J = (x) => JSON.parse(JSON.stringify(x));

function lib() {
  const win = { URL };
  win.window = win;
  vm.runInNewContext(COMMON, win);
  return win.__tamkeenNetflixLib;
}

// Netflix's real subtitle list for a Lebanese series, as its player listed it (2026-10-21, in a
// test window with the owner's account; trimmed). "Off" carries the soundtrack's language and was
// NOT marked as the "none" track.
const REAL_TRACKS = [
  ["ar-LB", "Off", "PRIMARY"], ["ar-LB", "Arabic (Lebanon)", "ASSISTIVE"], ["ar-LB", "Arabic (Lebanon)", "PRIMARY"], ["ar", "Arabic", "PRIMARY"],
  ["en", "English", "ASSISTIVE"], ["es", "Spanish (Latin America)", "PRIMARY"], ["zh-Hant", "Chinese (Traditional)", "PRIMARY"],
  ["en", "English", "PRIMARY"], ["zh-Hans", "Chinese (Simplified)", "PRIMARY"], ["fil", "Filipino", "PRIMARY"], ["fr", "French", "PRIMARY"],
  ["ja", "Japanese", "PRIMARY"], ["ko", "Korean", "PRIMARY"], ["pt-BR", "Portuguese (Brazil)", "PRIMARY"], ["pt", "Portuguese (Portugal)", "PRIMARY"],
  ["ru", "Russian", "PRIMARY"], ["es-ES", "Spanish (Spain)", "PRIMARY"], ["th", "Thai", "PRIMARY"],
].map(([bcp47, displayName, trackType], i) => ({ trackId: `T${i}`, bcp47, displayName, trackType, isNoneTrack: false,
  isForcedNarrative: false, isImageBased: false }));

// ---------- netflix.js ----------

test("Open Netflix starts on titles by language", () => {
  assert.deepEqual(browseAddresses(), ["https://www.netflix.com/browse/original-audio", "https://www.netflix.com/browse/audio",
    "https://www.netflix.com/browse/subtitles"]);
  assert.equal(browseStart(), "https://www.netflix.com/browse/original-audio");
  assert.equal(browseStart("http://127.0.0.1:8931/"), "http://127.0.0.1:8931/browse/original-audio");
});

test("the names Netflix's language menu may use for each language", () => {
  assert.deepEqual(languageNames("ar"), ["Arabic", "العربية"]);
  assert.deepEqual(languageNames("zh"), ["Mandarin", "Chinese", "Cantonese", "中文"]);
  assert.deepEqual(languageNames("tl"), ["Filipino", "Tagalog"], "no name twice");
  assert.deepEqual(languageNames("pt"), ["Portuguese", "Brazilian Portuguese", "Português (Brasil)"]);
  assert.deepEqual(languageNames("ko"), ["Korean", "한국어"]);
  for (const lang of ["es", "fr", "ja", "ru", "it", "ca", "ceb", "th", "de", "fa", "hi", "en"]) {
    const names = languageNames(lang);
    assert.ok(names.length >= 1 && names.every((n) => n.length <= 40 && /^[\p{L}\p{M} ()'.-]+$/u.test(n)), lang);
  }
});

test("where Netflix can play, and what is said elsewhere", () => {
  assert.equal(unavailableReason({ platform: "desktop", overlay: true, drm: true }), "");
  assert.equal(unavailableReason({ platform: "desktop", overlay: true, drm: false }), "no-drm");
  assert.equal(unavailableReason({ platform: "desktop", overlay: false }), "desktop-os");
  assert.equal(unavailableReason({ platform: "android" }), "android");
  assert.equal(unavailableReason({ platform: "android", ios: true }), "iphone");
  assert.equal(unavailableReason({ platform: "android", web: true, phone: true }), "web-phone");
  assert.equal(unavailableReason({ platform: "android", web: true, ios: true }), "web-phone");
  assert.equal(unavailableReason({ platform: "android", web: true }), "web-computer");
  assert.equal(unavailableReason({ platform: "android", web: true, extension: true }), "", "the web app on a computer, with the extension");
  assert.equal(unavailableReason({ platform: "android", web: true, phone: true, extension: true }), "web-phone", "never on a phone");
  assert.equal(unavailableReason({ platform: "android", extension: true }), "android");
  for (const reason of ["android", "iphone", "web-phone", "desktop-os", "no-drm", "?"]) {
    const { title, lines } = unavailableText(reason);
    assert.ok(title && lines.length === 2 && lines.every((l) => l.length > 20), reason);
    assert.match(lines[1], /Windows computer/);
  }
  const web = unavailableText("web-computer");
  assert.match(web.title, /extension/);
  assert.match(web.lines[0], /browser extension/);
  assert.notEqual(unavailableText("android").lines[0], unavailableText("iphone").lines[0]);
});

test("the extension: where to get it, and whether it is here", () => {
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
  assert.equal(extensionLink(chrome), EXTENSION_PAGE, "not in a store yet: the install page");
  assert.equal(extensionLink(chrome, "es"), `${EXTENSION_PAGE}?lang=es`, "in the user's language");
  assert.equal(extensionLink(`${chrome} Edg/141.0`, "en"), EXTENSION_PAGE);
  assert.equal(extensionLink(chrome, "<x>"), EXTENSION_PAGE);
  assert.ok(Object.values(EXTENSION_STORES).every((v) => v === "" || /^https:\/\//.test(v)));
  assert.equal(extensionHere({ documentElement: { dataset: { tamkeenExtension: "0.34.2" } } }), true);
  assert.equal(extensionHere({ documentElement: { dataset: {} } }), false);
  assert.equal(extensionHere(null), false);
  const texts = extensionBrowserTexts("ar");
  assert.match(texts.tap, /subtitle bar/);
  assert.equal(texts.signin, browserTexts("ar").signin);
});

test("in Netflix's page: the language can arrive after the page script starts (the extension)", () => {
  const page = watchPage("https://www.netflix.com/watch/81946364", { lang: "" });
  page.tick();
  assert.deepEqual(page.log, [], "nothing chosen without a language");
  page.win.__tamkeenNetflixCfg.lang = "ar";
  page.tick(); // the soundtrack (already Arabic)
  page.tick();
  assert.deepEqual(page.log, ["text T2"], "then the subtitles in it");
});

test("the extension's Netflix tab: the language menu only, titles left to Netflix", () => {
  const page = browsePage("https://www.netflix.com/browse/original-audio", { later: true,
    links: [["English", "/browse/original-audio/en"], ["Arabic", "/browse/original-audio/ar"]] });
  assert.equal(page.active, false, "waits for its settings");
  assert.equal(typeof page.win.__tamkeenNetflixStart, "function");
  page.win.__tamkeenNetflixStart({ lang: "ar", names: ["Arabic"], hosts: ["www.netflix.com"], browse: [], text: {}, handOver: false });
  assert.deepEqual(page.clicked, ["Arabic"], "the language chosen as on the computer");
  const e = page.click({ tagName: "A", href: "https://www.netflix.com/watch/80001001", getAttribute: () => null, querySelector: () => null, closest: () => null });
  assert.ok(!e.prevented, "a title picked plays right there, in Netflix's player");
  const watch = browsePage("https://www.netflix.com/watch/81946364", { later: true });
  watch.win.__tamkeenNetflixStart({ lang: "ar", names: ["Arabic"], hosts: ["www.netflix.com"], browse: [], text: {}, handOver: false });
  assert.deepEqual([watch.watched, watch.went], [[], []], "a watch page stays as it is");
});

test("the notes say what happened to the subtitles and the soundtrack", () => {
  const playing = (extra) => ({ page: "watch", video: true, ...extra });
  assert.deepEqual(subtitleNote(playing({ subs: { status: "chosen" } }), { words: 0, lang: "ar" }),
    { sound: "", subs: "Getting Netflix's Arabic subtitles…" });
  assert.deepEqual(subtitleNote(playing({ subs: { status: "chosen" } }), { words: 120, lang: "ar" }), { sound: "", subs: "" });
  assert.equal(subtitleNote({ page: "login", subs: { status: "waiting" } }, { lang: "ar" }).subs, "", "nothing is being got while Netflix wants a sign-in");
  assert.match(subtitleNote(playing({ subs: { status: "none" } }), { lang: "ar" }).subs, /no Arabic subtitles for this title/);
  assert.match(subtitleNote(playing({ subs: { status: "image" } }), { lang: "ja" }).subs, /only as pictures/);
  assert.match(subtitleNote(playing({ subs: { status: "failed" } }), { lang: "es" }).subs, /didn't switch its subtitles to Spanish/);
  assert.deepEqual(subtitleNote(playing({ audio: { status: "switched" }, subs: { status: "chosen" } }), { words: 5, lang: "ar" }),
    { sound: "Playing Netflix's Arabic soundtrack.", subs: "" });
});

test("protected video: asks for the systems Netflix uses", async () => {
  const asked = [];
  const nav = { requestMediaKeySystemAccess: async (s) => { asked.push(s); if (s !== "com.microsoft.playready.recommendation") throw new Error("no"); } };
  assert.equal(await drmAvailable(nav), true);
  assert.deepEqual(asked, ["com.widevine.alpha", "com.microsoft.playready.recommendation"]);
  assert.equal(await drmAvailable({ requestMediaKeySystemAccess: async () => { throw new Error("none"); } }), false);
  assert.equal(await drmAvailable({}), false);
  assert.equal(await drmAvailable(null), false);
});

// ---------- netflix-common.js ----------

test("subtitles: the language being learned, never Off or the forced lines, the dialect being heard", () => {
  const L = lib();
  const pick = (lang, audio) => { const c = L.chooseTextTrack(REAL_TRACKS, lang, audio); return c && `${c.track.bcp47} ${c.track.displayName} ${c.track.trackType}`; };
  assert.equal(pick("ar", "ar-LB"), "ar-LB Arabic (Lebanon) PRIMARY", "not 'Off', though it is ar-LB and PRIMARY and not marked as none");
  assert.equal(pick("ar", "en"), "ar-LB Arabic (Lebanon) PRIMARY", "Netflix's order when the soundtrack isn't Arabic");
  assert.equal(pick("es", "en"), "es Spanish (Latin America) PRIMARY");
  assert.equal(pick("zh", "zh"), "zh-Hans Chinese (Simplified) PRIMARY", "the app teaches simplified characters");
  assert.equal(pick("pt", "en"), "pt-BR Portuguese (Brazil) PRIMARY", "the app's Portuguese is Brazil's");
  assert.equal(pick("tl", "en"), "fil Filipino PRIMARY");
  assert.equal(pick("en", "ar-LB"), "en English PRIMARY", "ordinary subtitles before those for the hard of hearing");
  assert.equal(pick("fa", "en"), null);
  assert.equal(pick("", "en"), null);
  const t = (bcp47, extra = {}) => ({ bcp47, displayName: bcp47, trackType: "PRIMARY", ...extra });
  assert.equal(L.chooseTextTrack([t("ar", { isForcedNarrative: true }), t("ar", { isNoneTrack: true })], "ar", "ar"), null);
  const img = L.chooseTextTrack([t("ja", { isImageBased: true })], "ja", "ja");
  assert.equal(img.image, true, "only as pictures: said, not read");
  assert.equal(L.chooseTextTrack([t("ja", { isImageBased: true }), t("ja", { trackType: "ASSISTIVE" })], "ja", "ja").image, false);
  assert.equal(L.chooseTextTrack([t("ar-EG"), t("ar")], "ar", "ar").track.bcp47, "ar", "the dialect heard first");
  for (const off of ["Off", "Aus", "Desactivados", "Désactivés", "オフ", "关闭", "إيقاف"]) assert.ok(L.isOff({ displayName: off }), off);
  assert.ok(!L.isOff({ displayName: "Arabic" }) && L.isOff({ displayName: "Arabic", isNoneTrack: true }));
});

test("soundtrack: switched to the language being learned, never to audio description", () => {
  const L = lib();
  const tracks = [{ bcp47: "en", displayName: "English [Original]", isNative: true }, { bcp47: "ar", displayName: "Arabic - Audio Description" },
    { bcp47: "ar", displayName: "Arabic" }];
  assert.equal(L.chooseAudioTrack(tracks, "ar", tracks[0]).displayName, "Arabic");
  assert.equal(L.chooseAudioTrack(tracks, "ar", tracks[2]), null, "already Arabic");
  assert.equal(L.chooseAudioTrack(tracks, "fr", tracks[0]), null, "no French soundtrack");
  assert.equal(L.chooseAudioTrack([{ bcp47: "ar", displayName: "Arabic", trackType: "ASSISTIVE" }], "ar", tracks[0]), null);
  assert.equal(L.chooseAudioTrack([{ bcp47: "es-ES", displayName: "Spanish (Spain)" }, { bcp47: "es", displayName: "Spanish", isNative: true }], "es", tracks[0]).bcp47, "es");
});

test("subtitles: closed captions and the forced lines are never the first choice", () => {
  const L = lib();
  const tr = (trackId, displayName, extra = {}) => ({ trackId, bcp47: "en", displayName, trackType: "PRIMARY", ...extra });
  const pick = (list) => { const c = L.chooseTextTrack(list, "en", "en"); return c && c.track.trackId; };
  assert.equal(pick([tr("a", "English [CC]"), tr("b", "English", { rawTrackType: "subtitles" })]), "b", "'[CC]' in the name");
  assert.equal(pick([tr("c", "English", { rawTrackType: "closedcaptions" }), tr("d", "English (US)")]), "d", "Netflix's closed-captions kind");
  assert.equal(pick([tr("e", "English (SDH)"), tr("f", "English", { trackType: "ASSISTIVE" }), tr("g", "English")]), "g");
  assert.equal(pick([tr("h", "English [CC]")]), "h", "captions when there is nothing else");
  assert.equal(pick([tr("i", "English", { isForcedNarrative: true })]), null, "the forced lines alone: none");
  assert.ok(L.isCaptions({ trackType: "ASSISTIVE" }) && L.isCaptions({ displayName: "Deutsch [CC]" }) && !L.isCaptions({ displayName: "English" }));
});

test("the menus' tracks: Netflix's lists, keys, the one in use, Off", () => {
  const L = lib();
  const text = L.menuTracks(REAL_TRACKS, "text");
  assert.equal(text.length, REAL_TRACKS.length - 1, "Netflix's 'Off' is left out (the menu has its own)");
  assert.deepEqual(J(text[0]), { id: "T1", bcp47: "ar-LB", lang: "ar", name: "Arabic (Lebanon)", cc: true, image: false, described: false, native: false });
  assert.equal(text.find((x) => x.bcp47 === "fil").lang, "tl", "Netflix's Filipino is Tamkeen's Tagalog");
  assert.deepEqual(J(L.menuTracks([{ trackId: "F", bcp47: "en", displayName: "English", isForcedNarrative: true }, null, "x"], "text")), []);
  const audio = L.menuTracks([{ bcp47: "en", displayName: "English [Original]", isNative: true }, { bcp47: "en", displayName: "English - Audio Description" }], "audio");
  assert.deepEqual(J(audio.map((x) => [x.id, x.described, x.native])), [["#0", false, true], ["#1", true, false]], "no trackId: keyed by place");
  assert.equal(L.currentKey(REAL_TRACKS, REAL_TRACKS[7], "text"), "T7");
  assert.equal(L.currentKey(REAL_TRACKS, { trackId: "T5", bcp47: "es" }, "text"), "T5", "a copy of the track, by its trackId");
  assert.equal(L.currentKey(REAL_TRACKS, REAL_TRACKS[0], "text"), "off", "Netflix's Off (named so)");
  assert.equal(L.currentKey(REAL_TRACKS, { trackId: "X", bcp47: "ar", isForcedNarrative: true }, "text"), "off", "only the forced lines: off");
  assert.equal(L.currentKey(REAL_TRACKS, null, "text"), "");
  assert.equal(L.currentKey([{ bcp47: "ja", displayName: "Japanese" }], { bcp47: "ja", displayName: "Japanese" }, "audio"), "#0");
  assert.equal(L.findTrack(REAL_TRACKS, "T9").bcp47, "fil");
  assert.equal(L.findTrack(REAL_TRACKS, "nope"), null);
  assert.equal(L.offTrack(REAL_TRACKS).trackId, "T0");
  assert.equal(L.offTrack([{ trackId: "O", displayName: "Off" }, { trackId: "N", isNoneTrack: true }]).trackId, "N", "the 'none' track first");
  assert.equal(L.offTrack([]), null);
});

test("the automatic choice: once per title, again when the language changes, never over the viewer's own", () => {
  const L = lib();
  const c = {};
  assert.deepEqual(J(L.planChoice(c, "s1", "ar")), { audio: true, text: true }, "a title starts: both");
  assert.deepEqual(J(L.planChoice(c, "s1", "ar")), { audio: false, text: false }, "once: never forced again");
  assert.deepEqual(J(L.planChoice(c, "s1", "")), { audio: false, text: false }, "no language known: nothing");
  assert.equal(L.choseByHand(c, "text"), false);
  assert.deepEqual(J(L.planChoice(c, "s1", "ja")), { audio: true, text: false }, "the language changed: not the subtitles chosen by hand");
  assert.equal(L.choseByHand(c, "audio"), false, "subtitles chosen by hand stay after a new soundtrack");
  assert.deepEqual(J(L.planChoice(c, "s1", "fr")), { audio: false, text: false }, "both chosen by hand: nothing");
  assert.deepEqual(J(L.planChoice(c, "s2", "fr")), { audio: true, text: true }, "the next title: chosen afresh");
  const d = {};
  L.planChoice(d, "x", "ar");
  assert.equal(L.choseByHand(d, "audio"), true, "a new soundtrack by hand: the learning language's subtitles once more");
});

test("a title's description: a film, an episode, a series opened by its own number", () => {
  const L = lib();
  const film = L.titleInfo({ type: "movie", title: "بيت الجدة", runtime: 5400, boxart: [{ url: "http://x/a.jpg" }, { url: "https://occ/b.jpg" }] }, "80001001");
  assert.equal(film.title, "بيت الجدة");
  assert.equal(film.duration, 5400);
  assert.equal(film.image, "https://occ/b.jpg", "only https pictures");
  const show = { type: "show", title: "حكايات الحي", currentEpisode: 80002002, boxart: [{ url: "https://occ/show.jpg" }],
    seasons: [{ seq: 1, episodes: [{ id: 80002001, seq: 1, title: "الصباح", runtime: 1500 }, { episodeId: 80002002, seq: 2, title: "المساء",
      stills: [{ url: "https://occ/e2.jpg" }] }] }] };
  const ep1 = L.titleInfo(show, "80002001");
  assert.deepEqual([ep1.id, ep1.show, ep1.season, ep1.episode, ep1.episode_title, ep1.duration, ep1.image],
    ["80002001", "حكايات الحي", 1, 1, "الصباح", 1500, "https://occ/show.jpg"]);
  const next = L.titleInfo(show, "80002000");
  assert.deepEqual([next.id, next.episode, next.image], ["80002002", 2, "https://occ/e2.jpg"], "the episode Netflix plays next");
  assert.equal(L.titleInfo(null, "1").title, "");
  assert.equal(L.watchId("/watch/81946364?trackId=264163088&tctx=x"), "81946364");
  assert.equal(L.watchId("https://www.netflix.com/title/81946364"), "");
});

// ---------- netflix-player.js (inside Netflix's watch page, in the video window) ----------

function watchPage(href, { tracks = REAL_TRACKS, audio = null, prompt = false, lang = "ar" } = {}) {
  let now = 1000;
  const log = [];
  const timers = [];
  const classes = new Set();
  let currentAudio = audio || { bcp47: "ar-LB", displayName: "Arabic (Lebanon) [Original]" };
  const audioList = [currentAudio, { bcp47: "ar", displayName: "Arabic" }, { bcp47: "en", displayName: "English" }];
  let currentText = tracks[0];
  let sid = "s1";
  const video = { duration: 1500, ended: false, playbackRate: 1 };
  let t = 12000;
  let paused = false;
  const p = {
    getCurrentTime: () => t, seek: (ms) => { log.push(`seek ${ms}`); t = ms; }, play: () => { log.push("play"); paused = false; },
    pause: () => { log.push("pause"); paused = true; }, isPaused: () => paused, getPlaybackRate: () => 1,
    setPlaybackRate: (r) => log.push(`rate ${r}`), getTextTrackList: () => tracks, getTextTrack: () => currentText,
    setTextTrack: (x) => { log.push(`text ${x.trackId}`); currentText = x; return Promise.resolve(); },
    getAudioTrackList: () => audioList,
    getAudioTrack: () => currentAudio, setAudioTrack: (x) => { log.push(`audio ${x.displayName}`); currentAudio = x; },
  };
  const doc = {
    documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
      appendChild() {} },
    head: { appendChild() {} },
    createElement: () => ({ style: {} }),
    querySelectorAll: (sel) => (sel === "video" ? [video] : []),
    querySelector: (sel) => (prompt && /interrupt/.test(sel) ? { getBoundingClientRect: () => ({ width: 300, height: 100 }), innerText: "Are you still watching?", querySelector: () => ({ click: () => log.push("continue") }) } : null),
  };
  const url = new URL(href);
  const win = {
    URL, document: doc, location: { href: url.href, hostname: url.hostname, pathname: url.pathname },
    setInterval: (fn) => { timers.push(fn); return 0; }, Date: { now: () => now }, isFinite, Math, Number, String,
    __tamkeenNetflixCfg: { lang, hosts: ["www.netflix.com", "netflix.com"] },
    netflix: { appContext: { state: { playerApp: {
      getAPI: () => ({ videoPlayer: { getAllPlayerSessionIds: () => [sid], getVideoPlayerBySessionId: () => p } }),
      getState: () => ({ videoPlayer: { videoMetadata: { 81946364: { _metadata: { video: { type: "movie", title: "Film", runtime: 1500 } } } } } }),
    } } } },
  };
  win.window = win;
  win.top = win;
  vm.runInNewContext(COMMON, win);
  vm.runInNewContext(PLAYER, win);
  return { win, log, classes, tick: () => timers.forEach((fn) => fn()), wait: (ms) => { now += ms; }, api: win.__tamkeenNetflixPlayer,
    learn: (code) => { win.__tamkeenNetflixCfg.lang = code; }, // the extension says the language being learned changed
    nextTitle: (s) => { sid = s; },                              // Netflix moves on (a new player session)
    netflixSets: (x) => { currentText = x; } };                  // Netflix itself changes the subtitles
}

test("in Netflix's page: soundtrack first, then the subtitles, then only the picture shows", () => {
  const page = watchPage("https://www.netflix.com/watch/81946364?trackId=1", { audio: { bcp47: "en", displayName: "English [Original]" } });
  assert.ok(page.api, "it runs on Netflix");
  assert.ok(page.classes.has("tk-only-video"), "a player and a video: Netflix's own controls and subtitles are hidden");
  assert.deepEqual(page.log, ["audio Arabic"], "the Arabic soundtrack is chosen first");
  page.tick();
  assert.equal(page.log.length, 1, "the subtitles wait a moment: their list follows the soundtrack");
  page.wait(1600);
  page.tick();
  assert.deepEqual(page.log, ["audio Arabic", "text T3"], "then Arabic subtitles (ar, as the soundtrack heard is plain Arabic)");
  const s = page.api.state();
  assert.deepEqual([s.page, s.id, s.ready, s.video, s.t, s.d, s.paused, s.ended], ["watch", "81946364", true, true, 12, 1500, false, false]);
  assert.deepEqual([s.subs.status, s.subs.bcp47, s.audio.status], ["chosen", "ar", "switched"]);
  assert.equal(s.info.title, "Film");
  page.api.cmd("seek", 22.25);
  page.api.cmd("rate", 9);
  page.api.cmd("pause");
  assert.deepEqual(page.log.slice(2), ["seek 22250", "rate 2", "pause"], "seconds to Netflix's milliseconds; a rate it can play");
  assert.equal(page.api.state().paused, true);
});

test("in Netflix's page: an Arabic soundtrack stays, Lebanese subtitles for Lebanese speech", () => {
  const page = watchPage("https://www.netflix.com/watch/81946364");
  page.tick();
  assert.deepEqual(page.log, ["text T2"], "no soundtrack change; ar-LB PRIMARY, never 'Off'");
  assert.equal(page.api.state().audio.status, "already");
});

test("in Netflix's page: the language being learned changes while a title plays: switched once, then left alone", () => {
  const page = watchPage("https://www.netflix.com/watch/81946364");
  page.tick();
  assert.deepEqual(page.log, ["text T2"]);
  page.learn("en"); // switched to English in Tamkeen
  page.tick();
  assert.deepEqual(page.log, ["text T2", "audio English"], "Netflix's English soundtrack");
  page.wait(1600);
  page.tick();
  assert.deepEqual(page.log, ["text T2", "audio English", "text T7"], "then English subtitles (not the closed captions)");
  for (let i = 0; i < 5; i++) { page.wait(1000); page.tick(); }
  assert.equal(page.log.length, 3, "chosen once: not forced every tick");
  page.netflixSets(REAL_TRACKS[11]); // something else changes Netflix's subtitles
  page.tick();
  assert.equal(page.log.length, 3, "never switched back");
  const s = page.api.state();
  assert.deepEqual([s.learning, s.subs.status, s.subs.bcp47, s.tracks.textNow, s.manual.text], ["en", "chosen", "en", "T11", false]);
  assert.equal(s.tracks.audio.length, 3);
  assert.equal(s.tracks.text.length, REAL_TRACKS.length - 1);
});

test("in Netflix's page: tracks chosen in Tamkeen's menus are kept for the title, Off included", () => {
  const page = watchPage("https://www.netflix.com/watch/81946364");
  page.tick();
  page.api.cmd("text", "T11"); // Japanese subtitles, by hand
  assert.deepEqual(page.log, ["text T2", "text T11"]);
  let s = page.api.state();
  assert.deepEqual([s.subs.status, s.subs.bcp47, s.tracks.textNow, s.manual.text], ["manual", "ja", "T11", true]);
  page.learn("fr");
  page.tick();
  page.wait(2000);
  page.tick();
  assert.deepEqual(page.log, ["text T2", "text T11"], "a new language in Tamkeen: no French soundtrack, and the subtitles chosen by hand stay");
  page.api.cmd("audio", "#2"); // the English soundtrack, by hand
  page.wait(2000);
  page.tick();
  assert.deepEqual(page.log, ["text T2", "text T11", "audio English"], "the subtitles chosen by hand still stay");
  page.api.cmd("text", "off");
  s = page.api.state();
  assert.deepEqual([page.log.at(-1), s.subs.status, s.tracks.textNow], ["text T0", "off", "off"], "Off: Netflix's own Off");
  page.api.cmd("text", "no-such-track");
  assert.equal(page.log.at(-1), "text T0", "an unknown track: nothing");
  page.nextTitle("s2"); // the next episode
  page.tick();
  page.tick();
  assert.equal(page.log.at(-1), "text T10", "the next title: French subtitles for the language being learned, chosen afresh");
  assert.equal(page.api.state().manual.text, false);
});

test("in Netflix's page: a soundtrack chosen by hand brings the learning language's subtitles back once", () => {
  const page = watchPage("https://www.netflix.com/watch/81946364");
  page.tick();
  page.api.cmd("audio", "#2");
  assert.deepEqual(page.log, ["text T2", "audio English"]);
  assert.equal(page.api.state().audio.status, "manual");
  page.netflixSets(REAL_TRACKS[7]); // Netflix's list follows the soundtrack: it switched to English subtitles
  page.wait(1600);
  page.tick();
  assert.deepEqual(page.log, ["text T2", "audio English", "text T2"], "Arabic subtitles again (they weren't chosen by hand)");
  for (let i = 0; i < 4; i++) { page.wait(1000); page.tick(); }
  assert.equal(page.log.length, 3);
});

test("in Netflix's page: no subtitles in the language, a question from Netflix, another website", () => {
  const none = watchPage("https://www.netflix.com/watch/81946364", { tracks: REAL_TRACKS.filter((x) => !x.bcp47.startsWith("ar")) });
  none.tick();
  assert.equal(none.api.state().subs.status, "none");
  const asking = watchPage("https://www.netflix.com/watch/81946364", { prompt: true });
  assert.ok(!asking.classes.has("tk-only-video"), "Netflix's question stays visible and can be answered there");
  assert.equal(asking.api.state().prompt, "Are you still watching?");
  asking.api.cmd("continue");
  assert.ok(asking.log.includes("continue"));
  const login = watchPage("https://www.netflix.com/login");
  assert.equal(login.api.state().page, "login");
  assert.equal(watchPage("https://www.netflix.com.evil.example/watch/1234").api, undefined);
});

// ---------- netflix-browser.js (the Netflix window) ----------

function browsePage(href, { metadata = {}, links = [], toggles = [], session = {}, local = {}, later = false } = {}) {
  const listeners = {};
  const timers = [];
  const went = [];
  const watched = [];
  const clicked = [];
  let url = new URL(href);
  const store = (init) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const sessionStorage = store(session);
  const localStorage = store(local);
  const el = (tag, text, extra = {}) => ({ tagName: tag, textContent: text, closest: () => null, click: () => clicked.push(text), ...extra });
  const linkEls = links.map(([text, path]) => el("A", text, { href: new URL(path, url).href }));
  const toggleEls = toggles.map((text) => el("DIV", text));
  const doc = {
    body: { appendChild() {} }, documentElement: { appendChild() {} },
    createElement: () => ({ style: {}, attachShadow: () => ({ appendChild() {} }), isConnected: true }),
    querySelector: () => null,
    querySelectorAll: (sel) => (/aria-haspopup/.test(sel) ? toggleEls : /a\[href/.test(sel) ? linkEls : sel === "video" ? [] : []),
    get title() { return "Netflix"; },
  };
  const win = {
    URL, document: doc, Promise, encodeURIComponent, String, Number, setTimeout: () => 0, clearTimeout() {},
    setInterval: (fn) => { timers.push(fn); return 0; },
    location: { get href() { return url.href; }, get hostname() { return url.hostname; }, get pathname() { return url.pathname; },
      get origin() { return url.origin; }, assign: (v) => went.push(v), replace: (v) => went.push(v) },
    history: { length: 2, back: () => went.push("back") },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    sessionStorage, localStorage,
    fetch: async (u) => { const id = new URL(u).searchParams.get("movieid"); return { ok: !!metadata[id], json: async () => metadata[id] }; },
    pywebview: { api: { watch_title: async (id, info) => { watched.push([id, info]); return { ok: true }; } } },
    __tamkeenNetflix: { lang: "ar", names: ["Arabic", "العربية"], hosts: ["www.netflix.com", "netflix.com"],
      browse: ["https://www.netflix.com/browse/original-audio", "https://www.netflix.com/browse/audio", "https://www.netflix.com/browse/subtitles"],
      text: {} },
  };
  if (later) delete win.__tamkeenNetflix; // the extension: its settings come a moment later
  win.window = win;
  win.top = win;
  vm.runInNewContext(COMMON, win);
  vm.runInNewContext(BROWSER, win);
  const click = (target) => {
    const e = { button: 0, target, composedPath: () => [target], preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
    listeners.click(e);
    return e;
  };
  const settle = () => new Promise((r) => setTimeout(r, 5));
  return { win, click, went, watched, clicked, settle, sessionStorage, localStorage, tick: () => timers.forEach((fn) => fn()), active: !!listeners.click,
    go(to) { url = new URL(to, url); } };
}

test("the Netflix window: does nothing on other websites", () => {
  assert.equal(browsePage("https://www.youtube.com/").active, false);
  assert.equal(browsePage("https://www.netflix.com.evil.example/browse").active, false);
  assert.equal(browsePage("https://www.netflix.com/browse").active, true);
});

test("the Netflix window: picking a film hands it to Tamkeen with its name", async () => {
  const page = browsePage("https://www.netflix.com/browse/original-audio/ar", {
    metadata: { 80001001: { video: { type: "movie", title: "بيت الجدة", runtime: 5400 } } } });
  const card = { tagName: "A", href: "https://www.netflix.com/watch/80001001?tctx=0%2C0", getAttribute: (k) => (k === "aria-label" ? "بيت الجدة" : null),
    querySelector: () => null, closest: () => null };
  const e = page.click(card);
  assert.ok(e.prevented, "Netflix doesn't start playing it here");
  await page.settle();
  assert.equal(page.watched.length, 1);
  const [id, info] = page.watched[0];
  assert.equal(id, "80001001");
  assert.equal(info.title, "بيت الجدة");
  assert.equal(info.duration, 5400);
  const other = page.click({ tagName: "A", href: "https://www.netflix.com/title/80001001", closest: () => null });
  assert.ok(!other.prevented, "a title's page is left to Netflix");
});

test("the Netflix window: a series opened by its own number becomes the episode Netflix would play", async () => {
  const page = browsePage("https://www.netflix.com/browse/original-audio/ar", {
    metadata: { 80002000: { video: { type: "show", title: "حكايات الحي", currentEpisode: 80002001,
      seasons: [{ seq: 1, episodes: [{ id: 80002001, seq: 1, title: "الصباح" }] }] } } } });
  page.click({ tagName: "A", href: "https://www.netflix.com/watch/80002000", getAttribute: () => null, querySelector: () => null, closest: () => null });
  await page.settle();
  const [id, info] = page.watched[0];
  assert.deepEqual([id, info.show, info.season, info.episode, info.episode_title], ["80002001", "حكايات الحي", 1, 1, "الصباح"]);
});

test("the Netflix window: a watch page opened by Netflix's own buttons is handed over and left", async () => {
  const page = browsePage("https://www.netflix.com/watch/81946364?trackId=1");
  await page.settle();
  assert.equal(page.watched[0][0], "81946364");
  assert.ok(page.went.includes("back"), "back to where the title was picked, so it doesn't play here too");
});

test("the Netflix window: chooses the language being learned on Browse by Languages", () => {
  const page = browsePage("https://www.netflix.com/browse/original-audio", { links: [["English", "/browse/original-audio/en"], ["Arabic", "/browse/original-audio/ar"]] });
  assert.deepEqual(page.clicked, ["Arabic"]);
  assert.equal(page.sessionStorage.getItem("tamkeen-nf-done"), "1");
  // A menu that builds its list only when opened: opened first, then the language picked.
  const menu = browsePage("https://www.netflix.com/browse/original-audio", { toggles: ["Original Language", "English"] });
  assert.deepEqual(menu.clicked, ["Original Language"]);
  menu.tick();
  assert.deepEqual(menu.clicked, ["Original Language", "English"]);
  // Already chosen: nothing clicked, and remembered for next time.
  const done = browsePage("https://www.netflix.com/browse/original-audio/ar", { toggles: ["Original Language", "Arabic"] });
  assert.deepEqual(done.clicked, []);
  assert.equal(done.localStorage.getItem("tamkeen-nf-language:ar"), "https://www.netflix.com/browse/original-audio/ar");
  // Next time it goes straight there.
  const again = browsePage("https://www.netflix.com/browse/original-audio", { local: { "tamkeen-nf-language:ar": "https://www.netflix.com/browse/original-audio/ar" } });
  assert.deepEqual(again.went, ["https://www.netflix.com/browse/original-audio/ar"]);
});

test("the Netflix window: Netflix's home instead of titles by language tries the other addresses", () => {
  const page = browsePage("https://www.netflix.com/browse");
  assert.deepEqual(page.went, ["https://www.netflix.com/browse/original-audio"]);
  page.tick();
  page.tick();
  page.tick();
  assert.deepEqual(page.went, ["https://www.netflix.com/browse/original-audio", "https://www.netflix.com/browse/audio",
    "https://www.netflix.com/browse/subtitles"], "then it stops and says to use Netflix's own menu");
  assert.equal(page.sessionStorage.getItem("tamkeen-nf-done"), "1");
});

// ---------- nfmedia.js ----------

function fakeBridge({ open = { ok: true, reused: false } } = {}) {
  const calls = [];
  const st = { ready: true, video: true, page: "watch", id: "80001001", t: 10, d: 120, paused: true, ended: false, rate: 1, error: "" };
  return {
    calls, st,
    open: async (...a) => { calls.push(["open", ...a]); return open; },
    place: async (r) => { calls.push(["place", r.visible]); return { ok: true }; },
    do: async (c, v) => { calls.push(["do", c, v]); if (c === "play") st.paused = false; if (c === "pause") st.paused = true; if (c === "seek") st.t = v; return { ok: true }; },
    state: async () => ({ ...st }),
    release: async () => { calls.push(["release"]); return { ok: true }; },
  };
}
function fakeTimers() {
  let queue = [];
  return {
    setTimeout: (fn) => { queue.push(fn); return queue.length; }, clearTimeout() {},
    async run(times = 1) {
      for (let k = 0; k < times; k++) {
        const now = queue;
        queue = [];
        now.forEach((fn) => fn());
        await new Promise((r) => setTimeout(r, 2));
      }
    },
  };
}

test("the Netflix player behaves like an <audio> element", async () => {
  const bridge = fakeBridge();
  const timers = fakeTimers();
  let clock = 0;
  const seen = [];
  const media = createNetflixMedia(null, "80001001", { bridge, lang: "ar", place: false, timers, clock: () => clock,
    onState: (s) => seen.push(s.page) });
  const events = [];
  for (const name of ["loadedmetadata", "play", "pause", "timeupdate", "seeked", "ended", "error"]) media.addEventListener(name, () => events.push(name));
  await timers.run();
  assert.deepEqual(bridge.calls[0], ["open", "80001001", "ar"]);
  assert.ok(events.includes("loadedmetadata") && events.includes("timeupdate"));
  assert.equal(media.duration, 120);
  assert.equal(media.currentTime, 10);
  assert.equal(media.paused, true);
  assert.deepEqual(seen.slice(0, 1), ["watch"]);
  // Play: at once on screen, and Netflix is told.
  await media.play();
  assert.equal(media.paused, false);
  assert.ok(bridge.calls.some((c) => c[1] === "play"));
  clock += 300;
  assert.ok(Math.abs(media.currentTime - 10.3) < 1e-9, "between answers the position runs on with the clock");
  clock += 5000;
  assert.ok(media.currentTime <= 10.6 + 1e-9, "but never far ahead of Netflix's last answer");
  // A jump: in seconds, and the position stays at the target until Netflix gets there.
  media.currentTime = 22;
  assert.equal(media.currentTime, 22);
  await timers.run(2);
  assert.deepEqual(bridge.calls.filter((c) => c[1] === "seek").pop(), ["do", "seek", 22]);
  assert.ok(events.includes("seeked"));
  // Rate and pause.
  media.playbackRate = 0.75;
  await timers.run();
  assert.deepEqual(bridge.calls.filter((c) => c[1] === "rate").pop(), ["do", "rate", 0.75]);
  media.pause();
  assert.equal(media.paused, true);
  assert.ok(events.includes("pause") && events.includes("play"));
  // The end, once; an error, once per message.
  bridge.st.ended = true;
  clock += 2000;
  await timers.run(2);
  assert.equal(events.filter((e) => e === "ended").length, 1);
  bridge.st.error = "Pardon the interruption";
  await timers.run(2);
  assert.equal(events.filter((e) => e === "error").length, 1);
  assert.equal(media.errorMessage, "Pardon the interruption");
  // Load afresh, then let go.
  await media.reload();
  assert.deepEqual(bridge.calls.filter((c) => c[0] === "open").pop(), ["open", "80001001", "ar", true]);
  media.dispose();
  await timers.run();
  assert.deepEqual(bridge.calls.at(-1), ["release"]);
});

test("the Netflix player: reopened mid-title (the page drawn afresh), it carries on where it is", async () => {
  const bridge = fakeBridge({ open: { ok: true, reused: true, t: 41.5 } });
  const timers = fakeTimers();
  const media = createNetflixMedia(null, "80001001", { bridge, place: false, timers, clock: () => 0 });
  await timers.run();
  media.currentTime = 40; // the place kept by the page a moment ago
  await timers.run();
  assert.ok(!bridge.calls.some((c) => c[1] === "seek"), "no jump back of a second or two");
  media.currentTime = 90;
  await timers.run();
  assert.ok(bridge.calls.some((c) => c[1] === "seek" && c[2] === 90), "a real jump still goes through");
  const failed = createNetflixMedia(null, "1", { bridge: { ...fakeBridge({ open: { ok: false, error: "No Netflix here" } }) }, place: false, timers });
  let error = "";
  failed.addEventListener("error", () => { error = failed.errorMessage; });
  await timers.run();
  assert.equal(error, "No Netflix here");
});

function fakeWindow() {
  const handlers = {};
  const els = [];
  const reports = [];
  const frames = [];
  const doc = { hidden: false, body: {}, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => els };
  const win = {
    document: doc, innerWidth: 1280, innerHeight: 800,
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
    frame: () => frames.splice(0).forEach((fn) => fn()),
    setInterval: (fn) => { handlers.interval = fn; return 1; }, clearInterval() {},
    addEventListener: (t, fn) => { handlers[t] = fn; }, removeEventListener() {},
    ResizeObserver: class { constructor(fn) { handlers.resize = fn; } observe() {} disconnect() {} },
    MutationObserver: class { constructor(fn) { handlers.mutate = fn; } observe() {} disconnect() {} },
  };
  return { win, handlers, els, reports };
}

test("the stage's place is reported when it changes, and hidden under a box", () => {
  const { win, handlers, els } = fakeWindow();
  let box = { left: 8, top: 160, width: 722, height: 406 };
  const stage = { isConnected: true, getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) };
  const reports = [];
  const stop = watchPlacement(stage, (r) => reports.push(r), win);
  assert.deepEqual(reports[0], { x: 8, y: 160, w: 722, h: 406, vw: 1280, vh: 800, visible: true });
  handlers.interval();
  assert.equal(reports.length, 1, "nothing changed: nothing reported");
  box = { left: 8, top: 160, width: 722, height: 250 };
  handlers.resize();
  handlers.resize();
  win.frame();
  assert.equal(reports.at(-1).h, 250);
  assert.equal(reports.length, 2, "several changes in one frame: one report");
  els.push({ hidden: false, closest: () => null, getBoundingClientRect: () => ({ left: 300, top: 300, right: 900, bottom: 500, width: 600, height: 200 }) });
  handlers.mutate();
  win.frame();
  assert.equal(reports.at(-1).visible, false, "a box over the stage hides the video");
  els.pop();
  handlers.mutate();
  win.frame();
  assert.equal(reports.at(-1).visible, true);
  stop({ hide: false });
  assert.equal(reports.at(-1).visible, true, "drawn afresh: left where it is");
  const again = watchPlacement(stage, (r) => reports.push(r), win);
  again();
  assert.equal(reports.at(-1).visible, false, "the player left: hidden");
});

test("only a box that is shown over the stage counts", () => {
  const rect = { x: 0, y: 100, w: 700, h: 400 };
  const box = (r, extra = {}) => ({ hidden: false, closest: () => null, getBoundingClientRect: () => r, ...extra });
  const doc = (list) => ({ querySelectorAll: () => list });
  assert.equal(coveredBy(doc([box({ left: 800, top: 100, right: 1000, bottom: 300, width: 200, height: 200 })]), rect), false, "beside it");
  assert.equal(coveredBy(doc([box({ left: 600, top: 450, right: 900, bottom: 700, width: 300, height: 250 })]), rect), true, "over a corner");
  assert.equal(coveredBy(doc([box({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 })]), rect), false, "not shown");
  assert.equal(coveredBy(doc([box({ left: 0, top: 0, right: 900, bottom: 900, width: 900, height: 900 }, { hidden: true })]), rect), false, "hidden");
});
