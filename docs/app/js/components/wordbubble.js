// Definition bubble shown when a word is clicked/tapped. Platform-independent: the caller
// supplies the definition fetcher and the audio/vocab actions.

import { NO_MEANINGS, downloadMeanings } from "../meanings.js";
import { esc, buzz, toast } from "../app.js";
import { langAttrs, langInfo } from "../languages.js";
import { icon } from "../icons.js";
import { LOOKUP_EVENT, lookupMode } from "./lookupmode.js";
import { showTroubleshoot } from "./troubleshoot.js";
import { kindOf } from "../trouble.js";
import { pronounceWord } from "../lexicon/seen.js";

// ----- what happens after a tapped word has played: pause there, or keep playing -----
// One choice for the whole app, remembered on this device. Pausing is how it has always worked.
const PAUSE_KEY = "wordPause";
export function pauseAfterWord() {
  try { return localStorage.getItem(PAUSE_KEY) !== "0"; } catch { return true; }
}
function setPauseAfterWord(pause) {
  try { localStorage.setItem(PAUSE_KEY, pause ? "1" : "0"); } catch { /* storage unavailable */ }
}
const PAUSE_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.9.5z"/></svg>`;
/** The little switch at the popup's top left: no words, a pause sign or a play sign on its knob. */
function modeSwitch() {
  return `<button type="button" class="wb-mode" data-act="mode" role="switch" aria-label="Keep playing after a tapped word"><span class="wb-knob"></span></button>`;
}
/** Make a switch show the current choice. */
function paintSwitch(b) {
  if (!b) return;
  const pause = pauseAfterWord();
  b.classList.toggle("on", !pause);
  b.setAttribute("aria-checked", String(!pause));
  b.title = pause ? "After a tapped word plays, it pauses. Switch to keep playing." : "After a tapped word plays, it keeps playing. Switch to pause.";
  b.firstElementChild.innerHTML = pause ? PAUSE_ICON : PLAY_ICON;
}

/** The same switch for a player that keeps it among its own controls instead of in the popup
 *  (the reel player). `onChange(pause)` runs when it is flipped. */
export function pauseSwitch(onChange) {
  const box = document.createElement("div");
  box.innerHTML = modeSwitch();
  const b = box.firstElementChild;
  paintSwitch(b);
  b.addEventListener("click", () => {
    const pause = !pauseAfterWord();
    setPauseAfterWord(pause);
    paintSwitch(b);
    onChange(pause);
  });
  return b;
}

/**
 * @param {HTMLElement} host positioned (relative) container the bubble lives in
 * @param {{
 *   fetch: (ctx: object, refresh?: boolean, opts?: {quick?: boolean}) => Promise<object>,
 *   onPlayWord: () => void, onPlaySentence: () => void, onPlayFrom: () => void,
 *   onSave: (def: object|null) => Promise<void>, onSettings: () => void,
 *   noAudio?: boolean,   // true for imported web pages: hides the play buttons
 *   onCorrect?: (def: object) => Promise<{word: string, ctx: object}|null>,  // the lookup found the
 *                        // word misheard (def.correction): change the transcript; null if it can't
 *   onUndoCorrect?: (fix: {from: string, to: string}) => Promise<{word: string, ctx: object}>,
 *   onFindVideo?: (def: object|null) => Promise<void>,  // given: a "Find in a video" button beside
 *                        // Save, which saves the word if need be and looks for it in a video (filmot.js)
 *   onPauseMode?: (pause: boolean) => void,  // given: the popup shows the pause / keep-playing
 *                        // switch and calls this when it is flipped (see pauseAfterWord)
 * }} actions
 */
export function createWordBubble(host, actions) {
  const el = document.createElement("div");
  el.className = "word-bubble";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  host.append(el);

  let anchor = null;
  let ctx = null;
  let def = null;
  let ipa = ""; // English: US pronunciation from the downloaded word table (lexicon/seen.js); Thai: how it is said
  let token = 0;
  let saved = false;
  // Quick lookup (see lookupmode.js): this popup shows only the meaning, with "More" to open
  // the full explanation for this one word.
  let quick = false;
  // A misheard word put right (see fixword.js): {from: what the transcript said, to: the word
  // said, applied: the transcript was changed (so Undo is offered)}.
  let fix = null;
  // Docked (see show): part of its container's layout, below what is already in it, not floating.
  let docked = false;

  function position() {
    if (el.hidden || !anchor) return;
    const phone = window.matchMedia("(max-width: 640px)").matches;
    el.classList.toggle("docked", docked && !phone);
    if (phone) {
      el.classList.add("sheet");
      el.style.left = el.style.top = "";
      return;
    }
    el.classList.remove("sheet");
    if (docked) {
      el.style.left = el.style.top = el.style.visibility = "";
      return;
    }
    const hr = host.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    let left = ar.left + ar.width / 2 - hr.left - bw / 2;
    left = Math.max(8, Math.min(left, hr.width - bw - 8));
    const below = ar.bottom - hr.top + 8;
    const above = ar.top - hr.top - bh - 8;
    const top = below + bh <= hr.height - 8 || above < 8 ? below : above;
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(8, top)}px`;
    // Hide while the anchor word is scrolled out of view.
    el.style.visibility = ar.bottom < hr.top || ar.top > hr.bottom ? "hidden" : "";
  }

  function chips(d) {
    const items = [];
    if (d.pos) items.push(esc(d.pos));
    if (d.root && L().root === "Root") items.push(`root <span class="ar" ${attrs()}>${esc(d.root)}</span>`);
    if (d.dialect) items.push(esc(d.dialect));
    return items.map((c) => `<span class="wb-chip">${c}</span>`).join("");
  }

  let current = { state: "loading", message: "" };
  let lastError = null; // what the failed lookup threw (the Troubleshoot box reads it)
  // The language of the word being shown (from the lookup; Arabic for older callers).
  const L = () => langInfo((ctx && ctx.lang) || "ar");
  const attrs = () => langAttrs((ctx && ctx.lang) || "ar");

  // A misheard word put right: one small purple pill, "what the transcript said → the word", with
  // an ✕ on its right that puts the transcript back. Tapping the pill says what happened.
  let fixInfo = false;
  function fixPill() {
    const undo = fix.applied && actions.onUndoCorrect;
    const why = fix.applied
      ? "The transcription most likely misheard this word, so the AI put the word that was said in its place in the transcript."
      : "The transcription most likely misheard this word. The AI shows the word that was said, but the transcript here can't be changed.";
    return `<div class="wb-fix">
        <span class="wb-pill">
          <button type="button" class="wb-pill-text" data-act="fixinfo" title="Why is this word different?" aria-expanded="${fixInfo}">
            <s class="ar" ${attrs()}>${esc(fix.from)}</s><span aria-hidden="true">→</span><span class="ar" ${attrs()}>${esc(fix.to)}</span></button>
          ${undo ? `<button type="button" class="wb-pill-x" data-act="undo" title="Undo: put back what the transcript said" aria-label="Undo the correction">${icon("close", 13)}</button>` : ""}
        </span>
      </div>
      ${fixInfo ? `<p class="wb-fix-why">${why}</p>` : ""}`;
  }

  function render(state, message = "") {
    current = { state, message };
    const word = fix ? fix.to : ctx.word;
    let body = "";
    if (state === "loading") {
      body = `<div class="wb-loading"><span class="spinner"></span> ${quick ? "Looking up…" : "Looking up in context…"}</div>`;
    } else if (state === "nokey") {
      body = `<p class="wb-muted">See what this word means in this sentence: add an AI provider key in Settings.</p>
              <button type="button" class="primary" data-act="settings">Set up definitions</button>`;
    } else if (state === "nomeanings") {
      body = `<p class="wb-muted">AI is off, so words are explained by the built-in ${esc(L().name || "")} dictionary. It isn't on this device yet: download it once and it works offline.</p>
              <div class="row"><button type="button" class="primary" data-act="getmeanings">Download the dictionary</button>
              <button type="button" class="ghost" data-act="settings">Settings</button></div>`;
    } else if (state === "error") {
      body = `<p class="wb-error">${esc(message)}</p>
              <div class="row"><button type="button" data-act="retry">Try again</button>
              ${kindOf(lastError) ? `<button type="button" data-act="trouble">Troubleshoot</button>` : ""}
              <button type="button" class="ghost" data-act="settings">Settings</button></div>`;
    } else if (quick) {
      body = `<div class="wb-meaning">${esc(def.meaning)}</div>`;
    } else {
      const d = def;
      // How the word is read (kana, pinyin, IPA) goes under the meaning; where the reading is the
      // word itself with its marks (Arabic vowels, Russian stress) it replaces the headword instead.
      const reading = L().reading === "below" ? d.vocalized : "";
      body = `
        <div class="wb-meaning">${esc(d.meaning)}</div>
        ${d.explanation ? `<p class="wb-expl">${esc(d.explanation)}</p>` : ""}
        <div class="wb-chips">${chips(d)}</div>
        ${reading ? `<div class="wb-reading" ${attrs()}>${esc(reading)}</div>` : ""}
        ${d.lemma && d.lemma !== d.vocalized && d.lemma !== word ? `<div class="wb-row"><span class="wb-label">Dictionary form</span> <span class="ar" ${attrs()}>${esc(d.lemma)}</span></div>` : ""}
        ${d.root && L().root !== "Root" ? `<div class="wb-row"><span class="wb-label">${esc(L().root || "Root")}</span> <span class="ar" ${attrs()}>${esc(d.root)}</span></div>` : ""}
        ${d.morphology ? `<div class="wb-row"><span class="wb-label">Form</span> ${esc(d.morphology)}</div>` : ""}
        ${d.other_meanings.length ? `<div class="wb-row"><span class="wb-label">Also</span> ${d.other_meanings.map(esc).join("; ")}</div>` : ""}
        ${d.msa_equivalent ? `<div class="wb-row"><span class="wb-label">${esc(L().standard)}</span> <span class="ar" ${attrs()}>${esc(d.msa_equivalent)}</span></div>` : ""}
        ${d.dialect_note ? `<div class="wb-row"><span class="wb-label">${esc(L().note)}</span> ${esc(d.dialect_note)}</div>` : ""}
        ${d.sentence_translation ? `<details class="wb-trans"><summary>Sentence translation</summary>${esc(d.sentence_translation)}</details>` : ""}`;
    }
    const shown = def && state === "ready" && def.vocalized && L().reading === "replace" ? def.vocalized : word;
    el.classList.toggle("quick", quick);
    el.innerHTML = `
      <div class="wb-head">
        ${actions.onPauseMode && !actions.noAudio ? modeSwitch() : ""}
        <div class="wb-word ar" ${attrs()}>${esc(shown)}</div>
        ${ipa ? `<span class="wb-ipa" translate="no" title="${ctx.lang === "th" ? "How it is said (Paiboon romanization, from Wiktionary)" : "US pronunciation (CMU Pronouncing Dictionary)"}">${esc(ipa)}</span>` : ""}
        <button type="button" class="ghost icon wb-close" data-act="close" title="Close (Esc)" aria-label="Close">${icon("close", 18)}</button>
      </div>
      ${fix ? fixPill() : ""}
      <div class="wb-body">${body}</div>
      <div class="wb-actions">
        ${quick ? `<button type="button" data-act="more" title="Show the full explanation of this word">${icon("target", 15)} More</button>` : ""}
        ${actions.noAudio || quick ? "" : `<button type="button" data-act="word" title="Play this word again">${icon("sound", 15)} Word</button>
        <button type="button" data-act="sentence" title="Play the whole sentence">${icon("sound", 15)} Sentence</button>
        <button type="button" data-act="from" title="Continue playing from here">${icon("play", 15)} Continue</button>`}
        <button type="button" class="${saved ? "" : "primary"}" data-act="save" ${saved ? "disabled" : ""}>${saved ? "✓ Saved" : "★ Save"}</button>
        ${actions.onFindVideo && !quick ? `<button type="button" data-act="findvideo" title="Save this word and find a YouTube video where it is said">${icon("video", 15)} Find in a video</button>` : ""}
        ${state === "ready" && !quick ? `<button type="button" class="ghost icon" data-act="refresh" title="Ask again">↻</button>` : ""}
      </div>`;
    paintSwitch(el.querySelector(".wb-mode"));
    requestAnimationFrame(position);
  }

  async function load(refresh = false) {
    const my = ++token;
    render("loading");
    try {
      const d = await actions.fetch(ctx, refresh, { quick });
      if (my !== token) return;
      def = d;
      if (d && d.correction && !ctx.noCorrect) {
        // Misheard: show the word that was said, and change the transcript to it.
        fix = { from: ctx.word, to: d.correction, applied: false };
        if (actions.onCorrect) {
          try {
            const done = await actions.onCorrect(d);
            if (my !== token) return;
            if (done) { fix = { from: fix.from, to: done.word, applied: true }; ctx = { ...done.ctx }; }
          } catch { /* the transcript stays as it was; the popup still shows the word that was said */ }
        }
      } else if (d && d.corrected_from && !fix) {
        fix = { from: d.corrected_from, to: ctx.word, applied: true }; // corrected earlier
      }
      render("ready");
    } catch (e) {
      if (my !== token) return;
      if (e && e.message === "NO_KEY") render("nokey");
      else if (e && e.message === NO_MEANINGS) render("nomeanings"); // No AI, and this language's dictionary isn't here
      else { lastError = e; render("error", e && e.message ? e.message : String(e)); }
    }
  }

  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    switch (b.dataset.act) {
      case "close": hide(); break;
      case "mode": {
        const pause = !pauseAfterWord();
        setPauseAfterWord(pause);
        paintSwitch(b); // just the switch: the rest of the popup stays where it is scrolled
        actions.onPauseMode(pause);
        break;
      }
      case "word": actions.onPlayWord(); break;
      case "sentence": actions.onPlaySentence(); break;
      case "from": actions.onPlayFrom(); hide(); break;
      case "settings": actions.onSettings(); break;
      case "retry": load(); break;
      case "getmeanings":
        b.disabled = true;
        b.textContent = "Downloading…";
        try { await downloadMeanings((ctx && ctx.lang) || "ar"); load(); }
        catch (err) { b.disabled = false; b.textContent = "Try again"; toast(err && err.message ? err.message : String(err), { error: true }); }
        break;
      case "trouble": showTroubleshoot(lastError); break;
      case "more": quick = false; def = null; load(); break;
      case "refresh": def = null; load(true); break;
      case "fixinfo": fixInfo = !fixInfo; render(current.state, current.message); break;
      case "undo": {
        // Put the transcript back as it was, and look the word up again as written.
        b.disabled = true;
        try {
          const back = await actions.onUndoCorrect(fix);
          ctx = { ...back.ctx, noCorrect: true };
          fix = null;
          def = null;
          load(true);
        } catch (err) {
          b.disabled = false;
          toast(err && err.message ? err.message : "Couldn't undo that.", { error: true });
        }
        break;
      }
      case "findvideo":
        // Saves the word first when it isn't saved yet, exactly as Save does.
        b.disabled = true;
        try {
          await actions.onFindVideo(def);
          saved = true;
          render(current.state, current.message);
        } catch {
          b.disabled = false;
        }
        break;
      case "save":
        // Works with or without a definition (no key, or the lookup failed).
        b.disabled = true;
        try {
          await actions.onSave(def);
          saved = true;
          render(current.state, current.message);
          buzz("success");
          el.classList.add("just-saved");
          setTimeout(() => el.classList.remove("just-saved"), 900);
        } catch {
          b.disabled = false;
        }
        break;
    }
  });
  // Don't let clicks inside the bubble reach the transcript (which would seek).
  el.addEventListener("pointerdown", (e) => e.stopPropagation());

  /** `opts.saved`: this word is already in the vocab list, so the Save button says so.
   *  `opts.host`: show it in this container from now on, instead of the one it was made in (a
   *  player with two transcripts shows it in the one the word was tapped in).
   *  `opts.docked`: it takes its place at the end of that container instead of floating by the
   *  word (on a computer; a phone always shows it as a sheet). */
  function show(anchorEl, context, opts = {}) {
    if (opts.host) host = opts.host;
    if (el.parentNode !== host) host.append(el);
    docked = !!opts.docked;
    anchor = anchorEl;
    ctx = context;
    def = null;
    fix = null;
    fixInfo = false;
    saved = !!opts.saved;
    quick = lookupMode() === "quick";
    el.hidden = false;
    ipa = "";
    const shownFor = context;
    pronounceWord(context.word, context.lang).then((p) => {
      if (p && ctx === shownFor && !el.hidden) { ipa = p; render(current.state, current.message); }
    }).catch(() => {});
    load();
  }

  // The quick / detailed switch was flipped while this popup is open: show the same word the new way.
  const onLookupMode = () => {
    if (!el.isConnected) { window.removeEventListener(LOOKUP_EVENT, onLookupMode); return; } // its screen was left
    if (el.hidden || !ctx) return;
    quick = lookupMode() === "quick";
    def = null;
    load();
  };
  window.addEventListener(LOOKUP_EVENT, onLookupMode);

  function hide() {
    token++;
    el.hidden = true;
    anchor = null;
  }

  return { show, hide, position, get open() { return !el.hidden; }, el };
}
