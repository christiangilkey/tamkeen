// Run with: node --test tests/js/
// Prime Video, the light way (web/js/prime-common.js, web/js/primevideo.js): the browser extension reads
// the subtitle line Prime Video's player shows on screen, and the title's name, from the page; builds the
// lines watched from what it sees; and a saved word goes to the Vocab with where it came from
// (web/js/extbridge.js). Read from saved sample markup of the player (tests/js/fixtures/primevideo/), never
// from Amazon's live site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "./fixtures/tinydom.mjs";
import { cleanCaption, cleanPrimeId, episodeParts, isPrimeHost, lineWithWords, primeSource, primeTitleId, readCaption,
  readTitle, watchedLines } from "../../web/js/primevideo.js";
import { WORD_KEY, cleanPending, cleanWord, keysToForget, pendingFrom, savedPrimeWord, savedWord } from "../../web/js/extbridge.js";

const SAMPLE = readFileSync(new URL("./fixtures/primevideo/player.html", import.meta.url), "utf8");
const lib = () => globalThis.__tamkeenPrimeLib;

test("the subtitle line on screen is read from the player's markup, its lines joined and sound cues left out", () => {
  const doc = parse(SAMPLE);
  assert.deepEqual(readCaption(doc), { text: "مرحبا يا صديقي، كيف حالك اليوم؟", image: false });
});

test("between lines there is nothing to read; subtitles drawn as pictures are told apart", () => {
  const empty = parse(SAMPLE.replace(/<span class="atvwebplayersdk-captions-text[^>]*>[^<]*<\/span>/g, ""));
  assert.deepEqual(readCaption(empty), { text: "", image: false });
  const pictures = parse(SAMPLE.replace(/<span class="atvwebplayersdk-captions-text[^>]*>[^<]*<\/span>/g, `<img src="line.png" alt="">`));
  assert.deepEqual(readCaption(pictures), { text: "", image: true });
  assert.deepEqual(readCaption(null), { text: "", image: false });
});

test("Amazon renaming its classes a little still finds the line (a looser match)", () => {
  const renamed = parse(SAMPLE.replaceAll("atvwebplayersdk-captions-text", "atvwebplayersdk2-captions-text"));
  assert.equal(readCaption(renamed).text, "مرحبا يا صديقي، كيف حالك اليوم؟");
});

test("the title and the episode line come from the player's top bar", () => {
  const doc = parse(SAMPLE);
  assert.deepEqual(readTitle(doc), { title: "بيت الأحلام", episode: "Season 1, Ep. 3 العودة" });
  assert.deepEqual(episodeParts("Season 1, Ep. 3 العودة"), { season: 1, episode: 3, name: "العودة" });
  assert.deepEqual(episodeParts("S2 E10: The End"), { season: 2, episode: 10, name: "The End" });
  assert.equal(episodeParts("A film"), null);
  assert.deepEqual(readTitle(parse("<div></div>")), { title: "", episode: "" });
});

test("the player counts as open only with its box and a <video> in it; the biggest <video> is the title's", () => {
  assert.equal(lib().playerOpen(parse(SAMPLE)), true);
  assert.equal(lib().playerOpen(parse(SAMPLE.replace(/<video[^>]*><\/video>/, ""))), false, "the player's box without a video: a page of titles");
  assert.equal(lib().playerOpen(parse(`<div class="carousel"><video></video></div>`)), false, "a trailer in a list of titles");
  assert.equal(lib().playerVideo(parse(SAMPLE)).className, "tk-sample-video");
});

test("caption text is made plain: one line, no sound cues, music notes, dashes or speaker names", () => {
  assert.equal(cleanCaption("  مرحبا\n  بك  "), "مرحبا بك");
  assert.equal(cleanCaption("[door slams] (laughs) ♪ la la ♪"), "la la");
  assert.equal(cleanCaption("- Hola. - ¿Qué tal?"), "Hola. ¿Qué tal?");
  assert.equal(cleanCaption("JOHN: Where are you?"), "Where are you?");
  assert.equal(cleanCaption("[MUSIC]"), "");
  assert.equal(cleanCaption(null), "");
  assert.equal(cleanCaption("x".repeat(900)).length, 600);
});

test("the lines watched: each starts when it shows and ends when the next one does; seen again it isn't added twice", () => {
  const seen = watchedLines();
  assert.equal(seen.see("", 1), false);
  assert.equal(seen.see("مرحبا", 2), true);
  assert.equal(seen.see("مرحبا", 2.5), false, "the same line, a moment later");
  assert.equal(seen.see("", 3.2), true, "the line goes");
  assert.equal(seen.see("كيف حالك؟", 4), true);
  assert.equal(seen.see("بخير", 6), true);
  assert.deepEqual(seen.lines.map((l) => [l.text, l.start, l.end]), [["مرحبا", 2, 3.2], ["كيف حالك؟", 4, 6], ["بخير", 6, 6.5]]);
  assert.equal(seen.current, 2);
  // Back to the start (the viewer's own jump in Prime Video's player): the line is the same one.
  seen.see("مرحبا", 2.1);
  assert.equal(seen.lines.length, 3);
  assert.equal(seen.current, 0);
  // Without the player's time (null): the line still counts.
  const noTime = watchedLines();
  assert.equal(noTime.see("Hola", null), true);
  assert.equal(noTime.lines[0].start, 0);
});

test("a watched line becomes words with times, as the panel taps and looks them up", () => {
  const l = lineWithWords({ start: 2, end: 4, text: "كيف حالك اليوم" });
  assert.deepEqual(l.words.map((w) => w[2]), ["كيف", "حالك", "اليوم"]);
  assert.equal(l.words[0][0], 2);
  assert.ok(l.words.at(-1)[1] <= 4.001);
  assert.ok(lineWithWords({ start: 5, end: 5, text: "Hola" }).end > 5, "a line always lasts a moment");
});

test("Prime Video's addresses: the title's id, and which hosts count", () => {
  assert.equal(primeTitleId("https://www.primevideo.com/detail/0HU0AV5V1B0A8LMDYOOBX4FKYJ/ref=atv_hm"), "0HU0AV5V1B0A8LMDYOOBX4FKYJ");
  assert.equal(primeTitleId("https://www.primevideo.com/region/eu/detail/0K1A2B3C4D5E6F7G8H9I0J/"), "0K1A2B3C4D5E6F7G8H9I0J");
  assert.equal(primeTitleId("https://www.amazon.com/gp/video/detail/B0B8TQH8KZ/ref=x?autoplay=1"), "B0B8TQH8KZ");
  assert.equal(primeTitleId("https://www.amazon.co.uk/Some-Film/dp/B0C1D2E3F4"), "B0C1D2E3F4");
  assert.equal(primeTitleId("https://www.primevideo.com/storefront/home"), "");
  assert.equal(primeTitleId("not an address"), "");
  for (const h of ["www.primevideo.com", "primevideo.com", "www.amazon.com", "www.amazon.co.jp", "www.amazon.ae"]) assert.ok(isPrimeHost(h), h);
  for (const h of ["primevideo.com.evil.example", "www.netflix.com", "amazon.evil.example", ""]) assert.ok(!isPrimeHost(h), h);
  assert.equal(cleanPrimeId("B0B8TQH8KZ"), "B0B8TQH8KZ");
  assert.equal(cleanPrimeId("../etc"), "");
});

test("where a saved word came from, for the Vocab page", () => {
  assert.equal(primeSource("بيت الأحلام", "Season 1, Ep. 3 العودة"), "Prime Video · بيت الأحلام · S1:E3 · العودة");
  assert.equal(primeSource("A Film", ""), "Prime Video · A Film");
  assert.equal(primeSource("", ""), "Prime Video");
});

test("a word saved in Prime Video waits in the extension, is cleaned, and goes to the Vocab with its source", () => {
  const w = savedPrimeWord({ primeId: "B0B8TQH8KZ", def: { meaning: "friend", vocalized: "صَدِيقِي", lemma: "صديق" }, word: "صديقي", lang: "ar",
    sentence: "مرحبا يا صديقي", source: "Prime Video · بيت الأحلام · S1:E3 · العودة" }, 1700000000000, "pvw-test-0001");
  assert.equal(w.service, "prime");
  assert.equal(w.prime_id, "B0B8TQH8KZ");
  assert.equal(w.text, "صَدِيقِي", "Arabic keeps the vowelled spelling, as everywhere");
  assert.equal(w.meaning, "friend");
  assert.equal(w.source, "Prime Video · بيت الأحلام · S1:E3 · العودة");
  assert.equal(w.language, "ar");
  assert.equal("netflix_id" in w, false, "no Netflix title");
  assert.equal("start" in w, false, "no times: there is no title in the library to play them from");
  // It waits as one entry, comes back cleaned, and is forgotten once the web app has it.
  const items = { [WORD_KEY + w.uid]: w, [WORD_KEY + "bad"]: { service: "prime", uid: "x" } };
  const pending = pendingFrom(items);
  assert.deepEqual(pending.words.map((x) => x.uid), [w.uid]);
  assert.deepEqual(cleanPending({ words: [w] }).words[0], w);
  assert.deepEqual(keysToForget(items, { words: [w.uid] }), [WORD_KEY + w.uid]);
  // A bad id or source is cleaned, not trusted.
  const odd = cleanWord({ ...w, prime_id: "<script>", source: "" });
  assert.equal(odd.prime_id, "");
  assert.equal(odd.source, "Prime Video");
  assert.equal(cleanWord({ ...w, text: "" }), null);
});

test("Netflix words are as before (the Prime Video change leaves them alone)", () => {
  const w = savedWord({ netflixId: "81234567", word: "بيت", lang: "ar", sentence: "في البيت", start: 1, end: 2, sentStart: 0, sentEnd: 3, title: "T" }, 1700000000000, "nfw-test-0001");
  assert.equal(w.netflix_id, "81234567");
  assert.equal(w.service, undefined);
  assert.equal(w.start, 1);
  assert.equal(cleanWord({ ...w, netflix_id: "" }), null, "a Netflix word still needs its title");
});
