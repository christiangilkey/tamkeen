// "Send to a friend": the paper-airplane button every player puts on its toolbar, and what
// happens to the thing that was sent.
//
//   import { sendButton, mediaFromEpisode } from "../components/sendmedia.js";
//   toolbar.append(sendButton(() => mediaFromEpisode(ep)));     // a getter: read when pressed
//   toolbar.append(sendButton({ kind: "youtube", url, title, episode_id: ep.id }));  // or a fixed item
//
// A media item is {kind: "youtube" | "reel" | "podcast" | "page", url, title, subtitle, image}
// plus, when known: episode_id (the sender's own copy: its words travel with a YouTube video
// or a reel, and it is never sent itself), language, duration, at (seconds to start from), and for
// a podcast feed_url, guid and audio_url. The player chats' own field names are understood too
// (video_id, channel, creator, lang).
//
// The friend first sees only the title and the kind, with an Accept button (see mediaCard in
// pages/chat.js). Accepting adds it to their library, with its words when they came along, and
// from then on it opens in the player for its kind, exactly like an item on a study card.

import { api, h, showMenu, toast } from "../app.js";
import { icon } from "../icons.js";
import * as social from "../social.js";
import { openItem } from "./studycard.js";

export const MEDIA_KINDS = { youtube: "YouTube video", reel: "Instagram reel", podcast: "Podcast episode", page: "Web page" };
const MAX_TRANSCRIPT_CHARS = 600000; // the message as a whole must stay under the service's 1 MB

const text = (x, n) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const http = (x) => (/^https?:\/\//i.test(String(x || "")) ? String(x) : "");

/** What is playing, as a media item, from one of the app's own episodes. Null for things that
 * can't be sent: the user's own audio and video files exist only on their devices. */
export function mediaFromEpisode(ep, { at = 0 } = {}) {
  if (!ep) return null;
  const type = ep.audio_type || "";
  const base = { episode_id: ep.id, title: text(ep.title, 200), image: social.safeUrl(ep.image || ep.feed_image || ""),
                 language: ep.language || null, duration: ep.duration || null, at: Math.max(0, Math.floor(at || 0)) };
  if (type === "video/youtube") return { ...base, kind: "youtube", url: http(ep.audio_url), subtitle: text(ep.description, 120) };
  if (type === "video/instagram") {
    return { ...base, kind: "reel", url: `https://www.instagram.com/reel/${ep.guid}/`, subtitle: text(ep.description, 120),
             signin: String(ep.audio_url || "").endsWith("#signin") };
  }
  if (type === "text/html") return { ...base, kind: "page", url: http(ep.audio_url), subtitle: text(ep.description, 120) };
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
  } else if (!item.url) {
    return null;
  }
  return item;
}

/** The words of the sender's own copy, when they are worth sending along: a YouTube video and a
 * reel are the same recording for everyone, so their words fit the friend's copy exactly. (A
 * podcast's sound can differ per listener because of inserted adverts, and a page is read again
 * from the page itself.) Null when there are none or they are too long for one message. */
export async function wordsFor(item) {
  if (!item.episode_id || (item.kind !== "youtube" && item.kind !== "reel")) return null;
  let t;
  try { t = await api(`/episodes/${item.episode_id}/transcript`); } catch { return null; }
  const W = t && t.words;
  if (!W || !W.text || !W.text.length) return null;
  const r = (x) => Math.round(Number(x) * 1000) / 1000;
  const segments = t.segments.map((s) => ({ start: r(s.start), end: r(s.end), text: String(s.text || ""), words: [] }));
  const at = new Map(t.segments.map((s, i) => [s.idx, i]));
  for (let i = 0; i < W.text.length; i++) {
    const seg = segments[at.get(W.seg[i])];
    if (seg) seg.words.push([r(W.start[i]), r(W.end[i]), String(W.text[i])]);
  }
  const out = { model: text(t.episode && t.episode.model, 80), segments: segments.filter((s) => s.text.trim() || s.words.length) };
  return out.segments.length && JSON.stringify(out).length <= MAX_TRANSCRIPT_CHARS ? out : null;
}

/** Send `media` to one friend. Resolves to {withWords}. */
export async function sendMedia(friendId, media) {
  const item = normalizeMedia(media);
  if (!item) throw new Error("This can't be sent to a friend.");
  const words = await wordsFor(item);
  const { episode_id: _mine, ...shared } = item; // my own copy's id means nothing on a friend's device
  await social.sendMediaMessage(friendId, { ...shared, ...(words ? { transcript: words } : {}) });
  return { withWords: !!words };
}

/** Ask which friend, then send.
 * The list is the app's ordinary menu (showMenu: the #ctxmenu element, shown and hidden through
 * its `hidden` attribute). The phone's reel player counts on exactly that: its video is a native
 * window on top of the page, which it moves away while this menu is open (pages/reels.js). Change
 * how the list is shown and that has to change with it. */
async function pickAndSend(x, y, media) {
  const item = normalizeMedia(media);
  if (!item) { toast("This can't be sent: your own audio and video files stay on your devices."); return; }
  let st;
  try { st = await social.friendsState(); } catch (e) { toast(e.message, { error: true }); return; }
  if (!st || !st.me.username) {
    toast("Connect and choose a username first.", { action: { label: "Settings", run: () => (location.hash = "#/settings") } });
    return;
  }
  if (!st.friends.length) {
    toast("Add a friend first.", { action: { label: "Friends", run: () => (location.hash = "#/friends") } });
    return;
  }
  showMenu(x, y, `Send “${item.title.slice(0, 40)}” to…`, st.friends.map((f) => ({
    label: `@${f.user.username}`,
    run: async () => {
      try {
        toast("Sending…", { timeout: 1500 });
        const r = await sendMedia(f.user.id, media);
        toast(`Sent to ${f.user.username}${r.withWords ? ", with its words" : ""}.`,
              { action: { label: "Open chat", run: () => (location.hash = `#/chat/${f.user.id}`) } });
      } catch (e) {
        toast(e.message, { error: true });
      }
    },
  })));
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

/** A friend accepted: put the item in this device's library (with its words when they came),
 * so it opens at once. Resolves to a hash to open it with, or "" when opening is left to the
 * ordinary route (openItem). */
export async function acceptMedia(m) {
  const t = m.transcript && Array.isArray(m.transcript.segments) ? m.transcript : null;
  if (t && m.kind === "reel") {
    const ep = await api("/shared/reel", { method: "POST", body: {
      code: social.reelCode(m.url), creator: m.subtitle || "", title: m.title || "", language: m.language || null,
      seconds: m.duration || null, signin: !!m.signin, model: t.model || "", segments: t.segments,
    } });
    return `#/reels/play?at=${ep.id}`;
  }
  if (t && m.kind === "youtube") {
    const { videoId } = await import("../youtube.js");
    const id = videoId(m.url);
    if (id) {
      const lines = t.segments.map((s) => ({ start: s.start, end: s.end, text: s.text, words: s.words }));
      const ep = await api("/youtube", { method: "POST", body: {
        video_id: id, title: m.title, channel: m.subtitle || "", duration: m.duration || null, language: m.language || null,
        auto: /auto/.test(t.model || ""), lines,
      } });
      return `#/episode/${ep.id}${m.at ? `?t=${m.at}` : ""}`;
    }
  }
  return "";
}

/** Open an accepted item in its player. */
export async function openMedia(m, hash = "") {
  if (hash) { location.hash = hash; return; }
  await openItem(m);
}
