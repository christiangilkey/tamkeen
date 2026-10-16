// "Which language am I learning right now": the chip in the top bar (desktop and phone). Tapping it
// lists the languages being learned and "Add a language…". Choosing one sets `study_language`;
// the library, vocab, reviews, Home and search then show only what is in that language (the
// server, or the phone's backend.js, filters by it). The languages being learned are the setting
// `learning_languages` (app.js keeps it up to date whenever study_language changes).

import { h, saveSettings, showMenu, state } from "../app.js";
import { LANGUAGES, isLanguage, langAttrs, onStudyLanguage, studyLanguage } from "../languages.js";
import { languagePicker } from "./langpicker.js";
import { openModal } from "./modal.js";

const settingsNow = () => (state.status && state.status.settings) || {};

/** The languages being learned, the current one first if it isn't on the list yet. */
export function learningList(s = settingsNow()) {
  const list = (Array.isArray(s.learning_languages) ? s.learning_languages : []).filter(isLanguage);
  if (isLanguage(s.study_language) && !list.includes(s.study_language)) list.unshift(s.study_language);
  return [...new Set(list)];
}

/** `values` about to be saved, with the language being switched to (and the one left) kept on the
 *  list of languages being learned. Used by each shell's saveSettings. */
export function withLearningList(values, s = settingsNow()) {
  if (!("study_language" in values) || !isLanguage(values.study_language)) return values;
  const list = learningList(s);
  if (!list.includes(values.study_language)) list.push(values.study_language);
  return { ...values, learning_languages: list };
}

/** Learn `code` now: everything shown switches to it. */
export async function switchTo(code) {
  if (!isLanguage(code)) return;
  if (code !== studyLanguage()) await saveSettings({ study_language: code });
  window.dispatchEvent(new HashChangeEvent("hashchange")); // redraw the page for this language
}

function addLanguage() {
  const m = openModal({ title: "Add a language to learn" });
  const s = settingsNow();
  m.body.append(h(`<p class="muted">Its podcasts, videos, words and reviews are kept apart from your other languages.
    Switch between them from the top bar.</p>`));
  m.body.append(languagePicker(null, async (code) => { m.close(); await switchTo(code); }, { speaks: s.ui_language || "en" }));
}

/** The chip, put into the top bar after `anchor`. */
export function mountLanguageSwitch(anchor) {
  if (!anchor || document.querySelector(".lang-switch")) return;
  const chip = h(`<button type="button" class="lang-switch" aria-haspopup="menu" title="The language you're learning now"></button>`);
  const paint = () => {
    const code = studyLanguage();
    chip.innerHTML = `<span class="lang-switch-name" ${langAttrs(code)}></span><span class="lang-switch-caret" aria-hidden="true">▾</span>`;
    chip.firstChild.textContent = (LANGUAGES[code] || {}).native || code;
    chip.setAttribute("aria-label", `Learning ${(LANGUAGES[code] || {}).name || code}. Change language`);
  };
  chip.onclick = (e) => {
    e.stopPropagation();
    const r = chip.getBoundingClientRect();
    const now = studyLanguage();
    const items = learningList().map((code) => ({
      label: `${code === now ? "✓ " : ""}${LANGUAGES[code].native} · ${LANGUAGES[code].name}`,
      run: () => switchTo(code),
    }));
    items.push({ label: "＋ Add a language…", run: addLanguage });
    showMenu(r.left, r.bottom + 6, "Learning now", items);
  };
  paint();
  onStudyLanguage(paint);
  anchor.after(chip);
}
