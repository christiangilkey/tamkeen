// The web app's YouTube page. The installed apps open YouTube in their own browser and catch the
// video tapped there; a web page can't, so here YouTube's list of videos (popular ones, a search,
// or a followed channel's videos) is read through the go-between server and shown inside Tamkeen.
// Tapping a video opens it with its captions as words, like on the phone. A video YouTube has no
// captions for gets a small tag once it is on screen (ytcaptiontag.js), and one YouTube also offers
// dubbed in the language being studied gets "Arabic track available" (its own sound is another language).

import { esc, toast, ytRequest } from "./app.js";
import { offerFix } from "./components/fixit.js";
import { aiKey } from "./define-service.js";
import { icon } from "./icons.js";
import { LANGUAGE_CODES, langInfo } from "./languages.js";
import { webFetch } from "./native.js";
import { lib, settings } from "./store.js";
import { checkCaptions } from "./ytcaptions.js";
import { DUB_TEXT, captionChecker, tagText } from "./ytcaptiontag.js";
import { t } from "./i18n.js";
import { MAX_PAGES, moreRequest, nextPage, pageSettings } from "./ytmore.js";
import { THIS_YEAR, TOPICS, TOPIC_WITHIN, chosenCountry, handmadeOnly, searchAddress, setHandmadeOnly, topicAddress, topicsFor } from "./youtube-home.js";

// ---------- the "No captions · Gemini required" tag ----------
// One checker per study language, kept while the app is open; its answers also last between visits
// (this browser's storage), so going back to a list doesn't ask YouTube again.
const STORE_KEY = "tamkeen-yt-captions";
const checkers = new Map();
function checkerFor(lang) {
  if (!checkers.has(lang)) {
    const store = {
      load: () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; } },
      save: (kept) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(kept)); } catch { /* memory only */ } },
    };
    checkers.set(lang, captionChecker({ scope: lang, store,
      check: (id) => checkCaptions(id, { language: lang, taught: LANGUAGE_CODES, request: ytRequest }) }));
  }
  return checkers.get(lang);
}

/** Videos already in the library with captions Gemini wrote: those open with them, so no tag. */
function geminiMade() {
  return new Set((lib.episodes || []).filter((e) => !e.deleted && e.model === "youtube-gemini").map((e) => String(e.guid)));
}

/** Check each card's video once it comes near the screen (a few at a time) and tag it when YouTube
 * has no captions for it, or a dubbed track in `lang`. `cards`: [[element, video id, tag element, dub tag]]. */
function tagCards(cards, lang) {
  const checker = checkerFor(lang);
  const made = geminiMade();
  const hasKey = !!aiKey("gemini");
  const dubText = t(DUB_TEXT, t(langInfo(lang).name));
  const show = (tag, id, result, dubTag) => {
    const text = tagText(result, { hasKey, made: made.has(id) });
    tag.textContent = text;
    tag.hidden = !text;
    dubTag.textContent = dubText;
    dubTag.hidden = !result.dub;
  };
  const byCard = new Map(cards.map((c) => [c[0], c]));
  const look = (card) => {
    const [, id, tag, dubTag] = byCard.get(card);
    checker.want(id).then((r) => { if (r) show(tag, id, r, dubTag); });
  };
  if (typeof IntersectionObserver === "undefined") { cards.slice(0, 6).forEach((c) => look(c[0])); return; }
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const [, id] = byCard.get(e.target);
      if (!e.isIntersecting) { checker.drop(id); continue; }
      const have = checker.known(id);
      if (have) { show(byCard.get(e.target)[2], id, have, byCard.get(e.target)[3]); seen.unobserve(e.target); continue; }
      look(e.target);
    }
  }, { rootMargin: "200px 0px" });
  cards.forEach((c) => seen.observe(c[0]));
}


/** The data YouTube puts in its pages ("ytInitialData"): a JSON object on the computer site,
 *  a JavaScript string holding that JSON (with \xNN escapes) on the phone site. */
export function initialData(html) {
  const at = String(html || "").search(/var ytInitialData = |window\["ytInitialData"\] = /);
  if (at < 0) return null;
  const rest = html.slice(html.indexOf("=", at) + 1).trimStart();
  try {
    if (rest[0] === "'") {
      const end = rest.indexOf("';", 1);
      const literal = rest.slice(1, end)
        .replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1")
        .replace(/\\'/g, "'")
        .replace(/(^|[^\\])"/g, '$1\\"');
      return JSON.parse(JSON.parse(`"${literal}"`));
    }
    const end = rest.indexOf(";</script>");
    return JSON.parse(rest.slice(0, end));
  } catch {
    return null;
  }
}

const runsText = (t) => (t ? (t.simpleText || (t.runs || []).map((r) => r.text).join("") || t.content || "") : "");
const lastThumb = (t) => { const list = (t && t.thumbnails) || []; return list.length ? list[Math.min(1, list.length - 1)].url : ""; };

/** The videos listed in YouTube's page data: [{id, title, channel, length, when, thumb}], no repeats. */
export function videosIn(data) {
  const out = new Map();
  const add = (v) => { if (v.id && /^[\w-]{11}$/.test(v.id) && v.title && !out.has(v.id)) out.set(v.id, v); };
  (function walk(o, depth) {
    if (!o || typeof o !== "object" || depth > 40) return;
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== "object") continue;
      if (k === "videoWithContextRenderer" || k === "videoRenderer" || k === "gridVideoRenderer" || k === "compactVideoRenderer") {
        const overlay = (v.thumbnailOverlays || []).map((x) => x.thumbnailOverlayTimeStatusRenderer).find(Boolean);
        add({ id: v.videoId, title: runsText(v.headline || v.title), channel: runsText(v.shortBylineText || v.ownerText || v.longBylineText),
              length: runsText(v.lengthText) || runsText(overlay && overlay.text), when: runsText(v.publishedTimeText),
              thumb: lastThumb(v.thumbnail) });
        continue;
      }
      if (k === "lockupViewModel" && v.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
        const meta = (v.metadata && v.metadata.lockupMetadataViewModel) || {};
        const image = (((v.contentImage || {}).thumbnailViewModel || {}).image || {}).sources || [];
        add({ id: v.contentId, title: runsText(meta.title), channel: "", length: "", when: "", thumb: (image[0] || {}).url || "" });
        continue;
      }
      walk(v, depth + 1);
    }
  })(data, 0);
  return [...out.values()];
}

const askIn = () => ({ "Accept-Language": `${settings.study_language || "en"},en;q=0.5` });

/** The first page: {videos, settings, next}: its videos, and what is needed to ask for the next ones (ytmore.js). */
async function fetchVideos(address) {
  const res = await webFetch(address, { headers: askIn() });
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new Error("Couldn't reach YouTube just now. Try again in a minute.");
  if (!res.ok) throw new Error(`YouTube answered with an error (${res.status}). Try again in a minute.`);
  const html = await res.text();
  const data = initialData(html);
  if (!data) throw new Error("YouTube's page couldn't be read. Try again in a minute.");
  return { videos: videosIn(data), settings: pageSettings(html), next: nextPage(data) };
}

/** The next page after `next`, as YouTube's own page asks for it while scrolling: {videos, next}. */
async function fetchMore(address, pageSet, next) {
  const ask = moreRequest(address, pageSet, next);
  if (!ask) return { videos: [], next: null };
  const res = await webFetch(ask.url, { method: "POST", headers: { ...askIn(), "Content-Type": "application/json" }, body: ask.body });
  if (!res.ok) throw new Error(String(res.status)); // (never shown: the list offers Try again)
  const data = await res.json();
  return { videos: videosIn(data), next: nextPage(data) };
}

const SITE = "https://m.youtube.com";

/** The page: `#/youtube` (popular videos for the language), `?topic=` one of youtube-home.js's
 *  TOPICS (the Library's YouTube menu opens here), `?q=` a search, `?u=` a YouTube address. */
export async function render(view, { query }) {
  const lang = settings.study_language || "";
  const q = query.get("q") || "";
  const given = query.get("u") || "";
  const topic = !q && !given ? TOPICS.find((t) => t.key === (query.get("topic") || "popular")) || TOPICS[0] : null;
  const handmade = handmadeOnly();
  const where = { mobile: true, country: chosenCountry(lang), handmade };
  const address = q ? searchAddress(lang, q, where)
    : /^https:\/\/(www\.|m\.)?youtube\.com\//.test(given) ? given.replace(/^https:\/\/(www\.)?youtube\.com/, SITE)
    : topicAddress(lang, topic.key, where);
  const name = langInfo(lang).name || "";
  view.innerHTML = `<div class="page stack">
    <form class="row web-yt-search" style="gap:8px">
      <input type="search" placeholder="Search YouTube" aria-label="Search YouTube" style="flex:1" value="${esc(q)}">
      <button class="primary" type="submit">Search</button>
    </form>
    ${topic ? `<div class="tabs web-yt-topics" style="flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:12px 0 0">${topicsFor(lang).map((t) =>
      `<button type="button" data-topic="${t.key}" class="${t.key === topic.key ? "active" : ""}" style="flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${icon(t.icon, 16)}<span>${esc(t.label.replace("{0}", name))}</span></button>`).join("")}</div>` : ""}
    <label class="row small" style="gap:8px;align-items:center"${given ? " hidden" : ""}>
      <input type="checkbox" class="web-yt-handmade"${handmade ? " checked" : ""}> Only videos with handmade subtitles</label>
    <p class="small muted" style="margin:8px 0 0">${q ? "" : given ? "This channel's videos." : topic.key === "popular" ? "Popular this week."
      : (topic.within || TOPIC_WITHIN[lang]) === THIS_YEAR ? "Most watched this year." : "Most watched this month."} Tap a video to watch it with its captions as words you can tap. It needs captions.</p>
    <div class="web-yt-list stack"><p class="muted">Loading videos…</p></div>
  </div>`;
  view.querySelectorAll(".web-yt-topics button").forEach((b) => {
    b.onclick = () => { location.hash = b.dataset.topic === "popular" ? "#/youtube" : `#/youtube?topic=${b.dataset.topic}`; };
  });
  view.querySelector(".web-yt-topics button.active")?.scrollIntoView({ block: "nearest", inline: "center" });
  const form = view.querySelector("form");
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = form.querySelector("input").value.trim();
    location.hash = text ? `#/youtube?q=${encodeURIComponent(text)}` : "#/youtube";
  };
  view.querySelector(".web-yt-handmade").onchange = (e) => { setHandmadeOnly(e.target.checked); render(view, { query }); };
  const list = view.querySelector(".web-yt-list");
  let first;
  try { first = await fetchVideos(address); } catch (e) {
    list.innerHTML = `<p class="muted"></p><button type="button">Try again</button>`;
    list.querySelector("p").textContent = e.message;
    list.querySelector("button").onclick = () => render(view, { query });
    return;
  }
  if (!first.videos.length) { list.innerHTML = `<p class="muted">No videos found.</p>`; return; }
  list.innerHTML = "";
  // A title in another script still starts beside the picture (an English title in the Arabic app, say), not at the far edge.
  const side = getComputedStyle(list).direction === "rtl" ? "right" : "left";
  const shown = new Set();
  /** One video's card (its picture, title, channel and when; the caption and dub tags filled in as it comes in sight). */
  function makeCard(v) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card web-yt-card";
    // The picture at the start of the row (the left; the right in right-to-left languages) at one width, the text in
    // the rest: a button centres what it holds, so each row's picture sat wherever its title's length put it (the
    // owner, 2026-11-21: "the thumbnail should be at the far left").
    card.style.cssText = "display:flex;justify-content:flex-start;gap:12px;align-items:flex-start;text-align:start;padding:10px;width:100%";
    card.innerHTML = `<span style="position:relative;flex:0 0 min(40%, 220px)">
        <img src="${esc(v.thumb)}" alt="" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;display:block">
        ${v.length ? `<span class="small" style="position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;padding:0 6px">${esc(v.length)}</span>` : ""}</span>
      <span class="stack" style="display:flex;flex-direction:column;gap:4px;flex:1 1 0;min-width:0;white-space:normal">
        <strong dir="auto" style="overflow-wrap:anywhere;text-align:${side}">${esc(v.title)}</strong>
        <span class="small muted" dir="auto" style="text-align:${side}">${esc([v.channel, v.when].filter(Boolean).join(" · "))}</span>
        <span class="tag web-yt-tag" hidden style="align-self:flex-start"></span>
        <span class="tag web-yt-dub" hidden style="align-self:flex-start" dir="auto"></span></span>`;
    card.onclick = async () => {
      if (card.disabled) return;
      card.disabled = true;
      toast("Getting captions…");
      try {
        const { watchVideo } = await import("./youtube.js");
        await watchVideo(v.id);
      } catch (e) {
        if (e && e.code === "blocked") {
          // YouTube refuses requests from the web app's go-between server (a data centre) for some
          // videos, music above all, whatever is asked; from the user's own connection they work.
          // (The fix popup's button: Settings → Get the app.)
          offerFix("getapp", { message: "YouTube blocks the web app for this video (it often does for music). It opens in the Tamkeen app on your phone or computer, which asks YouTube from your own connection." });
        } else if (!e.quiet) toast(e.message || "Couldn't open this video.", { error: true });
        card.disabled = false;
      }
    };
    return [card, v.id, card.querySelector(".web-yt-tag"), card.querySelector(".web-yt-dub")];
  }
  /** Adds the videos not shown yet, at the end of the list, and starts their caption checks. How many were new. */
  function addVideos(videos) {
    const cards = [];
    for (const v of videos) {
      if (shown.has(v.id)) continue;
      shown.add(v.id);
      const made = makeCard(v);
      list.insertBefore(made[0], more);
      cards.push(made);
    }
    if (lang && cards.length) tagCards(cards, lang);
    return cards.length;
  }

  // Endless scroll (the owner, 2026-11-25): near the end of the list the next page comes by itself, with "Loading
  // more…" while it does; when YouTube has no more, the list just ends with a quiet line.
  const more = document.createElement("p");
  more.className = "small muted web-yt-more";
  more.style.cssText = "text-align:center;margin:8px 0 16px";
  list.append(more);
  addVideos(first.videos);
  let next = first.next, pages = 0, busy = false;
  const end = () => { more.textContent = t("That's all for now."); watch.disconnect(); };
  async function loadMore() {
    if (busy || !list.isConnected) return;
    if (!next || pages >= MAX_PAGES) { end(); return; }
    busy = true;
    more.textContent = t("Loading more…");
    try {
      const page = await fetchMore(address, first.settings, next);
      pages += 1;
      next = page.next;
      // (a page of only videos already shown, or none: YouTube has nothing new to give)
      if (!addVideos(page.videos)) next = null;
      if (!next) end();
      else more.textContent = "";
    } catch {
      more.textContent = "";
      const again = document.createElement("button");
      again.type = "button";
      again.textContent = t("Couldn't load more. Try again");
      again.onclick = () => { again.remove(); loadMore(); };
      more.append(again);
    } finally {
      busy = false;
    }
    // (still near the end, on a tall screen: the next one at once)
    if (next && list.isConnected && more.getBoundingClientRect().top < innerHeight + 600) loadMore();
  }
  const watch = typeof IntersectionObserver === "undefined" ? { disconnect() {} }
    : new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: "600px 0px" });
  if (next) watch.observe && watch.observe(more);
  else end();
}
