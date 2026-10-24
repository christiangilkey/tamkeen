// Books: Tamkeen's free shelf of public-domain classics in each language (docs/books, made by
// tools/build_books.py and served by GitHub Pages) and the learner's own files (bookfiles.js).
// Either way the book arrives here as headings and paragraphs and is stored like a web page, in
// "My books" (app/books.py on the computer, backend.js saveBook on the phone), then read a page at
// a time (pages/book.js). Shared by the desktop app, the phone and the web app.

import { api } from "./app.js";

const BASE_URL = "https://christiangilkey.github.io/tamkeen/books/";
export const BOOK_TYPE = "text/book";
export const isBook = (ep) => (ep && ep.audio_type) === BOOK_TYPE;
/** What the learner can upload, for the file picker. */
export const BOOK_FILES = ".epub,.pdf,.txt,.azw3,.azw,.mobi,.docx,.doc,.md,.htm,.html";

// (A different address can be set for testing a build before the files are published.)
function base() {
  try { return localStorage.getItem("books_base") || BASE_URL; } catch { return BASE_URL; }
}

async function fetchBytes(name) {
  let res;
  try { res = await fetch(base() + name, { cache: "no-cache" }); } catch { res = null; }
  if (!res || !res.ok) throw new Error("Couldn't reach Tamkeen's book shelf. Check your connection and try again.");
  return res.arrayBuffer();
}

async function sha256(buf) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let shelf = null;
/** The free shelf: {books: {lang: [{id, title, author, year, blurb, file, bytes, sha256, chars, source}]}}. */
export async function freeShelf() {
  if (!shelf) {
    shelf = fetchBytes("index.json").then((b) => JSON.parse(new TextDecoder().decode(b)))
      .catch((e) => { shelf = null; throw e; });
  }
  return shelf;
}

/** The free shelf's books for one language. */
export async function shelfFor(lang) {
  const index = await freeShelf();
  return (index.books && index.books[lang]) || [];
}

export const shelfGuid = (lang, row) => `book:${lang}/${row.id}`;

/** Download a book from the free shelf and put it in "My books". Resolves to the new episode. */
export async function addFromShelf(lang, row) {
  const packed = await fetchBytes(row.file);
  if ((await sha256(packed)) !== row.sha256) throw new Error("The book arrived damaged. Try again.");
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const book = JSON.parse(await new Response(stream).text());
  return api("/books", { method: "POST", body: {
    guid: shelfGuid(lang, row), title: book.title, author: book.author, lang, blocks: book.blocks, source: book.source,
  } });
}

/** Read an uploaded file (EPUB, PDF, TXT, AZW3, Word) and put it in "My books". `lang` is the
 *  language it is in (the one being learned). `onStep(text)` hears what is happening. */
export async function addFromFile(file, lang, onStep = () => {}) {
  const { readBookFile } = await import("./bookfiles.js");
  onStep("Reading the file…");
  const book = await readBookFile(file, onStep);
  if (!book.blocks.length) throw new Error("No text was found in that file. A scanned book (pictures of pages) has no text to read.");
  // Its own script says which language it is in where it can (Cyrillic, Arabic, kana, Chinese characters);
  // a book in Latin letters is taken to be in the language being learned.
  const { detectLanguage } = await import("./languages.js");
  const sample = book.blocks.slice(0, 80).map((b) => b.text).join(" ").slice(0, 4000);
  lang = detectLanguage(sample, lang) || lang;
  onStep("Saving…");
  return api("/books", { method: "POST", body: {
    guid: `file:${file.name}:${file.size}`.slice(0, 300), title: book.title || file.name.replace(/\.[^.]+$/, ""),
    author: book.author || "", lang, blocks: book.blocks, source: file.name,
  } });
}

// Splitting a book into pages: bookpages.js (no screen code there, so it is tested on its own).
export { pageOf, paginate, paginateBlocks } from "./bookpages.js";
