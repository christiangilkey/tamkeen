// Add words → "Which meaning?" (prototype sense_choice): one screen for every word being added that has several
// meanings that really differ (senses.js distinctSenses), each with its meanings to choose from, "All of these" and the
// learner's own. The everyday meaning (the first) is chosen to start with, so pressing Add keeps what Add words did
// before. Shared by the desktop app, the phone and the web app.

import { esc, h } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs } from "../languages.js";
import { openModal } from "./modal.js";
import { meaningFor, showPos } from "../senses.js";

// (each written out in t() so the translation tools find it)
const posWord = (pos) => ({ noun: t("Noun"), verb: t("Verb"), adj: t("Adjective"), adv: t("Adverb"), pron: t("Pronoun"),
  det: t("Determiner"), prep: t("Preposition"), conj: t("Conjunction"), intj: t("Exclamation"), particle: t("Particle"),
  phrase: t("Phrase"), num: t("Number") })[pos] || pos;

/**
 * Ask which meaning each card is for. `items`: [{word, senses: [{text, pos}]}]; `lang` the language studied.
 * Resolves to each item's chosen meaning (in order), or null when the learner closed the box (nothing is added).
 */
export function chooseSenses(items, { lang = "" } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (done) return; done = true; resolve(value); };
    const one = items.length === 1;
    const sheet = openModal({ title: one ? t("Which meaning?") : t("Which meanings?"), onClose: () => finish(null) });
    sheet.el.querySelector(".modal-box").classList.add("sc-box");
    const choice = items.map(() => "0");
    const own = items.map(() => "");
    const attrs = langAttrs(lang);
    const body = h(`<div class="sc">
      <p class="sc-lead muted">${esc(one ? t("This word has more than one meaning. Which one is the card for?")
        : t("These words have more than one meaning. Which one is each card for?"))}</p>
      ${items.map((it, i) => {
        const pos = showPos(it.senses);
        return `<section class="sc-word" data-i="${i}">
          <div class="sc-head" ${attrs}>${esc(it.word)}</div>
          <div class="sc-opts" role="radiogroup" aria-label="${esc(t("Meaning of {0}", it.word))}">
            ${it.senses.map((s, j) => `<button type="button" class="sc-opt" role="radio" data-v="${j}">
              <span class="sc-tick" aria-hidden="true">${icon("check", 18)}</span>
              <span class="sc-text">${esc(s.text)}${pos && s.pos ? ` <span class="sc-pos muted">${esc(posWord(s.pos))}</span>` : ""}</span>
            </button>`).join("")}
            <button type="button" class="sc-opt" role="radio" data-v="all">
              <span class="sc-tick" aria-hidden="true">${icon("check", 18)}</span><span class="sc-text">${esc(t("All of these"))}</span>
            </button>
            <button type="button" class="sc-opt" role="radio" data-v="own">
              <span class="sc-tick" aria-hidden="true">${icon("check", 18)}</span><span class="sc-text">${esc(t("My own meaning"))}</span>
            </button>
          </div>
          <input type="text" class="sc-own" hidden autocomplete="off" placeholder="${esc(t("Type the meaning"))}" aria-label="${esc(t("Your own meaning for {0}", it.word))}">
        </section>`;
      }).join("")}
      <div class="sc-foot"><button type="button" class="primary sc-ok">${esc(one ? t("Add the card") : t("Add the cards"))}</button></div>
    </div>`);
    sheet.body.append(body);

    const paint = (sec) => {
      const i = Number(sec.dataset.i);
      for (const b of sec.querySelectorAll(".sc-opt")) {
        const on = b.dataset.v === choice[i];
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      }
      sec.querySelector(".sc-own").hidden = choice[i] !== "own";
    };
    for (const sec of body.querySelectorAll(".sc-word")) {
      const i = Number(sec.dataset.i);
      for (const b of sec.querySelectorAll(".sc-opt")) {
        b.onclick = () => {
          choice[i] = b.dataset.v;
          paint(sec);
          if (choice[i] === "own") sec.querySelector(".sc-own").focus();
        };
      }
      sec.querySelector(".sc-own").oninput = (e) => { own[i] = e.target.value; };
      paint(sec);
    }
    body.querySelector(".sc-ok").onclick = () => {
      // (their own meaning left empty: the everyday one, as before)
      const out = items.map((it, i) => meaningFor(it.senses, choice[i], own[i]) || meaningFor(it.senses, "0"));
      finish(out);
      sheet.close();
    };
  });
}
