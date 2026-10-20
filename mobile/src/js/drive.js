// Google sign-in (native on Android and iPhone; Google's own sign-in page in the web app) and a
// minimal Drive client for the hidden app folder.

import { GoogleDriveAuth, isIOS, isNative, isWeb } from "./native.js";
import { saveSettingsPatch, settings } from "./store.js";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FIELDS = "id,name,size,modifiedTime";

let token = null;
let tokenExpires = 0;

export class AuthError extends Error {}

// ---------- the web app: an hour-long Drive pass from Google's sign-in page ----------
// The web app gets an hour-long Drive pass each time it goes to Google's sign-in page and back
// (app.js goToGoogleSignIn / finishWebSignIn). It is kept for that hour (so reloading the page doesn't
// ask again); after it, the app hops to Google and straight back by itself for a new one (app.js
// renewQuietly), which needs nothing from the learner once they have agreed. (Google's small sign-in
// window used to renew it, but in the web app on a phone's home screen that window opened as a blank
// Google page that never closed.)
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks"; // "Send to Google Tasks" (googletasks.js), asked for when first used
const WEB_TOKEN_KEY = "tk_web_drive_token";

function savedWebToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(WEB_TOKEN_KEY) || "null");
    if (saved && saved.token && Date.now() < saved.tokenExpires) { token = saved.token; tokenExpires = saved.tokenExpires; }
  } catch { /* storage off */ }
}

// The web app: its Drive pass has run out and a hop to Google is needed (app.js makes it, or shows a
// "Reconnect Google" button when now isn't a good moment).
export const RECONNECT_EVENT = "tamkeen:reconnect";
export const RECONNECT_TEXT = "Your Google connection needs renewing: tap Reconnect.";

/** The web app: keep a Drive pass that came back from Google's sign-in page (app.js finishWebSignIn),
 *  with the permissions it carries (`scope`: Google Tasks too, once that has been allowed). */
export function useWebToken(accessToken, expiresIn, scope = "") {
  token = accessToken;
  tokenExpires = Date.now() + Math.max(60, (Number(expiresIn) || 3600) - 300) * 1000;
  try { localStorage.setItem(WEB_TOKEN_KEY, JSON.stringify({ token, tokenExpires, scope: String(scope || "") })); } catch { /* storage off */ }
}

/** The web app: how long the Drive pass has left, in milliseconds (0 once it has run out). */
export function webPassLeft() {
  if (!token || Date.now() >= tokenExpires) savedWebToken();
  return token ? Math.max(0, tokenExpires - Date.now()) : 0;
}

/** The web app: the Drive pass, while it is good for another minute and also covers `scope`. */
export function webPassFor(scope) {
  try {
    const saved = JSON.parse(localStorage.getItem(WEB_TOKEN_KEY) || "null");
    if (saved && saved.token && Date.now() < saved.tokenExpires - 60 * 1000 && String(saved.scope || "").split(" ").includes(scope)) return saved.token;
  } catch { /* storage off */ }
  return null;
}

/** Interactive sign-in: shows Google's account picker / consent the first time. */
export async function signIn() {
  if (isWeb) {
    // One sign-in for everything (the owner: "My users should only need to sign in one time"): Google's
    // page gives Drive and Friends together, and the app finishes both when it comes back
    // (app.js finishWebSignIn). The page leaves for Google, so this never resolves.
    const { goToGoogleSignIn } = await import("./app.js");
    await goToGoogleSignIn();
    return new Promise(() => {});
  }
  if (!isNative) throw new AuthError("Google sign-in works in the installed app.");
  const r = await GoogleDriveAuth.authorize({ interactive: true });
  token = r.accessToken;
  tokenExpires = Date.now() + 50 * 60 * 1000;
  const email = await fetchEmail();
  await saveSettingsPatch({ signed_in: true, google_email: email });
  return email;
}

/** Access token, refreshed silently (no UI) once access has been granted. */
export async function accessToken(forceRefresh = false) {
  if (!settings.signed_in) throw new AuthError("Not signed in.");
  if (isWeb && !token) savedWebToken();
  if (!forceRefresh && token && Date.now() < tokenExpires) return token;
  if (isWeb) {
    if (forceRefresh) { // Google turned the pass down: it is no good, whatever its hour says
      token = null;
      tokenExpires = 0;
      try { localStorage.removeItem(WEB_TOKEN_KEY); } catch { /* storage off */ }
    }
    // Run out: a new one means a hop to Google's page and back, which the app makes by itself at a
    // quiet moment, or the "Reconnect Google" button does (app.js renewQuietly). Syncing waits till then.
    window.dispatchEvent(new Event(RECONNECT_EVENT));
    throw new AuthError(RECONNECT_TEXT);
  }
  try {
    // "force" matters on the iPhone, which keeps the token itself and would hand the same one back.
    const r = await GoogleDriveAuth.authorize({ interactive: false, force: !!forceRefresh });
    token = r.accessToken;
    tokenExpires = Date.now() + 50 * 60 * 1000;
    return token;
  } catch (e) {
    throw new AuthError("Your Google sign-in needs renewing. Open Settings and sign in again.");
  }
}

async function fetchEmail() {
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? (await r.json()).email || "" : "";
}

export async function signOut() {
  if (token) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
  token = null;
  tokenExpires = 0;
  if (isWeb) { try { localStorage.removeItem(WEB_TOKEN_KEY); } catch { /* storage off */ } }
  if (isIOS) await GoogleDriveAuth.signOut().catch(() => {}); // the iPhone keeps the sign-in itself
  await saveSettingsPatch({ signed_in: false, google_email: "" });
}

async function request(url, opts = {}, retry = true) {
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${await accessToken()}` } });
  if (res.status === 401 && retry) {
    await accessToken(true);
    return request(url, opts, false);
  }
  if (!res.ok) throw new Error(`Google Drive error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export const drive = {
  async list() {
    const out = [];
    let pageToken = "";
    do {
      const q = new URLSearchParams({ spaces: "appDataFolder", pageSize: "1000", fields: `nextPageToken,files(${FIELDS})` });
      if (pageToken) q.set("pageToken", pageToken);
      const data = await (await request(`${API}/files?${q}`)).json();
      out.push(...(data.files || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return out;
  },
  async get(id) {
    return (await request(`${API}/files/${id}?fields=${FIELDS}`)).json();
  },
  async download(id) {
    return (await request(`${API}/files/${id}?alt=media`)).arrayBuffer();
  },
  async downloadBlob(id) {
    return (await request(`${API}/files/${id}?alt=media`)).blob();
  },
  async upload(name, bytes, mime, id = null) {
    const meta = id ? { name } : { name, parents: ["appDataFolder"] };
    const boundary = "aps-boundary-7f3c";
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, bytes, `\r\n--${boundary}--`,
    ]);
    const url = `${UPLOAD}/files${id ? `/${id}` : ""}?uploadType=multipart&fields=${FIELDS}`;
    return (await request(url, { method: id ? "PATCH" : "POST", body,
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` } })).json();
  },
  /** Upload a big file (a video) with progress. Uses XHR because fetch can't report upload progress. */
  async uploadLarge(name, file, mime, onProgress) {
    const start = await request(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, {
      method: "POST",
      body: JSON.stringify({ name, parents: ["appDataFolder"] }),
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime,
                 "X-Upload-Content-Length": String(file.size) },
    });
    const session = start.headers.get("Location");
    if (!session) throw new Error("Google Drive didn't start the upload.");
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", session);
      xhr.setRequestHeader("Content-Type", mime);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText))
        : reject(new Error(`Google Drive upload failed (${xhr.status}).`)));
      xhr.onerror = () => reject(new Error("Upload interrupted. Check your connection and try again."));
      xhr.send(file);
    });
  },
};

// ---------- gzip (the format the desktop writes) ----------
export async function gunzipJson(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
export async function gzipJson(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
