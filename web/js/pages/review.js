// The vocab reviewer: flashcards over the Vocab page, scheduled by FSRS (web/js/review/fsrs.js).
//
// A card's front is in the learner's own language: the word's meaning with the translated
// sentence under it. Its back has the answer on top, large and alone (the word, its sentence
// and its audio), and under a clear gap everything else about the word: meaning, notes and
// "My notes", the learner's own box for a mnemonic. There are two answers,
// "Remembered" and "Not remembered": buttons, a swipe of the card, or the keyboard. A missed
// word comes back a few cards later until it has been remembered once.
//
// It opens as a layer over the page, not as a page of its own, so closing it lands on the Vocab
// list exactly as it was. Every answer is sent to /reviews as it is given.

import { api, buzz, esc, fmtDate, h, platform, state as app, toast } from "../app.js";
import { detectLanguage, langAttrs } from "../languages.js";
import { formatTime } from "../wordlookup.js";
import { reward, trackStudy } from "../game/game.js";
import { AGAIN, GOOD, answer, dayNumber, nextWait } from "../review/fsrs.js";
import { NEW_CHOICES, NEW_PER_DAY, forecast, plan, prompt, queue, requeue, reviewable, states, strength, uidOf, waitText } from "../review/deck.js";

const MORE_NEW = 10;      // "Learn 10 more new words" at the end of a session
const KEY_GUARD_MS = 250; // a key held down while the card turns must not answer it too

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

/** Every answer ever given, by word: {uid: [[t, rating, day, ms], ...]}. */
export async function loadLog() {
  return (await api("/reviews")).reviews || {};
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
  if (s && s.game_sound === false) return;
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
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 11.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 10.8v5.2M14 10.8v5.2"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`,
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
 *   highlight    (sentence, word) => html, the Vocab page's way of marking the word
 *   onDelete     (word) => void, told when a word is deleted from its card
 *   onClose      called when the reviewer is put away
 */
export function openReview({ words, allWords = words, log, scope = "", playSnippet, highlight, onDelete = () => {}, onClose = () => {} }) {
  if (document.querySelector(".rv")) return;
  const cards = states(log);
  let perDay = newPerDay();
  let bonus = 0;                       // extra new words asked for at the end of a session
  let autoplay = pref("reviewAutoplay", true);

  const el = h(`<div class="rv" role="dialog" aria-modal="true" aria-label="Review your vocab">
    <div class="rv-bg"></div><div class="rv-glow"></div>
    <header class="rv-top">
      <button type="button" class="rv-x" title="Close (Esc)" aria-label="Close">${ICON.close}</button>
      <div class="rv-progress" role="progressbar" aria-label="Session progress"><i></i></div>
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
      <p class="rv-keys"><kbd>Space</kbd> turn the card, then remembered · <kbd>1</kbd> or <kbd>←</kbd> not remembered · <kbd>2</kbd> or <kbd>→</kbd> remembered · <kbd>Z</kbd> undo · <kbd>W</kbd> word · <kbd>S</kbd> sentence · <kbd>N</kbd> my notes · <kbd>Del</kbd> delete the word</p>
    </div>
    <main class="rv-stage">
      <div class="rv-wrap">
        <div class="rv-card">
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
  let shownAt = 0, flippedAt = 0;
  const session = { answered: 0, firstTry: 0, started: 0, finished: 0, streak: 0, best: 0, xp: 0 };
  const tried = new Set();  // words answered at least once this session
  const undo = [];
  const began = Date.now();

  function begin() {
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

  // ----- drawing a card -----
  function front(v) {
    const p = prompt(v), state = cards.get(uidOf(v));
    const kind = !state ? ["new", "New word"] : state.learning ? ["again", "Once more"] : ["", "Review"];
    face.classList.remove("more");
    face.onscroll = null;
    face.innerHTML = `<div class="rv-front">
      <span class="rv-kind ${kind[0]}">${kind[1]}</span>
      <div class="rv-meaning">${esc(p.meaning)}</div>
      ${p.sentence.length ? `<div class="rv-sentence">${p.sentence.map(([text, hit]) => (hit ? `<b>${esc(text)}</b>` : esc(text))).join("")}</div>` : ""}
      <div class="rv-hint">Say the word to yourself, then turn the card</div>
    </div>`;
    actions.innerHTML = `<button type="button" class="rv-show"><span>Show the word <kbd>Space</kbd></span></button>`;
    actions.querySelector(".rv-show").onclick = flip;
  }

  const hasWordAudio = (v) => (v.episode_id || v.clip) && v.start != null;
  const hasSentenceAudio = (v) => (v.episode_id || v.clip) && v.sent_start != null;
  const sayWord = (v, quiet) => playSnippet(v, v.start, v.end ?? v.start + 1).catch((e) => { if (!quiet) toast(e.message, { error: true }); });
  const saySentence = (v) => playSnippet(v, v.sent_start, v.sent_end).catch((e) => toast(e.message, { error: true }));

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

  function back(v) {
    const lang = langAttrs(detectLanguage(v.sentence || v.text));
    face.innerHTML = `<div class="rv-back">
      <div class="rv-answer">
        <div class="rv-word" ${lang}></div>
        ${v.sentence ? `<div class="rv-ans-sentence" ${lang}>${highlight(v.sentence, v.text)}</div>` : ""}
        <div class="rv-listen">${hasWordAudio(v) ? `<button type="button" class="play-word">${ICON.sound} Word</button>` : ""}${hasSentenceAudio(v) ? `<button type="button" class="play-sent">${ICON.sound} Sentence</button>` : ""}</div>
      </div>
      <div class="rv-details">
        <label class="rv-field"><span>Meaning</span><input type="text" class="meaning" placeholder="What it means"></label>
        <label class="rv-field"><span>Notes</span><textarea class="notes" rows="1" placeholder="Root, grammar, usage…"></textarea></label>
        <label class="rv-field"><span>My notes</span><textarea class="memo" rows="1" placeholder="A mnemonic, a picture, where you heard it…"></textarea></label>
        <div class="rv-source">
          <span>${v.episode_id ? `<a href="#/episode/${v.episode_id}?t=${v.start ?? 0}">${esc(v.episode_title || "Episode")}</a>` : esc(v.episode_title || "Added manually")}${v.start != null ? ` · ${formatTime(v.start)}` : ""} · added ${fmtDate(v.created_at)}</span>
          <span class="saved" hidden>Saved</span>
          <button type="button" class="rv-trash" title="Delete this word (Del)" aria-label="Delete this word">${ICON.trash}</button>
        </div>
      </div>
    </div>`;
    face.querySelector(".rv-trash").onclick = () => askDelete(v);
    face.scrollTop = 0;
    const word = face.querySelector(".rv-word");
    word.textContent = v.text;
    word.classList.toggle("long", v.text.length > 14);
    face.onscroll = more;
    for (const field of ["meaning", "notes", "memo"]) {
      const box = face.querySelector(`.${field}`);
      box.value = v[field] || "";
      box.oninput = () => { fit(box); more(); edit(v, field, box.value); };
      fit(box);
    }
    more();
    const pw = face.querySelector(".play-word"), ps = face.querySelector(".play-sent");
    if (pw) pw.onclick = () => sayWord(v);
    if (ps) ps.onclick = () => saySentence(v);

    const wait = nextWait(cards.get(uidOf(v)) || null, dayNumber());
    actions.innerHTML = `
      <button type="button" class="rv-no"><span>${ICON.no} Not remembered</span><small>comes back in a moment <kbd>1</kbd></small></button>
      <button type="button" class="rv-yes"><span>${ICON.yes} Remembered</span><small>see it ${wait === 1 ? "" : "in "}${waitText(wait)} <kbd>2</kbd></small></button>`;
    actions.querySelector(".rv-no").onclick = () => grade(AGAIN);
    actions.querySelector(".rv-yes").onclick = () => grade(GOOD);
  }

  /** Put todo[0] on the table (its back, when an answer has just been taken back). */
  function show(showBack = false) {
    panel.hidden = true;
    $(".rv-wrap").hidden = false;
    actions.hidden = false;
    lean(0);
    flipped = showBack;
    (showBack ? back : front)(todo[0]);
    shownAt = Date.now();
    flippedAt = showBack ? shownAt : 0;
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
    .catch((e) => toast(`That answer wasn't saved: ${e.message}`, { error: true }));

  async function grade(rating, from = "") {
    if (!flipped || busy || !todo.length) return;
    busy = true;
    flushEdits();
    const word = todo[0], uid = uidOf(word), t = Date.now();
    const before = cards.get(uid) || null;
    const day = before ? Math.max(dayNumber(), before.day) : dayNumber();
    const entry = [t, rating, day, Math.min(60000, t - shownAt)];
    undo.push({ word, entry, before, todo: [...todo], session: { ...session }, firstTime: !tried.has(uid) });
    (log[uid] = log[uid] || []).push(entry);
    cards.set(uid, answer(before, rating, day));
    send(uid, entry);

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
    const minutes = Math.max(1, Math.round((Date.now() - began) / 60000));
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
  card.addEventListener("pointerdown", (e) => {
    if (busy || e.button > 0 || interactive(e.target)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, moved: false, at: performance.now() };
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
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
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
    if (!d.moved) { if (!flipped && e.type === "pointerup") flip(); return; }
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
  card.addEventListener("pointerleave", () => { if (!drag) tilt(0, 0); });

  // ----- settings -----
  const settings = $(".rv-settings");
  const drawSettings = () => {
    for (const b of settings.querySelectorAll("[data-n]")) b.classList.toggle("on", Number(b.dataset.n) === perDay);
    $(".rv-auto").checked = autoplay;
  };
  $(".rv-gear").onclick = () => { settings.hidden = !settings.hidden; drawSettings(); };
  for (const b of settings.querySelectorAll("[data-n]")) {
    b.onclick = () => { perDay = Number(b.dataset.n); setPref("reviewNewPerDay", perDay); bonus = 0; drawSettings(); replan(); };
  }
  $(".rv-auto").onchange = (e) => { autoplay = e.target.checked; setPref("reviewAutoplay", autoplay); };
  el.addEventListener("pointerdown", (e) => { if (!settings.hidden && !e.target.closest(".rv-settings, .rv-gear")) settings.hidden = true; });

  // ----- keys -----
  const onKey = (e) => {
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
    closed = true;
    flushEdits();
    stopStudy();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", onPop);
    window.removeEventListener("hashchange", onPop);
    window.removeEventListener("resize", onResize);
    document.body.classList.remove("rv-open");
    el.remove();
    if (inHistory && !byHistory) history.back();
    onClose();
  }
  $(".rv-x").onclick = () => close();
  $(".rv-undo").onclick = takeBack;

  document.body.append(el);
  document.body.classList.add("rv-open");
  el.tabIndex = -1;
  el.focus({ preventScroll: true });  // so keys go to the reviewer, not to the button that opened it
  begin();
}
