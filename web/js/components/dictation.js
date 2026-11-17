// "Type what you hear": the panel that takes the place of the words in a player (the transcript, the
// captions) while the learner writes down one sentence at a time.
//
// Each sentence plays with nothing of its text on screen. The learner types what they heard and checks it:
// the real sentence then appears ABOVE what they typed, each word marked right, nearly right or missed, and
// their own words that match none are crossed out. Next plays the next sentence. The comparing is
// web/js/dictation.js; the player it sits in plays the sentences (`play(k)`), so the same panel serves every
// player with sound: podcasts, audiobooks, your own audio and videos, YouTube, Netflix, reels and courses.

import { esc, h } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { langAttrs } from "../languages.js";
import { compareTyped, shareRight } from "../dictation.js";

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

/**
 * The panel. `sentences` [{text, start, end}] (from dictation.js sentencesFromWords, or a course's own),
 * `lang` theirs, `at` the sentence to begin with. `play(k)` plays sentence k and stops after it; `stop()`
 * stops it. `slow(on)`, if given, slows the sound down and back. `end` {label, run}: what Next does after the
 * last sentence besides starting again (the next reel). `autoplay` false: the first sentence waits for "Hear it"
 * (a reel still loading). `onClose()` once it is put away.
 * Returns {el, close(), active(), at()}; `active()` is true while it is being used (for the study minutes).
 */
export function dictationPanel({ sentences, lang, at = 0, play, stop = () => {}, slow = null, end = null, autoplay = true,
  onClose = () => {} }) {
  const attrs = langAttrs(lang);
  const el = h(`<section class="dict" aria-label="Type what you hear">
    <div class="dict-head">
      <span class="dict-icon">${icon("keyboard", 18)}</span>
      <div class="dict-headtext"><b>Type what you hear</b><span class="dict-count small muted"></span></div>
      <button type="button" class="ghost dict-close" title="Back to the words" aria-label="Back to the words">${icon("close", 18)}</button>
    </div>
    <div class="dict-body">
      <div class="dict-real ar" ${attrs} translate="no" hidden></div>
      <textarea class="dict-input ar" ${attrs} rows="2" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
      <div class="dict-yours ar" ${attrs} translate="no" hidden></div>
      <p class="dict-score" hidden></p>
      <div class="dict-actions">
        <button type="button" class="dict-again">${icon("sound", 16)} Hear it again</button>
        ${slow ? `<button type="button" class="ghost dict-slow" aria-pressed="false" title="Play the sentences slower">Slower</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="primary dict-go">Check</button>
      </div>
      <p class="dict-hint small muted">Enter checks it · Shift+Enter plays the sentence again</p>
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
  // (Set here: the box is in the language being learned, which the page's translation leaves alone.)
  input.placeholder = t("Type what you heard");
  input.setAttribute("aria-label", t("What you heard"));
  const go = $(".dict-go");
  let k = Math.max(0, Math.min(at, sentences.length - 1));
  let checked = false;
  let used = Date.now();
  let slowed = false;
  let closed = false;
  const scores = new Map(); // sentence -> share right (0..1)
  const touch = () => { used = Date.now(); };

  function paintCount() {
    const done = [...scores.values()];
    const so = done.length ? ` · ${t("{0}% right so far", Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 100))}` : "";
    $(".dict-count").textContent = t("Sentence {0} of {1}", k + 1, sentences.length) + so;
  }

  function show(i, autoplay = true) {
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
    touch();
    if (autoplay) play(k);
  }

  function check() {
    const s = sentences[k];
    const r = compareTyped(s.text, input.value, lang);
    scores.set(k, input.value.trim() ? shareRight(r) : 0);
    checked = true;
    touch();
    const real = $(".dict-real");
    real.innerHTML = pieceHtml(r.real);
    real.hidden = false;
    const yours = $(".dict-yours");
    yours.innerHTML = input.value.trim() ? pieceHtml(r.typed) : `<span class="muted" translate="yes">${esc(t("(nothing typed)"))}</span>`;
    yours.hidden = false;
    input.hidden = true;
    const score = $(".dict-score");
    const all = r.right === r.total;
    const got = r.letters ? t("{0} of {1} letters right", r.right, r.total) : t("{0} of {1} words right", r.right, r.total);
    score.textContent = all ? (r.letters ? t("Every letter right.") : t("Every word right."))
      : [got, r.near ? t("{0} nearly right", r.near) : ""].filter(Boolean).join(" · ");
    score.classList.toggle("all", all);
    score.hidden = false;
    go.textContent = k + 1 < sentences.length ? t("Next") : t("Finish");
    paintCount();
    go.focus({ preventScroll: true });
  }

  function finish() {
    stop();
    const done = [...scores.values()];
    const avg = done.length ? Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 100) : 0;
    $(".dict-body").hidden = true;
    $(".dict-done").hidden = false;
    $(".dict-done-score").textContent = t("Finished: {0}% right over {1} sentences.", avg, done.length);
    const e = $(".dict-end");
    e.hidden = !end;
    if (end) e.textContent = t(end.label);
    (end ? e : $(".dict-restart")).focus({ preventScroll: true });
  }

  go.onclick = () => {
    if (!checked) check();
    else if (k + 1 < sentences.length) show(k + 1);
    else finish();
  };
  $(".dict-again").onclick = () => { touch(); play(k); if (!checked) input.focus({ preventScroll: true }); };
  if (slow) {
    $(".dict-slow").onclick = (e) => {
      slowed = !slowed;
      e.currentTarget.classList.toggle("on", slowed);
      e.currentTarget.setAttribute("aria-pressed", String(slowed));
      slow(slowed);
      touch();
      play(k);
    };
  }
  input.addEventListener("input", touch);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;  // (a Japanese or Chinese keyboard choosing its characters)
    e.preventDefault();
    if (e.shiftKey) $(".dict-again").click();
    else go.click();
  });
  // On a phone the keyboard covers half the screen: the box stays where it can be seen.
  input.addEventListener("focus", () => setTimeout(() => { if (!closed) el.scrollIntoView({ block: "nearest" }); }, 300));
  $(".dict-restart").onclick = () => { scores.clear(); show(0); };
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

  if (!sentences.length) {
    $(".dict-body").innerHTML = `<p class="muted">${esc(t("There are no sentences to type here yet."))}</p>`;
  } else {
    queueMicrotask(() => { if (!closed) show(k, autoplay); });
  }
  return {
    el,
    close,
    active: () => !closed && Date.now() - used < 30000,
    at: () => k,
    /** The sentence playing again (the player's own key for it while the panel is open). */
    again: () => $(".dict-again") && $(".dict-again").click(),
  };
}
