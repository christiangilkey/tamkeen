// Lesson bundles: finding questions, the lesson record and its merge between devices, the packed lesson a class gets,
// reading Word numbering and tick boxes, sound inside PDFs and Word files, the transcript editor's timing, the AI
// answer, and the database file (supabase/v12-dli-lessons.sql) agreeing with the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { answerFor, findQuestions, inlineOptions, keyEntries, labelKey, linesOfText } from "../../web/js/lessonparse.js";
import { bodyOf, cleanLesson, cleanState, cleanWords, dropLesson, fromClass, liveLessons, mark, mergeStates, packLesson, putLesson,
  sentenceAround, splitItems, tally, trackFileName, unpackLesson } from "../../web/js/lessons.js";
import { audioInPdf, docxLines, docxNumbering, findSound, soundKind } from "../../web/js/lessonfiles.js";
import { changedLines, joinLines, linesOf, retime, splitLine, toSegments } from "../../web/js/transcriptedit.js";
import { readLessonAnswer, lessonPrompt } from "../../web/js/lessonai.js";
import { lessonOcrPair, tidyOcr } from "../../web/js/lessonocr.js";

const qsOf = (r) => r.items.filter((x) => x.type === "q").map((x) => x.q);

const WORKSHEET = `Unit 3: At the market

Ahmed goes to the market every Friday. He buys bread and
vegetables for his family.

1. Where does Ahmed go every Friday?
a) To school
b) To the market
c) To the mosque
2. What does he buy? (Choose all that apply)
☐ Bread
☒ Vegetables
☐ Meat
3. Ahmed goes to the market on Mondays. True or False?
4. Describe your own weekly shopping.
______________________
______________________
5. The capital of Egypt is ________.
Answer: Cairo
6. ما اسم الرجل؟ أ) أحمد ب) محمد ج) علي

Answer key
1. b   3. False  6. أ`;

test("a worksheet's passage and questions are told apart", () => {
  const r = findQuestions(linesOfText(WORKSHEET));
  const blocks = r.items.filter((x) => x.type === "block");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].text, "Ahmed goes to the market every Friday. He buys bread and vegetables for his family.");
  const qs = qsOf(r);
  assert.deepEqual(qs.map((q) => q.kind), ["choice", "multi", "tf", "text", "text", "choice"]);
  assert.deepEqual(qs[0].options.map((o) => o.text), ["To school", "To the market", "To the mosque"]);
  assert.deepEqual(qs[2].options.map((o) => o.text), ["True", "False"]);
  assert.equal(qs[3].lines, 2, "two writing lines");
  assert.equal(qs[4].lines, 1, "a gap in the sentence");
  assert.equal(qs[5].prompt, "ما اسم الرجل؟");
  assert.deepEqual(qs[5].options.map((o) => o.label), ["أ", "ب", "ج"]);
  // the key: the answer-key section, a ticked box, an "Answer:" line
  assert.deepEqual(r.key, { q1: "b", q2: ["b"], q3: "b", q5: "Cairo", q6: "a" });
});

test("question numbers in other languages and shapes", () => {
  const r = findQuestions(linesOfText(`السؤال ١: أين يسكن أحمد؟
أ- في القاهرة
ب- في دمشق
(2) Вопрос?
а) да
б) нет
第3题：你好吗？
A. 很好
B. 不好
Q4. Write a sentence.`));
  const qs = qsOf(r);
  assert.equal(qs.length, 4);
  assert.deepEqual(qs.map((q) => q.number), [1, 2, 3, 4]);
  assert.deepEqual(qs.map((q) => q.kind), ["choice", "choice", "choice", "text"]);
  assert.equal(qs[0].options[1].text, "في دمشق");
});

test("passage text that only looks like a list stays passage text", () => {
  const r = findQuestions(linesOfText("A. Reading\n\nIn 1990. the city grew.\nIt is big."));
  assert.equal(qsOf(r).length, 0);
  assert.equal(r.items.length, 2);
});

test("a question without a number but with choices after it", () => {
  const qs = qsOf(findQuestions(linesOfText("Which one is a fruit?\na) apple\nb) chair")));
  assert.equal(qs.length, 1);
  assert.equal(qs[0].kind, "choice");
});

test("Word's own numbering makes the questions and options", () => {
  const lines = [
    { text: "Read the text.", para: true },
    { text: "Where is he?", para: true, list: { level: 0, label: "1." } },
    { text: "Home", para: true, list: { level: 1, label: "a." } },
    { text: "School", para: true, list: { level: 1, label: "b." }, box: "checked" },
    { text: "Why?", para: true, list: { level: 0, label: "2." } },
  ];
  const r = findQuestions(lines);
  const qs = qsOf(r);
  assert.deepEqual(qs.map((q) => q.kind), ["choice", "text"]);
  assert.deepEqual(r.key, { q1: "b" });
});

test("small helpers: labels, inline choices, key entries, answers", () => {
  assert.equal(labelKey("ب)"), "b");
  assert.equal(labelKey("(C)"), "c");
  assert.equal(labelKey("г"), "d");
  assert.deepEqual(inlineOptions("Pick: a) one b) two c) three").options.map((o) => o.text), ["one", "two", "three"]);
  assert.equal(inlineOptions("a) only one"), null);
  assert.deepEqual(keyEntries("1. b 2-c ٣. أ").map((e) => [e.number, e.answer]), [[1, "b"], [2, "c"], [3, "أ"]]);
  const q = { id: "q1", kind: "multi", options: [{ id: "a", label: "a", text: "x" }, { id: "b", label: "b", text: "y" }] };
  assert.deepEqual(answerFor(q, "a and b"), ["a", "b"]);
  assert.equal(answerFor({ ...q, kind: "choice" }, "y"), "b");
});

test("the lesson record is cleaned, merged lesson by lesson, and removals win", () => {
  const a = cleanLesson({ id: "abc123def", title: "  Unit 1 ", updated: 10, questions: [{ id: "q1", kind: "choice", prompt: "?",
    options: [{ id: "a", text: "x" }, { id: "b", text: "y" }] }, { id: "q2", kind: "text", prompt: "Why?" }],
    answers: { q1: "b", q2: "Because", q9: "x" }, key: { q1: "a", q2: "Because" }, tracks: [{ uid: "e123", title: "T", kind: "file" }, { uid: "bad uid" }] });
  assert.equal(a.title, "Unit 1");
  assert.deepEqual(a.answers, { q1: "b", q2: "Because" }, "an answer to no question is dropped");
  assert.equal(a.tracks.length, 1);
  assert.equal(cleanLesson({ id: "x" }), null, "an id too short");
  let s1 = putLesson({}, a, 100);
  let s2 = putLesson({}, { ...a, title: "Unit 1 (mine)" }, 50);
  const m = mergeStates(s1, s2, 200);
  assert.equal(m[a.id].title, "Unit 1", "the copy changed last wins");
  const gone = dropLesson(s1, a.id, 300);
  assert.equal(liveLessons(mergeStates(s2, gone, 300)).length, 0, "a removal wins over an older copy");
  assert.equal(Object.keys(mergeStates(gone, {}, 300 + 61 * 86400)).length, 0, "a removal is forgotten after 60 days");
  assert.deepEqual(cleanState("not json"), {});
  // a lesson from a class is found by its online id
  const from = putLesson({}, { ...a, id: "zzz999yyy", from: { lesson: "11111111-1111-4111-8111-111111111111", cls: "22222222-2222-4222-8222-222222222222", version: 2 } }, 5);
  assert.equal(fromClass(from, "11111111-1111-4111-8111-111111111111").id, "zzz999yyy");
});

test("answers are marked against the key; written answers are for the teacher", () => {
  const qs = [{ id: "q1", kind: "choice", options: [{ id: "a" }, { id: "b" }] }, { id: "q2", kind: "multi", options: [{ id: "a" }, { id: "b" }] },
    { id: "q3", kind: "text", options: [] }, { id: "q4", kind: "text", options: [] }];
  const key = { q1: "a", q2: ["a", "b"], q4: "القاهرة" };
  assert.equal(mark(qs[0], key, "a"), "right");
  assert.equal(mark(qs[1], key, ["b", "a"]), "right");
  assert.equal(mark(qs[1], key, ["a"]), "wrong");
  assert.equal(mark(qs[2], key, "anything"), "open");
  assert.equal(mark(qs[3], key, "القَاهِرَة."), "right", "vowel marks and a full stop don't matter");
  assert.equal(mark(qs[0], key, undefined), "");
  assert.deepEqual(tally(qs, key, { q1: "b", q2: ["a", "b"], q3: "x" }), { right: 1, wrong: 1, open: 1, blank: 1, keyed: 2 });
});

test("the passage and questions come apart and back together in order", () => {
  const r = findQuestions(linesOfText(WORKSHEET));
  const { blocks, questions } = splitItems(r.items);
  assert.equal(blocks.length, 2);
  assert.ok(questions.every((q) => q.at === 2));
  const body = bodyOf(blocks, questions);
  assert.deepEqual(body.map((x) => x.type), ["block", "block", "q", "q", "q", "q", "q", "q"]);
});

test("the packed lesson a class gets has no key, answers or where it was sent", () => {
  const rec = cleanLesson({ id: "abc123def", title: "L", updated: 1, questions: [{ id: "q1", kind: "choice", prompt: "?", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }] }],
    key: { q1: "a" }, answers: { q1: "b" }, sent: [{ lesson: "11111111-1111-4111-8111-111111111111", cls: "22222222-2222-4222-8222-222222222222", version: 1 }] });
  const pack = packLesson(rec, [{ kind: "p", text: "Hi" }], [
    { title: "One", kind: "file", file: { name: "track-1.mp3", mime: "audio/mpeg", size: 9 }, segments: [{ start: 0, end: 1, text: "hi", words: [[0, 1, "hi"]] }] },
    { title: "Bad", kind: "file", file: { name: "../x.mp3" } },
    { title: "Video", kind: "youtube", youtube: { id: "dQw4w9WgXcQ", title: "V" } },
  ]);
  const text = JSON.stringify(pack);
  assert.ok(!text.includes("\"key\"") && !text.includes("answers") && !text.includes("sent"));
  assert.equal(pack.tracks.length, 2, "a file name with a folder in it is dropped");
  const back = unpackLesson(JSON.parse(text));
  assert.equal(back.questions[0].options.length, 2);
  assert.throws(() => unpackLesson({ format: "something else" }));
  assert.equal(trackFileName(3, "My Track.M4A"), "track-3.m4a");
  assert.equal(trackFileName(1, "", "audio/ogg"), "track-1.ogg");
});

test("study words: their sentence, and only clean words", () => {
  assert.equal(sentenceAround("He went home. She stayed at school. Then rain.", 4), "She stayed at school.");
  assert.deepEqual(cleanWords([{ word: "«كتاب»،", sentence: "x" }, { word: "  " }, { word: "كتاب" }]).map((w) => w.word), ["كتاب"]);
});

test("Word numbering is worked out as Word shows it; tick boxes are read", () => {
  const numbering = `<w:numbering><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl></w:abstractNum>
    <w:num w:numId="5"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  assert.equal(docxNumbering(numbering).get("5")["1"].fmt, "lowerLetter");
  const p = (text, lvl = null, extra = "") => `<w:p><w:pPr>${lvl === null ? "" : `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="5"/></w:numPr>`}</w:pPr>${extra}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const doc = `<w:document><w:body>${p("Title &amp; more")}${p("Where?", 0)}${p("Home", 1)}${p("School", 1, '<w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr></w:sdt>')}${p("Why?", 0)}${p("Because", 1)}</w:body></w:document>`;
  const lines = docxLines(doc, numbering);
  assert.equal(lines[0].text, "Title & more");
  assert.deepEqual(lines.slice(1).map((l) => l.list.label), ["1.", "a)", "b)", "2.", "a)"], "a deeper level starts again under each item");
  assert.equal(lines[3].box, "checked");
  const qs = qsOf(findQuestions(lines));
  assert.equal(qs.length, 2);
  assert.equal(qs[0].kind, "choice");
});

function fakeMp3(size = 4000) {
  const b = new Uint8Array(size);
  b.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0], 0);
  for (let i = 10; i < size; i++) b[i] = (i * 7) & 0xff;
  return b;
}

test("sound files are known by their first bytes", () => {
  assert.equal(soundKind(fakeMp3()), "mp3");
  assert.equal(soundKind(new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])), "mp3");
  assert.equal(soundKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "", "a JPEG is not a sound");
  assert.equal(soundKind(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt ")), "wav");
  assert.equal(soundKind(new TextEncoder().encode("\0\0\0\x20ftypM4A \0\0\0\0")), "m4a");
  const wrapped = new Uint8Array(500 + 4000);
  wrapped.set(fakeMp3(), 500);
  assert.equal(findSound(wrapped), 500, "found inside an embedded object");
});

test("sound inside a PDF's own streams is found, with its file name", async () => {
  const mp3 = fakeMp3(5000);
  const packed = deflateSync(Buffer.from(mp3));
  const enc = new TextEncoder();
  const parts = [
    enc.encode("%PDF-1.7\n1 0 obj\n<< /Type /Filespec /F (talk.mp3) /UF (talk.mp3) /EF << /F 7 0 R >> >>\nendobj\n"),
    enc.encode(`7 0 obj\n<< /Type /EmbeddedFile /Subtype /audio#2Fmpeg /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`),
    new Uint8Array(packed),
    enc.encode("\nendstream\nendobj\n8 0 obj\n<< /Subtype /Image /Length 4000 >>\nstream\n"),
    fakeMp3(4000),
    enc.encode("\nendstream\nendobj\n%%EOF"),
  ];
  const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  const found = await audioInPdf(bytes);
  assert.equal(found.length, 1, "an image stream is never taken for sound");
  assert.equal(found[0].name, "talk.mp3");
  assert.equal(found[0].blob.size, 5000);
});

test("a corrected line keeps its words' times; new words fit between", () => {
  const line = { start: 10, end: 14, text: "the cat sat down", words: [[10, 10.5, "the"], [10.5, 11.5, "cat"], [11.5, 12.5, "sat"], [12.5, 14, "down"]] };
  const r = retime(line, "the black cat sat down");
  assert.equal(r.words.length, 5);
  assert.deepEqual(r.words[0], [10, 10.5, "the"]);
  assert.deepEqual(r.words[2], [10.5, 11.5, "cat"], "kept words keep their times");
  assert.equal(r.words[1][2], "black");
  assert.ok(r.words[1][0] >= 10.5 && r.words[1][1] <= 10.5, "the new word sits in the gap");
  const typo = retime(line, "the hat sat down");
  assert.deepEqual(typo.words[1].slice(0, 2), [10.5, 11.5], "a replaced word takes the old one's place");
  for (const w of retime(line, "a b c d e f g h").words) assert.ok(w[0] >= 10 && w[1] <= 14 && w[0] <= w[1]);
  const [a, b] = splitLine(line, 2);
  assert.equal(a.text, "the cat");
  assert.equal(b.start, 11.5);
  assert.deepEqual(joinLines(a, b).words.length, 4);
  assert.equal(changedLines([line], [r]), 1);
  const segs = toSegments([r, { start: 15, end: 16, text: "  ", words: [] }]);
  assert.equal(segs.length, 1, "an emptied line is left out");
  const data = { segments: [{ idx: 0, start: 0, end: 1, text: "hi there" }], words: { start: [0, 0.5], end: [0.5, 1], text: ["hi", "there"], seg: [0, 0] } };
  assert.deepEqual(linesOf(data)[0].words, [[0, 0.5, "hi"], [0.5, 1, "there"]]);
});

test("what the AI found is checked and becomes questions", () => {
  const p = lessonPrompt("1. Where?\na) here\nb) there", { study: "Arabic" });
  assert.ok(p.system.includes("Arabic") && p.schema && p.user.includes("Where"));
  const r = readLessonAnswer({ items: [
    { type: "heading", text: "Unit 1", kind: "", options: [], answer: "", lines: 0 },
    { type: "text", text: "A passage.", kind: "", options: [], answer: "", lines: 0 },
    { type: "question", text: "Where?", kind: "choice", options: ["here", "there"], answer: "there", lines: 1 },
    { type: "question", text: "Pick", kind: "choice", options: ["only one"], answer: "", lines: 1 },
    { type: "question", text: "Both?", kind: "multi", options: ["x", "y", "z"], answer: "x | z", lines: 1 },
    "junk",
  ] });
  const qs = qsOf(r);
  assert.deepEqual(qs.map((q) => q.kind), ["choice", "text", "multi"], "one option is not a choice");
  assert.deepEqual(r.key, { q1: "b", q3: ["a", "c"] });
});

test("scanned pages: read with English beside the lesson's language, tidied", () => {
  assert.equal(lessonOcrPair("ar"), "ar+en");
  assert.equal(lessonOcrPair("en"), "en");
  assert.equal(tidyOcr("  a  line \n\n\n|\nnext\n\n"), "a line\n\nnext");
});

test("the database file and the app agree, and nothing is open to everyone", () => {
  const sql = readFileSync(new URL("../../supabase/v12-dli-lessons.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../web/js/dlilessons.js", import.meta.url), "utf8");
  const called = [...app.matchAll(/dliRpc\("(dli_[a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(called.length >= 9);
  for (const name of new Set(called)) {
    assert.ok(sql.includes(`create or replace function public.${name}(`), `${name} is in the SQL file`);
    assert.ok(new RegExp(`grant execute on function[^;]*public\\.${name}\\(`).test(sql), `${name} may be run by signed-in people`);
    assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(sql), `${name} is closed to everyone else`);
  }
  for (const table of ["dli_lessons", "dli_lesson_work"]) assert.ok(sql.includes(`alter table public.${table} enable row level security;`));
  // the only rules are on the private storage, never on the tables
  const policies = [...sql.matchAll(/create policy "[^"]+" on ([\w.]+)/g)].map((m) => m[1]);
  assert.ok(policies.length === 3 && policies.every((p) => p === "storage.objects"));
  assert.ok(/values \('dli-lessons', 'dli-lessons', false/.test(sql), "the bucket is private");
  assert.ok(!/answer_key/.test(sql.slice(sql.indexOf("private.dli_lesson_for_student"), sql.indexOf("private.dli_lesson_orphans"))), "students never get the key");
  assert.ok(!/last_name|real name/i.test(sql.replace(/No names[^\n]*/g, "")), "no names");
  // what the app sends fits the database's limits
  assert.ok(sql.includes("26214400") && app.includes("25 * 1024 * 1024"));
});
