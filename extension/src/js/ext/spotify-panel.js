// Tamkeen's karaoke for Spotify: the lyrics panel, a column at the right of Spotify's web player
// (content/spotify.js puts this page in a frame there and narrows Spotify's app to the rest).
//   - The song playing on Spotify (content/spotify-main.js reads it from the page) is looked up in
//     LRCLIB, the free collection of lyrics with line timings (background.js asks it; web/js/lyrics.js
//     chooses the record). When LRCLIB has no timed lyrics and Spotify's own lyrics view is open, the
//     lines Spotify shows are used, following the line Spotify marks.
//   - Karaoke: the line being sung big and centred, the lines before and after it dimmer, the words
//     lighting up as they are (about) sung; the view follows the song, and stops following while the
//     viewer scrolls it by hand ("Follow along" brings it back). Lyrics without timings show as a
//     page to scroll.
//   - Every word can be clicked (or several dragged across) for Tamkeen's word popup: its meaning,
//     play the word or line again on Spotify, and Save: a card with the lyric line as its sentence
//     and "Spotify – Artist – Title" as where it came from (the web app takes it into the Vocab:
//     web/js/extbridge.js). Spotify's sound is never kept; the card gets the card voice.
//   - The song's language comes from its words (lyrics.js detectLyricsLanguage). Words are looked
//     up in it when it is the language being learned (or one of those ticked in Settings); in another
//     language Tamkeen teaches, the panel offers to look them up in it anyway; in one it doesn't, the
//     lyrics still show and the panel says lookups aren't available.
import { h, toast } from "../app.js";
import { known, loadSettings, settings } from "../store.js";
import { startTranslating, t, uiLanguage } from "../i18n.js";
import { icon } from "../icons.js";
import { isLanguage, joinWords, langInfo, setLang } from "../languages.js";
import { activeWordIndex } from "../wordlookup.js";
import { createWordBubble, pauseAfterWord } from "../components/wordbubble.js";
import { phrasePicker } from "../components/phrasepick.js";
import { isPhrase, phraseText } from "../phrase.js";
import { lookupToggle } from "../components/lookupmode.js";
import { getDefinition } from "../define-service.js";
import { markWord } from "../definer.js";
import { detectLyricsLanguage, lineAt, lineBefore, lyricLines, normName, parseLrc, plainLines } from "../lyrics.js";
import { WORD_KEY, savedSpotifyWord } from "../extbridge.js";
import { applySettings, flash as flashIn, followSettings, pagePort, savedFoot, transcriptWords, wordsHtml } from "./common.js";
import { CONFIG } from "./config.js";

// ---------- the private line to the page (opened by content/spotify.js with this page's token) ----------
const page = pagePort();
const cmd = (name, value = 0) => page.send({ type: "cmd", name, value });

// ---------- what is known ----------
const OPEN_KEY = "tkSpotifyOpen";
const LATIN = ["en", "es", "fr", "it", "pt", "ca", "de", "tl", "ceb"]; // (their word lists tell them apart)
const S = {
  player: null, at: 0,               // Spotify's last report: {title, artist, album, id, t, d, paused, rate, at}
  key: "", track: null, since: 0,    // the song: {title, artist, album, id, d}
  asked: "", lrc: undefined,         // LRCLIB's record for the song (null: none; undefined: not asked yet)
  lrcError: false,
  page: { hash: "", lines: [], active: -1, seen: false }, // Spotify's own lyrics on its page, if open
  shown: "",                         // what the view shows now (source and content)
  source: "", synced: false,         // "lrclib" or "spotify"; timed or not
  lines: [], n: 0, starts: new Float64Array(0), ends: new Float64Array(0), segOf: new Int32Array(0), texts: [],
  segFirst: [], segLast: [],
  detected: { lang: "", script: "" }, lang: "", wordLang: "", offers: [], // (lang: looked up in; wordLang: written in)
  curSeg: -1, curWord: -1, follow: true, autoAt: 0, clipEnd: null, picking: false,
};
const savedHere = new Set();
const choices = new Map(); // song key -> the language chosen for its words ("-" for none)

// ---------- the page ----------
await loadSettings();
applySettings();

const root = document.getElementById("tk");
root.innerHTML = `
  <aside class="side" id="side">
    <div class="side-head">
      <button type="button" class="ghost icon" id="fold" title="Hide Tamkeen's lyrics" aria-label="Hide Tamkeen's lyrics">${icon("chevron", 18)}</button>
      <div class="side-what"><div class="nf-name" dir="auto"></div><div class="nf-sub small muted" dir="auto"></div></div>
      <span class="sp-mark" aria-hidden="true">${icon("music", 18)}</span>
    </div>
    <div class="side-notes" id="notes"></div>
    <div class="karaoke">
      <div class="lines" id="lines" tabindex="-1"></div>
      <button type="button" class="follow" id="follow" hidden>${icon("transcript", 16)} <span>Follow along</span></button>
    </div>
    <div class="side-pop" id="side-pop"></div>
    <div class="sp-ctl ctl">
      <div class="ctl-main">
        <button type="button" id="restart" title="Back to the start of the line (R)" aria-label="Back to the start of the line">${icon("sentence-start", 18)}</button>
        <button type="button" id="back" title="Back 5 seconds (←)" aria-label="Back 5 seconds">${icon("back", 18)}<span>5</span></button>
        <button type="button" id="play" class="play primary" title="Play/Pause (Space)" aria-label="Play">${icon("play", 20)}</button>
      </div>
    </div>
    <div class="side-foot" id="foot" hidden></div>
  </aside>
  <button type="button" class="side-tab" id="tab" hidden title="Show Tamkeen's lyrics" aria-label="Show Tamkeen's lyrics">${icon("chevron", 16)}</button>`;
const $ = (sel) => root.querySelector(sel);
const side = $("#side"), linesEl = $("#lines"), tab = $("#tab"), pop = $("#side-pop");
$(".ctl-main").append(lookupToggle());
await startTranslating(settings.ui_language || "en");

// ---------- showing and folding the panel (content/spotify.js gives it its column) ----------
function isOpen() { try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; } }
function setOpen(open) {
  try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* not kept */ }
  side.hidden = !open;
  tab.hidden = open;
  if (!open && bubble.open) bubble.hide();
  page.send({ type: "layout", open }); // (content/spotify.js sizes the column: a slim tab when folded)
  if (open) setTimeout(() => centre(S.curSeg >= 0 ? S.curSeg : lineBefore(S.lines, now()), false), 60);
}
$("#fold").onclick = () => setOpen(false);
tab.onclick = () => setOpen(true);

// ---------- the word popup ----------
let target = null; // {i, j, si, sj, text}
const actions = {
  // Spotify's sound is never kept: a word saved here gets the card voice when the web app takes it in
  // (mobile/src/js/web-extension.js). While saved words get no voice by themselves, "Add audio" opens
  // the web app's Settings → Card voices.
  voiceless: true,
  noAudio: true, // (lyrics without timings, or Spotify's own: no moment to play: see showLines)
  audioOn: () => settings.card_voices === true,
  onAddAudio: () => window.open(`${CONFIG.webApp}#/settings?s=voices&show=cardvoice`, "_blank", "noopener"),
  fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
  onPlayWord: () => target && playClip(S.starts[target.i], S.ends[target.j] + 0.25),
  onPlaySentence: () => target && playClip(S.lines[S.segOf[target.i]].start, S.lines[S.segOf[target.i]].end + 0.4),
  onPlayFrom: () => { if (target) { S.clipEnd = null; seek(S.starts[target.i]); cmd("play"); } },
  onPauseMode: (pause) => {
    S.clipEnd = null;
    if (pause && S.player && !S.player.paused) cmd("pause");
    else if (!pause && S.player && S.player.paused) cmd("play");
  },
  onSettings: () => window.open(`${CONFIG.webApp}#/settings?s=words`, "_blank", "noopener"),
  onSave: async (def) => {
    const tg = target;
    const w = savedSpotifyWord({ track: S.track, def, word: tg.text, lang: S.lang, sentence: lineText(S.segOf[tg.i]) });
    if (!w) { toast("Couldn't save this word.", { error: true }); throw new Error("not saved"); }
    await chrome.storage.local.set({ [WORD_KEY + w.uid]: w });
    savedHere.add(`${S.key}|${tg.i}-${tg.j}`);
  },
};
const bubble = createWordBubble(pop, actions);

const songName = () => (S.track ? [S.track.artist, S.track.title].filter(Boolean).join(" – ") : "");
function lineText(si) { return si >= 0 && S.segFirst[si] >= 0 ? joinWords(S.texts.slice(S.segFirst[si], S.segLast[si] + 1), S.wordLang) : ""; }

function contextFor(i, j) {
  const si = S.segOf[i];
  const a = S.segFirst[si], b = S.segLast[si];
  const word = phraseText(S.texts, i, j, S.lang);
  let prev = si - 1, next = si + 1;
  while (prev >= 0 && S.segFirst[prev] < 0) prev--;
  while (next < S.lines.length && S.segFirst[next] < 0) next++;
  return {
    si: a, sj: b, word,
    ctx: { word, lang: S.lang, marked: markWord(S.texts.slice(a, b + 1), i - a, Math.min(j, b) - a, S.lang),
      before: prev >= 0 ? lineText(prev) : "", after: next < S.lines.length ? lineText(next) : "",
      podcast: "Spotify", episode: songName(), phrase: isPhrase(i, j) },
  };
}

/** Look up words i..j (one word, or several dragged across together: components/phrasepick.js). */
function defineAt(i, anchor, j = i) {
  if (!isLanguage(S.lang)) { noLookup(); return; }
  const c = contextFor(i, j);
  target = { i, j, si: c.si, sj: c.sj, text: c.word };
  S.clipEnd = null;
  if (pauseAfterWord() && S.player && !S.player.paused) cmd("pause");
  bubble.show(anchor, c.ctx, { host: pop, docked: true, saved: savedHere.has(`${S.key}|${i}-${j}`) });
  setTimeout(() => { if (!S.follow) anchor.scrollIntoView({ block: "nearest" }); else centre(S.curSeg, false); }, 40);
}

/** A word clicked while its language isn't chosen (or isn't one Tamkeen teaches): why not, and the way. */
function noLookup() {
  const offer = S.offers[0];
  if (offer) flashIn(pop, t("Look up this song's words in {0}?", nameOf(offer)), bubble, { text: t("Look up words in {0}", nameOf(offer)), onClick: () => chooseLanguage(offer) });
  else flashIn(pop, cantText(), bubble);
}

// ---------- time: Spotify reports a few times a second; in between it runs on ----------
function now() {
  const p = S.player;
  if (!p || !Number.isFinite(p.t)) return 0;
  if (p.paused) return p.t;
  return Math.min(p.t + ((Date.now() - S.at) / 1000) * (p.rate || 1), p.t + 1.5);
}
function seek(sec) { cmd("seek", Math.max(0, sec)); if (S.player) { S.player.t = Math.max(0, sec); S.at = Date.now(); } }
function playClip(a, b) {
  if (!(b > a) || !Number.isFinite(a)) return;
  seek(a);
  S.clipEnd = b;
  cmd("play");
}

// ---------- the karaoke view ----------
/** Show the song's lines: `lines` as lyrics.js lyricLines makes them, `synced` when they are timed
 * (or followed by Spotify's marked line). */
async function showLines(lines, { source, synced }) {
  const key = S.key;
  S.source = source;
  S.synced = synced;
  S.lines = lines;
  S.curSeg = S.curWord = -1;
  if (bubble.open) bubble.hide();
  // The song's language, from its words (the word lists of the languages in Latin letters, when they
  // are written in them).
  const text = lines.map((l) => l.text).join("\n");
  let lists = {};
  if (/[a-zÀ-ɏ]/i.test(text)) {
    const got = await Promise.all(LATIN.map((c) => import(`../wordlists/${c}.js`).then((m) => [c, m.default]).catch(() => [c, null])));
    lists = Object.fromEntries(got.filter(([, l]) => Array.isArray(l)));
  }
  if (S.key !== key) return;
  S.detected = detectLyricsLanguage(text, lists);
  decideLanguage();
  // The words are split and spaced as the song's language writes them (Japanese, Chinese and Thai
  // have no spaces), even before its words can be looked up.
  S.wordLang = S.lang || (isLanguage(S.detected.lang) ? S.detected.lang : "");
  Object.assign(S, await transcriptWords(lines, S.wordLang));
  if (S.key !== key) return;
  actions.noAudio = !(synced && source === "lrclib");
  setLang(linesEl, S.wordLang || "en");
  if (!S.wordLang) { linesEl.lang = S.detected.lang || ""; linesEl.dir = "auto"; }
  linesEl.classList.toggle("plain", !synced);
  linesEl.classList.toggle("nolookup", !isLanguage(S.lang));
  linesEl.innerHTML = lines.map((l, si) => S.segFirst[si] < 0 ? "" : `<p class="ln" data-s="${si}">${wordsHtml(S.texts, S.segFirst[si], S.segLast[si], S.wordLang)}</p>`).join("")
    + `<p class="credit small muted"></p>`;
  const credit = linesEl.querySelector(".credit");
  if (source === "lrclib") {
    credit.append(document.createTextNode(t("Lyrics from LRCLIB")));
    const a = h(`<a href="https://lrclib.net" target="_blank" rel="noopener" translate="no">lrclib.net</a>`);
    credit.append(" · ", a);
  } else credit.textContent = t("Lyrics as Spotify shows them");
  linesEl.scrollTop = 0;
  S.follow = true;
  $("#follow").hidden = true;
  paintNotes();
  frame(true);
}

function clearLines() {
  S.lines = []; S.n = 0; S.texts = []; S.source = ""; S.synced = false; S.shown = "";
  S.detected = { lang: "", script: "" }; S.lang = ""; S.wordLang = ""; S.offers = [];
  S.curSeg = S.curWord = -1;
  linesEl.innerHTML = "";
  if (bubble.open) bubble.hide();
}

/** Keep line `si` in the middle of the view (while following along). */
function centre(si, smooth = true) {
  const el = si >= 0 ? linesEl.querySelector(`.ln[data-s="${si}"]`) : null;
  if (!el || side.hidden) return;
  const top = el.offsetTop - (linesEl.clientHeight - el.offsetHeight) / 2;
  S.autoAt = Date.now();
  linesEl.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}
new ResizeObserver(() => { if (S.follow) centre(S.curSeg >= 0 ? S.curSeg : lineBefore(S.lines, now()), false); }).observe(linesEl);

// Scrolling by hand stops following the song until "Follow along" (or a jump in the song).
function stopFollowing() {
  if (!S.follow || !S.synced) return;
  S.follow = false;
  $("#follow").hidden = false;
}
function follow() {
  S.follow = true;
  $("#follow").hidden = true;
  centre(S.curSeg >= 0 ? S.curSeg : lineBefore(S.lines, now()));
}
linesEl.addEventListener("wheel", stopFollowing, { passive: true });
linesEl.addEventListener("touchmove", stopFollowing, { passive: true });
linesEl.addEventListener("keydown", (e) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) stopFollowing(); });
linesEl.addEventListener("scroll", () => { if (Date.now() - S.autoAt > 900 && !S.picking) stopFollowing(); }, { passive: true });
$("#follow").onclick = follow;

/** The line Spotify marks as being sung (its own lyrics), in the view's numbering. */
function pageSeg() {
  const a = S.page.active;
  return a >= 0 && a < S.lines.length ? a : -1;
}

function setCurrent(si) {
  for (const el of linesEl.querySelectorAll(".ln.cur, .ln.near")) el.classList.remove("cur", "near");
  for (const el of linesEl.querySelectorAll(".w.sung, .w.cur")) el.classList.remove("sung", "cur");
  S.curSeg = si;
  S.curWord = -1;
  if (si < 0) return;
  linesEl.querySelector(`.ln[data-s="${si}"]`)?.classList.add("cur");
  for (const k of [si - 1, si + 1]) linesEl.querySelector(`.ln[data-s="${k}"]`)?.classList.add("near");
  if (S.follow) centre(si);
}

function frame(force = false) {
  if (!S.player || !S.n) return;
  const tNow = now();
  if (S.clipEnd !== null && tNow >= S.clipEnd) { S.clipEnd = null; cmd("pause"); }
  if (!S.synced) return;
  const si = S.source === "spotify" ? pageSeg() : lineAt(S.lines, tNow);
  if (si !== S.curSeg || force === true) setCurrent(si);
  if (si < 0 || S.source !== "lrclib") return;
  // The words sung so far in the line light up (their times are spread over the line: about right).
  let wi = activeWordIndex(S.starts, S.ends, tNow, 0.25);
  if (wi >= 0 && S.segOf[wi] !== si) wi = tNow >= S.lines[si].end ? S.segLast[si] + 1 : -1;
  if (wi === S.curWord) return;
  S.curWord = wi;
  for (let i = S.segFirst[si]; i <= S.segLast[si]; i++) {
    const el = linesEl.querySelector(`.w[data-i="${i}"]`);
    if (!el) continue;
    el.classList.toggle("sung", wi >= 0 && i < wi);
    el.classList.toggle("cur", i === wi);
  }
}
(function loop() { requestAnimationFrame(loop); frame(); })();

// ---------- the controls ----------
$("#play").onclick = () => { S.clipEnd = null; cmd(S.player && !S.player.paused ? "pause" : "play"); };
$("#back").onclick = () => { S.clipEnd = null; seek(now() - 5); follow(); };
$("#restart").onclick = () => {
  S.clipEnd = null;
  const si = S.curSeg >= 0 ? S.curSeg : lineBefore(S.lines, now());
  if (S.source === "spotify" && si >= 0) cmd("line", si); // Spotify jumps to its own line
  else if (S.synced && si >= 0) seek(S.lines[si].start);
  else seek(now() - 5);
  follow();
};

linesEl.addEventListener("click", (e) => {
  const w = e.target.closest(".w");
  if (w) { defineAt(Number(w.dataset.i), w); return; }
  const line = e.target.closest(".ln");
  if (!line || !S.synced) return;
  const si = Number(line.dataset.s);
  S.clipEnd = null;
  if (S.source === "spotify") cmd("line", si); else seek(S.lines[si].start);
  follow();
});
// Words dragged across with the mouse (or held and slid across) are looked up together, within a line.
phrasePicker(linesEl, {
  blockOf: (k) => S.segOf[k],
  onPick: (i, j, el) => defineAt(i, el, j),
  onStart: () => { S.picking = true; },
  onEnd: () => { S.picking = false; },
});

addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, select, textarea")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === " ") { e.preventDefault(); $("#play").click(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); $("#back").click(); }
  else if (e.key === "r" || e.key === "R") $("#restart").click();
  else if (e.key === "t" || e.key === "T") setOpen(side.hidden);
  else if (e.key === "Escape" && bubble.open) bubble.hide();
});

// ---------- the song's language ----------
const SCRIPT_OF = { ar: "arabic", fa: "arabic", ja: "kana", zh: "han", ko: "hangul", th: "thai", hi: "devanagari", ru: "cyrillic" };
const scriptOf = (lang) => SCRIPT_OF[lang] || "latin";
const sameScript = (lang, script) => script === scriptOf(lang) || (lang === "ja" && script === "han");

/** A language's name in the user's language: Tamkeen's own name for one it teaches, else the
 * browser's ("ucraniano"). */
function nameOf(code) {
  if (isLanguage(code)) return t(langInfo(code).name);
  try { return new Intl.DisplayNames([uiLanguage() || "en"], { type: "language" }).of(code) || code; } catch { return code; }
}

/** Which language the words are looked up in: the song's when it is the one being learned (or one of
 * those ticked), else what the viewer chose for this song; otherwise none yet, with what to offer. */
function decideLanguage() {
  const L = S.detected.lang;
  const learning = settings.study_language;
  const ticked = Array.isArray(settings.learning_languages) ? settings.learning_languages : [];
  S.offers = [];
  const chosen = choices.get(S.key);
  if (chosen) { S.lang = chosen === "-" ? "" : chosen; return; }
  if (isLanguage(L) && (L === learning || ticked.includes(L))) { S.lang = L; return; }
  S.lang = "";
  if (isLanguage(L)) S.offers.push(L);
  // (A language guessed wrong: the one being learned, if it is written the same way.)
  if (isLanguage(learning) && learning !== L && sameScript(learning, S.detected.script) && (isLanguage(L) || !L)) S.offers.push(learning);
}

async function chooseLanguage(code) {
  choices.set(S.key, code);
  if (S.lines.length) await showLines(S.lines, { source: S.source, synced: S.synced });
}

const cantText = () => (S.detected.lang
  ? t("Tamkeen can't look up words in {0} yet. The lyrics still show here.", nameOf(S.detected.lang))
  : t("Tamkeen can't tell which language this song is in, so its words can't be looked up. The lyrics still show here."));

// ---------- what to say ----------
let lastNotes = "";
function paintNotes() {
  const p = S.player;
  const lines = [];
  const buttons = [];
  if (!known()) {
    lines.push(t("Open Tamkeen once, so the extension knows the language you're learning and how you look words up."));
    buttons.push({ text: t("Open Tamkeen"), href: CONFIG.webApp });
  } else if (!p || !S.track) {
    lines.push(t("Play a song on Spotify: its lyrics show here, and you can click their words."));
  } else if (!S.lines.length) {
    if (S.lrc === undefined) lines.push(t("Looking for this song's lyrics…"));
    else if (S.lrcError && !S.page.lines.length) {
      lines.push(t("Couldn't reach LRCLIB, the lyrics collection. Check the connection and try again."));
      buttons.push({ text: t("Try again"), act: "retry" });
    } else if (S.lrc && S.lrc.instrumental) lines.push(t("This song has no words to sing."));
    else {
      lines.push(t("No lyrics found for this song."));
      lines.push(t("If Spotify has lyrics for it, open them with Spotify's lyrics button (the microphone): Tamkeen then shows them here."));
    }
  } else {
    if (!S.synced) lines.push(t("These lyrics have no timings, so they don't follow the song."));
    const L = S.detected.lang;
    if (!isLanguage(S.lang)) {
      if (S.offers.length) {
        lines.push(isLanguage(L) ? t("This song is in {0}.", nameOf(L)) : t("Tamkeen couldn't tell which language this song is in."));
        for (const code of S.offers) buttons.push({ text: t("Look up words in {0}", nameOf(code)), act: "lang", code });
      } else lines.push(cantText());
    } else if (S.lang !== settings.study_language) lines.push(t("Words are looked up in {0}.", nameOf(S.lang)));
  }
  const key = JSON.stringify([lines, buttons]);
  if (key === lastNotes) return;
  lastNotes = key;
  const notes = $("#notes");
  notes.innerHTML = "";
  for (const line of lines) {
    const el = h(`<p class="note"></p>`);
    el.textContent = line;
    notes.append(el);
  }
  if (buttons.length) {
    const row = h(`<p class="note note-actions"></p>`);
    buttons.forEach((b, k) => {
      const el = b.href ? h(`<a class="btn" target="_blank" rel="noopener"></a>`) : h(`<button type="button"></button>`);
      if (k === 0) el.classList.add("primary");
      el.textContent = b.text;
      if (b.href) el.href = b.href;
      else if (b.act === "lang") el.onclick = () => chooseLanguage(b.code);
      else if (b.act === "retry") el.onclick = () => { S.asked = ""; S.lrc = undefined; S.lrcError = false; paintNotes(); askLyrics(); };
      row.append(el);
    });
    notes.append(row);
  }
}

function paintName() {
  root.querySelector(".nf-name").textContent = (S.track && S.track.title) || "Spotify";
  root.querySelector(".nf-sub").textContent = (S.track && S.track.artist) || "";
}

function paintPlay() {
  const paused = !S.player || !!S.player.paused;
  const b = $("#play");
  if (b.dataset.paused === String(paused)) return;
  b.dataset.paused = String(paused);
  b.innerHTML = icon(paused ? "play" : "pause", 20);
  b.setAttribute("aria-label", paused ? "Play" : "Pause");
}

// ---------- the song and its lyrics ----------
// (By name, not Spotify's id: the page shows the name all along, its link to the song only at times.)
const songKey = (p) => (p.title ? `${normName(p.title, false)}|${normName(p.artist, false)}` : "");

function newSong(p) {
  S.key = songKey(p);
  S.track = p.title ? { title: p.title, artist: p.artist || "", album: p.album || "", id: p.id || "", d: p.d || 0 } : null;
  S.since = Date.now();
  S.asked = "";
  S.lrc = undefined;
  S.lrcError = false;
  S.page = { hash: "", lines: [], active: -1, seen: false };
  S.clipEnd = null;
  clearLines();
  paintName();
  paintNotes();
}

/** Ask LRCLIB (through the background part) for the song's lyrics, once it has played a moment (not
 * for every song skipped past) and its length is known. */
function askLyrics() {
  const p = S.player, tr = S.track;
  if (!tr || S.asked === S.key) return;
  if (Date.now() - S.since < 1200) return;
  if (!(p && p.d > 0) && Date.now() - S.since < 4000) return; // (the length makes the match sure)
  S.asked = S.key;
  const key = S.key;
  const track = { title: tr.title, artist: tr.artist, album: tr.album, duration: p && p.d > 0 ? p.d : 0 };
  chrome.runtime.sendMessage({ type: "lyrics", track }, (r) => {
    if (S.key !== key) return;
    if (chrome.runtime.lastError || !r) { S.lrc = null; S.lrcError = true; }
    else { S.lrc = r.rec || null; S.lrcError = !!r.error && !r.rec; }
    choose();
    paintNotes();
  });
}

/** What the view shows: LRCLIB's timed lyrics; else Spotify's own while its view shows them (timed
 * when Spotify marks a line); else LRCLIB's lines without timings, or Spotify's. */
function choose() {
  let pick = null;
  const lrc = S.lrc;
  if (lrc && lrc.syncedLyrics) {
    const timed = parseLrc(lrc.syncedLyrics);
    if (timed.synced) pick = { source: "lrclib", synced: true, id: `l${lrc.id}`, lines: () => lyricLines(timed.lines, { duration: S.track && S.track.d }) };
  }
  if (!pick && S.page.lines.length && S.page.seen) pick = { source: "spotify", synced: true, id: `s${S.page.hash}`, lines: () => pageLines() };
  if (!pick && lrc && lrc.plainLyrics) pick = { source: "lrclib", synced: false, id: `p${lrc.id}`, lines: () => lyricLines(plainLines(lrc.plainLyrics)) };
  if (!pick && S.page.lines.length) pick = { source: "spotify", synced: false, id: `u${S.page.hash}`, lines: () => pageLines() };
  const id = pick ? pick.id : "";
  if (id === S.shown) return;
  S.shown = id;
  if (!pick) { clearLines(); paintNotes(); return; }
  showLines(pick.lines(), { source: pick.source, synced: pick.synced });
}
const pageLines = () => lyricLines(S.page.lines.map((text) => ({ start: null, text })));

// ---------- messages ----------
function onPage(m) {
  if (m.type !== "state" || !m.s || typeof m.s !== "object") return;
  const s = m.s;
  const p = {
    title: String(s.title || "").slice(0, 300), artist: String(s.artist || "").slice(0, 300), album: String(s.album || "").slice(0, 300),
    id: /^[A-Za-z0-9]{22}$/.test(String(s.id || "")) ? s.id : "",
    t: Number.isFinite(Number(s.t)) && s.t !== null ? Number(s.t) : NaN, d: Number(s.d) > 0 ? Number(s.d) : 0,
    paused: !!s.paused, rate: Number(s.rate) > 0 ? Number(s.rate) : 1,
  };
  const wasJump = S.player && Number.isFinite(S.player.t) && Number.isFinite(p.t) && Math.abs(p.t - now()) > 3;
  S.player = p;
  S.at = Date.now();
  if (songKey(p) !== S.key) newSong(p);
  else if (S.track && p.d > 0 && !S.track.d) S.track.d = p.d;
  // Spotify's own lyrics, while its lyrics view shows them.
  const ly = s.lyrics && typeof s.lyrics === "object" ? s.lyrics : null;
  if (ly && typeof ly.hash === "string") {
    if (Array.isArray(ly.lines)) {
      const lines = ly.lines.map((x) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, 500)).filter(Boolean).slice(0, 400);
      if (ly.hash !== S.page.hash) { S.page = { hash: ly.hash, lines, active: -1, seen: false }; }
    }
    if (ly.hash === S.page.hash) {
      S.page.active = Number.isInteger(ly.active) ? ly.active : -1;
      if (S.page.active >= 0) S.page.seen = true;
    }
  } else S.page.active = -1; // (Spotify's lyrics view closed: its lines stay, without a line marked)
  if (wasJump && S.synced) follow(); // (the song jumped: the view goes with it)
  askLyrics();
  if (S.lrc !== undefined) choose(); // (once LRCLIB has answered: its timed lyrics come first)
  paintPlay();
  paintNotes();
}

savedFoot($("#foot"), CONFIG.webApp);
followSettings(() => {
  if (S.lines.length) showLines(S.lines, { source: S.source, synced: S.synced }); // (the language studied may have changed)
  paintNotes();
});

setOpen(isOpen());
paintName();
paintNotes();
paintPlay();
page.listen(onPage);
page.onConnect(() => page.send({ type: "layout", open: !side.hidden }));
