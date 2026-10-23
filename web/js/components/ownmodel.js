// The panel in Settings → Listening & transcripts for a language with a listening model of its own
// (Thai's Typhoon, Bisaya's BuzzASR: stt.js LANGUAGE_MODEL_INFO): what the model is, how many
// characters it gets wrong next to Whisper large-v3 (the model Groq runs) as two labelled bars per
// test, and the advice to transcribe that language on the computer. HTML only, no page code, so the
// tests can look at it; sttsetup.js puts it under the "Who writes the transcripts" choice, on every
// device. The words are turned into the interface language on screen (i18n.js), like the rest.

import { icon } from "../icons.js";
import { languageModelInfo } from "../stt.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (n) => `${n.toFixed(1)}%`;

/**
 * The panel for language `lang`, or "" when it has no model of its own.
 *   phone      on a phone, iPhone or the web app (the model runs on the user's computer, not here)
 *   ready      on a computer that has the model downloaded
 *   blockedText  for a language no cloud provider knows: why the cloud choice is off (said once, here)
 */
export function ownModelPanel(lang, { phone = false, ready = false, blockedText = "" } = {}) {
  const info = languageModelInfo(lang);
  if (!info) return "";
  // Every bar on one scale, so the rows can be compared with each other too: the largest value, rounded up to a 5.
  const top = Math.ceil(Math.max(...info.tests.flatMap((x) => [x.own, x.cloud])) / 5) * 5;
  const bar = (name, value, kind) => `
    <div class="stt-bar-row">
      <span class="stt-bar-name">${esc(name)}</span>
      <span class="stt-bar-area"><i class="stt-bar ${kind}" style="--w:${(value / top).toFixed(3)}" aria-hidden="true"></i><span class="stt-bar-val">${pct(value)}</span></span>
    </div>`;
  const doText = !info.cloud ? blockedText : phone ? info.phone : ready ? info.ready : info.desktop;
  return `
    <div class="stt-own" data-find="ownmodel" data-model="${esc(info.model)}">
      <div class="stt-own-head">
        <span class="stt-own-ico">${icon("audio", 22)}</span>
        <h3>${esc(info.headline)}</h3>
        <p>${esc(info.about)}</p>
      </div>
      <div class="stt-chart">
        <p class="stt-chart-title">Characters wrong, lower is better</p>
        ${info.tests.map((x) => `<div class="stt-bars">
          <p class="stt-bars-label">${esc(x.label)}</p>
          ${bar(info.ownName, x.own, "own")}
          ${bar("Whisper large-v3 (Groq's model)", x.cloud, "cloud")}
        </div>`).join("")}
      </div>
      ${Object.values(info.notes).map((n) => `<p class="stt-own-note">${esc(n)}</p>`).join("")}
      ${info.unmeasured ? `<p class="stt-own-note">${esc(info.unmeasured)}</p>` : ""}
      ${doText ? `<p class="stt-own-do" role="note">${icon(!info.cloud ? "computer" : ready && !phone ? "check" : "import", 18)}<span>${esc(doText)}</span></p>` : ""}
      <details class="set-info"><summary>How this was measured</summary><p>${esc(info.how)}</p></details>
    </div>`;
}
