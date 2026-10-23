// Tamkeen for Netflix: the subtitle bar and the transcript sidebar, shown over a Netflix watch page
// (content/netflix.js puts this page in a frame there). Modelled on Tamkeen's YouTube player:
//   - Netflix's own player keeps playing the video; its picture fills the space the bar and the
//     sidebar leave (the "video box"), and nothing of Tamkeen is ever drawn over it;
//   - the bar along the bottom shows the current subtitle line as words you can tap, and Tamkeen's
//     controls (play/pause, back and ahead 5 seconds, speed, quick or detailed lookups);
//   - the sidebar on the right shows the whole transcript, the current line highlighted and kept in
//     view; tapping a line plays from there; it folds away to a slim tab for the full width;
//   - a tapped word opens Tamkeen's word popup (meaning, Save, play the word or sentence again),
//     docked in the sidebar or just above the bar, so the video gets shorter instead of covered.
// The subtitles are Netflix's own, in the language being learned: Netflix's player downloads them once
// they are chosen (js/netflix-player.js chooses them), the background part catches that file and
// hands it over (background.js). Saved words and the title wait in the extension's storage until the
// web app takes them into the library (web/js/extbridge.js).
import { esc, h, toast } from "../app.js";
import { device, kv, known, loadSettings, settings } from "../store.js";
import { startTranslating, t } from "../i18n.js";
import { icon } from "../icons.js";
import { sentenceStart } from "../sentencestart.js";
import { gap, joinWords, regroupWords, setLang, setStudyLanguage } from "../languages.js";
import { EDGE_PUNCT, activeWordIndex, formatTime, sentenceBounds } from "../wordlookup.js";
import { createWordBubble, pauseAfterWord } from "../components/wordbubble.js";
import { phrasePicker } from "../components/phrasepick.js";
import { isPhrase, phraseText } from "../phrase.js";
import { lookupToggle } from "../components/lookupmode.js";
import { getDefinition } from "../define-service.js";
import { markWord } from "../definer.js";
import { readingsReady } from "../lexicon/readings.js";
import { bestSubtitles, captionLines, cleanInfo, displayTitle } from "../netflix-ttml.js";
import { languageName, subtitleNote } from "../netflix.js";
import { TITLE_KEY, WORD_KEY, savedWord, watchedTitle } from "../extbridge.js";
import { CONFIG } from "./config.js";

// ---------- the private line to the page (opened by content/netflix.js with this page's token) ----------
const NONCE = location.hash.slice(1);
let port = null;
let ready = false; // the page below is drawn: until then the page's messages wait
const early = [];
addEventListener("message", (e) => {
  if (port || e.source !== parent || !/^[0-9a-f]{32}$/.test(NONCE) || !e.data || e.data.tamkeenPanel !== NONCE || !e.ports[0]) return;
  port = e.ports[0];
  port.onmessage = (m) => (ready ? onPage(m.data || {}) : early.push(m.data || {}));
  if (ready) reportLayout();
});
const send = (msg) => { if (port) port.postMessage(msg); };
const cmd = (name, value = 0) => send({ type: "cmd", name, value });

// ---------- what is known ----------
const SIDE_KEY = "tkSideOpen";
const S = {
  id: "", since: 0, player: null, at: 0,      // the title in the page, and the player's last state
  files: [], fileKey: "", infos: {},            // subtitle files caught in this tab; titles' names
  lang: "", lines: [], n: 0,                    // the transcript shown
  starts: new Float64Array(0), ends: new Float64Array(0), segOf: new Int32Array(0), texts: [],
  segFirst: [], segLast: [],
  curSeg: -1, curWord: -1, capSeg: -1, capLock: -1,
  clipEnd: null, userScrolled: 0, seeking: false, titleSaved: "",
};
const savedHere = new Set();

// ---------- the page ----------
await loadSettings();
setStudyLanguage(settings.study_language || "ar");
document.documentElement.style.setProperty("--ar-size", `${settings.font_size || 26}px`);
try { // this device's lookup choices, as the web app has them
  localStorage.setItem("lookupMode", device.lookup_mode === "quick" ? "quick" : "detailed");
  localStorage.setItem("wordPause", device.word_pause === false ? "0" : "1");
} catch { /* storage off: the defaults */ }

const root = document.getElementById("tk");
root.innerHTML = `
  <aside class="side" id="side">
    <div class="side-head">
      <button type="button" class="ghost icon" id="fold" title="Hide the transcript (T)" aria-label="Hide the transcript">${icon("chevron", 18)}</button>
      <div class="side-what"><div class="nf-name" dir="auto"></div><div class="nf-sub small muted" dir="auto"></div></div>
    </div>
    <div class="side-notes" id="notes"></div>
    <div class="lines" id="lines"></div>
    <div class="side-pop" id="side-pop"></div>
    <div class="side-foot" id="foot" hidden></div>
  </aside>
  <button type="button" class="side-tab" id="tab" hidden title="Show the transcript (T)" aria-label="Show the transcript">${icon("chevron", 16)}</button>
  <section class="bar" id="bar">
    <div class="bar-pop" id="bar-pop"></div>
    <div class="cap" id="cap"></div>
    <div class="bar-note small" id="bar-note" hidden></div>
    <div class="seekrow"><span id="cur">0:00</span><input type="range" id="seek" min="0" max="1" step="0.1" value="0" aria-label="Seek"><span id="dur">0:00</span></div>
    <div class="ctl">
      <div class="ctl-side"></div>
      <div class="ctl-main">
        <button type="button" id="restart" title="Back to the start of the sentence (R)" aria-label="Back to the start of the sentence">${icon("sentence-start", 18)}</button>
        <button type="button" id="back" title="Back 5 seconds (←)" aria-label="Back 5 seconds">${icon("back", 18)}<span>5</span></button>
        <button type="button" id="play" class="play primary" title="Play/Pause (Space)" aria-label="Play">${icon("play", 20)}</button>
        <button type="button" id="ahead" title="Forward 5 seconds (→)" aria-label="Forward 5 seconds"><span>5</span>${icon("ahead", 18)}</button>
        <select id="speed" title="Playback speed">${[0.5, 0.75, 0.9, 1, 1.25, 1.5].map((x) => `<option value="${x}">${x}×</option>`).join("")}</select>
      </div>
      <div class="ctl-side end">
        <button type="button" class="ghost icon" id="side-btn" title="Show or hide the transcript (T)" aria-label="Transcript">${icon("transcript", 18)}</button>
        <button type="button" class="ghost icon" id="full" title="Full screen (F)" aria-label="Full screen">${icon("fullscreen", 18)}</button>
        <button type="button" class="ghost icon" id="leave" title="Back to Netflix's titles" aria-label="Back to Netflix's titles">${icon("leave", 18)}</button>
      </div>
    </div>
  </section>`;
const $ = (sel) => root.querySelector(sel);
const side = $("#side"), bar = $("#bar"), cap = $("#cap"), linesEl = $("#lines"), tab = $("#tab");
setLang(cap, settings.study_language || "ar");
setLang(linesEl, settings.study_language || "ar");
$("#speed").value = "1";
$("#speed").after(lookupToggle());
await startTranslating(settings.ui_language || "en");

// ---------- the space taken: the page fits Netflix's picture into the rest ----------
function sideOpen() { try { return localStorage.getItem(SIDE_KEY) !== "0"; } catch { return true; } }
function setSide(open) {
  try { localStorage.setItem(SIDE_KEY, open ? "1" : "0"); } catch { /* not kept */ }
  root.classList.toggle("folded", !open);
  side.hidden = !open;
  tab.hidden = open;
  if (!open && bubble.open && bubble.el.parentNode === $("#side-pop")) bubble.hide();
  if (open) setTimeout(() => keepInView(true), 50);
  reportLayout();
}
function reportLayout() {
  const w = side.hidden ? tab.offsetWidth : side.offsetWidth;
  root.style.setProperty("--side", `${w}px`);
  send({ type: "layout", side: w, bar: bar.offsetHeight });
}
new ResizeObserver(reportLayout).observe(bar);
new ResizeObserver(reportLayout).observe(side);
addEventListener("resize", reportLayout);

// ---------- the word popup ----------
let target = null; // {i, j, si, sj, text}
const bubble = createWordBubble($("#side-pop"), {
  fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
  onPlayWord: () => target && playClip(S.starts[target.i], S.ends[target.j]),
  onPlaySentence: () => target && playClip(S.starts[target.si], S.ends[target.sj]),
  onPlayFrom: () => { if (target) { S.clipEnd = null; seek(S.starts[target.i]); cmd("play"); } },
  onPauseMode: (pause) => {
    S.clipEnd = null;
    if (pause && S.player && !S.player.paused) cmd("pause");
    else if (!pause && S.player && S.player.paused) cmd("play");
  },
  onSettings: () => window.open(`${CONFIG.webApp}#/settings?s=words`, "_blank", "noopener"),
  onSave: async (def) => {
    const tg = target;
    const w = savedWord({ netflixId: S.id, def, word: tg.text, lang: S.lang, sentence: sentenceText(tg.si, tg.sj),
      start: S.starts[tg.i], end: S.ends[tg.j], sentStart: S.starts[tg.si], sentEnd: S.ends[tg.sj], title: titleName() });
    if (!w) { toast("Couldn't save this word.", { error: true }); throw new Error("not saved"); }
    if (S.titleSaved !== S.id) await saveTitle(); // so the word has its title in the library
    await chrome.storage.local.set({ [WORD_KEY + w.uid]: w });
    savedHere.add(`${tg.i}-${tg.j}`);
  },
});

function sentenceText(a, b) { return joinWords(S.texts.slice(a, b + 1), S.lang); }

function contextFor(i, j) {
  const { texts, segOf, n } = S;
  const [si, sj] = sentenceBounds(texts, segOf, i, j);
  const prev = si > 0 ? sentenceBounds(texts, segOf, si - 1) : null;
  const next = sj < n - 1 ? sentenceBounds(texts, segOf, sj + 1) : null;
  const word = phraseText(texts, i, j, S.lang);
  return {
    si, sj, word,
    ctx: { word, lang: S.lang, marked: markWord(texts.slice(si, sj + 1), i - si, j - si, S.lang),
      before: prev ? sentenceText(prev[0], prev[1]) : "", after: next ? sentenceText(next[0], next[1]) : "",
      podcast: "Netflix", episode: titleName(), phrase: isPhrase(i, j) },
  };
}

/** Look up words i..j (one word, or several dragged across together: components/phrasepick.js). */
function defineAt(i, anchor, where, j = i) {
  const c = contextFor(i, j);
  target = { i, j, si: c.si, sj: c.sj, text: c.word };
  S.clipEnd = null;
  if (pauseAfterWord() && S.player && !S.player.paused) cmd("pause");
  const inBar = where === "bar" || side.hidden;
  if (inBar) { S.capLock = S.segOf[i]; drawCaption(S.capLock); anchor = cap.querySelector(`.w[data-i="${i}"]`) || anchor; }
  else S.capLock = -1;
  bubble.show(anchor, c.ctx, { host: inBar ? $("#bar-pop") : $("#side-pop"), docked: true, saved: savedHere.has(`${i}-${j}`) });
  if (!inBar) setTimeout(() => anchor.scrollIntoView({ block: "nearest" }), 30);
}

// ---------- the transcript ----------
function wordsHtml(a, b) {
  let out = "";
  for (let i = a; i <= b; i++) {
    if (i > a) out += esc(gap(S.texts[i - 1], S.texts[i], S.lang));
    out += `<span class="w" data-i="${i}">${esc(S.texts[i])}</span>`;
  }
  return out;
}

async function useLines(lines, lang) {
  S.lang = lang;
  S.lines = lines;
  await readingsReady(lang, 3000).catch(() => {}); // Japanese and Chinese: the dictionary that splits words, if here
  const W = { start: [], end: [], seg: [], text: [] };
  lines.forEach((l, si) => { for (const [s, e, w] of l.words) { W.start.push(s); W.end.push(e); W.text.push(w); W.seg.push(si); } });
  const R = regroupWords(W, lang, true, (si) => (lines[si] ? lines[si].text : ""));
  S.n = R.text.length;
  S.starts = Float64Array.from(R.start);
  S.ends = Float64Array.from(R.end);
  S.segOf = Int32Array.from(R.seg);
  S.texts = R.text;
  S.segFirst = lines.map(() => -1);
  S.segLast = lines.map(() => -1);
  for (let i = 0; i < S.n; i++) {
    const s = S.segOf[i];
    if (S.segFirst[s] < 0) S.segFirst[s] = i;
    S.segLast[s] = i;
  }
  S.curSeg = S.curWord = S.capSeg = S.capLock = -1;
  setLang(cap, lang); // (text in the language being learned: never translated, drawn in its direction)
  setLang(linesEl, lang);
  linesEl.innerHTML = lines.map((l, si) => S.segFirst[si] < 0 ? "" : `<p class="ln" data-s="${si}"><button type="button" class="ln-t" tabindex="-1">${formatTime(l.start)}</button><span class="ln-x">${wordsHtml(S.segFirst[si], S.segLast[si])}</span></p>`).join("");
  cap.innerHTML = "";
  if (bubble.open) bubble.hide();
  paintNotes();
}

function clearTranscript() {
  S.lines = [];
  S.n = 0;
  S.texts = [];
  S.fileKey = "";
  linesEl.innerHTML = "";
  cap.innerHTML = "";
  S.curSeg = S.curWord = S.capSeg = S.capLock = -1;
  if (bubble.open) bubble.hide();
}

/** The line on screen at time `t`, or -1 between lines. */
function segAt(t) {
  const L = S.lines;
  let lo = 0, hi = L.length - 1, hit = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid].start <= t + 0.05) { hit = mid; lo = mid + 1; } else hi = mid - 1; }
  return hit >= 0 && t <= L[hit].end + 0.25 && S.segFirst[hit] >= 0 ? hit : -1;
}

function drawCaption(si) {
  if (si === S.capSeg) return;
  S.capSeg = si;
  cap.innerHTML = si >= 0 ? wordsHtml(S.segFirst[si], S.segLast[si]) : "";
}

function keepInView(force = false) {
  if (S.curSeg < 0 || side.hidden) return;
  if (!force && Date.now() - S.userScrolled < 4000) return;
  const el = linesEl.querySelector(`.ln[data-s="${S.curSeg}"]`);
  if (!el) return;
  const box = linesEl.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (force || r.top < box.top + 8 || r.bottom > box.bottom - 8) linesEl.scrollTop += r.top - box.top - box.height * 0.3;
}
linesEl.addEventListener("wheel", () => { S.userScrolled = Date.now(); }, { passive: true });
linesEl.addEventListener("touchmove", () => { S.userScrolled = Date.now(); }, { passive: true });

// ---------- time: Netflix's player reports a few times a second; in between it runs on ----------
function now() {
  const p = S.player;
  if (!p) return 0;
  if (p.paused) return p.t;
  return Math.min(p.t + ((Date.now() - S.at) / 1000) * (p.rate || 1), p.t + 1.5);
}
function seek(sec) { cmd("seek", Math.max(0, sec)); if (S.player) { S.player.t = Math.max(0, sec); S.at = Date.now(); } }
function playClip(a, b) { if (!(b > a)) return; seek(a); S.clipEnd = b; cmd("play"); }

function frame() {
  requestAnimationFrame(frame);
  if (!S.player || !S.n) return;
  const tNow = now();
  if (S.clipEnd !== null && tNow >= S.clipEnd) { S.clipEnd = null; cmd("pause"); }
  if (!bubble.open && !S.picking) S.capLock = -1;
  const si = segAt(tNow);
  drawCaption(S.capLock >= 0 ? S.capLock : si);
  if (si !== S.curSeg) {
    linesEl.querySelector(".ln.cur")?.classList.remove("cur");
    S.curSeg = si;
    if (si >= 0) { linesEl.querySelector(`.ln[data-s="${si}"]`)?.classList.add("cur"); keepInView(); }
  }
  const wi = si >= 0 ? activeWordIndex(S.starts, S.ends, tNow) : -1;
  if (wi !== S.curWord) {
    for (const el of root.querySelectorAll(".w.cur")) el.classList.remove("cur");
    S.curWord = wi;
    if (wi >= 0) for (const el of root.querySelectorAll(`.w[data-i="${wi}"]`)) el.classList.add("cur");
  }
}
requestAnimationFrame(frame);

// ---------- the controls ----------
$("#play").onclick = () => { S.clipEnd = null; cmd(S.player && !S.player.paused ? "pause" : "play"); };
$("#back").onclick = () => { S.clipEnd = null; seek(now() - 5); };
$("#restart").onclick = () => { S.clipEnd = null; seek(sentenceStart(S.lines.map((l) => l.start), now())); };
$("#ahead").onclick = () => { S.clipEnd = null; seek(now() + 5); };
$("#speed").onchange = (e) => cmd("rate", Number(e.target.value) || 1);
$("#fold").onclick = () => setSide(false);
tab.onclick = () => setSide(true);
$("#side-btn").onclick = () => setSide(side.hidden);
$("#full").onclick = () => send({ type: "fullscreen" });
$("#leave").onclick = () => send({ type: "leave" });
const seekEl = $("#seek");
seekEl.addEventListener("input", () => { S.seeking = true; $("#cur").textContent = formatTime(Number(seekEl.value)); });
seekEl.addEventListener("change", () => { S.seeking = false; S.clipEnd = null; seek(Number(seekEl.value)); });

cap.addEventListener("click", (e) => {
  const w = e.target.closest(".w");
  if (w) defineAt(Number(w.dataset.i), w, "bar");
});
linesEl.addEventListener("click", (e) => {
  const w = e.target.closest(".w");
  if (w) { defineAt(Number(w.dataset.i), w, "side"); return; }
  const line = e.target.closest(".ln");
  if (line) { S.clipEnd = null; seek(S.lines[Number(line.dataset.s)].start); S.userScrolled = 0; }
});
// Words dragged across with the mouse (or held and slid across) are looked up together, within one line.
// While the mouse is down on a caption word, the caption stays (it may be dragged on to the next words).
phrasePicker(cap, {
  blockOf: (k) => S.segOf[k],
  onPick: (i, j, el) => defineAt(i, el, "bar", j),
  onStart: () => { S.picking = true; S.capLock = S.capSeg; },
  onEnd: () => { S.picking = false; },
});
phrasePicker(linesEl, {
  blockOf: (k) => S.segOf[k],
  onPick: (i, j, el) => defineAt(i, el, "side", j),
});

addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, select, textarea")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === " ") { e.preventDefault(); $("#play").click(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); $("#back").click(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); $("#ahead").click(); }
  else if (e.key === "r" || e.key === "R") $("#restart").click();
  else if (e.key === "t" || e.key === "T") setSide(side.hidden);
  else if (e.key === "f" || e.key === "F") send({ type: "fullscreen" });
  else if (e.key === "Escape" && bubble.open) bubble.hide();
});

// ---------- the title and its subtitles ----------
function titleInfo() {
  const p = S.player;
  return cleanInfo(S.infos[S.id] || (p && p.id === S.id ? p.info : null) || {});
}
function titleName() { const i = titleInfo(); return i.title || i.show ? displayTitle(i) : ""; }

/** Keep the title (with its subtitles) for the web app's library. */
async function saveTitle() {
  if (!S.id || !S.lines.length) return;
  const rec = watchedTitle({ id: S.id, info: titleInfo(), language: S.lang, lines: S.lines });
  if (rec) { await chrome.storage.local.set({ [TITLE_KEY + S.id]: rec }); S.titleSaved = S.id; }
}

async function newTitle(id) {
  S.id = id;
  S.since = Date.now();
  savedHere.clear();
  clearTranscript();
  // Watched here before: its words at once, before Netflix's file arrives again.
  const kept = await kv.get(`nf:${id}`).catch(() => null);
  if (kept && kept.lines && kept.lines.length && S.id === id) {
    S.fileKey = kept.key || "";
    await useLines(kept.lines, kept.lang);
  }
  chooseFile();
}

/** The subtitle file to show for this title (see bestSubtitles), once the page has chosen subtitles in
 * the language being learned (not Netflix's own few "forced" lines, nor another language's). */
async function chooseFile() {
  const p = S.player;
  if (!S.id || !p || p.id !== S.id || !p.subs || p.subs.status !== "chosen") return;
  // A file counts for the title it was downloaded under, unless it came long after the title began
  // (Netflix fetching the next episode's subtitles early).
  const mine = S.files.filter((f) => f.watchId === S.id && f.at <= S.since + 120000);
  const best = bestSubtitles(mine, settings.study_language, p.subs.bcp47);
  if (!best || best.key === S.fileKey) return;
  if (S.n && S.lines.length >= best.cues.length && S.fileKey) return; // the words shown already have as many lines
  S.fileKey = best.key;
  const id = S.id;
  const lines = captionLines(best.cues);
  await useLines(lines, settings.study_language);
  await kv.set(`nf:${id}`, { key: best.key, lang: S.lang, lines }).catch(() => {});
  await saveTitle();
  tellOnce();
}

// The one-time note: Netflix remembers the subtitle language for the profile.
let told = false;
async function tellOnce() {
  if (told) return;
  told = true;
  const got = await chrome.storage.local.get("told_subtitles");
  if (got.told_subtitles) return;
  const note = h(`<div class="once"><p></p><button type="button" class="primary">Got it</button></div>`);
  note.querySelector("p").textContent = t("Tamkeen switched Netflix's subtitles to {0}. Netflix remembers this for your profile, so they may show on your other devices too; you can change them there in Netflix's subtitle menu.", languageName(S.lang));
  note.querySelector("button").onclick = () => { note.remove(); chrome.storage.local.set({ told_subtitles: true }); };
  $("#notes").append(note);
}

// ---------- what to say ----------
let lastNotes = "";
function paintNotes() {
  const p = S.player;
  const lines = [];
  let action = "";
  if (!known()) {
    lines.push(t("Open Tamkeen once, so the extension knows the language you're learning and how you look words up."));
    action = "open";
  } else if (!p || p.page !== "watch") {
    lines.push(t("Waiting for Netflix's player…"));
  } else if (p.error) {
    lines.push(t("Netflix says: {0}", p.error));
  } else if (p.prompt) {
    lines.push(t("Netflix is asking something. Answer it on Netflix's page."));
  } else {
    const note = subtitleNote(p, { words: S.n, lang: settings.study_language });
    if (note.subs) lines.push(note.subs);
    if (note.sound) lines.push(note.sound);
  }
  const key = lines.join("\n") + action;
  if (key === lastNotes) return;
  lastNotes = key;
  const notes = $("#notes");
  for (const el of notes.querySelectorAll(".note")) el.remove();
  for (const line of lines) {
    const el = h(`<p class="note"></p>`);
    el.textContent = line;
    notes.prepend(el);
  }
  if (action === "open") {
    const b = h(`<p class="note"><a class="btn primary" target="_blank" rel="noopener">Open Tamkeen</a></p>`);
    b.querySelector("a").href = CONFIG.webApp;
    notes.append(b);
  }
  const barNote = $("#bar-note");
  barNote.textContent = !S.n && lines.length ? lines[0] : "";
  barNote.hidden = !barNote.textContent;
}

async function paintFoot() {
  const all = await chrome.storage.local.get(null);
  const n = Object.keys(all).filter((k) => k.startsWith(WORD_KEY)).length;
  const foot = $("#foot");
  foot.hidden = !n;
  if (!n) return;
  foot.innerHTML = "";
  const text = h(`<span class="small muted"></span>`);
  text.textContent = n === 1 ? t("1 saved word goes to your Vocab when you open Tamkeen.")
    : t("{0} saved words go to your Vocab when you open Tamkeen.", n);
  const open = h(`<a class="btn" target="_blank" rel="noopener">Open Tamkeen</a>`);
  open.href = CONFIG.webApp;
  foot.append(text, open);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (Object.keys(changes).some((k) => k.startsWith(WORD_KEY))) paintFoot();
  if (changes.settings) loadSettings().then(paintNotes);
});
paintFoot();

// ---------- messages ----------
function onPage(m) {
  if (m.type === "state" && m.s && typeof m.s === "object") {
    const s = m.s;
    S.player = s;
    S.at = Number(m.at) || Date.now();
    if (s.id && s.id !== S.id) newTitle(s.id);
    else chooseFile();
    if ($("#play").dataset.paused !== String(!!s.paused)) {
      $("#play").dataset.paused = String(!!s.paused);
      $("#play").innerHTML = icon(s.paused ? "play" : "pause", 20);
      $("#play").setAttribute("aria-label", s.paused ? "Play" : "Pause");
    }
    if (s.d > 0) {
      seekEl.max = String(s.d);
      $("#dur").textContent = formatTime(s.d);
      if (!S.seeking) { seekEl.value = String(now()); $("#cur").textContent = formatTime(now()); }
    }
    if (document.activeElement !== $("#speed") && Number($("#speed").value) !== s.rate && [0.5, 0.75, 0.9, 1, 1.25, 1.5].includes(s.rate)) $("#speed").value = String(s.rate);
    paintNotes();
    paintName();
  } else if (m.type === "info" && m.id && m.info) {
    S.infos[m.id] = cleanInfo(m.info);
    paintName();
    if (m.id === S.id) saveTitle();
  } else if (m.type === "fullscreen") {
    $("#full").classList.toggle("on", !!m.on);
  }
}
function paintName() {
  const i = titleInfo();
  root.querySelector(".nf-name").textContent = i.show || i.title || "Netflix";
  root.querySelector(".nf-sub").textContent = i.show ? [i.season && i.episode ? `S${i.season}:E${i.episode}` : "", i.episode_title].filter(Boolean).join(" · ") : "";
}

// The subtitle files this tab's Netflix player downloads (background.js).
function connect() {
  const bg = chrome.runtime.connect({ name: "panel" });
  bg.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "subtitles" || !msg.file || !Array.isArray(msg.file.cues)) return;
    const f = msg.file;
    if (!S.files.some((x) => x.key === f.key && x.watchId === f.watchId)) S.files.push(f);
    chooseFile();
  });
  bg.onDisconnect.addListener(() => setTimeout(connect, 1000)); // the background part slept: again
}
connect();

setSide(sideOpen());
paintNotes();
paintName();
ready = true;
for (const m of early.splice(0)) onPage(m);
reportLayout();
