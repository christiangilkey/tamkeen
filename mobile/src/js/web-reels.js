// Reels in the web app. The installed apps play a reel inside Instagram's own page in a native
// window (and read reels from the user's Instagram saves there). A web page can't hold Instagram's
// page, so here a reel's public embed page is read through the go-between server for its video
// file, which plays in an ordinary <video>. Reels that only play to someone signed in to Instagram
// (most with a song from Instagram's music library) can't be played or added here.

import { webFetch } from "./native.js";

/** A JavaScript string literal starting at `at` (the opening quote), as its text. */
function stringAt(text, at) {
  let i = at + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return JSON.parse(text.slice(at, i + 1));
}

/** The reel's details from its embed page: {code, user, caption, video, seconds, src, music, thumb},
 *  or null when the page doesn't carry them (private, removed, or only for signed-in visitors). */
export function reelFromEmbed(html, code = "") {
  const text = String(html || "");
  const key = '"contextJSON":';
  const at = text.indexOf(key);
  if (at < 0) return null;
  let media;
  try {
    const outer = JSON.parse(stringAt(text, at + key.length));
    media = (outer.gql_data && outer.gql_data.shortcode_media) || (outer.context && outer.context.media) || null;
  } catch {
    return null;
  }
  if (!media) return null;
  const caption = ((((media.edge_media_to_caption || {}).edges || [])[0] || {}).node || {}).text || "";
  const src = String(media.video_url || "");
  return {
    code: String(media.shortcode || code),
    user: String((media.owner || {}).username || "").toLowerCase(),
    caption: caption.replace(/\s+/g, " ").trim().slice(0, 160),
    video: media.is_video !== false,
    seconds: Math.round(Number(media.video_duration) || 0),
    src: /^https:\/\//.test(src) ? src : "",
    music: media.is_video !== false && !src, // a video whose file isn't offered: Instagram plays it only when signed in
    thumb: String(media.display_url || media.thumbnail_src || ""),
  };
}

/** A reel's code from its address (or the code itself). */
export function reelCode(link) {
  const m = /instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/.exec(String(link || ""));
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{5,40}$/.test(String(link || "").trim()) ? String(link).trim() : "";
}

/** Read a reel's embed page through the go-between server. */
export async function reelInfo(code) {
  let res;
  try { res = await webFetch(`https://www.instagram.com/reel/${encodeURIComponent(code)}/embed/captioned/`); }
  catch { throw new Error("Couldn't reach Instagram. Check your connection."); }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Instagram answered with an error (${res.status}). Try again in a minute.`);
  return reelFromEmbed(await res.text(), code);
}

/** The reel player for the shared Reels screen (the same calls as the phone's reel window), with
 *  states {ready, t, d, paused, ends, nav, error, page}. */
export function webReelSurface() {
  const hearers = new Set();
  let video = null;
  let page = "";
  let error = "";
  let ends = 0;
  let turn = 0;
  const tell = () => {
    const s = { ready: !!video && video.readyState >= 1 && !error, t: video ? video.currentTime : 0, d: video && Number.isFinite(video.duration) ? video.duration : 0,
                paused: !video || video.paused, ends, nav: "", error, page };
    for (const fn of hearers) fn(s);
  };
  async function start(url) {
    const mine = ++turn;
    page = new URL(url).pathname;
    error = "";
    ends = 0;
    video.removeAttribute("src");
    video.load();
    tell();
    let info = null;
    try { info = await reelInfo(reelCode(url)); } catch { info = null; }
    if (mine !== turn) return; // another reel was asked for meanwhile
    if (!info || !info.src) { error = "novideo"; tell(); return; }
    video.poster = info.thumb || "";
    video.src = info.src;
    video.play().catch(() => tell()); // a browser may want a tap first: the play button is there
  }
  return {
    async open({ url, el }) {
      video = document.createElement("video");
      video.playsInline = true;
      video.preload = "auto";
      // Held inside the space above the words, whole (reels.css .reel-stage > video).
      video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block";
      video.addEventListener("ended", () => { ends++; tell(); });
      for (const ev of ["timeupdate", "play", "pause", "loadedmetadata", "seeked"]) video.addEventListener(ev, tell);
      video.addEventListener("error", () => { if (video.getAttribute("src")) { error = "novideo"; tell(); } });
      video.onclick = () => (video.paused ? video.play().catch(() => {}) : video.pause());
      el.append(video);
      await start(url);
    },
    load: (url) => start(url),
    do(what, time = 0) {
      if (!video) return;
      if (what === "pause") video.pause();
      else if (what === "play") video.play().catch(() => {});
      else if (what === "seek") video.currentTime = Math.max(0, Number(time) || 0);
    },
    layout() {},
    close() { turn++; if (video) { video.pause(); video.remove(); video = null; } hearers.clear(); },
    onState(fn) { hearers.add(fn); return () => hearers.delete(fn); },
  };
}
