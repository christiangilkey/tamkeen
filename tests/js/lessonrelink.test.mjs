// Lessons made before v0.64.0 read a file's links to sound files have no sound spots: adding the file again finds them
// (lessons.js respot). And the question finder on a long file of passages (the owner: "Everything works until question
// 45 where the formatting into questions goes away").
import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuestions, MAX_QUESTIONS } from "../../web/js/lessonparse.js";
import { cleanLesson, respot, splitItems } from "../../web/js/lessons.js";

const link = (name) => ({ text: "", audioLink: { name, path: `/C/Users/t/Audio Files/${name}` } });

/** A U9-like handout: "Passage N" headings, each with its sound link, a paragraph and a question. */
function handout(n, withLinks = true) {
  const lines = [];
  for (let p = 1; p <= n; p++) {
    lines.push({ text: `Passage ${p}`, para: true, heading: 2 });
    if (withLinks) lines.push(link(`${p}.mp3`));
    lines.push({ text: `What the speaker in passage ${p} says about the market.`, para: true });
    lines.push({ text: `${p}. Where is the speaker ${p}?`, para: true }, { text: "a) home" }, { text: "b) work" });
  }
  return lines;
}

test("a lesson made before links were read gets its spots from the file added again, in the same places", () => {
  const old = splitItems(findQuestions(handout(5, false)).items);
  assert.equal(old.spots.length, 0, "made without links");
  const rec = cleanLesson({ id: "lesson1", title: "U9", updated: 1, questions: old.questions, tracks: [] });
  assert.equal(rec.linked, undefined, "not yet read for links: the page offers to read the file again");
  const again = splitItems(findQuestions(handout(5)).items);
  const spots = respot(rec, old.blocks, again);
  assert.equal(spots.length, 5);
  // each under its "Passage N" heading, as a fresh import puts them
  assert.deepEqual(spots.map((sp) => [sp.name, sp.at, sp.qid]), again.spots.map((sp) => [sp.name, sp.at, sp.qid]));
  assert.ok(spots.every((sp) => !sp.track), "no sound yet: shown as not added yet");
  const after = cleanLesson({ ...rec, spots, linked: 1 });
  assert.equal(after.linked, 1);
  assert.equal(after.spots.length, 5);
});

test("an edited lesson: a question's spot follows the question by its wording, a passage spot its paragraph", () => {
  const lines = [{ text: "Intro text for the unit.", para: true }, link("1.mp3"), { text: "1. Where is he?", para: true }, { text: "a) home" }, { text: "b) work" },
    { text: "The second paragraph.", para: true }, link("2.mp3"), { text: "The third paragraph.", para: true }];
  const found = splitItems(findQuestions(lines).items);
  // the teacher added a paragraph at the top and a question before the first, since the import
  const blocks = [{ kind: "p", text: "A note from the teacher." }, ...found.blocks];
  const questions = [{ id: "q9", kind: "text", prompt: "A new first question?", options: [], lines: 1, at: 1 },
    { ...found.questions[0], id: "q1", at: 2 }];
  const rec = cleanLesson({ id: "lesson2", title: "x", updated: 1, questions, tracks: [] });
  const spots = respot(rec, blocks, found);
  const s1 = spots.find((sp) => sp.name === "1.mp3");
  const s2 = spots.find((sp) => sp.name === "2.mp3");
  assert.equal(s1.qid, "q1", "beside its question, found by its wording");
  assert.equal(s2.qid, "");
  assert.equal(blocks[s2.at].text, "The third paragraph.", "before the paragraph it was before");
});

test("audio already in an old lesson fills the spots it is named for", () => {
  const old = splitItems(findQuestions(handout(3, false)).items);
  const rec = cleanLesson({ id: "lesson3", title: "x", updated: 1, questions: old.questions,
    tracks: [{ uid: "u2", title: "2", kind: "file" }, { uid: "u9", title: "intro", kind: "file" }, { uid: "yt", title: "1", kind: "youtube" }] });
  const spots = respot(rec, old.blocks, splitItems(findQuestions(handout(3)).items));
  assert.deepEqual(spots.map((sp) => sp.track), ["", "u2", ""], "2.mp3 ← the track called 2; a YouTube video isn't a file");
});

test("new lessons count as read for links (no button), with or without spots", () => {
  assert.equal(cleanLesson({ id: "lesson4", title: "x", updated: 1, linked: 1 }).linked, 1);
  assert.equal(cleanLesson({ id: "lesson5", title: "x", updated: 1, spots: [{ name: "1.mp3" }] }).linked, 1);
  assert.equal(cleanLesson({ id: "lesson6", title: "x", updated: 1 }).linked, undefined);
});

test("a long file of passages: questions go on past 45, whatever their print size", () => {
  const lines = [];
  for (let n = 1; n <= 100; n++) {
    lines.push({ text: `Passage ${n}`, para: true, heading: 2 }, { text: `The text of passage ${n}, a few words long.`, para: true });
    // (from question 46 on, the questions are in bigger print than the passage: a heading to the page reader)
    lines.push({ text: `${n}. What is passage ${n} about?`, para: true, ...(n > 45 ? { heading: 3 } : {}) }, { text: "a) one" }, { text: "b) two" });
  }
  const { items } = findQuestions(lines);
  const qs = items.filter((it) => it.type === "q");
  assert.equal(qs.length, 100);
  assert.ok(qs.every((it) => it.q.kind === "choice" && it.q.options.length === 2));
  assert.equal(qs[99].q.number, 100);
});

test("an \"Answers\" line part-way through doesn't make the rest of the file the key", () => {
  const lines = [{ text: "1. Where?", para: true }, { text: "a) here" }, { text: "b) there" },
    { text: "Answers", para: true }, { text: "1. b" },
    { text: "2. Why?", para: true }, { text: "a) because" }, { text: "b) no" },
    { text: "Answer key", para: true }, { text: "2. a" }];
  const { items, key } = findQuestions(lines);
  const qs = items.filter((it) => it.type === "q").map((it) => it.q);
  assert.equal(qs.length, 2);
  assert.deepEqual(key, { q1: "b", q2: "a" });
});

test("more questions than a lesson keeps: the rest are counted, for the screen to say so", () => {
  const lines = [];
  for (let n = 1; n <= MAX_QUESTIONS + 30; n++) lines.push({ text: `${n}. Question ${n}?`, para: true }, { text: "a) x" }, { text: "b) y" });
  const r = findQuestions(lines);
  assert.equal(r.items.filter((it) => it.type === "q").length, MAX_QUESTIONS);
  assert.equal(r.cut, 30);
  assert.equal(findQuestions([{ text: "1. One?" }, { text: "a) x" }, { text: "b) y" }]).cut, 0);
});

// The owner's "100 Passages_ Questions.docx": texts 1–32 number their two questions; from text 33 a text with one
// question doesn't number it ("Two men were executed for:"), its options a.–d. in Word's own numbering.
const word = (text, label = "") => ({ text, para: true, ...(label ? { list: { level: 0, label, fmt: /\d/.test(label) ? "decimal" : "lowerLetter" } } : {}) });
const opts = (...texts) => texts.map((t, k) => word(t, `${"abcd"[k]}.`));

test("a question with no number that ends with a colon, its options a. b. c. d. after it, is a question", () => {
  const lines = [word("Text# 32:"), word("Al-ittihad: 2/25/2000"), word("The ministry:", "1."), ...opts("Met students.", "Honored Mr. Dubi.", "Organized a party.", "Launched a campaign."),
    word("TEXT#33:"), word("Al-Sharq Al awast: 6/20/2001"), word("Two men were executed for:"), ...opts("Smuggling drugs.", "Taking hashish.", "Refusing to pray.", "Selling heroin.")];
  const qs = findQuestions(lines).items.filter((it) => it.type === "q").map((it) => it.q);
  assert.deepEqual(qs.map((q) => [q.prompt, q.kind, q.options.length]), [["The ministry:", "choice", 4], ["Two men were executed for:", "choice", 4]]);
  // the paper's name and date ("…: 6/20/2001") and "TEXT#33:" stay passage text
  assert.ok(findQuestions(lines).items.some((it) => it.type === "block" && it.text === "Al-Sharq Al awast: 6/20/2001"));
});

test("options with no question line before them (left out of the file) still make a question, its wording blank", () => {
  const lines = [word("TEXT# 49:"), word("This text is about:"), ...opts("One.", "Two.", "Three.", "Four."),
    word("TEXT# 50:"), word("Al-Sharq Alawsat: 8/10/2001"), ...opts("Proved that few hours…", "Revealed a relationship.", "Confirmed experts.", "Did not contradict.")];
  const qs = findQuestions(lines).items.filter((it) => it.type === "q").map((it) => it.q);
  assert.equal(qs.length, 2);
  assert.equal(qs[1].prompt, "", "for the teacher to fill in with Edit questions");
  assert.deepEqual(qs[1].options.map((o) => o.label), ["a", "b", "c", "d"]);
});

test("an option's last words in a paragraph of their own join the option", () => {
  const lines = [word("The Australian woman:"), ...opts("Said the film is better.", "Set the record.", "Was a survivor.", "Bought all the tickets to give to friends and family"),
    word("members."), word("TEXT# 87:")];
  const { items } = findQuestions(lines);
  const q = items.find((it) => it.type === "q").q;
  assert.equal(q.options[3].text, "Bought all the tickets to give to friends and family members.");
  assert.deepEqual(items.filter((it) => it.type === "block").map((it) => it.text), ["TEXT# 87:"]);
});

test("a passage line ending in a colon before a bulleted (not lettered) list stays passage text", () => {
  const lines = [word("The reasons were:"), { text: "money", para: true, list: { level: 0, label: "•", fmt: "bullet" } }, { text: "time", para: true, list: { level: 0, label: "•", fmt: "bullet" } }];
  assert.equal(findQuestions(lines).items.filter((it) => it.type === "q").length, 0);
});
