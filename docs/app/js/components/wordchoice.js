// Add words → "Which word?" (prototype meaning_first): cards started from their meaning ("library") for which more
// than one word fits (biblioteca, librería), all on one screen, each meaning with its words, the most common first and
// chosen to start with, so pressing the button keeps the usual word. "Which meaning?" turned round (sensechoice.js,
// whose look it shares; its few own touches are inline, app.css being shared). Shared by the desktop app, the phone and the web app.

import { esc, h } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs } from "../languages.js";
import { openModal } from "./modal.js";

/**
 * Ask which word each card is for. `items`: [{meaning, words: [{word, reading, meaning}]}]; `lang` the language being
 * learned. Resolves to the chosen word's place in each item's words (in order), or null when the box was closed.
 */
export function chooseWords(items, { lang = "" } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (done) return; done = true; resolve(value); };
    const one = items.length === 1;
    const sheet = openModal({ title: t("Which word?"), onClose: () => finish(null) });
    sheet.el.querySelector(".modal-box").classList.add("sc-box", "wc-box");
    const choice = items.map(() => 0);
    const attrs = langAttrs(lang);
    const body = h(`<div class="sc">
      <p class="sc-lead muted">${esc(one ? t("More than one word fits this meaning. Which one is the card for?")
        : t("More than one word fits these meanings. Which one is each card for?"))}</p>
      ${items.map((it, i) => `<section class="sc-word" data-i="${i}">
          <div class="sc-head" dir="auto">${esc(it.meaning)}</div>
          <div class="sc-opts" role="radiogroup" aria-label="${esc(t("Words for {0}", it.meaning))}">
            ${it.words.map((w, j) => `<button type="button" class="sc-opt" role="radio" data-v="${j}">
              <span class="sc-tick" aria-hidden="true">${icon("check", 18)}</span>
              <span class="sc-text"><span class="wc-word ar" ${attrs} style="font-size:19px;font-weight:600">${esc(w.word)}</span>${w.reading && w.reading !== w.word ? ` <span class="sc-pos muted" translate="no">${esc(w.reading)}</span>` : ""}${
                w.meaning ? `<span class="wc-gloss muted" dir="auto" translate="no" style="display:block;font-size:13px">${esc(w.meaning)}</span>` : ""}</span>
            </button>`).join("")}
          </div>
        </section>`).join("")}
      <div class="sc-foot"><button type="button" class="primary sc-ok">${esc(one ? t("Use this word") : t("Use these words"))}</button></div>
    </div>`);
    sheet.body.append(body);
    const paint = (sec) => {
      const i = Number(sec.dataset.i);
      for (const b of sec.querySelectorAll(".sc-opt")) {
        const on = Number(b.dataset.v) === choice[i];
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      }
    };
    for (const sec of body.querySelectorAll(".sc-word")) {
      const i = Number(sec.dataset.i);
      for (const b of sec.querySelectorAll(".sc-opt")) b.onclick = () => { choice[i] = Number(b.dataset.v); paint(sec); };
      paint(sec);
    }
    body.querySelector(".sc-ok").onclick = () => { finish([...choice]); sheet.close(); };
  });
}
