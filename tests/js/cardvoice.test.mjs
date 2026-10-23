// Card voices (web/js/cardvoice.js, web/js/oggjoin.js): which cards play their own recording, the voice
// chosen per language and Arabic dialect, the SSML sent to Azure, a card's voice made only once, and
// what a card says when nothing can be played. The computer's side: tests/test_voices.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AZURE_VOICES, azureError, azureReady, azureVoiceFor, buildSsml, canSay, cleanAzureKey, cleanRegion, clipTimes, ensureVoice,
  forgetMaking, hasOwnAudio, keepVoice, makeAzureVoice, needsVoice, pickDeviceVoice, pickedVoices, sayCard, voiceChars, voiceMode, voiceText,
  voiceTimes, voicesForLanguage, waitingForComputer, withPickedVoice,
} from "../../web/js/cardvoice.js";
import { joinOggOpus, opusPackets } from "../../web/js/oggjoin.js";
import { oggOpusInfo } from "../../mobile/src/js/ogg-clip.js";
import { KEYS } from "../../web/js/aikeys.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

// ----- which cards have audio they can play -----

test("a card plays its own recording only when there is a sound file to load", () => {
  const word = { text: "cartera", start: 1.2, end: 1.8, sent_start: 0.5, sent_end: 3 };
  assert.equal(hasOwnAudio({ ...word, episode_id: 4, audio_type: "audio/mpeg" }), true, "a podcast");
  assert.equal(hasOwnAudio({ ...word, episode_id: 4, audio_type: "video/mp4" }), true, "the learner's own video");
  assert.equal(hasOwnAudio({ ...word, episode_id: 4, audio_type: "" }), true, "an episode of unknown kind is tried");
  for (const kind of ["video/youtube", "video/netflix", "video/instagram", "text/html", "text/book", "missing"]) {
    assert.equal(hasOwnAudio({ ...word, episode_id: 4, audio_type: kind }), false, kind);
  }
  assert.equal(hasOwnAudio({ ...word, clip: 1 }), true, "a friend's clip");
  assert.equal(hasOwnAudio({ text: "x", episode_id: 4, audio_type: "audio/mpeg", start: null }), false, "no moment in it");
  assert.equal(hasOwnAudio({ text: "typed" }), false);
});

test("which cards need a voice made, and which can be heard at all", () => {
  const youtube = { text: "concientizar", sentence: "Hay que concientizar.", episode_id: 2, audio_type: "video/youtube", start: 3, end: 4 };
  assert.equal(needsVoice(youtube), true, "the owner's “concientivar” case: a word from a video");
  assert.equal(needsVoice({ ...youtube, voice: '{"start":0.06,"end":0.8}' }), false, "its voice is made");
  assert.equal(needsVoice({ text: "  " }), false, "nothing to say");
  assert.equal(needsVoice({ text: "hola", episode_id: 1, audio_type: "audio/mpeg", start: 1 }), false);
  assert.equal(canSay({ text: "cartera" }, "word"), true);
  assert.equal(canSay({ text: "cartera" }, "sentence"), false, "no sentence, no Sentence button");
  assert.equal(canSay({ text: "cartera", sentence: "Mi cartera." }, "sentence"), true);
  assert.deepEqual(voiceTimes({ voice: '{"start":0.06,"end":0.8,"sent_start":1.7}' }), { start: 0.06, end: 0.8, sent_start: 1.7, sent_end: null });
  assert.equal(voiceTimes({ voice: "{broken" }), null);
});

test("what is said: the word, and the part of its sentence the card shows", () => {
  assert.deepEqual(voiceText({ text: " cartera ", sentence: "Perdí mi ⟦cartera⟧." }), { word: "cartera", sentence: "Perdí mi cartera." });
  assert.deepEqual(voiceText({ text: "hola", sentence: "hola" }), { word: "hola", sentence: "" });
  const long = `${"palabra ".repeat(40)}cartera ${"otra ".repeat(40)}.`;
  const said = voiceText({ text: "cartera", sentence: long }).sentence;
  assert.ok(said.length <= 115 && said.includes("cartera"), said);
  assert.ok(!said.includes("…"));
  assert.equal(voiceChars({ text: "ab", sentence: "abc de" }), 8);
});

// ----- Azure: the voice per language and dialect, the request -----

test("a sensible Azure voice for every language but Bisaya, and Arabic by the country chosen", () => {
  for (const code of LANGUAGE_CODES) {
    const v = azureVoiceFor(code);
    if (code === "ceb") assert.equal(v, null, "Azure has no Bisaya voice");
    else assert.match(v, new RegExp(`^${code === "tl" ? "fil" : code}-[A-Z]{2}-\\w+Neural$`), code);
  }
  assert.equal(azureVoiceFor("ar"), "ar-SA-ZariyahNeural");
  assert.equal(azureVoiceFor("ar", { country: "EG" }), "ar-EG-SalmaNeural");
  assert.equal(azureVoiceFor("ar", { country: "ma" }), "ar-MA-MounaNeural");
  assert.equal(azureVoiceFor("ar", { country: "LB" }), "ar-LB-LaylaNeural");
  assert.equal(azureVoiceFor("es", { country: "ES" }), "es-ES-ElviraNeural");
  assert.equal(azureVoiceFor("es", { country: "XX" }), AZURE_VOICES.es, "an unknown country: the usual voice");
  assert.equal(azureVoiceFor("ar", { picked: { ar: "ar-SY-LaithNeural" }, country: "EG" }), "ar-SY-LaithNeural", "the learner's pick wins");
  assert.equal(azureVoiceFor("ar", { picked: { ar: "es-ES-ElviraNeural" } }), "ar-SA-ZariyahNeural", "a pick in another language is ignored");
  assert.equal(azureVoiceFor("ar", { picked: { ar: "<script>" } }), "ar-SA-ZariyahNeural");
});

test("picked voices are kept per language as one small setting", () => {
  let s = { tts_voices: withPickedVoice({}, "ar", "ar-EG-ShakirNeural") };
  s = { tts_voices: withPickedVoice(s, "es", "es-MX-JorgeNeural") };
  assert.deepEqual(pickedVoices(s), { ar: "ar-EG-ShakirNeural", es: "es-MX-JorgeNeural" });
  assert.deepEqual(pickedVoices({ tts_voices: withPickedVoice(s, "ar", "") }), { es: "es-MX-JorgeNeural" });
  assert.equal(withPickedVoice({}, "ar", ""), "");
  assert.deepEqual(pickedVoices({ tts_voices: "nonsense" }), {});
});

test("the SSML: the voice, its language, exact silences and the text made safe", () => {
  const ssml = buildSsml(`Tom & "Jerry" <b>`, "ar-EG-SalmaNeural", { lead: 60, tail: 900 });
  assert.match(ssml, /^<speak version="1.0" xmlns="http:\/\/www.w3.org\/2001\/10\/synthesis" xmlns:mstts="http:\/\/www.w3.org\/2001\/mstts" xml:lang="ar-EG">/);
  assert.match(ssml, /<voice name="ar-EG-SalmaNeural">/);
  assert.match(ssml, /<mstts:silence type="Leading-exact" value="60ms"\/><mstts:silence type="Tailing-exact" value="900ms"\/>/);
  assert.ok(ssml.includes("Tom &amp; &quot;Jerry&quot; &lt;b&gt;</voice></speak>"));
  assert.ok(!ssml.includes("<b>"));
});

test("the key, the region and Azure's answers, worded for the learner", () => {
  assert.equal(cleanRegion(" West Europe "), "westeurope");
  assert.equal(cleanAzureKey(' Key 1: "abcd1234abcd1234abcd1234abcd1234" '), "abcd1234abcd1234abcd1234abcd1234");
  assert.equal(azureReady({ tts_mode: "azure", tts_key_azure: "abcd1234abcd1234", tts_region_azure: "eastus" }), true);
  assert.equal(azureReady({ tts_mode: "device", tts_key_azure: "abcd1234abcd1234", tts_region_azure: "eastus" }), false);
  assert.equal(azureReady({ tts_mode: "azure", tts_key_azure: "abcd1234abcd1234" }), false, "a region is needed too");
  assert.equal(azureError(401, "eastus").keyRejected, true);
  assert.equal(azureError(400).badVoice, true);
  assert.match(azureError(429).message, /free allowance/);
  assert.equal(voiceMode({ tts_mode: "nonsense" }), "device");
  for (const k of ["tts_key_azure", "tts_region_azure", "tts_mode", "tts_voices"]) assert.ok(KEYS.includes(k), `${k} syncs like the other keys`);
});

test("Azure's voice list is narrowed to the language's plain neural voices", () => {
  const list = [
    { name: "ar-EG-SalmaNeural", locale: "ar-EG", type: "Neural" }, { name: "ar-SA-HamedNeural", locale: "ar-SA", type: "Neural" },
    { name: "en-US-Ava:DragonHDLatestNeural", locale: "en-US", type: "Neural" }, { name: "fil-PH-BlessicaNeural", locale: "fil-PH", type: "Neural" },
    { name: "es-ES-ElviraNeural", locale: "es-ES", type: "Neural" },
  ];
  assert.deepEqual(voicesForLanguage(list, "ar").map((x) => x.name), ["ar-EG-SalmaNeural", "ar-SA-HamedNeural"]);
  assert.deepEqual(voicesForLanguage(list, "tl").map((x) => x.name), ["fil-PH-BlessicaNeural"]);
  assert.deepEqual(voicesForLanguage(list, "en"), [], "HD voices (charged more) are left out");
});

// ----- one file for the word and the sentence -----

/** A small Ogg Opus file of `n` 20 ms packets, as a speech service sends it (CRC and all). */
function fakeOpus(n, skip = 312) {
  const head = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1, skip & 0xff, skip >> 8, 0x80, 0xbb, 0, 0, 0, 0, 0]);
  const tags = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 0, 0, 0, 0, 0, 0, 0, 0]);
  const packets = Array.from({ length: n }, (_, i) => new Uint8Array([0xf8, i & 0xff, 7, 7]));  // config 31: 20 ms
  return { head, tags, packets };
}
function oggFile(n, skip = 312) {
  const { head, tags, packets } = fakeOpus(n, skip);
  const page = (list, granule, seq, flags) => {
    const laces = list.flatMap((p) => [...Array(Math.floor(p.length / 255)).fill(255), p.length % 255]);
    const body = list.reduce((a, p) => new Uint8Array([...a, ...p]), new Uint8Array());
    const out = new Uint8Array(27 + laces.length + body.length);
    out.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);
    new DataView(out.buffer).setUint32(6, granule, true);
    new DataView(out.buffer).setUint32(18, seq, true);
    out[26] = laces.length;
    out.set(laces, 27);
    out.set(body, 27 + laces.length);
    return out;
  };
  const pages = [page([head], 0, 0, 2), page([tags], 0, 1, 0), page(packets, n * 960, 2, 4)];
  return pages.reduce((a, p) => new Uint8Array([...a, ...p]), new Uint8Array());
}

test("two Ogg Opus files become one stream, and each part's place in it is known", () => {
  const word = oggFile(50), sentence = oggFile(150);  // 1 s and 3 s
  assert.equal(opusPackets(word).audio.length, 50);
  const joined = joinOggOpus([word, sentence]);
  const info = oggOpusInfo(joined.bytes);
  assert.equal(info.intact, true, "every page has a right checksum");
  assert.equal(info.ended, true);
  assert.ok(Math.abs(info.seconds - (4 - 312 / 48000)) < 1e-6, String(info.seconds));
  assert.equal(joined.parts.length, 2);
  assert.ok(Math.abs(joined.parts[0].seconds - (1 - 312 / 48000)) < 1e-9);
  assert.ok(Math.abs(joined.parts[1].start - (1 - 312 / 48000)) < 1e-9);
  assert.ok(Math.abs(joined.parts[1].seconds - 3) < 1e-9);
  assert.equal(joinOggOpus([word, new Uint8Array([1, 2, 3])]), null, "not Ogg Opus: nothing");
});

test("where the word and the sentence are inside a card's voice", () => {
  const t = clipTimes([{ start: 0, seconds: 1.5 }, { start: 1.5, seconds: 3 }], { lead: 0.06, gap: 0.9, tail: 0.35 });
  assert.deepEqual(t, { start: 0.06, end: 0.6, sent_start: 1.56, sent_end: 4.15 });
  assert.deepEqual(clipTimes([{ start: 0, seconds: 0.5 }], { lead: 0.06, gap: 0.35 }), { start: 0.06, end: 0.21, sent_start: null, sent_end: null },
    "a word alone: at least a moment long, and no sentence");
});

test("a card's voice from Azure: two requests, one kept file", async () => {
  const asked = [];
  const fetchFn = async (url, opts) => {
    asked.push({ url, opts });
    return { ok: true, status: 200, arrayBuffer: async () => oggFile(asked.length === 1 ? 50 : 100).buffer };
  };
  const made = await makeAzureVoice({ text: "cartera", sentence: "Perdí mi cartera." }, { key: "k".repeat(32), region: "West Europe", voice: "es-ES-ElviraNeural", fetchFn });
  assert.equal(asked.length, 2);
  assert.equal(asked[0].url, "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1", "only ever Azure's own address");
  assert.equal(asked[0].opts.headers["Ocp-Apim-Subscription-Key"], "k".repeat(32));
  assert.equal(asked[0].opts.headers["X-Microsoft-OutputFormat"], "ogg-48khz-16bit-mono-opus");
  assert.match(asked[0].opts.body, />cartera<\/voice>/);
  assert.match(asked[1].opts.body, />Perdí mi cartera.<\/voice>/);
  assert.ok(made.times.start < made.times.end && made.times.end < made.times.sent_start && made.times.sent_start < made.times.sent_end);
  assert.equal(oggOpusInfo(made.bytes).intact, true);
  const refused = async () => ({ ok: false, status: 401 });
  await assert.rejects(makeAzureVoice({ text: "x" }, { key: "k", region: "eastus", voice: "es-ES-ElviraNeural", fetchFn: refused }), (e) => e.keyRejected);
  const offline = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(makeAzureVoice({ text: "x" }, { key: "k", region: "nowhere", voice: "es-ES-ElviraNeural", fetchFn: offline }), /Couldn't reach Azure/);
});

// ----- made once -----

test("a card's voice is made once: a second press waits for the first, and a made voice is never made again", async () => {
  forgetMaking();
  let made = 0, kept = 0;
  const make = async () => { made++; await new Promise((r) => setTimeout(r, 10)); return { bytes: new Uint8Array(4), times: { start: 0.06, end: 0.5, sent_start: null, sent_end: null } }; };
  const keep = async () => { kept++; };
  const v = { uid: "w1", text: "cartera" };
  const [a, b] = await Promise.all([ensureVoice(v, make, keep), ensureVoice(v, make, keep)]);
  assert.equal(a && b, true);
  assert.equal(made, 1, "paid for once");
  assert.equal(kept, 1);
  assert.deepEqual(voiceTimes(v), { start: 0.06, end: 0.5, sent_start: null, sent_end: null });
  await ensureVoice(v, make, keep);
  assert.equal(made, 1, "already has its voice");
  const podcast = { uid: "w2", text: "hola", episode_id: 1, audio_type: "audio/mpeg", start: 1 };
  await ensureVoice(podcast, make, keep);
  assert.equal(made, 1, "a card with its own recording is never voiced");
  assert.equal(await ensureVoice({ uid: "w3", text: "kaayo" }, async () => null, keep), false, "no voice for its language");
});

test("a voice is never taken away by a copy from another device that has none", () => {
  const mine = { uid: "w", voice: '{"start":0.06,"end":0.7}', updated_at: 10 };
  const theirs = { uid: "w", voice: "", meaning: "wallet", updated_at: 20 };
  const merged = keepVoice(theirs, mine);
  assert.equal(merged.voice, mine.voice);
  assert.equal(merged.meaning, "wallet");
  assert.ok(merged.updated_at > 20);
  assert.equal(keepVoice({ ...theirs, voice: '{"start":1,"end":2}' }, mine).voice, '{"start":1,"end":2}');
});

// ----- saying a card: never an error while any voice can say it -----

function deps(over = {}) {
  const log = [];
  return {
    log,
    playSnippet: async (v, s, e, o) => { log.push(["play", s, e, o.voice]); return { ended: Promise.resolve() }; },
    speakDevice: async (text, lang) => { log.push(["device", text, lang]); return { ended: Promise.resolve() }; },
    makeVoice: null, lang: "es", onNote: (m) => log.push(["note", m]),
    ...over,
  };
}

test("a card with a podcast recording plays it; a broken one falls back to the voice", async () => {
  const v = { text: "hola", sentence: "hola amigo", episode_id: 1, audio_type: "audio/mpeg", start: 1, end: 1.4, sent_start: 0.5, sent_end: 2 };
  const d = deps();
  await sayCard(v, "word", d);
  assert.deepEqual(d.log, [["play", 1, 1.4, false]]);
  const broken = deps({ playSnippet: async () => { throw new Error("Couldn't load this word's audio."); } });
  await sayCard(v, "sentence", broken);
  assert.deepEqual(broken.log, [["device", "hola amigo", "es"]], "no error: the device's voice says it");
});

test("a word from YouTube uses the voice: kept, made now, or the device's", async () => {
  const yt = { uid: "y", text: "concientizar", sentence: "Hay que concientizar.", episode_id: 2, audio_type: "video/youtube", start: 3, end: 4 };
  const d = deps();
  await sayCard({ ...yt }, "word", d);
  assert.deepEqual(d.log, [["device", "concientizar", "es"]], "never the video's times");
  const kept = deps();
  await sayCard({ ...yt, voice: '{"start":0.06,"end":0.8,"sent_start":1.7,"sent_end":3.1}' }, "sentence", kept);
  assert.deepEqual(kept.log, [["play", 1.7, 3.1, true]]);
  const card = { ...yt };
  const making = deps({ makeVoice: async (v) => { v.voice = '{"start":0.06,"end":0.8}'; return true; } });
  await sayCard(card, "word", making);
  assert.deepEqual(making.log, [["play", 0.06, 0.8, true]]);
  const failing = deps({ makeVoice: async () => { throw new Error("Azure says too many requests."); } });
  await sayCard({ ...yt }, "word", failing);
  assert.deepEqual(failing.log, [["note", "Azure says too many requests."], ["device", "concientizar", "es"]]);
});

// ----- waiting for the computer, the device's voices -----

test("cards waiting for the computer's voice", () => {
  const words = [
    { text: "cartera", language: "es" }, { text: "hola", language: "es", voice: '{"start":0,"end":1}' },
    { text: "vid", language: "es", episode_id: 1, audio_type: "video/youtube", start: 1 },
    { text: "pod", language: "es", episode_id: 1, audio_type: "audio/mpeg", start: 1 },
    { text: "こんにちは", language: "ja" }, { text: "gone", language: "es", deleted: 1 },
  ];
  assert.deepEqual(waitingForComputer(words), { count: 2, langs: { es: 2 }, without: 1 });
});

test("the device's voice for a language: exact, else the same language, else none", () => {
  const voices = [{ lang: "en-US", name: "A" }, { lang: "ar-EG", name: "B" }, { lang: "fil_PH", name: "C" }, { lang: "es-ES", name: "D" }];
  assert.equal(pickDeviceVoice(voices, "es").name, "D");
  assert.equal(pickDeviceVoice(voices, "ar").name, "B", "Egyptian when there is no Saudi one");
  assert.equal(pickDeviceVoice(voices, "tl").name, "C");
  assert.equal(pickDeviceVoice(voices, "ja"), null);
});
