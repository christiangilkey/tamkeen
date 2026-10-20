// The language buttons: "Which language are you learning?" (one big button per language the app
// teaches) and "Which language do you speak?" (one per language the app can be shown in). Used on
// the first-run welcome screen and in Settings, on both desktop and phone.

import { h } from "../app.js";
import { LANGUAGES, LANGUAGE_CODES, langAttrs } from "../languages.js";
import { UI_LANGUAGES, UI_LANGUAGE_CODES } from "../i18n.js";
import { icon } from "../icons.js";

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

/** The languages to learn, in the order shown: the user's own language (`speaks`) left out unless
 *  it is in `keep`, and English first (someone who speaks another language sees it first). */
function learnCodes(speaks, keep = []) {
  const codes = LANGUAGE_CODES.filter((c) => c !== speaks || keep.includes(c));
  return codes.includes("en") ? ["en", ...codes.filter((c) => c !== "en")] : codes;
}

/** The languages to learn. `selected` is the current code ("" = none yet); `onPick(code)` runs
 * when the user chooses one. `speaks`: the user's own language, left out (someone who speaks
 * another language sees English first). `hide`: languages not to offer (already being learned). */
export function languagePicker(selected, onPick, { speaks = "en", hide = [] } = {}) {
  const codes = learnCodes(speaks, [selected]).filter((c) => c === selected || !hide.includes(c)); // (the chosen one stays shown)
  return grid("Language to learn", codes, selected, onPick, (c) => `
      <span class="lang-native" ${langAttrs(c)}>${LANGUAGES[c].native}</span>
      <span class="lang-name">${LANGUAGES[c].name}</span>`);
}

/** Settings: every language to learn as a tile that is ticked or not (several can be). The one
 *  studied now also says "Now". `onToggle(code, on)` runs on a tap; the caller saves and then calls
 *  `el.paint(list, now)`. */
export function learningPicker({ list, now, speaks = "en", onToggle }) {
  const el = h(`<div class="lang-grid lang-ticks" role="group" aria-label="Languages I'm learning"></div>`);
  el.paint = (ticked, current) => {
    // A ticked language stays shown even if it is the one the user speaks (so it can be unticked).
    el.innerHTML = learnCodes(speaks, ticked).map((c) => {
      const on = ticked.includes(c);
      return `<button type="button" class="lang-opt" role="checkbox" data-lang="${c}" aria-checked="${on}"${c === current ? ' data-now="true"' : ""}>
        <span class="lang-check" aria-hidden="true">${icon("check", 14)}</span>
        ${c === current ? `<span class="lang-now">Now</span>` : ""}
        <span class="lang-native" ${langAttrs(c)}>${LANGUAGES[c].native}</span>
        <span class="lang-name">${LANGUAGES[c].name}</span></button>`;
    }).join("");
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".lang-opt");
    if (b) onToggle(b.dataset.lang, b.getAttribute("aria-checked") !== "true");
  });
  el.paint(list, now);
  return el;
}

/** The languages the app can be shown in, each written in itself. */
export function speakPicker(selected, onPick) {
  return grid("Your language", UI_LANGUAGE_CODES, selected, onPick, (c) => `
      <span class="lang-native" lang="${c}" dir="${UI_LANGUAGES[c].dir}">${UI_LANGUAGES[c].native}</span>`);
}
