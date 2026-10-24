// Episode player: audio controls + transcript with word-level highlighting, laid out in the
// direction of the episode's language.
// Videos ("My videos") play in a <video> with tappable captions on top and the full
// transcript in a panel beside it (desktop) or below it (phone), toggled by a button.
// YouTube videos play in YouTube's own embedded player (ytmedia.js); their tappable captions
// sit BELOW the video, because nothing may be drawn over YouTube's player.
// Netflix titles are laid out exactly like YouTube videos ("embed"): Netflix's player plays in a
// window of its own over the stage (nfmedia.js), so nothing may be drawn over the video there either.
//
// Performance: words are rendered once as <span>s. Each animation frame we binary-search
// the sorted start times (O(log n)) and only touch the DOM when the active word changes.

import { api, esc, h, on, toast, showMenu, hideMenu, download, saveSettings, state, requestNotifications, audioUrl, buzz,
  netflixBridge, netflixSupport, openNetflix } from "../app.js";
import { saveProgress } from "../progress.js";
import { activeWordIndex, sentenceBounds, formatTime, EDGE_PUNCT } from "../wordlookup.js";
import { episodeLanguage, gap, joinWords, langAttrs, langInfo, regroupWords, studyLanguage, vocabFromDefinition } from "../languages.js";
import { computerOnlyNotice, statusInfo, isVideo } from "./library.js";
import { createWordBubble, pauseAfterWord } from "../components/wordbubble.js";
import { getDefinition } from "../define-service.js";
import { wordFixer } from "../fixword.js";
import { lookupToggle } from "../components/lookupmode.js";
import { markWord } from "../definer.js";
import * as reader from "./reader.js";
import { isBook } from "../books.js";
import { captionKind, channelOf, dubbedTrack, followChannel, importVideo, isFollowing, isYouTube, noteWatched, readVideo, saveVideo,
  videoId as youTubeId } from "../youtube.js";
import { createYouTubeMedia } from "../ytmedia.js";
import { addNetflix, isNetflix, languageName, subtitleNote, unavailableText } from "../netflix.js";
import { createNetflixMedia } from "../nfmedia.js";
import { t } from "../i18n.js";
import { mediaFromEpisode, sendButton } from "../components/sendmedia.js";
import { reward, trackStudy } from "../game/game.js";
import { seenWords } from "../lexicon/seen.js";
import { readingsReady } from "../lexicon/readings.js";
import { icon } from "../icons.js";
import { sentenceStart } from "../sentencestart.js";
import { wordHtml } from "../wordface.js";
import { displayWords, paintWords, vowelsButton, watchVowels } from "../vowels.js";
import { wordClip } from "../wordclip.js";
import { phrasePicker } from "../components/phrasepick.js";
import { isPhrase, phraseText } from "../phrase.js";
import { NO_AUDIO_KINDS } from "../cardvoice.js";
import { voiceNewCard } from "../voiceplay.js";

const SPEEDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const CAPTION_WORDS = 12; // longest caption line, in words

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Copied");
}

function renderPending(view, ep) {
  const panel = h(`<div class="page"><div class="card status-panel stack">
      <h1 dir="auto"></h1>
      <p class="muted" id="st"></p>
      <div class="progress" id="bar" hidden><i></i></div>
      <p class="err" id="err" style="color:var(--danger)"></p>
      <div class="row" style="justify-content:center"><button class="primary" id="go" type="button"></button>
      <a class="btn" href="#/library">Back to library</a></div>
    </div></div>`);
  panel.querySelector("h1").textContent = ep.title;
  const yt = isYouTube(ep);
  if (yt) {
    panel.querySelector("#st").insertAdjacentHTML("afterend",
      `<p class="small muted">This video's captions aren't on this device yet. They arrive with the next sync, or you can fetch them again now.</p>`);
  } else if (isVideo(ep)) {
    const v = h(`<video class="pending-video" controls playsinline preload="metadata"></video>`);
    audioUrl(ep.id).then((url) => { v.src = url; }).catch(() => {});
    panel.querySelector(".status-panel").prepend(v);
    panel.querySelector("#st").insertAdjacentHTML("afterend",
      `<p class="small muted">You can watch it now; captions and the transcript appear once it's transcribed.</p>`);
  }
  view.append(panel);
  const paint = () => {
    const st = statusInfo(ep);
    panel.querySelector("#st").textContent = st.label;
    panel.querySelector("#bar").hidden = st.bar === undefined;
    panel.querySelector("#bar i").style.width = `${st.bar || 0}%`;
    panel.querySelector("#err").textContent = ep.status === "failed" ? ep.error || "" : "";
    const go = panel.querySelector("#go");
    const busy = ["queued", "downloading", "transcribing"].includes(ep.status);
    go.hidden = busy;
    go.textContent = yt ? "Get captions" : ep.status === "failed" ? "Retry" : "Transcribe";
    if (yt) panel.querySelector("#st").textContent = "Waiting for captions";
  };
  panel.querySelector("#go").onclick = async (e) => {
    if (yt) {
      // Nothing to transcribe: read the captions from YouTube again, then show the player.
      e.target.disabled = true;
      try {
        await importVideo(ep.audio_url);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } catch (err) {
        toast(err.message, { error: true });
        e.target.disabled = false;
      }
      return;
    }
    requestNotifications();
    try {
      const r = await api("/episodes/transcribe", { method: "POST", body: { ids: [ep.id] } });
      // The phone has left it for the computer: say so (its answer has a note then).
      if (r && r.note && (r.queued || []).includes(ep.id)) { ep.transcribe_requested_at = Date.now() / 1000; paint(); }
      if (r && r.computer_only) computerOnlyNotice();
    } catch (e) { toast(e.message, { error: true }); }
  };
  paint();
  return on("episode", (e) => {
    if (e.id !== ep.id) return;
    Object.assign(ep, e);
    if (e.status === "done") window.dispatchEvent(new HashChangeEvent("hashchange"));
    else paint();
  });
}

/** A Netflix title on a device where Netflix can't play in this page (the phones, the web app): why;
 * or, in the web app with the browser extension, a button that plays it in Netflix's own tab, with
 * Tamkeen's subtitle bar there. */
async function renderNetflixElsewhere(view, ep) {
  const { reason, extension } = await netflixSupport().catch(() => ({ reason: "" }));
  if (extension && /^\d{3,12}$/.test(String(ep.guid || ""))) {
    const panel = h(`<div class="page"><div class="card status-panel stack">
        <h1 dir="auto"></h1>
        <p>This title plays on Netflix, in a new tab, with Tamkeen's subtitle bar over Netflix's player. Words you save there come back to your Vocab.</p>
        <div class="row" style="justify-content:center">
          <a class="btn primary" target="_blank" rel="noopener">${icon("film", 16)} Watch on Netflix</a>
          <a class="btn" href="#/library">Back to library</a>
        </div>
      </div></div>`);
    panel.querySelector("h1").textContent = ep.title;
    panel.querySelector("a.primary").href = `https://www.netflix.com/watch/${ep.guid}`;
    view.append(panel);
    return undefined;
  }
  const { title, lines } = unavailableText(reason);
  const panel = h(`<div class="page"><div class="card status-panel stack">
      <h1 dir="auto"></h1>
      <p><strong></strong></p>
      <p></p>
      <p class="small muted"></p>
      <div class="row" style="justify-content:center"><a class="btn" href="#/library">Back to library</a></div>
    </div></div>`);
  panel.querySelector("h1").textContent = ep.title;
  panel.querySelector("strong").textContent = title;
  const [, why, where] = panel.querySelectorAll("p");
  why.textContent = lines[0];
  where.textContent = lines[1];
  view.append(panel);
  return undefined;
}

export async function render(view, { id, query }) {
  const data = await api(`/episodes/${id}/transcript`);
  const ep = data.episode;
  if ((ep.audio_type || "") === "video/instagram") { // an Instagram reel: pages/reels.js plays those
    location.replace(`#/reels/play?at=${id}`);
    return undefined;
  }
  // Netflix: only where its player can be laid over the stage (Tamkeen for Windows).
  const nf = isNetflix(ep);
  if (nf && (!netflixBridge() || !(await netflixSupport().catch(() => ({ ok: false }))).ok)) return renderNetflixElsewhere(view, ep);
  if (reader.isPage(ep) && data.words.text.length) return reader.render(view, { id, data, query });
  if (isBook(ep) && data.words.text.length) return (await import("./book.js")).render(view, { id, data, query });
  // (A Netflix title plays at once: its subtitles arrive once Netflix's player has started.)
  if (!nf && (ep.status !== "done" || !data.words.start.length)) return renderPending(view, ep);

  const lang = episodeLanguage(ep);
  const segTexts = new Map(data.segments.map((s) => [s.idx, s.text]));
  await readingsReady(lang); // Japanese and Chinese: the dictionary that splits them into words, if downloaded
  const W = regroupWords(data.words, lang, true, (s) => segTexts.get(s)); // real words for Japanese/Chinese
  const n = W.start.length;
  const starts = Float64Array.from(W.start);
  const ends = Float64Array.from(W.end);
  const segOf = Int32Array.from(W.seg);
  const texts = W.text;
  // Arabic with "Show vowels" on: the words are DRAWN vowelled (vowels.js); `texts` stay as they are.
  let vowels = data.vowels || null;
  let shown = displayWords(texts, vowels, (i) => segOf[i]);

  // ---------- markup ----------
  const img = ep.image || ep.feed_image;
  const vid = isVideo(ep);
  const yt = isYouTube(ep);
  // Played by another company's player that nothing may be drawn over (YouTube's, Netflix's): the
  // clickable captions go under the video and the word popup into the transcript.
  const embed = yt || nf;
  // A word saved from here keeps no sound of its own (YouTube's and Netflix's sound is never taken):
  // the card gets its voice instead (cardvoice.js), or the popup offers "Add audio" (wordbubble.js).
  const voiceless = NO_AUDIO_KINDS.includes(ep.audio_type || "");
  // Captions written by a person are timed per line, not per word (see ytcaptions.js); so are
  // Netflix's subtitles.
  const lineTimed = nf || (yt && ep.model !== "youtube-auto");
  const transcriptHtml = `<div class="transcript-wrap">
        <div class="transcript ar" id="transcript" ${langAttrs(lang)} tabindex="0"></div>
        <button type="button" class="back-to-current primary" id="back" hidden>↓ Back to current</button>
      </div>`;
  // Videos (computer): a slim handle on the transcript panel's edge folds the panel away and back.
  const handleHtml = `<button type="button" class="panel-handle" id="panel-handle">${icon("chevron", 18)}</button>`;
  view.append(h(`
    <div class="player${vid ? " video" : ""}${embed ? " yt" : ""}${nf ? " nf" : ""}">
      <div class="player-head">
        <a class="btn ghost" href="#/feed/${ep.feed_id}" title="Back">←</a>
        ${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : ""}
        <div class="meta">
          <div class="title" dir="auto">${esc(ep.title)}</div>
          <div class="small muted">${esc(ep.feed_title)} · ${n.toLocaleString()} words</div>
        </div>
        ${yt && channelOf(ep) ? `<span class="follow-wrap">
          <button type="button" class="follow-btn" id="follow" aria-pressed="false"><span class="mark">+</span><span class="label">Follow</span></button>
          <span class="follow-pop" id="follow-pop" hidden>Following</span>
        </span>` : ""}
        <div class="row">
          ${vid ? `<button type="button" id="toggle-panel" title="Show or hide the full transcript (T)" aria-label="Transcript">${icon("transcript", 16)}<span class="lbl">Transcript</span></button>
          <button type="button" class="ghost" id="toggle-cc" title="Show or hide the clickable captions (C)">CC</button>
          <button type="button" class="ghost" id="fullscreen" title="Full screen (F)">⛶</button>` : ""}
          ${embed ? `<button type="button" class="ghost" id="more" title="${nf ? "Text size and full screen" : "Text size, full screen and saving the transcript"}">⋯</button>` : ""}
          <button type="button" class="ghost" id="font-down" title="Smaller text">A−</button>
          <button type="button" class="ghost" id="font-up" title="Larger text">A+</button>
          ${nf ? "" : `<button type="button" id="exp-txt">TXT</button>
          <button type="button" id="exp-srt">SRT</button>
          <button type="button" id="exp-vtt">VTT</button>`}
        </div>
      </div>
      ${embed ? `<div class="stage" id="stage">
        <div class="yt-col">
          <div class="screen" id="screen">${nf ? `<div class="nf-frame" id="nf-frame"><p class="nf-msg">Opening Netflix…</p></div>` : `<div id="yt-frame"></div>`}</div>
          <div class="captions" id="captions" ${langAttrs(lang)}></div>
          <div class="yt-note" id="yt-note" hidden></div>
        </div>
        ${handleHtml}${transcriptHtml}
      </div>` : vid ? `<div class="stage" id="stage">
        <div class="screen" id="screen">
          <video id="video" playsinline></video>
          <div class="captions" id="captions" ${langAttrs(lang)}></div>
        </div>
        ${handleHtml}${transcriptHtml}
      </div>` : transcriptHtml}
      <div class="controls">
        <div class="seekrow">
          <span id="cur">0:00</span>
          <input type="range" id="seek" min="0" max="1" step="0.1" value="0" aria-label="Seek">
          <span id="dur">0:00</span>
        </div>
        <div class="btnrow">
          <span id="loop-chip" class="chip" hidden>⟲ Looping sentence <button type="button" id="loop-off" title="Stop looping">✕</button></span>
          <button type="button" id="restart" class="icon" title="Back to the start of the sentence (R)" aria-label="Back to the start of the sentence">${icon("sentence-start", 16)}</button>
          <button type="button" id="back5" title="Back 5 seconds (←)">⟲ 5s</button>
          <button type="button" id="play" class="play primary" title="Play/Pause (Space)">▶</button>
          <button type="button" id="fwd5" title="Forward 5 seconds (→)">5s ⟳</button>
          <select id="speed" title="Playback speed">${SPEEDS.map((s) => `<option value="${s}">${s}×</option>`).join("")}</select>
        </div>
      </div>
    </div>`));

  const $ = (sel) => view.querySelector(sel);
  const tr = $("#transcript");

  // Build transcript HTML in one pass (fast even for 10k+ words).
  const parts = [];
  let w = 0;
  for (const seg of data.segments) {
    parts.push(`<p class="seg" data-s="${seg.idx}" data-t="${formatTime(seg.start)}">`);
    const first = w;
    while (w < n && segOf[w] === seg.idx) {
      if (w > first) parts.push(gap(texts[w - 1], texts[w], lang));
      parts.push(`<span class="w" data-i="${w}">${wordHtml(shown[w], lang)}</span>`);
      w++;
    }
    if (w === first) parts.push(esc(seg.text));
    parts.push("</p>");
  }
  tr.innerHTML = parts.join("");
  // A Netflix title's subtitles come from Netflix once it plays; the page is drawn afresh then.
  // (t(): the transcript is in the language being learned, which the page's translation leaves alone.)
  const nfWaiting = nf ? t("Netflix's {0} subtitles appear here once the title starts playing.", languageName(ep.language || studyLanguage())) : "";
  if (nf && !n) {
    tr.innerHTML = `<p class="nf-wait" dir="auto"></p>`;
    tr.firstChild.textContent = nfWaiting;
  }
  const wordEls = tr.querySelectorAll(".w");
  // Words never tapped before are drawn in purple; a tap makes every form of the word "seen".
  const seen = seenWords({ tokens: texts, lang, els: wordEls });

  // ---------- audio ----------
  const posKey = `pos:${id}`;
  const startAt = query.get("t") !== null ? Number(query.get("t")) : lsGet(posKey, 0);
  let duration = ep.duration || 0;
  // A YouTube video is driven through an object that behaves like an <audio> element.
  // YouTube's own captions prefer the language being learned; when these captions are in another
  // language, YouTube's are switched on in it (translated by YouTube; see ytmedia.js).
  const study = studyLanguage();
  // A Netflix title plays in Netflix's own player, in a window laid over the stage (nfmedia.js);
  // its subtitles and soundtrack are switched to the language the title was added in.
  const audio = yt ? createYouTubeMedia($("#yt-frame"), youTubeId(ep.audio_url) || ep.guid,
    { start: startAt, duration, captions: { lang: study, show: lang !== study } })
    : nf ? createNetflixMedia($("#screen"), ep.guid, { bridge: netflixBridge(), lang: ep.language || study, duration,
      onState: (s) => netflixState(s) })
    : vid ? $("#video") : new Audio();
  if (!embed) {
    audio.preload = "auto";
    audio.src = await audioUrl(id);
  }
  window.__apsAudio = audio; // handy for debugging from the devtools console
  let speed = lsGet("speed", 1);
  $("#speed").value = String(speed);

  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) duration = audio.duration;
    $("#seek").max = String(duration);
    $("#dur").textContent = formatTime(duration);
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
    if (startAt > 0 && startAt < duration) audio.currentTime = startAt;
    tick();
  }, { once: true });
  audio.addEventListener("error", () => {
    if (disposed) return;
    toast(yt ? audio.errorMessage || "YouTube couldn't play this video."
      : nf ? audio.errorMessage || "Netflix couldn't play this title."
      : vid ? "Couldn't load the video. It streams from your Google Drive: check your connection and that you're signed in."
      : "Couldn't load the audio. If it streams from the podcast's server, check your connection.", { error: true });
  });

  // ---------- highlight + follow ----------
  let curIdx = -1;
  let follow = true;
  let loop = null; // {start, end, first, last}
  let seeking = false;
  let lastSecond = -1;
  let raf = 0;

  function ensureVisible(el, force = false) {
    const cr = tr.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const topBand = cr.top + cr.height * 0.12;
    const bottomBand = cr.top + cr.height * 0.7;
    if (!force && r.top >= topBand && r.bottom <= bottomBand) return;
    const delta = r.top - cr.top - cr.height * 0.33;
    tr.scrollTo({ top: tr.scrollTop + delta, behavior: Math.abs(delta) > cr.height * 1.5 ? "auto" : "smooth" });
  }

  // ---------- captions (videos): the current line of the transcript, tappable ----------
  const capEl = vid ? $("#captions") : null;
  const segFirst = new Map();
  for (let i = 0; i < n; i++) if (!segFirst.has(segOf[i])) segFirst.set(segOf[i], i);
  let capStart = -1;
  let capEls = [];
  let capHeld = false;
  let bubble = null;
  function showCaption(idx) {
    // Keep the tapped word in place while its popup is open. (Not on YouTube when the choice is
    // to keep playing: there the popup hangs below the captions, so they can carry on.)
    // (Nor while a finger or the mouse is on a caption word: it may be dragged across to the next words.)
    if (!capEl || capHeld || (bubble && bubble.open && !(embed && !pauseAfterWord()))) return;
    let start = -1;
    let end = -1;
    if (idx >= 0) {
      const first = segFirst.get(segOf[idx]);
      start = first + Math.floor((idx - first) / CAPTION_WORDS) * CAPTION_WORDS;
      end = start;
      while (end + 1 < n && end + 1 < start + CAPTION_WORDS && segOf[end + 1] === segOf[idx]) end++;
    }
    if (start === capStart) return;
    capStart = start;
    capEl.innerHTML = start < 0 ? ""
      : Array.from({ length: end - start + 1 }, (_, k) =>
        `${k ? gap(texts[start + k - 1], texts[start + k], lang) : ""}<span class="w" data-i="${start + k}">${wordHtml(shown[start + k], lang)}</span>`).join("");
    capEls = [...capEl.querySelectorAll(".w")];
    if (start >= 0) seen.paint(capEls, start);
  }
  const capWord = (i) => (capStart >= 0 ? capEls[i - capStart] : null);
  seen.onPaint = () => { if (capStart >= 0) seen.paint(capEls, capStart); };

  function setActive(idx) {
    if (idx === curIdx) return;
    if (curIdx >= 0) {
      wordEls[curIdx].classList.remove("cur");
      capWord(curIdx)?.classList.remove("cur");
    }
    curIdx = idx;
    showCaption(idx);
    if (idx >= 0) {
      wordEls[idx].classList.add("cur");
      capWord(idx)?.classList.add("cur");
      if (follow) ensureVisible(wordEls[idx]);
    }
  }

  // update() does the per-frame work. It's driven by requestAnimationFrame while playing, and
  // also by the audio's own 'timeupdate' events (~4 Hz), which keep sentence loops and the
  // highlight correct even when the window is hidden and animation frames are paused.
  function tick() {
    raf = 0;
    update();
    if (!audio.paused) raf = requestAnimationFrame(tick);
  }

  let disposed = false;
  let clipEnd = null; // when set, playback pauses at this time (word/sentence preview)
  let clipTimer = 0;
  function update() {
    if (disposed) return;
    let t = audio.currentTime;
    if (clipEnd !== null && t >= clipEnd) {
      // End of a single-word/sentence clip: stop right after it.
      clipEnd = null;
      audio.pause();
    } else if (loop && clipEnd === null && (t >= loop.end || t < loop.start - 0.5)) {
      audio.currentTime = t = loop.start;
    }
    setActive(activeWordIndex(starts, ends, t, 1.5));
    if (!seeking) {
      $("#seek").value = String(t);
      const s = Math.floor(t);
      if (s !== lastSecond) {
        lastSecond = s;
        $("#cur").textContent = formatTime(t);
        if (s % 5 === 0) { lsSet(posKey, t); remember(); }
      }
    }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  // For Home's "Continue" button: how far through this is.
  const remember = () => {
    if (!duration) return;
    saveProgress({ id, kind: vid ? "video" : "audio", title: ep.title, sub: ep.feed_title, image: img || "",
                   pos: audio.currentTime || 0, dur: duration });
  };
  audio.addEventListener("timeupdate", update);

  audio.addEventListener("play", () => { if (!disposed) { $("#play").textContent = "❚❚"; kick(); } });
  audio.addEventListener("pause", () => {
    clipEnd = null; // any pause ends a word/sentence clip, so the next play continues normally
    if (!disposed) { $("#play").textContent = "▶"; lsSet(posKey, audio.currentTime); remember(); kick(); }
  });
  audio.addEventListener("seeked", () => { if (!disposed) kick(); });
  audio.addEventListener("ended", () => { if (!disposed) $("#play").textContent = "▶"; });

  // Manual scrolling is detected from user input (wheel, touch, keys, scrollbar drag), never
  // from 'scroll' events, which our own auto-scroll also fires (possibly late, e.g. when the
  // window is in the background and smooth scrolling stalls).
  function userScrolled() {
    if (follow) { follow = false; $("#back").hidden = false; }
  }
  tr.addEventListener("wheel", userScrolled, { passive: true });
  tr.addEventListener("touchmove", userScrolled, { passive: true });
  tr.addEventListener("keydown", (e) => {
    if (["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) userScrolled();
  });
  tr.addEventListener("pointerdown", (e) => {
    // Pressing on the scrollbar (left side in RTL, right side in LTR) targets the container itself.
    if (e.target === tr && (e.offsetX < tr.clientLeft || e.offsetX > tr.clientLeft + tr.clientWidth)) userScrolled();
  });
  $("#back").onclick = () => {
    follow = true;
    $("#back").hidden = true;
    if (curIdx >= 0) ensureVisible(wordEls[curIdx], true);
  };

  // ---------- transport ----------
  const play = () => audio.play().catch((e) => toast(`Playback failed: ${e.message}`, { error: true }));
  const seekTo = (t, autoplay = true) => {
    clipEnd = null;
    audio.currentTime = Math.max(0, Math.min(t, duration || t));
    follow = true;
    $("#back").hidden = true;
    if (autoplay && audio.paused) play();
    kick();
  };
  $("#play").onclick = () => { clipEnd = null; audio.paused ? play() : audio.pause(); };
  $("#back5").onclick = () => seekTo(audio.currentTime - 5, false);
  // Back to the start of the line being heard (again within a second: the line before).
  const lineStarts = Float64Array.from(data.segments.map((s) => s.start)).sort();
  $("#restart").onclick = () => seekTo(sentenceStart(lineStarts, audio.currentTime), false);
  $("#fwd5").onclick = () => seekTo(audio.currentTime + 5, false);
  $("#speed").onchange = (e) => {
    speed = Number(e.target.value);
    audio.playbackRate = speed;
    audio.defaultPlaybackRate = speed;
    lsSet("speed", speed);
  };
  $("#seek").addEventListener("input", (e) => { seeking = true; $("#cur").textContent = formatTime(Number(e.target.value)); });
  $("#seek").addEventListener("change", (e) => { seeking = false; seekTo(Number(e.target.value), false); });

  // ---------- send to a friend: the paper airplane (components/sendmedia.js) ----------
  // First in the banner's row of buttons, for every kind of thing this player plays. It sends
  // what is playing and the moment it has reached; the user's own files can't be sent, and the
  // button says so.
  // (Not a Netflix title: its words are Netflix's subtitles, from the user's own Netflix, for his own study.)
  if (!nf) $(".player-head > .row").prepend(sendButton(() => mediaFromEpisode(ep, { at: audio.currentTime || 0 })));

  // ---------- follow this video's channel (YouTube) ----------
  // An outline while not followed, filled once followed; a small "Following" bubble shows for a
  // moment. Followed channels appear in the Library under YouTube.
  const followBtn = $("#follow");
  let followPopTimer = 0;
  if (followBtn) {
    const channelName = channelOf(ep);
    let following = false;
    const paintFollow = () => {
      followBtn.classList.toggle("on", following);
      followBtn.setAttribute("aria-pressed", String(following));
      followBtn.querySelector(".mark").textContent = following ? "✓" : "+";
      followBtn.querySelector(".label").textContent = following ? "Following" : "Follow";
      followBtn.title = following ? `You follow ${channelName}. Press to stop following.` : `Follow ${channelName}: it appears in your Library under YouTube`;
    };
    paintFollow();
    isFollowing(ep).then((yes) => {
      if (disposed) return;
      following = yes;
      paintFollow();
      if (yes) noteWatched(ep).catch(() => {}); // watching it moves the channel to the front of the bar
    }).catch(() => {});
    followBtn.onclick = async () => {
      following = !following;
      paintFollow();
      const pop = $("#follow-pop");
      clearTimeout(followPopTimer);
      pop.hidden = true;
      if (following) {
        buzz("success");
        void pop.offsetWidth; // so the little animation starts again on a second press
        pop.hidden = false;
        followPopTimer = setTimeout(() => { pop.hidden = true; }, 1300);
      }
      try {
        await followChannel(ep, following);
      } catch (e) {
        following = !following;
        pop.hidden = true;
        if (!disposed) paintFollow();
        toast(e.message, { error: true });
      }
    };
  }

  // ---------- YouTube: say which captions these are, and whether the video can be heard in the language ----------
  if (yt) showCaptionNote();
  function showCaptionNote() {
    const note = $("#yt-note");
    const studyName = langInfo(study).name;
    const lines = [];
    let temp = ""; // a note shown for a few seconds only (the dubbed soundtrack: the owner wanted it temporary)
    let retry = false;
    if (lang !== study) {
      // YouTube had none in the language being learned and wouldn't hand over its translation.
      lines.push(`No ${studyName} captions for this video, so these are its ${langInfo(lang).name} ones. YouTube's ${studyName} translation is shown in the video.`);
      retry = true;
    } else if (captionKind(ep) === "auto") {
      lines.push("YouTube's automatic captions: they can have mistakes.");
    } else if (captionKind(ep) === "translated") {
      lines.push("Translated by YouTube: it may not match what is said.");
    }
    const paint = () => {
      note.innerHTML = lines.map(() => "<p></p>").join("") + (temp ? `<p class="yt-note-temp"></p>` : "");
      note.querySelectorAll("p").forEach((el, i) => { el.textContent = i < lines.length ? lines[i] : temp; });
      if (retry) {
        const again = h(`<button type="button" class="link">Try again</button>`);
        again.onclick = () => tryCaptionsAgain(again);
        note.querySelector("p").append(" ", again);
      }
      note.hidden = !lines.length && !temp;
      if (bubble) fitBubble(); // the phone's popup hangs just below this
    };
    paint();
    // A dubbed version in the language being learned (YouTube's "multi-language audio"). Tamkeen
    // can't choose it from outside YouTube's player, so the way to it is shown.
    dubbedTrack(ep).then((track) => {
      if (!track || disposed) return;
      temp = `This video can be heard in ${studyName} too: choose it under ⚙ → Audio track in the video.`;
      paint();
      // Shown for 12 seconds, fading out over the last one (media.css .yt-note-temp), then gone.
      setTimeout(() => { if (disposed) return; temp = ""; paint(); }, 12000);
    }).catch(() => {});
  }
  /** Ask YouTube again for captions in the language being learned (its translation may come now). */
  async function tryCaptionsAgain(btn) {
    btn.disabled = true;
    try {
      const v = await readVideo(youTubeId(ep.audio_url) || ep.guid);
      if (v.language !== study) {
        toast(`YouTube still won't give Tamkeen ${langInfo(study).name} captions for this video.`);
        btn.disabled = false;
        return;
      }
      await saveVideo(v);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (e) {
      toast(e.message, { error: true });
      if (!disposed) btn.disabled = false;
    }
  }

  // ---------- Netflix: what its player says (nfmedia.js hands on each answer) ----------
  // On the stage, under the video window: what is happening while there is no picture (opening,
  // a sign-in needed, Netflix's own error). Under the captions: which subtitles and soundtrack.
  let nfMsg = "";
  let nfNote = "";
  let nfMoving = false;
  function netflixState(s) {
    if (disposed || !s) return;
    let text = "";
    let action = "";
    if (s.gone) { text = "Netflix's player closed."; action = "again"; }
    else if (s.page === "login") { text = "Sign in to Netflix first: open Netflix, sign in there, then press Try again."; action = "signin"; }
    else if (s.page === "profiles") { text = "Netflix asks who's watching: choose your profile in the Netflix window, then press Try again."; action = "signin"; }
    else if (s.error) { text = s.error; action = "again"; }
    else if (s.loading || !s.video) text = "Opening Netflix…";
    const key = `${text}|${action}`;
    if (key !== nfMsg) {
      nfMsg = key;
      const frame = $("#nf-frame");
      frame.innerHTML = `<p class="nf-msg"></p>`;
      frame.firstChild.textContent = text;
      if (action === "signin") {
        const open = h(`<button type="button">${icon("film", 16)} Open Netflix</button>`);
        open.onclick = () => openNetflix().catch((e) => toast(e.message, { error: true }));
        frame.append(open);
      }
      if (action) {
        const again = h(`<button type="button" class="primary">Try again</button>`);
        again.onclick = () => audio.reload();
        frame.append(again);
      }
    }
    // While there are no words yet, what is happening to the subtitles is said where the words will
    // be (the transcript panel); once there are, any note goes under the captions, as for YouTube.
    const said = subtitleNote(s, { words: n, lang: ep.language || study });
    const lines = [said.sound, n ? said.subs : ""].filter(Boolean);
    if (`${lines.join("\n")}|${said.subs}` !== nfNote) {
      nfNote = `${lines.join("\n")}|${said.subs}`;
      const note = $("#yt-note");
      note.innerHTML = lines.map(() => "<p></p>").join("");
      note.querySelectorAll("p").forEach((el, i) => { el.textContent = lines[i]; });
      note.hidden = !lines.length;
      const wait = tr.querySelector(".nf-wait");
      if (wait) wait.textContent = said.subs || nfWaiting;
      if (bubble) fitBubble();
    }
    // Netflix went on to another title: the series' episode it chose (this one was opened by the
    // series' own number, so it never got subtitles), or the next episode at the end of one.
    if (s.id && /^\d+$/.test(s.id) && s.id !== ep.guid && !nfMoving) followNetflix(s);
  }
  async function followNetflix(s) {
    const pending = !n;
    const episode = !!(ep.description || (s.info && s.info.episode > 0));
    if (!pending && !episode) { audio.pause(); return; } // a film moving on to something else: stay with this one
    nfMoving = true;
    const info = s.info && (s.info.title || s.info.show) ? s.info : { title: ep.title, show: ep.description || "", image: ep.image || "" };
    try {
      const next = await addNetflix(s.id, info, pending ? ep.guid : null);
      if (disposed) return;
      audio.keepShowing = true; // the same video carries on: only the page around it changes
      location.replace(`#/episode/${next.id}`);
    } catch (e) {
      nfMoving = false;
      toast(e.message, { error: true });
    }
  }
  // Its subtitles arrived (app/netflix.py): the page is drawn afresh with them, the video carrying on.
  const offNetflix = nf ? on("netflix", (e) => {
    if (disposed || !e || e.kind !== "subtitles" || e.episode !== id) return;
    audio.keepShowing = true;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }) : null;

  // ---------- clips: play one word or one sentence, then pause ----------
  // (or keep playing from there, if that is what the switch in the word popup says)
  function playClip(start, end) {
    const from = Math.max(0, start - 0.04);
    if (!pauseAfterWord()) {
      clipEnd = null;
      clearTimeout(clipTimer);
      audio.currentTime = from;
      if (audio.paused) play();
      kick();
      return;
    }
    clipEnd = end + 0.03;  // just past the word: more would start highlighting the next one
    audio.currentTime = from;
    if (audio.paused) play();
    kick();
    // Backup stop in case animation frames are throttled.
    clearTimeout(clipTimer);
    const ms = ((clipEnd - from) / (audio.playbackRate || 1)) * 1000 + 250;
    clipTimer = setTimeout(() => {
      if (clipEnd !== null && audio.currentTime >= clipEnd - 0.2) { clipEnd = null; audio.pause(); }
    }, ms);
  }

  /** Play words i..j. Where only whole lines are timed, the line they are in is played instead. */
  function playWords(i, j = i) {
    // A word's own times are often tight: room either side, and as long as it takes to say (wordclip.js).
    if (!lineTimed) { playClip(...wordClip({ starts, ends, texts, i, j, lang })); return; }
    let a = i;
    let b = j;
    while (a > 0 && segOf[a - 1] === segOf[i]) a--;
    while (b < n - 1 && segOf[b + 1] === segOf[j]) b++;
    playClip(starts[a], ends[b]);
  }

  // ---------- loop ----------
  function setLoop(first, last) {
    clearLoop();
    loop = { start: starts[first], end: ends[last] + 0.15, first, last };
    for (let i = first; i <= last; i++) wordEls[i].classList.add("loop");
    $("#loop-chip").hidden = false;
    seekTo(loop.start);
  }
  function clearLoop() {
    if (loop) for (let i = loop.first; i <= loop.last; i++) wordEls[i].classList.remove("loop");
    loop = null;
    $("#loop-chip").hidden = true;
  }
  $("#loop-off").onclick = clearLoop;

  // ---------- click a word to look it up (never when selecting text) ----------
  // Dragging across words (mouse), or holding a word and sliding the finger on (touch), looks the
  // words up together (components/phrasepick.js); holding a word and lifting opens its menu.
  let down = null;
  tr.addEventListener("pointerdown", (e) => {
    if (e.button === 0) down = { x: e.clientX, y: e.clientY };
  });
  const trPicker = phrasePicker(tr, {
    blockOf: (k) => segOf[k],
    elOf: (k) => wordEls[k] || null,
    onPick: (i, j) => defineAt(i, j),
    onHold: (i, x, y, el) => openMenu(x, y, el),
  });

  tr.addEventListener("click", (e) => {
    const wEl = e.target.closest(".w");
    if (!wEl || e.detail > 1) return; // ignore the clicks of a double/triple-click (word/line select)
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // user is selecting text
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // drag
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    defineAt(Number(wEl.dataset.i));
  });

  tr.addEventListener("contextmenu", (e) => {
    const wEl = e.target.closest(".w");
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed && tr.contains(sel.anchorNode);
    if (!wEl && !hasSel) return; // let the default menu appear on empty space
    e.preventDefault();
    openMenu(e.clientX, e.clientY, wEl);
  });

  // ---------- context menu ----------
  function wordIndexAt(node, offset, atEnd) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const wEl = el && el.closest && el.closest(".w");
    if (wEl) return Number(wEl.dataset.i);
    // Boundary between elements: look at neighbouring child nodes.
    let child = node.nodeType === Node.ELEMENT_NODE ? node.childNodes[atEnd ? offset - 1 : offset] : node;
    while (child) {
      const cand = child.nodeType === Node.ELEMENT_NODE
        ? (child.classList.contains("w") ? child : (atEnd ? [...child.querySelectorAll(".w")].pop() : child.querySelector(".w")))
        : null;
      if (cand) return Number(cand.dataset.i);
      child = atEnd ? child.previousSibling : child.nextSibling;
    }
    return -1;
  }

  function selectionWords() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!tr.contains(range.commonAncestorContainer)) return null;
    let i = wordIndexAt(range.startContainer, range.startOffset, false);
    let j = wordIndexAt(range.endContainer, range.endOffset, true);
    // A range that starts at the very end of a word's text doesn't really include it.
    if (i >= 0 && range.startContainer.nodeType === Node.TEXT_NODE &&
        range.startOffset >= range.startContainer.length && i < n - 1) i++;
    if (j >= 0 && range.endContainer.nodeType === Node.TEXT_NODE && range.endOffset === 0 && j > 0) j--;
    if (i < 0 || j < 0) return null;
    if (j < i) [i, j] = [j, i];
    const text = sel.toString().replace(/\s+/g, " ").trim();
    return text ? { i, j, text } : null;
  }

  // Words saved while this screen is open. Saving shows no message of its own: the popup's Save
  // button and this menu's Save entry change to "Saved" instead.
  const savedHere = new Set();
  const savedKey = (i, j) => `${i}-${j}`;

  function openMenu(x, y, wEl) {
    let target = selectionWords();
    if (!target && wEl) {
      const i = Number(wEl.dataset.i);
      target = { i, j: i, text: texts[i] };
    }
    if (!target) return;
    const { i, j } = target;
    const clean = target.text.replace(EDGE_PUNCT, "") || target.text;
    const [si, sj] = sentenceBounds(texts, segOf, i, j);
    const sentence = sentenceText(si, sj);
    showMenu(x, y, clean, [
      {
        label: savedHere.has(savedKey(i, j)) ? "✓ Saved to vocab" : "★ Save to vocab",
        run: async () => {
          if (savedHere.has(savedKey(i, j))) return;
          try {
            const row = await api("/vocab", {
              method: "POST",
              body: { text: clean, sentence, episode_id: id, start: starts[i], end: ends[j],
                      sent_start: starts[si], sent_end: ends[sj] },
            });
            if (voiceless) voiceNewCard(row, ep.audio_type);  // its voice, now (Settings → Card voices)
            savedHere.add(savedKey(i, j));
            reward({ type: "save" }, wordEls[i]);
            seen.markSeen(i, j);
          } catch (e) { toast(e.message, { error: true }); }
        },
      },
      { label: "📖 Define", run: () => defineAt(i, j) },
      ...seen.menuItems(i, j),
      { label: "⧉ Copy", run: () => copyText(target.text) },
      { label: "▶ Play from here", run: () => seekTo(starts[i]) },
      { label: "⟲ Loop this sentence", run: () => setLoop(si, sj) },
    ]);
  }

  // ---------- definition bubble ----------
  let bubbleTarget = null; // {i, j, si, sj, text}
  let bubbleInPanel = true; // the popup's word was tapped in the transcript panel (not the captions)

  function sentenceText(a, b) { return joinWords(texts.slice(a, b + 1), lang); }

  function contextFor(i, j) {
    const [si, sj] = sentenceBounds(texts, segOf, i, j);
    const prev = si > 0 ? sentenceBounds(texts, segOf, si - 1) : null;
    const next = sj < n - 1 ? sentenceBounds(texts, segOf, sj + 1) : null;
    const word = phraseText(texts, i, j, lang);
    return {
      si, sj, word,
      ctx: {
        word,
        lang,
        marked: markWord(texts.slice(si, sj + 1), i - si, j - si, lang),
        before: prev ? sentenceText(prev[0], prev[1]) : "",
        after: next ? sentenceText(next[0], next[1]) : "",
        podcast: ep.feed_title,
        episode: ep.title,
        phrase: isPhrase(i, j), // several words looked up together
      },
    };
  }

  // The popup may not cover YouTube's player, so there it lives in the transcript panel, or
  // under the captions when a caption word was tapped (see defineAt).
  // Quick or detailed lookup: the switch sits with the play controls (podcasts, videos, YouTube).
  $("#speed").after(lookupToggle());
  // Arabic: the vowels switch (vowels.js), and the vowels themselves once the computer has made them.
  const redrawVowels = () => {
    shown = displayWords(texts, vowels, (i) => segOf[i]);
    paintWords(wordEls, shown);
    if (capStart >= 0) paintWords(capEls, shown, capStart);
  };
  const vowelsBtn = vowelsButton(lang, redrawVowels, () => vowels);
  if (vowelsBtn) $("#font-down").before(vowelsBtn);
  const stopVowels = watchVowels(id, (v) => { vowels = v; redrawVowels(); if (vowelsBtn) vowelsBtn.repaint(); });
  // Misheard words, put right in the transcript when a lookup finds them (fixword.js). Only where
  // the words on screen are the stored ones (not Japanese or Chinese, regrouped for display).
  const fixer = wordFixer({
    episodeId: id, texts, editable: W === data.words, contextFor,
    redraw: (first, last) => {
      for (let k = first; k <= last; k++) {
        wordEls[k].textContent = texts[k];
        const c = capWord(k);
        if (c) c.textContent = texts[k];
      }
      if (seen.analyze) seen.analyze(); // the changed words may be new to the learner, or not
    },
  });
  bubble = createWordBubble(vid && !embed ? $("#stage") : $(".transcript-wrap"), {
    voiceless,
    fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
    onCorrect: async (def) => {
      const t = bubbleTarget;
      const done = await fixer.apply(t, def);
      if (done && t === bubbleTarget) t.text = done.word;
      return done;
    },
    onUndoCorrect: async (fx) => {
      const t = bubbleTarget;
      const back = await fixer.undo(t, fx.from);
      if (t === bubbleTarget) t.text = back.word;
      return back;
    },
    onPlayWord: () => bubbleTarget && playWords(bubbleTarget.i, bubbleTarget.j),
    onPlaySentence: () => bubbleTarget && playClip(starts[bubbleTarget.si], ends[bubbleTarget.sj]),
    onPlayFrom: () => bubbleTarget && seekTo(starts[bubbleTarget.i]),
    // The switch was flipped: act on it straight away, as a pause / play button would.
    onPauseMode: (pause) => {
      clipEnd = null;
      clearTimeout(clipTimer);
      if (pause && !audio.paused) audio.pause();
      else if (!pause && audio.paused) play();
    },
    onSettings: () => (location.hash = "#/settings?s=words"),
    onSave: async (def) => {
      const t = bubbleTarget;
      try {
        const row = await api("/vocab", {
          method: "POST",
          body: { ...vocabFromDefinition(def, t.text, lang), sentence: sentenceText(t.si, t.sj),
                  episode_id: id, start: starts[t.i], end: ends[t.j], sent_start: starts[t.si], sent_end: ends[t.sj] },
        });
        if (voiceless) voiceNewCard(row, ep.audio_type);  // its voice, now (Settings → Card voices)
        savedHere.add(savedKey(t.i, t.j));
        reward({ type: "save" }, wordEls[t.i]);
        seen.markSeen(t.i, t.j);
      } catch (e) {
        toast(e.message, { error: true });
        throw e;
      }
    },
  });

  function defineAt(i, j = i, anchor = null) {
    const c = contextFor(i, j);
    bubbleTarget = { i, j, si: c.si, sj: c.sj, text: c.word };
    buzz("tick");
    playWords(i, j);
    // The popup belongs to the transcript the word was tapped in: the captions under the video
    // or the transcript panel beside it.
    // (Shown inside another app's narrow panel, /embed, there is no transcript panel: always docked.)
    const phone = window.matchMedia("(max-width: 640px)").matches && !document.documentElement.classList.contains("embed");
    bubbleInPanel = !(anchor && capEl && capEl.contains(anchor));
    const opts = { saved: savedHere.has(savedKey(i, j)) };
    if (embed && !bubbleInPanel && !phone) {
      // Tapped in the captions: the popup joins the black bar right under them (it may not cover
      // YouTube's or Netflix's player, so the video gets shorter while it is open). The panel stays as it is.
      Object.assign(opts, { host: $(".yt-col"), docked: true });
    } else if (embed) {
      // Beside the word in the transcript panel (a phone shows the popup as a sheet at the
      // bottom instead, so the panel can stay as it is).
      anchor = wordEls[i];
      opts.host = $(".transcript-wrap");
      follow = true;
      $("#back").hidden = true;
      ensureVisible(wordEls[i]);
    }
    bubble.show(anchor || wordEls[i], c.ctx, opts);
    fitBubble();
    requestAnimationFrame(() => requestAnimationFrame(fitBubble)); // again once it has taken its place
    reward({ type: "word", key: `${lang}:${c.word.toLowerCase()}` }, anchor || wordEls[i]);
    seen.markSeen(i, j); // looked up: this word, in all its forms, is no longer new
  }

  // ---------- video: captions, transcript panel, full screen ----------
  const playerEl = view.querySelector(".player");
  // Caption words dragged across (or held and slid across) are looked up together.
  const capPicker = vid ? phrasePicker(capEl, {
    blockOf: (k) => segOf[k],
    elOf: (k) => capWord(k) || null,
    onPick: (i, j, el) => defineAt(i, j, el),
    onStart: () => { capHeld = true; },
    onEnd: () => { capHeld = false; },
  }) : null;
  if (vid) {
    capEl.addEventListener("click", (e) => {
      const wEl = e.target.closest(".w");
      if (!wEl) return;
      e.stopPropagation();
      defineAt(Number(wEl.dataset.i), Number(wEl.dataset.i), wEl);
    });
    capEl.addEventListener("contextmenu", (e) => {
      const wEl = e.target.closest(".w");
      if (!wEl) return;
      e.preventDefault();
      openMenu(e.clientX, e.clientY, wEl);
    });
    // Tapping the picture plays/pauses (and closes an open definition). YouTube's and Netflix's
    // players handle their own taps.
    if (!embed) $("#screen").addEventListener("click", (e) => {
      if (e.target.closest(".captions")) return;
      if (bubble.open) { bubble.hide(); return; }
      clipEnd = null;
      audio.paused ? play() : audio.pause();
    });
  }
  /** On a phone the popup is a sheet that stops just above the play controls, so they stay in
   * reach, with its row of buttons resting right on top of them (see media.css). On YouTube it
   * also starts directly under the captions, as part of the same black bar, and never covers
   * them or the video. */
  function fitBubble() {
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    const el = bubble.el;
    const controlsTop = $(".controls").getBoundingClientRect().top;
    el.style.setProperty("--dock-bottom", `${Math.max(0, Math.round(window.innerHeight - controlsTop))}px`);
    if (!embed) return;
    const top = Math.ceil($(".yt-col").getBoundingClientRect().bottom);
    el.style.setProperty("--dock-top", `${top}px`);
    // If something above shifts where "fixed" positions are measured from, correct for it.
    const off = el.hidden || !el.classList.contains("sheet") ? 0 : top - el.getBoundingClientRect().top;
    if (Math.abs(off) > 1) el.style.setProperty("--dock-top", `${top + off}px`);
  }
  function setPanel(open) {
    if (!vid) return;
    if (!open && bubble.open && bubbleInPanel) bubble.hide(); // its word is being folded away
    playerEl.classList.toggle("panel-open", open);
    $("#toggle-panel").classList.toggle("primary", open);
    const handle = $("#panel-handle");
    handle.title = open ? "Hide the transcript (T)" : "Show the transcript (T)";
    handle.setAttribute("aria-label", handle.title);
    handle.setAttribute("aria-expanded", String(open));
    lsSet("videoPanel", open);
    if (open && curIdx >= 0) setTimeout(() => ensureVisible(wordEls[curIdx], true), 300);
    setTimeout(() => { bubble.position(); fitBubble(); }, 300);
  }
  function setCaptions(on) {
    if (!vid) return;
    playerEl.classList.toggle("cc-off", !on);
    $("#toggle-cc").classList.toggle("ghost", !on);
    lsSet("videoCaptions", on);
    fitBubble();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else playerEl.requestFullscreen?.().catch((e) => toast(`Full screen isn't available here (${e.message}).`));
  }
  if (vid) {
    setPanel(lsGet("videoPanel", window.innerWidth > 760));
    setCaptions(lsGet("videoCaptions", true));
    $("#toggle-panel").onclick = $("#panel-handle").onclick = () => setPanel(!playerEl.classList.contains("panel-open"));
    $("#toggle-cc").onclick = () => setCaptions(playerEl.classList.contains("cc-off"));
    if (document.fullscreenEnabled) $("#fullscreen").onclick = toggleFullscreen;
    else $("#fullscreen").hidden = true;
  }

  tr.addEventListener("scroll", () => bubble.position(), { passive: true });
  const onFullscreen = () => setTimeout(() => bubble.position(), 100);
  document.addEventListener("fullscreenchange", onFullscreen);
  const onResize = () => { bubble.position(); fitBubble(); };
  window.addEventListener("resize", onResize);
  const onOutside = (e) => {
    if (bubble.open && !e.target.closest(".word-bubble") && !e.target.closest(".w") && !e.target.closest("#ctxmenu")
        && !e.target.closest("#screen")) bubble.hide();
  };
  document.addEventListener("pointerdown", onOutside);

  // ---------- header actions ----------
  const safe = ep.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "transcript";
  // (Netflix's subtitles are not saved out of the app: they are the user's own study, inside it.)
  if (!nf) {
    for (const fmt of ["txt", "srt", "vtt"]) {
      $(`#exp-${fmt}`).onclick = () => download(`/api/episodes/${id}/export/${fmt}`, `${safe}.${fmt}`);
    }
  }
  let fontTimer;
  const changeFont = (d) => {
    const s = state.status?.settings || {};
    const size = Math.max(16, Math.min(56, (s.font_size || 26) + d));
    s.font_size = size;
    document.documentElement.style.setProperty("--ar-size", `${size}px`);
    if (curIdx >= 0) ensureVisible(wordEls[curIdx], true);
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => saveSettings({ font_size: size }), 400);
  };
  $("#font-down").onclick = () => changeFont(-2);
  $("#font-up").onclick = () => changeFont(2);
  // YouTube's slim banner keeps the less-used buttons in a "more" menu on narrow screens.
  if (embed) {
    $("#more").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const press = (sel) => () => $(sel).click();
      showMenu(r.right, r.bottom + 4, "", [
        { label: "A+  Larger text", run: press("#font-up") },
        { label: "A−  Smaller text", run: press("#font-down") },
        ...($("#fullscreen").hidden ? [] : [{ label: "⛶  Full screen", run: press("#fullscreen") }]),
        ...(nf ? [] : [
          { label: "Save transcript as TXT", run: press("#exp-txt") },
          { label: "Save subtitles as SRT", run: press("#exp-srt") },
          { label: "Save subtitles as VTT", run: press("#exp-vtt") },
        ]),
      ]);
    };
  }

  // ---------- keyboard ----------
  const onKey = (e) => {
    if (e.target.closest("input, select, textarea, button") && e.key === " ") return;
    if (e.target.closest("input, textarea, select")) return;
    if (e.key === " " ) { e.preventDefault(); audio.paused ? play() : audio.pause(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(audio.currentTime - 5, false); }
    else if (e.key === "ArrowRight") { e.preventDefault(); seekTo(audio.currentTime + 5, false); }
    else if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey) $("#restart").click();
    else if (e.key === "Escape") { if (bubble.open) bubble.hide(); else clearLoop(); }
    else if (vid && (e.key === "t" || e.key === "T")) setPanel(!playerEl.classList.contains("panel-open"));
    else if (vid && (e.key === "c" || e.key === "C")) setCaptions(playerEl.classList.contains("cc-off"));
    else if (vid && (e.key === "f" || e.key === "F") && document.fullscreenEnabled) toggleFullscreen();
    else if (vowelsBtn && (e.key === "v" || e.key === "V") && !e.ctrlKey && !e.metaKey) vowelsBtn.click();
  };
  document.addEventListener("keydown", onKey);

  // ---------- media keys ----------
  if ("mediaSession" in navigator && !embed) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: ep.title, artist: ep.feed_title,
        artwork: img ? [{ src: img }] : [] });
      navigator.mediaSession.setActionHandler("play", play);
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => seekTo(audio.currentTime - 5, false));
      navigator.mediaSession.setActionHandler("seekforward", () => seekTo(audio.currentTime + 5, false));
    } catch { /* unsupported */ }
  }

  // Jumped here from search: flash the matching word.
  if (query.get("t") !== null && n) {
    const idx = Math.max(0, activeWordIndex(starts, ends, startAt + 0.01, 1e9));
    requestAnimationFrame(() => {
      ensureVisible(wordEls[idx], true);
      wordEls[idx].classList.add("flash");
      setTimeout(() => wordEls[idx].classList.remove("flash"), 2500);
    });
  }

  const stopStudy = trackStudy("listen", () => !audio.paused); // minutes actually played count toward today's goal
  return () => {
    disposed = true;
    stopStudy();
    stopVowels();
    seen.close();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.removeEventListener("fullscreenchange", onFullscreen);
    clearTimeout(clipTimer);
    bubble.hide();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("pointerdown", onOutside);
    lsSet(posKey, audio.currentTime);
    remember();
    if (offNetflix) offNetflix();
    if (!(nf && audio.keepShowing)) audio.pause(); // (a Netflix title drawn afresh plays on)
    delete window.__apsAudio;
    clearTimeout(followPopTimer);
    if (embed) audio.dispose();
    else {
      audio.removeAttribute("src");
      audio.load();
    }
    cancelAnimationFrame(raf);
    trPicker.destroy();
    if (capPicker) capPicker.destroy();
    document.removeEventListener("keydown", onKey);
    hideMenu();
  };
}
