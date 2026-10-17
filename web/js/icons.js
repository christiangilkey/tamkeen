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
  videofile: `<path class="fill" d="M6.5 3.5H14l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/>
    <path d="M6.5 3.5H14l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M14 3.5V8h4.5"/>
    <path class="solid" d="M10.2 11.8v4.6l3.9-2.3z"/>`,
  audio: `<path d="M4 10v4M8 7v10M12 4.5v15M16 8v8M20 10.5v3"/>`,
  recent: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>`,
  page: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/>
    <path d="M3.5 12h17M12 3.5c2.7 2.5 2.7 14.5 0 17M12 3.5c-2.7 2.5-2.7 14.5 0 17"/>`,
  trending: `<path d="M3.5 17l5.6-5.6 3.8 3.8L20.5 7.6"/><path d="M15 7.5h5.5V13"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  refresh: `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>`,
  // Quick lookup: a lightning bolt. Detailed lookup: a target with an arrow in its centre.
  bolt: `<path class="fill" d="M13.2 3 5.5 13.6h5.3L9.9 21l7.6-10.6h-5.2z"/><path d="M13.2 3 5.5 13.6h5.3L9.9 21l7.6-10.6h-5.2z"/>`,
  target: `<circle class="fill" cx="10.5" cy="13.5" r="7.5"/><path d="M14.6 7.2a7.5 7.5 0 1 0 2.2 2.2"/><path d="M12.3 10.4a3.6 3.6 0 1 0 1.3 1.3"/>
    <path d="M10.5 13.5 17.6 6.4"/><path d="M17.6 6.4V3.5l2.9 2.9z"/>`,
  // A folder of saved words (the Vocab page).
  folder: `<path class="fill" d="M3.5 8.3A2.3 2.3 0 0 1 5.8 6h3.3a1.6 1.6 0 0 1 1.2.5l1.1 1.2a1.6 1.6 0 0 0 1.2.5h5.6a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z"/><path d="M3.5 8.3A2.3 2.3 0 0 1 5.8 6h3.3a1.6 1.6 0 0 1 1.2.5l1.1 1.2a1.6 1.6 0 0 0 1.2.5h5.6a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z"/>`,
  podcast: `<path d="M5 13a7 7 0 0 1 14 0"/><rect class="fill" x="3.5" y="13" width="4" height="6.5" rx="1.8"/><rect class="fill" x="16.5" y="13" width="4" height="6.5" rx="1.8"/>
    <rect x="3.5" y="13" width="4" height="6.5" rx="1.8"/><rect x="16.5" y="13" width="4" height="6.5" rx="1.8"/>`,
  // Someone speaking: pronunciation practice on a review card.
  speak: `<circle class="fill" cx="9" cy="8.4" r="3.2"/><path class="fill" d="M3 19.6a6 6 0 0 1 12 0z"/>
    <circle cx="9" cy="8.4" r="3.2"/><path d="M3 19.6a6 6 0 0 1 12 0"/>
    <path d="M16.3 6.3a3.4 3.4 0 0 1 0 4.4"/><path d="M18.9 4.2a6.6 6.6 0 0 1 0 8.6"/>`,
  // Points right; turned round with CSS where it should point the other way (the video player's
  // handle for folding the transcript panel away).
  chevron: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  // Three dots in a row: "more" (a menu of the less used things, such as the Vocab page's exports).
  more: `<circle class="solid" cx="5.5" cy="12" r="1.5"/><circle class="solid" cx="12" cy="12" r="1.5"/><circle class="solid" cx="18.5" cy="12" r="1.5"/>`,
  // A loudspeaker: play a word's or a sentence's audio.
  sound: `<path class="solid" d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
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
