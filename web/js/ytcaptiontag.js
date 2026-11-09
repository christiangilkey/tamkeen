// The small tag on lists of YouTube videos for a video YouTube has no captions for: "No captions ·
// Gemini required" (or "· Gemini will write them" when the learner has a Gemini key), so it shows
// before the video is tapped, not only in the "No captions on YouTube" box afterwards.
//
// Which videos: those whose player answer lists no caption track the player could use in the
// language being studied (ytcaptions.js checkCaptions / captionVerdict: YouTube's translation counts,
// as the player uses it). The answer is the same one question the player asks first (its caption
// list); nothing of the video, its sound or its captions is downloaded. A check that failed (no
// connection, YouTube refusing the web app's go-between server, a live stream) never tags a video.
//
// Pure logic, shared by the web app's YouTube page (mobile/src/js/web-youtube.js) and tested
// (tests/js/ytcaptiontag.test.mjs). The installed apps list videos on YouTube's own pages, inside
// the app's browser: web/js/youtube-browser.js tags those, with its own copy of these rules.

import { MAX_SECONDS } from "./ytgemini.js";

/** The words on the tag (the desktop's app/youtube.py CAPTION_TAG_TEXT has the same three). */
export const TAG_TEXT = {
  nokey: "No captions · Gemini required",
  key: "No captions · Gemini will write them",
  long: "No captions on YouTube", // longer than Gemini can caption in one go (ytgemini.js MAX_SECONDS)
};

/** The tag for a checkCaptions result, or "" for none. `made`: the video is already in the library
 * with captions (Gemini's), so tapping it opens those. */
export function tagText(result, { hasKey = false, made = false } = {}) {
  if (!result || result.captions !== "none" || made) return "";
  if (Number(result.seconds) > MAX_SECONDS) return TAG_TEXT.long;
  return hasKey ? TAG_TEXT.key : TAG_TEXT.nokey;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** How long an answer is kept. "none" for a few hours: YouTube adds automatic captions to a new
 * video some hours after it is uploaded. A failed check only briefly, and never stored. */
export const KEEP = { yes: 3 * 24 * HOUR, other: 3 * 24 * HOUR, none: 6 * HOUR, unknown: 2 * MINUTE };
/** At most this many questions to YouTube at once, and at most this many answers kept. */
export const AT_ONCE = 3;
export const MAX_KEPT = 500;
/** After this many failed checks in a row (YouTube refusing), stop asking for PAUSE. */
export const FAILS_BEFORE_PAUSE = 4;
export const PAUSE = 2 * MINUTE;

/**
 * Checks videos a few at a time and remembers the answers by video id.
 * `check(id)` resolves to checkCaptions' {captions, seconds}; `store` (optional) keeps the answers
 * between visits: {load() -> object, save(object)}; `scope` (the study language) is part of every key.
 * Returns {known(id), want(id) -> Promise<result>, drop(id)}: `want` asks (or answers from memory);
 * `drop` takes a video that left the screen out of the waiting line (one being asked carries on).
 */
export function captionChecker({ check, store = null, scope = "", now = () => Date.now(), atOnce = AT_ONCE } = {}) {
  let kept = {};
  try { kept = (store && store.load()) || {}; } catch { kept = {}; }
  if (!kept || typeof kept !== "object") kept = {};
  const brief = new Map(); // failed checks: memory only
  const asking = new Map(); // key -> promise
  const waiting = [];      // [{key, id, resolve}]
  let running = 0;
  let fails = 0;
  let pausedUntil = 0;
  const keyOf = (id) => `${scope}:${id}`;

  const fresh = (entry) => entry && entry.until > now() ? { captions: entry.captions, seconds: entry.seconds || 0 } : null;
  function known(id) {
    const key = keyOf(id);
    return fresh(kept[key]) || fresh(brief.get(key));
  }
  function remember(key, result) {
    const entry = { captions: result.captions, seconds: Number(result.seconds) || 0, until: now() + (KEEP[result.captions] || KEEP.unknown) };
    if (result.captions === "unknown") { brief.set(key, entry); return; }
    kept[key] = entry;
    const keys = Object.keys(kept);
    if (keys.length > MAX_KEPT) {
      const t = now();
      for (const k of keys) if (!(kept[k].until > t)) delete kept[k];
      const left = Object.keys(kept).sort((a, b) => kept[a].until - kept[b].until);
      for (const k of left.slice(0, Math.max(0, left.length - MAX_KEPT))) delete kept[k];
    }
    try { if (store) store.save(kept); } catch { /* kept in memory for this visit */ }
  }
  function next() {
    while (running < atOnce && waiting.length) {
      const job = waiting.shift();
      if (now() < pausedUntil) { job.resolve({ captions: "unknown", seconds: 0 }); continue; }
      running++;
      Promise.resolve().then(() => check(job.id)).catch(() => ({ captions: "unknown", seconds: 0 })).then((r) => {
        const result = r && ["yes", "other", "none", "unknown"].includes(r.captions) ? r : { captions: "unknown", seconds: 0 };
        if (result.captions === "unknown") {
          if (++fails >= FAILS_BEFORE_PAUSE) { pausedUntil = now() + PAUSE; fails = 0; }
        } else fails = 0;
        remember(job.key, result);
        running--;
        asking.delete(job.key);
        job.resolve(result);
        next();
      });
    }
  }
  function want(id) {
    const have = known(id);
    if (have) return Promise.resolve(have);
    const key = keyOf(id);
    if (asking.has(key)) return asking.get(key);
    const promise = new Promise((resolve) => { waiting.push({ key, id, resolve }); });
    asking.set(key, promise);
    next();
    return promise;
  }
  function drop(id) {
    const key = keyOf(id);
    const i = waiting.findIndex((j) => j.key === key);
    if (i < 0) return;
    const [job] = waiting.splice(i, 1);
    asking.delete(key);
    job.resolve(null); // (nothing to show: it left the screen before it was asked)
  }
  return { known, want, drop };
}
