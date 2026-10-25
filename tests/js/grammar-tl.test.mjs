// Tagalog spelling checks for the two Tagalog grammar courses (tools/grammar/en-tl, tools/grammar/tl-en):
// din/rin and daw/raw follow the sound before them, and the spellings match the Tagalog basics course.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { explanationTexts, targetsOf } from "../../web/js/grammardata.js";
import { readSource } from "../../tools/grammar/build.mjs";

const have = (id) => existsSync(new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url));

// English words used in Taglish whose last sound isn't their last letter.
const SOUNDS_LIKE_CONSONANT = new Set(["late", "male-late", "game", "phone", "cute", "online", "time"]);

/** din/rin and daw/raw: r after a vowel sound (or w, y), d after a consonant. After -ra, -ri, -re, -ro, -ru
 * either is accepted (the d is kept there to avoid “ra raw”). Returns the wrong pairs found. */
export function dinRinProblems(text) {
  const bad = [];
  const words = String(text).replace(/\{\{[^}]*\}\}/g, " § ").split(/\s+/).filter(Boolean);
  for (let i = 1; i < words.length; i++) {
    const m = words[i].match(/^([dr])(in|aw)[.,!?…”"')]*$/i);
    if (!m) continue;
    const prev = words[i - 1];
    if (prev === "§" || /[,;:—–(]$/.test(prev)) continue; // a piece of English, or a pause before it
    const word = prev.toLowerCase().replace(/[^a-zñ-]/g, "");
    if (!word) continue;
    if (/(ra|re|ri|ro|ru)$/.test(word)) continue;
    const vowel = /[aeiouwy]$/.test(word) && !SOUNDS_LIKE_CONSONANT.has(word);
    const r = m[1].toLowerCase() === "r";
    if (vowel !== r) bad.push(`${prev} ${words[i]}`);
  }
  return bad;
}

/** The Tagalog a lesson presents as right (en-tl): examples, dialogues, right sentences, answers, and the
 * {{ }} pieces of its explanations. Wrong sentences and wrong options are left out: they are wrong on purpose. */
function rightTagalog(l) {
  const out = [];
  const add = (t) => { if (typeof t === "string" && t.trim()) out.push(t); };
  const pieces = (t) => targetsOf(t).forEach((x) => add(x.split("|")[0]));
  for (const b of l.blocks || []) {
    if (b.goal) add(b.goal.t);
    for (const e of b.ex || []) add(e.t);
    for (const d of b.dialog || []) add(d.t);
    for (const k of ["p", "tip", "means"]) if (b[k]) pieces(b[k]);
    for (const row of b.table || []) row.forEach(pieces);
  }
  for (const m of l.mistakes || []) { add(m.right); pieces(m.why); }
  for (const q of l.practice || []) {
    pieces(q.q); pieces(q.why || "");
    if (q.type === "fill") add(String(q.t).replace("___", (q.options || [])[q.answer] || ""));
    if (q.type === "choice") pieces((q.options || [])[q.answer] || "");
    if (q.type === "order") add((q.words || []).join(" "));
    if (q.type === "say") add(q.answer);
    for (const x of q.lines || []) { add(x.t); if (x.options) { add(x.options[x.answer]); pieces(x.why || ""); } }
    for (const a of q.answers || []) add(a.t);
  }
  return out;
}

// The basics course writes these words this way; the grammar courses follow it.
const SPELLINGS = [[/\bkamusta\b/i, "kumusta"], [/\bpuwede\b/i, "pwede"], [/\bkwento\b/i, "kuwento"]];

test("din/rin and daw/raw follow the sound before them", () => {
  assert.deepEqual(dinRinProblems("Ako rin. Pagod din ako. Masarap daw. Uuwi raw siya. Late daw siya. Maaari din."), []);
  assert.deepEqual(dinRinProblems("Ako din. Pagod rin ako."), ["Ako din.", "Pagod rin"]);
});

for (const id of ["en-tl", "tl-en"]) {
  test(`${id}: Tagalog spelling (din/rin, daw/raw, the basics course's spellings)`, { skip: !have(id) }, () => {
    const course = readSource(id);
    const problems = [];
    for (const l of course.lessons) {
      // en-tl teaches Tagalog (examples, answers, {{ }} pieces); tl-en explains in Tagalog.
      const texts = id === "en-tl" ? rightTagalog(l) : explanationTexts(l).map((t) => t.text);
      for (const t of texts) {
        for (const p of dinRinProblems(t)) problems.push(`${l.id}: “${p}” in “${t.slice(0, 60)}”`);
        const plain = id === "en-tl" ? t : t.replace(/\{\{[^}]*\}\}/g, " ");
        for (const [re, want] of SPELLINGS) if (re.test(plain)) problems.push(`${l.id}: write “${want}” (“${t.slice(0, 60)}”)`);
      }
    }
    assert.deepEqual(problems, []);
  });
}
