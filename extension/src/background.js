// The Tamkeen extension's background part (a service worker in Chrome and Edge, a background script in
// Firefox). It
//   - finds the lyrics of the song playing on Spotify for the lyrics panel there (spotify.html): it
//     asks LRCLIB (lrclib.net, a free collection of lyrics with line timings) by the song's title,
//     artist and length, one request at a time with a pause between, waiting when LRCLIB says it is
//     busy, and keeps the answers for a while (in the browser's session storage) so a song played
//     again isn't asked for again (web/js/lyrics.js chooses the record);
//   - notices the subtitle files Netflix's player downloads in a Netflix tab (Netflix's video servers
//     serve them as XML; the list of subtitles inside Netflix's page is encrypted, so this is the way
//     to get them), fetches each again (no sign-in needed), reads it (web/js/netflix-ttml.js) and hands
//     it to that tab's subtitle bar (panel.html), whatever its language: the bar shows the subtitles
//     chosen in Netflix's player (the language being learned, unless the viewer picked others in the
//     bar's Subtitles menu);
//   - tells the part in Netflix's pages the language being learned and its messages (for choosing the
//     language on Netflix's "Browse by Languages" page);
//   - opens Netflix on titles in that language when the toolbar button is pressed (or the web app,
//     when the extension doesn't know the language yet).
// The settings come from the web app (content/webapp.js) and live in chrome.storage.local.
import { CONFIG } from "./js/ext/config.js";
import { MAX_TTML_BYTES, baseLanguage, isSubtitleDownload, parseTtml } from "./js/netflix-ttml.js";
import { browseAddresses, extensionBrowserTexts, languageNames } from "./js/netflix.js";
import { setDictionary } from "./js/i18n.js";
import { isLanguage } from "./js/languages.js";
import { lrclibRequests, lyricsKey, pickLyrics, retryDelay } from "./js/lyrics.js";

const SUB_HOSTS = new RegExp(CONFIG.subtitleHosts);
const KEEP = 16; // subtitle files kept per tab (in every language: the viewer may switch)

async function settings() {
  try { return (await chrome.storage.local.get("settings")).settings || {}; } catch { return {}; }
}

/** The title number in a Netflix watch address, else "". */
function watchId(url) {
  try {
    const u = new URL(url);
    if (!CONFIG.netflixHosts.includes(u.hostname)) return "";
    const m = u.pathname.match(/^\/watch\/(\d{3,12})(\/|$)/);
    return m ? m[1] : "";
  } catch { return ""; }
}

// ---------- subtitle files, per tab ----------
// Kept in memory and in the browser's session storage (the service worker sleeps between uses).

const files = new Map(); // tab id -> [{watchId, lang, cues, at, key}]
const ports = new Map(); // tab id -> Set of the subtitle bars' connections

async function filesOf(tabId) {
  if (!files.has(tabId)) {
    let kept = [];
    try { kept = (await chrome.storage.session.get(`subs:${tabId}`))[`subs:${tabId}`] || []; } catch { /* no session storage */ }
    if (!files.has(tabId)) files.set(tabId, kept);
  }
  return files.get(tabId);
}

async function keep(tabId, file) {
  const list = await filesOf(tabId);
  if (list.some((f) => f.key === file.key && f.watchId === file.watchId)) return false;
  list.push(file);
  while (list.length > KEEP) list.shift();
  try { await chrome.storage.session.set({ [`subs:${tabId}`]: list }); } catch { /* memory only */ }
  return true;
}

function tell(tabId, msg) {
  for (const port of ports.get(tabId) || []) { try { port.postMessage(msg); } catch { /* closed */ } }
}

async function onDownload(d) {
  if (d.tabId < 0 || d.statusCode !== 200 || (d.method && d.method !== "GET")) return;
  const type = ((d.responseHeaders || []).find((h) => String(h.name).toLowerCase() === "content-type") || {}).value || "";
  if (!isSubtitleDownload(d.url, type, SUB_HOSTS)) return;
  let id = "";
  try { id = watchId((await chrome.tabs.get(d.tabId)).url); } catch { return; }
  if (!id) return;
  let text = "";
  try {
    const res = await fetch(d.url, { credentials: "omit", cache: "no-store" });
    if (!res.ok || Number(res.headers.get("content-length") || 0) > MAX_TTML_BYTES) return;
    text = await res.text();
  } catch { return; }
  let parsed;
  try { parsed = parseTtml(text); } catch { return; } // not a subtitle file after all
  if (!parsed.cues.length || !baseLanguage(parsed.lang)) return;
  const c = parsed.cues;
  const file = { watchId: id, lang: parsed.lang, cues: c, at: Date.now(), key: `${parsed.lang}|${c.length}|${c[0][2]}|${c[c.length - 1][2]}` };
  if (await keep(d.tabId, file)) tell(d.tabId, { type: "subtitles", file });
}

chrome.webRequest.onCompleted.addListener((d) => { onDownload(d).catch(() => {}); },
  { urls: CONFIG.subtitleUrls, types: ["xmlhttprequest", "other"] }, ["responseHeaders"]);

chrome.tabs.onRemoved.addListener((tabId) => {
  files.delete(tabId);
  chrome.storage.session.remove(`subs:${tabId}`).catch(() => {});
});

// A subtitle bar (panel.html inside a Netflix tab) connects: it gets the files seen in its tab so far,
// and each new one as it comes.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  const tabId = port.sender && port.sender.tab ? port.sender.tab.id : -1;
  if (tabId < 0 || !port.sender.url || !port.sender.url.startsWith(chrome.runtime.getURL("panel.html"))) { port.disconnect(); return; }
  if (!ports.has(tabId)) ports.set(tabId, new Set());
  ports.get(tabId).add(port);
  port.onDisconnect.addListener(() => { const set = ports.get(tabId); if (set) set.delete(port); });
  filesOf(tabId).then((list) => { for (const file of list) port.postMessage({ type: "subtitles", file }); });
});

// ---------- what the part in Netflix's pages is told ----------

const dictionaries = new Map();
async function useLanguage(ui) {
  if (!ui || ui === "en") { setDictionary(null); return; }
  if (!dictionaries.has(ui)) {
    try { dictionaries.set(ui, await (await fetch(chrome.runtime.getURL(`i18n/${ui}.json`))).json()); } catch { dictionaries.set(ui, null); }
  }
  setDictionary(dictionaries.get(ui));
}

async function pageConfig() {
  const s = await settings();
  const lang = isLanguage(s.study_language) ? s.study_language : "";
  if (!lang) return { lang: "", webApp: CONFIG.webApp };
  await useLanguage(s.ui_language);
  return { lang, names: languageNames(lang), browse: browseAddresses(CONFIG.netflixBase), text: extensionBrowserTexts(lang), webApp: CONFIG.webApp };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "config" || !sender.tab) return false;
  pageConfig().then(reply, () => reply({ lang: "", webApp: CONFIG.webApp }));
  return true; // answered later
});

// ---------- song lyrics, for the lyrics panel on Spotify ----------
// LRCLIB asks clients to name themselves (browsers don't let an extension set User-Agent, so its
// Lrclib-Client header), to send one request at a time with a short pause between, to keep answers
// for a while, and to wait as long as its Retry-After says when it is busy.
const LYRICS_CLIENT = `Tamkeen browser extension ${CONFIG.version} (https://christiangilkey.github.io/tamkeen/extension/)`;
const FOUND_FOR = 12 * 3600 * 1000;  // an answer with lyrics is kept 12 hours
const NONE_FOR = 3600 * 1000;        // "no lyrics" an hour (LRCLIB may find them by then)
const KEEP_SONGS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastAsked = 0;
async function politeFetch(url, attempt = 0) {
  const wait = lastAsked + 350 - Date.now();
  if (wait > 0) await sleep(wait);
  lastAsked = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: { "Lrclib-Client": LYRICS_CLIENT }, credentials: "omit", cache: "no-store" });
  } catch { return { status: 0 }; }
  const later = retryDelay(res.status, res.headers.get("retry-after"), attempt);
  if (later >= 0) { await sleep(later); return politeFetch(url, attempt + 1); }
  return res;
}

/** Only what the panel uses of a record (no "lyricsfile"). */
const slim = (r) => ({ id: r.id, trackName: r.trackName, artistName: r.artistName, albumName: r.albumName, duration: r.duration,
  instrumental: !!r.instrumental, syncedLyrics: r.syncedLyrics || null, plainLyrics: r.plainLyrics || null });

async function askLrclib(track) {
  const found = [];
  let error = 0;
  for (const req of lrclibRequests(track, CONFIG.lyricsApi)) {
    const res = await politeFetch(req.url);
    if (res.status === 200) {
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      if (req.kind === "get" && body && typeof body === "object" && !Array.isArray(body)) found.push({ rec: body, trusted: true });
      else if (Array.isArray(body)) for (const rec of body.slice(0, 20)) found.push({ rec });
    } else if (res.status !== 404) error = res.status || -1;
    const best = pickLyrics(found, track);
    if (best && best.syncedLyrics) break; // (timed lyrics found: no need to search on)
  }
  const best = pickLyrics(found, track);
  return { rec: best ? slim(best) : null, error: best ? 0 : error };
}

async function keptLyrics(key) {
  try {
    const got = (await chrome.storage.session.get(`ly:${key}`))[`ly:${key}`];
    if (got && Date.now() - got.at < (got.rec ? FOUND_FOR : NONE_FOR)) return got;
  } catch { /* no session storage */ }
  return null;
}
async function keepLyrics(key, answer) {
  try {
    const index = (await chrome.storage.session.get("ly:index"))["ly:index"] || [];
    const next = index.filter((k) => k !== key).concat(key);
    const drop = next.splice(0, Math.max(0, next.length - KEEP_SONGS));
    await chrome.storage.session.set({ [`ly:${key}`]: { ...answer, at: Date.now() }, "ly:index": next });
    if (drop.length) await chrome.storage.session.remove(drop.map((k) => `ly:${k}`));
  } catch { /* kept nowhere: asked again next time */ }
}

let lyricsQueue = Promise.resolve();
const asking = new Map(); // key -> the answer on its way (two tabs asking for one song: asked once)
function lyricsFor(track) {
  const key = lyricsKey(track);
  if (asking.has(key)) return asking.get(key);
  const job = lyricsQueue.then(async () => {
    const kept = await keptLyrics(key);
    if (kept) return { rec: kept.rec, error: 0 };
    const answer = await askLrclib(track);
    if (!answer.error) await keepLyrics(key, answer); // (a failure is asked again next time)
    return answer;
  });
  lyricsQueue = job.catch(() => {});
  asking.set(key, job);
  job.finally(() => asking.delete(key)).catch(() => {});
  return job;
}

const cleanTrack = (t) => ({
  title: String((t && t.title) || "").slice(0, 300), artist: String((t && t.artist) || "").slice(0, 300),
  album: String((t && t.album) || "").slice(0, 300), duration: Math.max(0, Math.min(36000, Number(t && t.duration) || 0)),
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "lyrics" || !sender.url || !sender.url.startsWith(chrome.runtime.getURL("spotify.html"))) return false;
  const track = cleanTrack(msg.track);
  if (!track.title) { reply({ rec: null, error: 0 }); return false; }
  lyricsFor(track).then(reply, () => reply({ rec: null, error: -1 }));
  return true; // answered later
});

// ---------- the toolbar button, and the first start ----------

chrome.action.onClicked.addListener(async () => {
  const s = await settings();
  const url = isLanguage(s.study_language) ? browseAddresses(CONFIG.netflixBase)[0] : CONFIG.webApp;
  chrome.tabs.create({ url });
});

chrome.runtime.onInstalled.addListener((d) => {
  // Once, after it is added: the web app, which hands the extension its settings (and says so).
  if (d.reason === "install") chrome.tabs.create({ url: CONFIG.webApp });
});
