// DLI students (web/js/dli.js, tools/dli/encrypt.mjs): the password check, the encryption of the
// material, the settings, the ready-made transcript check, and that the real password is nowhere in
// the repository. These tests use a password of their own; the real one is never written here.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as dli from "../../web/js/dli.js";
import { packContent, ALIASES } from "../../tools/dli/encrypt.mjs";
import { FIXES, fixIntro } from "../../tools/dli/fixes.mjs";
import { courseTabChoice } from "../../web/js/coursedata.js";
import { KEYS } from "../../web/js/aikeys.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEST_PASSWORD = "Test Pass 42";
const FAST = 200000; // the least the app accepts

test("the shipped check and key parameters are well formed, and separate", () => {
  assert.ok(dli.paramsOk(dli.CHECK), "16-byte salt, at least 200,000 rounds, a 32-byte hash");
  assert.ok(dli.paramsOk(dli.KEY, { hash: false }));
  assert.ok(dli.CHECK.iterations >= 200000 && dli.KEY.iterations >= 200000);
  assert.notEqual(dli.CHECK.salt, dli.KEY.salt, "the content key has a salt of its own");
  assert.ok(!dli.paramsOk({ ...dli.CHECK, iterations: 1000 }), "too few rounds is refused");
  assert.ok(!dli.paramsOk({ ...dli.CHECK, salt: dli.toBase64(new Uint8Array(8)) }), "a short salt is refused");
});

test("a password is checked against its hash, typed any way", async () => {
  const check = await dli.makeCheck(TEST_PASSWORD, { iterations: FAST });
  assert.ok(dli.paramsOk(check));
  assert.notEqual(check.hash, dli.toBase64(new TextEncoder().encode(TEST_PASSWORD)), "the hash isn't the password");
  assert.equal(await dli.checkPassword(TEST_PASSWORD, check), true);
  assert.equal(await dli.checkPassword("testpass42", check), true, "no spaces, small letters");
  assert.equal(await dli.checkPassword("  t e s t P A S S 4 2 \n", check), true, "spaces anywhere, trimmed");
  assert.equal(await dli.checkPassword("Test Pass 43", check), false, "a wrong password");
  assert.equal(await dli.checkPassword("", check), false, "nothing typed");
  assert.equal(await dli.checkPassword("   ", check), false);
  assert.equal(await dli.checkPassword(TEST_PASSWORD), false, "the test password isn't the app's");
  assert.equal(dli.normalisePassword(" ab c\tD "), "ABCD");
  assert.equal(dli.normalisePassword("ｓｇｔ"), "SGT", "full-width letters count as letters");
});

test("the content key comes from the password and opens what it sealed, nothing else", async () => {
  const keyParams = { salt: dli.toBase64(dli.randomBytes(16)), iterations: FAST };
  const key = await dli.contentKey("test pass 42", keyParams);
  assert.ok(dli.isKeyText(key));
  assert.equal(await dli.contentKey(TEST_PASSWORD, keyParams), key, "the same however it is typed");
  const other = await dli.contentKey("another one", keyParams);
  const text = new TextEncoder().encode("مرحبا, hello ".repeat(200));
  for (const gzip of [false, true]) {
    const sealed = await dli.sealBytes(key, text, { name: "abc", gzip });
    assert.ok(!Buffer.from(sealed).includes(Buffer.from("hello")), "the plain text isn't in the file");
    assert.deepEqual(await dli.openBytes(key, sealed, { name: "abc" }), text);
    await assert.rejects(dli.openBytes(other, sealed, { name: "abc" }), "another key can't open it");
    await assert.rejects(dli.openBytes(key, sealed, { name: "xyz" }), "nor can it pass for another file");
    const broken = sealed.slice();
    broken[broken.length - 1] ^= 1;
    await assert.rejects(dli.openBytes(key, broken, { name: "abc" }), "a changed file is refused");
  }
  const value = { content: { ar: [1, 2] } };
  assert.deepEqual(await dli.openJson(key, await dli.sealJson(key, value, { name: "index" }), { name: "index" }), value);
});

test("the settings: student, language, key; ready only with all three", () => {
  const key = dli.toBase64(new Uint8Array(32).fill(7));
  assert.deepEqual(dli.dliState({}), { student: false, language: "", key: "", unlocked: false, ready: false });
  assert.equal(dli.dliState({ dli_student: "on", dli_key: key }).unlocked, true);
  assert.equal(dli.dliState({ dli_student: "on", dli_key: key }).ready, false, "no language chosen yet");
  assert.equal(dli.dliState({ dli_student: "on", dli_key: key, dli_language: "ar" }).ready, true);
  assert.equal(dli.dliState({ dli_student: "", dli_key: key, dli_language: "ar" }).ready, false, "unticked = locked");
  assert.equal(dli.dliState({ dli_student: "on", dli_key: "nope", dli_language: "ar" }).ready, false);
  assert.equal(dli.dliState({ dli_student: "on", dli_key: key, dli_language: "de" }).language, "", "German isn't taught here");
  assert.deepEqual(dli.DLI_CODES, ["ar", "zh", "fa", "fr", "ko", "ru", "es"], "the owner's seven, in his order");
  assert.deepEqual(dli.DLI_LANGUAGES.map(([, n]) => n), ["Arabic", "Chinese", "Farsi", "French", "Korean", "Russian", "Spanish"]);
  // podcasts added once
  let s = {};
  s = { dli_added: dli.withAdded(s, "ar", "arabic101") };
  s = { dli_added: dli.withAdded(s, "ar", "arabic101") };
  assert.deepEqual(dli.addedList(s), ["ar:arabic101"]);
  assert.deepEqual(dli.addedList({ dli_added: "ar:arabic101 junk<x> fa:radio" }), ["ar:arabic101", "fa:radio"]);
  for (const k of ["dli_student", "dli_language", "dli_key", "dli_added"]) assert.ok(KEYS.includes(k), `${k} follows the learner to their other devices`);
});

test("the Library's DLI tab opens when asked for, else Grammar first as before", () => {
  assert.equal(courseTabChoice({ basics: true, grammar: true, dli: true }), "grammar");
  assert.equal(courseTabChoice({ basics: true, grammar: true, dli: true, asked: "dli" }), "dli");
  assert.equal(courseTabChoice({ basics: true, grammar: true, dli: false, asked: "dli" }), "grammar", "no DLI tab: not opened");
  assert.equal(courseTabChoice({ dli: true }), "dli", "a language with only DLI material");
  assert.equal(courseTabChoice({}), "");
});

// A transcript in the sync's own format (app/sync/engine.py transcript_payload).
export const PAYLOAD = {
  format: 1, rev: 1794033795.87, model: "faster-whisper:large-v3:cuda",
  segments: [[0.24, 3.14, "مرحبا بكم"], [3.2, 5.0, "في الدرس"]],
  words: { start: [0.24, 1.1, 3.2, 3.9], end: [1.0, 3.14, 3.8, 5.0], text: ["مرحبا", "بكم", "في", "الدرس"], seg: [0, 0, 1, 1] },
  vowels: { words: ["مَرْحَبًا", "بِكُمْ", "فِي", "الدَّرْسِ"], dialect: "msa", guess: [1], model: "catt" },
};

test("a ready-made transcript is checked before it is stored", () => {
  const ok = dli.checkPayload(PAYLOAD);
  assert.deepEqual(ok.words.text, PAYLOAD.words.text);
  assert.equal(ok.rev, PAYLOAD.rev);
  assert.equal(ok.vowels.words.length, 4);
  assert.equal(dli.checkPayload({ ...PAYLOAD, rev: 0 }), null, "no revision");
  assert.equal(dli.checkPayload({ ...PAYLOAD, segments: [] }), null, "no text");
  assert.equal(dli.checkPayload({ ...PAYLOAD, words: { ...PAYLOAD.words, seg: [0, 0, 1, 5] } }), null, "a word in no segment");
  assert.equal(dli.checkPayload({ ...PAYLOAD, words: { ...PAYLOAD.words, text: ["a", "b", "c"] } }), null, "lists of different lengths");
  assert.equal(dli.checkPayload({ ...PAYLOAD, segments: [[0, 1, "a\u0000b"]] }), null, "control characters");
  assert.equal(dli.checkPayload("nope"), null);
  assert.equal(dli.checkPayload({ ...PAYLOAD, vowels: { words: ["x"] } }).vowels, undefined, "vowels that don't fit are left out");
  assert.equal(dli.checkPayload({ ...PAYLOAD, model: 5 }).model, "ready-made");
});

function contentFolder() {
  const dir = mkdtempSync(join(tmpdir(), "dli-content-"));
  // Arabic: a podcast (as the transcription helper writes it) and a file in a group
  const pod = join(dir, "ar", "test-pod");
  mkdirSync(pod, { recursive: true });
  writeFileSync(join(pod, "index.json"), JSON.stringify({ format: 1, feed_url: "https://feeds.example.com/pod.xml", feed_title: "Test Pod",
    episodes: [{ guid: "ep-1", audio_url: "https://cdn.example.com/1.mp3", title: "One", transcript: "ep-1.json" },
               { guid: "ep-2", audio_url: "https://cdn.example.com/2.mp3", title: "Two", transcript: "ep-2.json" }] }));
  writeFileSync(join(pod, "ep-1.json"), JSON.stringify(PAYLOAD));
  writeFileSync(join(pod, "ep-2.json"), JSON.stringify({ broken: true }));
  mkdirSync(join(dir, "ar", "Unit 1"), { recursive: true });
  writeFileSync(join(dir, "ar", "Unit 1", "02 Words.txt"), "secret words ".repeat(50));
  writeFileSync(join(dir, "ar", "Unit 1", "10 More.txt"), "more");
  writeFileSync(join(dir, "README.txt"), "not content");
  return dir;
}

test("the tool encrypts a content folder, and the app's side opens it again", async () => {
  const check = await dli.makeCheck(TEST_PASSWORD, { iterations: FAST });
  const keyParams = { salt: dli.toBase64(dli.randomBytes(16)), iterations: FAST };
  const from = contentFolder();
  const out = mkdtempSync(join(tmpdir(), "dli-out-"));
  try {
    await assert.rejects(packContent({ from, out, password: "wrong", check, keyParams }), /isn't the DLI password/);
    assert.deepEqual(readdirSync(out), [], "a wrong password writes nothing");
    const r = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    assert.equal(r.skipped.length, 1, "the broken transcript is left out, and said");
    const key = await dli.contentKey(TEST_PASSWORD, keyParams);
    const index = dli.cleanIndex(await dli.openJson(key, readFileSync(join(out, "index.bin")), { name: "index" }));
    const ar = dli.contentFor(index, "ar");
    assert.deepEqual(ar.map((x) => x.kind), ["podcast", "file", "file"]);
    const [pod, f1, f2] = ar;
    assert.equal(pod.title, "Test Pod");
    assert.equal(pod.feed, "https://feeds.example.com/pod.xml");
    assert.deepEqual(pod.episodes.map((e) => [e.guid, e.audio]), [["ep-1", "https://cdn.example.com/1.mp3"]]);
    assert.deepEqual([f1.title, f2.title], ["02 Words", "10 More"], "in number order");
    assert.equal(f1.group, "Unit 1");
    assert.equal(f1.type, "text/plain");
    assert.deepEqual(dli.contentFor(index, "zh"), [], "nothing for Chinese yet");
    // the transcript and the file, opened as the app does
    const payload = await dli.openJson(key, readFileSync(join(out, `${pod.episodes[0].file}.bin`)), { name: pod.episodes[0].file });
    assert.deepEqual(payload, dli.checkPayload(PAYLOAD));
    const text = new TextDecoder().decode(await dli.openBytes(key, readFileSync(join(out, `${f1.id}.bin`)), { name: f1.id }));
    assert.equal(text, "secret words ".repeat(50));
    // nothing readable in what was written, not even the names
    for (const name of readdirSync(out)) {
      assert.match(name, /^([0-9a-f]{32}|index)\.bin$/);
      const bytes = readFileSync(join(out, name));
      for (const plain of ["secret words", "Test Pod", "Words", "example.com", "مرحبا"]) assert.ok(!bytes.includes(Buffer.from(plain)), `"${plain}" isn't readable in ${name}`);
    }
    // Again: unchanged files keep their encrypted copies; a removed one goes.
    rmSync(join(from, "ar", "Unit 1", "10 More.txt"));
    const before = readdirSync(out).length;
    const again = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    assert.equal(again.written, 0, "nothing new to encrypt");
    assert.equal(again.kept, 2);
    assert.equal(readdirSync(out).length, before - 1, "the removed file's copy is gone");
    // An empty index: every language "coming soon".
    const empty = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams, empty: true });
    assert.ok(dli.DLI_CODES.every((c) => !empty.index.content[c].length));
    assert.deepEqual(readdirSync(out), ["index.bin"]);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("the first Arabic101 folder counts as Arabic until it is moved under ar", async () => {
  assert.equal(ALIASES.arabic101, "ar");
  const check = await dli.makeCheck(TEST_PASSWORD, { iterations: FAST });
  const keyParams = { salt: dli.toBase64(dli.randomBytes(16)), iterations: FAST };
  const from = mkdtempSync(join(tmpdir(), "dli-alias-"));
  const out = mkdtempSync(join(tmpdir(), "dli-out-"));
  try {
    mkdirSync(join(from, "arabic101"));
    writeFileSync(join(from, "arabic101", "index.json"), JSON.stringify({ feed_url: "https://feed.example.com/a.xml", feed_title: "A101",
      episodes: [{ guid: "g", audio_url: "https://cdn.example.com/a.mp3", title: "U1", transcript: "g.json" }] }));
    writeFileSync(join(from, "arabic101", "g.json"), JSON.stringify(PAYLOAD));
    const r = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    assert.deepEqual(r.index.content.ar.map((x) => [x.kind, x.id, x.title, x.episodes.length]), [["podcast", "arabic101", "A101", 1]]);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("Arabic101's spoken English intro becomes Latin letters on the same times, wherever Whisper wrote it", () => {
  const ep = { title: "Unit 04 - Chapter 19" };
  const tail = (from) => ({ seg: [from, from + 1], text: ["واحد", "هناك"] });
  // over three lines, in Arabic letters, with vowel marks and a guessed word after it
  const split = { format: 1, rev: 5, model: "m",
    segments: [[0.11, 1.05, "يونيت فور"], [1.05, 2.71, "كابتر ناينتين"], [2.71, 3.65, "ريفيو"], [3.91, 5.15, "واحد"], [5.4, 6, "هناك"]],
    words: { start: [0.11, 0.71, 1.05, 2.05, 2.71, 3.91, 5.4], end: [0.7, 1.0, 2.0, 2.7, 3.65, 5.15, 6], text: ["يونيت", "فور", "كابتر", "ناينتين", "ريفيو", ...tail(3).text],
             seg: [0, 0, 1, 1, 2, ...tail(3).seg] },
    vowels: { words: ["يُونِيتُ", "فَوْرْ", "كَابْتْرْ", "نَايِنَتِيْنِ", "رِيْفِيُّوَ", "وَاحْدٌ", "هُنَاكَ"], dialect: "", guess: [1, 6], model: "v" } };
  const r = fixIntro(split, ep);
  assert.equal(r.how, "arabic");
  assert.deepEqual(r.payload.segments.slice(0, 2), [[0.11, 3.65, "Unit 4 Chapter 19 Review"], [3.91, 5.15, "واحد"]]);
  assert.deepEqual(r.payload.words.text, ["Unit", "4", "Chapter", "19", "Review", "واحد", "هناك"]);
  assert.deepEqual(r.payload.words.start.slice(0, 5), [0.11, 0.71, 1.05, 2.05, 2.71], "five words: each keeps its own time");
  assert.deepEqual(r.payload.words.seg, [0, 0, 0, 0, 0, 1, 2], "the lines after it move up");
  assert.deepEqual(r.payload.vowels.words, [null, null, null, null, null, "وَاحْدٌ", "هُنَاكَ"]);
  assert.deepEqual(r.payload.vowels.guess, [6], "a guessed word after it keeps its mark");
  assert.ok(dli.checkPayload(r.payload));
  // one line in Latin letters, small: written alike
  const latin = { format: 1, rev: 5, model: "m", segments: [[0.43, 3.07, "unit 1 chapter 3 review"], [3.07, 5, "1. جدي"]],
    words: { start: [0.43, 0.97, 1.23, 1.89, 2.41, 3.07, 4], end: [0.9, 1.2, 1.8, 2.4, 3.07, 3.5, 5], text: ["unit", "1", "chapter", "3", "review", "1.", "جدي"], seg: [0, 0, 0, 0, 0, 1, 1] } };
  const l = fixIntro(latin, { title: "Unit 01 - Chapter 03" });
  assert.equal(l.how, "latin");
  assert.equal(l.payload.segments[0][2], "Unit 1 Chapter 3 Review");
  assert.equal(fixIntro(l.payload, { title: "Unit 01 - Chapter 03" }).how, "same", "running it again changes nothing");
  // four words on one line: five spread over the same time
  const four = { ...latin, segments: [[0.5, 3.5, "يوني ثري كابتر ريفيو"], [3.6, 5, "واحد"]],
    words: { start: [0.5, 1, 1.5, 3], end: [0.9, 1.4, 2.9, 3.5], text: ["يوني", "ثري", "كابتر", "ريفيو"], seg: [0, 0, 0, 0] } };
  four.words = { start: [...four.words.start, 3.6], end: [...four.words.end, 5], text: [...four.words.text, "واحد"], seg: [0, 0, 0, 0, 1] };
  const f = fixIntro(four, { title: "Unit 03 - Chapter 14" });
  assert.deepEqual(f.payload.words.start.slice(0, 5), [0.5, 1.1, 1.7, 2.3, 2.9]);
  assert.equal(f.payload.words.end[4], 3.5);
  // not there: nothing added
  const none = { ...latin, segments: [[4.56, 9.75, "سألت الموظف"]], words: { start: [4.56, 6], end: [5.9, 9.75], text: ["سألت", "الموظف"], seg: [0, 0] } };
  assert.equal(fixIntro(none, { title: "Unit 03 - Chapter 12" }).how, "missing");
  assert.equal(fixIntro(latin, { title: "Bonus episode" }).how, "no-title");
  assert.deepEqual(Object.keys(FIXES), ["arabic101"]);
});

test("the shipped index is an encrypted one: no names or text readable in web/dli", () => {
  const dir = join(root, "web", "dli");
  assert.ok(existsSync(join(dir, "index.bin")), "the phone build copies web/dli (it needs an index)");
  for (const name of readdirSync(dir)) {
    assert.match(name, /^([0-9a-f]{32}|index)\.bin$/, `${name}: only encrypted files belong in web/dli`);
    const b = readFileSync(join(dir, name));
    assert.equal(b[0], 1, "one of the tool's files");
  }
});

// The real password must be nowhere in the repository. This test can't hold the password, so it uses
// the shipped hash: every quoted text in the DLI files (where a slip is likeliest) is hashed and compared;
// with DLI_PASSWORD set (as when packaging), every file git knows is searched for it as well.
test("the real password is in no file of the repository", async () => {
  const { pbkdf2 } = await import("node:crypto");
  const salt = Buffer.from(dli.CHECK.salt, "base64"), want = Buffer.from(dli.CHECK.hash, "base64");
  // (Node's own PBKDF2, several at once on its worker threads: the same result as WebCrypto's)
  const isPassword = (s) => new Promise((resolve, reject) => pbkdf2(dli.normalisePassword(s), salt, dli.CHECK.iterations, 32, "sha256",
    (err, out) => (err ? reject(err) : resolve(out.equals(want)))));
  const files = ["web/js/dli.js", "web/js/dlicontent.js", "web/js/components/dlicard.js", "web/js/components/dlipanel.js",
    "tools/dli/encrypt.mjs", "tools/dli/fixes.mjs", "tests/js/dli.test.mjs", "app/api/premade.py", "tests/test_premade.py"];
  const seen = new Set();
  for (const f of files) {
    const src = readFileSync(join(root, f), "utf8");
    for (const m of src.matchAll(/"([^"\n]{4,40})"|'([^'\n]{4,40})'|`([^`\n$]{4,40})`/g)) {
      const s = dli.normalisePassword(m[1] || m[2] || m[3]);
      if (s.length >= 6 && s.length <= 24) seen.add(s); // (a password of 6 to 24 letters: hashing every text would take minutes)
    }
  }
  const found = (await Promise.all([...seen].map(isPassword))).filter(Boolean);
  assert.equal(found.length, 0, "a quoted text in the DLI files is the password");
  const real = process.env.DLI_PASSWORD;
  if (!real) return; // (the full search needs the password itself, which only the person packaging has)
  assert.ok(await dli.checkPassword(real), "DLI_PASSWORD is the real password");
  const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n").filter(Boolean);
  const target = dli.normalisePassword(real);
  // (sounds, pictures, fonts and other binary files can't hold it as text: left out, which keeps this quick)
  const BINARY = /\.(ogg|opus|mp3|m4a|wav|mp4|webm|png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|bin|gz|zip|pdf|wasm|traineddata|aseprite|blend|p12|keystore|jar|db)$/i;
  const hits = [];
  for (const f of tracked) {
    if (BINARY.test(f)) continue;
    let text;
    try { text = readFileSync(join(root, f)); } catch { continue; }
    if (text.length > 20 * 1024 * 1024) continue;
    const plain = text.toString("utf8").toUpperCase().replace(/[\s_-]+/g, "");
    if (plain.includes(target)) hits.push(f);
  }
  assert.deepEqual(hits, [], "files that contain the password");
});
