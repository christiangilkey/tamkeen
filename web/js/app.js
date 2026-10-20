// App shell: API client, live events (SSE), router, toasts, theme, downloads.

import * as home from "./pages/home.js";
import * as library from "./pages/library.js";
import * as player from "./pages/player.js";
import * as vocab from "./pages/vocab.js";
import * as search from "./pages/search.js";
import * as settings from "./pages/settings.js";
import * as about from "./pages/about.js";
import * as welcome from "./pages/welcome.js";
import * as friends from "./pages/friends.js";
import * as chat from "./pages/chat.js";
import * as discover from "./pages/discover.js";
import * as reels from "./pages/reels.js";
import * as books from "./pages/books.js";
import { startBadge } from "./social.js";
import { mountLanguageSwitch, withLearningList } from "./components/langswitch.js";
import { showUpdateNotice } from "./updatenotice.js";
import { detectLanguage, setLang, setStudyLanguage, studyLanguage } from "./languages.js";
import { chosenCountry, handmadeOnly, youtubeHome } from "./youtube-home.js";
import { startTranslating } from "./i18n.js";
import { initScrollHints } from "./scrollhint.js";

// ---------- API ----------
export async function api(path, { method = "GET", body, raw, bytes } = {}) {
  const opts = { method, headers: {} };
  if (raw !== undefined) {
    opts.body = raw;
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch (e) {
    throw new Error("Lost connection to the app's local server.");
  }
  const type = res.headers.get("content-type") || "";
  // (`bytes`: the answer is a file, an ArrayBuffer: the Japanese dictionary.)
  const data = bytes && res.ok ? await res.arrayBuffer() : type.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    let detail = data && data.detail ? data.detail : data;
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join("; ");
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return data;
}

// ---------- helpers ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDuration(sec) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function fmtBytes(n) {
  if (!n) return "0 MB";
  return n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(2)} GB` : `${Math.round(n / 2 ** 20)} MB`;
}

// ---------- events (SSE) ----------
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
function emit(event, data) {
  for (const fn of listeners.get(event) || []) {
    try { fn(data); } catch (e) { console.error(e); }
  }
}
function connectEvents() {
  const es = new EventSource("/api/events");
  for (const name of ["episode", "feeds", "model_download", "gpu_pack", "sync", "anki", "youtube_watch", "youtube_find", "app_link", "reels", "reels_collections", "stt", "update", "vowels"]) {
    es.addEventListener(name, (e) => emit(name, JSON.parse(e.data)));
  }
  es.onopen = () => emit("reconnected", {});
}

// ---------- toasts & notifications ----------
export function toast(message, { error = false, action, timeout = 5000 } = {}) {
  const el = h(`<div class="toast${error ? " error" : ""}"><span></span></div>`);
  el.firstChild.textContent = message;
  if (action) {
    const b = h(`<button type="button"></button>`);
    b.textContent = action.label;
    b.onclick = () => { action.run(); el.remove(); };
    el.append(b);
  }
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), error ? timeout * 2 : timeout);
  return el; // so a caller can add to it (the game puts a pixel icon in front)
}

export function requestNotifications() {
  try {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  } catch { /* unsupported */ }
}

/** A browser notification for a chat message (the desktop server opened in a browser). */
function webNotification({ friend, title, text }) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, { body: text, icon: "/icons/icon-256.png", tag: `chat-${friend}` });
  n.onclick = () => { window.focus(); location.hash = `#/chat/${friend}`; };
}

function notify(title, body, url) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body, icon: "/icons/icon-256.png" });
      n.onclick = () => { window.focus(); location.hash = url; };
    }
  } catch { /* unsupported in this webview */ }
}

/** Showing only the player for one video, inside another app (/embed?v=<id>&t=<s>: Onyx Calendar's
 * News panel; see bootEmbed and app/applink.py). Nothing else of the app is shown, and messages
 * meant for the app's own window (finished transcriptions, links, the YouTube window) are left to it. */
export const EMBED = location.pathname === "/embed";

on("episode", (e) => {
  if (EMBED) return;
  if (e.status === "done" && e.title) {
    toast(`Transcription finished: ${e.title}`, { action: { label: "Open", run: () => (location.hash = `#/episode/${e.id}`) } });
    notify("Transcription finished", e.title, `#/episode/${e.id}`);
  } else if (e.status === "failed" && e.title) {
    toast(`Transcription failed: ${e.title}. ${e.error || ""}`, { error: true });
    notify("Transcription failed", e.title, `#/`);
  }
});

// ---------- platform hooks (the Android app's shell provides its own versions) ----------
export const platform = "desktop";

/** The window a reel plays in (see pages/reels.js). Reels play on the phone; the computer has none. */
export function reelSurface() {
  return null;
}

/** URL the <audio> (or <video>) element should play for an episode. */
export async function audioUrl(episodeId) {
  return `/api/episodes/${episodeId}/audio`;
}

/** Google ID token for the online features (the desktop gets it from its Drive sign-in). */
export async function googleIdToken() {
  const r = await api("/sync/id-token", { method: "POST" });
  return { token: r.token };
}

/** Small physical feedback for an action ("tick" or "success"). Phones vibrate; a computer
 * has nothing to vibrate, so this does nothing here (the visual feedback is in the styles). */
export function buzz() {}

/** The text on the clipboard (the review card's Paste button). */
export async function readClipboard() {
  return navigator.clipboard.readText();
}

// ---------- audio clips of shared words ----------
/** The clip to send with a word: {blob, times}, or null when the word has no audio here. */
export async function shareClip(word) {
  try {
    const r = await api(`/vocab/${word.id}/share-clip`);
    const bytes = Uint8Array.from(atob(r.audio), (ch) => ch.charCodeAt(0));
    return { blob: new Blob([bytes], { type: "audio/ogg" }), times: r.times };
  } catch {
    return null;
  }
}

/** Keep the clip that came with a shared word (after the word itself was saved). */
export async function saveClip(vocabId, blob, times) {
  const q = new URLSearchParams({ start: times.start, end: times.end, sent_start: times.sent_start, sent_end: times.sent_end });
  const res = await fetch(`/api/vocab/${vocabId}/clip?${q}`, { method: "PUT", body: blob });
  if (!res.ok) throw new Error("Couldn't save the audio for that word.");
}

/** Address the vocab page plays for a word that has its own clip. */
export async function clipUrl(word) {
  return `/api/vocab/${word.id}/clip`;
}

/** Download a web page for "Add a webpage": {url, html}. The desktop's server fetches it. */
export async function fetchPage(url) {
  return api(`/web/fetch?url=${encodeURIComponent(url)}`);
}

/** One address on itunes.apple.com (Apple's podcast charts, for Trending), as parsed JSON.
 * The app's own server (on this computer) fetches it. */
export async function appleJson(url) {
  return api(`/discover/apple?url=${encodeURIComponent(url)}`);
}

/** One web request to youtube.com, to read a video's captions: {status, text}. A page may
 * not call YouTube directly, so the app's own server (on this computer) makes the request. */
export async function ytRequest(req) {
  return api("/youtube/request", { method: "POST", body: req });
}

/** Open YouTube in the app's own browser window, on what is popular this week in the language
 * being studied (see youtube-home.js). Tapping a video there opens it in Tamkeen's player (the
 * window asks for it through the "youtube_watch" event, handled below). */
export async function openYouTube(address = "") {
  // `address`: a YouTube page to open on instead (a followed channel's videos).
  const start = address || youtubeHome(studyLanguage(), { country: chosenCountry(studyLanguage()), handmade: handmadeOnly() });
  const bridge = window.pywebview && window.pywebview.api;
  if (bridge && bridge.open_youtube) {
    const r = await bridge.open_youtube(start);
    if (r && r.error) throw new Error(r.error);
    return;
  }
  // Running in an ordinary browser (development mode): there is no second window to control.
  window.open(start, "_blank", "noopener");
  toast("Copy the link of the video you want and paste it under “Add a webpage”.");
}

// A video was tapped in the YouTube window: add it, show it, and tell the window how it went
// (it is waiting, to say "No captions available" or to step aside).
on("youtube_watch", async ({ token, video_id, at }) => {
  if (EMBED) return;
  let result;
  try {
    // `at`: the moment that came with the video (a caption search result's; see filmot.js).
    const { watchFound } = await import("./filmot.js");
    const ep = await watchFound(video_id, at ?? null);
    result = { ok: true, title: ep.title };
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  api("/youtube/watch-result", { method: "POST", body: { token, ...result } }).catch(() => {});
});

// "Find in a video": the Filmot results page in the browser window listed these videos, top first;
// keep the first whose captions say the word (see filmot.js), and tell the window how it went.
on("youtube_find", async ({ token, candidates }) => {
  if (EMBED) return;
  let result;
  try {
    const { findFromResults } = await import("./filmot.js");
    result = await findFromResults(candidates || []);
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  api("/youtube/watch-result", { method: "POST", body: { token, ...result } }).catch(() => {});
});

// tamkeen://watch?v=<id> links from other apps (Onyx Calendar's News; see app/applink.py): the
// server keeps them until this page asks, once it has loaded and whenever "app_link" says one came.
let openingLinks = false;
async function openLinks() {
  if (openingLinks || EMBED) return;
  openingLinks = true;
  try {
    const { links } = await api("/app/pending-links", { method: "POST" });
    const link = links && links[links.length - 1]; // several at once: the newest one
    if (!link) return;
    if (link.chat) { location.hash = `#/chat/${link.chat}`; return; } // a chat notification clicked (app/notify.py)
    const s = state.status && state.status.settings;
    if (!s || !s.welcome_seen || !s.study_language) {
      toast("Choose the language you're learning first, then open the video again.", { error: true });
      return;
    }
    const busy = toast("Getting captions…");
    try {
      const { watchVideo } = await import("./youtube.js");
      await watchVideo(link.video_id, link.at ?? null);
    } catch (e) {
      toast(e.message || "Couldn't open this video.", { error: true }); // e.g. "No captions available for this video."
    } finally {
      busy.remove();
    }
  } catch (e) {
    console.warn("Couldn't collect links from other apps", e);
  } finally {
    openingLinks = false;
  }
}
on("app_link", openLinks);

/** Open the in-app web browser (a second window with an "Import Page" button). `find`: opened by
 * "Find in a video" on a word, so its script takes the top result of the search itself.
 * `signIn`: opened to sign in somewhere, not to read, so without the "Import Page" button. */
export async function openBrowser(url = "", { find = false, signIn = false } = {}) {
  const bridge = window.pywebview && window.pywebview.api;
  if (bridge && bridge.open_browser) {
    // `find` is {lang, values, names}: the language whose captions the search is for (see filmot.js).
    const r = await (find ? bridge.open_browser(url, find)
                     : signIn ? bridge.open_browser(url, false, false) : bridge.open_browser(url));
    if (r && r.error) throw new Error(r.error);
    return;
  }
  // Running in an ordinary browser (development mode): there is no second window to control.
  const home = `/browser-home.html?lang=${encodeURIComponent(state.status?.settings?.study_language || "")}`;
  window.open(url && /^https?:/i.test(url) ? url : home, "_blank", "noopener");
  toast("Copy the address of the page you want and paste it under “Add a webpage”.");
}

/** Open Instagram's sign-in page in the in-app browser. (On the phone that browser closes by itself
 * once signed in. On the computer reels sign in through the Instagram window the app opens itself.) */
export async function openInstagramSignIn() {
  return openBrowser("https://www.instagram.com/accounts/login/", { signIn: true });
}

/** Add one of the user's own video files. Resolves to the new episode. */
export function uploadVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/videos?filename=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status < 300) resolve(data);
      else reject(new Error((data && data.detail) || `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: the app's server didn't respond."));
    xhr.send(file);
  });
}

// ---------- downloads ----------
export async function download(url, filename) {
  const bridge = window.pywebview && window.pywebview.api;
  if (bridge && bridge.save_file) {
    const r = await bridge.save_file(url, filename);
    if (r && r.ok) toast(`Saved to ${r.path}`);
    else if (r && r.error) toast(r.error, { error: true });
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------- status, theme, settings ----------
export const state = { status: null };

export async function loadStatus() {
  state.status = await api("/status");
  applySettings(state.status.settings);
  const banner = document.getElementById("banner");
  banner.hidden = state.status.ffmpeg_ok;
  if (!state.status.ffmpeg_ok) banner.textContent = state.status.ffmpeg_message;
  return state.status;
}

export function applySettings(s) {
  const root = document.documentElement;
  if (s.theme === "light" || s.theme === "dark") root.dataset.theme = s.theme;
  else delete root.dataset.theme;
  root.style.setProperty("--ar-size", `${s.font_size || 26}px`);
  root.style.setProperty("--page-size", `${s.page_font_size || 17}px`);
  setStudyLanguage(s.study_language);
  if (state.status) state.status.settings = s;
}

export async function saveSettings(values) {
  values = withLearningList(values); // a language switched to stays on the list of languages being learned
  const s = await api("/settings", { method: "PATCH", body: values });
  applySettings(s);
  return s;
}

// ---------- router ----------
const routes = [
  [/^$/, home, () => ({})],
  [/^library$/, library, () => ({})],
  [/^feed\/(\d+)$/, library, (m) => ({ feedId: Number(m[1]) })],
  [/^discover$/, discover, () => ({})],
  [/^reels$/, reels, () => ({})],
  [/^reels\/play$/, reels, () => ({ play: true })],
  [/^books$/, books, () => ({})],
  [/^episode\/(\d+)$/, player, (m) => ({ id: Number(m[1]) })],
  [/^vocab$/, vocab, () => ({})],
  [/^search$/, search, () => ({})],
  [/^settings$/, settings, () => ({})],
  [/^about$/, about, () => ({})],
  [/^friends$/, friends, () => ({})],
  [/^chat\/([\w-]+)$/, chat, (m) => ({ friendId: m[1] })],
  [/^welcome$/, welcome, () => ({ step: "welcome" })],
  [/^setup$/, welcome, () => ({ step: "setup" })],
];

let cleanup = null;
let routeTurn = 0; // counts page changes, so a page that finishes loading late knows it was left

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  return { path, query: new URLSearchParams(qs || "") };
}

async function route() {
  const { path, query } = parseHash();
  if (EMBED && !/^episode\/\d+$/.test(path)) return; // only the player, never the rest of the app
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  hideMenu();
  const view = document.getElementById("view");
  let match = null;
  for (const [re, mod, params] of routes) {
    const m = path.match(re);
    if (m) { match = [mod, { ...params(m), query }]; break; }
  }
  if (!match) { view.innerHTML = ""; location.hash = "#/"; return; }
  const [mod, params] = match;
  // Moving around inside the Library (another kind, podcast or filter): the page on screen stays
  // until the new one has loaded, then the two swap in one go, with the side list where it was
  // scrolled to. Emptying the page first showed it half built for a moment, then jumping.
  const inPlace = mod === library && !!view.querySelector(":scope > .library");
  const target = inPlace ? document.createElement("div") : view;
  if (!inPlace) {
    view.innerHTML = "";
    view.scrollTop = 0;
  }
  const navKey = mod === home ? "home" : mod === library || mod === discover || mod === reels || mod === books ? "library" : mod === vocab ? "vocab" : mod === settings ? "settings"
    : mod === about ? "about" : mod === friends || mod === chat ? "friends" : "";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
  const turn = ++routeTurn;
  try {
    const undo = (await mod.render(target, params)) || null;
    if (turn !== routeTurn) { if (undo) undo(); return; } // left while it was loading: tidy it away
    if (inPlace) {
      const sideTop = view.querySelector(".sidebar")?.scrollTop || 0;
      view.replaceChildren(...target.childNodes);
      const side = view.querySelector(".sidebar");
      if (side) side.scrollTop = sideTop;
    }
    cleanup = undo;
  } catch (e) {
    console.error(e);
    if (turn !== routeTurn) return; // a page that was already left: its failure isn't this page's
    view.innerHTML = `<div class="page"><div class="card"><h2>Something went wrong</h2><p class="muted"></p></div></div>`;
    view.querySelector("p").textContent = e.message;
  }
}

// ---------- context menu ----------
export function showMenu(x, y, label, items) {
  const menu = document.getElementById("ctxmenu");
  menu.innerHTML = "";
  if (label) {
    const l = h(`<div class="label ar"></div>`);
    l.textContent = label;
    setLang(l, detectLanguage(label));
    menu.append(l);
  }
  for (const item of items) {
    const b = h(`<button type="button" role="menuitem"></button>`);
    b.textContent = item.label;
    if (item.icon) b.insertAdjacentHTML("afterbegin", `${item.icon} `);  // one of icons.js's drawings, in front of the words
    b.onclick = () => { hideMenu(); item.run(); };
    menu.append(b);
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  menu.querySelector("button")?.focus({ preventScroll: true });
}
export function hideMenu() {
  document.getElementById("ctxmenu").hidden = true;
}
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#ctxmenu")) hideMenu();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideMenu(); });
window.addEventListener("blur", hideMenu);

// ---------- boot ----------
document.getElementById("global-search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get("q").trim();
  if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
});

/** /embed?v=<11-character id>[&t=<seconds>]: just this video's player and clickable captions, for
 * another app to show (embed.css lays it out for a narrow panel). The video is opened the way
 * "Open YouTube" opens one (the library's copy, or added). The host page is told how it went:
 * postMessage({source: "tamkeen", event: "ready" | "error", title | error}), when it is framed. */
async function bootEmbed() {
  const root = document.documentElement;
  root.classList.add("embed");
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/css/embed.css";
  document.head.append(css);
  const view = document.getElementById("view");
  const tell = (event, extra) => {
    try { if (window.parent !== window) window.parent.postMessage({ source: "tamkeen", event, ...extra }, "*"); } catch { /* not framed */ }
  };
  const say = (message, error = false) => {
    view.innerHTML = `<div class="embed-note${error ? " error" : ""}"><p></p></div>`;
    view.querySelector("p").textContent = message;
    if (error) tell("error", { error: message });
  };
  const q = new URLSearchParams(location.search);
  const id = q.get("v") || "";
  const t = (q.get("t") || "").trim();
  const at = /^[0-9]+(\.[0-9]+)?$/.test(t) && Number(t) < 1e6 ? Number(t) : 0;
  let s;
  try {
    s = await loadStatus();
    await startTranslating(s.settings.ui_language);
  } catch (e) {
    return say(e.message || "Tamkeen isn't answering.", true);
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return say("That isn't a YouTube video.", true);
  if (!s.settings.welcome_seen || !s.settings.study_language) {
    return say("Open Tamkeen once and choose the language you're learning, then try again.", true);
  }
  say("Getting captions…");
  let ep;
  try {
    const { getVideo } = await import("./youtube.js");
    ep = await getVideo(id);
  } catch (e) {
    return say(e.message || "Couldn't open this video.", true); // e.g. "No captions available for this video."
  }
  history.replaceState(null, "", `${location.pathname}${location.search}#/episode/${ep.id}${at > 0 ? `?t=${at}` : ""}`);
  window.addEventListener("hashchange", route);
  await route();
  tell("ready", { title: ep.title || "" });
}

async function boot() {
  connectEvents();
  if (EMBED) return bootEmbed();
  try {
    const s = await loadStatus();
    await startTranslating(s.settings.ui_language); // the app's own words in the user's language
    if (!s.settings.welcome_seen || !s.settings.study_language) { // first run: choose a language first
      if (!location.hash.startsWith("#/welcome") && !location.hash.startsWith("#/setup")) location.hash = "#/welcome";
    } else if (!s.model_ready && !location.hash.startsWith("#/settings") && !location.hash.startsWith("#/about")) {
      location.hash = "#/setup";
    }
  } catch (e) {
    toast(e.message, { error: true });
  }
  window.addEventListener("hashchange", route);
  initScrollHints(); // rows that scroll sideways show that they do
  route();
  openLinks(); // a link this run was started with (or that came while the page was loading)
  // A friend's message while this window isn't on screen: the system's notification (chatnotify.js).
  import("./chatnotify.js").then(({ startChatNotifications }) => startChatNotifications({
    system: ({ friend, title, text }) => (window.pywebview
      ? api("/notify", { method: "POST", body: { friend, title, text } }) // the app's window: the server shows it
      : webNotification({ friend, title, text })),                          // opened in a browser
    ask: async () => { if (!window.pywebview) requestNotifications(); },
  })).catch(() => {});
  mountLanguageSwitch(document.querySelector(".topbar .brand")); // "which language am I learning now"
  startBadge();
  // After each sync, pass on the creature game's state in case another device saved a newer one.
  on("sync", () => api("/settings").then((s) => {
    window.dispatchEvent(new CustomEvent("tamkeen:game", { detail: s.game_state }));
  }).catch(() => {}));
  if (state.status && state.status.desktop) startAppBadge();
  // A newer version? Tell the user once per start; a packaged build can install it in place.
  setTimeout(() => {
    api("/updates/check").then((r) => {
      if (r && r.update_available) offerUpdate(r);
    }).catch(() => {});
  }, 2500);
}

/** The number of cards left to review today on the taskbar button / Dock icon (app/appbadge.py):
 *  on opening, after each answer, after a sync, and every 10 minutes (for the new day). */
function startAppBadge() {
  let timer = 0;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const { reviewsLeft } = await import("./pages/review.js");
        const { counts } = await reviewsLeft(1);
        await api("/app-badge", { method: "POST", body: { count: counts[0] } });
      } catch { /* not important enough to bother the user */ }
    }, 800);
  };
  window.addEventListener("tamkeen:reviewed", refresh);
  on("sync", refresh);
  setInterval(refresh, 600000);
  refresh();
}

/** The update popup for a /updates/check answer (also used by Settings and About). */
export function offerUpdate(r) {
  document.getElementById("update-notice")?.remove();
  return showUpdateNotice({ latest: r.latest, current: r.current, url: r.url,
                            install: r.can_install ? installUpdate : null });
}

/** Download and install the newest release (app/updates.py); the app then closes and reopens. */
function installUpdate(report) {
  return new Promise((resolve, reject) => {
    const off = on("update", (s) => {
      report(s);
      if (s.stage === "error") { off(); reject(new Error(s.error)); }
    });
    api("/updates/install", { method: "POST" }).then((r) => {
      if (!r.ok) { off(); reject(new Error(r.error)); }
    }).catch((e) => { off(); reject(e); });
  });
}

boot();
