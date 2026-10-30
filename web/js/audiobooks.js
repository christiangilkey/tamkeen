// Audiobooks: LibriVox's free public-domain audiobooks (librivox.org) in the language being learned.
// Shared by the desktop app, the phones and the web app.
//
// The catalogue (which books there are, by language and category) is made by tools/build_audiobooks.py
// from LibriVox's own list and published with the website in docs/audiobooks: one small file per
// language, so finding "poetry in Arabic" needs no request to LibriVox at all (its API has no language
// filter and asks for few, slow requests). Adding a book subscribes to the book's chapter feed,
// https://librivox.org/rss/<id>, exactly as a podcast is added: its chapters become episodes, which are
// transcribed, played, looked up in and saved from like any podcast episode. What differs is kept to a
// few rules below (and their Python twins in app/audiobooks.py): which feeds are audiobooks, a tidy title,
// and chapters listed in order (a podcast's newest episode comes first; a book starts at chapter 1).
//
// The pure part (no fetching, no page) is tested in tests/js/audiobooks.test.mjs.

export const LIBRIVOX = "https://librivox.org/";
export const AUDIOBOOKS_BASE = "https://christiangilkey.github.io/tamkeen/audiobooks/";
const SITE_HOST = "christiangilkey.github.io";
const COVER_BASE = "https://archive.org/download/";

/** The categories, in the order offered (keys as in tools/build_audiobooks.py), each with a line icon. */
export const CATEGORIES = [
  { key: "fiction", label: "Fiction", icon: "book" },
  { key: "mystery", label: "Mystery & crime", icon: "key" },
  { key: "fantasy", label: "Fantasy & science fiction", icon: "planet" },
  { key: "short", label: "Short stories", icon: "stories" },
  { key: "children", label: "Children's", icon: "kids" },
  { key: "myths", label: "Myths & fairy tales", icon: "wand" },
  { key: "poetry", label: "Poetry", icon: "feather" },
  { key: "plays", label: "Plays", icon: "mask" },
  { key: "history", label: "History", icon: "landmark" },
  { key: "biography", label: "Lives & letters", icon: "person" },
  { key: "religion", label: "Religion", icon: "candle" },
  { key: "philosophy", label: "Philosophy", icon: "bulb" },
  { key: "science", label: "Science & nature", icon: "science" },
  { key: "nonfiction", label: "Non-fiction", icon: "news" },
];
export const ALL = "all";
export const categoryOf = (key) => CATEGORIES.find((c) => c.key === key) || { key: ALL, label: "All audiobooks", icon: "audiobook" };

// ----- which feeds are audiobooks -----

/** A LibriVox book's chapter feed (what is stored as the "podcast"'s address). */
export const rssFor = (id) => `${LIBRIVOX}rss/${Number(id)}`;
/** True for a LibriVox chapter feed: such a "podcast" is an audiobook. */
export const isAudiobookFeed = (url) => /^https?:\/\/(www\.)?librivox\.org\/rss\/\d+\/?$/i.test(String(url || "").trim());
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
 * Comedy by Dante Alighieri": the article back in front, no life dates (nothing in brackets after the name). The same as tidy_title in
 * app/audiobooks.py (both devices write it; they must agree, or each sync would change it back).
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
const fileName = (url) => String(url || "").split(/[?#]/)[0].split("/").pop();
/**
 * Chapter order. LibriVox names each chapter's file with its number ("divinecomedy_longfellow_01_dante_64kb.mp3"),
 * so the file names in natural order (2 before 10) are the chapters in order; the title decides a tie.
 */
export function chapterCompare(a, b) {
  const cmp = (x, y) => (collator ? collator.compare(x, y) : x < y ? -1 : x > y ? 1 : 0);
  return cmp(fileName(a.audio_url), fileName(b.audio_url)) || cmp(String(a.title || ""), String(b.title || ""));
}

// ----- the catalogue -----

/** A catalogue row as a book: {id, title, author, secs, chapters, cats: [keys], cover (an address or "")}. */
export function bookFromRow(row) {
  const [id, title, author, secs, chapters, cats, cover] = row;
  const c = String(cover || "");
  return { id: Number(id), title: String(title || ""), author: String(author || ""), secs: Number(secs) || 0,
           chapters: Number(chapters) || 0, cats: Array.isArray(cats) ? cats : [], cover: !c ? "" : c.startsWith("https://") ? c : COVER_BASE + c };
}

/** Text as compared when searching: lower case, without accents or vowel marks. */
export function searchKey(text) {
  return String(text || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[ـ]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The books in a category (ALL for every one) whose title or author has every word searched for. */
export function booksIn(books, category = ALL, query = "") {
  const words = searchKey(query).split(" ").filter(Boolean);
  return books.filter((b) => (category === ALL || b.cats.includes(category))
    && (!words.length || words.every((w) => searchKey(`${b.title} ${b.author}`).includes(w))));
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
 * The catalogue for one language: {lang, made, categories: [[key, count]], books: [book]} (no books when
 * LibriVox has none in it). `where`: {platform, host, base}, as catalogueUrl takes. Kept once loaded.
 */
export function loadCatalogue(lang, where = {}) {
  if (!loaded.has(lang)) {
    loaded.set(lang, (async () => {
      const index = JSON.parse(new TextDecoder().decode(await fetchBytes("index.json", where)));
      const entry = index.languages && index.languages[lang];
      if (!entry) return { lang, made: index.made || "", categories: [], books: [] };
      const packed = await fetchBytes(entry.file, where);
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
      const data = JSON.parse(await new Response(stream).text());
      return { lang, made: data.made || index.made || "", categories: data.categories || [], books: (data.books || []).map(bookFromRow) };
    })().catch((err) => { loaded.delete(lang); throw err; }));
  }
  return loaded.get(lang);
}
