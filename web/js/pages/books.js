// Books: Tamkeen's free shelf of famous public-domain books in the language being learned, and
// a way to add your own (EPUB, PDF, TXT, AZW3, Word). Opened from the Library's "Books" section
// and the + button. The books themselves live in "My books" (books.js).

import { api, esc, h, toast } from "../app.js";
import { icon } from "../icons.js";
import { langInfo, studyLanguage } from "../languages.js";
import { BOOK_FILES, addFromFile, addFromShelf, shelfFor, shelfGuid } from "../books.js";

const yearText = (y) => (y < 0 ? `${-y} BC` : y < 1000 ? `${y} AD` : String(y));

/** Pick a file and add it as a book. Must be called from a tap (browsers only open the file
 *  picker then). Resolves once the book is added (or the picker was closed). */
export function uploadBook(lang = studyLanguage()) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: BOOK_FILES });
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      const note = h(`<div class="toast"><span>Adding “${esc(file.name)}”…</span></div>`);
      document.getElementById("toasts").append(note);
      try {
        const ep = await addFromFile(file, lang, (step) => { note.firstChild.textContent = step; });
        toast(`Added “${ep.title}” to My books.`);
        location.hash = `#/episode/${ep.id}`;
        resolve(ep);
      } catch (err) {
        toast(err.message || "Couldn't read that file.", { error: true });
        resolve(null);
      } finally {
        note.remove();
      }
    };
    input.click();
  });
}

export async function render(view) {
  const lang = studyLanguage();
  const name = langInfo(lang).name || lang;
  view.append(h(`
    <div class="page books-page">
      <div class="disc-head">
        <a class="btn ghost" href="#/library?show=books" title="Back to the library">←</a>
        <div class="meta">
          <h1>${icon("book", 26)} Books in ${esc(name)}</h1>
          <div class="small muted">Famous books, free because they are in the public domain. Add one and read it a page at a time,
            with every word clickable. Or add a book of your own.</div>
        </div>
      </div>
      <div class="card row books-upload" style="gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px"><strong>Your own book</strong>
          <div class="small muted">EPUB, PDF, TXT, Kindle AZW3 or Word, without DRM. It is read on this device and added to My books.</div></div>
        <button type="button" class="primary" id="upload">${icon("plus", 16)} Add a file</button>
      </div>
      <div class="books-grid" id="shelf"><p class="muted">Loading the shelf…</p></div>
    </div>`));
  view.querySelector("#upload").onclick = () => uploadBook(lang);
  const grid = view.querySelector("#shelf");

  let shelf;
  let mine = new Map();
  try {
    const feeds = await api("/feeds");
    const feed = feeds.find((f) => f.url === "local:books");
    const [books, list] = await Promise.all([
      shelfFor(lang),
      feed ? api(`/episodes?${new URLSearchParams({ feed_id: feed.id, limit: 500 })}`) : Promise.resolve({ episodes: [] }),
    ]);
    shelf = books;
    mine = new Map((list.episodes || list.items || []).map((ep) => [ep.guid, ep]));
  } catch (err) {
    grid.innerHTML = `<div class="card"><p class="muted"></p></div>`;
    grid.querySelector("p").textContent = err.message;
    return;
  }
  if (!shelf.length) { grid.innerHTML = `<p class="muted">No free books for ${esc(name)} yet.</p>`; return; }
  grid.innerHTML = "";
  for (const row of shelf) {
    const have = mine.get(shelfGuid(lang, row));
    // Reading time at a learner's pace: about 600 letters a minute (250 characters in Japanese and Chinese).
    const mins = Math.max(1, Math.round(row.chars / (lang === "ja" || lang === "zh" ? 250 : 600)));
    const size = row.bytes >= 1e6 ? `${(row.bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(row.bytes / 1e3))} KB`;
    const card = h(`<div class="card book-card">
      <div class="book-cover" aria-hidden="true">${icon("book", 28)}</div>
      <div class="book-info">
        <div class="book-title" ${langInfo(lang).dir === "rtl" ? 'dir="rtl"' : 'dir="auto"'}></div>
        <div class="small" dir="auto"></div>
        <div class="small muted book-blurb"></div>
        <div class="small muted">${esc(yearText(row.year))} · about ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} of reading · ${size}</div>
      </div>
      <div class="book-act"></div>
    </div>`);
    card.querySelector(".book-title").textContent = row.title;
    card.querySelectorAll(".small")[0].textContent = row.author;
    card.querySelector(".book-blurb").textContent = row.blurb;
    const act = card.querySelector(".book-act");
    if (have) {
      act.append(h(`<a class="btn primary" href="#/episode/${have.id}">Read</a>`));
    } else {
      const b = h(`<button type="button">${icon("plus", 16)} Add</button>`);
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = "Adding…";
        try {
          const ep = await addFromShelf(lang, row);
          act.innerHTML = "";
          act.append(h(`<a class="btn primary" href="#/episode/${ep.id}">Read</a>`));
          toast(`Added “${row.title}” to My books.`);
        } catch (err) {
          b.disabled = false;
          b.textContent = "Try again";
          toast(err.message, { error: true });
        }
      };
      act.append(b);
    }
    grid.append(card);
  }
}
