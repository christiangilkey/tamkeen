// Phone app shell. Same exports as the desktop's web/js/app.js, so the shared screens
// (library, player, vocab, search) import from "../app.js" and work unchanged.

import * as home from "./pages/home.js";
import * as library from "./pages/library.js";
import * as player from "./pages/player.js";
import * as vocab from "./pages/vocab.js";
import * as search from "./pages/search.js";
import * as settingsPage from "./pages/settings.js";
import * as welcome from "./pages/welcome.js";
import * as friends from "./pages/friends.js";
import * as chat from "./pages/chat.js";
import * as discover from "./pages/discover.js";
import * as reels from "./pages/reels.js";
import * as books from "./pages/books.js";
import * as webYouTube from "./web-youtube.js";
import * as webSites from "./web-sites.js";
import { webReelSurface } from "./web-reels.js";
import { mountInstallButton } from "./web-install.js";
import { startBadge } from "./social.js";
import { initSwipe } from "./swipe.js";
import { isNewer, showUpdateNotice } from "./updatenotice.js";
import { icon } from "./icons.js";
import { detectLanguage, setLang, setStudyLanguage, studyLanguage } from "./languages.js";
import { chosenCountry, handmadeOnly, youtubeHome } from "./youtube-home.js";
import { startTranslating, translateHtml } from "./i18n.js";
import { isSaved, savedSites, setSite } from "./browser-sites.js";
import { addUploadedVideo, checkFeeds, fillLanguages, handle, wordLang } from "./backend.js";
import { onJob } from "./transcribe-service.js";
import { onReels } from "./reels-phone.js";
import { anki, onAnki, requestAnkiSync } from "./anki-phone.js";
import { RECONNECT_EVENT, accessToken, drive, reconnect } from "./drive.js";
import { mountLanguageSwitch, withLearningList } from "./components/langswitch.js";
import { loadParked, maybeRestore, parked } from "./reset.js";
import { App, AppBadge, AppUpdater, Filesystem, GoogleDriveAuth, NativeHttp, Share, TamkeenClipboard, GOOGLE_WEB_CLIENT_ID, finalUrl, isIOS, isNative, isWeb, webFetch } from "./native.js";
import { audio as audioStore, kv, lib, loadLibrary, loadSettings, saveLibrary, saveSettingsPatch, settings } from "./store.js";
import { audioCopy, driveFileId, onSync, requestSync, syncNow } from "./sync.js";
import { newUid, toSrt, toTxt, toVtt, vocabAnki, vocabCsv } from "./shared-logic.js";
import { vocabDeck } from "./anki-export.js";
import { ankiCard } from "./review/fsrs.js";
import { initScrollHints } from "./scrollhint.js";

export const platform = "android";

if (isIOS) {
  // An iPhone zooms the whole page in when a small text box is tapped, and leaves it zoomed.
  // Capping the zoom stops that (Android's app view never zooms in the first place).
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.content += ", maximum-scale=1";
  document.documentElement.classList.add("ios");
}

// ---------- the reel window ----------
// A reel plays from Instagram's embed page in a second, native window laid exactly over a box
// on the app's screen (ReelSurface.java). web/js/reel-embed.js runs inside that page.
let reelScript = null;

/** The window a reel plays in: open/load a page, tell it to play/pause/seek, hear where it is. */
export function reelSurface() {
  if (isWeb) return webReelSurface(); // an ordinary video player (see web-reels.js)
  if (!isNative) return previewReelSurface();
  const hearers = new Set();
  let handle = null;
  return {
    async open({ url, top, height }) {
      if (reelScript === null) {
        // Two scripts, one after the other: reel-page.js acts on a reel's ordinary page (and steps
        // aside on an embed page), reel-embed.js on an embed page (and steps aside if the first acted).
        const read = async (name) => { try { return await (await fetch(new URL(name, import.meta.url))).text(); } catch { return ""; } };
        reelScript = `${await read("./reel-page.js")}\n${await read("./reel-embed.js")}`;
      }
      handle = await GoogleDriveAuth.addListener("reelState", ({ state }) => {
        let s;
        try { s = JSON.parse(JSON.parse(state)); } catch { return; } // the page hasn't started yet
        if (s && typeof s === "object") for (const fn of hearers) fn(s);
      });
      await GoogleDriveAuth.reelOpen({ url, script: reelScript, top, height });
    },
    load: (url) => GoogleDriveAuth.reelLoad({ url }),
    do: (what, time = 0) => GoogleDriveAuth.reelRun({
      script: `window.__tkReelDo && window.__tkReelDo(${JSON.stringify(what)}, ${Number(time) || 0})` }).catch(() => {}),
    layout: ({ top, height }) => GoogleDriveAuth.reelLayout({ top, height }).catch(() => {}),
    close() {
      if (handle) handle.remove();
      GoogleDriveAuth.reelClose().catch(() => {});
    },
    onState(fn) { hearers.add(fn); return () => hearers.delete(fn); },
  };
}

/** Development preview in a browser: a stand-in that "plays" a 20-second clock, so the screen
 * around the reel (words, popup, next reel) can be tried without a phone. */
function previewReelSurface() {
  const hearers = new Set();
  let box = null;
  let timer = 0;
  let s = null;
  // A reel's ordinary page (not its embed page) "asks for a sign-in" the first time it is opened,
  // like a phone that isn't signed in to Instagram yet, and plays when it is tried again.
  const asked = new Set();
  const start = (url) => {
    const page = new URL(url).pathname;
    const wall = !page.includes("/embed") && !asked.has(page);
    if (wall) asked.add(page);
    s = { ready: !wall, t: 0, d: 20, paused: wall, ends: 0, nav: "", error: wall ? "signin" : "", page };
    if (box) box.querySelector("span").textContent = wall ? `Preview: Instagram would ask for a sign-in here (${page})` : `Preview: ${page} would play here`;
  };
  return {
    async open({ url, el }) {
      box = document.createElement("div");
      box.style.cssText = "color:#aaa;text-align:center;font-size:13px;display:flex;flex-direction:column;gap:10px;align-items:center";
      box.innerHTML = `<span></span><div><button type="button">‹ Previous</button> <button type="button">Next ›</button></div>`;
      const [prev, next] = box.querySelectorAll("button");
      let presses = 0;
      prev.onclick = () => { s.nav = `prev:${++presses}`; };
      next.onclick = () => { s.nav = `next:${++presses}`; };
      el.append(box);
      start(url);
      timer = setInterval(() => {
        if (!s.paused) { s.t += 0.12; if (s.t >= s.d) { s.t = 0; s.paused = true; s.ends++; } }
        for (const fn of hearers) fn({ ...s });
      }, 120);
    },
    async load(url) { start(url); },
    do(what, time = 0) { if (what === "pause") s.paused = true; else if (what === "play") s.paused = false; else if (what === "seek") s.t = time; },
    layout() {},
    close() { clearInterval(timer); if (box) box.remove(); },
    onState(fn) { hearers.add(fn); return () => hearers.delete(fn); },
  };
}

// ---------- API (answered on the phone) ----------
export async function api(path, { method = "GET", body } = {}) {
  return handle(path, method, body);
}

// ---------- helpers (identical to desktop) ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export function fmtDate(ts) {
  return ts ? new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
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

// ---------- events ----------
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
export function emit(event, data) {
  for (const fn of listeners.get(event) || []) { try { fn(data); } catch (e) { console.error(e); } }
}

// ---------- toasts ----------
export function toast(message, { error = false, action, timeout = 4000 } = {}) {
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
}
export function requestNotifications() { /* toasts are used on the phone */ }

// ---------- audio ----------
const objectUrls = new Map();
/** Synced audio copy (exactly what was transcribed), downloaded on first play; else the original. */
export async function audioUrl(uid) {
  const ep = lib.episodes.find((e) => e.uid === uid);
  if (ep && (ep.audio_url || "").startsWith("drive:")) return videoUrl(ep);
  if (ep && ep.remote_audio && settings.signed_in) {
    if (objectUrls.has(uid)) return objectUrls.get(uid);
    try {
      toast("Loading audio…");
      const blob = await audioCopy(uid);
      if (blob) {
        const url = URL.createObjectURL(blob);
        objectUrls.set(uid, url);
        return url;
      }
    } catch (e) {
      toast(`Couldn't load the synced audio, streaming the original instead. (${e.message})`, { error: true });
    }
  }
  return ep ? ep.audio_url : "";
}

// ---------- online features (friends, sharing) ----------

/** Google ID token for the online features. Google gets a hash of a one-time code (nonce) and
 * Supabase the code itself, so a token can't be replayed by anyone else. */
export async function googleIdToken({ host = null } = {}) {
  if (isWeb) return webIdToken(host);
  if (!isNative) throw new Error("Connecting works in the installed app.");
  if (isIOS) {
    // The iPhone's ID token comes with its Google sign-in (issued for the app's "iOS" client,
    // which Supabase also trusts) and carries no one-time code.
    const r = await GoogleDriveAuth.getIdToken({});
    return { token: r.idToken };
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const r = await GoogleDriveAuth.getIdToken({ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: hashed });
  return { token: r.idToken, nonce };
}

// ---------- the web app's sign-in for Friends: Google's own page, and back ----------
// Google's pop-up button is unreliable in an app opened from the home screen (pop-ups are blocked
// or lost), so the web app goes to Google's sign-in page itself and Google sends it straight back
// to this address with the sign-in (an ID token) after the "#". Needs this page's address among the
// Web client's "Authorized redirect URIs" in Google Cloud.
const WEB_SIGNIN_KEY = "tk_web_signin";

function randomHex(n) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function goToGoogleSignIn() {
  const nonce = randomHex(16);
  const state = randomHex(16);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  try { sessionStorage.setItem(WEB_SIGNIN_KEY, JSON.stringify({ nonce, state, back: location.hash || "#/friends" })); } catch { /* storage off */ }
  const q = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID, response_type: "id_token", scope: "openid email",
    redirect_uri: location.origin + location.pathname, nonce: hashed, state, prompt: "select_account",
  });
  if (settings.google_email) q.set("login_hint", settings.google_email);
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** The web app: sign in to Friends. With `host`, a "Sign in with Google" button is put there and
 *  tapping it goes to Google; without, it goes at once. Either way the page leaves for Google, so
 *  this never resolves: finishWebSignIn() completes the sign-in when Google sends the learner back. */
function webIdToken(host = null) {
  if (!host) { goToGoogleSignIn(); return new Promise(() => {}); }
  const b = h(`<button type="button" class="primary google-signin">${GOOGLE_G} Sign in with Google</button>`);
  b.onclick = () => { b.disabled = true; goToGoogleSignIn(); };
  host.append(b);
  return new Promise(() => {});
}

const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style="vertical-align:-3px;background:#fff;border-radius:50%;padding:2px"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.2-8.4 2.2-6.4 0-11.7-4.1-13.6-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>`;

/** Back from Google's sign-in page (the address ends "#id_token=…" or "#error=…"): put the screen
 *  the learner was on back, and finish signing in to Friends with what Google sent. */
async function finishWebSignIn() {
  const answer = new URLSearchParams(location.hash.slice(1));
  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(WEB_SIGNIN_KEY) || "null"); sessionStorage.removeItem(WEB_SIGNIN_KEY); } catch { /* storage off */ }
  history.replaceState(null, "", location.pathname + location.search + ((kept && kept.back) || "#/friends"));
  if (answer.get("error")) { toast(answer.get("error") === "access_denied" ? "Sign-in was cancelled." : "Google didn't sign you in.", { error: true }); return; }
  if (!kept || answer.get("state") !== kept.state) { toast("That sign-in came back without being asked for here. Try again.", { error: true }); return; }
  try {
    const social = await import("./social.js");
    await social.connectWithIdToken({ token: answer.get("id_token"), nonce: kept.nonce });
    toast("Signed in to Friends.");
    emit("feeds", { refreshed: true });
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch (e) {
    toast(e.message || "Couldn't sign in to Friends.", { error: true });
  }
}

// ---------- audio clips of shared words ----------
// A word a friend shared keeps its own short clip (stored on the phone as "clip:<word id>" and
// in Drive as c_<word id>.ogg so the computer has it too).
const clipKey = (uid) => `clip:${uid}`;

/** The clip to send with a word: only words that already have their own clip (ones a friend
 * shared). Cutting a new clip out of an episode is done on the computer. */
export async function shareClip(word) {
  if (!word.clip) return null;
  const blob = await storedClip(word.id);
  return blob ? { blob, times: { start: word.start, end: word.end, sent_start: word.sent_start, sent_end: word.sent_end } } : null;
}

async function storedClip(uid) {
  let blob = await audioStore.get(clipKey(uid));
  if (!blob && settings.signed_in) {
    const id = await driveFileId(`c_${uid}.ogg`).catch(() => null);
    if (id) {
      blob = await drive.downloadBlob(id);
      await audioStore.put(clipKey(uid), blob);
    }
  }
  return blob || null;
}

/** Keep the clip that came with a shared word. */
export async function saveClip(uid, blob, times) {
  const v = lib.vocab.find((x) => x.uid === uid);
  if (!v) return;
  await audioStore.put(clipKey(uid), blob);
  Object.assign(v, { clip: 1, start: times.start, end: times.end, sent_start: times.sent_start, sent_end: times.sent_end,
                     updated_at: Date.now() / 1000 });
  const pending = new Set((await kv.get("pending_clips")) || []);
  pending.add(uid);
  await kv.set("pending_clips", [...pending]);
  saveLibrary();
  requestSync();
}

const clipUrls = new Map();
/** Address the vocab page plays for a word that has its own clip. */
export async function clipUrl(word) {
  if (clipUrls.has(word.id)) return clipUrls.get(word.id);
  const blob = await storedClip(word.id);
  if (!blob) throw new Error("This word's audio isn't on this phone yet. Sync and try again.");
  const url = URL.createObjectURL(blob);
  clipUrls.set(word.id, url);
  return url;
}

// ---------- feedback ----------
/** A short vibration for an action: "tick" for small things, "success" for a saved word.
 * Can be switched off in Settings (many people prefer none). */
export function buzz(kind = "tick") {
  if (settings.haptics === false || !navigator.vibrate) return;
  try { navigator.vibrate(kind === "success" ? [14, 50, 22] : 8); } catch { /* not supported */ }
}

/** The text on the clipboard (the review card's Paste button). Android's web view may refuse a page
 * that reads it, so on Android the phone's own clipboard is asked (ClipboardPlugin.java). */
export async function readClipboard() {
  if (TamkeenClipboard) return (await TamkeenClipboard.read()).text || "";
  return navigator.clipboard.readText();
}

// ---------- web pages ----------
/** Download a web page for "Add a webpage": {url, html}. */
export async function fetchPage(url) {
  let address = String(url || "").trim();
  if (address && !/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) address = `https://${address}`;
  if (!/^https?:\/\/[^\s/]+/i.test(address)) throw new Error("Paste a web address, like https://example.com/article");
  if (isWeb) { // the web app reads the page through the go-between server
    let page;
    try { page = await webFetch(address, { headers: { "Accept-Language": "ar,en;q=0.8" } }); } catch {
      throw new Error("Couldn't reach that site. Check the address and your connection.");
    }
    if (page.status >= 400) throw new Error(`The site answered with an error (${page.status}).`);
    return { url: finalUrl(page, address), html: await page.text() };
  }
  if (!isNative) throw new Error("Importing pages works in the installed Android app.");
  let res;
  try {
    res = await NativeHttp.get({ url: address, responseType: "text", connectTimeout: 15000, readTimeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
                 "Accept-Language": "ar,en;q=0.8" } });
  } catch (e) {
    throw new Error("Couldn't reach that site. Check the address and your connection.");
  }
  if (res.status >= 400) throw new Error(`The site answered with an error (${res.status}). Try “Open Web Browser” and use Import Page there.`);
  return { url: res.url || address, html: typeof res.data === "string" ? res.data : String(res.data || "") };
}

/** One address on itunes.apple.com (Apple's podcast charts, for Trending), as parsed JSON. */
export async function appleJson(url) {
  if (!/^https:\/\/itunes\.apple\.com\//.test(url)) throw new Error("Only requests to Apple's podcast directory are allowed here.");
  try {
    if (isNative) {
      const res = await NativeHttp.get({ url, connectTimeout: 15000, readTimeout: 30000 });
      if (res.status >= 400) throw new Error(String(res.status));
      return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    }
    // The web app, or a development preview in a browser. Apple's directory lets web pages ask it
    // directly (and turns most requests from Cloudflare's computers away), so no go-between here.
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    throw new Error("Couldn't reach Apple's podcast directory. Check your connection.");
  }
}

/** One web request to youtube.com, to read a video's captions: {status, text}. Made by the
 * phone itself (native code), so it isn't held back by the rules for web pages. */
export async function ytRequest({ url, method = "GET", headers = {}, body }) {
  if (isWeb) { // the web app asks YouTube through the go-between server
    let res;
    try {
      res = await webFetch(url, { method, headers, body: body === undefined || body === null ? undefined : body });
    } catch (e) {
      throw new Error("Couldn't reach YouTube. Check your connection.");
    }
    return { status: res.status, text: await res.text() };
  }
  if (!isNative) throw new Error("Adding YouTube videos works in the installed Android app.");
  let res;
  try {
    const json = /json/i.test(headers["Content-Type"] || "");
    res = await NativeHttp.request({ url, method, headers, responseType: "text", connectTimeout: 15000, readTimeout: 30000,
      data: body === undefined || body === null ? undefined : json ? JSON.parse(body) : body });
  } catch (e) {
    throw new Error("Couldn't reach YouTube. Check your connection.");
  }
  // Answers in JSON arrive already unpacked; the caller expects text.
  return { status: res.status, text: typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "") };
}

/** Open YouTube in the in-app browser, on what is popular this week in the language being
 * studied (see youtube-home.js). Tapping a video there opens it in Tamkeen's player. */
export async function openYouTube(address = "") {
  // `address`: a YouTube page to open on instead (a followed channel's videos).
  if (isWeb) { // a web page can't catch a video tapped on YouTube's own site, so its list is shown here
    location.hash = address ? `#/youtube?u=${encodeURIComponent(address)}` : "#/youtube";
    return;
  }
  return openBrowser(address || youtubeHome(studyLanguage(), { mobile: true, country: chosenCountry(studyLanguage()), handmade: handmadeOnly() }),
                     { reading: false });
}

/** web/js/youtube-browser.js as text, for the in-app browser to run inside YouTube's pages. */
async function youtubeBrowserScript() {
  try {
    const source = await (await fetch(new URL("./youtube-browser.js", import.meta.url))).text();
    // The page can't ask the app anything, so it is told up front which channels are followed
    // (for the Follow button it shows on a channel's page).
    const { followedChannels } = await import("./ytfollow.js");
    const names = followedChannels(settings.youtube_follows).map((c) => c.name);
    // With it travels the script for Filmot's caption search results (see filmot.js): each of
    // the two acts on its own website only.
    let filmot = "";
    try { filmot = await (await fetch(new URL("./filmot-browser.js", import.meta.url))).text(); } catch { /* that site just isn't handled */ }
    return `window.__tamkeenFollowing=${JSON.stringify(names)};${source}
;${filmot}`;
  } catch { return ""; }
}

/**
 * A YouTube link was tapped inside the app: the channel's picture, the title or a suggested video
 * in YouTube's embedded player, or a YouTube link on a friend's card. Android would hand it to
 * the phone's own browser; the app keeps it (GoogleDriveAuthPlugin.shouldOverrideLoad sends it
 * here). A video opens in Tamkeen's player; anything else, such as a channel's page, opens in
 * the in-app browser, where tapping a video opens it in the player too.
 */
export async function openYouTubeLink(url) {
  const { isYouTubeAddress, videoId } = await import("./ytcaptions.js");
  if (!isYouTubeAddress(url)) return;
  if (videoId(url)) {
    try {
      const { watchVideo } = await import("./youtube.js");
      await watchVideo(url);
      emit("feeds", { refreshed: true });
      return;
    } catch (e) {
      // No captions, most likely: it can still be watched on YouTube's own page, inside the app.
      toast(`${e.message || "Couldn't open this video here."} Opening it on YouTube instead.`);
    }
  }
  if (isWeb) { // no captions: watch it on YouTube itself
    window.open(url, "_blank", "noopener");
    return;
  }
  // The browser covers the player: stop what is playing underneath.
  try { if (window.__apsAudio) window.__apsAudio.pause(); } catch { /* nothing playing */ }
  await openBrowser(url, { reading: false });
}

/**
 * tamkeen://watch?v=<id> links from another app on the phone (Onyx Calendar's News; see applink.js):
 * Android opens the app with the link (AndroidManifest.xml), and the video opens in the player the
 * way one tapped on YouTube in the in-app browser does.
 */
let openingLink = false;
async function openTamkeenLink(url) {
  const { parseTamkeenLink } = await import("./applink.js");
  const link = parseTamkeenLink(url);
  if (!link || openingLink) return;
  if (!settings.welcome_seen || !settings.study_language) {
    toast("Choose the language you're learning first, then open the video again.", { error: true });
    return;
  }
  openingLink = true;
  try {
    if (GoogleDriveAuth) GoogleDriveAuth.closeBrowser().catch(() => {}); // the in-app browser would cover the player
    toast("Getting captions…");
    const { watchVideo } = await import("./youtube.js");
    await watchVideo(link.videoId, link.at);
    emit("feeds", { refreshed: true });
  } catch (e) {
    toast(e.message || "Couldn't open this video.", { error: true }); // e.g. "No captions available for this video."
  } finally {
    openingLink = false;
  }
}

let openingVideo = false;
let browserListening = false;
/** Open the in-app web browser (native screen with an "Import Page" button). `reading` false:
 * opened for something other than reading pages (YouTube), so without that button; a sign-in or
 * "Find in a video" browser never has it either. */
export async function openBrowser(url = "", { instagramSignIn = false, find = false, reading = true } = {}) {
  if (isWeb && reading && !instagramSignIn && !find && !/^https?:/i.test(url)) { // the popular websites page instead
    location.hash = "#/sites";
    return;
  }
  if (!isNative) {
    window.open(/^https?:/i.test(url) ? url : "https://www.google.com", "_blank", "noopener");
    toast("Copy the address of the page you want and paste it under “Add a webpage”.");
    return;
  }
  const { extractorSource, saveArticle } = await import("./pageimport.js");
  if (!browserListening) {
    browserListening = true;
    GoogleDriveAuth.addListener("pageImport", async ({ result }) => {
      let message;
      try {
        // The native side hands over the page's own answer, which is JSON inside a JSON string.
        let article = JSON.parse(result || "null");
        if (typeof article === "string") article = JSON.parse(article);
        const ep = await saveArticle(article);
        message = `Imported “${ep.title}” (${ep.words} words). It's in My webpages.`;
        emit("feeds", { refreshed: true });
      } catch (e) {
        message = e.message || "Couldn't import this page.";
      }
      GoogleDriveAuth.browserToast({ text: message }).catch(() => {});
    });
    // "Find in a video" (see filmot.js): the Filmot results page listed these videos, top first.
    // The first whose captions say the word becomes its source; then the browser closes.
    GoogleDriveAuth.addListener("youtubeFind", async ({ url: address }) => {
      if (openingVideo) return;
      openingVideo = true;
      try {
        GoogleDriveAuth.browserToast({ text: "Looking for the word in the top video…" }).catch(() => {});
        const list = String(new URL(address).searchParams.get("c") || "").split(",").filter(Boolean).map((part) => {
          const cut = part.lastIndexOf(".");
          return cut > 0 ? { id: part.slice(0, cut), at: Number(part.slice(cut + 1)) || 0 } : { id: part, at: 0 };
        });
        const { findFromResults } = await import("./filmot.js");
        const r = await findFromResults(list);
        if (r.ok) {
          emit("feeds", { refreshed: true });
          await GoogleDriveAuth.closeBrowser();
        } else {
          GoogleDriveAuth.browserToast({ text: r.error }).catch(() => {});
        }
      } catch (e) {
        GoogleDriveAuth.browserToast({ text: e.message || "Couldn't use these results." }).catch(() => {});
      } finally {
        openingVideo = false;
      }
    });
    // A video was tapped on YouTube (see youtube-browser.js): add it, then show it in the
    // app's own player, closing the browser. Without captions the browser stays open.
    // `at` is the moment that came with it, from a caption search result (see filmot.js).
    GoogleDriveAuth.addListener("youtubeVideo", async ({ id, at }) => {
      if (openingVideo) return;
      openingVideo = true;
      try {
        GoogleDriveAuth.browserToast({ text: "Getting captions…" }).catch(() => {});
        const { watchFound } = await import("./filmot.js");
        await watchFound(id, typeof at === "number" ? at : null);
        emit("feeds", { refreshed: true });
        await GoogleDriveAuth.closeBrowser();
      } catch (e) {
        GoogleDriveAuth.browserToast({ text: e.message || "Couldn't open this video." }).catch(() => {});
      } finally {
        openingVideo = false;
      }
    });
    // The Follow button on a channel's page (see youtube-browser.js): the same followed-channels
    // list as the player's button.
    GoogleDriveAuth.addListener("youtubeFollow", async ({ url }) => {
      try {
        const q = new URL(url).searchParams;
        const name = (q.get("name") || "").replace(/\s+/g, " ").trim();
        if (!name) return;
        const on = q.get("on") === "1";
        const { setFollow } = await import("./ytfollow.js");
        await saveSettings({ youtube_follows: setFollow(settings.youtube_follows,
          { name, id: q.get("id") || "", image: q.get("image") || "", lang: studyLanguage() }, on, Math.floor(Date.now() / 1000)) });
        emit("feeds", { refreshed: true });
        GoogleDriveAuth.browserToast({ text: on ? `Following ${name}. It's in your Library under YouTube.` : `Stopped following ${name}.` }).catch(() => {});
      } catch (e) {
        GoogleDriveAuth.browserToast({ text: e.message || "Couldn't follow this channel." }).catch(() => {});
      }
    });
    // The star in the browser's bar was pressed (do=toggle), or a site was taken off on the start
    // page itself (do=remove): change the saved list and hand the browser the new one.
    GoogleDriveAuth.addListener("browserSite", async ({ url }) => {
      try {
        const q = new URL(url).searchParams;
        const address = q.get("u") || "";
        const removing = q.get("do") === "remove";
        const on = removing ? false : !isSaved(settings.browser_sites, address);
        await saveSettings({ browser_sites: setSite(settings.browser_sites, { url: address, title: q.get("t") || "" },
                                                    on, Math.floor(Date.now() / 1000)) });
        await GoogleDriveAuth.browserSites({ sites: JSON.stringify(savedSites(settings.browser_sites)) });
        if (!removing) GoogleDriveAuth.browserToast({ text: on ? "Saved to your start page." : "Taken off your start page." }).catch(() => {});
      } catch (e) {
        GoogleDriveAuth.browserToast({ text: e.message || "Couldn't save this site." }).catch(() => {});
      }
    });
    // The browser was opened for signing in to Instagram, saw that the user now is, and closed itself.
    GoogleDriveAuth.addListener("instagramSignedIn", () => emit("instagram", { signed_in: true }));
  }
  // With no address, the browser opens on the app's start page: a search box and news sites
  // in the language being studied (handed over as one finished page, see browser-home.js).
  const { homeHtml } = await import("./browser-home.js");
  // The user's saved sites: drawn on the start page, and marked by the star in the browser's bar.
  const sites = savedSites(settings.browser_sites);
  await GoogleDriveAuth.browserSites({ sites: JSON.stringify(sites) }).catch(() => {});
  // Opened by "Find in a video": the Filmot script takes the top results by itself (filmot-browser.js).
  // `find` is {lang, values, names}: the language whose captions the search is for (see filmot.js).
  const pageScript = (find ? `window.__tamkeenFind=${JSON.stringify(find === true ? {} : find)};` : "") + await youtubeBrowserScript();
  await GoogleDriveAuth.openBrowser({ url, extractor: await extractorSource(), youtube: pageScript,
                                      home: translateHtml(homeHtml(settings.study_language || "", sites)),
                                      closeOnInstagramSignIn: !!instagramSignIn,
                                      forReading: !!reading && !instagramSignIn && !find });
}

/** Open Instagram's sign-in page in the app's own browser (which shares its sign-ins with the reel
 * window). The browser closes by itself once the user is signed in; "instagram" {signed_in: true}
 * is emitted then, so whatever was waiting for the sign-in can carry on. */
export async function openInstagramSignIn() {
  if (isWeb) throw new Error("Reels play in the installed app.");
  if (!isNative) { // development preview: pretend the sign-in was made
    setTimeout(() => emit("instagram", { signed_in: true }), 1200);
    return;
  }
  return openBrowser("https://www.instagram.com/accounts/login/", { instagramSignIn: true });
}

// ---------- own videos ----------
// Videos stream from the user's Drive through DriveMediaWebViewClient.java (on the iPhone,
// DriveMediaHandler.swift), which adds the sign-in token that a <video> element can't send itself.
async function refreshMediaToken() {
  if (!isNative || !settings.signed_in) return;
  try { await GoogleDriveAuth.setMediaToken({ token: await accessToken() }); } catch (e) { console.warn(e); }
}

async function videoUrl(ep) {
  if (!settings.signed_in) throw new Error("Sign in with Google (Settings) to watch videos stored in your Drive.");
  if (!ep.remote_audio) throw new Error("This video is still uploading from your computer.");
  if (isWeb) { // a browser can't add the sign-in to a video's address, so the video is fetched first
    if (objectUrls.has(ep.uid)) return objectUrls.get(ep.uid);
    const id = await driveFileId(ep.audio_url.slice("drive:".length));
    if (!id) throw new Error("The video isn't in your Google Drive any more.");
    toast("Loading video…");
    const url = URL.createObjectURL(await drive.downloadBlob(id));
    objectUrls.set(ep.uid, url);
    return url;
  }
  if (!isNative) throw new Error("Videos play in the installed app.");
  await refreshMediaToken();
  const id = await driveFileId(ep.audio_url.slice("drive:".length));
  if (!id) throw new Error("The video isn't in your Google Drive any more.");
  return isIOS ? `tkdrive://media/${id}` : `${location.origin}/_drive/${id}`;
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|wma|amr)$/i;

function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : null); };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

/** Upload a video to Drive; the computer transcribes it on its next sync. */
export async function uploadVideo(file, onProgress) {
  if (!settings.signed_in) throw new Error("Sign in with Google (Settings) first: your files are stored in your Drive.");
  // Video or audio: the file's type decides (the same button path serves both).
  const audioExt = (file.name.match(AUDIO_EXT) || [])[1];
  const audio = !!audioExt || (file.type || "").startsWith("audio/");
  const ext = audio ? audioExt : (file.name.match(VIDEO_EXT) || [])[1];
  if (!audio && !ext && !(file.type || "").startsWith("video/")) {
    throw new Error("Choose a video file (MP4, MOV, WebM, MKV, AVI, 3GP) or an audio file (MP3, M4A, WAV, OGG, Opus, FLAC, AAC).");
  }
  const suffix = `.${(ext || (audio ? "mp3" : "mp4")).toLowerCase()}`;
  const mime = file.type || (audio ? "audio/mpeg" : "video/mp4");
  const uid = `e${newUid().slice(1)}`;
  const driveName = `v_${uid}${suffix}`;
  const duration = await videoDuration(file);
  const meta = await drive.uploadLarge(driveName, file, mime, onProgress);
  const files = (await kv.get("drive_files")) || {};
  files[driveName] = meta;
  await kv.set("drive_files", files);
  const title = file.name.replace(/\.[^.]+$/, "") || (audio ? "Audio" : "Video");
  const ep = await addUploadedVideo({ uid, title, driveName, mime, duration, audio, file });
  return { ...ep, note: ep.here ? "It's being transcribed now." : "Your computer transcribes it the next time it syncs." };
}

// ---------- exports (share sheet) ----------
async function exportText(url) {
  let m;
  if ((m = url.match(/\/api\/episodes\/(\w+)\/export\/(txt|srt|vtt)$/))) {
    const t = await api(`/episodes/${m[1]}/transcript`);
    const segs = t.segments;
    return m[2] === "txt" ? toTxt(segs, t.episode.title) : m[2] === "srt" ? toSrt(segs) : toVtt(segs);
  }
  if ((m = url.match(/\/api\/vocab\/export\/(csv|anki)(?:\?ids=([^&]*))?$/))) {
    const items = vocabToExport(m[2]);
    return m[1] === "csv" ? vocabCsv(items) : vocabAnki(items);
  }
  throw new Error("Unknown export.");
}

/** The words an export covers: all of them in the language being learned (as the Vocab page and the
 *  computer's export count them), or exactly the ones shown on the vocab screen, in that order. */
function vocabToExport(ids) {
  const study = studyLanguage();
  const items = lib.vocab.filter((v) => !v.deleted && wordLang(v) === study).sort((a, b) => b.created_at - a.created_at);
  if (ids === undefined) return items;
  return decodeURIComponent(ids).split(",").map((uid) => items.find((v) => v.uid === uid)).filter(Boolean);
}

/** The Anki deck file (.apkg) for the vocab export, as bytes: cards, layout, font and audio. */
function exportDeck(url) {
  const m = url.match(/\/api\/vocab\/export\/apkg(?:\?ids=([^&]*))?$/);
  return vocabDeck(vocabToExport(m[1]), {
    asset: (path) => fetch(path),
    review: (settings.game_state && settings.game_state.review) || {},  // where each word stands in the battles
    // The vocab reviewer's answers decide the schedule of the words they cover.
    reviewed: (uid, today) => ankiCard((lib.reviews || {})[uid], today),
    // Each word goes to its language's deck, the same one the AnkiDroid sync uses.
    decks: anki.deckNames(), language: settings.study_language,
    // The audio a word's times refer to: its own clip (a word a friend shared), or the synced
    // copy of its episode. Other episodes (streamed originals, videos, pages) give no audio.
    audioFor: async (v) => {
      if (v.clip) return { key: clipKey(v.uid), load: () => storedClip(v.uid) };
      const ep = lib.episodes.find((e) => e.uid === v.episode_uid);
      if (!ep || !ep.remote_audio || (ep.audio_url || "").startsWith("drive:")) return null;
      return { key: ep.uid, load: () => audioCopy(ep.uid) };  // kept on the phone once played; else fetched from Drive
    },
  });
}

/** Where a new AnkiDroid card's audio comes from: the same answer as `audioFor` in exportDeck above.
 * (Written out a second time so that function stays as it was; the two can become one later.) */
async function wordAudio(v) {
  if (v.clip) return { key: clipKey(v.uid), load: () => storedClip(v.uid) };
  const ep = lib.episodes.find((e) => e.uid === v.episode_uid);
  if (!ep || !ep.remote_audio || (ep.audio_url || "").startsWith("drive:")) return null;
  return { key: ep.uid, load: () => audioCopy(ep.uid) };
}

/** Save bytes as a file the share sheet can hand to another app. Written in pieces: the bridge
 * to Android takes text, and one very long text would be slow. */
async function writeBytes(filename, bytes) {
  const STEP = 3 * 128 * 1024;
  let uri = "";
  for (let at = 0; at < bytes.length || at === 0; at += STEP) {
    let text = "";
    for (let i = at; i < Math.min(at + STEP, bytes.length); i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, at + STEP, bytes.length)));
    const part = { path: filename, data: btoa(text), directory: "CACHE" };
    if (at === 0) uri = (await Filesystem.writeFile(part)).uri;
    else await Filesystem.appendFile(part);
  }
  return uri;
}

export async function download(url, filename) {
  try {
    const deck = /\/api\/vocab\/export\/apkg/.test(url);
    const data = deck ? await exportDeck(url) : await exportText(url);
    if (isNative) {
      const uri = deck ? await writeBytes(filename, data)
        : (await Filesystem.writeFile({ path: filename, data, directory: "CACHE", encoding: "utf8" })).uri;
      await Share.share({ title: filename, files: [uri] });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: deck ? "application/octet-stream" : "text/plain;charset=utf-8" }));
      a.download = filename;
      a.click();
    }
  } catch (e) {
    if (!/cancel/i.test(e.message || "")) toast(e.message, { error: true });
  }
}

// ---------- settings & theme ----------
export const state = { status: { settings } };

export function applySettings(s) {
  const root = document.documentElement;
  // The web app is always dark (the owner's choice); the installed apps follow Settings → Theme.
  if (isWeb) root.dataset.theme = "dark";
  else if (s.theme === "light" || s.theme === "dark") root.dataset.theme = s.theme;
  else delete root.dataset.theme;
  root.style.setProperty("--ar-size", `${s.font_size || 26}px`);
  root.style.setProperty("--page-size", `${s.page_font_size || 17}px`);
  setStudyLanguage(s.study_language);
}
export async function saveSettings(values) {
  values = withLearningList(values); // a language switched to stays on the list of languages being learned
  const keyTimes = JSON.stringify(settings.key_times || {});
  const s = await saveSettingsPatch(values);
  // After Reset Tamkeen: signing in, or finishing the first screens, brings the library back.
  if (parked() && await maybeRestore(s)) { location.reload(); return s; }
  applySettings(s);
  if (JSON.stringify(s.key_times || {}) !== keyTimes) requestSync(5000); // an AI key changed: the other devices get it too
  if ("game_state" in values) requestSync(90000); // the creature reaches the other devices after studying
  if ("youtube_follows" in values) requestSync(30000); // so do followed channels
  if ("browser_sites" in values) requestSync(30000); // and sites saved to the browser's start page
  return s;
}
export async function loadStatus() {
  return state.status;
}

// ---------- context menu (shared player uses it) ----------
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
}
export function hideMenu() { document.getElementById("ctxmenu").hidden = true; }
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#ctxmenu")) hideMenu(); }, true);

// ---------- router ----------
const routes = [
  [/^$/, home, () => ({})],
  [/^library$/, library, () => ({})],
  [/^feed\/(\w+)$/, library, (m) => ({ feedId: m[1] })],
  [/^discover$/, discover, () => ({})],
  [/^reels$/, reels, () => ({})],
  [/^reels\/play$/, reels, () => ({ play: true })],
  [/^books$/, books, () => ({})],
  [/^youtube$/, webYouTube, () => ({})], // the web app's YouTube page (the apps use their own browser)
  [/^sites$/, webSites, () => ({})], // the web app's popular websites (the apps use their own browser)
  [/^episode\/(\w+)$/, player, (m) => ({ id: m[1] })],
  [/^vocab$/, vocab, () => ({})],
  [/^search$/, search, () => ({})],
  [/^settings$/, settingsPage, () => ({})],
  [/^welcome$/, welcome, () => ({})],
  [/^friends$/, friends, () => ({})],
  [/^chat\/([\w-]+)$/, chat, (m) => ({ friendId: m[1] })],
];
let cleanup = null;
let routeTurn = 0; // counts page changes, so a page that finishes loading late knows it was left

async function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  hideMenu();
  const view = document.getElementById("view");
  view.innerHTML = "";
  view.scrollTop = 0;
  let hit = routes.find(([re]) => re.test(path));
  if (!hit) { location.hash = "#/"; return; }
  const [re, mod, params] = hit;
  const key = mod === home ? "home" : mod === library || mod === discover || mod === reels || mod === webYouTube || mod === webSites || mod === books ? "library" : mod === vocab ? "vocab" : mod === search ? "search"
    : mod === settingsPage ? "settings" : mod === friends || mod === chat ? "friends" : "";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
  document.body.classList.toggle("in-player", mod === player || mod === chat || (mod === reels && path.startsWith("reels/play")));
  // The tab highlight and swipe animation move as soon as the section changes, not after its data loads.
  window.dispatchEvent(new Event("routed"));
  const turn = ++routeTurn;
  try {
    const undo = (await mod.render(view, { ...params(path.match(re)), query: new URLSearchParams(qs || "") })) || null;
    if (turn !== routeTurn) { if (undo) undo(); return; } // left while it was loading: tidy it away
    cleanup = undo;
  } catch (e) {
    console.error(e);
    if (turn !== routeTurn) return; // a page that was already left: its failure isn't this page's
    view.innerHTML = `<div class="page"><div class="card"><h2>Something went wrong</h2><p class="muted"></p></div></div>`;
    view.querySelector("p").textContent = e.message;
  }
}

// ---------- updates ----------
const RELEASES = "https://api.github.com/repos/christiangilkey/tamkeen/releases/latest";

/** On opening the app: if GitHub has a newer release than this build, show a popup linking to it. */
/** Also Settings' "Check for updates": `manual` says so, and the answer is returned for it to show
 *  ({current, latest, available} or {error}); on opening the app nothing is shown unless there is one. */
export async function checkForUpdate({ manual = false } = {}) {
  const { APP_VERSION } = await import("./version.js");
  if (isWeb) return { current: APP_VERSION, latest: APP_VERSION, available: false }; // a web page is always the latest
  try {
    if (!manual && (!APP_VERSION || APP_VERSION.startsWith("0.0.0"))) return { current: APP_VERSION }; // a test build
    const res = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return { current: APP_VERSION, error: `GitHub answered ${res.status}.` };
    const data = await res.json();
    const latest = String(data.tag_name || "").replace(/^v/, "");
    if (!isNewer(latest, APP_VERSION)) return { current: APP_VERSION, latest, available: false };
    const apk = (data.assets || []).find((a) => /^Tamkeen-.*-Android\.apk$/.test(a.name || "")
      && String(a.browser_download_url || "").startsWith(APK_FROM));
    document.getElementById("update-notice")?.remove();
    // The iPhone app is installed by AltStore (no App Store): say which file and how.
    const iphone = isIOS && (data.assets || []).some((a) => /^Tamkeen-.*-iPhone\.ipa$/.test(a.name || ""));
    showUpdateNotice({ latest, current: APP_VERSION, url: data.html_url,
                       install: !isIOS && AppUpdater && apk ? (report) => installApk(apk, report) : null,
                       note: iphone ? "Download the iPhone file (Tamkeen-…-iPhone.ipa) from the release page, then open it with AltStore. Your library stays as it is." : "" });
    return { current: APP_VERSION, latest, available: true };
  } catch {
    // offline, or GitHub unreachable: try again next time the app opens
    return { current: APP_VERSION, error: "Couldn't reach GitHub. Check your internet connection." };
  }
}

const APK_FROM = "https://github.com/christiangilkey/tamkeen/releases/download/";

/** "Update now": download the release's APK and open Android's installer on it. The first time,
 *  Android asks whether Tamkeen may install apps; the settings screen for that opens instead. */
async function installApk(apk, report) {
  const { allowed } = await AppUpdater.canInstall();
  if (!allowed) {
    await AppUpdater.openInstallSettings();
    throw new Error('Allow "Install unknown apps" for Tamkeen, come back, and tap Try again.');
  }
  const progress = await AppUpdater.addListener("updateProgress", ({ done, total }) =>
    report({ stage: "downloading", done, total: total > 0 ? total : apk.size || 0 }));
  try {
    const digest = String(apk.digest || "");
    await AppUpdater.downloadAndInstall({ url: apk.browser_download_url,
                                          sha256: digest.startsWith("sha256:") ? digest.slice(7) : "" });
    report({ stage: "installing", message: "Tap Update in Android's installer. Your library stays as it is." });
  } finally {
    progress.remove();
  }
}

// ---------- cards left today, outside the app ----------
/** Hands the phone the number of cards left to review today and on the next days (for midnight),
 *  for the app icon's number (Android: a silent notification, and the home-screen widget; iPhone:
 *  the icon's number). On opening, after each answer, after a sync, and on coming back to the app.
 *  The first time, the phone asks whether Tamkeen may show notifications (the number needs that).
 *  The web app, once added to the home screen or installed, puts today's number on its icon where
 *  the browser can (Chrome, Edge; Safari once notifications are allowed); it never asks. */
function startAppBadge() {
  const web = isWeb && typeof navigator.setAppBadge === "function";
  if (!AppBadge && !web) return;
  let timer = 0;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const { reviewsLeft } = await import("./pages/review.js");
        if (web) {
          const { counts } = await reviewsLeft(1);
          await (counts[0] > 0 ? navigator.setAppBadge(counts[0]) : navigator.clearAppBadge());
          return;
        }
        const { day, counts } = await reviewsLeft(7);
        await AppBadge.setCounts({ day, counts });
        let asked = false;
        try { asked = localStorage.getItem("badge_permission_asked") === "1"; } catch { /* private storage off */ }
        if (!asked && counts[0] > 0) {
          try { localStorage.setItem("badge_permission_asked", "1"); } catch { /* asked again next time */ }
          await AppBadge.allowNotification();
        }
      } catch { /* not important enough to bother the user */ }
    }, 800);
  };
  window.addEventListener("tamkeen:reviewed", refresh);
  on("sync", (s) => { if (s && s.state === "idle") refresh(); });
  if (App) App.addListener("resume", refresh);
  else {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    setInterval(refresh, 10 * 60 * 1000); // the web page left open past midnight
  }
  refresh();
}

// ---------- boot ----------
async function boot() {
  await loadParked(); // after Reset Tamkeen: the library is set aside until sign-in (reset.js)
  await loadSettings();
  await loadLibrary();
  applySettings(settings);
  fillLanguages(); // every podcast and word knows its language (only the one being learned is shown)
  await startTranslating(settings.ui_language); // the app's own words in the user's language
  // The web app, back from Google's sign-in page for Friends (see finishWebSignIn).
  if (isWeb && /(^|[#&])(id_token|error)=/.test(location.hash)) finishWebSignIn();
  if (!settings.welcome_seen || !settings.study_language) location.hash = "#/welcome"; // first run: choose a language
  // The app's own line icons in the tab bar and the search button (see icons.js).
  for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22);
  window.addEventListener("hashchange", route);
  initSwipe();
  initScrollHints(); // rows that scroll sideways show that they do
  route();
  mountLanguageSwitch(document.querySelector(".topbar .brand")); // "which language am I learning now"
  mountInstallButton(document.querySelector(".topbar")); // the web app: how to add it to the home screen
  if (isWeb) { // the web app's Drive pass ran out while nobody was tapping: one tap renews it (drive.js)
    // Google gives the web app an hour at a time, and renewing needs a tap. The owner found a bar
    // popping up over the player again and again (each sync that found the pass expired): now the
    // bar shows once per visit, briefly, and a small button stays in the top bar until it is tapped.
    const chip = h(`<button type="button" class="top-reconnect" aria-label="Reconnect Google" hidden>${icon("refresh", 15)}<span>Reconnect Google</span></button>`);
    chip.title = "Google gives the web app an hour at a time: tap to renew it, then syncing carries on";
    const search = document.querySelector(".topbar .top-search");
    if (search) search.before(chip); else document.querySelector(".topbar").append(chip);
    const renew = async () => {
      try { await reconnect(); chip.hidden = true; syncNow(); toast("Reconnected to Google."); }
      catch (e) { toast(e.message || "Couldn't reconnect to Google.", { error: true }); }
    };
    chip.onclick = renew;
    let told = false;
    window.addEventListener(RECONNECT_EVENT, () => {
      chip.hidden = false;
      if (told) return;
      told = true;
      toast("Your Google connection needs renewing.", { timeout: 8000, action: { label: "Reconnect Google", run: renew } });
    });
  }
  startBadge();
  setTimeout(() => checkForUpdate(), 3000);
  startAppBadge();
  // YouTube links tapped inside the app stay in the app (see openYouTubeLink).
  if (isNative) {
    GoogleDriveAuth.addListener("youtubeLink", ({ url }) => {
      openYouTubeLink(url).catch((e) => toast(e.message || "Couldn't open that YouTube page.", { error: true }));
    });
  }

  // Transcribing and reel picking done on this phone (cloud transcription) report the same
  // way the computer's server does, so the shared screens follow along unchanged.
  onJob((event) => {
    emit("episode", event);
    if (event.status === "done") { toast(`Transcript ready: ${event.title}`); emit("feeds", { refreshed: true }); }
    else if (event.status === "failed") toast(`Couldn't transcribe “${event.title}”: ${event.error}`, { error: true });
    else if (event.note) toast(event.note);
  });
  onReels((status) => {
    emit("reels", status);
    if (!status.running) emit("feeds", { refreshed: true });
  });
  // The computer's saved Instagram collections arrived with the sync (sync.js): an open Reels page shows them.
  window.addEventListener("tamkeen:ig-collections", () => emit("reels_collections", {}));

  // Sync on start, when returning to the app, and every 5 minutes while open.
  let lastDone = new Set(lib.episodes.filter((e) => e.transcript_rev).map((e) => e.uid));
  onSync((s) => {
    emit("sync", s);
    if (s.state !== "idle") return;
    emit("feeds", { synced: true });
    requestAnkiSync(4000);  // words that just arrived from the computer get their AnkiDroid cards
    const done = lib.episodes.filter((e) => e.transcript_rev);
    const fresh = done.filter((e) => !lastDone.has(e.uid));
    if (fresh.length) toast(fresh.length === 1 ? `New transcript: ${fresh[0].title}` : `${fresh.length} new transcripts`);
    lastDone = new Set(done.map((e) => e.uid));
  });
  // After each of those syncs on start and on return, look at the podcasts' feeds for new
  // episodes (each podcast at most once an hour), so the phone has them without the computer.
  const lookForEpisodes = () => checkFeeds().then((n) => {
    if (!n) return;
    toast(n === 1 ? "1 new podcast episode" : `${n} new podcast episodes`);
    emit("feeds", { refreshed: true });
  }).catch((e) => console.warn(e));
  syncNow().then(lookForEpisodes, lookForEpisodes);
  setInterval(() => syncNow(), 5 * 60 * 1000);
  // The two-way sync with the Tamkeen deck in AnkiDroid (off until switched on in Settings):
  // on start, on return to the app, and every 10 minutes while open.
  onAnki((data) => emit("anki", data));
  anki.setSource({ asset: (path) => fetch(path), audioFor: wordAudio });
  requestAnkiSync(8000);
  setInterval(() => requestAnkiSync(0), 10 * 60 * 1000);
  // Sign-in tokens last an hour: keep the video streamer's copy fresh during long videos.
  setInterval(refreshMediaToken, 40 * 60 * 1000);
  if (App) {
    // tamkeen://watch links: one that arrives while the app is open, and one that started it. (Not
    // again after the page reloads, e.g. after Reset Tamkeen: Android keeps the starting link.)
    App.addListener("appUrlOpen", ({ url }) => { openTamkeenLink(url); });
    App.getLaunchUrl().then((r) => {
      const url = r && r.url;
      if (!url || sessionStorage.getItem("launchLinkOpened") === url) return;
      sessionStorage.setItem("launchLinkOpened", url);
      openTamkeenLink(url);
    }).catch(() => {});
    App.addListener("resume", () => { syncNow().then(lookForEpisodes, lookForEpisodes); requestAnkiSync(3000); });
    App.addListener("backButton", () => {
      if (location.hash && location.hash !== "#/") history.back();
      else App.exitApp();
    });
  }
  // Development preview in a normal browser: load a library snapshot exported from the desktop.
  if (!isNative && new URLSearchParams(location.search).has("seed") && !(await kv.get("library"))) {
    const { seedFrom } = await import("./dev-seed.js");
    await seedFrom("dev-seed.json");
    route();
  }
}

boot();
