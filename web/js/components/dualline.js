// The players' "translation under each line" switch (dual subtitles): the button, the line drawn under each
// line of the language being learned, where the translations come from, and what is said when there is
// nothing to translate them with. The logic is dualsubs.js; pages/player.js (podcasts, the learner's own
// audio and video, YouTube, Netflix) and pages/reels.js use this. Shared by every version.
//
// The translation is in the language words are explained in (Settings → Word definitions), plain text in a
// quieter style, on a line (or lines) of its own under its line: never tappable, never counted as a seen
// word (only `.w` words are), and left alone by the page's own translation (translate="no").

import { h, toast, ytRequest } from "../app.js";
import { askAi, definerConfig, noAi } from "../define-service.js";
import { DefinerError } from "../definer.js";
import { settingsHref } from "../fixes.js";
import { UI_LANGUAGES, t } from "../i18n.js";
import { icon } from "../icons.js";
import { LANGUAGES, langInfo } from "../languages.js";
import { createTranslator, dualOn, ownLanguageCode, setDualOn, translatePrompt, translationKey, alignLines } from "../dualsubs.js";
import { dualStore } from "../dualstore.js";
import { fetchCaptions, videoId } from "../ytcaptions.js";
import { openModal } from "./modal.js";

export { dualOn, setDualOn };

/** Can the learner's AI translate lines (a key, and AI not switched off)? */
export const aiReady = () => !noAi() && !!definerConfig().key;

/** The learner's own language: {name ("English", as written in Settings), code ("en", or "" when unknown),
 * dir ("ltr", "rtl", or "auto" when unknown)}. */
export function ownLanguage() {
  const name = String(definerConfig().language || "English").trim() || "English";
  const code = ownLanguageCode(name, UI_LANGUAGES, LANGUAGES);
  const dir = !code ? "auto" : (UI_LANGUAGES[code] && UI_LANGUAGES[code].dir) || langInfo(code).dir || "auto";
  return { name, code, dir };
}

/** A translation line's element (`cls` "seg-tr" in a transcript, "cap-tr" in the captions), for `own`. */
export function lineEl(own, cls = "seg-tr") {
  const el = document.createElement("span");
  el.className = cls;
  el.setAttribute("translate", "no");
  el.dir = own.dir || "auto";
  if (own.code) el.lang = own.code;
  return el;
}

/** Put `text` in the translation line inside `host` (made when needed; taken away when there is none). */
export function setLine(host, text, own, cls = "seg-tr") {
  if (!host) return;
  let el = host.querySelector(`:scope > .${cls}`);
  if (!text) { if (el) el.remove(); return; }
  if (!el) { el = lineEl(own, cls); host.append(el); }
  if (el.textContent !== text) el.textContent = text;
}

/** The switch: a small button with the two-lines icon, pressed while on. `onPress()` is called on a press;
 * `.paint(on)` shows its state. */
export function dualButton(onPress) {
  const b = h(`<button type="button" class="ghost dual-btn" aria-pressed="false" title="Translation under each line (D)" aria-label="Translation under each line">${icon("dualsubs", 18)}</button>`);
  b.paint = (on) => {
    b.classList.toggle("on", !!on);
    b.setAttribute("aria-pressed", String(!!on));
  };
  b.addEventListener("click", () => onPress());
  return b;
}

/** Why there is nothing to translate with, and the way to Settings → Word definitions (a box over the page).
 * `video`: a YouTube video, which had no captions in the learner's language either. */
export function explainDual({ video = false } = {}) {
  const off = noAi();
  const m = openModal({ title: "Translation under each line" });
  const note = h(`<aside class="key-note" role="note">
      <span class="kn-ico" aria-hidden="true">${icon("lock", 18)}</span>
      <span class="kn-text"><strong></strong><span class="kn-why"></span></span>
      <a class="kn-go"></a>
    </aside>`);
  note.querySelector("strong").textContent = off ? "Translations need the AI" : "Translations need an AI key";
  const why = off
    ? "You chose No AI in Settings → Word definitions, so there is nothing to translate the lines with. Choose AI there and add your own key (Gemini has a free allowance)."
    : "Each line is translated into your language by an AI, with your own key: the same one that explains words. You pay the AI company directly and nothing goes through Tamkeen (Gemini has a free allowance).";
  note.querySelector(".kn-why").textContent = `${video ? `${t("YouTube has no captions in your language for this video.")} ` : ""}${t(why)}`;
  const go = note.querySelector(".kn-go");
  go.textContent = off ? "Open Settings" : "Add an AI key";
  go.href = off ? settingsHref("words", "mode") : settingsHref("words", "key");
  go.addEventListener("click", () => m.close());
  m.body.append(note);
  return m;
}

/** What to say when a request for translations failed. */
export function dualProblem(e) {
  if (e instanceof DefinerError && e.message === "NO_KEY") return t("Add an AI key in Settings → Word definitions first.");
  if (e && e.empty) return t("The AI's answer had no translations in it. Press the button again to try once more.");
  return t("Couldn't translate the lines: {0}", (e && e.message) || String(e));
}

/**
 * The translations of an item's lines (dualsubs.js createTranslator), asked of the learner's AI when it is
 * set up, kept on this device. `ep`: the episode; `segments`: its lines [{start, end, text}], in order;
 * `study`: the code of the language they are in; `own`: ownLanguage(); `free` (optional): async (segments,
 * own) -> a list of translations, one per line, from the source itself (tried before the AI is asked).
 */
export function translatorFor({ ep, segments, study, own, free = null, onLines, onError, size, ahead }) {
  const texts = segments.map((s) => s.text || "");
  const studyName = langInfo(study).name || "the language being learned";
  return createTranslator({
    texts,
    ask: aiReady() ? (lines) => askAi(translatePrompt(lines, { study: studyName, speaks: own.name })) : null,
    store: dualStore,
    key: translationKey(ep, own.name),
    ...(size ? { size } : {}),
    ...(ahead ? { ahead } : {}),
    before: free ? async (tr) => {
      if (tr.complete()) return;
      const list = await free(segments, own);
      if (list && list.length) tr.give(list);
    } : null,
    onLines,
    onError,
  });
}

/**
 * A YouTube video's own captions in the learner's language (written by a person, YouTube's automatic ones,
 * or YouTube's translation, as YouTube's player offers them), put under the transcript's lines by their
 * times; null when YouTube has none or can't be asked (the web app's go-between may be refused).
 */
export async function youTubeTranslations(ep, segments, own) {
  if (!own.code) return null;
  const id = videoId(ep.audio_url) || (/^[\w-]{11}$/.test(String(ep.guid || "")) ? ep.guid : null);
  if (!id) return null;
  try {
    const v = await fetchCaptions(id, { language: own.code, languageName: own.name, taught: [], translate: true, request: ytRequest });
    if (!v || v.language !== own.code || !v.lines || !v.lines.length) return null;
    const list = alignLines(segments, v.lines);
    return list.some(Boolean) ? list : null;
  } catch { return null; }
}

/** Say once that translating failed (each failure stops the asking until the switch is pressed again). */
export function reportDual(e) {
  toast(dualProblem(e), { error: true });
}
