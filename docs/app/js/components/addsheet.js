// The Library's "+" button opens this: every way of adding something, in one clean sheet, so the
// Library itself only shows what is already there. Shared by the desktop app and the phone.
//
// Each way opens the flow it always had: a podcast's feed address (or Trending), YouTube in the
// app's own browser, a web page's address (or the Web Browser), a video or audio file of your own,
// and Instagram reels.

import { api, esc, h, toast, openBrowser, openYouTube } from "../app.js";
import { icon } from "../icons.js";
import { langInfo, studyLanguage } from "../languages.js";
import { importUrl } from "../pageimport.js";
import { importVideo, videoId as youTubeId } from "../youtube.js";
import { COUNTRIES, chooseCountry, chosenCountry } from "../youtube-home.js";
import { openModal } from "./modal.js";

const WAYS = [
  { key: "podcast", label: "Podcast", icon: "podcast", text: "Paste a feed address, or choose from what's trending", step: true },
  { key: "youtube", label: "YouTube", icon: "video", text: "Find a video and watch it with clickable captions", step: true },
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
    if (key === "reels") {
      sheet.close();
      location.hash = "#/reels";
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
    else if (key === "book") bookStep(box);
    else pageStep(box);
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

  function youtubeStep(box) {
    box.append(h(`<button type="button" class="primary aw-wide" id="aw-open-youtube">${icon("video", 18)} Open YouTube</button>`));
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
    box.append(h(`<p class="small muted aw-note">Tap a video there and it opens here, with its captions as words you can click. The video needs captions.</p>`));
    box.querySelector("#aw-open-youtube").onclick = () => {
      sheet.close();
      openYouTube().catch((err) => toast(err.message, { error: true }));
    };
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

  function pageStep(box) {
    box.append(h(`<form class="aw-form">
        <input type="text" inputmode="url" placeholder="Paste a website address" required autocomplete="off" aria-label="Website address">
        <button class="primary" type="submit">Import</button>
      </form>`),
    h(`<div class="aw-or">or</div>`),
    ...(window.TAMKEEN_WEB === true // the web app has no browser of its own: popular sites to copy addresses from
      ? [h(`<button type="button" class="aw-wide">${icon("page", 18)} Popular websites</button>`),
         h(`<p class="small muted aw-note">News sites in the language you're learning. Open one, copy an article's address, and paste it above.</p>`)]
      : [h(`<button type="button" class="aw-wide">${icon("page", 18)} Open Web Browser</button>`),
         h(`<p class="small muted aw-note">Browse inside the app and press Import Page on anything you want to read.</p>`)]));
    const form = box.querySelector("form");
    const input = form.querySelector("input");
    form.onsubmit = (e) => {
      e.preventDefault();
      run(form.querySelector("button"), "Importing…", async () => {
        if (youTubeId(input.value)) { // a YouTube link: add it as a video and open it
          const ep = await importVideo(input.value);
          toast(`Added “${ep.title}” with ${ep.auto ? "YouTube's automatic captions" : "its captions"}.`);
          location.hash = `#/episode/${ep.id}`;
          return;
        }
        const ep = await importUrl(input.value);
        toast(`Imported “${ep.title}”.`, { action: { label: "Read", run: () => (location.hash = `#/episode/${ep.id}`) } });
        location.hash = `#/feed/${ep.feed_id}`;
      });
    };
    box.querySelector("button.aw-wide").onclick = () => {
      const typed = window.TAMKEEN_WEB === true ? "" : input.value.trim();
      sheet.close();
      openBrowser(typed).catch((err) => toast(err.message, { error: true }));
    };
  }

  list();
  return sheet;
}
