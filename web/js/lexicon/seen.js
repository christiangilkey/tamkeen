// Seen words on screen: which words of a transcript or page are new to the learner.
//
// A word the learner has never tapped is drawn in purple; once tapped (looked up) it is "seen"
// and drawn like ordinary text, together with every other form of the same word. What is kept
// is the word's dictionary form (its lexeme, see ./words.js), never the spelling that was tapped.
// The list lives with the rest of the library (/api/lexemes: known_lexemes on the computer,
// lib.lexemes on the phone) and travels between devices with it.
//
// Arabic needs dictionaries to find a word's dictionary form, and Spanish, French and Italian get
// a table of word forms. Each is a small one-time download offered only to someone learning that
// language (offerDictionaries below). Until it is there, Arabic text is simply not coloured, and
// in the other three each spelling of a word counts as a different word.
//
// Shared by the desktop app and the phone.

import { api, h, saveSettings, state, toast } from "../app.js";
import { LANGUAGES, detectLanguage, langAttrs, onStudyLanguage } from "../languages.js";
import { Dictionary, arabicCore, matchForm } from "./arabic.js";
import { LemmaTable } from "./romance.js";
import { JapaneseDictionary } from "./kuromoji.js";
import { ChineseDictionary } from "./chinese.js";
import { stressed } from "./russian.js";
import { lexemeOf, lexemesFor, markedTokens, needsDictionaries, usesDictionaries } from "./words.js";

const settings = () => (state.status && state.status.settings) || {};

// ---------- the list ----------
const known = new Set();   // keys of every seen lexeme
const views = new Set();   // texts on screen that show it
let knownLoad = null;

async function fetchKnown() {
  const r = await api("/lexemes");
  known.clear();
  for (const key of (r && r.keys) || []) known.add(key);
}
/** The list, loaded once. `fresh` asks again (another device may have added to it). */
function loadKnown(fresh = false) {
  if (!knownLoad || fresh) knownLoad = fetchKnown().catch(() => { knownLoad = null; });
  return knownLoad;
}
function repaint() {
  for (const v of views) { v.paint(); if (v.onPaint) { try { v.onPaint(); } catch { /* a screen's own repaint */ } } }
}

/** Mark lexemes (what lexemesFor / lexemeOf return) as seen. */
export async function markLexemes(items) {
  const fresh = [];
  for (const it of items || []) if (it && it.key && !known.has(it.key)) { known.add(it.key); fresh.push(it); }
  if (!fresh.length) return 0;
  repaint();
  try {
    await api("/lexemes", { method: "POST", body: { items: fresh.map(({ key, lemma, pos, root }) => ({ key, lemma, pos, root })) } });
  } catch (e) {
    for (const it of fresh) known.delete(it.key);
    repaint();
    toast(`Couldn't save that word as seen: ${e.message}`, { error: true });
    return 0;
  }
  return fresh.length;
}

/** Make lexemes count as new again. Takes keys or lexemes. */
export async function forgetLexemes(items) {
  const keys = (items || []).map((it) => (typeof it === "string" ? it : it && it.key)).filter((k) => k && known.has(k));
  if (!keys.length) return 0;
  for (const k of keys) known.delete(k);
  repaint();
  try { await api("/lexemes/forget", { method: "POST", body: { keys } }); }
  catch (e) { for (const k of keys) known.add(k); repaint(); toast(e.message, { error: true }); return 0; }
  return keys.length;
}

// Something else changed the list (the first-run common words, a sync): read it again.
if (typeof window !== "undefined") {
  window.addEventListener("tamkeen:lexemes", () => loadKnown(true).then(repaint));
}

// ---------- dictionaries ----------
const loaded = new Map(); // language -> promise of its dictionaries

/**
 * The dictionaries for a language: [] when it has none, null when it has some to download and
 * they haven't been downloaded.
 */
export function dictionaries(lang) {
  if (!usesDictionaries(lang)) return Promise.resolve([]);
  if (!loaded.has(lang)) {
    loaded.set(lang, readDictionaries(lang).catch((e) => { console.warn("Dictionaries failed to load", e); return null; })
      .then((d) => { if (!d) loaded.delete(lang); return d; }));
  }
  return loaded.get(lang);
}

async function readDictionaries(lang) {
  const st = await api(`/lexicon/status?lang=${lang}`);
  if (!st.installed) return null;
  const dicts = [];
  for (const name of st.names) {
    if (name === "ja") { dicts.push(new JapaneseDictionary(await api("/lexicon/data/ja", { bytes: true }))); continue; } // binary
    const data = await api(`/lexicon/data/${name}`);
    dicts.push(data && data.kind === "lemmas" ? new LemmaTable(data) : data && data.kind === "zh" ? new ChineseDictionary(data) : new Dictionary(data));
  }
  return dicts;
}

export const lexiconStatus = (lang) => api(`/lexicon/status?lang=${lang}`);

/** A word's pronunciation from the language's downloaded table (English: US IPA from the CMU
 * Pronouncing Dictionary; Thai: Paiboon romanization, ./readings.js), or "" when there is none.
 * Never asks to download anything. */
export async function pronounceWord(word, lang) {
  if (lang === "th") return import("./readings.js").then((m) => m.thaiReading(word));
  if (lang !== "en") return "";
  const dicts = await dictionaries(lang);
  const table = (dicts || []).find((d) => d instanceof LemmaTable);
  if (!table) return "";
  const { pronunciation } = await import("./english.js");
  return pronunciation(word, table);
}

/** Download a language's dictionaries, then colour whatever is on screen. */
export async function downloadDictionaries(lang) {
  const st = await api("/lexicon/download", { method: "POST", body: { lang } });
  loaded.delete(lang);
  if (declined(lang)) setDeclined(lang, false).catch(() => {});
  if (offerShown && offerShown.lang === lang) offerShown.close(); // downloaded another way (Settings) meanwhile
  for (const v of views) if (v.lang === lang) v.analyze();
  window.dispatchEvent(new CustomEvent("tamkeen:dictionaries", { detail: { lang, installed: true } })); // (lexicon/readings.js)
  return st;
}

export async function removeDictionaries(lang) {
  const st = await api("/lexicon/remove", { method: "POST", body: { lang } });
  loaded.delete(lang);
  window.dispatchEvent(new CustomEvent("tamkeen:dictionaries", { detail: { lang, installed: false } }));
  for (const v of views) if (v.lang === lang) v.analyze();
  return st;
}

/** Settings' line about a language's dictionaries: whether they are here, with a button to
 * download or remove them. Stays empty for languages that need none. */
export function dictionariesRow(lang) {
  const el = h(`<div class="lex-row small" hidden></div>`);
  if (!usesDictionaries(lang)) return el;
  const name = (LANGUAGES[lang] || {}).name || "";
  const paint = async () => {
    let st;
    try { st = await lexiconStatus(lang); } catch { return; }
    const mb = Math.max(1, Math.round(st.bytes / 1e6));
    el.hidden = false;
    el.innerHTML = st.installed
      ? `<span>✓ ${name} word dictionaries are on this device (${mb} MB). Words you have never tapped show in <span class="lex-new-sample">purple</span>.</span>
         <button type="button" class="ghost" data-act="remove">Remove</button>
         ${lang === "ru" ? `<label class="lex-stress"><input type="checkbox" data-act="stress" ${settings().ru_stress !== false ? "checked" : ""}> Show stress marks (ла́дно)</label>` : ""}`
      : needsDictionaries(lang)
        ? `<span>${name} word dictionaries aren't on this device, so new words can't be shown in <span class="lex-new-sample">purple</span>.</span>`
        : `<span>${name} word dictionaries aren't on this device, so each spelling of a word counts as a different word.</span>`;
    el.innerHTML += st.installed ? "" : `
         <button type="button" data-act="get">Download (about ${mb} MB)</button>`;
  };
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.act === "get") { b.textContent = "Downloading…"; await downloadDictionaries(lang); toast(`${name} dictionaries are ready.`); }
      else await removeDictionaries(lang);
    } catch (err) { toast(err.message, { error: true }); }
    paint();
  });
  el.addEventListener("change", async (e) => {
    if (e.target.dataset.act !== "stress") return;
    await saveSettings({ ru_stress: e.target.checked }).catch((err) => toast(err.message, { error: true }));
    repaint();
  });
  paint();
  return el;
}

/** Has the learner said "not now" to this language's download? (An older answer of plain
 * `true` was about Arabic, the only language that had one.) */
const declined = (lang) => {
  const v = settings().lexicon_declined;
  return v === true ? lang === "ar" : Array.isArray(v) && v.includes(lang);
};
function setDeclined(lang, on) {
  const v = settings().lexicon_declined;
  const list = new Set(v === true ? ["ar"] : Array.isArray(v) ? v : []);
  if (on) list.add(lang); else list.delete(lang);
  return saveSettings({ lexicon_declined: [...list] });
}

// What the offer shows for each language: forms of one word, and who made the files.
const EXAMPLES = { ar: "كتب، يكتبون، سأكتبها", es: "hablo, hablaste, háblame", fr: "parle, parlons, parlez-moi", it: "parlo, parliamo, parlami",
  ru: "говорю, сказала, скажи", en: "run, ran, running", tl: "kumain, kakain, kinain", ja: "食べる、食べました、食べている", zh: "学习、學習",
  pt: "falo, falamos, fale-me", ca: "parlo, parlem, digues-m'ho", ceb: "mokaon, mikaon, gikaon",
  de: "spreche, sprach, fängt … an",
  fa: "می‌خواهم، خواستم، نمی‌خواهید" };
// Japanese and Chinese: a dictionary that does more than the other languages' tables.
const READERS = {
  ja: "For Japanese that needs a dictionary: it splits Japanese text into real words, so a tap lands on the whole word, gives each word's dictionary form, and shows furigana (small kana over kanji). It is IPADIC, from the Nara Institute of Science and Technology",
  zh: "For Chinese that needs a dictionary: it splits Chinese text into real words, so a tap lands on the whole word, shows pinyin over the characters coloured by tone, and treats simplified and traditional characters as the same word. It is CC-CEDICT with word counts from wordfreq",
};
const SOURCES = {
  tl: "the wordfreq word list for Filipino, which the app checks the roots it finds against (kumain, kakain, kinain: kain)",
  ceb: "a list of the commonest Bisaya words, counted from Bisaya web text in the OPUS NLLB collection, which the app checks the roots it finds against (mokaon, mikaon, gikaon: kaon)",
  en: "open word lists (Michal Měchura's lemmatization list and the wordfreq word counts) and the CMU Pronouncing Dictionary, which gives the US pronunciation shown in the word popup",
  ru: "the OpenRussian.org dictionary, which also gives each word's stress, so Russian text can show it (ла́дно)",
  fa: "Wiktionary's Persian words and verb tables, with the wordfreq word counts",
};
const WORD_LISTS = "open word lists (Michal Měchura's lemmatization lists and the wordfreq word counts)";

let offering = false;
let offerShown = null; // {lang, close} while the offer is on screen
/**
 * Ask someone learning Arabic whether to download its dictionaries. Shown when Arabic is chosen
 * as the language to learn, unless they are already here or the answer was "not now"
 * (Settings keeps the offer). `force` shows it regardless of an earlier "not now".
 */
export async function offerDictionaries(lang, force = false) {
  if (!usesDictionaries(lang) || offering || (!force && declined(lang))) return;
  if (document.documentElement.classList.contains("embed")) return; // the player shown inside another app

  let st;
  try { st = await lexiconStatus(lang); } catch { return; }
  if (st.installed || offering) return;
  offering = true;
  const name = (LANGUAGES[lang] || {}).name || "This language's";
  const mb = Math.max(1, Math.round(st.bytes / 1e6));
  const el = h(`<div class="lex-offer-back"><div class="lex-offer" role="dialog" aria-modal="true" aria-labelledby="lex-offer-title">
      <h2 id="lex-offer-title">${name} word dictionaries</h2>
      <p>Tamkeen can show which words are <span class="lex-new-sample">new to you</span>: a word you have
        never tapped is drawn in purple, and once you tap one, every form of that word counts as seen
        (<span class="ar" ${langAttrs(lang)}>${EXAMPLES[lang] || ""}</span>).</p>
      ${READERS[lang] ? `<p>${READERS[lang]}: a <strong>one-time download of about ${mb} MB</strong>. It stays on this
        device and nothing about you is sent anywhere.</p>` : needsDictionaries(lang)
    ? `<p>For ${name} that needs dictionaries: a <strong>one-time download of about ${mb} MB</strong>, made by the
        CAMeL Lab at New York University Abu Dhabi (Standard, Egyptian, Levantine and Gulf Arabic).
        They stay on this device and nothing about you is sent anywhere.</p>`
    : `<p>For ${name} that needs a table of word forms: a <strong>one-time download of about ${mb} MB</strong>, made from
        ${SOURCES[lang] || WORD_LISTS}. It stays on this
        device and nothing about you is sent anywhere. Without it, each spelling of a word counts as a different word.</p>`}
      <p class="small muted" id="lex-offer-note">You can do this later from Settings.</p>
      <div class="row lex-offer-actions">
        <button type="button" class="primary" data-act="get">Download</button>
        <button type="button" data-act="later">Not now</button>
      </div>
    </div></div>`);
  const close = () => { offering = false; offerShown = null; el.remove(); };
  offerShown = { lang, close };
  el.querySelector("[data-act=later]").onclick = () => {
    setDeclined(lang, true).catch(() => {});
    close();
  };
  el.querySelector("[data-act=get]").onclick = async (e) => {
    const note = el.querySelector("#lex-offer-note");
    e.target.disabled = true;
    e.target.textContent = "Downloading…";
    note.textContent = "This takes a few seconds.";
    try {
      await downloadDictionaries(lang);
      close();
      toast(`${name} dictionaries are ready. New words now show in purple.`);
    } catch (err) {
      e.target.disabled = false;
      e.target.textContent = "Try again";
      note.textContent = err.message;
      note.classList.add("lex-offer-error");
    }
  };
  document.body.append(el);
}

// Choosing a language with dictionaries as the one to learn (first run, Settings, or an install
// that was already learning it when this arrived) brings up the offer.
// During the first-run questions (components/onboarding.js) it waits until they are answered:
// that screen says when with the "tamkeen:onboarded" event.
const firstRunShowing = () => !settings().onboarded && !settings().welcome_seen;
onStudyLanguage((code) => {
  if (!usesDictionaries(code) || typeof document === "undefined") return;
  setTimeout(() => { if (!firstRunShowing()) offerDictionaries(code); }, 900);
});
if (typeof window !== "undefined") {
  window.addEventListener("tamkeen:onboarded", (e) => {
    const lang = (e.detail && e.detail.lang) || settings().study_language;
    setTimeout(() => offerDictionaries(lang), 500);
  });
}

// ---------- things to do once per language, when its words can first be worked out ----------
const started = new Set();
function onceReady(lang, dicts) {
  if (dicts.length || lang === "ru") upgradeKeys(lang, dicts).catch((e) => console.warn("Converting seen words failed", e));
  if (started.has(lang)) return;
  started.add(lang);
  // The first-run "I've already started" answer: that language's commonest words count as seen
  // (web/js/commonwords.js, the onboarding's own file; it clears the setting when it is done).
  if ((settings().common_words_pending || []).includes(lang)) {
    import("../commonwords.js").then((m) => m.addCommonWords(lang, dicts)).catch((e) => { started.delete(lang); console.warn(e); });
  }
  backfill(lang, dicts).catch((e) => { started.delete(lang); console.warn("Counting earlier words failed", e); });
}

// Russian is converted twice: once for е/ё and stress marks (no table needed), once for its table.
const UPGRADES = { es: "es:lemmas1", fr: "fr:lemmas1", it: "it:lemmas1", ru: "ru:lemmas1", en: "en:lemmas1", tl: "tl:lemmas1", ja: "ja:lemmas1", zh: "zh:lemmas1",
  pt: "pt:lemmas1", ca: "ca:lemmas1", ceb: "ceb:lemmas1", de: "de:lemmas1", fa: "fa:lemmas1" };
const upgradeMark = (lang, dicts) => (lang === "ru" && !dicts.length ? "ru:yo1" : dicts.length ? UPGRADES[lang] : null);
const upgrading = new Set();
/** Seen words kept before a language had its word table were kept by spelling (es|hablas|x).
 * Once the table is here, each of those also counts for its dictionary form (es|hablar|x), so
 * nothing seen turns new again. The old entries stay: they are harmless. Once per device per
 * table version (remembered in `lexemes_backfilled`, next to the other once-only jobs). */
async function upgradeKeys(lang, dicts) {
  const mark = upgradeMark(lang, dicts);
  if (!mark || upgrading.has(lang) || (settings().lexemes_backfilled || []).includes(mark)) return;
  upgrading.add(lang);
  try {
    await loadKnown();
    const items = [];
    for (const key of known) {
      const [code, word] = key.split("|");
      if (code !== lang || !word) continue;
      const x = lexemeOf(word, lang, dicts);
      if (x && x.key !== key) items.push(x);
    }
    await markLexemes(items);
    await saveSettings({ lexemes_backfilled: [...new Set([...(settings().lexemes_backfilled || []), mark])] });
  } finally {
    upgrading.delete(lang);
  }
}

/** Tokens of `sentence` that are the word `text` (compared the way lexemes are, not letter for letter). */
function findIn(tokens, text, lang) {
  const same = lang === "ar" ? (t) => matchForm(arabicCore(t)) : (t) => (lexemeOf(t, lang) || {}).key || "";
  const wanted = new Set(String(text || "").split(/\s+/).map(same).filter(Boolean));
  return tokens.map((t, i) => (wanted.has(same(t)) ? i : -1)).filter((i) => i >= 0);
}

/** Words tapped or saved before seen words were kept are seen too. Done once per language on each device. */
async function backfill(lang, dicts) {
  const done = settings().lexemes_backfilled || [];
  if (done.includes(lang)) return;
  const [lookups, vocab] = await Promise.all([api("/lexemes/lookups").catch(() => []), api("/vocab").catch(() => [])]);
  const found = [];
  const take = (tokens, picked, word) => {
    const all = lexemesFor(tokens, lang, dicts) || [];
    const hits = picked.map((i) => all[i]).filter(Boolean);
    if (hits.length) found.push(...hits);
    else for (const piece of String(word || "").split(/\s+/)) found.push(lexemeOf(piece, lang, dicts)); // no usable sentence
  };
  for (const d of lookups || []) {
    if (detectLanguage(d.word, lang) !== lang) continue;
    const { tokens, marked } = markedTokens(d.sentence);
    take(tokens, marked, d.word);
  }
  for (const v of vocab || []) {
    if (detectLanguage(v.text, lang) !== lang) continue;
    const tokens = String(v.sentence || "").split(/\s+/).filter(Boolean);
    take(tokens, findIn(tokens, v.text, lang), v.text);
  }
  await markLexemes(found.filter(Boolean));
  await saveSettings({ lexemes_backfilled: [...new Set([...(settings().lexemes_backfilled || []), lang])] });
}

// ---------- a text on screen ----------
/**
 * Colour the words of a text by whether they have been seen. `tokens` are its words, `els` the
 * elements showing them (same order). Returns at once; the colours appear when the list (and,
 * for Arabic, the dictionaries) have loaded.
 *
 *   .isNew(i)            has word i never been seen? (false while loading, and for non-words)
 *   .markSeen(i, j)      words i..j were tapped: they and every form of them are now seen
 *   .markNew(i, j)       make them new again
 *   .menuItems(i, j)     entries for the right-click menu ("Mark as seen" / "Mark as new")
 *   .paint(list, first)  colour other elements showing words first, first+1, ... (video captions)
 *   .onPaint             set to a function to be told whenever colours change
 *   .close()             the screen is going away
 */
export function seenWords({ tokens, lang, els }) {
  const view = {
    lang, lexemes: null, onPaint: null,
    isNew: (i) => !!(view.lexemes && view.lexemes[i] && !known.has(view.lexemes[i].key)),
    canMark: (i) => !!(view.lexemes && view.lexemes[i]),
    paint(list = els, first = 0) {
      // Russian with its table: the words show their stress (ла́дно), unless switched off in Settings.
      const stress = lang === "ru" && view.table && settings().ru_stress !== false;
      for (let k = 0; k < list.length; k++) {
        const el = list[k];
        el.classList.toggle("new", view.isNew(first + k));
        if (stress || el.dataset.stressed) {
          const text = stress ? stressed(tokens[first + k], view.table) : tokens[first + k];
          if (el.textContent !== text) el.textContent = text;
          if (stress) el.dataset.stressed = "1"; else delete el.dataset.stressed;
        }
      }
    },
    range: (i, j = i) => (view.lexemes ? view.lexemes.slice(i, j + 1).filter(Boolean) : []),
    markSeen: (i, j = i) => markLexemes(view.range(i, j)),
    markNew: (i, j = i) => forgetLexemes(view.range(i, j)),
    /** The right-click menu's entry for words i..j: mark as seen without looking them up, or as new again. */
    menuItems(i, j = i) {
      const words = view.range(i, j);
      if (!words.length) return [];
      return [words.some((w) => !known.has(w.key))
        ? { label: "✓ Mark as seen", run: () => markLexemes(words) }
        : { label: "↺ Mark as new", run: () => forgetLexemes(words) }];
    },
    async analyze() {
      const [dicts] = await Promise.all([dictionaries(lang), loadKnown(true)]);
      if (!views.has(view)) return;
      // No dictionaries yet: Arabic isn't coloured; Spanish, French and Italian go by spelling.
      const usable = dicts === null && !needsDictionaries(lang) ? [] : dicts;
      view.lexemes = usable === null ? null : lexemesFor(tokens, lang, usable);
      view.table = (usable || []).find((d) => d instanceof LemmaTable) || null;
      if (dicts === null) offerDictionaries(lang); // (unless the learner said "not now")
      if (usable !== null) onceReady(lang, usable);
      view.paint();
      if (view.onPaint) view.onPaint();
    },
    close: () => views.delete(view),
  };
  views.add(view);
  view.analyze().catch((e) => console.warn("Seen words unavailable", e));
  return view;
}
