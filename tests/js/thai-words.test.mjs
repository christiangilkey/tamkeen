// Run with: node --test tests/js/
// Thai words in transcripts (web/js/languages.js): the device's word breaker, with spoken particles it
// cuts in the wrong place mended, and ำ that Whisper writes as two characters made one letter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { joinThai, regroupWords, thaiLetters } from "../../web/js/languages.js";

const seg = new Intl.Segmenter("th", { granularity: "word" });
const words = (text) => joinThai(seg.segment(text)).map((s) => s.segment);

test("spoken particles the word breaker cuts wrongly are mended", () => {
  assert.deepEqual(words("ชนเนี่ยมันก็ดี"), ["ชน", "เนี่ย", "มัน", "ก็", "ดี"]); // not เนี่ | ยมัน
  assert.deepEqual(words("ข้อเนี่ยก็คือ"), ["ข้อ", "เนี่ย", "ก็", "คือ"]);
  assert.deepEqual(words("บอกงี้ก่อน"), ["บอก", "งี้", "ก่อน"]); // not บอ | กงี้
  assert.deepEqual(words("อย่างงี้แหละ"), ["อย่าง", "งี้", "แหละ"]);
  // and nothing else is touched
  assert.deepEqual(words("อะไรนะ"), ["อะไร", "นะ"]);
  assert.deepEqual(words("ประเทศไทยมีประชากรประมาณเจ็ดสิบล้านคน").join(""), "ประเทศไทยมีประชากรประมาณเจ็ดสิบล้านคน");
  // the pieces still cover the text, where they were
  const text = "ชนเนี่ยมันก็ดี";
  for (const p of joinThai(seg.segment(text))) assert.equal(text.slice(p.index, p.index + p.segment.length), p.segment);
});

test("ำ written as two characters becomes the one letter", () => {
  assert.equal(thaiLetters("ตํารวจ"), "ตำรวจ");
  assert.equal(thaiLetters("ตำรวจ"), "ตำรวจ");
  // an older transcript (or the phone's) as Whisper wrote it: still read as the real word, timed as before
  const W = { text: ["ตํารวจ", "มา"], start: [0, 1], end: [1, 1.5], seg: [0, 0] };
  const out = regroupWords(W, "th");
  assert.deepEqual(out.text, ["ตำรวจ", "มา"]);
  assert.deepEqual([out.start[0], out.end.at(-1)], [0, 1.5]);
});
