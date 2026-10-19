// Run with: node --test tests/js/
// Thai readings: how each Thai word is said, in Latin letters with tone marks (Paiboon), drawn over
// Thai text (web/js/lexicon/readings.js). Reads the real table in docs/lexicon/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ThaiReadings } from "../../web/js/lexicon/thai.js";
import { regroupWords } from "../../web/js/languages.js";
import common from "../../web/js/wordlists/th.js";

const data = JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/th-readings.json.gz", import.meta.url))));
const th = new ThaiReadings(data);

// A transcript line cut into words the way the players cut it (one Thai "word" in, the device's
// word breaker's words out), each with its reading.
function line(text) {
  const out = regroupWords({ text: [text], start: [0], end: [1], seg: [0] }, "th");
  return out.text.map((w) => [w, th.reading(w)]);
}

test("the table is the published one: Thai words with Paiboon readings", () => {
  assert.equal(data.kind, "th");
  assert.ok(Object.keys(data.words).length > 15000);
  assert.throws(() => new ThaiReadings({ format: 2, kind: "th" }), /different version/);
  for (const [word, reading] of [["เดี๋ยว", "dǐao"], ["สวัสดี", "sà-wàt-dii"], ["ภาษา", "paa-sǎa"], ["กิน", "gin"], ["ประเทศ", "bprà-têet"]]) {
    assert.equal(th.reading(word), reading, word);
  }
  // A word said two ways keeps both; the first (Wiktionary's) is the one shown.
  const two = Object.entries(data.words).find(([, r]) => Array.isArray(r));
  assert.equal(th.reading(two[0]), two[1][0]);
});

test("sentences: every word gets its reading", () => {
  assert.deepEqual(line("สวัสดีครับ"), [["สวัสดี", "sà-wàt-dii"], ["ครับ", "kráp"]]);
  assert.deepEqual(line("ฉันอยากกินข้าวผัด"), [["ฉัน", "chǎn"], ["อยาก", "yàak"], ["กิน", "gin"], ["ข้าว", "kâao"], ["ผัด", "pàt"]]);
  const census = line("ประเทศไทยมีประชากรประมาณเจ็ดสิบล้านคน");
  assert.equal(census.map(([w]) => w).join(""), "ประเทศไทยมีประชากรประมาณเจ็ดสิบล้านคน", "the words cover the line");
  assert.ok(census.every(([, r]) => r), JSON.stringify(census));
});

test("a word the table lacks is read from the words that spell it, when that is safe", () => {
  // Thai compounds of everyday words: the parts' readings, joined.
  assert.equal(th.exact("อย่างไรก็ตาม"), "");
  assert.equal(th.reading("อย่างไรก็ตาม"), "yàang-rai-gɔ̀-dtaam");
  assert.equal(th.reading("หรือไม่"), "rʉ̌ʉ-mâi");
  assert.deepEqual(th.pieces("นอกจากนี้"), ["นอกจาก", "นี้"]);
  // Not from rare two-letter "words" (กรอก isn't กร + อก) ...
  const rare = new ThaiReadings({ format: 1, kind: "th", words: { กร: "gɔɔn", อก: "òk" }, short: [] });
  assert.equal(rare.reading("กรอก"), "");
  // ... and not after a Pali or Sanskrit word, whose compounds add a syllable (กรรมการ: gam-má-gaan).
  const indic = new ThaiReadings({ format: 1, kind: "th", words: { กรรม: "gam", การ: "gaan" }, nojoin: ["กรรม"] });
  assert.equal(indic.reading("กรรมการ"), "");
  // The real table marks them from Wiktionary: ประวัติ + ศาสตร์ is bprà-wàt-dtì-sàat, so ประวัติ starts no join.
  assert.ok(data.nojoin.includes("ประวัติ"));
  assert.equal(th.reading("ประวัติดี"), "");
  // A piece can't start with a vowel or tone mark, or end before one.
  const marks = new ThaiReadings({ format: 1, kind: "th", words: { "กา": "gaa", "่ม": "x", "ก่": "y", "ม": "m" }, short: ["กา", "่ม", "ก่"] });
  assert.equal(marks.reading("ก่ม"), "");
});

test("no reading rather than a made-up one", () => {
  for (const w of ["", "abc", "123", "กขฃคฅฆง", "กิน "]) assert.equal(th.reading(w), "", JSON.stringify(w));
  assert.equal(th.reading("ญญญญญญ"), "");
});

test("nearly all of the 1000 commonest Thai words have a reading", () => {
  const exact = common.filter((w) => th.exact(w)).length;
  const any = common.filter((w) => th.reading(w)).length;
  assert.ok(exact >= 950, `${exact} in the table`);
  assert.ok(any >= 990, `${any} with a reading`);
});
