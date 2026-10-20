// The web app's "Popular websites" page, in place of the apps' built-in web browser (a web page
// can't hold other sites with an Import Page button). The same sites as the browser's start page
// (browser-home.js), opened in a new tab; the learner copies an article's address there and comes
// back to the round teal import button (or pastes it in the box), or shares the article to Tamkeen
// from Chrome's menu when the web app is installed on an Android phone (web-import.js).

import { esc, toast } from "./app.js";
import { newsFor } from "./browser-home.js";
import { savedSites } from "./browser-sites.js";
import { langInfo } from "./languages.js";
import { importUrl } from "./pageimport.js";
import { importButton } from "./web-import.js";
import { device } from "./web-install.js";
import { settings } from "./store.js";

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const favicon = (url) => `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host(url))}`;

function tile({ name, url, note = "", easy = false }) {
  return `<a class="card web-site" href="${esc(url)}" target="_blank" rel="noopener noreferrer"
      style="display:flex;align-items:center;gap:10px;padding:10px;min-width:0;text-decoration:none;color:inherit">
    <img src="${esc(favicon(url))}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer"
      style="flex:none;border-radius:8px" onerror="this.style.visibility='hidden'">
    <span style="min-width:0">
      <strong dir="auto" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</strong>
      <span class="small muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${easy ? "Easier · " : ""}${esc(note.replace(/^Easier:?\s*/, "") || host(url))}</span>
    </span></a>`;
}

export async function render(view) {
  const lang = settings.study_language || "ar";
  const name = langInfo(lang).name || "";
  const saved = savedSites(settings.browser_sites).map((s) => ({ name: s.title || host(s.url), url: s.url }));
  const news = newsFor(lang);
  view.innerHTML = `<div class="page stack">
    <div class="disc-head">
      <a class="btn ghost" href="#/library" title="Back to the library">←</a>
      <div class="meta"><h1>Read the web in ${esc(name)}</h1>
        <div class="small muted">Open a site (it opens in a new tab), find an article and copy its address, then come back and tap the round teal button.</div>
        ${device().os === "android" ? `<div class="small muted">With Tamkeen added to your home screen you can also share the article straight to Tamkeen: in Chrome tap ⋮, then Share, then Tamkeen.</div>` : ""}</div>
    </div>
    <form class="card row web-import" style="gap:8px">
      <input type="url" inputmode="url" placeholder="Paste an article's address" aria-label="Article address" style="flex:1;min-width:0" required>
      <button type="button" class="ghost web-paste">Paste</button>
      <button class="primary" type="submit">Import</button>
    </form>
    <form class="row web-search" style="gap:8px" action="https://www.google.com/search" method="get" target="_blank">
      <input type="search" name="q" placeholder="Search Google" aria-label="Search Google" dir="auto" style="flex:1;min-width:0" required>
      <button type="submit">Search</button>
    </form>
    ${saved.length ? `<h2 style="margin-bottom:0">Your saved sites</h2>
      <div class="web-sites" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">${saved.map(tile).join("")}</div>` : ""}
    ${news.length ? `<h2 style="margin-bottom:0">News in ${esc(name)}</h2>
      <div class="web-sites" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">${news.map(tile).join("")}</div>` : ""}
  </div>`;
  const form = view.querySelector(".web-import");
  const input = form.querySelector("input");
  const page = view.querySelector(".page");
  page.append(importButton(input)); // bottom right, like the browsers' import button
  page.style.paddingBottom = "96px"; // the last sites never sit under it
  view.querySelector(".web-paste").onclick = async () => {
    try { input.value = (await navigator.clipboard.readText()).trim(); input.focus(); }
    catch { toast("Your browser didn't allow pasting from here. Long-press the box and choose Paste.", { error: true }); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Importing…";
    try {
      const ep = await importUrl(input.value.trim());
      toast(`Imported “${ep.title}”.`);
      location.hash = `#/episode/${ep.id}`;
    } catch (err) {
      toast(err.message || "Couldn't import that page.", { error: true });
      button.disabled = false;
      button.textContent = "Import";
    }
  };
}
