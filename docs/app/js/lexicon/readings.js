// Reading aids for Japanese and Chinese on screen: real words, furigana and pinyin.
//
// Once someone learning Japanese or Chinese has downloaded that language's dictionary (the same
// offer as the other languages' word tables, ./seen.js), it is loaded here and:
//   - becomes the word splitter for transcripts, pages and reels (languages.js setWordSplitter),
//     so a tap lands on a real word;
//   - draws small kana over kanji (furigana) or pinyin over Chinese characters, coloured by tone,
//     each with its switch in Settings (on unless switched off);
//   - shows Chinese in the characters the learner chose: as written, simplified or traditional.
//
// The readings are drawn without adding text to the page: <rt data-r="た"> with the reading put
// on screen by CSS (::before). So a word's element still has only the word as its text, for
// everything that reads it (lookups, copying, the misheard-word fix).
//
// Shared by the desktop app and the phone.

import { esc, h, saveSettings, state, toast } from "../app.js";
import { setWordSplitter } from "../languages.js";
import { ChineseDictionary, chineseWords, pinyinSyllables } from "./chinese.js";
import { furigana, japaneseWords } from "./japanese.js";
import { JapaneseDictionary } from "./kuromoji.js";
import { dictionaries } from "./seen.js";

export const READING_LANGUAGES = new Set(["ja", "zh"]);

const settings = () => (state.status && state.status.settings) || {};
export const showFurigana = () => settings().furigana !== false;
export const showPinyin = () => settings().pinyin !== false;
/** "" (as written), "simplified" or "traditional". */
export const chineseScript = () => settings().zh_script || "";

const ready = new Map(); // language -> its loaded dictionary
const loading = new Map();

function install(lang, dict) {
  ready.set(lang, dict);
  markup.clear();
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

/**
 * Load Japanese or Chinese, if its dictionary is on this device, before a text in it is split into
 * words. Resolves to the dictionary, or null (another language, not downloaded, or too slow: then
 * the text is split the old way rather than kept waiting).
 */
export function readingsReady(lang, wait = 15000) {
  if (!READING_LANGUAGES.has(lang)) return Promise.resolve(null);
  if (ready.has(lang)) return Promise.resolve(ready.get(lang));
  if (!loading.has(lang)) {
    loading.set(lang, dictionaries(lang).then((dicts) => {
      const dict = (dicts || []).find((d) => d instanceof JapaneseDictionary || d instanceof ChineseDictionary) || null;
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
    if (!installed) dropReadings(lang);
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

/** The HTML for a word or text of `lang` on screen: furigana / pinyin when they are switched on and
 * the dictionary is loaded (see readingsReady), else just the text. Synchronous. */
export function readingHtml(text, lang) {
  text = String(text ?? "");
  const dict = ready.get(lang);
  const on = lang === "ja" ? showFurigana() : lang === "zh" ? showPinyin() : false;
  if (!dict || !on || !text) return esc(text);
  const key = `${lang}|${text}`;
  let html = markup.get(key);
  if (html === undefined) {
    try { html = lang === "ja" ? japaneseHtml(dict, text) : chineseHtml(dict, text); } catch { html = esc(text); }
    if (markup.size > 30000) markup.clear();
    markup.set(key, html);
  }
  return html;
}

/** Does `lang` draw readings right now (dictionary loaded and its switch on)? */
export const readingsShown = (lang) => ready.has(lang) && (lang === "ja" ? showFurigana() : lang === "zh" ? showPinyin() : false);

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
/** Settings' switches for Japanese or Chinese (an empty, hidden element for other languages):
 * furigana; pinyin and which characters to show. */
export function readingsRow(lang) {
  const el = h(`<div class="lex-row small readings-row" hidden></div>`);
  if (!READING_LANGUAGES.has(lang)) return el;
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
    rt.tone1 { color: #e0464e; } rt.tone2 { color: #e8901c; } rt.tone3 { color: #2fa84f; } rt.tone4 { color: #3b7ddd; } rt.tone5 { color: var(--muted, #888); }
    .readings-row { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
    .transcript:lang(ja), .transcript:lang(zh), .captions:lang(ja), .captions:lang(zh) { line-height: 2.1; }
  `;
  document.head.append(style);
}
