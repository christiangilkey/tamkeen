// "Tap words" on or off (prototype tap_switch; the owner, 2026-11-23: "a button at the bottom of self uploaded files
// where it toggles on and off clickable text for the popup window and also the transcripts of audios").
//
// On (the default): every word can be tapped for its popup, as always. Off: the words are plain text. No tap, hold or
// drag opens the popup or the word menu, new words lose their purple, and text can be selected and copied the
// ordinary way (a computer's right click gives its own Copy menu). A transcript still follows the sound.
//
// One choice for the whole app, kept on this device, like quick or detailed lookup (lookupmode.js): the learner who
// wants plain text to copy from wants it in the next file too. The switch sits at the bottom of the screen: in the
// play controls (podcasts, audiobooks, My audio, My videos, YouTube), in a book's page bar, and in a slim bar under a
// page's text (My webpages, and the passage of a lesson in My files). Shared by every version.

import { feature } from "../prototype.js";
import { icon } from "../icons.js";

const KEY = "tapWords";
/** Fired on `window` when the choice changes (detail = true when words can be tapped). */
export const TAP_EVENT = "tamkeen:tapwords";
/** The class a text gets while its words are plain (app.css). */
export const PLAIN_CLASS = "plain-words";

/** Whether words can be tapped: true unless the switch has been turned off on this device (and is still on show:
 *  with the prototype off, words are always tappable, whatever was chosen while it was on). */
export function tapWordsOn() {
  if (!feature("tap_switch")) return true;
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setTapWords(on) {
  const next = !!on;
  if (next === tapWordsOn()) return;
  try {
    if (next) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "off");
  } catch { /* storage unavailable: the choice lasts until the app closes */ }
  window.dispatchEvent(new CustomEvent(TAP_EVENT, { detail: next }));
}

/** Whether `el` (a word, or anything in a text) is in a text whose words are plain just now. */
export const isPlain = (el) => !!(el && el.closest && el.closest(`.${PLAIN_CLASS}`));

// Gestures a plain text keeps to itself: they never reach the page's own word handlers (tap = popup, right click =
// word menu, double click = the player's sentence loop). Selecting, scrolling, swiping a book's page and the
// computer's own menu are left alone.
const BLOCKED = ["click", "dblclick", "contextmenu"];

/**
 * Keeps the texts in `roots` plain while the switch is off, and follows the switch as it changes.
 * `onPlain()` runs when they turn plain (close an open popup there). Returns a function that stops it.
 * Does nothing while the prototype is off.
 */
export function plainWhenOff(roots, { onPlain } = {}) {
  const els = roots.filter(Boolean);
  if (!feature("tap_switch") || !els.length) return () => {};
  const stop = (e) => {
    if (!e.currentTarget.classList.contains(PLAIN_CLASS)) return;
    e.stopImmediatePropagation(); // (the page's own listeners on this element, and everything above it)
  };
  for (const el of els) for (const type of BLOCKED) el.addEventListener(type, stop, true);
  const paint = () => {
    const plain = !tapWordsOn();
    for (const el of els) el.classList.toggle(PLAIN_CLASS, plain);
    if (plain && typeof onPlain === "function") onPlain();
  };
  window.addEventListener(TAP_EVENT, paint);
  paint();
  return () => {
    window.removeEventListener(TAP_EVENT, paint);
    for (const el of els) {
      for (const type of BLOCKED) el.removeEventListener(type, stop, true);
      el.classList.remove(PLAIN_CLASS);
    }
  };
}

const ON_TITLE = "Tap words is on: tap a word for its meaning. Tap here for plain text you can select and copy.";
const OFF_TITLE = "Tap words is off: the text is plain, to select and copy. Tap here to tap words again.";

/** The switch: one small round-ended button with a line icon, filled in while words can be tapped. Null while the
 *  prototype is off. */
export function tapSwitch() {
  if (!feature("tap_switch")) return null;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tap-switch";
  b.setAttribute("aria-label", "Tap words");
  const paint = () => {
    const on = tapWordsOn();
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.title = on ? ON_TITLE : OFF_TITLE;
    b.innerHTML = icon(on ? "tapword" : "tapwordoff", 18);
  };
  b.addEventListener("click", () => setTapWords(!tapWordsOn()));
  let placed = false;
  const follow = () => {
    // A switch whose screen has been left stops listening.
    if (placed && !b.isConnected) { window.removeEventListener(TAP_EVENT, follow); return; }
    paint();
  };
  window.addEventListener(TAP_EVENT, follow);
  queueMicrotask(() => { placed = true; });
  paint();
  return b;
}
