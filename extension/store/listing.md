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

### Summary (short description, 132 characters at most)

Also taken from manifest.json (129 characters):

```
Learn a language with Netflix: Tamkeen's subtitle bar shows the subtitles in the language you're learning as words you can click.
```

### Description

Paste everything between the lines.

---

```
Tamkeen for Netflix turns the subtitles of what you watch into a language lesson.

Pick a film or series on Netflix with subtitles in the language you're learning. Tamkeen shows those subtitles in a bar under the video, as words you can click, and the whole transcript in a sidebar beside it.

WHAT YOU CAN DO
• Click any word to see what it means in that sentence, then save it to your vocabulary list.
• Follow the transcript: the current line is highlighted, and clicking a line jumps the video there.
• Replay: back or ahead 5 seconds, back to the start of the sentence, slower or faster playback.
• Choose quick meanings, or detailed explanations with grammar and the word's dictionary form.
• Fold the sidebar away when you just want to watch.

HOW WORDS ARE EXPLAINED
• A free dictionary for your language, downloaded once and kept in your browser.
• Or, if you prefer, an AI explanation from Claude, Gemini, ChatGPT or Grok, using your own API key. You choose which in Tamkeen's settings.

REQUIRES THE FREE TAMKEEN WEB APP
This extension works together with Tamkeen, a free language-learning app that runs in your browser (christiangilkey.github.io/tamkeen/app). Open it once after installing: it tells the extension which language you're learning and how to explain words. The words you save and the titles you watch then appear in your Tamkeen library and vocabulary list, where you can review them as flashcards.

LANGUAGES
17 languages to learn, including Arabic, Spanish, French, German, Japanese, Korean and Chinese. The app itself is available in English and 16 other languages.

GOOD TO KNOW
• You need your own Netflix subscription. The video plays in Netflix's own player; the extension never sees your Netflix password.
• Works in Chrome and Edge on a computer.
• A title needs subtitles in the language you're learning; Tamkeen tells you when it has none.
• To show the subtitles you're learning, Tamkeen switches the subtitle language in Netflix's player. Netflix remembers that choice for your profile, and you can change it back in Netflix's subtitle menu.

PRIVACY
No ads, no analytics, no tracking. Your settings, dictionaries and saved words stay in your browser and your own Tamkeen library. Nothing is sent to the developer. Privacy policy: https://christiangilkey.github.io/tamkeen/extension/privacy.html

Tamkeen is an independent, open-source project. It is not affiliated with, endorsed or sponsored by Netflix. Netflix is a trademark of Netflix, Inc.
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
Tamkeen for Netflix has one purpose: to help people learn a language while watching Netflix. On a Netflix watch page it shows the subtitles in the language being learned as clickable words, in a bar under the video and a transcript beside it, explains a clicked word, and controls Netflix's player (play, pause, jump to a line, speed) from that bar. Words the learner saves are passed to the learner's own Tamkeen web app.
```

### Permission justifications (paste one into each box)

**storage**

```
Keeps, in the user's browser only: the settings the Tamkeen web app hands over (language being learned, how words are explained, the user's own AI key if they added one), the words the user saves and the titles they watch until the Tamkeen web app takes them, and the subtitle files caught in an open Netflix tab.
```

**unlimitedStorage**

```
The free dictionary for the language being learned is downloaded once and kept in the extension's storage (3 to 20 MB depending on the language), together with the transcripts of titles already watched. Without this permission the browser may delete the dictionary to free space, and it would have to be downloaded again.
```

**webRequest**

```
Used only to notice when Netflix's own player downloads a subtitle file from Netflix's video servers (*.nflxvideo.net) in a Netflix tab. The extension then fetches that same file again (without cookies) to show its lines as clickable words. Netflix's list of subtitle files inside the page is encrypted, so this is the only way to get them. It is a read-only listener (no blocking, no changes to any request), limited to *.nflxvideo.net, and nothing else about requests is read or stored.
```

**Host permissions** (`https://www.netflix.com/*`, `https://*.nflxvideo.net/*`, and the content script on `https://christiangilkey.github.io/tamkeen/app/*`)

```
www.netflix.com: to show the subtitle bar and transcript on Netflix watch pages, to hide Netflix's own subtitles while Tamkeen's are shown, to control the player when the user presses Tamkeen's buttons, to choose the subtitle track in the language being learned, and to ask Netflix's site for the name of the title being watched.
*.nflxvideo.net: Netflix serves subtitle files from these hosts; the extension fetches the subtitle file Netflix's player has just downloaded so it can show its lines (see webRequest).
christiangilkey.github.io/tamkeen/app/: the extension's companion, the free Tamkeen web app. A small content script there passes settings from the web app to the extension and saved words back, through messages on that page only. No other website is accessed.
```

### Remote code

Select: **No, I am not using remote code.**

(All scripts are inside the package. The extension downloads only data: dictionary files from
christiangilkey.github.io and Netflix's subtitle files. It never runs downloaded code, and uses no eval.)

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
| **Web history** | **Yes** | The Netflix titles the user watches (title number, name, time) are kept until the user's Tamkeen web app takes them into the library. |
| **User activity** | **Yes** | Network monitoring limited to noticing Netflix's subtitle downloads in Netflix tabs (webRequest); clicks on words in Tamkeen's own bar. |
| **Website content** | **Yes** | The subtitles' text, and the sentence around a clicked word sent to the user's chosen AI provider. |

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
```

---

## What the listing should and should not say

Should:

- Say plainly that it needs a Netflix subscription and the free Tamkeen web app.
- Describe what it does to Netflix's page: it switches the subtitle language (Netflix remembers it)
  and shows Tamkeen's own subtitle bar instead of Netflix's subtitles.
- Say "not affiliated with Netflix".

Should not:

- Use Netflix's logo, red "N", fonts, colours or show posters or stills from Netflix titles, in the
  icon, the promo tile or the screenshots. (Ours show an original sample video.)
- Suggest Netflix made, endorses or partners with it ("official", "Netflix's language tool").
- Promise downloading, saving or exporting subtitles or videos, or watching without an account, or
  getting around region limits. (The extension does none of these; subtitles are kept only in the
  user's own library.)
- List other streaming services, or pile up keywords ("learn Spanish Netflix, learn French Netflix,
  Netflix subtitles, dual subtitles, …"); one natural mention of a few languages is enough.
- Name competitors (Language Reactor and others).
- Claim it works on phones, tablets, TVs or in Firefox (not through this store).
