// Tapping a word in a course (Library → Courses: the Words course's sentences, a grammar lesson's examples,
// its conversation and the right forms of its common mistakes). Shared by the desktop app, the phone and the
// web app.
//
// One tap says the word (the learner's card voice: saytext.js) and opens the small word popup with the word
// and what it means (wordbubble.js, in its short form; "More" opens the full explanation), and a Save button
// that makes it a card: its sentence is the course sentence with the word marked, its translation the
// course's own translation of that sentence when the lookup gave none. A word saved this way is a card like
// any other (POST /vocab), voiced by the card voice when that is on (voiceplay.js voiceNewCard).
//
// The course's own buttons keep working: a tap on a sentence anywhere but on a word still does what it did
// (a grammar example says the whole sentence).

import { api, buzz } from "../app.js";
import { vocabFromDefinition, wordRanges } from "../languages.js";
import { getDefinition } from "../define-service.js";
import { createWordBubble } from "./wordbubble.js";
import { sayText } from "../saytext.js";
import { voiceNewCard } from "../voiceplay.js";

/**
 * Make every word of `el`'s text tappable, keeping whatever marks it already has (a course sentence's
 * highlighted word). `tr`: the sentence's translation in the learner's language, saved with the card when
 * the lookup gives none; `source`: where the card says it came from ("Arabic basics").
 */
export function tappable(el, lang, { tr = "", source = "" } = {}) {
  if (!el || el.classList.contains("tw-root")) return el;
  el.classList.add("tw-root");
  el.dataset.twLang = lang;
  if (tr) el.dataset.twTr = tr;
  if (source) el.dataset.twSource = source;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  let at = 0; // where this text node starts in el.textContent
  for (const node of nodes) {
    const text = node.data;
    const ranges = wordRanges(text, lang);
    if (ranges.length) {
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const [a, b] of ranges) {
        if (a > pos) frag.append(text.slice(pos, a));
        const w = document.createElement("span");
        w.className = "tw";
        w.dataset.a = String(at + a);
        w.dataset.b = String(at + b);
        w.textContent = text.slice(a, b);
        frag.append(w);
        pos = b;
      }
      if (pos < text.length) frag.append(text.slice(pos));
      node.replaceWith(frag);
    }
    at += text.length;
  }
  return el;
}

/** The sentence `text` with the part a..b marked ⟦ ⟧ (how a card's sentence says where its word is). */
export const markAt = (text, a, b) => `${text.slice(0, a)}⟦${text.slice(a, b)}⟧${text.slice(b)}`;

/**
 * Listen for taps on the words made tappable inside `box`. `dialect`: the Arabic dialect the course is in
 * (its words are said by that dialect's voice); `onSaved(row)`: after a word became a card. Returns a
 * function that stops listening and closes the popup.
 */
export function courseWords(box, { dialect = "", onSaved = () => {} } = {}) {
  if (getComputedStyle(box).position === "static") box.style.position = "relative"; // (the popup is placed in it)
  let target = null; // {el, word, lang, sentence, tr, source}
  const saved = new Set();
  const key = (t) => `${t.lang}\u0000${t.word}\u0000${t.sentence}`;
  const say = (text, lang) => sayText(text, lang, { dialect: lang === "ar" ? dialect : "" });
  const bubble = createWordBubble(box, {
    voiceless: true,
    noFrom: true,
    fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
    onPlayWord: () => { if (target) say(target.word, target.lang); },
    onPlaySentence: () => { if (target) say(target.sentence.replace(/[⟦⟧]/g, ""), target.lang); },
    onPlayFrom: () => {},
    onSettings: () => { location.hash = "#/settings?s=words"; },
    onSave: async (def) => {
      const t = target;
      if (!t || saved.has(key(t))) return;
      const card = vocabFromDefinition(def, t.word, t.lang);
      const row = await api("/vocab", { method: "POST", body: {
        ...card, translation: card.translation || t.tr, sentence: t.sentence, source: t.source, language: t.lang } });
      voiceNewCard(row, "missing"); // no recording of its own here: its voice, now (Settings → Card voices)
      saved.add(key(t));
      earn({ type: "save" }, t.el);
      onSaved(row);
    },
  });

  async function earn(event, anchor) { // (XP in the creature game; nothing when the game is off)
    try { (await import("../game/game.js")).reward(event, anchor); } catch { /* no game here */ }
  }

  function open(w) {
    const root = w.closest(".tw-root");
    const lang = root.dataset.twLang;
    const text = root.textContent;
    const a = Number(w.dataset.a), b = Number(w.dataset.b);
    const word = text.slice(a, b);
    const clean = text.replace(/[⟦⟧]/g, "");
    // (offsets are in the text as shown, which never has ⟦ ⟧ in it: the marks are drawn, not written)
    const sentence = markAt(clean, a, b);
    for (const el of box.querySelectorAll(".tw.tw-on")) el.classList.remove("tw-on");
    w.classList.add("tw-on");
    target = { el: w, word, lang, sentence, tr: root.dataset.twTr || "", source: root.dataset.twSource || "" };
    buzz("tick");
    say(word, lang);
    bubble.show(w, { word, lang, marked: sentence, before: "", after: "", podcast: target.source, episode: "", phrase: false },
      { saved: saved.has(key(target)), quick: true });
    earn({ type: "word", key: `${lang}:${word.toLowerCase()}` }, w);
  }

  // Caught on the way down, so a tap on a word doesn't also do what a tap on its sentence does.
  const onClick = (e) => {
    const w = e.target.closest && e.target.closest(".tw");
    if (w && box.contains(w) && !w.closest(".word-bubble")) {
      e.stopPropagation();
      e.preventDefault();
      open(w);
      return;
    }
    if (bubble.open && !e.target.closest(".word-bubble")) {
      bubble.hide();
      for (const el of box.querySelectorAll(".tw.tw-on")) el.classList.remove("tw-on");
    }
  };
  box.addEventListener("click", onClick, true);
  return () => {
    box.removeEventListener("click", onClick, true);
    bubble.hide();
  };
}
