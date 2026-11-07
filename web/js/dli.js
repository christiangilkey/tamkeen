// DLI students (the Defense Language Institute): study material unlocked with a password, for the
// language the learner studies at DLI. The repository and the web app are public, so neither the
// password nor the material is in them in a form anyone can read:
// - A typed password is checked against a salted PBKDF2-SHA-256 hash (CHECK below), never against
//   the password itself.
// - The material is encrypted with AES-GCM (the files in web/dli/, made by tools/dli/encrypt.mjs from
//   a folder outside the repository). Its key is made from the password by PBKDF2 with a salt of its
//   own (KEY below), so the check hash says nothing about the key.
// Unlocking keeps that key (never the password) in the synced setting `dli_key`, so the learner's
// other devices are unlocked too (aikeys.js KEYS). Before hashing, a typed password loses its spaces
// and is put in capitals, so typing it in small letters or with spaces works too.
//
// Pure (no page): shared by the app (dlicontent.js, components/dlicard.js, components/dlipanel.js),
// the phone's backend.js (checkPayload), the packaging tool tools/dli/encrypt.mjs and
// tests/js/dli.test.mjs. It needs WebCrypto and (De)CompressionStream: browsers and Node 18+ have both.

/** The languages taught at DLI that a learner can choose, in the order the owner gave, with the app's codes. */
export const DLI_LANGUAGES = [["ar", "Arabic"], ["zh", "Chinese"], ["fa", "Farsi"], ["fr", "French"],
  ["ko", "Korean"], ["ru", "Russian"], ["es", "Spanish"]];
export const DLI_CODES = DLI_LANGUAGES.map(([code]) => code);
export const isDliLanguage = (code) => DLI_CODES.includes(code);
/** "Arabic" for "ar" (English: the page translates it), "" for anything else. */
export const dliLanguageName = (code) => (DLI_LANGUAGES.find(([c]) => c === code) || ["", ""])[1];

/** The password check: PBKDF2-SHA-256 of the normalised password with this salt. Made once by a script
 *  outside the repository; only the salt, the count and the result are here. */
export const CHECK = { salt: "XySThZcH9OZFe0U8l9zr3Q==", iterations: 310000, hash: "VXrI4iUHSVsnhSRJhnwsYTqDTdw84vkG//2SXVqo8tE=" };
/** The content key: PBKDF2-SHA-256 of the normalised password with another salt, 256 bits, for AES-GCM. */
export const KEY = { salt: "8uPAP5lOVBmpk+h0wRYYSg==", iterations: 310000 };
export const MIN_ITERATIONS = 200000;

/** What is hashed: no spaces anywhere, capital letters (NFKC first, so full-width letters count as letters). */
export function normalisePassword(text) {
  return String(text ?? "").normalize("NFKC").replace(/\s+/gu, "").toUpperCase();
}

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export function toBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(text) {
  const s = atob(String(text || ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** True when every byte is the same, looking at all of them whatever the first difference. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password, saltText, iterations, bits = 256) {
  const base = await subtle().importKey("raw", enc.encode(normalisePassword(password)), "PBKDF2", false, ["deriveBits"]);
  const out = await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltText), iterations }, base, bits);
  return new Uint8Array(out);
}

/** Are these check or key parameters well formed: a 16-byte salt, enough rounds, and (a check) a 32-byte hash? */
export function paramsOk(p, { hash = true } = {}) {
  try {
    if (!p || fromBase64(p.salt).length !== 16) return false;
    if (!Number.isInteger(p.iterations) || p.iterations < MIN_ITERATIONS) return false;
    return !hash || fromBase64(p.hash).length === 32;
  } catch {
    return false;
  }
}

/** The check for a password (made once, outside the repository; tests make their own). */
export async function makeCheck(password, { salt = toBase64(randomBytes(16)), iterations = KEY.iterations } = {}) {
  return { salt, iterations, hash: toBase64(await pbkdf2(password, salt, iterations)) };
}

/** Is this the password? Empty typing never is. */
export async function checkPassword(password, check = CHECK) {
  if (!normalisePassword(password) || !paramsOk(check)) return false;
  return sameBytes(await pbkdf2(password, check.salt, check.iterations), fromBase64(check.hash));
}

/** The content key the password makes (base64 of 32 bytes): what the setting dli_key keeps. */
export async function contentKey(password, key = KEY) {
  if (!paramsOk(key, { hash: false })) throw new Error("The DLI key settings are broken.");
  return toBase64(await pbkdf2(password, key.salt, key.iterations));
}

/** Does a setting look like a content key (base64 of 32 bytes)? */
export const isKeyText = (text) => /^[A-Za-z0-9+/]{43}=$/.test(String(text || ""));

async function aesKey(key) {
  if (key && typeof key === "object" && key.type === "secret") return key; // a CryptoKey already
  if (!isKeyText(key)) throw new Error("No DLI key.");
  return subtle().importKey("raw", fromBase64(key), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function squeeze(bytes, how) {
  const stream = new Blob([bytes]).stream().pipeThrough(how === "gzip" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// One encrypted file: [1: version][1: flags, 1 = gzipped before encrypting][12: IV][the rest: AES-GCM
// ciphertext and tag]. The first two bytes and the file's name (its id, or "index") are the
// "additional data" AES-GCM checks too, so a file can't be swapped for another or have its flags changed.
const VERSION = 1;
const GZIP = 1;
const aad = (head, name) => {
  const n = enc.encode(String(name || ""));
  const out = new Uint8Array(2 + n.length);
  out.set(head, 0);
  out.set(n, 2);
  return out;
};

/** Encrypt `bytes` (a Uint8Array) as the file named `name`; `gzip` squeezes it first (for text). */
export async function sealBytes(key, bytes, { name, gzip = false } = {}) {
  const k = await aesKey(key);
  const head = new Uint8Array([VERSION, gzip ? GZIP : 0]);
  const iv = randomBytes(12);
  const plain = gzip ? await squeeze(bytes, "gzip") : bytes;
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(head, name) }, k, plain));
  const out = new Uint8Array(2 + 12 + ct.length);
  out.set(head, 0);
  out.set(iv, 2);
  out.set(ct, 14);
  return out;
}

/** Decrypt a file made by sealBytes. Throws on the wrong key, a damaged file or another file's name. */
export async function openBytes(key, sealed, { name } = {}) {
  const b = sealed instanceof Uint8Array ? sealed : new Uint8Array(sealed);
  if (b.length < 14 + 16 || b[0] !== VERSION || (b[1] & ~GZIP)) throw new Error("This isn't a DLI file.");
  const k = await aesKey(key);
  const plain = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: b.subarray(2, 14), additionalData: aad(b.subarray(0, 2), name) },
    k, b.subarray(14)));
  return b[1] & GZIP ? squeeze(plain, "gunzip") : plain;
}

export const sealJson = (key, value, { name } = {}) => sealBytes(key, enc.encode(JSON.stringify(value)), { name, gzip: true });
export const openJson = async (key, sealed, { name } = {}) => JSON.parse(new TextDecoder().decode(await openBytes(key, sealed, { name })));

// ---------- the index: what there is, per DLI language ----------
// { v: 1, made: <seconds>, content: { ar: [item…], zh: [], … } }. An item is
//   { kind: "podcast", id, title, feed, episodes: [{ guid, audio, title, file, sha }] }  (a podcast; each
//     episode's transcript is the encrypted file `file`, in the sync's own format: app/sync/engine.py
//     transcript_payload), or
//   { kind: "file", id, title, name, type, size, group, sha }  (any other file: `id` is its encrypted file), or
//   { kind: "deck", id, title, short, words, chapters: [{ id, title, words, file, audio, voiced }] }  (a vocabulary
//     deck, tools/dli/DECKS.md: each chapter becomes a folder in the learner's Vocab tab. `file` is the chapter's
//     encrypted word list (chapterWords below), `audio` its encrypted audio bundle (readBundle), "" until it is voiced).
export const INDEX_NAME = "index";
const FILE_ID = /^[0-9a-f]{32}$/;
const ITEM_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CHAPTER_ID = /^c\d{3}$/;
const MAX_CHAPTERS = 400;
const line = (v, most) => String(v ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, most);
const webUrl = (v) => { const s = String(v || "").trim(); return /^https?:\/\/[^\s]+$/i.test(s) && s.length <= 1000 ? s : ""; };

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind === "podcast") {
    const feed = webUrl(raw.feed);
    if (!feed || !ITEM_ID.test(String(raw.id || ""))) return null;
    const episodes = (Array.isArray(raw.episodes) ? raw.episodes : []).map((e) => e && typeof e === "object" && FILE_ID.test(String(e.file || "")) ? {
      guid: line(e.guid, 500), audio: webUrl(e.audio), title: line(e.title, 300), file: e.file, sha: line(e.sha, 64) } : null)
      .filter((e) => e && (e.guid || e.audio));
    return { kind: "podcast", id: raw.id, title: line(raw.title, 200) || raw.id, feed, episodes };
  }
  if (raw.kind === "deck") {
    if (!ITEM_ID.test(String(raw.id || ""))) return null;
    const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).map((c) => c && typeof c === "object"
      && CHAPTER_ID.test(String(c.id || "")) && FILE_ID.test(String(c.file || "")) ? {
        id: c.id, title: line(c.title, 120) || c.id, words: Number.isInteger(c.words) && c.words >= 0 ? c.words : 0, file: c.file,
        audio: FILE_ID.test(String(c.audio || "")) ? c.audio : "", voiced: Number.isInteger(c.voiced) && c.voiced >= 0 ? c.voiced : 0,
        sha: line(c.sha, 64), audio_sha: line(c.audio_sha, 64) } : null)
      .filter(Boolean).slice(0, MAX_CHAPTERS);
    if (!chapters.length) return null;
    return { kind: "deck", id: raw.id, title: line(raw.title, 200) || raw.id, short: line(raw.short, 40) || "DLI",
             words: Number.isInteger(raw.words) && raw.words >= 0 ? raw.words : 0, chapters };
  }
  if (raw.kind === "file") {
    if (!FILE_ID.test(String(raw.id || ""))) return null;
    const name = line(raw.name, 200);
    return { kind: "file", id: raw.id, title: line(raw.title, 200) || name || "File", name, type: line(raw.type, 100) || "application/octet-stream",
             size: Number.isInteger(raw.size) && raw.size >= 0 ? raw.size : 0, group: line(raw.group, 200), sha: line(raw.sha, 64) };
  }
  return null;
}

/** The index as the app may use it: only the seven languages, only well-formed items. */
export function cleanIndex(raw) {
  const content = {};
  for (const code of DLI_CODES) {
    const list = raw && raw.content && Array.isArray(raw.content[code]) ? raw.content[code] : [];
    content[code] = list.map(cleanItem).filter(Boolean);
  }
  return { v: 1, made: Number.isFinite(raw && raw.made) ? raw.made : 0, content };
}
/** An index with nothing in it yet (every language "coming soon"). */
export const emptyIndex = () => cleanIndex({ made: 0 });
/** The learner's own language's items (none for a language that isn't taught here). */
export const contentFor = (index, code) => (index && index.content && isDliLanguage(code) ? index.content[code] || [] : []);

// ---------- the learner's DLI settings ----------
// dli_student "on" (ticked) or "", dli_language one of DLI_CODES or "", dli_key the content key or "",
// dli_added the podcasts already put in the learner's library once ("ar:arabic101 …"), so one they
// removed afterwards isn't added again. All four follow the learner to their other devices.

/** Where the learner stands: { student, language, key, unlocked, ready }. `ready`: content can show. */
export function dliState(s = {}) {
  const student = String((s && s.dli_student) || "") === "on";
  const language = isDliLanguage(s && s.dli_language) ? s.dli_language : "";
  const key = student && isKeyText(s && s.dli_key) ? s.dli_key : "";
  return { student, language, key, unlocked: !!key, ready: !!key && !!language };
}

/** The podcasts already added once, as "lang:id" names. */
export const addedList = (s = {}) => String((s && s.dli_added) || "").split(/\s+/).filter((x) => /^[a-z]{2,3}:[a-z0-9][a-z0-9_-]{0,63}$/.test(x));
export const addedName = (code, id) => `${code}:${id}`;
/** dli_added with one more podcast (unchanged if it is there already). */
export function withAdded(s, code, id) {
  const list = addedList(s);
  const name = addedName(code, id);
  return list.includes(name) ? list.join(" ") : [...list, name].join(" ");
}

// ---------- vocabulary decks ----------
// The learner's Vocab tab gets one folder per chapter ("DLI Arabic · Chapter 1 (Unit 1)") and each word one card,
// whose source says where it came from ("DLI Arabic · Chapter 1 (Unit 1) · word 209"), so the app can find it again
// (to give it its audio when that comes later). The synced setting dli_decks says which chapters were added
// once, by their place in the deck: "ar-basic:1-60,62 zh-basic:1-3" (a word the learner deleted isn't added again).

export const deckFolderName = (deck, chapter) => `${deck.short} · ${chapter.title}`.slice(0, 80);  // (a folder name is at most 80)
export const deckSource = (deck, chapter, n) => `${deck.short} · ${chapter.title} · word ${n}`.slice(0, 200);
/** The deck word a card came from (its number), or 0. */
export function deckWordOf(deck, card) {
  const src = String((card && (card.episode_title || card.source)) || "");
  if (!src.startsWith(`${deck.short} · `)) return 0;
  const m = / · word (\d{1,6})$/.exec(src);
  return m ? Number(m[1]) : 0;
}

/** "1-3,7" → Set {1, 2, 3, 7} (at most 1000 numbers). */
export function parseRanges(text) {
  const out = new Set();
  for (const part of String(text || "").split(",")) {
    const m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    for (let n = a; n <= b && n <= 1000 && out.size < 1000; n++) if (n > 0) out.add(n);
  }
  return out;
}
/** Set {1, 2, 3, 7} → "1-3,7". */
export function rangesText(numbers) {
  const ns = [...new Set(numbers)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    parts.push(i === j ? `${ns[i]}` : `${ns[i]}-${ns[j]}`);
    i = j;
  }
  return parts.join(",");
}
const deckEntries = (s) => String((s && s.dli_decks) || "").split(/\s+/).map((x) => /^([a-z0-9][a-z0-9_-]{0,63}):([\d,-]{1,1500})$/.exec(x)).filter(Boolean);
/** The chapters of deck `id` added once (their places, 1 = the first chapter). */
export function deckMarks(s, id) {
  const e = deckEntries(s).find((m) => m[1] === id);
  return e ? parseRanges(e[2]) : new Set();
}
/** dli_decks with these chapter places of deck `id` added. */
export function withDeckMarks(s, id, places) {
  const all = new Set([...deckMarks(s, id), ...places]);
  const rest = deckEntries(s).filter((m) => m[1] !== id).map((m) => m[0]);
  return [...rest, `${id}:${rangesText(all)}`].join(" ").slice(0, 2000);
}

/** A chapter's word list, opened (made by tools/dli/encrypt.mjs): { id, words: [{ n, text, meaning, notes, sentence,
 *  translation, in: [chapter ids] }] }, `in` being every chapter that has the word (its folders), the first one the
 *  chapter it is written in. A word written in another chapter is listed as { n, also: true }. Badly formed words go. */
export function chapterWords(raw) {
  const words = [];
  for (const w of (raw && Array.isArray(raw.words) ? raw.words : []).slice(0, 5000)) {
    if (!w || !Number.isInteger(w.n) || w.n < 1) continue;
    if (w.also) { words.push({ n: w.n, also: true }); continue; }
    const text = String(w.text ?? "").trim().slice(0, 200);
    if (!text) continue;
    const chapters = (Array.isArray(w.in) ? w.in : []).filter((c) => CHAPTER_ID.test(String(c))).slice(0, 20);
    words.push({ n: w.n, text, meaning: String(w.meaning ?? "").slice(0, 500), notes: String(w.notes ?? "").slice(0, 1000),
                 sentence: String(w.sentence ?? "").slice(0, 1000), translation: String(w.translation ?? "").slice(0, 1000), in: chapters });
  }
  return { id: String((raw && raw.id) || ""), words };
}

// A chapter's audio, one file: [4 bytes: the header's length, little-endian][the header, JSON: [{ n, at, size,
// times: { start, end, sent_start, sent_end } }]][each word's Ogg Opus file, one after another]. Encrypted like the rest.
/** Write a bundle (tools/dli/encrypt.mjs). `files`: [{ n, bytes, times }]. */
export function makeBundle(files) {
  let at = 0;
  const head = files.map((f) => { const e = { n: f.n, at, size: f.bytes.length, times: f.times }; at += f.bytes.length; return e; });
  const h = enc.encode(JSON.stringify(head));
  const out = new Uint8Array(4 + h.length + at);
  new DataView(out.buffer).setUint32(0, h.length, true);
  out.set(h, 4);
  let p = 4 + h.length;
  for (const f of files) { out.set(f.bytes, p); p += f.bytes.length; }
  return out;
}
const timeOk = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 600;
/** A bundle's files: Map n → { bytes (a view into `bytes`), times }. Anything that doesn't fit is left out. */
export function readBundle(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = new Map();
  if (b.length < 4) return out;
  const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, true);
  if (len > b.length - 4 || len > 2_000_000) return out;
  let head;
  try { head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + len))); } catch { return out; }
  const base = 4 + len;
  for (const e of Array.isArray(head) ? head : []) {
    const t = e && e.times;
    if (!e || !Number.isInteger(e.n) || !Number.isInteger(e.at) || !Number.isInteger(e.size) || e.at < 0 || e.size < 100
        || base + e.at + e.size > b.length || !t || !timeOk(t.start) || !timeOk(t.end) || t.end < t.start) continue;
    const sent = timeOk(t.sent_start) && timeOk(t.sent_end) && t.sent_end >= t.sent_start;
    out.set(e.n, { bytes: b.subarray(base + e.at, base + e.at + e.size),
                   times: { start: t.start, end: t.end, sent_start: sent ? t.sent_start : null, sent_end: sent ? t.sent_end : null } });
  }
  return out;
}

// ---------- a ready-made transcript, in the sync's own format ----------
// The twin of app/api/premade.py clean_payload (tests/test_premade.py runs both on the same cases):
// what app/sync/engine.py transcript_payload writes and store_transcript reads. Anything else is refused
// (null) or dropped (an optional part that doesn't fit).
const MAX_SEGMENTS = 20000;
const MAX_WORDS = 300000;
const num = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7;
const round3 = (v) => Math.round(v * 1000) / 1000;
const plainText = (v, most) => typeof v === "string" && v.length <= most && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);

export function checkPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { segments, words } = raw;
  if (!Array.isArray(segments) || !segments.length || segments.length > MAX_SEGMENTS) return null;
  if (!(typeof raw.rev === "number" && Number.isFinite(raw.rev) && raw.rev > 0)) return null;
  const segs = [];
  for (const s of segments) {
    if (!Array.isArray(s) || s.length !== 3 || !num(s[0]) || !num(s[1]) || !plainText(s[2], 5000)) return null;
    segs.push([round3(s[0]), round3(Math.max(s[0], s[1])), s[2]]);
  }
  if (!words || typeof words !== "object") return null;
  const n = Array.isArray(words.text) ? words.text.length : -1;
  if (n < 0 || n > MAX_WORDS || !["start", "end", "seg"].every((k) => Array.isArray(words[k]) && words[k].length === n)) return null;
  const w = { start: [], end: [], text: [], seg: [] };
  for (let i = 0; i < n; i++) {
    const [a, b, t, g] = [words.start[i], words.end[i], words.text[i], words.seg[i]];
    if (!num(a) || !num(b) || !plainText(t, 200) || !Number.isInteger(g) || g < 0 || g >= segs.length) return null;
    w.start.push(round3(a)); w.end.push(round3(Math.max(a, b))); w.text.push(t); w.seg.push(g);
  }
  const out = { format: Number.isInteger(raw.format) && raw.format >= 1 && raw.format <= 9 ? raw.format : 1, rev: raw.rev,
                model: plainText(raw.model, 80) && raw.model ? raw.model : "ready-made", segments: segs, words: w };
  if (Array.isArray(raw.kinds) && raw.kinds.length <= segs.length && raw.kinds.every((k) => k === null || plainText(k, 40))) out.kinds = raw.kinds;
  const v = raw.vowels;
  if (v && typeof v === "object" && Array.isArray(v.words) && v.words.length === n
      && v.words.every((x) => x === null || plainText(x, 400))) {
    out.vowels = { words: v.words, dialect: plainText(v.dialect, 40) ? v.dialect : "",
                   guess: Array.isArray(v.guess) ? v.guess.filter((g) => Number.isInteger(g) && g >= 0 && g < n).slice(0, n) : [],
                   model: plainText(v.model, 80) ? v.model : "" };
  }
  return out;
}
