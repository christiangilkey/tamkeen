// Definition bubble shown when a word is clicked/tapped. Platform-independent: the caller
// supplies the definition fetcher and the audio/vocab actions.

import { esc, buzz } from "../app.js";
import { langAttrs, langInfo } from "../languages.js";
import { icon } from "../icons.js";
import { LOOKUP_EVENT, lookupMode } from "./lookupmode.js";

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
  let token = 0;
  let saved = false;
  // Quick lookup (see lookupmode.js): this popup shows only the meaning, with "More" to open
  // the full explanation for this one word.
  let quick = false;

  function position() {
    if (el.hidden || !anchor) return;
    if (window.matchMedia("(max-width: 640px)").matches) {
      el.classList.add("sheet");
      el.style.left = el.style.top = "";
      return;
    }
    el.classList.remove("sheet");
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
  // The language of the word being shown (from the lookup; Arabic for older callers).
  const L = () => langInfo((ctx && ctx.lang) || "ar");
  const attrs = () => langAttrs((ctx && ctx.lang) || "ar");

  function render(state, message = "") {
    current = { state, message };
    const word = ctx.word;
    let body = "";
    if (state === "loading") {
      body = `<div class="wb-loading"><span class="spinner"></span> ${quick ? "Looking up…" : "Looking up in context…"}</div>`;
    } else if (state === "nokey") {
      body = `<p class="wb-muted">See what this word means in this sentence: add an AI provider key in Settings.</p>
              <button type="button" class="primary" data-act="settings">Set up definitions</button>`;
    } else if (state === "error") {
      body = `<p class="wb-error">${esc(message)}</p>
              <div class="row"><button type="button" data-act="retry">Try again</button>
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
        <button type="button" class="ghost icon wb-close" data-act="close" title="Close (Esc)">✕</button>
      </div>
      <div class="wb-body">${body}</div>
      <div class="wb-actions">
        ${quick ? `<button type="button" data-act="more" title="Show the full explanation of this word">${icon("target", 15)} More</button>` : ""}
        ${actions.noAudio || quick ? "" : `<button type="button" data-act="word" title="Play this word again">🔊 Word</button>
        <button type="button" data-act="sentence" title="Play the whole sentence">🔊 Sentence</button>
        <button type="button" data-act="from" title="Continue playing from here">▶ Continue</button>`}
        <button type="button" class="${saved ? "" : "primary"}" data-act="save" ${saved ? "disabled" : ""}>${saved ? "✓ Saved" : "★ Save"}</button>
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
      render("ready");
    } catch (e) {
      if (my !== token) return;
      if (e && e.message === "NO_KEY") render("nokey");
      else render("error", e && e.message ? e.message : String(e));
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
      case "more": quick = false; def = null; load(); break;
      case "refresh": def = null; load(true); break;
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

  /** `opts.saved`: this word is already in the vocab list, so the Save button says so. */
  function show(anchorEl, context, opts = {}) {
    anchor = anchorEl;
    ctx = context;
    def = null;
    saved = !!opts.saved;
    quick = lookupMode() === "quick";
    el.hidden = false;
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
