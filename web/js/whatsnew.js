// "What's new" in the web app's update banner (mobile/src/js/app.js versionBanner): a short list
// of the new features in plain words, per version, instead of a link to GitHub (the owner's wish).
// Add an entry with every release; versions without one fall back to the release page.
//
// Each list is made with notes(…) rather than written inside [ ]: the translation collector
// (tools/i18n/extract.mjs) skips text right after a "[", so it would stay English.

const WHATS_NEW = new Map();
const notes = (version, ...lines) => WHATS_NEW.set(version, lines);

notes("0.36.0",
  "Pages and books: one clean text size, full pages, and headings and bold kept from the original",
  "The Word button plays the whole word instead of cutting it short",
  "Dictionary first downloads your language's dictionary by itself",
  "Combos last your whole study session, with no timer",
  "Listening & transcripts settings redesigned, with an accuracy comparison for Thai and Bisaya",
  "The word popup's source selector is at the top right");

notes("0.35.0",
  "Learn German, Persian, Hindi and Korean, and use Tamkeen in them",
  "One Web page screen: paste an address, your saved sites and the news",
  "YouTube topics: news, music, comedy and more, in the language you learn",
  "Netflix with tappable subtitles, in the desktop app or with the Tamkeen extension",
  "Send today's review to Google Calendar at a time you pick",
  "Changes reach your other devices within seconds, and a refresh button in the top bar");

/** Compare two version numbers ("0.35.0"): negative, zero or positive. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** What is new since `last` up to `current`, newest version first, at most `max` lines. */
export function whatsNew(last, current, max = 8) {
  return [...WHATS_NEW.keys()]
    .filter((v) => compareVersions(v, current) <= 0 && (!last || compareVersions(v, last) > 0))
    .sort((a, b) => compareVersions(b, a))
    .flatMap((v) => WHATS_NEW.get(v))
    .slice(0, max);
}
