// What the extension's panels share: the subtitle bar on Netflix (panel.js) and the lyrics panel on
// Spotify (spotify-panel.js). Each is a page of the extension shown in a frame over the site's page;
// content/netflix.js or content/spotify.js puts it there and talks to it over a private channel.
import { esc, h } from "../app.js";
import { device, loadSettings, settings } from "../store.js";
import { t } from "../i18n.js";
import { gap, setStudyLanguage } from "../languages.js";
import { readingsReady } from "../lexicon/readings.js";
import { lineWords } from "../lyrics.js";
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

// ---------- the words of a transcript (subtitle lines, lyric lines) ----------

/**
 * The words of `lines` ([{start, end, text, words}]) in `lang`, as the panels show and look them up:
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

/** A short message in `pop` for a few seconds (the word popup, if open, closes). `button`: optional
 * {text, onClick} under it. */
let flashTimer = 0;
export function flash(pop, text, bubble, button = null) {
  pop.querySelector(".bar-flash")?.remove();
  if (bubble && bubble.open) bubble.hide();
  const el = h(`<div class="bar-flash small"><p></p></div>`);
  el.firstChild.textContent = text;
  if (button) {
    const b = h(`<button type="button" class="primary"></button>`);
    b.textContent = button.text;
    b.onclick = () => { el.remove(); button.onClick(); };
    el.append(b);
  }
  pop.append(el);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.remove(), button ? 8000 : 4000);
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
