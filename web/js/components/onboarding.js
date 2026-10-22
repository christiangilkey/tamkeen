// The first time the app is opened: four boxes, one after the other.
//   1. Which language do you speak? (Asked in every language; from then on the app's own words
//      are in that one, and the AI explains words in it: see i18n.js.)
//   2. Which language are you learning? (English is offered to everyone who speaks another one.)
//   3. Have you already started, or are you a complete beginner? (For someone who has started,
//      the language's 1000 most common words count as already seen: see commonwords.js.)
//   4. The app needs an API key from an AI provider; where to set or change it.
// Shared by the desktop app and the phone (each shows it from its welcome screen).

import { esc, h, state, saveSettings, toast } from "../app.js";
import { LANGUAGES, isLanguage, langAttrs } from "../languages.js";
import { PROVIDERS } from "../definer.js";
import { COMMON_WORDS, addCommonWords, commonWords } from "../commonwords.js";
import { SPEAK_QUESTION, UI_LANGUAGES, UI_LANGUAGE_CODES, isUiLanguage, startTranslating, uiLanguage } from "../i18n.js";
import { languagePicker, speakPicker } from "./langpicker.js";
import { showKeyHelp } from "./keyhelp.js";
import { openModal } from "./modal.js";

/**
 * The user speaks this language: save it, show the app in it, and have the AI explain words in it
 * (unless they had already picked an explanation language of their own in Settings).
 * Going from one translation to another reloads the page (the English is not kept on screen).
 */
export async function chooseUiLanguage(code) {
  const s = state.status.settings;
  const before = isUiLanguage(s.ui_language) ? s.ui_language : "en";
  const values = { ui_language: code };
  if (!s.definer_language || s.definer_language === UI_LANGUAGES[before].name) values.definer_language = UI_LANGUAGES[code].name;
  // (The language being learned stays, even when it is this one: there must always be one, and the
  // learn list keeps showing it until another is picked.)
  try {
    await saveSettings(values);
  } catch (e) {
    toast(e.message || "Couldn't change the language.", { error: true });
    throw e;
  }
  if (uiLanguage() === code) return;
  if (uiLanguage() === "en") await startTranslating(code);
  else location.reload();
}

/** Has this person been through the boxes (or used the app since before they existed)? */
export const needsOnboarding = (settings) => !settings.onboarded || !isLanguage(settings.study_language);

let running = null; // the boxes are on screen (the welcome page can be drawn twice)

/** Show the boxes. Resolves when the last one is answered. */
export function runOnboarding() {
  running ||= ask().finally(() => { running = null; });
  return running;
}

function ask() {
  return new Promise((resolve) => {
    const modal = openModal({ canClose: false });
    const settings = () => state.status.settings;
    let speaks = isUiLanguage(settings().ui_language) ? settings().ui_language : "";
    let lang = isLanguage(settings().study_language) && settings().study_language !== speaks ? settings().study_language : "";
    let level = settings().study_level || "";
    // (after a reload for a new language, carry on from the second box)
    let step = speaks ? 1 : 0;

    const dots = () => `<div class="ob-steps" aria-label="Step ${step + 1} of 4">${[0, 1, 2, 3].map((n) =>
      `<i class="${n === step ? "on" : n < step ? "done" : ""}"></i>`).join("")}</div>`;
    const go = (n) => { step = n; paint(); };

    function paint() {
      modal.body.innerHTML = "";
      if (step === 0) {
        modal.setTitle("");
        const box = h(`<div class="stack">
          <div class="ob-speak">${UI_LANGUAGE_CODES.map((c) =>
            `<p lang="${c}" dir="${UI_LANGUAGES[c].dir}">${esc(SPEAK_QUESTION[c])}</p>`).join("")}</div>
          <div id="ob-speak"></div>
          <div class="row ob-nav">${dots()}<span class="spacer"></span>
            <button type="button" class="primary big" id="ob-next" ${speaks ? "" : "disabled"}>Next →</button></div>
        </div>`);
        box.querySelector("#ob-speak").append(speakPicker(speaks, async (code) => {
          speaks = code;
          if (lang === code) lang = "";
          box.querySelector("#ob-next").disabled = false;
          await chooseUiLanguage(code);
        }));
        box.querySelector("#ob-next").onclick = () => go(1);
        modal.body.append(box);
      } else if (step === 1) {
        modal.setTitle("Which language are you learning?");
        const box = h(`<div class="stack">
          <div id="ob-lang"></div>
          <p class="small muted">This sets what the app listens for, how words are explained, and which way the text runs.
            You can change it later in Settings.</p>
          <div class="row ob-nav">${dots()}<span class="spacer"></span>
            <button type="button" class="ghost" id="ob-back">← Back</button>
            <button type="button" class="primary big" id="ob-next" ${lang ? "" : "disabled"}>Next →</button></div>
        </div>`);
        box.querySelector("#ob-lang").append(languagePicker(lang, async (code) => {
          lang = code;
          box.querySelector("#ob-next").disabled = false;
          await saveSettings({ study_language: code });
        }, { speaks }));
        box.querySelector("#ob-back").onclick = () => go(0);
        box.querySelector("#ob-next").onclick = () => go(2);
        modal.body.append(box);
      } else if (step === 2) {
        const name = LANGUAGES[lang].name;
        modal.setTitle(`Have you already started learning ${name}?`);
        const box = h(`<div class="stack">
          <div class="ob-choices" role="radiogroup">
            <button type="button" class="ob-choice" role="radio" data-level="beginner" aria-checked="${level === "beginner"}">
              <strong>I'm a complete beginner</strong>
              <span class="small">Every word is new to me.</span></button>
            <button type="button" class="ob-choice" role="radio" data-level="started" aria-checked="${level === "started"}">
              <strong>I've already started</strong>
              <span class="small">Count the ${COMMON_WORDS} most common ${esc(name)} words as words I already know,
                so the app doesn't treat them as new.</span>
              <span class="ob-sample ar" ${langAttrs(lang)}></span></button>
          </div>
          <div class="row ob-nav">${dots()}<span class="spacer"></span>
            <button type="button" class="ghost" id="ob-back">← Back</button>
            <button type="button" class="primary big" id="ob-next" ${level ? "" : "disabled"}>Next →</button></div>
        </div>`);
        commonWords(lang).then((words) => {
          // (a right-to-left language's own comma: و، به، در)
          const comma = LANGUAGES[lang].unspaced ? "、" : LANGUAGES[lang].dir === "rtl" ? "، " : ", ";
          if (words.length) box.querySelector(".ob-sample").textContent = `${words.slice(0, 8).join(comma)}…`;
        });
        for (const b of box.querySelectorAll(".ob-choice")) {
          b.onclick = () => {
            level = b.dataset.level;
            for (const o of box.querySelectorAll(".ob-choice")) o.setAttribute("aria-checked", String(o === b));
            box.querySelector("#ob-next").disabled = false;
          };
        }
        box.querySelector("#ob-back").onclick = () => go(1);
        box.querySelector("#ob-next").onclick = () => go(3);
        modal.body.append(box);
      } else {
        modal.setTitle("One thing to set up: an API key");
        const names = Object.values(PROVIDERS).map((p) => p.short);
        const box = h(`<div class="stack">
          <p>Tap any word and Tamkeen tells you what it means <em>in that sentence</em>. Those explanations are written by an
            AI service, so <strong>for the app to work you need to give it an API key from an AI provider of your choice</strong>:
            ${esc(names.slice(0, -1).join(", "))} or ${esc(names[names.length - 1])}.</p>
          <p>An API key is a kind of password you get from the provider's website. You pay the provider directly:
            a lookup costs a fraction of a cent, and Gemini has a free allowance.</p>
          <p class="ob-where">Set it, or change it later, in <strong>Settings → Word definitions (AI)</strong>.
            There you can also choose <strong>No AI</strong>: a free built-in dictionary that shows a word's usual meanings,
            but not the one in its sentence (AI is strongly recommended).</p>
          <div class="row ob-nav">${dots()}<span class="spacer"></span>
            <button type="button" class="ghost" id="ob-back">← Back</button>
            <button type="button" id="ob-help">How do I get a key?</button>
            <button type="button" class="primary big" id="ob-done">Got it</button></div>
        </div>`);
        box.querySelector("#ob-back").onclick = () => go(2);
        box.querySelector("#ob-help").onclick = () => showKeyHelp(settings().definer_provider);
        box.querySelector("#ob-done").onclick = async (e) => {
          e.target.disabled = true;
          try {
            if (level === "started") await addCommonWords(lang); // (Arabic waits for its dictionaries)
            await saveSettings({ onboarded: true, study_level: level });
          } catch (err) {
            e.target.disabled = false;
            return;
          }
          modal.close();
          window.dispatchEvent(new CustomEvent("tamkeen:onboarded", { detail: { lang, level } }));
          resolve({ lang, level });
        };
        modal.body.append(box);
      }
    }
    paint();
  });
}
