// A picture on the back of a flashcard (prototype "card_pictures"): found with Openverse (api.openverse.org)
// by the card's short meaning ("dog"), or the learner's own photo. No screen code here (the tests run it
// without a browser); the picker is components/picturepick.js and the picture on a card components/cardpic.js.
//
// Openverse's rules (docs.openverse.org/terms_of_service.html, read 2026-11-23) and what this file does for them:
//   - Anonymous use is allowed, within its rate limits: per device 20 searches a minute, 200 a day, and 1000
//     thumbnails a day (the X-RateLimit headers). Every device asks Openverse itself (each from its own address,
//     never through the web app's Cloudflare go-between: Openverse answers web pages, Access-Control-Allow-Origin *),
//     so no one address asks for everybody. "Add pictures" for many cards goes one card every BATCH_GAP_MS and stops
//     for the day at BATCH_DAY_CAP searches (leaving room for the picker); a 429 stops it at once.
//   - No key: an app key ("standard" tier) is optional and only raises the limits, and a key inside an app anyone
//     can open is no secret. Nothing personal is sent: only the words searched for, no-referrer, no cookies.
//   - "Must not scrape the catalog": a search is only ever for one card's meaning, and only the one picture chosen
//     is downloaded (as Openverse's own small thumbnail).
//   - Attribution: each picture keeps its creator, licence and source link with the card, and the card shows
//     "Photo: name · CC BY 2.0" linking to the source (creditText).
//   - "Made using Openverse but not endorsed or certified by Openverse": the picker and Settings say so (NOTICE).
//   - Only licences that allow commercial use (Tamkeen will be a paid app): CC0, public domain, CC BY, CC BY-SA.
//     Never NC (non-commercial) or ND (no derivatives). Openverse's own license_type=commercial lets ND through,
//     so the list is given exactly, and every result is checked again here (cleanResult).
//
// Where a picture lives: a small JPEG (PICTURE_SIDE px at most, about 20-30 KB) as its own file in the learner's
// Drive app folder, p_<card uid>_<version>.jpg (app/sync/engine.py, mobile/src/js/sync.js), and a copy on each
// device, so it shows offline. The card itself only carries `picture`, a short JSON text: its version and credit.

export const API = "https://api.openverse.org/v1/images/";
export const LICENSES = ["cc0", "pdm", "by", "by-sa"];
export const PICTURE_SIDE = 360;
export const QUALITY = 0.75;
export const MAX_BYTES = 400 * 1024;       // what a device accepts as a card's picture (the server too)
export const PAGE_SIZE = 12;               // pictures shown in the picker at a time
export const BATCH_GAP_MS = 4000;          // "Add pictures": one card every 4 s (15 a minute, under 20)
export const BATCH_DAY_CAP = 150;          // ... and at most 150 searches a day on this device (of Openverse's 200)
export const DOWN = "Openverse isn't answering right now. Try again later.";
export const TIMEOUT_MS = 20000;          // a search that hasn't answered by then is given up on
export const NOTICE = "Pictures found with Openverse. Tamkeen isn't endorsed or certified by Openverse.";

const LICENSE_NAMES = { cc0: "CC0", pdm: "Public domain", by: "CC BY", "by-sa": "CC BY-SA" };
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const VERSION = /^[a-f0-9]{8,16}$/;

/** What to search Openverse for: the card's short meaning, its first sense only, without "to " / "a " / "the ",
 * brackets or notes ("to eat (food); meal" → "eat"). "" when there is nothing to search for. */
export function searchQuery(meaning) {
  let s = String(meaning || "").replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ");
  s = s.split(/[;,/|•·\n]| - | – /)[0] || "";
  s = s.replace(/[“”"«»…?!.:]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(to|a|an|the|be)\s+(?=\S)/i, "").replace(/^(to|a|an|the)\s+(?=\S)/i, "");
  const words = s.split(" ").filter(Boolean).slice(0, 4);
  return words.join(" ").slice(0, 60);
}

/** The search address: only the licences that allow commercial use, nothing marked mature. */
export function searchUrl(query, { page = 1, pageSize = PAGE_SIZE } = {}) {
  const q = new URLSearchParams({ q: String(query || "").slice(0, 200), license: LICENSES.join(","), mature: "false",
                                  page_size: String(pageSize), page: String(Math.max(1, Math.min(20, page | 0))) });
  return `${API}?${q}`;
}

const text = (x, n) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, n);
const httpsUrl = (x) => (/^https?:\/\/[^\s"<>]+$/i.test(String(x || "")) ? String(x).slice(0, 500) : "");

/** One search result as the picker uses it, or null when it may not be used (a licence that isn't allowed, no
 * id, marked mature, or no thumbnail). */
export function cleanResult(r) {
  if (!r || typeof r !== "object") return null;
  const license = String(r.license || "").toLowerCase();
  if (!LICENSES.includes(license) || r.mature === true || !SAFE_ID.test(String(r.id || ""))) return null;
  const thumb = httpsUrl(r.thumbnail) || `${API}${r.id}/thumb/`;
  return {
    id: String(r.id), thumb, title: text(r.title, 200), creator: text(r.creator, 120), creator_url: httpsUrl(r.creator_url),
    license, license_version: text(r.license_version, 10), license_url: httpsUrl(r.license_url),
    source: httpsUrl(r.foreign_landing_url), provider: text(r.source || r.provider, 40),
    width: Number(r.width) || 0, height: Number(r.height) || 0,
  };
}

/** Search Openverse. `fetcher` is fetch (tests give their own). Returns {results, pages}; a refused search throws
 * an Error whose `rate` is true when it was the rate limit (try again later). */
export async function searchPictures(query, { page = 1, pageSize = PAGE_SIZE, fetcher = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const q = String(query || "").trim();
  if (!q) return { results: [], pages: 0 };
  let res;
  const stop = typeof AbortController === "function" ? new AbortController() : null;
  const timer = stop ? setTimeout(() => stop.abort(), timeoutMs) : 0;
  try {
    res = await fetcher(searchUrl(q, { page, pageSize }), { credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" },
                                                          ...(stop ? { signal: stop.signal } : {}) });
  } catch {
    // (A refused or timed-out search while the device is online is Openverse having trouble: its error pages carry no
    // header that lets a web page read them, so they look like a lost connection here. Seen 2026-11-23.)
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if ((stop && stop.signal.aborted) || online) throw Object.assign(new Error(DOWN), { down: true });
    throw Object.assign(new Error("Couldn't reach Openverse. Check the internet connection and try again."), { offline: true });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    throw Object.assign(new Error("Openverse asks Tamkeen to slow down: try again in a while."), { rate: true });
  }
  if (!res.ok) throw Object.assign(new Error(`Openverse didn't answer (${res.status}). Try again later.`), { down: res.status >= 500 });
  const data = await res.json();
  const results = (Array.isArray(data && data.results) ? data.results : []).map(cleanResult).filter(Boolean);
  return { results, pages: Math.max(0, Number(data && data.page_count) || 0) };
}

/** A new picture's version: a short random hex text (part of its file's name, so a changed picture is a new file). */
export function newVersion(random = Math.random) {
  let s = "";
  while (s.length < 12) s += Math.floor(random() * 16).toString(16);
  return s;
}

/** What a card keeps about its picture (the `picture` field, as JSON): from an Openverse result, or "own". */
export function pictureMeta(result, version = newVersion()) {
  if (!result) return { v: version, src: "own" };
  return { v: version, src: "openverse", id: result.id, title: result.title, by: result.creator, by_url: result.creator_url,
           lic: result.license, lic_v: result.license_version, lic_url: result.license_url, url: result.source };
}

/** A card's picture from its `picture` field (a JSON text, or already an object), checked; null when it has none. */
export function pictureOf(card) {
  let p = card && card.picture;
  if (!p) return null;
  if (typeof p === "string") {
    try { p = JSON.parse(p); } catch { return null; }
  }
  return cleanMeta(p);
}

/** A picture's details as they may be stored (the same check as app/api/vocab.py clean_picture): null if wrong. */
export function cleanMeta(p) {
  if (!p || typeof p !== "object" || !VERSION.test(String(p.v || ""))) return null;
  if (p.src === "own") return { v: p.v, src: "own" };
  if (p.src !== "openverse" || !LICENSES.includes(String(p.lic || "")) || !SAFE_ID.test(String(p.id || ""))) return null;
  return { v: p.v, src: "openverse", id: String(p.id), title: text(p.title, 200), by: text(p.by, 120), by_url: httpsUrl(p.by_url),
           lic: p.lic, lic_v: text(p.lic_v, 10), lic_url: httpsUrl(p.lic_url), url: httpsUrl(p.url) };
}

/** The picture's file name (in Drive, and on each device): p_<card uid>_<version>.jpg. */
export const pictureFile = (uid, meta) => (meta && VERSION.test(meta.v) && /^\w{1,64}$/.test(String(uid || "")) ? `p_${uid}_${meta.v}.jpg` : "");

/** The licence's short name: "CC BY 2.0", "CC0", "Public domain". */
export function licenseName(lic, version = "") {
  const name = LICENSE_NAMES[lic] || "";
  if (!name) return "";
  return lic === "by" || lic === "by-sa" ? `${name}${version ? ` ${version}` : ""}` : name;
}

/** The small credit under a picture: "Photo: Jane Doe · CC BY 2.0" ("" for the learner's own picture). */
export function creditText(meta) {
  if (!meta || meta.src !== "openverse") return "";
  const who = meta.by || "unknown";
  return `Photo: ${who} · ${licenseName(meta.lic, meta.lic_v)}`;
}

/** What a card's picture is called inside Anki: tk-<uid>-p-<v>.jpg (app/pictures.py anki_name). */
export const ankiName = (uid, meta) => (pictureFile(uid, meta) ? `tk-${uid}-p-${meta.v}.jpg` : "");

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));
/** The Anki note's image field for a card's picture: the picture and its credit, linked to where it came from
 * (app/pictures.py anki_field: the same text). */
export function ankiImageField(meta, name) {
  if (!name) return "";
  let out = `<img src="${escHtml(name)}">`;
  const credit = creditText(meta);
  if (credit) out += `<div class="tk-credit">${meta.url ? `<a href="${escHtml(meta.url)}">${escHtml(credit)}</a>` : escHtml(credit)}</div>`;
  return out;
}

// ---------------------------------------------------------------- going gently: searches counted per day

const QUOTA_KEY = "tk_openverse_day";
/** Today's count of searches on this device ({day, n}), from `store` (localStorage; tests give a Map-like one). */
export function searchesToday(store, day) {
  try {
    const raw = JSON.parse(store.getItem(QUOTA_KEY) || "null");
    return raw && raw.day === day ? Number(raw.n) || 0 : 0;
  } catch { return 0; }
}
export function countSearch(store, day) {
  const n = searchesToday(store, day) + 1;
  try { store.setItem(QUOTA_KEY, JSON.stringify({ day, n })); } catch { /* a full or blocked storage: no count */ }
  return n;
}
/** Is there room for one more search by "Add pictures" today? */
export const batchRoom = (store, day) => searchesToday(store, day) < BATCH_DAY_CAP;

/** The cards "Add pictures" would give a picture: in the language being learned, with a meaning, without one, not
 * already tried (`tried`: a Set of uids searched for and found nothing). */
export function cardsWanting(cards, tried = new Set()) {
  return (cards || []).filter((v) => v && !v.deleted && !pictureOf(v) && searchQuery(v.meaning) && !tried.has(v.uid || v.id));
}

/** The first picture that fits a card: the first usable result (Openverse ranks them). */
export const firstPicture = (results) => (results || []).find(Boolean) || null;
