// Run with: node --test tests/js/
// Translation under each line (dual subtitles, web/js/dualsubs.js): the switch remembered on the device, the
// AI asked a batch of lines at a time near where the learner is (never a whole podcast at once), its answer
// read robustly, translations kept per item and language so no line is asked twice, a YouTube video's own
// captions in the learner's language put under the right lines, and the players wired to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AHEAD, BATCH, DUAL_KEY, TRANSLATE_SCHEMA, alignLines, createTranslator, dualOn, hasWords, ownLanguageCode, pickBatch,
  readTranslations, setDualOn, translatePrompt, translationKey,
} from "../../web/js/dualsubs.js";
import { askJson } from "../../web/js/definer.js";
import { UI_LANGUAGES } from "../../web/js/i18n.js";
import { LANGUAGES } from "../../web/js/languages.js";
import { ICON_NAMES } from "../../web/js/icons.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** A stand-in for localStorage. */
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
/** A stand-in for dualstore.js: {get, put} over a Map, counting writes. */
function memoryStore() {
  const m = new Map();
  const store = { m, puts: 0, async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; }, async put(k, v) { store.puts++; m.set(k, structuredClone(v)); return true; } };
  return store;
}
/** An AI that translates by putting "EN " before each line, and remembers what it was asked. */
function fakeAi({ fail = false } = {}) {
  const calls = [];
  const ask = async (texts) => {
    calls.push(texts);
    if (fail) throw new Error("quota");
    return { lines: texts.map((s, i) => ({ n: i + 1, text: `EN ${s}` })) };
  };
  ask.calls = calls;
  return ask;
}
const settle = () => new Promise((r) => setTimeout(r, 0));
async function idle(tr) { await tr.ready; for (let k = 0; k < 50; k++) { await settle(); if (!tr.busy) { await settle(); if (!tr.busy) return; } } }
const lines = (n) => Array.from({ length: n }, (_, i) => `línea ${i}`);

// ---------- the switch ----------

test("the switch starts off and is remembered on the device", () => {
  const ls = memoryStorage();
  assert.equal(dualOn(ls), false, "off until switched on");
  setDualOn(true, ls);
  assert.equal(ls.getItem(DUAL_KEY), "1");
  assert.equal(dualOn(ls), true);
  setDualOn(false, ls);
  assert.equal(dualOn(ls), false);
  assert.equal(ls.getItem(DUAL_KEY), null, "switched off leaves nothing behind");
  assert.equal(dualOn(null), false, "no storage: off");
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.equal(dualOn(broken), false, "storage that refuses: off, no error");
  assert.doesNotThrow(() => setDualOn(true, broken));
});

// ---------- the request ----------

test("the request numbers the lines and names both languages", () => {
  const p = translatePrompt(["مرحبا يا صديقي", "  كيف\n حالك؟ "], { study: "Arabic", speaks: "Spanish" });
  assert.equal(p.user, "1. مرحبا يا صديقي\n2. كيف حالك؟");
  assert.ok(p.system.includes("Arabic") && p.system.includes("Spanish"));
  assert.ok(/never move words to another line/i.test(p.system), "each translation stays under its own line");
  assert.equal(p.schema, TRANSLATE_SCHEMA);
  assert.deepEqual(TRANSLATE_SCHEMA.required, ["lines"]);
  assert.deepEqual(TRANSLATE_SCHEMA.properties.lines.items.required, ["n", "text"]);
  assert.ok(p.maxTokens >= 1500 && p.maxTokens <= 8000);
});

test("every provider's answer to the request is read back, line by line", async () => {
  const body = JSON.stringify({ lines: [{ n: 2, text: "How are you?" }, { n: 1, text: "Hello, my friend" }] });
  const answers = {
    claude: { stop_reason: "end_turn", content: [{ type: "text", text: body }], usage: { input_tokens: 50, output_tokens: 20 } },
    gemini: { candidates: [{ content: { parts: [{ text: body }] } }] },
    openai: { choices: [{ message: { content: body } }] },
    grok: { choices: [{ message: { content: body } }] },
  };
  for (const [provider, answer] of Object.entries(answers)) {
    const sent = [];
    const transport = async (req) => { sent.push(req); return { status: 200, text: JSON.stringify(answer) }; };
    const prompt = translatePrompt(["مرحبا يا صديقي", "كيف حالك؟"], { study: "Arabic", speaks: "English" });
    const got = readTranslations(await askJson({ provider, key: "k", model: "", language: "English" }, prompt, transport), 2);
    assert.deepEqual(got, ["Hello, my friend", "How are you?"], provider);
    assert.ok(JSON.stringify(sent[0].body).includes("كيف حالك؟"), `${provider}: the lines are sent`);
  }
});

test("answers are read robustly: by number, in order, fenced, or a bare list", () => {
  assert.deepEqual(readTranslations({ lines: [{ n: 3, text: "c" }, { n: 1, text: "a" }] }, 3), ["a", "", "c"], "a missing line stays empty");
  assert.deepEqual(readTranslations('Here you go:\n```json\n{"lines":[{"n":1,"text":"“a”"},{"n":2,"text":" b  b "}]}\n```', 2), ["a", "b b"], "text round it, quotes and spaces tidied");
  assert.deepEqual(readTranslations(["a", "b"], 2), ["a", "b"], "a bare list");
  assert.deepEqual(readTranslations({ translations: [{ text: "a" }, { text: "b" }] }, 2), ["a", "b"], "numbers left out: in order");
  assert.deepEqual(readTranslations({ lines: [{ n: 9, text: "x" }, { n: 1, text: "a" }, { n: 2, text: "b" }] }, 2), ["a", "b"], "a number out of range is not put anywhere");
  assert.deepEqual(readTranslations({ lines: [{ n: 0, text: "a" }, { n: 1, text: "b" }, { n: 2, text: "c" }] }, 3), ["a", "b", "c"], "numbered from 0");
  assert.deepEqual(readTranslations("not json at all", 2), ["", ""]);
  assert.deepEqual(readTranslations(null, 1), [""]);
  assert.equal(readTranslations({ lines: [{ n: 1, text: "x".repeat(5000) }] }, 1)[0].length, 1000, "kept to a sane length");
});

// ---------- lazily, near the learner ----------

test("batches are asked for near the learner, full ones, ahead of them", () => {
  const done = new Set();
  const has = (i) => done.has(i);
  const first = pickBatch({ count: 1000, has, focus: 0 });
  assert.deepEqual(first, Array.from({ length: BATCH }, (_, i) => i), "the first lines first");
  first.forEach((i) => done.add(i));
  const second = pickBatch({ count: 1000, has, focus: 0 });
  assert.deepEqual(second, Array.from({ length: BATCH }, (_, i) => i + BATCH), "then the next ones, while they are near");
  second.forEach((i) => done.add(i));
  assert.deepEqual(pickBatch({ count: 1000, has, focus: 0 }), [], "40 lines ahead: nothing more until the learner moves on");
  assert.deepEqual(pickBatch({ count: 1000, has, focus: 15 }), [], "still enough ahead");
  assert.deepEqual(pickBatch({ count: 1000, has, focus: 25 })[0], 40, "moving on brings the next batch");
  const far = pickBatch({ count: 1000, has, focus: 700 });
  assert.equal(far[0], 697, "a jump far ahead starts a few lines before where the learner landed");
  assert.equal(far.length, BATCH);
  assert.deepEqual(pickBatch({ count: 5, has: () => false, focus: 3 }), [0, 1, 2, 3, 4], "a short list: what there is");
  assert.deepEqual(pickBatch({ count: 0, has, focus: 0 }), []);
  assert.ok(AHEAD > BATCH);
});

test("a two-hour podcast is never translated all at once", async () => {
  const ai = fakeAi();
  const tr = createTranslator({ texts: lines(2000), ask: ai, store: memoryStore(), key: "k" });
  tr.want(0);
  await idle(tr);
  const asked = ai.calls.flat().length;
  assert.ok(asked > 0 && asked <= 2 * BATCH, `only the lines near the start (${asked})`);
  tr.want(1200);
  await idle(tr);
  assert.ok(ai.calls.some((c) => c[0] === "línea 1197"), "a jump: the lines where the learner is now");
  assert.ok(ai.calls.flat().length <= 4 * BATCH);
  assert.equal(tr.textAt(1200), "EN línea 1200");
  assert.equal(tr.textAt(800), "", "lines never near the learner have no translation");
});

test("lines with nothing to translate, and repeated lines, are not asked for twice", async () => {
  const ai = fakeAi();
  const texts = ["♪", "Hola", "Hola", "...", "Adiós"];
  const seen = [];
  const tr = createTranslator({ texts, ask: ai, onLines: (l) => seen.push(...l) });
  tr.want(0);
  await idle(tr);
  assert.deepEqual(ai.calls, [["Hola", "Adiós"]], "once each, and no music marks");
  assert.deepEqual([...seen].sort(), [1, 2, 4], "both copies of the line get it");
  assert.equal(tr.textAt(0), "");
  assert.equal(tr.complete(), true);
  assert.equal(hasWords("[ 00:12 ]"), false);
  assert.equal(hasWords("你好"), true);
});

// ---------- kept on the device ----------

test("translations are kept per item and language, and not asked for again", async () => {
  const store = memoryStore();
  const ai = fakeAi();
  const tr = createTranslator({ texts: lines(10), ask: ai, store, key: "dual:ep1:english" });
  tr.want(0);
  await idle(tr);
  await tr.saved();
  assert.equal(ai.calls.length, 1);
  assert.equal(store.m.get("dual:ep1:english").lines["línea 3"], "EN línea 3", "kept by the line's own text");

  const again = fakeAi();
  const painted = [];
  const tr2 = createTranslator({ texts: lines(10), ask: again, store, key: "dual:ep1:english", onLines: (l) => painted.push(...l) });
  tr2.want(0);
  await idle(tr2);
  assert.equal(again.calls.length, 0, "opened again: nothing asked");
  assert.equal(painted.length, 10, "and every line shows its translation at once");

  // A line put right in the transcript is a new line: only it is asked for.
  const fixed = lines(10);
  fixed[4] = "línea cuatro";
  const third = fakeAi();
  const tr3 = createTranslator({ texts: fixed, ask: third, store, key: "dual:ep1:english" });
  tr3.want(0);
  await idle(tr3);
  assert.deepEqual(third.calls, [["línea cuatro"]]);

  const other = fakeAi();
  const tr4 = createTranslator({ texts: lines(10), ask: other, store, key: "dual:ep1:french" });
  tr4.want(0);
  await idle(tr4);
  assert.equal(other.calls.length, 1, "another language is translated afresh");
});

test("where translations are kept: one place per item (on every device) and language", () => {
  assert.equal(translationKey({ id: 7, uid: "abc" }, "English"), "dual:abc:english");
  assert.equal(translationKey({ id: 7 }, " Español "), "dual:id:7:español");
  assert.equal(translationKey({ id: 7, guid: "81234567", audio_type: "video/netflix" }, "English"), "dual:81234567:english");
});

test("a failed request is said once, and nothing more is asked until the learner tries again", async () => {
  const ai = fakeAi({ fail: true });
  const errors = [];
  const tr = createTranslator({ texts: lines(100), ask: ai, onError: (e) => errors.push(e.message) });
  tr.want(0);
  await idle(tr);
  tr.want(50);
  await idle(tr);
  assert.deepEqual(errors, ["quota"]);
  assert.equal(ai.calls.length, 1);
  tr.retry();
  await idle(tr);
  assert.equal(ai.calls.length, 2, "pressing the switch again tries again");
  // An answer with nothing in it counts as a failure too (not asked for over and over).
  const empty = async () => ({ lines: [] });
  const errs = [];
  const tr2 = createTranslator({ texts: lines(5), ask: empty, onError: (e) => errs.push(e) });
  tr2.want(0);
  await idle(tr2);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].empty, true);
});

test("with no AI nothing is asked; free translations given first mean the AI isn't asked for them", async () => {
  const none = createTranslator({ texts: lines(5) });
  none.want(0);
  await idle(none);
  assert.equal(none.known(), 0);

  const ai = fakeAi();
  const tr = createTranslator({
    texts: lines(5), ask: ai,
    before: async (t) => { await settle(); t.give(["one", "", "three", "four", "five"]); },
  });
  tr.want(0);
  await idle(tr);
  assert.deepEqual(ai.calls, [["línea 1"]], "only the line the source had nothing for");
  assert.equal(tr.textAt(0), "one");
  assert.equal(tr.textAt(1), "EN línea 1");
});

// ---------- a YouTube video's own captions ----------

test("a source's own lines go under the transcript line they overlap most", () => {
  const segs = [{ start: 0, end: 2 }, { start: 2, end: 5 }, { start: 5, end: 9 }, { start: 20, end: 22 }];
  const own = [
    { start: 0.1, end: 1.8, text: "Hello" },
    { start: 1.9, end: 4.5, text: "how are you" },   // mostly in the second
    { start: 4.6, end: 5.2, text: "today?" },        // more in the second than the third
    { start: 6, end: 8, text: "Fine." },
    { start: 12, end: 13, text: "(silence)" },       // between lines: the one before
  ];
  assert.deepEqual(alignLines(segs, own), ["Hello", "how are you today?", "Fine. (silence)", ""]);
  assert.deepEqual(alignLines([], own), []);
  assert.deepEqual(alignLines(segs, []), ["", "", "", ""]);
});

// ---------- the learner's own language ----------

test("the learner's own language is found from the name written in Settings", () => {
  const code = (name) => ownLanguageCode(name, UI_LANGUAGES, LANGUAGES);
  assert.equal(code("English"), "en");
  assert.equal(code("español"), "es");
  assert.equal(code("Arabic"), "ar");
  assert.equal(code("فارسی"), "fa");
  assert.equal(code("Persian"), "fa");
  assert.equal(code("Brazilian Portuguese"), "pt");
  assert.equal(code("Portuguese"), "pt");
  assert.equal(code("Klingon"), "", "unknown: its lines find their own direction");
  assert.equal(code(""), "");
  assert.equal(UI_LANGUAGES.ar.dir, "rtl", "right-to-left languages are known as such");
  assert.equal(UI_LANGUAGES.fa.dir, "rtl");
});

// ---------- the players ----------

test("the players have the switch, and the translation lines are never words to tap", () => {
  const line = read("web/js/components/dualline.js");
  assert.ok(ICON_NAMES.includes("dualsubs"), "a line icon of its own");
  assert.match(line, /el\.setAttribute\("translate", "no"\)/, "left alone by the page's own translation");
  assert.match(line, /el\.dir = own\.dir/, "each line has its own direction");
  assert.doesNotMatch(line, /className = "w"|class="w"|classList\.add\("w"\)/, "never a .w word (those are tapped and counted as seen)");
  assert.match(line, /settingsHref\("words", "key"\)/, "no key: the way to Settings → Word definitions");
  for (const page of ["web/js/pages/player.js", "web/js/pages/reels.js"]) {
    const src = read(page);
    assert.match(src, /dualButton\(/, `${page}: the button`);
    assert.match(src, /setDual\(dualOn\(\)\)/, `${page}: on again where it was left on`);
    assert.match(src, /setDualOn\(on\)/, `${page}: a press is remembered`);
    assert.match(src, /explainDual\(/, `${page}: with nothing to translate with, it says what is needed`);
  }
  const player = read("web/js/pages/player.js");
  assert.match(player, /youTubeTranslations/, "YouTube's own captions in the learner's language first");
  assert.match(player, /"cap-tr"/, "the captions on and under videos get theirs too");
  const css = read("web/css/app.css");
  assert.match(css, /\.seg-tr, \.cap-tr \{ display: none; \}/, "hidden while switched off");
  assert.match(css, /\.transcript \.seg-tr \{[^}]*user-select: none/, "never selected with the words");
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/dualsubs.js", "js/dualstore.js", "js/components/dualline.js"]) assert.ok(build.includes(`"${f}"`), `${f} is in the phone build`);
});
