// Reels: Instagram reels to study, one after another.
//
// On the computer this page is where a batch is made ("Get 10 reels": popular in the language
// being studied, only your own creators, or a mix; see app/reels_worker.py). Only each reel's
// address and its words are kept. On the phone it is where they are watched: the reel plays from
// Instagram's own embed page in a window at the top (reel-embed.js runs inside it), and below is
// a bar split in two: the words on the left, the word popup on the right. When a reel ends the
// next one starts by itself.

import { api, esc, h, on, toast, platform, buzz, reelSurface, fmtDuration, openInstagramSignIn } from "../app.js";
import { icon } from "../icons.js";
import { activeWordIndex, sentenceBounds, formatTime, EDGE_PUNCT } from "../wordlookup.js";
import { episodeLanguage, gap, joinWords, langInfo, regroupWords, vocabFromDefinition } from "../languages.js";
import { createWordBubble, pauseAfterWord, pauseSwitch } from "../components/wordbubble.js";
import { getDefinition } from "../define-service.js";
import { wordFixer } from "../fixword.js";
import { lookupToggle } from "../components/lookupmode.js";
import { mediaFromEpisode, sendButton } from "../components/sendmedia.js";
import { markWord } from "../definer.js";
import { reward, trackStudy } from "../game/game.js";
import { seenWords } from "../lexicon/seen.js";
import { readingsReady } from "../lexicon/readings.js";
import { wordHtml } from "../wordface.js";
import { displayWords, paintWords, vowelsButton } from "../vowels.js";
import { wordClip } from "../wordclip.js";

export const REEL_TYPE = "video/instagram";
export const REELS_FEED = "local:reels";
export const isReel = (ep) => (ep.audio_type || "") === REEL_TYPE;
const embedUrl = (ep) => `https://www.instagram.com/reel/${encodeURIComponent(ep.guid)}/embed/`;
// Some reels (mostly ones with a song from Instagram's music library) have no video on their embed
// page. Instagram plays those only on the reel's ordinary page, to someone signed in. The computer
// marks such a reel by ending its address with "#signin"; one found out here is remembered too.
const pageUrl = (ep) => `https://www.instagram.com/reel/${encodeURIComponent(ep.guid)}/`;
export const needsSignIn = (ep) => String(ep.audio_url || "").endsWith("#signin");
const viaPage = new Set();
/** The page the reel window opens for a reel: its embed page, or its ordinary one. */
const reelAddress = (ep) => (needsSignIn(ep) || viaPage.has(String(ep.id)) ? pageUrl(ep) : embedUrl(ep));

/** Shown in the bar's right half when Instagram wants a sign-in before it plays a reel. It goes
 * away by itself when another reel is shown (`counter` is the "3 / 10" label, which changes then). */
function askSignIn(host, counter, { retry, skip }) {
  host.querySelector("#reel-signin")?.remove();
  const box = h(`<div class="reel-signin" id="reel-signin">
    <p><strong>Sign in to Instagram to watch this reel.</strong></p>
    <p class="small muted">Instagram only plays this one to people who are signed in (because it uses a song from
    Instagram's music library, or because it is age-restricted). Sign in once, in Tamkeen's own browser: it closes by
    itself when you are signed in, and the reel starts. If you were signed in before, Instagram may have signed you out.</p>
    <div class="row"><button type="button" class="primary" data-a="in">Sign in</button>
      <button type="button" data-a="retry">Try again</button>${skip ? `<button type="button" class="ghost" data-a="skip">Skip</button>` : ""}</div>
  </div>`);
  box.querySelector('[data-a="in"]').onclick = () => openInstagramSignIn().catch((e) => toast(e.message, { error: true }));
  box.querySelector('[data-a="retry"]').onclick = retry;
  if (skip) box.querySelector('[data-a="skip"]').onclick = skip;
  host.prepend(box);
  // The sign-in browser says when the user is signed in (and closes itself): try the reel again then.
  const offSignedIn = on("instagram", (e) => { if (e && e.signed_in && box.isConnected) retry(); });
  const gone = new MutationObserver(() => { box.remove(); gone.disconnect(); offSignedIn(); });
  gone.observe(counter, { childList: true, characterData: true, subtree: true });
}

// Which reels have been watched to the end, on this device.
const WATCHED = "reels:watched";
function watched() {
  try { return new Set(JSON.parse(localStorage.getItem(WATCHED)) || []); } catch { return new Set(); }
}
function markWatched(id) {
  const set = watched();
  set.add(String(id));
  try { localStorage.setItem(WATCHED, JSON.stringify([...set].slice(-500))); } catch { /* storage unavailable */ }
}

/** The reels in the library, oldest first (the order they were found in). */
async function loadReels() {
  const feed = (await api("/feeds")).find((f) => f.url === REELS_FEED);
  if (!feed) return [];
  const data = await api(`/episodes?feed_id=${feed.id}&limit=500`);
  return data.items.filter((ep) => ep.status === "done").reverse();
}

export async function render(view, params) {
  return params.play ? renderPlayer(view, params) : renderList(view);
}

// ------------------------------------------------------------------------------------- the list

const MODES = [
  ["popular", (lang) => `Popular in ${lang} right now`, "Comedy first. The app looks at what is doing well on Instagram each time, so this list changes."],
  ["mine", () => "Only my creators", "Just the creators you have ticked below."],
  ["mix", () => "A mix of both", "Your creators first, topped up with popular ones."],
  ["saved", () => "From my Instagram saves", "Reels you saved on Instagram yourself: one of your collections, or everything you've saved."],
];

async function renderList(view) {
  const phone = platform === "android";
  view.append(h(`
    <div class="page reels">
      <div class="disc-head">
        <a class="btn ghost" href="#/library" title="Back to the library">←</a>
        <div class="meta">
          <h1>${icon("video", 26)} Reels</h1>
          <div class="small muted">Short Instagram videos in the language you're studying, with every word clickable.
          They play from Instagram itself; only the words are kept.</div>
        </div>
      </div>
      <div id="reel-get"></div>
      <div class="reel-listhead">
        <h2>Your reels <span class="n" id="reel-count"></span></h2>
        <a class="btn primary" id="reel-watch" hidden>▶ Watch</a>
      </div>
      <div class="episodes" id="reel-list"></div>
    </div>`));
  const $ = (sel) => view.querySelector(sel);
  let info = null;
  let poll = 0;
  // "From my Instagram saves": the posts of the collection last looked at, and the ones ticked.
  let saved = { collection: "", posts: [], at: 0 };
  const picked = new Set();
  let choosing = "";   // the collection just chosen from the list, while Instagram is being read
  let lastAsk = null;  // the last thing asked of Instagram, to ask again once the user has signed in
  let askedForCollections = false;
  // How many reels to get: for "Get N reels" and "Get N random reels". Remembered on this device.
  const COUNT_KEY = "reels:count";
  const cleanCount = (n) => Math.max(1, Math.min(30, Math.round(Number(n)) || 10));
  let howMany = 10;
  try { howMany = cleanCount(localStorage.getItem(COUNT_KEY) || 10); } catch { /* storage unavailable */ }
  const loadSaved = async () => { try { saved = await api("/reels/saved"); } catch { /* keep what we had */ } };

  async function drawList() {
    const reels = await loadReels();
    const seen = watched();
    const list = $("#reel-list");
    list.innerHTML = "";
    $("#reel-count").textContent = reels.length || "";
    const first = reels.find((ep) => !seen.has(String(ep.id))) || reels[0];
    const watch = $("#reel-watch");
    watch.hidden = !reels.length;
    if (first) {
      watch.href = `#/reels/play?at=${first.id}`;
      watch.textContent = seen.has(String(first.id)) ? "▶ Watch again from the start" : reels.some((ep) => seen.has(String(ep.id))) ? "▶ Carry on watching" : "▶ Watch";
    }
    if (!reels.length) {
      list.append(h(`<div class="empty">${info && info.web
        ? "No reels yet. Paste a reel's link above, or add reels in the Tamkeen app: they arrive here after a sync."
        : phone && info && info.available
        ? "No reels yet. Press “Get random reels” above, or choose one of your Instagram collections and tick the reels you want."
        : phone
        ? "No reels yet. They are found on your computer: open Tamkeen there, go to Library → Reels and press “Get 10 reels”. They arrive here the next time both sync."
        : "No reels yet. Choose which reels you want above and press “Get reels”, or press “Get random reels”."}</div>`));
      return;
    }
    for (const ep of [...reels].reverse()) { // newest at the top of the list
      const row = h(`<div class="ep reel-row">
        <div class="ph">${icon("video", 22)}</div>
        <div class="info"><div class="title" dir="auto"><a href="#/reels/play?at=${ep.id}"></a></div>
          <div class="sub">@${esc(ep.description || "")}${ep.duration ? ` · ${ep.duration < 60 ? `${Math.round(ep.duration)} s` : fmtDuration(ep.duration)}` : ""}${seen.has(String(ep.id)) ? " · watched" : ""}${needsSignIn(ep) ? " · plays when signed in to Instagram" : ""}</div></div>
        <div class="status"><div class="row"><a class="btn primary" href="#/reels/play?at=${ep.id}">Watch</a>
          <button type="button" class="ghost danger">Delete</button></div></div>
      </div>`);
      row.querySelector(".title a").textContent = ep.title;
      row.querySelector("button").onclick = async () => {
        try { await api(`/episodes/${ep.id}`, { method: "DELETE" }); row.remove(); } catch (e) { toast(e.message, { error: true }); }
      };
      list.append(row);
    }
  }

  // ----- getting a batch (computer only) -----
  function drawGet() {
    const box = $("#reel-get");
    box.innerHTML = "";
    if (!info) return;
    if (info.web) { drawWeb(box); return; }
    if (info.computer_only) {
      box.append(h(`<p class="card small" role="note"></p>`));
      box.lastChild.textContent = info.computer_only;
      return;
    }
    if (!info.available) {
      box.append(h(`<p class="card small muted">${phone
        ? `New reels are found and transcribed by Tamkeen on your computer, then sync to this phone. To pick reels from your Instagram
           saves right here instead, turn on <a href="#/settings?s=listening&show=who">Cloud transcription in Settings</a>.`
        : "Getting reels works in the installed Tamkeen app on your computer (it needs its own Instagram window)."}</p>`));
      return;
    }
    const st = info.status || {};
    const busy = !!st.running;
    const chosen = new Set(info.selected);
    const modes = MODES.filter(([key]) => !info.modes || info.modes.includes(key));
    const card = h(`<div class="card reel-getcard">
      <strong>${modes.length > 1 ? "Which reels?" : "Reels from my Instagram saves"}</strong>
      <div class="reel-modes" ${modes.length > 1 ? "" : "hidden"}>${modes.map(([key, label, hint]) => `<label class="reel-mode" title="${esc(hint)}">
        <input type="radio" name="reel-mode" value="${key}" ${info.mode === key ? "checked" : ""}> <span>${esc(label(info.language_name))}</span></label>`).join("")}</div>
      <div class="reel-creators" ${modes.some(([key]) => key === "mine" || key === "mix") ? "" : "hidden"}>
        <details class="reel-drop" id="reel-drop">
          <summary><strong>My creators</strong> <span class="muted">${info.mine.length ? `${chosen.size} of ${info.mine.length} chosen` : "none yet"}</span></summary>
          <div class="reel-droplist" id="reel-mine"></div>
          <form class="row" id="reel-add"><input type="text" placeholder="Instagram username, e.g. @creator" autocomplete="off" required>
            <button type="submit">Add</button></form>
          <div class="small muted" id="reel-pop-label" hidden>Popular in ${esc(info.language_name)} right now (press + to follow one):</div>
          <div class="reel-chips" id="reel-popular"></div>
        </details>
      </div>
      <div class="reel-saved" id="reel-saved" ${info.mode === "saved" ? "" : "hidden"}>
        <strong>1. Choose a collection</strong>
        <div class="row reel-collrow" id="reel-colls"></div>
        <div id="reel-picker"></div>
      </div>
      <div class="row reel-howmany" id="reel-howmany" ${info.random || info.mode !== "saved" ? "" : "hidden"}>
        <strong>How many?</strong>
        <span class="reel-count">
          <button type="button" id="reel-less" title="One fewer" ${busy ? "disabled" : ""}>−</button>
          <input type="number" id="reel-n-want" min="1" max="30" step="1" inputmode="numeric" value="${howMany}" aria-label="How many reels to get" ${busy ? "disabled" : ""}>
          <button type="button" id="reel-more" title="One more" ${busy ? "disabled" : ""}>+</button>
        </span>
        <button type="button" class="primary" id="reel-random" ${busy ? "disabled" : ""} ${info.random ? "" : "hidden"}
          title="Reels in ${esc(info.language_name)} on all sorts of everyday subjects, found by searching Instagram for a few words picked at random. Different every time."></button>
      </div>
      <div class="row">
        <button type="button" class="primary" id="reel-go" ${busy ? "disabled" : ""} ${info.mode === "saved" ? "hidden" : ""}></button>
        <button type="button" class="primary" id="reel-send" ${info.mode === "saved" ? "" : "hidden"} disabled></button>
        <button type="button" class="ghost" id="reel-stop" ${busy ? "" : "hidden"}>Stop</button>
        <button type="button" class="primary" id="reel-signin" ${st.needs_signin && !busy ? "" : "hidden"}>Sign in to Instagram</button>
        <span class="small muted" id="reel-status"></span>
      </div>
      <div class="reel-log" id="reel-log"></div>
      ${info.model_ready ? "" : `<p class="small" style="color:var(--danger)">Choose a transcription model first (Settings → Model): reels are listened to with it.</p>`}
    </div>`);
    box.append(card);
    const q = (sel) => card.querySelector(sel);
    const change = async (body) => {
      try { info = await api("/reels/choices", { method: "PUT", body }); drawGet(); view.querySelector("#reel-drop").open = true; }
      catch (e) { toast(e.message, { error: true }); }
    };
    card.querySelectorAll('input[name="reel-mode"]').forEach((r) => {
      r.onchange = () => api("/reels/choices", { method: "PUT", body: { mode: r.value } }).then((v) => { info = v; drawGet(); });
    });
    drawSaved(card, busy);
    const mine = q("#reel-mine");
    for (const name of info.mine) {
      const row = h(`<label class="reel-pick"><input type="checkbox" ${chosen.has(name) ? "checked" : ""}> <span>@${esc(name)}</span>
        <button type="button" class="ghost icon" title="Remove from my creators">✕</button></label>`);
      row.querySelector("input").onchange = (e) => {
        e.target.checked ? chosen.add(name) : chosen.delete(name);
        change({ selected: [...chosen] });
      };
      row.querySelector("button").onclick = (e) => { e.preventDefault(); change({ remove: name }); };
      mine.append(row);
    }
    if (!info.mine.length) mine.append(h(`<p class="small muted">Add creators you like here, or press + on a popular one below.</p>`));
    q("#reel-add").onsubmit = (e) => { e.preventDefault(); change({ add: e.target.querySelector("input").value }); };
    const popular = info.popular.filter((c) => !info.mine.includes(c.username)).slice(0, 14);
    q("#reel-pop-label").hidden = !popular.length;
    for (const c of popular) {
      const chip = h(`<button type="button" class="reel-chip" title="Add @${esc(c.username)} to my creators">+ @${esc(c.username)}</button>`);
      chip.onclick = () => change({ add: c.username });
      q("#reel-popular").append(chip);
    }
    // The counter: − and +, or type a number (1 to 30). Both buttons say how many they will get.
    const want = q("#reel-n-want");
    const paintCount = () => {
      q("#reel-go").textContent = busy ? "Getting reels…" : `Get ${howMany} reel${howMany === 1 ? "" : "s"}`;
      q("#reel-random").textContent = `Get ${howMany} random ${info.language_name} reel${howMany === 1 ? "" : "s"}`;
    };
    const setCount = (n, typed = false) => {
      howMany = cleanCount(n);
      if (!typed) want.value = howMany;
      try { localStorage.setItem(COUNT_KEY, String(howMany)); } catch { /* storage unavailable */ }
      paintCount();
    };
    q("#reel-less").onclick = () => setCount(howMany - 1);
    q("#reel-more").onclick = () => setCount(howMany + 1);
    want.oninput = () => { if (want.value !== "") setCount(want.value, true); };
    want.onchange = () => setCount(want.value || howMany);
    paintCount();
    q("#reel-go").onclick = async () => {
      try { info.status = await api("/reels/batch", { method: "POST", body: { count: howMany } }); drawGet(); watchBatch(); }
      catch (e) { toast(e.message, { error: true }); }
    };
    q("#reel-random").onclick = () => start("/reels/random", { count: howMany });
    q("#reel-stop").onclick = () => api("/reels/cancel", { method: "POST" }).catch(() => {});
    // On the phone the sign-in is made in Tamkeen's own browser, which shares it with the reel window.
    q("#reel-signin").onclick = () => openInstagramSignIn().catch((e) => toast(e.message, { error: true }));
    q("#reel-status").textContent = st.state && st.state !== "idle" ? st.message || "" : "";
    const log = q("#reel-log");
    for (const item of (st.log || []).slice().reverse()) {
      const line = h(`<div class="reel-logline${item.kept ? " kept" : ""}"><span class="mark">${item.kept ? "✓" : "–"}</span>
        <span class="who">@${esc(item.creator)}</span> <span class="what" dir="auto"></span> <span class="why muted"></span></div>`);
      line.querySelector(".what").textContent = item.title;
      line.querySelector(".why").textContent = item.kept ? item.outcome : `skipped: ${item.outcome}`;
      log.append(line);
    }
  }

  // ----- the web app: add a public reel from its link -----
  function drawWeb(box) {
    const st = info.status || {};
    const busy = !!st.running;
    const card = h(`<div class="card stack reel-webcard">
      <strong>Add a reel</strong>
      <form class="row" id="reel-link" style="gap:8px">
        <input type="url" inputmode="url" placeholder="Paste an Instagram reel link" aria-label="Instagram reel link" style="flex:1" ${busy || !info.available ? "disabled" : ""}>
        <button class="primary" type="submit" ${busy || !info.available ? "disabled" : ""}>${busy ? "Adding…" : "Add"}</button>
      </form>
      ${info.computer_only ? `<p class="small">${esc(info.computer_only)}</p>`
        : info.available ? "" : `<p class="small">Turn on <a href="#/settings?s=listening&show=who">Cloud transcription in Settings</a> first: it is what listens to the reel and writes its words.</p>`}
      <div class="small muted" id="reel-status"></div>
      <div id="reel-log"></div>
      <p class="small muted">On the web you can watch your reels and add public ones from their link. Picking reels from your
        Instagram saves, random reels, and reels with a song from Instagram's music library need the Tamkeen app on your phone
        or computer. Reels added there show up here after a sync.</p>
    </div>`);
    box.append(card);
    card.querySelector("#reel-status").textContent = st.state && st.state !== "idle" ? st.message || "" : "";
    for (const item of (st.log || []).slice().reverse()) {
      const line = h(`<div class="reel-logline${item.kept ? " kept" : ""}"><span class="mark">${item.kept ? "✓" : "–"}</span>
        <span class="who">@${esc(item.creator)}</span> <span class="what" dir="auto"></span> <span class="why muted"></span></div>`);
      line.querySelector(".what").textContent = item.title;
      line.querySelector(".why").textContent = item.kept ? item.outcome : `skipped: ${item.outcome}`;
      card.querySelector("#reel-log").append(line);
    }
    card.querySelector("#reel-link").onsubmit = (e) => {
      e.preventDefault();
      const link = e.target.querySelector("input").value.trim();
      const m = /instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,40})/.exec(link);
      if (!m) { toast("Paste a link to an Instagram reel, like https://www.instagram.com/reel/…", { error: true }); return; }
      start("/reels/saved/send", { codes: [m[1]] });
    };
  }

  // ----- "From my Instagram saves": choose a collection, then tick its reels -----
  const start = async (path, body) => {
    lastAsk = { path, body };
    try { info.status = await api(path, { method: "POST", body }); drawGet(); watchBatch(); }
    catch (e) { toast(e.message, { error: true }); }
  };
  function drawSaved(card, busy) {
    if (info.mode !== "saved") return;
    const q = (sel) => card.querySelector(sel);
    const colls = q("#reel-colls");
    const known = info.collections || [];
    // A drop-down list of the collections by name. While one is being read it shows the one asked for;
    // otherwise the one whose reels are listed below.
    const showing = busy && choosing ? choosing : saved.at ? saved.collection : "";
    const select = h(`<select id="reel-coll" aria-label="Your Instagram collections" ${busy ? "disabled" : ""}>
      <option value="">${known.length ? "Choose a collection…" : "Choose…"}</option></select>`);
    const option = (label, id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = label;
      o.selected = showing === id;
      select.append(o);
    };
    for (const c of known) option(c.name, c.id);
    option("Everything I've saved", "all");
    select.onchange = () => {
      if (!select.value) return;
      choosing = select.value;
      picked.clear();
      start("/reels/saved/list", { collection: select.value });
    };
    colls.append(select);
    const refresh = h(`<button type="button" class="${known.length ? "ghost" : "primary"}" id="reel-find" ${busy ? "disabled" : ""}
      title="Look through your Instagram saves${known.length ? " again" : ""} for your collections">${known.length ? "↻ Look again" : "Find my collections"}</button>`);
    refresh.onclick = () => { choosing = ""; start("/reels/collections"); };
    colls.append(refresh);
    // The first time this choice is opened, fetch the list of collections without being asked.
    if (!(info.collections || []).length && !busy && !askedForCollections) {
      askedForCollections = true;
      start("/reels/collections");
      return;
    }

    const box = q("#reel-picker");
    const send = q("#reel-send");
    const name = saved.collection === "all" ? "everything you've saved" : ((info.collections || []).find((c) => c.id === saved.collection) || {}).name;
    if (!saved.at || !name) {
      box.append(h(`<p class="small muted hint">${known.length ? "Choose one of your collections from the list above." : "Press “Find my collections” to fill the list with the names of your Instagram collections, then choose one."}
        Tamkeen reads it on Instagram and lists its reels here, for you to tick the ones you want.</p>`));
      send.textContent = info.phone ? "Get the ticked reels" : "Send the ticked reels to my phone";
      return;
    }
    const unusable = (p) => p.have || p.video === false || !!p.skipped;
    const usable = saved.posts.filter((p) => !unusable(p));
    for (const code of [...picked]) if (!usable.some((p) => p.code === code)) picked.delete(code);
    const head = h(`<div class="reel-pickhead"><strong>2. Tick the reels you want</strong> <span class="muted small"></span>
      <span class="spacer"></span><label class="switch small"><input type="checkbox" id="reel-all" ${busy || !usable.length ? "disabled" : ""}> All</label></div>`);
    head.querySelector("span").textContent = `in “${name}” (${saved.posts.length})`;
    box.append(head);
    const list = h(`<div class="reel-picks"></div>`);
    const paint = () => {
      send.disabled = busy || !picked.size;
      const n = `${picked.size} reel${picked.size === 1 ? "" : "s"}`;
      send.textContent = busy ? "Working…" : info.phone ? (picked.size ? `Get ${n}` : "Get the ticked reels")
        : picked.size ? `Send ${n} to my phone` : "Send the ticked reels to my phone";
      head.querySelector("#reel-all").checked = usable.length > 0 && picked.size === usable.length;
    };
    for (const p of saved.posts) {
      const off = unusable(p);
      const row = h(`<label class="reel-pickrow${off ? " off" : ""}">
        <input type="checkbox" ${picked.has(p.code) ? "checked" : ""} ${off || busy ? "disabled" : ""}>
        ${p.thumb ? `<img src="${p.thumb.startsWith("data:image/") ? esc(p.thumb) : `/api/reels/thumb?u=${encodeURIComponent(p.thumb)}`}" alt="" loading="lazy">` : `<span class="ph">${icon("video", 20)}</span>`}
        <span class="txt"><span class="who">${p.user ? `@${esc(p.user)}` : "Instagram reel"}${p.seconds ? ` · ${p.seconds < 60 ? `${p.seconds} s` : fmtDuration(p.seconds)}` : ""}</span>
          <span class="cap" dir="auto"></span></span>
        <span class="tag small muted">${p.have ? "Already in your reels" : p.video === false ? "Not a video" : p.skipped ? `Can't be used: ${esc(p.skipped)}` : ""}</span>
      </label>`);
      row.querySelector(".cap").textContent = p.caption || "";
      row.querySelector("img")?.addEventListener("error", (e) => { e.target.replaceWith(h(`<span class="ph">${icon("video", 20)}</span>`)); });
      row.querySelector("input").onchange = (e) => { e.target.checked ? picked.add(p.code) : picked.delete(p.code); paint(); };
      list.append(row);
    }
    if (!saved.posts.length) list.append(h(`<p class="small muted hint">Nothing is saved there yet.</p>`));
    box.append(list);
    box.append(h(`<p class="small muted hint">Your own saves are never skipped for their language, so reels that mix ${esc(info.language_name)} with
      English are kept too. A reel is only left out if it has no words at all; the list below says which. Some reels (mostly ones with a
      song from Instagram's music library) only play for people signed in to Instagram: those are kept too, and play on your phone once
      you have signed in to Instagram there.${info.phone ? ` Each reel's video is sent once to your cloud transcription provider, which writes
      down its words; a fraction of a cent a reel.` : ""}</p>`));
    head.querySelector("#reel-all").onchange = (e) => {
      picked.clear();
      if (e.target.checked) for (const p of usable) picked.add(p.code);
      list.querySelectorAll("input").forEach((box2, i) => { box2.checked = picked.has(saved.posts[i].code); });
      paint();
    };
    send.onclick = () => {
      const codes = saved.posts.map((p) => p.code).filter((c) => picked.has(c)); // in the collection's own order
      start("/reels/saved/send", { codes });
    };
    paint();
  }

  let lastKept = -1;
  function onStatus(st) {
    if (!info) return;
    const was = info.status && info.status.running;
    info.status = st;
    const open = view.querySelector("#reel-drop")?.open;
    const scrolled = view.querySelector(".reel-picks")?.scrollTop || 0;
    drawGet();
    if (open) view.querySelector("#reel-drop").open = true;
    if (scrolled && view.querySelector(".reel-picks")) view.querySelector(".reel-picks").scrollTop = scrolled;
    if (st.kept !== lastKept || (was && !st.running)) { lastKept = st.kept; drawList(); }
    if (was && !st.running) {
      choosing = "";
      picked.clear(); // what was ticked has been dealt with
      // The popular list, the collections, the collection's reels and which are "already in your reels" may all have changed.
      Promise.all([api("/reels").then((v) => { info = v; }), loadSaved()]).then(() => drawGet()).catch(() => {});
      if (st.state === "error" || st.state === "stopped") toast(st.message, { error: st.state === "error" });
    }
  }
  function watchBatch() {
    clearInterval(poll); // a fallback for when live events aren't arriving
    poll = setInterval(async () => {
      try { const st = (await api("/reels")).status; onStatus(st); if (!st.running) clearInterval(poll); } catch { /* try again */ }
    }, 3000);
  }
  const offReels = on("reels", onStatus);
  const offFeeds = on("feeds", () => drawList());
  // The other device's collections arrived with the library sync: show its list (and its choice).
  const offCollections = on("reels_collections", () => {
    if (!info || !info.available || (info.status && info.status.running)) return;
    api("/reels").then((v) => { info = v; drawGet(); }).catch(() => {});
  });
  // The phone's sign-in browser closes by itself once the user is signed in to Instagram, and says
  // so: whatever was asked for before (finding the collections, a collection's reels) is asked again.
  const offSignedIn = on("instagram", (e) => {
    const st = (info && info.status) || {};
    if (!e || !e.signed_in || !st.needs_signin || st.running) return;
    start(lastAsk ? lastAsk.path : "/reels/collections", lastAsk ? lastAsk.body : undefined);
  });

  try { info = await api("/reels"); } catch { info = { available: false }; }
  if (info.available) await loadSaved();
  drawGet();
  await drawList();
  if (info.status && info.status.running) watchBatch();
  return () => { offReels(); offFeeds(); offCollections(); offSignedIn(); clearInterval(poll); };
}

// ------------------------------------------------------------------------------------ the player

async function renderPlayer(view, { query }) {
  const everyReel = await loadReels();
  // "Watch these reels" in the Library: only the ticked ones, in the order they were listed there.
  const only = (query.get("only") || "").split(",").filter(Boolean);
  const chosen = only.map((id) => everyReel.find((ep) => String(ep.id) === id)).filter(Boolean);
  const reels = chosen.length ? chosen : everyReel;
  const onlyParam = chosen.length ? `&only=${chosen.map((ep) => ep.id).join(",")}` : "";
  if (!reels.length) { location.hash = "#/reels"; return undefined; }
  let index = Math.max(0, reels.findIndex((ep) => String(ep.id) === String(query.get("at"))));

  view.append(h(`
    <div class="reelplay">
      <div class="reel-top">
        <a class="btn ghost" href="${chosen.length && chosen[0].feed_id ? `#/feed/${chosen[0].feed_id}` : "#/reels"}" title="Back to the list">←</a>
        <div class="reel-title"><span id="reel-n"></span> <span class="muted" id="reel-who"></span></div>
        <button type="button" class="ghost" id="reel-prev" title="Previous reel">‹</button>
        <button type="button" class="ghost" id="reel-next" title="Next reel">›</button>
      </div>
      <div class="reel-stage" id="reel-stage"></div>
      <div class="reel-bar">
        <div class="reel-words ar" id="reel-words" tabindex="0"></div>
        <div class="reel-pop" id="reel-pop"></div>
      </div>
      <div class="reel-controls" id="reel-controls">
        <div class="rc-seekrow">
          <span class="t" id="rc-cur">0:00</span>
          <input type="range" id="rc-seek" min="0" max="1" step="0.1" value="0" aria-label="Where in the reel">
          <span class="t" id="rc-dur">0:00</span>
        </div>
        <div class="rc-btnrow">
          <span class="rc-side" id="rc-left"></span>
          <span class="rc-mid">
            <button type="button" id="rc-back" title="Back 5 seconds">⟲ 5s</button>
            <button type="button" id="rc-play" class="play primary" title="Play / pause">▶</button>
            <button type="button" id="rc-fwd" title="Forward 5 seconds">5s ⟳</button>
          </span>
          <span class="rc-side" id="rc-right"></span>
        </div>
      </div>
    </div>`));
  const $ = (sel) => view.querySelector(sel);
  const stage = $("#reel-stage");
  const wordsEl = $("#reel-words");
  const surface = reelSurface(); // null where reels can't be played (the computer)
  if (!surface) view.querySelector(".reelplay").classList.add("no-video");

  // ----- the reel being shown -----
  let cur = null; // {ep, lang, starts, ends, segOf, texts, els}
  let seen = null; // which of this reel's words are new to the learner (they are drawn in purple)
  let curIdx = -1;
  let clipEnd = null;
  let seenEnds = 0;
  let seenNav = "";
  let loadedAt = 0;
  let skipping = false;
  let failsInRow = 0; // reels in a row that couldn't be played: when every one has failed, stop going round
  let playing = false;
  let disposed = false;
  let opened = false;
  let target = null; // the word the popup is about: {i, j, si, sj, text}

  // The reel window lies on top of the app's own page, so a menu the page opens (the list of
  // friends to send a reel to) would be hidden behind it: while a menu is open the reel window
  // waits below the screen, and comes back when the menu closes.
  const menu = document.getElementById("ctxmenu");
  const menuOpen = () => !!menu && !menu.hidden;
  const stageRect = () => {
    const r = stage.getBoundingClientRect();
    return { top: menuOpen() ? innerHeight + 50 : r.top, left: r.left, width: r.width, height: r.height };
  };

  // Words saved while this player is open (per reel), so a word's popup shows "Saved" again.
  const savedHere = new Set();
  const savedKey = (i, j) => `${cur.ep.id}:${i}-${j}`;

  const bubble = createWordBubble($("#reel-pop"), {
    noAudio: !surface,
    fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
    // Misheard words, put right in this reel's words when a lookup finds them (fixword.js).
    onCorrect: async (def) => {
      const t = target;
      const done = cur && cur.fixer ? await cur.fixer.apply(t, def) : null;
      if (done && t === target) t.text = done.word;
      return done;
    },
    onUndoCorrect: async (fx) => {
      const t = target;
      const back = await cur.fixer.undo(t, fx.from);
      if (t === target) t.text = back.word;
      return back;
    },
    onPlayWord: () => target && playClip(...wordClip({ starts: cur.starts, ends: cur.ends, texts: cur.texts, i: target.i, j: target.j, lang: cur.lang })),
    onPlaySentence: () => target && playClip(cur.starts[target.si], cur.ends[target.sj]),
    onPlayFrom: () => { if (target && surface) { clipEnd = null; surface.do("seek", cur.starts[target.i]); surface.do("play"); } },
    onSettings: () => (location.hash = "#/settings?s=words"),
    onSave: async (def) => {
      const t = target;
      try {
        await api("/vocab", { method: "POST", body: {
          ...vocabFromDefinition(def, t.text, cur.lang), sentence: sentence(t.si, t.sj), episode_id: cur.ep.id,
          start: cur.starts[t.i], end: cur.ends[t.j], sent_start: cur.starts[t.si], sent_end: cur.ends[t.sj] } });
        savedHere.add(savedKey(t.i, t.j)); // no message: the popup's Save button says "Saved"
        reward({ type: "save" }, cur.els[t.i]);
        if (seen) seen.markSeen(t.i, t.j);
      } catch (e) {
        toast(e.message, { error: true });
        throw e;
      }
    },
  });
  // Quick or detailed lookup: with the reel's own controls where there are any (the phone), in
  // its compact form at the left end of the buttons row; in the top line on the computer, which
  // has no controls row.
  if (surface) $("#rc-left").append(lookupToggle({ compact: true }));
  else $("#reel-prev").before(lookupToggle());
  // Arabic reels: the vowels switch beside it (vowels.js), and their vowels once the computer has made them.
  const redrawVowels = () => {
    if (cur) paintWords(cur.els, displayWords(cur.texts, cur.vowels, (i) => cur.segOf[i]));
  };
  const vowelsBtn = vowelsButton("ar", redrawVowels, () => cur && cur.vowels);
  vowelsBtn.hidden = true;
  if (surface) $("#rc-left").append(vowelsBtn);
  else $("#reel-prev").before(vowelsBtn);
  const offVowels = on("vowels", async (d) => {
    const reel = cur;
    if (!reel || !d || String(d.episode_id) !== String(reel.ep.id)) return;
    try {
      const r = await api(`/episodes/${reel.ep.id}/vowels`);
      if (r && r.vowels && cur === reel) { reel.vowels = r.vowels; redrawVowels(); vowelsBtn.repaint(); }
    } catch { /* shown next time */ }
  });
  // Send the reel being watched to a friend (components/sendmedia.js): the paper-airplane button
  // after the title. A function, because the reel changes with Next and Previous.
  $(".reel-title").after(sendButton(() => {
    const item = mediaFromEpisode(reels[index]);
    return item && { ...item, language: episodeLanguage(reels[index]) };
  }));
  // (The popup lives in the right half of the bar. The owner had the "Tap a word to see what it means."
  // hint that filled it while closed taken away.)

  const sentence = (a, b) => joinWords(cur.texts.slice(a, b + 1), cur.lang);

  // ----- the controls under the bar: always on screen, also while a word's popup is open -----
  let last = null;      // what the reel last said about itself
  let dragging = false; // a finger is on the slider
  // The last control is the switch the other player has in its popup: after a tapped word has
  // played, pause there or keep playing (one choice for the whole app). Flipping it while a popup
  // is open acts straight away, as a pause / play button would.
  $("#rc-right").append(pauseSwitch((pause) => {
    clipEnd = null;
    if (!surface || !last || !bubble.open) return;
    if (pause && !last.paused) surface.do("pause");
    else if (!pause && last.paused) surface.do("play");
  }));
  const jumpTo = (t) => {
    if (!surface || !last) return;
    clipEnd = null;
    surface.do("seek", Math.max(0, Math.min(t, Math.max(0, (last.d || t) - 0.3))));
  };
  $("#rc-play").onclick = () => { if (surface) { clipEnd = null; surface.do(last && !last.paused ? "pause" : "play"); } };
  $("#rc-back").onclick = () => last && jumpTo(last.t - 5);
  $("#rc-fwd").onclick = () => last && jumpTo(last.t + 5);
  $("#rc-seek").addEventListener("input", (e) => { dragging = true; $("#rc-cur").textContent = formatTime(Number(e.target.value)); });
  $("#rc-seek").addEventListener("change", (e) => { dragging = false; jumpTo(Number(e.target.value)); });
  function paintControls(s) {
    last = s;
    $("#rc-play").textContent = s.paused ? "▶" : "❚❚";
    if (s.d) { $("#rc-seek").max = String(s.d); $("#rc-dur").textContent = formatTime(s.d); }
    if (!dragging) { $("#rc-seek").value = String(s.t); $("#rc-cur").textContent = formatTime(s.t); }
  }

  // Play a word or a sentence, then pause right after it (or keep playing from there, if that is
  // what the switch says).
  function playClip(start, end) {
    if (!surface) return;
    clipEnd = pauseAfterWord() ? end + 0.08 : null;
    surface.do("seek", Math.max(0, start - 0.05));
    surface.do("play");
  }

  /** Word i of the current reel, with its sentence: what a lookup is asked about. */
  function contextAt(i, j = i) {
    const [si, sj] = sentenceBounds(cur.texts, cur.segOf, i, j);
    const prev = si > 0 ? sentenceBounds(cur.texts, cur.segOf, si - 1) : null;
    const next = sj < cur.texts.length - 1 ? sentenceBounds(cur.texts, cur.segOf, sj + 1) : null;
    const word = joinWords(cur.texts.slice(i, j + 1), cur.lang).replace(EDGE_PUNCT, "") || cur.texts[i];
    return { si, sj, word, ctx: {
      word, lang: cur.lang, marked: markWord(cur.texts.slice(si, sj + 1), i - si, j - si, cur.lang),
      before: prev ? sentence(prev[0], prev[1]) : "", after: next ? sentence(next[0], next[1]) : "",
      podcast: `@${cur.ep.description || "Instagram"}`, episode: cur.ep.title,
    } };
  }

  function define(i) {
    const { si, sj, word, ctx } = contextAt(i);
    target = { i, j: i, si, sj, text: word };
    buzz("tick");
    playClip(...wordClip({ starts: cur.starts, ends: cur.ends, texts: cur.texts, i, lang: cur.lang }));
    bubble.show(cur.els[i], ctx, { saved: savedHere.has(savedKey(i, i)) });
    reward({ type: "word", key: `${cur.lang}:${word.toLowerCase()}` }, cur.els[i]);
    if (seen) seen.markSeen(i, i); // looked up: this word, in all its forms, is no longer new
  }
  wordsEl.addEventListener("click", (e) => {
    const el = e.target.closest(".w");
    if (el && cur) define(Number(el.dataset.i));
  });

  function setActive(idx) {
    if (!cur || idx === curIdx) return;
    if (curIdx >= 0 && cur.els[curIdx]) cur.els[curIdx].classList.remove("cur");
    curIdx = idx;
    if (idx < 0) return;
    const el = cur.els[idx];
    el.classList.add("cur");
    // Keep the tapped word in view while its popup is open (unless the choice is to keep playing:
    // then the words carry on following the reel), and leave the words alone for a moment after a
    // finger has slid them.
    if (bubble.open && pauseAfterWord()) return;
    if (Date.now() - slidAt < 3000) return;
    const box = wordsEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (surface) { // the phone: one line, the current word kept in the middle
      wordsEl.scrollBy({ left: r.left + r.width / 2 - (box.left + box.width / 2), behavior: "smooth" });
      return;
    }
    if (r.top < box.top + 4 || r.bottom > box.bottom - 4) wordsEl.scrollTo({ top: wordsEl.scrollTop + r.top - box.top - box.height * 0.3, behavior: "smooth" });
  }
  let slidAt = 0;
  for (const type of ["touchstart", "wheel"]) wordsEl.addEventListener(type, () => { slidAt = Date.now(); }, { passive: true });

  async function show(i) {
    if (disposed) return;
    index = (i + reels.length) % reels.length;
    const ep = reels[index];
    // The same reel once more (its ordinary page after the embed page, or "Try again"): its words
    // stay on screen as they are. Drawing them again made the bar flash, and their colours fade in again.
    const again = !!cur && cur.ep === ep;
    bubble.hide();
    clipEnd = null;
    target = null;
    $("#reel-n").textContent = `${index + 1} / ${reels.length}`;
    $("#reel-who").textContent = `@${ep.description || ""}`;
    history.replaceState(null, "", `#/reels/play?at=${ep.id}${onlyParam}`); // so "back" and a reopen land on this reel
    if (!again) {
      curIdx = -1;
      if (seen) { seen.close(); seen = null; } // the previous reel's words are leaving the screen
      wordsEl.innerHTML = `<p class="muted small">Loading the words…</p>`;
      let data;
      try { data = await api(`/episodes/${ep.id}/transcript`); } catch (e) { data = null; }
      if (disposed || reels[index] !== ep) return;
      const lang = episodeLanguage(ep);
      if (!data || !data.words.start.length) {
        cur = null;
        wordsEl.innerHTML = `<p class="muted small">This reel's words aren't on this device yet. Sync and try again.</p>`;
      } else {
        await readingsReady(lang); // Japanese and Chinese: the dictionary that splits them into words
        if (disposed || reels[index] !== ep) return;
        const segText = new Map(data.segments.map((s) => [s.idx, s.text]));
        const W = regroupWords(data.words, lang, true, (s) => segText.get(s));
        const shown = displayWords(W.text, data.vowels, (i) => W.seg[i]); // Arabic: drawn vowelled (vowels.js)
        const parts = [];
        let w = 0;
        for (const seg of data.segments) {
          parts.push(`<p class="seg">`);
          const first = w;
          while (w < W.start.length && W.seg[w] === seg.idx) {
            if (w > first) parts.push(gap(W.text[w - 1], W.text[w], lang));
            parts.push(`<span class="w" data-i="${w}">${wordHtml(shown[w], lang)}</span>`);
            w++;
          }
          parts.push("</p>");
        }
        wordsEl.innerHTML = parts.join("");
        wordsEl.scrollTop = 0;
        wordsEl.scrollLeft = 0;
        wordsEl.setAttribute("lang", lang);
        wordsEl.setAttribute("dir", langInfo(lang).dir);
        cur = { ep, lang, starts: Float64Array.from(W.start), ends: Float64Array.from(W.end), segOf: Int32Array.from(W.seg),
                texts: W.text, els: wordsEl.querySelectorAll(".w"), vowels: data.vowels || null };
        const reel = cur;
        cur.fixer = wordFixer({
          episodeId: ep.id, texts: W.text, editable: W === data.words, contextFor: contextAt,
          redraw: (first, last) => {
            for (let k = first; k <= last; k++) reel.els[k].textContent = reel.texts[k];
            if (seen && seen.analyze) seen.analyze();
          },
        });
        // The same colours as the other players: a word never tapped before is purple; a tap makes
        // every form of that word "seen" (js/lexicon/seen.js).
        seen = seenWords({ tokens: W.text, lang, els: cur.els });
      }
      vowelsBtn.hidden = !cur || cur.lang !== "ar";
      vowelsBtn.repaint();
    }
    if (!surface) {
      stage.innerHTML = "";
      const card = h(`<div class="reel-nophone"><p>Reels play on your phone, in the Tamkeen app.</p>
        <p class="small muted">Here you can read this reel's words and look them up.</p>
        <a class="btn" target="_blank" rel="noopener">Open this reel on Instagram ↗</a></div>`);
      card.querySelector("a").href = ep.audio_url;
      stage.append(card);
      return;
    }
    seenEnds = 0;
    seenNav = "";
    skipping = false;
    loadedAt = Date.now();
    if (!opened) { opened = true; await surface.open({ url: reelAddress(ep), el: stage, ...stageRect() }); }
    else await surface.load(reelAddress(ep));
  }

  function onState(s) {
    if (disposed || !cur && !surface) return;
    const ep = reels[index];
    // Instagram may answer a signed-out visit to a reel's ordinary page with its sign-in page, whose address no longer names the reel.
    const signInPage = !!s && /^\/accounts\//.test(String(s.page || "")) && reelAddress(ep) !== embedUrl(ep);
    if (!s || !(signInPage || String(s.page || "").includes(ep.guid))) return; // the page for the previous reel is still showing
    playing = !s.paused;
    paintControls(s);
    if (s.ready) failsInRow = 0;
    if (s.nav && s.nav !== seenNav) {
      seenNav = s.nav;
      show(index + (s.nav.startsWith("prev") ? -1 : 1));
      return;
    }
    if (s.error === "signin" && !skipping) { // Instagram wants a sign-in before it plays this one
      skipping = true;
      askSignIn($("#reel-pop"), $("#reel-n"), { retry: () => show(index), skip: reels.length > 1 ? () => show(index + 1) : null });
      return;
    }
    if (s.error === "novideo" && !skipping) {
      skipping = true;
      if (reelAddress(ep) === embedUrl(ep)) { // no video on its embed page: its ordinary page may still play it
        viaPage.add(String(ep.id));
        show(index);
        return;
      }
      // Its ordinary page has no video either, signed in: Instagram won't play it to this account
      // (removed, made private, or age-restricted for it). On to the next reel, if there is one
      // that hasn't failed too.
      failsInRow++;
      if (reels.length > 1 && failsInRow < reels.length) {
        toast("Instagram won't play that reel any more (removed, private or age-restricted). Skipping it.");
        show(index + 1);
      } else {
        toast(reels.length > 1 ? "Instagram won't play any of these reels right now." : "Instagram won't play this reel any more: it may have been removed, made private or be age-restricted.",
              { error: true });
      }
      return;
    }
    if (cur) {
      if (clipEnd !== null && s.t >= clipEnd) { clipEnd = null; surface.do("pause"); }
      setActive(activeWordIndex(cur.starts, cur.ends, s.t, 1.5));
    }
    if (s.ends > seenEnds) {
      seenEnds = s.ends;
      markWatched(ep.id);
      // A reel that ended because a word was being replayed stays; otherwise the next one starts.
      if (clipEnd === null && !bubble.open && !menuOpen() && Date.now() - loadedAt > 1500) show(index + 1);
      else clipEnd = null;
    }
  }

  const offState = surface ? surface.onState(onState) : () => {};
  $("#reel-prev").onclick = () => show(index - 1);
  $("#reel-next").onclick = () => show(index + 1);
  const onResize = () => { if (surface && opened) surface.layout(stageRect()); };
  window.addEventListener("resize", onResize);
  const settle = setInterval(onResize, 1500); // the bar can change the stage's size (fonts loading, keyboard)
  const menuWatch = new MutationObserver(onResize); // a menu opened or closed: see stageRect
  if (menu) menuWatch.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
  const stopStudy = trackStudy("listen", () => playing);
  const onOutside = (e) => { if (bubble.open && !e.target.closest(".word-bubble") && !e.target.closest(".w")) bubble.hide(); };
  document.addEventListener("pointerdown", onOutside);

  await show(index);
  return () => {
    disposed = true;
    offVowels();
    offState();
    stopStudy();
    clearInterval(settle);
    menuWatch.disconnect();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("pointerdown", onOutside);
    bubble.hide();
    if (seen) seen.close();
    if (surface) surface.close();
  };
}
