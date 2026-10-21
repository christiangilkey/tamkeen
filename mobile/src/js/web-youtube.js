// The web app's YouTube page. The installed apps open YouTube in their own browser and catch the
// video tapped there; a web page can't, so here YouTube's list of videos (popular ones, a search,
// or a followed channel's videos) is read through the go-between server and shown inside Tamkeen.
// Tapping a video opens it with its captions as words, like on the phone.

import { esc, toast } from "./app.js";
import { icon } from "./icons.js";
import { langInfo } from "./languages.js";
import { webFetch } from "./native.js";
import { settings } from "./store.js";
import { THIS_YEAR, TOPICS, TOPIC_WITHIN, chosenCountry, handmadeOnly, searchAddress, setHandmadeOnly, topicAddress, topicsFor } from "./youtube-home.js";


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

async function fetchVideos(address) {
  const res = await webFetch(address, { headers: { "Accept-Language": `${settings.study_language || "en"},en;q=0.5` } });
  if (!res.ok) throw new Error(`YouTube answered with an error (${res.status}). Try again in a minute.`);
  const data = initialData(await res.text());
  if (!data) throw new Error("YouTube's page couldn't be read. Try again in a minute.");
  return videosIn(data);
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
    ${topic ? `<div class="tabs web-yt-topics" style="flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0">${topicsFor(lang).map((t) =>
      `<button type="button" data-topic="${t.key}" class="${t.key === topic.key ? "active" : ""}" style="flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${icon(t.icon, 16)}<span>${esc(t.label.replace("{0}", name))}</span></button>`).join("")}</div>` : ""}
    <label class="row small" style="gap:8px;align-items:center;margin:0"${given ? " hidden" : ""}>
      <input type="checkbox" class="web-yt-handmade"${handmade ? " checked" : ""}> Only videos with handmade subtitles</label>
    <p class="small muted" style="margin:0">${q ? "" : given ? "This channel's videos." : topic.key === "popular" ? "Popular this week."
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
  let videos;
  try { videos = await fetchVideos(address); } catch (e) {
    list.innerHTML = `<p class="muted"></p><button type="button">Try again</button>`;
    list.querySelector("p").textContent = e.message;
    list.querySelector("button").onclick = () => render(view, { query });
    return;
  }
  if (!videos.length) { list.innerHTML = `<p class="muted">No videos found.</p>`; return; }
  list.innerHTML = "";
  for (const v of videos) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card web-yt-card";
    card.style.cssText = "display:flex;gap:12px;align-items:flex-start;text-align:start;padding:10px;width:100%";
    card.innerHTML = `<span style="position:relative;flex:0 0 40%;max-width:220px">
        <img src="${esc(v.thumb)}" alt="" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;display:block">
        ${v.length ? `<span class="small" style="position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;padding:0 6px">${esc(v.length)}</span>` : ""}</span>
      <span class="stack" style="gap:4px;min-width:0">
        <strong dir="auto" style="overflow-wrap:anywhere">${esc(v.title)}</strong>
        <span class="small muted" dir="auto">${esc([v.channel, v.when].filter(Boolean).join(" · "))}</span></span>`;
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
          toast("YouTube blocks the web app for this video (it often does for music). It opens in the Tamkeen app on your phone or computer, which asks YouTube from your own connection.",
                { error: true, timeout: 12000, action: { label: "Get the app", run: () => (location.hash = "#/settings?s=apps&show=getapp") } });
        } else toast(e.message || "Couldn't open this video.", { error: true });
        card.disabled = false;
      }
    };
    list.append(card);
  }
}
