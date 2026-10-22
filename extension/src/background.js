// Tamkeen for Netflix: the extension's background part (a service worker in Chrome and Edge, a
// background script in Firefox). It
//   - notices the subtitle files Netflix's player downloads in a Netflix tab (Netflix's video servers
//     serve them as XML; the list of subtitles inside Netflix's page is encrypted, so this is the way
//     to get them), fetches each again (no sign-in needed), reads it (web/js/netflix-ttml.js) and hands
//     those in the language being learned to that tab's subtitle bar (panel.html);
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

const SUB_HOSTS = new RegExp(CONFIG.subtitleHosts);
const KEEP = 8; // subtitle files kept per tab

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
  const s = await settings();
  if (!isLanguage(s.study_language)) return;
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
  if (!parsed.cues.length || baseLanguage(parsed.lang) !== baseLanguage(s.study_language)) return;
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
