// "Send to a friend": the paper-airplane button on every player's toolbar and every Library row,
// and what happens to the thing that was sent.
//
//   import { sendButton, mediaFromEpisode } from "../components/sendmedia.js";
//   toolbar.append(sendButton(() => mediaFromEpisode(ep)));     // a getter: read when pressed
//   toolbar.append(sendButton({ kind: "youtube", url, title, episode_id: ep.id }));  // or a fixed item
//
// A media item is {kind: "youtube" | "reel" | "podcast" | "page" | "book" | "text", url, title,
// subtitle, image} plus, when known: episode_id (the sender's own copy: its transcript travels
// with it, and the id itself is never sent), language, duration, at (seconds to start from), for
// a podcast feed_url, guid and audio_url, and for a book guid and source. The player chats' own
// field names are understood too (video_id, channel, creator, lang).
//
// "text" is one of the sender's own video or audio files: the file stays on their devices (it
// lives in their private Drive folder), so only its title and transcript are sent, and the
// friend gets it as something to read in "My books".
//
// The transcript (or a page's or book's text) is packed by sharetext.js, gzipped and uploaded
// to the online storage beside voice notes; the message carries its path (transcript_path).
// The friend first sees only the title and the kind, with an Accept button (see mediaCard in
// pages/chat.js). Accepting adds it to their library with its words already there, so it opens
// at once in the player or reader for its kind; accepting or dismissing deletes the uploaded file.

import { api, h, showMenu, toast } from "../app.js";
import { icon } from "../icons.js";
import { isLanguage, langInfo, studyLanguage } from "../languages.js";
import * as social from "../social.js";
import { MAX_FILE_BYTES, MAX_INLINE_CHARS, TEXT_KINDS, acceptInto, gunzipText, gzipText, packTranscript, unpackTranscript } from "../sharetext.js";
import { openItem } from "./studycard.js";
import { offerFix } from "./fixit.js";
import { feature } from "../prototype.js";
import { postToClass, roomAdd, teacherClasses } from "../dliclass.js";
import { notesFromCards } from "../classnotes.js";

export const MEDIA_KINDS = { youtube: "YouTube video", reel: "Instagram reel", podcast: "Podcast episode", page: "Web page",
                             book: "Book", text: "Transcript of a recording" };

const text = (x, n) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const http = (x) => (/^https?:\/\//i.test(String(x || "")) ? String(x) : "");
const OWN_FILES = new Set(["local:videos", "local:audio"]);

/** What is playing (or a Library row), as a media item, from one of the app's own episodes.
 * Null for things that can't be sent at all. */
export function mediaFromEpisode(ep, { at = 0 } = {}) {
  if (!ep) return null;
  const type = ep.audio_type || "";
  // A Netflix title is never sent: its words are Netflix's subtitles, from the user's own Netflix,
  // for his own study (see app/netflix.py).
  if (type === "video/netflix") return null;
  const base = { episode_id: ep.id, title: text(ep.title, 200), image: social.safeUrl(ep.image || ep.feed_image || ""),
                 language: ep.language || null, duration: ep.duration || null, at: Math.max(0, Math.floor(at || 0)) };
  if (type === "video/youtube") return { ...base, kind: "youtube", url: http(ep.audio_url), subtitle: text(ep.description, 120) };
  if (type === "video/instagram") {
    return { ...base, kind: "reel", url: `https://www.instagram.com/reel/${ep.guid}/`, subtitle: text(ep.description, 120),
             signin: String(ep.audio_url || "").endsWith("#signin") };
  }
  if (type === "text/html") return { ...base, kind: "page", url: http(ep.audio_url), subtitle: text(ep.description, 120) };
  if (type === "text/book") {
    return { ...base, kind: "book", url: "", subtitle: text(ep.description, 120), guid: text(ep.guid, 300),
             source: text(ep.audio_url, 300), duration: null, at: 0 };
  }
  if (OWN_FILES.has(ep.feed_url || "")) {
    // Only the words go: the file itself stays private. Nothing to send until it is transcribed.
    return { ...base, kind: "text", url: "", subtitle: "", image: "", at: 0, ready: ep.status === "done" };
  }
  if (http(ep.feed_url)) {
    return { ...base, kind: "podcast", url: "", subtitle: text(ep.feed_title, 120), feed_url: http(ep.feed_url),
             guid: text(ep.guid, 200), audio_url: http(ep.audio_url).length <= 300 ? http(ep.audio_url) : "" };
  }
  return null;
}

/** Any of the shapes a player may hand over, as one tidy item (or null if it can't be sent). */
export function normalizeMedia(m) {
  if (!m || !MEDIA_KINDS[m.kind]) return null;
  const item = {
    kind: m.kind, title: text(m.title, 200) || MEDIA_KINDS[m.kind], subtitle: text(m.subtitle || m.channel || m.creator, 120),
    image: social.safeUrl(m.image || ""), url: social.safeUrl(m.url || ""),
    language: text(m.language || m.lang, 8) || null, duration: Number(m.duration) > 0 ? Number(m.duration) : null,
    at: Number(m.at) > 0 ? Math.floor(Number(m.at)) : 0, episode_id: m.episode_id ?? null,
  };
  if (m.kind === "youtube" && !item.url && m.video_id) item.url = `https://www.youtube.com/watch?v=${encodeURIComponent(m.video_id)}`;
  if (m.kind === "reel") {
    const code = social.reelCode(item.url) || (/^[A-Za-z0-9_-]{5,40}$/.test(m.guid || "") ? m.guid : "");
    if (!code) return null;
    item.signin = !!m.signin || String(m.url || "").endsWith("#signin");
    item.url = `https://www.instagram.com/reel/${code}/`;
  }
  if (m.kind === "podcast") {
    Object.assign(item, { feed_url: http(m.feed_url), guid: text(m.guid, 200), audio_url: http(m.audio_url).length <= 300 ? http(m.audio_url) : "" });
    if (!item.feed_url) return null;
  } else if (m.kind === "book") {
    Object.assign(item, { url: "", guid: text(m.guid, 300), source: text(m.source, 300) });
    if (!/^(book|file):/.test(item.guid)) return null;
  } else if (m.kind === "text") {
    Object.assign(item, { url: "", image: "", ready: m.ready !== false });
  } else if (!item.url) {
    return null;
  }
  return item;
}

/** The transcript of the sender's own copy, packed for sending (sharetext.js), or null when there
 * is none. A podcast's goes too: adverts inserted per listener can shift its timing a little on the
 * friend's copy; they can transcribe it again if the words drift. A book from Tamkeen's free shelf
 * needs none: the friend's app takes it from the shelf, complete. */
export async function textFor(item) {
  if (!item.episode_id) return null;
  if (item.kind === "book" && String(item.guid || "").startsWith("book:")) return null;
  let t;
  try { t = await api(`/episodes/${item.episode_id}/transcript`); } catch { return null; }
  if (!t) return null;
  return packTranscript(t, { asText: TEXT_KINDS.has(item.kind) });
}

/** Send `media` to one friend. Resolves to {withWords, tooLarge}. */
export async function sendMedia(friendId, media) {
  const item = normalizeMedia(media);
  if (!item) throw new Error("This can't be sent to a friend.");
  const packed = await textFor(item);
  if (item.kind === "text" && !packed) throw new Error("Transcribe it first: only its words are sent, the file itself stays on your devices.");
  const extra = {};
  if (packed) {
    // The words go as a file in the online storage, and only its address in the message.
    const file = await gzipText(packed);
    if (file.size <= MAX_FILE_BYTES) {
      try { extra.transcript_path = await social.uploadText(friendId, file); } catch (e) { console.warn("Couldn't upload the transcript", e); }
    }
    // Couldn't (an online storage not set up for it yet): a small one rides inside the message.
    if (!extra.transcript_path && JSON.stringify(packed).length <= MAX_INLINE_CHARS) extra.transcript = packed;
  }
  const withWords = !!(extra.transcript_path || extra.transcript);
  if (item.kind === "text" && !withWords) throw new Error("Its transcript is too long to send.");
  const { episode_id: _mine, ready: _ready, ...shared } = item; // my own copy's id means nothing on a friend's device
  try {
    await social.sendMediaMessage(friendId, { ...shared, ...extra });
  } catch (e) {
    if (extra.transcript_path) social.removeShareClips({ media: extra }).catch(() => {});
    throw e;
  }
  return { withWords, tooLarge: !!packed && !withWords };
}

/** Send `media` to a whole class (a teacher's; dliclass.js postToClass): the same item and the same words a friend
 *  would get. Resolves to {withWords, tooLarge}. */
export async function sendToClass(classId, media, { folder = null } = {}) {
  const p = await classPayload(media);
  let r;
  // The Classroom (prototype "classroom", supabase/v17): the item goes with the teacher's notes on its words, into
  // a folder. On a database without v17 it is sent the v15 way, without them.
  if (feature("classroom")) {
    try { r = await roomAdd(classId, p.item, { file: p.file, notes: p.notes, folder }); } catch (e) { if (!e.notReady) throw e; }
    if (r && r.id && p.episodeId) rememberMine(r.id, p.episodeId);
  }
  if (!r) r = await postToClass(classId, p.item, p.file);
  return { id: r.id || "", withWords: r.withWords, tooLarge: p.hadWords && !r.withWords, notes: feature("classroom") ? p.notes.length : 0 };
}

/** What goes to a class for `media` (one of my own library items): { item, file, notes, hadWords, episodeId }.
 *  `file` is its transcript, gzipped (null when it has none or it is too long); `notes` the teacher's work on its
 *  words, from the teacher's own flashcards of it (classnotes.js: important, meaning, grammar notes). */
export async function classPayload(media) {
  const item = normalizeMedia(media);
  if (!item) throw new Error("This can't be sent to a class.");
  const packed = await textFor(item);
  if (item.kind === "text" && !packed) throw new Error("Transcribe it first: only its words are sent, the file itself stays on your devices.");
  let file = null;
  if (packed) { const z = await gzipText(packed); if (z.size <= MAX_FILE_BYTES) file = z; }
  if (item.kind === "text" && !file) throw new Error("Its transcript is too long to send.");
  let notes = [];
  if (item.episode_id && feature("classroom")) {
    try {
      const v = await api("/vocab");
      notes = notesFromCards((Array.isArray(v) ? v : (v && v.items) || []).filter((c) => c.episode_id === item.episode_id));
    } catch { /* sent without notes */ }
  }
  const { episode_id: episodeId, ready: _ready, at: _at, ...shared } = item; // (my own copy's id and my place in it mean nothing to a class)
  return { item: shared, file, notes, hadWords: !!packed, episodeId: episodeId || 0 };
}

// Which of my own library items each classroom item was made from, on this device: the teacher's "Update" reads
// the transcript and the notes from there again.
const MINE_KEY = "tamkeenRoomMine";
const mineMap = () => { try { const v = JSON.parse(localStorage.getItem(MINE_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
export function rememberMine(postId, episodeId) {
  const m = mineMap();
  m[postId] = episodeId;
  try { localStorage.setItem(MINE_KEY, JSON.stringify(Object.fromEntries(Object.entries(m).slice(-600)))); } catch { /* storage off */ }
}
/** My own library item a classroom item was made from on this device (its episode id), or 0. */
export const mineOf = (postId) => Number(mineMap()[postId]) || 0;

/** My classes as menu lines (a teacher, with the Class tab on), before the friends. */
function classLines(item, media) {
  if (!feature("class_tab")) return [];
  return teacherClasses().map((c) => ({
    label: `Class: ${c.name}`,
    run: async () => {
      try {
        toast("Sending…", { timeout: 1500 });
        const r = await sendToClass(c.id, media);
        toast(r.withWords ? `Sent to the class ${c.name}, with its words.`
                : r.tooLarge ? `Sent to the class ${c.name}, without its words: they are too long to send.` : `Sent to the class ${c.name}.`,
              feature("classroom") ? { action: { label: "Open the classroom", run: () => (location.hash = "#/library?show=classroom") } }
                : { action: { label: "Open Class", run: () => (location.hash = "#/class") } });
      } catch (e) { toast(e.message, { error: true }); }
    },
  }));
}

/** Ask which friend, then send.
 * The list is the app's ordinary menu (showMenu: the #ctxmenu element, shown and hidden through
 * its `hidden` attribute). The phone's reel player counts on exactly that: its video is a native
 * window on top of the page, which it moves away while this menu is open (pages/reels.js). Change
 * how the list is shown and that has to change with it. */
async function pickAndSend(x, y, media) {
  const item = normalizeMedia(media);
  if (!item) { toast("This can't be sent to a friend."); return; }
  if (item.kind === "text" && !item.ready) { toast("Transcribe it first: only its words are sent, the file itself stays on your devices."); return; }
  const classes = classLines(item, media);
  let st;
  try { st = await social.friendsState(); } catch (e) { if (!classes.length) { toast(e.message, { error: true }); return; } st = null; }
  if (!classes.length && (!st || !st.me.username)) {
    offerFix("friends");  // (the fix popup: Settings → Friends & sharing)
    return;
  }
  if (!classes.length && !st.friends.length) {
    offerFix("nofriends");  // (the fix popup: the Friends page)
    return;
  }
  const friendList = st && st.me.username ? st.friends : [];
  showMenu(x, y, `Send “${item.title.slice(0, 40)}” to…`, [...classes, ...friendList.map((f) => ({
    label: `@${f.user.username}`,
    run: async () => {
      try {
        toast("Sending…", { timeout: 1500 });
        const r = await sendMedia(f.user.id, media);
        toast(r.withWords ? (TEXT_KINDS.has(item.kind) ? `Sent to ${f.user.username}, with its text.` : `Sent to ${f.user.username}, with its words.`)
                : r.tooLarge ? `Sent to ${f.user.username}, without its words: they are too long to send.` : `Sent to ${f.user.username}.`,
              { action: { label: "Open chat", run: () => (location.hash = `#/chat/${f.user.id}`) } });
      } catch (e) {
        toast(e.message, { error: true });
      }
    },
  }))]);
}

/** The paper-airplane button. `media` is an item or a function returning the current one (for
 * players whose content changes, like the reel player). Icon-only; add text with {label: true}. */
export function sendButton(media, { label = false } = {}) {
  const b = h(`<button type="button" class="ghost icon send-media" title="Send to a friend" aria-label="Send to a friend">${icon("send", 18)}${label ? " Send" : ""}</button>`);
  b.onclick = (e) => {
    e.stopPropagation();
    const r = b.getBoundingClientRect();
    pickAndSend(r.left, r.bottom + 4, typeof media === "function" ? media() : media);
  };
  return b;
}

/** The words that came with a sent item: inside the message (older apps, or small ones when the
 * upload couldn't be made) or as a file in the online storage. {text, lost}: `lost` means words
 * were sent but couldn't be fetched or read here (the file has gone, say). */
export async function receivedText(raw) {
  if (!raw) return { text: null, lost: false };
  if (raw.transcript) {
    const text = unpackTranscript(raw.transcript);
    return { text, lost: !text };
  }
  const path = social.sharedTextPath(raw.transcript_path);
  if (!path) return { text: null, lost: !!raw.transcript_path };
  try {
    return { text: unpackTranscript(await gunzipText(await social.downloadClip(path))), lost: false };
  } catch (e) {
    console.warn("Couldn't fetch the transcript that came with it", e);
    return { text: null, lost: true };
  }
}

/** A friend accepted: put the item in this device's library, with its words when they came, so
 * it opens at once. `raw` is the message's media (with transcript_path or transcript). Says in a
 * message what didn't go as planned. Resolves to a hash to open it with, or "" when opening is left
 * to the ordinary route (openItem). */
export async function acceptMedia(item, raw = item) {
  return (await acceptMediaInfo(item, raw)).hash;
}
/** The same, answering everything about it: { episode, hash, withText, keptOwn, text } (`text`: the words that came). */
export async function acceptMediaInfo(item, raw = item) {
  const { text, lost } = await receivedText(raw);
  const books = TEXT_KINDS.has(item.kind) ? await import("../books.js") : null;
  const { videoId } = item.kind === "youtube" ? await import("../youtube.js") : { videoId: undefined };
  const r = await acceptInto(api, item, text, {
    shelf: books && books.shelfFor, fromShelf: books && books.addFromShelf, reelCode: social.reelCode,
    ...(videoId ? { videoId } : {}),
  });
  const notes = [];
  if (lost && !r.withText) notes.push("Its words couldn't be fetched, so it will need transcribing on your side.");
  if (r.keptOwn) notes.push("You had already transcribed it, so your own transcript is kept.");
  const lang = (r.episode && r.episode.language) || item.language;
  if (isLanguage(lang) && lang !== studyLanguage()) {
    const name = langInfo(lang).name;
    notes.push(`It's in ${name}, so it shows in your Library while you're learning ${name}.`);
  }
  if (notes.length) toast(notes.join(" "), { timeout: 9000 });
  // Kept on this device now (or turned down): the file online is no longer needed.
  social.removeShareClips({ media: raw }).catch(() => {});
  return { ...r, text };
}

/** Open an accepted item in its player. */
export async function openMedia(m, hash = "") {
  if (hash) { location.hash = hash; return; }
  await openItem(m);
}
