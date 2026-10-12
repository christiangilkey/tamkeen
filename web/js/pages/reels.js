// Reels: Instagram reels to study, one after another.
//
// On the computer this page is where a batch is made ("Get 10 reels": popular in the language
// being studied, only your own creators, or a mix; see app/reels_worker.py). Only each reel's
// address and its words are kept. On the phone it is where they are watched: the reel plays from
// Instagram's own embed page in a window at the top (reel-embed.js runs inside it), and below is
// a bar split in two: the words on the left, the word popup on the right. When a reel ends the
// next one starts by itself.

import { api, esc, h, on, toast, platform, buzz, reelSurface, fmtDuration } from "../app.js";
import { icon } from "../icons.js";
import { activeWordIndex, sentenceBounds, EDGE_PUNCT } from "../wordlookup.js";
import { episodeLanguage, gap, joinWords, langInfo, regroupWords, vocabFromDefinition } from "../languages.js";
import { createWordBubble } from "../components/wordbubble.js";
import { getDefinition } from "../define-service.js";
import { markWord } from "../definer.js";
import { reward, trackStudy } from "../game/game.js";

export const REEL_TYPE = "video/instagram";
export const REELS_FEED = "local:reels";
export const isReel = (ep) => (ep.audio_type || "") === REEL_TYPE;
const embedUrl = (ep) => `https://www.instagram.com/reel/${encodeURIComponent(ep.guid)}/embed/`;

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
      list.append(h(`<div class="empty">${phone
        ? "No reels yet. They are found on your computer: open Tamkeen there, go to Library → Reels and press “Get 10 reels”. They arrive here the next time both sync."
        : "No reels yet. Choose which reels you want above and press “Get 10 reels”."}</div>`));
      return;
    }
    for (const ep of [...reels].reverse()) { // newest at the top of the list
      const row = h(`<div class="ep reel-row">
        <div class="ph">${icon("video", 22)}</div>
        <div class="info"><div class="title" dir="auto"><a href="#/reels/play?at=${ep.id}"></a></div>
          <div class="sub">@${esc(ep.description || "")}${ep.duration ? ` · ${ep.duration < 60 ? `${Math.round(ep.duration)} s` : fmtDuration(ep.duration)}` : ""}${seen.has(String(ep.id)) ? " · watched" : ""}</div></div>
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
    if (!info.available) {
      box.append(h(`<p class="card small muted">${phone
        ? "New reels are found and transcribed by Tamkeen on your computer, then sync to this phone."
        : "Getting reels works in the installed Tamkeen app on your computer (it needs its own Instagram window)."}</p>`));
      return;
    }
    const st = info.status || {};
    const busy = !!st.running;
    const chosen = new Set(info.selected);
    const card = h(`<div class="card reel-getcard">
      <strong>Which reels?</strong>
      <div class="reel-modes">${MODES.map(([key, label, hint]) => `<label class="reel-mode" title="${esc(hint)}">
        <input type="radio" name="reel-mode" value="${key}" ${info.mode === key ? "checked" : ""}> <span>${esc(label(info.language_name))}</span></label>`).join("")}</div>
      <div class="reel-creators">
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
        <label for="reel-collection"><strong>Which saves?</strong></label>
        <div class="row">
          <select id="reel-collection">
            <option value="all">Everything I've saved</option>
            ${(info.collections || []).map((c) => `<option value="${esc(c.id)}" ${c.id === info.collection ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
          <button type="button" id="reel-find" ${busy ? "disabled" : ""} title="Tamkeen looks at your Saved page on Instagram (in its own Instagram window) and lists your collections here">${(info.collections || []).length ? "↻ Refresh the list" : "Find my collections"}</button>
        </div>
        <p class="small muted hint">Each press of “Get 10 reels” takes the next ones you haven't had yet. Your own saves are never skipped
        for their language, so reels that mix ${esc(info.language_name)} with English are kept too. Only saves that aren't videos, have no
        words at all, or can't be shown outside Instagram are left out.</p>
      </div>
      <div class="row">
        <button type="button" class="primary" id="reel-go" ${busy ? "disabled" : ""}>${busy ? (st.target ? "Getting reels…" : "Working…") : "Get 10 reels"}</button>
        <button type="button" class="ghost" id="reel-stop" ${busy ? "" : "hidden"}>Stop</button>
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
      r.onchange = () => api("/reels/choices", { method: "PUT", body: { mode: r.value } }).then((v) => { info = v; q("#reel-saved").hidden = v.mode !== "saved"; });
    });
    q("#reel-collection").onchange = (e) => api("/reels/choices", { method: "PUT", body: { collection: e.target.value } })
      .then((v) => { info = v; }).catch((err) => toast(err.message, { error: true }));
    q("#reel-find").onclick = async () => {
      try { info.status = await api("/reels/collections", { method: "POST" }); drawGet(); watchBatch(); }
      catch (e) { toast(e.message, { error: true }); }
    };
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
    q("#reel-go").onclick = async () => {
      try { info.status = await api("/reels/batch", { method: "POST", body: { count: 10 } }); drawGet(); watchBatch(); }
      catch (e) { toast(e.message, { error: true }); }
    };
    q("#reel-stop").onclick = () => api("/reels/cancel", { method: "POST" }).catch(() => {});
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

  let lastKept = -1;
  function onStatus(st) {
    if (!info) return;
    const was = info.status && info.status.running;
    info.status = st;
    const open = view.querySelector("#reel-drop")?.open;
    drawGet();
    if (open) view.querySelector("#reel-drop").open = true;
    if (st.kept !== lastKept || (was && !st.running)) { lastKept = st.kept; drawList(); }
    if (was && !st.running) {
      api("/reels").then((v) => { info = v; drawGet(); }).catch(() => {}); // the popular list may have changed
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

  try { info = await api("/reels"); } catch { info = { available: false }; }
  drawGet();
  await drawList();
  if (info.status && info.status.running) watchBatch();
  return () => { offReels(); offFeeds(); clearInterval(poll); };
}

// ------------------------------------------------------------------------------------ the player

async function renderPlayer(view, { query }) {
  const reels = await loadReels();
  if (!reels.length) { location.hash = "#/reels"; return undefined; }
  let index = Math.max(0, reels.findIndex((ep) => String(ep.id) === String(query.get("at"))));

  view.append(h(`
    <div class="reelplay">
      <div class="reel-top">
        <a class="btn ghost" href="#/reels" title="Back to the list">←</a>
        <div class="reel-title"><span id="reel-n"></span> <span class="muted" id="reel-who"></span></div>
        <button type="button" class="ghost" id="reel-prev" title="Previous reel">‹</button>
        <button type="button" class="ghost" id="reel-next" title="Next reel">›</button>
      </div>
      <div class="reel-stage" id="reel-stage"></div>
      <div class="reel-bar">
        <div class="reel-words ar" id="reel-words" tabindex="0"></div>
        <div class="reel-pop" id="reel-pop"><p class="small muted reel-hint" id="reel-hint">Tap a word to see what it means.</p></div>
      </div>
    </div>`));
  const $ = (sel) => view.querySelector(sel);
  const stage = $("#reel-stage");
  const wordsEl = $("#reel-words");
  const surface = reelSurface(); // null where reels can't be played (the computer)
  if (!surface) view.querySelector(".reelplay").classList.add("no-video");

  // ----- the reel being shown -----
  let cur = null; // {ep, lang, starts, ends, segOf, texts, els}
  let curIdx = -1;
  let clipEnd = null;
  let seenEnds = 0;
  let seenNav = "";
  let loadedAt = 0;
  let skipping = false;
  let playing = false;
  let disposed = false;
  let opened = false;
  let target = null; // the word the popup is about: {i, j, si, sj, text}

  const stageRect = () => {
    const r = stage.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  };

  const bubble = createWordBubble($("#reel-pop"), {
    noAudio: !surface,
    fetch: (ctx, refresh) => getDefinition(ctx, refresh),
    onPlayWord: () => target && playClip(cur.starts[target.i], cur.ends[target.j]),
    onPlaySentence: () => target && playClip(cur.starts[target.si], cur.ends[target.sj]),
    onPlayFrom: () => { if (target && surface) { clipEnd = null; surface.do("seek", cur.starts[target.i]); surface.do("play"); } },
    onSettings: () => (location.hash = "#/settings"),
    onSave: async (def) => {
      const t = target;
      try {
        await api("/vocab", { method: "POST", body: {
          ...vocabFromDefinition(def, t.text, cur.lang), sentence: sentence(t.si, t.sj), episode_id: cur.ep.id,
          start: cur.starts[t.i], end: cur.ends[t.j], sent_start: cur.starts[t.si], sent_end: cur.ends[t.sj] } });
        toast(`Saved “${t.text}” to vocab`);
        reward({ type: "save" }, cur.els[t.i]);
      } catch (e) {
        toast(e.message, { error: true });
        throw e;
      }
    },
  });
  // The popup lives in the right half of the bar; the hint shows whenever it is closed.
  const hint = $("#reel-hint");
  new MutationObserver(() => { hint.hidden = bubble.open; }).observe(bubble.el, { attributes: true, attributeFilter: ["hidden"] });

  const sentence = (a, b) => joinWords(cur.texts.slice(a, b + 1), cur.lang);

  function playClip(start, end) {
    if (!surface) return;
    clipEnd = end + 0.08;
    surface.do("seek", Math.max(0, start - 0.05));
    surface.do("play");
  }

  function define(i) {
    const [si, sj] = sentenceBounds(cur.texts, cur.segOf, i, i);
    const prev = si > 0 ? sentenceBounds(cur.texts, cur.segOf, si - 1) : null;
    const next = sj < cur.texts.length - 1 ? sentenceBounds(cur.texts, cur.segOf, sj + 1) : null;
    const word = cur.texts[i].replace(EDGE_PUNCT, "") || cur.texts[i];
    target = { i, j: i, si, sj, text: word };
    buzz("tick");
    playClip(cur.starts[i], cur.ends[i]);
    bubble.show(cur.els[i], {
      word, lang: cur.lang, marked: markWord(cur.texts.slice(si, sj + 1), i - si, i - si, cur.lang),
      before: prev ? sentence(prev[0], prev[1]) : "", after: next ? sentence(next[0], next[1]) : "",
      podcast: `@${cur.ep.description || "Instagram"}`, episode: cur.ep.title,
    });
    reward({ type: "word", key: `${cur.lang}:${word.toLowerCase()}` }, cur.els[i]);
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
    if (bubble.open) return; // keep the tapped word in view while its popup is open
    const box = wordsEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top + 4 || r.bottom > box.bottom - 4) wordsEl.scrollTo({ top: wordsEl.scrollTop + r.top - box.top - box.height * 0.3, behavior: "smooth" });
  }

  async function show(i) {
    if (disposed) return;
    index = (i + reels.length) % reels.length;
    const ep = reels[index];
    bubble.hide();
    clipEnd = null;
    curIdx = -1;
    target = null;
    $("#reel-n").textContent = `${index + 1} / ${reels.length}`;
    $("#reel-who").textContent = `@${ep.description || ""}`;
    history.replaceState(null, "", `#/reels/play?at=${ep.id}`); // so "back" and a reopen land on this reel
    wordsEl.innerHTML = `<p class="muted small">Loading the words…</p>`;
    let data;
    try { data = await api(`/episodes/${ep.id}/transcript`); } catch (e) { data = null; }
    if (disposed || reels[index] !== ep) return;
    const lang = episodeLanguage(ep);
    if (!data || !data.words.start.length) {
      cur = null;
      wordsEl.innerHTML = `<p class="muted small">This reel's words aren't on this device yet. Sync and try again.</p>`;
    } else {
      const segText = new Map(data.segments.map((s) => [s.idx, s.text]));
      const W = regroupWords(data.words, lang, true, (s) => segText.get(s));
      const parts = [];
      let w = 0;
      for (const seg of data.segments) {
        parts.push(`<p class="seg">`);
        const first = w;
        while (w < W.start.length && W.seg[w] === seg.idx) {
          if (w > first) parts.push(gap(W.text[w - 1], W.text[w], lang));
          parts.push(`<span class="w" data-i="${w}">${esc(W.text[w])}</span>`);
          w++;
        }
        parts.push("</p>");
      }
      wordsEl.innerHTML = parts.join("");
      wordsEl.scrollTop = 0;
      wordsEl.setAttribute("lang", lang);
      wordsEl.setAttribute("dir", langInfo(lang).dir);
      cur = { ep, lang, starts: Float64Array.from(W.start), ends: Float64Array.from(W.end), segOf: Int32Array.from(W.seg),
              texts: W.text, els: wordsEl.querySelectorAll(".w") };
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
    if (!opened) { opened = true; await surface.open({ url: embedUrl(ep), el: stage, ...stageRect() }); }
    else await surface.load(embedUrl(ep));
  }

  function onState(s) {
    if (disposed || !cur && !surface) return;
    const ep = reels[index];
    if (!s || !String(s.page || "").includes(ep.guid)) return; // the page for the previous reel is still showing
    playing = !s.paused;
    if (s.nav && s.nav !== seenNav) {
      seenNav = s.nav;
      show(index + (s.nav.startsWith("prev") ? -1 : 1));
      return;
    }
    if (s.error === "novideo" && !skipping) {
      skipping = true;
      toast("That reel can't be shown outside Instagram any more. Skipping it.");
      show(index + 1);
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
      if (clipEnd === null && !bubble.open && Date.now() - loadedAt > 1500) show(index + 1);
      else clipEnd = null;
    }
  }

  const offState = surface ? surface.onState(onState) : () => {};
  $("#reel-prev").onclick = () => show(index - 1);
  $("#reel-next").onclick = () => show(index + 1);
  const onResize = () => { if (surface && opened) surface.layout(stageRect()); };
  window.addEventListener("resize", onResize);
  const settle = setInterval(onResize, 1500); // the bar can change the stage's size (fonts loading, keyboard)
  const stopStudy = trackStudy("listen", () => playing);
  const onOutside = (e) => { if (bubble.open && !e.target.closest(".word-bubble") && !e.target.closest(".w")) bubble.hide(); };
  document.addEventListener("pointerdown", onOutside);

  await show(index);
  return () => {
    disposed = true;
    offState();
    stopStudy();
    clearInterval(settle);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("pointerdown", onOutside);
    bubble.hide();
    if (surface) surface.close();
  };
}
