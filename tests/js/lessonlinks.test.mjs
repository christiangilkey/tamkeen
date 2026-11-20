// Lessons: links to sound files (prototype lesson_links). A teacher's PDF can link to MP3s on their own computer
// (Acrobat "Launch" links to "/C/Users/…/Audio Files/1.mp3") and a Word file to files beside it; each link becomes a
// sound spot beside its question or in the passage, shown "not added yet" until the file is added, matched by name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuestions, linesOfText } from "../../web/js/lessonparse.js";
import { audioLinkName, docxLines, docxRels, placeLinks } from "../../web/js/lessonfiles.js";
import { bodyOf, cleanLesson, matchFiles, packLesson, splitItems, spotKey, unpackLesson } from "../../web/js/lessons.js";
import { PROTOTYPES, feature } from "../../web/js/prototype.js";

const link = (name) => ({ text: "", audioLink: { name, path: `/C/Users/t/Desktop/Unit 9/Audio Files/${name}` } });

test("a link's file name, and only for sound files", () => {
  assert.equal(audioLinkName("/C/Users/bushra/Desktop/Supplimantry Materials Final/Unit 9/Audio Files/12.mp3"), "12.mp3");
  assert.equal(audioLinkName("file:///C:/Lessons/Track%202.WAV"), "Track 2.WAV");
  assert.equal(audioLinkName("Audio Files\\3.m4a"), "3.m4a");
  assert.equal(audioLinkName("https://example.com/talk.mp3"), "", "a web address is a web page's business");
  assert.equal(audioLinkName("/C/Users/t/picture.png"), "");
  assert.equal(audioLinkName(""), "");
});

test("links go in among a page's lines by height: an icon beside a question comes just before it", () => {
  const lines = [{ text: "Title", y: 780 }, { text: "1. Where is he?", y: 716 }, { text: "a) home", y: 700 }, { text: "2. Why?", y: 410 }];
  const out = placeLinks(lines, [{ name: "2.mp3", top: 434 }, { name: "1.mp3", top: 736 }]);
  assert.deepEqual(out.map((l) => l.audioLink ? `♪${l.audioLink.name}` : l.text), ["Title", "♪1.mp3", "1. Where is he?", "a) home", "♪2.mp3", "2. Why?"]);
  assert.ok(out.every((l) => !("y" in l) && !("top" in l)), "the heights stay behind");
  assert.deepEqual(placeLinks([], [{ name: "x.mp3", top: 1 }]).map((l) => l.audioLink.name), ["x.mp3"]);
});

test("the question finder gives each link to the question beside it, or keeps it in the passage", () => {
  const lines = [
    { text: "Listen to the news report.", para: true },
    link("1.mp3"),
    { text: "1. What happened?", para: true },
    { text: "a) a fire", para: false },
    link("1b.mp3"), // among the question's choices: still that question's
    { text: "b) a flood", para: false },
    link("2.mp3"),
    { text: "Now read the passage below.", para: true },
    { text: "2. Why did it happen?", para: true },
    link("end.mp3"),
  ];
  const r = findQuestions(lines);
  const { blocks, questions, spots } = splitItems(r.items);
  assert.equal(questions.length, 2);
  assert.deepEqual(spots.map((s) => [s.name, s.qid, s.at]), [["1.mp3", "q1", 1], ["1b.mp3", "q1", 1], ["2.mp3", "", 1], ["end.mp3", "", 2]]);
  assert.ok(spots.every((s) => s.track === ""), "not added yet");
  assert.equal(questions[0].options.length, 2, "a link between choices doesn't cut the question short");
  // reading order: a question's spots just before it; a passage spot where it was
  const body = bodyOf(blocks, questions, spots).map((x) => x.type === "spot" ? `♪${x.spot.name}` : x.type === "q" ? x.q.id : `p${x.index}`);
  assert.deepEqual(body, ["p0", "♪1.mp3", "♪1b.mp3", "q1", "♪2.mp3", "p1", "q2", "♪end.mp3"]);
});

test("a sound beside a short heading plays under it (the U9 handout: one recording per \"Passage N\")", () => {
  const lines = [link("1.mp3"), { text: "Passage 1", para: true }, { text: "Listen to the passage and answer the questions:", para: true },
    { text: "1. According to the report, what happened?", para: true }, { text: "______________", para: true },
    link("2.mp3"), { text: "Passage 2", para: true }, { text: "Listen to the passage and answer the questions:", para: true },
    { text: "1. Why?", para: true }];
  const { blocks, questions, spots } = splitItems(findQuestions(lines).items);
  const body = bodyOf(blocks, questions, spots).map((x) => x.type === "spot" ? `♪${x.spot.name}` : x.type === "q" ? x.q.id : x.block.text.slice(0, 9));
  assert.deepEqual(body, ["Passage 1", "♪1.mp3", "Listen to", "q1", "Passage 2", "♪2.mp3", "Listen to", "q2"]);
});

test("thirty Launch links on fifteen pages, two questions a page, become thirty spots on the right questions", () => {
  const lines = [];
  for (let p = 0; p < 15; p++) {
    const page = [{ text: `Part ${p + 1}`, y: 780 }, { text: `${2 * p + 1}. Listen and choose.`, y: 716 }, { text: "a) yes", y: 700 }, { text: "b) no", y: 690 },
      { text: `${2 * p + 2}. Listen and write.`, y: 410 }, { text: "______________", y: 380 }];
    lines.push(...placeLinks(page, [{ name: `${2 * p + 1}.mp3`, top: 736 }, { name: `${2 * p + 2}.mp3`, top: 434 }]));
  }
  const { questions, spots } = splitItems(findQuestions(lines).items);
  assert.equal(questions.length, 30);
  assert.equal(spots.length, 30);
  spots.forEach((s, i) => assert.equal(s.qid, questions[i].id, `${s.name} is beside question ${i + 1}`));
});

test("added files find their spots by name", () => {
  assert.equal(spotKey("01.mp3"), "1");
  assert.equal(spotKey("C:\\x\\Unit_9 - Track.MP3"), "unit 9 track");
  const spots = Array.from({ length: 30 }, (_, i) => ({ id: `s${i + 1}`, name: `${i + 1}.mp3`, track: "" }));
  const names = [...Array.from({ length: 30 }, (_, i) => `${String(30 - i).padStart(2, "0")}.mp3`), "intro.mp3"];
  const got = matchFiles(spots, names);
  assert.equal(got[0], "s30");
  assert.equal(got[29], "s1");
  assert.equal(got[30], "", "a file with no spot is general audio");
  assert.equal(new Set(got.filter(Boolean)).size, 30, "each spot takes one file");
  // by the last number, only when there is no doubt
  assert.deepEqual(matchFiles([{ id: "a", name: "1.mp3" }, { id: "b", name: "2.mp3" }], ["Unit 9 Track 1.mp3", "Unit 9 Track 2.mp3"]), ["a", "b"]);
  assert.deepEqual(matchFiles([{ id: "a", name: "1.mp3" }], ["Track 1.mp3", "Part 1.mp3"]), ["", ""], "two files fit: neither is guessed");
  // a spot already filled is matched last
  assert.deepEqual(matchFiles([{ id: "a", name: "1.mp3", track: "u1" }, { id: "b", name: "1.mp3", track: "" }], ["1.mp3"]), ["b"]);
});

test("spots are kept in the record, travel to a class with the number of their track, and come back", () => {
  const rec = cleanLesson({ id: "abc123def", title: "U9", updated: 1,
    questions: [{ id: "q1", kind: "text", prompt: "Why?" }],
    tracks: [{ uid: "e111", title: "intro", kind: "file" }, { uid: "e222", title: "1", kind: "file" }],
    spots: [{ id: "s1", name: "1.mp3", qid: "q1", at: 0, track: "e222" }, { id: "s2", name: "2.mp3", qid: "q9", at: 3, track: "" }, { name: "" }] });
  assert.equal(rec.spots.length, 2);
  assert.equal(rec.spots[1].qid, "", "a spot for a question that isn't there keeps only its place");
  const pack = packLesson(rec, [{ kind: "p", text: "x" }], [{ title: "intro", kind: "file", file: { name: "track-1.mp3" } }, { title: "1", kind: "file", file: { name: "track-2.mp3" } }]);
  assert.deepEqual(pack.spots.map((s) => s.track), [1, -1]);
  assert.ok(!JSON.stringify(pack.spots).includes("e222"), "the teacher's own ids stay with the teacher");
  const back = unpackLesson(JSON.parse(JSON.stringify(pack)));
  assert.deepEqual(back.spots.map((s) => [s.name, s.trackIndex]), [["1.mp3", 1], ["2.mp3", -1]]);
});

test("Word hyperlinks to sound files become spots too", () => {
  const rels = docxRels(`<Relationships><Relationship Id="rId9" Type="x/hyperlink" Target="file:///C:/Unit%209/Audio%20Files/4.mp3" TargetMode="External"/>
    <Relationship Id="rId2" Type="x/styles" Target="styles.xml"/></Relationships>`);
  assert.equal(rels.get("rId9"), "file:///C:/Unit%209/Audio%20Files/4.mp3");
  assert.ok(!rels.has("rId2"), "only links that point outside the document");
  const doc = `<w:document><w:body>
    <w:p><w:hyperlink r:id="rId9"><w:r><w:t>Listen</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> 4. What did she buy?</w:t></w:r></w:p>
    <w:p><w:r><w:instrText xml:space="preserve"> HYPERLINK "Audio Files/5.mp3" </w:instrText></w:r><w:r><w:t>5. Where?</w:t></w:r></w:p>
  </w:body></w:document>`;
  const lines = docxLines(doc, "", rels);
  assert.deepEqual(lines.filter((l) => l.audioLink).map((l) => l.audioLink.name), ["4.mp3", "5.mp3"]);
  assert.equal(docxLines(doc, "").filter((l) => l.audioLink).length, 0, "without the document's links, nothing changes");
});

test("released for everyone (released in v0.64.0, the owner, 2026-11-19)", () => {
  assert.equal(PROTOTYPES.lesson_links.released, true);
  assert.equal(feature("lesson_links"), true, "on without prototype mode");
  const plain = splitItems(findQuestions(linesOfText("1. Why?")).items);
  assert.deepEqual(plain.spots, []);
});
