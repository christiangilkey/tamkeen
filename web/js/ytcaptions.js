// Reading a YouTube video's captions and turning them into the app's transcript shape.
// Pure logic (no page, no imports from the app), so it is unit-tested (tests/js/youtube.test.mjs)
// and runs unchanged on the computer and the phone. The caller supplies `request`, which performs
// ONE web request to youtube.com from the user's own device and resolves to {status, text}.
//
// How it works: YouTube's own phone apps ask "youtubei/v1/player" about a video and get back,
// among other things, the list of caption tracks with an address for each. We ask the same
// question, pick the best track, and download it in YouTube's "json3" caption format.
// YouTube changes this from time to time; when it breaks, this file is the one to fix.

const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
// Tried in order until one lists caption tracks.
const CLIENTS = [
  { clientName: "ANDROID", clientVersion: "20.10.38" },
  { clientName: "IOS", clientVersion: "20.10.4" },
];
const MAX_LAST_WORD = 1.2; // seconds the last word of an auto-caption line may last

export class CaptionError extends Error {
  /** `code`: "no_captions" | "no_language" | "unavailable" | "network". */
  constructor(message, code) { super(message); this.code = code; }
}

/** The 11-character video id inside a YouTube link (or a bare id), else null. */
export function videoId(text) {
  const s = String(text || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") : null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Is this the address of a page on YouTube (a video, a channel, anything)? */
export function isYouTubeAddress(text) {
  let u;
  try { u = new URL(String(text || "").trim()); } catch { return false; }
  const host = u.hostname.toLowerCase();
  return u.protocol === "https:" && (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com"));
}

/** "ar-EG" → "ar"; YouTube's older or regional codes folded onto the app's. */
export function baseLanguage(code) {
  const b = String(code || "").toLowerCase().split(/[-_]/)[0];
  return b === "cmn" || b === "yue" ? "zh" : b;
}

/**
 * Choose a caption track. Order: written by a person in the wanted language, then YouTube's
 * automatic captions in it; failing that, the language actually spoken in the video (the one
 * automatic captions exist for) if the app teaches it. Only when YouTube made no automatic
 * captions at all (so the spoken language is unknown) is another hand-written track taken:
 * otherwise an English song with Japanese subtitles would count as Japanese.
 * Returns {track, language, auto} or null.
 */
export function pickTrack(tracks, wanted, taught = []) {
  const list = (tracks || []).filter((t) => t && t.baseUrl);
  const find = (lang, auto) => {
    const hits = list.filter((t) => (t.kind === "asr") === auto && baseLanguage(t.languageCode) === lang);
    return hits.find((t) => String(t.languageCode).toLowerCase() === lang) || hits[0] || null;
  };
  const spoken = list.filter((t) => t.kind === "asr").map((t) => baseLanguage(t.languageCode));
  const written = list.filter((t) => t.kind !== "asr").map((t) => baseLanguage(t.languageCode));
  const order = [wanted, ...(spoken.length ? spoken : written)].filter((l, i, a) => l && a.indexOf(l) === i && (l === wanted || taught.includes(l)));
  for (const lang of order) {
    for (const auto of [false, true]) {
      const track = find(lang, auto);
      if (track) return { track, language: lang, auto };
    }
  }
  return null;
}

const round = (x) => Math.round(x * 1000) / 1000;

/** Caption text without sound labels ("[Music]", "♪"), speaker arrows (">>") or invisible marks. */
function tidy(text) {
  return String(text || "")
    .replace(/[​-‏‪-‮⁠﻿]/g, "")
    .replace(/\[[^\]]*\]|[♪♫]+|>>+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split `text` into words spread over start..end in proportion to their length. */
function spread(text, start, end) {
  const tokens = text.split(" ").filter(Boolean);
  const total = tokens.reduce((n, t) => n + t.length, 0) || 1;
  const out = [];
  let at = start;
  for (const t of tokens) {
    const next = at + (end - start) * (t.length / total);
    out.push([round(at), round(next), t]);
    at = next;
  }
  return out;
}

/**
 * YouTube's "json3" captions → lines: [{start, end, text, words: [[start, end, word], ...]}].
 * Automatic captions carry a time for every word. Captions written by a person only time whole
 * lines, so their words are spread evenly across the line (good enough to follow along).
 */
export function captionLines(data, auto) {
  const raw = [];
  for (const ev of (data && data.events) || []) {
    if (!Array.isArray(ev.segs)) continue;
    const t0 = (ev.tStartMs || 0) / 1000;
    const pieces = ev.segs
      .map((s) => ({ text: tidy(s.utf8), at: t0 + (s.tOffsetMs || 0) / 1000 }))
      .filter((p) => p.text);
    // The line as YouTube wrote it: pieces carry their own spaces (Arabic " كلمة"), or none (Japanese).
    const text = tidy(ev.segs.map((s) => s.utf8 || "").join(""));
    if (pieces.length) raw.push({ start: t0, end: t0 + (ev.dDurationMs || 0) / 1000, pieces, text });
  }
  raw.sort((a, b) => a.start - b.start);
  const lines = [];
  raw.forEach((line, i) => {
    const next = raw[i + 1];
    // A line stays on screen while the next one is spoken; for us it ends when the next begins.
    let end = next && next.start < line.end ? next.start : line.end;
    if (end <= line.start) end = line.start + 0.5;
    const text = line.text || line.pieces.map((p) => p.text).join(" ");
    let words;
    if (auto) {
      words = [];
      line.pieces.forEach((p, k) => {
        const following = line.pieces[k + 1];
        const stop = following ? following.at : Math.min(end, p.at + MAX_LAST_WORD);
        words.push(...spread(p.text, Math.max(line.start, p.at), Math.max(p.at + 0.05, stop)));
      });
    } else {
      words = spread(text, line.start, end);
    }
    // Times never run backwards, whatever YouTube sent.
    let floor = lines.length ? lines[lines.length - 1].words.at(-1)[0] : 0;
    for (const w of words) {
      if (w[0] < floor) w[0] = floor;
      if (w[1] < w[0]) w[1] = w[0];
      floor = w[0];
    }
    if (words.length) lines.push({ start: round(Math.max(line.start, words[0][0])), end: round(Math.max(end, words.at(-1)[1])), text, words });
  });
  return lines;
}

function parse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Everything needed to add a video: {videoId, title, channel, duration, language, auto, lines}.
 * @param {string} id video id
 * @param {{language: string, languageName?: string, taught?: string[],
 *          request: (req: {url: string, method: string, headers: object, body?: string}) => Promise<{status: number, text: string}>}} opts
 */
export async function fetchCaptions(id, { language, languageName, taught = [], request }) {
  let info = null;
  let refusal = "";
  for (const client of CLIENTS) {
    let res;
    try {
      res = await request({
        url: PLAYER_URL, method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": "en" },
        body: JSON.stringify({ context: { client: { ...client, hl: "en" } }, videoId: id }),
      });
    } catch (e) {
      throw new CaptionError(e && e.message ? e.message : "Couldn't reach YouTube. Check your connection.", "network");
    }
    const data = res && res.status < 400 ? parse(res.text) : null;
    if (!data) continue;
    const status = data.playabilityStatus || {};
    if (status.status && status.status !== "OK") refusal = refusal || status.reason || "";
    const tracks = (((data.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
    if (data.videoDetails && (!info || tracks.length)) info = { details: data.videoDetails, tracks };
    if (tracks.length) break;
  }
  if (!info) {
    throw new CaptionError(refusal ? `YouTube won't show this video here: ${refusal}` : "YouTube didn't answer about this video. Try again in a minute.", "unavailable");
  }
  if (!info.tracks.length) throw new CaptionError("No captions available for this video.", "no_captions");
  const pick = pickTrack(info.tracks, language, taught);
  if (!pick) {
    throw new CaptionError(`No ${languageName || language} captions available for this video.`, "no_language");
  }
  let address;
  try { address = new URL(pick.track.baseUrl, "https://www.youtube.com"); } catch { address = null; }
  if (!address || !/(^|\.)youtube\.com$/.test(address.hostname)) throw new CaptionError("No captions available for this video.", "no_captions");
  address.searchParams.set("fmt", "json3");
  let res;
  try {
    res = await request({ url: address.href, method: "GET", headers: { "Accept-Language": "en" } });
  } catch (e) {
    throw new CaptionError(e && e.message ? e.message : "Couldn't reach YouTube. Check your connection.", "network");
  }
  const lines = res && res.status < 400 ? captionLines(parse(res.text), pick.auto) : [];
  if (!lines.length) throw new CaptionError("No captions available for this video.", "no_captions");
  const d = info.details;
  return {
    videoId: id,
    title: String(d.title || "YouTube video"),
    channel: String(d.author || ""),
    duration: Number(d.lengthSeconds) || lines.at(-1).end,
    language: pick.language,
    auto: pick.auto,
    lines,
  };
}

/**
 * Which channel a video belongs to: {id, name, image}. Whatever can't be found comes back "".
 * The id and name come from the same question fetchCaptions asks; the picture is the one the
 * channel's own page offers for link previews.
 */
export async function fetchChannel(id, request) {
  const out = { id: "", name: "", image: "" };
  for (const client of CLIENTS) {
    let res;
    try {
      res = await request({
        url: PLAYER_URL, method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": "en" },
        body: JSON.stringify({ context: { client: { ...client, hl: "en" } }, videoId: id }),
      });
    } catch { return out; }
    const d = res && res.status < 400 ? (parse(res.text) || {}).videoDetails : null;
    if (d && /^UC[\w-]{20,30}$/.test(String(d.channelId || ""))) {
      out.id = String(d.channelId);
      out.name = String(d.author || "");
      break;
    }
  }
  if (!out.id) return out;
  try {
    const page = await request({ url: `https://www.youtube.com/channel/${out.id}`, method: "GET", headers: { "Accept-Language": "en" } });
    const m = page && page.status < 400 ? /<meta property="og:image" content="(https:\/\/[^"]+)"/.exec(page.text) : null;
    if (m) out.image = m[1].replace(/&amp;/g, "&");
  } catch { /* no picture: the first letter of the name is shown instead */ }
  return out;
}
