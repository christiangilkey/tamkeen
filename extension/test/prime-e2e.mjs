// End-to-end check of the extension's Prime Video part (the light way) in a real Microsoft Edge, against the
// local stand-in for Prime Video's player (fake-prime.mjs, built on the saved sample markup of the player) and
// the web app built into docs/ (node webapp/build-web.mjs first). No Amazon, no account, no sign-in: a fresh,
// empty browser profile in a temporary folder.
//   node extension/test/prime-e2e.mjs [--shots DIR] [--headed]
// It checks what the light way promises: the panel shows the line on screen as words you can tap and the lines
// watched; a word's meaning and Save; the word reaches the web app's Vocab with where it came from; and Tamkeen
// never touches Amazon's player (no play, pause, seek or speed change; the page's own elements unchanged) and
// downloads nothing from it. Also the web app's prototype "Get the Tamkeen extension" box.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LINES, PORTS, TITLE, start } from "./fake-prime.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : ""; };
const EDGE = process.env.EDGE || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const shots = arg("shots") || mkdtempSync(join(tmpdir(), "tamkeen-prime-shots-"));
mkdirSync(shots, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "tamkeen-prime-e2e-"));
const extDir = join(work, "extension");
const profile = join(work, "profile");
const PORT = 9335;
const PRIME = `http://localhost:${PORTS.prime}`;
const WEBAPP = `http://127.0.0.1:${PORTS.docs}/app/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---------- a small DevTools Protocol client (as in e2e.mjs) ----------
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
const centre = (session, selector) => evaluate(session, `(() => { const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null; el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);

// ---------- run ----------
let edge, servers;
try {
  if (!EDGE) throw new Error("Microsoft Edge isn't installed where expected (set EDGE=path to msedge.exe).");
  if (!existsSync(join(root, "docs", "app", "index.html"))) throw new Error("Build the web app first: node webapp/build-web.mjs");
  execFileSync(process.execPath, [join(root, "extension/scripts/build.mjs"), "--out", extDir, "--test-prime", PRIME,
    "--test-webapp", WEBAPP], { stdio: "inherit" });
  servers = start();
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
  cdp.listeners.add((m) => {
    if (m.method === "Runtime.exceptionThrown") logs.push(`[${m.sessionId?.slice(0, 6)}] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    else if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
      logs.push(`[${m.sessionId?.slice(0, 6)}] ${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
  });

  // 1. The extension (its new name), and the web app it opens once.
  let swSession = null;
  const sw = await until("the extension's background part", async () => {
    for (const t of (await targets()).filter((x) => x.type === "service_worker" && /background\.js$/.test(x.url))) {
      const s = await attach(t.targetId);
      const name = await evaluate(s, `chrome.runtime.getManifest().name`).catch(() => "");
      if (/^Tamkeen for Netflix/.test(name)) { swSession = s; return { ...t, name }; }
      await cdp.send("Target.detachFromTarget", { sessionId: s }).catch(() => {});
    }
    return null;
  }, 15000);
  const extId = new URL(sw.url).host;
  check("the extension is loaded, named for both", /^Tamkeen for Netflix & Prime Video/.test(sw.name), sw.name);
  const appTarget = await until("the web app tab the extension opens", async () => (await targets()).find((t) => t.type === "page" && t.url.startsWith(WEBAPP)), 15000);
  const app = await attach(appTarget.targetId);
  await cdp.send("Page.enable", {}, app);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false }, app);
  await until("the web app", () => evaluate(app, `!!document.querySelector("#view") && document.readyState === "complete"`));
  await evaluate(app, `new Promise((resolve, reject) => { const r = indexedDB.open("aps", 1);
    r.onupgradeneeded = () => { for (const n of ["kv", "transcripts", "audio"]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => { const tx = r.result.transaction("kv", "readwrite"); const s = tx.objectStore("kv");
      const g = s.get("settings"); g.onsuccess = () => { s.put({ ...(g.result || {}), welcome_seen: true, onboarded: true, study_language: "ar",
        learning_languages: ["ar"], ui_language: "en", definer_mode: "dictionary_first", lexicon_declined: ["ar"] }, "settings"); };
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); }; r.onerror = () => reject(r.error); })`);
  await evaluate(app, `localStorage.setItem("tamkeenPrototype", "1")`); // (prototype mode: the owner's devices)
  await cdp.send("Page.reload", {}, app);
  const mark = await until("the page marked by the extension", () => evaluate(app, `document.documentElement.dataset.tamkeenExtension || ""`));
  await until("the settings handed to the extension", async () => {
    const s = await evaluate(swSession, `chrome.storage.local.get(["settings"])`);
    return s.settings && s.settings.study_language === "ar";
  });
  check("the web app hands the extension its settings", true, `version ${mark}`);

  // 2. The web app's prototype box: the Library's Netflix tab and the + sheet, with the extension and without.
  async function netflixSheet(name) {
    // (the + sheet opened as the Library's + button opens it: in prototype mode the Library looks different)
    await evaluate(app, `location.hash = "#/library"`);
    await sleep(800);
    await evaluate(app, `document.querySelectorAll(".tour, .modal-back").forEach((x) => x.remove());
      import("/app/js/components/addsheet.js").then((m) => { m.openAddSheet({ pickFile() {}, addAudiobookFiles() {} }); return true; })`);
    await until("the Netflix way", () => centre(app, 'button.add-way[data-way="netflix"]'));
    const label = await evaluate(app, `document.querySelector('button.add-way[data-way="netflix"] strong').innerText`);
    await evaluate(app, `document.querySelector('button.add-way[data-way="netflix"]').click()`);
    await sleep(900);
    const text = await evaluate(app, `document.querySelector(".modal, [role=dialog], .sheet")?.innerText || document.body.innerText`);
    await shot(app, name);
    await evaluate(app, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.querySelectorAll(".modal-back").forEach((x) => x.remove())`);
    return { label, text };
  }
  try {
    const withExt = await netflixSheet("1-webapp-netflix-and-prime-with-extension");
    check("the + sheet's way is called Netflix & Prime Video (prototype)", withExt.label === "Netflix & Prime Video", withExt.label);
    check("with the extension: it says so, with Open Prime Video", /extension is in this browser/.test(withExt.text) && /Open Prime Video/.test(withExt.text),
      withExt.text.replace(/\s+/g, " ").slice(0, 200));
    await evaluate(app, `delete document.documentElement.dataset.tamkeenExtension`);
    const noExt = await netflixSheet("2-webapp-netflix-and-prime-without-extension");
    check("without it: Get the Tamkeen extension, and that it works with Prime Video", /Get the Tamkeen extension/.test(noExt.text) && /also works with Prime Video/.test(noExt.text),
      noExt.text.replace(/\s+/g, " ").slice(0, 200));
    // The Library's Netflix tab: its heading has the same box.
    await evaluate(app, `location.hash = "#/library"`);
    await sleep(800);
    await evaluate(app, `document.querySelectorAll(".tour, .modal-back").forEach((x) => x.remove());
      [...document.querySelectorAll("button, a")].find((b) => b.innerText.trim() === "Netflix")?.click()`);
    const head = await until("the Netflix tab's box (its heading, or its empty message)", () => evaluate(app, `document.querySelector("#lib-head .addon-box, .lib-main .addon-box")?.innerText || ""`), 8000);
    check("the Library's Netflix tab: Get the Tamkeen extension, and that it works with Prime Video", /Get the Tamkeen extension/.test(head) && /Prime Video/.test(head), head.replace(/\s+/g, " ").slice(0, 160));
    await evaluate(app, `window.scrollTo(0, 0)`);
    await shot(app, "2b-webapp-library-netflix-tab");
    await evaluate(app, `document.documentElement.dataset.tamkeenExtension = ${JSON.stringify(mark)}`);
  } catch (e) {
    check("the web app's Netflix & Prime Video step", false, e.message);
    await shot(app, "1-webapp-sheet-failed").catch(() => {});
  }

  // 3. Prime Video's title page: no player, no panel.
  const pvTarget = (await cdp.send("Target.createTarget", { url: `${PRIME}/detail/${TITLE}/` })).targetId;
  const pv = await attach(pvTarget);
  await cdp.send("Page.enable", {}, pv);
  await cdp.send("Network.enable", {}, pv);
  const requests = [];
  cdp.listeners.add((m) => { if (m.sessionId === pv && m.method === "Network.requestWillBeSent") requests.push(m.params.request.url); });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false }, pv);
  await until("the title page", () => evaluate(pv, `!!document.querySelector("#play")`));
  await sleep(1200);
  check("a page of titles: no panel", !(await evaluate(pv, `!!document.querySelector("tamkeen-prime")`)));

  // 4. Play: Prime Video's player opens; the panel comes beside it, and Amazon's page is left as it is.
  const htmlBefore = await evaluate(pv, `document.documentElement.className + "|" + document.documentElement.getAttribute("style")`);
  await evaluate(pv, `__open()`);
  await sleep(1500);
  console.log(`      (the sample video: ${JSON.stringify(await evaluate(pv, `(() => { const v = document.querySelector("video"); return { paused: v.paused, t: v.currentTime, ready: v.readyState }; })()`))})`);
  await until("Tamkeen's panel on the page", () => evaluate(pv, `!!document.querySelector("tamkeen-prime")`), 8000);
  const panelTarget = await until("the panel's page", async () => (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/prime.html`)), 15000);
  const panel = await attach(panelTarget.targetId);
  await until("the first line on screen in the panel", () => evaluate(panel, `document.querySelectorAll("#now .w").length`), 15000);
  const nowText = await evaluate(panel, `document.querySelector("#now").innerText`);
  const shownText = await evaluate(pv, `document.querySelector(".atvwebplayersdk-captions-text")?.innerText || ""`);
  check("the line Prime Video shows is in the panel, as words to tap", nowText.replace(/\s+/g, " ").trim() === shownText.replace(/\s+/g, " ").trim(), nowText);
  const name = await evaluate(panel, `document.querySelector(".nf-name").innerText + " | " + document.querySelector(".nf-sub").innerText`);
  check("the title's name, from the player's top bar", /بيت الأحلام/.test(name) && /Season 1, Ep\. 3/.test(name), name);
  await until("three lines watched", () => evaluate(panel, `document.querySelectorAll("#lines .ln").length >= 3`), 15000);
  const watched = await evaluate(panel, `[...document.querySelectorAll("#lines .ln .ln-x")].map((x) => x.innerText)`);
  check("the lines watched are listed, in order", watched[0] === LINES[0] && watched[1] === LINES[1], JSON.stringify(watched.slice(0, 3)));
  const frame = await evaluate(panel, `({ w: innerWidth, h: innerHeight })`);
  const pageSize = await evaluate(pv, `({ w: innerWidth, h: innerHeight })`);
  check("the panel sits at the right edge, clear of the player's top and bottom buttons", frame.w > 300 && frame.w < 420 && pageSize.h - frame.h === 188, `${JSON.stringify(frame)} in ${JSON.stringify(pageSize)}`);
  const htmlAfter = await evaluate(pv, `document.documentElement.className + "|" + document.documentElement.getAttribute("style")`);
  const videoStyle = await evaluate(pv, `document.querySelector("video").getAttribute("style")`);
  check("Amazon's page is left as it is (no classes, styles or hidden parts added)", htmlBefore === htmlAfter && !videoStyle, `${htmlBefore} -> ${htmlAfter}; video style ${videoStyle}`);
  await sleep(400);
  await shot(pv, "3-prime-player-with-panel");

  // 5. A word tapped in the watched lines: its meaning, in the panel. Amazon's player plays on (never paused by Tamkeen).
  await evaluate(panel, `localStorage.setItem("wordPause", "1")`); // (even with "pause on a tapped word" on: the light way never pauses Amazon's player)
  await evaluate(pv, `__videoLog.length = 0`);
  const off = { x: pageSize.w - frame.w, y: 76 };
  const word = await until("a word in the first watched line", () => centre(panel, '#lines .ln[data-s="0"] .w'));
  await click(pv, off.x + word.x, off.y + word.y);
  await until("the word popup in the panel", () => evaluate(panel, `!!document.querySelector("#side-pop .word-bubble:not([hidden])")`), 8000)
    .catch(async (e) => {
      const at = await evaluate(panel, `(() => { const el = document.elementFromPoint(${word.x}, ${word.y}); return el ? el.outerHTML.slice(0, 120) : null; })()`);
      const pop = await evaluate(panel, `document.querySelector("#side-pop").innerHTML.slice(0, 300)`);
      const top = await evaluate(pv, `(() => { const el = document.elementFromPoint(${off.x + word.x}, ${off.y + word.y}); return el ? el.tagName + "." + el.className : null; })()`);
      throw new Error(`${e.message}; in the panel at the point: ${at}; on the page: ${top}; popup box: ${pop}`);
    });
  const state = await until("a meaning, or the offer to download the dictionary", () => evaluate(panel,
    `document.querySelector("#side-pop .wb-meaning")?.innerText || (document.querySelector('#side-pop [data-act="getmeanings"]') ? "download" : "")`), 20000);
  if (state === "download") {
    const b = await centre(panel, '#side-pop [data-act="getmeanings"]');
    await click(pv, off.x + b.x, off.y + b.y);
  }
  const meaning = await until("the word's meaning", () => evaluate(panel, `document.querySelector("#side-pop .wb-meaning")?.innerText`), 120000, 1000);
  check("tapping a word shows its meaning", !!meaning, meaning);
  const playButtons = await evaluate(panel, `document.querySelectorAll('#side-pop [data-act="word"], #side-pop [data-act="sentence"], #side-pop [data-act="from"]').length`);
  check("the popup has no play buttons (nothing of Prime Video's sound is played or kept)", playButtons === 0, `${playButtons}`);
  await sleep(2600); // (a new line comes meanwhile: the popup stays open)
  check("the popup stays open while the video plays on", await evaluate(panel, `!!document.querySelector("#side-pop .word-bubble:not([hidden])")`));
  await shot(pv, "4-prime-word-popup");

  // 6. Save: the word waits in the extension, then reaches the web app's Vocab with where it came from.
  const save = await centre(panel, '#side-pop [data-act="save"]');
  await click(pv, off.x + save.x, off.y + save.y);
  const waiting = await until("the saved word waiting in the extension", async () => {
    const all = await evaluate(swSession, `chrome.storage.local.get(null)`);
    return Object.entries(all).find(([k]) => k.startsWith("w:"))?.[1] || null;
  }, 10000).catch(() => null);
  check("Save keeps the word in the extension, marked as from Prime Video", waiting && waiting.service === "prime" && waiting.prime_id === TITLE, JSON.stringify(waiting));
  const log = await evaluate(pv, `__videoLog.join(",")`);
  const video = await evaluate(pv, `(() => { const v = document.querySelector("video"); return { paused: v.paused, rate: v.playbackRate }; })()`);
  check("Tamkeen never controlled Amazon's player (no pause, play, seek or speed change)", !log && video.rate === 1, `log "${log}", ${JSON.stringify(video)}`);
  await cdp.send("Page.reload", {}, app);
  const vocab = await until("the word in the web app's Vocab", () => evaluate(app, `(async () => {
    const { handle } = await import("/app/js/backend.js");
    const v = await handle("/vocab", "GET");
    return v.length ? v.map((x) => ({ text: x.text, episode: x.episode_id, source: x.episode_title, sentence: x.sentence, language: x.language })) : null; })()`), 20000);
  check("the saved word is in the web app's Vocab, from Prime Video, with its sentence", vocab.length === 1 && !vocab[0].episode
    && /^Prime Video · بيت الأحلام · S1:E3 · العودة$/.test(vocab[0].source) && vocab[0].sentence && vocab[0].language === "ar", JSON.stringify(vocab[0]));
  const left = await until("the extension forgetting what the web app kept", async () => {
    const all = await evaluate(swSession, `chrome.storage.local.get(null)`);
    return !Object.keys(all).some((k) => k.startsWith("w:")) || null;
  }, 10000).catch(() => false);
  check("once kept, the extension forgets it", left !== false);
  await evaluate(app, `location.hash = "#/vocab"`);
  await sleep(1500);
  await evaluate(app, `document.querySelectorAll(".tour, .modal-back").forEach((x) => x.remove())`);
  await shot(app, "5-webapp-vocab-with-prime-word");

  // 7. Subtitles off in Prime Video's menu: the panel says how to turn them on (it never turns them on itself).
  await evaluate(pv, `__close()`);
  await until("the panel gone with the player", () => evaluate(pv, `!document.querySelector("tamkeen-prime")`), 5000);
  check("closing Prime Video's player takes the panel away", true);
  await evaluate(pv, `window.__subsOn = false; __open()`);
  const panel2Target = await until("the panel again", async () =>
    (await targets()).find((t) => t.url.startsWith(`chrome-extension://${extId}/prime.html`) && t.targetId !== panelTarget.targetId), 15000);
  const panel2 = await attach(panel2Target.targetId);
  const note = await until("the note to turn subtitles on", () => evaluate(panel2, `document.querySelector("#notes")?.innerText || ""`).then((s) => /Turn on Arabic subtitles/.test(s) && s), 10000);
  check("no subtitles on: it says to turn them on in Prime Video's menu", !!note, note);
  await sleep(300);
  await shot(pv, "6-prime-subtitles-off-note");

  // 8. The panel folds to a slim tab (the whole picture), and comes back.
  const fold = await centre(panel2, "#fold");
  const frame2 = await evaluate(panel2, `innerWidth`);
  await click(pv, pageSize.w - frame2 + fold.x, 76 + fold.y);
  const narrow = await until("the panel folded", () => evaluate(panel2, `innerWidth < 40 && innerWidth`), 4000).catch(() => 0);
  check("folded: only a slim tab is left", narrow > 0, `${narrow}px`);
  await shot(pv, "7-prime-panel-folded");
  const tab = await centre(panel2, "#tab");
  await click(pv, pageSize.w - narrow + tab.x, 76 + tab.y);
  check("the slim tab brings the panel back", await until("unfolded", () => evaluate(panel2, `innerWidth > 300`), 4000).catch(() => false));

  // 9. Nothing was downloaded from Prime Video by Tamkeen: the page's own requests are only its page and its video.
  const extra = requests.filter((u) => !/\/detail\/|\/sample\.webm|favicon/.test(u) && !u.startsWith("chrome-extension://") && !u.startsWith("data:"));
  check("Tamkeen fetched nothing from Prime Video (no subtitle or video files)", !extra.length, extra.slice(0, 5).join(" "));
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
