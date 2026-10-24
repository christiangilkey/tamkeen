// End-to-end check of the Tamkeen extension ("Tamkeen for Netflix") in a real Microsoft Edge, against
// the local stand-ins for Netflix (fake-netflix.mjs), Spotify's web player and LRCLIB (fake-spotify.mjs)
// and the web app built into docs/ (node webapp/build-web.mjs first). No Netflix, no Spotify, no
// account, no sign-in: a fresh, empty browser profile in a temporary folder.
//   node extension/test/e2e.mjs [--shots DIR] [--video sample.webm] [--headed] [--size 1280x800] [--spotify-only]
// (--size: both tabs' page size, e.g. 1280x800 for the Chrome Web Store's screenshots; --spotify-only:
// only the web app and Spotify's lyrics panel.)
// It builds a TEST build of the extension (local hosts allowed; never zipped), starts Edge with it
// (--load-extension, --remote-debugging-port) and drives it through the Chrome DevTools Protocol with
// Node's own WebSocket. Screenshots go to --shots (default: a temporary folder; printed at the end).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS, TITLE, start } from "./fake-netflix.mjs";
import { LYRICS_HOST, SONGS, SPOTIFY_HOST, startSpotify } from "./fake-spotify.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : ""; };
const EDGE = process.env.EDGE || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const SIZE = (([, w, h]) => (w ? { w: Number(w), h: Number(h) } : null))(/^(\d{3,4})x(\d{3,4})$/.exec(arg("size")) || []);
const shots = arg("shots") || mkdtempSync(join(tmpdir(), "tamkeen-ext-shots-"));
mkdirSync(shots, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "tamkeen-ext-e2e-"));
const extDir = join(work, "extension");
const profile = join(work, "profile");
const PORT = 9333;
const NETFLIX = `http://localhost:${PORTS.netflix}`;
const WEBAPP = `http://127.0.0.1:${PORTS.docs}/app/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---------- a small DevTools Protocol client ----------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(`${m.error.message} ${m.error.data || ""}`)); else resolve(m.result);
      } else for (const fn of this.listeners) fn(m);
    };
    this.open = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}
let cdp;
async function evaluate(session, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)}`);
  return r.result.value;
}
async function until(what, fn, timeout = 20000, every = 300) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(every);
  }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}
async function targets() { return (await cdp.send("Target.getTargets")).targetInfos; }
const logs = [];
async function attach(targetId) {
  const session = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  await cdp.send("Runtime.enable", {}, session).catch(() => {});
  return session;
}
async function shot(session, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, session);
  const file = join(shots, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`      screenshot ${file}`);
  return file;
}
async function click(session, x, y) {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 }, session);
  }
}
/** The centre of the element `selector` in `session`'s page, or null. */
const centre = (session, selector) => evaluate(session, `(() => { const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null; el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);

// ---------- run ----------
let edge, servers, spotifyServers;
try {
  if (!EDGE) throw new Error("Microsoft Edge isn't installed where expected (set EDGE=path to msedge.exe).");
  if (!existsSync(join(root, "docs", "app", "index.html"))) throw new Error("Build the web app first: node webapp/build-web.mjs");
  execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", extDir, "--test-netflix", NETFLIX,
    "--test-subs", "127.0.0.1", "--test-webapp", WEBAPP, "--test-spotify", SPOTIFY_HOST, "--test-lyrics", LYRICS_HOST], { stdio: "inherit" });
  servers = start({ video: arg("video") });
  spotifyServers = startSpotify();
  const flags = [`--user-data-dir=${profile}`, `--load-extension=${extDir}`, `--disable-extensions-except=${extDir}`,
    `--remote-debugging-port=${PORT}`, "--no-first-run", "--no-default-browser-check", "--window-size=1400,900",
    "--disable-features=DisableLoadExtensionCommandLineSwitch", "--autoplay-policy=no-user-gesture-required",
    "--disable-sync", "--no-service-autorun", "--password-store=basic"];
  if (!process.argv.includes("--headed")) flags.push("--headless=new");
  edge = spawn(EDGE, [...flags, "about:blank"], { stdio: "ignore" });
  const version = await until("Edge's DevTools", async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(), 20000);
  cdp = new CDP(version.webSocketDebuggerUrl);
  await cdp.open;
  console.log(`Edge ${version.Browser}`);
  cdp.listeners.add((m) => { // errors and warnings in any page attached, shown if something fails
    if (m.method === "Runtime.exceptionThrown") logs.push(`[${m.sessionId?.slice(0, 6)}] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    else if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
      logs.push(`[${m.sessionId?.slice(0, 6)}] ${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
  });

  // 1. The extension is loaded, and opened the web app once (onInstalled).
  const sw = await until("the extension's background part", async () => (await targets()).find((t) => t.type === "service_worker" && /background\.js$/.test(t.url)), 15000);
  const extId = new URL(sw.url).host;
  check("the extension is loaded", true, extId);
  const swSession = await attach(sw.targetId);
  const appTarget = await until("the web app tab the extension opens", async () => (await targets()).find((t) => t.type === "page" && t.url.startsWith(WEBAPP)), 15000);
  check("on install it opens the web app", !!appTarget);
  const app = await attach(appTarget.targetId);
  await cdp.send("Page.enable", {}, app);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: SIZE ? SIZE.w : 1280, height: SIZE ? SIZE.h : 860, deviceScaleFactor: 1, mobile: false }, app);

  // 2. The web app as a learner of Arabic (as if the first screens were done), and the bridge.
  await until("the web app", () => evaluate(app, `!!document.querySelector("#view") && document.readyState === "complete"`));
  await evaluate(app, `new Promise((resolve, reject) => { const r = indexedDB.open("aps", 1);
    r.onupgradeneeded = () => { for (const n of ["kv", "transcripts", "audio"]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => { const tx = r.result.transaction("kv", "readwrite"); const s = tx.objectStore("kv");
      const g = s.get("settings"); g.onsuccess = () => { s.put({ ...(g.result || {}), welcome_seen: true, onboarded: true, study_language: "ar",
        learning_languages: ["ar"], ui_language: "en", definer_mode: "dictionary_first", lexicon_declined: ["ar"] }, "settings"); };
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); }; r.onerror = () => reject(r.error); })`);
  await cdp.send("Page.reload", {}, app);
  const mark = await until("the page marked by the extension", () => evaluate(app, `document.documentElement.dataset.tamkeenExtension || ""`));
  check("the extension marks the web app's page", !!mark, `version ${mark}`);
  const got = await until("the settings handed to the extension", async () => {
    const s = await evaluate(swSession, `chrome.storage.local.get(["settings", "device"])`);
    return s.settings && s.settings.study_language === "ar" ? s : null;
  });
  check("the web app hands the extension its settings", got.settings.study_language === "ar" && !("google_email" in got.settings), JSON.stringify(got.device));

  if (process.argv.includes("--spotify-only")) await spotifySection({ app, swSession, extId });
  else await netflixSections({ app, swSession, extId, mark });
} catch (e) {
  check("the run finished", false, e.message);
} finally {
  try { if (cdp) await cdp.send("Browser.close"); } catch { /* closed */ }
  if (edge) { try { edge.kill(); } catch { /* gone */ } }
  if (servers) servers.close();
  if (spotifyServers) spotifyServers.close();
  await sleep(800);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* Edge still letting go of its profile */ }
}
const failed = results.filter((r) => !r.ok);
if (failed.length && logs.length) console.log(`\nErrors and warnings in the pages:\n${logs.slice(-30).join("\n")}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);

// ---------- Netflix ----------
async function netflixSections({ app, swSession, extId, mark }) {
  // 3. The web app's Netflix section, with the extension and without it.
  async function netflixSheet(name) {
    await evaluate(app, `location.hash = "#/library"`);
    await until("the + button", () => centre(app, "#add-fab"));
    await evaluate(app, `document.querySelectorAll(".tour, .modal-back").forEach((x) => x.remove()); document.querySelector("#add-fab").click()`);
    await until("the Netflix way", () => centre(app, 'button.add-way[data-way="netflix"]'));
    await evaluate(app, `document.querySelector('button.add-way[data-way="netflix"]').click()`);
    await sleep(800);
    const text = await evaluate(app, `document.querySelector(".modal, [role=dialog], .sheet")?.innerText || document.body.innerText`);
    await shot(app, name);
    await evaluate(app, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.querySelectorAll(".modal-back").forEach((x) => x.remove())`);
    return text;
  }
  const withExt = await netflixSheet("1-webapp-netflix-with-extension");
  check("with the extension: Open Netflix", /Open Netflix/.test(withExt) && /new tab/.test(withExt), withExt.replace(/\s+/g, " ").slice(0, 120));
  await evaluate(app, `delete document.documentElement.dataset.tamkeenExtension`);
  const noExt = await netflixSheet("2-webapp-netflix-without-extension");
  check("without it: get the Tamkeen extension", /Get the Tamkeen extension/.test(noExt) && /browser extension/.test(noExt), noExt.replace(/\s+/g, " ").slice(0, 120));
  await evaluate(app, `document.documentElement.dataset.tamkeenExtension = ${JSON.stringify(mark)}`);

  // (Screenshots for the store, --size: without the one-time note about Netflix remembering the subtitles.)
  if (SIZE) await evaluate(swSession, `chrome.storage.local.set({ told_subtitles: true })`);

  // 4. Netflix's browse page: the language being learned is chosen by itself.
  const nfTarget = (await cdp.send("Target.createTarget", { url: `${NETFLIX}/browse/original-audio` })).targetId;
  const nf = await attach(nfTarget);
  await cdp.send("Page.enable", {}, nf);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: SIZE ? SIZE.w : 1400, height: SIZE ? SIZE.h : 860, deviceScaleFactor: 1, mobile: false }, nf);
  const browsed = await until("Arabic chosen in the language menu", () => evaluate(nf, `location.pathname === "/browse/original-audio/ar" && location.pathname`));
  check("browse by language: Arabic chosen", !!browsed, browsed);
  await sleep(700);
  await shot(nf, "3-netflix-browse");

  // 5. A title picked: Netflix's watch page, with Tamkeen's bar and sidebar.
  const card = await until("a title card", () => centre(nf, ".title-card"));
  await click(nf, card.x, card.y);
  await until("the watch page", () => evaluate(nf, `location.pathname === "/watch/${TITLE}"`));
  await until("Tamkeen's frame on the page", () => evaluate(nf, `!!document.querySelector("tamkeen-netflix")`));
  const panelTarget = await until("the subtitle bar's page", async () => (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/panel.html`)), 15000);
  const panel = await attach(panelTarget.targetId);
  await evaluate(nf, `__player.play()`);
  const lines = await until("the subtitles as a transcript", () => evaluate(panel, `document.querySelectorAll("#lines .ln").length >= 20 && document.querySelectorAll("#lines .ln").length`), 20000);
  check("the full Arabic subtitle file becomes the transcript (not the forced lines or English)", lines === 20, `${lines} lines`);
  const firstLine = await evaluate(panel, `document.querySelector("#lines .ln .ln-x").innerText`);
  check("its first line", /مرحباً/.test(firstLine), firstLine);
  const hidden = await evaluate(nf, `({ subs: getComputedStyle(document.querySelector(".player-timedtext")).display,
    controls: getComputedStyle(document.querySelector(".watch-video--bottom-controls-container")).visibility,
    only: document.documentElement.classList.contains("tk-only-video"), log: __playerLog.join(",") })`);
  check("Netflix's own subtitles and controls are hidden", hidden.subs === "none" && hidden.controls === "hidden" && hidden.only, JSON.stringify(hidden));
  check("the Arabic (Lebanon) subtitles were chosen, never Off", /text T1/.test(hidden.log) && !/text T0/.test(hidden.log), hidden.log);
  await until("a caption on the bar", () => evaluate(panel, `document.querySelectorAll("#cap .w").length`), 15000);
  const box = await evaluate(nf, `(() => { const v = document.querySelector("video").getBoundingClientRect(); return { w: v.width, h: v.height, vw: innerWidth, vh: innerHeight }; })()`);
  const layout = await evaluate(panel, `({ side: document.querySelector("#side").offsetWidth, bar: document.querySelector("#bar").offsetHeight })`);
  check("the picture fills the space the bar and sidebar leave", Math.abs(box.w - (box.vw - layout.side)) < 3 && Math.abs(box.h - (box.vh - layout.bar)) < 3, `${JSON.stringify(box)} ${JSON.stringify(layout)}`);
  await sleep(500);
  await shot(nf, "4-netflix-watch-bar-and-sidebar");

  // 6. Clicks on the picture go to Netflix's page (the frame lets them through there).
  const before = await evaluate(nf, `__clicks.length`);
  await click(nf, 200, 200);
  await sleep(200);
  check("a click on the picture reaches Netflix's player", (await evaluate(nf, `__clicks.length`)) === before + 1);

  // 7. Tapping a word in the bar: Tamkeen's word popup above the bar (the dictionary downloads once).
  await evaluate(panel, `localStorage.setItem("wordPause", "1")`);
  const word = await until("a word in the bar", () => centre(panel, "#cap .w"));
  await click(nf, word.x, word.y);
  await until("the popup above the bar", () => evaluate(panel, `!!document.querySelector("#bar-pop .word-bubble:not([hidden])")`));
  check("pause on a tapped word (the user's setting)", await until("paused", () => evaluate(nf, `__player.isPaused()`), 3000));
  const state = await until("a meaning, or the offer to download the dictionary", () => evaluate(panel,
    `document.querySelector("#bar-pop .wb-meaning")?.innerText || (document.querySelector('#bar-pop [data-act="getmeanings"]') ? "download" : "")`), 20000);
  if (state === "download") {
    await shot(nf, "5a-word-popup-dictionary-offer");
    const b = await centre(panel, '#bar-pop [data-act="getmeanings"]');
    await click(nf, b.x, b.y);
  }
  const meaning = await until("the word's meaning", () => evaluate(panel, `document.querySelector("#bar-pop .wb-meaning")?.innerText`), 120000, 1000);
  check("tapping a word shows its meaning", !!meaning, meaning);
  const barGrew = await evaluate(panel, `document.querySelector("#bar").offsetHeight`);
  const videoNow = await evaluate(nf, `document.querySelector("video").getBoundingClientRect().height`);
  check("the popup makes the picture shorter instead of covering it", videoNow < box.h - 20, `bar ${layout.bar} -> ${barGrew}px, picture ${box.h} -> ${videoNow}px`);
  await shot(nf, "5-word-popup-above-the-bar");

  // 8. Save the word: it reaches the web app's Vocab through the bridge, with its Netflix title.
  const save = await centre(panel, '#bar-pop [data-act="save"]');
  await click(nf, save.x, save.y);
  const saved = await until("the saved word waiting in the extension", async () => {
    const all = await evaluate(swSession, `chrome.storage.local.get(null)`);
    return Object.keys(all).some((k) => k.startsWith("w:")) || null;
  }, 10000).catch(() => false);
  check("Save keeps the word in the extension", saved !== false);
  const vocab = await until("the word in the web app's Vocab", () => evaluate(app, `(async () => {
    const { handle } = await import("/app/js/backend.js");
    const v = await handle("/vocab", "GET");
    return v.length ? v.map((x) => ({ text: x.text, episode: x.episode_id, sentence: x.sentence, start: x.start, meaning: x.meaning })) : null; })()`), 20000);
  check("the saved word is in the web app's Vocab", vocab.length === 1, JSON.stringify(vocab[0]));
  const ep = await evaluate(app, `(async () => { const { handle } = await import("/app/js/backend.js");
    const t = await handle("/episodes/${vocab[0].episode}/transcript", "GET");
    return { title: t.episode.title, type: t.episode.audio_type, guid: t.episode.guid, segs: t.segments.length, url: t.episode.audio_url }; })()`);
  check("its Netflix title is in the Library, with the subtitles as its transcript", ep.type === "video/netflix" && ep.guid === TITLE && ep.segs === 20, JSON.stringify(ep));
  const left = await until("the extension forgetting what the web app kept", async () => {
    const all = await evaluate(swSession, `chrome.storage.local.get(null)`);
    return !Object.keys(all).some((k) => k.startsWith("w:") || k.startsWith("t:")) || null;
  }, 10000).catch(() => false);
  check("once kept, the extension forgets it", left !== false);
  await evaluate(app, `location.hash = "#/vocab"`);
  await sleep(1500);
  await evaluate(app, `document.querySelectorAll(".tour, .modal-back").forEach((x) => x.remove())`);
  await shot(app, "6-webapp-vocab");
  await evaluate(app, `location.hash = "#/episode/${vocab[0].episode}"`);
  await sleep(1500);
  await shot(app, "7-webapp-netflix-title");
  const watchLink = await evaluate(app, `[...document.querySelectorAll("a")].find((a) => /Watch on Netflix/.test(a.innerText))?.href || ""`);
  check("the title's page in the web app: Watch on Netflix", watchLink.endsWith(`/watch/${TITLE}`), watchLink);

  // 9. A word in the sidebar: the popup docks in the sidebar. Then a line tapped: Netflix jumps there.
  await click(nf, 30, 30); // (on the picture: nothing of Tamkeen's)
  await evaluate(panel, `document.querySelector("#bar-pop .wb-close")?.click()`);
  const sideWord = await until("a word in the sidebar", () => centre(panel, '#lines .ln[data-s="2"] .w'));
  await click(nf, sideWord.x, sideWord.y);
  await until("the popup in the sidebar", () => evaluate(panel, `!!document.querySelector("#side-pop .word-bubble:not([hidden])")`), 5000)
    .catch(async (e) => {
      const at = await evaluate(panel, `(() => { const el = document.elementFromPoint(${sideWord.x}, ${sideWord.y}); return el ? el.outerHTML.slice(0, 120) : null; })()`);
      const where = await evaluate(panel, `[...document.querySelectorAll(".word-bubble")].map((b) => (b.parentNode.id || b.parentNode.className) + (b.hidden ? " hidden" : " shown"))`);
      throw new Error(`${e.message}; at the point: ${at}; popups: ${JSON.stringify(where)}`);
    });
  check("a word tapped in the sidebar opens its popup there", true);
  await sleep(600);
  await shot(nf, "8-word-popup-in-the-sidebar");
  await evaluate(panel, `document.querySelector("#side-pop .wb-close")?.click()`);
  const line = await until("line 11 in the sidebar", () => centre(panel, '#lines .ln[data-s="10"] .ln-t'));
  await click(nf, line.x, line.y);
  const at = await until("Netflix's player at line 11 (41 s)", async () => { const t = await evaluate(nf, `__player.getCurrentTime()`); return Math.abs(t - 41000) < 1500 ? t : null; }, 5000);
  check("tapping a line jumps Netflix's player there", !!at, `${Math.round(at)} ms; ${await evaluate(nf, `__playerLog.filter((x) => x.startsWith("seek")).slice(-1)[0]`)}`);
  await evaluate(nf, `__player.play()`);
  await sleep(1200);
  const cur = await evaluate(panel, `document.querySelector("#lines .ln.cur")?.dataset.s`);
  check("the current line is highlighted", cur === "10", `line ${cur}`);

  // 10. The controls: back 5 s, pause; the sidebar folds to a slim tab for the full width.
  const t0 = await evaluate(nf, `__player.getCurrentTime()`);
  const back = await centre(panel, "#back");
  await click(nf, back.x, back.y);
  const t1 = await until("5 s back", async () => { const t = await evaluate(nf, `__player.getCurrentTime()`); return t < t0 - 3000 ? t : null; }, 4000);
  check("back 5 seconds", !!t1, `${Math.round(t0)} -> ${Math.round(t1)} ms`);
  const play = await centre(panel, "#play");
  await click(nf, play.x, play.y);
  check("the play/pause button", await until("paused", () => evaluate(nf, `__player.isPaused()`), 3000));
  const fold = await centre(panel, "#fold");
  await click(nf, fold.x, fold.y);
  await sleep(500);
  const wide = await evaluate(nf, `document.querySelector("video").getBoundingClientRect().width`);
  check("folded: the picture takes nearly the full width", wide > box.vw - 40, `${Math.round(wide)} of ${box.vw}px`);
  await shot(nf, "9-sidebar-folded");
  const tab = await centre(panel, "#tab");
  await click(nf, tab.x, tab.y);
  await sleep(400);
  check("the slim tab brings the sidebar back", await evaluate(panel, `!document.querySelector("#side").hidden`));

  // 11. Leaving the watch page takes the bar away.
  await evaluate(nf, `history.back()`);
  await until("the bar gone after leaving", () => evaluate(nf, `!document.querySelector("tamkeen-netflix") && location.pathname.startsWith("/browse")`), 8000);
  check("leaving the watch page removes the bar and gives the picture back", true);

  // 12. A title with no subtitles in the language being learned: said plainly.
  await evaluate(nf, `location.assign("/watch/80002002")`);
  const panel2Target = await until("the subtitle bar on the other title", async () =>
    (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/panel.html`) && t.targetId !== panelTarget.targetId), 15000);
  const panel2 = await attach(panel2Target.targetId);
  await evaluate(nf, `__player.play()`);
  const none = await until("the note about no Arabic subtitles", () => evaluate(panel2, `[...document.querySelectorAll("#notes .note")].map((p) => p.innerText).join(" ")`).then((s) => /no Arabic subtitles/.test(s) && s), 15000);
  check("no subtitles in the language: said plainly", !!none, none);
  await sleep(400);
  await shot(nf, "10-no-subtitles-in-the-language");

  // Spotify (before the web app's tab goes to the install page).
  await spotifySection({ app, swSession, extId });

  // 13. The install page (docs/extension), in Spanish with the web app's translations.
  await evaluate(app, `location.assign("http://127.0.0.1:${PORTS.docs}/extension/?lang=es")`);
  const spanish = await until("the install page in Spanish", () => evaluate(app, `document.documentElement.lang === "es" && document.querySelector("h2")?.innerText`), 10000);
  check("the install page, in the user's language", !/^Add it/.test(spanish), spanish);
  const zip = await evaluate(app, `fetch("tamkeen-netflix.zip").then((r) => r.ok && r.headers.get("content-type"))`);
  check("the install page's download link", /zip/.test(zip || ""), zip);
  await shot(app, "11-install-page-es");
}

// ---------- Spotify: the lyrics panel ----------
async function spotifySection({ app, swSession, extId }) {
  const W = SIZE ? SIZE.w : 1400, H = SIZE ? SIZE.h : 860;
  // S1. Spotify's web player: the panel takes a column at the right, Spotify's app the rest.
  const spTarget = (await cdp.send("Target.createTarget", { url: `${SPOTIFY_HOST}/` })).targetId;
  const sp = await attach(spTarget);
  await cdp.send("Page.enable", {}, sp);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sp);
  await until("Tamkeen's lyrics panel on Spotify's page", () => evaluate(sp, `!!document.querySelector("tamkeen-spotify")`));
  const lpTarget = await until("the lyrics panel's page", async () => (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/spotify.html`)), 15000);
  const lp = await attach(lpTarget.targetId);
  const box = () => evaluate(sp, `(() => { const h = document.querySelector("tamkeen-spotify").getBoundingClientRect(); const m = document.getElementById("main").getBoundingClientRect();
    return { host: Math.round(h.width), left: Math.round(h.left), main: Math.round(m.width), vw: innerWidth, scroll: document.documentElement.scrollWidth }; })()`);
  const layout = await until("Spotify narrowed for the panel", async () => { const b = await box(); return b.host > 200 ? b : null; });
  check("Spotify's app is narrowed to leave a column for the panel (nothing of Spotify covered)",
    Math.abs(layout.main + layout.host - layout.vw) <= 2 && layout.scroll <= layout.vw, JSON.stringify(layout));
  const idle = await until("the note before a song plays", () => evaluate(lp, `document.querySelector("#notes").innerText`).then((s) => /Play a song/.test(s) && s));
  check("before a song plays, the panel says what to do", !!idle, idle);
  await shot(sp, "12-spotify-before-a-song");
  /** Click something in the panel (its frame is the column at the right of Spotify's page). `edge`:
   * near its left edge instead of its middle (a lyric line's empty side, not one of its words). */
  async function clickPanel(selector, what = selector, edge = false) {
    const p = await until(what, () => (edge ? evaluate(lp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + 6, y: r.top + r.height / 2 }; })()`) : centre(lp, selector)));
    const b = await box();
    await click(sp, b.left + p.x, p.y);
  }
  const playSong = async (k) => { const b = await until(`song ${k}'s Play button`, () => centre(sp, `[data-testid="play-song"][data-song="${k}"]`)); await click(sp, b.x, b.y); };
  const lrclibLog = async () => (await fetch(`${LYRICS_HOST}/__log`)).json();

  // S2. A song in the language being learned (Arabic): LRCLIB's timed lyrics as a karaoke view.
  await playSong(0);
  const n = await until("the song's lyrics in the panel", () => evaluate(lp, `document.querySelectorAll("#lines .ln").length`), 20000);
  check("LRCLIB's timed lyrics become the panel's lines", n === 14, `${n} lines`);
  const name = await evaluate(lp, `document.querySelector(".nf-name").innerText + " / " + document.querySelector(".nf-sub").innerText`);
  check("the song's name and artist, as Spotify plays it", name === `${SONGS[0].title} / ${SONGS[0].artist}`, name);
  const asked = await lrclibLog();
  check("LRCLIB is asked by title, artist, album and length, naming Tamkeen", asked[0] && asked[0].path === "/api/get" && asked[0].query.duration === "60"
    && asked[0].query.album_name === SONGS[0].album && /^Tamkeen browser extension/.test(asked[0].client), JSON.stringify(asked[0]));
  check("one request is enough when it has timed lyrics", asked.length === 1, `${asked.length} requests`);
  await evaluate(sp, `__sp.audio.currentTime = 9`);
  const cur = await until("the line being sung, big and centred", () => evaluate(lp, `(() => { const c = document.querySelector("#lines .ln.cur");
    const other = document.querySelector("#lines .ln:not(.cur):not(.near)"); if (!c || !other) return null;
    const box = document.querySelector("#lines").getBoundingClientRect(), r = c.getBoundingClientRect();
    return { s: c.dataset.s, size: parseFloat(getComputedStyle(c).fontSize), other: parseFloat(getComputedStyle(other).fontSize),
      off: Math.round(Math.abs((r.top + r.bottom) / 2 - (box.top + box.bottom) / 2)), near: document.querySelectorAll("#lines .ln.near").length }; })()`), 10000);
  check("the line being sung is big and centred, the lines around it dimmer", cur.s === "1" && cur.size > cur.other + 3 && cur.off < 40 && cur.near === 2, JSON.stringify(cur));
  const sung = await until("words lighting up as they are sung", () => evaluate(lp, `document.querySelectorAll("#lines .ln.cur .w.sung, #lines .ln.cur .w.cur").length`), 5000);
  check("the words light up as they are sung", sung > 0, `${sung} words`);
  const moved = await until("the view following the song", () => evaluate(lp, `document.querySelector("#lines .ln.cur")?.dataset.s`).then((s) => (s === "2" ? s : null)), 8000);
  check("the view follows the song to the next line", moved === "2");
  await shot(sp, "13-spotify-karaoke");

  // S3. A word: Tamkeen's popup (pause on a tapped word), then Save: a card with the lyric line.
  await evaluate(lp, `localStorage.setItem("wordPause", "1")`);
  await evaluate(sp, `__sp.audio.currentTime = 13`); // line 4: قلبي سعيد اليوم
  await until("line 4 being sung", () => evaluate(lp, `document.querySelector("#lines .ln.cur")?.dataset.s === "3"`), 5000);
  await clickPanel('#lines .ln.cur .w[data-i]', "a word in the line being sung");
  await until("the word popup", () => evaluate(lp, `!!document.querySelector("#side-pop .word-bubble:not([hidden])")`), 5000);
  check("a tapped word pauses Spotify (the user's setting)", await until("paused", () => evaluate(sp, `__sp.paused()`), 4000));
  let state = await until("a meaning, or the offer to download the dictionary", () => evaluate(lp,
    `document.querySelector("#side-pop .wb-meaning")?.innerText || (document.querySelector('#side-pop [data-act="getmeanings"]') ? "download" : "")`), 20000);
  if (state === "download") await clickPanel('#side-pop [data-act="getmeanings"]');
  const meaning = await until("the word's meaning", () => evaluate(lp, `document.querySelector("#side-pop .wb-meaning")?.innerText`), 120000, 1000);
  check("a word in the lyrics shows its meaning", !!meaning, meaning);
  const fits = await evaluate(lp, `(() => { const l = document.querySelector("#lines").getBoundingClientRect(), p = document.querySelector("#side-pop .word-bubble").getBoundingClientRect();
    return { lyricsEnd: Math.round(l.bottom), popupTop: Math.round(p.top) }; })()`);
  check("the popup sits under the lyrics, which get shorter (never covered)", fits.lyricsEnd <= fits.popupTop + 1, JSON.stringify(fits));
  await shot(sp, "14-spotify-word-popup");
  const word = await evaluate(lp, `document.querySelector("#side-pop .wb-word, #side-pop .wb-head")?.innerText || ""`);
  await clickPanel('#side-pop [data-act="save"]', "the Save button");
  const kept = await until("the saved word waiting in the extension", async () => {
    const all = await evaluate(swSession, `chrome.storage.local.get(null)`);
    return Object.entries(all).find(([k, v]) => k.startsWith("w:") && v.spotify) || null;
  }, 10000).catch(() => null);
  check("Save keeps the word, with its lyric line and song", !!kept && kept[1].sentence === "قلبي سعيد اليوم" && kept[1].spotify.title === SONGS[0].title,
    kept ? JSON.stringify({ text: kept[1].text, sentence: kept[1].sentence, spotify: kept[1].spotify }) : "nothing kept");
  const card = await until("the word in the web app's Vocab", () => evaluate(app, `(async () => {
    const { handle } = await import("/app/js/backend.js");
    const v = (await handle("/vocab", "GET")).find((x) => x.episode_title && x.episode_title.startsWith("Spotify"));
    return v ? { text: v.text, sentence: v.sentence, source: v.episode_title, episode: v.episode_id, language: v.language } : null; })()`), 20000);
  check("the card in the web app's Vocab: the lyric line, \"Spotify – Artist – Title\", no Library item",
    card.sentence === "قلبي سعيد اليوم" && card.source === `Spotify – ${SONGS[0].artist} – ${SONGS[0].title}` && !card.episode && card.language === "ar", JSON.stringify(card) + ` (${word})`);
  const gone = await until("the extension forgetting the word", async () => {
    const all = await evaluate(swSession, `chrome.storage.local.get(null)`);
    return !Object.keys(all).some((k) => k.startsWith("w:")) || null;
  }, 10000).catch(() => false);
  check("once kept, the extension forgets it", gone !== false);
  await evaluate(lp, `document.querySelector("#side-pop .wb-close")?.click()`);

  // S4. Following along: scrolling by hand stops it; "Follow along" brings the line back.
  await clickPanel("#play", "the play button");
  await until("playing", () => evaluate(sp, `!__sp.paused()`), 4000);
  const lines = await centre(lp, "#lines");
  const b = await box();
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: b.left + lines.x, y: lines.y, deltaX: 0, deltaY: -400 }, sp);
  const stopped = await until("the Follow along button", () => evaluate(lp, `!document.querySelector("#follow").hidden`), 4000).catch(() => false);
  check("scrolling the lyrics by hand stops following (a Follow along button shows)", stopped);
  await shot(sp, "15-spotify-follow-along");
  await clickPanel("#follow", "Follow along");
  const back = await until("following again", () => evaluate(lp, `document.querySelector("#follow").hidden && (() => { const c = document.querySelector("#lines .ln.cur"); if (!c) return false;
    const box = document.querySelector("#lines").getBoundingClientRect(), r = c.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - (box.top + box.bottom) / 2) < 40; })()`), 5000).catch(() => false);
  check("Follow along: the line being sung is centred again", back);

  // S5. The controls: back 5 s, back to the start of the line, a line tapped.
  await evaluate(sp, `__sp.audio.currentTime = 31`);
  await sleep(600);
  const t0 = await evaluate(sp, `__sp.time()`);
  await clickPanel("#back", "back 5 s");
  const t1 = await until("5 s back", async () => { const t = await evaluate(sp, `__sp.time()`); return t < t0 - 3 ? t : null; }, 4000).catch(() => null);
  check("back 5 seconds (through Spotify's own progress bar)", t1 !== null, `${t0.toFixed(1)} -> ${t1 && t1.toFixed(1)} s; ${await evaluate(sp, `__spLog.filter((x) => x.startsWith("seek")).slice(-1)[0]`)}`);
  await evaluate(sp, `__sp.audio.currentTime = 24.5`); // (line k starts at 2 + 4k s: 24.5 s is in the sixth, from 22 s)
  await until("line 6 being sung", () => evaluate(lp, `document.querySelector("#lines .ln.cur")?.dataset.s === "5"`), 5000);
  await clickPanel("#restart", "back to the start of the line");
  const t2 = await until("the start of the line", async () => { const t = await evaluate(sp, `__sp.time()`); return Math.abs(t - 22) < 1.2 ? t : null; }, 4000).catch(() => null);
  check("back to the start of the line being sung", t2 !== null, `${t2}`);
  await clickPanel('#lines .ln[data-s="9"]', "line 10", true);
  const t3 = await until("line 10's moment", async () => { const t = await evaluate(sp, `__sp.time()`); return Math.abs(t - 38) < 1.2 ? t : null; }, 4000).catch(() => null);
  check("tapping a line jumps the song there", t3 !== null, `${t3}`);

  // S6. A song in another language Tamkeen teaches (Spanish, while Arabic is learned): offered.
  await playSong(1);
  const offer = await until("the offer to look up in Spanish", () => evaluate(lp, `document.querySelector("#notes").innerText`).then((s) => /in Spanish/.test(s) && s), 20000);
  check("a song in another language Tamkeen teaches: it says so and offers lookups in it", /This song is in Spanish/.test(offer) && /Look up words in Spanish/.test(offer), offer.replace(/\s+/g, " "));
  check("its words aren't looked up in the language being learned meanwhile", await evaluate(lp, `document.querySelector("#lines").classList.contains("nolookup")`));
  await shot(sp, "16-spotify-another-language");
  await clickPanel("#notes .note-actions button", "Look up words in Spanish");
  const yes = await until("lookups in Spanish", () => evaluate(lp, `!document.querySelector("#lines").classList.contains("nolookup") && document.querySelector("#lines").lang`), 8000).catch(() => "");
  check("after choosing, its words are looked up in Spanish", yes === "es", yes);

  // S7. A song LRCLIB doesn't have: said; Spotify's own lyrics, once its lyrics view shows them.
  await playSong(2);
  const none = await until("no lyrics found", () => evaluate(lp, `document.querySelector("#notes").innerText`).then((s) => /No lyrics found/.test(s) && s), 20000);
  check("a song with no lyrics in LRCLIB: said plainly, with Spotify's lyrics button as the way", /microphone/.test(none), none.replace(/\s+/g, " "));
  const lyricsButton = await centre(sp, '[data-testid="lyrics-button"]');
  await click(sp, lyricsButton.x, lyricsButton.y);
  await evaluate(sp, `__sp.audio.currentTime = 12`);
  const fromPage = await until("Spotify's own lyrics in the panel", () => evaluate(lp, `document.querySelectorAll("#lines .ln").length === 10 && document.querySelector("#lines .credit")?.innerText`), 15000).catch(() => "");
  check("Spotify's own lyrics (its lyrics view open) become the panel's lines", /Spotify/.test(fromPage || ""), fromPage);
  const marked = await until("the line Spotify marks", () => evaluate(lp, `document.querySelector("#lines .ln.cur")?.dataset.s`).then((s) => (s === "2" ? s : null)), 5000).catch(() => null);
  check("the panel follows the line Spotify marks as being sung", marked === "2", `${marked}`);
  await shot(sp, "17-spotify-own-lyrics");
  await clickPanel('#lines .ln[data-s="5"]', "Spotify line 6", true);
  const t4 = await until("Spotify's line 6", async () => { const t = await evaluate(sp, `__sp.time()`); return Math.abs(t - 26) < 1.2 ? t : null; }, 4000).catch(() => null);
  check("tapping one of Spotify's lines: Spotify jumps to it", t4 !== null, `${t4}`);
  await click(sp, lyricsButton.x, lyricsButton.y); // (its lyrics view closed again)

  // S8. Lyrics without timings: a page to scroll, said so.
  await playSong(3);
  const plain = await until("lyrics without timings", () => evaluate(lp, `document.querySelector("#lines").classList.contains("plain") && document.querySelector("#notes").innerText`), 20000).catch(() => "");
  check("lyrics without timings show as a page, and the panel says they don't follow the song", /no timings/.test(plain || ""), (plain || "").replace(/\s+/g, " "));

  // S9. Folding the panel gives Spotify nearly the whole window; and back.
  await clickPanel("#fold", "the fold button");
  const folded = await until("folded", async () => { const b2 = await box(); return b2.host < 40 ? b2 : null; }, 4000).catch(() => null);
  check("folded: Spotify takes nearly the whole width", folded && folded.main >= folded.vw - 40, JSON.stringify(folded));
  await shot(sp, "18-spotify-folded");
  await clickPanel("#tab", "the slim tab");
  const unfolded = await until("unfolded", async () => { const b2 = await box(); return b2.host > 200 ? b2 : null; }, 4000).catch(() => null);
  check("the slim tab brings the panel back", !!unfolded);

  // S10. A song played again: its lyrics come from what was kept, not from LRCLIB again.
  const before = (await lrclibLog()).length;
  await playSong(0);
  await until("the first song's lyrics again", () => evaluate(lp, `document.querySelectorAll("#lines .ln").length === 14`), 15000);
  check("a song played again isn't asked for again", (await lrclibLog()).length === before, `${before} -> ${(await lrclibLog()).length}`);

  // S11. The web app's Spotify entry, with the extension and without it.
  async function spotifySheet(shotName) {
    await evaluate(app, `location.hash = "#/library"`);
    await until("the + button", () => centre(app, "#add-fab"));
    await evaluate(app, `document.querySelectorAll(".tour, .modal-back").forEach((x) => x.remove()); document.querySelector("#add-fab").click()`);
    await until("the Spotify way", () => centre(app, 'button.add-way[data-way="spotify"]'));
    await evaluate(app, `document.querySelector('button.add-way[data-way="spotify"]').click()`);
    await sleep(800);
    const text = await evaluate(app, `document.querySelector(".aw-step")?.innerText || ""`);
    const href = await evaluate(app, `document.querySelector(".aw-step a.btn")?.href || ""`);
    await shot(app, shotName);
    await evaluate(app, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.querySelectorAll(".modal-back").forEach((x) => x.remove())`);
    return { text, href };
  }
  const mark = await evaluate(app, `document.documentElement.dataset.tamkeenExtension`);
  const withExt = await spotifySheet("19-webapp-spotify-with-extension");
  check("the web app's Spotify entry with the extension: Open Spotify", /Open Spotify/.test(withExt.text) && withExt.href === "https://open.spotify.com/", withExt.text.replace(/\s+/g, " ").slice(0, 120));
  await evaluate(app, `delete document.documentElement.dataset.tamkeenExtension`);
  const noExt = await spotifySheet("20-webapp-spotify-without-extension");
  check("without it: Spotify needs the Tamkeen extension, and where to get it", /needs the Tamkeen extension/.test(noExt.text) && /Get the Tamkeen extension/.test(noExt.text), noExt.text.replace(/\s+/g, " ").slice(0, 120));
  await evaluate(app, `document.documentElement.dataset.tamkeenExtension = ${JSON.stringify(mark)}`);
}
