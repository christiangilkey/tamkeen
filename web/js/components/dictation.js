// "Type what you hear": the panel that takes the place of the words in a player (the transcript, the
// captions) while the learner writes down what they hear.
//
// Three ways, switched at the top (the choice is remembered on this device):
//   - Word: one word plays; they type it, and the word is shown.
//   - Sentence: one sentence plays with nothing of its text on screen; they type it, and the real sentence appears
//     ABOVE what they typed.
//   - Gist: 2–5 sentences play in a row (they choose how many); they write what they heard (the words they
//     caught, or what it was about, in any language) and then see everything that was said.
// Nothing is marked right or wrong and there is no score (the owner, 2026-11-20: "the user can determine that on their
// own volition"): what was said and what they typed are both shown plainly, for them to compare. Each word of what
// was said opens the word popup when tapped (onReal).
// The round button right of the three (a check mark, then an arrow) shows what was said, then goes on: up there,
// a phone's keyboard never covers it. While typing, the player's own buttons (play, pause, the arrows, speed) leave
// the box focused, so the keyboard stays up (keepTyping). Next plays the next one. The cutting into pieces is
// web/js/dictation.js; the player the panel sits in plays the pieces (`play(unit)`), so the same panel serves every
// player with sound: podcasts, audiobooks, your own audio and videos, YouTube, Netflix, reels and courses.

import { esc, h } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { langAttrs } from "../languages.js";
import { GIST_SIZES, passages, piecesOf, stepChoice } from "../dictation.js";
import { feature } from "../prototype.js";
import { selectAt } from "./selectsheet.js";

// Not released yet: the owner tests it first (2026-11-17, v0.61.0 went out without it). Hidden everywhere (the
// players' button, the W key, the controller's option, the courses' button) unless this device is in prototype
// mode (../prototype.js: five quick taps on the version in Settings). To release it, set PROTOTYPES.dictation's
// `released` to true there.
/** Whether "Type what you hear" is offered on this device. */
export const dictationOn = () => feature("dictation");

const BACK_AGAIN_MS = 1500; // Back within this long of a piece starting goes to the one before (as a music player's)

/** While typing, a player's 5-second buttons step by the piece instead (`dict.back()`, `dict.next()`): they show
 *  plain arrows then. Returns the way back to how they were. */
export function arrowButtons(backBtn, fwdBtn) {
  const was = [backBtn, fwdBtn].map((b) => b && [b.innerHTML, b.title, b.getAttribute("aria-label")]);
  const set = (b, html, title) => { if (!b) return; b.innerHTML = html; b.title = title; b.setAttribute("aria-label", title); b.classList.add("dict-step"); };
  set(backBtn, icon("chevronLeft", 20), t("Back: this piece again, or the one before"));
  set(fwdBtn, icon("chevron", 20), t("The next piece"));
  return () => [backBtn, fwdBtn].forEach((b, i) => {
    if (!b || !was[i]) return;
    [b.innerHTML, b.title] = was[i];
    if (was[i][2] === null) b.removeAttribute("aria-label"); else b.setAttribute("aria-label", was[i][2]);
    b.classList.remove("dict-step");
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

/** What was said, plainly: each word a span (numbered `data-p` when `numbered`: the words with letters, in order, as
 *  dictation.js pieceWords counts them, for a tap on one: onReal), spaces and punctuation as they are. */
const wordsHtml = (text, lang, numbered = false) => {
  let n = 0;
  return piecesOf(text, lang).map((p) => (!p.key ? esc(p.text)
    : `<span class="dw"${numbered ? ` data-p="${n++}"` : ""}>${esc(p.text)}</span>`)).join("");
};
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
 * `onClose()` once it is put away. `onReal(el, unit, mode)`, if given, each time a piece has been checked and what
 * was really said is shown in `el`: its words, each a span numbered `data-p` (0, 1, … the words of the piece's text
 * that have letters, dictation.js pieceWords), open the word popup when tapped (the owner, 2026-11-20). Returns
 * {el, close(), active(), again()}; `active()` is true while it is being used (for the study minutes).
 */
export function dictationPanel({ words = null, sentences = null, gist = false, lang, from = null, startIndex = {}, play,
  stop = () => {}, slow = null, end = null, autoplay = true, onMove = () => {}, onClose = () => {}, onReal = null }) {
  const attrs = langAttrs(lang);
  // The typing box takes its direction from what is in it: an English hint in a right-to-left box was cut off at the
  // edge on Android (the owner, 2026-11-18), and a gist may be written in any language.
  const boxAttrs = attrs.replace(/dir="[^"]*"/, `dir="auto"`);
  const offered = [words && words.length ? "word" : "", sentences && sentences.length ? "sentence" : "",
    gist && sentences && sentences.length > 1 ? "gist" : ""].filter(Boolean);
  const el = h(`<section class="dict" aria-label="Type what you hear">
    <div class="dict-head">
      <span class="dict-icon">${icon("keyboard", 18)}</span>
      <div class="dict-headtext"><b>Type what you hear</b><span class="dict-count small muted"></span></div>
      <button type="button" class="ghost dict-close" title="Back to the words" aria-label="Back to the words">${icon("close", 18)}</button>
    </div>
    <div class="dict-modes" ${offered.length ? "" : "hidden"}>
      <div class="dict-line">
        <div class="dict-seg" role="radiogroup" aria-label="How much at a time" ${offered.length > 1 ? "" : "hidden"}>
          ${offered.map((m) => `<button type="button" role="radio" aria-checked="false" data-mode="${m}">${MODE_NAMES[m]}</button>`).join("")}
        </div>
        <button type="button" class="primary dict-go" title="Show what was said" aria-label="Show what was said">${icon("check", 20)}</button>
      </div>
      <div class="dict-sizes" role="radiogroup" aria-label="Sentences at a time" hidden>
        <span class="small muted">Sentences:</span>
        ${GIST_SIZES.map((n) => `<button type="button" role="radio" aria-checked="false" data-size="${n}">${n}</button>`).join("")}
      </div>
    </div>
    <div class="dict-body">
      <div class="dict-real ar" ${attrs} translate="no" hidden></div>
      <textarea class="dict-input ar" ${boxAttrs} rows="2" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
      <div class="dict-yours ar" ${attrs} translate="no" hidden></div>
      <div class="dict-actions">
        <button type="button" class="dict-again">${icon("sound", 16)} Hear it again</button>
        ${slow ? `<button type="button" class="ghost dict-slow" aria-pressed="false" title="Play it slower">Slower</button>` : ""}
        <button type="button" class="ghost dict-hide" title="Hide what was said" aria-label="Hide what was said" hidden>${icon("eyeoff", 16)} <span>Hide</span></button>
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
  let playedAt = 0; // when the piece showing last started playing (Back: it again, or the one before)
  const heard = { word: new Set(), sentence: new Set(), gist: new Set() }; // the pieces shown, for "Finished: …"
  const touch = () => { used = Date.now(); };
  const timed = (list) => list.length > 0 && Number.isFinite(list[0].start);
  const firstAfter = (list, time) => Math.max(0, list.findIndex((u) => u.end > time + 0.05));   // (the one being heard)
  const firstFrom = (list, time) => Math.max(0, list.findIndex((u) => u.start >= time - 0.05));  // (word times overlap a little)

  /** The round button: "check" (show what was said), "next" or "finish" (once it has been shown). */
  function paintGo(face) {
    const label = face === "check" ? t("Show what was said") : face === "next" ? t("Next") : t("Finish");
    go.innerHTML = icon(face === "check" ? "check" : "chevron", 20);
    go.title = label;
    go.setAttribute("aria-label", label);
  }

  // The row of switches with the round button stays at the top of the panel while it scrolls (media.css): what is
  // scrolled into view is kept below it, not under it.
  const padTop = () => { el.style.scrollPaddingTop = `${$(".dict-modes").hidden ? 0 : $(".dict-modes").offsetHeight}px`; };
  /** `target` into view in the panel, below that row. Where the panel scrolls at all, it goes on to just past the
   *  title (as long as `target`'s top stays in sight, where the typing starts): half a title line peeking out above
   *  the row looked broken. */
  function reveal(target) {
    padTop();
    target.scrollIntoView({ block: "nearest" });
    if (el.scrollHeight <= el.clientHeight || el.scrollTop <= 0) return;
    const box = el.getBoundingClientRect();
    const headEnd = Math.round($(".dict-head").getBoundingClientRect().bottom - box.top + el.scrollTop);
    const targetTop = target.getBoundingClientRect().top - box.top + el.scrollTop;
    if (el.scrollTop < headEnd && targetTop - headEnd >= $(".dict-modes").offsetHeight) el.scrollTop = headEnd;
  }

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
      : t("Enter shows what was said · Shift+Enter plays it again");
  }

  function paintCount() {
    const which = mode === "word" ? t("Word {0} of {1}", k + 1, units.length)
      : mode === "gist" ? t("Part {0} of {1}", k + 1, units.length) : t("Sentence {0} of {1}", k + 1, units.length);
    $(".dict-count").textContent = which;
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
    input.hidden = false;
    input.value = "";
    $(".dict-hide").hidden = true;
    go.hidden = false;
    paintGo("check");
    paintCount();
    input.focus({ preventScroll: true });
    reveal(input);
    touch();
    if (autoplayNow) playNow();
  }
  function playNow() {
    playedAt = Date.now();
    onMove(mode, k);
    play(units[k], mode);
  }

  function check() {
    const u = units[k];
    const typed = input.value.trim();
    heard[mode].add(k);
    checked = true;
    touch();
    const real = $(".dict-real");
    real.innerHTML = wordsHtml(u.text, lang, !!onReal);
    real.classList.toggle("dict-tap", !!onReal);
    real.hidden = false;
    if (onReal) onReal(real, u, mode);
    const yours = $(".dict-yours");
    yours.innerHTML = !typed ? `<span class="muted" translate="yes">${esc(t("(nothing typed)"))}</span>` : esc(typed);
    yours.hidden = false;
    input.hidden = true;
    $(".dict-hide").hidden = false;
    paintGo(k + 1 < units.length ? "next" : "finish");
    paintCount();
    go.focus({ preventScroll: true });
    reveal(real); // (what was said, just under the button)
  }

  function finish() {
    stop();
    const done = heard[mode].size;
    $(".dict-body").hidden = true;
    $(".dict-done").hidden = false;
    go.hidden = true;
    $(".dict-done-score").textContent = mode === "gist" ? t("Finished: {0} parts listened to.", done)
      : mode === "word" ? t("Finished: {0} words listened to.", done) : t("Finished: {0} sentences listened to.", done);
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
  // Hide (the owner, 2026-11-21: "once the user shows the transcripts, there should be a button at the bottom right to
  // hide it again on the same line as the hear it again or slower options"): what was said goes away, and the box
  // comes back with what they typed in it, to listen again and change it; the round button shows it again.
  $(".dict-hide").onclick = () => {
    checked = false;
    touch();
    $(".dict-real").hidden = true;
    $(".dict-yours").hidden = true;
    $(".dict-hide").hidden = true;
    input.hidden = false;
    paintGo("check");
    input.focus({ preventScroll: true });
    reveal(input);
  };
  $(".dict-again").onclick = () => { touch(); playNow(); if (!checked) input.focus({ preventScroll: true }); };
  for (const b of el.querySelectorAll(".dict-seg [data-mode]")) b.onclick = () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); };
  for (const b of el.querySelectorAll(".dict-sizes [data-size]")) {
    b.onclick = () => {
      const n = Number(b.dataset.size);
      if (n === size) return;
      size = n;
      lsSet("dictGist", n);
      heard.gist.clear(); // (the parts are other parts now)
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
  // On a phone the keyboard covers half the screen: the box stays where it can be seen. As the keyboard comes up the
  // page gets shorter: the box is brought back into view under the round button (the owner, 2026-11-20).
  input.addEventListener("focus", () => setTimeout(() => { if (!closed) el.scrollIntoView({ block: "nearest" }); }, 300));
  const onResize = () => {
    if (closed || input.hidden || document.activeElement !== input) return;
    reveal(input);
  };
  window.addEventListener("resize", onResize);
  // ---- keeping the keyboard up (the owner, 2026-11-18: "I don't want pressing the play or pause button, or any of
  // the buttons on the player bar OTHER THAN pressing the transcription button again ... to get rid of the user's on
  // screen keyboard, so they can seamlessly transcribe while listening") ----
  // While the box has the focus, a press on a button in `bars` doesn't take it: the press's mousedown (also sent
  // after a tap) is cancelled, which is what moves the focus. A browser that moves it anyway gets it back as the
  // press ends (still part of the tap, so a phone shows its keyboard again). A drop-down there (speed) steps to its
  // next choice instead of opening its list, which would cover the keyboard or put it away. Buttons in `except`
  // (the keyboard button, which puts the panel away) and the seek slider work as before.
  const offs = [() => window.removeEventListener("resize", onResize)];
  const typing = () => !closed && !input.hidden && document.activeElement === input;
  function keepTyping(bars, { except = [] } = {}) {
    bars = bars.filter(Boolean);
    const inBars = (x) => bars.some((b) => b.contains(x));
    const controlAt = (e) => {
      const t0 = e.target instanceof Element ? e.target : null;
      if (!t0 || !inBars(t0)) return null;
      // (On a touch screen a drop-down takes no taps itself, selectsheet.js: the tap lands on what holds it.)
      const c = t0.closest("button, select") || selectAt(e.clientX, e.clientY, t0);
      return c && inBars(c) && !c.disabled && !except.some((x) => x && x.contains(c)) ? c : null;
    };
    let pressed = null; // the control pressed while typing
    let refocus = false;
    const back = () => {
      if (closed || input.hidden || document.activeElement === input) return;
      const a = document.activeElement;
      if (a && a !== document.body && !inBars(a)) return; // something else took it on purpose (a menu, a sheet)
      input.focus({ preventScroll: true });
    };
    const onPointer = (e) => { pressed = typing() ? controlAt(e) : null; };
    const onMouse = (e) => { if (pressed && controlAt(e) === pressed) e.preventDefault(); };
    const onClickFirst = (e) => {
      const c = pressed;
      pressed = null;
      refocus = false;
      if (!c || controlAt(e) !== c) return;
      if (c instanceof HTMLSelectElement) {
        e.preventDefault();
        e.stopPropagation();
        stepChoice(c);
        back();
        return;
      }
      refocus = true; // (once the button has done its job: onClickLast)
    };
    const onClickLast = () => { if (refocus) { refocus = false; back(); } };
    const on = (type, fn, capture) => { window.addEventListener(type, fn, capture); offs.push(() => window.removeEventListener(type, fn, capture)); };
    on("pointerdown", onPointer, true);
    on("mousedown", onMouse, true);
    on("click", onClickFirst, true);  // (before the drop-downs' own list opens: selectsheet.js listens on the document)
    on("click", onClickLast, false);
  }
  keepTyping([$(".dict-modes"), $(".dict-body .dict-actions")]); // the panel's own buttons too

  $(".dict-restart").onclick = () => { heard[mode].clear(); show(0); };
  $(".dict-end").onclick = () => end && end.run();
  const close = () => {
    if (closed) return;
    closed = true;
    for (const off of offs.splice(0)) off();
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
    /** The player's own bars (play, pause, the arrows, speed…): pressing their buttons leaves the box focused.
     *  `except`: the buttons that may take the focus (the keyboard button). Undone when the panel is put away. */
    keepTyping,
    active: () => !closed && Date.now() - used < 30000,
    /** The player's own Play while the panel is open (the owner, 2026-11-21: "pressing the play button should work exactly
     *  like pressing the check mark button does, where it will still pause at the right intervals"): what the round
     *  button does, so a piece not yet checked is shown, and one shown goes on to the next, which plays to its end and
     *  stops. False when the round button has nothing to do (put away, finished, nothing to type): Play plays as usual. */
    pressGo: () => {
      if (closed || !units.length || go.hidden || !$(".dict-done").hidden) return false;
      go.click();
      return true;
    },
    /** The piece playing again (the player's own key for it while the panel is open). */
    again: () => { if (!closed && units.length) $(".dict-again").click(); },
    /** The player's back and forward buttons while typing (the owner, 2026-11-18): by the piece in the way chosen
     *  (a word, a sentence, or a gist's 2 to 5 sentences), not 5 seconds. Back: the start of this piece again when it
     *  has been playing for a moment, else the piece before. Forward: the next piece. */
    back: () => {
      if (closed || !units.length || !$(".dict-done").hidden) return;
      stop();
      show(Date.now() - playedAt > BACK_AGAIN_MS || k === 0 ? k : k - 1);
    },
    next: () => {
      if (closed || !units.length || !$(".dict-done").hidden) return;
      stop();
      if (k + 1 < units.length) show(k + 1);
      else finish();
    },
  };
}
