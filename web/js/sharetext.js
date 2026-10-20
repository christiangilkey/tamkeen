// The words (or the text) that travel with something sent to a friend from the Library or a
// player (components/sendmedia.js). Shared by the desktop app, the phones and the web app, and
// free of screen code so it can be tested on its own (tests/js/sharetext.test.mjs).
//
// What the sender has is its transcript as GET /episodes/<id>/transcript gives it; the computer
// (app/api/episodes.py) and the phone (mobile/src/js/backend.js) answer that in the same shape.
// It is packed into one small object:
//
//   {format: "tamkeen-transcript", v: 1, model, language,
//    segments: [{start, end, text, words: [[start, end, word], …]}, …]   a podcast, video or reel
//    blocks:   [{kind, text}, …]}                                         a page, a book or a text
//
// `segments` is exactly what POST /youtube (as `lines`) and POST /shared/reel already take, so an
// app older than this still accepts a YouTube video or a reel sent with its words inline. `blocks`
// is what POST /pages and POST /books take. The object is gzipped and uploaded to the online
// "voice" storage next to voice notes (social.uploadText); the message carries only its path.
// When the upload can't be made, a small one rides inside the message itself, as before.
//
// On the friend's side `acceptInto` puts the item in their library through those same routes
// (and POST /shared/podcast for a podcast episode), so it opens ready, with clickable words.

export const FORMAT = "tamkeen-transcript";
export const VERSION = 1;
/** A file in the "voice" storage may be at most 3 MB (supabase/schema.sql). */
export const MAX_FILE_BYTES = 3 * 1024 * 1024 - 4096;
/** Inside the message itself (the old way) the whole message must stay under the service's 1 MB. */
export const MAX_INLINE_CHARS = 600000;
/** What is unpacked at most: a long podcast or a long book, never more. */
const MAX_SEGMENTS = 20000;
const MAX_WORDS = 300000;
const MAX_BLOCKS = 60000;
const MAX_TEXT_CHARS = 4000000;
const BLOCK_KINDS = new Set(["h1", "h2", "h3", "p", "li", "q"]);

/** The kinds whose transcript is their text, read without sound (stored as blocks). */
export const TEXT_KINDS = new Set(["page", "book", "text"]);

const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
const num = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0);
const line = (x, n) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const code = (x) => (typeof x === "string" && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(x) ? x : null);

/** Pack a transcript (the GET /episodes/<id>/transcript answer) for sending. `asText` keeps only
 * the text, block by block (pages, books, and a recording sent as something to read). Null when
 * there is nothing in it. */
export function packTranscript(t, { asText = false } = {}) {
  const segs = (t && Array.isArray(t.segments)) ? t.segments : [];
  if (!segs.length) return null;
  const ep = (t && t.episode) || {};
  const out = { format: FORMAT, v: VERSION, model: line(ep.model, 80), language: code(ep.language) };
  if (asText) {
    const blocks = segs.map((s) => ({ kind: BLOCK_KINDS.has(s.kind) ? s.kind : "p", text: line(s.text, 20000) }))
      .filter((b) => b.text);
    return blocks.length ? { ...out, blocks } : null;
  }
  const W = (t && t.words) || {};
  const texts = Array.isArray(W.text) ? W.text : [];
  const segments = segs.map((s) => ({ start: r3(s.start), end: r3(s.end), text: String(s.text || ""), words: [] }));
  // A word names its segment by the segment's idx (the computer's numbering), not its position.
  const at = new Map(segs.map((s, i) => [s.idx ?? i, i]));
  for (let i = 0; i < texts.length; i++) {
    const seg = segments[at.get(W.seg[i])];
    if (seg) seg.words.push([r3(W.start[i]), r3(W.end[i]), String(texts[i])]);
  }
  const kept = segments.filter((s) => s.text.trim() || s.words.length);
  return kept.length ? { ...out, segments: kept } : null;
}

/** Check and tidy a packed transcript that came from a friend (or from an older app: then it is
 * just {model, segments}). Null when nothing usable is in it. Anything odd is dropped, never kept. */
export function unpackTranscript(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  if (x.format !== undefined && x.format !== FORMAT) return null;
  const out = { model: line(x.model, 80), language: code(x.language) };
  if (Array.isArray(x.blocks)) {
    let chars = 0;
    const blocks = [];
    for (const b of x.blocks.slice(0, MAX_BLOCKS)) {
      if (!b || typeof b !== "object") continue;
      const text = line(b.text, 20000);
      if (!text) continue;
      chars += text.length;
      if (chars > MAX_TEXT_CHARS) break;
      blocks.push({ kind: BLOCK_KINDS.has(b.kind) ? b.kind : "p", text });
    }
    if (blocks.length) out.blocks = blocks;
  }
  if (Array.isArray(x.segments)) {
    let total = 0;
    const segments = [];
    for (const s of x.segments.slice(0, MAX_SEGMENTS)) {
      if (!s || typeof s !== "object") continue;
      const words = [];
      for (const w of Array.isArray(s.words) ? s.words : []) {
        if (!Array.isArray(w) || w.length < 3 || total >= MAX_WORDS) continue;
        const text = String(w[2] ?? "").replace(/\s+/g, "").slice(0, 120);
        if (!text) continue;
        const start = r3(num(w[0]));
        words.push([start, Math.max(start, r3(num(w[1]))), text]);
        total++;
      }
      const text = line(s.text, 2000) || words.map((w) => w[2]).join(" ");
      if (!text) continue;
      const start = s.start != null ? r3(num(s.start)) : words.length ? words[0][0] : 0;
      segments.push({ start, end: Math.max(r3(num(s.end)), words.length ? words.at(-1)[1] : start), text, words });
    }
    if (segments.length) out.segments = segments;
  }
  return out.blocks || out.segments ? out : null;
}

/** A timed transcript read as text: one paragraph per segment (a recording's words, sent to read). */
export function asBlocks(text) {
  if (!text) return null;
  if (text.blocks) return text.blocks;
  return text.segments ? text.segments.map((s) => ({ kind: "p", text: s.text })) : null;
}

/** How many words a packed transcript holds (for "with its words" and the tests). */
export function wordCount(text) {
  if (!text) return 0;
  if (text.segments) return text.segments.reduce((n, s) => n + (s.words.length || s.text.split(/\s+/).filter(Boolean).length), 0);
  return (text.blocks || []).reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
}

/** Packed transcript -> gzipped file, ready to upload. */
export async function gzipText(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(stream).arrayBuffer()], { type: "application/gzip" });
}

/** A downloaded file -> the packed transcript inside it (gzipped or, just in case, plain JSON). */
export async function gunzipText(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const stream = new Blob([bytes]).stream();
  const text = await new Response(gz ? stream.pipeThrough(new DecompressionStream("gzip")) : stream).text();
  return JSON.parse(text);
}

/** A friend's book or recording is kept in "My books" under an id made from what it is, so
 * accepting the same thing twice refreshes it instead of adding a second copy. */
export function sharedBookGuid(item, text) {
  return `file:shared:${line(item.title, 200)}:${wordCount(text)}`.slice(0, 300);
}

/**
 * Put a sent item in this device's library, through the ordinary routes (`api` is app.js's).
 * `text` is the unpacked transcript or null. `shelf(lang)` lists the free book shelf's books
 * (books.js shelfFor) and `fromShelf(lang, row)` adds one (books.js addFromShelf); `reelCode` and
 * `videoId` read a reel's and a video's id from their links (the app passes social.js's and ytcaptions.js's).
 * Resolves to {episode, hash, withText}: `hash` opens it ("" = leave it to the ordinary opener,
 * studycard.openItem), `withText` says whether the words that came along were used.
 */
export async function acceptInto(api, item, text, { shelf = null, fromShelf = null, reelCode = reelCodeOf, videoId = youTubeIdOf } = {}) {
  const language = item.language || (text && text.language) || null;
  const lines = text && text.segments;
  const blocks = text && text.blocks;
  const open = (ep, extra = "") => `#/episode/${ep.id}${extra}`;
  switch (item.kind) {
    case "reel": {
      if (!lines) return { episode: null, hash: "", withText: false };
      const ep = await api("/shared/reel", { method: "POST", body: {
        code: reelCode(item.url), creator: item.subtitle || "", title: item.title || "", language,
        seconds: item.duration || null, signin: !!item.signin, model: (text && text.model) || "", segments: lines,
      } });
      return { episode: ep, hash: `#/reels/play?at=${ep.id}`, withText: true };
    }
    case "youtube": {
      const id = videoId(item.url);
      if (!lines || !id) return { episode: null, hash: "", withText: false };
      const ep = await api("/youtube", { method: "POST", body: {
        video_id: id, title: item.title, channel: item.subtitle || "", duration: item.duration || null, language,
        auto: /auto/.test((text && text.model) || ""), lines: lines.map((s) => ({ start: s.start, end: s.end, text: s.text, words: s.words })),
      } });
      return { episode: ep, hash: open(ep, item.at ? `?t=${item.at}` : ""), withText: true };
    }
    case "podcast": {
      // The podcast is followed (if it wasn't) and the episode found or made, with its words
      // when they came: one call, the same on the computer and the phone.
      const r = await api("/shared/podcast", { method: "POST", body: {
        feed_url: item.feed_url, guid: item.guid || "", audio_url: item.audio_url || "", title: item.title || "",
        image: item.image || "", duration: item.duration || null, language,
        model: (text && text.model) || "", segments: lines || [],
      } });
      return { episode: r.episode, hash: open(r.episode, item.at ? `?t=${item.at}` : ""), withText: !!r.transcribed,
               keptOwn: !!r.kept_own, addedFeed: !!r.added_feed };
    }
    case "page": {
      if (!blocks) return { episode: null, hash: "", withText: false };
      const ep = await api("/pages", { method: "POST", body: {
        url: item.url, title: item.title || "", blocks, image: item.image || null, site: item.subtitle || null, language,
      } });
      return { episode: ep, hash: open(ep), withText: true };
    }
    case "book": {
      const guid = String(item.guid || "");
      if (guid.startsWith("book:") && shelf && fromShelf) {
        // One of Tamkeen's free books: it comes from the shelf itself, complete.
        const [lang, id] = guid.slice(5).split("/");
        const row = (await shelf(lang)).find((b) => String(b.id) === id);
        if (row) {
          const ep = await fromShelf(lang, row);
          return { episode: ep, hash: open(ep), withText: true };
        }
      }
      if (!blocks) throw new Error("This book came without its text, so it can't be added.");
      const ep = await api("/books", { method: "POST", body: {
        guid: guid.startsWith("file:") || guid.startsWith("book:") ? guid : sharedBookGuid(item, text),
        title: item.title || "", author: item.subtitle || "", lang: language || "", blocks, source: item.source || "",
      } });
      return { episode: ep, hash: open(ep), withText: true };
    }
    case "text": {
      // Someone's own recording: the file stays with them, its words arrive as a text to read.
      const words = asBlocks(text);
      if (!words) throw new Error("Its words didn't arrive, so there is nothing to add.");
      const ep = await api("/books", { method: "POST", body: {
        guid: sharedBookGuid(item, text), title: item.title || "", author: item.subtitle || "", lang: language || "",
        blocks: words, source: "transcript",
      } });
      return { episode: ep, hash: open(ep), withText: true };
    }
    default:
      throw new Error("This kind of thing can't be added.");
  }
}

// Plain stand-ins for social.reelCode and ytcaptions.videoId, for the tests.
function reelCodeOf(url) {
  const m = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})/.exec(String(url || ""));
  return m ? m[1] : "";
}

function youTubeIdOf(url) {
  const s = String(url || "");
  const m = /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(s);
  return m ? m[1] : "";
}
