// Tamkeen for Netflix & Prime Video: the panel beside Prime Video's player (content/prime.js puts this page
// in a frame at the right edge of Prime Video's page while its player is open). THE LIGHT WAY:
//   - the subtitle line Prime Video is showing on screen, big, as words you can tap; the lines watched so
//     far below it (this viewing only: nothing is kept after the tab closes);
//   - a tapped word opens Tamkeen's word popup (meaning, Save) in the panel; a saved word waits in the
//     extension until the web app takes it into the Vocab, with its sentence and the title's name;
//   - nothing here controls Amazon's player: no play, pause, seek or subtitle choice (the popup has no play
//     buttons and doesn't pause the video; a word can be tapped in the watched lines after its line has
//     gone). Subtitles are turned on in Prime Video's own menu; the panel says so while there are none.
import { esc, h, toast } from "../app.js";
import { known, loadSettings, settings } from "../store.js";
import { startTranslating, t } from "../i18n.js";
import { icon } from "../icons.js";
import { detectLanguage, isLanguage, joinWords, setLang } from "../languages.js";
import { formatTime, sentenceBounds } from "../wordlookup.js";
import { createWordBubble } from "../components/wordbubble.js";
import { phrasePicker } from "../components/phrasepick.js";
import { isPhrase, phraseText } from "../phrase.js";
import { lookupToggle } from "../components/lookupmode.js";
import { getDefinition } from "../define-service.js";
import { markWord } from "../definer.js";
import { languageName } from "../netflix.js";
import { WORD_KEY, savedPrimeWord } from "../extbridge.js";
import { PRIME_NAME, lineWithWords, primeSource, watchedLines } from "../primevideo.js";
import { applySettings, flash as flashIn, followSettings, pagePort, savedFoot, transcriptWords, wordsHtml as wordsOf } from "./common.js";
import { CONFIG } from "./config.js";

const page = pagePort();
const send = page.send;

const SIDE_KEY = "tkPrimeOpen";
const S = {
  id: "", title: "", episode: "", screen: null, image: false,
  seen: watchedLines(), lang: "", lines: [], n: 0,
  starts: new Float64Array(0), ends: new Float64Array(0), segOf: new Int32Array(0), texts: [], segFirst: [], segLast: [],
  drawn: -1, redraw: 0, mismatch: false,
};
const savedHere = new Set();

await loadSettings();
applySettings();

const root = document.getElementById("tk");
root.classList.add("pv");
root.innerHTML = `
  <aside class="side pv-side" id="side">
    <div class="side-head">
      <button type="button" class="ghost icon" id="fold" title="Hide Tamkeen's panel" aria-label="Hide Tamkeen's panel">${icon("chevron", 18)}</button>
      <div class="side-what"><div class="nf-name" dir="auto"></div><div class="nf-sub small muted" dir="auto"></div></div>
      <span class="pv-lookup"></span>
    </div>
    <div class="pv-now" id="now" aria-live="polite"></div>
    <div class="side-notes" id="notes"></div>
    <div class="pv-label small muted" id="watched-label" hidden>Lines you've watched</div>
    <div class="lines" id="lines"></div>
    <div class="side-pop" id="side-pop"></div>
    <div class="side-foot" id="foot" hidden></div>
  </aside>
  <button type="button" class="pv-tab" id="tab" hidden title="Show Tamkeen's panel" aria-label="Show Tamkeen's panel">${icon("chevron", 16)}</button>`;
const $ = (sel) => root.querySelector(sel);
const side = $("#side"), nowEl = $("#now"), linesEl = $("#lines"), tab = $("#tab");
$(".pv-lookup").append(lookupToggle());
await startTranslating(settings.ui_language || "en");

// ---------- the panel's width: the page sizes the frame to it ----------
function sideOpen() { try { return localStorage.getItem(SIDE_KEY) !== "0"; } catch { return true; } }
function setSide(open) {
  try { localStorage.setItem(SIDE_KEY, open ? "1" : "0"); } catch { /* not kept */ }
  side.hidden = !open;
  tab.hidden = open;
  if (!open && bubble.open) bubble.hide();
  reportLayout();
}
function reportLayout() { send({ type: "layout", width: side.hidden ? tab.offsetWidth : side.offsetWidth }); }
new ResizeObserver(reportLayout).observe(side);
addEventListener("resize", reportLayout);
$("#fold").onclick = () => setSide(false);
tab.onclick = () => setSide(true);

// ---------- the word popup ----------
let target = null; // {i, j, si, sj, text}
const bubble = createWordBubble($("#side-pop"), {
  // Nothing of Prime Video's sound is ever kept or played from here (no play buttons: the light way).
  noAudio: true,
  voiceless: true,
  audioOn: () => settings.card_voices === true,
  onAddAudio: () => window.open(`${CONFIG.webApp}#/settings?s=voices&show=cardvoice`, "_blank", "noopener"),
  fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
  onPlayWord: () => {}, onPlaySentence: () => {}, onPlayFrom: () => {},
  onSettings: () => window.open(`${CONFIG.webApp}#/settings?s=words`, "_blank", "noopener"),
  onSave: async (def) => {
    const tg = target;
    const w = savedPrimeWord({ primeId: S.id, def, word: tg.text, lang: S.lang, sentence: sentenceText(tg.si, tg.sj),
      source: primeSource(S.title, S.episode) });
    if (!w) { toast("Couldn't save this word.", { error: true }); throw new Error("not saved"); }
    await chrome.storage.local.set({ [WORD_KEY + w.uid]: w });
    savedHere.add(wordKey(tg.i, tg.j));
  },
});
const wordKey = (i, j) => `${S.texts.slice(i, j + 1).join(" ")}|${S.segOf[i]}`;

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
      podcast: PRIME_NAME, episode: primeSource(S.title, S.episode).replace(/^Prime Video · ?/, ""), phrase: isPhrase(i, j) },
  };
}

const flash = (text) => flashIn($("#side-pop"), text, bubble);

/** Look up words i..j (one word, or several dragged across together). */
function defineAt(i, anchor, j = i) {
  if (!isLanguage(S.lang)) { flash(t("Tamkeen can't look up words in these subtitles.")); return; }
  const c = contextFor(i, j);
  target = { i, j, si: c.si, sj: c.sj, text: c.word };
  bubble.show(anchor, c.ctx, { docked: true, saved: savedHere.has(wordKey(i, j)) });
}

// ---------- the lines ----------
const wordsHtml = (a, b) => wordsOf(S.texts, a, b, S.lang);

/** The language the lines are looked up in: the one being learned, unless their letters say another. */
function linesLanguage(lines) {
  const study = settings.study_language || "ar";
  const sample = lines.slice(-12).map((l) => l.text).join(" ");
  if (!sample) return study;
  const found = detectLanguage(sample, study);
  return isLanguage(found) ? found : study;
}

/** Redraw the words of the lines seen (on a new line; a few times a second at most). */
async function drawLines() {
  const seen = S.seen.lines.map(lineWithWords);
  const lang = linesLanguage(seen);
  S.mismatch = !!seen.length && lang !== (settings.study_language || "ar");
  const at = ++S.redraw;
  const W = await transcriptWords(seen, lang);
  if (at !== S.redraw) return; // a newer line came meanwhile
  const keepOpen = bubble.open;
  S.lang = lang;
  S.lines = seen;
  Object.assign(S, W);
  for (const el of [nowEl, linesEl]) setLang(el, lang);
  const cur = S.seen.current;
  nowEl.innerHTML = cur >= 0 && S.segFirst[cur] >= 0 ? wordsHtml(S.segFirst[cur], S.segLast[cur]) : "";
  // The watched lines, newest at the bottom (the one on screen marked), kept in view unless scrolled up.
  const atEnd = linesEl.scrollHeight - linesEl.scrollTop - linesEl.clientHeight < 40;
  linesEl.innerHTML = seen.map((l, si) => S.segFirst[si] < 0 ? "" : `<p class="ln${si === cur ? " cur" : ""}" data-s="${si}"><span class="ln-t">${formatTime(l.start)}</span><span class="ln-x">${wordsHtml(S.segFirst[si], S.segLast[si])}</span></p>`).join("");
  $("#watched-label").hidden = !seen.length;
  // (The popup stays open while the video plays on: lines are only ever added at the end, so the word it
  // shows keeps its place.)
  if (atEnd && !keepOpen) linesEl.scrollTop = linesEl.scrollHeight;
  paintNotes();
}

phrasePicker(nowEl, { blockOf: (k) => S.segOf[k], onPick: (i, j, el) => defineAt(i, el, j) });
phrasePicker(linesEl, { blockOf: (k) => S.segOf[k], onPick: (i, j, el) => defineAt(i, el, j) });

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && bubble.open) bubble.hide();
});

// ---------- what to say ----------
let lastNotes = "";
function paintNotes() {
  const lines = [];
  let action = "";
  const learning = settings.study_language || "ar";
  if (!known()) {
    lines.push(t("Open Tamkeen once, so the extension knows the language you're learning and how you look words up."));
    action = "open";
  } else if (S.image) {
    lines.push(t("These subtitles show as pictures, so Tamkeen can't read their words. Choose other subtitles in Prime Video's menu."));
  } else if (!S.seen.lines.length) {
    lines.push(t("Turn on {0} subtitles in Prime Video's subtitle menu: the line on screen shows here as words you can tap.", languageName(learning)));
  } else if (S.mismatch) {
    lines.push(t("These subtitles don't look like {0}. Choose {0} in Prime Video's subtitle menu if it has them.", languageName(learning)));
  }
  const key = lines.join("\n") + action;
  if (key === lastNotes) return;
  lastNotes = key;
  const notes = $("#notes");
  notes.innerHTML = "";
  for (const line of lines) {
    const el = h(`<p class="note"></p>`);
    el.textContent = line;
    notes.append(el);
  }
  if (action === "open") {
    const b = h(`<p class="note"><a class="btn primary" target="_blank" rel="noopener">Open Tamkeen</a></p>`);
    b.querySelector("a").href = CONFIG.webApp;
    notes.append(b);
  }
}

function paintName() {
  root.querySelector(".nf-name").textContent = S.title || PRIME_NAME;
  root.querySelector(".nf-sub").textContent = S.title ? S.episode : "";
}

savedFoot($("#foot"), CONFIG.webApp);
followSettings(() => { lastNotes = ""; drawLines(); });

// ---------- what the page reads off the screen ----------
let drawing = 0;
function onPage(m) {
  if (m.type !== "screen") return;
  const title = String(m.title || "").slice(0, 200), episode = String(m.episode || "").slice(0, 200);
  const id = String(m.id || "").slice(0, 40);
  if ((id && id !== S.id) || (title && S.title && title !== S.title) || (episode && S.episode && episode !== S.episode)) {
    // Another title or episode: its own lines (nothing of the last one is kept).
    S.seen = watchedLines();
    savedHere.clear();
    if (bubble.open) bubble.hide();
  }
  if (id) S.id = id;
  if (title) S.title = title;
  if (episode || title) S.episode = episode;
  S.image = !!m.image && !m.text;
  paintName();
  const time = m.t === null || m.t === undefined ? (Date.now() / 1000) : Number(m.t);
  if (S.seen.see(String(m.text || "").slice(0, 2000), time)) {
    clearTimeout(drawing);
    drawing = setTimeout(drawLines, 60);
  } else paintNotes();
}

setSide(sideOpen());
paintNotes();
paintName();
page.listen(onPage);
page.onConnect(reportLayout);
reportLayout();
