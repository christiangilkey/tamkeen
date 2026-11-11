// The tools a card is put right with, shared by the back of a review card (pages/review.js) and a word
// opened on the Vocab list (components/wordeditor.js), so the two always work the same way:
//   - a text turned into its own text box by a tap (Enter or a tap elsewhere saves it, Esc puts it back),
//     with Copy under it;
//   - the sentence (or its translation) drawn with each word in a box of its own, and a word held down
//     to light it up as part of what is being learned, or to put it out;
//   - the Mnemonic maker: keywords that sound like the word, each with a picture for its meaning.
// What is saved is worked out in cardedit.js (no screen there); the Mnemonic maker's own logic is in
// mnemonic.js (the AI's) and freemnemonic.js (the free one, no key).

import { buzz, esc, h, readClipboard, saveSettings, state as app, toast } from "../app.js";
import { langInfo, setLang, wordRanges } from "../languages.js";
import { CARD_SENTENCE_MAX, litParts, litTextHtml, trimSpan, vowelPlaces } from "../cardtext.js";
import { hasOwnAudio, speakingSeconds, voiceText, voiceTimes } from "../cardvoice.js";
import { wordReading } from "../lexicon/readings.js";
import { dictionaries, downloadDictionaries } from "../lexicon/seen.js";
import { pickedCountry } from "../youtube-home.js";
import { MNEMONIC_COUNT, englishSounds, makeMnemonics, noteText, syllablePieces, turnDown, turnedDown, varietyOf } from "./mnemonic.js";
import { partBar } from "./partbar.js";
import { cleanSel, graphemes, isWhole, litLine, selText } from "./wordpart.js";
import { askMnemonic, definerConfig, noAi } from "../define-service.js";
import { aiMakes, chosenSource } from "../helpersource.js";
import { checkOwnKeywords, freeMnemonics, wordCoreOf } from "../examples.js";
import { kindName, leftOutLine, leftWordParts, soundCore } from "./wordcore.js";
import { learn, writePrefs } from "./freemnemonic.js";
import { capitalKeywords, learnOwn, learnsOwn, newCapitals, ownExamples } from "./ownmnemonic.js";
import { uidOf } from "./deck.js";
import { troubleshootButton } from "../components/troubleshoot.js";
import { offerFix } from "../components/fixit.js";
import { UI_LANGUAGES, t, uiLanguage } from "../i18n.js";

/** Pressing a word of the sentence this long lights it up (or puts it out). */
export const HOLD_MS = 450;
/** What a screen reader says for each text box a tap opens on a card. */
export const EDIT_LABELS = { text: "Edit the word", meaning: "Edit the meaning", sentence: "Edit the sentence", translation: "Edit the translation",
  notes: "Edit the grammar notes", memo: "Edit the memorization notes" };

/** The card's own small drawings (the review card's look: a little heavier than icons.js's). */
export const CARD_ICONS = {
  paste: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4.5" width="12" height="16" rx="2.2"/><path d="M9.5 4.5V3.5h5v1M9.5 11h5M9.5 14.5h3.5"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>`,
  down: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 13.5v-9h-3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1z"/><path d="M7.5 13.5l3.6 6.6a1.9 1.9 0 0 0 3.5-1.3l-.8-4.3h5a2 2 0 0 0 2-2.4l-1.3-6.4a2 2 0 0 0-2-1.7H7.5"/></svg>`,
};

// ---------------------------------------------------------------- how long a card's audio plays

/** How long the card's word (`part` "word") or sentence plays, in seconds, with the air the Vocab page's
 * player leaves round it: its own recording's times, else its kept voice's, else (a voice spoken live)
 * about as long as its text takes to say. "Say it" waits that long before it listens. */
export function partSeconds(v, part) {
  const times = hasOwnAudio(v) ? v : voiceTimes(v);
  if (part === "word") return times ? (times.end ?? times.start + 1) - times.start + 0.6 : speakingSeconds(voiceText(v).word);
  return times && times.sent_start != null ? Math.max(0.5, (times.sent_end ?? times.sent_start + 3) - times.sent_start) + 0.6
    : speakingSeconds(voiceText(v).sentence);
}

// ---------------------------------------------------------------- copying

/** Copy `text`, falling back to the old way where the clipboard can't be written directly. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* try the old way */ }
  const spare = document.createElement("textarea");
  spare.value = text;
  spare.style.cssText = "position:fixed;opacity:0;left:-999px;top:0";
  document.body.append(spare);
  spare.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* not supported */ }
  spare.remove();
  return ok;
}

/** Copy `text` and say so (a short buzz and "Copied"), or say it couldn't be. */
export async function copyAndSay(text) {
  text = String(text || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  const done = await copyText(text);
  if (!done) { toast(t("That couldn't be copied here."), { error: true }); return false; }
  buzz("tick");
  toast(t("Copied"), { timeout: 1500 });
  return true;
}

/** Memorization notes with what is on the clipboard put after what is there already (on a line of its
 * own), or null when nothing could be pasted (the learner is told why). */
export async function pastedInto(notes) {
  let text;
  try { text = await readClipboard(); } catch {
    toast("The clipboard couldn't be read here. Press and hold in the box and choose Paste instead.", { error: true });
    return null;
  }
  text = String(text || "").trim();
  if (!text) { toast("There is nothing copied to paste."); return null; }
  return String(notes || "").trim() ? `${String(notes).replace(/\s+$/, "")}\n${text}` : text;
}

// ---------------------------------------------------------------- a text turned into its own box

/**
 * Turn `line` (a text on a card) into a text box of its own, in the text's own font and size. Enter or a
 * tap elsewhere puts it away saved, Esc as it was; keys typed in it are typing, never the page's or the
 * card's. Under it Copy (which never takes the focus from the box) and any `extra` buttons
 * ([{label, icon, run(box)}]: Paste under Memorization notes). Options:
 *   value      what the box starts with
 *   label      what a screen reader calls it
 *   study      the language being learned, when the text is in it (its lang and direction come from it);
 *              else `lang` and `dir` (the learner's own language)
 *   multiline  notes: Enter makes a new line, and a Done button puts it away
 *   placeholder  what the empty box says (Memorization notes: memoPlaceholder())
 *   onInput()  something was typed (the card may need measuring again)
 *   onClose(save, value, next)   it was put away: saved or not, its text, and where the focus went
 * Returns {box, close(save, next)}.
 */
export function textBox(line, { value = "", label = "", study = "", lang = "", dir = "auto", multiline = false, extra = [],
  placeholder = "", onInput = () => {}, onClose = () => {} } = {}) {
  const box = document.createElement("textarea");
  box.className = "rv-editbox";
  box.rows = 1;
  box.value = value;
  if (placeholder) box.placeholder = placeholder;
  box.autocomplete = "off";
  box.setAttribute("enterkeyhint", multiline ? "enter" : "done");
  box.setAttribute("aria-label", label);
  if (study) setLang(box, study);
  else { if (lang) box.lang = lang; box.dir = dir; }
  const button = (html, text) => {
    const b = h(`<button type="button" class="rv-edit-copy">${html}<span></span></button>`);
    b.lastElementChild.textContent = text;
    b.title = text;
    b.addEventListener("mousedown", (e) => e.preventDefault());  // the box keeps the focus (and stays open)
    return b;
  };
  const copy = button(CARD_ICONS.copy, t("Copy"));
  const acts = document.createElement("div");
  acts.className = "rv-edit-acts";
  acts.append(copy);
  let busy = false;  // a button of the box at work: losing the focus meanwhile doesn't put it away
  for (const x of extra) {
    const b = button(x.icon || "", x.label);
    b.onclick = async () => {
      busy = true;
      try { await x.run(box); } finally { busy = false; }
      if (!closed) { grow(); onInput(); box.focus({ preventScroll: true }); }
    };
    acts.append(b);
  }
  if (multiline) {
    const done = button(CARD_ICONS.check, t("Done"));
    done.onclick = () => close(true);
    acts.append(done);
  }
  const wrap = document.createElement("div");
  wrap.className = "rv-editing";
  wrap.append(box, acts);
  line.classList.add("editing");
  line.replaceChildren(wrap);

  let closed = false;
  function close(save, next = null) {
    if (closed) return;
    closed = true;
    line.classList.remove("editing");
    onClose(save, box.value, next);
  }
  const grow = () => { box.style.height = "auto"; box.style.height = `${box.scrollHeight}px`; };
  box.addEventListener("input", () => { grow(); onInput(); });
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();  // Space, 1, 2, the arrows, W, S, P, N, Z, Del: typing here, not the card's keys
    if (e.isComposing || e.keyCode === 229) return;  // (still choosing characters: a Japanese or Chinese keyboard)
    if (e.key === "Enter" && !multiline) { e.preventDefault(); close(true); }
    else if (e.key === "Escape") { e.preventDefault(); close(false); }
  });
  box.addEventListener("blur", (e) => { if (!busy) close(true, e.relatedTarget); });
  // The Copy button keeps the box open: it never takes the focus from it (nor does the old way of
  // copying, where the clipboard can't be written directly: it selects a hidden box for a moment).
  copy.onclick = async () => {
    if (!box.value.trim()) return;
    busy = true;
    await copyAndSay(box.value);
    busy = false;
    if (!closed) box.focus({ preventScroll: true });
  };
  grow();
  box.focus({ preventScroll: true });
  box.setSelectionRange(box.value.length, box.value.length);
  box.scrollIntoView({ block: "nearest" });
  return { box, close };
}

// ---------------------------------------------------------------- the sentence, with its words to hold

/**
 * Draw `v[field]` ("sentence" or "translation") into `line` by the Vocab list's renderer (cardtext.js
 * litTextHtml): lit where its ⟦ ⟧ marks say (else, in the sentence, the card's word where it is found),
 * each word in a box of its own (`.rv-tok`, saying where it is in the text) so it can be held. A long text
 * shows the part round its lit word; where that part starts and ends is kept in `cuts` while the card is
 * open, so lighting a word never makes the line jump. `lang` is the text's language (its words);
 * `vowelled` the sentence with vowel marks when they came (Arabic, "Show vowels"). Hidden when empty.
 */
export function drawLitLine(line, v, field, { cuts, lang, vowelled = "" }) {
  const sentence = field === "sentence";
  const { text, marks } = litParts(v[field] || "", sentence ? v.text : null);
  line.hidden = !text.trim();
  if (line.hidden) { line.innerHTML = ""; return; }
  let cut = cuts.get(field);
  if (!cut || cut.text !== text) {
    const focus = marks[0] || [0, 0];
    cut = { text, ...trimSpan(text, focus[0], focus[1], CARD_SENTENCE_MAX) };
    cuts.set(field, cut);
  }
  const places = sentence && vowelled ? vowelPlaces(text, vowelled) : null;
  line.innerHTML = (cut.before ? "…" : "") + litTextHtml(text, marks, esc, {
    words: wordRanges(text, lang), from: cut.lo, to: cut.hi,
    shown: places ? (a, b) => vowelled.slice(places[a], places[b]) : null,
  }) + (cut.after ? "…" : "");
}

/**
 * Holding a word (`.rv-tok`) inside `area` for HOLD_MS calls `onHold(tok)`: it tints while pressed, moving
 * a finger 8 px (a scroll) or letting go sooner is an ordinary tap, and the click after a hold is swallowed
 * (so it doesn't open the text for typing as well). The phone's own long-press menu doesn't open over it.
 * `can()` says whether holding is possible now. (The review card has its own, inside its swipes.)
 * Returns stop(), which takes it off `area` again.
 */
export function holdWords(area, { onHold, can = () => true }) {
  const off = new AbortController();
  const on = (type, fn, capture = false) => area.addEventListener(type, fn, { capture, signal: off.signal });
  let press = null;
  let heldAt = 0;
  const end = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press.tok.classList.remove("pressing");
    press = null;
  };
  on("pointerdown", (e) => {
    if (e.button > 0 || !can()) return;
    const tok = e.target.closest ? e.target.closest(".rv-tok") : null;
    if (!tok || !area.contains(tok) || tok.closest(".editing")) return;
    end();
    const p = { tok, id: e.pointerId, x: e.clientX, y: e.clientY };
    press = p;
    tok.classList.add("pressing");
    p.timer = setTimeout(() => {
      if (press !== p) return;
      end();
      heldAt = Date.now();
      buzz("tick");
      onHold(tok);
    }, HOLD_MS);
  });
  on("pointermove", (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) end();
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) on(type, end);
  on("click", (e) => {
    if (Date.now() - heldAt > 900) return;
    heldAt = 0;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  on("contextmenu", (e) => { if (e.target.closest && e.target.closest(".rv-tok")) e.preventDefault(); });
  return () => { end(); off.abort(); };
}

// ---------------------------------------------------------------- the Mnemonic maker

// What it came up with for each word while the app is open: {pron, items, parts, checked, asked, shown,
// kept} (`shown`: every keyword shown for the word so far, left out of the next "Make 5 more"; `kept`:
// those put in Memorization notes with Use). The review card and the Vocab list share it, so keywords
// made on one show on the other. Keywords turned down are kept on this device (mnemonic.js turnDown)
// and never suggested for the word again.
const mnemonics = new Map();
// The part of each card's word highlighted on the Mnemonic maker's bar while the app is open: uid -> {text, sel}.
const chosen = new Map();
// How a free keyword is tied to the word's meaning (freemnemonic.js ties), for its mark's tooltip.
const TIE_NOTES = {
  s: "It means the same thing, or a kind of it", p: "One is a part of the other", d: "Its meaning is close to the word's",
  k: "The word's meaning is a kind of it", g: "It goes with the word's meaning", v: "It goes with the word's meaning",
};
const avoidStore = () => { try { return window.localStorage; } catch { return null; } };
let englishTable = null;  // a promise of the English word table (its CMU pronunciations), or null
/** English speakers: each keyword's sounds from the CMU Pronouncing Dictionary in the English word table,
 * downloaded once in the background (0.6 MB) while the AI thinks, like Dictionary first's dictionaries.
 * Resolves to mnemonic.js englishSounds, or null when the table can't be had (the AI's IPA is used then). */
function englishCheck() {
  if (!englishTable) {
    englishTable = (async () => {
      let dicts = await dictionaries("en");
      if (!dicts) { await downloadDictionaries("en"); dicts = await dictionaries("en"); }
      return (dicts || []).find((d) => d && d.ipa) || null;
    })().catch(() => null).then((table) => { if (!table) englishTable = null; return table; });
  }
  return englishTable.then((table) => (table ? englishSounds(table) : null));
}

/** How the card's word is said, as far as this device knows, for the AI to follow: Arabic with its vowel
 * marks (as shown on the card with "Show vowels" on, or as typed), else the dictionaries' reading. */
async function readingOf(v, lang, shown) {
  if (lang === "ar") return [shown, v.text].find((x) => /[ً-ْٰ]/.test(x || "")) || "";
  return wordReading(v.text, lang);
}

/** The free maker learns the learner's taste from Use (+1) and thumbs down (−1): freemnemonic.js learn,
 * kept in the synced setting `mnemonic_prefs` (Settings → Word definitions → Mnemonic maker can forget it). */
function tasteFrom(s, sign, st) {
  if (!s.traits) return;  // (the AI's suggestions)
  const now = (app.status && app.status.settings || {}).mnemonic_prefs;
  const others = [...st.items, ...st.parts].filter((x) => x !== s && x.traits).map((x) => x.traits);
  saveSettings({ mnemonic_prefs: writePrefs(learn(now, s.traits, sign, others)) }).catch(() => { /* kept next time */ });
}

/** Has the Mnemonic maker already made keywords for this card while the app has been open? */
export const hasMnemonics = (v) => mnemonics.has(uidOf(v));

// ---------------------------------------------------------------- learning from the learner's own mnemonics

const appSettings = () => (app.status && app.status.settings) || {};
/** What an empty Memorization notes box says: with "Learn from my own mnemonics" on, that the sound-alike goes
 * in capitals (only those words teach the Mnemonic maker). */
export const memoPlaceholder = () => (learnsOwn(appSettings()) ? t("Sound-alike in CAPITALS: a duck sitting on a POT…")
  : t("A mnemonic, a picture, where you heard it…"));

const TIP_KEY = "tamkeen.mnemonicCapsTip";  // (this device: the tip about capitals has been shown)
const LINE_MS = 4000;

/** A quiet line for a moment under `after` (the notes' box), read out politely; a short note at the bottom of
 * the screen instead when the box has gone (the card was answered meanwhile). */
export function noteLine(after, text) {
  if (!text) return;
  if (!after || !after.isConnected) { toast(text, { timeout: LINE_MS }); return; }
  let line = after.nextElementSibling;
  if (!line || !line.classList.contains("mn-learned")) {
    line = document.createElement("p");
    line.className = "mn-learned";
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    after.after(line);
  }
  clearTimeout(line._gone);
  line.textContent = "";
  setTimeout(() => { line.textContent = text; }, 60);  // (filled after it is there, so a screen reader says it)
  line._gone = setTimeout(() => line.remove(), LINE_MS);
}

/**
 * Memorization notes of card `v` were saved, from `before` to `after` (typed by the learner): the free Mnemonic
 * maker learns from the sound-alikes in CAPITALS that are new (review/ownmnemonic.js), when they really sound
 * like the word. In the background, after the save; nothing is downloaded, and without the word lists or a
 * connection it quietly does nothing. Says what happened under `at` (noteLine) unless `quiet`. `skip`: keywords
 * the maker suggested for the card besides those it made while the app is open; `shown` the word as the card
 * shows it (Arabic with its vowels). Resolves to {learned: ["POT"], failed: ["DUCK"]} or null; never fails.
 */
export async function learnFromNote(v, before, after, { lang, at = null, quiet = false, skip = [], shown = "" } = {}) {
  try {
    if (!learnsOwn(appSettings())) return null;
    const was = String(before || "").trim(), now = String(after || "").trim();
    if (!now || was === now) return null;
    const made = mnemonics.get(uidOf(v));
    // (the sound check is against the word's own part, review/wordcore.js: POT counts for الكتاب's "kitaab"; the
    // core itself in capitals is no sound-alike, as the word isn't)
    const core = soundCore(v.text, lang).core;
    const fresh = newCapitals(was, now, { skip: [...skip, ...(made ? made.shown : []), core], word: v.text, meaning: v.meaning });
    if (!fresh.length) {
      // The first note saved with no capitals at all: say once (on this device) how it can learn from one.
      if (!quiet && at && !capitalKeywords(now).length && !tipShown()) {
        tipDone = true;
        noteLine(at, t("Tip: write the sound-alike word in CAPITALS and the Mnemonic maker learns from it."));
        try { localStorage.setItem(TIP_KEY, "1"); } catch { /* storage unavailable: once while the app is open */ }
      }
      return null;
    }
    const reading = await readingOf(v, lang, shown).catch(() => "");
    const got = await checkOwnKeywords(v, lang, fresh, { reading, speaks: uiLanguage() });
    if (!got || (!got.passed.length && !got.failed.length)) return null;  // (its sounds aren't known here)
    const learned = got.passed.map((k) => k.shown), failed = got.failed.map((k) => k.shown);
    if (learned.length) {
      const p = learnOwn(appSettings().mnemonic_prefs, got.passed, { v, note: now });
      await saveSettings({ mnemonic_prefs: writePrefs(p) });
    }
    if (!quiet) {
      noteLine(at, learned.length ? t("Learned from {0}", learned.join(", "))
        : failed.length === 1 ? t("{0} doesn't sound like {1}, so nothing was learned.", failed[0], core)
          : t("{0} don't sound like {1}, so nothing was learned.", failed.join(", "), core));
    }
    return { learned, failed };
  } catch (e) {
    console.warn("Couldn't learn from the note", e);
    return null;
  }
}
let tipDone = false;
const tipShown = () => { if (tipDone) return true; try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return false; } };

/** The Mnemonic maker's markup: the part picker, its button, how the word sounds, a note, and the keywords. */
export function mnemonicHtml() {
  return `<div class="rv-mnemo">
    <div class="rv-part" hidden><div class="rv-part-label">Make keywords for</div><div class="rv-part-host"></div>
      <p class="rv-part-hint" role="status"></p></div>
    <button type="button" class="rv-mnemo-go">${CARD_ICONS.bulb}<span>Mnemonic maker</span></button>
    <div class="rv-mnemo-said" hidden><div class="rv-mnemo-said-label">How it sounds</div><div class="rv-mnemo-syl" translate="no"></div><div class="rv-mnemo-core" translate="no" hidden></div>
      <p class="rv-mnemo-part" hidden></p></div>
    <p class="rv-mnemo-note" hidden></p>
    <p class="rv-mnemo-few" hidden></p>
    <ul class="rv-mnemo-list" hidden></ul>
  </div>`;
}

/**
 * Make the Mnemonic maker in `box` (mnemonicHtml) work for card `v`.
 *   lang        the language being learned (the card's)
 *   shownWord   () => the word as the card shows it now (Arabic with its vowels, when shown)
 *   onUse(text) Use was pressed: put `text` (the keyword and its picture) at the end of Memorization notes
 *   onLayout()  the maker grew or shrank (the review card measures whether there is more below)
 */
export function mnemonicMaker(box, v, { lang, shownWord = () => "", onUse = () => {}, onLayout = () => {} }) {
  const go = box.querySelector(".rv-mnemo-go"), note = box.querySelector(".rv-mnemo-note"), few = box.querySelector(".rv-mnemo-few");
  const list = box.querySelector(".rv-mnemo-list"), said = box.querySelector(".rv-mnemo-said");
  const label = go.querySelector("span");
  const uid = uidOf(v);
  const speaks = (UI_LANGUAGES[uiLanguage()] || UI_LANGUAGES.en).name;
  const say = (text, error = false) => { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("error", error); };
  const sayFew = (text) => { few.hidden = !text; few.textContent = text || ""; };
  // Space and Enter on its buttons press them, and never answer the card (the reviewer's keys are on the document).
  box.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target.closest("button")) e.stopPropagation(); });

  /** The word's syllables ("ni-YYA", the stressed one in capitals), with those a keyword sounds like lit:
   * one lit run per keyword (a split keyword's runs joined by " + "). */
  function soundsLine(el, pron, s) {
    const pieces = syllablePieces(pron);
    el.textContent = "";
    el.hidden = !pieces.length;
    const run = (from, to, lit) => {
      if (from > to) return;
      const span = document.createElement(lit ? "b" : "span");
      span.textContent = pieces.slice(from, to + 1).map((p) => p.text).join("-");
      el.append(span);
    };
    const n = pieces.length;
    if (s.pieces) {  // a split keyword: each piece's syllables, then the ones no piece covers
      let at = 0;
      s.pieces.forEach((p, i) => {
        if (i) el.append(" + ");
        run(Math.max(at, p.from), Math.min(p.to, n - 1), true);
        at = Math.max(at, p.to + 1);
      });
      if (at < n) { el.append("-"); run(at, n - 1, false); }
    } else {
      const from = Math.max(0, s.from), to = Math.min(n - 1, s.to);
      run(0, from - 1, false);
      if (from > 0) el.append("-");
      run(from, to, true);
      if (to < n - 1) el.append("-");
      run(to + 1, n - 1, false);
    }
  }

  /** Use: put `s` (keyword and picture) at the end of Memorization notes, a blank line under what the
   * learner wrote, saved like typing. */
  function keep(s, st, button) {
    onUse(noteText(s));
    st.kept.add(s.keyword);
    tasteFrom(s, +1, st);
    buzz("tick");
    kept(button);
  }
  const kept = (button) => {
    button.classList.add("done");
    button.disabled = true;
    button.innerHTML = `${CARD_ICONS.check}<span></span>`;
    button.lastElementChild.textContent = t("Added");
    button.title = t("Added to Memorization notes");
  };

  function row(s, st) {
    const li = h(`<li class="rv-mn">
      <div class="rv-mn-top">
        <span class="rv-mn-word" translate="no"></span>
        <span class="rv-mn-acts">
          <button type="button" class="rv-mn-use" title="Put it in Memorization notes">Use</button>
          <button type="button" class="rv-mn-btn rv-mn-drop" title="Not this one: never suggest it for this word again" aria-label="Not this one">${CARD_ICONS.down}</button>
        </span>
      </div>
      <div class="rv-mn-how"><span class="rv-mn-sounds" translate="no"></span></div>
      <p class="rv-mn-scene" translate="no"></p>
    </li>`);
    li.querySelector(".rv-mn-word").textContent = s.keyword;
    soundsLine(li.querySelector(".rv-mn-sounds"), st.pron, s);
    const how = li.querySelector(".rv-mn-how");
    if (s.sound === "close") how.append(h(`<span class="rv-mn-mark close" title="It sounds close to the word">Close match</span>`));
    else if (s.sound === "partial") how.append(h(`<span class="rv-mn-mark" title="It sounds like part of the word, or roughly like it">Partial match</span>`));
    if (s.link === 2) {
      const fits = h(`<span class="rv-mn-mark fits">Fits the meaning</span>`);
      if (s.linkNote) fits.title = s.linkNote;
      if (s.tie && TIE_NOTES[s.tie]) fits.title = t(TIE_NOTES[s.tie]);
      how.append(fits);
    } else if (s.link === 1 && s.tie) {
      // (the free maker: a looser tie to the meaning, review/freemnemonic.js)
      const related = h(`<span class="rv-mn-mark fits">Related in meaning</span>`);
      if (TIE_NOTES[s.tie]) related.title = t(TIE_NOTES[s.tie]);
      how.append(related);
    }
    if (s.own) {
      // (a sound-alike the learner wrote in CAPITALS in a note of their own: review/ownmnemonic.js)
      const mine = h(`<span class="rv-mn-mark own"></span>`);
      mine.textContent = t("You've used this before");
      mine.title = t("You wrote this sound-alike in CAPITALS in one of your own notes");
      how.append(mine);
    }
    const scene = li.querySelector(".rv-mn-scene");
    scene.textContent = s.scene || "";
    scene.hidden = !s.scene;
    const up = li.querySelector(".rv-mn-use");
    if (st.kept.has(s.keyword)) kept(up);
    else up.onclick = () => keep(s, st, up);
    li.querySelector(".rv-mn-drop").onclick = () => {
      turnDown(avoidStore(), uid, s.keyword);
      tasteFrom(s, -1, st);
      st.items = st.items.filter((x) => x !== s);
      st.parts = st.parts.filter((x) => x !== s);
      buzz("tick");
      li.remove();
      if (!st.items.length && !st.parts.length) { list.hidden = true; sayFew(""); say(t("You turned them all down. Press Make 5 more for new ones.")); }
      onLayout();
    };
    return li;
  }

  function draw(st) {
    list.innerHTML = "";
    const all = [...st.items, ...st.parts];
    for (const s of all) list.append(row(s, st));
    list.hidden = !all.length;
    const pieces = syllablePieces(st.pron);
    said.hidden = !pieces.length;
    const line = said.querySelector(".rv-mnemo-syl");
    // Keywords for a part of the word (the bar above): the whole word's sounds with that part lit, when the
    // whole is known (the free maker); else the part's own sounds (the AI gave only those).
    line.textContent = "";
    const lit = st.wholePron && st.partSounds ? litLine(st.wholePron, st.partSounds[0], st.partSounds[1]) : [];
    if (lit.length) {
      for (const x of lit) { const el = document.createElement(x.lit ? "b" : "span"); el.textContent = x.text; line.append(el); }
    } else line.textContent = pieces.map((p) => p.text).join("-");
    const shownPron = lit.length ? st.wholePron : st.pron;
    line.title = shownPron && shownPron.ipa ? `/${shownPron.ipa.replace(/^\/|\/$/g, "")}/` : "";
    const only = said.querySelector(".rv-mnemo-part");
    only.textContent = st.partSub ? t("Keywords for {0} only.", st.partSub) : "";
    only.hidden = !st.partSub;
    // What the keywords leave out of the word (review/wordcore.js): "al- (“the”) left out" (translated by t() there,
    // hence translate="no"); its tooltip names each part's kind.
    const left = said.querySelector(".rv-mnemo-core");
    if (left) {
      left.textContent = leftOutLine(st.core);
      left.hidden = !left.textContent;
      left.title = leftWordParts(st.core).map((d) => `${d.part}: ${kindName(d.kind)}`).join("\n");
    }
    relabel();
    if (!all.length) say("No new keywords sounded close enough to the word. Press Make 5 more to try again.");
    else if (st.free && st.keywordLangs && st.keywordLangs[0] !== "en") {
      say(st.keywordLangs.length > 1
        ? t("Words of your language, and English ones, that sound like it, found on this device without AI, each with a picture for its meaning. Use puts one in Memorization notes; thumbs down drops it for good.")
        : t("Words of your language that sound like it, found on this device without AI, each with a picture for its meaning. Use puts one in Memorization notes; thumbs down drops it for good."));
    } else if (st.free) say(t("English words that sound like it, found on this device without AI, each with a picture for its meaning. Use puts one in Memorization notes; thumbs down drops it for good."));
    else say(`${speaks} words that sound like it, each with a picture for its meaning. Use puts one in Memorization notes; thumbs down drops it for good.`);
    // Fewer than five that pass: only those are shown, and the card says so.
    const n = all.length;
    sayFew(!n ? "" : !st.checked ? "Their sound couldn't be checked this time."
      : n === 1 ? "Only 1 keyword sounded close enough to show." : n < MNEMONIC_COUNT ? `Only ${n} keywords sounded close enough to show.` : "");
    // AI chosen in Settings, but it can't be used (turned off, or no key): these came from the free maker, and the
    // card says so with the way to the setting, rather than quietly giving free ones.
    if (st.aiMissing) {
      const why = h(`<span class="rv-mnemo-ai-off"></span>`);
      why.textContent = ` ${t("You chose AI for the Mnemonic maker, but AI is off or has no key yet, so these were found on this device.")} `;
      const go = h(`<a class="link"></a>`);
      go.href = "#/settings?s=words&show=mnemonicsource";
      go.textContent = t("Change it in Settings");
      why.append(go);
      note.hidden = false;
      note.append(why);
    }
    onLayout();
  }

  // ----- choosing a part of the word: the bar above the button (partbar.js) -----
  // The word as the card shows it, the whole of it highlighted; the learner drags the highlight's ends between
  // letters. The choice is kept per card while the app is open (`chosen`), so the review card and the Vocab list agree.
  const shownText = (shownWord() || v.text || "").trim();
  const letters = graphemes(shownText);
  const partBox = box.querySelector(".rv-part"), hint = box.querySelector(".rv-part-hint");
  let bar = null;
  const sel = () => {
    const c = chosen.get(uid);
    return c && c.text === shownText ? cleanSel(c.sel, letters.length) : { from: 0, to: letters.length };
  };
  /** The part chosen now: {key, sub, from, to}, or null for the whole word. */
  const partNow = () => {
    const c = sel();
    if (!letters.length || isWhole(c, letters)) return null;
    return { key: `${c.from}-${c.to}`, sub: selText(letters, c), from: c.from, to: c.to };
  };
  /** What the button will do: more of the same, or keywords for the part (or the whole word) chosen since. */
  function relabel() {
    const st = mnemonics.get(uid), now = partNow();
    const madeFor = st ? st.partKey || "" : null;
    if (madeFor !== null && madeFor === (now ? now.key : "")) label.textContent = "Make 5 more";
    else if (now) label.textContent = t("Make keywords for {0}", now.sub);
    else label.textContent = st ? t("Make keywords for the whole word") : "Mnemonic maker";
  }
  function paintHint() {
    const now = partNow();
    hint.textContent = "";
    if (!now) { hint.textContent = t("Drag the blue ends to pick just a part of the word."); return; }
    hint.append(t("Only {0} is chosen.", now.sub), " ");
    const whole = h(`<button type="button" class="link rv-part-whole"></button>`);
    whole.textContent = t("Whole word");
    whole.onclick = () => { chosen.delete(uid); if (bar) bar.set({ from: 0, to: letters.length }); buzz("tick"); paintHint(); relabel(); onLayout(); };
    hint.append(whole);
  }
  if (letters.filter((g) => /[\p{L}\p{N}]/u.test(g)).length > 1) {
    partBox.hidden = false;
    bar = partBar(box.querySelector(".rv-part-host"), {
      text: shownText, lang, sel: sel(),
      label: t("The part of the word to make keywords for. Left and right move an end of the highlight; Enter switches ends."),
      onChange: (next) => { chosen.set(uid, { text: shownText, sel: next }); paintHint(); relabel(); onLayout(); },
    });
    paintHint();
  }

  const had = mnemonics.get(uid);
  if (had) draw(had);
  else relabel();
  go.onclick = async () => {
    go.disabled = true;
    label.textContent = "Thinking…";
    say("");
    sayFew("");
    try {
      const studyName = (langInfo(lang) || {}).name || "the language being learned";
      const before = mnemonics.get(uid);
      const shown = before ? before.shown : [];
      const avoid = [...new Set([...shown, ...turnedDown(avoidStore(), uid)])].slice(-40);
      const reading = await readingOf(v, lang, shownWord());
      // Both makers match only the word's own part: الكتاب's "kitaab", not "al-kitaab"; "der Hund, -e"'s Hund
      // (review/wordcore.js, with the examples file as its word list when it is here). The card's word stays as it is.
      const core = await wordCoreOf(v.text, lang, reading).catch(() => soundCore(v.text, lang, { reading }));
      if (!core.reading && reading && lang !== "ar" && core.core !== String(v.text || "").trim()) {
        core.reading = await wordReading(core.core, lang).catch(() => "") || "";  // (the reading of the core itself)
      }
      // The free maker (examples.js freeMnemonics: keywords found on this device) when the learner chose
      // Free in Settings → Word definitions, or has no AI key (or AI turned off); else the AI's
      // (helpersource.js aiMakes). A key that turns out missing falls back to the free one.
      const settings = (app.status && app.status.settings) || {};
      // ("Learn from my own mnemonics": the free maker offers the learner's own sound-alikes again, and the AI
      // sees a few of their notes as examples of their style; review/ownmnemonic.js)
      const own = learnsOwn(settings);
      // (a part of the word chosen on "How it sounds": keywords for those syllables only)
      // (a part of the word highlighted on the bar: keywords for the sounds of those letters only)
      const part = partNow();
      const free = () => freeMnemonics(v, lang, { reading, avoid, speaks: uiLanguage(), prefs: settings.mnemonic_prefs, ownWords: own, core,
        part: part ? { shown: shownText, from: part.from, to: part.to } : null });
      const aiUsable = !noAi() && !!definerConfig().key;
      let got, aiMissing = false;
      if (!aiMakes(settings, "mnemonic", aiUsable)) {
        got = await free();
        aiMissing = chosenSource(settings, "mnemonic") === "ai" && !aiUsable;
      } else {
        try {
          got = await makeMnemonics(v, {
            ask: askMnemonic, study: studyName, speaks, avoid, reading: core.reading, core,
            variety: varietyOf(lang, pickedCountry(lang), studyName),
            ownSounds: uiLanguage() === "en" ? englishCheck() : null,
            examples: own ? ownExamples(settings.mnemonic_prefs).filter((e) => e.word !== v.text) : [],
            partText: part ? part.sub : "",
          });
        } catch (e) {
          if (!(e && e.message === "NO_KEY")) throw e;
          got = await free();
          aiMissing = true;
        }
      }
      const st = { ...got, core: got.core || core, shown: [...shown, ...got.items.map((s) => s.keyword), ...got.parts.map((s) => s.keyword)], kept: before ? before.kept : new Set(),
        partKey: part ? part.key : "", partSub: part ? part.sub : "", aiMissing };
      mnemonics.set(uid, st);
      if (go.isConnected) draw(st);
    } catch (e) {
      if (!go.isConnected) return;
      relabel();
      const why = e && e.message;
      say(why === "NO_KEY" ? "The Mnemonic maker uses your AI key. Add one in Settings → Word definitions."
        : why === "NO_KEYWORDS" ? t("The Mnemonic maker needs its list of English words the first time (0.2 MB). Check your connection and try again.")
        : why === "NO_SOUNDS" ? t("The word's sounds couldn't be worked out, so no keywords could be found.")
        : why === "NO_PART_SOUND" ? t("That part has no vowel sound of its own to match. Highlight a little more of the word.")
        : why || "That didn't work. Try again.", true);
      offerFix(e);  // no key, or a refused one: the popup with the way to Settings
      const fix = troubleshootButton(e);
      if (fix) note.append(" ", fix);
      onLayout();
    } finally {
      go.disabled = false;
    }
  };
}
