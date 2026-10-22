// A local stand-in for Netflix, for testing the extension "Tamkeen for Netflix" without Netflix or
// any account (extension/test/e2e.mjs drives a real Edge against it). Three small servers:
//   http://localhost:8931   "Netflix": a browse page with a language menu, title cards, and a watch
//                           page whose player API imitates Netflix's (netflix.appContext.state.playerApp
//                           .getAPI().videoPlayer, times in ms) around a plain <video>; Netflix-like
//                           controls and subtitles that the extension must hide; the metadata address.
//   http://127.0.0.1:8932   the "video servers": subtitle files (TTML, text/xml, at "/") — the full
//                           Arabic file, Netflix's few "forced" lines, and an English file.
//   http://127.0.0.1:8933   the web app (the repository's docs/ folder, as GitHub Pages serves it).
// The subtitle lines are written for this test; nothing comes from Netflix.
//   node extension/test/fake-netflix.mjs [--video path/to/sample.webm]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
export const PORTS = { netflix: 8931, subs: 8932, docs: 8933 };
export const TITLE = "80001001";

const LINES = [
  "مرحباً، كيف حالك اليوم؟", "أنا بخير، شكراً. وأنت؟", "الجو جميل جداً هذا الصباح.", "هل تريد أن نشرب القهوة معاً؟",
  "نعم، أحب القهوة كثيراً.", "المقهى قريب من البيت.", "سأتصل بأخي أيضاً.", "هو يعمل في المدينة.",
  "متى ينتهي عمله؟", "في الساعة الخامسة مساءً.", "إذن نلتقي بعد العمل.", "فكرة ممتازة!",
  "لا تنسَ الكتاب الجديد.", "سأحضره معي، لا تقلق.", "إلى اللقاء إذن.", "مع السلامة يا صديقي.",
  "انتظر، نسيت المفتاح.", "المفتاح على الطاولة.", "شكراً جزيلاً.", "عفواً، إلى اللقاء.",
];
const TICKS = 10_000_000;
function ttml(lang, cues) {
  const ps = cues.map(([b, e, text], i) => `<p begin="${Math.round(b * TICKS)}t" end="${Math.round(e * TICKS)}t" region="region0" xml:id="subtitle${i + 1}">${text}</p>`);
  return `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns:tt="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:tickRate="10000000" ttp:timeBase="media" xmlns="http://www.w3.org/ns/ttml" xml:lang="${lang}">
<head><styling><style tts:fontStyle="italic" xml:id="s2"/></styling><layout><region xml:id="region0"/></layout></head>
<body><div xml:space="preserve">
${ps.join("\n")}
</div></body></tt>
`;
}
const FULL = ttml("ar-LB", LINES.map((t, i) => [1 + i * 4, 4.6 + i * 4, i === 4 ? `- ${t}<br/>- <span style="s2">نعم</span>` : t]));
const FORCED = ttml("ar-LB", [[10, 12, "مقهى البحر"], [40, 42, "شارع النخيل"]]);
const ENGLISH = ttml("en", LINES.map((_, i) => [1 + i * 4, 4.6 + i * 4, `English line ${i + 1}`]));

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;background:#141414;color:#fff;font:16px system-ui}a{color:#fff}.row{display:flex;gap:12px;padding:20px}
.title-card{width:200px;height:112px;background:#333;display:flex;align-items:end;padding:8px;box-sizing:border-box}
nav{padding:20px;border-bottom:1px solid #333} .menu a{margin-right:10px}</style></head><body>${body}</body></html>`;

function browse(lang) {
  return page("Netflix", `<nav><h1>Browse by Languages</h1>
  <div class="nfDropDown"><div class="label" aria-haspopup="true">Original Language</div>
  <div class="menu"><a href="/browse/original-audio/en">English</a><a href="/browse/original-audio/ar">Arabic</a><a href="/browse/original-audio/es">Spanish</a></div></div>
  <p id="shown">Showing: ${lang || "(choose a language)"}</p></nav>
  <div class="row">${lang === "ar" ? `<a class="title-card" aria-label="حكايات الحي" href="/watch/${TITLE}?tctx=0">حكايات الحي</a>
  <a class="title-card" aria-label="بيت الجدة" href="/watch/80002002">بيت الجدة</a>` : ""}</div>`);
}

function watch(id, video) {
  return page("Netflix", `<div class="watch-video" style="position:fixed;inset:0;background:#000">
  <div data-uia="video-canvas" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
    <video id="v" muted playsinline ${video ? `src="/media/sample.webm"` : ""} style="width:100%;height:100%;object-fit:contain"></video>
  </div>
  <div class="player-timedtext" style="position:absolute;bottom:12%;left:0;right:0;text-align:center;font-size:28px">NETFLIX'S OWN SUBTITLE (must be hidden)</div>
  <div class="watch-video--bottom-controls-container" style="position:absolute;left:0;right:0;bottom:0;height:70px;background:#e50914">NETFLIX CONTROLS (hidden while a title plays)</div>
  <div data-uia="video-title" style="position:absolute;top:10px;left:10px"><h4>حكايات الحي</h4><span>E1</span><span>الصباح</span></div>
</div>
<script>
(() => {
  const video = document.getElementById("v");
  const clicks = (window.__clicks = []);
  document.querySelector("[data-uia=video-canvas]").addEventListener("click", (e) => clicks.push([e.clientX, e.clientY]));
  // Without a video file the "picture" is a clock kept here (the test can still see where it is).
  let clock = 0, running = false, last = performance.now(), rate = 1;
  const t = () => { if (running) { const n = performance.now(); clock += (n - last) / 1000 * rate; last = n; } return clock; };
  const real = ${video ? "true" : "false"};
  const tracks = [
    { trackId: "T0", bcp47: "ar-LB", displayName: "Off", trackType: "PRIMARY", isNoneTrack: false, isForcedNarrative: false, isImageBased: false },
    { trackId: "T1", bcp47: "ar-LB", displayName: "Arabic (Lebanon)", trackType: "PRIMARY", isNoneTrack: false, isForcedNarrative: false, isImageBased: false },
    { trackId: "T2", bcp47: "en", displayName: "English", trackType: "PRIMARY", isNoneTrack: false, isForcedNarrative: false, isImageBased: false },
  ].filter((x) => ${id === TITLE ? "true" : "x.bcp47 === 'en'"}); // (the other title has no Arabic subtitles)
  let current = tracks[2];
  const audio = [{ bcp47: "ar-LB", displayName: "Arabic (Lebanon) [Original]", isNative: true }];
  const log = (window.__playerLog = []);
  const SUBS = "http://127.0.0.1:${PORTS.subs}/";
  async function download(track) { // as Netflix's player does: the chosen track, plus other files
    await fetch(SUBS + "?o=forced&v=5&e=1").catch(() => {});
    await fetch(SUBS + "?o=english&v=5&e=1").catch(() => {});
    if (track.bcp47.startsWith("ar")) await fetch(SUBS + "?o=full&v=5&e=1").catch(() => {});
  }
  const player = {
    getCurrentTime: () => (real ? video.currentTime : t()) * 1000,
    getDuration: () => (real && isFinite(video.duration) ? video.duration : 90) * 1000,
    seek: (ms) => { log.push("seek " + ms); if (real) video.currentTime = ms / 1000; else { t(); clock = ms / 1000; } },
    play: () => { log.push("play"); if (real) return video.play(); t(); running = true; last = performance.now(); },
    pause: () => { log.push("pause"); if (real) video.pause(); else { t(); running = false; } },
    isPaused: () => (real ? video.paused : !running),
    getPlaybackRate: () => (real ? video.playbackRate : rate),
    setPlaybackRate: (r) => { log.push("rate " + r); if (real) video.playbackRate = r; else { t(); rate = r; } },
    getTextTrackList: () => tracks, getTextTrack: () => current,
    setTextTrack: (track) => { log.push("text " + track.trackId); current = track; return download(track); },
    getAudioTrackList: () => audio, getAudioTrack: () => audio[0], setAudioTrack: (x) => log.push("audio " + x.displayName),
  };
  window.netflix = { appContext: { state: { playerApp: {
    getAPI: () => ({ videoPlayer: { getAllPlayerSessionIds: () => ["watch-${id}"], getVideoPlayerBySessionId: () => player } }),
    getState: () => ({ videoPlayer: { videoMetadata: {} } }),
  } } } };
  window.__player = player;
})();
</script>`);
}

const METADATA = { video: { type: "show", title: "حكايات الحي", currentEpisode: Number(TITLE), boxart: [{ url: "https://example.invalid/box.jpg" }],
  seasons: [{ seq: 1, episodes: [{ id: Number(TITLE), seq: 1, title: "الصباح", runtime: 90 }] }] } };

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".zip": "application/zip", ".webm": "video/webm", ".txt": "text/plain; charset=utf-8" };

function sendFile(req, res, file) {
  const size = statSync(file).size;
  const type = TYPES[extname(file)] || "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    res.end(readFileSync(file).subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size, "Cache-Control": "no-store" });
  res.end(readFileSync(file));
}

export function start({ video = "" } = {}) {
  const servers = [];
  const hasVideo = !!(video && existsSync(video));
  servers.push(createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORTS.netflix}`);
    const html = (body) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(body); };
    if (u.pathname === "/" || u.pathname === "/browse") { res.writeHead(302, { Location: "/browse/original-audio" }); res.end(); return; }
    let m = /^\/browse\/original-audio(?:\/(\w+))?$/.exec(u.pathname);
    if (m) return html(browse(m[1] || ""));
    m = /^\/watch\/(\d+)$/.exec(u.pathname);
    if (m) return html(watch(m[1], hasVideo));
    if (u.pathname === "/media/sample.webm" && hasVideo) return sendFile(req, res, video);
    if (u.pathname === "/nq/website/memberapi/release/metadata") {
      res.writeHead(u.searchParams.get("movieid") === TITLE ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(u.searchParams.get("movieid") === TITLE ? METADATA : {}));
      return;
    }
    res.writeHead(404); res.end("not here");
  }).listen(PORTS.netflix, "127.0.0.1"));
  servers.push(createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PORTS.subs}`);
    const body = { full: FULL, forced: FORCED, english: ENGLISH }[u.searchParams.get("o")];
    res.writeHead(body ? 200 : 404, { "Content-Type": "text/xml; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(body || "");
  }).listen(PORTS.subs, "127.0.0.1"));
  servers.push(createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${PORTS.docs}`);
    let file = normalize(join(root, "docs", decodeURIComponent(u.pathname)));
    if (!file.startsWith(join(root, "docs"))) { res.writeHead(403); res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404); res.end("not here"); return; }
    sendFile(req, res, file);
  }).listen(PORTS.docs, "127.0.0.1"));
  return { close: () => servers.forEach((s) => s.close()) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const i = process.argv.indexOf("--video");
  start({ video: i > 0 ? process.argv[i + 1] : "" });
  console.log(`Fake Netflix on http://localhost:${PORTS.netflix}, subtitles on :${PORTS.subs}, the web app on http://127.0.0.1:${PORTS.docs}/app/`);
}
