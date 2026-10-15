# Tamkeen (تمكين): current state of the app

Paste this into a new Claude conversation to give it the context it needs to discuss or prototype new
concepts for the app. It describes what exists as of version 0.9.0 (10 October 2026).

## How to work with the owner

- The owner is not a programmer. Explain every command, code snippet or technical term in a sentence of
  plain English.
- They decide product behaviour; ask before anything outward-facing (publishing a release, creating cloud
  credentials, changing accounts).
- They usually test on their Android phone and a Windows 11 desktop.

## What Tamkeen is

An app for learning a language from real material (Spanish, Arabic, French, Japanese, Chinese or Russian; the user picks one on first run and can change it in Settings). You bring podcasts, your own videos and web pages; the app
turns them into text where every word can be tapped to hear it, see what it means in that sentence, and save
it as vocabulary. A social layer lets friends study together. It was first called "Arabic Podcast Studio";
some internal names still say so.

- Platforms: desktop (Windows, macOS, Linux) and Android. Same screens on both.
- Open source: github.com/christiangilkey/tamkeen. Website and privacy policy:
  christiangilkey.github.io/tamkeen.
- No subscription and no server run by the owner for the core features. Users bring their own AI key.

## What a user can do today

**Library**
- Subscribe to podcasts by RSS feed. The desktop transcribes episodes on the user's own computer with
  Whisper (speech-to-text), with a time for every word.
- Add your own video files ("My videos"). They are stored in the user's Google Drive, transcribed on the
  desktop, and streamed on both devices.
- Import web pages ("My webpages") by pasting an address, or from an in-app web browser with an "Import
  Page" button. Only the readable text is kept (headings, paragraphs, lists).
- Trending podcasts in the language being studied, sorted by category, each added with one press. The list
  is Apple's public podcast charts for a few countries where the language is spoken (no account or key).
- Instagram reels (built 2026-10-12, not yet released, never run on a real phone): on the computer, "Get 10 reels"
  finds popular short videos in the language being studied (comedy first; popular now, the user's own creators,
  or a mix), listens to each with Whisper and keeps only its address and its words. On the phone they play one
  after another from Instagram's embed page, with a bar below: words on the left, the word popup on the right.
- Watch a YouTube video: "Open YouTube" shows YouTube in the app's browser and tapping a video opens it in the
  app's player (built 2026-10-11, not yet released). It plays in YouTube's own
  embedded player; its captions (hand-written preferred, else automatic) become the clickable transcript,
  shown below the video. A video without captions can't be added.

**Studying**
- Player: the transcript scrolls in the language's direction (right-to-left for Arabic) with the current word highlighted; slow playback; loop a
  sentence. Videos show tappable captions over the picture and a transcript panel.
- Reader (web pages): the same clickable text without audio.
- Tap a word: it plays just that word, pauses, and shows a definition bubble written by an AI model using the
  whole sentence for context (meaning, reading, dictionary form, grammar, usage note; the fields adapt to the language). The user supplies their
  own key for Claude, Gemini, OpenAI or Grok.
- Vocab: saved words with their sentence, meaning, notes and audio. Folders (a word can be in several), sort
  and date filters, bulk actions, export to Anki or CSV.
- Vocab reviewer (built, not yet merged or released): flashcards on the Vocab page scheduled by FSRS, the
  memory model Anki uses. Two answers, Remembered / Not remembered; front = the meaning and the translated
  sentence, back = the word as the Vocab page shows it plus the learner's own notes. Answers sync between
  devices and travel into the Anki deck as real scheduling and review history.
- Search across every transcript and page (for Arabic, ignoring diacritics and spelling variants).
- Home screen: one main action, "Continue". A podcast or video is offered while more than 3 minutes remain; a
  web page while less than 70% has been read. Otherwise it says "You're all caught up" and offers three choices.

**Social (optional, needs "Connect with Google")**
- A username, friends by username, friend requests.
- Chat with each friend: text and voice notes. Messages disappear after they are seen, voice notes after they
  are played (Snapchat style).
- Send vocab words or a whole folder to a friend; each word carries a short audio clip of its sentence.
- "What I'm studying" card on the Friends tab: up to three items (a podcast episode, or a YouTube, Spotify,
  Apple Music or IMDb link shown with title and picture) plus a short note. Friends only.
- Guilds: named groups with a short tag shown beside usernames. Any number per person, any member can invite
  their own friends, the founder can rename it and remove members. Guild-mates see each other's cards and can
  message each other.
- Profile photos and an online/offline dot.

## How it is built

- **Desktop**: a Python program (FastAPI) runs a small local server and shows the interface in its own window
  (pywebview). Data is a SQLite database in the user's app-data folder.
- **Interface**: plain JavaScript modules, HTML and CSS. No framework and no build step on the desktop.
- **Android**: the same interface files inside a Capacitor shell. A JavaScript "stand-in server" answers the
  same requests from on-phone storage (IndexedDB). The phone cannot transcribe; it asks the desktop to.
- **Sync between a user's own devices**: a private hidden folder in the user's own Google Drive. Records
  merge one by one (newest change wins; deletions are remembered so they spread).
- **Social features**: a Supabase project (Postgres database, file storage, live updates). Sign-in reuses the
  user's Google identity. Privacy is enforced by row-level security rules in the database, which have
  self-cleaning tests.
- **One idea reused everywhere**: anything studied is an "episode" whose text is a "transcript" (segments and
  words). Podcasts, videos and web pages all use it, so tap-to-define, vocab, search and sync work for all
  three without special cases. A new kind of content is cheapest to add if it fits this shape.

- **Languages**: one table (`web/js/languages.js`, mirrored by `app/languages.py`) holds everything that
  differs per language. Each episode records the language it was transcribed or imported in, so a library can
  mix languages. Japanese and Chinese are split into words on the device (Intl.Segmenter).

## Design language

- Identity from the logo: plum-to-teal gradient (header, Home), teal for actions, gold for highlights and
  rewards, red only on counts of things waiting for the user. Rounded shapes.
- Principles the owner adopted from a UX research document: one obvious main action per screen, main action
  in thumb reach, labelled bottom tabs (Home, Library, Vocab, Friends, Settings), at most three choices on a
  decision screen, instant feedback on every press, a clear finish line instead of an endless feed, no guilt
  or streak pressure.
- The owner chose to apply those principles only. The same document described creatures, eggs, battles and a
  shop; none of that exists and it was explicitly declined for now.
- Phone: swipe left and right between sections; the tab highlight slides with the finger.

## Constraints worth knowing before proposing something

- Transcription only happens on a desktop computer. The phone depends on it.
- AI features use the individual user's own API key, so they cost that user money per use and do nothing
  without a key.
- The owner dropped YouTube downloading on purpose (terms-of-service risk). YouTube videos are only ever
  played through YouTube's official embedded player, and nothing may be drawn on top of that player; just the
  caption text is fetched (from the user's own device, by an unofficial route that YouTube may change).
- Private data (library, transcripts, vocab, keys) stays on the user's devices and their own Drive. Only what
  the social features need goes to Supabase, and the privacy policy says exactly what.
- Supabase is on the free tier (1 GB file storage, pauses after a week without activity). Messages are
  temporary partly to save storage.
- Releases are built by GitHub when a version tag is pushed (installers for three desktop systems and a signed
  Android APK). The app shows a popup when a newer release exists.
- Installers are not code-signed, so Windows shows a warning on install.

## Planned but not built

- Shared vocab folders that stay in sync between several people (the database tables exist; there is no
  screen for them yet).
- A Kahoot-style multiple-choice quiz on a vocab folder: solo practice and live games with friends, with the
  wrong answers written by AI using the host's key, and generated questions saved for reuse. A table for game
  invitations exists; nothing else does.

## Built but never confirmed on real devices or between real people

Most of this was verified only with automated tests, a browser preview, or the owner's single account:
video streaming on the phone, the phone's in-app browser and page import, voice-note recording, messages
disappearing between two real accounts, audio clips arriving with shared words, guilds between real people,
photo upload from a real file picker, swipe with a real finger, and the installer's cleanup of old shortcuts.

## Useful to say when proposing a new concept

- Who does it serve: a learner alone, or learners together?
- What is the one main action, and where is the finish line?
- Does it fit "episode + transcript + vocab word", or does it need a new kind of data?
- Does it need the desktop, an AI key, or the online service? Each adds a dependency for the user.
- What would be stored, and where: on the device, in the user's Drive, or in Supabase (which needs a privacy
  rule and a line in the privacy policy)?
