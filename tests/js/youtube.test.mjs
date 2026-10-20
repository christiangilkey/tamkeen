// Run with: node --test tests/js/
// Reading YouTube captions: finding the video id, choosing a caption track, and turning
// YouTube's caption format into timed lines and words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CaptionError, audioInLanguage, baseLanguage, captionChoices, captionLines, dubbedAudio, fetchCaptions, pickTrack, videoId,
  youTubeLanguage } from "../../web/js/ytcaptions.js";

const TAUGHT = ["es", "ar", "fr", "ja", "zh", "ru"];
const track = (languageCode, kind) => ({ baseUrl: `https://www.youtube.com/api/timedtext?v=x&lang=${languageCode}${kind ? "&kind=asr" : ""}`, languageCode, kind });

test("finds the video id in every kind of YouTube link", () => {
  const id = "lo3KyF50IGE";
  for (const link of [id, `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=abc`, `youtube.com/watch?v=${id}&t=30s`,
    `https://m.youtube.com/watch?feature=share&v=${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?x=1`, `https://music.youtube.com/watch?v=${id}`, `  https://youtu.be/${id}  `]) {
    assert.equal(videoId(link), id, link);
  }
  for (const link of ["", "hello", "https://example.com/watch?v=lo3KyF50IGE", "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/@channel", "https://vimeo.com/123456789"]) {
    assert.equal(videoId(link), null, link);
  }
});

test("language codes fold onto the app's", () => {
  assert.equal(baseLanguage("ar-EG"), "ar");
  assert.equal(baseLanguage("zh-Hans"), "zh");
  assert.equal(baseLanguage("cmn"), "zh");
  assert.equal(baseLanguage("es_419"), "es");
});

test("captions written by a person beat automatic ones", () => {
  const tracks = [track("en"), track("ar", "asr"), track("ar")];
  const pick = pickTrack(tracks, "ar", TAUGHT);
  assert.equal(pick.track, tracks[2]);
  assert.deepEqual([pick.language, pick.auto, pick.kind], ["ar", false, "manual"]);
});

test("automatic captions are used when nobody wrote any", () => {
  const pick = pickTrack([track("en"), track("ar", "asr")], "ar", TAUGHT);
  assert.deepEqual([pick.language, pick.auto, pick.kind], ["ar", true, "auto"]);
});

test("a regional track counts, but the plain language is preferred", () => {
  const tracks = [track("es-419"), track("es")];
  assert.equal(pickTrack(tracks, "es", TAUGHT).track, tracks[1]);
  assert.equal(pickTrack([track("zh-Hans")], "zh", TAUGHT).language, "zh");
});

test("with nothing in the language, YouTube's translation of the spoken language comes next", () => {
  // Studying Arabic, a Japanese video: YouTube's Arabic translation of what is said (the Japanese
  // automatic captions), then the Japanese captions themselves for when YouTube won't translate.
  const tracks = [track("ja", "asr"), track("en")];
  const [first, second] = captionChoices(tracks, "ar", TAUGHT);
  assert.deepEqual([first.track, first.language, first.kind, first.auto, first.tlang, first.from], [tracks[0], "ar", "translated", false, "ar", "ja"]);
  assert.deepEqual([second.track, second.language, second.kind], [tracks[0], "ja", "auto"]);
  // A person's track in the spoken language is the better one to translate.
  const both = [track("en", "asr"), track("ja"), track("en")];
  assert.equal(pickTrack(both, "ar", TAUGHT).track, both[2]);
  // A track YouTube says it can't translate is not asked for.
  assert.equal(pickTrack([{ ...track("en", "asr"), isTranslatable: false }, track("fr")], "ar", TAUGHT).track.languageCode, "fr");
  assert.equal(pickTrack([], "ar", TAUGHT), null);
});

test("without translations, a video in another taught language is taken in the language it is spoken in", () => {
  const no = { translate: false };
  const pick = pickTrack([track("ja", "asr"), track("en")], "ar", TAUGHT, no);
  assert.deepEqual([pick.language, pick.auto], ["ja", true]);
  // An English song with Japanese and Spanish subtitles is not Japanese.
  assert.equal(pickTrack([track("en"), track("en", "asr"), track("ja"), track("es-419")], "ar", TAUGHT, no), null);
  // No automatic captions at all: a hand-written track in a taught language is the best guess.
  assert.equal(pickTrack([track("de"), track("fr")], "ar", TAUGHT, no).language, "fr");
  assert.equal(pickTrack([track("de")], "ar", TAUGHT, no), null);
});

test("“Only videos with handmade subtitles” takes only a person's track in the language", () => {
  const only = { handmadeOnly: true };
  assert.equal(pickTrack([track("ar", "asr"), track("en")], "ar", TAUGHT, only), null);
  assert.deepEqual(captionChoices([track("ar", "asr"), track("ar"), track("en")], "ar", TAUGHT, only).map((c) => c.kind), ["manual"]);
});

test("translations are asked for in YouTube's own language codes", () => {
  assert.deepEqual(["zh", "tl", "ar"].map(youTubeLanguage), ["zh-Hans", "fil", "ar"]);
  const tlang = (wanted, list) => pickTrack([track("en", "asr")], wanted, TAUGHT, { translationLanguages: list }).tlang;
  assert.equal(tlang("zh", null), "zh-Hans");
  assert.equal(tlang("zh", [{ languageCode: "ar" }, { languageCode: "zh-Hant" }]), "zh-Hant", "the one YouTube lists");
  assert.equal(tlang("tl", [{ languageCode: "fil" }]), "fil");
  assert.equal(tlang("ca", [{ languageCode: "ar" }]), "ca", "not listed: asked for all the same");
});

// What YouTube sends for automatic captions: one event per line with a time for every word,
// and "append" events holding only a line break.
const AUTO = { events: [
  { tStartMs: 0, dDurationMs: 2000000, id: 1 },
  { tStartMs: 1040, dDurationMs: 6960, segs: [{ utf8: "عمو" }, { utf8: " عمو", tOffsetMs: 919 }, { utf8: " لو", tOffsetMs: 1680 }, { utf8: " سمحت", tOffsetMs: 1920 }] },
  { tStartMs: 3429, dDurationMs: 4571, aAppend: 1, segs: [{ utf8: "\n" }] },
  { tStartMs: 3439, dDurationMs: 8521, segs: [{ utf8: ">> عمو", isSpeakerChange: 1 }, { utf8: " انا", tOffsetMs: 920 }, { utf8: " [ضحك]", tOffsetMs: 2665 }] },
  { tStartMs: 9000, dDurationMs: 2000, segs: [{ utf8: "[موسيقى]" }] },
] };

test("automatic captions keep YouTube's time for every word", () => {
  const lines = captionLines(AUTO, true);
  assert.equal(lines.length, 2, "line breaks and sound labels are not lines");
  assert.equal(lines[0].text, "عمو عمو لو سمحت");
  assert.deepEqual(lines[0].words.map((w) => w[2]), ["عمو", "عمو", "لو", "سمحت"]);
  assert.deepEqual(lines[0].words.map((w) => w[0]), [1.04, 1.959, 2.72, 2.96]);
  assert.deepEqual(lines[0].words.map((w) => w[1]), [1.959, 2.72, 2.96, 3.439], "a word ends where the next begins; the last where the next line begins");
  assert.equal(lines[1].text, "عمو انا", "speaker arrows and [labels] are removed");
  assert.equal(lines[1].words.at(-1)[1], 5.559, "the last word of the video lasts a moment, not until its line leaves the screen");
});

const MANUAL = { events: [
  { tStartMs: 840, dDurationMs: 2460, segs: [{ utf8: "عمو! عمو!\nلو سمحت!" }] },
  { tStartMs: 3300, dDurationMs: 1000, segs: [{ utf8: "[♪♪♪]" }] },
  { tStartMs: 5000, dDurationMs: 3000, segs: [{ utf8: "أنا بقيت عمو؟!" }] },
  { tStartMs: 7000, dDurationMs: 2000, segs: [{ utf8: "خير يا حبيبي؟" }] },
] };

test("hand-written captions spread their words across the line", () => {
  const lines = captionLines(MANUAL, false);
  assert.deepEqual(lines.map((l) => l.text), ["عمو! عمو! لو سمحت!", "أنا بقيت عمو؟!", "خير يا حبيبي؟"]);
  const first = lines[0];
  assert.deepEqual([first.start, first.end], [0.84, 3.3]);
  assert.equal(first.words.length, 4);
  assert.equal(first.words[0][0], 0.84);
  assert.equal(first.words.at(-1)[1], 3.3);
  for (let i = 1; i < first.words.length; i++) assert.equal(first.words[i][0], first.words[i - 1][1], "no gaps inside a line");
  assert.ok(first.words[3][1] - first.words[3][0] > first.words[2][1] - first.words[2][0], "longer words get more time");
  assert.equal(lines[1].end, 7, "overlapping lines: one ends where the next begins");
});

test("times never run backwards", () => {
  const lines = captionLines({ events: [
    { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: "b" }] },
    { tStartMs: 1000, dDurationMs: 9000, segs: [{ utf8: "a a" }] },
    { tStartMs: 5000, dDurationMs: 0, segs: [{ utf8: "c" }] },
  ] }, false);
  const starts = lines.flatMap((l) => l.words.map((w) => w[0]));
  assert.deepEqual(starts, [...starts].sort((x, y) => x - y));
  for (const l of lines) for (const w of l.words) assert.ok(w[1] >= w[0]);
  assert.deepEqual(captionLines(null, true), []);
  assert.deepEqual(captionLines({ events: [] }, false), []);
});

test("Japanese lines keep no spaces between their pieces", () => {
  const lines = captionLines({ events: [
    { tStartMs: 320, dDurationMs: 4000, segs: [{ utf8: "はい" }, { utf8: "、", tOffsetMs: 160 }, { utf8: "皆", tOffsetMs: 240 }, { utf8: "さん", tOffsetMs: 400 }] },
  ] }, true);
  assert.equal(lines[0].text, "はい、皆さん");
  assert.deepEqual(lines[0].words.map((w) => w[2]), ["はい", "、", "皆", "さん"]);
});

// ----- the whole fetch, against a pretend YouTube -----
function pretendYouTube({ tracks = [track("ar", "asr")], captions = AUTO, status = "OK", reason, emptyFirst = false } = {}) {
  const seen = [];
  const request = async (req) => {
    seen.push(req);
    // YouTube's translations are refused, as YouTube refuses them to anyone but its own player.
    if (new URL(req.url).searchParams.get("tlang")) return { status: 429, text: "<html>Sorry...</html>" };
    if (req.url.includes("/youtubei/v1/player")) {
      const client = JSON.parse(req.body).context.client.clientName;
      if (emptyFirst && client === "ANDROID") return { status: 200, text: JSON.stringify({ playabilityStatus: { status: "OK" }, videoDetails: { title: "T" } }) };
      return { status: 200, text: JSON.stringify({
        playabilityStatus: { status, reason },
        videoDetails: status === "OK" ? { title: "الدحيح", author: "AJ+", lengthSeconds: "2037" } : undefined,
        captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
      }) };
    }
    return { status: 200, text: JSON.stringify(captions) };
  };
  return { request, seen };
}
const opts = (request) => ({ language: "ar", languageName: "Arabic", taught: TAUGHT, request });

test("fetching a video returns everything needed to add it", async () => {
  const yt = pretendYouTube();
  const v = await fetchCaptions("lo3KyF50IGE", opts(yt.request));
  assert.deepEqual([v.videoId, v.title, v.channel, v.duration, v.language, v.auto], ["lo3KyF50IGE", "الدحيح", "AJ+", 2037, "ar", true]);
  assert.equal(v.lines.length, 2);
  assert.equal(yt.seen.length, 2, "one question about the video, one download of the captions");
  assert.equal(JSON.parse(yt.seen[0].body).videoId, "lo3KyF50IGE");
  assert.ok(new URL(yt.seen[1].url).searchParams.get("fmt") === "json3" && yt.seen[1].method === "GET");
});

test("a second way of asking is tried when the first lists no captions", async () => {
  const yt = pretendYouTube({ emptyFirst: true });
  const v = await fetchCaptions("lo3KyF50IGE", opts(yt.request));
  assert.equal(v.title, "الدحيح");
  assert.deepEqual(yt.seen.slice(0, 2).map((r) => JSON.parse(r.body).context.client.clientName), ["ANDROID", "IOS"]);
});

test("each way of failing says what happened", async () => {
  const fails = async (setup, code, pattern) => {
    await assert.rejects(fetchCaptions("lo3KyF50IGE", opts(pretendYouTube(setup).request)),
      (e) => e instanceof CaptionError && e.code === code && pattern.test(e.message), `${code}`);
  };
  await fails({ tracks: [] }, "no_captions", /no captions at all.*Try another video/);
  await fails({ tracks: [track("en"), track("en", "asr")] }, "no_language", /^No Arabic captions for this video, and YouTube wouldn't translate/);
  await fails({ tracks: [{ ...track("en"), isTranslatable: false }] }, "no_language", /^No Arabic captions available/);
  await fails({ captions: { events: [] } }, "no_captions", /^No captions available/);
  await fails({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age", tracks: [] }, "unavailable", /Sign in to confirm your age/);
  await fails({ tracks: [{ baseUrl: "https://evil.example/steal", languageCode: "ar" }] }, "no_captions", /No captions/);
  await assert.rejects(fetchCaptions("lo3KyF50IGE", opts(async () => { throw new Error("offline"); })), (e) => e.code === "network");
});

test("YouTube addresses are told apart from every other site", async () => {
  const { isYouTubeAddress } = await import("../../web/js/ytcaptions.js");
  for (const yes of ["https://www.youtube.com/channel/UC-4KnPMmZzwAzW7SbVATUZQ", "https://www.youtube.com/@ajplussaha",
    "https://m.youtube.com/watch?v=lo3KyF50IGE", "https://youtu.be/lo3KyF50IGE", "https://youtube.com/", "  https://music.youtube.com/x "]) {
    assert.equal(isYouTubeAddress(yes), true, yes);
  }
  for (const no of ["", null, "youtube.com", "http://www.youtube.com/", "https://www.youtube.com.evil.example/", "https://notyoutube.com/",
    "https://accounts.google.com/", "tamkeen-video://watch?v=lo3KyF50IGE", "javascript:alert(1)"]) {
    assert.equal(isYouTubeAddress(no), false, String(no));
  }
  // A channel's page is a YouTube address but not a video; a video is both.
  assert.equal(videoId("https://www.youtube.com/channel/UC-4KnPMmZzwAzW7SbVATUZQ"), null);
  assert.equal(videoId("https://www.youtube.com/watch?v=lo3KyF50IGE"), "lo3KyF50IGE");
});

// ----- recorded answers from YouTube (2026-10-20, trimmed: tests/js/fixtures/youtube-players.json) -----
// lpxORICKA9w "2Pac - Ya Hawa feat. Fairuz": only YouTube's automatic English captions (the owner's case);
// plN7JMbadRg MrBeast: person-written captions in 28 languages and 22 dubbed audio tracks;
// lo3KyF50IGE الدحيح: Arabic written by a person and automatic; Hgm3vatPXCM an Arabic vlog with only
// automatic Arabic captions; kT2NVr9gZVI no captions at all.
const PLAYERS = JSON.parse(readFileSync(new URL("./fixtures/youtube-players.json", import.meta.url), "utf8"));
const TRANSLATED = { events: [{ tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: "وأنتم تحبونني يا" }] }] };
function recorded(id, { translated = null } = {}) {
  const seen = [];
  const request = async (req) => {
    seen.push(req);
    if (req.url.includes("/youtubei/v1/player")) return { status: 200, text: JSON.stringify(PLAYERS[id]) };
    const u = new URL(req.url);
    if (u.searchParams.get("tlang")) return translated ? { status: 200, text: JSON.stringify(translated) } : { status: 429, text: "<html>Sorry...</html>" };
    return { status: 200, text: JSON.stringify(u.searchParams.get("kind") === "asr" ? AUTO : MANUAL) };
  };
  return { request, seen };
}
const tracksOf = (id) => PLAYERS[id].captions.playerCaptionsTracklistRenderer;
const learn = (request, extra = {}) => ({ language: "ar", languageName: "Arabic", taught: [...TAUGHT, "en"], request, ...extra });

test("recorded: the choice is a person's track, then YouTube's automatic one, then its translation", () => {
  const kinds = (id, opts = {}) => captionChoices(tracksOf(id).captionTracks, "ar", [...TAUGHT, "en"],
    { translationLanguages: tracksOf(id).translationLanguages, ...opts }).map((c) => `${c.kind}:${c.language}${c.from ? `<${c.from}` : ""}`);
  assert.deepEqual(kinds("lo3KyF50IGE"), ["manual:ar", "auto:ar", "translated:ar<en"], "the translation only if both fail to download");
  assert.deepEqual(kinds("Hgm3vatPXCM"), ["auto:ar"]);
  assert.deepEqual(kinds("lpxORICKA9w"), ["translated:ar<en", "auto:en"], "Arabic translated from English, else the English itself");
  assert.equal(captionChoices(tracksOf("plN7JMbadRg").captionTracks, "ar", TAUGHT)[0].track.vssId, ".ar");
  // With handmade subtitles only:
  assert.deepEqual(kinds("lo3KyF50IGE", { handmadeOnly: true }), ["manual:ar"]);
  assert.deepEqual(kinds("Hgm3vatPXCM", { handmadeOnly: true }), []);
  assert.deepEqual(kinds("lpxORICKA9w", { handmadeOnly: true }), []);
});

test("recorded: the owner's 2Pac video comes in YouTube's Arabic translation when YouTube hands it over", async () => {
  const yt = recorded("lpxORICKA9w", { translated: TRANSLATED });
  const v = await fetchCaptions("lpxORICKA9w", learn(yt.request));
  assert.deepEqual([v.language, v.kind, v.auto, v.from, v.translationRefused], ["ar", "translated", false, "en", false]);
  assert.equal(v.lines[0].text, "وأنتم تحبونني يا");
  const asked = new URL(yt.seen.at(-1).url);
  assert.deepEqual([asked.searchParams.get("tlang"), asked.searchParams.get("lang"), asked.searchParams.get("fmt")], ["ar", "en", "json3"]);
});

test("recorded: when YouTube refuses its translation, the spoken language's captions are used and that is said", async () => {
  const yt = recorded("lpxORICKA9w");
  const v = await fetchCaptions("lpxORICKA9w", learn(yt.request));
  assert.deepEqual([v.language, v.kind, v.auto, v.translationRefused], ["en", "auto", true, true]);
  // Not taught (or handmade only): nothing usable, and the message says what to do.
  await assert.rejects(fetchCaptions("lpxORICKA9w", learn(recorded("lpxORICKA9w").request, { taught: TAUGHT })),
    (e) => e.code === "no_language" && /wouldn't translate.*Try another video/.test(e.message));
  await assert.rejects(fetchCaptions("lpxORICKA9w", learn(recorded("lpxORICKA9w").request, { handmadeOnly: true })),
    (e) => e.code === "no_handmade" && /no Arabic subtitles written by a person.*turn off “Only videos with handmade subtitles”/.test(e.message));
});

test("recorded: automatic captions without asking, and the handmade-only choice respected", async () => {
  const v = await fetchCaptions("Hgm3vatPXCM", learn(recorded("Hgm3vatPXCM").request));
  assert.deepEqual([v.language, v.kind, v.auto, v.audio], ["ar", "auto", true, null]);
  const m = await fetchCaptions("lo3KyF50IGE", learn(recorded("lo3KyF50IGE").request, { handmadeOnly: true }));
  assert.deepEqual([m.language, m.kind, m.auto], ["ar", "manual", false]);
  await assert.rejects(fetchCaptions("Hgm3vatPXCM", learn(recorded("Hgm3vatPXCM").request, { handmadeOnly: true })), (e) => e.code === "no_handmade");
  await assert.rejects(fetchCaptions("kT2NVr9gZVI", learn(recorded("kT2NVr9gZVI").request)), (e) => e.code === "no_captions");
});

test("recorded: a dubbed audio track in the language is found, but not the original sound", async () => {
  const mrbeast = PLAYERS.plN7JMbadRg;
  assert.deepEqual(dubbedAudio(mrbeast, "ar"), { id: "ar.3", name: "Arabic" });
  assert.deepEqual(dubbedAudio(mrbeast, "pt"), { id: "pt.3", name: "Portuguese" });
  assert.equal(dubbedAudio(mrbeast, "en"), null, "English is the original");
  assert.equal(dubbedAudio(mrbeast, "tl"), null);
  assert.equal(dubbedAudio(PLAYERS.lpxORICKA9w, "ar"), null, "one audio track only");
  const v = await fetchCaptions("plN7JMbadRg", learn(recorded("plN7JMbadRg").request));
  assert.deepEqual([v.language, v.kind, v.audio], ["ar", "manual", { id: "ar.3", name: "Arabic" }]);
  assert.deepEqual(await audioInLanguage("plN7JMbadRg", "es", recorded("plN7JMbadRg").request), { id: "es.3", name: "Spanish" });
  assert.equal(await audioInLanguage("plN7JMbadRg", "es", async () => { throw new Error("offline"); }), null);
});
