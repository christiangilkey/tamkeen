// "Review while you play" (prototype "review_play"). The owner, 2026-11-27: "The split view doesn't need to be the exact
// same as the current vocab review but it absolutely must have all the same functionality and allow the user to get
// just as much from playing a game as they would from using the normal vocab reviewer", and "Side by side on computer
// stacked on phone and four meanings only for spot checks".
//
// On the fishing pond and the farm page the vocab reviewer itself (pages/review.js openReview, docked) sits over the
// game on a phone and beside it on a computer: the same cards and scheduling, answers, Undo, editing, audio, notes and
// mnemonics, the Important mark, rolls, XP, glow, the day's goal and the reviewer's settings, because it is the same code.
// The game only reacts: a card turned gets it ready (a cast, a walk to the next plot), and each card answered plays one
// game moment (a catch, a watering, a harvest, a planting), the same for "Remembered" and "Not remembered", so an
// honest "Not remembered" never costs anything in the game. About one "Remembered" card in six gets a spot check a
// couple of cards later (game/spotcheck.js): the word and four meanings, about 3 seconds. Right is "Sharp!" and a
// luckier next catch or harvest; wrong, that card becomes "Not remembered" (nothing else). The memory calls meter, how
// often "Remembered" holds up, raises the odds of rare fish and golden crops. No speech checks (the owner's "4 no").
// The game's own questions stay as Quick play, for when nothing is due or by choice.

import { api, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { askName } from "../components/modal.js";
import { detectLanguage, setLang } from "../languages.js";
import { snippetPlayer } from "../snippetplayer.js";
import { cardSayer, stopDevice } from "../voiceplay.js";
import { loadLog, newPerDay, openReview } from "../pages/review.js";
import { plan, states } from "../review/deck.js";
import { dayNumber } from "../review/fsrs.js";
import { sortFolders } from "../review/vocabedit.js";
import { getGame, saveGame, sfx } from "./game.js";
import { CHECK_AFTER, CHECK_SECONDS, SHARP_LUCK, callShare, callsLuck, checkFor, dueCheck, noteCall, wantsCheck } from "./spotcheck.js";

/** How many cards the reviewer would ask now (due ones and the day's new ones), as it plans them. */
export async function cardsWaiting() {
  try {
    const [vocab, log] = await Promise.all([api("/vocab"), loadLog()]);
    const p = plan(vocab, states(log), dayNumber(), newPerDay());
    return p.due.length + p.fresh.length;
  } catch { return 0; }
}

/**
 * Dock the reviewer on a game page.
 *   wrap   the page (its .live-wrap): the reviewer goes in at its start, over the game on a phone, beside it on a computer
 *   foot   the part under the game's scene: the game's line (the meter, what it is doing, Quick play) goes there
 *   kind   "fish" or "farm": what a passed check makes luckier, in its words
 *   turn(word)          a card is turned; returns a few words for what the game does ("The line flies out…"), or ""
 *   act(answer, luck)   an answer (onAnswer's, below): one game moment at `luck` (the meter's, and a passed check's);
 *                       resolves to {text: what it did, lucky: whether `luck` was used}
 *   ended()             the reviewer has gone (Quick play, or Done at the end of the cards): the page plays as before
 * Resolves to {close, reviewing} or to null when there is nothing to review (the page is left as it was).
 */
export async function dockReview({ wrap, foot, kind, turn, act, ended }) {
  let vocab, log, fl;
  try { [vocab, log, fl] = await Promise.all([api("/vocab"), loadLog(), api("/vocab/folders").catch(() => [])]); } catch { return null; }
  const p = plan(vocab, states(log), dayNumber(), newPerDay());
  if ((!p.due.length && !p.fresh.length) || !wrap.isConnected || document.querySelector(".rv")) return null;
  const folders = sortFolders(Array.isArray(fl) ? fl : []);
  const player = snippetPlayer();
  const say = cardSayer(player.playSnippet);

  const dock = h(`<div class="rp-dock"></div>`);
  const bar = h(`<div class="rp-bar">
    <button type="button" class="rp-calls" title="Memory calls: how often your Remembered held up at spot checks"><span>Memory calls</span><b translate="no"></b></button>
    <span class="rp-doing" role="status"></span>
    <button type="button" class="rp-quick">Quick play</button>
  </div>`);
  // a spot check covers the cards, all of them, while it is open; the game beside them stays as it is (the owner,
  // 2026-11-28: "The spot checks should cover the card section, not the game section ... a clean cover")
  const box = h(`<div class="rp-check" role="group" aria-label="Spot check" hidden></div>`);
  wrap.classList.add("rp-on");
  wrap.prepend(dock);
  foot.append(bar);
  dock.append(box);

  let closed = false;
  let sharp = false;      // a check was passed: the next catch or harvest is luckier
  let answers = 0;        // cards answered since it docked
  const waiting = [];     // spot checks to come: {word, at (the answer after which it is asked)}
  let checking = null;    // the check on screen: {q, word, buttons, done, timer, shownAt}
  let moments = Promise.resolve(); // the game's moments, one after another

  function doing(text) { if (text && !closed) bar.querySelector(".rp-doing").textContent = text; }
  function paintCalls() {
    const share = callShare(getGame());
    bar.querySelector(".rp-calls b").textContent = share === null ? "–" : `${Math.round(share * 100)}%`;
  }
  bar.querySelector(".rp-calls").onclick = () => {
    const g = getGame();
    toast(callShare(g) === null ? t("Memory calls: how often your Remembered holds up at the spot checks. Keep it high for rarer finds.")
      : t("Memory calls: {0}% of your Remembered held up at the spot checks. Luck on every find: ×{1}.", Math.round(callShare(g) * 100), callsLuck(g)));
  };

  // ----- each answer: one game moment, the same whichever answer; now and then a spot check -----
  function answered(a) {
    answers++;
    if (!a.redo) {
      const luck = callsLuck(getGame()) * (sharp ? SHARP_LUCK : 1);
      moments = moments.then(() => (closed ? null : act(a, luck))).then((r) => {
        if (r && r.lucky) sharp = false;
        if (r && r.text) doing(r.text);
      }).catch(() => { /* a moment that went wrong never stops the cards */ });
      if (a.remembered && wantsCheck()) waiting.push({ word: a.word, at: answers + CHECK_AFTER });
    }
    if (!checking) { const c = dueCheck(waiting, answers); if (c) setTimeout(() => ask(c.word), 450); }
  }

  /** A spot check on `word`: its four meanings over the cards; the cards wait for it under it (openReview's `hold`). */
  function ask(word) {
    const q = closed || checking ? null : checkFor(word, vocab);
    if (!q) return;
    box.innerHTML = `<div class="rp-check-head"><b>Spot check</b><span class="rp-check-left" translate="no"></span></div>
      <div class="rp-check-bar"><i></i></div>
      <p class="rp-check-ask">You said you remembered this. Which meaning is it?</p>
      <div class="rp-check-word" translate="no"></div>
      <div class="rp-check-options"></div>
      <p class="rp-check-verdict" role="status" hidden></p>`;
    const shown = box.querySelector(".rp-check-word");
    shown.textContent = q.word;
    setLang(shown, detectLanguage(q.word));
    const buttons = q.options.map((text, i) => {
      const b = h(`<button type="button" class="rp-opt"><span class="rp-key" translate="no">${i + 1}</span><span class="rp-opt-text" dir="auto" translate="no"></span></button>`);
      b.lastElementChild.textContent = text;
      b.onclick = () => choose(i);
      box.querySelector(".rp-check-options").append(b);
      return b;
    });
    checking = { q, word, buttons, done: false, shownAt: performance.now(), timer: 0 };
    box.hidden = false;
    dock.classList.add("rp-held"); // (the cards wait, out of sight under it, while it is open)
    sfx("tick");
    const c = checking;
    c.timer = setInterval(() => {
      const left = CHECK_SECONDS - (performance.now() - c.shownAt) / 1000;
      box.querySelector(".rp-check-bar i").style.width = `${Math.max(0, left / CHECK_SECONDS) * 100}%`;
      box.querySelector(".rp-check-left").textContent = `${Math.max(0, Math.ceil(left))} s`;
      if (left <= 0) choose(null);
    }, 100);
  }
  /** The check answered (`i`), or not in time (null). */
  function choose(i) {
    const c = checking;
    if (!c || c.done) return;
    c.done = true;
    clearInterval(c.timer);
    const ok = i === c.q.answer;
    noteCall(getGame(), ok);
    saveGame();
    for (const b of c.buttons) b.disabled = true;
    c.buttons[c.q.answer].classList.add("right");
    if (i !== null && !ok) c.buttons[i].classList.add("wrong");
    if (ok) sharp = true;
    else if (handle) handle.regrade(c.word);
    const verdict = box.querySelector(".rp-check-verdict");
    verdict.hidden = false;
    verdict.className = `rp-check-verdict ${ok ? "ok" : "no"}`;
    verdict.textContent = ok ? (kind === "farm" ? t("Sharp! Your next harvest is luckier.") : t("Sharp! Your next catch is luckier."))
      : i === null ? t("Out of time: that card comes back for another look.") : t("Not quite: that card comes back for another look.");
    sfx(ok ? "common" : "surprise");
    paintCalls();
    setTimeout(() => {
      if (checking !== c) return;
      checking = null;
      dock.classList.remove("rp-held");
      if (closed) return;
      box.hidden = true;
      const next = dueCheck(waiting, answers);
      if (next) setTimeout(() => ask(next.word), 300);
    }, ok ? 900 : 1700);
  }
  const onKey = (e) => {
    if (!checking || checking.done || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); choose(Number(e.key) - 1); }
  };
  document.addEventListener("keydown", onKey, true);

  // ----- the reviewer, docked: the same one the Vocab page opens -----
  let handle = null;
  handle = openReview({
    dock, words: vocab, allWords: vocab, log, playSnippet: player.playSnippet, say,
    onDelete: (v) => { const i = vocab.indexOf(v); if (i >= 0) vocab.splice(i, 1); },
    folders: () => folders,
    setFolder: async (w, uid, on) => { // (as the Vocab page's Folders tool: vocab.js applyFolder)
      try {
        await api("/vocab/bulk-folders", { method: "POST", body: { ids: [w.id], add: on ? [uid] : [], remove: on ? [] : [uid] } });
        const set = new Set(w.folders || []);
        if (on) set.add(uid); else set.delete(uid);
        w.folders = [...set].sort();
        w.updated_at = Date.now() / 1000;
        return true;
      } catch (e) { toast(e.message, { error: true }); return false; }
    },
    newFolder: async () => { // (as the Vocab page's New folder)
      const name = await askName(t("New folder"), t("Name for the new folder"));
      if (!name) return null;
      try {
        const f = await api("/vocab/folders", { method: "POST", body: { name } });
        folders.push(f);
        folders.splice(0, folders.length, ...sortFolders(folders));
        return f;
      } catch (e) { toast(e.message, { error: true }); return null; }
    },
    onClose: () => end(),
    onTurn: (v) => { try { doing(turn(v)); } catch { /* the cards go on */ } },
    onAnswer: answered,
    hold: () => !!checking,
  });
  if (!handle) { end(true); return null; }
  bar.querySelector(".rp-quick").onclick = () => { sfx("tick"); handle.close(); };
  paintCalls();
  doing(kind === "farm" ? t("Turn a card: each answer tends a plot.") : t("Turn a card: each answer lands a fish."));

  function end(quiet = false) {
    if (closed) return;
    closed = true;
    if (checking) clearInterval(checking.timer);
    checking = null;
    document.removeEventListener("keydown", onKey, true);
    try { player.stop(); } catch { /* nothing playing */ }
    stopDevice();
    dock.remove();
    bar.remove();
    box.remove();
    wrap.classList.remove("rp-on");
    if (!quiet) ended();
  }
  return { close: () => { if (!closed) handle.close(); }, reviewing: () => !closed };
}
