// "Add words" → Scan: words read from a photo of a list (components/wordscan.js). Its pure part, kept
// apart from the screen so it can be tested on its own (tests/js/scanwords.test.mjs). Every version has it.
//
// A photo is read one of two ways:
//   - by the learner's own AI, when it can read pictures (all four providers in Settings can): the
//     photo, made smaller, goes to it with the question below, and a strict JSON list comes back;
//   - on this device, by Tesseract (web/js/ocr.js): its lines become the text of a pasted list, which
//     goes through the same reading as "Paste a list" (addwords.js parseList).
// Either way the words then become rows of the builder exactly as a pasted list does: their meanings,
// sentences and audio are filled in by "For these cards" (cards from a photo have no recording of
// their own, so the card voice says them, like typed ones).

import { MAX_ROWS, SCRIPTS, jsonIn, wordKey } from "./addwords.js";

// ---------------------------------------------------------------- the photo

/** The longest side of the photo sent to the AI (a JPEG this size is cheap and plenty to read). */
export const AI_SIDE = 1600;
/** The longest side of the photo read on this device (Tesseract likes letters a good size). */
export const OCR_SIDE = 2400;
/** The copy shown above what was found (small, and big enough to read when tapped). */
export const THUMB_SIDE = 1400;
export const JPEG_QUALITY = 0.85;

/** A picture `width` × `height` made to fit `max` on its longest side, keeping its shape; never made
 * bigger. {width, height, scale} in whole pixels (at least 1), or zeros for no picture. */
export function fitSize(width, height, max) {
  const w = Math.round(Number(width) || 0), h = Math.round(Number(height) || 0), m = Math.floor(Number(max) || 0);
  if (w <= 0 || h <= 0 || m <= 0) return { width: 0, height: 0, scale: 0 };
  const scale = Math.min(1, m / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

// ---------------------------------------------------------------- which reader

/** The AI providers (definer.js PROVIDERS) that can be sent a picture. Claude, Gemini and OpenAI's
 * models all read images; xAI says "some" Grok models do (its newest does): if the one chosen
 * refuses the photo, it is read on this device instead (wordscan.js). */
export const VISION = { claude: true, gemini: true, openai: true, grok: true };

/**
 * Which reader reads a photo: {reader, ai, why}.
 *   reader  "ai" (the learner's AI), "device" (Tesseract here) or "none";
 *   ai      the AI could read it (set up, can see pictures, online), whichever is used;
 *   why     why it is that reader: "ai", "chosen" (the learner picked this device's reader),
 *           "aioff" (No AI in Settings), "nokey", "novision", "offline", "nodevice".
 * The AI reads both print and handwriting, so it is used whenever it can be, unless the learner chose
 * this device (`prefer` "device"). Without it, this device's reader, which needs WebAssembly (`deviceOk`).
 */
export function chooseReader({ aiOff = false, hasKey = false, provider = "", online = true, deviceOk = true, prefer = "" } = {}) {
  const canSee = !!VISION[provider];
  const ai = !aiOff && hasKey && canSee && online;
  let reader = "none";
  if (ai && (prefer !== "device" || !deviceOk)) reader = "ai";
  else if (deviceOk) reader = "device";
  const why = reader === "ai" ? "ai" : reader === "none" && !ai ? "nodevice"
    : ai ? "chosen" : aiOff ? "aioff" : !hasKey ? "nokey" : !canSee ? "novision" : !online ? "offline" : "nodevice";
  return { reader, ai, why };
}

// ---------------------------------------------------------------- reading with the AI

export const SCAN_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "The vocabulary on the page, in the page's order.",
      items: {
        type: "object",
        properties: {
          word: { type: "string", description: "The word or phrase exactly as written." },
          meaning: { type: "string" },
          sentence: { type: "string" },
          sentence_translation: { type: "string" },
        },
        required: ["word", "meaning", "sentence", "sentence_translation"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/** The question sent with the photo: {system, user, schema}; `study` is the language being learned,
 * in English ("Spanish"). The photo itself goes with it (definer.js askJson `images`). */
export function scanPrompt({ study = "Spanish" } = {}) {
  const system = `You read photos of vocabulary that a learner of ${study} wants to turn into flashcards: printed word lists, handwritten notes, textbook tables, two-column lists of words and their meanings (in either order), numbered lists, flashcards, or a single word.
For each ${study} word or phrase on the page:
"word": the word or phrase copied exactly as it is written: the same spelling, letters, vowel marks, accents, tone marks and capital letters. Never correct it, complete it, add or remove vowel marks or accents, translate it, or change it to its dictionary form.
"meaning": the meaning or translation written beside it on the page, copied as written, in whatever language it is in. If the page gives none, leave it "". Never make up a meaning that isn't on the page.
"sentence": an example sentence in ${study} written on the page for that word, copied exactly; "" if there is none.
"sentence_translation": that sentence's translation if the page has one; otherwise "".
If the columns are the other way round (the meaning first, the ${study} word after it), still put the ${study} one in "word".
Leave out everything that isn't vocabulary: titles and headings, page numbers, exercise numbers, instructions, dates, the names of the book or lesson, and the numbers or bullets in front of words.
Keep the page's order: top to bottom, and the columns in the order they are read.
If no ${study} words can be read in the photo, answer {"items": []}.
Answer with JSON only: {"items": [{"word": "...", "meaning": "...", "sentence": "...", "sentence_translation": "..."}]}.`;
  return { system, user: `The photo: read the ${study} vocabulary on it.`, schema: SCAN_SCHEMA };
}

const tidy = (v, max) => String(v ?? "").replace(/[⟦⟧]/g, "").replace(/\s+/g, " ").trim()
  .replace(/^["“”«»„]+|["“”«»„]+$/g, "").trim().slice(0, max);
const LIST_MARK = /^\s*(?:[-*•·▪◦‣]|\(?\d{1,3}[.)])\s+/u;
const fieldOf = (e, names) => {
  for (const n of names) if (e[n] !== undefined && e[n] !== null && typeof e[n] !== "object") return e[n];
  return "";
};

/**
 * The AI's answer as cards: {cards: [{text, meaning, sentence, translation}], total, cut}, like
 * addwords.js parseList. `answer` is the parsed JSON or the model's text, whatever came round it
 * (a sentence before, ``` fences): {items: [...]} (or words/cards/vocabulary), a bare list, one
 * entry on its own, a list of plain words, or just a word. Missing fields are ""; entries without a
 * word are left out; a list mark before a word goes. A "translation" with no sentence is the word's
 * meaning. At most `max` cards (`cut` says some were left).
 */
export function readScan(answer, { max = MAX_ROWS } = {}) {
  let data = typeof answer === "string" ? jsonIn(answer) : answer;
  if (data === null && typeof answer === "string") {
    // No JSON at all: a single short line is a single word ("Answer: casa" is not).
    const s = answer.trim();
    data = s && !/[\n{}[\]:]/.test(s) && s.length <= 80 ? [s] : [];
  }
  if (data && !Array.isArray(data) && typeof data === "object") {
    const list = ["items", "words", "cards", "vocabulary", "entries", "list"].map((k) => data[k]).find(Array.isArray);
    data = list || (fieldOf(data, ["word", "text", "term"]) ? [data] : []);
  }
  const cards = [];
  for (const e of Array.isArray(data) ? data : []) {
    const entry = typeof e === "string" ? { word: e } : Array.isArray(e) ? { word: e[0], meaning: e[1] }
      : e && typeof e === "object" ? e : null;
    if (!entry) continue;
    const text = tidy(String(fieldOf(entry, ["word", "text", "term", "front"])).replace(LIST_MARK, ""), 200);
    if (!wordKey(text)) continue;
    const sentence = tidy(fieldOf(entry, ["sentence", "example", "example_sentence"]), 1000);
    let meaning = tidy(fieldOf(entry, ["meaning", "definition", "gloss", "back"]), 500);
    let translation = tidy(fieldOf(entry, ["sentence_translation", "example_translation"]), 1000);
    const other = tidy(fieldOf(entry, ["translation"]), 1000);
    if (other && !meaning && !sentence) meaning = other.slice(0, 500);
    else if (other && !translation && sentence) translation = other;
    cards.push({ text, meaning, sentence, translation });
  }
  return { cards: cards.slice(0, max), total: cards.length, cut: cards.length > max };
}

// ---------------------------------------------------------------- reading on this device

/** Tesseract's trained data for each language Tamkeen teaches (app/lexicon.py OCR_LANGS is the same).
 * Chinese has both its simplified and its traditional characters. */
export const OCR_LANGS = {
  ar: ["ara"], es: ["spa"], fr: ["fra"], ja: ["jpn"], zh: ["chi_sim", "chi_tra"], ru: ["rus"], it: ["ita"], tl: ["tgl"],
  pt: ["por"], ca: ["cat"], ceb: ["ceb"], th: ["tha"], de: ["deu"], fa: ["fas"], hi: ["hin"], ko: ["kor"], en: ["eng"],
};
/** Tesseract itself: the build for devices with WebAssembly SIMD ("ocr"), and for older ones. */
export const OCR_CORES = { ocr: "ocr-core", "ocr-plain": "ocr-core-plain" };
/** Each file's size (docs/lexicon/index.json), to say what a download costs before the list is fetched. */
export const OCR_BYTES = {
  "ocr-core": 1454316, "ocr-core-plain": 1453570, "ocr-ara": 1661906, "ocr-cat": 639438, "ocr-ceb": 487818,
  "ocr-chi_sim": 1718768, "ocr-chi_tra": 1656239, "ocr-deu": 1333102, "ocr-eng": 2952873, "ocr-fas": 424507,
  "ocr-fra": 707406, "ocr-hin": 1389692, "ocr-ita": 1660998, "ocr-jpn": 2030256, "ocr-kor": 1572336, "ocr-por": 1392239,
  "ocr-rus": 2679598, "ocr-spa": 2100190, "ocr-tgl": 3296556, "ocr-tha": 896631,
};

/** The learner's own language as one of Tamkeen's codes: the language meanings are written in
 * (Settings → Word definitions, a name such as "English"), else the app's language, else English.
 * `names` is {code: {name, native}} (i18n.js UI_LANGUAGES). */
export function ownLanguage(definerLanguage, uiLanguage, names = {}) {
  const want = String(definerLanguage ?? "").trim().toLowerCase();
  const words = (s) => s.split(/[\s()]+/).filter((x) => x.length >= 4);  // "Brazilian Portuguese" is Portuguese too
  if (want) {
    for (const [code, n] of Object.entries(names)) {
      const forms = [n && n.name, n && n.native].filter(Boolean).map((x) => x.toLowerCase());
      if (OCR_LANGS[code] && (forms.includes(want) || forms.some((f) => words(f).includes(want)))) return code;
    }
  }
  return OCR_LANGS[uiLanguage] ? uiLanguage : "en";
}

/** What to download for reading `study` with the learner's `own` language beside it: "es+en"
 * (just "es" when they are the same). */
export const ocrPair = (study, own) => (OCR_LANGS[own] && own !== study ? `${study}+${own}` : study);

/** The files for `pair` ("es+en"), `kind` "ocr" or "ocr-plain": Tesseract and each language's data. */
export function ocrNames(pair, kind = "ocr") {
  const codes = String(pair ?? "").split(/[+\s]+/).flatMap((c) => OCR_LANGS[c] || []);
  return codes.length && OCR_CORES[kind] ? [OCR_CORES[kind], ...new Set(codes.map((c) => `ocr-${c}`))] : [];
}

/** What Tesseract is asked to read with: "spa+eng" (the language being learned first; for Chinese
 * the characters the learner chose in Settings first). */
export function tesseractLangs(pair, { zhScript = "" } = {}) {
  const codes = String(pair ?? "").split(/[+\s]+/).flatMap((c) => {
    const list = OCR_LANGS[c] || [];
    return c === "zh" && zhScript === "traditional" ? [...list].reverse() : list;
  });
  return [...new Set(codes)].join("+");
}

/** The lines Tesseract found, from its answer (`data`: {text, blocks}): [{text, words: [{text, x0, x1,
 * y0, y1}], x0, x1, y0, y1, height, conf}] in Tesseract's order. Without blocks, its text line by line. */
export function ocrLines(data) {
  const out = [];
  const blocks = data && Array.isArray(data.blocks) ? data.blocks : null;
  if (blocks) {
    for (const b of blocks) for (const p of (b && b.paragraphs) || []) for (const l of (p && p.lines) || []) {
      const words = ((l && l.words) || []).filter((w) => w && bare(w.text)).map((w) => ({
        text: bare(w.text), conf: Number.isFinite(w.confidence) ? w.confidence : null,
        x0: w.bbox ? w.bbox.x0 : 0, x1: w.bbox ? w.bbox.x1 : 0, y0: w.bbox ? w.bbox.y0 : 0, y1: w.bbox ? w.bbox.y1 : 0,
      }));
      if (!words.length) continue;
      const heights = words.map((w) => w.y1 - w.y0).filter((x) => x > 0).sort((a, b) => a - b);
      // How sure Tesseract is of the line: on average, and of its least certain word.
      const confs = words.map((w) => w.conf).filter((c) => c !== null);
      out.push({
        text: words.map((w) => w.text).join(" "), words,
        x0: Math.min(...words.map((w) => w.x0)), x1: Math.max(...words.map((w) => w.x1)),
        y0: Math.min(...words.map((w) => w.y0)), y1: Math.max(...words.map((w) => w.y1)),
        height: heights.length ? heights[heights.length >> 1] : 0,
        conf: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : Number.isFinite(l.confidence) ? l.confidence : null,
        least: confs.length ? Math.min(...confs) : null,
      });
    }
    return out;
  }
  for (const line of String((data && data.text) || "").split(/\r?\n/)) {
    if (bare(line)) out.push({ text: bare(line), words: [], x0: 0, x1: 0, y0: 0, y1: 0, height: 0, conf: null, least: null });
  }
  return out;
}

/** Text without the invisible direction marks Tesseract puts round right-to-left words. */
const bare = (s) => String(s ?? "").replace(/[‎‏‪-‮⁦-⁩]/g, "").trim();

const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const gapOf = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1);
const SEPARATOR = /\t|\s[-–—=]\s|[–—=;؛]/u;
const LIST_NUMBER = /^(?:\(?\d{1,3}[.)]|[-*•·▪◦‣])$/u;
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const LETTERS = /\p{L}/gu;
// Letters written without spaces between words: Chinese, Japanese, Thai. Tesseract puts spaces between
// them anyway; they go (but not round a dash or between a word and its Latin meaning).
const UNSPACED = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}ー々〆])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}ー々〆])/gu;

/** Lines read by Tesseract with less certainty than this on average (0-100) are noise: a shadow, the
 * edge of the page. (Clear print is read at 80-95.) */
export const MIN_CONFIDENCE = 50;
/** A card with a word read with less certainty than this is marked "check it" in the list. */
export const DOUBT_CONFIDENCE = 70;

/** A line in pieces where a wide gap between its words is a column: [{text, x0, conf}] (`conf`: the
 * least certain of its words). */
function piecesOf(line, wide) {
  const least = (ws) => Math.min(...ws.map((w) => (w.conf === null ? 100 : w.conf)));
  if (line.words.length < 2 || SEPARATOR.test(line.text)) {
    return [{ text: line.text, x0: line.x0, conf: line.words.length ? least(line.words) : 100 }];
  }
  const groups = [[line.words[0]]];
  for (let i = 1; i < line.words.length; i++) {
    if (wide && gapOf(line.words[i - 1], line.words[i]) >= wide) groups.push([]);
    groups[groups.length - 1].push(line.words[i]);
  }
  return groups.map((ws) => ({ text: ws.map((w) => w.text).join(" "), x0: Math.min(...ws.map((w) => w.x0)), conf: least(ws) }));
}

/** Lines side by side on the page (Tesseract often reads a column at a time) as rows. */
function rowsOf(lines) {
  const rows = [];
  for (const l of [...lines].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1))) {
    const h = l.y1 - l.y0;
    const row = h > 0 && rows.find((r) => {
      const overlap = Math.min(r.y1, l.y1) - Math.max(r.y0, l.y0);
      return overlap > 0.5 * Math.min(h, r.y1 - r.y0) && r.lines.every((o) => o.x1 <= l.x0 || l.x1 <= o.x0);
    });
    if (row) { row.lines.push(l); row.y0 = Math.min(row.y0, l.y0); row.y1 = Math.max(row.y1, l.y1); }
    else rows.push({ lines: [l], y0: l.y0, y1: l.y1 });
  }
  return rows;
}

/**
 * Tesseract's answer as the text of a pasted list, one line per card, for addwords.js parseList.
 *   - words and meanings side by side are one card, however Tesseract read them (a column at a time,
 *     or a line with a wide gap in it): "casa – house"; three or more columns are joined with tabs,
 *     like a spreadsheet's (word, meaning, sentence…), and two pairs side by side are two cards;
 *   - "casa: house" becomes "casa – house"; a list number stays with its word (parseList drops it);
 *   - lines with no letters (page numbers), barely readable ones, and lines in much bigger letters than
 *     the rest with nothing beside them (a heading) are left out;
 *   - Chinese, Japanese and Thai lose the spaces Tesseract puts between their letters.
 *   - so are lines of mostly single letters and marks: what Tesseract makes of a shadow or a pattern.
 * The lines: [{text, doubt}], `doubt` when a word in it was hard to read (the list says "check it").
 * `minConfidence` is how sure of a line Tesseract must be on average (0-100) for it to count, and
 * `minWord` how sure of each of its words.
 */
export function ocrList(data, { minConfidence = MIN_CONFIDENCE, minWord = 0 } = {}) {
  const lines = ocrLines(data).filter((l) => (l.conf === null || l.conf >= minConfidence) && (!minWord || l.least === null || l.least >= minWord));
  const usualHeight = median(lines.map((l) => l.height));
  // The usual space between words (not counting gaps as wide as the letters are tall: columns).
  const gaps = [];
  for (const l of lines) {
    for (let i = 1; i < l.words.length; i++) {
      const g = gapOf(l.words[i - 1], l.words[i]);
      if (g < (l.height || usualHeight) * 1.5) gaps.push(g);
    }
  }
  const usual = median(gaps);
  const positioned = lines.some((l) => l.y1 > l.y0);
  const rows = positioned ? rowsOf(lines) : lines.map((l) => ({ lines: [l] }));
  const out = [];
  for (const row of rows) {
    const pieces = row.lines.flatMap((l) => piecesOf(l, Math.max((l.height || usualHeight) * 1.1, usual * 3))).sort((a, b) => a.x0 - b.x0);
    // Read right to left when it is all in a right-to-left script.
    if (pieces.length > 1 && pieces.every((p) => RTL.test(p.text))) pieces.reverse();
    const parts = [];
    for (const p of pieces.filter((x) => x.text.trim())) {
      const last = parts[parts.length - 1];
      if (last && LIST_NUMBER.test(last.text)) { last.text += ` ${p.text.trim()}`; last.conf = Math.min(last.conf, p.conf); }
      else parts.push({ text: p.text.trim(), conf: p.conf });
    }
    const height = median(row.lines.map((l) => l.height));
    // A heading: much bigger letters than the list, and nothing beside it.
    if (parts.length === 1 && rows.length >= 3 && usualHeight && height > usualHeight * 1.35) continue;
    const words = parts.map((p) => p.text);
    const doubtOf = (list) => list.some((p) => p.conf < DOUBT_CONFIDENCE);
    let cards;
    if (parts.length >= 2 && words.every((p) => SEPARATOR.test(p))) cards = parts.map((p) => [p.text, [p]]);  // whole cards side by side
    else if (parts.length >= 4 && parts.length % 2 === 0 && words.every((p) => p.split(/\s+/).length <= 3)) {
      cards = [];  // two (or more) short word – meaning pairs side by side
      for (let i = 0; i < parts.length; i += 2) cards.push([`${words[i]} – ${words[i + 1]}`, [parts[i], parts[i + 1]]]);
    } else if (parts.length > 2) cards = [[words.join("\t"), parts]];
    else if (parts.length === 2) cards = [[`${words[0]} – ${words[1]}`, parts]];
    else if (parts.length === 1) cards = [[SEPARATOR.test(words[0]) ? words[0] : words[0].replace(/^([^:]{1,60}?)\s*:\s+(?=\S)/u, "$1 – "), parts]];
    else cards = [];
    for (const [raw, from] of cards) {
      const text = raw.replace(UNSPACED, "$1").replace(/[  ]+/g, " ").trim();
      if ((text.match(LETTERS) || []).length < 1 || noise(text)) continue;
      out.push({ text, doubt: doubtOf(from) });
    }
  }
  return out;
}

/** Not words: three or more bits, half of them a single letter or digit ("[rl ry a 0 5"), or more
 * marks and digits than letters ("8 ١ض 0"). */
function noise(text) {
  const sizes = text.split(/\s+/).map((t) => (t.match(/[\p{L}\p{N}]/gu) || []).length).filter((n) => n > 0);
  if (sizes.length >= 3 && sizes.filter((n) => n === 1).length / sizes.length >= 0.5) return true;
  const marks = text.replace(/\s+/g, "").length;
  return (text.match(LETTERS) || []).length < marks * 0.5;
}

/** Tesseract's answer as the text of a pasted list (ocrList's lines). */
export const ocrPaste = (data) => ocrList(data).map((l) => l.text).join("\n");

// Tesseract first follows the page's layout (columns, a table: page segmentation mode 3). That can
// miss a column of words entirely (seen with Hindi, Japanese and Korean lists, and a lone Arabic word
// on a flashcard), so when a reading looks short of the language being learned it reads the page again
// another way (6: one block of text; 4: one column of lines) and the reading with more of it is kept.

/** How much a reading (ocrList's lines) holds: its letters, the language being learned's own script
 * counting twice, and a line Tesseract was unsure of half. */
export function readingScore(lines, lang = "") {
  const script = SCRIPTS[lang];
  let n = 0;
  for (const l of lines || []) {
    let m = 0;
    for (const ch of String(l.text).match(LETTERS) || []) m += script && script.test(ch) ? 2 : 1;
    n += l.doubt ? m / 2 : m;
  }
  return n;
}

/** Cards read on this device whose word isn't in the script of the language being learned, when
 * most of the others' are ("OKHO" for окно: Russian letters read as the English lookalikes), get
 * `doubt` ("check it"). Returns the cards. */
export function markOddOnes(cards, lang = "") {
  const script = SCRIPTS[lang];
  if (!script || !cards || cards.length < 2) return cards;
  const inScript = cards.filter((c) => script.test(c.text)).length;
  if (inScript >= cards.length / 2) for (const c of cards) if (!script.test(c.text)) c.doubt = true;
  return cards;
}

/** Does this reading look as if something was missed: nothing at all; for a language with its own
 * script, less than half the lines in it; less than half the lines with a second column (a word
 * without the meaning beside it); or a quarter of them hard to read? */
export function worthAnotherLook(lines, lang = "") {
  const list = lines || [];
  if (!list.length) return true;
  const script = SCRIPTS[lang];
  if (script && list.filter((l) => script.test(l.text)).length < list.length / 2) return true;
  if (list.filter((l) => l.doubt).length >= list.length / 4) return true;
  return list.filter((l) => SEPARATOR.test(l.text)).length < list.length / 2;
}

// ---------------------------------------------------------------- back to text ("Edit as text")

/** Cards as the text of a pasted list that addwords.js parseList reads back the same:
 * "word – meaning", or "word; meaning; sentence; translation"; tabs between the parts when one of
 * them has a separator of its own in it. */
export function itemsToPaste(cards) {
  const one = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
  return (cards || []).map((c) => {
    const parts = [c.text, c.meaning, c.sentence, c.translation].map(one);
    while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
    if (parts.length === 1) return parts[0];
    if (parts.some((p) => /[;؛=–—]|\s-\s/u.test(p))) return parts.join("\t");
    return parts.length === 2 ? `${parts[0]} – ${parts[1]}` : parts.join("; ");
  }).filter(Boolean).join("\n");
}
