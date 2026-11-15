// A pronunciation score on screen: the overall score out of 100, accuracy, fluency and completeness, and the
// line with each word coloured (green said well, amber nearly, red said wrongly or left out). Tapping a word
// says what was off and lets the learner hear it said properly. The score comes from Azure's pronunciation
// check with the learner's own Azure key (pronscore.js). Shared by every version: the flashcards' and the
// word editor's "Say it" (review/pronounce.js), and Library → Conversation's "Say it yourself".

import { esc, h, state } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs } from "../languages.js";
import { stripMarks } from "../cardtext.js";
import { sayText } from "../saytext.js";
import { azureVoiceOf, cardDialect, cardLanguage } from "../voiceplay.js";
import { assess, azureKeyReady, band, pronLocale, referenceText, wav16k } from "../pronscore.js";

const settings = () => (state.status && state.status.settings) || {};

/** Can attempts in `lang` (Arabic: of `dialect`) be scored here: an Azure key, and a language Azure checks. */
export function canScore(lang, dialect = "") {
  return azureKeyReady(settings()) && !!pronLocale(lang, { dialect });
}

/**
 * A function that scores an attempt at `text` (in `lang`; Arabic: `dialect`): (samples, rate) => Promise of
 * the score (pronscore.js parseAssessment). Null when it can't be scored here (no Azure key, or a language
 * Azure doesn't check), so callers can leave scoring out.
 */
export function scorer({ text, lang, dialect = "" }) {
  const line = referenceText(text);
  if (!line || !canScore(lang, dialect)) return null;
  return async (samples, rate) => {
    const s = settings();
    let voice = "";
    try { voice = (await azureVoiceOf(lang, s, dialect)) || ""; } catch { /* the language's usual accent */ }
    const locale = pronLocale(lang, { dialect, voice });
    return assess({ key: s.tts_key_azure, region: s.tts_region_azure, locale, text: line, wav: wav16k(samples, rate) });
  };
}

/** The scorer for a card's "Say it": against what the native recording says (`part`: "sentence" or "word"). */
export function cardScorer(v, part) {
  const text = part === "sentence" ? stripMarks(v.sentence || "") : v.text;
  return scorer({ text, lang: cardLanguage(v), dialect: cardDialect(v) });
}

const WORD_NOTES = {
  omission: "Left out.",
  insertion: "Not in the line: said extra.",
  mispronunciation: "Said differently from the native way.",
};

/**
 * The score drawn as an element. `lang` / `dialect`: for drawing the words and saying one properly.
 * A score where nothing was heard says so.
 */
export function scoreView(result, { lang, dialect = "" } = {}) {
  const el = h(`<div class="pron-result" role="group"></div>`);
  el.setAttribute("aria-label", t("Pronunciation score"));
  if (!result || !result.heard) {
    el.append(h(`<p class="pron-none">Azure couldn't hear any speech in that. Try again, a little closer to the microphone.</p>`));
    return el;
  }
  const main = band(result.overall);
  const head = h(`<div class="pron-head">
    <div class="pron-big ${main}"><b translate="no"></b><span>Pronunciation</span></div>
    <dl class="pron-parts"></dl></div>`);
  head.querySelector("b").textContent = result.overall == null ? "–" : String(result.overall);
  const parts = head.querySelector(".pron-parts");
  for (const [name, value] of [["Accuracy", result.accuracy], ["Fluency", result.fluency], ["Completeness", result.completeness]]) {
    if (value == null) continue;
    const row = h(`<div><dt></dt><dd translate="no"></dd></div>`);
    row.firstElementChild.textContent = t(name);
    row.lastElementChild.textContent = String(value);
    parts.append(row);
  }
  el.append(head);
  if (result.words.length) {
    const line = h(`<p class="pron-words" ${langAttrs(lang)}></p>`);
    const note = h(`<div class="pron-note" hidden></div>`);
    result.words.forEach((w, i) => {
      if (i) line.append(" ");
      const b = h(`<button type="button" class="pron-word ${band(w.score, w.error)}${w.error === "omission" ? " gone" : ""}${w.error === "insertion" ? " extra" : ""}"></button>`);
      b.textContent = w.word;
      b.onclick = () => {
        for (const x of line.querySelectorAll(".on")) x.classList.remove("on");
        b.classList.add("on");
        note.hidden = false;
        note.innerHTML = "";
        const top = h(`<p><strong ${langAttrs(lang)}></strong> <span class="pron-score" translate="no"></span></p>`);
        top.querySelector("strong").textContent = w.word;
        top.querySelector(".pron-score").textContent = w.score == null ? "" : t("{0} out of 100", w.score);
        note.append(top);
        const what = WORD_NOTES[w.error];
        if (what) { const p = h(`<p class="small"></p>`); p.textContent = t(what); note.append(p); }
        // Sound names come only for English and Chinese; elsewhere Azure scores the sounds without naming them.
        const weak = w.phonemes.filter((p) => p.phoneme && p.score != null && p.score < 60);
        if (weak.length) {
          const p = h(`<p class="small"><span>Sounds to work on:</span> <span translate="no"></span></p>`);
          p.lastElementChild.textContent = weak.map((x) => `/${x.phoneme}/ ${x.score}`).join(" · ");
          note.append(p);
        }
        if (w.error !== "insertion") {
          const say = h(`<button type="button" class="ghost pron-say">${icon("sound", 15)} <span>Hear it said</span></button>`);
          say.onclick = () => sayText(w.word, lang, { dialect });
          note.append(say);
        }
      };
      line.append(b);
    });
    el.append(line, note);
    const poor = result.words.filter((w) => band(w.score, w.error) === "poor").length;
    const tip = h(`<p class="pron-tip small muted"></p>`);
    tip.textContent = poor ? t("Tap a red word to see what was off.") : t("Every word came through clearly.");
    el.append(tip);
  }
  return el;
}

/** Show `result` right after `host` (in place of the score shown before), or a short note for an error. */
export function showScore(host, result, { lang, dialect = "", error = null } = {}) {
  const old = host.nextElementSibling;
  if (old && old.classList.contains("pron-result")) old.remove();
  if (!host.isConnected) return null;
  const el = error ? h(`<div class="pron-result"><p class="pron-none">${esc(error.message || String(error))}</p></div>`) : scoreView(result, { lang, dialect });
  host.after(el);
  return el;
}

/** `practise`'s options for scoring card `v`'s "Say it" (`part`: what the native recording says), the score
 * shown after `host` (the row of listen buttons): {score, onScore}, or {} when it can't be scored here. */
export function cardScoring(v, part, host) {
  const score = cardScorer(v, part);
  if (!score) return {};
  const lang = cardLanguage(v), dialect = cardDialect(v);
  return { score, onScore: (result, error) => showScore(host, result, { lang, dialect, error }) };
}
