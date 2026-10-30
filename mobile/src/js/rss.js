// Reading a podcast's RSS feed on the phone, so a podcast added there shows its episodes straight
// away instead of waiting for the computer to sync. The phone twin of parse_feed in app/feeds.py:
// the two must agree on each episode's id ("guid"), because that is how the phone and the
// computer recognise the same episode. tests/js/rss.test.mjs checks this file against what the
// Python code produces (tests/fixtures/rss_parity.json).
//
// Pure logic: no page and no app imports. It reads the feed with its own small, forgiving reader
// instead of the browser's XML parser, which refuses a whole feed over one stray "&".

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".m4b", ".aac", ".ogg", ".opus", ".wav", ".flac", ".mp4", ".oga", ".webm"];
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
// Tags that never hold anything, so one written without its closing "/" doesn't swallow what follows.
const EMPTY_TAGS = new Set(["br", "hr", "img", "enclosure", "itunes:image"]);

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return whole; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED, code.toLowerCase()) ? NAMED[code.toLowerCase()] : whole;
  });
}

// One piece of the feed at a time: a CDATA block, something to skip (comments, <?xml ...?>,
// <!DOCTYPE>), a tag, or plain text.
const PIECE = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
const ATTRIBUTE = /([^\s=\/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** The feed as a tree of {name, attrs, children, text}. Names are lower-cased, prefix included ("itunes:image"). */
function read(xml) {
  const root = { name: "", attrs: {}, children: [], text: "" };
  const open = [root];
  PIECE.lastIndex = 0;
  let m;
  while ((m = PIECE.exec(xml))) {
    const top = open[open.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[5] !== undefined) top.text += decode(m[5]);
    else if (m[3] !== undefined) {
      const name = m[3].toLowerCase();
      if (m[2]) { // a closing tag: close back to the nearest open tag of that name (if any)
        for (let i = open.length - 1; i > 0; i--) if (open[i].name === name) { open.length = i; break; }
        continue;
      }
      let rest = m[4] || "";
      const selfClosing = /\/\s*$/.test(rest) || EMPTY_TAGS.has(name);
      if (selfClosing) rest = rest.replace(/\/\s*$/, "");
      const node = { name, attrs: {}, children: [], text: "" };
      let a;
      ATTRIBUTE.lastIndex = 0;
      while ((a = ATTRIBUTE.exec(rest))) node.attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
      top.children.push(node);
      if (!selfClosing) open.push(node);
    }
  }
  return root;
}

const kids = (node, name) => node.children.filter((c) => c.name === name);
const kid = (node, ...names) => { for (const n of names) { const c = node.children.find((x) => x.name === n); if (c) return c; } return null; };
/** All the text inside a node, including text inside tags nested in it. */
const textOf = (node) => (node ? node.text + node.children.map(textOf).join(" ") : "");
function find(node, name, out = []) {
  for (const c of node.children) { if (c.name === name) out.push(c); else find(c, name, out); }
  return out;
}

/** Text without tags or runs of spaces (same as _clean_text in app/feeds.py). */
function clean(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** itunes:duration: "3723", "1:02:03", "62:03", "00:45.5", or junk (→ null). */
export function parseDuration(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":");
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => /^\d+(\.\d+)?$/.test(p.trim()))) {
    return parts.reduce((total, p) => total * 60 + Number(p), 0);
  }
  return null;
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function isAudio(url, mime) {
  if (mime && (mime.startsWith("audio/") || ["video/mp4", "application/ogg", "video/x-m4v"].includes(mime))) return true;
  const path = url.split("?", 1)[0].toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/** The episode's sound file: [url, type] or null. */
function findAudio(item) {
  const candidates = [];
  for (const enc of kids(item, "enclosure")) {
    const href = enc.attrs.url || enc.attrs.href;
    if (href) candidates.push([href, enc.attrs.type || null]);
  }
  for (const media of find(item, "media:content")) if (media.attrs.url) candidates.push([media.attrs.url, media.attrs.type || null]);
  for (const link of [...kids(item, "link"), ...kids(item, "atom:link")]) {
    if (link.attrs.rel === "enclosure" && link.attrs.href) candidates.push([link.attrs.href, link.attrs.type || null]);
  }
  const pick = candidates.find(([url, mime]) => isAudio(url, mime)) || candidates[0];
  return pick ? [pick[0].trim(), pick[1]] : null;
}

function imageOf(node) {
  const itunes = kid(node, "itunes:image");
  if (itunes && itunes.attrs.href) return itunes.attrs.href;
  const image = kid(node, "image");
  const url = image && (clean(textOf(kid(image, "url"))) || image.attrs.href);
  if (url) return url;
  const thumb = find(node, "media:thumbnail").find((t) => t.attrs.url);
  return thumb ? thumb.attrs.url : null;
}

async function sha1Hex(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A feed's text → {title, description, link, image, episodes: [{guid, title, audio_url, audio_type,
 * description, published, duration, image}]}. Entries without a sound file are left out.
 * Throws when the text isn't a podcast feed.
 */
export async function parseFeed(xml) {
  const tree = read(String(xml || "").replace(/^﻿/, ""));
  const channel = find(tree, "channel")[0] || find(tree, "feed")[0] || null;
  let items = find(tree, "item");
  if (!items.length) items = find(tree, "entry");
  const feedTitle = channel ? clean(textOf(kid(channel, "title"))) : "";
  if (!items.length && !feedTitle) throw new Error("This doesn't look like a podcast RSS feed.");

  const feedImage = channel ? imageOf(channel) : null;
  const linkNode = channel && (kids(channel, "link").find((l) => !l.attrs.rel || l.attrs.rel === "alternate") || null);
  const out = {
    title: feedTitle || "Untitled podcast",
    description: channel ? clean(textOf(kid(channel, "description", "itunes:subtitle", "subtitle", "itunes:summary"))) : "",
    link: linkNode ? clean(textOf(linkNode)) || linkNode.attrs.href || null : null,
    image: feedImage,
    episodes: [],
  };
  const seen = new Set();
  for (const item of items) {
    const audio = findAudio(item);
    if (!audio) continue;
    const [audioUrl, mime] = audio;
    const title = clean(textOf(kid(item, "title"))) || "Untitled episode";
    let guid = (textOf(kid(item, "guid", "id")).trim() || audioUrl || clean(textOf(kid(item, "link")))).trim();
    if (seen.has(guid)) { // sloppy feeds repeat ids: tell them apart by the sound file
      guid = `${guid}#${(await sha1Hex(audioUrl)).slice(0, 10)}`;
      if (seen.has(guid)) continue;
    }
    seen.add(guid);
    out.episodes.push({
      guid, title, audio_url: audioUrl, audio_type: mime,
      description: clean(textOf(kid(item, "description", "itunes:summary", "summary", "itunes:subtitle"))).slice(0, 4000),
      published: parseDate(textOf(kid(item, "pubdate", "published", "dc:date", "updated"))),
      duration: parseDuration(textOf(kid(item, "itunes:duration"))),
      image: imageOf(item) || feedImage,
    });
  }
  return out;
}

/**
 * The library records for the episodes of a freshly read feed that the phone doesn't have yet.
 * @param {{uid: string, auto_transcribe?: number}} feed the podcast
 * @param {object[]} episodes what parseFeed returned
 * @param {string[]} uids each episode's id (episodeUid of the feed's id and the episode's guid)
 * @param {Set<string>} known ids already in the library for this podcast (deleted ones included)
 * @param {number} t the time now, in seconds
 */
export function newEpisodeRecords(feed, episodes, uids, known, t) {
  // New episodes of a podcast set to "auto-transcribe" are queued for the computer, as they
  // would be if the computer had found them first. Not on the first read of a podcast, which
  // would queue everything it ever published.
  const queue = known.size > 0 && !!feed.auto_transcribe;
  const seen = new Set(known);
  const out = [];
  episodes.forEach((ep, i) => {
    const uid = uids[i];
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    out.push({
      uid, feed_uid: feed.uid, guid: ep.guid, title: String(ep.title || "").slice(0, 500),
      description: String(ep.description || "").slice(0, 1500), published: ep.published ?? null, duration: ep.duration ?? null,
      image: ep.image || null, audio_url: ep.audio_url, audio_type: ep.audio_type || null, transcript_rev: null, model: null,
      transcribe_requested_at: queue ? t : null, remote_audio: 0, deleted: 0, created_at: t, updated_at: t,
    });
  });
  return out;
}
