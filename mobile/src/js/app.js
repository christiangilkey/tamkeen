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
import { installSelectSheets } from "./components/selectsheet.js";
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
import { CALENDAR_SCOPE, DRIVE_SCOPE, RECONNECT_EVENT, TASKS_SCOPE, accessToken, drive, signIn, useWebToken, webPassLeft } from "./drive.js";
import { mountLanguageSwitch, withLearningList } from "./components/langswitch.js";
import { loadParked, maybeRestore, parked } from "./reset.js";
import { App, AppBadge, AppUpdater, Filesystem, GoogleDriveAuth, NativeHttp, Share, TamkeenClipboard, TamkeenSpeech, GOOGLE_WEB_CLIENT_ID, finalUrl, isIOS, isNative, isWeb, webFetch } from "./native.js";
import { audio as audioStore, kv, lib, loadLibrary, loadSettings, saveLibrary, saveSettingsPatch, settings } from "./store.js";
import { audioCopy, driveFileId, flushSync, onSync, requestSync, syncFresh, syncNow } from "./sync.js";
import { checkEvery, checkOnReturn, refreshMessage, shouldRedraw } from "./syncpace.js";
import { sendNudge, setNudgeKey, startNudges } from "./syncnudge.js";
import { refreshButton } from "./components/refreshbutton.js";
import { newUid, toSrt, toTxt, toVtt, vocabAnki, vocabCsv } from "./shared-logic.js";
import { voiceTimes } from "./cardvoice.js";
import { vocabDeck } from "./anki-export.js";
import { ankiCard } from "./review/fsrs.js";
import { initScrollHints } from "./scrollhint.js";
import { applyPageSize, isAbsurdPageSize, PAGE_SIZE_DEFAULT } from "./textsize.js";
import { sendSettings, startExtensionBridge } from "./web-extension.js";

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
  return el; // (so a message already on screen isn't shown again on top of itself: voiceplay.js)
}
export function requestNotifications() { /* toasts are used on the phone */ }

// ---------- audio ----------
const objectUrls = new Map();
/** Synced audio copy (exactly what was transcribed), downloaded on first play; else the original.
 * `quiet`: a copy that can't be fetched falls back to the original without a message (the Vocab
 * page: its cards fall back to their voice when the original can't be played either). */
export async function audioUrl(uid, { quiet = false } = {}) {
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
      if (!quiet) toast(`Couldn't load the synced audio, streaming the original instead. (${e.message})`, { error: true });
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

// ---------- the web app's one sign-in: Google's own page, and back ----------
// Google's pop-up button is unreliable in an app opened from the home screen (pop-ups are blocked
// or lost), so the web app goes to Google's sign-in page itself and Google sends it straight back
// to this address after the "#" with both: an ID token (Friends, through Supabase) and an hour-long
// Drive pass (sync). So signing in from Settings or from Friends signs in to both: once. Needs this
// page's address among the Web client's "Authorized redirect URIs" in Google Cloud. The Drive pass
// lasts an hour; after it the app makes the same trip by itself, quietly (renewQuietly).
const WEB_SIGNIN_KEY = "tk_web_signin";
const QUIET_TRY_KEY = "tk_web_quiet_try";   // when the app last hopped to Google by itself
const QUIET_FAIL_KEY = "tk_web_quiet_fail"; // when Google last said that hop needs a tap

function randomHex(n) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Go to Google's sign-in page, which sends the learner straight back here (finishWebSignIn).
 *  `quiet`: a renewal that shows nothing (Google answers at once, or says it needs a tap); `renew`: the
 *  "Reconnect Google" button; `tasks`: Google Tasks too, then sending `then.tasks`; `calendar`: Google
 *  Calendar too, then adding `then.calendar` ({task, time}). Resolves false when a quiet one didn't go
 *  (storage switched off: the way back couldn't be checked). */
export async function goToGoogleSignIn({ quiet = false, renew = false, tasks = false, calendar = false, then = null } = {}) {
  const nonce = randomHex(16);
  const state = randomHex(16);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    sessionStorage.setItem(WEB_SIGNIN_KEY, JSON.stringify({ nonce, state, back: location.hash || "#/", quiet, renew: renew || tasks || calendar, then }));
    if (quiet) localStorage.setItem(QUIET_TRY_KEY, String(Date.now()));
  } catch { if (quiet) return false; }
  const q = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID, response_type: "id_token token",
    scope: `openid email ${DRIVE_SCOPE}${tasks ? ` ${TASKS_SCOPE}` : ""}${calendar ? ` ${CALENDAR_SCOPE}` : ""}`,
    include_granted_scopes: "true", redirect_uri: location.origin + location.pathname, nonce: hashed, state,
  });
  // Already signed in: the same account again, without choosing (a quick hop to Google and back once
  // it has been allowed). Otherwise Google asks which account.
  if (settings.google_email) q.set("login_hint", settings.google_email);
  if (quiet) q.set("prompt", "none"); // nothing on screen: Google answers at once, or says a tap is needed
  else if (!settings.google_email) q.set("prompt", "select_account");
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  return true;
}

// ---------- the refresh button (components/refreshbutton.js) ----------
let refreshing = false; // a sync the refresh button asked for: the page on screen is drawn again after it

/** Sync now, for the refresh button: the number of changes that came, or null when it offered to
 *  sign in instead, or left for Google's page to renew the web app's hour-long pass first (it
 *  syncs and says how it went when it comes back: finishWebSignIn). */
async function refreshNow() {
  if (!settings.signed_in) {
    toast("Sign in with Google to keep your library the same on all your devices.", { timeout: 8000, action: { label: "Sign in", run: async () => {
      try {
        const email = await signIn(); // (the web app leaves for Google's page here)
        toast(`Signed in as ${email}`);
        syncNow();
      } catch (e) { toast(e.message, { error: true }); }
    } } });
    return null;
  }
  if (isWeb && webPassLeft() < 60 * 1000) {
    await goToGoogleSignIn({ renew: true, then: { refresh: true } }); // a tap: Google's page and straight back
    return null;
  }
  refreshing = true;
  try {
    const s = await syncFresh();
    if (s.state === "error") throw new Error(s.error);
    return s.received;
  } finally {
    refreshing = false;
  }
}

/** Something the learner would lose if the page reloaded now: a player, a chat or the first-run
 *  questions, sound or video playing, a box open (a review, the game, a question), or typing. */
function busyNow() {
  if (/^#\/(episode|chat|welcome|reels\/play)/.test(location.hash) || document.body.classList.contains("in-player")) return true;
  if ([...document.querySelectorAll("audio, video")].some((m) => !m.paused && !m.ended)) return true;
  const f = document.activeElement;
  if (f && f !== document.body && f.matches("input, textarea, select, [contenteditable]")) return true;
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal-back, .tour')].some((el) => el.getClientRects().length > 0);
}

/** Google said lately that the quiet hop needs a tap (signed out of Google in this browser, say). */
function quietFailedLately() {
  try { return Date.now() - (Number(localStorage.getItem(QUIET_FAIL_KEY)) || 0) < 6 * 60 * 60 * 1000; } catch { return false; }
}

function quietFailed() {
  try { localStorage.setItem(QUIET_FAIL_KEY, String(Date.now())); } catch { /* storage off */ }
  window.dispatchEvent(new Event(RECONNECT_EVENT)); // the "Reconnect Google" button
}

let hopping = null;
/** The web app: once the Drive pass has run out (or nearly), hop to Google's page and straight back
 *  for a new one, with nothing to tap or see, if this is a quiet moment (busyNow) and Google hasn't
 *  lately said it needs a tap. Never twice in ten minutes (a pass lasts an hour, so a second trip that
 *  soon means something is wrong), so it can't go round in circles. Resolves
 *  true when it went (the page is leaving). */
function renewQuietly() {
  if (!hopping) hopping = (async () => {
    if (!isWeb || !settings.signed_in || !settings.google_email || webPassLeft() > 2 * 60 * 1000) return false;
    if (!navigator.onLine || document.visibilityState !== "visible" || busyNow() || quietFailedLately()) return false;
    try { if (Date.now() - (Number(localStorage.getItem(QUIET_TRY_KEY)) || 0) < 10 * 60 * 1000) return false; } catch { return false; }
    // Google reachable? (On a poor connection the trip would end on the browser's "no internet" page.)
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 3000);
    try { await fetch("https://www.google.com/generate_204", { mode: "no-cors", cache: "no-store", signal: stop.signal }); } catch { return false; } finally { clearTimeout(timer); }
    if (busyNow()) return false; // (something started meanwhile)
    return goToGoogleSignIn({ quiet: true });
  })().then((went) => { if (!went) hopping = null; return went; }, () => { hopping = null; return false; });
  return hopping;
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

/** The email address inside a Google ID token (its middle part is plain JSON), "" when it can't be read. */
export function idTokenEmail(idToken) {
  try {
    const part = String(idToken || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")), (c) => c.charCodeAt(0)));
    return String(JSON.parse(json).email || "");
  } catch { return ""; }
}

/** Back from Google's sign-in page (the address ends "#id_token=…&access_token=…" or "#error=…"): put
 *  the screen the learner was on back, keep the Drive pass and sync, and sign in to Friends. A quiet
 *  renewal (renewQuietly) says nothing: syncing just carries on, or the "Reconnect Google" button shows. */
async function finishWebSignIn() {
  const answer = new URLSearchParams(location.hash.slice(1));
  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(WEB_SIGNIN_KEY) || "null"); sessionStorage.removeItem(WEB_SIGNIN_KEY); } catch { /* storage off */ }
  history.replaceState(null, "", location.pathname + location.search + ((kept && kept.back) || "#/"));
  const quiet = !!(kept && kept.quiet);
  if (quiet && (answer.get("error") || answer.get("state") !== kept.state)) { quietFailed(); return; } // Google wants a tap
  if (answer.get("error")) { toast(answer.get("error") === "access_denied" ? "Sign-in was cancelled." : "Google didn't sign you in.", { error: true }); return; }
  if (!kept || answer.get("state") !== kept.state) { toast("That sign-in came back without being asked for here. Try again.", { error: true }); return; }
  const renewing = quiet || !!kept.renew; // renewing the Drive pass (or allowing Google Tasks), not "Sign in"
  const email = idTokenEmail(answer.get("id_token"));
  const granted = (answer.get("scope") || "").split(" ");
  // Drive (sync): only when its box was left ticked on Google's page.
  const driveOk = !!answer.get("access_token") && granted.includes(DRIVE_SCOPE);
  if (driveOk) {
    useWebToken(answer.get("access_token"), answer.get("expires_in"), answer.get("scope"));
    try { localStorage.removeItem(QUIET_FAIL_KEY); } catch { /* storage off */ }
    await saveSettingsPatch({ signed_in: true, google_email: email || settings.google_email || "" });
    const synced = syncNow({ changed: true });
    // The refresh button found the pass run out and came here first: now say how the sync went.
    if (kept.then && kept.then.refresh) synced.then((s) => toast(s.state === "error" ? s.error : refreshMessage(s.received), { error: s.state === "error" }));
  } else if (quiet) quietFailed();
  if (!renewing) {
    // Friends keeps its own sign-in, which renews itself: so only "Sign in" signs in to it.
    let friendsOk = false;
    try {
      const social = await import("./social.js");
      await social.connectWithIdToken({ token: answer.get("id_token"), nonce: kept.nonce });
      friendsOk = true;
    } catch (e) {
      toast(e.message || "Couldn't sign in to Friends.", { error: true });
    }
    if (driveOk || friendsOk) toast(email ? `Signed in as ${email}` : "Signed in.");
  } else if (kept.renew && driveOk && !(kept.then && (kept.then.tasks || kept.then.calendar))) toast("Reconnected to Google.");
  if (!driveOk && !quiet) toast("Syncing needs Tamkeen's private Drive folder: sign in again and leave that box ticked.", { error: true });
  if (kept.then && kept.then.tasks) {
    // "Send to Google Tasks", sent now that Google has allowed it (googletasks.js).
    if (!answer.get("access_token") || !granted.includes(TASKS_SCOPE)) {
      toast("Google Tasks wasn't allowed, so the task couldn't be added.", { error: true });
    } else {
      (await import("./googletasks.js")).useTasksToken(answer.get("access_token"), answer.get("expires_in"));
      import("./review/sendtask.js").then((m) => m.sendReviewTask(kept.then.tasks))
        .catch((e) => toast(e.message || "Couldn't send the task.", { error: true }));
    }
  }
  if (kept.then && kept.then.calendar) {
    // "Send to Google Calendar", added now that Google has allowed it, at the time chosen before leaving.
    const { task, time } = kept.then.calendar;
    if (!answer.get("access_token") || !granted.includes(CALENDAR_SCOPE)) {
      toast("Google Calendar wasn't allowed, so the review couldn't be added.", { error: true });
    } else {
      (await import("./googlecalendar.js")).useCalendarToken(answer.get("access_token"), answer.get("expires_in"));
      import("./review/sendtask.js").then((m) => m.sendReviewEvent(task, time))
        .catch((e) => toast(e.message || "Couldn't add the review to Google Calendar.", { error: true }));
    }
  }
  if (!renewing) {
    emit("feeds", { refreshed: true });
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}

// ---------- audio clips of shared words ----------
// A word a friend shared keeps its own short clip (stored on the phone as "clip:<word id>" and
// in Drive as c_<word id>.ogg so the computer has it too).
const clipKey = (uid) => `clip:${uid}`;

/** The clip to send with a word: only words that already have their own clip (ones a friend
 * shared). Cutting a new clip out of an episode is done on the computer. */
export async function shareClip(word) {
  const voice = word.clip ? null : voiceTimes(word); // a card's voice goes along too (cardvoice.js)
  if (!word.clip && !voice) return null;
  const blob = await storedClip(word.id);
  return blob ? { blob, times: voice || { start: word.start, end: word.end, sent_start: word.sent_start, sent_end: word.sent_end } } : null;
}

/** Keep a card's voice made with Azure: stored here under the same key as a clip, sent to Drive as
 * c_<uid>.ogg so the other devices have it, and its times on the word (`voice`). Made once. */
export async function saveVoice(uid, blob, times) {
  const v = lib.vocab.find((x) => x.uid === uid);
  if (!v || v.clip || voiceTimes(v)) return v || null;
  await audioStore.put(clipKey(uid), blob);
  clipUrls.delete(uid);
  Object.assign(v, { voice: JSON.stringify(times), updated_at: Date.now() / 1000 });
  const pending = new Set((await kv.get("pending_clips")) || []);
  pending.add(uid);
  await kv.set("pending_clips", [...pending]);
  saveLibrary();
  requestSync();
  return v;
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

/** Keep the learner's own recording for a card typed in with "Add words" (web/js/cardaudio.js: Ogg
 * Opus, or a WAV file where this device can't make Ogg Opus) as the card's voice: stored and synced
 * exactly like a voice made with Azure. */
export const saveRecording = (uid, blob, times) => saveVoice(uid, blob, times);

/** "Add words" → Scan (components/wordscan.js) never keeps a photo. On Android the camera app writes
 * each photo it takes for the page into the app's own Pictures folder (Capacitor's file chooser makes
 * it there, as JPEG_<date>_<time>_<n>.jpg) and nothing removes it: once the photo is read it goes.
 * (The iPhone hands the page a copy in a temporary folder that iOS empties itself.) */
export async function forgetPhotos() {
  if (!Filesystem || isIOS) return;
  try {
    const { files } = await Filesystem.readdir({ path: "Pictures", directory: "EXTERNAL" });
    for (const f of files || []) {
      const name = typeof f === "string" ? f : f && f.name;
      if (name && /^JPEG_\d{8}_\d{6}_\d*\.jpg$/i.test(name)) {
        await Filesystem.deleteFile({ path: `Pictures/${name}`, directory: "EXTERNAL" }).catch(() => {});
      }
    }
  } catch { /* no such folder: no photo was taken */ }
}

/** The file's real kind, whatever it was stored or downloaded as (Drive keeps every clip as audio/ogg;
 * a recording made on an iPhone is a WAV file): an iPhone plays a file only by its right type. */
async function typedClip(blob) {
  try {
    const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const head = String.fromCharCode(...b.subarray(0, 4));
    const type = head === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WAVE" ? "audio/wav" : head === "OggS" ? "audio/ogg" : "";
    return type && type !== blob.type ? new Blob([blob], { type }) : blob;
  } catch { return blob; }
}

const clipUrls = new Map();
/** Address the vocab page plays for a word that has its own clip. */
export async function clipUrl(word) {
  if (clipUrls.has(word.id)) return clipUrls.get(word.id);
  const blob = await storedClip(word.id);
  if (!blob) throw new Error("This word's audio isn't on this phone yet. Sync and try again.");
  const url = URL.createObjectURL(await typedClip(blob));
  clipUrls.set(word.id, url);
  return url;
}

// ---------- card voices (cardvoice.js, devicevoice.js) ----------
/** The phone's own text-to-speech (SpeechPlugin.java / SpeechPlugin.swift); the web app speaks
 * through the browser's (speechSynthesis). */
export const speechPlugin = TamkeenSpeech;

/** "My computer" chosen: a phone can't make a card's voice itself. The computer makes it and it
 * arrives by sync ("Waiting for your computer"); meanwhile the phone's own voice says the card. */
export const makeComputerVoice = null;

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
  if (res.status >= 400) throw new Error(`The site answered with an error (${res.status}). Try opening it in the app's browser and pressing the round teal button there.`);
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

// ---------- Netflix ----------
// Netflix's videos are copy-protected and Netflix only plays them in its own player: on a Windows
// computer Tamkeen lays that player over its stage (web/js/nfmedia.js). Here there is no such
// window yet, so Netflix explains itself instead (netflix.js unavailableText). Titles watched on
// the computer still arrive in the Library with their subtitles. (A phone's native video window,
// like the reels' ReelSurface, could later be handed to createNetflixMedia as its bridge.)
// The web app on a computer works with Netflix through the Tamkeen browser extension (extension/):
// Netflix plays in its own tab with Tamkeen's subtitle bar, and titles and saved words come back
// here (web-extension.js). Without the extension it says where to get it.

/** The window Netflix plays in: none on the phones or the web app (see web/js/app.js). */
export function netflixBridge() {
  return null;
}

/** Can Netflix titles play here? {ok, reason, extension}: in the web app on a computer once the
 * browser extension is there (`extension`: Netflix then plays in its own tab); else never, for now
 * (reason: see netflix.js). */
export async function netflixSupport() {
  const { extensionHere, unavailableReason } = await import("./netflix.js");
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || window.matchMedia("(pointer: coarse)").matches;
  const extension = isWeb && !phone && !isIOS && extensionHere();
  const reason = unavailableReason({ platform: "android", web: isWeb, ios: isIOS, phone, extension });
  return { ok: !reason, reason, extension };
}

/** Open Netflix on its titles in the language being learned, in a new tab (the web app with the
 * browser extension; its part there chooses the language). Elsewhere: the reason, as an error. */
export async function openNetflix() {
  const { browseStart, unavailableText } = await import("./netflix.js");
  const { ok, reason } = await netflixSupport();
  if (!ok) throw new Error(unavailableText(reason).lines[0]);
  sendSettings(); // the language to choose there is the one being learned now
  window.open(browseStart(), "_blank", "noopener");
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
    return `window.__tamkeenFollowing=${JSON.stringify(names)};${source}`;
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
  const { parseChatLink, parseTamkeenLink } = await import("./applink.js");
  const friend = parseChatLink(url); // a chat notification tapped (Android; see startChatNotices)
  if (friend) { location.hash = `#/chat/${friend}`; return; }
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
 * opened for something other than reading pages (YouTube), so without that button; a sign-in
 * browser never has it either. */
export async function openBrowser(url = "", { instagramSignIn = false, reading = true } = {}) {
  if (isWeb && reading && !instagramSignIn && !/^https?:/i.test(url)) { // the Web page screen instead (no browser here)
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
    // A video was tapped on YouTube (see youtube-browser.js): add it, then show it in the
    // app's own player, closing the browser. Without captions the browser stays open.
    // `at` is the moment that came with it (the "t" of its link), if any.
    GoogleDriveAuth.addListener("youtubeVideo", async ({ id, at }) => {
      if (openingVideo) return;
      openingVideo = true;
      try {
        GoogleDriveAuth.browserToast({ text: "Getting captions…" }).catch(() => {});
        const { watchVideo } = await import("./youtube.js");
        await watchVideo(id, typeof at === "number" ? at : null);
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
        emit("browser_sites", {}); // the Library's Web page screen, if it is open behind the browser, redraws its list
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
  await GoogleDriveAuth.openBrowser({ url, extractor: await extractorSource(), youtube: await youtubeBrowserScript(),
                                      home: translateHtml(homeHtml(settings.study_language || "", sites)),
                                      closeOnInstagramSignIn: !!instagramSignIn,
                                      forReading: !!reading && !instagramSignIn });
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
    audioFor: wordAudio,
  });
}

/** The audio a word's times refer to, for the Anki deck and new AnkiDroid cards: its own clip (a word
 * a friend shared), the synced copy of its episode, else the card's kept voice (with its own times).
 * Other episodes (streamed originals, videos, pages) give no audio. */
async function wordAudio(v) {
  if (v.clip) return { key: clipKey(v.uid), load: () => storedClip(v.uid) };
  const ep = v.start != null || v.sent_start != null ? lib.episodes.find((e) => e.uid === v.episode_uid) : null;
  if (ep && ep.remote_audio && !(ep.audio_url || "").startsWith("drive:")) {
    return { key: ep.uid, load: () => audioCopy(ep.uid) };  // kept on the phone once played; else fetched from Drive
  }
  const times = voiceTimes(v);
  return times ? { key: clipKey(v.uid), load: () => storedClip(v.uid), times } : null;
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
  applyPageSize(s.page_font_size);
  setStudyLanguage(s.study_language);
  // A page text size from before the standard sizes (up to 40 px could be chosen) goes back to the standard, once.
  if (isAbsurdPageSize(s.page_font_size) && !resettingPageSize) {
    resettingPageSize = true;
    saveSettings({ page_font_size: PAGE_SIZE_DEFAULT }).catch(() => {}).finally(() => { resettingPageSize = false; });
  }
}
let resettingPageSize = false;
export async function saveSettings(values) {
  values = withLearningList(values); // a language switched to stays on the list of languages being learned
  const keyTimes = JSON.stringify(settings.key_times || {});
  const learningTimes = JSON.stringify(settings.learning_times || {});
  const s = await saveSettingsPatch(values);
  // After Reset Tamkeen: signing in, or finishing the first screens, brings the library back.
  if (parked() && await maybeRestore(s)) { location.reload(); return s; }
  applySettings(s);
  if (JSON.stringify(s.key_times || {}) !== keyTimes) requestSync(5000); // an AI key changed: the other devices get it too
  if ("game_state" in values) requestSync(90000); // the creature reaches the other devices after studying
  if ("youtube_follows" in values) requestSync(30000); // so do followed channels
  if ("browser_sites" in values) requestSync(30000); // and sites saved to the browser's start page
  if ("grammar_progress" in values) requestSync(30000); // and grammar lessons finished
  if (JSON.stringify(s.learning_times || {}) !== learningTimes) requestSync(30000); // and languages ticked or unticked
  if (isWeb) sendSettings(); // the browser extension, when it is there, follows (web-extension.js)
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
  [/^sites$/, webSites, () => ({})], // the Library's Web page screen (paste an address, saved sites, news), every version
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

// ---------- the web app's "Updated to version …" ----------
/** The web app is updated by simply being opened. The first time this browser opens a new version, a
 *  small banner at the top left says which, for a few seconds, with a link to what's new. Not on the
 *  very first visit (nothing was updated), nor for test builds. */
export async function versionBanner() {
  const { APP_VERSION } = await import("./version.js");
  if (!APP_VERSION || APP_VERSION.startsWith("0.0.0") || /-/.test(APP_VERSION)) return; // a test build
  let last = null;
  try {
    last = localStorage.getItem("tamkeenWebVersion");
    localStorage.setItem("tamkeenWebVersion", APP_VERSION);
  } catch { return; } // storage off: no way to tell what is new
  if (!last || last === APP_VERSION) return;
  const bar = document.querySelector(".topbar");
  // "What's new" opens a short list of the new features (web/js/whatsnew.js) under the banner, which
  // then stays until closed; a version with no list there still links to its release page.
  const { whatsNew } = await import("./whatsnew.js");
  const lines = whatsNew(last, APP_VERSION);
  const el = h(`<div class="version-banner" role="status"><div class="version-banner-row"><span></span>
    ${lines.length ? `<button type="button" class="version-banner-more" aria-expanded="false">What's new ${icon("chevron", 12)}</button>`
      : `<a target="_blank" rel="noopener">What's new</a>`}
    <button type="button" class="version-banner-close" aria-label="Close">${icon("close", 14)}</button></div></div>`);
  el.querySelector("span").textContent = `Updated to version ${APP_VERSION}`;
  const link = el.querySelector("a");
  if (link) link.href = `https://github.com/christiangilkey/tamkeen/releases/tag/v${encodeURIComponent(APP_VERSION)}`;
  el.style.top = `${(bar ? bar.getBoundingClientRect().bottom : 0) + 8}px`;
  const go = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 400); };
  el.querySelector(".version-banner-close").onclick = go;
  const timer = setTimeout(go, 7000);
  const more = el.querySelector(".version-banner-more");
  if (more) {
    more.onclick = () => {
      clearTimeout(timer); // reading the list: the banner stays until closed
      let list = el.querySelector(".version-banner-list");
      if (!list) {
        list = document.createElement("ul");
        list.className = "version-banner-list";
        for (const line of lines) {
          const li = document.createElement("li");
          li.textContent = line;
          list.append(li);
        }
        el.append(list);
      } else list.hidden = !list.hidden;
      more.setAttribute("aria-expanded", String(!list.hidden));
    };
  }
  document.body.append(el);
}

// ---------- chat notifications ----------
/** A friend's message while Tamkeen isn't on screen (web/js/chatnotify.js decides): on the phones
 *  their own notification (AppBadge plugin; tapping it opens the chat), in the web app the browser's,
 *  shown through the offline helper (sw.js) where a phone's browser allows no other kind. */
function startChatNotices() {
  const chatOf = (hash) => (/^#\/chat\/([\w-]+)/.exec(hash || "") || [])[1] || "";
  const webShow = async ({ friend, title, text }) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body: text, icon: "icons/icon-256.png", tag: `chat-${friend}`, data: { hash: `#/chat/${friend}` } };
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration().catch(() => null);
    if (reg) return reg.showNotification(title, opts);
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); location.hash = opts.data.hash; };
  };
  import("./chatnotify.js").then(({ startChatNotifications }) => startChatNotifications({
    system: (m) => (AppBadge ? AppBadge.notifyMessage(m) : webShow(m)),
    ask: async () => {
      if (AppBadge) await AppBadge.allowNotification();
      else if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    },
  })).catch(() => {});
  if (AppBadge) {
    // iPhone: a tapped notification arrives as an event (Android: as a tamkeen://chat link, above).
    AppBadge.addListener("messageTapped", ({ friend }) => { if (friend) location.hash = `#/chat/${friend}`; }).catch(() => {});
    // That chat open: its notification goes.
    window.addEventListener("hashchange", () => {
      const friend = chatOf(location.hash);
      if (friend) AppBadge.clearMessage({ friend }).catch(() => {});
    });
  } else if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.tamkeen === "open" && chatOf(e.data.hash)) location.hash = e.data.hash;
    });
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
  // Drop-down menus open Tamkeen's own list, not the system's (on phones and touch screens; components/selectsheet.js).
  installSelectSheets({ always: isNative });
  await loadParked(); // after Reset Tamkeen: the library is set aside until sign-in (reset.js)
  await loadSettings();
  await loadLibrary();
  applySettings(settings);
  fillLanguages(); // every podcast and word knows its language (only the one being learned is shown)
  await startTranslating(settings.ui_language); // the app's own words in the user's language
  // The web app, back from Google's sign-in page (see finishWebSignIn).
  const cameBack = isWeb && /(^|[#&])(id_token|error)=/.test(location.hash);
  if (cameBack) finishWebSignIn();
  if (!settings.welcome_seen || !settings.study_language) location.hash = "#/welcome"; // first run: choose a language
  // The web app's hour-long Drive pass ran out since last time: a quick hop to Google and straight
  // back first, with nothing to tap (renewQuietly), instead of asking to reconnect.
  if (isWeb && !cameBack && (await renewQuietly())) {
    document.getElementById("view").innerHTML = `<div class="page"><p class="muted" style="text-align:center;margin-top:30vh">Reconnecting to Google…</p></div>`;
    return;
  }
  // The app's own line icons in the tab bar and the search button (see icons.js).
  for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22);
  window.addEventListener("hashchange", route);
  initSwipe();
  initScrollHints(); // rows that scroll sideways show that they do
  route();
  mountLanguageSwitch(document.querySelector(".topbar .brand")); // "which language am I learning now"
  mountInstallButton(document.querySelector(".topbar")); // the web app: how to add it to the home screen
  if (isWeb) versionBanner(); // the web app updates itself: say so, once per new version
  // The Tamkeen browser extension (a computer): its settings, and the words and titles from Netflix.
  if (isWeb) startExtensionBridge({ api, toast, refresh: () => emit("feeds", { refreshed: true }) });
  // The web app opened by "Share → Tamkeen" from another app (Android, once installed): import that page.
  if (isWeb) import("./web-import.js").then((m) => m.importShared(!!(settings.welcome_seen && settings.study_language))).catch(() => {});
  if (isWeb) { // the web app's hour-long Drive pass: renewed by itself at a quiet moment, or with one tap
    // Google gives the web app an hour at a time. Renewing it used to open Google's small window, which
    // in the web app on a phone's home screen opened as a blank Google page that never closed (the
    // owner: "Tamkeen keeps asking me to sign into Google ... It also gets stuck on a white page"). Now
    // the app hops to Google's page and straight back by itself (renewQuietly): when it opens, when it
    // comes back to the screen, or at the next page change once syncing has found the pass run out.
    // Only while that can't happen (a review or video under way, or Google wants a tap because this
    // browser was signed out of Google) does a small button wait in the top bar; tapping it makes the
    // same trip, with no window.
    const chip = h(`<button type="button" class="top-reconnect" aria-label="Reconnect Google" hidden>${icon("refresh", 15)}<span>Reconnect Google</span></button>`);
    chip.title = "Google gives the web app an hour at a time: tap to renew it, then syncing carries on";
    const search = document.querySelector(".topbar .top-search");
    if (search) search.before(chip); else document.querySelector(".topbar").append(chip);
    chip.onclick = () => { chip.disabled = true; goToGoogleSignIn({ renew: true }); };
    let told = false;
    window.addEventListener(RECONNECT_EVENT, () => {
      renewQuietly().then((went) => {
        if (went) return;
        chip.hidden = false;
        if (told || !quietFailedLately()) return; // the app will hop by itself soon: nothing to say
        told = true; // Google wants a tap: say so once per visit
        toast("Your Google connection needs renewing.", { timeout: 8000, action: { label: "Reconnect Google", run: () => chip.click() } });
      });
    });
    window.addEventListener("hashchange", () => { if (!chip.hidden) setTimeout(renewQuietly, 400); });
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30 * 1000) renewQuietly();
    });
    // Closing the reviewer is a quiet moment: renew then, if the pass ran out during the session (the
    // answers wait here and go with the sync that follows the renewal).
    window.addEventListener("tamkeen:review-closed", () => { if (!chip.hidden || webPassLeft() < 2 * 60 * 1000) setTimeout(renewQuietly, 400); });
  }
  // The refresh button (components/refreshbutton.js), just before Search. In the web app it hides
  // while "Reconnect Google" shows (that button does the same, and the bar is narrow).
  const topSearch = document.querySelector(".topbar .top-search");
  const refresh = refreshButton(refreshNow);
  if (topSearch) topSearch.before(refresh); else document.querySelector(".topbar").append(refresh);
  startBadge();
  startChatNotices();
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

  // Sync on start, on coming back to the app, every minute while it is on screen (syncpace.js:
  // a check that finds nothing new is one small Drive request), at once when another of the
  // learner's devices nudges (syncnudge.js), and send a waiting change when the app is put away.
  let lastCheck = 0;
  let checkTimer = 0;
  const check = () => { lastCheck = Date.now(); return syncNow(); };
  const planChecks = () => {
    clearTimeout(checkTimer);
    const every = checkEvery({ visible: document.visibilityState !== "hidden", web: isWeb });
    if (every) checkTimer = setTimeout(() => { check(); planChecks(); }, Math.max(1000, every - (Date.now() - lastCheck)));
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSync();
    else if (checkOnReturn(lastCheck, Date.now())) check();
    planChecks();
  });
  window.addEventListener("pagehide", () => { flushSync(); });
  window.addEventListener("tamkeen:review-closed", () => { flushSync(); }); // a review session ended: send it now
  startNudges(() => check());
  let lastDone = new Set(lib.episodes.filter((e) => e.transcript_rev).map((e) => e.uid));
  onSync((s) => {
    emit("sync", s);
    if (s.state !== "idle") return;
    lastCheck = Math.max(lastCheck, Date.now() - 1000);
    planChecks();
    setNudgeKey(s.nudge_key);
    if (s.uploaded) sendNudge(); // the learner's other open devices fetch it now
    // Something arrived: Home and Vocab show it (their counts) when nothing on them would be lost.
    // (After the refresh button, any page that is safe to draw again.)
    if (shouldRedraw({ received: s.received, hash: location.hash, busy: busyNow() || document.body.classList.contains("rv-open"), manual: refreshing })) route();
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
  check().then(lookForEpisodes, lookForEpisodes);
  planChecks();
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
    App.addListener("resume", () => { check().then(lookForEpisodes, lookForEpisodes); planChecks(); requestAnkiSync(3000); });
    App.addListener("pause", () => { flushSync(); }); // put away: send a waiting change now
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
