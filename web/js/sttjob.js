// Sending a long episode to a cloud speech-to-text provider from a phone or the web app without
// losing what is done when the connection drops. Used by mobile/src/js/transcribe-service.js; the
// phone's and browser's own parts (requests, storage, "is the app on screen?") are handed in, so the
// tests can run it on a long file with a connection that comes and goes (tests/js/sttjob.test.mjs).
//
// Why (2026-11-20): a 2-hour podcast episode failed in the web app on the owner's phone (Firefox, the
// battery at 5%) with "Couldn't reach Groq. Check your internet connection. (NetworkError when
// attempting to fetch resource.)". Such an episode goes up in 16 pieces of 8 minutes over several
// minutes. Phones cut the internet to a browser or app that is in the background or asleep (more so
// in battery saver), and each piece had four quick tries, about 30 seconds in all, which were used up
// while it was cut off. One piece failing failed the whole episode, and Retry began again from the
// first minute (paying for the audio again). Now:
//   - a dropped connection while the app was out of sight, or while the phone said it was offline, is
//     waited out until both are back, and not counted as a failed try;
//   - other drops are tried again after 5, 10, 20, 40 and 60 seconds (about two minutes);
//   - every finished piece is kept (`keep`), so Retry carries on from where it stopped;
//   - the message says what happened and what to do.
// Then the owner added: "Gets stuck at 8 percent". 8% of that episode is exactly where its first
// 8-minute piece (7.3 MB) is sent, so the very first upload failed on every try, while Groq takes that
// size from a computer without trouble (checked: it answers, with its CORS headers, up to its 25 MB
// limit). On a phone with a slow or patchy upload, a 7.3 MB request is what keeps dying. So:
//   - a piece that still fails after two more tries (with the app on screen and online) is cut in half
//     and the halves sent instead, down to 1-minute pieces; the rest of the episode goes in the smaller
//     size, and the phone remembers it for a few days (transcribe-service.js `stt_piece_seconds`);
//   - while a piece is going up, the Library says so ("Sending 0:00–8:00 to Groq…"), so a long upload
//     no longer looks stuck.

import { MAX_UPLOAD_BYTES, Mp3Splitter, STT_PROVIDERS, SttError, looksLikeConnection, sendFailure, sttFailure, waitText } from "./stt.js";

export class Cancelled extends Error {}

export const HEAD_BYTES = 256 * 1024;      // the first request: enough to tell what kind of file it is
export const STEP_BYTES = 3 * 1024 * 1024; // how much audio is fetched per request
export const LONGEST_WAIT = 20 * 60;       // seconds a "slow down" from the provider is waited out before giving up
const SERVER_TRIES = 4;                    // a provider "having trouble" (5xx)
// Pauses before trying a dropped connection again. A long episode's job is patient: about two minutes
// of real trouble before it stops. Anything else (Test the key, reels) keeps the old quick tries.
export const PATIENT_PAUSES = [5, 10, 20, 40, 60];
export const QUICK_PAUSES = [3, 6, 9];
const OUT_OF_SIGHT_TRIES = 40;             // drops waited out while the app was hidden or offline
const KEEP_DAYS = 14;                      // how long a half-done episode is remembered
export const PIECE_SECONDS = 480;          // a piece of an MP3, normally (8 minutes: 7.3 MB at 128 kbit/s)
export const SMALLEST_PIECE = 60;          // pieces are never cut smaller than this
export const SPLIT_AFTER = 2;              // drops (on screen, online) before a piece is cut in half

/** Wait `seconds`, stopping early (with Cancelled) if the job is cancelled. */
export async function pause(seconds, job) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (job && job.cancelled) throw new Cancelled();
    await new Promise((r) => setTimeout(r, Math.min(500, Math.max(0, end - Date.now()))));
  }
  if (job && job.cancelled) throw new Cancelled();
}

/** The connection as the page sees it, for when nothing better is handed in: always there. */
export const ALWAYS_ON = { mark: () => 0, troubleSince: () => false, waitUntilBack: async () => {} };

const say = (job, text) => { if (job && job.say) job.say(text); };

/**
 * Run `attempt()` until it doesn't fail for want of a connection.
 * ctx: { job, net, sleep, pauses }. `net.mark()` notes the moment; `net.troubleSince(mark)` is true if
 * the app went out of sight or the phone went offline since then (or is now); `net.waitUntilBack(job)`
 * waits until it is on screen and online again. `isDrop(error)` says which errors are the connection.
 * Giving up, it throws the last error with `lostFor` = seconds spent trying again.
 * With `ctx.splitAfter`, it gives up sooner, after that many drops while on screen and online, with
 * `split` set on the error: the caller can then send the same audio in smaller pieces (streamMp3).
 */
export async function throughDrops(attempt, ctx, isDrop = looksLikeConnection) {
  const { job = null, net = ALWAYS_ON, sleep = pause, pauses = QUICK_PAUSES, splitAfter = 0 } = ctx || {};
  let counted = 0;
  let excused = 0;
  let waited = 0;
  for (;;) {
    if (job && job.cancelled) throw new Cancelled();
    const mark = net.mark();
    try {
      const out = await attempt();
      if (counted || excused) say(job, "");
      return out;
    } catch (e) {
      if (e instanceof Cancelled || !isDrop(e)) throw e;
      console.warn("The connection dropped", e);
      if (net.troubleSince(mark) && excused < OUT_OF_SIGHT_TRIES) {
        excused++;
        await net.waitUntilBack(job);
        continue;
      }
      if (counted >= pauses.length) { e.lostFor = waited; throw e; }
      if (splitAfter && counted >= splitAfter) { e.lostFor = waited; e.split = true; throw e; }
      const s = pauses[counted++];
      waited += s;
      if (pauses === PATIENT_PAUSES) say(job, `The connection dropped. Trying again in ${s} seconds…`);
      await sleep(s, job);
    }
  }
}

/**
 * Send one request to the provider and return its answer (the JSON). `request()` makes the request and
 * resolves to {status, body, retryAfter}, or throws when no answer came at all. A "slow down" is waited
 * out (up to `ctx.longestWait` seconds), "having trouble" is tried again a few times, a dropped
 * connection as throughDrops does it.
 */
export async function askProvider(provider, request, ctx = {}) {
  const label = (STT_PROVIDERS[provider] || {}).label || "The provider";
  const job = ctx.job || null;
  const longest = ctx.longestWait || LONGEST_WAIT;
  let waited = 0;
  let troubled = 0;
  for (;;) {
    if (job && job.cancelled) throw new Cancelled();
    const res = await throughDrops(async () => {
      try { return await request(); }
      catch (e) {
        if (e instanceof Cancelled) throw e;
        const out = sendFailure(provider, e); // not every failure is the connection: the phone can refuse to build it
        out.where = label;
        throw out;
      }
    }, ctx, (e) => e.retry === true);
    const { status = 0, body = null, retryAfter = 0 } = res || {};
    if (status === 200) {
      say(job, "");
      try { return typeof body === "string" ? JSON.parse(body) : body || {}; }
      catch { throw new SttError(`${label} sent back something that isn't a transcript.`); }
    }
    if (status === 429) { // the account's limit (free accounts: so much audio an hour); the answer says how long to wait
      const wait = retryAfter || 20;
      if (waited + wait > longest) throw sttFailure(provider, 429, body, wait);
      waited += wait;
      say(job, `${label} asks to wait ${waitText(wait)}…`);
      await (ctx.sleep || pause)(wait + 1, job);
      continue;
    }
    if (status >= 500) {
      if (++troubled >= SERVER_TRIES) throw new SttError(`${label} is having trouble (error ${status}). Try again in a little while.`, { status });
      await (ctx.sleep || pause)(4 * troubled, job);
      continue;
    }
    throw sttFailure(provider, status, body, retryAfter);
  }
}

// ---------------------------------------------------------------- carrying on where it stopped

const pathOf = (url) => { try { const u = new URL(url); return u.host + u.pathname; } catch { return String(url || ""); } };

/** Can what an earlier try finished (`saved`) be carried on with this download? Only when it is the very
 * same file: the same address, model and language, the same size, and (podcasts that put different
 * adverts into each download send each listener to a file of their own) the same file it was sent to. */
export function canResume(saved, { address, model, language, total, src, now = Date.now() }) {
  return !!(saved && total > 0 && saved.address === address && saved.model === model && saved.language === language
    && saved.total === total && pathOf(saved.src) === pathOf(src) && saved.byte > 0 && saved.byte < total
    && Array.isArray(saved.segments) && now - (saved.at || 0) < KEEP_DAYS * 86400e3);
}

/** h:mm:ss (or m:ss) for a place in an episode. */
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** A piece of an MP3 cut again into pieces of at most `seconds`, between frames, keeping their times and
 * where in the file each ends (the last ends where the whole did). */
export function recut(piece, seconds) {
  const s = new Mp3Splitter({ maxSeconds: seconds, maxBytes: Infinity, start: piece.start, offset: piece.end - piece.bytes.length });
  s.first = false; // (a piece starts on a frame: no tag block to look for)
  const parts = [...s.push(piece.bytes), s.finish()].filter(Boolean);
  if (parts.length) parts[parts.length - 1].end = piece.end;
  return parts;
}

/**
 * An MP3 episode on the web, fetched a few megabytes at a time and sent piece by piece.
 *   first      the first answer of fetchRange (the file's beginning), with `total` and `src`
 *   fetchRange (url, from, to) => {status, bytes}
 *   hear       (piece, extra) => parsed transcription of that piece (times already counted from the file's
 *              start); `extra` ({splitAfter}) goes on to askProvider's ctx
 *   keep       ({byte, start, segments}) => saves what is done after each piece (may be async)
 *   saved      what an earlier try finished (canResume said yes), or null
 *   pieceSeconds  how long a piece is to begin with; smaller(seconds) is told when it had to be made smaller
 *   label      the provider's name, for "Sending 0:00–8:00 to Groq…"
 * Resolves to {segments, seconds}. On failure the error carries `stoppedAt` (seconds done and kept).
 */
export async function streamMp3({ first, fetchRange, hear, keep = () => {}, saved = null, job, ctx = {}, step = STEP_BYTES,
                                  pieceSeconds = PIECE_SECONDS, smaller = () => {}, label = "" }) {
  const { total, src } = first;
  const whole = first.status === 200; // a server that ignores "just this part" and sends everything
  const segments = saved ? [...saved.segments] : [];
  const maxSeconds = Math.max(SMALLEST_PIECE, pieceSeconds);
  const splitter = saved ? new Mp3Splitter({ maxSeconds, start: saved.start, offset: saved.byte }) : new Mp3Splitter({ maxSeconds });
  let doneTo = saved ? saved.start : 0;
  // One piece; one that keeps failing to go up is sent as two halves instead (and so on, down to a minute).
  const sendPiece = async (p) => {
    const canSplit = p.seconds >= 2 * SMALLEST_PIECE;
    if (label) say(job, `Sending ${clock(p.start)}–${clock(p.start + p.seconds)} to ${label}…`);
    let parsed;
    try {
      parsed = await hear(p, canSplit ? { splitAfter: SPLIT_AFTER } : {});
    } catch (e) {
      if (!(e && e.split && canSplit)) throw e;
      const size = Math.max(SMALLEST_PIECE, Math.round(p.seconds / 2));
      if (size < splitter.maxSeconds) { splitter.maxSeconds = size; smaller(size); }
      for (const q of recut(p, size)) await sendPiece(q);
      return;
    }
    segments.push(...parsed.segments);
    doneTo = p.start + p.seconds;
    await keep({ byte: p.end, start: doneTo, segments });
  };
  const send = async (pieces) => {
    for (const p of pieces) {
      if (!p) continue;
      // (a piece cut before the size came down goes in the new size)
      if (p.seconds > splitter.maxSeconds + 1) { for (const q of recut(p, splitter.maxSeconds)) await sendPiece(q); }
      else await sendPiece(p);
    }
    if (pieces.some(Boolean)) say(job, ""); // (the note was about a piece going up)
  };
  const fetchMore = (from, to) => throughDrops(async () => {
    try { return await fetchRange(src, from, to); }
    catch (e) { e.where = "the episode's server"; throw e; }
  }, ctx);
  try {
    let got = saved ? saved.byte : first.bytes.length;
    job.set("transcribing", total ? Math.min(99, (100 * got) / total) : 0);
    if (!saved) await send(splitter.push(first.bytes));
    while (!whole && (!total || got < total)) {
      if (job.cancelled) throw new Cancelled();
      const r = await fetchMore(got, (total ? Math.min(total, got + step) : got + step) - 1);
      if (r.status === 416 || (r.status === 206 && !r.bytes.length)) break; // past the end
      if (r.status !== 206) throw new Error(`The download stopped part-way (the server answered ${r.status}).`);
      got += r.bytes.length;
      job.set("transcribing", total ? Math.min(99, (100 * got) / total) : 0);
      await send(splitter.push(r.bytes));
    }
    await send([splitter.finish()]);
  } catch (e) {
    if (e && typeof e === "object") e.stoppedAt = doneTo;
    throw e;
  }
  if (!splitter.total) throw new Error("This audio couldn't be read as an MP3.");
  return { segments, seconds: splitter.total };
}

/** Fetch the rest of a file that isn't an MP3 (it can only be sent whole), through dropped connections. */
export async function fetchWhole({ first, fetchRange, job, ctx = {}, step = STEP_BYTES, limit = MAX_UPLOAD_BYTES }) {
  const { total, src } = first;
  const parts = [first.bytes];
  let got = first.bytes.length;
  while (first.status !== 200 && (!total || got < total)) {
    if (job.cancelled) throw new Cancelled();
    const r = await throughDrops(async () => {
      try { return await fetchRange(src, got, (total ? Math.min(total, got + step) : got + step) - 1); }
      catch (e) { e.where = "the episode's server"; throw e; }
    }, ctx);
    if (r.status === 416 || (r.status === 206 && !r.bytes.length)) break;
    if (r.status !== 206) throw new Error(`The download stopped part-way (the server answered ${r.status}).`);
    parts.push(r.bytes);
    got += r.bytes.length;
    if (got > limit) throw new Error("This episode's audio isn't an MP3 and is too large to send in one piece. Transcribe it on your computer.");
    job.set("downloading", total ? Math.min(99, (100 * got) / total) : 0);
  }
  return parts;
}

/**
 * What the Library says when an episode stops. `stoppedAt`/`duration` in seconds (duration may be unknown).
 * A connection that stayed away gets what happened and what to do; any other reason is kept as it is,
 * with a word that Retry carries on when something was done.
 */
export function stopMessage(error, { duration = 0 } = {}) {
  const message = (error && error.message) || String(error);
  const at = (error && error.stoppedAt) || 0;
  if (error && error.lostFor != null) {
    const minutes = Math.max(1, Math.round(error.lostFor / 60));
    const where = error.where || "the episode's server";
    const place = duration ? `${clock(at)} / ${clock(duration)}` : clock(at);
    const detail = error.detail || String(error.message || "").replace(/\s+/g, " ").trim().slice(0, 160);
    // (One sentence for the translations: web/js/i18n.js matches the whole text.)
    return `Couldn't reach ${where} for about ${minutes} minutes, so it stopped at ${place}. Retry carries on from there. Phones cut the internet to apps in the background, more so when the battery is low: keep Tamkeen open with the screen on, and plug the phone in. (${detail})`;
  }
  return at > 0 ? `${message} Retry carries on from where it stopped.` : message;
}
