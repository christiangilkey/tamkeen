// The Library's "Web page" screen (Library → + → Web page, route #/sites), one screen on every
// version: from top to bottom, a box to paste an article's address and import it; the user's saved
// sites, with "Add a site" for any page of their own and × to take one off; and news sites in the
// language being learned (browser-home.js NEWS).
//
// Tapping a site opens it the way that version opens sites: the app's own browser on the computer
// and the phones (its round teal button imports the article on screen), a new tab in the web app.
// The web app passes its own extras (its words under the heading, the Paste button and the round
// import button): see mobile/src/js/web-sites.js.
//
// Saved sites are the same list as the browser's star (browser-sites.js; app/pages.py on the
// computer), asked of /browser/sites, so they travel between devices by Drive sync and show on the
// browser's start page too.

import { api, esc, h, on, openBrowser, toast } from "../app.js";
import { newsFor } from "../browser-home.js";
import { shortAddress, typedSite } from "../browser-sites.js";
import { openModal } from "../components/modal.js";
import { icon } from "../icons.js";
import { langInfo, studyLanguage } from "../languages.js";
import { importUrl } from "../pageimport.js";
import { importVideo, videoId as youTubeId } from "../youtube.js";

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
// The site's own small picture, from Google's icon service (as on the browser's start page); the
// first letter of its name shows until (or unless) it loads.
const favicon = (url) => `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host(url))}`;
const nameOf = (site) => site.title || host(site.url);

export function render(view) {
  return renderSites(view);
}

/**
 * Draw the screen into `view`. `web`: the web app's extras, {notes: [html], after(page, input)}:
 * `notes` replace the line under the heading, and `after` adds that version's own buttons once
 * the screen is there. With `web`, sites (and Google searches) open in a new tab.
 * Resolves, once the saved sites are shown, to the clean-up for when the screen is left.
 */
export async function renderSites(view, { web = null } = {}) {
  const lang = studyLanguage();
  const name = langInfo(lang).name || "";
  const news = newsFor(lang);
  const notes = web ? web.notes || []
    : ["Open a site, find an article, then press the <strong>round teal button</strong> at the bottom right to read it with every word clickable."];
  view.innerHTML = `<div class="page sites-page">
    <div class="disc-head">
      <a class="btn ghost" href="#/library" title="Back to the library">←</a>
      <div class="meta"><h1>Read the web in ${esc(name)}</h1>
        ${notes.map((n) => `<div class="small muted">${n}</div>`).join("")}</div>
    </div>
    <form class="card sites-import">
      <input type="text" inputmode="url" placeholder="Paste a website address" aria-label="Website address" autocomplete="off" required>
      <button class="primary" type="submit">Import</button>
    </form>
    <form class="sites-search" role="search">
      <input type="search" placeholder="Search Google" aria-label="Search Google" dir="auto" autocomplete="off" required>
      <button type="submit">${icon("search", 18)} Search</button>
    </form>
    <section class="sites-sec">
      <div class="sites-sec-head"><h2>Your saved sites</h2>
        <button type="button" class="sites-add">${icon("plus", 18)} Add a site</button></div>
      <div class="sites-grid sites-saved"></div>
      <p class="small muted sites-empty" hidden>Nothing saved yet. Add any page you like, to open it in one tap.</p>
    </section>
    ${news.length ? `<section class="sites-sec">
      <div class="sites-sec-head"><h2>News in ${esc(name)}</h2></div>
      <div class="sites-grid sites-news"></div>
    </section>` : ""}
  </div>`;
  const page = view.querySelector(".sites-page");
  const importForm = page.querySelector(".sites-import");
  const input = importForm.querySelector("input");
  let saved = [];

  /** One site's tile: a link (so it can also be opened the usual ways), plus × on a saved one. */
  function tile(site, { saved: isSaved = false, note = "", easy = false } = {}) {
    const title = nameOf(site);
    const el = h(`<div class="site-tile${isSaved ? " saved" : ""}">
      <a href="${esc(site.url)}" ${web ? `target="_blank" rel="noopener noreferrer"` : `rel="noreferrer"`}>
        <span class="site-ico">${esc([...title][0] || "")}</span>
        <span class="site-txt"><strong class="site-name"><bdi dir="auto">${esc(title)}</bdi></strong>
          <span class="site-note">${easy ? `<span class="site-easy">Easier</span> ` : ""}<span${isSaved ? ` dir="ltr" translate="no"` : ""}>${esc(note)}</span></span></span>
      </a>
      ${isSaved ? `<button type="button" class="ghost icon site-rm" title="Take this site off your saved sites"
        aria-label="Take ${esc(title)} off your saved sites">${icon("close", 16)}</button>` : ""}
    </div>`);
    el.dataset.url = site.url;
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.onload = () => img.classList.add("on");
    img.onerror = () => img.remove();
    img.src = favicon(site.url);
    el.querySelector(".site-ico").append(img);
    return el;
  }

  function paintSaved() {
    if (!page.isConnected) return;
    page.querySelector(".sites-saved").replaceChildren(...saved.map((s) => tile(s, { saved: true, note: shortAddress(s.url) })));
    page.querySelector(".sites-empty").hidden = saved.length > 0;
  }
  async function loadSaved() {
    try { saved = (await api("/browser/sites")).sites || []; } catch (err) { console.warn("Couldn't read the saved sites", err); }
    paintSaved();
  }
  /** Save a site ({url, title}) or (on false) take it off; the screen shows the list that comes back. */
  async function setSaved(site, on) {
    saved = (await api("/browser/sites", { method: "POST", body: { url: site.url, title: site.title || "", on } })).sites || [];
    paintSaved();
  }

  const newsGrid = page.querySelector(".sites-news");
  if (newsGrid) newsGrid.append(...news.map((s) => tile({ url: s.url, title: s.name }, { note: s.note.replace(/^Easier:?\s*/, ""), easy: s.easy })));

  // Tapping a site: the app's own browser (the web app's links open their new tab by themselves).
  page.addEventListener("click", (e) => {
    const rm = e.target.closest(".site-rm");
    if (rm) {
      e.preventDefault();
      takeOff(rm.closest(".site-tile").dataset.url);
      return;
    }
    const link = e.target.closest(".site-tile a");
    if (!link || web) return;
    e.preventDefault();
    openBrowser(link.closest(".site-tile").dataset.url).catch((err) => toast(err.message || "Couldn't open the browser.", { error: true }));
  });

  async function takeOff(url) {
    const site = saved.find((s) => s.url === url);
    if (!site) return;
    try {
      await setSaved(site, false);
      toast(`Took “${nameOf(site)}” off your saved sites.`, {
        action: { label: "Undo", run: () => setSaved(site, true).catch((err) => toast(err.message, { error: true })) },
      });
    } catch (err) {
      toast(err.message || "Couldn't change your saved sites.", { error: true });
    }
  }

  page.querySelector(".sites-add").onclick = () => addSite(typedSite(input.value) ? input.value.trim() : "");

  /** The "Add a site" box: an address and, if the user likes, the name to show. */
  function addSite(address) {
    const box = openModal({ title: "Add a site" });
    box.el.querySelector(".modal-box").classList.add("sites-add-box");
    box.body.innerHTML = `<form class="sites-add-form">
        <label><span>Address</span>
          <input type="text" inputmode="url" class="sa-url" placeholder="example.com/news" autocomplete="off" required></label>
        <label><span>Name (optional)</span>
          <input type="text" class="sa-name" autocomplete="off" dir="auto" maxlength="120"></label>
        <p class="small sites-add-error" role="alert" hidden></p>
        <div class="confirm-buttons"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Add</button></div>
      </form>`;
    const form = box.body.querySelector("form");
    const url = form.querySelector(".sa-url");
    const label = form.querySelector(".sa-name");
    const error = form.querySelector(".sites-add-error");
    url.value = address;
    (address ? label : url).focus();
    url.oninput = () => { error.hidden = true; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const site = typedSite(url.value, label.value);
      if (!site) {
        error.textContent = "That isn't a web address. Type one like example.com/news";
        error.hidden = false;
        url.focus();
        return;
      }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await setSaved(site, true);
        box.close();
        toast(`Added “${nameOf(site)}” to your saved sites.`);
      } catch (err) {
        error.textContent = err.message || "Couldn't change your saved sites.";
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    };
  }

  // Importing what was pasted: an article (or a YouTube link, added as a video), then reading it.
  importForm.onsubmit = async (e) => {
    e.preventDefault();
    const address = input.value.trim();
    const button = importForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Importing…";
    try {
      if (youTubeId(address)) {
        const ep = await importVideo(address);
        toast(`Added “${ep.title}” with ${ep.auto ? "YouTube's automatic captions" : "its captions"}.`);
        location.hash = `#/episode/${ep.id}`;
        return;
      }
      const ep = await importUrl(address);
      toast(`Imported “${ep.title}”.`);
      location.hash = `#/episode/${ep.id}`;
    } catch (err) {
      // Some sites only show their text to a browser: open it in the app's own one, where the round
      // teal button reads the page as shown. (The web app has no browser of its own.)
      const site = web ? null : typedSite(address);
      toast(err.message || "Couldn't import that page.", { error: true, ...(site ? {
        action: { label: "Open", run: () => openBrowser(site.url).catch((e2) => toast(e2.message, { error: true })) },
        timeout: 9000,
      } : {}) });
    } finally {
      button.disabled = false;
      button.textContent = "Import";
    }
  };

  // Searching Google: in the app's own browser (a new tab in the web app).
  const searchForm = page.querySelector(".sites-search");
  searchForm.onsubmit = (e) => {
    e.preventDefault();
    const words = searchForm.querySelector("input").value.trim();
    if (!words) return;
    const address = `https://www.google.com/search?q=${encodeURIComponent(words)}`;
    if (web) window.open(address, "_blank", "noopener");
    else openBrowser(address).catch((err) => toast(err.message || "Couldn't open the browser.", { error: true }));
  };

  if (web && web.after) web.after(page, input);

  // A site saved meanwhile somewhere else shows at once: with the star in the browser's bar (the
  // phone says so with "browser_sites"; the computer's browser is its own window, so the list is
  // asked again when this one is back in front) or by sync from another device.
  const again = () => { if (page.isConnected && !document.hidden) loadSaved(); };
  const offSites = on("browser_sites", again);
  const offSync = on("sync", again);
  window.addEventListener("focus", again);
  document.addEventListener("visibilitychange", again);
  await loadSaved();
  return () => {
    offSites();
    offSync();
    window.removeEventListener("focus", again);
    document.removeEventListener("visibilitychange", again);
  };
}
