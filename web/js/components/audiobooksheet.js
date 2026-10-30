// The + sheet's "Audiobook" step: LibriVox's free audiobooks in the language being learned (audiobooks.js).
// First the categories (with how many books each has, and a search), then a category's books: cover,
// title, author, length and chapters, a search, and more at the end of the list. Tapping Add subscribes to
// the book's chapter feed like a podcast, starts transcribing chapter 1 and opens the book in the Library.
// Shared by the desktop app, the phones and the web app.

import { api, esc, h, platform, toast } from "../app.js";
import { icon } from "../icons.js";
import { ALL, CATEGORIES, LIBRIVOX, bookLength, booksIn, categoryOf, librivoxIdOf, loadCatalogue, rssFor, splitTitle } from "../audiobooks.js";

const PAGE = 30;
// Fewer than this in a language, and the categories step says so.
const FEW = 20;

function where() {
  let base = "";
  try { base = localStorage.getItem("audiobooks_base") || ""; } catch { /* storage off */ }
  return { platform, host: location.hostname, base };
}

/**
 * Fill `box` (the sheet's step) with the audiobooks of `lang` (named `langName`). `sheet` is the open
 * sheet (setTitle, close); `back` the sheet's own "All the ways to add" button, hidden while a category
 * is open (that step has its own way back, to the categories).
 */
export function audiobookStep(box, { sheet, back, lang, langName }) {
  const wait = h(`<p class="small muted aw-note">Loading the audiobooks…</p>`);
  box.append(wait);
  let catalogue = null;
  let mine = new Map(); // LibriVox book id → its feed id, for books already in the Library
  Promise.all([loadCatalogue(lang, where()), api("/feeds").catch(() => [])]).then(([data, feeds]) => {
    catalogue = data;
    for (const f of feeds) { const id = librivoxIdOf(f.url); if (id) mine.set(id, f.id); }
    if (box.isConnected) categories();
  }).catch((err) => {
    wait.textContent = err.message;
  });

  const credit = () => {
    const p = h(`<p class="small muted aw-note ab-credit">Free public-domain recordings from <a target="_blank" rel="noopener">LibriVox</a>, read by volunteers.</p>`);
    p.querySelector("a").href = LIBRIVOX;
    return p;
  };
  const searchForm = (value, onSearch) => {
    const form = h(`<form class="aw-form" role="search">
        <input type="search" aria-label="Search audiobooks" dir="auto" autocomplete="off">
        <button type="submit">${icon("search", 18)} Search</button>
      </form>`);
    const input = form.querySelector("input");
    input.placeholder = `Search audiobooks in ${langName}`;
    input.value = value;
    form.onsubmit = (e) => { e.preventDefault(); onSearch(input.value.trim()); };
    return form;
  };

  /** Step 1: the categories that have books in this language, and a search over all of them. */
  function categories() {
    sheet.setTitle("Audiobooks");
    back.hidden = false;
    box.innerHTML = "";
    const books = catalogue.books;
    if (!books.length) {
      const none = h(`<div class="aw-unavailable"><strong></strong><p></p></div>`);
      none.querySelector("strong").textContent = `No audiobooks in ${langName} yet`;
      none.querySelector("p").textContent = `LibriVox, where these free audiobooks come from, has no finished recordings in ${langName} yet. Its volunteers finish new books every week, so look again another time. You can still add an audiobook file of your own (Audio file).`;
      box.append(none, credit());
      return;
    }
    box.append(searchForm("", (q) => list(ALL, q)));
    if (books.length < FEW) {
      box.append(h(`<p class="small muted aw-note">${books.length === 1 ? `LibriVox has only one audiobook in ${esc(langName)} so far.`
        : `LibriVox has only ${books.length} audiobooks in ${esc(langName)} so far.`}</p>`));
    }
    const counts = new Map(catalogue.categories);
    const grid = h(`<div class="ab-cats"></div>`);
    const tile = (c, n) => {
      const b = h(`<button type="button" class="ab-cat" data-cat="${c.key}">${icon(c.icon, 22)}
        <span class="ab-cat-name">${c.label}</span><span class="ab-cat-n">${n}</span></button>`);
      b.onclick = () => list(c.key, "");
      grid.append(b);
    };
    tile(categoryOf(ALL), books.length);
    for (const c of CATEGORIES) if (counts.get(c.key)) tile(c, counts.get(c.key));
    box.append(grid, credit());
  }

  /** Step 2: the books in a category (or all of them) matching a search, a page at a time. */
  function list(cat, query) {
    const c = categoryOf(cat);
    sheet.setTitle(c.label);
    back.hidden = true;
    box.innerHTML = "";
    const up = h(`<button type="button" class="ghost aw-back">‹ Categories</button>`);
    up.onclick = categories;
    box.append(up, searchForm(query, (q) => list(cat, q)));
    const found = booksIn(catalogue.books, cat, query);
    const count = h(`<p class="small muted ab-count"></p>`);
    count.textContent = !found.length ? (query ? `No audiobooks match “${query}”.` : "No audiobooks here yet.")
      : found.length === 1 ? "1 audiobook" : `${found.length} audiobooks`;
    const rows = h(`<div class="ab-list"></div>`);
    const more = h(`<button type="button" class="aw-wide ab-more">Show more</button>`);
    let shown = 0;
    const page = () => {
      for (const b of found.slice(shown, shown + PAGE)) rows.append(row(b));
      shown = Math.min(found.length, shown + PAGE);
      more.hidden = shown >= found.length;
    };
    more.onclick = page;
    page();
    box.append(count, rows, more, credit());
    box.closest(".modal-body")?.scrollTo?.({ top: 0 });
  }

  /** One book: cover, title, author, length and chapters, and Add (or Open once it is in the Library). */
  function row(b) {
    const el = h(`<div class="ab-book">
      ${b.cover ? `<img class="ab-cover" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ab-cover ph">${icon("audiobook", 22)}</span>`}
      <div class="ab-info">
        <div class="ab-title" dir="auto" translate="no"></div>
        <div class="ab-author small muted" dir="auto" translate="no"></div>
        <div class="small muted"><span class="ab-len"></span> · <span class="ab-ch"></span></div>
      </div>
      <span class="ab-act"></span></div>`);
    if (b.cover) el.querySelector("img").src = b.cover;
    el.querySelector(".ab-title").textContent = b.title;
    el.querySelector(".ab-author").textContent = b.author;
    el.querySelector(".ab-len").textContent = bookLength(b.secs);
    el.querySelector(".ab-ch").textContent = b.chapters === 1 ? "1 chapter" : `${b.chapters} chapters`;
    const act = el.querySelector(".ab-act");
    const feedId = mine.get(b.id);
    if (feedId) {
      const open = h(`<a class="btn ghost" href="#/feed/${esc(feedId)}">Open</a>`);
      open.onclick = () => sheet.close();
      act.append(open);
    } else {
      const add = h(`<button type="button" class="primary">Add</button>`);
      add.onclick = () => addBook(b, add);
      act.append(add);
    }
    return el;
  }

  async function addBook(b, button) {
    button.disabled = true;
    button.textContent = "Adding…";
    try {
      const name = b.author ? `${b.title} by ${b.author}` : b.title;
      const feed = await api("/feeds", { method: "POST", body: { url: rssFor(b.id), title: name, image: b.cover || "" } });
      mine.set(b.id, feed.id);
      // Chapter 1 is transcribed straight away, so the book can be played soon.
      let next = "now";
      try {
        const first = (await api(`/episodes?${new URLSearchParams({ feed_id: feed.id, limit: 1 })}`)).items[0];
        if (first) {
          const r = await api("/episodes/transcribe", { method: "POST", body: { ids: [first.id] } });
          if (!r.here && r.note) next = "computer"; // the phone without cloud transcription: the computer does it
        } else next = "later"; // the phone couldn't read the chapters yet: the computer fills them in
      } catch { next = ""; }
      sheet.close();
      const t = splitTitle(feed.title).title;
      toast(next === "now" ? `Added “${t}”. Its first chapter is being transcribed now.`
        : next === "computer" ? `Added “${t}”. Your computer will transcribe its first chapter the next time it syncs.`
        : next === "later" ? `Added “${t}”. Its chapters will appear in a moment.` : `Added “${t}”.`);
      location.hash = `#/feed/${feed.id}`;
    } catch (err) {
      toast(err.message, { error: true });
      button.disabled = false;
      button.textContent = "Add";
    }
  }
}
