// "Type what you hear": the panel that takes the place of the words in a player (the transcript, the
// captions) while the learner writes down what they hear.
//
// Three ways, switched at the top (the choice is remembered on this device):
//   - Word: one word plays; they type it and it is shown, marked.
//   - Sentence: one sentence plays with nothing of its text on screen; they type it and the real sentence
//     appears ABOVE what they typed, each word marked right, nearly right or missed, their own words that match
//     none crossed out.
//   - Gist: 2–5 sentences play in a row (they choose how many); they write what they heard (the words they
//     caught, or what it was about, in any language) and then see everything that was said, the words they
//     caught marked.
// Next plays the next one. The comparing is web/js/dictation.js; the player the panel sits in plays the pieces
// (`play(unit)`), so the same panel serves every player with sound: podcasts, audiobooks, your own audio and
// videos, YouTube, Netflix, reels and courses.

import { esc, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { langAttrs } from "../languages.js";
import { GIST_SIZES, caughtWords, compareTyped, passages, shareRight } from "../dictation.js";

// Not released yet: the owner tests it first (2026-11-17, v0.61.0 went out without it). Hidden everywhere (the
// players' button, the W key, the controller's option, the courses' button) unless this device has it switched on
// with localStorage `tamkeenTryDictation` = "1". To release it, set DICTATION_RELEASED to true.
export const DICTATION_RELEASED = false;
/** Whether "Type what you hear" is offered on this device. */
export function dictationOn() {
  if (DICTATION_RELEASED) return true;
  try { return localStorage.getItem("tamkeenTryDictation") === "1"; } catch { return false; }
}

/** The owner's private test switch (2026-11-17): five quick taps on `el` (the version in Settings; the About
 *  heading in the web app, which shows no version) turn "Type what you hear" on or off on this device. Nothing
 *  shows that it is there. Gone once it is released. */
export function dictationTaps(el) {
  if (DICTATION_RELEASED || !el) return;
  let taps = 0, timer = null;
  el.addEventListener("click", () => {
    taps += 1;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1500);
    if (taps < 5) return;
    taps = 0;
    const on = !dictationOn();
    try { if (on) localStorage.setItem("tamkeenTryDictation", "1"); else localStorage.removeItem("tamkeenTryDictation"); } catch { return; }
    toast(on ? "Type what you hear is on for this device. Open a player or a course unit to try it."
      : "Type what you hear is off for this device.");
  });
}

/** The button that opens it: a keyboard, beside the other switches of a player. */
export function dictationButton(onPress) {
  const b = h(`<button type="button" class="ghost dict-btn" aria-pressed="false" title="Type what you hear (W)" aria-label="Type what you hear">${icon("keyboard", 18)}</button>`);
  b.paint = (on) => {
    b.classList.toggle("on", !!on);
    b.setAttribute("aria-pressed", String(!!on));
  };
  b.addEventListener("click", () => onPress());
  return b;
}

const pieceHtml = (pieces) => pieces.map((p) => (p.state ? `<span class="dw dw-${p.state}">${esc(p.text)}</span>` : esc(p.text))).join("");
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage off */ } };
const MODE_NAMES = { word: "Word", sentence: "Sentence", gist: "Gist" };

/**
 * The panel. `words` and `sentences`: the pieces to type, [{text, start, end, ...}] in order (dictation.js
 * wordUnits and sentencesFromWords, or a course's own); a kind left out isn't offered. `gist`: whether the
 * sentences may also be played several at a time (they follow on from each other: a player's, not a course's).
 * `lang` theirs. Where to begin: `from` a time (the player's place: the first piece ending after it), else
 * `startIndex` {word, sentence} (a course's). `play(unit, mode)` plays a piece and stops after it; a gist passage
 * is {text, start, end, parts}. `stop()` stops it. `slow(on)`, if given, slows the sound down and back. `end`
 * {label, run}: what Next does after the last piece besides starting again (the next reel). `autoplay` false:
 * the first piece waits for "Hear it again" (a reel still loading). `onMove(mode, k)` each time a piece plays.
 * `onClose()` once it is put away. Returns {el, close(), active(), again()}; `active()` is true while it is
 * being used (for the study minutes).
 */
export function dictationPanel({ words = null, sentences = null, gist = false, lang, from = null, startIndex = {}, play,
  stop = () => {}, slow = null, end = null, autoplay = true, onMove = () => {}, onClose = () => {} }) {
  const attrs = langAttrs(lang);
  const offered = [words && words.length ? "word" : "", sentences && sentences.length ? "sentence" : "",
    gist && sentences && sentences.length > 1 ? "gist" : ""].filter(Boolean);
  const el = h(`<section class="dict" aria-label="Type what you hear">
    <div class="dict-head">
      <span class="dict-icon">${icon("keyboard", 18)}</span>
      <div class="dict-headtext"><b>Type what you hear</b><span class="dict-count small muted"></span></div>
      <button type="button" class="ghost dict-close" title="Back to the words" aria-label="Back to the words">${icon("close", 18)}</button>
    </div>
    <div class="dict-modes" ${offered.length > 1 ? "" : "hidden"}>
      <div class="dict-seg" role="radiogroup" aria-label="How much at a time">
        ${offered.map((m) => `<button type="button" role="radio" aria-checked="false" data-mode="${m}">${MODE_NAMES[m]}</button>`).join("")}
      </div>
      <div class="dict-sizes" role="radiogroup" aria-label="Sentences at a time" hidden>
        <span class="small muted">Sentences:</span>
        ${GIST_SIZES.map((n) => `<button type="button" role="radio" aria-checked="false" data-size="${n}">${n}</button>`).join("")}
      </div>
    </div>
    <div class="dict-body">
      <div class="dict-real ar" ${attrs} translate="no" hidden></div>
      <textarea class="dict-input ar" ${attrs} rows="2" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
      <div class="dict-yours ar" ${attrs} translate="no" hidden></div>
      <p class="dict-score" hidden></p>
      <div class="dict-actions">
        <button type="button" class="dict-again">${icon("sound", 16)} Hear it again</button>
        ${slow ? `<button type="button" class="ghost dict-slow" aria-pressed="false" title="Play it slower">Slower</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="primary dict-go">Check</button>
      </div>
      <p class="dict-hint small muted"></p>
    </div>
    <div class="dict-done" hidden>
      <p class="dict-done-score"></p>
      <div class="dict-actions">
        <button type="button" class="dict-restart">Start again</button>
        <button type="button" class="primary dict-end" hidden></button>
        <button type="button" class="ghost dict-leave">Back to the words</button>
      </div>
    </div>
  </section>`);
  const $ = (sel) => el.querySelector(sel);
  const input = $(".dict-input");
  const go = $(".dict-go");
  const saved = lsGet("dictMode", "sentence");
  let mode = offered.includes(saved) ? saved : offered.includes("sentence") ? "sentence" : offered[0];
  let size = Math.max(2, Math.min(5, Number(lsGet("dictGist", 3)) || 3));
  let units = [];
  let k = 0;
  let checked = false;
  let used = Date.now();
  let slowed = false;
  let closed = false;
  const scores = { word: new Map(), sentence: new Map(), gist: new Map() }; // piece -> share right (0..1)
  const touch = () => { used = Date.now(); };
  const timed = (list) => list.length > 0 && Number.isFinite(list[0].start);
  const firstAfter = (list, time) => Math.max(0, list.findIndex((u) => u.end > time + 0.05));   // (the one being heard)
  const firstFrom = (list, time) => Math.max(0, list.findIndex((u) => u.start >= time - 0.05));  // (word times overlap a little)

  function unitsOf(m) {
    if (m === "word") return words || [];
    if (m === "gist") return passages(sentences, size, lang);
    return sentences || [];
  }

  function paintModes() {
    for (const b of el.querySelectorAll(".dict-seg [data-mode]")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    $(".dict-sizes").hidden = mode !== "gist";
    for (const b of el.querySelectorAll(".dict-sizes [data-size]")) {
      b.classList.toggle("on", Number(b.dataset.size) === size);
      b.setAttribute("aria-checked", String(Number(b.dataset.size) === size));
    }
    el.classList.toggle("gist", mode === "gist");
    el.classList.toggle("word", mode === "word");
    input.rows = mode === "gist" ? 4 : mode === "word" ? 1 : 2;
    // (Set here: the box is in the language being learned, which the page's translation leaves alone.)
    input.placeholder = mode === "gist" ? t("Write what you heard: the words you caught, or what it was about")
      : mode === "word" ? t("Type the word you heard") : t("Type what you heard");
    input.setAttribute("aria-label", t("What you heard"));
    $(".dict-hint").textContent = mode === "gist" ? t("Enter shows what was said · Shift+Enter starts a new line")
      : t("Enter checks it · Shift+Enter plays it again");
  }

  function paintCount() {
    const done = [...scores[mode].values()];
    const so = done.length && mode !== "gist"
      ? ` · ${t("{0}% right so far", Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 100))}` : "";
    const which = mode === "word" ? t("Word {0} of {1}", k + 1, units.length)
      : mode === "gist" ? t("Part {0} of {1}", k + 1, units.length) : t("Sentence {0} of {1}", k + 1, units.length);
    $(".dict-count").textContent = which + so;
  }

  /** To another way (or another gist size), carrying on from the same place. */
  function setMode(m) {
    const here = units[k];
    mode = m;
    lsSet("dictMode", m);
    units = unitsOf(m);
    if (here && timed(units) && Number.isFinite(here.start)) k = firstFrom(units, here.start);
    else k = Math.min(Number(startIndex[m]) || 0, units.length - 1);
    paintModes();
    stop();
    show(Math.max(0, k));
  }

  function show(i, autoplayNow = true) {
    k = i;
    checked = false;
    $(".dict-body").hidden = false;
    $(".dict-done").hidden = true;
    $(".dict-real").hidden = true;
    $(".dict-yours").hidden = true;
    $(".dict-score").hidden = true;
    input.hidden = false;
    input.value = "";
    go.textContent = t("Check");
    paintCount();
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "nearest" });
    touch();
    if (autoplayNow) playNow();
  }
  function playNow() {
    onMove(mode, k);
    play(units[k], mode);
  }

  function check() {
    const u = units[k];
    const typed = input.value.trim();
    const gistNow = mode === "gist";
    const r = gistNow ? caughtWords(u.text, typed, lang) : compareTyped(u.text, typed, lang);
    scores[mode].set(k, typed ? shareRight(r) : 0);
    checked = true;
    touch();
    const real = $(".dict-real");
    real.innerHTML = pieceHtml(r.real);
    real.hidden = false;
    const yours = $(".dict-yours");
    yours.innerHTML = !typed ? `<span class="muted" translate="yes">${esc(t("(nothing typed)"))}</span>`
      : gistNow ? esc(typed) : pieceHtml(r.typed);
    yours.hidden = false;
    input.hidden = true;
    const score = $(".dict-score");
    const all = r.right === r.total;
    if (gistNow) {
      score.textContent = r.right + r.near ? t("You caught {0} of its {1} words.", r.right + r.near, r.total) : t("Here is everything that was said.");
    } else {
      const got = r.letters ? t("{0} of {1} letters right", r.right, r.total) : t("{0} of {1} words right", r.right, r.total);
      score.textContent = mode === "word" && r.total === 1 ? (all ? t("Right.") : r.near ? t("Nearly right.") : t("Not this time."))
        : all ? (r.letters ? t("Every letter right.") : mode === "word" ? t("Right.") : t("Every word right."))
        : [got, r.near ? t("{0} nearly right", r.near) : ""].filter(Boolean).join(" · ");
    }
    score.classList.toggle("all", !gistNow && all);
    score.hidden = false;
    go.textContent = k + 1 < units.length ? t("Next") : t("Finish");
    paintCount();
    go.focus({ preventScroll: true });
    go.scrollIntoView({ block: "nearest" }); // (a long gist pushes the buttons down)
  }

  function finish() {
    stop();
    const done = [...scores[mode].values()];
    const avg = done.length ? Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 100) : 0;
    $(".dict-body").hidden = true;
    $(".dict-done").hidden = false;
    $(".dict-done-score").textContent = mode === "gist" ? t("Finished: {0} parts listened to.", done.length)
      : mode === "word" ? t("Finished: {0}% right over {1} words.", avg, done.length)
      : t("Finished: {0}% right over {1} sentences.", avg, done.length);
    const e = $(".dict-end");
    e.hidden = !end;
    if (end) e.textContent = t(end.label);
    (end ? e : $(".dict-restart")).focus({ preventScroll: true });
  }

  go.onclick = () => {
    if (!checked) check();
    else if (k + 1 < units.length) show(k + 1);
    else finish();
  };
  $(".dict-again").onclick = () => { touch(); playNow(); if (!checked) input.focus({ preventScroll: true }); };
  for (const b of el.querySelectorAll(".dict-seg [data-mode]")) b.onclick = () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); };
  for (const b of el.querySelectorAll(".dict-sizes [data-size]")) {
    b.onclick = () => {
      const n = Number(b.dataset.size);
      if (n === size) return;
      size = n;
      lsSet("dictGist", n);
      scores.gist.clear(); // (the parts are other parts now)
      setMode("gist");
    };
  }
  if (slow) {
    $(".dict-slow").onclick = (e) => {
      slowed = !slowed;
      e.currentTarget.classList.toggle("on", slowed);
      e.currentTarget.setAttribute("aria-pressed", String(slowed));
      slow(slowed);
      touch();
      playNow();
    };
  }
  input.addEventListener("input", touch);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;  // (a Japanese or Chinese keyboard choosing its characters)
    if (e.shiftKey && mode === "gist") return;  // (a new line: the gist can be long)
    e.preventDefault();
    if (e.shiftKey) $(".dict-again").click();
    else go.click();
  });
  // On a phone the keyboard covers half the screen: the box stays where it can be seen.
  input.addEventListener("focus", () => setTimeout(() => { if (!closed) el.scrollIntoView({ block: "nearest" }); }, 300));
  $(".dict-restart").onclick = () => { scores[mode].clear(); show(0); };
  $(".dict-end").onclick = () => end && end.run();
  const close = () => {
    if (closed) return;
    closed = true;
    stop();
    if (slowed && slow) slow(false);
    el.remove();
    onClose();
  };
  $(".dict-close").onclick = close;
  $(".dict-leave").onclick = close;

  if (!offered.length) {
    $(".dict-body").innerHTML = `<p class="muted">${esc(t("There are no sentences to type here yet."))}</p>`;
  } else {
    units = unitsOf(mode);
    k = from !== null && timed(units) ? firstAfter(units, from) : Math.max(0, Math.min(Number(startIndex[mode]) || 0, units.length - 1));
    paintModes();
    queueMicrotask(() => { if (!closed) show(k, autoplay); });
  }
  return {
    el,
    close,
    active: () => !closed && Date.now() - used < 30000,
    /** The piece playing again (the player's own key for it while the panel is open). */
    again: () => { if (!closed && units.length) $(".dict-again").click(); },
  };
}
