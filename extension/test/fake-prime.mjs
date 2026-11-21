// A local stand-in for Prime Video's web player, for testing the extension's Prime Video part (the light way)
// without Amazon, any account or any sign-in (extension/test/prime-e2e.mjs drives a real Edge against it).
//   http://localhost:8941   "Prime Video": a title page (/detail/<id>/) with a Play button that opens the
//                           player: the saved sample markup of Prime Video's player
//                           (tests/js/fixtures/primevideo/player.html) around a <video>, its subtitle line
//                           changing with the video's time, as Prime Video's own does. The lines are written
//                           for this test; nothing comes from Amazon.
//   http://127.0.0.1:8943   the web app (the repository's docs/ folder, as GitHub Pages serves it).
// The page keeps a log of anything done to its <video> (window.__videoLog: play, pause, seeking, rate) so the
// test can check that Tamkeen never controls Amazon's player.
//   node extension/test/fake-prime.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
export const PORTS = { prime: 8941, docs: 8943 };
export const TITLE = "0HU0AV5V1B0A8LMDYOOBX4FKYJ";
export const LINES = ["مرحبا يا صديقي، كيف حالك اليوم؟", "أنا بخير، شكرا. وأنت؟", "الجو جميل جدا هذا الصباح.", "هل تريد أن نشرب القهوة معا؟",
  "نعم، أحب القهوة كثيرا.", "المقهى قريب من البيت.", "[موسيقى]", "سأتصل بأخي أيضا."];
const STEP = 2.5; // seconds a line shows

const SAMPLE = readFileSync(join(root, "tests", "js", "fixtures", "primevideo", "player.html"), "utf8")
  .replace(/<!--[\s\S]*?-->/, "")
  .replace(/<span class="atvwebplayersdk-captions-text[^>]*>[^<]*<\/span>/g, "") // (the lines come from the script below)
  .replace(/<div class="f35bt6a"><\/div>\s*/g, "")
  .replace(`<video class="tk-sample-video" playsinline></video>`, `<video class="tk-sample-video" playsinline muted loop src="/sample.webm"></video>`);

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Prime Video: بيت الأحلام</title>
<style>body{margin:0;background:#00050d;color:#fff;font:16px system-ui}
.hero{padding:40px}.play{font-size:20px;padding:12px 28px;border-radius:8px;border:0;background:#fff;color:#000;cursor:pointer}
#dv-web-player{position:fixed;inset:0;background:#000;z-index:10}.webPlayerSDKContainer,.webPlayerSDKUiContainer,.rendererContainer{position:absolute;inset:0}
video{width:100%;height:100%;object-fit:contain;background:#111}
.atvwebplayersdk-overlays-container{position:absolute;inset:0;pointer-events:none}
.atvwebplayersdk-hideabletopbuttons-container{position:absolute;top:16px;left:24px;right:24px;display:flex;flex-direction:column;align-items:center}
.atvwebplayersdk-title-text{font-size:22px;font-weight:700}.atvwebplayersdk-subtitle-text{font-size:15px;color:#ccc}
.top-right{position:absolute;top:14px;right:20px;display:flex;gap:10px;pointer-events:auto}.top-right button{background:#333;color:#fff;border:0;border-radius:6px;padding:8px 12px}
.atvwebplayersdk-captions-overlay{position:absolute;left:0;right:0;bottom:12%;text-align:center}
.atvwebplayersdk-captions-text{display:inline-block;background:rgba(0,0,0,.75);padding:4px 10px;font-size:30px;line-height:1.4}</style></head>
<body>${body}</body></html>`;

function detail() {
  return page(`<div class="hero"><h1>بيت الأحلام</h1><p>Season 1 · Episode 3 · العودة</p>
<button class="play" id="play" type="button">Play</button></div>
<script>
  window.__videoLog = [];
  const SAMPLE = ${JSON.stringify(SAMPLE)};
  const LINES = ${JSON.stringify(LINES)};
  let timer = 0;
  window.__open = () => {
    if (document.querySelector("#dv-web-player")) return;
    const box = document.createElement("div");
    box.innerHTML = SAMPLE;
    document.body.append(box.firstElementChild);
    const top = document.createElement("div");
    top.className = "top-right";
    top.innerHTML = '<button type="button" id="subs">Subtitles</button><button type="button" id="close">Close</button>';
    document.querySelector(".atvwebplayersdk-overlays-container").append(top);
    document.querySelector("#close").onclick = () => window.__close();
    const v = document.querySelector("video");
    for (const ev of ["play", "pause", "seeking", "ratechange"]) v.addEventListener(ev, () => __videoLog.push(ev + "@" + v.currentTime.toFixed(1)));
    v.play().catch(() => {});
    __videoLog.length = 0; // (only what happens after it started counts)
    const overlay = document.querySelector(".atvwebplayersdk-captions-overlay");
    // The subtitle line, as Prime Video draws it: one box per line of text, changed as the video plays.
    window.__shown = -1;
    window.__subsOn = true;
    const draw = () => {
      const t = window.__clock !== undefined ? window.__clock : v.currentTime;
      const i = Math.floor(t / ${STEP}) % LINES.length;
      const on = window.__subsOn && (t % ${STEP}) < ${STEP - 0.4}; // (a moment with no line between two)
      const want = on ? i : -1;
      if (want === window.__shown) return;
      window.__shown = want;
      overlay.textContent = "";
      if (want < 0) return;
      const row = document.createElement("div");
      row.className = "f35bt6a";
      const span = document.createElement("span");
      span.className = "atvwebplayersdk-captions-text fg8afi5";
      span.textContent = LINES[want];
      row.append(span);
      overlay.append(row);
    };
    timer = setInterval(draw, 100);
  };
  window.__close = () => { clearInterval(timer); document.querySelector("#dv-web-player")?.remove(); };
  document.querySelector("#play").onclick = () => window.__open();
</script>`);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".woff2": "font/woff2", ".zip": "application/zip", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".gz": "application/gzip" };

function serveFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}

export function start() {
  const prime = createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/sample.webm") return serveFile(res, join(root, "tests", "fixtures", "chromium-recording.webm"));
    if (/^\/detail\/[A-Za-z0-9]+\/?$/.test(u.pathname) || u.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(detail());
      return;
    }
    res.writeHead(404); res.end("not found");
  }).listen(PORTS.prime);
  const docs = createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    let rel = normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, "");
    if (rel.includes("..")) { res.writeHead(400); res.end(); return; }
    let file = join(root, "docs", rel);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    serveFile(res, file);
  }).listen(PORTS.docs, "127.0.0.1");
  return { close() { prime.close(); docs.close(); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start();
  console.log(`Fake Prime Video at http://localhost:${PORTS.prime}/detail/${TITLE}/ ; web app at http://127.0.0.1:${PORTS.docs}/app/`);
}
