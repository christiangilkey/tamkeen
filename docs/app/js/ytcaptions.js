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
  /** `code`: "no_captions" | "no_language" | "unavailable" | "blocked" (YouTube's "confirm you're not
   * a bot": it refuses where the request comes from, e.g. the web app's go-between server) | "network". */
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
  if (b === "fil") return "tl";  // YouTube marks Tagalog captions as Filipino
  return b === "cmn" || b === "yue" ? "zh" : b;
}

/** YouTube's code for one of the app's languages where it differs (cc_lang_pref, tlang). */
export function youTubeLanguage(code) {
  return { tl: "fil", zh: "zh-Hans", he: "iw" }[code] || code;
}

/** The code YouTube's translation list uses for `wanted` (its own list may say "zh-Hans" or "fil"). */
function translationCode(wanted, languages) {
  const codes = (Array.isArray(languages) ? languages : []).map((l) => String((l && l.languageCode) || "")).filter(Boolean);
  const own = youTubeLanguage(wanted);
  return codes.find((c) => c === own) || codes.find((c) => c === wanted) || codes.find((c) => baseLanguage(c) === wanted) || own;
}

/**
 * Every usable caption track, best first: [{track, language, kind, auto, tlang?, from?}].
 * `kind` is "manual" (written by a person), "auto" (YouTube's automatic captions, timed per
 * word: `auto` true) or "translated" (YouTube's machine translation of another track, asked for
 * with `tlang`; `from` is that track's language).
 *
 * Order: written by a person in the wanted language; YouTube's automatic captions in it; YouTube's
 * translation into it of the best other track (a person's track in the language spoken, then the
 * spoken language's automatic one, then any other). Last, for when YouTube won't hand over its
 * translation: the language actually spoken in the video (the one automatic captions exist for)
 * if the app teaches it. Only when YouTube made no automatic captions at all (so the spoken
 * language is unknown) is another hand-written track taken: otherwise an English song with
 * Japanese subtitles would count as Japanese.
 * `handmadeOnly` ("Only videos with handmade subtitles"): a person's track in the wanted language
 * or nothing. `translate` false leaves out translations ("Find in a video" wants what is said).
 */
export function captionChoices(tracks, wanted, taught = [], { handmadeOnly = false, translate = true, translationLanguages = null } = {}) {
  const list = (tracks || []).filter((t) => t && t.baseUrl);
  const isAuto = (t) => t.kind === "asr";
  const find = (lang, auto) => {
    const hits = list.filter((t) => isAuto(t) === auto && baseLanguage(t.languageCode) === lang);
    return hits.find((t) => String(t.languageCode).toLowerCase() === lang) || hits[0] || null;
  };
  const out = [];
  const add = (track, language, kind, extra = {}) => {
    if (track && !out.some((c) => c.track === track && c.kind === kind)) out.push({ track, language, kind, auto: kind === "auto", ...extra });
  };
  add(find(wanted, false), wanted, "manual");
  if (handmadeOnly) return out;
  add(find(wanted, true), wanted, "auto");
  const unique = (a) => a.filter((l, i) => l && a.indexOf(l) === i);
  const spoken = unique(list.filter(isAuto).map((t) => baseLanguage(t.languageCode)));
  const written = unique(list.filter((t) => !isAuto(t)).map((t) => baseLanguage(t.languageCode)));
  if (translate && wanted) {
    const source = [...spoken.flatMap((l) => [find(l, false), find(l, true)]), ...list.filter((t) => !isAuto(t)), ...list]
      .find((t) => t && t.isTranslatable !== false && baseLanguage(t.languageCode) !== wanted);
    if (source) add(source, wanted, "translated", { tlang: translationCode(wanted, translationLanguages), from: baseLanguage(source.languageCode) });
  }
  for (const lang of (spoken.length ? spoken : written).filter((l) => l !== wanted && taught.includes(l))) {
    add(find(lang, false), lang, "manual");
    add(find(lang, true), lang, "auto");
  }
  return out;
}

/** The best caption track (the first of captionChoices), or null. */
export function pickTrack(tracks, wanted, taught = [], options = {}) {
  return captionChoices(tracks, wanted, taught, options)[0] || null;
}

/**
 * The video's audio in `wanted` when YouTube offers it as another audio track (a dubbed version,
 * "multi-language audio"): {id, name} (id like "ar.3"), else null. Not when that language is the
 * original sound anyway. Read from the same answer as the captions (`streamingData`).
 */
export function dubbedAudio(data, wanted) {
  const formats = ((data && data.streamingData) || {}).adaptiveFormats || [];
  const tracks = formats.map((f) => f && f.audioTrack).filter((a) => a && a.id);
  const lang = (a) => baseLanguage(String(a.id).split(".")[0]);
  const original = tracks.find((a) => a.audioIsDefault);
  if (original && lang(original) === wanted) return null;
  const hit = tracks.find((a) => lang(a) === wanted && !a.audioIsDefault);
  return hit ? { id: String(hit.id), name: String(hit.displayName || "") } : null;
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

/** Split `text` into words spread over start..end in proportion to their length. (Netflix's
 * subtitles are timed per line too: netflix-ttml.js.) */
export function spread(text, start, end) {
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
 * Everything needed to add a video: {videoId, title, channel, duration, language, auto, kind, from,
 * translationRefused, audio, lines}. `kind`/`from` as in captionChoices; `translationRefused`: YouTube
 * wouldn't hand over its translation into the wanted language (it often refuses anyone but its own
 * player: HTTP 429), so a track further down the list was used; `audio`: dubbedAudio().
 * @param {string} id video id
 * @param {{language: string, languageName?: string, taught?: string[], handmadeOnly?: boolean, translate?: boolean,
 *          request: (req: {url: string, method: string, headers: object, body?: string}) => Promise<{status: number, text: string}>}} opts
 */
export async function fetchCaptions(id, { language, languageName, taught = [], handmadeOnly = false, translate = true, request }) {
  let info = null;
  let refusal = "";
  let blocked = false;
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
    if (status.status === "LOGIN_REQUIRED" && /bot/i.test(status.reason || "")) blocked = true;
    const renderer = (data.captions || {}).playerCaptionsTracklistRenderer || {};
    const tracks = renderer.captionTracks || [];
    if (data.videoDetails && (!info || tracks.length)) info = { details: data.videoDetails, tracks, data, translations: renderer.translationLanguages };
    if (tracks.length) break;
  }
  if (!info) {
    throw new CaptionError(refusal ? `YouTube won't show this video here: ${refusal}` : "YouTube didn't answer about this video. Try again in a minute.",
                           blocked ? "blocked" : "unavailable");
  }
  const name = languageName || language;
  if (!info.tracks.length) {
    throw new CaptionError("This video has no captions at all, so Tamkeen can't show its words. Try another video.", "no_captions");
  }
  const choices = captionChoices(info.tracks, language, taught, { handmadeOnly, translate, translationLanguages: info.translations });
  if (!choices.length) {
    if (handmadeOnly && captionChoices(info.tracks, language, taught, { translate, translationLanguages: info.translations }).length) {
      throw new CaptionError(`This video has no ${name} subtitles written by a person. To use YouTube's automatic ones, turn off “Only videos with handmade subtitles” under Open YouTube.`, "no_handmade");
    }
    throw new CaptionError(`No ${name} captions available for this video.`, "no_language");
  }
  let pick = null;
  let lines = [];
  let translationRefused = false;
  for (const choice of choices) {
    let address;
    try { address = new URL(choice.track.baseUrl, "https://www.youtube.com"); } catch { address = null; }
    if (!address || !/(^|\.)youtube\.com$/.test(address.hostname)) continue;
    address.searchParams.set("fmt", "json3");
    if (choice.kind === "translated") address.searchParams.set("tlang", choice.tlang);
    let res;
    try {
      res = await request({ url: address.href, method: "GET", headers: { "Accept-Language": "en" } });
    } catch (e) {
      throw new CaptionError(e && e.message ? e.message : "Couldn't reach YouTube. Check your connection.", "network");
    }
    // A translation is spread over its lines like a person's captions: its words have no times of their own.
    lines = res && res.status < 400 ? captionLines(parse(res.text), choice.auto) : [];
    if (lines.length) { pick = choice; break; }
    if (choice.kind === "translated") translationRefused = true;
  }
  if (!pick) {
    if (translationRefused) {
      throw new CaptionError(`No ${name} captions for this video, and YouTube wouldn't translate its captions for Tamkeen. Try another video.`, "no_language");
    }
    throw new CaptionError("No captions available for this video.", "no_captions");
  }
  const d = info.details;
  return {
    videoId: id,
    title: String(d.title || "YouTube video"),
    channel: String(d.author || ""),
    duration: Number(d.lengthSeconds) || lines.at(-1).end,
    language: pick.language,
    auto: pick.auto,
    kind: pick.kind,
    from: pick.from || "",
    translationRefused,
    audio: dubbedAudio(info.data, language),
    lines,
  };
}

/** The video's audio in `language`, when YouTube offers a dubbed track in it ({id, name}), else
 * null; also null when YouTube can't be asked. One question, as fetchCaptions asks. */
export async function audioInLanguage(id, language, request) {
  for (const client of CLIENTS) {
    let res;
    try {
      res = await request({
        url: PLAYER_URL, method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": "en" },
        body: JSON.stringify({ context: { client: { ...client, hl: "en" } }, videoId: id }),
      });
    } catch { return null; }
    const data = res && res.status < 400 ? parse(res.text) : null;
    if (data && data.streamingData) return dubbedAudio(data, language);
  }
  return null;
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
