// "What's new" in the web app's update banner (mobile/src/js/app.js versionBanner): a short list
// of the new features in plain words, per version, instead of a link to GitHub (the owner's wish).
// Add an entry with every release; versions without one fall back to the release page.
//
// Each list is made with notes(…) rather than written inside [ ]: the translation collector
// (tools/i18n/extract.mjs) skips text right after a "[", so it would stay English.

const WHATS_NEW = new Map();
// (A version named twice gets both lists, in order: a feature can add its line before the release notes are written.)
const notes = (version, ...lines) => WHATS_NEW.set(version, [...(WHATS_NEW.get(version) || []), ...lines]);

notes("0.61.0",
  "One word list for every game: the words you pick for battles now fill the fishing pond too");
notes("0.61.0",
  "Sound volume: one slider for podcasts, videos and lessons, another for the app's own sounds");
notes("0.61.0",
  "Lessons: a teacher's PDF or Word file with its audio becomes a lesson with questions to answer");
notes("0.61.0",
  "Correct the transcript: a pencil button in the player lets you fix any line");
notes("0.61.0",
  "DLI classes show everyone by username, never a real name, with listening, watching and reading time");
notes("0.60.0",
  "Listen in My audio: record from the microphone and get a transcript");
notes("0.60.0",
  "Translation under each line: turn it on in the player to see your language under every line");
notes("0.60.0",
  "Scan now puts all the text in a photo into a box you can edit, then make cards from");
notes("0.60.0",
  "The line under Review fades where it is cut off, and waits less before sliding");
notes("0.59.0",
  "Mark words Important with a flag: they come first in reviews and among new words");
notes("0.59.0",
  "Out of new words for your goal? The Review box turns purple, with a Get words button");
notes("0.59.0",
  "Buy a bigger aquarium with pearls, and swap a new fish in when it is full");
notes("0.59.0",
  "Library tabs that need a key now say what is needed and why, with a button to add it");
notes("0.59.0",
  "Contact in Settings: send a problem or a question to SGT Gilkey");
notes("0.59.0",
  "Pasting a list into Add words no longer opens Scan: fix it in the list box, then use it");
notes("0.59.0",
  "In the web app, Get the app in Settings, with a download for every device");
notes("0.58.0",
  "Each language now has its own long-term goal: set one for Spanish and one for Arabic");
notes("0.58.0",
  "Course audio now comes in one download per unit and is kept on your device");
notes("0.57.0",
  "Learn the new words your long-term goal asks for, straight from the goal card");
notes("0.57.0",
  "Type your own number for new words a day and for the card times");
notes("0.57.0",
  "Pick several folders at once on the Vocab page and for battles");
notes("0.57.0",
  "Find a real one looks for sentences in your own books and transcripts first");
notes("0.57.0",
  "The Mnemonic maker keeps working when your AI key fails, and shows who made each set");
notes("0.57.0",
  "Guild raids in the Guilds tab, with a damage leaderboard and how to hit the boss");
notes("0.56.0",
  "Set a long-term goal: a bar shows how far you are and the pace still needed, even after missed days");
notes("0.56.0",
  "A review calendar: a square for every day, darker the more cards you answered");
notes("0.56.0",
  "The flashcard time bar is now a speed streak, with +10 s time boosts");
notes("0.56.0",
  "Search tools on the Vocab page: folder:, is:due, reviewed:7 and more");
notes("0.56.0",
  "A pronunciation score for Say it and Conversation, with an Azure key");
notes("0.56.0",
  "Tap any word in a course to hear it, see what it means and save it");
notes("0.56.0",
  "Vocab folders show only in the language they were made in");
notes("0.55.0",
  "ICPT prep decks for DLI students in all seven DLI languages, by topic and level");
notes("0.55.0",
  "Words you already have from your DLI basic course are filed in the ICPT folders, not added twice");
notes("0.55.0",
  "Mock OPI for DLI students: a full practice interview, with an estimated level at the end");
notes("0.54.0",
  "Conversation: practise speaking in the Library, with your own AI playing the other person");
notes("0.54.0",
  "38 situations in five levels, from ordering at a café to defending an opinion");
notes("0.54.0",
  "Tap any word in a conversation, get quiet corrections and hints, and a debrief at the end");
notes("0.54.0",
  "Answer by voice: on the computer your voice is written down there and never leaves it");
notes("0.54.0",
  "DLI teachers can make classes and follow their students' practice; it switches on for everyone soon");

notes("0.53.1",
  "The flashcards' answer buttons work again once a card is turned over");

notes("0.53.0",
  "Pick the part of a word the Mnemonic maker works on, right on the word");
notes("0.53.0",
  "Flashcard rewards show in the card's empty corner, never over the word");
notes("0.53.0",
  "Your aquarium shows on Home, and fishing says the right answer's word");
notes("0.53.0",
  "Shirts fit creatures properly, with a collar at the neck");

notes("0.52.0",
  "Every card you remember rolls for a reward, in ten rarities");
notes("0.52.0",
  "Fishing: the creature game's first mini-game, where reviewing words is how you fish");
notes("0.52.0",
  "Friends can see your aquarium and this week's biggest catch");
notes("0.52.0",
  "Battles say the right answer's word when you choose");
notes("0.52.0",
  "Live battles: area attacks a little smaller, lunges quicker");
notes("0.51.0",
  "Creatures walk, breathe and blink, and the winged ones fly");
notes("0.51.0",
  "Seven special colourings to earn, and 46 new things to wear");
notes("0.51.0",
  "Battle questions show the meaning and you pick the word");
notes("0.51.0",
  "Live battles: a steady camera, wider area attacks, and hint cards to find on the arena");
notes("0.51.0",
  "A smoother start for new learners, with Start here on Home");
notes("0.51.0",
  "YouTube videos say when they have a soundtrack in the language you are learning");

notes("0.50.0",
  "Arabic dialect words are read in their own accent: Iraqi, Levantine, Egyptian and Gulf card voices");
notes("0.50.0",
  "Common words get an example sentence without an AI key, in all 16 course languages");
notes("0.50.0",
  "A Battle button on each friend, and the guild raid on Home");
notes("0.50.0",
  "The back of a review card has the Mnemonic maker, a new example sentence and Folders");
notes("0.50.0",
  "Eggs wear hats and wings");
notes("0.50.0",
  "YouTube videos without captions are tagged before you open them");

notes("0.49.0",
  "Battle maps with buildings: a village with a town hall and tavern, a dungeon with traps and hidden rooms, and a fortress with a keep");
notes("0.49.0",
  "Challenge a friend on one of your folders: you each battle the other's team with its words");
notes("0.49.0",
  "Battles can ask the words due for review, or the words in one folder");
notes("0.49.0",
  "Battles pay 25 XP for each word they make well known. Battle tickets are gone: any you had came back as gems");
notes("0.49.0",
  "Three Arabic classics on the free book shelf: the Mu'allaqat, the Thousand and One Nights and the Muqaddimah");

notes("0.48.1",
  "The Mnemonic maker stresses Bisaya words where Wolff's dictionary does: palit is pa-LIT, hatag HA-tag");

notes("0.48.0",
  "The word popup shows each word's grammar: noun or verb, gender, the Arabic root and plurals, and key verb forms such as the Spanish subjunctive");
notes("0.48.0",
  "Tagalog words show their root and affix, and Tagalog and Bisaya verbs their focus forms");
notes("0.48.0",
  "New Plain and Striped shirts, and every shirt follows your creature's light and shadow");
notes("0.48.0",
  "Friends see your creature wearing everything it wears on Home");
notes("0.48.0",
  "Battles unlock at 20 saved words");
notes("0.48.0",
  "Library → + → Podcast opens Trending in your language straight away");
notes("0.48.0",
  "The review screen fits on every phone");

notes("0.47.1",
  "Signing in on the welcome screen takes you straight to Home");
notes("0.47.1",
  "A book file you add goes under the language it is written in: if one didn't show up, add it again");

// Added with the feature, ahead of the release (rename the version if the release is numbered otherwise).
notes("0.47.0",
  "DLI students: unlock your course in Settings → Languages, with its whole vocabulary in Vocab, a folder for each chapter");
notes("0.47.0",
  "The Mnemonic maker learns from the sound-alikes you write in CAPITALS, and leaves out little words such as al-, el and to");
notes("0.47.0",
  "Add words takes whole phrases, such as por favor or إن شاء الله, as one card");
notes("0.47.0",
  "The creature game: every part has a screen of its own, and the Creatures page reads like a creature guide");

notes("0.46.0",
  "Your creature's card on Home: a goal ring round your creature, rewards that fly to their counter, and four big tiles with a dot when something waits");
notes("0.46.0",
  "Vocab: an opened word gets every review-card tool, one tidy row for folders and sorting, and Select to change many words at once");
notes("0.46.0",
  "Choose free or AI for example sentences and memory tricks in Settings, each with a How it works button");
notes("0.46.0",
  "What is Tamkeen is now three pages: How to use Tamkeen, What makes Tamkeen special, and Supporting studies");

notes("0.45.0",
  "Iraqi Arabic course: pick Iraqi in Courses for its own Grammar and Basics, with the Baghdad g and ch");
notes("0.45.0",
  "Thai transcripts on your computer now use Pathumma, with about a quarter fewer mistakes on everyday talk");
notes("0.45.0",
  "Latin: learn it from podcasts, audiobooks, books and videos, with each word's dictionary form and meaning a tap away");
notes("0.45.0",
  "Gyms: beat ten gym leaders in live battles, one after another, each quicker and sharper than the last");
notes("0.45.0",
  "No AI key needed for mnemonics and example sentences: English sound-alike keywords with a picture, and real sentences from Tatoeba and Wiktionary");
notes("0.45.0",
  "Without AI: example sentences you can already read, sound-alike keywords in your own language that fit the meaning, your dialect course's sentences, and many more Bisaya sentences");

notes("0.45.0",
  "What is Tamkeen in Settings: everything the app can do, and the studies behind its design");

notes("0.45.0",
  "Safer Friends: block and report people, delete your online account, and chat only with friends (16 and older)");

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
