// "Which language are you learning?" — six big buttons, one per language. Used on the first-run
// welcome screen and in Settings, on both desktop and phone.

import { h } from "../app.js";
import { LANGUAGES, LANGUAGE_CODES, langAttrs } from "../languages.js";

/** Returns the picker element. `selected` is the current code ("" = none yet); `onPick(code)`
 * runs when the user chooses one. */
export function languagePicker(selected, onPick) {
  const el = h(`<div class="lang-grid" role="radiogroup" aria-label="Language to learn">${LANGUAGE_CODES.map((c) => `
    <button type="button" class="lang-opt" role="radio" data-lang="${c}" aria-checked="${c === selected}">
      <span class="lang-native" ${langAttrs(c)}>${LANGUAGES[c].native}</span>
      <span class="lang-name">${LANGUAGES[c].name}</span>
    </button>`).join("")}</div>`);
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".lang-opt");
    if (!b || b.getAttribute("aria-checked") === "true") return;
    for (const o of el.querySelectorAll(".lang-opt")) o.setAttribute("aria-checked", String(o === b));
    onPick(b.dataset.lang);
  });
  return el;
}
