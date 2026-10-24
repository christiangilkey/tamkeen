// Run with: node --test tests/js/
// How the web app and the browser extension "Tamkeen for Netflix" talk (web/js/extbridge.js): only
// messages from the web app's own window and address with this visit's nonce count; what arrives is
// cleaned to plain values; saved words and watched titles wait in the extension until the web app
// says it kept them. Also: the extension's build (extension/scripts/build.mjs) never ships test hosts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { APP, EXT, TITLE_KEY, WORD_KEY, checkMessage, cleanAck, cleanDevice, cleanLines, cleanPending, cleanSettings, cleanTitle,
  cleanTrack, cleanWord, keysToForget, message, newNonce, pendingFrom, savedSpotifyWord, savedWord, spotifySource, watchedTitle,
  wordUid } from "../../web/js/extbridge.js";

const NONCE = "0123456789abcdef0123456789abcdef";
const page = { location: { origin: "https://christiangilkey.github.io" } };
const event = (data, extra = {}) => ({ source: page, origin: "https://christiangilkey.github.io", data, ...extra });

test("a message counts only from this window, this address, with this visit's nonce", () => {
  const hello = message(EXT, "hello", NONCE);
  assert.ok(checkMessage(event(hello), { win: page, tag: EXT }), "a hello carries the nonce to use");
  const pending = message(EXT, "pending", NONCE, { words: [] });
  assert.ok(checkMessage(event(pending), { win: page, tag: EXT, nonce: NONCE }));
  assert.equal(checkMessage(event(pending), { win: page, tag: EXT, nonce: "f".repeat(32) }), null, "another nonce");
  assert.equal(checkMessage(event(pending), { win: page, tag: EXT, nonce: "" }), null, "before the hello");
  assert.equal(checkMessage(event(pending, { source: {} }), { win: page, tag: EXT, nonce: NONCE }), null, "another window (a frame, an opener)");
  assert.equal(checkMessage(event(pending, { origin: "https://evil.example" }), { win: page, tag: EXT, nonce: NONCE }), null, "another address");
  assert.equal(checkMessage(event(pending), { win: page, tag: APP, nonce: NONCE }), null, "the other side's tag");
  assert.equal(checkMessage(event({ ...pending, type: "delete-everything" }), { win: page, tag: EXT, nonce: NONCE }), null, "an unknown kind");
  assert.equal(checkMessage(event({ ...pending, [EXT]: 2 }), { win: page, tag: EXT, nonce: NONCE }), null, "another protocol");
  for (const bad of [null, "text", [hello], { ...hello, nonce: "short" }]) assert.equal(checkMessage(event(bad), { win: page, tag: EXT }), null);
  assert.ok(checkMessage(event(message(APP, "ack", NONCE, { words: [] })), { win: page, tag: APP, nonce: NONCE }));
  assert.equal(checkMessage(event(message(APP, "pending", NONCE)), { win: page, tag: APP, nonce: NONCE }), null, "the web app never sends words");
  const gone = message(EXT, "gone", NONCE);
  assert.ok(checkMessage(event(gone), { win: page, tag: EXT, nonce: NONCE }), "the extension's part on the page says it was left behind by an update");
  assert.equal(checkMessage(event(gone), { win: page, tag: EXT, nonce: "" }), null, "only within a visit's conversation");
  assert.match(newNonce(), /^[0-9a-f]{32}$/);
  assert.notEqual(newNonce(), newNonce());
});

test("settings: only those the extension needs, as plain values", () => {
  const s = cleanSettings({ study_language: "ar", ui_language: "es", definer_provider: "gemini", definer_mode: "ai",
    llm_key_gemini: "  AIza key\n", definer_model_gemini: "gemini-3", font_size: 400, google_email: "me@example.com",
    signed_in: true, stt_key_groq: "secret", definer_language: "Español" });
  assert.equal(s.study_language, "ar");
  assert.equal(s.llm_key_gemini, "AIzakey", "no spaces in a key");
  assert.equal(s.font_size, 60);
  assert.equal(s.definer_mode, "ai");
  for (const k of ["google_email", "signed_in", "stt_key_groq"]) assert.ok(!(k in s), `${k} never leaves the web app`);
  // Card voices: only whether saved words get their voice by themselves (for the popup's "Add audio");
  // the voice settings and the Azure key stay in the web app.
  assert.equal(s.card_voices, false);
  const v = cleanSettings({ card_voices: true, tts_key_azure: "secret", tts_region_azure: "eastus", tts_mode: "azure", tts_on_save: "on" });
  assert.equal(v.card_voices, true);
  for (const k of ["tts_key_azure", "tts_region_azure", "tts_mode", "tts_on_save"]) assert.ok(!(k in v), `${k} never leaves the web app`);
  assert.equal(cleanSettings({ card_voices: "yes" }).card_voices, false, "only a real true counts");
  const odd = cleanSettings({ study_language: "<script>", definer_provider: "evil", definer_mode: "x" });
  assert.deepEqual([odd.study_language, odd.definer_provider, odd.definer_mode], ["", "claude", "dictionary_first"]);
  assert.deepEqual(cleanSettings(null), {});
  // The languages ticked in Settings (a song in one of them is looked up in it without asking).
  assert.deepEqual(cleanSettings({ learning_languages: ["es", "ar", "<x>", 5, "ceb"] }).learning_languages, ["es", "ar", "ceb"]);
  assert.deepEqual(cleanSettings({}).learning_languages, []);
  assert.deepEqual(cleanDevice({ lookup_mode: "quick", word_pause: false }), { lookup_mode: "quick", word_pause: false });
  assert.deepEqual(cleanDevice("x"), { lookup_mode: "detailed", word_pause: true });
});

const LINES = [{ start: 2, end: 5.2, text: "مرحباً، كيف حالك؟", words: [[2, 3, "مرحباً،"], [3, 4, "كيف"], [4, 5.2, "حالك؟"]] }];

test("a saved word: from the popup's answer, cleaned, linked to its title and place", () => {
  const def = { meaning: "how", vocalized: "كَيْفَ", lemma: "كيف", sentence_translation: "Hello, how are you?" };
  const w = savedWord({ netflixId: "81946364", def, word: "كيف", lang: "ar", sentence: "مرحباً، كيف حالك؟", start: 3, end: 4,
    sentStart: 2, sentEnd: 5.2, title: "حكايات · S1:E1" }, 1760000000000, "nfwabcdefgh1");
  assert.equal(w.text, "كَيْفَ", "Arabic keeps the vowelled word, as in the app");
  assert.equal(w.meaning, "how");
  assert.deepEqual([w.netflix_id, w.start, w.sent_end, w.language, w.created_at], ["81946364", 3, 5.2, "ar", 1760000000000]);
  assert.equal(savedWord({ netflixId: "x", word: "كيف", lang: "ar" }), null, "no title, no word");
  assert.match(wordUid(1760000000000, () => 0.5), /^nfw[\w]{8,}$/);
  assert.equal(cleanWord({ ...w, uid: "../../x" }), null);
  assert.equal(cleanWord({ ...w, start: "NaN" }).start, null);
  assert.equal(cleanWord({ ...w, text: "x".repeat(500) }).text.length, 200);
});

test("a word saved on Spotify: the lyric line as its sentence, the song as its source; never the whole lyrics", () => {
  const track = { id: "6habFhsOp2NvshLv26DqMb", title: "Canción de Prueba", artist: "Cantante Uno, Otra Voz", album: "Disco", lyrics: "all of it" };
  const def = { meaning: "heart", sentence_translation: "My ⟦heart⟧ is yours" };
  const w = savedSpotifyWord({ track, def, word: "corazón", lang: "es", sentence: "Mi corazón es tuyo" }, 1760000000000, "spwabcdefgh1");
  assert.deepEqual([w.uid, w.text, w.sentence, w.meaning, w.language, w.netflix_id, w.created_at],
    ["spwabcdefgh1", "corazón", "Mi corazón es tuyo", "heart", "es", "", 1760000000000]);
  assert.deepEqual(w.spotify, { id: "6habFhsOp2NvshLv26DqMb", title: "Canción de Prueba", artist: "Cantante Uno, Otra Voz" });
  assert.equal(w.title, "Cantante Uno, Otra Voz – Canción de Prueba");
  assert.equal(w.start, null, "no moment in the song is kept");
  assert.ok(!JSON.stringify(w).includes("all of it"), "nothing else of the song comes along");
  assert.equal(spotifySource(w.spotify), "Spotify – Cantante Uno, Otra Voz – Canción de Prueba");
  assert.equal(spotifySource({ title: "Solo" }), "Spotify – Solo");
  assert.equal(savedSpotifyWord({ track: { title: "" }, word: "x", lang: "es" }), null, "no song, no word");
  assert.deepEqual(cleanTrack({ id: "../x", title: "  A   song ", artist: 5 }), { id: "", title: "A song", artist: "5" });
  assert.equal(cleanTrack({ id: "6habFhsOp2NvshLv26DqMb" }), null);
  assert.match(savedSpotifyWord({ track, word: "x", lang: "es" }).uid, /^spw[\w]{8,}$/);
  // It waits with the Netflix words and goes over the same way.
  const nf = savedWord({ netflixId: "81946364", word: "كيف", lang: "ar", sentence: "s", title: "T" }, 1000, "nfw00000002");
  const p = pendingFrom({ [WORD_KEY + w.uid]: w, [WORD_KEY + nf.uid]: nf });
  assert.deepEqual(p.words.map((x) => [x.uid, !!x.spotify]), [["nfw00000002", false], ["spwabcdefgh1", true]]);
  assert.deepEqual(cleanPending({ words: p.words }).words[1].spotify, w.spotify);
  assert.equal(cleanWord({ ...w, spotify: null }), null, "a word from neither Netflix nor Spotify");
  assert.ok(!("spotify" in nf), "a Netflix word is as before");
});

test("a watched title: its subtitles as lines, cleaned and limited", () => {
  const t = watchedTitle({ id: "81946364", info: { show: "حكايات", season: 1, episode: 1, image: "javascript:alert(1)" }, language: "ar", lines: LINES }, 5);
  assert.deepEqual([t.id, t.info.show, t.info.image, t.language, t.at], ["81946364", "حكايات", "", "ar", 5]);
  assert.deepEqual(t.lines[0].words[1], [3, 4, "كيف"]);
  assert.equal(cleanTitle({ id: "abc" }), null);
  const messy = cleanLines([{ words: [[1, 2, " a b "], ["x", 2, "c"], [3, 1, "d"]] }, { words: "no" }, null]);
  assert.deepEqual(messy, [{ start: 1, end: 3, text: "ab d", words: [[1, 2, "ab"], [3, 3, "d"]] }]);
  const many = cleanLines([{ words: Array.from({ length: 70000 }, (_, i) => [i, i + 1, "w"]) }]);
  assert.equal(many.length, 0, "one title's subtitles are limited in size");
});

test("pending: what waits in the extension, and what is forgotten once the web app kept it", () => {
  const w1 = savedWord({ netflixId: "81946364", word: "كيف", lang: "ar", sentence: "s", title: "T" }, 2000, "nfw00000001");
  const w2 = savedWord({ netflixId: "81946364", word: "حالك", lang: "ar", sentence: "s", title: "T" }, 1000, "nfw00000002");
  const title = watchedTitle({ id: "81946364", info: { title: "T" }, language: "ar", lines: LINES }, 3000);
  const items = { [WORD_KEY + w1.uid]: w1, [WORD_KEY + w2.uid]: w2, [TITLE_KEY + "81946364"]: title,
    [WORD_KEY + "bad"]: { uid: "bad" }, settings: { study_language: "ar" }, told_subtitles: true };
  const p = pendingFrom(items);
  assert.deepEqual(p.words.map((w) => w.uid), ["nfw00000002", "nfw00000001"], "oldest first; broken entries left out");
  assert.deepEqual(p.titles.map((t) => t.id), ["81946364"]);
  assert.deepEqual(cleanPending({ words: [...p.words, { evil: 1 }], titles: p.titles }).words.length, 2);
  // The web app kept one word and the title as it was sent.
  const forget = keysToForget(items, { words: ["nfw00000002", "nfw99999999"], titles: [{ id: "81946364", at: 3000 }] });
  assert.deepEqual(forget.sort(), [TITLE_KEY + "81946364", WORD_KEY + "nfw00000002"].sort());
  // The title got better subtitles after it was sent: kept until it goes again.
  const newer = { ...items, [TITLE_KEY + "81946364"]: { ...title, at: 4000 } };
  assert.deepEqual(keysToForget(newer, { titles: [{ id: "81946364", at: 3000 }] }), []);
  assert.deepEqual(cleanAck({ words: ["../x", "nfw00000001"], titles: [{ id: "x" }] }), { words: ["nfw00000001"], titles: [] });
});

test("the extension's build: a release names only Netflix, Spotify, LRCLIB and the web app; test hosts need the test flags", () => {
  const root = join(fileURLToPath(new URL("../..", import.meta.url)));
  const out = mkdtempSync(join(tmpdir(), "tk-ext-"));
  try {
    execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", out, "--version", "1.2.3"], { stdio: "pipe" });
    const m = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.equal(m.manifest_version, 3);
    assert.equal(m.version, "1.2.3");
    const text = JSON.stringify(m);
    assert.ok(!/localhost|127\.0\.0\.1/.test(text), "no local addresses in a release");
    // (Spotify needs no host permission of its own: its scripts run there by "matches"; LRCLIB answers
    // the lyrics panel's questions.)
    assert.deepEqual(m.host_permissions, ["https://www.netflix.com/*", "https://*.nflxvideo.net/*", "https://lrclib.net/*"]);
    assert.ok(m.content_scripts.some((c) => c.world === "MAIN" && c.js.includes("js/netflix-player.js")));
    const spotify = m.content_scripts.filter((c) => c.matches.includes("https://open.spotify.com/*"));
    assert.deepEqual(spotify.map((c) => [c.world || "", c.run_at, c.js]), [
      ["MAIN", "document_start", ["content/spotify-page.js", "content/spotify-main.js"]],
      ["", "document_idle", ["content/spotify.js"]],
    ]);
    assert.deepEqual(m.web_accessible_resources[2], { resources: ["spotify.html"], matches: ["https://open.spotify.com/*"] });
    assert.ok(m.browser_specific_settings.gecko.id);
    const config = readFileSync(join(out, "js/ext/config.js"), "utf8");
    assert.match(config, /"test": false/);
    assert.match(config, /"lyricsApi": "https:\/\/lrclib\.net"/);
    for (const f of ["panel.html", "spotify.html", "css/spotify.css", "background.js", "js/ext/panel.js", "js/ext/spotify-panel.js", "js/ext/common.js",
      "js/lyrics.js", "content/spotify.js", "content/spotify-main.js", "content/spotify-page.js", "js/wordlists/ceb.js",
      "js/components/wordbubble.js", "js/lexicon-store.js", "i18n/es.json", "icons/icon-128.png"]) {
      assert.ok(existsSync(join(out, f)), f);
    }
    for (const f of m.web_accessible_resources[1].resources) assert.ok(existsSync(join(out, f)), f);
    // A test build may name local stand-ins, and says so.
    execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", out, "--test-netflix", "http://127.0.0.1:8931",
      "--test-subs", "127.0.0.1", "--test-webapp", "http://127.0.0.1:8933/app/", "--test-spotify", "http://spotify.localhost:8934",
      "--test-lyrics", "http://127.0.0.1:8935"], { stdio: "pipe" });
    const t = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.match(t.name, /test build/);
    assert.ok(t.content_scripts[0].matches.includes("http://127.0.0.1/*"));
    assert.ok(t.content_scripts[3].matches.includes("http://spotify.localhost/*") && t.content_scripts[4].matches.includes("http://spotify.localhost/*"));
    assert.ok(t.web_accessible_resources[2].matches.includes("http://spotify.localhost/*"));
    assert.match(readFileSync(join(out, "js/ext/config.js"), "utf8"), /"lyricsApi": "http:\/\/127\.0\.0\.1:8935"/);
    assert.throws(() => execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", out, "--test-netflix", "https://evil.example"], { stdio: "pipe" }));
    assert.throws(() => execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", out, "--test-lyrics", "https://lrclib.example"], { stdio: "pipe" }));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

/** One file out of a zip made by the build (deflated, as it writes them). */
function fromZip(buf, name) {
  for (let at = 0; buf.readUInt32LE(at) === 0x04034b50;) {
    const size = buf.readUInt32LE(at + 18), nameLen = buf.readUInt16LE(at + 26), extra = buf.readUInt16LE(at + 28);
    const file = buf.subarray(at + 30, at + 30 + nameLen).toString("utf8");
    const data = buf.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    if (file === name) return inflateRawSync(data);
    at += 30 + nameLen + extra + size;
  }
  return null;
}

test("the extension's build for the Chrome Web Store: its zip, the install page and the privacy policy", () => {
  const root = join(fileURLToPath(new URL("../..", import.meta.url)));
  const work = mkdtempSync(join(tmpdir(), "tk-ext-store-"));
  try {
    const out = join(work, "build"), page = join(work, "page"), storeZip = join(work, "store.zip"), plainZip = join(work, "plain.zip");
    execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", out, "--version", "2.3.4",
      "--zip", plainZip, "--page", page, "--store-zip", storeZip], { stdio: "pipe" });
    // The store's zip: Chrome's manifest alone (no Firefox parts), everything else the same.
    const m = JSON.parse(fromZip(readFileSync(storeZip), "manifest.json").toString("utf8"));
    assert.equal(m.version, "2.3.4");
    assert.equal(m.browser_specific_settings, undefined);
    assert.deepEqual(m.background, { service_worker: "background.js", type: "module" });
    assert.ok(m.description.length <= 132, "the store's summary is at most 132 characters");
    assert.deepEqual(m.permissions, ["storage", "unlimitedStorage", "webRequest"]);
    assert.ok(m.icons["16"] && m.icons["32"] && m.icons["48"] && m.icons["128"]);
    assert.ok(fromZip(readFileSync(storeZip), "js/ext/panel.js"), "the extension's own files are in it");
    // The zip on the install page keeps Firefox's parts.
    const plain = JSON.parse(fromZip(readFileSync(plainZip), "manifest.json").toString("utf8"));
    assert.ok(plain.browser_specific_settings.gecko.id);
    // The install page: by hand until netflix.js names the store listing; then "Add to Chrome" first.
    const html = readFileSync(join(page, "index.html"), "utf8");
    const listed = /export const CHROME_WEB_STORE_URL = "(https:[^"]+)";/.exec(readFileSync(join(root, "web/js/netflix.js"), "utf8"));
    assert.ok(!/\{\{|<!--\/?(store|manual)-->/.test(html), "no placeholders or markers left");
    if (listed) {
      assert.ok(html.includes(`href="${listed[1]}"`) && /Add to Chrome/.test(html));
    } else {
      assert.ok(!/Add to Chrome/.test(html) && /Download the extension/.test(html) && /isn't in the browsers' extension stores yet/.test(html));
    }
    // The privacy policy the listing links to, beside the install page.
    assert.match(readFileSync(join(page, "privacy.html"), "utf8"), /Limited Use/);
    assert.ok(/href="privacy\.html"/.test(html));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
