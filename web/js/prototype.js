// Prototype mode: new features wait here until the owner has tried them (the owner, 2026-11-18: "when I
// enter in new features I want them to go into a prototype version which activates through a secret means so that
// way I can test it myself before I then tell you to merge it to the live version for everybody").
//
// How it works:
//   - Every new feature gets a row in PROTOTYPES with `released: false`, and its code asks `feature("<id>")`
//     before it shows itself (or before it changes how something old behaves).
//   - The secret: five quick taps on the version in Settings (the About heading in the web app, which shows no
//     version) switch prototype mode on or off for that one device (prototypeTaps). Nothing shows it is there.
//   - With prototype mode on, every unreleased feature is on. Everyone else gets the app as it was.
//   - To release one ("merge it"): set `released: true` (or, once it has been out a while, take its row and its
//     `feature()` checks out). Same for every version: desktop, Android, iPhone and the web app share this file.
// No screen code here (the game's rules import it, and the tests run it without a browser).

export const PROTOTYPES = {
  dictation: { name: "Type what you hear", released: true, since: "2026-11-17" },
  open_weeks: { name: "Weekly battle rules without the element-only weeks", released: true, since: "2026-11-18" },
  move_variety: { name: "More kinds of battle moves: slams, sky dives, burrows, throws, waves, orbs, slashes, strikes from above", released: true, since: "2026-11-17" },
  guild_tavern: { name: "Guild tavern: guild-mates' creatures in a tavern on Home and the Guilds page", released: true, since: "2026-11-17" },
  battle_aim: { name: "Aim your own attacks in battles (mouse, a second finger, the right stick)", released: true, since: "2026-11-18" },
  battle_race: { name: "Answer race in battles: the rival answers too; out-answered attacks do half damage", released: true, since: "2026-11-18" },
  key_fallback: { name: "A refused AI key: Add words fills the cards in without it, and a popup offers No AI", released: true, since: "2026-11-18" },
  word_pool: { name: "One card per word: a word you have already says which folder it is in and can go in another; DLI decks and study words use the card you have", released: true, since: "2026-11-18" },
  class_teachers: { name: "DLI classes: a class's teachers listed in the class, add another teacher by username, remove one", released: true, since: "2026-11-18" },
};

const KEY = "tamkeenPrototype";
const OLD_KEY = "tamkeenTryDictation"; // (the first hidden switch, for "Type what you hear" alone)

/** Whether prototype mode is on for this device. */
export function prototypeOn() {
  try { return localStorage.getItem(KEY) === "1" || localStorage.getItem(OLD_KEY) === "1"; } catch { return false; }
}

/** Switches prototype mode on or off for this device; false if the browser keeps no storage. */
export function setPrototype(on) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); }
    return true;
  } catch { return false; }
}

/** Whether a feature is on here: released for everyone, or this device is in prototype mode. An id with no row
 *  is a mistake in the code: it stays off, so an unfinished feature never leaks out by a typo. */
export function feature(id) {
  const f = Object.prototype.hasOwnProperty.call(PROTOTYPES, id) ? PROTOTYPES[id] : null;
  if (!f) return false;
  return f.released === true || prototypeOn();
}

/** The features still waiting for the owner's go-ahead. */
export const waiting = () => Object.entries(PROTOTYPES).filter(([, f]) => f.released !== true).map(([id, f]) => ({ id, ...f }));

/** The secret switch: five quick taps on `el` turn prototype mode on or off, and say which features it covers.
 *  `say` shows a short message (the app's toast). */
export function prototypeTaps(el, say) {
  if (!el) return;
  let taps = 0, timer = null;
  el.addEventListener("click", () => {
    taps += 1;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1500);
    if (taps < 5) return;
    taps = 0;
    const on = !prototypeOn();
    if (!setPrototype(on)) return;
    const names = waiting().map((f) => f.name);
    if (typeof say === "function") say(on
      ? (names.length ? `Prototype mode is on for this device: ${names.join("; ")}.` : "Prototype mode is on for this device. Nothing is waiting to be tried just now.")
      : "Prototype mode is off for this device.");
  });
}
