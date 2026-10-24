# Chrome Web Store listing: Tamkeen for Netflix

Everything to paste into the Chrome Web Store developer dashboard, field by field.
`HOW-TO-PUBLISH.md` (same folder) says where each part goes.

Keep this file true to the code. If the extension starts doing something new with data, update this
file, `extension/privacy.html` and the dashboard's Privacy practices tab together.

---

## Store listing tab

### Name

Taken from the extension itself (manifest.json), so there is nothing to type:

```
Tamkeen for Netflix
```

(Since 2026-10-23 it works on Spotify's web player too. The name is the owner's choice; if it changes,
change `name` in extension/manifest.json, the install page's title and heading, and the privacy
page's. A name with no other company's brand in it, such as "Tamkeen: clickable subtitles and
lyrics", also takes away the trademark risk described in HOW-TO-PUBLISH.md; one with two brands in it
doubles it.)

### Summary (short description, 132 characters at most)

Also taken from manifest.json (125 characters):

```
Learn a language with Netflix and Spotify: subtitles and song lyrics in the language you're learning, as words you can click.
```

### Description

Paste everything between the lines.

---

```
Tamkeen for Netflix turns the subtitles of what you watch, and the lyrics of what you listen to, into a language lesson.

Pick a film or series on Netflix with subtitles in the language you're learning. Tamkeen shows those subtitles in a bar under the video, as words you can click, and the whole transcript in a sidebar beside it.

Play a song on Spotify's web player. Tamkeen's lyrics panel beside it shows the song's lyrics karaoke-style: the line being sung big and in the middle, following the song, and every word can be clicked.

WHAT YOU CAN DO
• Click any word to see what it means in that sentence or lyric line, then save it to your vocabulary list.
• Follow the transcript or the lyrics: the current line is highlighted, and clicking a line jumps there.
• Replay: back 5 seconds, back to the start of the sentence or line, slower or faster playback on Netflix.
• Choose quick meanings, or detailed explanations with grammar and the word's dictionary form.
• Fold the sidebar or the lyrics panel away when you just want to watch or listen.

HOW WORDS ARE EXPLAINED
• A free dictionary for your language, downloaded once and kept in your browser.
• Or, if you prefer, an AI explanation from Claude, Gemini, ChatGPT or Grok, using your own API key. You choose which in Tamkeen's settings.

REQUIRES THE FREE TAMKEEN WEB APP
This extension works together with Tamkeen, a free language-learning app that runs in your browser (christiangilkey.github.io/tamkeen/app). Open it once after installing: it tells the extension which language you're learning and how to explain words. The words you save and the titles you watch then appear in your Tamkeen library and vocabulary list, where you can review them as flashcards.

LANGUAGES
17 languages to learn, including Arabic, Spanish, French, German, Japanese, Korean and Chinese. The app itself is available in English and 16 other languages.

GOOD TO KNOW
• You need your own Netflix subscription. The video plays in Netflix's own player; the extension never sees your Netflix password.
• For songs you need your own Spotify account (free or Premium) on Spotify's web player. The music plays in Spotify's own player; the extension never sees your password and never records any sound.
• Song lyrics come from LRCLIB, a free, open collection of lyrics with line timings. When it has none, Tamkeen can use the lyrics Spotify shows in its own lyrics view.
• Works in Chrome and Edge on a computer.
• A title needs subtitles in the language you're learning; Tamkeen tells you when it has none. A song in another language Tamkeen teaches can be looked up in that language with one click.
• To show the subtitles you're learning, Tamkeen switches the subtitle language in Netflix's player. Netflix remembers that choice for your profile, and you can change it back in Netflix's subtitle menu.

PRIVACY
No ads, no analytics, no tracking. Your settings, dictionaries and saved words stay in your browser and your own Tamkeen library; a song's lyrics are never kept there, only the line of a word you save. Nothing is sent to the developer. Privacy policy: https://christiangilkey.github.io/tamkeen/extension/privacy.html

Tamkeen is an independent, open-source project. It is not affiliated with, endorsed or sponsored by Netflix or Spotify. Netflix is a trademark of Netflix, Inc. Spotify is a trademark of Spotify AB.
```

---

### Category

```
Education
```

### Language

```
English
```

### Graphic assets (in `extension/store/images/`)

| Dashboard field | File | Size |
|---|---|---|
| Store icon | `store-icon-128.png` | 128 × 128 (96 × 96 artwork, 16 px transparent edge) |
| Screenshots (up to 5, in this order) | `screenshot-1.png` … `screenshot-5.png` | 1280 × 800 each |
| Small promo tile | `promo-small-440x280.png` | 440 × 280 |
| Marquee promo tile | (leave empty: optional, only used if Google features the extension) | 1400 × 560 |
| Global promo video | (leave empty) | |

What the screenshots show (real screenshots of the extension, taken with a stand-in page and an
original sample video, so no Netflix pictures or logo appear):

1. The subtitle bar under the video and the transcript beside it.
2. A clicked word: its meaning, just above the bar (the video gets shorter, not covered).
3. A word clicked in the transcript: its meaning in the sidebar.
4. The Tamkeen web app's vocabulary list with the word saved while watching.
5. The sidebar folded away: the video at full width, the bar below.

### Additional fields

- **Official URL:** leave as "None" (it needs a verified site in Google Search Console; not needed).
- **Homepage URL:** `https://christiangilkey.github.io/tamkeen/extension/`
- **Support URL:** `https://github.com/christiangilkey/tamkeen/issues`
- **Mature content:** No.

---

## Privacy practices tab

### Single purpose (paste)

```
Tamkeen for Netflix has one purpose: to help people learn a language from the films, series and songs they watch and listen to, by showing the words being heard as clickable words with their meanings. On a Netflix watch page it shows the subtitles in the language being learned in a bar under the video and a transcript beside it; on Spotify's web player it shows the lyrics of the song playing in a panel beside it, following the song. It explains a clicked word, and controls the player (play, pause, jump back, jump to a line) from Tamkeen's own buttons. Words the learner saves are passed to the learner's own Tamkeen web app.
```

### Permission justifications (paste one into each box)

**storage**

```
Keeps, in the user's browser only: the settings the Tamkeen web app hands over (language being learned, how words are explained, the user's own AI key if they added one), the words the user saves and the titles they watch until the Tamkeen web app takes them, the subtitle files caught in an open Netflix tab, and, for a few hours in session storage, the lyrics found for songs played lately so they aren't asked for again.
```

**unlimitedStorage**

```
The free dictionary for the language being learned is downloaded once and kept in the extension's storage (3 to 20 MB depending on the language), together with the transcripts of titles already watched. Without this permission the browser may delete the dictionary to free space, and it would have to be downloaded again.
```

**webRequest**

```
Used only to notice when Netflix's own player downloads a subtitle file from Netflix's video servers (*.nflxvideo.net) in a Netflix tab. The extension then fetches that same file again (without cookies) to show its lines as clickable words. Netflix's list of subtitle files inside the page is encrypted, so this is the only way to get them. It is a read-only listener (no blocking, no changes to any request), limited to *.nflxvideo.net, and nothing else about requests is read or stored.
```

**Host permissions** (`https://www.netflix.com/*`, `https://*.nflxvideo.net/*`, `https://lrclib.net/*`, and the content scripts on `https://open.spotify.com/*` and `https://christiangilkey.github.io/tamkeen/app/*`)

```
www.netflix.com: to show the subtitle bar and transcript on Netflix watch pages, to hide Netflix's own subtitles while Tamkeen's are shown, to control the player when the user presses Tamkeen's buttons, to choose the subtitle track in the language being learned, and to ask Netflix's site for the name of the title being watched.
*.nflxvideo.net: Netflix serves subtitle files from these hosts; the extension fetches the subtitle file Netflix's player has just downloaded so it can show its lines (see webRequest).
open.spotify.com (content script only): to show the lyrics panel beside Spotify's web player, to read which song is playing and where in it (to follow the lyrics), and to press Spotify's own play button and progress bar when the user presses Tamkeen's buttons. When Spotify's own lyrics view is open and LRCLIB has no timed lyrics, it reads the lines shown there.
lrclib.net: LRCLIB, a free, open lyrics database. The extension asks it for the lyrics of the song playing on Spotify, by the song's title, artist, album and length. Nothing about the user is sent.
christiangilkey.github.io/tamkeen/app/: the extension's companion, the free Tamkeen web app. A small content script there passes settings from the web app to the extension and saved words back, through messages on that page only. No other website is accessed.
```

### Remote code

Select: **No, I am not using remote code.**

(All scripts are inside the package. The extension downloads only data: dictionary files from
christiangilkey.github.io, Netflix's subtitle files and song lyrics (text) from lrclib.net. It never runs
downloaded code, and uses no eval.)

### Data usage: "What user data do you plan to collect from users now or in the future?"

Tick exactly these four. Leave the others unticked.

| Data type | Tick? | Why |
|---|---|---|
| Personally identifiable information | No | The extension never receives a name, email address or account ID. |
| Health information | No | |
| Financial and payment information | No | |
| **Authentication information** | **Yes** | The user's own AI provider key (from the Tamkeen web app), kept in the browser and sent only to that provider. |
| Personal communications | No | |
| Location | No | |
| **Web history** | **Yes** | The Netflix titles the user watches (title number, name, time) are kept until the user's Tamkeen web app takes them into the library. The song playing on Spotify (title, artist, album, length) is sent to LRCLIB to find its lyrics. |
| **User activity** | **Yes** | Network monitoring limited to noticing Netflix's subtitle downloads in Netflix tabs (webRequest); where the song is on Spotify (to follow its lyrics); clicks on words in Tamkeen's own bar and panel. |
| **Website content** | **Yes** | The subtitles' text; the lyrics Spotify shows in its own lyrics view (only when LRCLIB has none); and the sentence or lyric line around a clicked word, sent to the user's chosen AI provider. |

(The store counts data as "collected" even when it stays on the user's computer, so this is the
honest answer. Ticking these boxes does not make review stricter by itself; a mismatch between these
boxes, the privacy policy and what the code does is what gets extensions rejected.)

### Certifications (tick all three)

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

(The "approved use cases" include sending data to a service the user chose for the feature, which
is what happens with the user's own AI key.)

### Privacy policy URL

```
https://christiangilkey.github.io/tamkeen/extension/privacy.html
```

---

## Distribution tab

- **Payments:** Free of charge.
- **Visibility:** Public (anyone can find it by searching the store). Unlisted would hide it from
  search; only people with the link could install it.
- **Distribution regions:** All regions.

## Test instructions for the reviewer (if the dashboard offers a box for them)

```
The extension works only on Netflix watch pages, which need a Netflix subscription; I cannot provide a Netflix account. To see it work:
1. After installing, a tab opens on the free Tamkeen web app (https://christiangilkey.github.io/tamkeen/app/). No account is needed: pick a language to learn (for example Spanish), then close or keep the tab. This hands the extension its settings.
2. Open any Netflix title that has subtitles in that language and press play. Tamkeen's subtitle bar appears under the video and the transcript beside it. Click a word to see its meaning (the first time, it offers to download the free dictionary for that language).
3. Click Save on a word, then open the Tamkeen web app again: the word appears in its Vocab tab.
Without a Netflix subscription, the toolbar button and step 1 can still be checked.
Spotify (a free Spotify account is enough): open https://open.spotify.com/, sign in and play a well-known song in the language chosen in step 1 (for example "Despacito" by Luis Fonsi for Spanish). Tamkeen's lyrics panel at the right shows its lyrics, the line being sung big and in the middle; click a word to see its meaning, and Save it as in step 3.
```

---

## What the listing should and should not say

Should:

- Say plainly that it needs a Netflix subscription (and, for songs, a Spotify account) and the free
  Tamkeen web app.
- Describe what it does to Netflix's page: it switches the subtitle language (Netflix remembers it)
  and shows Tamkeen's own subtitle bar instead of Netflix's subtitles; and to Spotify's: it narrows
  the page to make room for its lyrics panel.
- Say where song lyrics come from (LRCLIB) and that they aren't kept.
- Say "not affiliated with Netflix or Spotify".

Should not:

- Use Netflix's logo, red "N", fonts, colours or show posters or stills from Netflix titles, in the
  icon, the promo tile or the screenshots. (Ours show an original sample video.) The same for
  Spotify: no green circle logo, no album covers, no real song lyrics in screenshots (the test page's
  lyrics are written for it: `extension/test/fake-spotify.mjs`).
- Suggest Netflix or Spotify made, endorses or partners with it ("official", "Netflix's language tool").
- Promise downloading, saving or exporting subtitles, lyrics, songs or videos, or watching or
  listening without an account, or getting around region limits or ads. (The extension does none of
  these; subtitles are kept only in the user's own library, lyrics not at all.)
- List services it doesn't work with, or pile up keywords ("learn Spanish Netflix, learn French
  Netflix, Netflix subtitles, Spotify lyrics translator, …"); one natural mention of a few
  languages is enough.
- Name competitors (Language Reactor and others).
- Claim it works on phones, tablets, TVs or in Firefox (not through this store).
