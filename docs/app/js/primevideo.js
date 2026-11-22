// Prime Video in Tamkeen, the light way (the owner, 2026-11-21: "yes add the light way"). In a computer's
// Chrome or Edge, the Tamkeen browser extension (extension/, the same one as for Netflix) shows a panel
// beside Prime Video's own player with the subtitle line Prime Video is showing on screen as words you can
// tap; saved words come to the Vocab here, like Netflix's.
//   - It only reads what is on the screen (web/js/prime-common.js): the subtitle line and the title's name.
//   - It never controls Amazon's player or menus (the viewer turns subtitles on in Prime Video's own menu),
//     never downloads video, sound or subtitle files, and keeps only the lines watched (for that viewing)
//     and the words saved (sent to the Vocab with the title's name: Prime Video titles are not added to
//     the Library).
// Phones can't: Prime Video only plays in Amazon's own app there. Nothing here touches the page when the
// file loads (tests: tests/js/primevideo.test.mjs).
import "./prime-common.js"; // globalThis.__tamkeenPrimeLib: reading the player's screen
import { spread } from "./ytcaptions.js";
import { t } from "./i18n.js";

const lib = () => globalThis.__tamkeenPrimeLib;
export const cleanCaption = (s) => lib().cleanCaption(s);
export const readCaption = (doc) => lib().readCaption(doc);
export const readTitle = (doc) => lib().readTitle(doc);
export const episodeParts = (line) => lib().episodeParts(line);
export const primeTitleId = (url) => lib().titleId(url);
export const isPrimeHost = (host) => lib().isPrimeHost(host);

export const PRIME = "https://www.primevideo.com";
export const PRIME_NAME = "Prime Video"; // (its name, never translated)
const MAX_LINES = 3000;

/** A Prime Video title's own id, or "" ("0HU0AV5V1B0A8LMDYOOBX4FKYJ", "B0B8TQH8KZ"). */
export const cleanPrimeId = (v) => (/^[A-Za-z0-9]{8,40}$/.test(String(v ?? "").trim()) ? String(v).trim() : "");

/** Where a word saved in Prime Video came from, for the Vocab page: "Prime Video · The Show · S1:E3 · Name". */
export function primeSource(title = "", episode = "") {
  const name = String(title || "").replace(/\s+/g, " ").trim();
  const ep = String(episode || "").replace(/\s+/g, " ").trim();
  const parts = episodeParts(ep);
  const epText = parts ? [`S${parts.season}:E${parts.episode}`, parts.name].filter(Boolean).join(" · ") : ep;
  return [PRIME_NAME, name, epText && epText !== name ? epText : ""].filter(Boolean).join(" · ").slice(0, 300);
}

/**
 * The subtitle lines seen while watching, built from what the screen shows a few times a second:
 * `see(text, time)` with the line on screen ("" between lines) and the player's time in seconds.
 * A line starts when it first shows and ends when the next one (or nothing) shows. Seen again (a jump
 * back), it is not added twice. `lines` [{start, end, text}] in the order watched; `current` the index
 * of the line on screen, or -1. Nothing is kept beyond this viewing.
 */
export function watchedLines() {
  const lines = [];
  let current = -1;
  function close(time) {
    if (current < 0) return;
    const l = lines[current];
    if (Number.isFinite(time) && time > l.start && time - l.start < 30) l.end = Math.max(l.end, time);
    current = -1;
  }
  return {
    lines,
    get current() { return current; },
    /** What the screen shows now; true when the lines or the current one changed. */
    see(text, time) {
      const tx = cleanCaption(text);
      const at = Number.isFinite(Number(time)) ? Math.max(0, Number(time)) : 0;
      if (current >= 0 && lines[current].text === tx) {
        if (at > lines[current].end) lines[current].end = Math.min(at, lines[current].start + 30);
        return false;
      }
      const was = current;
      close(at);
      if (!tx) return was >= 0;
      const again = lines.findIndex((l) => l.text === tx && Math.abs(l.start - at) < 2.5);
      if (again >= 0) { current = again; return true; }
      lines.push({ start: at, end: at + 0.5, text: tx });
      if (lines.length > MAX_LINES) lines.shift();
      current = lines.length - 1;
      return true;
    },
  };
}

/** A watched line as the panel shows and looks it up: {start, end, text, words: [[start, end, word]]}. */
export function lineWithWords(l) {
  const start = Number(l.start) || 0;
  const end = Math.max(start + 0.5, Number(l.end) || 0);
  return { start, end, text: l.text, words: spread(String(l.text || ""), start, end) };
}

// ---------- the web app's and the computer app's words about it ----------

/** What the Library's Netflix heading and the + sheet say about Prime Video and the extension. On a
 * phone (`phone`): that it works on a computer. */
export function primeNote(phone = false) {
  return phone
    ? t("Netflix and Prime Video work with the Tamkeen browser extension on a computer, in Chrome or Edge. Their subtitles become words you can tap, and the words you save come back to every device.")
    : t("The Tamkeen extension also works with Prime Video: open a title on primevideo.com, turn on subtitles in Prime Video's own menu, and the line on screen shows beside the player as words you can tap. Words you save there come to your Vocab.");
}
