// The general parts of the extension's subtitle bar on Netflix (panel.js), kept apart from what is
// Netflix's own: the private line to the page (the bar is a page of the extension shown in a frame
// over Netflix's page; content/netflix.js puts it there and talks to it over a private channel), the
// settings from the web app, the words of a transcript, small messages and the saved-words line.
import { esc, h } from "../app.js";
import { device, loadSettings, settings } from "../store.js";
import { t } from "../i18n.js";
import { gap, isLanguage, regroupWords, setStudyLanguage } from "../languages.js";
import { readingsReady } from "../lexicon/readings.js";
import { WORD_KEY } from "../extbridge.js";

/**
 * The private line to the page below (opened by the content script with this page's token, the part
 * of its address after "#"). `listen(fn)` takes its messages (those that came before wait for it);
 * `onConnect(fn)` runs once the line is open; `send(msg)` sends one.
 */
export function pagePort() {
  const nonce = location.hash.slice(1);
  let port = null, handler = null, connected = null;
  const early = [];
  addEventListener("message", (e) => {
    if (port || e.source !== parent || !/^[0-9a-f]{32}$/.test(nonce) || !e.data || e.data.tamkeenPanel !== nonce || !e.ports[0]) return;
    port = e.ports[0];
    port.onmessage = (m) => (handler ? handler(m.data || {}) : early.push(m.data || {}));
    if (connected) connected();
  });
  return {
    send: (msg) => { if (port) port.postMessage(msg); },
    listen(fn) { handler = fn; for (const m of early.splice(0)) fn(m); },
    onConnect(fn) { connected = fn; if (port) fn(); },
  };
}

/** This device's lookup choices, as the web app has them (quick or detailed; pause on a tapped word). */
export function useDevice() {
  try {
    localStorage.setItem("lookupMode", device.lookup_mode === "quick" ? "quick" : "detailed");
    localStorage.setItem("wordPause", device.word_pause === false ? "0" : "1");
  } catch { /* storage off: the defaults */ }
}

/** The settings from the web app, put to use (the language studied, the text size). */
export function applySettings() {
  useDevice();
  setStudyLanguage(settings.study_language || "ar");
  document.documentElement.style.setProperty("--ar-size", `${settings.font_size || 26}px`);
}

/** Follow the web app's settings as they change (it hands them over on every change): fn() after. */
export function followSettings(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(changes.settings || changes.device)) return;
    loadSettings().then(() => { applySettings(); fn(); });
  });
}

// ---------- the words of a transcript (subtitle lines) ----------

/**
 * The words of `lines` in `lang`, as parallel lists {start, end, seg, text} (seg: the line a word is
 * in). Languages written without spaces (Japanese, Chinese, Thai) are split into words by the same
 * word splitters as everywhere in Tamkeen (languages.js regroupWords); Persian words keep their half
 * spaces.
 */
function lineWords(lines, lang) {
  const W = { start: [], end: [], seg: [], text: [] };
  lines.forEach((l, si) => { for (const [s, e, w] of l.words || []) { W.start.push(s); W.end.push(e); W.text.push(w); W.seg.push(si); } });
  if (!isLanguage(lang)) return W;
  return regroupWords(W, lang, true, (si) => (lines[si] ? lines[si].text : ""));
}

/**
 * The words of `lines` ([{start, end, text, words}]) in `lang`, as the bar shows and looks them up:
 * {n, starts, ends, segOf, texts, segFirst, segLast} (segFirst/segLast: each line's first and last
 * word, -1 for a line without words). Japanese and Chinese wait (a little) for the dictionary that
 * splits their words.
 */
export async function transcriptWords(lines, lang) {
  await readingsReady(lang, 3000).catch(() => {});
  const R = lineWords(lines, lang);
  const n = R.text.length;
  const segFirst = lines.map(() => -1), segLast = lines.map(() => -1);
  const segOf = Int32Array.from(R.seg);
  for (let i = 0; i < n; i++) {
    if (segFirst[segOf[i]] < 0) segFirst[segOf[i]] = i;
    segLast[segOf[i]] = i;
  }
  return { n, starts: Float64Array.from(R.start), ends: Float64Array.from(R.end), segOf, texts: R.text, segFirst, segLast };
}

/** Words a..b as tappable words (class "w", data-i), with the spaces the language puts between. */
export function wordsHtml(texts, a, b, lang) {
  let out = "";
  for (let i = a; i <= b; i++) {
    if (i > a) out += esc(gap(texts[i - 1], texts[i], lang));
    out += `<span class="w" data-i="${i}">${esc(texts[i])}</span>`;
  }
  return out;
}

// ---------- small things on screen ----------

/** A short message in `pop` for a few seconds (the word popup, if open, closes). */
let flashTimer = 0;
export function flash(pop, text, bubble) {
  pop.querySelector(".bar-flash")?.remove();
  if (bubble && bubble.open) bubble.hide();
  const el = h(`<p class="bar-flash small"></p>`);
  el.textContent = text;
  pop.append(el);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.remove(), 4000);
}

/** "N saved words go to your Vocab when you open Tamkeen", with Open Tamkeen, in `foot` (hidden
 * when there are none), kept up to date. */
export function savedFoot(foot, webApp) {
  async function paint() {
    const all = await chrome.storage.local.get(null);
    const n = Object.keys(all).filter((k) => k.startsWith(WORD_KEY)).length;
    foot.hidden = !n;
    if (!n) return;
    foot.innerHTML = "";
    const text = h(`<span class="small muted"></span>`);
    text.textContent = n === 1 ? t("1 saved word goes to your Vocab when you open Tamkeen.")
      : t("{0} saved words go to your Vocab when you open Tamkeen.", n);
    const open = h(`<a class="btn" target="_blank" rel="noopener">Open Tamkeen</a>`);
    open.href = webApp;
    foot.append(text, open);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && Object.keys(changes).some((k) => k.startsWith(WORD_KEY))) paint();
  });
  paint();
}
