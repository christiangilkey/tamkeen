// The phone's stand-in for the desktop's local server: answers the same /api requests the
// shared screens make (library, player, vocab, search) from on-phone storage.
// Ids are the global uids, so links work the same everywhere.

import { audio, kv, lib, now, saveLibrary, transcripts } from "./store.js";
import { fetchTranscript, requestSync, syncNow, syncState } from "./sync.js";
import { episodeUid, feedUid, findSpans, newUid, normalize, normalizeUrl } from "./shared-logic.js";
import { saveSettingsPatch, settings } from "./store.js";
import { savedSites, setSite, typedSite } from "./browser-sites.js";
import { detectLanguage, isLanguage, studyLanguage } from "./languages.js";
import { MAX_UPLOAD_BYTES } from "./stt.js";
import { lexiconData, lexiconDownload, lexiconRemove, lexiconStatus } from "./lexicon-store.js";
import { NativeHttp, isNative, webFetch } from "./native.js";
import { newEpisodeRecords, parseFeed } from "./rss.js";
import * as cloud from "./transcribe-service.js";
import { replaceInText } from "./correction.js";
import { unpackTranscript } from "./sharetext.js";
import { blockKind } from "./blockmarks.js";
import { phoneCanReach } from "./cardvoice.js";
import * as phoneReels from "./reels-phone.js";
import { anki, requestAnkiSync } from "./anki-phone.js";
import { cleanInfo, cleanTitleId, displayTitle } from "./netflix-ttml.js";

export class ApiError extends Error {}

const changed = () => { saveLibrary(); requestSync(); requestAnkiSync(); };
const feedOf = (uid) => lib.feeds.find((f) => f.uid === uid);
const episodeOf = (uid) => lib.episodes.find((e) => e.uid === uid && !e.deleted);
const liveEpisodes = () => lib.episodes.filter((e) => !e.deleted);

export const LOCAL_FEED_URL = "local:videos";
const AUDIO_FEED_URL = "local:audio";
const PAGES_FEED_URL = "local:pages";
const MAX_PAGE_WORDS = 30000;
// Books (same layout as the desktop's app/books.py): a free classic or an uploaded file, already
// split into headings and paragraphs by web/js/books.js; read a page at a time (pages/book.js).
const BOOKS_FEED_URL = "local:books";
const MAX_BOOK_WORDS = 500000;
const YOUTUBE_FEED_URL = "local:youtube";
const MAX_YOUTUBE_WORDS = 60000;
const NETFLIX_FEED_URL = "local:netflix";

function cleanPageUrl(text) {
  let url = String(text || "").trim();
  if (/^(javascript|data|file|vbscript|about|blob|chrome|edge):/i.test(url)) url = "";
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  let u;
  try { u = new URL(url); } catch { u = null; }
  if (!u || !["http:", "https:"].includes(u.protocol) || !u.hostname) {
    throw new ApiError("Paste a web address, like https://example.com/article");
  }
  return url;
}

/** Store an imported web page (same layout as the desktop's app/pages.py): the page's text is
 * its "transcript", one segment per block, word "times" are just positions. */
async function savePage(body) {
  const url = cleanPageUrl(body.url);
  const segments = [];
  const kinds = [];
  const words = { start: [], end: [], text: [], seg: [] };
  for (const b of body.blocks || []) {
    let tokens = String(b.text || "").split(/\s+/).filter(Boolean);
    if (words.text.length + tokens.length > MAX_PAGE_WORDS) tokens = tokens.slice(0, MAX_PAGE_WORDS - words.text.length);
    if (!tokens.length) continue;
    const first = words.text.length;
    tokens.forEach((t, i) => { words.start.push(first + i); words.end.push(first + i + 1); words.text.push(t); words.seg.push(segments.length); });
    segments.push([first, first + tokens.length, tokens.join(" ")]);
    kinds.push(blockKind(b, tokens.length)); // its kind, with its bold and italic words (blockmarks.js)
  }
  if (!segments.length) throw new ApiError("No readable text was found on that page.");
  const t = now();
  const fuid = await feedUid(PAGES_FEED_URL);
  let feed = feedOf(fuid);
  if (!feed) {
    feed = { uid: fuid, url: PAGES_FEED_URL, title: "My webpages", description: "Web pages you imported to read with clickable words.",
             image: null, link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
    lib.feeds.push(feed);
  } else if (feed.deleted) {
    Object.assign(feed, { deleted: 0, updated_at: t });
  }
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const uid = await episodeUid(fuid, url);
  const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 300) || host || "Web page";
  const image = typeof body.image === "string" && body.image.startsWith("https://") ? body.image : null;
  // Latin letters could be several languages: the one being learned is the guess, unless the page
  // says (a page a friend sent carries the language it had for them).
  const hint = isLanguage(body.language) ? body.language : settings.study_language || "ar";
  const language = detectLanguage(segments.slice(0, 60).map((s) => s[2]).join(" "), hint);
  const fields = { title, description: String(body.site || host).slice(0, 200), image, audio_url: url, audio_type: "text/html",
                   language: isLanguage(language) ? language : settings.study_language || "ar",
                   transcript_rev: t, model: "webpage", deleted: 0, updated_at: t };
  let ep = lib.episodes.find((e) => e.uid === uid);
  if (ep) Object.assign(ep, fields);
  else {
    ep = { uid, feed_uid: fuid, guid: url, published: t, duration: null, transcribe_requested_at: null, remote_audio: 0,
           created_at: t, ...fields };
    lib.episodes.push(ep);
  }
  await transcripts.put(uid, { format: 1, rev: t, model: "webpage", kinds, segments, words });
  // The text has to reach Drive too, so the computer and other devices get the page.
  const pending = new Set((await kv.get("pending_transcripts")) || []);
  pending.add(uid);
  await kv.set("pending_transcripts", [...pending]);
  changed();
  return { ...episodeOut(ep), words: words.text.length };
}

/** Store a book: its text is its "transcript", one segment per heading or paragraph. */
async function saveBook(body) {
  const guid = String(body.guid || "").trim().slice(0, 300);
  if (!/^(book|file):/.test(guid)) throw new ApiError("Unknown book.");
  const segments = [];
  const kinds = [];
  const words = { start: [], end: [], text: [], seg: [] };
  for (const b of body.blocks || []) {
    let tokens = String(b.text || "").split(/\s+/).filter(Boolean);
    if (words.text.length + tokens.length > MAX_BOOK_WORDS) tokens = tokens.slice(0, MAX_BOOK_WORDS - words.text.length);
    if (!tokens.length) continue;
    const first = words.text.length;
    tokens.forEach((t, i) => { words.start.push(first + i); words.end.push(first + i + 1); words.text.push(t); words.seg.push(segments.length); });
    segments.push([first, first + tokens.length, tokens.join(" ")]);
    kinds.push(blockKind(b, tokens.length)); // its kind, with its bold and italic words (blockmarks.js)
  }
  if (!segments.length) throw new ApiError("No readable text was found in that book.");
  const t = now();
  const fuid = await feedUid(BOOKS_FEED_URL);
  let feed = feedOf(fuid);
  if (!feed) {
    feed = { uid: fuid, url: BOOKS_FEED_URL, title: "My books", description: "Books to read a page at a time with clickable words.",
             image: null, link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
    lib.feeds.push(feed);
  } else if (feed.deleted) {
    Object.assign(feed, { deleted: 0, updated_at: t });
  }
  const uid = await episodeUid(fuid, guid);
  const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 300) || "Book";
  const author = String(body.author || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const language = isLanguage(body.lang) ? body.lang
    : detectLanguage(segments.slice(0, 80).map((s) => s[2]).join(" "), settings.study_language || "ar");
  const fields = { title, description: author, image: null, audio_url: String(body.source || "").slice(0, 500), audio_type: "text/book",
                   language: isLanguage(language) ? language : settings.study_language || "ar",
                   transcript_rev: t, model: "book", deleted: 0, updated_at: t };
  let ep = lib.episodes.find((e) => e.uid === uid);
  if (ep) Object.assign(ep, fields);
  else {
    ep = { uid, feed_uid: fuid, guid, published: t, duration: null, transcribe_requested_at: null, remote_audio: 0,
           created_at: t, ...fields };
    lib.episodes.push(ep);
  }
  await transcripts.put(uid, { format: 1, rev: t, model: "book", kinds, segments, words });
  const pending = new Set((await kv.get("pending_transcripts")) || []);
  pending.add(uid);
  await kv.set("pending_transcripts", [...pending]);
  changed();
  return { ...episodeOut(ep), words: words.text.length };
}

/** Store a YouTube video and its captions (same layout as the desktop's app/youtube.py): the
 * captions are its transcript; the video itself stays on YouTube. */
async function saveYouTube(body) {
  const id = String(body.video_id || "").trim();
  if (!/^[\w-]{11}$/.test(id)) throw new ApiError("That doesn't look like a YouTube video.");
  const num = (x) => Math.max(0, Number(x) || 0);
  const { segments, words } = captionTranscript(body.lines);
  if (!segments.length) throw new ApiError("No captions available for this video.");
  const t = now();
  const fuid = await feedUid(YOUTUBE_FEED_URL);
  let feed = feedOf(fuid);
  if (!feed) {
    feed = { uid: fuid, url: YOUTUBE_FEED_URL, title: "YouTube",
             description: "YouTube videos you added. They play from YouTube; their captions are the transcript.",
             image: null, link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
    lib.feeds.push(feed);
  } else if (feed.deleted) {
    Object.assign(feed, { deleted: 0, updated_at: t });
  }
  const uid = await episodeUid(fuid, id);
  // As app/youtube.py caption_model: YouTube's translation, its automatic captions, or a person's.
  const model = body.kind === "translated" ? "youtube-translated"
    : body.kind === "auto" || (body.kind == null && body.auto) ? "youtube-auto" : "youtube-captions";
  const language = isLanguage(body.language) ? body.language
    : detectLanguage(segments.slice(0, 60).map((s) => s[2]).join(" "), settings.study_language || "ar");
  const fields = { title: String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 300) || "YouTube video",
                   description: String(body.channel || "").slice(0, 200), image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                   audio_url: `https://www.youtube.com/watch?v=${id}`, audio_type: "video/youtube",
                   duration: num(body.duration) || segments.at(-1)[1], language, transcript_rev: t, model, deleted: 0, updated_at: t };
  let ep = lib.episodes.find((e) => e.uid === uid);
  if (ep) Object.assign(ep, fields);
  else {
    ep = { uid, feed_uid: fuid, guid: id, published: t, transcribe_requested_at: null, remote_audio: 0, created_at: t, ...fields };
    lib.episodes.push(ep);
  }
  await transcripts.put(uid, { format: 1, rev: t, model, segments, words });
  // The captions have to reach Drive too, so the computer and other devices get the video.
  const pending = new Set((await kv.get("pending_transcripts")) || []);
  pending.add(uid);
  await kv.set("pending_transcripts", [...pending]);
  changed();
  return { ...episodeOut(ep), words: words.text.length };
}

/** Caption lines ([{start, end, text, words: [[start, end, word]]}], as YouTube's captions and
 * Netflix's subtitles arrive) -> a transcript's segments and words. */
function captionTranscript(lines, max = MAX_YOUTUBE_WORDS) {
  const num = (x) => Math.max(0, Number(x) || 0);
  const segments = [];
  const words = { start: [], end: [], text: [], seg: [] };
  for (const line of [...(lines || [])].sort((a, b) => num(a.start) - num(b.start))) {
    let list = (line.words || []).filter((w) => Array.isArray(w) && String(w[2] ?? "").trim());
    if (words.text.length + list.length > max) list = list.slice(0, max - words.text.length);
    if (!list.length) continue;
    for (const [start, end, text] of list) {
      words.start.push(num(start));
      words.end.push(Math.max(num(start), num(end)));
      words.text.push(String(text).replace(/\s+/g, "").slice(0, 120));
      words.seg.push(segments.length);
    }
    const text = String(line.text || "").replace(/\s+/g, " ").trim() || list.map((w) => w[2]).join(" ");
    segments.push([line.start == null ? num(list[0][0]) : num(line.start), Math.max(num(line.end), num(list.at(-1)[1])), text.slice(0, 2000)]);
  }
  return { segments, words };
}

/** A Netflix title watched with the browser extension (the web app on a computer; see
 * web-extension.js), with its subtitles as `lines` when they arrived: the same episode of the built-in
 * "Netflix" list as the computer's (app/netflix.py save_title, save_subtitles), so the two agree.
 * Netflix's subtitles stay in the user's own library: never sent to a friend (sendmedia.js). */
async function saveNetflix(body) {
  const id = cleanTitleId(body.id);
  if (!id) throw new ApiError("That doesn't look like a Netflix title.");
  const info = cleanInfo(body.info);
  const { segments, words } = captionTranscript(body.lines);
  const t = now();
  const fuid = await feedUid(NETFLIX_FEED_URL);
  let feed = feedOf(fuid);
  if (!feed) {
    feed = { uid: fuid, url: NETFLIX_FEED_URL, title: "Netflix",
             description: "Netflix titles you watched in Tamkeen. They play from Netflix; their subtitles are the transcript.",
             image: null, link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
    lib.feeds.push(feed);
  } else if (feed.deleted) {
    Object.assign(feed, { deleted: 0, updated_at: t });
  }
  const uid = await episodeUid(fuid, id);
  let ep = lib.episodes.find((e) => e.uid === uid);
  const named = !!(info.title || info.show);
  const language = isLanguage(body.language) ? body.language : (ep && ep.language) || studyLanguage();
  const fields = { title: named || !ep ? displayTitle(info) : ep.title, description: info.show || (ep && ep.description) || "",
                   image: info.image || (ep && ep.image) || null, audio_url: `https://www.netflix.com/watch/${id}`,
                   audio_type: "video/netflix", language, deleted: 0, updated_at: t };
  if (info.duration) fields.duration = info.duration;
  // Its subtitles, unless the ones kept already have as many lines (watched again).
  const old = ep && ep.transcript_rev ? await transcripts.get(uid) : null;
  const better = segments.length && !(old && old.segments && old.segments.length >= segments.length);
  if (better) Object.assign(fields, { model: "netflix-subtitles", transcript_rev: t, duration: fields.duration || (ep && ep.duration) || segments.at(-1)[1] });
  if (ep) Object.assign(ep, fields);
  else {
    ep = { uid, feed_uid: fuid, guid: id, published: t, transcribe_requested_at: null, remote_audio: 0, created_at: t,
           model: "netflix-pending", duration: null, ...fields };
    lib.episodes.push(ep);
  }
  if (better) {
    await transcripts.put(uid, { format: 1, rev: t, model: "netflix-subtitles", segments, words });
    // The subtitles reach the user's other devices through his own Drive, like a YouTube video's captions.
    const pending = new Set((await kv.get("pending_transcripts")) || []);
    pending.add(uid);
    await kv.set("pending_transcripts", [...pending]);
  }
  changed();
  return { ...episodeOut(ep), words: better ? words.text.length : (old && old.words ? old.words.text.length : 0) };
}

const FEED_WAITING = "Episodes appear after your computer syncs this feed.";
const FEED_CHECK_EVERY = 60 * 60; // seconds between automatic looks at one podcast's feed
const FEED_CHECKS_AT_ONCE = 4;

const headerOf = (res, name) => {
  const headers = (res && res.headers) || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
};

/** Download a podcast feed's text. `seen` ({etag, modified} from the last read, updated here)
 * lets the server answer "nothing has changed" instead of sending the whole feed again: then
 * this resolves to null. Redirects are followed by hand (the phone's own web requests don't
 * follow one that changes between http and https). */
async function downloadFeed(url, seen = null) {
  if (!isNative) { // the web app (through the go-between server), or a development preview
    const res = await webFetch(url);
    if (!res.ok) throw new Error(`The feed server returned HTTP ${res.status}.`);
    return res.text();
  }
  const headers = { "User-Agent": "Tamkeen/Android (+podcast reader)", Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" };
  if (seen && seen.etag) headers["If-None-Match"] = seen.etag;
  if (seen && seen.modified) headers["If-Modified-Since"] = seen.modified;
  for (let hop = 0; hop < 5; hop++) {
    const res = await NativeHttp.get({ url, responseType: "text", connectTimeout: 15000, readTimeout: 30000, headers });
    const next = headerOf(res, "location");
    if (res.status === 304) return null;
    if (res.status >= 300 && res.status < 400 && next) { url = new URL(next, url).href; continue; }
    if (res.status >= 400) throw new Error(`The feed server returned HTTP ${res.status}.`);
    if (seen) Object.assign(seen, { etag: headerOf(res, "etag"), modified: headerOf(res, "last-modified") });
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  }
  throw new Error("The feed kept sending the app somewhere else.");
}

/** Read a podcast's feed on the phone itself and add the episodes it doesn't have yet, so the
 * phone doesn't depend on the computer for them. Episodes get the same ids the computer gives
 * them (see rss.js), so both devices end up with one copy. Returns how many were new. */
async function readFeed(feed, seen = null) {
  // "Has it changed?" only makes sense once the phone holds this podcast's episodes.
  if (seen && !lib.episodes.some((e) => e.feed_uid === feed.uid)) Object.assign(seen, { etag: null, modified: null });
  const xml = await downloadFeed(feed.url, seen);
  if (xml === null) return 0; // unchanged since the last look
  const parsed = await parseFeed(xml);
  const uids = await Promise.all(parsed.episodes.map((ep) => episodeUid(feed.uid, ep.guid)));
  // From here on nothing waits, so a sync can't slip in between reading the library and adding to it.
  const t = now();
  const known = new Set(lib.episodes.filter((e) => e.feed_uid === feed.uid).map((e) => e.uid));
  if (!known.size || feed.description === FEED_WAITING) {
    // A podcast just added here: its real name, picture and description. (Afterwards these
    // are left to the computer, so the two don't keep overwriting each other.)
    Object.assign(feed, { title: parsed.title, description: parsed.description.slice(0, 1000), image: parsed.image || feed.image || null,
                          link: parsed.link || feed.link || null, updated_at: t });
  }
  const fresh = newEpisodeRecords(feed, parsed.episodes, uids, known, t);
  lib.episodes.push(...fresh);
  return fresh.length;
}

/** Remove an episode for good. It stays in the library marked deleted: that mark is what tells
 * the other devices (the computer then frees the Drive space) and what stops a podcast's feed
 * from bringing the episode back the next time it is read. */
async function removeEpisode(uid) {
  const e = episodeOf(uid);
  if (!e) return false;
  Object.assign(e, { deleted: 1, transcribe_requested_at: null, updated_at: now() });
  await transcripts.delete(e.uid).catch(() => {});
  await audio.delete(e.uid).catch(() => {});
  return true;
}

let checking = null;
/**
 * Look at the podcasts' feeds for new episodes. Normally each podcast is looked at no more than
 * once an hour; `force` looks now (the Refresh button), `only` limits it to one podcast.
 * Resolves to how many new episodes were found.
 */
export function checkFeeds({ force = false, only = null } = {}) {
  if (checking) return checking;
  checking = (async () => {
    const checks = (await kv.get("feed_checks")) || {}; // per podcast: when it was last read, and the server's "version" marks
    const due = lib.feeds.filter((f) => !f.deleted && !f.url.startsWith("local:") && (!only || f.uid === only)
      && (force || !checks[f.uid] || now() - (checks[f.uid].at || 0) > FEED_CHECK_EVERY));
    if (!due.length) return 0;
    let added = 0;
    let changedAny = false;
    const queue = [...due];
    const worker = async () => {
      for (let feed = queue.shift(); feed; feed = queue.shift()) {
        const seen = checks[feed.uid] || (checks[feed.uid] = {});
        const before = feed.updated_at;
        try { added += await readFeed(feed, seen); } catch (e) { console.warn("Couldn't read the feed", feed.url, e); }
        if (feed.updated_at !== before) changedAny = true;
        seen.at = now(); // also after a failure: try again in an hour (or on Refresh), not on every look
      }
    };
    await Promise.all(Array.from({ length: Math.min(FEED_CHECKS_AT_ONCE, queue.length) }, worker));
    for (const uid of Object.keys(checks)) if (!lib.feeds.some((f) => f.uid === uid && !f.deleted)) delete checks[uid];
    await kv.set("feed_checks", checks);
    if (added || changedAny) changed();
    return added;
  })().finally(() => { checking = null; });
  return checking;
}

/** Record a video or audio file this phone just uploaded to Drive. The computer transcribes it on
 * its next sync; with cloud transcription on, a file small enough to send (`file`) is transcribed
 * from here straight away instead. */
export async function addUploadedVideo({ uid, title, driveName, mime, duration, audio = false, file = null }) {
  const url = audio ? AUDIO_FEED_URL : LOCAL_FEED_URL;
  const fuid = await feedUid(url);
  const t = now();
  let feed = feedOf(fuid);
  if (!feed) {
    feed = { uid: fuid, url, title: audio ? "My audio" : "My videos", description: `${audio ? "Audio" : "Video"} files you added yourself. They're stored in your Google Drive.`,
             image: null, link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
    lib.feeds.push(feed);
  } else if (feed.deleted) {
    Object.assign(feed, { deleted: 0, updated_at: t });
  }
  const ep = { uid, feed_uid: fuid, guid: uid, title, description: "", published: t, duration: duration || null, image: null,
               audio_url: `drive:${driveName}`, audio_type: mime, transcript_rev: null, model: null,
               transcribe_requested_at: t, remote_audio: 1, deleted: 0, created_at: t, updated_at: t };
  lib.episodes.push(ep);
  changed();
  const here = !!file && cloud.cloudOn() && file.size <= MAX_UPLOAD_BYTES && studyLanguage() !== "ceb"; // (Bisaya: the computer)
  if (here) cloud.enqueue([uid], { [uid]: file });
  return { ...episodeOut(ep), here };
}

/** Where an episode stands. While this phone is transcribing it (cloud transcription), that is
 * what shows: queued, downloading, transcribing, or failed with the reason. */
export function episodeStatus(e) {
  const job = cloud.jobOf(e.uid);
  if (job) return job.status;
  if (e.transcript_rev) return "done";
  if (e.transcribe_requested_at) return "queued";
  return "new";
}

// ----- one language at a time: the lists show only what is in the language being learned -----
const builtIn = (f) => !!(f && String(f.url || "").startsWith("local:"));
/** A podcast's language (none for the built-in lists: own videos, web pages, YouTube, reels). */
const feedLanguage = (f) => (builtIn(f) ? null : isLanguage(f && f.language) ? f.language : null);
/** An episode's language: its own, else its podcast's, else the one being learned. */
export const episodeLang = (e) => (isLanguage(e.language) ? e.language : feedLanguage(feedOf(e.feed_uid)) || studyLanguage());
export const wordLang = (v) => (isLanguage(v.language) ? v.language : studyLanguage());
const studying = (code) => code === studyLanguage();
const podcastShown = (f) => builtIn(f) || studying(feedLanguage(f) || studyLanguage());

/** Give podcasts, built-in-list items and words without a language one (as the computer does in
 *  app/db.py fill_languages): podcasts the language most of their transcribed episodes are in,
 *  built-in items and remaining podcasts the one being learned, words their episode's or what
 *  their letters say. Not an edit: nothing is marked as changed for sync. */
export function fillLanguages() {
  const study = studyLanguage();
  for (const f of lib.feeds) {
    if (builtIn(f) || isLanguage(f.language)) continue;
    const tally = {};
    for (const e of lib.episodes) if (e.feed_uid === f.uid && isLanguage(e.language)) tally[e.language] = (tally[e.language] || 0) + 1;
    f.language = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || study;
  }
  for (const e of lib.episodes) if (!isLanguage(e.language) && builtIn(feedOf(e.feed_uid))) e.language = study;
  for (const v of lib.vocab) {
    if (isLanguage(v.language)) continue;
    const e = v.episode_uid ? episodeOf(v.episode_uid) : null;
    const found = e ? episodeLang(e) : detectLanguage(v.text || "", study);
    v.language = isLanguage(found) ? found : study;
  }
}

function feedOut(f) {
  const eps = liveEpisodes().filter((e) => e.feed_uid === f.uid && studying(episodeLang(e)));
  return { ...f, id: f.uid, episode_count: eps.length, done_count: eps.filter((e) => e.transcript_rev).length,
           latest: Math.max(0, ...eps.map((e) => e.published || 0)) || null, last_checked: null, last_error: null };
}

function episodeOut(e) {
  const f = feedOf(e.feed_uid) || {};
  const job = cloud.jobOf(e.uid);
  return { ...e, id: e.uid, feed_id: e.feed_uid, status: episodeStatus(e), progress: job ? job.progress : e.transcript_rev ? 100 : 0,
           error: job ? job.error : null, feed_title: f.title || "", feed_image: f.image || null, feed_url: f.url || "",
           has_audio: !!e.remote_audio, language: episodeLang(e) };
}

function vocabOut(v) {
  // `audio_type`: the episode's kind, from which web/js/cardvoice.js decides whether the word's own
  // audio can be played here or a voice says it (as app/api/vocab.py _items gives it).
  // An episode whose sound this phone can't reach (no copy in Drive it can fetch, no web address: a
  // file only on the computer) counts as "missing" here (cardvoice.js phoneCanReach).
  const e = v.episode_uid ? episodeOf(v.episode_uid) : null;
  const reachable = phoneCanReach(e, settings.signed_in);
  return { ...v, id: v.uid, episode_id: v.episode_uid, folders: v.folders || [],
           audio_type: reachable ? e.audio_type || "" : v.episode_uid ? "missing" : null };
}
const folderOut = (f) => ({ uid: f.uid, name: f.name, created_at: f.created_at, updated_at: f.updated_at });
const liveFolders = () => (lib.folders || []).filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));

async function loadTranscript(uid) {
  let t = await transcripts.get(uid);
  const ep = episodeOf(uid);
  if ((!t || (ep && ep.transcript_rev && t.rev < ep.transcript_rev - 1e-3)) && settings.signed_in) {
    try { t = (await fetchTranscript(uid)) || t; } catch (e) { if (!t) throw new ApiError(`Couldn't download the transcript: ${e.message}`); }
  }
  return t;
}

/** Follow a podcast: POST /feeds, and a podcast episode a friend sent (POST /shared/podcast).
 * `language`: the one the podcast is filed under (normally the one being learned). */
async function addFeed(body, language = studyLanguage()) {
  const url = normalizeUrl(body.url || "");
  if (!body.url || !body.url.trim()) throw new ApiError("Paste an RSS feed URL.");
  const uid = await feedUid(url);
  const existing = feedOf(uid);
  if (existing && !existing.deleted) throw new ApiError("You're already subscribed to this feed.");
  const t = now();
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  // Added from Trending, the podcast's name and picture are already known; otherwise the
  // computer fills them in when it first reads the feed.
  const image = typeof body.image === "string" && body.image.startsWith("https://") ? body.image : null;
  const feed = existing
    ? Object.assign(existing, { deleted: 0, updated_at: t, language })
    : { uid, url, title: String(body.title || "").trim().slice(0, 300) || host,
        description: FEED_WAITING, image, language,  // subscribed while learning this
        link: null, auto_transcribe: 0, deleted: 0, created_at: t, updated_at: t };
  if (!existing) lib.feeds.push(feed);
  // Get the episodes now. If the feed can't be reached from the phone, the podcast is still
  // added and the computer fills it in on its next sync.
  try {
    const checks = (await kv.get("feed_checks")) || {};
    const seen = (checks[feed.uid] = {});
    await readFeed(feed, seen);
    seen.at = now(); // just read: the automatic look for new episodes can leave it for an hour
    await kv.set("feed_checks", checks);
  } catch (e) { console.warn("Couldn't read the feed on the phone", feed.url, e); }
  changed();
  return feedOut(feed);
}

const routes = [
  // ----- feeds -----
  ["GET", /^\/feeds$/, () => lib.feeds.filter((f) => !f.deleted && podcastShown(f)).map(feedOut)
    .sort((a, b) => a.title.localeCompare(b.title))],
  ["POST", /^\/feeds$/, (m, q, body) => addFeed(body)],
  ["PATCH", /^\/feeds\/([\w]+)$/, (m, q, body) => {
    const f = feedOf(m[1]);
    if (!f) throw new ApiError("Feed not found.");
    if (body.auto_transcribe !== undefined) { f.auto_transcribe = body.auto_transcribe ? 1 : 0; f.updated_at = now(); changed(); }
    return feedOut(f);
  }],
  ["DELETE", /^\/feeds\/([\w]+)$/, async (m) => {
    const f = feedOf(m[1]);
    if (f && f.url.startsWith("local:")) throw new ApiError("Delete its items one by one; this built-in list can't be removed.");
    if (f) {
      f.deleted = 1;
      f.updated_at = now();
      for (const e of lib.episodes.filter((x) => x.feed_uid === f.uid)) await transcripts.delete(e.uid).catch(() => {});
      lib.episodes = lib.episodes.filter((e) => e.feed_uid !== f.uid);
      changed();
    }
    return { ok: true };
  }],
  ["POST", /^\/feeds\/refresh$/, async (m, q) => {
    const before = lib.episodes.length;
    const podcasts = lib.feeds.some((f) => !f.deleted && !f.url.startsWith("local:"));
    // Look at the podcasts' feeds for new episodes (just the open podcast, or all of them).
    await checkFeeds({ force: true, only: q.get("feed_id") || null });
    if (!settings.signed_in) {
      if (podcasts) return { ok: true, new_episodes: Math.max(0, lib.episodes.length - before), synced: false };
      throw new ApiError("Sign in with Google (Settings) to get your library from your computer.");
    }
    await syncNow();
    if (syncState.state === "error") throw new ApiError(syncState.error);
    return { ok: true, new_episodes: Math.max(0, lib.episodes.length - before), synced: true };
  }],

  // ----- episodes -----
  ["GET", /^\/episodes$/, (m, q) => {
    let eps = liveEpisodes().filter((e) => feedOf(e.feed_uid) && !feedOf(e.feed_uid).deleted && studying(episodeLang(e)));
    if (q.get("feed_id")) eps = eps.filter((e) => e.feed_uid === q.get("feed_id"));
    else if (q.get("scope") === "podcasts") eps = eps.filter((e) => !feedOf(e.feed_uid).url.startsWith("local:"));
    // One YouTube channel's videos (a video's description is its channel's name).
    if (q.get("channel")) eps = eps.filter((e) => String(e.description || "").trim() === q.get("channel"));
    const counts = {};
    for (const e of eps) counts[episodeStatus(e)] = (counts[episodeStatus(e)] || 0) + 1;
    const status = q.get("status");
    if (status === "active") eps = eps.filter((e) => ["downloading", "transcribing"].includes(episodeStatus(e)));
    else if (status) eps = eps.filter((e) => episodeStatus(e) === status);
    const title = (q.get("q") || "").toLowerCase();
    if (title) eps = eps.filter((e) => (e.title || "").toLowerCase().includes(title));
    eps.sort((a, b) => (b.published || b.created_at || 0) - (a.published || a.created_at || 0));
    const offset = Number(q.get("offset") || 0);
    const limit = Number(q.get("limit") || 100);
    return { total: eps.length, items: eps.slice(offset, offset + limit).map(episodeOut), counts, current: null };
  }],
  ["POST", /^\/episodes\/transcribe$/, (m, q, body) => {
    const wanted = (body.ids || []).filter((id) => { const e = episodeOf(id); return e && !e.transcript_rev; });
    // Bisaya is written only by the computer, with its Bisaya model: no cloud provider knows the
    // language (they hear it as Tagalog, or fail). Queued for the computer whatever is set here.
    const bisaya = studyLanguage() === "ceb";
    // With a cloud provider set up (Settings), the phone transcribes them itself, starting now.
    if (cloud.cloudOn() && !bisaya) return { queued: cloud.enqueue(wanted), here: true };
    for (const id of wanted) Object.assign(episodeOf(id), { transcribe_requested_at: now(), updated_at: now() });
    if (wanted.length) changed();
    return { queued: wanted, note: "Your computer will transcribe these the next time it syncs.", ...(bisaya ? { computer_only: "ceb" } : {}) };
  }],
  ["POST", /^\/episodes\/([\w]+)\/cancel$/, (m) => {
    cloud.cancel(m[1]);
    const e = episodeOf(m[1]);
    if (e && e.transcribe_requested_at) { e.transcribe_requested_at = null; e.updated_at = now(); changed(); }
    return { ok: true };
  }],
  // Misheard words, changed in place after a word lookup found them (as app/corrections.py does on
  // the computer). The new transcript goes to Drive with the next sync, so the computer gets it too.
  ["POST", /^\/episodes\/([\w]+)\/correct$/, async (m, q, body) => {
    const e = episodeOf(m[1]);
    if (!e || !e.transcript_rev) throw new ApiError("Episode not found.");
    const first = Number(body.first), last = Number(body.last);
    const expect = (body.expect || []).map(String);
    const words = (body.words || []).map((w) => String(w).replace(/\s+/g, " ").trim());
    const count = last - first + 1;
    if (!(first >= 0) || !(count >= 1 && count <= 8) || expect.length !== count || words.length !== count
        || words.some((w) => !w || w.length > 120)) throw new ApiError("That change doesn't fit the transcript.");
    const t = await loadTranscript(e.uid);
    if (!t || t.words.text.slice(first, last + 1).join("\u0000") !== expect.join("\u0000")) {
      throw new ApiError("The transcript has changed since the word was looked up. Tap it again.");
    }
    const segs = new Set();
    for (let k = 0; k < count; k++) segs.add(t.words.seg[first + k]);
    for (const seg of segs) {
      const idx = t.words.seg.map((s, i) => (s === seg ? i : -1)).filter((i) => i >= 0);
      const old = idx.map((i) => t.words.text[i]);
      const next = idx.map((i) => (i >= first && i <= last ? words[i - first] : t.words.text[i]));
      if (t.segments[seg]) t.segments[seg][2] = replaceInText(t.segments[seg][2], old, next);
    }
    for (let k = 0; k < count; k++) t.words.text[first + k] = words[k];
    // Arabic: the changed words lose their vowels; the computer makes them again ("dirty").
    if (t.vowels && Array.isArray(t.vowels.words)) {
      for (let k = 0; k < count; k++) t.vowels.words[first + k] = null;
      t.vowels.dirty = true;
    }
    const rev = now();
    t.rev = rev;
    await transcripts.put(e.uid, t);
    Object.assign(e, { transcript_rev: rev, updated_at: rev });
    const pending = new Set((await kv.get("pending_transcripts")) || []);
    pending.add(e.uid);
    await kv.set("pending_transcripts", [...pending]);
    changed();
    return { ok: true, transcribed_at: rev };
  }],
  ["GET", /^\/episodes\/([\w]+)\/transcript$/, async (m) => {
    const e = episodeOf(m[1]);
    if (!e) throw new ApiError("Episode not found.");
    const t = e.transcript_rev ? await loadTranscript(e.uid) : null;
    const kinds = (t && t.kinds) || [];
    const segments = t ? t.segments.map(([start, end, text], idx) => ({ idx, start, end, text, kind: kinds[idx] || null })) : [];
    const words = t ? t.words : { start: [], end: [], text: [], seg: [] };
    const ep = episodeOut(e);
    if (e.transcript_rev && !t) ep.status = "new";
    return { episode: ep, segments, words, vowels: (t && t.vowels) || null };
  }],
  // Arabic vowel marks: made on the computer (app/tashkeel.py), they arrive inside the transcript.
  ["GET", /^\/episodes\/([\w]+)\/vowels$/, async (m) => {
    const e = episodeOf(m[1]);
    const t = e && e.transcript_rev ? await transcripts.get(e.uid) : null;
    return { vowels: (t && t.vowels) || null, pending: false };
  }],
  ["GET", /^\/vowels\/status$/, () => ({ phone: true })],
  // A saved word's sentence with vowels (review cards): taken from the transcript it was saved
  // from, when that is on the phone (the computer runs the vowel model instead).
  ["POST", /^\/vowels\/sentence$/, async (m, q, body) => {
    const e = body.episode ? episodeOf(body.episode) : null;
    const t = e && e.transcript_rev ? await transcripts.get(e.uid) : null;
    const v = t && t.vowels;
    if (!v || !Array.isArray(v.words) || body.start == null) return { sentence: null };
    const lo = Number(body.start) - 0.05, hi = Number(body.end ?? body.start + 30) + 0.05;
    const idx = t.words.text.map((_, i) => i).filter((i) => t.words.start[i] >= lo && t.words.end[i] <= hi);
    const sentence = replaceInText(String(body.sentence || ""), idx.map((i) => t.words.text[i]), idx.map((i) => v.words[i] || t.words.text[i]));
    const guess = !!v.dialect || idx.some((i) => (v.guess || []).includes(t.words.seg[i]));
    return { sentence, guess };
  }],
  ["POST", /^\/pages$/, (m, q, body) => savePage(body)],
  // Sites saved for quick access (the Library's Web page screen, pages/websites.js; the browser's
  // star): kept in settings, and they travel by Drive sync. The computer's twin is app/api/media.py.
  ["GET", /^\/browser\/sites$/, () => ({ sites: savedSites(settings.browser_sites) })],
  ["POST", /^\/browser\/sites$/, async (m, q, body) => {
    const site = typedSite(body.url, body.title);
    if (!site) throw new ApiError("That isn't a web address.");
    await saveSettingsPatch({ browser_sites: setSite(settings.browser_sites, site, body.on !== false, Math.floor(now())) });
    requestSync(30000); // so the user's other devices get it
    return { sites: savedSites(settings.browser_sites) };
  }],
  ["POST", /^\/books$/, (m, q, body) => saveBook(body)],
  // The Review tab's "Send to Google Tasks" / "Send to Onyx" (googletasks.js; the computer's is app/googletasks.py).
  ["POST", /^\/tasks\/review$/, async (m, q, body) => {
    const { sendReviewTask } = await import("./googletasks.js");
    try { return await sendReviewTask(body || {}); } catch (e) { throw new ApiError(e.message); }
  }],
  // "Send to Google Calendar", at the time chosen (googlecalendar.js; the computer's is app/googlecalendar.py).
  ["POST", /^\/calendar\/review$/, async (m, q, body) => {
    const { sendReviewEvent } = await import("./googlecalendar.js");
    try { return await sendReviewEvent(body || {}); } catch (e) { throw new ApiError(e.message); }
  }],
  ["POST", /^\/open-onyx$/, async (m, q, body) => {
    const { openOnyx } = await import("./googletasks.js");
    try { return openOnyx((body || {}).url); } catch (e) { throw new ApiError(e.message); }
  }],
  ["POST", /^\/youtube$/, (m, q, body) => saveYouTube(body)],
  // A Netflix title watched with the browser extension (the web app on a computer; web-extension.js).
  ["POST", /^\/netflix$/, (m, q, body) => saveNetflix(body)],
  // Reels are normally found and transcribed on the computer and only watched here. With cloud
  // transcription on, the phone can pick reels from the user's own Instagram saves (reels-phone.js).
  ["GET", /^\/reels$/, () => phoneReels.reelsView()],
  ["PUT", /^\/reels\/choices$/, (m, q, body) => phoneReels.setReelChoices(body)],
  ["POST", /^\/reels\/collections$/, () => phoneReels.startCollections()],
  ["POST", /^\/reels\/random$/, (m, q, body) => phoneReels.startRandom(body && body.count)],
  ["GET", /^\/reels\/saved$/, () => phoneReels.reelsListing()],
  ["POST", /^\/reels\/saved\/list$/, (m, q, body) => phoneReels.startListing(String(body.collection || "all"))],
  ["POST", /^\/reels\/saved\/send$/, (m, q, body) => phoneReels.startSelected(body.codes)],
  ["POST", /^\/reels\/cancel$/, () => { phoneReels.cancelReels(); return phoneReels.reelsStatus(); }],
  // A reel a friend sent, accepted in the chat, with the words that came with it (the twin of app/api/shared.py).
  ["POST", /^\/shared\/reel$/, async (m, q, body) => {
    const code = String(body.code || "");
    if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) throw new ApiError("That doesn't look like a reel.");
    const num = (x) => Math.max(0, Number(x) || 0);
    const segments = (Array.isArray(body.segments) ? body.segments : []).slice(0, 400).map((s) => {
      const words = (Array.isArray(s.words) ? s.words : []).filter((w) => Array.isArray(w) && String(w[2] ?? "").trim())
        .map((w) => ({ start: num(w[0]), end: Math.max(num(w[0]), num(w[1])), text: String(w[2]).replace(/\s+/g, "").slice(0, 120) }));
      const text = String(s.text || "").replace(/\s+/g, " ").trim().slice(0, 2000) || words.map((w) => w.text).join(" ");
      return { start: num(s.start), end: Math.max(num(s.end), words.length ? words.at(-1).end : num(s.start)), text, words };
    }).filter((s) => s.text);
    if (!segments.length) throw new ApiError("Nothing was said in this reel.");
    const lang = isLanguage(body.language) ? body.language : (settings.study_language || "ar");
    await phoneReels.saveReel({ code, creator: String(body.creator || "").replace(/^@/, "").slice(0, 60), caption: String(body.title || ""),
                                segments, language: lang, model: String(body.model || "shared").slice(0, 80),
                                seconds: num(body.seconds) || null, signin: !!body.signin });
    const ep = lib.episodes.find((e) => e.guid === code && e.audio_type === "video/instagram");
    changed();
    return episodeOut(ep);
  }],
  // A podcast episode a friend sent, accepted in the chat, with their transcript (the twin of
  // app/api/shared.py accept_podcast): its podcast is followed if it isn't, the episode found (or
  // kept from what was sent, when the feed no longer lists it), and the words stored. A transcript
  // made here already is kept.
  ["POST", /^\/shared\/podcast$/, async (m, q, body) => {
    const raw = String(body.feed_url || "").trim();
    if (!/^https?:\/\//i.test(raw)) throw new ApiError("This doesn't say which podcast the episode is from.");
    const lang = isLanguage(body.language) ? body.language : null;
    let feed = feedOf(await feedUid(normalizeUrl(raw)));
    let added = false;
    if (!feed || feed.deleted || builtIn(feed)) {
      feed = feedOf((await addFeed({ url: raw }, lang || studyLanguage())).id);
      added = true;
    }
    const audioUrl = /^https?:\/\//i.test(String(body.audio_url || "").trim()) ? String(body.audio_url).trim().slice(0, 1000) : "";
    const guid = String(body.guid || "").replace(/\s+/g, " ").trim().slice(0, 500) || audioUrl;
    if (!guid) throw new ApiError("This doesn't say which episode it is.");
    const uid = await episodeUid(feed.uid, guid);
    const t = now();
    let e = lib.episodes.find((x) => x.feed_uid === feed.uid && !x.deleted && (x.uid === uid || (audioUrl && x.audio_url === audioUrl)))
      || lib.episodes.find((x) => x.uid === uid);
    if (!e) {
      if (!audioUrl) throw new ApiError("This episode isn't in the podcast's episode list any more.");
      e = { uid, feed_uid: feed.uid, guid, title: String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 500) || "Episode",
            description: "", published: t, duration: Number(body.duration) > 0 ? Number(body.duration) : null,
            image: String(body.image || "").startsWith("https://") ? body.image : null, audio_url: audioUrl, audio_type: null,
            language: lang, transcript_rev: null, model: null, transcribe_requested_at: null, remote_audio: 0, deleted: 0,
            created_at: t, updated_at: t };
      lib.episodes.push(e);
    } else if (e.deleted) {
      Object.assign(e, { deleted: 0, transcript_rev: null, updated_at: t });
    }
    const words = unpackTranscript({ segments: Array.isArray(body.segments) ? body.segments : [] });
    const segments = words && words.segments ? words.segments.map((s) => ({
      start: s.start, end: s.end, text: s.text, words: s.words.map(([start, end, text]) => ({ start, end, text })) })) : [];
    let transcribed = false;
    const keptOwn = !!(segments.length && e.transcript_rev);
    if (segments.length && !keptOwn) {
      cloud.cancel(e.uid); // queued here meanwhile: the friend's words make that unnecessary
      await cloud.storeTranscript(e.uid, segments, String(body.model || "shared").slice(0, 80), { language: lang || episodeLang(e) });
      transcribed = true;
    }
    changed();
    return { episode: episodeOut(episodeOf(e.uid) || e), transcribed, kept_own: keptOwn, added_feed: added };
  }],
  ["GET", /^\/youtube\/([\w-]{11})$/, async (m) => { // a video already here with its captions
    const fuid = await feedUid(YOUTUBE_FEED_URL);
    const e = liveEpisodes().find((x) => x.feed_uid === fuid && x.guid === m[1] && x.transcript_rev);
    if (!e) throw new ApiError("That video isn't in the library yet.");
    return episodeOut(e);
  }],
  ["DELETE", /^\/episodes\/([\w]+)$/, async (m) => {
    if (await removeEpisode(m[1])) changed();
    return { ok: true };
  }],
  // The Library's "Delete selected": podcast episodes too.
  ["POST", /^\/episodes\/delete$/, async (m, q, body) => {
    let n = 0;
    for (const id of body.ids || []) if (await removeEpisode(id)) n++;
    if (n) changed();
    return { deleted: n };
  }],
  ["GET", /^\/episodes\/([\w]+)$/, (m) => {
    const e = episodeOf(m[1]);
    if (!e) throw new ApiError("Episode not found.");
    return episodeOut(e);
  }],

  // ----- search (transcripts stored on this phone) -----
  ["GET", /^\/search$/, async (m, q) => {
    const query = q.get("q") || "";
    const norm = normalize(query);
    const results = [];
    if (!norm) return { query, results, total: 0 };
    for (const e of liveEpisodes()) {
      if (!e.transcript_rev || !studying(episodeLang(e))) continue;  // only the language being learned
      const t = await transcripts.get(e.uid);
      if (!t) continue;
      const f = feedOf(e.feed_uid) || {};
      t.segments.forEach(([start, end, text], idx) => {
        if (normalize(text).includes(norm)) {
          results.push({ episode_id: e.uid, idx, start, end, text, episode_title: e.title, published: e.published,
                         feed_title: f.title || "", spans: findSpans(text, query) });
        }
      });
    }
    results.sort((a, b) => (b.published || 0) - (a.published || 0) || a.idx - b.idx);
    return { query, results: results.slice(0, 200), total: results.length };
  }],

  // ----- vocab -----
  ["GET", /^\/vocab$/, (m, q) => {
    let items = lib.vocab.filter((v) => !v.deleted && studying(wordLang(v))).sort((a, b) => b.created_at - a.created_at);
    const folder = q.get("folder");
    if (folder === "none") items = items.filter((v) => !(v.folders || []).length);
    else if (folder) items = items.filter((v) => (v.folders || []).includes(folder));
    const query = q.get("q");
    if (query) {
      const nq = normalize(query);
      const lq = query.toLowerCase();
      items = items.filter((v) => normalize(v.text).includes(nq) || normalize(v.sentence).includes(nq)
        || (v.meaning || "").toLowerCase().includes(lq) || (v.notes || "").toLowerCase().includes(lq)
        || (v.memo || "").toLowerCase().includes(lq));
    }
    return items.map(vocabOut);
  }],
  ["POST", /^\/vocab$/, (m, q, body) => {
    const text = (body.text || "").trim();
    if (!text) throw new ApiError("Nothing to save.");
    const e = body.episode_id ? episodeOf(body.episode_id) : null;
    const t = now();
    const v = { uid: newUid(), episode_uid: e ? e.uid : null, text, sentence: (body.sentence || "").trim(),
                start: body.start ?? null, end: body.end ?? null, sent_start: body.sent_start ?? null,
                sent_end: body.sent_end ?? null, meaning: body.meaning || "", notes: body.notes || "",
                translation: (body.translation || "").trim(),
                // A word typed in, or from an unknown source, is in the language its letters say.
                language: e ? episodeLang(e) : (isLanguage(detectLanguage(text, studyLanguage())) ? detectLanguage(text, studyLanguage()) : studyLanguage()),
                episode_title: e ? e.title : "", folders: [], deleted: 0, created_at: t, updated_at: t };
    lib.vocab.push(v);
    changed();
    return vocabOut(v);
  }],
  // Several cards typed in at once (the Vocab page's "Add words"; the computer's twin is app/api/vocab.py
  // add_batch): in the order given, the first the newest, each in the language its letters say.
  ["POST", /^\/vocab\/batch$/, (m, q, body) => {
    const cards = (Array.isArray(body.cards) ? body.cards : []).filter((c) => c && String(c.text || "").trim());
    if (!cards.length) throw new ApiError("Nothing to save.");
    if (cards.length > 100) throw new ApiError("At most 100 cards can be added at a time.");
    const study = studyLanguage(), t = now();
    const known = new Set(liveFolders().map((f) => f.uid));
    const s = (x, n) => String(x || "").trim().slice(0, n);
    const made = cards.map((c, n) => {
      const text = s(c.text, 200), found = detectLanguage(text, study);
      const v = { uid: newUid(), episode_uid: null, text, sentence: s(c.sentence, 1000), start: null, end: null, sent_start: null,
                  sent_end: null, meaning: s(c.meaning, 500), notes: s(c.notes, 2000), translation: s(c.translation, 1000),
                  language: isLanguage(found) ? found : study, episode_title: "",
                  folders: [...new Set((Array.isArray(c.folders) ? c.folders : []).filter((f) => known.has(f)))].sort(),
                  deleted: 0, created_at: t - n * 0.001, updated_at: t };
      lib.vocab.push(v);
      return v;
    });
    changed();
    return { cards: made.map(vocabOut) };
  }],
  // ----- vocab folders (a word can be in several) -----
  ["GET", /^\/vocab\/folders$/, () => liveFolders().map(folderOut)],
  ["POST", /^\/vocab\/folders$/, (m, q, body) => {
    const name = (body.name || "").trim().slice(0, 80);
    if (!name) throw new ApiError("Give the folder a name.");
    const t = now();
    const f = { uid: `d${newUid().slice(1)}`, name, deleted: 0, created_at: t, updated_at: t };
    (lib.folders = lib.folders || []).push(f);
    changed();
    return folderOut(f);
  }],
  ["PATCH", /^\/vocab\/folders\/([\w]+)$/, (m, q, body) => {
    const f = (lib.folders || []).find((x) => x.uid === m[1]);
    const name = (body.name || "").trim().slice(0, 80);
    if (!f) throw new ApiError("Folder not found.");
    if (!name) throw new ApiError("Give the folder a name.");
    Object.assign(f, { name, updated_at: now() });
    changed();
    return folderOut(f);
  }],
  ["DELETE", /^\/vocab\/folders\/([\w]+)$/, (m) => {
    const f = (lib.folders || []).find((x) => x.uid === m[1]);
    if (f) {
      Object.assign(f, { deleted: 1, updated_at: now() });
      for (const v of lib.vocab) {
        if ((v.folders || []).includes(f.uid)) { v.folders = v.folders.filter((x) => x !== f.uid); v.updated_at = now(); }
      }
      changed();
    }
    return { ok: true };
  }],
  ["POST", /^\/vocab\/bulk-folders$/, (m, q, body) => {
    let n = 0;
    for (const id of body.ids || []) {
      const v = lib.vocab.find((x) => x.uid === id);
      if (!v) continue;
      const before = v.folders || [];
      const after = [...new Set([...before, ...(body.add || [])])].filter((x) => !(body.remove || []).includes(x)).sort();
      if (after.join() !== [...before].sort().join()) { v.folders = after; v.updated_at = now(); n++; }
    }
    if (n) changed();
    return { changed: n };
  }],
  ["PATCH", /^\/vocab\/([\w]+)$/, (m, q, body) => {
    const v = lib.vocab.find((x) => x.uid === m[1]);
    if (!v) throw new ApiError("Not found.");
    if (Array.isArray(body.folders)) v.folders = [...new Set(body.folders)].sort();
    for (const k of ["meaning", "notes", "memo"]) if (body[k] !== undefined && body[k] !== null) v[k] = body[k];
    // The word itself only when something is left of it (as on the computer, app/api/vocab.py).
    if (typeof body.text === "string" && body.text.trim()) v.text = body.text.trim();
    v.updated_at = now();
    changed();
    return vocabOut(v);
  }],
  ["DELETE", /^\/vocab\/([\w]+)$/, (m) => {
    const v = lib.vocab.find((x) => x.uid === m[1]);
    if (v) { v.deleted = 1; v.updated_at = now(); changed(); }
    return { ok: true };
  }],

  // ----- the vocab reviewer's answers (synced; the desktop's are in app/api/reviews.py) -----
  ["GET", /^\/reviews$/, () => ({ reviews: lib.reviews || {} })],
  ["POST", /^\/reviews$/, (m, q, body) => {
    const uid = String(body.uid || "").trim(), t = Math.floor(Number(body.t)), rating = Number(body.rating);
    if (!uid || !(t > 0) || ![0, 1, 3].includes(rating)) throw new ApiError("That isn't an answer.");
    const list = ((lib.reviews = lib.reviews || {})[uid] = lib.reviews[uid] || []);
    const have = list.find((e) => e[0] === t);
    if (have) have[1] = rating;  // the same answer again with rating 0 takes it back (Undo)
    else {
      list.push([t, rating, Math.floor(Number(body.day)) || 0, Math.max(0, Math.floor(Number(body.ms)) || 0)]);
      list.sort((a, b) => a[0] - b[0]);
    }
    saveLibrary();
    requestSync(20000);  // a review session is many answers in a row: wait for a pause
    return { ok: true };
  }],

  // ----- seen words, by dictionary form (synced; the desktop's are in app/api/lexicon.py) -----
  ["GET", /^\/lexemes$/, () => ({ keys: (lib.lexemes || []).filter((x) => !x.deleted).map((x) => x.key) })],
  ["POST", /^\/lexemes$/, (m, q, body) => {
    const list = (lib.lexemes = lib.lexemes || []);
    const byKey = new Map(list.map((x) => [x.key, x]));
    let added = 0;
    for (const item of (body.items || []).slice(0, 5000)) {
      const key = String(item.key || "").trim();
      if (key.split("|").length < 3 || key.length > 200) continue;
      const have = byKey.get(key);
      const t = now();
      if (!have) {
        const row = { key, lang: key.split("|")[0].slice(0, 8), lemma: String(item.lemma || "").slice(0, 120),
                      pos: String(item.pos || "").slice(0, 40), root: String(item.root || "").slice(0, 40),
                      deleted: 0, created_at: t, updated_at: t };
        list.push(row);
        byKey.set(key, row);
        added++;
      } else if (have.deleted) {
        Object.assign(have, { deleted: 0, updated_at: t });
        added++;
      }
    }
    if (added) changed();
    return { added };
  }],
  ["POST", /^\/lexemes\/forget$/, (m, q, body) => {
    const keys = new Set(body.keys || []);
    let forgotten = 0;
    for (const x of lib.lexemes || []) {
      if (keys.has(x.key) && !x.deleted) { Object.assign(x, { deleted: 1, updated_at: now() }); forgotten++; }
    }
    if (forgotten) changed();
    return { forgotten };
  }],
  ["GET", /^\/lexemes\/lookups$/, () => [...lib.definitions].sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    .map((d) => ({ word: d.word, sentence: d.sentence }))],
  // ----- the dictionaries that find a word's dictionary form -----
  ["GET", /^\/lexicon\/status$/, (m, q) => lexiconStatus(q.get("lang") || "ar", q.get("kind") || "words")],
  ["POST", /^\/lexicon\/download$/, async (m, q, body) => {
    try { return await lexiconDownload(body.lang || "ar", body.kind || "words"); } catch (e) { throw new ApiError(e.message); }
  }],
  ["POST", /^\/lexicon\/remove$/, (m, q, body) => lexiconRemove(body.lang || "ar", body.kind || "words")],
  ["GET", /^\/lexicon\/data\/([\w-]+)$/, async (m) => {
    const data = await lexiconData(m[1]);
    if (!data) throw new ApiError("That dictionary hasn't been downloaded.");
    return data;
  }],

  // ----- definitions cache (synced) -----
  ["GET", /^\/definitions\/([\w]+)$/, (m) => {
    const d = lib.definitions.find((x) => x.key === m[1]);
    return d ? d.data : null;
  }],
  ["PUT", /^\/definitions\/([\w]+)$/, (m, q, body) => {
    if (!lib.definitions.find((x) => x.key === m[1])) {
      lib.definitions.push({ key: m[1], word: body.word, sentence: body.sentence, data: body.data,
                             provider: body.provider || "", model: body.model || "", created_at: now() });
      saveLibrary();
      requestSync(30000);
    }
    return { ok: true };
  }],

  // ----- the two-way sync with one AnkiDroid deck (anki-droid.js; the computer's are in app/api/anki.py) -----
  ["GET", /^\/anki\/sync\/status$/, () => anki.status()],
  ["POST", /^\/anki\/sync\/options$/, (m, q, body) => anki.options(body)],
  ["POST", /^\/anki\/sync\/resolve$/, (m, q, body) => anki.resolve(body.what, body.choice)],
  ["POST", /^\/anki\/sync\/run$/, (m, q, body) => anki.run({ ask: body.ask === true })],
  ["GET", /^\/anki\/progress$/, () => anki.progress()],
  ["GET", /^\/anki\/move$/, () => anki.moveInfo()],
  ["POST", /^\/anki\/move$/, () => anki.moveCards()],
  ["GET", /^\/anki\/linked\/([\w]+)$/, async (m) => ({ linked: await anki.linked(m[1]) })],
];

export async function handle(path, method, body) {
  const [p, qs] = path.split("?");
  const q = new URLSearchParams(qs || "");
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const match = p.match(re);
    if (match) return fn(match, q, body || {});
  }
  throw new ApiError(`Not available on the phone: ${method} ${p}`);
}
