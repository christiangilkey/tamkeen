// Dual subtitles: under every line of the language being learned, its translation into the learner's own
// language (the one words are explained in: Settings → Word definitions). The owner: "a togglable dual
// subtitle button that shows my native language translation after every line of my target language".
//
// Where the translations come from:
//   - free, where the source has them: a YouTube video's own captions in the learner's language (YouTube's
//     own track, or YouTube's translation of it, as its player offers), matched to the lines by time;
//   - else the learner's own AI key (define-service.js askAi), asked for a batch of lines at a time, the
//     lines near where the learner is first (never a whole two-hour podcast at once).
// Every translation is kept on the device (dualstore.js, IndexedDB), per item and language, by the line's
// own text, so a line is never asked for twice, and a line put right in the transcript is asked again.
//
// Pure logic (no page, no app imports), so it is tested in tests/js/dualsubs.test.mjs; the button and the
// drawing are components/dualline.js, used by pages/player.js and pages/reels.js.

import { jsonIn } from "./addwords.js";

/** Kept on this device ("1" when on). */
export const DUAL_KEY = "dualSubs";

const local = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/** Is the translation under each line switched on (on this device)? */
export function dualOn(ls = local()) {
  try { return !!ls && ls.getItem(DUAL_KEY) === "1"; } catch { return false; }
}

/** Switch it on or off (remembered on this device). */
export function setDualOn(on, ls = local()) {
  try { if (ls) { if (on) ls.setItem(DUAL_KEY, "1"); else ls.removeItem(DUAL_KEY); } } catch { /* storage off */ }
}

/** Lines asked for in one request; how far ahead of where the learner is they are wanted; how many
 * lines before it (a seek back by a line or two finds them there). */
export const BATCH = 20;
export const AHEAD = 40;
export const BEHIND = 3;

/** Has `text` any letters to translate? ("♪", "...", "[ 00:12 ]" have none: they stay without a line.) */
export const hasWords = (text) => /\p{L}/u.test(String(text ?? ""));

export const TRANSLATE_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      description: "One entry per line, in the order given.",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "The line's number, as given." },
          text: { type: "string", description: "The line translated." },
        },
        required: ["n", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
};

/**
 * The request for translating `texts` (the lines, in order) from `study` into `speaks` (language names in
 * English): {system, user, schema, maxTokens}, for define-service.js askAi.
 */
export function translatePrompt(texts, { study = "Arabic", speaks = "English" } = {}) {
  const system = `You translate the subtitles of ${study} audio and video for a learner whose own language is ${speaks}.
You get numbered lines in the order they are said. A line may be a whole sentence or only a piece of one.
Translate every line into natural, everyday ${speaks}: its meaning and tone (casual stays casual, slang stays slang), never word for word.
Translate each line on its own line: never move words to another line, join lines, split one or leave one out, so each translation belongs under its own line. Use the lines around it to understand it.
Keep people's and places' names as they are. Write only the translation: no notes, no explanations, no quotation marks round it, no transliteration.
Answer with JSON only: {"lines": [{"n": 1, "text": "..."}, ...]}, one entry per line, with the numbers given.`;
  const user = (texts || []).map((s, i) => `${i + 1}. ${String(s ?? "").replace(/\s+/g, " ").trim()}`).join("\n");
  const chars = (texts || []).reduce((sum, s) => sum + String(s ?? "").length, 0);
  return { system, user, schema: TRANSLATE_SCHEMA, maxTokens: Math.min(8000, Math.max(1500, 600 + chars * 4)) };
}

const tidy = (v) => String(v ?? "").replace(/\s+/g, " ").trim().replace(/^["“”«»„]+|["“”«»„]+$/g, "").trim().slice(0, 1000);

/**
 * The answer to translatePrompt, matched to its `count` lines: a list of `count` strings ("" where the
 * answer had nothing for a line). `answer` is the parsed JSON or the model's text. Entries are matched by
 * their number; ones without a usable number take their place in the order. A bare list of strings works
 * too.
 */
export function readTranslations(answer, count) {
  let data = typeof answer === "string" ? jsonIn(answer) : answer;
  if (data && !Array.isArray(data) && typeof data === "object") {
    data = Array.isArray(data.lines) ? data.lines : Array.isArray(data.translations) ? data.translations
      : Array.isArray(data.items) ? data.items : null;
  }
  const list = (Array.isArray(data) ? data : []).filter((e) => typeof e === "string" || (e && typeof e === "object"));
  const out = Array.from({ length: Math.max(0, count | 0) }, () => "");
  const textOf = (e) => (typeof e === "string" ? e : e.text ?? e.translation ?? "");
  const numberOf = (e) => (typeof e === "string" ? NaN : Number(e.n ?? e.line ?? e.number));
  const numbers = list.map(numberOf).filter(Number.isInteger);
  // (numbered from 0 by a model that forgot the request's numbering)
  const shift = numbers.length && Math.min(...numbers) === 0 && Math.max(...numbers) < out.length ? 1 : 0;
  const loose = [];
  for (const e of list) {
    const n = numberOf(e) + shift;
    if (Number.isInteger(n) && n >= 1 && n <= out.length && !out[n - 1]) out[n - 1] = tidy(textOf(e));
    else if (!Number.isInteger(n)) loose.push(textOf(e));
  }
  // Entries without numbers take the places still empty, in order (the model left the numbers out).
  let k = 0;
  for (let i = 0; i < out.length && k < loose.length; i++) if (!out[i]) out[i] = tidy(loose[k++]);
  return out;
}

/**
 * The lines to ask for next (their positions, in order), or [] when nothing near the learner is missing.
 * `count` lines; `has(i)`: line i has its translation (or needs none); `focus`: the line the learner is at.
 * A batch is asked for once a line missing its translation is within half of `ahead` lines after `focus`
 * (or `behind` lines before it); it is then up to `size` missing lines from there on, so the requests are
 * full ones and the translations stay ahead of the learner.
 */
export function pickBatch({ count, has, focus = 0, size = BATCH, ahead = AHEAD, behind = BEHIND }) {
  const n = Math.max(0, count | 0);
  if (!n) return [];
  const at = Math.max(0, Math.min(n - 1, Math.floor(Number(focus) || 0)));
  const from = Math.max(0, at - behind);
  const trigger = Math.min(n, at + Math.ceil(ahead / 2) + 1);
  let first = -1;
  for (let i = from; i < trigger; i++) if (!has(i)) { first = i; break; }
  if (first < 0) return [];
  const out = [];
  const stop = Math.min(n, Math.max(at + ahead, first + size) + 1);
  for (let i = first; i < stop && out.length < size; i++) if (!has(i)) out.push(i);
  return out;
}

/**
 * A source's own lines in the learner's language (YouTube's track: [{start, end, text}]) put under the
 * transcript's lines (`segments`: [{start, end}], in order): a list with each segment's translation ("" for
 * one none of them belongs to). Each of the source's lines goes under the segment it overlaps most (or, if
 * it overlaps none, the one it starts in); several under one segment are joined.
 */
export function alignLines(segments, lines) {
  const segs = (segments || []).map((s) => ({ a: Number(s.start) || 0, b: Math.max(Number(s.end) || 0, Number(s.start) || 0) }));
  const out = segs.map(() => []);
  if (!segs.length) return [];
  // (the first segment starting after `t`)
  const after = (t) => { let lo = 0, hi = segs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].a <= t) lo = m + 1; else hi = m; } return lo; };
  for (const line of lines || []) {
    const text = tidy(line && line.text);
    if (!text) continue;
    const a = Number(line.start) || 0;
    const b = Math.max(a, Number(line.end) || a);
    let best = -1, most = 0;
    for (let k = Math.max(0, after(a) - 2); k < segs.length && segs[k].a < b + 0.001; k++) {
      const overlap = Math.min(b, segs[k].b) - Math.max(a, segs[k].a);
      if (overlap > most) { most = overlap; best = k; }
    }
    if (best < 0) best = Math.max(0, after(a) - 1);
    out[best].push(text);
  }
  return out.map((parts) => parts.join(" "));
}

/** Where one item's translations into `speaks` are kept: by the item's id shared by every device (its uid;
 * a Netflix title's number), else this device's id. */
export function translationKey(ep, speaks) {
  const own = String((ep && (ep.uid || (ep.audio_type === "video/netflix" && ep.guid))) || "") || `id:${(ep && ep.id) || ""}`;
  return `dual:${own}:${String(speaks || "English").trim().toLowerCase()}`;
}

/**
 * The code of the learner's own language, from the name written in Settings → Word definitions ("English",
 * "Español", "Brazilian Portuguese"), looked for among `names` ({code: {name, native}}, the interface's
 * languages and the ones Tamkeen teaches); "" when it isn't one of them (its lines then find their own
 * direction).
 */
export function ownLanguageCode(name, ...names) {
  const want = String(name ?? "").trim().toLowerCase();
  if (!want) return "";
  const words = (s) => s.split(/[\s()]+/).filter((x) => x.length >= 4);
  for (const table of names) {
    for (const [code, n] of Object.entries(table || {})) {
      const forms = [n && n.name, n && n.native].filter(Boolean).map((x) => String(x).toLowerCase());
      if (forms.includes(want)) return code;
    }
  }
  for (const table of names) {
    for (const [code, n] of Object.entries(table || {})) {
      const forms = [n && n.name, n && n.native].filter(Boolean).map((x) => String(x).toLowerCase());
      if (forms.some((f) => words(f).includes(want) || words(want).includes(f))) return code;
    }
  }
  return "";
}

/**
 * The translations of one item's lines. `texts`: the lines, in order. `ask(texts)` (optional: none when
 * there is no AI to ask) resolves to the AI's answer for those lines (read with readTranslations).
 * `store` ({get(key), put(key, value)}, optional) keeps them on the device under `key`. `before(translator)`
 * (optional) runs once what was kept is loaded and before the AI is asked anything (to `give` free
 * translations first). `onLines(list)` is told the positions of lines whose translation just arrived;
 * `onError(e)` of a request that failed (then nothing more is asked until `retry()`).
 * Returns {ready (a promise: what was kept is loaded, `before` has run), textAt(i), has(i), complete(),
 * known(), want(i) (the learner is at line i: ask for what is missing near it), give(list) (translations from
 * elsewhere: position -> text), retry(), stop(), busy, failed}.
 */
export function createTranslator({ texts, ask = null, store = null, key = "", size = BATCH, ahead = AHEAD, behind = BEHIND,
  before = null, onLines = () => {}, onError = () => {} }) {
  const lines = (texts || []).map((s) => String(s ?? ""));
  const known = new Map(); // a line's text -> its translation
  const tried = new Set(); // positions the AI was asked for and gave nothing: not asked again
  let focus = 0;
  let busy = false;
  let stopped = false;
  let failed = null;
  let loaded = false;
  const textAt = (i) => (i >= 0 && i < lines.length ? known.get(lines[i]) || "" : "");
  const has = (i) => !hasWords(lines[i]) || known.has(lines[i]) || tried.has(i);
  const positions = () => lines.map((_, i) => i).filter((i) => known.has(lines[i]));
  let saving = Promise.resolve();
  const save = () => {
    if (!store || !key) return saving;
    const value = { v: 1, at: Date.now(), lines: Object.fromEntries(known) };
    saving = saving.then(() => store.put(key, value)).catch(() => {});
    return saving;
  };

  async function pump() {
    if (busy || stopped || failed || !loaded || !ask) return;
    const batch = pickBatch({ count: lines.length, has, focus, size, ahead, behind });
    if (!batch.length) return;
    const unique = [...new Set(batch.map((i) => lines[i]))];
    busy = true;
    let ok = false;
    try {
      const got = readTranslations(await ask(unique), unique.length);
      if (stopped) return;
      unique.forEach((s, k) => { if (got[k]) known.set(s, got[k]); });
      const done = [];
      for (const i of batch) { if (known.has(lines[i])) done.push(i); else tried.add(i); }
      if (!done.length) throw Object.assign(new Error("no translations in the answer"), { empty: true });
      save();
      onLines(done);
      ok = true;
    } catch (e) {
      if (!stopped) { failed = e; onError(e); }
    } finally {
      busy = false;
    }
    if (ok) pump();
  }

  const self = {
    ready: null,
    textAt,
    has,
    /** Every line that needs one has its translation. */
    complete: () => lines.every((_, i) => !hasWords(lines[i]) || known.has(lines[i])),
    /** How many lines have their translation. */
    known: () => positions().length,
    want(i) { focus = Math.max(0, Number(i) || 0); pump(); },
    give(list) {
      const done = [];
      (list || []).forEach((s, i) => {
        const text = tidy(s);
        if (text && i < lines.length && hasWords(lines[i]) && !known.has(lines[i])) { known.set(lines[i], text); done.push(i); }
      });
      if (done.length) { save(); onLines(done); }
      pump();
      return done.length;
    },
    retry() { failed = null; tried.clear(); pump(); },
    stop() { stopped = true; },
    /** The last write to the store (for tests). */
    saved: () => saving,
    get busy() { return busy; },
    get failed() { return failed; },
  };
  self.ready = (async () => {
    try {
      const kept = store && key ? await store.get(key) : null;
      if (kept && kept.lines && typeof kept.lines === "object") {
        for (const [s, tr] of Object.entries(kept.lines)) if (typeof tr === "string" && tr && !known.has(s)) known.set(s, tr);
      }
    } catch { /* nothing kept here */ }
    if (stopped) return;
    const got = positions();
    if (got.length) onLines(got);
    if (before) { try { await before(self); } catch { /* the AI is asked instead */ } }
    loaded = true;
    if (!stopped) pump();
  })();
  return self;
}
