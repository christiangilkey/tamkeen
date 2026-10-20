// Settings as every device lays it out: a short home screen listing the sections, each with what
// it is set to now, a search box that finds any setting, and one screen per section
// (#/settings?s=<id>) with a way back. A section shows the few things most people change; the rest
// waits under a quiet "More options". The pages (web/js/pages/settings.js on the computer,
// mobile/src/js/pages/settings.js on the phone, iPhone and web app) fill the sections; this file is
// the frame, the search, the yes/no box and the looks. #/settings?show=<find id> opens the section
// that holds that setting and brings it into view (the Vocab page's Anki button uses show=anki).

import { esc, h } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { openModal } from "./modal.js";

/** The sections, in the order a learner thinks of them. */
export const SECTIONS = [
  { id: "languages", icon: "page", title: "Languages", about: "The language you speak and the one you're learning." },
  { id: "words", icon: "message", title: "Word definitions", about: "What you see when you tap a word." },
  { id: "listening", icon: "audio", title: "Listening & transcripts", about: "Who writes down what is said in podcasts, videos and reels." },
  { id: "look", icon: "sun", title: "Look & feel", about: "Theme, text size and the game." },
  { id: "account", icon: "cloud", title: "Account & sync", about: "Google Drive sync, and Friends." },
  { id: "apps", icon: "link", title: "Apps & connections", about: "Other apps Tamkeen works with." },
  { id: "data", icon: "data", title: "Data & updates", about: "Backups, updates and starting again." },
];
export const sectionInfo = (id) => SECTIONS.find((x) => x.id === id) || null;

/**
 * What the search box finds: each setting's section, its place on that screen (an element with
 * data-find="<id>"), its name, and other words people may type (lower case, English).
 * `on` limits one to some devices: "desktop", "phone" (Android, iPhone and the web app),
 * "android", "ios", "web", "vibrates" (a phone that can vibrate); `langs` to some languages being learned.
 * tests/js/parity.test.mjs checks each one against the Settings pages of the devices it names.
 */
export const FINDS = [
  { s: "languages", id: "speak", label: "Language I speak", words: "interface translation english menus" },
  { s: "languages", id: "learn", label: "Language I'm learning", words: "study target change switch" },
  { s: "languages", id: "basics", label: "Count common words as seen", words: "beginner basics already know frequent" },
  { s: "languages", id: "reading", label: "Word dictionaries", words: "purple seen words stress marks download" },
  { s: "languages", id: "reading", label: "Vowel marks", words: "harakat tashkeel diacritics", langs: ["ar"] },
  { s: "languages", id: "reading", label: "Furigana", words: "kana kanji reading", langs: ["ja"] },
  { s: "languages", id: "reading", label: "Pinyin and characters", words: "tones simplified traditional", langs: ["zh"] },
  { s: "words", id: "mode", label: "AI explanations or built-in dictionary", words: "offline wiktionary free definitions meanings" },
  { s: "words", id: "key", label: "AI provider and API key", words: "claude gemini openai chatgpt grok key test" },
  { s: "words", id: "aimodel", label: "AI model", words: "price cost tokens cheaper faster" },
  { s: "words", id: "explain", label: "Language words are explained in", words: "definitions translation" },
  { s: "words", id: "usage", label: "Tokens used today", words: "usage cost spend" },
  { s: "words", id: "mnemonic", label: "Mnemonic maker", words: "sound-alike memory review thinking" },
  { s: "listening", id: "who", label: "Who writes the transcripts", words: "cloud transcription whisper groq openai speech" },
  { s: "listening", id: "sttkey", label: "Transcription provider and key", words: "cloud groq openai deepgram key test" },
  { s: "listening", id: "whisper", label: "Transcription model", words: "whisper small medium large download", on: ["desktop"] },
  { s: "listening", id: "gpu", label: "GPU acceleration", words: "nvidia cuda graphics faster", on: ["desktop"] },
  { s: "listening", id: "storage", label: "Audio storage", words: "delete stream disk space downloaded", on: ["desktop"] },
  { s: "look", id: "theme", label: "Theme", words: "dark light night colours", on: ["desktop", "android", "ios"] }, // (the web app is always dark)
  { s: "look", id: "textsize", label: "Text size", words: "font bigger smaller larger" },
  { s: "look", id: "haptics", label: "Vibration", words: "haptics buzz vibrate", on: ["vibrates"] }, // (no iPhone or computer can)
  { s: "look", id: "game", label: "Game features", words: "creature rewards chimes sounds" },
  { s: "look", id: "guides", label: "Page guides", words: "help tour tips explain buttons tutorial" },
  { s: "account", id: "drive", label: "Google Drive sync", words: "google sign account backup devices phone computer" },
  { s: "account", id: "friends", label: "Friends & sharing", words: "username online share quiz connect" },
  { s: "apps", id: "anki", label: "Anki", words: "flashcards deck addon cards", on: ["desktop"] },
  { s: "apps", id: "anki", label: "AnkiDroid", words: "flashcards deck cards", on: ["android"] },
  { s: "apps", id: "tasks", label: "Today's review as a to-do", words: "google tasks onyx calendar" },
  { s: "apps", id: "getapp", label: "Get the app", words: "download install android iphone windows", on: ["web"] },
  { s: "data", id: "backup", label: "Your data", words: "export import backup folder zip", on: ["desktop"] },
  { s: "data", id: "updates", label: "Updates", words: "version update latest", on: ["desktop", "android", "ios"] },
  { s: "data", id: "reset", label: "Reset Tamkeen", words: "start again sign out first" },
  { s: "data", id: "privacy", label: "Privacy policy", words: "privacy data" },
  { s: "data", id: "about", label: "About and open-source licenses", words: "licenses licences credits version source code" },
];

/** The search entries for this device (`where`: { desktop, phone, android, ios, web }) and study language. */
export function findsFor(where, lang) {
  return FINDS.filter((f) => (!f.on || f.on.some((o) => where[o])) && (!f.langs || f.langs.includes(lang)));
}

/** The section that holds a setting found by `show` (a data-find id), or "". */
export const sectionOfFind = (show) => (FINDS.find((f) => f.id === show) || {}).s || "";

// Typed words match a setting's name in English or in the interface's language, whatever the accents.
const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

let cameFromHome = false; // the section was opened from the home screen, so "back" can go back there

function rowHtml({ href, ic, name, sum = "", s = "" }) {
  return `<a class="set-row" href="${href}" ${s ? `data-s="${s}"` : ""}>
    <span class="set-ico">${icon(ic, 22)}</span>
    <span class="set-text"><span class="set-name">${esc(name)}</span><span class="set-sum">${esc(sum)}</span></span>
    <span class="set-chev">${icon("chevron", 18)}</span></a>`;
}

/** One summary line under a section on the home screen: parts, each { text, warn }. */
function paintSummary(el, parts) {
  if (!parts) return;
  const list = (Array.isArray(parts) ? parts : [parts]).filter((p) => p && p.text);
  if (!list.length) return;
  el.innerHTML = list.map((p) => `<span class="${p.warn ? "set-warn" : ""}">${esc(p.text)}</span>`).join(`<span aria-hidden="true"> · </span>`);
}

/**
 * The home screen. `summaries` = { sectionId: () => parts or a promise of them } (what the section
 * is set to now); `abouts` = { sectionId: text } replaces a section's own line on this device;
 * `finds` = this device's search entries (findsFor). `hide` = sections this device doesn't have.
 */
export function settingsHome(view, { summaries = {}, abouts = {}, finds = [], hide = [] } = {}) {
  cameFromHome = false;
  const shown = SECTIONS.filter((x) => !hide.includes(x.id));
  const page = h(`<div class="page settings set-v2">
    <div class="set-head"><h1>Settings</h1></div>
    <label class="set-search">${icon("search", 18)}
      <input type="search" id="set-find" placeholder="Search settings" aria-label="Search settings" autocomplete="off" spellcheck="false"></label>
    <nav class="card set-list" aria-label="Settings">${shown.map((x) =>
      rowHtml({ href: `#/settings?s=${x.id}`, ic: x.icon, name: x.title, sum: abouts[x.id] || x.about, s: x.id })).join("")}</nav>
    <div class="card set-list set-results" hidden></div>
    <p class="set-none muted" hidden>Nothing found. Try another word.</p>
  </div>`);
  view.append(page);
  const list = page.querySelector("nav.set-list");
  const results = page.querySelector(".set-results");
  const none = page.querySelector(".set-none");
  for (const x of shown) {
    const fn = summaries[x.id];
    if (!fn) continue;
    const el = list.querySelector(`[data-s="${x.id}"] .set-sum`);
    Promise.resolve().then(fn).then((parts) => paintSummary(el, parts)).catch(() => {});
  }
  page.addEventListener("click", (e) => { if (e.target.closest(".set-row")) cameFromHome = true; });

  const input = page.querySelector("#set-find");
  input.addEventListener("input", () => {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    list.hidden = words.length > 0;
    if (!words.length) { results.hidden = true; none.hidden = true; return; }
    const hits = finds.filter((f) => {
      const sec = sectionInfo(f.s);
      if (!sec || hide.includes(f.s)) return false;
      const hay = fold([f.label, t(f.label), sec.title, t(sec.title), f.words].join(" "));
      return words.every((w) => hay.includes(w));
    });
    results.innerHTML = hits.map((f) => rowHtml({ href: `#/settings?s=${f.s}&show=${f.id}`, ic: sectionInfo(f.s).icon,
                                                  name: f.label, sum: sectionInfo(f.s).title })).join("");
    results.hidden = !hits.length;
    none.hidden = hits.length > 0;
  });
  // Enter opens the first thing found.
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const first = results.hidden ? null : results.querySelector(".set-row");
    if (first) { cameFromHome = true; location.hash = first.getAttribute("href"); }
  });
  return page;
}

/** One section's screen: a way back, its name and line, and an empty body to fill. */
export function sectionPage(view, id, { about } = {}) {
  const sec = sectionInfo(id);
  const page = h(`<div class="page settings set-v2" data-section="${esc(id)}">
    <a class="set-back" href="#/settings">${icon("chevron", 18)}<span>Settings</span></a>
    <div class="set-head"><h1>${esc(sec.title)}</h1><p>${esc(about || sec.about)}</p></div>
    <div class="set-body"></div>
  </div>`);
  // Back the way the user came (so the phone's own back button doesn't return here), else to the list.
  page.querySelector(".set-back").addEventListener("click", (e) => {
    if (!cameFromHome) return;
    e.preventDefault();
    cameFromHome = false;
    history.back();
  });
  view.append(page);
  return { page, body: page.querySelector(".set-body") };
}

/** A quiet "More options" fold holding the things only some people need (HTML in, HTML out). */
export function moreOptions(inner, { label = "More options", find = "" } = {}) {
  return `<details class="set-more" ${find ? `data-find="${find}"` : ""}><summary>${icon("chevron", 16)}<span>${esc(label)}</span></summary>
    <div class="set-more-body stack">${inner}</div></details>`;
}

/** Bring the setting `show` (a data-find id) into view, opening any fold it is in, and ring it a moment.
 * Twice: the parts above it are still filling in when the screen opens, and push it down as they grow. */
export function revealFind(root, show) {
  if (!show) return;
  const go = (ring) => {
    const el = root.querySelector(`[data-find~="${CSS.escape(show)}"]`);
    if (!el || !el.isConnected) return;
    for (let d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    if (el.tagName === "DETAILS") el.open = true;
    el.scrollIntoView({ block: "center" });
    if (ring) {
      el.classList.remove("set-found");
      void el.offsetWidth; // (so the ring plays again)
      el.classList.add("set-found");
    }
  };
  setTimeout(() => go(false), 60);
  setTimeout(() => go(true), 500);
}

/** A sleek in-app yes/no box instead of the browser's plain one. Resolves to true or false. */
export function confirmBox(title, text, { ok = "OK", danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal({ title, onClose: () => resolve(answer) });
    const p = h(`<p class="muted"></p>`);
    p.textContent = text;
    const row = h(`<div class="confirm-buttons"><button type="button" class="ghost">Cancel</button>
      <button type="button" class="${danger ? "danger-solid" : "primary"}"></button></div>`);
    row.lastElementChild.textContent = ok;
    row.firstElementChild.onclick = () => m.close();
    row.lastElementChild.onclick = () => { answer = true; m.close(); };
    m.body.append(p, row);
    row.lastElementChild.focus();
  });
}

// ---------- looks ----------
// Added once, here rather than in app.css, so they come and go with this file and work the same in
// the computer's, the phone's and the web app's pages. Plain solid surfaces: no shadows, no
// gradients, no coloured bars; one centred column.
if (typeof document !== "undefined" && !document.getElementById("settings-css")) {
  const style = document.createElement("style");
  style.id = "settings-css";
  style.textContent = `
    .set-v2 { max-width: 680px; margin: 0 auto; }
    .set-v2 .card { box-shadow: none; }
    .set-v2 .set-body section.card { margin-bottom: 14px; }
    .set-head { text-align: center; margin: 4px 0 18px; }
    .set-head h1 { font-size: 28px; margin: 0; }
    .set-head p { color: var(--muted); margin: 6px auto 0; max-width: 460px; font-size: 15px; }
    .set-search { position: relative; display: block; margin-bottom: 14px; }
    .set-search .ic { position: absolute; inset-inline-start: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
    .set-v2 .set-search input { width: 100%; min-height: 48px; padding-inline-start: 44px; border-radius: 99px; font-size: 16px; }
    .set-list { padding: 0; overflow: hidden; }
    .set-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; min-height: 72px; color: var(--text); }
    .set-row + .set-row { border-top: 1px solid var(--border); }
    .set-row:hover { background: var(--surface-2); text-decoration: none; }
    .set-row:focus-visible { outline-offset: -2px; }
    .set-ico { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none;
      background: var(--accent-soft); color: var(--accent); }
    .set-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .set-name { font-weight: 650; font-size: 16px; }
    .set-sum { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .set-warn { color: var(--warn); font-weight: 650; }
    .set-chev { color: var(--muted); display: inline-flex; }
    [dir="rtl"] .set-chev .ic { transform: rotate(180deg); }
    .set-none { text-align: center; padding: 20px 0; }
    .set-back { display: inline-flex; align-items: center; gap: 2px; font-weight: 600; padding: 6px 10px 6px 0; margin-bottom: 2px; }
    .set-back .ic { transform: rotate(180deg); }
    [dir="rtl"] .set-back .ic { transform: none; }
    .set-back:hover { text-decoration: none; }
    .set-v2 .card h2 { font-size: 18px; margin: 0 0 4px; }
    .set-v2 .card h3 { font-size: 15px; margin: 0 0 4px; }
    .set-hint { font-size: 13.5px; color: var(--muted); margin: 0 0 12px; }
    .set-more { border-top: 1px solid var(--border); margin-top: 14px; }
    .set-more > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px;
      padding: 12px 0 2px; color: var(--muted); font-weight: 600; font-size: 14px; width: fit-content; }
    .set-more > summary::-webkit-details-marker { display: none; }
    .set-more > summary:hover { color: var(--text); }
    .set-more > summary .ic { transform: rotate(90deg); transition: transform .15s ease; }
    .set-more[open] > summary .ic { transform: rotate(-90deg); }
    .set-more-body { padding-top: 12px; }
    .set-info > summary { cursor: pointer; color: var(--muted); font-size: 13px; text-decoration: underline; width: fit-content; }
    .set-info[open] > summary { margin-bottom: 6px; }
    .set-info { font-size: 13px; }
    .set-seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface-2); }
    .set-seg label { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; min-height: 40px;
      border-radius: 10px; cursor: pointer; font-weight: 600; color: var(--muted); user-select: none; }
    .set-seg input { position: absolute; opacity: 0; pointer-events: none; }
    .set-seg label:has(input:checked) { background: var(--surface); color: var(--text); }
    .set-seg label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
    .set-slider { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .set-slider > label { flex: 1 1 100%; font-weight: 600; font-size: 14px; }
    .set-slider input[type=range] { flex: 1; min-width: 0; accent-color: var(--accent); }
    .set-slider output { min-width: 44px; text-align: end; font-variant-numeric: tabular-nums; color: var(--muted); }
    .set-sample { text-align: center; padding: 10px 12px; margin: 8px 0 16px; border-radius: 12px; background: var(--surface-2); overflow-wrap: anywhere; }
    .set-state { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); }
    .set-state strong { overflow-wrap: anywhere; }
    .set-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .set-sub { border-top: 1px solid var(--border); margin-top: 16px; padding-top: 14px; }
    .stack > .set-hint { margin-bottom: 0; }
    .stack > h2 + .set-hint { margin-top: 0; }
    .set-found { animation: set-ring 1.8s ease-out; border-radius: 12px; }
    @keyframes set-ring { 0%, 40% { outline: 3px solid var(--accent); outline-offset: 3px; } 100% { outline: 3px solid transparent; outline-offset: 3px; } }
    .ai-more { display: flex; flex-direction: column; gap: 12px; }
    .ai-more-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; align-items: end; }
    .ai-more .ai-use, .ai-more .ai-mnemo { padding-top: 12px; }
    .def-mode .badge { vertical-align: 1px; }
    .ai-more .model-btn .badge { display: none; } /* no room beside the price; the list still shows it */
    .set-v2 .lex-row { margin-top: 0; }
    .set-v2 .lex-row:not([hidden]) ~ .lex-row:not([hidden]) { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
    @media (max-width: 640px) { .ai-more-row { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 480px) {
      .set-head h1 { font-size: 24px; }
      .set-row { padding: 12px 14px; gap: 12px; min-height: 66px; }
      .set-ico { width: 38px; height: 38px; }
    }
  `;
  document.head.append(style);
}
