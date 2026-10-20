// Library: feeds sidebar, episode list with live status, multi-select transcription.

import { api, esc, h, fmtDate, fmtDuration, on, toast, requestNotifications, uploadVideo, openYouTube, platform } from "../app.js";
import { icon } from "../icons.js";
import { studyLanguage } from "../languages.js";
import { allProgress } from "../progress.js";
import { isYouTube, loadFollows, unfollowChannel } from "../youtube.js";
import { channelAddress, followedChannels, smallImage } from "../ytfollow.js";
import { openAddSheet } from "../components/addsheet.js";
import { openModal } from "../components/modal.js";
import { mediaFromEpisode, sendButton } from "../components/sendmedia.js";
import { troubleshootButton } from "../components/troubleshoot.js";
import { firstVisitTour } from "../components/tour.js";

/** The phone (or web app) asked to transcribe Bisaya: only the computer can, with its Bisaya model
 *  (no cloud provider knows the language). The episodes are queued for the computer; this says so. */
export function computerOnlyNotice() {
  const box = openModal({ title: "Bisaya is transcribed on your computer" });
  box.body.append(h(`<div class="stack">
    <p>A phone can't write Bisaya transcripts: the online speech services don't know Bisaya, so they fail or write Tagalog.</p>
    <p>Open Tamkeen on your computer and download the <strong>Bisaya</strong> model there (Settings → Listening &amp; transcripts → Transcription model).
      Your computer then transcribes these episodes, and they show up here with their transcripts the next time both sync.</p>
    <p class="small muted">They're waiting in the queue for your computer now.</p>
    <div><button type="button" class="primary">OK</button></div></div>`));
  box.body.querySelector("button").onclick = box.close;
}

const FILTERS = [
  ["", "All"],
  ["new", "Not started"],
  ["queued", "Queued"],
  ["active", "In progress"],
  ["done", "Done"],
  ["failed", "Failed"],
];
const PAGE = 100;

export const isVideo = (ep) => (ep.audio_type || "").startsWith("video/");
export const isLocalFeed = (url) => (url || "").startsWith("local:");
export const isPage = (ep) => (ep.audio_type || "") === "text/html";
const isReel = (ep) => (ep.audio_type || "") === "video/instagram";
const PAGES_FEED = "local:pages";
const AUDIO_FEED = "local:audio";
const YOUTUBE_FEED = "local:youtube";
const VIDEOS_FEED = "local:videos";
const REELS_FEED = "local:reels";
const BOOKS_FEED = "local:books";

// The library is a list of kinds, always in this order: a strip on the phone, the side list on the
// computer. Choosing "Podcasts" (or "YouTube") opens a second list with the podcasts (or channels).
const KINDS = [
  { key: "podcasts", label: "Podcasts", icon: "podcast" },
  { key: "youtube", label: "YouTube", icon: "video", feed: YOUTUBE_FEED,
    empty: "No YouTube videos yet. Press + and choose YouTube." },
  { key: "pages", label: "My webpages", icon: "page", feed: PAGES_FEED,
    empty: "No webpages yet. Press + and choose Web page." },
  { key: "books", label: "Books", icon: "book", feed: BOOKS_FEED,
    empty: "No books yet. Pick a free classic in the language you're learning, or add a book of your own." },
  // The reels themselves are listed here like every other kind; getting new ones has a page of
  // its own (pages/reels.js), reached from the + button.
  { key: "reels", label: "Reels", icon: "reel", feed: REELS_FEED,
    empty: "No reels yet. Press + and choose Reels." },
  { key: "videos", label: "My videos", icon: "videofile", feed: VIDEOS_FEED,
    empty: "No videos of your own yet. Press + and choose Video file." },
  { key: "audio", label: "My audio", icon: "audio", feed: AUDIO_FEED,
    empty: "No audio of your own yet. Press + and choose Audio file." },
];
// Tapping something in a strip redraws the page; this carries how far down it was scrolled.
let keepScroll = null;
/** The picture for a built-in feed ("My webpages", "My audio", "My videos", "YouTube"). */
const localIcon = (url, size) => icon(url === PAGES_FEED ? "page" : url === BOOKS_FEED ? "book" : url === AUDIO_FEED ? "audio" : "video", size);

export function statusInfo(ep) {
  const p = Math.round(ep.progress || 0);
  switch (ep.status) {
    case "queued": return { cls: "queued", label: "Queued" };
    case "downloading": return { cls: "active", label: `Downloading ${p}%`, bar: p };
    case "transcribing": return { cls: "active", label: `Transcribing ${p}%`, bar: p };
    case "done": return { cls: "done", label: "Done" };
    case "failed": return { cls: "failed", label: "Failed" };
    // Asked for on the phone, for the computer to transcribe when it next syncs.
    default: return ep.transcribe_requested_at ? { cls: "queued", label: "Waiting for your computer" } : { cls: "", label: "Not started" };
  }
}

export async function render(view, { feedId: routeFeed, query }) {
  let feedId = routeFeed;
  // (Asked here, not when this file loads: the app shell is still starting up at that point.)
  const phone = platform === "android";
  // Which kind is showing ("podcasts" unless the address or the feed says otherwise).
  let kind = KINDS.some((k) => k.key === query.get("show")) ? query.get("show") : "podcasts";
  const filter = query.get("status") || "";
  // YouTube: the followed channel whose videos are showing ("" = all of them, recently watched first).
  const channel = query.get("channel") || "";
  let follows = [];
  const selected = new Set();
  let offset = 0;
  let feeds = [];

  // The Library shows only what is there. Every way of adding something sits behind the round +
  // button (components/addsheet.js). One header row stays at the top while the list scrolls:
  // the kinds (on the phone; the computer keeps them in its side list), the status pills and the
  // title filter, then ticking several at once.
  view.append(h(`
    <div class="library${phone ? "" : " desk"}">
      ${phone ? "" : `<aside class="sidebar">
        <div class="feed-list" id="feed-list"></div>
        <div class="feed-list sub-list" id="podcast-list" hidden></div>
        <button type="button" id="refresh" class="ghost refresh-btn" title="Check feeds for new episodes and sync with Google Drive (picks up anything queued on your phone)">⟳ Refresh &amp; sync</button>
      </aside>`}
      <section class="lib-main">
        <div class="lib-bar">
          ${phone ? `<div class="feed-list kind-row" id="feed-list"></div>` : ""}
          <div class="filter-row">
            <div class="tabs" id="tabs"></div>
            <input type="search" id="title-filter" placeholder="Filter by title" aria-label="Filter by title">
          </div>
          <div class="toolbar">
            <label class="switch"><input type="checkbox" id="select-all"> Select all</label>
            <button type="button" id="transcribe-selected" class="primary" disabled>Transcribe selected</button>
            <button type="button" id="delete-selected" class="ghost danger" hidden title="Remove the ticked episodes from your Library for good, on every device">Delete selected</button>
            <button type="button" id="watch-selected" class="primary" hidden>Watch these reels</button>
            <span class="spacer"></span>
            ${phone ? `<button type="button" id="refresh" class="ghost icon" title="Check for new episodes and sync with Google Drive" aria-label="Refresh and sync">${icon("refresh", 20)}</button>` : ""}
          </div>
        </div>
        ${phone ? `<div class="feed-list sub-list" id="podcast-list" hidden></div>` : ""}
        <div id="lib-head"></div>
        <div class="upload-status" id="upload-status" hidden>
          <div class="small"><span id="upload-name"></span> <span class="muted" id="upload-pct"></span></div>
          <div class="progress"><i id="upload-bar"></i></div>
        </div>
        <div class="episodes" id="episodes"></div>
        <div class="row" style="justify-content:center;margin-top:12px"><button type="button" id="more" hidden>Load more</button></div>
      </section>
      <button type="button" class="add-fab" id="add-fab" title="Add to your library" aria-label="Add to your library">${icon("plus", 28)}</button>
      <input type="file" id="video-file" accept="video/*,.mkv" hidden>
      <input type="file" id="audio-file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.wma,.amr" hidden>
    </div>`));

  // Looked up in the page itself, not in `view`: on the computer the page is built in a holder and
  // then moved onto the screen (see route() in app.js).
  const root = view.lastElementChild;
  const $ = (sel) => root.querySelector(sel);
  const listEl = $("#episodes");
  let titleQuery = "";

  // ----- feeds -----
  /** The kinds and, under "Podcasts" or "YouTube", the podcasts or channels (strips on the phone). */
  function renderStrips() {
    // A built-in list opened by its own address belongs to its kind; one that doesn't exist
    // yet (nothing added) shows an empty page for that kind.
    const current = feedId ? feeds.find((x) => x.id === feedId) : null;
    if (current) kind = (KINDS.find((k) => k.feed === current.url) || KINDS[0]).key;
    else if (kind !== "podcasts") {
      const own = feeds.find((x) => x.url === KINDS.find((k) => k.key === kind).feed);
      if (own) feedId = own.id;
    }
    const remember = (el) => el.addEventListener("click", () => { keepScroll = view.scrollTop; });
    root.dataset.kind = kind; // which row of ways to add something shows (computer)
    const list = $("#feed-list");
    list.innerHTML = "";
    for (const k of KINDS) {
      const own = k.feed ? feeds.find((x) => x.url === k.feed) : null;
      const href = k.href ? k.href : k.key === "podcasts" ? "#/library" : own ? `#/feed/${own.id}` : `#/library?show=${k.key}`;
      const el = h(`<a class="feed-item${k.key === kind ? " active" : ""}" href="${href}">
        <div class="ph all">${icon(k.icon, 24)}</div><div><div class="t">${k.label}</div></div></a>`);
      remember(el);
      list.append(el);
    }
    // Phone: the kinds are one sideways line; keep the chosen one in sight (say, Reels at the far end).
    const chosen = list.querySelector(".active");
    if (phone && chosen) list.scrollLeft = Math.max(0, chosen.offsetLeft - list.offsetLeft - 24);
    const strip = $("#podcast-list");
    strip.hidden = kind !== "podcasts" && kind !== "youtube";
    strip.innerHTML = "";
    if (kind === "youtube") {
      // "Recently watched" first, then the followed channels, the one watched most recently first.
      const base = feedId ? `#/feed/${feedId}` : "#/library?show=youtube";
      const recent = h(`<a class="feed-item${channel ? "" : " active"}" href="${base}"><div class="ph all">${icon("recent", 22)}</div><div><div class="t">Recently watched</div></div></a>`);
      remember(recent);
      strip.append(recent);
      const followed = followedChannels(follows, studyLanguage());
      for (const c of followed) {
        const el = h(`<a class="feed-item${c.name === channel ? " active" : ""}" href="${channelHref(base, c.name)}">
          ${channelPicture(c)}<div style="min-width:0"><div class="t" dir="auto">${esc(c.name)}</div></div></a>`);
        remember(el);
        strip.append(el);
      }
      if (!followed.length) strip.append(h(`<p class="small muted" style="padding:6px;align-self:center">Channels you follow appear here. Press Follow under a video.</p>`));
      strip.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (kind !== "podcasts") return;
    // "All episodes" first, then the podcasts, the one listened to most recently first.
    const heard = new Map();
    for (const p of allProgress()) if (p.sub) heard.set(p.sub, Math.max(heard.get(p.sub) || 0, p.ts || 0));
    const podcasts = feeds.filter((x) => !isLocalFeed(x.url))
      .map((x, i) => ({ f: x, last: heard.get(x.title) || 0, i }))
      .sort((a, b) => b.last - a.last || a.i - b.i);
    const all = h(`<a class="feed-item${feedId ? "" : " active"}" href="#/library"><div class="ph all">${icon("podcast", 22)}</div><div><div class="t">All episodes</div></div></a>`);
    remember(all);
    strip.append(all);
    for (const { f } of podcasts) {
      const el = h(`<a class="feed-item${f.id === feedId ? " active" : ""}" href="#/feed/${f.id}">
        ${f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"></div>`}
        <div style="min-width:0"><div class="t">${esc(f.title)}</div>
        <div class="small muted">${f.done_count || 0}/${f.episode_count} transcribed${f.last_error ? " · ⚠" : ""}</div></div></a>`);
      remember(el);
      strip.append(el);
    }
    if (!podcasts.length) strip.append(h(`<p class="small muted" style="padding:6px;align-self:center">No podcasts yet. Add one above, or look in Trending.</p>`));
    strip.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const channelHref = (base, name) => `${base}${base.includes("?") ? "&" : "?"}channel=${encodeURIComponent(name)}`;
  /** A channel's round picture, or the first letter of its name until one is known. */
  const channelPicture = (c) => (c.image
    ? `<img class="round" src="${esc(smallImage(c.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="ph all round">${esc([...c.name][0] || "?")}</div>`);
  const youtubeShowing = () => { const f = feeds.find((x) => x.id === feedId); return !!f && f.url === YOUTUBE_FEED; };
  const reelsShowing = () => { const f = feeds.find((x) => x.id === feedId); return !!f && f.url === REELS_FEED; };

  /** "Free classics" (the shelf, pages/books.js) and "Add a file" (your own book). */
  function bookButtons() {
    const row = h(`<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
      <a class="btn primary" href="#/books">${icon("book", 16)} Free classics</a>
      <button type="button" class="ghost">${icon("plus", 16)} Add a file</button></div>`);
    row.querySelector("button").onclick = async () => (await import("./books.js")).uploadBook();
    return row;
  }

  async function loadFeeds() {
    [feeds, follows] = await Promise.all([api("/feeds"), loadFollows().catch(() => [])]);
    renderStrips();
    renderHead();
  }

  function renderHead() {
    const head = $("#lib-head");
    head.innerHTML = "";
    // A kind with nothing in it yet (say, no YouTube videos) has no list of its own.
    const emptyKind = !feedId && kind !== "podcasts" ? KINDS.find((k) => k.key === kind) : null;
    $(".lib-main").classList.toggle("empty-kind", !!emptyKind);
    if (emptyKind) {
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${icon(emptyKind.icon, 44)}</div><div class="meta"><h1>${emptyKind.label}</h1>
        <div class="desc small">${emptyKind.empty}</div></div></div>`));
      if (emptyKind.key === "books") head.querySelector(".meta").append(bookButtons());
      return;
    }
    if (!feedId) {
      head.append(h(`<div class="lib-head"><div class="meta"><h1>All episodes</h1></div></div>`));
      return;
    }
    const f = feeds.find((x) => x.id === feedId);
    if (!f) { location.hash = "#/library"; return; }
    if (f.url === PAGES_FEED) {
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${icon("page", 44)}</div><div class="meta"><h1>${esc(f.title)}</h1>
        <div class="desc small">Web pages you imported. Open one to read it with every word clickable. Press + to add more.</div></div></div>`));
      return;
    }
    if (f.url === BOOKS_FEED) {
      const el = h(`<div class="lib-head"><div class="ph video-ph">${icon("book", 44)}</div><div class="meta"><h1>${esc(f.title)}</h1>
        <div class="desc small">Books you're reading, a page at a time with every word clickable.</div></div></div>`);
      el.querySelector(".meta").append(bookButtons());
      head.append(el);
      return;
    }
    if (f.url === REELS_FEED) {
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${icon("video", 44)}</div><div class="meta"><h1>${esc(f.title)}</h1>
        <div class="desc small">Your Instagram reels, newest first. They play from Instagram on your phone, one after another, with the
        words underneath. Tick some to watch just those.</div>
        <div class="row" style="margin-top:8px">
          <a class="btn ghost" href="#/reels/play" title="Play every reel, one after another">▶ Watch all</a>
        </div></div></div>`));
      return;
    }
    if (f.url === YOUTUBE_FEED) {
      const followed = followedChannels(follows, studyLanguage());
      const base = `#/feed/${feedId}`;
      if (channel) {
        // One channel's videos, with a way to find more of them and to stop following.
        const c = followed.find((x) => x.name === channel) || { name: channel, id: "", image: "" };
        const el = h(`<div class="lib-head">${channelPicture(c).replace('class="', 'class="channel-pic ')}<div class="meta"><h1 dir="auto">${esc(c.name)}</h1>
          <div class="desc small">Videos you've watched from this channel, newest first.</div>
          <div class="row" style="margin-top:8px">
            <button type="button" id="channel-more" title="Open this channel on YouTube inside the app. Tap a video there and it opens in Tamkeen's player">${icon("video", 16)} More from this channel</button>
            ${followed.includes(c) ? `<button type="button" class="ghost" id="channel-unfollow">Unfollow</button>` : ""}
          </div></div></div>`);
        el.querySelector("#channel-more").onclick = () => openYouTube(channelAddress(c, { mobile: phone })).catch((err) => toast(err.message, { error: true }));
        const un = el.querySelector("#channel-unfollow");
        if (un) un.onclick = async () => {
          try {
            await unfollowChannel(c.name);
            toast(`Stopped following ${c.name}. Its videos stay under Recently watched.`);
            location.hash = base;
          } catch (err) { toast(err.message, { error: true }); }
        };
        head.append(el);
      }
      // "Recently watched" has no heading of its own: the list of kinds already says it is YouTube.
      return;
    }
    if (isLocalFeed(f.url)) {
      const what = f.url === AUDIO_FEED ? "Audio" : "Video";
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${localIcon(f.url, 44)}</div><div class="meta"><h1>${esc(f.title)}</h1>
        <div class="desc small">${what} files you added yourself. They're transcribed on your computer and stored in your
        Google Drive, so every device can play them. Press + to add more.</div></div></div>`));
      return;
    }
    const el = h(`<div class="lib-head">
      ${f.image ? `<img src="${esc(f.image)}" alt="" referrerpolicy="no-referrer">` : ""}
      <div class="meta">
        <h1 style="unicode-bidi:plaintext">${esc(f.title)}</h1>
        <div class="desc small" style="unicode-bidi:plaintext">${esc(f.description)}</div>
        <div class="row" style="margin-top:8px">
          <label class="switch" title="Queue new episodes for transcription automatically when they appear">
            <input type="checkbox" id="auto" ${f.auto_transcribe ? "checked" : ""}> Auto-transcribe new episodes
          </label>
          <span class="spacer"></span>
          <span class="small muted">${f.last_error ? `⚠ Last refresh failed: ${esc(f.last_error)}` : f.last_checked ? `Checked ${new Date(f.last_checked * 1000).toLocaleString()}` : ""}</span>
          <button type="button" class="ghost danger" id="remove-feed">Remove podcast</button>
        </div>
      </div></div>`);
    head.append(el);
    el.querySelector("#auto").onchange = async (e) => {
      await api(`/feeds/${feedId}`, { method: "PATCH", body: { auto_transcribe: e.target.checked } });
      toast(e.target.checked ? "New episodes will be transcribed automatically." : "Auto-transcribe turned off.");
    };
    el.querySelector("#remove-feed").onclick = async () => {
      if (!confirm(`Remove “${f.title}”? Its transcripts and downloaded audio will be deleted. Saved vocab is kept.`)) return;
      await api(`/feeds/${feedId}`, { method: "DELETE" });
      location.hash = "#/library";
    };
  }

  // ----- episodes -----
  function renderTabs(counts) {
    const n = (k) => {
      if (!k) return Object.values(counts).reduce((a, b) => a + b, 0);
      if (k === "active") return (counts.downloading || 0) + (counts.transcribing || 0);
      return counts[k] || 0;
    };
    const tabs = $("#tabs");
    tabs.innerHTML = "";
    for (const [key, label] of FILTERS) {
      const b = h(`<button type="button" class="${key === filter ? "active" : ""}">${label} <span class="n">${n(key)}</span></button>`);
      b.onclick = () => {
        const base = feedId ? `#/feed/${feedId}` : "#/library";
        const keep = new URLSearchParams();
        if (key) keep.set("status", key);
        if (channel) keep.set("channel", channel); // stay on the same YouTube channel
        location.hash = keep.size ? `${base}?${keep}` : base;
      };
      tabs.append(b);
    }
  }

  function epRow(ep) {
    const img = ep.image || ep.feed_image;
    const row = h(`<div class="ep" data-id="${ep.id}">
      <input type="checkbox" class="sel" aria-label="Select episode">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"></div>`}
      <div class="info">
        <div class="title" dir="auto"></div>
        <div class="sub">${feedId ? "" : `${esc(ep.feed_title)} · `}${isReel(ep) && ep.description ? `@${esc(ep.description)} · ` : ""}${fmtDate(ep.published)}${ep.duration ? ` · ${isReel(ep) && ep.duration < 60 ? `${Math.round(ep.duration)} s` : fmtDuration(ep.duration)}` : ""}</div>
      </div>
      <div class="status"></div>
    </div>`);
    const title = row.querySelector(".title");
    if (isVideo(ep)) title.dataset.video = "1";
    if (ep.status === "done" || isVideo(ep)) {
      const a = h(`<a href="#/episode/${ep.id}"></a>`);
      a.textContent = ep.title;
      title.append(a);
    } else {
      title.textContent = ep.title;
    }
    row.querySelector(".sel").checked = selected.has(ep.id);
    row.querySelector(".sel").onchange = (e) => {
      e.target.checked ? selected.add(ep.id) : selected.delete(ep.id);
      updateSelection();
    };
    row._ep = ep;
    renderStatus(row);
    return row;
  }

  function renderStatus(row) {
    const ep = row._ep;
    const st = statusInfo(ep);
    const box = row.querySelector(".status");
    box.innerHTML = "";
    const line = h(`<div class="row"><span class="pill ${st.cls}">${st.label}</span></div>`);
    const btn = (label, cls, fn) => {
      const b = h(`<button type="button" class="${cls}">${label}</button>`);
      b.onclick = fn;
      line.append(b);
    };
    switch (ep.status) {
      case "done":
        btn(isVideo(ep) ? "Watch" : isPage(ep) ? "Read" : "Open", "primary", () => (location.hash = `#/episode/${ep.id}`));
        break;
      case "failed":
        btn("Retry", "", () => transcribe([ep.id]));
        break;
      case "queued":
      case "downloading":
      case "transcribing":
        btn("Cancel", "ghost", async () => { await api(`/episodes/${ep.id}/cancel`, { method: "POST" }); });
        break;
      default:
        btn("Transcribe", "", () => transcribe([ep.id]));
    }
    if (isVideo(ep) && ep.status !== "done") btn("Watch", "ghost", () => (location.hash = `#/episode/${ep.id}`));
    // Send to a friend: every kind. The user's own files go as their words only, so once transcribed.
    const media = mediaFromEpisode(ep);
    if (media && (media.kind !== "text" || media.ready)) line.append(sendButton(() => mediaFromEpisode(row._ep)));
    if (isLocalFeed(ep.feed_url)) {
      btn("Delete", "ghost danger", async () => {
        if (!confirm(isPage(ep) ? `Delete “${ep.title}” from your webpages? Saved vocab is kept.`
          : isYouTube(ep) ? `Remove “${ep.title}” from your YouTube videos? Saved vocab is kept.`
          : ep.audio_type === "video/instagram" ? `Remove “${ep.title}” from your reels? Saved vocab is kept.`
          : `Delete “${ep.title}”? The ${isVideo(ep) ? "video" : "audio"} and its transcript are removed from this device and from your Google Drive. Saved vocab is kept.`)) return;
        try {
          await api(`/episodes/${ep.id}`, { method: "DELETE" });
          row.remove();
          scheduleReload();
        } catch (e) { toast(e.message, { error: true }); }
      });
    }
    box.append(line);
    if (st.bar !== undefined) box.append(h(`<div class="progress"><i style="width:${st.bar}%"></i></div>`));
    if (ep.status === "failed" && ep.error) {
      const err = h(`<div class="err"></div>`);
      err.textContent = ep.error;
      // A cloud transcription the provider refused (a key, credit, the connection): what to check.
      const fix = /\b(Groq|OpenAI)\b/.test(ep.error) ? troubleshootButton(ep.error, { service: "stt" }) : null;
      if (fix) err.append(" ", fix);
      box.append(err);
    }
    // Title becomes a link once done (videos can be watched straight away).
    const title = row.querySelector(".title");
    if ((ep.status === "done" || isVideo(ep)) && !title.querySelector("a")) {
      title.innerHTML = "";
      const a = h(`<a href="#/episode/${ep.id}"></a>`);
      a.textContent = ep.title;
      title.append(a);
    }
  }

  async function transcribe(ids) {
    requestNotifications();
    try {
      const r = await api("/episodes/transcribe", { method: "POST", body: { ids } });
      // Show it at once: the rows say Queued and the tabs' numbers move. (The computer's server also
      // reports each one; the phone, leaving them for the computer, has nothing that would.)
      const queued = new Set(r.queued || []);
      for (const row of listEl.querySelectorAll(".ep")) {
        if (!row._ep || !queued.has(row._ep.id) || ["downloading", "transcribing", "done"].includes(row._ep.status)) continue;
        row._ep.status = "queued";
        renderStatus(row);
      }
      scheduleCounts();
      if (r.computer_only) { computerOnlyNotice(); return; }
      if (!r.queued.length) toast("Those episodes are already queued or in progress.");
      else toast(`Queued ${r.queued.length} episode${r.queued.length > 1 ? "s" : ""} for transcription.`);
    } catch (e) {
      toast(e.message, { error: true });
    }
  }

  function updateSelection() {
    const b = $("#transcribe-selected");
    b.disabled = selected.size === 0;
    b.textContent = selected.size ? `Transcribe selected (${selected.size})` : "Transcribe selected";
    const d = $("#delete-selected");
    d.hidden = selected.size === 0;
    d.textContent = `Delete selected (${selected.size})`;
    // Reels are never transcribed from here (they arrive with their words): ticking them is for
    // watching just those, so the button for that appears instead, once any are ticked.
    const reels = reelsShowing();
    b.hidden = reels;
    const w = $("#watch-selected");
    w.hidden = !reels || selected.size === 0;
    w.textContent = selected.size === 1 ? "▶ Watch this reel" : `▶ Watch these ${selected.size} reels`;
  }

  async function loadEpisodes(append = false) {
    if (!append) offset = 0;
    if (!feedId && kind !== "podcasts") { // nothing of this kind yet: renderHead says so
      renderTabs({});
      listEl.innerHTML = "";
      $("#more").hidden = true;
      return;
    }
    const params = new URLSearchParams({ limit: PAGE, offset });
    if (feedId) params.set("feed_id", feedId);
    else params.set("scope", "podcasts"); // "All episodes" sits under Podcasts
    if (filter) params.set("status", filter);
    if (titleQuery) params.set("q", titleQuery);
    if (channel && youtubeShowing()) params.set("channel", channel);
    const data = await api(`/episodes?${params}`);
    renderTabs(data.counts);
    updateSelection();
    if (!append) listEl.innerHTML = "";
    let items = data.items;
    if (youtubeShowing() && !channel) {
      // "Recently watched": the video opened last comes first (a video never opened here counts from when it was added).
      const opened = new Map(allProgress().map((p) => [String(p.id), (p.ts || 0) / 1000]));
      const last = (ep) => Math.max(opened.get(String(ep.id)) || 0, ep.published || 0);
      items = [...items].sort((a, b) => last(b) - last(a));
    }
    for (const ep of items) listEl.append(epRow(ep));
    offset += data.items.length;
    $("#more").hidden = offset >= data.total;
    if (!data.total) {
      listEl.append(h(`<div class="empty">${feeds.length ? "No episodes match this filter." : "Press + to add a podcast, a video or a web page."}</div>`));
    }
  }

  // ----- wiring -----
  $("#refresh").onclick = async (e) => {
    const button = e.currentTarget;
    const label = button.innerHTML;
    button.disabled = true;
    if (!phone) button.textContent = "Refreshing…"; // the phone's is an icon on its own
    try {
      const r = await api(feedId ? `/feeds/refresh?feed_id=${feedId}` : "/feeds/refresh", { method: "POST" });
      const found = r.new_episodes ? `${r.new_episodes} new episode(s).` : "No new episodes.";
      toast(r.already_running ? "Already refreshing…" : r.synced ? `${found} Synced with Google Drive.` : found);
      await loadFeeds();
      await loadEpisodes();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  };
  $("#select-all").onchange = (e) => {
    listEl.querySelectorAll(".ep").forEach((row) => {
      const cb = row.querySelector(".sel");
      cb.checked = e.target.checked;
      e.target.checked ? selected.add(row._ep.id) : selected.delete(row._ep.id);
    });
    updateSelection();
  };
  $("#transcribe-selected").onclick = async () => {
    await transcribe([...selected]);
    selected.clear();
    $("#select-all").checked = false;
    listEl.querySelectorAll(".sel").forEach((cb) => (cb.checked = false));
    updateSelection();
  };
  $("#delete-selected").onclick = async (e) => {
    const n = selected.size;
    if (!n) return;
    const what = n === 1 ? "this episode" : `these ${n} episodes`;
    if (!confirm(`Delete ${what}?\n\nThis removes ${n === 1 ? "it" : "them"} from your Library on every device, together with `
      + `the audio and transcript. A deleted podcast episode does not come back when the podcast is refreshed. `
      + `Saved vocab is kept.\n\nThis can't be undone.`)) return;
    e.target.disabled = true;
    try {
      const r = await api("/episodes/delete", { method: "POST", body: { ids: [...selected] } });
      toast(r.deleted === 1 ? "Deleted 1 episode." : `Deleted ${r.deleted} episodes.`);
      selected.clear();
      $("#select-all").checked = false;
      updateSelection();
      await loadFeeds();
      await loadEpisodes();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      e.target.disabled = false;
    }
  };
  $("#watch-selected").onclick = () => {
    // In the order they are listed here (not the order they were ticked in).
    const ids = [...listEl.querySelectorAll(".ep")].map((row) => row._ep.id).filter((id) => selected.has(id));
    if (ids.length) location.hash = `#/reels/play?at=${ids[0]}&only=${ids.join(",")}`;
  };
  $("#more").onclick = () => loadEpisodes(true);
  // The + button: every way of adding something.
  $("#add-fab").onclick = () => openAddSheet({ pickFile: (kind) => $(kind === "audio" ? "#audio-file" : "#video-file").click() });
  // Video and audio files are added the same way; the file's type decides where it goes.
  $("#video-file").onchange = $("#audio-file").onchange = async (e) => {
    const file = e.target.files[0];
    const btn = $("#add-fab");
    e.target.value = "";
    if (!file) return;
    const box = $("#upload-status");
    btn.disabled = true;
    box.hidden = false;
    $("#upload-name").textContent = file.name;
    const paint = (frac) => {
      $("#upload-pct").textContent = `${Math.round(frac * 100)}%`;
      $("#upload-bar").style.width = `${frac * 100}%`;
    };
    paint(0);
    try {
      const ep = await uploadVideo(file, paint);
      toast(`Added “${ep.title}”. ${ep.note || "It's being transcribed now."}`);
      location.hash = `#/feed/${ep.feed_id}`;
      scheduleReload();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      box.hidden = true;
    }
  };
  let debounce;
  $("#title-filter").oninput = (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { titleQuery = e.target.value.trim(); loadEpisodes(); }, 250);
  };

  // Live status updates: patch rows in place.
  let reloadTimer;
  const scheduleReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { loadFeeds(); loadEpisodes(); }, 400);
  };
  let countsTimer;
  const scheduleCounts = () => {
    clearTimeout(countsTimer);
    countsTimer = setTimeout(async () => {
      const params = new URLSearchParams({ limit: 1 });
      if (feedId) params.set("feed_id", feedId);
      else params.set("scope", "podcasts");
      renderTabs((await api(`/episodes?${params}`)).counts);
      loadFeeds();
    }, 400);
  };
  const offEp = on("episode", (e) => {
    const row = listEl.querySelector(`.ep[data-id="${e.id}"]`);
    const prev = row ? row._ep.status : null;
    if (row) {
      Object.assign(row._ep, e);
      renderStatus(row);
    }
    // Counts/filters only change on status transitions, not on progress ticks.
    if (e.status && e.status !== prev) {
      if (filter || !row) scheduleReload();
      else scheduleCounts();
    }
  });
  const offFeeds = on("feeds", scheduleReload);
  const offRe = on("reconnected", scheduleReload);

  await loadFeeds();
  await loadEpisodes();
  if (keepScroll !== null) { // came from a tap in a strip: stay where the reader was
    view.scrollTop = keepScroll;
    keepScroll = null;
  }
  firstVisitTour("library", root, [
    { target: "#feed-list", title: "What to show",
      text: "Switch between podcasts, YouTube videos, webpages, books, reels and your own videos." },
    { target: "#podcast-list", title: "Your podcasts and channels", text: "Tap one to see only its episodes or videos." },
    { target: "#tabs", title: "Filter by progress",
      text: "Show everything, or only what's not started, waiting, being transcribed, done or failed. The numbers count each." },
    { target: "#episodes .ep", title: "An episode",
      text: "Transcribe writes down its words so you can read along and tap any word. Once done, Open plays it with its transcript." },
    { target: "#add-fab", title: "Add",
      text: "Add something to learn from: a podcast, a YouTube video, a webpage, a book, reels, or a video or audio file of your own." },
  ]);

  return () => { offEp(); offFeeds(); offRe(); clearTimeout(reloadTimer); clearTimeout(countsTimer); };
}
