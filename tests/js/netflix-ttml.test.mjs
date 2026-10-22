// Run with: node --test tests/js/
// Netflix's subtitle files read in JavaScript (web/js/netflix-ttml.js), for the browser extension:
// the same cases as the computer's Python reader (tests/test_netflix.py), so both read a file alike.
// The subtitle lines here are written for these tests; nothing comes from Netflix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TTML_BYTES, TtmlError, baseLanguage, bestSubtitles, captionLines, cleanInfo, cleanTitleId, displayTitle,
  isSubtitleDownload, parseTtml, ttmlSeconds } from "../../web/js/netflix-ttml.js";

const TICKS = 10_000_000;
/** A subtitle file shaped like Netflix's (DFXP, times in ticks). */
function ttml(lang, cues, tick = true) {
  const ps = cues.map(([b, e, text], i) => {
    const when = tick ? `begin="${Math.round(b * TICKS)}t" end="${Math.round(e * TICKS)}t"` : `begin="${b}s" end="${e}s"`;
    return `<p ${when} region="region0" style="s1" xml:id="subtitle${i + 1}">${text}</p>`;
  });
  return '<?xml version="1.0" encoding="utf-8"?>\n'
    + '<tt xmlns:tt="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" '
    + 'xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:tickRate="10000000" ttp:timeBase="media" '
    + `xmlns="http://www.w3.org/ns/ttml" xml:lang="${lang}">\n`
    + '<head><ttp:profile use="http://netflix.com/ttml/profile/dfxp-ls-sdh"/><styling>'
    + '<style tts:fontStyle="italic" xml:id="s2"/></styling><layout><region xml:id="region0"/></layout></head>\n'
    + '<body><div xml:space="preserve">\n' + ps.join("\n") + "\n</div></body></tt>\n";
}

const FULL = [[2.0, 5.2, "مرحباً، كيف حالك اليوم؟"], [6.0, 9.2, "أنا بخير، شكراً."], [10.0, 13.2, "‫الجو جميل جداً.‬"],
  [14.0, 17.2, "[موسيقى]"], [18.0, 21.2, "- هل رأيت أخي؟<br/>- لا، لم أره."],
  [22.0, 25.2, '<span style="s2">هذا</span> كتاب &amp; جديد.']];

test("reads Netflix's subtitles: ticks, spans, line breaks, bidi marks, sound labels, speakers' dashes", () => {
  const parsed = parseTtml(ttml("ar-LB", FULL));
  assert.equal(parsed.lang, "ar-LB");
  assert.deepEqual(parsed.cues, [
    [2, 5.2, "مرحباً، كيف حالك اليوم؟"], [6, 9.2, "أنا بخير، شكراً."], [10, 13.2, "الجو جميل جداً."],
    [18, 21.2, "هل رأيت أخي؟ لا، لم أره."], [22, 25.2, "هذا كتاب & جديد."]]);
  assert.equal(parseTtml("﻿" + ttml("ar", FULL.slice(0, 1))).cues.length, 1, "a byte-order mark is fine");
});

test("reads every kind of TTML time", () => {
  const r = { tick: TICKS, frame: 25, sub: 2 };
  assert.equal(ttmlSeconds("240000000t", r), 24);
  assert.equal(ttmlSeconds("00:00:24.500", r), 24.5);
  assert.equal(ttmlSeconds("01:02:03", r), 3723);
  assert.equal(ttmlSeconds("00:00:24,25", r), 24.25);
  assert.ok(Math.abs(ttmlSeconds("00:00:24:10", r) - 24.4) < 1e-9);
  assert.ok(Math.abs(ttmlSeconds("00:00:24:10.1", r) - 24.42) < 1e-9);
  assert.deepEqual(["1.5h", "2m", "24.5s", "1500ms", "50f"].map((x) => ttmlSeconds(x, r)), [5400, 120, 24.5, 1.5, 2]);
  assert.deepEqual(["", "soon", null].map((x) => ttmlSeconds(x, r)), [null, null, null]);
});

test("clock times, durations, nested offsets and missing ends", () => {
  const parsed = parseTtml('<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="es"><body><div begin="10s">'
    + '<p begin="00:00:01.000" end="00:00:03.000">Hola</p><p begin="4s" dur="1.5s">¿Qué tal?</p>'
    + '<p begin="7s">Sin final</p><p begin="9s" end="10s">   </p><p>sin comienzo</p>'
    + '</div><div><p begin="00:00:02.000" end="00:00:02.500">Primero</p></div></body></tt>');
  assert.equal(parsed.lang, "es");
  assert.deepEqual(parsed.cues, [[2, 2.5, "Primero"], [11, 13, "Hola"], [14, 15.5, "¿Qué tal?"], [17, null, "Sin final"]]);
  const lines = captionLines(parsed.cues);
  assert.deepEqual([lines.at(-1).start, lines.at(-1).end], [17, 19], "no end given: two seconds");
});

test("frame rate and its multiplier", () => {
  const { cues } = parseTtml('<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="30" '
    + 'ttp:frameRateMultiplier="1000 1001" xml:lang="fr"><body><p begin="00:00:01:15" end="90f">Bonjour</p></body></tt>');
  assert.ok(Math.abs(cues[0][0] - (1 + 15 / 29.97)) < 1e-3 && Math.abs(cues[0][1] - 90 / 29.97) < 1e-3);
});

test("refuses what isn't a subtitle file", () => {
  for (const bad of ["", "not xml at all", "<html><body>Pardon the interruption</body></html>", "<tt><body><p begin='1s'>open",
    '<!DOCTYPE tt [<!ENTITY a "aaaa">]><tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s">&a;</p></body></tt>',
    "x".repeat(MAX_TTML_BYTES + 1)]) {
    assert.throws(() => parseTtml(bad), TtmlError, bad.slice(0, 40));
  }
});

test("caption lines end where the next begins and spread their words", () => {
  const lines = captionLines([[1, 4, "uno dos"], [3, 5, "tres"], [3, 3, "cuatro"]]);
  assert.deepEqual(lines.map((x) => [x.start, x.end]), [[1, 3], [3, 5], [3, 3.5]]);
  assert.deepEqual(lines[0].words, [[1, 2, "uno"], [2, 3, "dos"]], "spread in proportion to their length");
  const starts = lines.flatMap((x) => x.words.map((w) => w[0]));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b), "times never run backwards");
});

test("which downloads may be subtitle files", () => {
  assert.ok(isSubtitleDownload("https://ipv4-c001-lhr001-ix.1.oca.nflxvideo.net/?o=1&v=5&e=17&t=abc", "text/xml"));
  assert.ok(!isSubtitleDownload("https://ipv4-c001.1.oca.nflxvideo.net/range/0-5000?o=1", "text/xml"), "video pieces");
  assert.ok(!isSubtitleDownload("https://x.oca.nflxvideo.net/?o=1", "image/svg+xml"), "pictures");
  assert.ok(!isSubtitleDownload("https://x.oca.nflxvideo.net/?o=1", "application/octet-stream"));
  assert.ok(!isSubtitleDownload("https://evil.example/?o=1", "text/xml"));
  assert.ok(!isSubtitleDownload("https://nflxvideo.net.evil.example/?o=1", "text/xml"));
  assert.ok(!isSubtitleDownload("not a url", "text/xml"));
  assert.ok(isSubtitleDownload("http://127.0.0.1:8932/subs/ar.xml", "text/xml; charset=utf-8", /^127\.0\.0\.1$/), "a test stand-in, when told");
});

test("the file kept: the language being learned, the variant chosen, then the most lines", () => {
  const files = [
    { lang: "ar-LB", cues: [[10, 12, "مقهى البحر"]], at: 3 },             // Netflix's forced lines (signs)
    { lang: "ar-LB", cues: parseTtml(ttml("ar-LB", FULL)).cues, at: 1 },  // the full file
    { lang: "en", cues: Array(400).fill([1, 2, "x"]), at: 2 },              // another language's
    { lang: "ar", cues: Array(3).fill([1, 2, "y"]), at: 4 },
  ];
  assert.equal(bestSubtitles(files, "ar").cues.length, 5, "the most lines in Arabic");
  assert.equal(bestSubtitles(files, "ar", "ar").lang, "ar", "the variant chosen first");
  assert.equal(bestSubtitles(files, "en").lang, "en");
  assert.equal(bestSubtitles(files, "fr"), null);
  assert.equal(bestSubtitles([], "ar"), null);
  assert.equal(baseLanguage("fil"), "tl");
});

test("a title's name and its plain description", () => {
  assert.equal(displayTitle({ show: "حكايات الحي", season: 1, episode: 3, episode_title: "الصباح" }), "حكايات الحي · S1:E3 · الصباح");
  assert.equal(displayTitle({ title: "بيت الجدة" }), "بيت الجدة");
  assert.equal(displayTitle({}), "Netflix title");
  const info = cleanInfo({ title: "  A\n film ", image: "http://insecure/x.jpg", season: "2", duration: 5400.7, extra: "<b>" });
  assert.deepEqual(info, { title: "A film", show: "", season: 2, episode: 0, episode_title: "", image: "", duration: 5400 });
  assert.equal(cleanTitleId(" 81234567 "), "81234567");
  assert.equal(cleanTitleId("81234567/../x"), "");
});
