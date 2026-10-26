// The short messages at the bottom of the screen ("toasts"), for every shell's toast(). The same words
// are never on screen twice: a message that is already there is taken away and shown afresh, its time
// starting again (a button pressed four times gives one message, not four on top of each other), and
// only the newest MAX_TOASTS stay. Where they sit is the styles' business (app.css: bottom right on a
// computer; mobile.css: inside the screen on a phone). Problems the learner can fix never come here:
// they open the fix popup (components/fixit.js). tests/js/fixes.test.mjs checks this.

export const MAX_TOASTS = 3;

/** Take a message off the screen, with its timer. */
function drop(el, timers) {
  if (el.tkTimer) timers.clearTimeout(el.tkTimer);
  el.tkTimer = null;
  el.remove();
}

/**
 * Show `message` in `box` (the #toasts strip) for `ms` milliseconds. `build()` makes its element (the
 * words, an action button). Returns that element (a caller may add to it: the game puts an icon first).
 * `timers` (for tests) has setTimeout / clearTimeout.
 */
export function placeToast(box, message, { error = false, ms = 5000, build, timers = globalThis } = {}) {
  const text = String(message ?? "");
  for (const el of [...box.children]) {
    if (el.dataset && el.dataset.text === text && el.classList.contains("error") === !!error) drop(el, timers);
  }
  const el = build();
  el.dataset.text = text;
  box.append(el);
  while (box.children.length > MAX_TOASTS) drop(box.children[0], timers);
  el.tkTimer = timers.setTimeout(() => { el.tkTimer = null; el.remove(); }, ms);
  return el;
}
