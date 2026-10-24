// The Library's "+" button opens this: every way of adding something, in one clean sheet, so the
// Library itself only shows what is already there. Shared by the desktop app and the phone.
//
// Each way opens the flow it always had: a podcast's feed address (or Trending), YouTube in the
// app's own browser, the Web page screen (pages/websites.js, route #/sites: paste an address, your
// saved sites and news sites, all on one screen), a video or audio file of your own, and Instagram
// reels. Netflix and Spotify work with the Tamkeen browser extension (netflix.js, spotify.js).

import { api, esc, h, platform, toast, openNetflix, openYouTube, netflixSupport } from "../app.js";
import { icon } from "../icons.js";
import { langInfo, studyLanguage } from "../languages.js";
import { extensionLink, extensionStore, storeButtonText, unavailableText } from "../netflix.js";
import { SPOTIFY, spotifyReason, spotifyText } from "../spotify.js";
import { uiLanguage } from "../i18n.js";
import { COUNTRIES, chooseCountry, chosenCountry, handmadeOnly, searchAddress, setHandmadeOnly, topicAddress, topicsFor } from "../youtube-home.js";
import { openModal } from "./modal.js";

const WAYS = [
  { key: "podcast", label: "Podcast", icon: "podcast", text: "Paste a feed address, or choose from what's trending", step: true },
  { key: "youtube", label: "YouTube", icon: "video", text: "Pick a topic and watch with clickable captions", step: true },
  { key: "netflix", label: "Netflix", icon: "film", text: "Watch shows and films with their subtitles as words you can click", step: true },
  { key: "spotify", label: "Spotify", icon: "music", text: "Listen to songs with their lyrics as words you can click", step: true },
  { key: "page", label: "Web page", icon: "page", text: "Import an article to read with clickable words", step: true },
  { key: "book", label: "Book", icon: "book", text: "A free classic, or your own EPUB, PDF, TXT, Kindle or Word file", step: true },
  { key: "reels", label: "Reels", icon: "reel", text: "Short Instagram videos to watch on your phone" },
  { key: "video", label: "Video file", icon: "videofile", text: "A video of your own, from this device" },
  { key: "audio", label: "Audio file", icon: "audio", text: "A recording of your own, from this device" },
];

/**
 * Open the sheet. `pickFile("video" | "audio")` starts choosing a file of your own (the Library
 * handles the upload and shows its progress).
 */
export function openAddSheet({ pickFile }) {
  const sheet = openModal({ title: "Add to your library" });
  const { body } = sheet;
  sheet.el.querySelector(".modal-box").classList.add("add-sheet");
  const lang = studyLanguage();
  const langName = langInfo(lang).name;

  function list() {
    sheet.setTitle("Add to your library");
    body.innerHTML = "";
    const box = h(`<div class="add-ways"></div>`);
    for (const w of WAYS) {
      const b = h(`<button type="button" class="add-way" data-way="${w.key}">
        <span class="aw-ico">${icon(w.icon, 24)}</span>
        <span class="aw-text"><strong>${w.label}</strong><span>${esc(w.text)}</span></span>
        ${w.step ? `<span class="aw-go">${icon("chevron", 18)}</span>` : ""}</button>`);
      b.onclick = () => choose(w.key);
      box.append(b);
    }
    body.append(box);
  }

  function choose(key) {
    if (key === "video" || key === "audio") {
      sheet.close();
      pickFile(key); // still inside the tap, so the phone lets the file chooser open
      return;
    }
    if (key === "reels" || key === "page") { // a screen of its own: no step in between
      sheet.close();
      location.hash = key === "page" ? "#/sites" : "#/reels";
      return;
    }
    step(key);
  }

  /** One way's own small form, with a way back to the list. */
  function step(key) {
    const w = WAYS.find((x) => x.key === key);
    sheet.setTitle(w.label);
    body.innerHTML = "";
    const back = h(`<button type="button" class="ghost aw-back">‹ All the ways to add</button>`);
    back.onclick = list;
    body.append(back);
    const box = h(`<div class="aw-step"></div>`);
    body.append(box);
    if (key === "podcast") podcastStep(box);
    else if (key === "youtube") youtubeStep(box);
    else if (key === "netflix") netflixStep(box);
    else if (key === "spotify") spotifyStep(box);
    else bookStep(box);
    box.querySelector("input")?.focus();
  }

  /** A busy button while `work` runs; the sheet closes when it succeeds. */
  async function run(button, busyText, work) {
    const label = button.innerHTML;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await work();
      sheet.close();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  }

  function podcastStep(box) {
    box.append(h(`<form class="aw-form">
        <input type="url" placeholder="Paste a podcast's RSS feed address" required autocomplete="off" aria-label="Podcast RSS feed address">
        <button class="primary" type="submit">Add podcast</button>
      </form>`),
    h(`<div class="aw-or">or</div>`),
    h(`<a class="btn aw-wide" href="#/discover" title="Podcasts popular right now in the language you're studying, sorted by topic">
        ${icon("trending", 18)} Trending in ${esc(langName)}</a>`));
    box.querySelector("a").onclick = () => sheet.close();
    const form = box.querySelector("form");
    form.onsubmit = (e) => {
      e.preventDefault();
      run(form.querySelector("button"), "Adding…", async () => {
        const feed = await api("/feeds", { method: "POST", body: { url: form.querySelector("input").value } });
        toast(`Subscribed to ${feed.title}`);
        location.hash = `#/feed/${feed.id}`;
      });
    };
  }

  /** YouTube: a menu of topics (youtube-home.js TOPICS), each opening YouTube on the most-watched
   * videos about it in the language being learned; then the options every topic follows, and a
   * search for anything else. */
  function youtubeStep(box) {
    const web = window.TAMKEEN_WEB === true; // the web app lists YouTube's videos on its own page (#/youtube)
    const where = () => ({ mobile: platform !== "desktop", country: chosenCountry(lang), handmade: handmadeOnly() });
    const open = (address, hash) => {
      sheet.close();
      if (web) location.hash = hash;
      else openYouTube(address).catch((err) => toast(err.message, { error: true }));
    };
    const grid = h(`<div class="yt-topics"></div>`);
    for (const t of topicsFor(lang)) {
      const b = h(`<button type="button" class="yt-topic" data-topic="${t.key}">${icon(t.icon, 22)}<span></span></button>`);
      b.querySelector("span").textContent = t.label.replace("{0}", langName);
      b.onclick = () => open(topicAddress(lang, t.key, where()), t.key === "popular" ? "#/youtube" : `#/youtube?topic=${t.key}`);
      grid.append(b);
    }
    box.append(grid);
    const countries = COUNTRIES[lang] || [];
    if (countries.length > 1) {
      const row = h(`<label class="aw-country" title="Open YouTube starts on this week's most-watched videos from this country">
        <span class="muted">Popular in</span> <select></select></label>`);
      const pick = row.querySelector("select");
      for (const [code, name] of countries) pick.append(new Option(name, code));
      pick.value = chosenCountry(lang);
      pick.onchange = () => chooseCountry(lang, pick.value);
      box.append(row);
    }
    const handmade = h(`<label class="aw-country" title="Leaves out videos that only have YouTube's automatic captions, which are often wrong and have no punctuation">
        <input type="checkbox"> Only videos with handmade subtitles</label>`);
    const tick = handmade.querySelector("input");
    tick.checked = handmadeOnly();
    tick.onchange = () => setHandmadeOnly(tick.checked);
    box.append(handmade);
    // Anything else: YouTube's own search (with nothing typed, YouTube itself).
    const search = h(`<form class="aw-form" role="search">
        <input type="search" placeholder="Search YouTube" aria-label="Search YouTube" dir="auto" autocomplete="off">
        <button type="submit">${icon("search", 18)} Search</button>
      </form>`);
    search.onsubmit = (e) => {
      e.preventDefault();
      const words = search.querySelector("input").value.trim();
      open(searchAddress(lang, words, where()), words ? `#/youtube?q=${encodeURIComponent(words)}` : "#/youtube");
    };
    box.append(search);
    box.append(h(`<p class="small muted aw-note">Tap a video there and it opens here, with its captions as words you can click. The video needs captions.</p>`));
  }

  /** Netflix: on a Windows computer, a button that opens Netflix on its titles in the language
   * being learned (netflix.js); in the web app on a computer the same once the browser extension is
   * there (Netflix opens in a new tab), and before that where to get it; elsewhere, why it isn't there. */
  function netflixStep(box) {
    const wait = h(`<p class="small muted aw-note">Checking…</p>`);
    box.append(wait);
    netflixSupport().catch(() => ({ ok: false, reason: "" })).then(({ ok, reason, extension }) => {
      wait.remove();
      if (ok) {
        const open = h(`<button type="button" class="primary aw-wide">${icon("film", 18)} Open Netflix</button>`);
        open.onclick = () => {
          sheet.close();
          openNetflix().catch((err) => toast(err.message, { error: true }));
        };
        box.append(open, extension
          ? h(`<p class="small muted aw-note">Netflix opens in a new tab, on its titles in ${esc(langName)}. Sign in there with your own Netflix account and pick something to watch: Tamkeen's subtitle bar shows its ${esc(langName)} subtitles as words you can click. Words you save there come back here.</p>`)
          : h(`<p class="small muted aw-note">Netflix opens on its titles in ${esc(langName)}. Sign in there with your own Netflix account, then pick something to watch: it plays here, with its ${esc(langName)} subtitles as words you can click.</p>`));
        return;
      }
      if (reason === "web-computer") { // the web app on a computer: the extension is all it takes
        const { title, lines } = unavailableText(reason);
        const note = h(`<div class="aw-unavailable"><strong></strong><p></p><p class="small muted"></p></div>`);
        note.querySelector("strong").textContent = title;
        note.querySelectorAll("p")[0].textContent = lines[0];
        note.querySelectorAll("p")[1].textContent = lines[1];
        // In the Chrome Web Store (netflix.js CHROME_WEB_STORE_URL): "Add to Chrome", straight there;
        // until then the page that explains how to add it by hand.
        const store = extensionStore(navigator.userAgent);
        const get = store.url
          ? h(`<a class="btn primary aw-wide" target="_blank" rel="noopener">${icon("puzzle", 18)} <span></span></a>`)
          : h(`<a class="btn primary aw-wide" target="_blank" rel="noopener">${icon("puzzle", 18)} Get the Tamkeen extension</a>`);
        if (store.url) get.querySelector("span").textContent = storeButtonText(store.browser);
        get.href = extensionLink(navigator.userAgent, uiLanguage());
        box.append(note, get, h(`<p class="small muted aw-note">Once it is added, reload this page and choose Netflix again.</p>`));
        return;
      }
      const { title, lines } = unavailableText(reason);
      const note = h(`<div class="aw-unavailable"><strong></strong><p></p><p class="small muted"></p></div>`);
      note.querySelector("strong").textContent = title;
      note.querySelectorAll("p")[0].textContent = lines[0];
      note.querySelectorAll("p")[1].textContent = lines[1];
      box.append(note);
    });
  }

  /** The note for a version where something isn't available: a title and lines (netflix.js and
   * spotify.js say what). */
  function unavailableNote({ title, lines }) {
    const note = h(`<div class="aw-unavailable"><strong></strong></div>`);
    note.querySelector("strong").textContent = title;
    lines.forEach((line, k) => {
      const p = document.createElement("p");
      if (k) p.className = "small muted";
      p.textContent = line;
      note.append(p);
    });
    return note;
  }

  /** "Get the Tamkeen extension" (or, once it is in the Chrome Web Store, "Add to Chrome"/"Add to Edge"). */
  function getExtension() {
    const store = extensionStore(navigator.userAgent);
    const get = store.url
      ? h(`<a class="btn primary aw-wide" target="_blank" rel="noopener">${icon("puzzle", 18)} <span></span></a>`)
      : h(`<a class="btn primary aw-wide" target="_blank" rel="noopener">${icon("puzzle", 18)} Get the Tamkeen extension</a>`);
    if (store.url) get.querySelector("span").textContent = storeButtonText(store.browser);
    get.href = extensionLink(navigator.userAgent, uiLanguage());
    return get;
  }

  /** Spotify: in the web app on a computer with the browser extension, Spotify's web player in a new
   * tab, where the extension's lyrics panel shows the song's lyrics as words to click; without the
   * extension, where to get it; elsewhere, what is possible (spotify.js). */
  function spotifyStep(box) {
    const wait = h(`<p class="small muted aw-note">Checking…</p>`);
    box.append(wait);
    netflixSupport().catch(() => ({ ok: false, reason: "" })).then(({ reason, extension }) => {
      wait.remove();
      const why = spotifyReason({ platform, reason, extension });
      if (!why) {
        const open = h(`<a class="btn primary aw-wide" target="_blank" rel="noopener">${icon("music", 18)} Open Spotify</a>`);
        open.href = SPOTIFY;
        open.onclick = () => sheet.close();
        box.append(open, h(`<p class="small muted aw-note">Spotify opens in a new tab. Sign in there with your own Spotify account and play a song: Tamkeen's panel beside it shows its lyrics line by line, and you can click any word. Words you save there come back here.</p>`));
        return;
      }
      box.append(unavailableNote(spotifyText(why)));
      if (why === "web-computer") box.append(getExtension(), h(`<p class="small muted aw-note">Once it is added, reload this page and choose Spotify again.</p>`));
    });
  }

  function bookStep(box) {
    box.append(h(`<a class="btn primary aw-wide" href="#/books">${icon("book", 18)} Free classics</a>`),
      h(`<p class="small muted aw-note">Famous books in the language you're learning, free because they are in the public domain.</p>`),
      h(`<div class="aw-or">or</div>`),
      h(`<button type="button" class="aw-wide">${icon("plus", 18)} Add a book of your own</button>`),
      h(`<p class="small muted aw-note">EPUB, PDF, TXT, Kindle AZW3 or Word, without DRM.</p>`));
    box.querySelector("a.aw-wide").onclick = () => sheet.close();
    box.querySelector("button.aw-wide").onclick = async () => {
      sheet.close();
      (await import("../pages/books.js")).uploadBook();
    };
  }

  list();
  return sheet;
}
