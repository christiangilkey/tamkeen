// The vocab reviewer: flashcards over the Vocab page, scheduled by FSRS (web/js/review/fsrs.js).
//
// A card's front is in the learner's own language: the word's meaning with the translated
// sentence under it. Its back has the answer on top, large and alone (the word, its sentence
// and its audio), and under a clear gap everything else about the word: meaning, grammar notes and
// "Personal notes", the learner's own box for a mnemonic. There are two answers,
// "Remembered" and "Not remembered": buttons, a swipe of the card, or the keyboard. A missed
// word comes back a few cards later until it has been remembered once. A slim bar on the card
// fills toward a time goal for it and a clock in the top bar counts the session (both can be
// switched off in the reviewer's settings; review/cardtimer.js).
//
// It opens as a layer over the page, not as a page of its own, so closing it lands on the Vocab
// list exactly as it was. Every answer is sent to /reviews as it is given.
//
// The back can be put right as it is reviewed: under the word its meaning, and under the sentence
// its translation, small (in the learner's own language); a tap on any of the four turns it into a
// text box, and holding a word of the sentence (or of the translation) lights it up as part of what
// is being learned, or puts it out. Both are saved like the Meaning box (review/cardedit.js).

import { api, buzz, esc, fmtDate, h, platform, readClipboard, state as app, toast } from "../app.js";
import { detectLanguage, langAttrs, langInfo, setLang, wordRanges } from "../languages.js";
import { formatTime } from "../wordlookup.js";
import { CARD_SENTENCE_MAX, litParts, litPieces, trimSpan, unmarked, vowelPlaces } from "../cardtext.js";
import { EDITABLE_SELECTOR, editPayload, editValue, editable, fieldOf, holdPayload } from "../review/cardedit.js";
import { firstVisitTour } from "../components/tour.js";
import { canSay, hasOwnAudio, speakingSeconds, voiceText, voiceTimes } from "../cardvoice.js";
import { addReadings } from "../lexicon/readings.js";
import { reward, trackStudy } from "../game/game.js";
import { vowelCard } from "../vowels.js";
import { AGAIN, GOOD, answer, dayNumber, nextWait } from "../review/fsrs.js";
import { NEW_CHOICES, NEW_PER_DAY, forecast, plan, prompt, queue, requeue, reviewable, states, strength, uidOf, waitText } from "../review/deck.js";
import { practise, practiseButton } from "../review/pronounce.js";
import { soundAlikes } from "../review/mnemonic.js";
import { askMnemonic } from "../define-service.js";
import { troubleshootButton } from "../components/troubleshoot.js";
import { UI_LANGUAGES, t, uiLanguage } from "../i18n.js";
import { cardGoal, deviceTimes, forgetAnswer, model, noteAnswer } from "../review/goal.js";
import { GOAL_CHOICES, clockText, goalSeconds, setTimer, stopwatch, timerSettings } from "../review/cardtimer.js";

const MORE_NEW = 10;      // "Learn 10 more new words" at the end of a session
const KEY_GUARD_MS = 250; // a key held down while the card turns must not answer it too
const HOLD_MS = 450;      // pressing a word of the sentence this long lights it up (or puts it out)
// What a screen reader says for each text box that a tap opens on the back of a card.
const EDIT_LABELS = { text: "Edit the word", meaning: "Edit the meaning", sentence: "Edit the sentence", translation: "Edit the translation" };

function pref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
/** New words a day, as chosen in the reviewer's settings on this device. */
export function newPerDay() {
  const n = pref("reviewNewPerDay", NEW_PER_DAY);
  return NEW_CHOICES.includes(n) ? n : NEW_PER_DAY;
}
/** Change it (the reviewer's settings and the goal bar on the Vocab page share this one setting). */
export function setNewPerDay(n) {
  if (NEW_CHOICES.includes(n)) setPref("reviewNewPerDay", n);
}

/** Every answer ever given, by word: {uid: [[t, rating, day, ms], ...]}. */
export async function loadLog() {
  return (await api("/reviews")).reviews || {};
}

/**
 * Cards left to review today, and on each of the next days if none is reviewed in between, for the
 * number on the app's icon: {day, counts: [today, tomorrow, ...]} (day as in fsrs.dayNumber). The
 * later days let the phone's widget and icon roll over at midnight without the app being opened.
 */
export async function reviewsLeft(days = 7) {
  const [words, log] = await Promise.all([api("/vocab"), loadLog()]);
  const day = dayNumber();
  const counts = [];
  for (let i = 0; i < days; i++) {
    const o = overview(words, log, day + i);
    counts.push(o.due + o.fresh);
  }
  return { day, counts };
}

/** What is waiting among `words` today, for the banner on the Vocab page. */
export function overview(words, log, today = dayNumber()) {
  const cards = states(log);
  const p = plan(words, cards, today, newPerDay());
  const ahead = forecast(words, cards, today, 30);
  const next = ahead.findIndex((n) => n > 0);
  return { due: p.due.length, fresh: p.fresh.length, waiting: p.waiting, next: next < 0 ? null : { days: next + 1, count: ahead[next] },
           askable: (words || []).some(reviewable) };
}

// ----- sound: a few synthesised notes, no audio files (the game's sound switch silences them) -----
let audioCtx = null;
function tone(freq, start, length, type = "sine", volume = 0.07) {
  const s = app.status && app.status.settings;
  if (s && (s.game_sound === false || s.game_enabled === false)) return;  // sound off, or the game off
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + start;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + length);
  } catch { /* no sound available */ }
}
const SOUND = {
  flip: () => tone(540, 0, 0.05, "triangle", 0.03),
  // Each answer in a row is a semitone higher than the last, up to an octave.
  yes: (streak) => { const f = 587 * 2 ** (Math.min(streak, 12) / 12); tone(f, 0, 0.1, "triangle"); tone(f * 1.5, 0.07, 0.18, "sine", 0.06); },
  no: () => { tone(233, 0, 0.16, "sine", 0.06); tone(175, 0.09, 0.22, "sine", 0.05); },
  cheer: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, "triangle", 0.06)),
  undo: () => tone(392, 0, 0.08, "triangle", 0.04),
};

const ICON = {
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/></svg>`,
  yes: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  no: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  paste: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4.5" width="12" height="16" rx="2.2"/><path d="M9.5 4.5V3.5h5v1M9.5 11h5M9.5 14.5h3.5"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 11.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 10.8v5.2M14 10.8v5.2"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2.5h4"/></svg>`,
};
/** The banner's icon: two cards, one behind the other. */
export const CARDS_ICON = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="7.5" y="3.5" width="12" height="15" rx="2.5" transform="rotate(8 13.5 11)"/><rect x="4.5" y="5.5" width="12" height="15" rx="2.5" fill="currentColor" fill-opacity=".22"/></svg>`;

const calm = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Run an animation to its end (at once for someone who has asked for less motion). A window that
 * is hidden or minimised stops drawing, and an animation would then never end by itself, so a
 * timer ends it: the reviewer must never be left waiting on one. */
async function play(el, frames, options) {
  if (calm() || !el.animate) return;
  const anim = el.animate(frames, options);
  let timer;
  try {
    await Promise.race([anim.finished, new Promise((done) => { timer = setTimeout(done, options.duration + 120); })]);
  } catch { /* cut short: carry on */ }
  clearTimeout(timer);
  try { anim.finish(); } catch { /* already over */ }
}

/**
 * Open the reviewer over the page.
 *   words        the words to review (the whole list, or the folder being looked at)
 *   allWords     every saved word: the game is told when none of them is left due today
 *   log          every answer by word (from loadLog); answers given here are added to it
 *   scope        the folder's name when only a folder is being reviewed
 *   playSnippet  (word, start, end) => Promise, the Vocab page's audio
 *   say          (word, "word" | "sentence") => Promise<{ended}>, the Vocab page's way of saying a
 *                card: its own audio, else the voice chosen for cards without (voiceplay.js)
 *   onDelete     (word) => void, told when a word is deleted from its card
 *   onClose      called when the reviewer is put away
 * (The card lights the word in its sentence itself, the way the Vocab page does: cardtext.js litParts.)
 */
export function openReview({ words, allWords = words, log, scope = "", playSnippet, say = null, onDelete = () => {}, onClose = () => {} }) {
  if (document.querySelector(".rv")) return;
  const cards = states(log);
  let perDay = newPerDay();
  let bonus = 0;                       // extra new words asked for at the end of a session
  let autoplay = pref("reviewAutoplay", true);
  let timers = timerSettings();        // the time bar on each card, the session clock, a card's time goal
  const pace = model(log, deviceTimes());  // how long this learner takes, for the "Auto" time goal

  const el = h(`<div class="rv" role="dialog" aria-modal="true" aria-label="Review your vocab">
    <div class="rv-bg"></div><div class="rv-glow"></div>
    <header class="rv-top">
      <button type="button" class="rv-x" title="Close (Esc)" aria-label="Close">${ICON.close}</button>
      <div class="rv-progress" role="progressbar" aria-label="Session progress"><i></i></div>
      <span class="rv-clock" role="timer" title="Time in this session" aria-label="Time in this session" hidden>${ICON.clock}<span>0:00</span></span>
      <span class="rv-left"></span>
      <span class="rv-streak" hidden></span>
      <button type="button" class="rv-undo" title="Take back the last answer (Z)" aria-label="Undo the last answer" disabled>${ICON.undo}</button>
      <button type="button" class="rv-gear" title="Reviewer settings" aria-label="Reviewer settings">${ICON.gear}</button>
    </header>
    <div class="rv-settings" hidden>
      <div>
        <h3>New words a day</h3>
        <div class="rv-chips">${NEW_CHOICES.map((n) => `<button type="button" data-n="${n}">${n}</button>`).join("")}</div>
      </div>
      <label class="rv-check"><input type="checkbox" class="rv-auto"> Say the word when the card turns</label>
      <div class="rv-timers">
        <h3>Timers</h3>
        <label class="rv-check"><input type="checkbox" class="rv-bar-on"> A time bar on each card</label>
        <label class="rv-check"><input type="checkbox" class="rv-clock-on"> A clock for the whole session</label>
      </div>
      <div class="rv-goal">
        <h3>Time goal for each card</h3>
        <div class="rv-chips">${GOAL_CHOICES.map((c) => `<button type="button" data-goal="${c}">${c === "auto" ? "Auto" : `${c} s`}</button>`).join("")}</div>
        <p class="rv-note rv-goal-auto"></p>
        <p class="rv-note">Going over is fine: the bar just turns a calmer colour, and nothing else happens.</p>
      </div>
      <p class="rv-keys"><kbd>Space</kbd> turn the card, then remembered · <kbd>1</kbd> or <kbd>←</kbd> not remembered · <kbd>2</kbd> or <kbd>→</kbd> remembered · <kbd>Z</kbd> undo · <kbd>W</kbd> word · <kbd>S</kbd> sentence · <kbd>P</kbd> practise saying it · <kbd>N</kbd> personal notes · <kbd>Del</kbd> delete the word</p>
    </div>
    <main class="rv-stage">
      <div class="rv-wrap">
        <div class="rv-card">
          <div class="rv-timer" aria-hidden="true" hidden><i></i></div>
          <div class="rv-scroll"></div>
          <span class="rv-stamp yes">Remembered</span><span class="rv-stamp no">Again</span>
        </div>
      </div>
      <div class="rv-panel" hidden></div>
    </main>
    <footer class="rv-actions"></footer>
    <div class="rv-fx"></div>
  </div>`);
  const $ = (s) => el.querySelector(s);
  const card = $(".rv-card"), face = $(".rv-scroll"), actions = $(".rv-actions"), fx = $(".rv-fx"), panel = $(".rv-panel");

  // ----- the session -----
  let todo = [];            // words still to answer, in order; todo[0] is the card on the table
  let flipped = false;      // the back is showing
  let busy = false;         // an animation is running: answers wait
  let flippedAt = 0;
  const session = { answered: 0, firstTry: 0, started: 0, finished: 0, streak: 0, best: 0, xp: 0 };
  const tried = new Set();  // words answered at least once this session
  const undo = [];
  // Time with the reviewer in front (review/cardtimer.js): the card on the table, and the session.
  const cardWatch = stopwatch(), sessionWatch = stopwatch();
  let cardKind = "review";  // the card on the table: "new", "review" or "again" (for its time goal)

  function begin() {
    sessionWatch.go();
    tick();
    const p = plan(words, cards, dayNumber(), perDay + bonus);
    todo = queue(p.due, p.fresh);
    if (todo.length) show(); else finish();
  }

  /** After the day's allowance changed: work out the rest of the session again around the card on the table. */
  function replan() {
    const current = $(".rv-wrap").hidden ? null : todo[0];
    const taken = current && !cards.has(uidOf(current)) ? 1 : 0;
    const p = plan(words.filter((v) => v !== current), cards, dayNumber(), perDay + bonus - taken);
    todo = [...(current ? [current] : []), ...queue(p.due, p.fresh)];
    if (!current) { if (todo.length) show(); else finish(); } else header();
  }

  function header() {
    const total = session.finished + todo.length;
    $(".rv-progress i").style.width = `${total ? (session.finished / total) * 100 : 100}%`;
    $(".rv-left").textContent = todo.length ? `${todo.length} left` : "";
    const streak = $(".rv-streak");
    streak.hidden = session.streak < 2;
    streak.textContent = `🔥 ${session.streak}`;
    $(".rv-undo").disabled = !undo.length;
  }

  // ----- the timers: a bar on the card filling toward its time goal, a clock for the session -----
  const bar = $(".rv-timer");
  /** The card on the table's time goal, in seconds. */
  const goalNow = () => goalSeconds(timers.goal, cardGoal(pace, cardKind));
  /** Start the bar for the card on the table, as far along as the card's time already is. */
  function startBar() {
    const fill = bar.firstElementChild;
    bar.hidden = !timers.bar || $(".rv-wrap").hidden;
    bar.classList.remove("over");
    fill.style.animation = "none";
    if (bar.hidden) return;
    const seconds = goalNow();
    bar.title = `Time goal for this card: ${seconds} s`;
    void fill.offsetWidth;  // so the animation starts again from the beginning
    fill.style.animation = `rv-time ${seconds}s linear ${-cardWatch.ms() / 1000}s forwards`;
  }
  bar.firstElementChild.addEventListener("animationend", () => bar.classList.add("over"));
  /** The session clock's number (and whether it shows at all). */
  function tick() {
    const clock = $(".rv-clock");
    clock.hidden = !timers.clock || (!session.answered && !panel.hidden);  // not on "All caught up"
    if (!clock.hidden) clock.lastElementChild.textContent = clockText(sessionWatch.ms());
  }
  const ticker = setInterval(() => { if (!document.hidden) tick(); }, 1000);
  // The app hidden (another window in front, the phone showing another app): every clock stops.
  const onVisible = () => {
    const away = document.hidden;
    for (const w of [cardWatch, sessionWatch]) away ? w.pause() : w.resume();
    el.classList.toggle("away", away);
    if (!away) tick();
  };
  document.addEventListener("visibilitychange", onVisible);

  // ----- drawing a card -----
  function front(v) {
    if (editing) closeEditor(true);
    const p = prompt(v), state = cards.get(uidOf(v));
    const kind = !state ? ["new", "New word"] : state.learning ? ["again", "Once more"] : ["", "Review"];
    face.classList.remove("more");
    face.onscroll = null;
    face.innerHTML = `<div class="rv-front">
      <span class="rv-kind ${kind[0]}">${kind[1]}</span>
      <div class="rv-meaning"${p.meaning.length > 34 ? ` style="font-size:clamp(22px, 5.8vw, 30px)"` : ""}>${esc(p.meaning)}</div>
      ${p.sentence.length ? `<div class="rv-sentence">${p.sentence.map(([text, hit]) => (hit ? `<b>${esc(text)}</b>` : esc(text))).join("")}</div>` : ""}
      <div class="rv-hint">Say the word to yourself, then turn the card</div>
    </div>`;
    actions.innerHTML = `<button type="button" class="rv-show"><span>Show the word <kbd>Space</kbd></span></button>`;
    actions.querySelector(".rv-show").onclick = flip;
  }

  // Every card can be heard: its own recording, or the voice chosen for cards without one (cardvoice.js).
  const hasWordAudio = (v) => canSay(v, "word");
  const hasSentenceAudio = (v) => canSay(v, "sentence");
  // How long each stretch plays, with the air the Vocab page's player leaves round it (a voice
  // spoken live: about as long as its text takes to say).
  const timesOf = (v) => (hasOwnAudio(v) ? v : voiceTimes(v));
  const wordSeconds = (v) => {
    const t = timesOf(v);
    return t ? (t.end ?? t.start + 1) - t.start + 0.6 : speakingSeconds(voiceText(v).word);
  };
  const sentenceSeconds = (v) => {
    const t = timesOf(v);
    return t && t.sent_start != null ? Math.max(0.5, (t.sent_end ?? t.sent_start + 3) - t.sent_start) + 0.6
      : speakingSeconds(voiceText(v).sentence);
  };
  // When audio started from this card will have finished: "Say it" must not record over it.
  let audioOverAt = 0;
  const track = (seconds, started) => {
    audioOverAt = Date.now() + seconds * 1000 + 400;  // until it has loaded and started
    return started.then((playing) => {
      audioOverAt = Date.now() + seconds * 1000;
      if (playing && playing.ended) playing.ended.then(() => { audioOverAt = Math.min(audioOverAt, Date.now()); });  // over now
      return playing;  // { ended }: "Say it" waits on it
    }, (e) => { audioOverAt = 0; throw e; });
  };
  // (A page that hands in no `say` plays only cards with a recording of their own.)
  const sayPart = say || ((v, part) => (part === "word" ? playSnippet(v, v.start, v.end ?? v.start + 1)
    : playSnippet(v, v.sent_start, v.sent_end ?? v.sent_start + 3)));
  const sayWord = (v, quiet) => track(wordSeconds(v), sayPart(v, "word"))
    .catch((e) => { if (!quiet) toast(e.message, { error: true }); });
  const saySentence = (v, quiet) => track(sentenceSeconds(v), sayPart(v, "sentence"))
    .catch((e) => { if (!quiet) toast(e.message, { error: true }); });

  // A notes box is as tall as what is written in it (up to a limit), so nothing hides in a
  // two-line window. (A hidden window measures nothing: the box then keeps its plain height.)
  function fit(box) {
    if (box.tagName !== "TEXTAREA" || !box.scrollHeight) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight + 2}px`;
  }
  /** Is there more of the back below the card's edge? (The card then fades out at the bottom.) */
  const more = () => face.classList.toggle("more", face.scrollHeight - face.clientHeight - face.scrollTop > 6);
  // A window resized, or a phone turned: the boxes wrap their text differently.
  const onResize = () => { if (!flipped) return; for (const box of face.querySelectorAll("textarea")) fit(box); more(); };
  window.addEventListener("resize", onResize);

  // ----- Personal notes: Paste, and the Mnemonic maker -----
  /** Put what is on the clipboard into Personal notes (after what is there already), saved like typing. */
  async function pasteInto(box, v) {
    let text;
    try { text = await readClipboard(); } catch {
      toast("The clipboard couldn't be read here. Press and hold in the box and choose Paste instead.", { error: true });
      return;
    }
    text = String(text || "").trim();
    if (!text) { toast("There is nothing copied to paste."); return; }
    box.value = box.value.trim() ? `${box.value.replace(/\s+$/, "")}\n${text}` : text;
    fit(box);
    more();
    edit(v, "memo", box.value);
    box.focus({ preventScroll: true });
  }

  // ----- the answer: the word and its meaning, the sentence and its translation -----
  // The owner: "include the English translation of the word and the sentence but smaller on the back
  // of the card as well". The meaning sits small under the word and the translation under the
  // sentence, in the learner's own language. A long sentence (or translation) shows the part round
  // its lit word, as everywhere (cardtext.js); where that part starts and ends is kept while the card
  // is on the table, so lighting up a word never makes the line jump.
  const ownLanguage = () => uiLanguage();
  // (Its direction is taken from the text itself: a meaning saved while the app spoke another
  // language reads the right way round too.)
  const ownDir = () => "auto";
  const studyOf = (v) => detectLanguage(unmarked(v.sentence) || v.text);
  const cuts = new Map();  // "sentence" / "translation" -> {plain, lo, hi, before, after}
  let vowelled = "";       // the sentence on the table with vowel marks, once they came (Arabic, "Show vowels")

  function drawWord(v) {
    const word = face.querySelector(".rv-word");
    if (!word || (editing && editing.field === "text")) return;
    word.textContent = v.text;
    word.classList.toggle("long", v.text.length > 14);
    addReadings(word, studyOf(v));  // Japanese and Chinese: furigana / pinyin over it (when switched on)
  }
  function drawMeaning(v) {
    const line = face.querySelector(".rv-ans-meaning");
    if (!line || (editing && editing.field === "meaning")) return;
    line.textContent = v.meaning || "";
    line.hidden = !String(v.meaning || "").trim();
  }
  /** The sentence or its translation, each word in a box of its own (`.rv-tok`, with where it is in the
   * text) so it can be held, and the lit parts in <b>: `s` / `e` on the first and last piece of a lit
   * stretch, which draw its rounded ends (one stretch may run over several words and the spaces between). */
  function drawLit(v, field) {
    const sentence = field === "sentence";
    const line = face.querySelector(editable(field).selector);
    if (!line || (editing && editing.field === field)) return;
    const { plain, marks } = litParts(v[field] || "", sentence ? v.text : null);
    line.hidden = !plain.trim();
    if (line.hidden) { line.innerHTML = ""; return; }
    let cut = cuts.get(field);
    if (!cut || cut.plain !== plain) {
      const focus = marks[0] || [0, 0];
      cut = { plain, ...trimSpan(plain, focus[0], focus[1], CARD_SENTENCE_MAX) };
      cuts.set(field, cut);
    }
    const lang = sentence ? studyOf(v) : ownLanguage();
    const words = wordRanges(plain, lang);
    const places = sentence && vowelled ? vowelPlaces(plain, vowelled) : null;
    const textOf = places ? (a, b) => vowelled.slice(places[a], places[b]) : (a, b) => plain.slice(a, b);
    const parts = litPieces(cut.lo, cut.hi, words, marks);
    const lit = (k) => k >= 0 && k < parts.length && parts[k].lit;
    const piece = (k) => {
      const p = parts[k], text = esc(textOf(p.from, p.to));
      if (!p.lit) return text;
      const ends = [lit(k - 1) ? "" : "s", lit(k + 1) ? "" : "e"].filter(Boolean).join(" ");
      return ends ? `<b class="${ends}">${text}</b>` : `<b>${text}</b>`;
    };
    let html = cut.before ? "…" : "";
    for (let k = 0; k < parts.length;) {
      const w = parts[k].word;
      if (w < 0) { html += piece(k++); continue; }
      let inner = "";
      while (k < parts.length && parts[k].word === w) inner += piece(k++);
      html += `<span class="rv-tok" data-a="${words[w][0]}" data-b="${words[w][1]}">${inner}</span>`;
    }
    line.innerHTML = html + (cut.after ? "…" : "");
    if (sentence) addReadings(line, lang);
  }
  /** Everything in the answer drawn again from the card (after it was put right). */
  function drawAnswer(v) {
    drawWord(v);
    drawMeaning(v);
    drawLit(v, "sentence");
    drawLit(v, "translation");
    // Arabic with "Show vowels" on: the word and its sentence vowelled, once the vowels are known.
    vowelCard(face, v, (shown) => { if (todo[0] !== v) return; vowelled = shown; drawLit(v, "sentence"); });
    more();
  }

  /** Save a change to the card the way the Meaning box does: at once, and so it syncs. */
  function saveCard(v, change) {
    for (const [field, value] of Object.entries(change)) edit(v, field, value);
    flushEdits();
    const box = face.querySelector(".rv-details .meaning");
    if (box && "meaning" in change && box.value !== v.meaning) { box.value = v.meaning; fit(box); }
  }

  // ----- tap a text on the back: it turns into its own text box -----
  // Enter or a tap elsewhere saves it, Esc puts it back as it was. While it is open the card's keys
  // and swipes are typing and nothing else; a tap beside the box only closes it. The owner's earlier
  // "tap a word … to copy it": a Copy button under the open box now (one tap more).
  let editing = null;  // the open text box: {v, field, line, box}

  function tapEdit(target) {
    const v = todo[0];
    const line = target instanceof Element ? target.closest(EDITABLE_SELECTOR) : null;
    if (!v || !line || !face.contains(line)) return;
    const field = fieldOf((selector) => line.matches(selector));
    if (field) openEditor(v, field, line);
  }

  function openEditor(v, field, line) {
    const rules = editable(field);
    if (!rules || line.hidden || editing || busy || !flipped || todo[0] !== v) return;
    const box = document.createElement("textarea");
    box.className = "rv-editbox";
    box.rows = 1;
    box.value = editValue(v, field);
    box.autocomplete = "off";
    box.setAttribute("enterkeyhint", "done");
    box.setAttribute("aria-label", t(EDIT_LABELS[field]));
    if (rules.study) setLang(box, studyOf(v));  // the word and its sentence: the language being learned
    else { box.lang = ownLanguage(); box.dir = ownDir(); }
    const copy = h(`<button type="button" class="rv-edit-copy">${ICON.copy}<span></span></button>`);
    copy.lastElementChild.textContent = t("Copy");
    copy.title = t("Copy");
    const wrap = document.createElement("div");
    wrap.className = "rv-editing";
    wrap.append(box, copy);
    line.classList.add("editing");
    line.replaceChildren(wrap);
    editing = { v, field, line, box };
    const grow = () => { box.style.height = "auto"; box.style.height = `${box.scrollHeight}px`; };
    box.addEventListener("input", () => { grow(); more(); });
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();  // Space, 1, 2, the arrows, W, S, P, N, Z, Del: typing here, not the card's keys
      if (e.isComposing || e.keyCode === 229) return;  // (still choosing characters: a Japanese or Chinese keyboard)
      if (e.key === "Enter") { e.preventDefault(); closeEditor(true); }
      else if (e.key === "Escape") { e.preventDefault(); closeEditor(false); }
    });
    let copying = false;
    box.addEventListener("blur", (e) => { if (!copying) closeEditor(true, e.relatedTarget); });
    // The Copy button keeps the box open: it never takes the focus from it (nor does the old way of
    // copying, where the clipboard can't be written directly: it selects a hidden box for a moment).
    copy.addEventListener("mousedown", (e) => e.preventDefault());
    copy.onclick = async () => {
      const text = box.value.replace(/\s+/g, " ").trim();
      if (!text) return;
      copying = true;
      const done = await copyText(text);
      copying = false;
      if (editing && editing.box === box) box.focus({ preventScroll: true });
      if (!done) { toast(t("That couldn't be copied here."), { error: true }); return; }
      buzz("tick");
      toast(t("Copied"), { timeout: 1500 });
    };
    grow();
    box.focus({ preventScroll: true });
    box.setSelectionRange(box.value.length, box.value.length);
    box.scrollIntoView({ block: "nearest" });
    more();
  }

  /** Put the open text box away: saved (`save`), or as it was. `next` = where the focus is going. */
  function closeEditor(save, next = null) {
    if (!editing) return;
    const { v, field, line, box } = editing;
    editing = null;
    line.classList.remove("editing");
    const change = save ? editPayload(v, field, box.value) : null;
    if (change) saveCard(v, change);
    if (todo[0] === v && face.contains(line)) drawAnswer(v);
    // Keys go back to the card, unless another box (Grammar notes, say) was tapped.
    if (!(next instanceof Element && next.closest("input, textarea, select, button, a"))) el.focus({ preventScroll: true });
  }

  // ----- hold a word of the sentence: it lights up as part of the word being learned, or goes out -----
  function holdWord(v, tok) {
    const line = tok.closest(".rv-ans-sentence, .rv-ans-trans");
    if (!line || editing || todo[0] !== v || !flipped) return;
    const field = line.classList.contains("rv-ans-sentence") ? "sentence" : "translation";
    const range = [Number(tok.dataset.a), Number(tok.dataset.b)];
    const change = holdPayload(v, field, range);
    buzz("tick");
    if (change) saveCard(v, change);
    drawLit(v, field);
    const again = line.querySelector(`.rv-tok[data-a="${range[0]}"]`);
    if (again) again.classList.add("rv-held");  // a short ring round the word that changed
  }

  /** Copy `text`, falling back to the old way where the clipboard can't be written directly. */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* try the old way */ }
    const spare = document.createElement("textarea");
    spare.value = text;
    spare.style.cssText = "position:fixed;opacity:0;left:-999px;top:0";
    el.append(spare);
    spare.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* not supported */ }
    spare.remove();
    return ok;
  }

  const mnemonics = new Map();  // what the Mnemonic maker came up with for each word, while the reviewer is open

  /** The Mnemonic maker below Personal notes: five sound-alikes in the learner's own language, each with a copy button. */
  function mnemonicMaker(box, v) {
    const go = box.querySelector(".rv-mnemo-go"), note = box.querySelector(".rv-mnemo-note"), list = box.querySelector(".rv-mnemo-list");
    const label = go.querySelector("span");
    const speaks = (UI_LANGUAGES[uiLanguage()] || UI_LANGUAGES.en).name;
    const say = (text, error = false) => { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("error", error); };
    const draw = (items) => {
      list.innerHTML = "";
      for (const text of items) {
        const row = h(`<li><span class="rv-mnemo-text" translate="no"></span><button type="button" class="rv-copy" title="Copy">${ICON.copy}<span>Copy</span></button></li>`);
        row.querySelector(".rv-mnemo-text").textContent = text;
        const copy = row.querySelector(".rv-copy");
        copy.onclick = async () => {
          if (!(await copyText(text))) { toast("That couldn't be copied here.", { error: true }); return; }
          buzz("tick");
          copy.classList.add("done");
          copy.innerHTML = `${ICON.check}<span>Copied</span>`;
          setTimeout(() => { if (copy.isConnected) { copy.classList.remove("done"); copy.innerHTML = `${ICON.copy}<span>Copy</span>`; } }, 1400);
        };
        list.append(row);
      }
      list.hidden = !items.length;
      label.textContent = items.length ? "Make 5 more" : "Mnemonic maker";
      say(items.length ? `${speaks} words that sound like it and hint at its meaning: copy one into Personal notes and picture it with the meaning.` : "");
    };
    const had = mnemonics.get(uidOf(v));
    if (had) draw(had);
    go.onclick = async () => {
      go.disabled = true;
      label.textContent = "Thinking…";
      say("");
      try {
        const studyName = (langInfo(detectLanguage(v.sentence || v.text)) || {}).name || "the language being learned";
        const items = await soundAlikes(v, { ask: askMnemonic, study: studyName, speaks, avoid: mnemonics.get(uidOf(v)) || [] });
        mnemonics.set(uidOf(v), items);
        if (go.isConnected) draw(items);
      } catch (e) {
        if (!go.isConnected) return;
        label.textContent = (mnemonics.get(uidOf(v)) || []).length ? "Make 5 more" : "Mnemonic maker";
        say(e && e.message === "NO_KEY" ? "The Mnemonic maker uses your AI key. Add one in Settings → Word definitions." : (e && e.message) || "That didn't work. Try again.", true);
        const fix = troubleshootButton(e);
        if (fix) note.append(" ", fix);
      } finally {
        go.disabled = false;
      }
    };
  }

  function back(v) {
    if (editing) closeEditor(true);
    const lang = langAttrs(studyOf(v));
    face.innerHTML = `<div class="rv-back">
      <div class="rv-answer">
        <div class="rv-word" ${lang}></div>
        <div class="rv-ans-meaning" translate="no" hidden></div>
        <div class="rv-ans-sentence" ${lang} hidden></div>
        <div class="rv-ans-trans" translate="no" hidden></div>
        <div class="rv-listen">${hasWordAudio(v) ? `<button type="button" class="play-word">${ICON.sound} Word</button>` : ""}${hasSentenceAudio(v) ? `<button type="button" class="play-sent">${ICON.sound} Sentence</button>` : ""}${hasWordAudio(v) || hasSentenceAudio(v) ? practiseButton() : ""}</div>
      </div>
      <div class="rv-details">
        <label class="rv-field"><span>Meaning</span><input type="text" class="meaning" placeholder="What it means"></label>
        <label class="rv-field"><span>Grammar notes</span><textarea class="notes" rows="1" placeholder="Root, grammar, usage…"></textarea></label>
        <div class="rv-field">
          <div class="rv-field-head"><span>Personal notes</span><button type="button" class="rv-paste" title="Paste what you copied into Personal notes">${ICON.paste} Paste</button></div>
          <textarea class="memo" rows="1" placeholder="A mnemonic, a picture, where you heard it…" aria-label="Personal notes"></textarea>
        </div>
        <div class="rv-mnemo">
          <button type="button" class="rv-mnemo-go">${ICON.bulb}<span>Mnemonic maker</span></button>
          <p class="rv-mnemo-note" hidden></p>
          <ul class="rv-mnemo-list" hidden></ul>
        </div>
        <div class="rv-source">
          <span>${v.episode_id ? `<a href="#/episode/${v.episode_id}?t=${v.start ?? 0}">${esc(v.episode_title || "Episode")}</a>` : esc(v.episode_title || "Added manually")}${v.episode_id && v.start != null ? ` · ${formatTime(v.start)}` : ""} · added ${fmtDate(v.created_at)}</span>
          <span class="saved" hidden>Saved</span>
          <button type="button" class="rv-trash" title="Delete this word (Del)" aria-label="Delete this word">${ICON.trash}</button>
        </div>
      </div>
    </div>`;
    face.querySelector(".rv-trash").onclick = () => askDelete(v);
    const memo = face.querySelector(".memo");
    face.querySelector(".rv-paste").onclick = () => pasteInto(memo, v);
    mnemonicMaker(face.querySelector(".rv-mnemo"), v);
    // The meaning and the translation are in the learner's own language (and never run through the
    // app's own translations: translate="no").
    for (const line of face.querySelectorAll(".rv-ans-meaning, .rv-ans-trans")) { line.lang = ownLanguage(); line.dir = ownDir(); }
    face.scrollTop = 0;
    face.onscroll = more;
    cuts.clear();
    vowelled = "";
    for (const field of ["meaning", "notes", "memo"]) {
      const box = face.querySelector(`.rv-details .${field}`);
      box.value = v[field] || "";
      // (the Meaning box and the small meaning under the word are the same text)
      box.oninput = () => { fit(box); edit(v, field, box.value); if (field === "meaning") drawMeaning(v); more(); };
      fit(box);
    }
    drawAnswer(v);
    const pw = face.querySelector(".play-word"), ps = face.querySelector(".play-sent");
    if (pw) pw.onclick = () => sayWord(v);
    if (ps) ps.onclick = () => saySentence(v);
    const say = face.querySelector(".say-it");  // listens to the learner, then plays the sentence and the attempt
    if (say) {
      // The native model is the whole sentence (the owner's choice); the word's own audio only when
      // the card has no sentence audio.
      const sentence = hasSentenceAudio(v);
      practise(say, {
        sayModel: () => (sentence ? saySentence(v, true) : sayWord(v, true)),
        modelSeconds: sentence ? sentenceSeconds(v) : wordSeconds(v),
        audioBusy: () => audioOverAt - Date.now(),
        onError: (m) => toast(m, { error: true }),
      });
    }

    const wait = nextWait(cards.get(uidOf(v)) || null, dayNumber());
    actions.innerHTML = `
      <button type="button" class="rv-no"><span>${ICON.no} Not remembered</span><small>comes back in a moment <kbd>1</kbd></small></button>
      <button type="button" class="rv-yes"><span>${ICON.yes} Remembered</span><small>see it ${wait === 1 ? "" : "in "}${waitText(wait)} <kbd>2</kbd></small></button>`;
    actions.querySelector(".rv-no").onclick = () => grade(AGAIN);
    actions.querySelector(".rv-yes").onclick = () => grade(GOOD);
  }

  /** The first time a back is shown on this device: a word on what can be done with it (the app's
   * page guides, components/tour.js: once per device, "Show the guides again" in Settings). */
  function editHint() {
    firstVisitTour("review", el, [{ target: ".rv-answer", title: "Put a card right as you go",
      text: "Tap any text to edit it. Hold a word in the sentence to highlight it." }]);
  }

  /** Put todo[0] on the table (its back, when an answer has just been taken back). */
  function show(showBack = false) {
    panel.hidden = true;
    $(".rv-wrap").hidden = false;
    actions.hidden = false;
    lean(0);
    flipped = showBack;
    (showBack ? back : front)(todo[0]);
    const state = cards.get(uidOf(todo[0]));
    cardKind = !state ? "new" : state.learning && state.day === dayNumber() ? "again" : "review";
    cardWatch.start();
    flippedAt = showBack ? Date.now() : 0;
    startBar();
    header();
    play(card, [{ transform: "translateY(20px) scale(.93)", opacity: 0 }, { transform: "none", opacity: 1 }],
         { duration: 280, easing: "cubic-bezier(.2, 1.35, .4, 1)" });
  }

  async function flip() {
    if (flipped || busy || !todo.length || $(".rv-wrap").hidden) return;
    busy = true;
    const v = todo[0];
    SOUND.flip();
    tilt(0, 0);
    await play(card, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg)" }], { duration: 140, easing: "ease-in" });
    back(v);
    flipped = true;
    flippedAt = Date.now();
    if (autoplay && hasWordAudio(v)) sayWord(v, true);
    await play(card, [{ transform: "rotateY(-90deg)" }, { transform: "rotateY(0deg)" }], { duration: 260, easing: "cubic-bezier(.2, 1.4, .4, 1)" });
    busy = false;
    editHint();
  }

  // ----- typing on the back: saved a moment after the last keystroke, and before the card leaves -----
  let pending = null;
  function edit(word, field, value) {
    if (pending && (pending.word !== word || pending.field !== field)) flushEdits();
    if (pending) clearTimeout(pending.timer);
    word[field] = value;
    pending = { word, field, value, timer: setTimeout(flushEdits, 500) };
  }
  function flushEdits() {
    if (!pending) return;
    const { word, field, value, timer } = pending;
    clearTimeout(timer);
    pending = null;
    api(`/vocab/${word.id}`, { method: "PATCH", body: { [field]: value } }).then(() => {
      word.updated_at = Date.now() / 1000;
      const mark = todo[0] === word && face.querySelector(".saved");
      if (mark) { mark.hidden = false; setTimeout(() => (mark.hidden = true), 1200); }
    }).catch((e) => toast(e.message, { error: true }));
  }

  // ----- answering -----
  const send = (uid, [t, rating, day, ms]) => api("/reviews", { method: "POST", body: { uid, t, rating, day, ms } })
    .then(() => window.dispatchEvent(new Event("tamkeen:reviewed")))  // the number on the app's icon
    .catch((e) => toast(`That answer wasn't saved: ${e.message}`, { error: true }));

  async function grade(rating, from = "") {
    if (!flipped || busy || !todo.length) return;
    if (editing) closeEditor(true);  // (an answer button pressed while a text box was open: the text is kept first)
    busy = true;
    flushEdits();
    const word = todo[0], uid = uidOf(word), t = Date.now();
    const before = cards.get(uid) || null;
    const day = before ? Math.max(dayNumber(), before.day) : dayNumber();
    cardWatch.stop();  // the time the card was looked at, without any time the app was hidden
    const entry = [t, rating, day, Math.min(60000, Math.round(cardWatch.ms()))];
    undo.push({ word, entry, before, todo: [...todo], session: { ...session }, firstTime: !tried.has(uid) });
    (log[uid] = log[uid] || []).push(entry);
    cards.set(uid, answer(before, rating, day));
    send(uid, entry);
    noteAnswer(log[uid], day);  // the time this word took today, for the estimate under the banner

    const remembered = rating === GOOD;
    session.answered++;
    if (!tried.has(uid)) {
      tried.add(uid);
      if (remembered) session.firstTry++;
      if (!before) session.started++;
    }
    if (remembered) {
      session.finished++;
      session.streak++;
      session.best = Math.max(session.best, session.streak);
      todo = todo.slice(1);
    } else {
      session.streak = 0;
      todo = requeue(todo.slice(1), word);
    }
    const cleared = remembered && !plan(allWords, cards, dayNumber(), 0).due.length;  // nothing left due anywhere
    const earned = reward({ type: "review", quiet: true, cleared });
    if (earned) session.xp += earned.xp;
    cheer(remembered, earned);
    header();
    if (remembered) { const bar = $(".rv-progress"); bar.classList.remove("bump"); void bar.offsetWidth; bar.classList.add("bump"); }

    const dir = remembered ? 1 : -1;
    const stamp = $(`.rv-stamp.${remembered ? "yes" : "no"}`);
    stamp.style.opacity = "1";
    lean(dir);
    await play(card, [{ transform: from || "none", opacity: 1 }, { transform: `translateX(${dir * 115}vw) rotate(${dir * 22}deg)`, opacity: 0.3 }],
               { duration: 300, easing: "cubic-bezier(.5, 0, .9, .5)" });
    card.style.transform = "";
    card.classList.remove("dragging");
    stamp.style.opacity = "";
    busy = false;
    if (todo.length) show(); else finish();
  }

  function takeBack() {
    if (busy || !undo.length) return;
    flushEdits();
    const last = undo.pop(), uid = uidOf(last.word);
    last.entry[1] = 0;                       // the log holds this same list: 0 means "taken back"
    send(uid, last.entry);
    forgetAnswer(last.entry[0]);
    if (last.before) cards.set(uid, last.before); else cards.delete(uid);
    todo = last.todo.filter((x) => !x.deleted);
    Object.assign(session, last.session);
    if (last.firstTime) tried.delete(uid);
    SOUND.undo();
    show(true);
  }

  // ----- deleting the word on the table -----
  // The same deletion as the Vocab page's Delete button: the word goes from the vocab on every
  // device. Asked first in a box of the reviewer's own, which says so, and says it plainly when
  // the word's card in the synced Anki deck would go too (see components/ankisync.js).
  let asking = null;  // closes the "delete this word?" box, while it is open

  /** The Anki sync's settings when this word has a card in the synced deck; else null. */
  async function ankiCardOf(v) {
    try {
      const st = await api("/anki/sync/status");
      return st.enabled && (await api(`/anki/linked/${v.uid || v.id}`)).linked ? st : null;
    } catch { return null; }  // no Anki sync on this device
  }

  async function askDelete(v) {
    if (asking || busy || !flipped || todo[0] !== v) return;
    flushEdits();
    const box = h(`<div class="rv-ask" role="alertdialog" aria-modal="true" aria-labelledby="rv-ask-title">
      <div class="rv-ask-box">
        <div class="rv-ask-icon">${ICON.trash}</div>
        <h3 id="rv-ask-title">Delete this word?</h3>
        <div class="rv-ask-word" ${langAttrs(detectLanguage(v.sentence || v.text))}></div>
        <p>It will be removed from your vocab on all your devices, along with its review progress.</p>
        <p class="rv-ask-anki" hidden></p>
        <div class="rv-ask-actions">
          <button type="button" class="rv-keep">Keep it</button>
          <button type="button" class="rv-delete" disabled>Delete</button>
        </div>
      </div>
    </div>`);
    box.querySelector(".rv-ask-word").textContent = v.text;
    const keep = box.querySelector(".rv-keep"), del = box.querySelector(".rv-delete");
    asking = () => { asking = null; box.remove(); el.focus({ preventScroll: true }); };
    keep.onclick = () => asking && asking();
    box.addEventListener("pointerdown", (e) => { if (e.target === box && asking) asking(); });  // a tap outside the box keeps the word
    el.append(box);
    keep.focus({ preventScroll: true });

    const anki = await ankiCardOf(v);  // "Delete" waits for this, so the box never undersells what goes
    if (!asking) return;
    if (anki) {
      const name = platform === "desktop" ? "Anki" : "AnkiDroid";
      const note = box.querySelector(".rv-ask-anki");
      note.hidden = false;
      note.innerHTML = `Its card in your ${esc(anki.deck || "synced")} deck in ${name} is removed at the next sync too, <strong>with that card's review history in ${name}. That cannot be undone.</strong>`
        + (anki.delete_ok ? "" : " From now on, deleting a word removes its card without asking about this again.");
    }
    del.disabled = false;
    del.onclick = async () => {
      del.disabled = keep.disabled = true;
      try {
        if (anki && !anki.delete_ok) await api("/anki/sync/options", { method: "POST", body: { delete_ok: true } });
        await api(`/vocab/${v.id}`, { method: "DELETE" });
      } catch (e) {
        toast(`The word wasn't deleted: ${e.message}`, { error: true });
        if (asking) asking();
        return;
      }
      if (asking) asking();
      removeWord(v);
    };
  }

  /** The word is gone: take its card off the table and out of what is left of the session. */
  async function removeWord(v) {
    busy = true;
    v.deleted = 1;  // `reviewable` leaves deleted words out of every count from here on
    cards.delete(uidOf(v));
    onDelete(v);
    for (let i = undo.length - 1; i >= 0; i--) if (undo[i].word === v) undo.splice(i, 1);
    todo = todo.filter((x) => x !== v);
    SOUND.no();
    await play(card, [{ transform: "none", opacity: 1 }, { transform: "translateY(36px) scale(.8)", opacity: 0 }], { duration: 260, easing: "ease-in" });
    busy = false;
    if (todo.length) show(); else finish();
  }

  // ----- the fun: colour, sparks, sounds -----
  function lean(amount) {  // -1 (not remembered) .. 1 (remembered): how far the card is being pushed
    el.style.setProperty("--tilt", String(Math.max(-1, Math.min(1, amount))));
    if (Math.abs(amount) > 0.05) el.dataset.lean = amount > 0 ? "yes" : "no"; else delete el.dataset.lean;
  }
  function burst(x, y, count, colours, reach = 120) {
    if (calm()) return;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("span");
      const angle = Math.random() * Math.PI * 2, dist = reach * (0.35 + Math.random() * 0.65);
      dot.className = `rv-dot${i % 3 === 0 ? " sq" : ""}`;
      dot.style.cssText = `left:${x}px;top:${y}px;background:${colours[i % colours.length]};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist - 30}px;--spin:${Math.round(Math.random() * 540 - 270)}deg;animation-delay:${Math.round(Math.random() * 70)}ms`;
      fx.append(dot);
      setTimeout(() => dot.remove(), 950);
    }
  }
  function shout(text) {
    const s = document.createElement("div");
    s.className = "rv-shout";
    s.textContent = text;
    fx.append(s);
    setTimeout(() => s.remove(), 1300);
  }
  function cheer(remembered, earned) {
    const r = card.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (!remembered) {
      SOUND.no();
      buzz("tick");
      el.classList.remove("miss"); void el.offsetWidth; el.classList.add("miss");
      setTimeout(() => el.classList.remove("miss"), 350);
    } else {
      SOUND.yes(session.streak - 1);
      buzz("tick");
      burst(x, y, 14 + Math.min(session.streak, 10) * 2, ["#f1cf7b", "#2ed597", "#7fe0ea", "#ffffff"]);
      const streak = $(".rv-streak");
      streak.classList.remove("pop"); void streak.offsetWidth; streak.classList.add("pop");
      if (session.streak >= 5 && session.streak % 5 === 0) {
        shout(`${session.streak} in a row!`);
        burst(x, y, 44, ["#f1cf7b", "#ffe9a8", "#ff8a3d", "#2ed597", "#d59bff"], 230);
        SOUND.cheer();
      }
    }
    if (earned && earned.cleared) shout(earned.glow ? `Today's cards cleared! +${earned.glow.toLocaleString()} glow` : "Today's cards cleared!");
    if (earned && earned.both) setTimeout(() => shout(`Battle and cards both done today: +${earned.both.xp} XP, +${earned.both.coins} coins`), 1400);
    if (earned && earned.tier !== "common" && remembered) burst(x, y, earned.tier === "jackpot" ? 50 : 24, ["#ffd54a", "#ffe9a8", "#ffffff"], 200);
    if (earned && earned.xp && !calm()) {
      const bar = $(".rv-progress").getBoundingClientRect();
      const label = document.createElement("span");
      label.className = "rv-xp";
      label.textContent = `${earned.tier === "jackpot" ? "Jackpot card! " : earned.tier === "lucky" ? "Lucky card! " : ""}+${earned.xp} XP`;
      if (earned.tier !== "common") label.classList.add("big");
      label.style.left = `${bar.left + bar.width * (session.finished / Math.max(1, session.finished + todo.length))}px`;
      label.style.top = `${bar.bottom + 30}px`;
      fx.append(label);
      setTimeout(() => label.remove(), 1050);
    }
  }

  // ----- the end of a session -----
  function finish() {
    const today = dayNumber();
    const p = plan(words, cards, today, perDay + bonus);
    const ahead = forecast(words, cards, today, 7);
    const top = Math.max(1, ...ahead);
    const mem = strength(words, cards, today);
    const studied = session.answered > 0;
    const share = studied ? session.firstTry / Math.max(1, tried.size) : mem.memory;
    sessionWatch.stop();
    cardWatch.stop();
    tick();
    const minutes = Math.max(1, Math.round(sessionWatch.ms() / 60000));
    const dayName = (n) => (n === 1 ? "Tmrw" : new Date(Date.now() + n * 86400000).toLocaleDateString(undefined, { weekday: "short" }));
    const more = Math.min(MORE_NEW, p.waiting);
    $(".rv-wrap").hidden = true;
    actions.hidden = true;
    lean(0);
    header();
    panel.hidden = false;
    panel.innerHTML = `
      <div class="rv-ring" style="--p:0"><div><b>${share == null ? "✓" : "0%"}</b><span>${studied ? "remembered first time" : share == null ? "nothing waiting" : "chance of recalling a learned word"}</span></div></div>
      <h2>${studied ? "Session complete" : "All caught up"}</h2>
      <p>${studied
        ? `${session.answered} card${session.answered === 1 ? "" : "s"} in about ${minutes} minute${minutes === 1 ? "" : "s"}${scope ? ` · ${esc(scope)}` : ""}.`
        : p.waiting ? "Nothing is due, and today's new words are done." : mem.learned ? "Nothing is due right now. Your words are resting." : "Save some words with a meaning and they will turn up here."}</p>
      <div class="rv-stats">
        <div><b>${studied ? tried.size : mem.learned}</b><span>${studied ? "words reviewed" : "words learned"}</span></div>
        <div><b>${studied ? session.started : mem.strong}</b><span>${studied ? "new words started" : "known for 3 weeks +"}</span></div>
        <div><b>${studied ? session.best : p.waiting}</b><span>${studied ? "best run" : "new words waiting"}</span></div>
        <div><b>${studied ? `+${session.xp}` : (cards.size)}</b><span>${studied ? "XP" : "words in review"}</span></div>
      </div>
      <div class="rv-coming">Coming back to you</div>
      <div class="rv-forecast">${ahead.map((n, i) => `<div class="${n ? "" : "none"}"><b>${n || ""}</b><i style="height:${Math.round((n / top) * 100)}%;animation-delay:${i * 60}ms"></i><span>${dayName(i + 1)}</span></div>`).join("")}</div>
      <div class="rv-panel-actions">
        ${more ? `<button type="button" class="rv-more">Learn ${more} more new word${more === 1 ? "" : "s"}</button>` : ""}
        <button type="button" class="rv-done">Done</button>
      </div>`;
    panel.querySelector(".rv-done").onclick = () => close();
    const moreBtn = panel.querySelector(".rv-more");
    if (moreBtn) moreBtn.onclick = () => { bonus += more; begin(); };
    if (share != null) {  // the ring fills and its number counts up
      const ring = panel.querySelector(".rv-ring"), number = ring.querySelector("b"), target = Math.round(share * 100);
      const steps = calm() ? 1 : 28;
      let i = 0;
      const timer = setInterval(() => {
        i++;
        const eased = 1 - (1 - i / steps) ** 3;
        ring.style.setProperty("--p", String(share * eased));
        number.textContent = `${Math.round(target * eased)}%`;
        if (i >= steps) clearInterval(timer);
      }, 26);
    }
    if (studied) {
      SOUND.cheer();
      buzz("tick");
      const r = el.getBoundingClientRect();
      burst(r.width / 2, r.height * 0.3, 60, ["#f1cf7b", "#ffe9a8", "#2ed597", "#7fe0ea", "#d59bff", "#ffffff"], 300);
    }
  }

  // ----- dragging the card: right = remembered, left = not remembered -----
  let drag = null;
  const tilt = (rx, ry) => { card.style.setProperty("--rx", `${rx}deg`); card.style.setProperty("--ry", `${ry}deg`); };
  const interactive = (target) => target.closest("input, textarea, button, a, select");
  // A press on a word of the back's sentence (or translation) that stays put for HOLD_MS holds it.
  const unhold = (d) => {
    clearTimeout(d.hold);
    if (d.tok) d.tok.classList.remove("pressing");
  };
  card.addEventListener("pointerdown", (e) => {
    if (busy || e.button > 0 || interactive(e.target)) return;
    if (editing) return;  // a text box is open: a tap beside it only puts it away (it saves as it loses the focus)
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, moved: false, at: performance.now(), target: e.target };
    const tok = flipped && e.target.closest ? e.target.closest(".rv-ans-sentence .rv-tok, .rv-ans-trans .rv-tok") : null;
    if (tok) {
      const d = drag;
      d.tok = tok;
      tok.classList.add("pressing");
      d.hold = setTimeout(() => {
        if (drag !== d || d.moved) return;
        d.held = d.moved = d.dead = true;  // the rest of this press neither edits nor swipes
        tok.classList.remove("pressing");
        holdWord(todo[0], tok);
      }, HOLD_MS);
    }
  });
  // A long press would open the phone's own menu (or a computer's right-click menu) over the sentence.
  card.addEventListener("contextmenu", (e) => {
    if (flipped && e.target.closest && e.target.closest(".rv-ans-sentence, .rv-ans-trans")) e.preventDefault();
  });
  card.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) {
      // A mouse resting on the front tips the card a little towards it.
      if (!drag && !flipped && !busy && e.pointerType === "mouse" && !calm()) {
        const r = card.getBoundingClientRect();
        tilt(((e.clientY - r.top) / r.height - 0.5) * -6, ((e.clientX - r.left) / r.width - 0.5) * 8);
      }
      return;
    }
    if (drag.held) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      unhold(drag);  // moved: not a hold
      if (!flipped || Math.abs(dy) > Math.abs(dx)) { drag.moved = true; drag.dead = true; return; }  // not a sideways push
      drag.moved = true;
      card.classList.add("dragging");
      try { card.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    }
    if (drag.dead) return;
    drag.dx = dx;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    const pull = dx / Math.min(130, card.offsetWidth * 0.28);
    lean(pull);
    $(".rv-stamp.yes").style.opacity = String(Math.max(0, Math.min(1, pull)));
    $(".rv-stamp.no").style.opacity = String(Math.max(0, Math.min(1, -pull)));
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    unhold(d);
    if (d.held) return;
    if (!d.moved) {
      if (e.type !== "pointerup") return;
      if (!flipped) flip();
      else tapped = { target: d.target, at: performance.now() };  // the answer side: its click opens the text for typing
      return;
    }
    if (d.dead) return;
    const limit = Math.min(130, card.offsetWidth * 0.28);
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.at);
    const decided = e.type === "pointerup" && (Math.abs(d.dx) >= limit || (Math.abs(d.dx) > 45 && speed > 0.7));
    $(".rv-stamp.yes").style.opacity = "";
    $(".rv-stamp.no").style.opacity = "";
    if (decided) { grade(d.dx > 0 ? GOOD : AGAIN, card.style.transform); return; }
    card.classList.remove("dragging");
    card.classList.add("settle");
    card.style.transform = "";
    lean(0);
    setTimeout(() => card.classList.remove("settle"), 340);
  };
  card.addEventListener("pointerup", drop);
  card.addEventListener("pointercancel", drop);
  // A tap on the back opens its text on the click that follows it, not on the finger's lifting: a
  // phone moves the focus only then, and would take it straight back from a box opened before.
  let tapped = null;
  card.addEventListener("click", () => {
    const tap = tapped;
    tapped = null;
    if (tap && flipped && !editing && performance.now() - tap.at < 1000) tapEdit(tap.target);
  });
  card.addEventListener("pointerleave", () => { if (!drag) tilt(0, 0); });

  // ----- settings -----
  const settings = $(".rv-settings");
  const drawSettings = () => {
    for (const b of settings.querySelectorAll("[data-n]")) b.classList.toggle("on", Number(b.dataset.n) === perDay);
    $(".rv-auto").checked = autoplay;
    $(".rv-bar-on").checked = timers.bar;
    $(".rv-clock-on").checked = timers.clock;
    $(".rv-goal").hidden = !timers.bar;
    for (const b of settings.querySelectorAll("[data-goal]")) b.classList.toggle("on", b.dataset.goal === String(timers.goal));
    $(".rv-goal-auto").textContent = `Auto follows your own pace: about ${cardGoal(pace, "review")} s for a review, ${cardGoal(pace, "new")} s for a new word.`;
  };
  $(".rv-gear").onclick = () => { settings.hidden = !settings.hidden; drawSettings(); };
  for (const b of settings.querySelectorAll("[data-n]")) {
    b.onclick = () => { perDay = Number(b.dataset.n); setNewPerDay(perDay); bonus = 0; drawSettings(); replan(); };
  }
  $(".rv-auto").onchange = (e) => { autoplay = e.target.checked; setPref("reviewAutoplay", autoplay); };
  // The timers' settings take effect on the card on the table at once.
  const changeTimer = (name, value) => { setTimer(name, value); timers = timerSettings(); drawSettings(); startBar(); tick(); };
  $(".rv-bar-on").onchange = (e) => changeTimer("bar", e.target.checked);
  $(".rv-clock-on").onchange = (e) => changeTimer("clock", e.target.checked);
  for (const b of settings.querySelectorAll("[data-goal]")) {
    b.onclick = () => changeTimer("goal", b.dataset.goal === "auto" ? "auto" : Number(b.dataset.goal));
  }
  el.addEventListener("pointerdown", (e) => { if (!settings.hidden && !e.target.closest(".rv-settings, .rv-gear")) settings.hidden = true; });

  // ----- keys -----
  const onKey = (e) => {
    if (document.querySelector(".tour")) return;  // the first-time hint is showing: its buttons take the keys
    if (asking) {  // the "delete this word?" box is open: Esc keeps the word; its buttons take every other key
      if (e.key === "Escape") { e.preventDefault(); asking(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) {  // typing: only Esc means anything, and it leaves the box
      if (e.key === "Escape") { e.preventDefault(); e.target.blur(); }
      return;
    }
    const key = (e.key || "").length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "Escape") { e.preventDefault(); if (!settings.hidden) settings.hidden = true; else close(); return; }
    if (!panel.hidden) { if (key === "Enter") { e.preventDefault(); close(); } return; }
    const v = todo[0];
    if (!v) return;
    const settled = flipped && Date.now() - flippedAt > KEY_GUARD_MS;
    if (key === " " || key === "Enter") {
      if (e.target.closest && e.target.closest("button, a") && key === "Enter") return;  // Enter on a focused button presses that button
      e.preventDefault();
      if (!flipped) flip(); else if (settled && !e.repeat) grade(GOOD);
    } else if (key === "1" || key === "ArrowLeft") { e.preventDefault(); if (settled) grade(AGAIN); }
    else if (key === "2" || key === "ArrowRight") { e.preventDefault(); if (settled) grade(GOOD); else if (!flipped) flip(); }
    else if (key === "z") takeBack();
    else if (flipped && key === "w" && hasWordAudio(v)) sayWord(v);
    else if (flipped && key === "s" && hasSentenceAudio(v)) saySentence(v);
    else if (flipped && key === "p") { const say = face.querySelector(".say-it"); if (say) say.click(); }
    else if (settled && key === "Delete") { e.preventDefault(); askDelete(v); }
    else if (flipped && key === "n") { e.preventDefault(); const memo = face.querySelector(".memo"); if (memo) memo.focus(); }
  };
  document.addEventListener("keydown", onKey);

  // ----- opening and closing -----
  // The phone's back button (and the browser's) closes the reviewer instead of leaving the page.
  let inHistory = false;
  try { history.pushState({ tamkeenReview: true }, ""); inHistory = true; } catch { /* no history here */ }
  const onPop = () => close(true);
  window.addEventListener("popstate", onPop);
  window.addEventListener("hashchange", onPop);
  const stopStudy = trackStudy("read", () => panel.hidden);  // time spent on cards counts as study time

  let closed = false;
  function close(byHistory = false) {
    if (closed) return;
    if (editing) closeEditor(true);  // (the phone's back button with a text box open: what was typed is kept)
    closed = true;
    flushEdits();
    stopStudy();
    clearInterval(ticker);
    document.removeEventListener("visibilitychange", onVisible);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("hashchange", onPop);
    window.removeEventListener("resize", onResize);
    document.body.classList.remove("rv-open");
    el.remove();
    if (inHistory && !byHistory) history.back();
    onClose();
    window.dispatchEvent(new Event("tamkeen:review-closed")); // the session's answers go to the other devices now (app.js)
  }
  $(".rv-x").onclick = () => close();
  $(".rv-undo").onclick = takeBack;

  document.body.append(el);
  document.body.classList.add("rv-open");
  el.tabIndex = -1;
  el.focus({ preventScroll: true });  // so keys go to the reviewer, not to the button that opened it
  begin();
}
