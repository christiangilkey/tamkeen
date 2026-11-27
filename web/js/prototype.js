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
  sense_choice: { name: "Add words asks which meaning a word with several meanings is for (one screen for all the words)", released: true, since: "2026-11-19" },
  drag_drop: { name: "Drag and drop files onto My audio, My videos, My files, Books, Audiobooks, a lesson, Import data and your profile photo", released: true, since: "2026-11-19" },
  lesson_links: { name: "Lessons: a PDF's or Word file's links to sound files (\"Audio Files/1.mp3\") become sound spots, filled by adding the files (several, a folder, or dropped), matched by name", released: true, since: "2026-11-19" },
  dict_sense_pick: { name: "Saving a word with no AI: a word with several meanings asks which one the card is for (word popup, Ask by voice)", released: true, since: "2026-11-21" },
  card_pictures: { name: "Your own picture on the back of a flashcard (Add picture / tap the picture: take or choose a photo, remove it); synced, offline, in the Anki export", released: true, since: "2026-11-23" },
  card_pictures_openverse: { name: "Pictures on cards from Openverse: the picker's search by the card's meaning, a Settings switch for new cards and \"Add pictures\" for the cards you have (Openverse's search kept failing, 2026-11-23)", released: true, since: "2026-11-23" },
  library_feed: { name: "The Library like YouTube: every tab in big pictures (a YouTube video in the middle of the screen plays silently), in progress first, then new, then finished, with a Filter button", released: true, since: "2026-11-21" },
  creator_bar: { name: "Creator bar on Home (the creator only): people online now and every limit as used / limit", released: true, since: "2026-11-20" },
  voice_ask_native: { name: "Ask by voice in your own language: questions (\"¿cómo se dice perro en árabe?\"), \"add it\" and the examples in the app's language; with no AI, your own language's dictionary is downloaded once (only yours)", released: true, since: "2026-11-21" },
  old_games: { name: "Find an older game: bring back a creature game lost before the sync combined copies, from Google Drive's older versions (Settings → Game features, and a note on Home)", released: true, since: "2026-11-23" },
  lesson_words: { name: "My files: every word of a lesson (all its passages, headings, questions and options) can be tapped right on the lesson page, with the usual popup and purple new words; no separate reader", released: true, since: "2026-11-23" },
  tap_switch: { name: "Tap words on or off: a button at the bottom of transcripts, books, webpages and My files makes the words plain text (no popup, no purple) to select and copy", released: true, since: "2026-11-23" },
  prime_video: { name: "Prime Video with the Tamkeen browser extension (now \"Tamkeen for Netflix & Prime Video\"): \"Get the Tamkeen extension\" and a Prime Video note on the Library's Netflix tab and the + sheet's Netflix step", released: true, since: "2026-11-21" },
  class_tab: { name: "Class tab for DLI students and teachers: invite by username, classmates with activity levels, send to a class", released: true, since: "2026-11-24" },
  classroom: { name: "Classroom in the Library for DLI teachers and students: folders, the teacher's transcript, important words, meanings and notes", released: true, since: "2026-11-24" },
  owner_gifts: { name: "Gifts from the creator: give a chosen user coins, gems, XP, glow, items, moves, unlocks and creatures", released: true, since: "2026-11-24" },
  add_word_picture: { name: "Add words: a Picture field on each card (take or choose a photo), kept on the card when it is added", released: true, since: "2026-11-25" },
  list_kinds: { name: "Add words, Paste a list: a list of words in your own language finds their words in the one you learn; a list of words in that language fills in the rest and asks which meaning when a word has several (Fill in asks too)", released: true, since: "2026-11-25" },
  fish_guardians: { name: "Fishing: a pond guardian's own moment (its shadow glows, sparkles and a big reveal when caught, a glow in the aquarium, a mark in the Fishdex)", released: true, since: "2026-11-25" },
  legend_feast: { name: "Badge: Legendary feast, for feeding your creature a fish of Legendary rarity or better", released: true, since: "2026-11-25" },
  goal_rate: { name: "Long-term goal set per day, week or month (\"20 new words a day\"), worked out over the goal's time; shown again as typed, and scaled when the time changes", released: true, since: "2026-11-25" },
  habitat_room: { name: "The habitat is the creature's cozy cottage: tap the floor and it walks there (round the furniture), indoor decorations inside; out its door, a yard seen from above like the battle arenas, where it walks anywhere among the outdoor decorations and the garden", released: true, since: "2026-11-25" },
  gem_glow: { name: "Gems for glow in Supplies: the day's first gem 5,000 glow, each more that day twice the price before; it starts again each day", released: true, since: "2026-11-25" },
  small_battlers: { name: "Smaller creatures in live battles: drawn at about two thirds of their size next to the arena's houses, trees and props (the battle plays the same)", released: true, since: "2026-11-25" },
  hunger: { name: "Hungry creatures: a creature that hasn't eaten for a day shows it is hungry and fights at 85% attack and defence until fed (Feed first? before a battle)", released: true, since: "2026-11-25" },
  talents: { name: "Creature talents and the Element card: each creature's talent for health, attack, defence and speed (grades C to S in blue on its card, no stars), counting up to +15% only in battles against the game; stardust, a release and Warm porridge raise new eggs' odds; a quiet Perfect talent badge; the card in its element's colour with the creature walking on it", released: true, since: "2026-11-26" },
  ranked: { name: "Ranked battles: live against another player online, a rating from 0, matched with players of a similar rating, a leaderboard and tiers (needs supabase/v18-ranked.sql)", released: true, since: "2026-11-25" },
  farm: { name: "The farm: a fenced field west of the cottage; plant seeds bought with glow, water each plant by answering a due word, crops ripen after water on different days, wilt (never die) when a day is missed, harvests by rarity into the barn; the seasons turn weekly", released: true, since: "2026-11-26" },
  meaning_first: { name: "Add words from the meaning: leave the word empty and type its meaning (or paste \"= library\"), and Tamkeen finds the word in the language you're learning, then fills in the rest", released: true, since: "2026-11-25" },
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
