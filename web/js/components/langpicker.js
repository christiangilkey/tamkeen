// The language buttons: "Which language are you learning?" (one big button per language the app
// teaches) and "Which language do you speak?" (one per language the app can be shown in). Used on
// the first-run welcome screen and in Settings, on both desktop and phone.

import { h } from "../app.js";
import { LANGUAGES, LANGUAGE_CODES, langAttrs } from "../languages.js";
import { UI_LANGUAGES, UI_LANGUAGE_CODES } from "../i18n.js";

function grid(label, codes, selected, onPick, button) {
  const el = h(`<div class="lang-grid" role="radiogroup" aria-label="${label}">${codes.map((c) => `
    <button type="button" class="lang-opt" role="radio" data-lang="${c}" aria-checked="${c === selected}">${button(c)}</button>`).join("")}</div>`);
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".lang-opt");
    if (!b || b.getAttribute("aria-checked") === "true") return;
    for (const o of el.querySelectorAll(".lang-opt")) o.setAttribute("aria-checked", String(o === b));
    onPick(b.dataset.lang);
  });
  return el;
}

/** The languages to learn. `selected` is the current code ("" = none yet); `onPick(code)` runs
 * when the user chooses one. `speaks`: the user's own language, left out (someone who speaks
 * another language sees English first). */
export function languagePicker(selected, onPick, { speaks = "en" } = {}) {
  let codes = LANGUAGE_CODES.filter((c) => c !== speaks);
  if (codes.includes("en")) codes = ["en", ...codes.filter((c) => c !== "en")];
  return grid("Language to learn", codes, selected, onPick, (c) => `
      <span class="lang-native" ${langAttrs(c)}>${LANGUAGES[c].native}</span>
      <span class="lang-name">${LANGUAGES[c].name}</span>`);
}

/** The languages the app can be shown in, each written in itself. */
export function speakPicker(selected, onPick) {
  return grid("Your language", UI_LANGUAGE_CODES, selected, onPick, (c) => `
      <span class="lang-native" lang="${c}" dir="${UI_LANGUAGES[c].dir}">${UI_LANGUAGES[c].native}</span>`);
}
