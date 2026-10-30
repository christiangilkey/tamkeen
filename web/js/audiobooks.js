// Audiobooks: LibriVox's free public-domain audiobooks (librivox.org) in the language being learned, and
// audiobook files of the learner's own. Shared by the desktop app, the phones and the web app.
//
// The LibriVox catalogue (which books there are, per language) is made by tools/build_audiobooks.py from
// LibriVox's own list and published with the website in docs/audiobooks: one small file per language, so
// finding the books in Arabic needs no request to LibriVox at all (its API has no language filter and asks
// for few, slow requests). Adding one subscribes to the book's chapter feed, https://librivox.org/rss/<id>,
// exactly as a podcast is added: its chapters become episodes, transcribed, played, looked up in and saved
// from like any podcast episode.
//
// An audiobook of the learner's own (files bought DRM-free, say from Libro.fm) is a list of its own,
// "local:audiobook:<key>", whose episodes are the files, uploaded like "My audio" files (one file a chapter,
// in file-name order). Audible's .aax/.aa files are copy-protected and refused (the owner's rule: nothing
// that breaks a service's terms).
//
// What differs from a podcast is kept to a few rules below (and their Python twins in app/audiobooks.py):
// which lists are audiobooks, a tidy title, and chapters listed in order (a podcast's newest episode comes
// first; a book starts at chapter 1). The pure part is tested in tests/js/audiobooks.test.mjs.

export const LIBRIVOX = "https://librivox.org/";
export const LIBRO_FM = "https://libro.fm/";
export const AUDIOBOOKS_BASE = "https://christiangilkey.github.io/tamkeen/audiobooks/";
const SITE_HOST = "christiangilkey.github.io";
const COVER_BASE = "https://archive.org/download/";

// ----- which lists are audiobooks -----

/** A LibriVox book's chapter feed (what is stored as the "podcast"'s address). */
export const rssFor = (id) => `${LIBRIVOX}rss/${Number(id)}`;
/** True for a LibriVox chapter feed. */
export const isLibrivoxFeed = (url) => /^https?:\/\/(www\.)?librivox\.org\/rss\/\d+\/?$/i.test(String(url || "").trim());
/** An audiobook of the learner's own files: its list's address. */
export const OWN_BOOK_PREFIX = "local:audiobook:";
export const isOwnBookFeed = (url) => String(url || "").startsWith(OWN_BOOK_PREFIX);
/** True for an audiobook, from LibriVox or the learner's own files. */
export const isAudiobookFeed = (url) => isLibrivoxFeed(url) || isOwnBookFeed(url);
/** The LibriVox book id in a chapter feed's address (or null). */
export function librivoxIdOf(url) {
  const m = /librivox\.org\/rss\/(\d+)/i.exec(String(url || ""));
  return m ? Number(m[1]) : null;
}

// ----- a book's title -----

// Articles LibriVox moves to the end ("Divine Comedy, The"), put back in front.
const ARTICLES = /^(.+), (The|A|An|La|Le|Les|L'|El|Los|Las|Lo|Il|Gli|I|Der|Die|Das|Den|Het|De|O|Os|As|Un|Una|Une)$/;
/**
 * LibriVox's feed title, "Divine Comedy, The by Dante Alighieri (1265 - 1321)", tidied to "The Divine
 * Comedy by Dante Alighieri": the article back in front, no life dates (nothing in brackets after the name).
 * The same as tidy_title in app/audiobooks.py (both devices write it; they must agree, or each sync would
 * change it back).
 */
export function tidyTitle(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  const cut = text.lastIndexOf(" by ");
  let title = cut > 0 ? text.slice(0, cut) : text;
  let author = cut > 0 ? text.slice(cut + 4) : "";
  author = author.replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ").trim();
  const m = ARTICLES.exec(title.trim());
  if (m) title = m[2].endsWith("'") ? `${m[2]}${m[1]}` : `${m[2]} ${m[1]}`;
  title = title.trim();
  return author ? `${title} by ${author}` : title;
}

/** A tidied title back in its parts: {title, author} ("" when there is no " by "). */
export function splitTitle(full) {
  const text = String(full || "").trim();
  const cut = text.lastIndexOf(" by ");
  return cut > 0 ? { title: text.slice(0, cut), author: text.slice(cut + 4) } : { title: text, author: "" };
}

// ----- chapters in order -----

const collator = typeof Intl !== "undefined" ? new Intl.Collator("en", { numeric: true, sensitivity: "base" }) : null;
const natural = (x, y) => {
  const a = String(x ?? ""), b = String(y ?? "");
  return collator ? collator.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;
};
const fileName = (url) => String(url || "").split(/[?#]/)[0].split("/").pop();
/**
 * A LibriVox book's chapter order. LibriVox names each chapter's file with its number
 * ("divinecomedy_longfellow_01_dante_64kb.mp3"), so the file names in natural order (2 before 10) are the
 * chapters in order; the title decides a tie.
 */
export function chapterCompare(a, b) {
  return natural(fileName(a.audio_url), fileName(b.audio_url)) || natural(a.title, b.title);
}
/** The learner's own book: its chapters are its files, named after them, in file-name order. */
export const titleCompare = (a, b) => natural(a.title, b.title) || (a.created_at || 0) - (b.created_at || 0);
/** How the chapters of the book whose list is at `url` are ordered. */
export const chapterOrder = (url) => (isOwnBookFeed(url) ? titleCompare : chapterCompare);

// ----- audiobook files of the learner's own -----

/** The audio files the app takes, everywhere, and their types (the same as app/videos.py AUDIO_TYPES).
 *  .m4b is the usual DRM-free audiobook file. (The computer turns WMA, AMR and AIFF, which its player and
 *  Android's can't play, into Opus when they are added there.) */
export const AUDIO_TYPES = {
  ".m4b": "audio/mp4", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
  ".oga": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac", ".wav": "audio/wav", ".wma": "audio/x-ms-wma",
  ".amr": "audio/amr", ".webm": "audio/webm", ".mka": "audio/x-matroska", ".aiff": "audio/aiff", ".aif": "audio/aiff",
};
export const AUDIO_FILE_EXTENSIONS = Object.keys(AUDIO_TYPES);
export const AUDIO_FILE_ACCEPT = `audio/*,${AUDIO_FILE_EXTENSIONS.join(",")}`;
const extOf = (name) => (/\.[^./\\]+$/.exec(String(name || "")) || [""])[0].toLowerCase();
export const isAudioFileName = (name) => AUDIO_FILE_EXTENSIONS.includes(extOf(name));
/** Audible's copy-protected files: refused, with AUDIBLE_MESSAGE. */
export const isAudibleFile = (name) => [".aax", ".aa", ".aaxc"].includes(extOf(name));
export const AUDIBLE_MESSAGE = "Audible files (.aax) are copy-protected and can't be opened. DRM-free shops like Libro.fm sell files that work.";

/** Files in file-name order (2 before 10): the order their chapters come in. */
export const inNameOrder = (files) => [...files].sort((a, b) => natural(a.name, b.name));

const PART_WORD = /^(part|chapter|chap|ch|track|disc|disk|cd|book|vol|volume|section|kapitel|capitulo|capítulo|chapitre|parte|teil)$/i;
/**
 * A book's title from its files' names: the one file's name, or the words all the names start with
 * ("Moby Dick - Part 01.mp3", "Moby Dick - Part 02.mp3" → "Moby Dick"); underscores become spaces.
 */
export function guessBookTitle(names) {
  const bare = names.map((n) => String(n || "").replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!bare.length) return "";
  const trimEnd = (s) => s.replace(/[\s\-–—.,:;([{#]+$/, "").trim();
  if (bare.length === 1) return bare[0];
  // The whole words every name starts with.
  const words = bare.map((n) => n.split(" "));
  const shared = [];
  for (let i = 0; i < words[0].length; i++) {
    const w = words[0][i];
    if (!words.every((ws) => (ws[i] || "").toLowerCase() === w.toLowerCase())) break;
    shared.push(w);
  }
  // Drop a trailing "Part"-like word or dash ("Moby Dick - Part" → "Moby Dick"; a number stays: "Harry Potter 1").
  while (shared.length && (PART_WORD.test(trimEnd(shared[shared.length - 1])) || /^[\s\-–—.,:;([{#]*$/.test(shared[shared.length - 1]))) shared.pop();
  const common = trimEnd(shared.join(" "));
  if (common.length >= 2) return common;
  return trimEnd(bare[0].replace(/\d+\s*$/, "")) || bare[0];
}

// ----- the LibriVox catalogue -----

/** A catalogue row as a book: {id, title, author, secs, chapters, cover (an address or "")}. */
export function bookFromRow(row) {
  const [id, title, author, secs, chapters, cover] = row;
  const c = String(cover || "");
  return { id: Number(id), title: String(title || ""), author: String(author || ""), secs: Number(secs) || 0,
           chapters: Number(chapters) || 0, cover: !c ? "" : c.startsWith("https://") ? c : COVER_BASE + c };
}

/** Text as compared when searching: lower case, without accents or vowel marks. */
export function searchKey(text) {
  return String(text || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[ـ]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The books whose title or author has every word searched for. */
export function booksIn(books, query = "") {
  const words = searchKey(query).split(" ").filter(Boolean);
  return !words.length ? books : books.filter((b) => words.every((w) => searchKey(`${b.title} ${b.author}`).includes(w)));
}

/** How long a book is, for its row: "12 h 23 min", "45 min". */
export function bookLength(secs) {
  const min = Math.max(1, Math.round((Number(secs) || 0) / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/**
 * Where catalogue file `name` ("index.json", "ar.json.gz") is fetched from: the computer asks its own
 * server (app/api/audiobooks.py: the repository's copy when running from source, else the published one,
 * kept); the web app, published on the same website, by its own path; the phones from the website.
 * `base` (localStorage "audiobooks_base") points a test build at files not published yet.
 */
export function catalogueUrl(name, { platform = "", host = "", base = "" } = {}) {
  if (base) return base + name;
  if (platform === "desktop") return `/api/audiobooks/${name}`;
  if (host === SITE_HOST) return `/tamkeen/audiobooks/${name}`;
  return AUDIOBOOKS_BASE + name;
}

async function fetchBytes(name, where) {
  let res;
  try { res = await fetch(catalogueUrl(name, where), { cache: "no-cache" }); } catch { res = null; }
  if (!res || !res.ok) throw new Error("Couldn't reach Tamkeen's list of audiobooks. Check your connection and try again.");
  return res.arrayBuffer();
}

const loaded = new Map();
/**
 * LibriVox's books in one language: {lang, made, books: [book]}, most popular first (no books when
 * LibriVox has none in it). `where`: {platform, host, base}, as catalogueUrl takes. Kept once loaded.
 */
export function loadCatalogue(lang, where = {}) {
  if (!loaded.has(lang)) {
    loaded.set(lang, (async () => {
      const index = JSON.parse(new TextDecoder().decode(await fetchBytes("index.json", where)));
      const entry = index.languages && index.languages[lang];
      if (!entry) return { lang, made: index.made || "", books: [] };
      const packed = await fetchBytes(entry.file, where);
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
      const data = JSON.parse(await new Response(stream).text());
      return { lang, made: data.made || index.made || "", books: (data.books || []).map(bookFromRow) };
    })().catch((err) => { loaded.delete(lang); throw err; }));
  }
  return loaded.get(lang);
}
