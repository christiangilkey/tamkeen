// "What's new" in the web app's update banner (mobile/src/js/app.js versionBanner): a short list
// of the new features in plain words, per version, instead of a link to GitHub (the owner's wish).
// Add an entry with every release; versions without one fall back to the release page.
//
// Each list is made with notes(…) rather than written inside [ ]: the translation collector
// (tools/i18n/extract.mjs) skips text right after a "[", so it would stay English.

const WHATS_NEW = new Map();
// (A version named twice gets both lists, in order: a feature can add its line before the release notes are written.)
const notes = (version, ...lines) => WHATS_NEW.set(version, [...(WHATS_NEW.get(version) || []), ...lines]);

// Added with the feature, ahead of the release (rename the version if the release is numbered otherwise).
notes("0.45.0",
  "Iraqi Arabic course: pick Iraqi in Courses for its own Grammar and Basics, with the Baghdad g and ch");

notes("0.44.0",
  "Battles are now live: run your creature around a new arena every time with the stick, the keys, the mouse or your finger, and answer a word question in 5 seconds to land each move",
  "Hatchlings have a baby look of their own",
  "Hold a word to mark it known without opening the popup, or press ? in the popup to keep it amber as not known yet",
  "A Sound effects switch in Settings → Game features",
  "Transcribing shows a scan bar and a writing bar, each with its percentage");

notes("0.43.0",
  "Arabic dialect courses: pick Levantine, Egyptian, Gulf or Moroccan in Courses for their own Grammar and Basics");

notes("0.43.0",
  "18 new hand-drawn creatures: three for each element, original, cyberpunk and fantasy",
  "Netflix on the computer: switch its audio and subtitles, and use a game controller on its pages",
  "Memorization notes on review cards, with a Use button for each Mnemonic maker keyword",
  "The Library's + button opens on the way to add for the tab you're on");

notes("0.42.0",
  "Your controller works like an Xbox: A selects, B goes back, LB and RB switch tabs",
  "A drawing of the controller in Settings shows what every button does",
  "Creature battles on a grid, with a timeline and new moves to buy in the shop");

notes("0.41.1",
  "Audiobooks in the Library: free LibriVox books in your language, or add your own audiobook files",
  "An Xbox-style controller works on every screen, with a button guide",
  "YouTube videos without captions: Gemini can write them for you");

notes("0.40.0",
  "A fresh look: new fonts for the app's text, titles and numbers",
  "A ? on every screen shows how to use it",
  "Look up any run of words together, across lines, up to 30 words",
  "The Library remembers which kind you were looking at",
  "Reels from your Instagram saves download far more reliably",
  "A tidier word popup and reels page on phones");

notes("0.39.0",
  "Better mnemonics: keywords that really sound like the word, linked to its meaning, each with a picture",
  "Game controller support for videos and review cards",
  "A final read-through of every grammar course",
  "Grammar lessons are marked done on phones and the web app");

notes("0.38.0",
  "Grammar courses for learning English, explained in your own language",
  "Review cards: the translation on the back, tap any text to fix it, hold a word to highlight it",
  "The basics courses highlight each word in the right place",
  "XP for hearing grammar examples and adding Basics words",
  "Problems you can fix open one clear popup with a button to the fix",
  "Courses open on Grammar first");

notes("0.37.0",
  "Courses in the Library: the 1000 most common words of your language, with sentences and natural audio",
  "A grammar course, explained step by step",
  "Scan words: photograph a vocab list or a single word and add it as cards",
  "Spotify karaoke was removed from the browser extension");

notes("0.36.0",
  "Add words: type or paste many new words at once, with meanings, sentences and audio filled in for you",
  "Look up several words together: drag across them, or hold and slide on a phone",
  "Card voices: every flashcard can be read aloud, including natural Azure voices",
  "Your daily streak on Home and beside your friends' names",
  "Spotify karaoke: tap any word in a song's lyrics (with the browser extension)",
  "Netflix extension: Audio and Subtitles menus, and it follows the language you're learning",
  "A button that goes back to the start of the sentence",
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
