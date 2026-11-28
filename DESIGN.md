# Tamkeen design rules

The owner's rules for how Tamkeen looks and moves, decided with him on 2026-11-27. **Every chat reads this before any
visual change, and runs the checklist at the end before saying it is done.** A rule here beats a habit in the code; when
a screen breaks one, the screen is wrong. A real reason to break one goes to the owner first, not into the code.

## 1. What Tamkeen should feel like

**Playful yet informational.** Two moods in one app, kept apart on purpose:

- **The study side** (reading, listening, words, flashcards, Library, Settings): calm, clear and informational, like a
  well-made dictionary or notebook. Hierarchy comes from type, spacing, alignment and thin lines, not from boxes.
- **The game side** (the habitat, village, farm, fishing, battles, rewards): playful pixel art, bouncy and alive.

They meet in a few deliberate places only: the game's **pixel icons** for coins, gems, glow and the like appear
wherever a reward shows, and rewards **fly to their counter**.

**What only Tamkeen has. Use it, because it is what makes the app ours:**

- **Words are the hero.** The text being studied is the most important thing on most screens. It is the largest,
  best-set type there, in its own script's font; everything around it stays quiet.
- **The word colours are a language.** New word = plum, seen word = ink, highlighted = gold tint. They mean exactly that
  everywhere: cards, the reader, Muffle bubbles, word lists, stats. They are used for nothing else.
- **Gold means earned.** Streaks, rewards, badges. Never decoration.
- **Two writing directions.** Arabic and Persian run right to left: layouts are built to mirror (logical properties:
  `margin-inline-start`, not `margin-left`), not patched afterwards.
- **The Muffles' glyph script** can texture empty states and loading screens.

**One exception, the owner's choice (2026-11-27): the flashcard reviewer keeps its own look.** "I really like the vocab
review screens, do not change these." Its dark brand gradient, the plum "Not remembered" and teal "Remembered"
buttons, the white "Show the word" button and its sizes stay as they are (`web/css/review.css`, the `.rv-*` rules). Its
typed colours are allowed in the guard's baseline. Don't restyle it in a sweep: any improvement goes to the owner
first, one change at a time.

**A second exception, also the owner's (2026-11-27): the review calendar keeps its old colours.** "I think it should
stay looking like this, but reverse the colors back to how they were." Its layout follows this document, but its dots
are the bright teal for days done and the plum for days ahead, in both themes, as before the sweep: the tokens
`--heat-done` and `--heat-ahead` (`web/css/review.css`, `.hm-cell`). Don't move them to gold or the ink.

**The logo-swap test** (the owner's): cover the logo and the words. Could this screen belong to any other language app?
If yes, it is the average AI answer, not Tamkeen's. Redo it.

## 2. What we are getting away from

The owner's diagnosis of the app as of 2026-11-27, with the numbers found in `web/css`:

- Everything in a rounded rectangle, **cards inside cards**. That reads as "AI vibe-coded".
- **15 different corner roundings**, with fully rounded pill ends (111 uses) on buttons, chips and inputs alike.
- **Line icons sitting in tinted rounded squares.**
- **Everything at the same weight:** every section the same size, every feature an icon + title + two lines, all
  symmetrical and equally important.
- **163 colours** typed in directly, **64 drop shadows**, **about 20 text sizes** (including 12.5, 13.5 and so on),
  **16 spacing sizes** (3, 5, 7, 9 and so on).

## 3. Colour

Only these names. **No colour is typed into a stylesheet or a script directly** (pixel art keeps its own palettes in
its sprites). Each has one job.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--paper` | `#f6f4f1` | `#131116` | The page |
| `--surface` | `#ffffff` | `#1c1a20` | An object you act on as one thing (section 6) |
| `--surface-2` | `#efecea` | `#27242c` | Inputs, a selected row, quiet fills |
| `--line` | `#e1dcd9` | `#37323f` | Dividers and outlines (1px) |
| `--ink` | `#1f1a23` | `#efebf3` | Text |
| `--ink-2` | `#6d6672` | `#a39cae` | Supporting text |
| `--teal` | `#0a7580` | `#2bb8c6` | **Actions**: the main button, links, focus, selection |
| `--teal-ink` | `#ffffff` | `#03262b` | Text on teal |
| `--teal-tint` | `#d4edf0` | `#123b42` | A selected or active quiet state |
| `--plum-900` | `#360032` | `#360032` | **The brand** (logo, the brand gradient) |
| `--plum-600` | `#8f1d84` | `#dc84d4` | **New words** (and only new words) |
| `--gold` | `#f1cf7b` | `#f1cf7b` | **Earned** things: streak, rewards, badges |
| `--gold-ink` | `#2a1d00` | `#2a1d00` | Text on gold |
| `--hl` | `#f6dc94` | `#f1cf7b` | The word highlighter (gold family, a word state) |
| `--alert` | `#e5484d` | `#e5484d` | **Needs you**: requests, unread, a due thing. Never decoration |
| `--danger` | `#b42318` | `#f87171` | Errors and destructive actions |
| `--danger-tint` | `#fde7e5` | `#3b1715` | Behind an error message |

- **One plum, not plum + purple.** The brand plum and the new-word colour are one hue at two shades.
- The brand gradient (plum → teal) is for the logo and the splash screen only, never a button or a card.
- Teal is never used just to make something pretty: teal means you can act on it.

## 4. Type

Two voices (the owner, 2026-11-27: "a fun font and a serious font separation"; for the fun one he then picked the pixel
font, Pixelify Sans, to match the game):

| Role | Font | Notes |
|---|---|---|
| **Serious:** the app's text | **Commissioner** (SIL OFL; Latin, Latin-ext, Cyrillic) | Replaced Figtree, which has no Cyrillic and is the common AI default. `--ui-font` |
| **Serious:** headings and headwords | **Literata** (SIL OFL; Latin, Latin-ext, Cyrillic), the owner's pick | Page titles and section headings; replaced Rubik. `--display-font` |
| Studied text | Each script's own font: Literata for Latin and Cyrillic letters, Noto Naskh Arabic, Vazirmatn for Persian, the system CJK, Thai and Devanagari fonts | Always one step larger than the UI text around it. `--ar-font` (set per language) |
| **Fun:** the game's numbers, rewards and celebrations | **Pixelify Sans** (SIL OFL; Latin, Latin-ext, Cyrillic), the owner's pick | The game's counts (coins, gems, glow, XP, streaks), creature names, game panel titles, reward pop-ups. Only on the game side and on rewards, never on study screens (study numbers use Commissioner at full flair). `--fun-font` |

Commissioner's **flair** axis is its playful side: 0 for small text, 100 for numbers on the study side.

**The scale. No other sizes:** `12` captions · `14` supporting text · `16` body · `20` section heading ·
`26` page title · `34` the hero word or number · `48` a celebrated number (level up, streak).
**Weights:** 400, 600, 700. **Line height:** 1.5 for text, 1.2 for headings. Sentence case everywhere.
In code: `--fs-12` … `--fs-48`, `--lh-text`, `--lh-head`, and `--flair-head` / `--flair-num` for the flair axis
(`font-variation-settings: "FLAR" var(--flair-head)`).

## 5. Spacing

**The scale. No other values:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. In code: `--s-4` … `--s-64`.

Spacing does the grouping that boxes used to do: things that belong together sit **close** (4–8), separate groups sit
**far** apart (24–48). A wider gap is the first tool for separating, then a 1px `--line` divider, and only then a surface.

## 6. Surfaces, shape and depth

**A surface (a filled or outlined box) only for an object you act on as one thing:** a library item, a word card, a
popup, a sheet, an input. **Never a box inside a box.** Lists are rows divided by lines, not stacked cards. Sections of a
page are separated by space and a heading, not by framing each one.

**Corners are squircles** (smooth, continuous curves, the owner's choice: they feel more premium). Only these sizes:

| Token | Value | For |
|---|---|---|
| none | `0` | Rows, lists, dividers, full-width bands, full-bleed pictures |
| `--r-s` | `10px` | Buttons, inputs, pictures, small objects |
| `--r-l` | `20px` | Sheets and popups only |
| `--r-pill` | `999px` | Chips, switches, badges only (never a normal button) |

**How the squircle is drawn:** `corner-shape: squircle` where the browser has it (Chromium: Windows, Android, the web app
in Chrome or Edge). Where it doesn't (Safari: iPhone, Mac), `web/js/squircle.js` cuts each element to an exact squircle
outline with `clip-path` and redraws it when the element changes size. Clipping cuts off borders and outer rings, so a
squircled element draws its outline and its focus ring inside the same shape. Nothing may look broken while the helper
loads; plain rounded corners are the fallback.

**Game panels and reward pop-ups:** a **stepped pixel corner** (the owner's yes, 2026-11-27) in the game's palette,
instead of a squircle: a 9px frame drawn in Aseprite (`game/art-src/ui/panel_step.aseprite` and its dark twin), shown at
4x through `border-image` (`web/game-art/ui/panel_step*.png`), with no shadow. The study side keeps its squircles.

**Depth:** one shadow, `--shadow-float`, only on things that float above the page (popups, menus, sheets, toasts).
Nothing in the page itself has a shadow.

## 7. Icons

- Line icons (`web/js/icons.js`), **in the text colour**, sizes `16 · 20 · 24`.
- **No tinted squares or circles behind icons.**
- An icon only where it helps you recognise something (navigation, an action, a kind of item), not to decorate a
  heading or fill a grid.
- **Pixel icons only for game things** (currencies, items, creatures), never for study actions.

## 8. Components

**Buttons.** One **main** button per screen or sheet: filled `--teal`, `--r-s`. Secondary: outlined (1px `--line`)
or plain text in `--teal`. Tertiary: plain text. Destructive: `--danger` text; filled only in the final confirm step.
Buttons are 44px tall on phones (a fingertip), with the label in 16/600.

**Inputs.** `--surface-2` fill, no outline until focus, `--r-s`, 44px tall on phones. Focus: a 2px `--teal` ring
inside the squircle.

**Lists and rows.** Full-width rows, a 1px `--line` between them, no corners. The primary text in `--ink`, details in
`--ink-2`. A row's action sits at its end.

**Sheets and popups.** The app's own, never the browser's. `--surface`, `--r-l`, `--shadow-float`. The close × sits in
the sheet's own corner. No empty bands: the sheet fits its content. On a phone it rises from the bottom.

**Words.** A word shown for study is in its script's font, one step larger than the text around it, in its word-state
colour. Its meaning sits under or after it in `--ink-2`.

**Rewards.** A pixel icon + the number, in the pixel font (Pixelify Sans). Earned rewards fly to their counter. Gold only
here.

**Empty states.** An invitation, not an apology: what goes here and one button to add it. A Muffle glyph texture is
welcome.

## 9. Hierarchy

- **Each screen has one main thing**, and it is visibly bigger than everything else.
- **Content is not equally important, so it is not equally sized.** A key number gets room; minor ones are a line of
  text. One setting may need a whole section; another is a row with a switch.
- **No uniform grids of icon + title + two lines.** Uneven layouts are allowed and expected when the content is uneven.
- Primary actions look different from secondary ones (section 8).

## 10. Movement

- **Study side:** calm and quick. Fades and slides of 150–200ms, ease-out. Nothing moves near a word while you read it.
- **Game side:** playful. Pops, bounces, little shakes on a rare find, particles on a harvest.
- Rewards always fly to their counter.
- Respect "reduce motion": then only fades.

## 11. Words on screen

Plain, short, friendly: what it is and what it does. Sentence case. No "please", no exclamation marks on system text,
no "successfully". The owner's rule for every chat applies to the app too: explain plainly.

## 12. Checklist (run it before saying a visual change is done)

1. **The logo-swap test:** could this screen belong to another app? If yes, redo it.
2. No box inside a box. Every surface is an object you act on as one thing.
3. No tinted squares behind icons. Pixel icons only for game things.
4. Only the colour, size, spacing and corner tokens above. Nothing typed in directly.
5. One main thing per screen, visibly bigger. One main button.
6. Squircle corners from the token list. Pills only on chips, switches and badges.
7. No shadow except on floating things.
8. Works right to left (try Arabic) and at 390px wide (a phone), in light and dark.
9. The studied words are the hero where they appear, in their word-state colours.
10. Checked in the real app, with a picture to the owner for anything he will notice.

**A test guards this list:** `tests/js/design.test.mjs` counts what this document forbids in the stylesheets and the
scripts' styles (typed colours, off-list corners, shadows, off-scale sizes and spacing, a card inside a card) and fails
if any count rises above `tests/fixtures/design-baseline.json`. The counts may only go down: lower the baseline in the
same commit when you fix something (`node tests/js/design.test.mjs --write-baseline`). `python tools/design/audit.py`
lists where things are.
