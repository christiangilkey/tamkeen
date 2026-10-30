# Tamkeen changelog

What changed in each version of Tamkeen, in plain words. The newest version is at the top.

- **Unreleased** lists changes already made but not yet in a released version.
- When a version is released, its Unreleased notes move under a new heading for that version.
- Each line starts with the kind of change: **New**, **Improved**, **Changed**, **Fixed** or **Removed**.
- A note in brackets, such as *(Android)*, says which versions a change is for. A line with no note applies to every version that existed at the time.
- The four versions are the **desktop app** (Windows, Mac, Linux), **Android**, **iPhone** and the **web app**. "The phones" means Android and iPhone.

The app was called **Arabic Podcast Studio** until v0.8.0.

---

## Unreleased

- **New:** Audiobooks in the Library, for every language you learn. Press + and choose Audiobook: LibriVox's free public-domain audiobooks in the language you're learning are listed straight away, most popular first, with their cover, author, length and chapters, a search, and more at the end of the list. Where LibriVox has none yet (Thai, for now), it says so. Add one and its chapters arrive in order; the first is transcribed straight away. A chapter plays in the usual player with its transcript, word lookup and Save; "Next chapter" goes on to the next one, which is transcribed while you listen to this one. Audiobooks has its own place in the Library, with Continue where you left off.
- **New:** Audiobook files of your own in Audiobooks: choose one file or several at once (a book sold as one MP3 per chapter becomes one book, its chapters in file-name order), then give it a title. A link points to Libro.fm, a shop that sells DRM-free audiobooks to download and add. Audible's .aax files are copy-protected and can't be opened; the app says so.
- **Improved:** Audio files can be M4B (the usual DRM-free audiobook file), MKA or AIFF too, as well as MP3, M4A, AAC, OGG, Opus, FLAC, WAV, WMA, AMR and WebM. Added on the computer, WMA, AMR and AIFF files are kept as Opus, so they play everywhere.
- **New:** An Xbox-style game controller now works on every screen of the app (all but the web browser), each screen with buttons of its own. In the players, reels, books and saved webpages the D-pad moves a highlight word by word and line by line through the transcript, the captions or the page; A opens the word popup for the highlighted word (or for the word being said), and holding A while moving takes in more words, like holding a word and sliding a finger across. In the popup, X and Y play the word and the sentence, ← and → look up the word before or after, and A saves. X plays and pauses, Y hears the line again, the left stick seeks. On a review card's back the D-pad's up and down walk through its boxes (the word, meaning, sentence, translation, notes and the Mnemonic maker with its thumbs up and down) and A opens the highlighted one; ← and → still answer. Home, the Library, course lessons, Vocab, Friends, Settings and popups each have their own: LB / RB switch kinds, lessons, folders, sections or tabs, the triggers jump a page at a time through long lists, X and Y do each screen's main things (Continue, Review, Add, Search…).
- **New:** While a controller is in use, a small guide at the foot of the screen shows what A, B, X, Y and the shoulder buttons do there. Turn it off in Settings → Controller.
- **Improved:** Settings → Controller lists each screen's buttons (choose the screen at the top), and any of them can be given another button. Buttons changed before keep working.
- **Improved:** The browser's plain "OK / Cancel" boxes (deleting a podcast, an episode, a folder or a chat message, leaving a battle, releasing a creature) are now Tamkeen's own popups, which a controller can answer too.
- **Fixed:** With a controller, highlighting a text box no longer traps the highlight in it: the cursor only goes in when A is pressed, the D-pad moves on out of it, and B leaves it. Options drawn as tiles (Settings → Theme, who writes transcripts), lesson words you tap to hear, strips that scroll sideways and sliders (←/→ change them) can all be reached, and the game's sheets, the battle screen and other popups keep the highlight inside them.
- **New:** A YouTube video with no captions at all no longer stops at "Try another video". A popup explains in one line that YouTube's terms don't let Tamkeen download a video's sound to make captions, but that Google's Gemini can watch the video itself and write them, and a button has your Gemini key do it (it says roughly what it costs, a few US cents for a ten-minute video). The video is then added with Gemini's captions, which work like any others (tap a word, save it); the player notes that Gemini wrote them. Without a Gemini key the button goes to Settings → Word definitions to add one. Public videos up to an hour.

## v0.40.0 — 2026-10-27

- **Improved:** A new look for the app's words: Figtree for its text, and Rubik for page titles and the numbers worth celebrating (your streak, XP, cards to review). Both come with the app, so every computer and phone shows the same thing, also offline. Other alphabets keep their own fonts.
- **Improved:** Holding a word and sliding across others now carries on past the end of a line or sentence, so any run of words can be looked up together, up to 30 words (it was 12, within one line). The popup uses all the sentences they come from.
- **Fixed:** Looking up a long run of words together could fill the whole word popup with the words themselves, hiding their explanation. The words now take at most three lines (scroll them to see the rest), and the explanation shows under them and scrolls as usual.
- **New:** A round **?** in the top bar of every screen shows how to use that screen, as often as you like: each button is outlined in turn with a line on what it does. The players (podcasts, videos, reels, webpages and books) have a full walk-through: an animated fingertip shows how to tap a word, and how to hold one and slide across the next words to look them up together; then pictures of the word popup and its buttons, Save, and the label that says where a meaning came from, with how to switch to the built-in dictionary (Wiktionary). The reviewer has its own ? beside its settings. On a computer the ? key does the same.
- **Improved:** Pressing play brings the transcript (and the line of words under a reel) back to the word being said, also after you scrolled away from it while paused.
- **Fixed:** On a phone, the word popup's "Explain words with" menu was squashed down to its first choice, hiding the built-in dictionary (Wiktionary) and "Dictionary first". It now shows every choice.
- **Improved:** Getting the reels you ticked from your Instagram saves is much more reliable. The phone downloads just each reel's sound, a fraction of the video's size, so far fewer reels are "too large to send from the phone" or take too long. A download that breaks off is tried three times, and the reels that still didn't work get a second round once the rest are done. A reel that failed for a reason that may pass (a dropped connection, an Instagram server that didn't answer) can be ticked again afterwards, and says so. *(the phones)*
- **Improved:** The Library tab opens on the kind you were last looking at (Courses, Podcasts, YouTube, Reels…) instead of always on Courses.
- **Improved:** On a phone, the word popup's buttons in the players and reels are tidier: Word, Sentence, Continue and Add audio show just their icons (the sentence one now has its own icon), and Save keeps its word.
- **Fixed:** On a phone, the reels page squeezed each reel's name and caption into a column one word wide, in both "Tick the reels you want" and the list of your reels. They now use the whole width, with "Already in your reels" under the caption and Watch / Delete under the title.

## v0.39.0 — 2026-10-27

- **Improved:** The Mnemonic maker on the back of a review card makes much better sound-alikes. It first works out how the word is really said (from the vowel marks, kana, pinyin or romanization the app already knows, in the Arabic dialect or country you chose) and shows it as syllables with the stressed one in capitals, like NIY-ya. It then asks for three times as many keywords as it shows and checks how each one sounds itself (for English speakers against a pronouncing dictionary), leaving out ones that don't really sound like the word or aren't real words; when fewer than five pass, only those are shown. Each keyword shows the part of the word it sounds like, **Close match** or **Partial match**, **Fits the meaning** when the keyword itself points to the meaning (those come first), and a one-line picture that ties it to the meaning. Long words also get keywords in parts. Thumbs up puts a keyword and its picture in Personal notes; thumbs down drops it, and it is never suggested for that word again. It now uses a stronger model of your AI provider unless you choose another (at most about 2 US cents a press; Settings → Word definitions → Mnemonic maker shows the cost), and your word-definitions model if your key can't use it.
- **Improved:** Grammar courses: a final read-through of every course's lessons, with small fixes to explanations, translations and answers. In English → Thai every Thai word in a heading now shows how it is said, and in English → Japanese a common mistake shows how both its wrong and right forms are said.
- **New:** Game controller support, USB or Bluetooth (Xbox, PlayStation, Nintendo Switch Pro and most others), for watching and for reviewing cards. In podcasts, YouTube, Netflix, your own videos and reels: play/pause, back or forward 5 seconds, previous or next line, hear the line again, loop it, slow down, look up the word being said, save it, captions and the transcript panel, and the next or previous reel. On review cards: turn the card, Remembered / Not remembered, play the word or the sentence, Say it, undo and finish. Everywhere else the D-pad moves a highlight between the buttons on screen, A presses it, B goes back or closes a box, the right stick scrolls and Start jumps to the main tabs. **Settings → Controller** shows the controller connected, says how to connect one, and lets you give every action any button: press the button beside an action, then the one on the controller (✕ leaves it without one, ↺ puts its default back). Buttons are named as printed on your controller (A/B/X/Y, ✕/○/□/△, or a Switch's own letters), and your choices travel to your other devices with your other settings. Nothing happens while you are typing in a text box.
- **Fixed:** On the phones and the web app, finishing a grammar lesson said "This lesson couldn't be marked as done", and the course list showed no lessons as done. *(the phones, web app)*
- **Fixed:** Reels: on a phone, the "Get 10 random … reels from all of Instagram" button ran off the edge of the screen. It now wraps onto two lines.

## v0.38.0 — 2026-10-26

- **Improved:** The back of a review card shows the word's meaning under the word, and the sentence's translation under the sentence, small and in your own language (a card without a translation shows just the meaning).
- **New:** Put a card right while you review it: on the back, tap the word, its meaning, its sentence or the translation and it becomes a text box right where it is. Press Enter or tap elsewhere to save, or Esc to leave it as it was; the change reaches your other devices like any other. While you type, the card's keys and swipes don't answer it. A tap on the word or sentence used to copy it: the **Copy** button under the open box does that now.
- **New:** Hold a word in the card's sentence for half a second to highlight it as part of the word you're learning, or to take its highlight away: a verb in two parts, a whole phrase, or a word the card lit up wrongly. It works in the translation too, and that shows on the front of the card. What you choose shows on the card, in the Vocab list and in the Anki export. Japanese, Chinese and Thai are split into words the way the players split them. A short hint says so the first time.
- **Fixed:** The basics courses light up the word in the right place in its sentence. Before, the same letters inside another word could be lit instead (in Arabic, the لـ of الْهَدِيَّةُ instead of the لَ of لَكَ). Every sentence of all 17 courses now says exactly where its word is, and the course list, your cards, reviews, the Vocab list and the Anki export follow it; a word added from a course before keeps its sentence but now lights up the right place too (unless you changed the sentence). In Arabic and Persian the lit part stays joined to the letters around it.
- **New:** Grammar courses for learning English, explained in your own language: one for speakers of each of the 16 languages Tamkeen teaches (Library → Courses → **Grammar**, with the app in your language and English as the language you're learning). 45 to 52 lessons each, from your first sentence to everyday conversation (A1 to B1), in American English, with the same lessons, practice, reviews and XP as the other grammar courses.
- **Improved:** Library → Courses opens on **Grammar**, now the left tab, with **Basics** on the right. A tab you pick stays chosen until you close the app.
- **New:** More XP for your creature from the courses: tapping an example in a grammar lesson to hear it (a little, once a day for each example, and it keeps your combo going), and adding words from a basics course to your cards (5 XP a word, the same with "Add all", for up to 50 words a day). A finished grammar lesson already counted toward your XP, as before.
- **Improved:** A Library section with nothing in it yet (YouTube, Netflix, webpages, books, reels, your own videos and audio, podcasts) says "Nothing here yet" and what to add, with an arrow pointing at the + button.
- **Improved:** On the Vocab page, the Review box keeps its colour when you have no cards yet, with "No cards to study" on it.
- **Improved:** A problem you can put right yourself no longer shows red messages at the bottom of the screen. One popup in the middle says what is wrong, with a button that takes you straight to the fix and **Dismiss**: the microphone not allowed ("Say it", recording a card, voice notes) opens Tamkeen's page in the phone's settings (or asks again while it still can; the web app says where the browser's switch is), and a missing or refused AI or Azure key, a sign-in, Friends or the language you're learning opens the right place in Settings. It shows once, never piles up, and after Dismiss waits a little while before asking again; a review card behind it can't be answered by mistake. Other messages are never shown twice at once.

## v0.37.0 — 2026-10-25

- **Removed:** Spotify karaoke in the browser extension (it went against Spotify's terms of use).
- **New:** Scan words from a photo. "Add words" has a third way in, **Scan** (also "Scan words" in the Vocab page's ⋯ menu): on a phone, take a photo of a list of words, a page of your book or a single word, or choose one from your photos; on a computer, choose a picture, drop one on the box or paste one (Ctrl+V). Several photos in a row, for a list over several pages, add to the same batch. What was found is shown like a pasted list, with the photo above it to compare: each word with its meaning when the page had one, words already in your words left out, unsure readings marked "Check it", ticks to leave words out, and "Edit as text" to fix a misreading. "Use these" makes cards of them like a pasted list, so meanings, sentences and audio are filled in by "For these cards", and like any card without its own recording each is said by your card voice. A photo of one word goes straight into a card. Your AI reads the photo when it can read pictures (Claude, Gemini, OpenAI; Grok's newest models): print and handwriting, vowel marks and accents as written, and no meanings made up. The photo goes, made smaller, to your own AI provider only. Without AI, or offline, the photo is read on the device itself with Tesseract, which reads printed text much better than handwriting: a one-time download of 0.4 to 3.3 MB for each language, plus 1.5 MB the first time, with the size said first, for all 16 languages Tamkeen teaches and English. Photos are never kept: they are read, shown while you look, and gone when you close "Add words".
- **New:** **Courses** in the Library: a new first bubble, the one the Library opens on, with your language's basics course and grammar course. The Vocab page is your own words again.
- **New:** A basics course (Library → Courses → **Basics**): the 1000 most common words of the language you're learning, 50 at a time, each with a short everyday sentence, its translation and audio of the word and the sentence. Add a word, or a whole unit, to your cards in one tap; they come with their audio and go into your reviews. For all 17 languages Tamkeen teaches (Arabic in Modern Standard Arabic, fully vowelled; Bisaya read by a Filipino voice).
- **New:** A grammar course (Library → Courses → **Grammar**), for learners who know no grammar at all. Each lesson is named after something you'll be able to do ("Say what you want", "Tell a story"), opens with the sentence you'll be able to say by the end and a short conversation, explains the grammar in plain words with examples and common mistakes, and ends with practice: multiple choice, fill the gap, put the words in order, choose your replies in a conversation, say it aloud, and "your turn", which your AI can check. From the fourth lesson some questions come back from earlier lessons, and **Mixed review** asks questions from all the lessons you've done. A finished lesson earns XP for your creature and shows its score in the list; your progress syncs between your devices. Tap any example to hear it in your card voice. A course for each of the 16 languages Tamkeen teaches, explained in English: 47 to 54 lessons each, from the very beginning to everyday conversation (A1 to B1). In Japanese, Chinese, Korean, Thai, Hindi, Persian, Russian and Arabic every example and every answer you tap shows how it is said, in Latin letters (switch it off with "Hide readings"). Courses are explained in English or in the language you're learning; for any other pair (Chinese → Arabic, say), your AI key can translate a lesson's explanations into your language, kept on your device, never touching the language being taught.

## v0.36.0 — 2026-10-23

- **Improved:** Drop-down menus open Tamkeen's own list, in the app's colours, instead of the plain system list (on Android a grey box of round buttons). On the phones, and on touch screens in the web app and the desktop app.
- **New:** On the back of a review card, tap the word to copy it, or its sentence to copy the whole sentence. A short flash and "Copied" confirm it; a swipe never copies.
- **Improved:** The Mnemonic maker suggests real words of your own language that both sound like the word and point to its meaning, never the word's sounds spelled out ("nah-wee-yah"); anything like that is left out.
- **Improved:** Reels: beside your Instagram saves, the random button says "… from all of Instagram", with a line under it saying random reels aren't from your saved collection. *(the phones)*
- **New:** Spotify with karaoke lyrics. With the Tamkeen browser extension in Chrome or Edge, Spotify's web player gets a lyrics panel beside it: the song's lyrics line by line as it plays, the line being sung big and in the middle, the lines around it dimmer, the words lighting up as they are sung. Click any word (or drag across several) for its meaning, and Save it: it becomes a card with its lyric line as the sentence and "Spotify – Artist – Title" as where it came from. Play/pause, back 5 seconds and back to the start of the line are in the panel; scrolling the lyrics by hand stops them following the song until you press "Follow along"; the panel folds away to a slim tab. The lyrics come from LRCLIB, a free lyrics collection (or, when it has none, from Spotify's own lyrics view while it is open). Tamkeen tells the song's language from its words: a song in the language you're learning is looked up in it, a song in another language Tamkeen teaches can be with one click, and any other song still shows its lyrics. A song's whole lyrics are never kept, only the line of each word you save. In the web app, Library → + → Spotify opens Spotify or says how to get the extension; the phone apps and the computer app say where it works. *(web app with the extension)*
- **New:** With Azure chosen in Settings → Card voices, a word saved from YouTube, Netflix, a reel, a web page or a book gets its voice the moment you save it: Azure says the word and its whole sentence, kept with the card like a card from a podcast, ready for review and Anki. A new switch there, "Add the voice when a word is saved", is on by default; turned off, each card's voice is made the first time you play it. Netflix's own sound is never recorded or kept: Netflix cards always use the card voice.
- **New:** The word popup in YouTube, Netflix, reels, web pages and books has an "Add audio" button when saved words wouldn't get a voice by themselves (this device's voice, or Azure without a key or with the switch off). It opens Settings → Card voices. In the Netflix extension it opens the web app's Card voices settings. *(web app for the extension)*
- **Improved:** Example sentences written by "Add words" use the word the way a native speaker really would: natural, everyday and making sense on their own, in the word's own register (slang stays slang, dialect stays dialect), never translated word for word; the AI checks each sentence before answering.
- **New:** "Add words" on the Vocab page, beside "Send to …": type new words one by one or paste a whole list (up to 100 at a time, also straight from a spreadsheet), and choose what Tamkeen does for them. It can fill in their meanings (from the built-in dictionary or your AI), write a short example sentence with its translation, and give each card a voice (Azure, your computer or this device), or you type them and record or choose your own audio for each card. Whatever you type is never replaced, words you already have are pointed out, and "Fill in" lets you look everything over before adding. It replaces the old "Add a word" form.
- **Fixed:** Web app: when YouTube or another site briefly can't be reached (error 502), Tamkeen tries again by itself a couple of times before showing an error.
- **Fixed:** On the Vocab page, a word whose recording can't be played on this device (for example a podcast address that no longer works, or a file only your computer has) is read out by its card voice instead of showing red error messages, and the browser's own error text no longer appears. Messages now sit fully inside the window, as small boxes at the bottom right on a computer.
- **Fixed:** The Netflix extension now follows the language you are learning in Tamkeen. Switch languages in the web app and an open Netflix tab changes too, including the title playing; before, it could stay stuck on the language it had first, and a title watched before kept showing its old subtitles. *(web app)*
- **New:** Audio and Subtitles buttons on the Netflix extension's bar: choose any of Netflix's soundtracks or subtitles, or turn subtitles off. Tamkeen still picks the language you are learning when a title starts, but never switches back what you chose. The bar, the transcript and word lookups follow the subtitles you choose. *(web app)*
- **Improved:** If the Netflix extension was updated while a Tamkeen page was open, Tamkeen asks you to reload the page so your settings reach Netflix again. *(web app)*
- **Fixed:** Netflix's home page went dark below the top trailer with the extension (and in the computer's Netflix window): a trailer was taken for the title playing.
- **New:** The Netflix extension has its own privacy policy, linked from its install page, and is ready for the Chrome Web Store. Once it is listed there, the web app's Netflix section and the install page offer "Add to Chrome" instead of the steps for adding it by hand. *(web app)*
- **New:** A "back to the start of the sentence" button beside "back 5 seconds", in the player and the Netflix extension (key R). Pressed again right away, it goes one sentence further back.
- **Improved:** On a computer, the word popup's close button sits at the bottom right, beside Save.
- **New:** Look up several words together, such as an idiom or a set phrase. On a computer, press on a word and drag across the next words; on a phone, press and hold a word, then slide your finger across the others. The words light up as you go, and when you let go the popup explains them as one phrase in their sentence (and what they mean word by word when that is different). Word plays the whole phrase and Save keeps it as one card. Works in transcripts, captions, web pages, books, reels and the Netflix bar.
- **Improved:** Quick lookup's word popup keeps the Word and Sentence play buttons.
- **New:** Each friend's daily streak shows as a gold flame beside their name in Friends, 0 days included.
- **New:** Home shows your daily streak, a gold flame and the number of days in a row you met your flashcard goal, beside the greeting.
- **New:** Card voices. Flashcards without a recording of their own (typed in, or saved from a web page, a book, YouTube, Netflix or a reel) are read out: by your device's own voice (free), by natural Azure voices with your own Azure key (Arabic by country; each card's voice is made once and kept), or by voices made on your computer, which reach your phone when it syncs. Settings → Card voices.
- **Fixed:** Word and Sentence on words saved from a video no longer show "Couldn't load this word's audio" again and again; the card's voice says them instead.
- **Removed:** The Filmot "Find in a video" button, now that every card has a voice.
- **Improved:** Settings → Listening & transcripts is redesigned. It opens on two big choices for who writes your transcripts, and the "Another model…" option is gone.
- **New:** For Thai and Bisaya, Settings shows how accurate the language's own speech model is compared with the cloud model.
- **Improved:** Reading is easier: web pages and books share one standard text style, keep their bold, italics and headings, and show title pages neatly. Book pages are now full pages.
- **Improved:** With "Dictionary first", Tamkeen downloads the dictionary for your language if it's missing. The AI answers in the meantime and says so.
- **Improved:** The word-lookup combo now lasts your whole study session instead of running out after 30 seconds.
- **Improved:** In the word popup, the tag saying where a meaning came from now sits at the top right, beside the close button.
- **Fixed:** The Word button plays the whole word, with a little room either side, and no longer runs into most of the next word.
- **Improved:** Reels show bigger captions and no longer show the "Tap a word" hint.
- **Improved:** In the YouTube player, the "can be heard in … too" note fades away after 12 seconds.
- **Improved:** "What's new" in the web app opens a short list of the new features instead of the GitHub page *(web app)*.

## v0.35.0 — 2026-10-22

- **New:** You can now learn **German**, **Persian (Farsi)**, **Hindi** and **Korean**, and use the app itself in any of them. Each one comes with podcasts, YouTube, news sites, free books, common-word lists and a built-in dictionary.
- **New:** Netflix: watch Netflix shows with their subtitles as tappable words *(desktop app on Windows)*.
- **New:** Netflix in the web app through the "Tamkeen for Netflix" browser extension for Chrome and Edge *(web app)*.
- **New:** Put today's review in Google Calendar at a time you choose. This is now the default way to plan a review; Google Tasks and Onyx are still options.
- **Improved:** Changes now reach your other devices within seconds instead of minutes. Every version also has a refresh button in the top bar.
- **Improved:** Library → + → Web page opens a single screen: paste an address, choose from your saved sites (with "Add a site"), or pick a news site.
- **Improved:** Library → + → YouTube opens a menu of topics (news, music, comedy, cooking, travel and more), searched in the language you're learning.
- **Improved:** The round + button slides in smoothly after a swipe instead of jumping *(phones and web app)*.

## v0.34.2 — 2026-10-20

- **Fixed:** The web app renews its hourly Google connection by itself, so the pop-up and the stuck white page are gone *(web app)*.

*A one-fix release.*

## v0.34.1 — 2026-10-20

- **Improved:** One Google sign-in now covers both Drive sync and Friends *(web app)*.
- **Fixed:** Reels show the whole video above the words, held in place *(web app)*.

*A small release for the web app only.*

## v0.34.0 — 2026-10-20

- **New:** Chat notifications on every version, for every kind of message. Tap one to open the chat.
- **New:** Send anything in your Library to a friend (podcasts, videos, pages, books, reels), and its transcript goes with it.
- **New:** A flashcard streak (a flame) in the bar beside each friend's name. Tap any part of that bar to see what it means.
- **New:** Tick several languages you're learning in Settings. The ticked ones are what the top bar's language switch offers, on all your devices.
- **Changed:** Word meanings now come from the dictionary first, and from the AI only when the dictionary has no answer. This is the new default.
- **New:** Tap the tag in the word popup to change where meanings come from. If the AI fails, the popup offers "Use the dictionary instead".
- **New:** YouTube videos with no human-made subtitles in your language can use YouTube's automatic captions or its translation.
- **New:** A round teal "Import to Tamkeen" button in every in-app browser. On Android you can also share a page to the web app.
- **New:** The web app shows a short "Updated to version …" note the first time a new version opens *(web app)*.
- **Fixed:** The web app explains plainly when YouTube blocks a video *(web app)*.
- **Fixed:** The Library's "Queued" count updates as soon as you press Transcribe *(web app)*.

## v0.33.1 — 2026-10-20

- **New:** A short guide the first time you open Home. The guides for other pages skip their most obvious steps.
- **Fixed:** In seven languages the Home tab was mistranslated as "Beginning".

*A small follow-up release.*

## v0.33.0 — 2026-10-19

- **New:** A short guide the first time you open Library, Vocab or Friends. You can show the guides again from Settings.
- **New:** A third choice for word meanings, "Dictionary first, AI when it has nothing". The word popup also shows a tag saying where each meaning came from.
- **New:** Review timers: a time bar on each card, a clock for the whole session, and a steadier estimate of the time left.
- **New:** Every release now includes the iPhone app, and the iPhone's update popup explains how to install it with AltStore *(iPhone)*.
- **New:** A Thai speech model with half the mistakes of the standard one, and 2.6 times faster *(desktop app)*.
- **Changed:** Bisaya is now transcribed only on the computer, because cloud services can't do Bisaya. Settings explains why, and the phones tell you what to do.
- **Improved:** Spanish words are recognised in more forms: commands with pronouns attached, "vos" forms and rarer verbs.
- **Improved:** Fuller Bisaya dictionaries, so far fewer words come back with no meaning.
- **Improved:** All versions now do the same things: the iPhone catches up on many features, and every version has an About page and licences.
- **New:** Tamkeen's player can appear inside other apps, such as Onyx Calendar. Opening Tamkeen a second time brings the open window forward *(desktop app)*.
- **Improved:** The "reconnect Google" bar shows once per visit and then becomes a small button. The web app is always dark *(web app)*.
- **Fixed:** The computer's reel player treated every reel as Arabic. The iPhone's reel window no longer bounces.
- **Improved:** In the reel player, the XP readout stays inside the top line, and Save uses a line icon.

## v0.32.0 — 2026-10-18

- **New:** A Bisaya speech model, downloaded inside the app, writes much better Bisaya transcripts *(desktop app)*.
- **New:** A YouTube option to show only videos with human-made subtitles.
- **Fixed:** Words no longer slip onto the line before their own in transcripts *(desktop app)*.

## v0.31.0 — 2026-10-18

- **New:** Four more languages to learn, and to use the app in: Brazilian Portuguese, Catalan, Bisaya (Cebuano) and Thai.
- **New:** Thai words show a pronunciation guide above them, which you can turn off.
- **Improved:** Settings is redesigned: seven sections that each show their current setting, a search box, and "More options" for expert settings.
- **New:** A "Sign in with Google" button on the Friends screen.
- **Fixed:** The web app signs in on Google's own page instead of a blocked pop-up, and never opens Google's window without a tap. A "Reconnect Google" button renews the connection *(web app)*.
- **Improved:** Fixes found while trying out the new languages, such as better Bisaya speech recognition and better meanings for common Chinese characters.

## v0.30.0 — 2026-10-18

- **New:** Send today's review session as a to-do to Google Tasks or Onyx (choose which in Settings), with the estimated time it will take.

*A one-feature release.*

## v0.29.0 — 2026-10-18

- **New:** Books: a free shelf of about 90 famous public-domain books in every language, read one page at a time with tappable words.
- **New:** Upload your own books: EPUB, PDF, Kindle, Word and plain-text files.
- **Improved:** "No AI" Arabic meanings have a second dictionary (about 39,000 words, Standard and Egyptian) to fill gaps.
- **Improved:** A moving ring draws attention to the add-to-home-screen button *(web app)*.

## v0.28.0 — 2026-10-18

- **New:** A "No AI" choice: word meanings come from a built-in dictionary (Wiktionary) for all nine languages, so no AI key is needed.
- **New:** A Popular websites page where you paste an article's address to import it. It takes the place of the built-in browser *(web app)*.
- **New:** An add-to-home-screen button, with steps for iPhone, Android and computers *(web app)*.

## v0.27.0 — 2026-10-18

- **New:** A YouTube page inside the web app: popular videos, search and channel videos *(web app)*.
- **New:** Reels play in the web app, and public reels can be added from their link *(web app)*.
- **Fixed:** Trending podcasts work in the web app, and blocked outside requests are tried again *(web app)*.

*A web app–only release, the day after the web app first appeared.*

## v0.26.0 — 2026-10-18

- **New:** The **web app**: Tamkeen's phone screens as a website you can open in any browser.
- **New:** Every form of a word counts as one word in Spanish, French, Italian, Russian, English and Tagalog, as it already did in Arabic. For example, "ran" and "running" both count as "run".
- **New:** Japanese and Chinese: real words from dictionaries, readings (furigana and pinyin) above the words, and a choice of simplified or traditional characters.
- **New:** Arabic vowel marks: a "Show vowels" switch for transcripts, pages, reels and review cards. The computer adds the marks.
- **New:** Russian stress marks (with a switch), and US pronunciation for English words in the word popup.
- **Improved:** The reel player shows only the reel's video. On the phones, the words run along as one sliding line.
- **Improved:** The daily goal's "time left" estimate is more accurate, and shows a range while it's still uncertain.
- **Improved:** A misheard word now shows as one purple label in the word popup, which you can undo. The popup buttons use line icons.
- **Improved:** Newer screens are translated into the other interface languages.

## v0.25.1 — 2026-10-17

- **Fixed:** Reels on the phone no longer hang on one reel. Each reel has a time limit, and Stop works at once *(phones)*.
- **Improved:** The latest screens are translated into the 8 other interface languages.

## v0.25.0 — 2026-10-17

- **New:** A "Troubleshoot" button when an AI or transcription key fails. It lists the likely causes and what to do about each.
- **New:** A "Find in a video" button in the word popup on web pages.
- **New:** The Mnemonic maker has its own AI model and "thinking level" settings.
- **Improved:** Switching between Feed, Friends and Guilds on the Friends tab is instant.
- **Changed:** The two notes boxes are now called "Grammar notes" and "Personal notes".
- **Improved:** Rows that scroll sideways now show that there's more to see.
- **Improved:** Home and the Library use plain white line icons instead of emoji, and Reels comes before My videos and My audio.
- **Fixed:** Browser windows opened only for sign-in, YouTube or "Find in a video" no longer show the Import Page button.
- **Fixed:** Reels Instagram won't show (age-restricted, private or removed) are dealt with at once. Words no longer flash when a reel is retried, and an expired Instagram sign-in is noticed.

## v0.24.0 — 2026-10-17

- **Changed:** The creature's full habitat is back on Home, undoing the compact card from v0.23.0.
- **New:** Misheard words: the word lookup spots a word the transcript got wrong, shows the right one, and corrects the transcript (with Undo).
- **New:** A Mnemonic maker on the back of each review card: your AI suggests five words in your own language that sound like the word.
- **New:** A Paste button on the My notes box.
- **Improved:** Review cards use the app's purple and teal colours, and the answer buttons have white text.
- **Improved:** "Find in a video" looks for captions in the language you're learning.
- **Improved:** Anki card fronts never give away the word. A menu option moves cards into their own language's deck.
- **New:** Lists of the 1,000 most common words for Italian and Tagalog.
- **Improved:** On a phone, the player's Transcript button shows just its icon *(phones)*.

## v0.23.0 — 2026-10-16

- **Changed:** Home shows the creature as a compact card, with the full habitat on a page of its own. (Undone in v0.24.0.)
- **Improved:** The Friends tab is redesigned into Feed, Friends and Guilds sections, with tidy rows and round icon buttons.
- **Improved:** The Vocab page puts the Review block first. Word cards open with a tap, and everything else is in a ⋯ menu.
- **Improved:** The Library has one + button for every way of adding things, and a header row that stays at the top while you scroll.

## v0.22.0 — 2026-10-16

- **New:** The first **iPhone** version, installed with AltStore rather than the App Store. Until v0.33.0 it was built apart from the regular releases *(iPhone)*.
- **New:** Learn several languages: a switch in the top bar shows only the content and words for the language you pick.
- **New:** A separate Anki deck for each language, used by both the sync and the export.
- **New:** "Reset Tamkeen" starts the app again as if it were new, without deleting anything. Everything comes back when you sign in again.
- **New:** Other apps, such as Onyx Calendar, can open a YouTube video straight in Tamkeen's player *(desktop app and Android)*.
- **New:** An Updates section in the phone's Settings, with a "Check for updates" button *(Android)*.
- **Improved:** "Say it" plays the whole sentence, pauses for half a second, then plays your recording.
- **Improved:** Phone microphone settings changed so your recording isn't muffled when it plays back.
- **Improved:** Review cards are the same size whatever the word was saved from.
- **Improved:** "Find in a video" picks the top matching video by itself, and keeps a note of where the word was first found.

## v0.21.0 — 2026-10-14

- **New:** The app's screens in 9 languages: English, Spanish, Arabic, French, Japanese, Chinese, Russian, Italian and Tagalog.
- **New:** English, Italian and Tagalog are added as languages to learn.
- **New:** The number of cards left to review today appears on the app's icon. On the computer it's on the taskbar or Dock; on Android it's a silent notification and a home-screen widget.
- **New:** A daily goal bar under the review banner, with an estimate of the time left.
- **New:** A "Game features" switch in Settings turns the whole creature game off or on.
- **Fixed:** Switching the language you speak back to English works again.

## v0.20.0 — 2026-10-14

- **New:** "Update now": Tamkeen downloads and installs a new version by itself *(desktop app and Android)*.
- **Improved:** On the computer, the new version is checked, installed and reopened for you *(desktop app)*.
- **Improved:** On Android, the first update opens the "Install unknown apps" setting for Tamkeen, then Android's installer *(Android)*.

*A one-feature release.*

## v0.19.1 — 2026-10-14

- **Fixed:** "Say it" no longer plays your recording over the word's audio. It waits for the word to end, pauses for half a second, then plays your recording.
- **Fixed:** A tap just after "Say it" stops listening is no longer taken as Cancel.
- **Improved:** The "Not remembered" button has dark text, and the card's background moves a little faster.

## v0.19.0 — 2026-10-13

- **Improved:** The computer's Library is laid out like the phone's, and no longer flickers when you switch lists *(desktop app)*.
- **New:** AI keys you save on your phone or computer reach your other devices through sync.
- **Improved:** Your Instagram collections are shared between phone and computer.
- **Improved:** The word popup opens next to where you tapped, and a handle folds the transcript away.
- **Improved:** The YouTube window closes by itself once the video you tapped is playing in Tamkeen *(desktop app)*.
- **Improved:** The review answer buttons use the app's teal and purple.

*This version was one large combined update from several pieces of work, so these notes are reconstructed from its description.*

## v0.18.0 — 2026-10-13

- **New:** "Say it" on review cards: record yourself saying the word and compare it with the real audio.
- **New:** "Find in a video" for a word with no audio: it searches YouTube captions (through the Filmot website) and saves the video moment and sentence on the word.
- **New:** "Get random reels" in the language you're learning, with a counter for how many.
- **New:** Star a site in the web browser to keep it on the start page, on all your devices.
- **New:** A "Select all" button on the Vocab page.
- **New:** A "Find a friend" box on the Friends tab, and your own profile card can fold away.
- **Improved:** Saving a word no longer shows a message that covers the buttons. The Save button just says "Saved".
- **Fixed:** The front of a review card never shows the word being asked, even when the AI wrote it into the meaning. Battles get the same fix.

## v0.17.0 — 2026-10-13

- **New:** Send to a friend: a paper-airplane button in every player and in the web-page reader. Your friend accepts it into their library, and YouTube videos and reels arrive with their words ready.
- **New:** Items on a friend's "What I'm studying" card open in Tamkeen's own players. Reels and web pages can now go on the card too.
- **New:** "Delete selected" in the Library removes whole episodes, including podcast episodes, from every device.
- **New:** Follow a YouTube channel from its page in the app's browser. In the player, the Follow button now sits beside the title.
- **New:** A settings button beside "Export for Anki" opens the Anki settings.
- **Improved:** The play button and the 5-second skip buttons sit exactly in the middle of every player.
- **Fixed:** On the phone, every reel sent for cloud transcription failed with "Couldn't reach Groq" *(Android)*.
- **Fixed:** On the phone, YouTube links tapped inside the player open in the app, not the phone's browser *(Android)*.

## v0.16.0 — 2026-10-13

- **New:** Follow a YouTube channel from the player. Channels you follow are listed under YouTube in the Library and sync between devices.
- **New:** A quick/detailed switch on every player: quick shows just the meaning, and detailed shows the full explanation.
- **New:** The Library's Reels section lists your reels. Tick some and press "Watch these reels".
- **Improved:** The reel player shows new words in purple, and has a pause/keep-playing switch instead of a speed control.
- **Improved:** All your saved Instagram collections appear in a drop-down list, and the phone's Instagram sign-in window closes by itself.
- **Improved:** Words in web-page titles can be tapped too.
- **Improved:** Review cards are redesigned: plainer, the same size on both sides, with the answer large on the back. You can delete a word from its card.

## v0.15.0 — 2026-10-12

- **New:** Flashcards on the Vocab page. Saved words come back on a schedule timed to your memory, with two answers (Remembered / Not remembered) and a notes box. Your progress syncs.
- **New:** Two-way sync with an Anki deck, on the computer and with AnkiDroid on Android. It's off until you turn it on.
- **New:** Export for Anki works on the phone too, with audio, and carries each word's review progress into Anki.
- **New:** Cloud transcription with your own Groq or OpenAI key, for computers that can't run the large speech model. With it, the phone can transcribe by itself.
- **New:** Flashcards earn their own creature-game rewards, separate from battles, and doing both in a day pays a bonus.
- **Fixed:** The audio copies used for syncing, broken since v0.11.0, work again.

## v0.14.0 — 2026-10-12

- **New:** Reels from your own Instagram saves: all of them, or one collection.
- **New:** Reels Instagram won't play in the app are kept and played from their own page instead *(Android)*.
- **New:** Open YouTube starts on what's popular in the language you're learning, with a choice of country.
- **Improved:** A podcast added on the phone lists its episodes straight away *(Android)*.
- **New:** The AI explanation shows how much it used, and key errors give clearer messages and help.
- **Improved:** Phone layouts for the YouTube and reel players, small word-popup changes, and creature-game rule and help-text changes.

## v0.13.0 — 2026-10-12

- **New:** Instagram reels: the computer finds popular reels in your language and turns their speech into words. The phone plays them one after another, with the words and the word popup underneath.
- **Changed:** The YouTube link box is replaced with "Open YouTube": tap a video in the app's browser and it plays in Tamkeen's player.
- **Changed:** "Add video" and "Add audio" are renamed "Add video file" and "Add audio file".
- **Improved:** Trending podcasts now come from Apple's charts, with no key needed.
- **New:** The web browser has a start page.
- **Improved:** The phone's Library shows rows of content types and podcasts, and the whole page scrolls *(Android)*.
- **Improved:** A slimmer YouTube player on the phone *(Android)*.
- **Fixed:** Leaving a page while it was still loading no longer puts an error on the next page.

*This version was one large combined update from several pieces of work, so these notes are reconstructed from its description.*

## v0.12.0 — 2026-10-11

- **New:** Words you've never tapped show in purple. Tapping or saving one form of a word marks all its forms as seen (Arabic is matched by dictionary form).
- **New:** "Mark as seen" and "Mark as new" in the right-click / long-press menu.
- **New:** Add a YouTube video by its link: its captions become the transcript, and they're tappable as it plays.
- **New:** Trending podcasts in the language you're learning, on a Discover page.
- **New:** First-run questions (your language, your level, an AI key), with step-by-step help for getting a key. If you've already started learning, the 1,000 most common words count as seen.
- **Improved:** Cheaper default AI models.
- **New:** Beside each friend's name: the language they're learning, their league, today's XP and a favourite creature.
- **New:** Tap anything in the habitat's bar for an explanation. Petting your creature shows one of your saved words.
- **Changed:** Player levels in the creature game cost ten times as much XP.
- **Fixed:** The numbers in the XP popup now add up.

## v0.11.0 — 2026-10-11

- **New:** The creature game: an egg on Home hatches and grows as you study. Looking up words, saving words, study time and reaching your daily goal all earn XP.
- **New:** A shop of wearables (113 items, including hats, glasses and shirts) and decorations for the habitat. Game progress syncs between devices.
- **New:** Battles built from your own saved words (from 100 saved words), a team of creatures, evolution you choose, and badges.
- **New:** Play with friends: challenge a friend's team, climb a league, raid a weekly boss with your guild, and send gifts.
- **New:** The garden: buildings that produce while you're away, food and hearts for your creatures, and releasing a grown creature to start the garden again.
- **New:** "Export for Anki" makes a ready-to-import Anki deck with each word's audio, in a new card design.
- **New:** An Anki add-on, so reviews in Anki on the same computer count in the creature game *(desktop app)*.
- **New:** Add audio: upload your own audio files, the same way as videos.
- **Improved:** Hand-drawn pixel art for the creatures, wearables and icons. The phone's tab bar uses the app's own line icons instead of emoji.

## v0.10.0 — 2026-10-10

- **New:** Six languages to learn instead of Arabic only: Spanish, Arabic, French, Japanese, Chinese and Russian. You choose on first run or in Settings.
- **Improved:** The language you choose sets what the speech recognition listens for, what the AI teacher explains, and the text's direction and font.
- **Improved:** Existing Arabic libraries are unchanged, and one library can mix languages. Japanese and Chinese are split into real words.

## v0.9.0 — 2026-10-09

- **New:** Guilds: create one with a name and tag, invite friends, and join as many as you like.
- **New:** Profile photos, and an online/offline dot beside names (only friends can see it).
- **New:** Swipe left or right to move between sections *(Android)*.
- **New:** Web pages have their own text size, smaller by default.
- **New:** A popup tells you when a new version is available.
- **Fixed:** Search: it has its own box (the phone had nowhere to type), the computer's header no longer pushes it off-screen, and a result inside a web page opens at that paragraph.

## v0.8.0 — 2026-10-09

- **Changed:** The app is renamed **Tamkeen**, with new icons and a new look. It updates over the old version without losing anything.
- **New:** A Home screen with one main button, Continue, to pick up where you left off.
- **New:** Import a web page and read it with every word tappable.
- **New:** A web browser inside the app, with an Import Page button.
- **Improved:** Words sent to a friend bring a short audio clip of their sentence.
- **New:** A light vibration when you tap or save a word (optional), and a small celebration when a word is saved *(Android)*.

## v0.7.0 — 2026-10-09

- **New:** Chat with friends: text messages and voice notes of up to 2 minutes, with unread counts.
- **New:** Share saved words, or a whole folder, with a friend. They add them with one tap.
- **New:** A "What I'm studying" card on your profile: up to three items, each a podcast episode or a YouTube, Spotify, Apple Music or IMDb link.
- **New:** Messages disappear once they're seen, played or added, or after 30 days unopened.

## v0.6.0 — 2026-10-09

- **New:** An optional online account: connect with Google and pick a username.
- **New:** A Friends tab: add friends by username, accept or decline requests, and see changes live.
- **New:** A badge on the Friends tab counts friend requests.

## v0.5.0 — 2026-10-09

- **New:** My videos: upload your own video files. They're kept in your Google Drive, transcribed on the computer, and can be deleted everywhere at once.
- **New:** A video player with tappable captions over the video and a transcript panel that slides in.
- **New:** Vocab folders (a word can be in several), sorting, date filters, and adding or removing many words at once.
- **Improved:** Exports include exactly the words on screen.
- **Improved:** "Refresh & sync" pulls from Drive at once, so requests made on the phone show up straight away.

## v0.4.0 — 2026-10-08

- **New:** The **Android** app, with the same player and word explanations, plus Drive sync and Google sign-in on the phone *(Android)*.
- **New:** The computer fetches podcasts that were added on another device *(desktop app)*.
- **New:** The Android app is installed from a file attached to each release *(Android)*.

*This was the first release tried on a real phone.*

## v0.3.0 — 2026-10-07

- **New:** Google Drive sync: podcasts, transcripts, saved words and explanations are kept in a private folder in your own Google Drive, so your computers share one library.
- **New:** Each transcribed episode gets a small audio copy, so other devices play exactly the audio that was transcribed.
- **New:** Other devices can ask for an episode to be transcribed, and the computer picks the request up.
- **New:** A home page and privacy policy on the web.

## v0.2.0 — 2026-10-07

- **New:** Tap a word to hear just that word, pause, and see an explanation from an AI, using your own Claude, Gemini, OpenAI or Grok key. The AI reads the surrounding sentences for context.
- **Improved:** Explanations are remembered, so the same word isn't asked twice.
- **Improved:** Your AI key stays on your computer and is left out of backups.
- **Improved:** The player fits narrow windows, with the explanation rising from the bottom.

## v0.1.0 — 2026-10-06

- **New:** The first release, as **Arabic Podcast Studio**, for Windows, Mac and Linux.
- **New:** Follow podcasts, and have episodes turned into text on your own computer, with every word timed to the audio. Settings helps you pick a speech model that suits your computer.
- **New:** A player that highlights each word as it's spoken, scrolls the right-to-left text along, slows playback down and loops a sentence.
- **New:** Save words and phrases from a transcript (right-click or long-press) to a vocab list, then export it as a spreadsheet or a file Anki can import.
- **New:** Search through all transcripts, ignoring Arabic vowel marks.

*This release has only a one-line description in the project history. These notes come from the files in the first version and the earliest project notes.*
