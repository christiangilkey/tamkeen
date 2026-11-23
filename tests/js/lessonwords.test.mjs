// My files: a lesson's own words tappable on its page (prototype lesson_words; the owner, 2026-11-23: "The read with
// word help shouldn't take you to a new screen, and right now it only encompasses the first passage of my document,
// it should work on all the words in the whole document").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lessonTokens, wordsHtml } from "../../web/js/lessonwordlist.js";
import { PROTOTYPES, feature } from "../../web/js/prototype.js";

const read = (p) => readFileSync(new URL(`../../web/js/${p}`, import.meta.url), "utf8");

test("the words of every text on the page, in order, each knowing which text it is in", () => {
  const tok = lessonTokens(["Passage 1", "The man went home.", "", "1. Where did he go?", "  home  ", "Passage 2", "A later word"], "en");
  assert.deepEqual(tok.text, ["Passage", "1", "The", "man", "went", "home.", "1.", "Where", "did", "he", "go?", "home", "Passage", "2", "A", "later", "word"]);
  assert.deepEqual(tok.seg, [0, 0, 1, 1, 1, 1, 3, 3, 3, 3, 3, 4, 5, 5, 6, 6, 6], "an empty text has no words; the rest keep their place");
});

test("each text's words become spans numbered across the whole lesson, the text escaped", () => {
  const tok = lessonTokens(["one two", "<three> & four"], "en");
  const a = wordsHtml(tok, 0, 0, "en");
  const b = wordsHtml(tok, 1, a.next, "en");
  assert.equal(a.html, '<span class="w" data-i="0">one</span> <span class="w" data-i="1">two</span>');
  assert.equal(a.next, 2);
  assert.equal(b.html, '<span class="w" data-i="2">&lt;three&gt;</span> <span class="w" data-i="3">&amp;</span> <span class="w" data-i="4">four</span>');
  assert.equal(b.next, 5);
  assert.equal(wordsHtml(tok, 1, 2, "en", (w) => `[${w}]`).html.includes("[four]"), true, "a language's own way of drawing a word");
});

test("Chinese and Japanese text with no spaces is split into its words", () => {
  const tok = lessonTokens(["我喜欢学习中文。", "第二段"], "zh");
  assert.ok(tok.text.length > 2, "more than one word per line");
  assert.equal(tok.text.join(""), "我喜欢学习中文。第二段");
  assert.equal(tok.seg[tok.seg.length - 1], 1);
});

test("Arabic text keeps its words and their order", () => {
  const tok = lessonTokens(["ذهب الرجل إلى البيت", "س١: أين ذهب؟"], "ar");
  assert.deepEqual(tok.text, ["ذهب", "الرجل", "إلى", "البيت", "س١:", "أين", "ذهب؟"]);
});

test("behind its own prototype: off for everyone until the owner releases it", () => {
  assert.ok(PROTOTYPES.lesson_words, "a PROTOTYPES row");
  assert.equal(PROTOTYPES.lesson_words.released, false);
  assert.equal(feature("lesson_words"), false, "(no prototype mode in the tests)");
});

test("the lesson page draws every passage block, question and option as words, and keeps the old reader link without the prototype", () => {
  const src = read("components/lessonview.js");
  assert.match(src, /slots\.push\(\{ el: p, text: it\.block\.text \}\)/, "passage paragraphs, headings and list items");
  assert.match(src, /slots\.push\(\{ el: prompt, text: q\.prompt \}\)/, "question text");
  assert.match(src, /slots\.push\(\{ el: opt\.querySelector\("\.lsn-ot"\), text: o\.text \}\)/, "options");
  assert.match(src, /if \(words\) words\.paint\(slots\)/, "drawn every time the body is");
  assert.match(src, /feature\("lesson_words"\)/);
  assert.match(src, /Read with word help/, "the old link, while the prototype is off");
  assert.match(src, /if \(words\) words\.close\(\)/, "let go when the page closes");
  // the Tap words switch is on the page itself
  assert.match(src, /const sw = tapSwitch\(\)/);
});

test("words saved from a lesson keep where they came from, and the page's own buttons keep working with Tap words off", () => {
  const src = read("components/lessonwords.js");
  assert.match(src, /episode_id: id/, "the passage's episode: the lesson's file");
  assert.match(src, /source: opts\.title\(\)/, "and the lesson's name");
  assert.match(src, /seenWords\(\{ tokens: texts, lang: lang\(\), els \}\)/, "new words in purple, the first piece first");
  assert.doesNotMatch(src, /plainWhenOff\(/, "plainWhenOff would stop every tap in the lesson, a sound's Play button too");
  assert.match(src, /PLAIN_CLASS/);
  // a word in an option opens its popup instead of choosing the option
  assert.match(src, /if \(wEl\.closest\("label"\)\) e\.preventDefault\(\)/);
});

test("the phone build carries both new files", () => {
  const build = readFileSync(new URL("../../mobile/scripts/build-www.mjs", import.meta.url), "utf8");
  assert.match(build, /"js\/components\/lessonwords\.js"/);
  assert.match(build, /"js\/lessonwordlist\.js"/);
});
