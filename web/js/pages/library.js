// Library: feeds sidebar, episode list with live status, multi-select transcription.

import { api, esc, h, fmtDate, fmtDuration, on, toast, requestNotifications, uploadVideo, openBrowser, openYouTube, platform } from "../app.js";
import { icon } from "../icons.js";
import { importUrl } from "../pageimport.js";
import { langInfo, studyLanguage } from "../languages.js";
import { allProgress } from "../progress.js";
import { importVideo, isYouTube, loadFollows, unfollowChannel, videoId as youTubeId } from "../youtube.js";
import { channelAddress, followedChannels, smallImage } from "../ytfollow.js";
import { COUNTRIES, chooseCountry, chosenCountry } from "../youtube-home.js";

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

// The phone shows the library as a strip of kinds, always in this order, instead of the
// computer's side list. Tapping "Podcasts" opens a second strip with the podcasts themselves.
const KINDS = [
  { key: "podcasts", label: "Podcasts", icon: "podcast" },
  { key: "youtube", label: "YouTube", icon: "video", feed: YOUTUBE_FEED,
    empty: "No YouTube videos yet. Press “Open YouTube” above and tap a video." },
  { key: "pages", label: "My webpages", icon: "page", feed: PAGES_FEED,
    empty: "No webpages yet. Use “Add a webpage” or “Open Web Browser” above." },
  { key: "videos", label: "My videos", icon: "videofile", feed: VIDEOS_FEED,
    empty: "No videos of your own yet. Use “Add video file” above." },
  { key: "audio", label: "My audio", icon: "audio", feed: AUDIO_FEED,
    empty: "No audio of your own yet. Use “Add audio file” above." },
  // The reels themselves are listed here like every other kind; getting new ones has a page of
  // its own (pages/reels.js), reached from the button at the top of this list.
  { key: "reels", label: "Reels", icon: "video", feed: REELS_FEED,
    empty: `No reels yet. <a class="btn primary" href="#/reels" style="margin-top:8px;display:inline-block">Get reels</a>` },
];
// Tapping something in a strip redraws the page; this carries how far down it was scrolled.
let keepScroll = null;
/** The picture for a built-in feed ("My webpages", "My audio", "My videos", "YouTube"). */
const localIcon = (url, size) => icon(url === PAGES_FEED ? "page" : url === AUDIO_FEED ? "audio" : "video", size);

export function statusInfo(ep) {
  const p = Math.round(ep.progress || 0);
  switch (ep.status) {
    case "queued": return { cls: "queued", label: "Queued" };
    case "downloading": return { cls: "active", label: `Downloading ${p}%`, bar: p };
    case "transcribing": return { cls: "active", label: `Transcribing ${p}%`, bar: p };
    case "done": return { cls: "done", label: "Done" };
    case "failed": return { cls: "failed", label: "Failed" };
    default: return { cls: "", label: "Not started" };
  }
}

export async function render(view, { feedId: routeFeed, query }) {
  let feedId = routeFeed;
  // (Asked here, not when this file loads: the app shell is still starting up at that point.)
  const phone = platform === "android";
  // Phone: which kind is showing ("podcasts" unless the address or the feed says otherwise).
  let kind = phone && KINDS.some((k) => k.key === query.get("show")) ? query.get("show") : "podcasts";
  const filter = query.get("status") || "";
  // YouTube: the followed channel whose videos are showing ("" = all of them, recently watched first).
  const channel = query.get("channel") || "";
  let follows = [];
  const selected = new Set();
  let offset = 0;
  let feeds = [];

  view.append(h(`
    <div class="library">
      <aside class="sidebar">
        <div class="add-page">
          <form class="add-feed" id="add-page">
            <label for="page-url"><strong>Add a webpage</strong></label>
            <div class="row">
              <input id="page-url" type="text" inputmode="url" placeholder="Paste website URL" required autocomplete="off">
              <button class="primary" type="submit">Import</button>
            </div>
          </form>
          <button type="button" id="open-browser" class="browser-btn" title="Browse the web inside the app and import any page you're reading">
            <span class="ico">${icon("page", 26)}</span><span>Open Web<br>Browser</span></button>
        </div>
        <form class="add-feed" id="add-feed">
          <label for="feed-url"><strong>Add a podcast</strong></label>
          <div class="row">
            <input id="feed-url" type="url" placeholder="Paste RSS feed URL" required autocomplete="off">
            <button class="primary" type="submit">Add</button>
          </div>
        </form>
        <a class="btn trending-btn" href="#/discover" title="See which podcasts are popular right now in the language you're studying, sorted by topic, and add any with one press">
          ${icon("trending", 18)} Trending in ${esc(langInfo(studyLanguage()).name)}</a>
        <div class="add-feed add-yt">
          <strong>Watch a YouTube video</strong>
          <button type="button" id="open-youtube" class="trending-btn" title="Browse YouTube inside the app. Tap a video and it opens in Tamkeen's player, with its captions as clickable text">
            ${icon("video", 18)} Open YouTube</button>
          <label class="yt-country small" id="yt-country-row" hidden title="Open YouTube starts on this week's most-watched videos from this country">
            <span class="muted">Popular in</span> <select id="yt-country"></select></label>
          <p class="small muted hint">Tap any video there to watch it here with clickable captions. The video needs captions.</p>
        </div>
        <div class="add-feed add-yt">
          <strong>Instagram reels</strong>
          <a class="btn trending-btn" href="#/reels" title="Get a batch of popular short videos in the language you're studying. Your computer writes down what is said in each, and they play one after another on your phone with the words underneath">
            ${icon("video", 18)} Reels for my phone</a>
        </div>
        <div class="row">
          <span class="row" style="flex-wrap:nowrap;gap:4px">
          <button type="button" id="add-video" class="ghost" title="Add a video file of your own; it's transcribed and stored in your Google Drive">${icon("video", 18)} Add video file</button>
          <input type="file" id="video-file" accept="video/*,.mkv" hidden>
          <button type="button" id="add-audio" class="ghost" title="Add an audio file of your own (a recording, a lesson, a song); it's transcribed and stored in your Google Drive">${icon("audio", 18)} Add audio file</button>
          <input type="file" id="audio-file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.wma,.amr" hidden>
          </span>
        </div>
        <div class="upload-status" id="upload-status" hidden>
          <div class="small"><span id="upload-name"></span> <span class="muted" id="upload-pct"></span></div>
          <div class="progress"><i id="upload-bar"></i></div>
        </div>
        <div class="row">
          <button type="button" id="refresh" class="ghost" title="Check feeds for new episodes and sync with Google Drive (picks up anything queued on your phone)">⟳ Refresh &amp; sync</button>
        </div>
        <div class="feed-list" id="feed-list"></div>
        <div class="feed-list" id="podcast-list" hidden></div>
      </aside>
      <section class="lib-main">
        <div id="lib-head"></div>
        <div class="tabs" id="tabs"></div>
        <div class="toolbar">
          <label class="switch"><input type="checkbox" id="select-all"> Select all</label>
          <button type="button" id="transcribe-selected" class="primary" disabled>Transcribe selected</button>
          <button type="button" id="watch-selected" class="primary" hidden>Watch these reels</button>
          <span class="spacer"></span>
          <input type="search" id="title-filter" placeholder="Filter by title" style="width:200px">
        </div>
        <div class="episodes" id="episodes"></div>
        <div class="row" style="justify-content:center;margin-top:12px"><button type="button" id="more" hidden>Load more</button></div>
      </section>
    </div>`));

  const $ = (sel) => view.querySelector(sel);
  const listEl = $("#episodes");
  let titleQuery = "";

  // ----- feeds -----
  /** Phone: the strip of kinds and, under "Podcasts", the strip of podcasts. */
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
    const strip = $("#podcast-list");
    strip.hidden = kind !== "podcasts" && kind !== "youtube";
    strip.innerHTML = "";
    if (kind === "youtube") {
      // "Recently watched" first, then the followed channels, the one watched most recently first.
      const base = feedId ? `#/feed/${feedId}` : "#/library?show=youtube";
      const recent = h(`<a class="feed-item${channel ? "" : " active"}" href="${base}"><div class="ph all">${icon("recent", 22)}</div><div><div class="t">Recently watched</div></div></a>`);
      remember(recent);
      strip.append(recent);
      const followed = followedChannels(follows);
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
        <div style="min-width:0"><div class="t">${esc(f.title)}</div></div></a>`);
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

  async function loadFeeds() {
    [feeds, follows] = await Promise.all([api("/feeds"), loadFollows().catch(() => [])]);
    if (phone) {
      renderStrips();
      renderHead();
      return;
    }
    const list = $("#feed-list");
    list.innerHTML = "";
    const all = h(`<a class="feed-item${feedId ? "" : " active"}" href="#/library"><div class="ph all">${icon("podcast", 22)}</div><div><div class="t">All episodes</div></div></a>`);
    list.append(all);
    for (const f of feeds) {
      const img = isLocalFeed(f.url) ? `<div class="ph all">${localIcon(f.url, 22)}</div>` : f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"></div>`;
      list.append(h(`<a class="feed-item${f.id === feedId ? " active" : ""}" href="#/feed/${f.id}">
        ${img}<div style="min-width:0"><div class="t">${esc(f.title)}</div>
        <div class="small muted">${f.done_count || 0}/${f.episode_count} transcribed${f.last_error ? " · ⚠" : ""}</div></div></a>`));
    }
    if (!feeds.length) {
      list.append(h(`<p class="small muted" style="padding:6px">No podcasts yet. Paste a feed's RSS URL above. You can usually find it on the podcast's website, or by searching “podcast name RSS”.</p>`));
    }
    renderHead();
  }

  function renderHead() {
    const head = $("#lib-head");
    head.innerHTML = "";
    // Phone: a kind with nothing in it yet (say, no YouTube videos) has no list of its own.
    const emptyKind = phone && !feedId && kind !== "podcasts" ? KINDS.find((k) => k.key === kind) : null;
    view.querySelector(".lib-main").classList.toggle("empty-kind", !!emptyKind);
    if (emptyKind) {
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${icon(emptyKind.icon, 44)}</div><div class="meta"><h1>${emptyKind.label}</h1>
        <div class="desc small">${emptyKind.empty}</div></div></div>`));
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
        <div class="desc small">Web pages you imported. Open one to read it with every word clickable. Add more with
        “Add a webpage”, or browse with “Open Web Browser” and press Import Page.</div></div></div>`));
      return;
    }
    if (f.url === REELS_FEED) {
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${icon("video", 44)}</div><div class="meta"><h1>${esc(f.title)}</h1>
        <div class="desc small">Your Instagram reels, newest first. They play from Instagram on your phone, one after another, with the
        words underneath. Tick some to watch just those.</div>
        <div class="row" style="margin-top:8px">
          <a class="btn" href="#/reels" title="Choose more reels from Instagram to add to this list">${icon("video", 16)} Get more reels</a>
          <a class="btn ghost" href="#/reels/play" title="Play every reel, one after another">▶ Watch all</a>
        </div></div></div>`));
      return;
    }
    if (f.url === YOUTUBE_FEED) {
      const followed = followedChannels(follows);
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
      // "Recently watched" has no heading of its own: the strip above already says it is YouTube.
      if (!phone) {
        // The computer's version of the phone's channel bar: Recently watched, then followed channels.
        const bar = h(`<div class="tabs yt-channels"></div>`);
        const chip = (label, href, active, picture = "") => {
          const b = h(`<button type="button" class="${active ? "active" : ""}">${picture}<span dir="auto"></span></button>`);
          b.querySelector("span").textContent = label;
          b.onclick = () => (location.hash = href);
          bar.append(b);
        };
        chip("Recently watched", base, !channel, icon("recent", 15));
        for (const c of followed) chip(c.name, channelHref(base, c.name), c.name === channel, channelPicture(c));
        if (!followed.length) bar.append(h(`<span class="small muted">Channels you follow appear here. Press Follow under a video.</span>`));
        head.append(bar);
      }
      return;
    }
    if (isLocalFeed(f.url)) {
      const what = f.url === AUDIO_FEED ? "Audio" : "Video";
      head.append(h(`<div class="lib-head"><div class="ph video-ph">${localIcon(f.url, 44)}</div><div class="meta"><h1>${esc(f.title)}</h1>
        <div class="desc small">${what} files you added yourself. They're transcribed on your computer and stored in your
        Google Drive, so every device can play them. Use “Add ${what.toLowerCase()} file” to add more.</div></div></div>`));
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
    if (phone && !feedId && kind !== "podcasts") { // nothing of this kind yet: renderHead says so
      listEl.innerHTML = "";
      $("#more").hidden = true;
      return;
    }
    const params = new URLSearchParams({ limit: PAGE, offset });
    if (feedId) params.set("feed_id", feedId);
    else if (phone) params.set("scope", "podcasts"); // "All episodes" sits under Podcasts there
    if (filter) params.set("status", filter);
    if (titleQuery) params.set("q", titleQuery);
    if (channel && youtubeShowing()) params.set("channel", channel);
    const data = await api(`/episodes?${params}`);
    renderTabs(data.counts);
    $("#tabs").hidden = reelsShowing(); // every reel is ready to watch: nothing to filter by
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
      listEl.append(h(`<div class="empty">${feeds.length ? "No episodes match this filter." : "Add a podcast to get started."}</div>`));
    }
  }

  // ----- wiring -----
  $("#add-feed").onsubmit = async (e) => {
    e.preventDefault();
    const input = $("#feed-url");
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      const feed = await api("/feeds", { method: "POST", body: { url: input.value } });
      input.value = "";
      toast(`Subscribed to ${feed.title}`);
      location.hash = `#/feed/${feed.id}`;
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      btn.textContent = "Add";
    }
  };
  $("#refresh").onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Refreshing…";
    try {
      const r = await api(feedId ? `/feeds/refresh?feed_id=${feedId}` : "/feeds/refresh", { method: "POST" });
      const found = r.new_episodes ? `${r.new_episodes} new episode(s).` : "No new episodes.";
      toast(r.already_running ? "Already refreshing…" : r.synced ? `${found} Synced with Google Drive.` : found);
      await loadFeeds();
      await loadEpisodes();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      e.target.disabled = false;
      e.target.textContent = "⟳ Refresh & sync";
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
  $("#watch-selected").onclick = () => {
    // In the order they are listed here (not the order they were ticked in).
    const ids = [...listEl.querySelectorAll(".ep")].map((row) => row._ep.id).filter((id) => selected.has(id));
    if (ids.length) location.hash = `#/reels/play?at=${ids[0]}&only=${ids.join(",")}`;
  };
  $("#more").onclick = () => loadEpisodes(true);
  $("#add-page").onsubmit = async (e) => {
    e.preventDefault();
    const input = $("#page-url");
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Importing…";
    try {
      if (youTubeId(input.value)) { // a YouTube link pasted in the webpage box: add it as a video
        await addYouTube(input.value);
        input.value = "";
        return;
      }
      const ep = await importUrl(input.value);
      input.value = "";
      toast(`Imported “${ep.title}”.`, { action: { label: "Read", run: () => (location.hash = `#/episode/${ep.id}`) } });
      location.hash = `#/feed/${ep.feed_id}`;
      scheduleReload();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      btn.disabled = false;
      btn.textContent = "Import";
    }
  };
  /** Read the video's captions and open it in the player. */
  async function addYouTube(link) {
    const ep = await importVideo(link);
    toast(`Added “${ep.title}” with ${ep.auto ? "YouTube's automatic captions" : "its captions"}.`);
    location.hash = `#/episode/${ep.id}`;
  }
  $("#open-youtube").onclick = () => openYouTube().catch((err) => toast(err.message, { error: true }));
  // Which country's popular videos Open YouTube starts on (only languages spoken in several have a choice).
  const ytCountries = COUNTRIES[studyLanguage()] || [];
  if (ytCountries.length > 1) {
    const pick = $("#yt-country");
    for (const [code, name] of ytCountries) pick.append(new Option(name, code));
    pick.value = chosenCountry(studyLanguage());
    pick.onchange = () => chooseCountry(studyLanguage(), pick.value);
    $("#yt-country-row").hidden = false;
  }
  $("#open-browser").onclick = () => {
    const typed = $("#page-url").value.trim();
    openBrowser(typed).catch((err) => toast(err.message, { error: true }));
  };
  $("#add-video").onclick = () => $("#video-file").click();
  $("#add-audio").onclick = () => $("#audio-file").click();
  // Video and audio files are added the same way; the file's type decides where it goes.
  $("#video-file").onchange = $("#audio-file").onchange = async (e) => {
    const file = e.target.files[0];
    const btn = e.target.id === "audio-file" ? $("#add-audio") : $("#add-video");
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
      else if (phone) params.set("scope", "podcasts");
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
  if (!feeds.length && !phone) $("#feed-url").focus();
  if (keepScroll !== null) { // came from a tap in a strip: stay where the reader was
    view.scrollTop = keepScroll;
    keepScroll = null;
  }

  return () => { offEp(); offFeeds(); offRe(); clearTimeout(reloadTimer); clearTimeout(countsTimer); };
}
