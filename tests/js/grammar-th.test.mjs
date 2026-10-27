// The Thai grammar courses' own checks (tools/grammar/en-th, tools/grammar/th-en). en-th: the Thai is Thai
// script, every Thai piece has its Paiboon reading (the choices a learner taps too), each reading agrees with
// the app's reading table (docs/lexicon/th-readings.json.gz) syllable by syllable, and no sentence mixes a
// man's and a woman's words. th-en: the English is American English, explained in Thai.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { explanationTexts, taughtTexts, targetsOf } from "../../web/js/grammardata.js";
import { ThaiReadings } from "../../web/js/lexicon/thai.js";

const load = (id) => {
  const path = new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};
const THAI = /[฀-๿]/;
const LATIN = /[A-Za-z]/;

// ---- Readings: the app's table, and how the course reads what the table doesn't know or the word
// splitter cuts badly (names, everyday spellings, words the splitter joins with their neighbour).
const table = new ThaiReadings(JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/th-readings.json.gz", import.meta.url)))));
const seg = new Intl.Segmenter("th", { granularity: "word" });
const EXTRA = {
  "จอห์น": "jɔɔn", "แอนนา": "ɛɛn-naa", "มาร์ค": "mâak", "เจมส์": "jeem", "ลินดา": "lin-daa", "ซาร่า": "saa-râa",
  "เอ็มม่า": "em-mâa", "ไมค์": "mai", "เดวิด": "dee-wít", "ลิซ่า": "lí-sâa",
  "เท่าไหร่": "tâo-rài", "เมื่อไหร่": "mʉ̂ʉa-rài", "ยังไง": "yang-ngai", "ไม่เป็นไร": "mâi bpen rai", "น้ำแข็ง": "nám-kɛ̌ng",
  "ผลไม้": "pǒn-lá-máai", "สอง": "sɔ̌ɔng", "หมอบอก": "mɔ̌ɔ bɔ̀ɔk", "วันพฤหัส": "wan pá-rʉ́-hàt", "ข้างหลัง": "kâang-lǎng",
};
const EXTRA_RE = new RegExp(`(${Object.keys(EXTRA).sort((a, b) => b.length - a.length).join("|")})`);
function* pieces(text) {
  for (const part of String(text).split(EXTRA_RE)) {
    if (!part) continue;
    if (EXTRA[part]) { yield { segment: part, extra: EXTRA[part] }; continue; }
    const segs = [...seg.segment(part)].map((s) => s.segment);
    for (let i = 0; i < segs.length; i++) {
      let took = 1;
      for (let k = Math.min(4, segs.length - i); k >= 2; k--) {
        const w = segs.slice(i, i + k).join("");
        if (/^[฀-๿]+$/.test(w) && table.exact(w)) { took = k; break; }
      }
      yield { segment: segs.slice(i, i + took).join("") };
      i += took - 1;
    }
  }
}
const sylls = (r) => String(r).normalize("NFC").toLowerCase().replace(/[,.?!…;:"“”()]/g, " ").split(/[\s-]+/).filter(Boolean);
// The same sound written with a long or a short vowel (dâai / dâi, gɔ̂ɔ / gɔ̂) is a variant, not a slip.
const short = (x) => x.normalize("NFD").replace(/([aeiouɛɔəʉ])([̀-ͯ]*)\1/g, "$1$2");
const same = (a, b) => typeof b === "string" && short(a) === short(b);
function alts(word) {
  const raw = Object.prototype.hasOwnProperty.call(table.words, word) ? table.words[word] : "";
  let list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!list.length) { const j = table.reading(word); if (j) list = [j]; }
  return list.map(sylls);
}
/** Where a Thai text's reading disagrees with the table: [{word, table, reading}] (words the table doesn't
 * know are let through). */
function disagreements(t, r) {
  const segs = [];
  for (const s of pieces(t)) {
    if (s.extra) { segs.push({ w: s.segment, a: [sylls(s.extra)] }); continue; }
    if (!THAI.test(s.segment)) continue;
    if (s.segment === "ๆ" && segs.length) { segs.push({ w: "ๆ", a: segs[segs.length - 1].a }); continue; }
    if (s.segment.length > 1 && s.segment.endsWith("ๆ")) { segs.push({ w: s.segment, a: alts(s.segment.slice(0, -1)).map((x) => [...x, ...x]) }); continue; }
    segs.push({ w: s.segment, a: alts(s.segment) });
  }
  const sy = sylls(r);
  const memo = new Map();
  const go = (i, j) => {
    const key = i * 1000 + j;
    if (memo.has(key)) return memo.get(key);
    let best;
    if (i === segs.length) best = { cost: sy.length - j, path: sy.length > j ? [{ word: "(end)", table: "", reading: sy.slice(j).join("-") }] : [] };
    else {
      best = { cost: Infinity, path: [] };
      const s = segs[i];
      const tryIt = (n, cost, item) => {
        if (j + n > sy.length) return;
        const rest = go(i + 1, j + n);
        if (cost + rest.cost < best.cost) best = { cost: cost + rest.cost, path: item ? [item, ...rest.path] : rest.path };
      };
      const exp = s.a.map((x) => x.join("-")).join(" / ");
      if (s.a.length) {
        for (const a of s.a) {
          const got = sy.slice(j, j + a.length);
          const diff = a.reduce((d, x, k) => d + (x === got[k] ? 0 : same(x, got[k]) ? 0.01 : 1), 0);
          tryIt(a.length, diff, diff >= 1 ? { word: s.w, table: exp, reading: got.join("-") } : null);
        }
        for (let n = 1; n <= 6; n++) tryIt(n, s.a[0].length + 1, { word: s.w, table: exp, reading: sy.slice(j, j + n).join("-") });
      } else {
        for (let n = 1; n <= 8; n++) tryIt(n, 0.1, null);
      }
    }
    memo.set(key, best);
    return best;
  };
  return go(0, 0).path.filter((x) => !x.table.split(" / ").some((e) => same(e.replace(/-/g, ""), x.reading.replace(/-/g, ""))));
}

/** Every Thai text of a lesson that has a reading: [{where, t, r}]. */
function readPairs(l) {
  const out = [];
  const add = (where, t, r) => { if (typeof t === "string" && THAI.test(t)) out.push({ where, t, r: r || "" }); };
  const scan = (v, where) => {
    if (typeof v === "string") { for (const m of v.matchAll(/\{\{([^{}|]*)(?:\|([^{}]*))?\}\}/g)) if (THAI.test(m[1])) add(`${where} {{ }}`, m[1], m[2]); return; }
    if (Array.isArray(v)) return v.forEach((x, k) => scan(x, `${where}[${k}]`));
    if (v && typeof v === "object") {
      if (typeof v.t === "string" && "r" in v && v.type !== "fill") add(where, v.t, v.r);
      if (v.type === "say") add(where, v.answer, v.r);
      if (v.type === "fill" && v.rs) add(where, v.t.replace("___", v.options[v.answer]), v.r.replace("___", v.rs[v.answer]));
      if (v.type === "fill" && v.rs) v.options.forEach((o, k) => add(`${where} option ${k + 1}`, o, v.rs[k]));
      if (v.type === "order" && v.rs) v.words.forEach((w, k) => add(`${where} word ${k + 1}`, w, v.rs[k]));
      if (Array.isArray(v.options) && Array.isArray(v.rs) && !v.type) v.options.forEach((o, k) => add(`${where} reply ${k + 1}`, o, v.rs[k]));
      for (const [k, x] of Object.entries(v)) if (!(k === "t" && "r" in v)) scan(x, `${where}.${k}`);
    }
  };
  scan(l, l.id);
  return out;
}

const en = load("en-th");
if (en) {
  test("en-th: the Thai is Thai script, with no . ? ! (Thai doesn't use them)", () => {
    const bad = [];
    for (const l of en.lessons) for (const t of taughtTexts(l)) {
      if (LATIN.test(t)) bad.push(`${l.id}: Latin letters in “${t}”`);
      if (/[.?!]/.test(t.replace(/\.\.\.|…/g, ""))) bad.push(`${l.id}: punctuation in “${t}”`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-th: every Thai piece in an explanation has its reading, in Paiboon letters", () => {
    const bad = [];
    const tones = String.fromCharCode(0x300, 0x301, 0x302, 0x30c);
    const PAIBOON = new RegExp(`^[a-zɛɔəʉ${tones} .,?!;:'’“”"()…_/0-9-]*$`);
    const ok = (r) => PAIBOON.test(String(r).normalize("NFD"));
    for (const l of en.lessons) {
      for (const { text } of explanationTexts(l)) {
        if (THAI.test(text.replace(/\{\{[^}]*\}\}/g, ""))) bad.push(`${l.id}: Thai outside {{ }} in “${text.slice(0, 60)}”`);
        for (const piece of targetsOf(text)) {
          const [t, r] = piece.split("|");
          if (THAI.test(t) && !(r || "").trim()) bad.push(`${l.id}: {{${t}}} has no reading`);
        }
      }
      for (const p of readPairs(l)) {
        if (!p.r.trim()) bad.push(`${p.where}: “${p.t}” has no reading`);
        else if (!ok(p.r)) bad.push(`${p.where}: odd letters in the reading “${p.r}”`);
      }
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-th: every choice the learner taps has its reading (a beginner can't read Thai script yet)", () => {
    const bad = [];
    for (const l of en.lessons) l.practice.forEach((q, i) => {
      const at = `${l.id}, practice ${i + 1}`;
      if (q.type === "fill" && (!q.r || (q.rs || []).length !== q.options.length)) bad.push(`${at}: a fill question needs r and rs`);
      if (q.type === "order" && (q.rs || []).length !== q.words.length) bad.push(`${at}: an order question needs rs`);
      for (const x of q.lines || []) if (x.options && (x.rs || []).length !== x.options.length) bad.push(`${at}: a reply needs rs`);
    });
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-th: every reading agrees with the app's reading table, syllable by syllable", () => {
    const bad = [];
    for (const l of en.lessons) for (const p of readPairs(l)) if (p.r) {
      const d = disagreements(p.t, p.r);
      if (d.length) bad.push(`${p.where}: “${p.t}” read “${p.r}”: ${d.map((x) => `${x.word} is ${x.table || "nothing"} in the table, ${x.reading} here`).join("; ")}`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("en-th: no sentence mixes a man's words (ผม, ครับ) with a woman's (ค่ะ, คะ, ดิฉัน)", () => {
    const bad = [];
    for (const l of en.lessons) for (const p of readPairs(l)) {
      const w = [...seg.segment(p.t)].map((s) => s.segment);
      if ((w.includes("ผม") || w.includes("ครับ")) && (w.includes("ค่ะ") || w.includes("คะ") || w.includes("ดิฉัน"))) bad.push(`${p.where}: “${p.t}”`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}

const th = load("th-en");
if (th) {
  const BRITISH = /\b(colour|favour|centre|theatre|realis|organis|apologis|travell|cancell|mum|mummy|holiday|lorry|biscuit|petrol|motorway|pavement|rubbish|trousers|maths|programme|neighbour|behaviour|labour|grey|cheque|queue|whilst|learnt)/i;
  test("th-en: the English is American English, with no Thai in it", () => {
    const bad = [];
    for (const l of th.lessons) for (const t of taughtTexts(l)) {
      if (THAI.test(t)) bad.push(`${l.id}: Thai in the English “${t}”`);
      if (BRITISH.test(t)) bad.push(`${l.id}: a British spelling or word in “${t}”`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });

  test("th-en: the explanations are written in Thai, with the English inside {{ }}", () => {
    const bad = [];
    for (const l of th.lessons) {
      for (const k of ["title", "summary"]) if (!THAI.test(l[k])) bad.push(`${l.id}: its ${k} isn't in Thai`);
      for (const b of l.blocks) if (b.p !== undefined && !THAI.test(b.p.replace(/\{\{[^}]*\}\}/g, ""))) bad.push(`${l.id}: a paragraph with no Thai: “${b.p.slice(0, 50)}”`);
      for (const { text } of explanationTexts(l)) for (const p of targetsOf(text)) if (THAI.test(p)) bad.push(`${l.id}: Thai inside {{${p}}}`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
  });
}
