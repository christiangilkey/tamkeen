// How much a tapped word shows: "quick" (just its meaning) or "detailed" (the full popup).
// One choice for the whole app, remembered on this device, with a two-button switch that every
// reading and playing screen shows: a lightning bolt for quick, a target with an arrow for
// detailed. Shared by the desktop app and the Android app.

import { icon } from "../icons.js";

const KEY = "lookupMode";
/** Fired on `window` when the choice changes (detail = the new mode), so every switch on screen
 *  and an open popup follow at once. */
export const LOOKUP_EVENT = "tamkeen:lookupmode";

/** "quick" or "detailed". Detailed is how the popup has always worked, so it is the default. */
export function lookupMode() {
  try { return localStorage.getItem(KEY) === "quick" ? "quick" : "detailed"; } catch { return "detailed"; }
}

export function setLookupMode(mode) {
  const next = mode === "quick" ? "quick" : "detailed";
  if (next === lookupMode()) return;
  try { localStorage.setItem(KEY, next); } catch { /* storage unavailable: the choice lasts until the app closes */ }
  window.dispatchEvent(new CustomEvent(LOOKUP_EVENT, { detail: next }));
}

const MODES = [
  { key: "quick", icon: "bolt", label: "Quick lookup", title: "Quick lookup: a tapped word shows just its meaning" },
  { key: "detailed", icon: "target", label: "Detailed lookup", title: "Detailed lookup: a tapped word shows the full explanation" },
];

/** The switch: two small buttons side by side, the chosen one filled in.
 *  `compact` (for a bar with no room to spare, the reel player's on a phone): only the chosen
 *  mode's button shows, and tapping it changes to the other mode. */
export function lookupToggle({ compact = false } = {}) {
  const box = document.createElement("div");
  box.className = `lookup-toggle${compact ? " compact" : ""}`;
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", "How much a tapped word shows");
  box.innerHTML = MODES.map((m) =>
    `<button type="button" role="radio" data-mode="${m.key}" title="${m.title}" aria-label="${m.label}">${icon(m.icon, 16)}</button>`).join("");
  const paint = () => {
    const mode = lookupMode();
    for (const b of box.children) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
      if (compact) {
        const m = MODES.find((x) => x.key === b.dataset.mode);
        const other = MODES.find((x) => x.key !== b.dataset.mode);
        b.title = `${m.title}. Tap to change to ${other.label.toLowerCase()}.`;
      }
    }
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    // Compact: the one button on show is the current mode, so a tap means "the other one".
    setLookupMode(compact ? (b.dataset.mode === "quick" ? "detailed" : "quick") : b.dataset.mode);
  });
  let placed = false;
  const follow = () => {
    // A switch whose screen has been left stops listening.
    if (placed && !box.isConnected) { window.removeEventListener(LOOKUP_EVENT, follow); return; }
    paint();
  };
  window.addEventListener(LOOKUP_EVENT, follow);
  queueMicrotask(() => { placed = true; });
  paint();
  return box;
}
