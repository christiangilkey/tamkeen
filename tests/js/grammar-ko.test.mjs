// The Korean grammar courses (tools/grammar/en-ko, tools/grammar/ko-en): the right script in the right
// place. en-ko: everything in Korean is in Hangul, every reading is in Latin letters, and every piece of
// Korean in an explanation has its reading. ko-en: the explanations are written in Korean, the English
// taught has no Hangul in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, taughtTexts, targetsOf } from "../../web/js/grammardata.js";

const HANGUL = /[가-힣ㄱ-ㆎ]/; // syllables and single letters
const SYLLABLE = /[가-힣]/;
const read = (id) => {
  const path = `tools/grammar/${id}/lessons.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

/** Every reading of a lesson: the `r` of its sentences, and of its `say` answers. */
function readings(l) {
  const out = [];
  const sent = (x) => x && x.r !== undefined && out.push(x.r);
  for (const b of l.blocks || []) {
    if (b.goal) sent(b.goal);
    (b.ex || []).forEach(sent);
    (b.dialog || []).forEach(sent);
  }
  for (const q of l.practice || []) {
    (q.lines || []).forEach(sent);
    (q.answers || []).forEach(sent);
    if (q.type === "say") sent(q);
  }
  return out;
}

const enko = read("en-ko");
test("en-ko: the Korean is in Hangul, the readings in Latin letters", { skip: !enko }, () => {
  for (const l of enko.lessons) {
    for (const t of taughtTexts(l)) assert.match(t, HANGUL, `${l.id}: Korean without Hangul: “${t}”`);
    for (const r of readings(l)) {
      assert.doesNotMatch(r, HANGUL, `${l.id}: a reading with Hangul in it: “${r}”`);
      assert.match(r, /^[a-z0-9 .,!?'’“”…\-()/~:;]+$/i, `${l.id}: a reading with unexpected characters: “${r}”`);
    }
  }
});

test("en-ko: every piece of Korean in an explanation has its reading", { skip: !enko }, () => {
  for (const l of enko.lessons) {
    for (const { text } of explanationTexts(l)) {
      for (const p of targetsOf(text)) {
        const [t, r = ""] = p.split("|");
        if (SYLLABLE.test(t)) assert.ok(r.trim(), `${l.id}: {{${t}}} has no reading`);
        assert.doesNotMatch(r, HANGUL, `${l.id}: {{${p}}}: the reading has Hangul in it`);
      }
    }
  }
});

const koen = read("ko-en");
test("ko-en: the explanations are written in Korean, the English taught has no Hangul", { skip: !koen }, () => {
  assert.match(koen.title, HANGUL);
  assert.match(koen.about, HANGUL);
  for (const u of koen.units) assert.match(u.title, HANGUL, `unit ${u.n}`);
  for (const l of koen.lessons) {
    for (const k of ["title", "summary"]) assert.match(l[k], HANGUL, `${l.id}: its ${k} isn't in Korean`);
    for (const b of l.blocks) if (b.p) assert.match(b.p, HANGUL, `${l.id}: a paragraph that isn't in Korean: “${b.p.slice(0, 40)}”`);
    for (const t of taughtTexts(l)) assert.doesNotMatch(t, HANGUL, `${l.id}: Hangul in the English taught: “${t}”`);
  }
});
