// End-to-end check of "Tamkeen for Netflix" in a real Microsoft Edge, against the local stand-in for
// Netflix (fake-netflix.mjs) and the web app built into docs/ (node webapp/build-web.mjs first). No
// Netflix, no account, no sign-in: a fresh, empty browser profile in a temporary folder.
//   node extension/test/e2e.mjs [--shots DIR] [--video sample.webm] [--headed] [--size 1280x800]
// (--size: both tabs' page size, e.g. 1280x800 for the Chrome Web Store's screenshots.)
// It builds a TEST build of the extension (local hosts allowed; never zipped), starts Edge with it
// (--load-extension, --remote-debugging-port) and drives it through the Chrome DevTools Protocol with
// Node's own WebSocket. Screenshots go to --shots (default: a temporary folder; printed at the end).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS, TITLE, start } from "./fake-netflix.mjs";

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
let edge, servers;
try {
  if (!EDGE) throw new Error("Microsoft Edge isn't installed where expected (set EDGE=path to msedge.exe).");
  if (!existsSync(join(root, "docs", "app", "index.html"))) throw new Error("Build the web app first: node webapp/build-web.mjs");
  execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", extDir, "--test-netflix", NETFLIX,
    "--test-subs", "127.0.0.1", "--test-webapp", WEBAPP], { stdio: "inherit" });
  servers = start({ video: arg("video") });
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

  // 13. The install page (docs/extension), in Spanish with the web app's translations.
  await evaluate(app, `location.assign("http://127.0.0.1:${PORTS.docs}/extension/?lang=es")`);
  const spanish = await until("the install page in Spanish", () => evaluate(app, `document.documentElement.lang === "es" && document.querySelector("h2")?.innerText`), 10000);
  check("the install page, in the user's language", !/^Add it/.test(spanish), spanish);
  const zip = await evaluate(app, `fetch("tamkeen-netflix.zip").then((r) => r.ok && r.headers.get("content-type"))`);
  check("the install page's download link", /zip/.test(zip || ""), zip);
  await shot(app, "11-install-page-es");
} catch (e) {
  check("the run finished", false, e.message);
} finally {
  try { if (cdp) await cdp.send("Browser.close"); } catch { /* closed */ }
  if (edge) { try { edge.kill(); } catch { /* gone */ } }
  if (servers) servers.close();
  await sleep(800);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* Edge still letting go of its profile */ }
}
const failed = results.filter((r) => !r.ok);
if (failed.length && logs.length) console.log(`\nErrors and warnings in the pages:\n${logs.slice(-30).join("\n")}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
