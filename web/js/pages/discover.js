// Trending podcasts in the language being studied, sorted into categories, each with a
// one-press "Add". The list comes from the Podcast Index (a free, open podcast directory).

import { api, esc, h, toast } from "../app.js";
import { icon } from "../icons.js";
import { langInfo, studyLanguage } from "../languages.js";
import { feedKey, groupByCategory, languageQuery } from "../trending.js";

const PREVIEW = 6; // podcasts shown per category until one category is chosen

export async function render(view, { query }) {
  const lang = studyLanguage();
  const name = langInfo(lang).name;
  view.append(h(`
    <div class="page discover">
      <div class="disc-head">
        <a class="btn ghost" href="#/library" title="Back to the library">←</a>
        <div class="meta">
          <h1>${icon("trending", 26)} Trending in ${esc(name)}</h1>
          <div class="small muted">Podcasts people are listening to right now. Press <strong>+ Add</strong> to put one in your library.</div>
        </div>
        <button type="button" class="ghost" id="disc-refresh" title="Load the list again">⟳ Refresh</button>
      </div>
      <div class="tabs disc-cats" id="disc-cats"></div>
      <div id="disc-body"><div class="empty"><span class="spinner"></span> Loading trending podcasts…</div></div>
      <p class="small muted disc-credit">Podcast data from <strong>Podcast Index</strong> (podcastindex.org).</p>
    </div>`));
  const $ = (sel) => view.querySelector(sel);
  const body = $("#disc-body");
  const chips = $("#disc-cats");
  let groups = [];
  let chosen = query.get("cat") || "";
  const mine = new Set();   // feeds already in the library
  const adding = new Set(); // feeds being added right now

  function card(feed) {
    const key = feedKey(feed.url);
    const el = h(`<div class="disc-card" data-key="${esc(key)}">
      ${feed.image ? `<img src="${esc(feed.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph">${icon("podcast", 26)}</div>`}
      <div class="info">
        <div class="t" dir="auto"></div>
        <div class="a small muted" dir="auto"></div>
        <div class="d small muted" dir="auto"></div>
      </div>
      <button type="button" class="add"></button>
    </div>`);
    el.querySelector(".t").textContent = feed.title;
    el.querySelector(".a").textContent = feed.author || "";
    el.querySelector(".d").textContent = feed.description || "";
    el.querySelector("img")?.addEventListener("error", (e) => { e.target.replaceWith(h(`<div class="ph">${icon("podcast", 26)}</div>`)); });
    el._feed = feed;
    paint(el);
    el.querySelector(".add").onclick = () => add(feed);
    return el;
  }

  /** Set a card's button to match whether its podcast is in the library. */
  function paint(el) {
    const b = el.querySelector(".add");
    const key = el.dataset.key;
    const have = mine.has(key);
    b.disabled = have || adding.has(key);
    b.className = `add${have ? " done" : " primary"}`;
    b.textContent = have ? "✓ Added" : adding.has(key) ? "Adding…" : "+ Add";
  }
  // One podcast can sit under several categories: repaint every card of it.
  const repaint = (key) => body.querySelectorAll(".disc-card").forEach((el) => { if (el.dataset.key === key) paint(el); });

  async function add(feed) {
    const key = feedKey(feed.url);
    adding.add(key);
    repaint(key);
    try {
      const made = await api("/feeds", { method: "POST", body: {
        url: feed.url, title: feed.title, image: feed.image, description: feed.description } });
      mine.add(key);
      toast(`Added “${made.title || feed.title}” to your library.`, { action: { label: "Open", run: () => (location.hash = `#/feed/${made.id}`) } });
    } catch (e) {
      if (/already subscribed/i.test(e.message)) mine.add(key);
      else toast(`Couldn't add “${feed.title}”: ${e.message}`, { error: true });
    } finally {
      adding.delete(key);
      repaint(key);
    }
  }

  function show() {
    chips.innerHTML = "";
    const chip = (label, value, n) => {
      const b = h(`<button type="button" class="${value === chosen ? "active" : ""}"><span></span> <span class="n">${n}</span></button>`);
      b.firstChild.textContent = label;
      b.onclick = () => { chosen = value; show(); view.scrollTop = 0; };
      chips.append(b);
    };
    if (!groups.some((g) => g.name === chosen)) chosen = "";
    const total = new Set(groups.flatMap((g) => g.feeds.map((f) => feedKey(f.url)))).size;
    chip("All", "", total);
    for (const g of groups) chip(g.name, g.name, g.feeds.length);

    body.innerHTML = "";
    for (const g of chosen ? groups.filter((x) => x.name === chosen) : groups) {
      const section = h(`<section class="disc-cat"><h2><span></span> <span class="n">${g.feeds.length}</span></h2><div class="disc-grid"></div></section>`);
      section.querySelector("h2 span").textContent = g.name;
      const grid = section.querySelector(".disc-grid");
      const shown = chosen ? g.feeds : g.feeds.slice(0, PREVIEW);
      for (const feed of shown) grid.append(card(feed));
      if (shown.length < g.feeds.length) {
        const more = h(`<button type="button" class="ghost disc-more">Show all ${g.feeds.length} in ${esc(g.name)}</button>`);
        more.onclick = () => { chosen = g.name; show(); view.scrollTop = 0; };
        section.append(more);
      }
      body.append(section);
    }
  }

  function message(title, text) {
    chips.innerHTML = "";
    body.innerHTML = "";
    const el = h(`<div class="card disc-msg"><h2></h2><p class="muted"></p></div>`);
    el.querySelector("h2").textContent = title;
    el.querySelector("p").textContent = text;
    body.append(el);
  }

  async function load(fresh = false) {
    const btn = $("#disc-refresh");
    btn.disabled = true;
    try {
      const [data, feeds] = await Promise.all([
        api(`/discover/trending?lang=${encodeURIComponent(languageQuery(lang))}${fresh ? "&fresh=true" : ""}`),
        api("/feeds"),
      ]);
      mine.clear();
      for (const f of feeds) mine.add(feedKey(f.url));
      groups = groupByCategory(data.feeds);
      if (!groups.length) message(`Nothing trending in ${name} right now`, "The directory had no podcasts to suggest for this language. Try again later, or paste a podcast's RSS address in the Library.");
      else show();
    } catch (e) {
      message("Trending podcasts couldn't be loaded", e.message);
    } finally {
      btn.disabled = false;
    }
  }

  $("#disc-refresh").onclick = () => load(true);
  await load();
}
