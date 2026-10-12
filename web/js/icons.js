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
  page: `<circle class="fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/>
    <path d="M3.5 12h17M12 3.5c2.7 2.5 2.7 14.5 0 17M12 3.5c-2.7 2.5-2.7 14.5 0 17"/>`,
  trending: `<path d="M3.5 17l5.6-5.6 3.8 3.8L20.5 7.6"/><path d="M15 7.5h5.5V13"/>`,
  podcast: `<path d="M5 13a7 7 0 0 1 14 0"/><rect class="fill" x="3.5" y="13" width="4" height="6.5" rx="1.8"/><rect class="fill" x="16.5" y="13" width="4" height="6.5" rx="1.8"/>
    <rect x="3.5" y="13" width="4" height="6.5" rx="1.8"/><rect x="16.5" y="13" width="4" height="6.5" rx="1.8"/>`,
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
