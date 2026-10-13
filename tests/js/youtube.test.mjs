// Run with: node --test tests/js/
// Reading YouTube captions: finding the video id, choosing a caption track, and turning
// YouTube's caption format into timed lines and words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptionError, baseLanguage, captionLines, fetchCaptions, pickTrack, videoId } from "../../web/js/ytcaptions.js";

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
  assert.deepEqual([pick.language, pick.auto], ["ar", false]);
});

test("automatic captions are used when nobody wrote any", () => {
  const pick = pickTrack([track("en"), track("ar", "asr")], "ar", TAUGHT);
  assert.deepEqual([pick.language, pick.auto], ["ar", true]);
});

test("a regional track counts, but the plain language is preferred", () => {
  const tracks = [track("es-419"), track("es")];
  assert.equal(pickTrack(tracks, "es", TAUGHT).track, tracks[1]);
  assert.equal(pickTrack([track("zh-Hans")], "zh", TAUGHT).language, "zh");
});

test("a video in another taught language is taken in the language it is spoken in", () => {
  // Studying Arabic, pasting a Japanese video: Japanese is what's spoken (automatic captions exist for it).
  const pick = pickTrack([track("ja", "asr"), track("en")], "ar", TAUGHT);
  assert.deepEqual([pick.language, pick.auto], ["ja", true]);
  // An English song with Japanese and Spanish subtitles is not Japanese.
  assert.equal(pickTrack([track("en"), track("en", "asr"), track("ja"), track("es-419")], "ar", TAUGHT), null);
  // No automatic captions at all: a hand-written track in a taught language is the best guess.
  assert.equal(pickTrack([track("de"), track("fr")], "ar", TAUGHT).language, "fr");
  assert.equal(pickTrack([track("de")], "ar", TAUGHT), null);
  assert.equal(pickTrack([], "ar", TAUGHT), null);
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
  await fails({ tracks: [] }, "no_captions", /^No captions available/);
  await fails({ tracks: [track("en"), track("en", "asr")] }, "no_language", /^No Arabic captions available/);
  await fails({ captions: { events: [] } }, "no_captions", /^No captions available/);
  await fails({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age", tracks: [] }, "unavailable", /Sign in to confirm your age/);
  await fails({ tracks: [{ baseUrl: "https://evil.example/steal", languageCode: "ar" }] }, "no_captions", /No captions/);
  await assert.rejects(fetchCaptions("lo3KyF50IGE", opts(async () => { throw new Error("offline"); })), (e) => e.code === "network");
});
