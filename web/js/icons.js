// The app's own icons: thin rounded line drawings that take the colour of the text around them,
// so they follow the theme and the brand colours. Shared by the desktop app and the Android app.
//
// Each icon is drawn on a 24 x 24 grid. Shapes with class "fill" are a soft tint behind the lines;
// it is invisible until the icon is "on" (see .tabbar a.active in mobile.css).

const PATHS = {
  home: `<path class="fill" d="M4 10.8 12 4l8 6.8V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/>
    <path d="M4 10.8 12 4l8 6.8V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.6 20.5v-4.8a2.4 2.4 0 0 1 4.8 0v4.8"/>`,
  library: `<rect class="fill" x="3.5" y="10.5" width="17" height="10" rx="2.6"/>
    <path d="M7.5 4.5h9"/><path d="M5.5 7.5h13"/><rect x="3.5" y="10.5" width="17" height="10" rx="2.6"/>
    <path class="solid" d="M10.6 13.4v4.2l3.6-2.1z"/>`,
  vocab: `<rect class="fill" x="5" y="3.5" width="14" height="17" rx="2.6"/>
    <rect x="5" y="3.5" width="14" height="17" rx="2.6"/>
    <path d="M12 8.1l1.15 2.75L15.9 12l-2.75 1.15L12 15.9l-1.15-2.75L8.1 12l2.75-1.15z"/>`,
  send: `<path class="fill" d="M20.5 3.5 3.5 10.6l6.6 2.8 2.8 6.6z"/><path d="M20.5 3.5 3.5 10.6l6.6 2.8 2.8 6.6z"/><path d="M10.1 13.4 20.5 3.5"/>`,
  friends: `<circle class="fill" cx="9" cy="8.4" r="3.2"/><path class="fill" d="M3 19.6a6 6 0 0 1 12 0z"/>
    <circle cx="9" cy="8.4" r="3.2"/><path d="M3 19.6a6 6 0 0 1 12 0"/>
    <path d="M15.6 5.5a3.2 3.2 0 0 1 0 5.8"/><path d="M17.6 14.3a6 6 0 0 1 3.4 5.3"/>`,
  settings: `<circle class="fill" cx="15" cy="7" r="2.1"/><circle class="fill" cx="9" cy="12" r="2.1"/><circle class="fill" cx="16" cy="17" r="2.1"/>
    <path d="M4 7h8.9M17.1 7H20"/><circle cx="15" cy="7" r="2.1"/>
    <path d="M4 12h2.9M11.1 12H20"/><circle cx="9" cy="12" r="2.1"/>
    <path d="M4 17h9.9M18.1 17H20"/><circle cx="16" cy="17" r="2.1"/>`,
  search: `<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>`,
  video: `<rect class="fill" x="3" y="5.5" width="18" height="13" rx="3"/><rect x="3" y="5.5" width="18" height="13" rx="3"/>
    <path class="solid" d="M10.2 9.3v5.4l4.6-2.7z"/>`,
  film: `<rect class="fill" x="3.5" y="4" width="17" height="16" rx="2.6"/><rect x="3.5" y="4" width="17" height="16" rx="2.6"/>
    <path d="M7.5 4v16M16.5 4v16M3.5 9.3h4M3.5 14.7h4M16.5 9.3h4M16.5 14.7h4"/>`,
  videofile: `<path class="fill" d="M6.5 3.5H14l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/>
    <path d="M6.5 3.5H14l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M14 3.5V8h4.5"/>
    <path class="solid" d="M10.2 11.8v4.6l3.9-2.3z"/>`,
  audio: `<path d="M4 10v4M8 7v10M12 4.5v15M16 8v8M20 10.5v3"/>`,
  recent: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>`,
  page: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/>
    <path d="M3.5 12h17M12 3.5c2.7 2.5 2.7 14.5 0 17M12 3.5c-2.7 2.5-2.7 14.5 0 17"/>`,
  trending: `<path d="M3.5 17l5.6-5.6 3.8 3.8L20.5 7.6"/><path d="M15 7.5h5.5V13"/>`,
  // YouTube topics (youtube-home.js TOPICS): news, music, comedy, food, travel, sport, science,
  // gaming, kids, vlogs, learning. (Popular now is "trending", podcasts "podcast".)
  news: `<rect class="fill" x="3.5" y="4.5" width="13.5" height="15" rx="2"/><rect x="3.5" y="4.5" width="13.5" height="15" rx="2"/>
    <path d="M17 8.5h1.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13"/><path d="M7 8.5h6.5M7 12h6.5M7 15.5h4.5"/>`,
  music: `<path d="M9 17.5V6l10.5-2v11.5"/><circle class="fill" cx="6.5" cy="17.5" r="2.5"/><circle class="fill" cx="17" cy="15.5" r="2.5"/>
    <circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/><path d="M9 9.5l10.5-2"/>`,
  smile: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M8.3 13.8a4.3 4.3 0 0 0 7.4 0"/><path d="M9.2 9.4v.6M14.8 9.4v.6"/>`,
  food: `<path class="fill" d="M4.5 11.5h15v5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z"/><path d="M4.5 11.5h15v5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z"/>
    <path d="M3 11.5h18"/><path d="M9.5 8.3c-.7-.8-.7-1.7 0-2.5s.7-1.7 0-2.5M14.5 8.3c-.7-.8-.7-1.7 0-2.5s.7-1.7 0-2.5"/>`,
  travel: `<rect class="fill" x="4" y="7.5" width="16" height="12" rx="2.2"/><rect x="4" y="7.5" width="16" height="12" rx="2.2"/>
    <path d="M9 7.5V5.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 5.8v1.7"/><path d="M8.5 7.5v12M15.5 7.5v12"/>`,
  sport: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17"/>
    <path d="M6.2 5.8a8.5 8.5 0 0 1 0 12.4M17.8 5.8a8.5 8.5 0 0 0 0 12.4"/>`,
  science: `<path class="fill" d="M10.5 3.5v5.2L5 18a1.6 1.6 0 0 0 1.4 2.5h11.2A1.6 1.6 0 0 0 19 18l-5.5-9.3V3.5z"/>
    <path d="M9.5 3.5h5M10.5 3.5v5.2L5 18a1.6 1.6 0 0 0 1.4 2.5h11.2A1.6 1.6 0 0 0 19 18l-5.5-9.3V3.5"/><path d="M7.4 14.5h9.2"/>`,
  game: `<path class="fill" d="M7 8h10a4 4 0 0 1 3.9 4.9l-.9 4a2.4 2.4 0 0 1-4.1 1L14 16h-4l-1.9 1.9a2.4 2.4 0 0 1-4.1-1l-.9-4A4 4 0 0 1 7 8z"/>
    <path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.9 4a2.4 2.4 0 0 1-4.1 1L14 16h-4l-1.9 1.9a2.4 2.4 0 0 1-4.1-1l-.9-4A4 4 0 0 1 7 8z"/>
    <path d="M8 10.8v3.4M6.3 12.5h3.4"/><path d="M15.5 11.8h.01M17.5 13.6h.01"/>`,
  kids: `<path class="fill" d="M12 3.5a5.5 5.5 0 0 1 5.5 5.5c0 3.4-2.9 6.5-5.5 6.5S6.5 12.4 6.5 9A5.5 5.5 0 0 1 12 3.5z"/>
    <path d="M12 3.5a5.5 5.5 0 0 1 5.5 5.5c0 3.4-2.9 6.5-5.5 6.5S6.5 12.4 6.5 9A5.5 5.5 0 0 1 12 3.5z"/><path d="M12 15.5l-1 1.6h2z"/>
    <path d="M12 17.1c0 1.5-1.5 1.9-1.5 3.4"/>`,
  vlog: `<rect class="fill" x="3" y="7" width="13" height="10.5" rx="2.4"/><rect x="3" y="7" width="13" height="10.5" rx="2.4"/>
    <path d="M16 11l5-3v8.5l-5-3"/>`,
  learn: `<path class="fill" d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/>
    <path d="M6.5 11.5v4.3c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-4.3"/><path d="M21.5 9.5v5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  refresh: `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>`,
  // A five-pointed star: save a word to the vocab list.
  star: `<path class="fill" d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/><path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>`,
  // Quick lookup: a lightning bolt. Detailed lookup: a target with an arrow in its centre.
  bolt: `<path class="fill" d="M13.2 3 5.5 13.6h5.3L9.9 21l7.6-10.6h-5.2z"/><path d="M13.2 3 5.5 13.6h5.3L9.9 21l7.6-10.6h-5.2z"/>`,
  target: `<circle class="fill" cx="10.5" cy="13.5" r="7.5"/><path d="M14.6 7.2a7.5 7.5 0 1 0 2.2 2.2"/><path d="M12.3 10.4a3.6 3.6 0 1 0 1.3 1.3"/>
    <path d="M10.5 13.5 17.6 6.4"/><path d="M17.6 6.4V3.5l2.9 2.9z"/>`,
  // A day on the calendar ("Send to Google Calendar").
  calendar: `<rect class="fill" x="3.5" y="5" width="17" height="15.5" rx="2.6"/>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>
    <path d="M12 13v2.5l1.6 1"/>`,
  // A folder of saved words (the Vocab page).
  folder: `<path class="fill" d="M3.5 8.3A2.3 2.3 0 0 1 5.8 6h3.3a1.6 1.6 0 0 1 1.2.5l1.1 1.2a1.6 1.6 0 0 0 1.2.5h5.6a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z"/><path d="M3.5 8.3A2.3 2.3 0 0 1 5.8 6h3.3a1.6 1.6 0 0 1 1.2.5l1.1 1.2a1.6 1.6 0 0 0 1.2.5h5.6a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z"/>`,
  podcast: `<path d="M5 13a7 7 0 0 1 14 0"/><rect class="fill" x="3.5" y="13" width="4" height="6.5" rx="1.8"/><rect class="fill" x="16.5" y="13" width="4" height="6.5" rx="1.8"/>
    <rect x="3.5" y="13" width="4" height="6.5" rx="1.8"/><rect x="16.5" y="13" width="4" height="6.5" rx="1.8"/>`,
  // Someone speaking: pronunciation practice on a review card.
  speak: `<circle class="fill" cx="9" cy="8.4" r="3.2"/><path class="fill" d="M3 19.6a6 6 0 0 1 12 0z"/>
    <circle cx="9" cy="8.4" r="3.2"/><path d="M3 19.6a6 6 0 0 1 12 0"/>
    <path d="M16.3 6.3a3.4 3.4 0 0 1 0 4.4"/><path d="M18.9 4.2a6.6 6.6 0 0 1 0 8.6"/>`,
  // An open book: the Library's Books and the free shelf (pages/books.js).
  book: `<path class="fill" d="M3.5 6.2c2.7-1 5.6-.9 8.5.6 2.9-1.5 5.8-1.6 8.5-.6v12.3c-2.7-1-5.6-.9-8.5.6-2.9-1.5-5.8-1.6-8.5-.6z"/>
    <path d="M3.5 6.2c2.7-1 5.6-.9 8.5.6 2.9-1.5 5.8-1.6 8.5-.6v12.3c-2.7-1-5.6-.9-8.5.6-2.9-1.5-5.8-1.6-8.5-.6z"/><path d="M12 6.8v12.3"/>`,
  // Points right; turned round with CSS where it should point the other way (the video player's
  // handle for folding the transcript panel away).
  chevron: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  // Three dots in a row: "more" (a menu of the less used things, such as the Vocab page's exports).
  transcript: `<rect class="fill" x="4" y="4" width="16" height="16" rx="2.6"/><rect x="4" y="4" width="16" height="16" rx="2.6"/>
    <path d="M8 9h8M8 12.5h8M8 16h5"/>`,
  more: `<circle class="solid" cx="5.5" cy="12" r="1.5"/><circle class="solid" cx="12" cy="12" r="1.5"/><circle class="solid" cx="18.5" cy="12" r="1.5"/>`,
  // A loudspeaker: play a word's or a sentence's audio.
  sound: `<path class="solid" d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
  // A play sign: carry on playing from here.
  play: `<path class="fill" d="M8 5.5v13l10.5-6.5z"/><path d="M8 5.5v13l10.5-6.5z"/>`,
  // A tall phone-shaped frame with a play sign: Instagram reels (so they don't share YouTube's icon).
  reel: `<rect class="fill" x="6.5" y="3" width="11" height="18" rx="2.8"/><rect x="6.5" y="3" width="11" height="18" rx="2.8"/>
    <path class="solid" d="M10.5 9.6v4.8l4-2.4z"/>`,
  // Row actions on the Friends tab: message, accept, decline, add or remove a person, rename, leave, add new.
  message: `<path class="fill" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z"/>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z"/>`,
  check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  userplus: `<circle class="fill" cx="9" cy="8.4" r="3.2"/><circle cx="9" cy="8.4" r="3.2"/><path d="M3 19.6a6 6 0 0 1 12 0"/>
    <path d="M18.5 8.5v6M15.5 11.5h6"/>`,
  userminus: `<circle class="fill" cx="9" cy="8.4" r="3.2"/><circle cx="9" cy="8.4" r="3.2"/><path d="M3 19.6a6 6 0 0 1 12 0"/>
    <path d="M15.5 11.5h6"/>`,
  edit: `<path class="fill" d="M15.2 4.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19l-4.5 1 1-4.5z"/>
    <path d="M15.2 4.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19l-4.5 1 1-4.5z"/><path d="M13.5 6.5l4 4"/>`,
  leave: `<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M14.5 8l4 4-4 4"/><path d="M18.5 12H9.5"/>`,
  add: `<path d="M12 5.5v13M5.5 12h13"/>`,
  // The Settings sections (components/settingsui.js): look & feel, account & sync, apps, your data.
  sun: `<circle class="fill" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/>
    <path d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6"/>`,
  cloud: `<path class="fill" d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.1 4.7 4.7 0 0 0 7 18.5z"/>
    <path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.1 4.7 4.7 0 0 0 7 18.5z"/>`,
  link: `<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1.1 1.1"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1.1-1.1"/>`,
  data: `<ellipse class="fill" cx="12" cy="6.5" rx="7" ry="2.8"/><ellipse cx="12" cy="6.5" rx="7" ry="2.8"/>
    <path d="M5 6.5v11c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-11"/><path d="M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8"/>`,
  // "Import to Tamkeen": an arrow going down into a tray. The browsers' round teal button draws the
  // same three lines (browser-toolbar.js, InAppBrowser.java's ic_tamkeen_import.xml).
  import: `<path d="M12 3.5v11"/><path d="M7.5 10 12 14.5 16.5 10"/><path d="M4.5 14.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"/>`,
  // The flashcard streak (the friends list's bar): a flame with a small one inside.
  flame: `<path class="fill" d="M12 3.2c.5 2.7 2.3 4.4 3.9 6.2 1.4 1.6 2.3 3.3 2.3 5.2a6.2 6.2 0 0 1-12.4 0c0-2.3 1.1-4.1 2.5-5.4.3 1.5 1 2.5 2.1 3-.5-3.1.3-6.3 1.6-9z"/>
    <path d="M12 3.2c.5 2.7 2.3 4.4 3.9 6.2 1.4 1.6 2.3 3.3 2.3 5.2a6.2 6.2 0 0 1-12.4 0c0-2.3 1.1-4.1 2.5-5.4.3 1.5 1 2.5 2.1 3-.5-3.1.3-6.3 1.6-9z"/>
    <path d="M12 20.8a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.2-2.5 2.5-4 1.3 1.5 2.5 2.5 2.5 4a2.5 2.5 0 0 1-2.5 2.5z"/>`,
  // The Netflix extension's player controls (extension/): pause, a few seconds back / ahead (an
  // arrow going round, with the number beside it), full screen, and the extension itself (a puzzle piece).
  pause: `<rect class="fill" x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect class="fill" x="13.9" y="5" width="3.6" height="14" rx="1.2"/>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/>`,
  back: `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.8 3.8v3.6h3.6"/>`,
  // Back to the start of the sentence: a bar with a triangle pointing at it (a "previous" button).
  "sentence-start": `<path d="M6.5 5.5v13"/><path class="fill" d="M18 6.2v11.6a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l7.15-5.8A.8.8 0 0 1 18 6.2z"/>
    <path d="M18 6.2v11.6a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l7.15-5.8A.8.8 0 0 1 18 6.2z"/>`,
  ahead: `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.2 3.8v3.6h-3.6"/>`,
  fullscreen: `<path d="M4.5 9V5.5a1 1 0 0 1 1-1H9M15 4.5h3.5a1 1 0 0 1 1 1V9M19.5 15v3.5a1 1 0 0 1-1 1H15M9 19.5H5.5a1 1 0 0 1-1-1V15"/>`,
  // A screen with two lines of text along its bottom: subtitles (the Netflix bar's Subtitles menu).
  subtitles: `<rect class="fill" x="3" y="5" width="18" height="14" rx="2.6"/><rect x="3" y="5" width="18" height="14" rx="2.6"/>
    <path d="M7 12.5h4M13.5 12.5H17M7 15.5h7M16.5 15.5H17"/>`,
  // A computer screen on its stand (Settings → Listening & transcripts: "This computer" / "My computer").
  computer: `<rect class="fill" x="3.5" y="4.5" width="17" height="11.5" rx="2"/><rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/>
    <path d="M12 16v3.5"/><path d="M8.5 19.5h7"/>`,
  puzzle: `<path class="fill" d="M4.5 8h4.1a2 2 0 1 1 3.8 0H16v3.6a2 2 0 1 1 0 3.8v4.1H4.5z"/><path d="M4.5 8h4.1a2 2 0 1 1 3.8 0H16v3.6a2 2 0 1 1 0 3.8v4.1H4.5z"/>`,
  // "Add words" on the Vocab page (components/wordbuilder.js): record a card's audio, stop, a card's
  // own sound file, take a card out, fill in for me, and a pasted list.
  mic: `<rect class="fill" x="9" y="3.5" width="6" height="11" rx="3"/><rect x="9" y="3.5" width="6" height="11" rx="3"/>
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v2.5"/>`,
  stop: `<rect class="fill" x="6.5" y="6.5" width="11" height="11" rx="2.5"/><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>`,
  upload: `<path d="M12 15V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/><path d="M4.5 14.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"/>`,
  trash: `<path class="fill" d="M6.5 7.5l.85 11.2a1.6 1.6 0 0 0 1.6 1.5h6.1a1.6 1.6 0 0 0 1.6-1.5l.85-11.2z"/>
    <path d="M4.5 7.5h15"/><path d="M9.5 7.5V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4v2.1"/>
    <path d="M6.5 7.5l.85 11.2a1.6 1.6 0 0 0 1.6 1.5h6.1a1.6 1.6 0 0 0 1.6-1.5l.85-11.2"/><path d="M10.3 11v5.5M13.7 11v5.5"/>`,
  sparkle: `<path class="fill" d="M10 3.5l1.6 4.6 4.6 1.6-4.6 1.6L10 15.9l-1.6-4.6-4.6-1.6 4.6-1.6z"/>
    <path d="M10 3.5l1.6 4.6 4.6 1.6-4.6 1.6L10 15.9l-1.6-4.6-4.6-1.6 4.6-1.6z"/><path d="M17.5 14.5v5.5M14.75 17.25h5.5"/>`,
  // The word popup's "Sentence" button (play the whole sentence): a speaker beside lines of text.
  sentence: `<path class="solid" d="M3 9.5v5h2.5L9 17.5v-11L5.5 9.5z"/><path d="M12.5 8h8M12.5 12h8M12.5 16h5.5"/>`,
  list: `<path d="M9.5 7h10M9.5 12h10M9.5 17h10"/><circle class="solid" cx="5" cy="7" r="1.25"/><circle class="solid" cx="5" cy="12" r="1.25"/>
    <circle class="solid" cx="5" cy="17" r="1.25"/>`,
  // "Add words" → Scan: take a photo of a list, or choose a picture of one.
  camera: `<rect class="fill" x="3" y="7" width="18" height="12.5" rx="2.6"/>
    <path d="M8.6 7l1.3-2.2a1.3 1.3 0 0 1 1.1-.6h2a1.3 1.3 0 0 1 1.1.6L15.4 7"/><rect x="3" y="7" width="18" height="12.5" rx="2.6"/>
    <circle cx="12" cy="13.2" r="3.3"/>`,
  image: `<rect class="fill" x="3.5" y="4.5" width="17" height="15" rx="2.6"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/>
    <circle cx="9" cy="9.6" r="1.6"/><path d="M4 17.4l4.6-4.6 3.3 3.3 2.5-2.5 5.6 5.6"/>`,
  // Audiobooks (LibriVox): a book that speaks.
  audiobook: `<rect class="fill" x="3.5" y="4" width="10.5" height="16" rx="1.8"/>
    <rect x="3.5" y="4" width="10.5" height="16" rx="1.8"/><path d="M6.8 4v16"/><path d="M17 9.2a4 4 0 0 1 0 5.6M19.6 6.6a7.6 7.6 0 0 1 0 10.8"/>`,
  // The audiobook categories (audiobooks.js CATEGORIES), one plain drawing each.
  key: `<circle class="fill" cx="8" cy="15.5" r="4"/><circle cx="8" cy="15.5" r="4"/><path d="M10.9 12.6 19.5 4M16 7.5l2.4 2.4M18.3 5.2l2 2"/>`,
  planet: `<circle class="fill" cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="5.5"/>
    <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-24 12 12)"/>`,
  stories: `<rect class="fill" x="8" y="3.5" width="11.5" height="14.5" rx="2"/>
    <path d="M5 7v11a2.5 2.5 0 0 0 2.5 2.5H15"/><rect x="8" y="3.5" width="11.5" height="14.5" rx="2"/><path d="M11 8h5.5M11 11h5.5M11 14h3.5"/>`,
  wand: `<path d="M4 20 14.5 9.5"/><path class="fill" d="M17 3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>
    <path d="M17 3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/><path d="M8 4.5v2M7 5.5h2M19.5 15.5v2M18.5 16.5h2"/>`,
  feather: `<path class="fill" d="M19.5 4.5C12 4.5 6.5 9.5 6.5 17.5c8 0 13-5.5 13-13z"/>
    <path d="M19.5 4.5C12 4.5 6.5 9.5 6.5 17.5c8 0 13-5.5 13-13z"/><path d="M4 20l11-11"/>`,
  mask: `<path class="fill" d="M5 4.5h14V11a7 7 0 0 1-14 0z"/><path d="M5 4.5h14V11a7 7 0 0 1-14 0z"/>
    <path d="M8.5 9.5h2M13.5 9.5h2"/><path d="M9 13.5a3.5 3.5 0 0 0 6 0"/>`,
  landmark: `<path class="fill" d="M3.5 9 12 4l8.5 5z"/><path d="M3.5 9 12 4l8.5 5z"/><path d="M6 11.5v5.5M10 11.5v5.5M14 11.5v5.5M18 11.5v5.5M4 19.5h16"/>`,
  person: `<circle class="fill" cx="12" cy="8" r="3.6"/><path class="fill" d="M5 20a7 7 0 0 1 14 0z"/>
    <circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>`,
  candle: `<rect class="fill" x="9" y="10" width="6" height="8.5" rx="1.2"/><rect x="9" y="10" width="6" height="8.5" rx="1.2"/>
    <path d="M12 3.5c1.7 1.9 2.1 3.1 2.1 4a2.1 2.1 0 0 1-4.2 0c0-.9.4-2.1 2.1-4z"/><path d="M6 20.5h12"/>`,
  bulb: `<path class="fill" d="M12 3.5a6 6 0 0 0-3.5 10.9c.6.4.9 1.1.9 1.8v.8h5.2v-.8c0-.7.3-1.4.9-1.8A6 6 0 0 0 12 3.5z"/>
    <path d="M12 3.5a6 6 0 0 0-3.5 10.9c.6.4.9 1.1.9 1.8v.8h5.2v-.8c0-.7.3-1.4.9-1.8A6 6 0 0 0 12 3.5z"/><path d="M9.6 20.5h4.8"/>`,
};

export const ICON_NAMES = Object.keys(PATHS);

// The icons' own few style rules, added to the page once (so they work in both app shells
// without either stylesheet having to know about them).
if (typeof document !== "undefined" && !document.getElementById("ic-style")) {
  const style = document.createElement("style");
  style.id = "ic-style";
  style.textContent = ".ic{vertical-align:-0.22em;flex:none}.ic .fill{fill:currentColor;stroke:none;opacity:0;transition:opacity .15s ease}"
    + ".ic .solid{fill:currentColor;stroke-width:1.2}";
  document.head.append(style);
}

/** The icon as SVG markup, `size` pixels square. It is decoration: the label beside it says what it is. */
export function icon(name, size = 20) {
  const body = PATHS[name];
  if (!body) return "";
  return `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" `
    + `>${body}</svg>`;
}
