// The + sheet's "Audiobook" step (audiobooks.js), for every language being learned:
//   - audiobook files of the learner's own: a button to choose them (several at once become one book, a
//     chapter each, in file-name order: the Library uploads them, see library.js addBookFiles), and a link
//     to Libro.fm, a shop that sells DRM-free audiobook files;
//   - LibriVox's free audiobooks in the language, most popular first: cover, title, author, length and
//     chapters, a search, and more at the end of the list; Add subscribes to the book's chapter feed like a
//     podcast, starts transcribing chapter 1 and opens the book in the Library. Where LibriVox has no books in
//     the language, a line says so.
// Also askBookTitle, the box that names a book made of the learner's files. Shared by the desktop app, the
// phones and the web app.

import { api, esc, h, platform, toast } from "../app.js";
import { icon } from "../icons.js";
import { AUDIO_FILE_ACCEPT, LIBRIVOX, LIBRO_FM, bookLength, booksIn, librivoxIdOf, loadCatalogue, rssFor, splitTitle } from "../audiobooks.js";
import { openModal } from "./modal.js";

const PAGE = 30;

function where() {
  let base = "";
  try { base = localStorage.getItem("audiobooks_base") || ""; } catch { /* storage off */ }
  return { platform, host: location.hostname, base };
}

/**
 * Fill `box` (the sheet's step) with the ways to add an audiobook in `lang` (named `langName`). `sheet` is
 * the open sheet (setTitle, close); `addFiles(files)` adds the chosen files as one book (library.js).
 */
export function audiobookStep(box, { sheet, lang, langName, addFiles }) {
  sheet.setTitle("Audiobooks");
  box.classList.add("ab-step");
  const mine = new Map(); // LibriVox book id → its feed id, for books already in the Library

  // ----- the learner's own files, and where to buy some -----
  const own = h(`<div class="ab-own">
      <span class="ab-own-text"><strong>Your own audiobook files</strong>
        <span class="small muted">MP3, M4B, M4A, AAC, OGG, Opus, FLAC, WAV and more. Several files become one book, a chapter each, in file-name order.</span></span>
      <button type="button" class="primary">${icon("plus", 16)} Add files</button>
    </div>`);
  own.querySelector("button").onclick = () => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: AUDIO_FILE_ACCEPT, multiple: true });
    input.onchange = () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      sheet.close();
      addFiles(files);
    };
    input.click(); // (still inside the tap, so the device lets the file chooser open)
  };
  const shop = h(`<p class="small muted aw-note ab-shop">Buy DRM-free audiobooks at <a target="_blank" rel="noopener">Libro.fm</a>, then add the file here.</p>`);
  shop.querySelector("a").href = LIBRO_FM;
  box.append(own, shop);

  // ----- LibriVox -----
  const free = h(`<div class="ab-free"><h3 class="ab-head2">Free from LibriVox</h3><p class="small muted aw-note">Loading the audiobooks…</p></div>`);
  box.append(free);
  const credit = () => {
    const p = h(`<p class="small muted aw-note ab-credit">Free public-domain recordings from <a target="_blank" rel="noopener">LibriVox</a>, read by volunteers.</p>`);
    p.querySelector("a").href = LIBRIVOX;
    return p;
  };
  Promise.all([loadCatalogue(lang, where()), api("/feeds").catch(() => [])]).then(([data, feeds]) => {
    for (const f of feeds) { const id = librivoxIdOf(f.url); if (id) mine.set(id, f.id); }
    if (!box.isConnected) return;
    if (!data.books.length) {
      free.lastElementChild.textContent = "LibriVox has no free audiobooks in this language yet.";
      return;
    }
    list(data.books, "");
  }).catch((err) => {
    free.lastElementChild.textContent = err.message;
  });

  /** LibriVox's books matching a search, a page at a time. */
  function list(books, query) {
    free.querySelectorAll(":scope > :not(.ab-head2)").forEach((el) => el.remove());
    const form = h(`<form class="aw-form" role="search">
        <input type="search" aria-label="Search audiobooks" dir="auto" autocomplete="off">
        <button type="submit">${icon("search", 18)} Search</button>
      </form>`);
    const input = form.querySelector("input");
    input.placeholder = `Search audiobooks in ${langName}`;
    input.value = query;
    form.onsubmit = (e) => { e.preventDefault(); list(books, input.value.trim()); };
    const found = booksIn(books, query);
    const count = h(`<p class="small muted ab-count"></p>`);
    count.textContent = !found.length ? `No audiobooks match “${query}”.` : found.length === 1 ? "1 audiobook" : `${found.length} audiobooks`;
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
    free.append(form, count, rows, more, credit());
    if (query) input.focus();
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

/**
 * Ask what to call a book made of `count` files (`guess`, from their names): resolves to the name, or null
 * if the learner cancels.
 */
export function askBookTitle(guess, count) {
  return new Promise((resolve) => {
    let answer = null;
    const box = openModal({ title: "Add audiobook", onClose: () => resolve(answer) });
    const form = h(`<form class="stack ab-name">
        <label class="stack"><span>Title</span><input type="text" dir="auto" maxlength="300"></label>
        <p class="small muted"></p>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button type="button" class="ghost">Cancel</button><button type="submit" class="primary">Add</button></div>
      </form>`);
    const input = form.querySelector("input");
    input.value = guess || "";
    form.querySelector("p").textContent = count === 1 ? "1 file, added as one chapter."
      : `${count} files, a chapter each, in file-name order.`;
    form.querySelector("button.ghost").onclick = () => box.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      answer = input.value.trim() || guess || "Audiobook";
      box.close();
    };
    box.body.append(form);
    setTimeout(() => { input.focus(); input.select(); }, 50);
  });
}
