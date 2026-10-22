// Reading aids for Japanese, Chinese, Thai and Hindi on screen: real words, furigana, pinyin, Thai and Hindi readings.
//
// Once someone learning Japanese or Chinese has downloaded that language's dictionary (the same
// offer as the other languages' word tables, ./seen.js), it is loaded here and:
//   - becomes the word splitter for transcripts, pages and reels (languages.js setWordSplitter),
//     so a tap lands on a real word;
//   - draws small kana over kanji (furigana) or pinyin over Chinese characters, coloured by tone,
//     each with its switch in Settings (on unless switched off);
//   - shows Chinese in the characters the learner chose: as written, simplified or traditional.
//
// Thai keeps the device's word breaker (Intl.Segmenter); its download is a table of how each word is
// said (./thai.js), drawn over the word in Latin letters with tone marks (สวัสดี: sà-wàt-dii), with its
// own switch, and given in the word popup too (./seen.js pronounceWord).
//
// Hindi is spaced like English; how each word is said (namaste) is worked out from its spelling by
// ./hindi.js with nothing to download, and once the Hindi word table is on the device (the "seen words"
// download) Wiktionary's reading of the words the rule gets wrong is used instead. Its own switch too.
//
// The readings are drawn without adding text to the page: <rt data-r="た"> with the reading put
// on screen by CSS (::before). So a word's element still has only the word as its text, for
// everything that reads it (lookups, copying, the misheard-word fix).
//
// Shared by the desktop app and the phone.

import { api, esc, h, saveSettings, state, toast } from "../app.js";
import { setWordSplitter } from "../languages.js";
import { ChineseDictionary, chineseWords, pinyinSyllables } from "./chinese.js";
import { furigana, japaneseWords } from "./japanese.js";
import { JapaneseDictionary } from "./kuromoji.js";
import { dictionaries, downloadDictionaries, lexiconStatus, removeDictionaries } from "./seen.js";
import { ThaiReadings } from "./thai.js";
import { HindiReadings } from "./hindi.js";
import { LemmaTable } from "./romance.js";

export const READING_LANGUAGES = new Set(["ja", "zh", "th", "hi"]);

const settings = () => (state.status && state.status.settings) || {};
export const showFurigana = () => settings().furigana !== false;
export const showPinyin = () => settings().pinyin !== false;
export const showThaiReadings = () => settings().thai_readings !== false;
export const showHindiReadings = () => settings().hindi_readings !== false;
const switchedOn = (lang) => (lang === "ja" ? showFurigana() : lang === "zh" ? showPinyin() : lang === "th" ? showThaiReadings()
  : lang === "hi" ? showHindiReadings() : false);
/** "" (as written), "simplified" or "traditional". */
export const chineseScript = () => settings().zh_script || "";

const ready = new Map(); // language -> its loaded dictionary
const loading = new Map();

function install(lang, dict) {
  ready.set(lang, dict);
  markup.clear();
  if (lang === "th" || lang === "hi") return; // Thai keeps the device's word breaker; Hindi is spaced
  if (lang === "ja") {
    setWordSplitter("ja", { split: (text) => japaneseWords(dict, text).map((w) => ({ index: w.index, segment: w.text })) });
  } else {
    setWordSplitter("zh", {
      split: (text) => chineseWords(dict, text).map((w) => ({ index: w.index, segment: w.text })),
      show: (word) => dict.display(word, chineseScript()),
    });
  }
}

/** Forget a language's dictionary (it was removed in Settings): back to the device's word breaker. */
export function dropReadings(lang) {
  ready.delete(lang);
  loading.delete(lang);
  markup.clear();
  setWordSplitter(lang, null);
}

// Thai's table isn't one of the "seen words" dictionaries (Thai words have no other forms to find),
// so it is fetched here.
async function thaiTable() {
  const st = await lexiconStatus("th");
  return st && st.installed ? new ThaiReadings(await api("/lexicon/data/th")) : null;
}

// Hindi's readings need nothing downloaded: the word table, when it is here, only corrects them.
async function hindiTable() {
  const dicts = await dictionaries("hi").catch(() => null);
  return new HindiReadings((dicts || []).find((d) => d instanceof LemmaTable) || null);
}

/**
 * Load Japanese, Chinese or Thai, if its dictionary is on this device, before a text in it is split into
 * words. Resolves to the dictionary, or null (another language, not downloaded, or too slow: then
 * the text is split the old way rather than kept waiting).
 */
export function readingsReady(lang, wait = 15000) {
  if (!READING_LANGUAGES.has(lang)) return Promise.resolve(null);
  if (ready.has(lang)) return Promise.resolve(ready.get(lang));
  if (!loading.has(lang)) {
    const load = lang === "th" ? thaiTable() : lang === "hi" ? hindiTable() : dictionaries(lang).then((dicts) =>
      (dicts || []).find((d) => d instanceof JapaneseDictionary || d instanceof ChineseDictionary) || null);
    loading.set(lang, load.then((dict) => {
      if (dict && loading.has(lang)) install(lang, dict);
      return dict;
    }).catch((e) => { console.warn("Reading aids unavailable", e); return null; })
      .finally(() => loading.delete(lang)));
  }
  return Promise.race([loading.get(lang), new Promise((r) => { setTimeout(() => r(null), wait); })]);
}

// A dictionary was downloaded (./seen.js) or removed (Settings): what is on screen was split into
// words the other way, so it is drawn again.
if (typeof window !== "undefined") {
  window.addEventListener("tamkeen:dictionaries", (e) => {
    const { lang, installed } = e.detail || {};
    if (!READING_LANGUAGES.has(lang)) return;
    if (!installed || lang === "hi") dropReadings(lang); // (Hindi: read again with the table, or without it)
    (installed ? readingsReady(lang) : Promise.resolve())
      .then(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  });
}

// ---------- markup ----------
const markup = new Map(); // `${lang}|${aids}|${text}` -> html

const ruby = (base, reading, cls = "") => `<ruby>${esc(base)}<rt${cls ? ` class="${cls}"` : ""} data-r="${esc(reading)}"></rt></ruby>`;

function japaneseHtml(dict, text) {
  let out = "";
  for (const w of japaneseWords(dict, text)) {
    for (const p of w.parts) {
      for (const [piece, reading] of furigana(p.text, p.reading)) out += reading ? ruby(piece, reading) : esc(piece);
    }
  }
  return out;
}

function chineseHtml(dict, text) {
  let out = "";
  for (const w of chineseWords(dict, text)) {
    const chars = Array.from(w.text);
    const syl = pinyinSyllables(w.pinyin);
    if (!w.pinyin || syl.length !== chars.length) { out += esc(w.text); continue; }
    out += `<ruby>${chars.map((ch, i) => `${esc(ch)}<rt class="tone${syl[i].tone}" data-r="${esc(syl[i].text)}"></rt>`).join("")}</ruby>`;
  }
  return out;
}

// Thai: each word that has a reading gets it over the whole word (Thai letters don't map one to one
// onto syllables the way Chinese characters do). A text of several words is cut the way the players
// cut it (Intl.Segmenter), so a review card's sentence reads the same as the transcript.
const thaiSegmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("th", { granularity: "word" }) : null;
function thaiHtml(dict, text) {
  const words = thaiSegmenter ? Array.from(thaiSegmenter.segment(text), (s) => s.segment) : [text];
  // The word sits in its own box: a reading wider than the word would otherwise make the browser spread
  // its letters apart, and Thai vowels written above or below a letter came loose (ชู as ช ู).
  return words.map((w) => { const r = dict.reading(w); return r ? `<ruby><span class="thw">${esc(w)}</span><rt class="th" data-r="${esc(r)}"></rt></ruby>` : esc(w); }).join("");
}

/** How a Thai word is said, from the downloaded table ("" when it isn't here or has no reading).
 * For the word popup: given whether or not the readings over the text are switched on. */
export async function thaiReading(word) {
  const dict = await readingsReady("th", 5000);
  return dict ? dict.reading(String(word ?? "").trim()) : "";
}

// Hindi: each word gets its reading over it, in its own box like Thai (a reading wider than the word
// would otherwise make the browser spread the word's letters, and its vowel signs would come loose).
// Punctuation (the full stop ।, commas) stays in the box with the word, outside the reading.
function hindiHtml(dict, text) {
  return String(text).split(/(\s+)/).map((part) => {
    const r = /\S/.test(part) ? dict.word(part) : "";
    return r ? `<ruby><span class="hiw">${esc(part)}</span><rt class="hi" data-r="${esc(r)}"></rt></ruby>` : esc(part);
  }).join("");
}

/** How a Hindi word or phrase is said (namaste), for the word popup, whether or not the readings over
 * the text are switched on: by rule, or the word table's reading when it has one. */
export async function hindiReading(word) {
  const dict = (await readingsReady("hi", 5000)) || new HindiReadings();
  return dict.reading(String(word ?? "").trim());
}

/** The HTML for a word or text of `lang` on screen: furigana / pinyin / Thai readings when they are
 * switched on and the dictionary is loaded (see readingsReady), else just the text. Synchronous. */
export function readingHtml(text, lang) {
  text = String(text ?? "");
  const dict = ready.get(lang);
  if (!dict || !switchedOn(lang) || !text) return esc(text);
  const key = `${lang}|${text}`;
  let html = markup.get(key);
  if (html === undefined) {
    try {
      html = lang === "ja" ? japaneseHtml(dict, text) : lang === "th" ? thaiHtml(dict, text)
        : lang === "hi" ? hindiHtml(dict, text) : chineseHtml(dict, text);
    } catch { html = esc(text); }
    if (markup.size > 30000) markup.clear();
    markup.set(key, html);
  }
  return html;
}

/** Does `lang` draw readings right now (dictionary loaded and its switch on)? */
export const readingsShown = (lang) => ready.has(lang) && switchedOn(lang);

/**
 * Put readings over the Japanese or Chinese text inside an element that was filled with plain text
 * (a review card's word and sentence). Waits for the dictionary; does nothing for other languages
 * or with the switch off. Text in a different language inside it is left as it is only if it has
 * no kanji/hanzi; the element should hold text of `lang`.
 */
export async function addReadings(el, lang) {
  if (!el || !READING_LANGUAGES.has(lang)) return;
  if (!(await readingsReady(lang)) || !readingsShown(lang) || !el.isConnected) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest("ruby, rt, script, style, input, textarea") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const html = readingHtml(node.nodeValue, lang);
    if (html === esc(node.nodeValue)) continue;
    const span = document.createElement("span");
    span.className = "readings";
    span.innerHTML = html;
    node.replaceWith(span);
  }
}

// ---------- Settings ----------
/** Settings' switches for Japanese, Chinese or Thai (an empty, hidden element for other languages):
 * furigana; pinyin and which characters to show; Thai readings, with the table's download. */
export function readingsRow(lang) {
  const el = h(`<div class="lex-row small readings-row" hidden></div>`);
  if (!READING_LANGUAGES.has(lang)) return el;
  if (lang === "th") return thaiRow(el);
  if (lang === "hi") return hindiRow(el);
  const s = settings();
  el.hidden = false;
  el.innerHTML = lang === "ja"
    ? `<label><input type="checkbox" data-set="furigana" ${showFurigana() ? "checked" : ""}> <span>Show furigana (small kana over kanji)</span></label>`
    : `<label><input type="checkbox" data-set="pinyin" ${showPinyin() ? "checked" : ""}> <span>Show pinyin over the characters, coloured by tone</span></label>
       <label>Chinese characters <select data-set="zh_script">
         <option value="" ${!s.zh_script ? "selected" : ""}>As written</option>
         <option value="simplified" ${s.zh_script === "simplified" ? "selected" : ""}>Simplified (简体)</option>
         <option value="traditional" ${s.zh_script === "traditional" ? "selected" : ""}>Traditional (繁體)</option>
       </select></label>`;
  el.innerHTML += `<span class="muted">These work once the ${lang === "ja" ? "Japanese" : "Chinese"} dictionary is on this device.</span>`;
  el.addEventListener("change", async (e) => {
    const key = e.target.dataset.set;
    if (!key) return;
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    await saveSettings({ [key]: value }).catch((err) => toast(err.message, { error: true }));
  });
  return el;
}

// Thai: the switch, and the table's download (the "seen words" dictionaries row has nothing for Thai).
function thaiRow(el) {
  el.hidden = false;
  const paint = async () => {
    let st = null;
    try { st = await lexiconStatus("th"); } catch { /* shown as not downloaded */ }
    const kb = Math.max(1, Math.round(((st && st.bytes) || 190000) / 1e3));
    el.innerHTML = `<label><input type="checkbox" data-set="thai_readings" ${showThaiReadings() ? "checked" : ""}> <span>Show how Thai words are said, over the words (sà-wàt-dii)</span></label>`
      + (st && st.installed
        ? `<span class="muted">✓ The Thai reading table is on this device (${kb} KB). Readings come from Wiktionary, in Paiboon romanization with tone marks; a word it doesn't know gets none.</span>
           <button type="button" class="ghost" data-act="remove">Remove</button>`
        : `<span class="muted">This needs the Thai reading table: a one-time download of about ${kb} KB, made from Wiktionary. It stays on this device.</span>
           <button type="button" data-act="get">Download (about ${kb} KB)</button>`);
  };
  el.addEventListener("change", async (e) => {
    if (e.target.dataset.set !== "thai_readings") return;
    await saveSettings({ thai_readings: e.target.checked }).catch((err) => toast(err.message, { error: true }));
    markup.clear();
    window.dispatchEvent(new HashChangeEvent("hashchange")); // draw what is on screen again
  });
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.act === "get") { b.textContent = "Downloading…"; await downloadDictionaries("th"); toast("The Thai reading table is ready."); }
      else await removeDictionaries("th");
    } catch (err) { toast(err.message, { error: true }); }
    paint();
  });
  paint();
  return el;
}

// Hindi: the switch. Nothing to download for it (the word table, in the dictionaries row, only corrects it).
function hindiRow(el) {
  el.hidden = false;
  el.innerHTML = `<label><input type="checkbox" data-set="hindi_readings" ${showHindiReadings() ? "checked" : ""}> <span>Show how Hindi words are said, over the words (namaste)</span></label>
    <span class="muted">Worked out from the spelling. With the Hindi word table on this device, Wiktionary's reading is used for the words the rule gets wrong.</span>`;
  el.addEventListener("change", async (e) => {
    if (e.target.dataset.set !== "hindi_readings") return;
    await saveSettings({ hindi_readings: e.target.checked }).catch((err) => toast(err.message, { error: true }));
    markup.clear();
    window.dispatchEvent(new HashChangeEvent("hashchange")); // draw what is on screen again
  });
  return el;
}

// ---------- looks ----------
// The readings' own styles, added once (rather than in app.css, so they come and go with this file).
// Tone colours: the usual teaching colours (1 red, 2 orange, 3 green, 4 blue, neutral grey),
// in shades that read on both the light and the dark theme.
if (typeof document !== "undefined" && !document.getElementById("readings-css")) {
  const style = document.createElement("style");
  style.id = "readings-css";
  style.textContent = `
    ruby { ruby-position: over; }
    ruby > rt { font-size: max(0.5em, 9px); font-weight: 400; line-height: 1; user-select: none; color: var(--muted, #888); letter-spacing: 0; }
    ruby > rt::before { content: attr(data-r); }
    :lang(zh) ruby > rt { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: max(0.45em, 9px); }
    rt.th { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: max(0.5em, 10px); white-space: nowrap; }
    ruby > .thw { display: inline-block; line-height: 1.6; }
    rt.hi { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: max(0.5em, 10px); white-space: nowrap; }
    ruby > .hiw { display: inline-block; line-height: 1.5; }
    rt.tone1 { color: #e0464e; } rt.tone2 { color: #e8901c; } rt.tone3 { color: #2fa84f; } rt.tone4 { color: #3b7ddd; } rt.tone5 { color: var(--muted, #888); }
    .readings-row { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
    .transcript:lang(ja), .transcript:lang(zh), .captions:lang(ja), .captions:lang(zh) { line-height: 2.1; }
    /* Thai stacks vowels and tone marks above its letters: the line needs room for those and the reading. */
    :is(.transcript, .captions, .reader-text):lang(th):has(rt.th) { line-height: 2.8; }
    /* Hindi: vowel signs above and below its letters, and the reading over them. */
    :is(.transcript, .captions, .reader-text):lang(hi):has(rt.hi) { line-height: 2.6; }
  `;
  document.head.append(style);
}
