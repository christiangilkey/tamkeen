// The grammar courses' pure part: which course a learner gets, the lessons' little markup, the checks a
// course must pass, the learner's progress, and how a lesson is put into another language with the
// learner's own AI key. No screen code: tests/js/grammar.test.mjs and tools/grammar/build.mjs use it
// as it is. tools/grammar/README.md says what a course is and why it is made this way.
//
// A course is named "<from>-<to>": the language its explanations are in, then the language it teaches
// ("en-ar": Arabic, explained in English). In a lesson, the language taught is in an example's `t` and
// `r`, a mistake's `wrong` and `right`, an "order" question's `words` and `also`, a "say" question's
// `answer` and `r`, and inside {{ }} in any other text. Everything else is in the explanation language.
// Readings of the choices a learner taps (optional): a "fill" question's `r` (its sentence's reading, with
// ___) and `rs` (one reading per option), an "order" question's `rs` (one per word), and a dialogue
// reply's `rs` (one per option). Shown under the choices when readings are on; never translated.
// Likewise a mistake's `rw` and `rr`: the readings of its `wrong` and `right`.

export const GRAMMAR_BASE = "https://christiangilkey.github.io/tamkeen/grammar/";
const SITE_HOST = "christiangilkey.github.io";
export const LEVELS = ["A1", "A2", "B1"];
export const PRACTICE_TYPES = ["choice", "fill", "order", "dialogue", "say", "free"];
export const BLOCKS = ["goal", "p", "term", "ex", "dialog", "table", "tip"];

/** Where grammar file `name` ("index.json", "en-ar/course.json") is fetched from: the computer asks
 * its own server (app/grammar.py), the web app (on the same website) its own path, the phones the site. */
export function grammarUrl(name, { platform = "", host = "" } = {}) {
  if (platform === "desktop") return `/api/grammar/${name}`;
  if (host === SITE_HOST) return `/tamkeen/grammar/${name}`;
  return GRAMMAR_BASE + name;
}

/**
 * The course for someone who speaks `ui` and studies `study`, given the published list
 * (`index.courses`, keyed "<from>-<to>"). {course: the course to load, made: the language to make its
 * lessons in with the learner's AI key (null: read as it is)}, or null when there is none yet.
 *   - a ready-made course for the pair: that one;
 *   - else the English-explained course of the language studied, offered in the learner's language;
 *   - studying the language the app is shown in: the English-explained course as it is.
 */
export function courseFor(ui, study, index) {
  const have = (id) => !!(index && index.courses && index.courses[id]);
  if (!study) return null;
  if (ui && ui !== study && have(`${ui}-${study}`)) return { course: `${ui}-${study}`, made: null };
  if (study === "en") return null;
  if (!have(`en-${study}`)) return null;
  return { course: `en-${study}`, made: ui && ui !== "en" && ui !== study ? ui : null };
}

// ---------------------------------------------------------------- the markup

/**
 * Explanation text as pieces: [{kind: "text"|"target", text, reading?, bold}]. Marks: **bold** and
 * {{text}} or {{text|reading}} (a piece of the language taught). Unbalanced marks are left as text.
 */
export function parseRich(s) {
  const out = [];
  let bold = false;
  const src = String(s ?? "");
  const re = /\*\*|\{\{([^{}|]*)(?:\|([^{}]*))?\}\}/g;
  let at = 0, m;
  const boldPairs = (src.match(/\*\*/g) || []).length % 2 === 0;
  while ((m = re.exec(src))) {
    if (m.index > at) out.push({ kind: "text", text: src.slice(at, m.index), bold });
    if (m[0] === "**") {
      if (boldPairs) bold = !bold; else out.push({ kind: "text", text: "**", bold });
    } else {
      out.push({ kind: "target", text: m[1], reading: m[2] ? m[2].trim() : "", bold });
    }
    at = re.lastIndex;
  }
  if (at < src.length) out.push({ kind: "text", text: src.slice(at), bold });
  return out.filter((p) => p.text !== "" || p.kind === "target");
}

/** The {{ }} pieces in a text, exactly as written ("text" or "text|reading"), in order. */
export function targetsOf(s) {
  return [...String(s ?? "").matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]);
}

/** Explanation text as HTML: `esc` escapes text; `target(text, reading)` makes the HTML of a piece of
 * the language taught (the screen gives it its language, direction and a way to hear it). */
export function richHtml(s, esc, target) {
  return parseRich(s).map((p) => {
    const html = p.kind === "target" ? target(p.text, p.reading) : esc(p.text);
    return p.bold ? `<b>${html}</b>` : html;
  }).join("");
}

/** The text with its marks taken out (what a piece says, for checks and estimates). */
export const plainText = (s) => parseRich(s).map((p) => p.text).join("");

/** The text outside its {{ }} pieces, without spaces and punctuation ("" when it is only pieces). */
const ownWords = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join("").replace(/[\s\p{P}\p{S}]/gu, "");

/** What is wrong with the marks in one text ("" when nothing is). */
export function markProblem(s) {
  const src = String(s ?? "");
  if ((src.match(/\*\*/g) || []).length % 2) return "a ** without its pair";
  const opens = (src.match(/\{\{/g) || []).length, closes = (src.match(/\}\}/g) || []).length;
  if (opens !== closes || targetsOf(src).length !== opens) return "a {{ without its }}";
  if (/\{\{[^{}]*\{\{/.test(src)) return "{{ inside {{";
  if (targetsOf(src).some((t) => !t.split("|")[0].trim())) return "an empty {{ }}";
  if (/<\/?[a-z][^>]*>/i.test(src)) return "HTML in the text";
  return "";
}

// ---------------------------------------------------------------- the lessons' texts, by language

/**
 * Every explanation-language text of a lesson, with where it is: [{path, kind, text}]. `path` is the
 * list of keys and indexes that leads to it; `kind` says what it is (for the translator's sake). Texts
 * that are only {{ }} pieces (or nothing) are left out: there is nothing in them to translate.
 */
export function explanationTexts(lesson) {
  const out = [];
  const add = (path, kind, text) => {
    if (typeof text !== "string" || !text.trim()) return;
    if (!ownWords(text)) return; // only pieces of the language taught
    out.push({ path, kind, text });
  };
  add(["title"], "lesson title (what the learner can do)", lesson.title);
  add(["summary"], "lesson summary", lesson.summary);
  add(["topic"], "the grammar the lesson teaches", lesson.topic);
  (lesson.blocks || []).forEach((b, i) => {
    const at = (...p) => ["blocks", i, ...p];
    if ("p" in b) add(at("p"), "paragraph", b.p);
    if ("tip" in b) add(at("tip"), "tip", b.tip);
    if ("term" in b) { add(at("term"), "grammar term", b.term); add(at("means"), "what the term means", b.means); }
    if ("goal" in b && b.goal) { add(at("goal", "tr"), "translation of the lesson's goal sentence", b.goal.tr); add(at("goal", "note"), "note on the goal sentence", b.goal.note); }
    if ("ex" in b) (b.ex || []).forEach((e, k) => { add(at("ex", k, "tr"), "translation of an example", e.tr); add(at("ex", k, "note"), "note on an example", e.note); });
    if ("dialog" in b) (b.dialog || []).forEach((d, k) => { add(at("dialog", k, "who"), "name of a speaker in a dialogue", d.who); add(at("dialog", k, "tr"), "translation of a line of dialogue", d.tr); });
    if ("table" in b) (b.table || []).forEach((row, r) => (row || []).forEach((cell, c) => add(at("table", r, c), r ? "table cell" : "table heading", cell)));
  });
  (lesson.mistakes || []).forEach((m, i) => { add(["mistakes", i, "why"], "why it is a mistake", m.why); add(["mistakes", i, "tr"], "translation of the right sentence", m.tr); });
  (lesson.practice || []).forEach((q, i) => {
    const at = (...p) => ["practice", i, ...p];
    add(at("q"), "practice question", q.q);
    add(at("why"), "explanation of the answer", q.why);
    add(at("tr"), "meaning of the sentence", q.tr);
    // (only a "choice" question's options are explanation text; the others' are the language taught)
    if (q.type === "choice") (q.options || []).forEach((o, k) => add(at("options", k), "answer option", o));
    (q.lines || []).forEach((l, k) => { add(at("lines", k, "tr"), "translation of a line of dialogue", l.tr); add(at("lines", k, "why"), "explanation of a reply", l.why); });
    (q.answers || []).forEach((a, k) => add(at("answers", k, "tr"), "translation of a model answer", a.tr));
  });
  return out;
}

/** The texts in the language taught (examples, right and wrong sentences, answers, {{ }} pieces). */
export function taughtTexts(lesson) {
  const out = [];
  const add = (t) => { if (typeof t === "string" && t.trim()) out.push(t); };
  const inside = (t) => targetsOf(t).forEach((x) => add(x.split("|")[0]));
  for (const { text } of explanationTexts(lesson)) inside(text);
  for (const b of lesson.blocks || []) {
    for (const e of b.ex || []) add(e.t);
    for (const d of b.dialog || []) add(d.t);
    if (b.goal) add(b.goal.t);
  }
  for (const m of lesson.mistakes || []) { add(m.wrong); add(m.right); }
  for (const q of lesson.practice || []) {
    (q.words || []).forEach(add);
    add(q.answer && typeof q.answer === "string" ? q.answer : "");
    if (q.type === "choice") { for (const o of q.options || []) if (!ownWords(o)) inside(o); }
    else (q.options || []).forEach(add);
    if (q.type === "fill") add(String(q.t || "").replace("___", ""));
    for (const l of q.lines || []) { add(l.t); (l.options || []).forEach(add); }
    for (const a of q.answers || []) add(a.t);
  }
  return out;
}

const getAt = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);
function setAt(obj, path, value) {
  const last = path[path.length - 1];
  getAt(obj, path.slice(0, -1))[last] = value;
}

/** Do two texts have the same {{ }} pieces (the language taught, unchanged) and paired ** marks? */
export function keepsMarks(original, translated) {
  if (typeof translated !== "string" || !translated.trim() || markProblem(translated)) return false;
  const a = targetsOf(original).sort(), b = targetsOf(translated).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * The lesson with its explanation texts replaced by `translated` (in explanationTexts' order). A text
 * that lost or changed a {{ }} piece is kept as it was. Resolves to {lesson, kept: [indexes kept]}.
 */
export function withTexts(lesson, translated) {
  const copy = JSON.parse(JSON.stringify(lesson));
  const kept = [];
  explanationTexts(lesson).forEach((item, i) => {
    const t = translated[i];
    if (keepsMarks(item.text, t)) setAt(copy, item.path, t.trim());
    else kept.push(i);
  });
  return { lesson: copy, kept };
}

// ---------------------------------------------------------------- putting a lesson into another language

/** Texts in groups of at most `max` characters (one request each), keeping their order. */
export function groups(items, max = 3500) {
  const out = [];
  let cur = [], size = 0;
  for (const it of items) {
    const n = it.text.length + 40;
    if (cur.length && size + n > max) { out.push(cur); cur = []; size = 0; }
    cur.push(it);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

export const TRANSLATION_SCHEMA = {
  type: "object",
  properties: { texts: { type: "array", items: { type: "string" }, description: "The translations, in the same order." } },
  required: ["texts"],
  additionalProperties: false,
};

/**
 * The request that puts some of a lesson's texts into the learner's language. `names`: {from: the
 * explanations' language ("English"), into: the learner's ("Chinese"), taught: the language the course
 * teaches ("Arabic")}. `items`: [{kind, text}]. The answer is {texts: [...]} in the same order.
 */
export function translationPrompt(names, items, { lesson = "" } = {}) {
  const { from, into, taught } = names;
  const system = [
    `You translate a ${taught} grammar course for beginners from ${from} into ${into}. The learner speaks ${into}, not ${from}, and is learning ${taught}.`,
    `Translate each text into clear, simple, natural ${into}, the way a good teacher would explain to a beginner. Keep the meaning and the level exactly; do not add or drop information.`,
    `Copy everything inside {{ }} exactly as it is, character for character, including any "|" and what follows it: it is ${taught}, which the learner is learning. Keep **double asterisks** around the same words as in the original.`,
    `Grammar words (noun, verb, subject...) become the usual simple ${into} words for them.`,
    `Where a text compares ${taught} with ${from}, or uses a ${from} word as an example of an idea, compare with ${into} instead and give a ${into} example, if that is accurate; if the comparison would not hold for ${into}, leave it out. Translations of ${taught} examples become natural ${into}.`,
    `Answer with JSON: {"texts": [...]}, exactly one translation per text, in the same order.`,
  ].join("\n");
  const user = `${lesson ? `Lesson: ${lesson}\n` : ""}Texts (${items.length}):\n${JSON.stringify(items.map((it, i) => ({ n: i + 1, kind: it.kind, text: it.text })), null, 0)}`;
  return { system, user, schema: TRANSLATION_SCHEMA, maxTokens: 8000 };
}

/** The course list's own texts (unit names, lesson titles and summaries), for one cheap request when the
 * learner turns on "make the lessons in my language", so the list itself is in that language. */
export function listTexts(course) {
  const out = [];
  out.push({ path: ["title"], kind: "course title", text: course.title });
  if (course.about) out.push({ path: ["about"], kind: "course description", text: course.about });
  (course.units || []).forEach((u, i) => out.push({ path: ["units", i, "title"], kind: "unit name", text: u.title }));
  (course.lessons || []).forEach((l, i) => {
    out.push({ path: ["lessons", i, "title"], kind: "lesson title", text: l.title });
    if (l.summary) out.push({ path: ["lessons", i, "summary"], kind: "lesson summary", text: l.summary });
  });
  return out.filter((it) => typeof it.text === "string" && it.text.trim());
}

/** The course list with its texts replaced (listTexts' order); as withTexts, a text that broke its marks stays. */
export function withListTexts(course, translated) {
  const copy = JSON.parse(JSON.stringify({ title: course.title, about: course.about, units: course.units,
    lessons: (course.lessons || []).map((l) => ({ id: l.id, v: l.v, title: l.title, summary: l.summary })) }));
  listTexts(course).forEach((it, i) => { if (keepsMarks(it.text, translated[i])) setAt(copy, it.path, translated[i].trim()); });
  return copy;
}

/**
 * Translate `items` ([{kind, text}]) with `ask` (a prompt → the AI's JSON answer: define-service.js
 * askAi), a group at a time. A text whose {{ }} pieces or ** marks didn't survive is asked for once more
 * on its own; if it still doesn't, its place holds null (the caller keeps the original). `onStep(done,
 * of)` after each request. Resolves to the texts, in order.
 */
export async function translateTexts(items, { names, ask, lesson = "", onStep = () => {} }) {
  const parts = groups(items);
  const out = [];
  let step = 0;
  const askFor = async (part) => {
    const answer = await ask(translationPrompt(names, part, { lesson }));
    const texts = answer && Array.isArray(answer.texts) ? answer.texts : [];
    return part.map((it, i) => (keepsMarks(it.text, texts[i]) ? String(texts[i]).trim() : null));
  };
  for (const part of parts) {
    const texts = await askFor(part);
    onStep(++step, parts.length);
    const broken = texts.map((t, i) => (t === null ? i : -1)).filter((i) => i >= 0);
    if (broken.length) {
      try {
        const again = await askFor(broken.map((i) => part[i]));
        broken.forEach((i, k) => { if (again[k] !== null) texts[i] = again[k]; });
      } catch { /* those few stay in the original */ }
    }
    out.push(...texts);
  }
  return out;
}

/** A lesson made in another language (translateTexts on its explanation texts): {lesson, kept}. */
export async function makeLesson(lesson, opts) {
  const texts = await translateTexts(explanationTexts(lesson), { ...opts, lesson: plainText(lesson.title) });
  return withTexts(lesson, texts);
}

/** The course list made in another language (one or two requests). */
export async function makeList(course, opts) {
  const texts = await translateTexts(listTexts(course), { ...opts, lesson: "" });
  return withListTexts(course, texts);
}

/** A fingerprint of the course list's own texts: a list made from an older one is made again. */
export const listVersion = (course) => lessonVersion({ list: listTexts(course).map((t) => t.text) });

/** Roughly what making every lesson costs with `model` ({in, out}: US cents per million tokens, as in
 * definer.js PROVIDERS), in US cents. Text reads at about 4 characters a token in English; the answer
 * in a language written in another script takes about twice as many tokens. */
export function costCents(course, model, into = "") {
  if (!model) return null;
  let chars = 0;
  for (const l of course.lessons || []) for (const it of explanationTexts(l)) chars += it.text.length;
  const requests = Math.max(1, Math.ceil(chars / 3500));
  const tokensIn = chars / 4 + requests * 700; // (the instructions, again in each request)
  const outFactor = /^(en|es|fr|it|pt|ca|de|tl|ceb)$/.test(into) ? 1.1 : 2;
  const tokensOut = (chars / 4) * outFactor;
  return (tokensIn * model.in + tokensOut * model.out) / 1e6;
}

// ---------------------------------------------------------------- versions

/** A short fingerprint of a lesson's content: a lesson made in another language from an older version
 * is made again. (FNV-1a over its JSON; stable across devices.) */
export function lessonVersion(lesson) {
  const { v, ...rest } = lesson || {};
  const s = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ---------------------------------------------------------------- progress

/** The setting as it should be kept: {"<course>/<lesson id>": {at, right, of}}, nothing else. */
export function cleanProgress(raw) {
  let value = raw;
  if (typeof value === "string") { try { value = JSON.parse(value || "{}"); } catch { value = {}; } }
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, rec] of Object.entries(value)) {
    if (!/^[a-z]{2,3}-[a-z]{2,3}\/[a-z0-9-]{1,60}$/.test(key) || !rec || typeof rec !== "object") continue;
    const at = Math.trunc(Number(rec.at) || 0);
    if (at <= 0) continue;
    const of = Math.max(0, Math.min(50, Math.trunc(Number(rec.of) || 0)));
    const right = Math.max(0, Math.min(of, Math.trunc(Number(rec.right) || 0)));
    out[key] = { at, right, of };
  }
  return out;
}

/** Two devices' progress as one: for each lesson, the finish made last wins (the same on both sides,
 * app/grammar.py merge_progress is the twin). */
export function mergeProgress(mine, theirs) {
  const a = cleanProgress(mine), b = cleanProgress(theirs);
  const out = { ...a };
  for (const [key, rec] of Object.entries(b)) {
    const m = out[key];
    if (!m || rec.at > m.at || (rec.at === m.at && (rec.right > m.right || (rec.right === m.right && rec.of > m.of)))) out[key] = rec;
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

/** The progress with lesson `key` finished now (`now` in ms), `right` answers right out of `of`. */
export function finished(progress, key, right, of, now = Date.now()) {
  return { ...cleanProgress(progress), [key]: { at: Math.floor(now / 1000), right, of } };
}

/** How far the learner has got in `course` (whose id is `id`): {done: Set of lesson ids, count, total,
 * next: the first lesson not done (or null), units: [{n, title, lessons, done}]}. */
export function progressOf(course, id, progress) {
  const p = cleanProgress(progress);
  const lessons = (course && course.lessons) || [];
  const done = new Set(lessons.filter((l) => p[`${id}/${l.id}`]).map((l) => l.id));
  const units = ((course && course.units) || []).map((u) => {
    const ls = lessons.filter((l) => l.unit === u.n);
    return { n: u.n, title: u.title, lessons: ls, done: ls.filter((l) => done.has(l.id)).length };
  });
  return { done, count: done.size, total: lessons.length, next: lessons.find((l) => !done.has(l.id)) || null, units };
}

// ---------------------------------------------------------------- mixed review (spaced retrieval)

/**
 * Questions for a mixed review of lessons already done: [{lesson, q}], up to `count`. Lessons finished
 * longest ago, and those with more wrong answers, come up most; never two questions from the same
 * lesson in a row; the same pick all day (`now` in ms: the day is the seed), so leaving and coming back
 * shows the same review. "Your turn" questions are left out (they need the lesson's context).
 */
export function reviewQuestions(course, id, progress, { now = Date.now(), count = 8 } = {}) {
  const p = cleanProgress(progress);
  const day = Math.floor(now / 86400000);
  let seed = (day * 2654435761) >>> 0;
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
  const done = (course.lessons || []).filter((l) => p[`${id}/${l.id}`]);
  if (!done.length) return [];
  const weight = (l) => {
    const rec = p[`${id}/${l.id}`];
    const days = Math.max(0, now / 1000 - rec.at) / 86400;
    const missed = rec.of ? 1 - rec.right / rec.of : 0;
    return 1 + Math.min(days, 30) / 3 + missed * 4;
  };
  const pool = done.map((l) => ({ l, w: weight(l), qs: (l.practice || []).filter((q) => q.type !== "free") }))
    .filter((x) => x.qs.length);
  const out = [];
  let last = null;
  for (let guard = 0; out.length < count && guard < count * 20 && pool.length; guard++) {
    const choices = pool.filter((x) => x.l !== last || pool.length === 1);
    const total = choices.reduce((s, x) => s + x.w, 0);
    let r = rand() * total, pick = choices[0];
    for (const x of choices) { r -= x.w; if (r <= 0) { pick = x; break; } }
    const q = pick.qs.splice(Math.floor(rand() * pick.qs.length), 1)[0];
    out.push({ lesson: pick.l.id, q });
    last = pick.l;
    pick.w /= 2;
    if (!pick.qs.length) pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

// ---------------------------------------------------------------- "your turn": the AI's look at the learner's sentence

export const CHECK_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", description: "true if the sentence is correct and natural for what was asked" },
    corrected: { type: "string", description: "the learner's sentence corrected (the same sentence when it is already right)" },
    note: { type: "string", description: "one or two short, friendly sentences explaining what was wrong, or praising what was right" },
  },
  required: ["ok", "corrected", "note"],
  additionalProperties: false,
};

/** The request asking the learner's AI whether their own sentence for a "your turn" question is right.
 * `names`: {explain: the language to explain in, taught}. */
export function checkPrompt(names, { topic, question, models, answer, variety = "" }) {
  const system = [
    `You are a patient ${names.taught} teacher. A beginner has just learned: ${topic}.`,
    `They answered a practice question with their own ${names.taught} sentence. Check it${variety ? ` (${variety})` : ""}: is it correct and natural for what the question asks?`,
    `Be encouraging. Small spelling slips count as mistakes only if they change the word. Don't demand vowel marks or accents that are often left out in writing.`,
    `In "corrected", give the learner's sentence corrected, changing as little as possible (or the same sentence if it is right). In "note", explain in ${names.explain}, in one or two short sentences.`,
  ].join("\n");
  const user = `Question: ${plainText(question)}\nModel answers: ${models.join(" / ")}\nThe learner's answer: ${answer}`;
  return { system, user, schema: CHECK_SCHEMA };
}

// ---------------------------------------------------------------- practice

/** The words of an "order" question in a shuffled order that isn't already a right answer (the same
 * every time for the same question, so redrawing the screen doesn't reshuffle it). */
export function shuffled(q) {
  const words = [...(q.words || [])];
  let seed = 0;
  for (const ch of words.join("\u0000")) seed = (Math.imul(seed, 31) + ch.codePointAt(0)) >>> 0;
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
  const idx = words.map((_, i) => i);
  for (let tries = 0; tries < 20; tries++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (!orderIsRight(q, idx.map((i) => words[i])) || words.length < 2) break;
  }
  return idx.map((i) => ({ i, word: words[i] }));
}

/** The order to show a question's options in (indexes into `options`): mixed, so the right one isn't
 * always in the place the lesson wrote it, and the same every time for the same options. */
export function optionOrder(options) {
  const list = (options || []).map(String);
  let seed = 7;
  for (const ch of list.join("\u0000")) seed = (Math.imul(seed, 31) + ch.codePointAt(0)) >>> 0;
  const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
  const idx = list.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

/** Is `picked` (the words in the order the learner put them) a right answer to an "order" question? */
export function orderIsRight(q, picked) {
  const same = (a) => a.length === picked.length && a.every((w, i) => w === picked[i]);
  return same(q.words || []) || (q.also || []).some(same);
}

// ---------------------------------------------------------------- the checks a course must pass

const ARABIC_LETTER = /[ء-ي]/;
const ARABIC_MARK = /[ً-ْٰ]/;
/** Words of an Arabic text with no vowel mark at all (a word of one letter, or a lone و/ف/ب/ل joined to
 * nothing, is fine; so is a word written only with long-vowel letters like "لا"). */
export function unvowelled(text) {
  return String(text ?? "").split(/[\s.,،؛:!?؟«»"“”()\-–—…]+/).filter((w) => {
    const letters = w.replace(/[^ء-ي]/g, "");
    if (letters.length < 2 || !ARABIC_LETTER.test(w)) return false;
    if (/^(لا|يا|ما|ذا)$/.test(letters)) return false;
    return !ARABIC_MARK.test(w);
  });
}

/**
 * What is wrong with a course: a list of plain sentences ("lesson nouns-the: an example without its
 * translation"), empty when nothing is. The rules are tools/grammar/README.md's.
 */
export function checkCourse(course, { languages = null } = {}) {
  const bad = [];
  const say = (where, what) => bad.push(`${where}: ${what}`);
  if (!course || typeof course !== "object") return ["not a course"];
  const code = /^[a-z]{2,3}$/;
  if (!code.test(course.from || "") || !code.test(course.to || "") || course.from === course.to) say("course", "from and to must be two different language codes");
  if (languages && (!languages.includes(course.from) || !languages.includes(course.to))) say("course", "a language the app doesn't know");
  for (const k of ["title", "about"]) if (!String(course[k] || "").trim()) say("course", `no ${k}`);
  const units = course.units || [];
  if (!units.length) say("course", "no units");
  units.forEach((u, i) => {
    if (u.n !== i + 1) say(`unit ${i + 1}`, `numbered ${u.n}`);
    if (!String(u.title || "").trim()) say(`unit ${i + 1}`, "no title");
  });
  const lessons = course.lessons || [];
  if (!lessons.length) say("course", "no lessons");
  const ids = new Set(), terms = new Map();
  let lastUnit = 1, lastLevel = 0;
  const arabic = course.to === "ar";
  const readings = !!course.reading;

  lessons.forEach((l, li) => {
    const where = `lesson ${li + 1} (${l.id || "no id"})`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.id || "") || l.id.length > 60) say(where, "the id must be short, lowercase words joined by -");
    if (ids.has(l.id)) say(where, "the same id as another lesson");
    ids.add(l.id);
    if (!units.some((u) => u.n === l.unit)) say(where, `unit ${l.unit} doesn't exist`);
    if (l.unit < lastUnit) say(where, "its unit comes before the previous lesson's");
    lastUnit = l.unit;
    const level = LEVELS.indexOf(l.level);
    if (level < 0) say(where, `level must be one of ${LEVELS.join(", ")}`);
    if (level < lastLevel) say(where, "its level is lower than the lesson before");
    lastLevel = Math.max(lastLevel, level);
    for (const k of ["title", "summary", "topic"]) if (!String(l[k] || "").trim()) say(where, `no ${k}`);

    const texts = explanationTexts(l);
    for (const t of texts) { const p = markProblem(t.text); if (p) say(where, `${p} in ${t.kind} “${t.text.slice(0, 40)}”`); }
    const sentence = (x, what) => {
      if (!x || !String(x.t || "").trim() || !String(x.tr || "").trim()) { say(where, `${what} without its text or translation (“${(x && (x.t || x.tr)) || ""}”)`); return; }
      if (readings && !String(x.r || "").trim()) say(where, `${what} “${x.t}” has no reading`);
      if (/\{\{|\*\*/.test(x.t)) say(where, `marks inside ${what} “${x.t}”`);
    };

    // PURPOSE first: the lesson opens with the sentence the learner will be able to say.
    const blocks = l.blocks || [];
    if (!blocks.length || !blocks[0].goal) say(where, "the first block must be its goal sentence ({\"goal\": {t, r, tr}})");
    if (blocks.filter((b) => b.goal).length > 1) say(where, "more than one goal sentence");
    if (!blocks.some((b) => "p" in b)) say(where, "no paragraph");
    let examples = 0;
    blocks.forEach((b, bi) => {
      const kinds = BLOCKS.filter((k) => k in b);
      if (kinds.length !== 1) { say(where, `block ${bi + 1} must be one of ${BLOCKS.join(", ")}`); return; }
      if (b.goal !== undefined) sentence(b.goal, "the goal sentence");
      if (b.term !== undefined) {
        if (!String(b.term).trim() || !String(b.means || "").trim()) say(where, `block ${bi + 1}: a term needs its meaning`);
        const key = plainText(b.term).trim().toLowerCase();
        if (terms.has(key)) say(where, `the term “${b.term}” was already explained in ${terms.get(key)}`);
        terms.set(key, l.id);
      }
      if (b.ex !== undefined) {
        if (!Array.isArray(b.ex) || !b.ex.length) say(where, `block ${bi + 1}: no examples`);
        for (const e of b.ex || []) { examples++; sentence(e, "an example"); }
      }
      if (b.dialog !== undefined) {
        if (!Array.isArray(b.dialog) || b.dialog.length < 2) say(where, `block ${bi + 1}: a dialogue needs at least two lines`);
        for (const d of b.dialog || []) {
          if (!String(d.who || "").trim()) say(where, "a line of dialogue without its speaker (who)");
          sentence(d, "a line of dialogue");
        }
      }
      if (b.table !== undefined) {
        if (!Array.isArray(b.table) || b.table.length < 2) say(where, `block ${bi + 1}: a table needs a heading row and at least one row`);
        const width = (b.table[0] || []).length;
        if ((b.table || []).some((row) => !Array.isArray(row) || row.length !== width)) say(where, `block ${bi + 1}: the table's rows aren't all ${width} cells`);
      }
    });
    if (examples < 3) say(where, `only ${examples} examples (at least 3)`);

    // CONTRAST: the mistakes to watch for.
    for (const m of l.mistakes || []) {
      if (!String(m.wrong || "").trim() || !String(m.right || "").trim() || !String(m.why || "").trim()) say(where, "a mistake needs wrong, right and why");
      if (m.wrong === m.right) say(where, `a mistake whose wrong and right are the same (“${m.wrong}”)`);
    }
    if (!(l.mistakes || []).length) say(where, "no common mistakes");

    // APPLICATION: practice that ends with the learner's own sentence, and brings old grammar back.
    const practice = l.practice || [];
    if (practice.length < 4 || practice.length > 8) say(where, `${practice.length} practice questions (4 to 8)`);
    if (!practice.some((q) => q.type === "fill" || q.type === "order" || q.type === "dialogue")) say(where, "no practice where the learner builds a sentence (fill, order or dialogue)");
    if (!practice.some((q) => q.type === "free")) say(where, "no “your turn” question (free), where the learner says something of their own");
    if (li >= 3 && !practice.some((q) => q.from)) say(where, "no question that brings back an earlier lesson's grammar (\"from\": an earlier lesson's id)");
    practice.forEach((q, qi) => {
      const at = `${where}, practice ${qi + 1}`;
      if (!PRACTICE_TYPES.includes(q.type)) { say(at, `type must be one of ${PRACTICE_TYPES.join(", ")}`); return; }
      if (!String(q.q || "").trim()) say(at, "no question");
      if (q.from !== undefined && !lessons.slice(0, li).some((x) => x.id === q.from)) say(at, `"from": “${q.from}” isn't an earlier lesson`);
      const options = (n, min = 2) => {
        const list = q.options || [];
        if (list.length < min || list.length > 4) say(at, `${list.length} options (${min} to 4)`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= list.length) say(at, "the answer isn't one of the options");
        if (new Set(list).size !== list.length) say(at, "two options are the same");
      };
      // Readings of the choices (optional): one non-empty reading for each.
      const readingsOf = (list, rs, what) => {
        if (rs === undefined) return;
        if (!Array.isArray(rs) || rs.length !== (list || []).length || rs.some((x) => !String(x || "").trim())) say(at, `${what}: rs must give one reading for each, in the same order`);
      };
      if (q.type === "choice") {
        options();
        if (!String(q.why || "").trim()) say(at, "no why");
      }
      if (q.type === "fill") {
        if ((String(q.t || "").match(/___/g) || []).length !== 1) say(at, "the sentence (t) must have exactly one gap: ___");
        if (!String(q.tr || "").trim()) say(at, "no translation (tr) of the sentence");
        options();
        if ((q.options || []).some((o) => /\{\{|\*\*/.test(o))) say(at, "a fill option is the language taught itself: no {{ }} marks");
        if (q.r !== undefined && (String(q.r).match(/___/g) || []).length !== 1) say(at, "the sentence's reading (r) must have exactly one gap: ___");
        readingsOf(q.options, q.rs, "the options");
        if (!String(q.why || "").trim()) say(at, "no why");
      }
      if (q.type === "order") {
        const words = q.words || [];
        if (words.length < 2 || words.length > 9) say(at, `${words.length} words to put in order (2 to 9)`);
        if (words.some((w) => !String(w).trim() || String(w).trim().split(/\s+/).length > 3)) say(at, "a word to order that is empty or longer than three words");
        if (!String(q.tr || "").trim()) say(at, "no meaning (tr) for the sentence to build");
        const sorted = (a) => [...a].sort().join("\u0000");
        for (const alt of q.also || []) if (sorted(alt) !== sorted(words)) say(at, "an other right order that doesn't use the same words");
        if (new Set(words).size !== words.length) say(at, "the same word twice (the learner couldn't tell which goes where)");
        readingsOf(words, q.rs, "the words");
      }
      if (q.type === "say") {
        if (!String(q.answer || "").trim()) say(at, "no answer");
        if (readings && !String(q.r || "").trim()) say(at, "the answer has no reading");
      }
      if (q.type === "dialogue") {
        const lines = q.lines || [];
        if (lines.length < 3) say(at, "a dialogue needs at least three lines");
        if (!lines.some((x) => x.options)) say(at, "no line where the learner chooses their reply (options)");
        for (const x of lines) {
          if (x.options) {
            if (x.options.length < 2 || x.options.length > 4 || new Set(x.options).size !== x.options.length) say(at, "a reply needs 2 to 4 different options");
            if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer >= x.options.length) say(at, "a reply's answer isn't one of its options");
            if (!String(x.why || "").trim()) say(at, "a reply without its why");
            readingsOf(x.options, x.rs, "a reply's options");
          } else {
            if (!String(x.who || "").trim()) say(at, "a line without its speaker (who)");
            sentence(x, "a line of the dialogue");
          }
        }
      }
      if (q.type === "free") {
        const answers = q.answers || [];
        if (!answers.length) say(at, "no model answers");
        for (const a of answers) sentence(a, "a model answer");
      }
    });

    if (arabic) {
      for (const t of taughtTexts(l)) {
        const missing = unvowelled(t);
        if (missing.length) say(where, `Arabic without vowel marks: ${missing.join(" ")} (in “${t}”)`);
      }
    }
  });
  return bad;
}
