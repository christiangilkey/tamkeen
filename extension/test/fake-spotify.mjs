// Local stand-ins for Spotify's web player and for LRCLIB, for testing the Tamkeen extension's lyrics
// panel without Spotify, LRCLIB or any account (extension/test/e2e.mjs drives a real Edge against them).
//   http://spotify.localhost:8934   "Spotify": a page shaped like Spotify's web player as it was seen in
//                                   2026 (the app in #main; the bar at the bottom with
//                                   [data-testid="now-playing-bar"], context-item-info-title/-artist,
//                                   control-button-playpause, playback-position/-duration, the
//                                   progress bar's hidden slider in milliseconds and --progress-bar-transform,
//                                   all updated once a second; navigator.mediaSession's record; the sound
//                                   from a media element that is not in the page; its own lyrics view
//                                   with [data-testid="lyrics-line"] lines whose classes say sung / being
//                                   sung / to come, and a click on a line jumps there).
//   http://127.0.0.1:8935          "LRCLIB": /api/get and /api/search, like lrclib.net's.
// Every lyric here is written for this test; nothing comes from Spotify or LRCLIB.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { normalize } from "node:path";

export const SPOTIFY_PORTS = { spotify: 8934, lyrics: 8935 };
export const SPOTIFY_HOST = `http://spotify.localhost:${SPOTIFY_PORTS.spotify}`;
export const LYRICS_HOST = `http://127.0.0.1:${SPOTIFY_PORTS.lyrics}`;
const LENGTH = 60; // seconds, every song

const AR = ["أنا أحب البحر كثيراً", "الشمس جميلة في الصباح", "نمشي معاً في الشارع", "قلبي سعيد اليوم", "أين أنت يا صديقي",
  "الليل طويل والقمر بعيد", "سأكتب لك رسالة", "البيت قريب من النهر", "أسمع صوتك في المساء", "لا تنسَ أيامنا",
  "الحب يجمعنا دائماً", "غداً نلتقي من جديد", "شكراً على كل شيء", "إلى اللقاء يا حبيبي"];
const ES = ["Camino por la calle sin prisa", "El sol brilla sobre el mar", "Mi corazón canta contigo", "La noche llega despacio",
  "Te busco en cada esquina", "Las estrellas nos miran", "Mañana volveré a casa", "No tengo miedo de nada",
  "Bailamos hasta el amanecer", "Tu voz es mi canción", "El viento lleva tu nombre", "Siempre te recordaré",
  "Gracias por todo, amor", "Hasta luego, mi amiga"];
const ES_PAGE = ["Las flores del jardín despiertan", "Corre el agua por el río", "Mi madre canta en la cocina", "El perro duerme en la puerta",
  "Los niños juegan en la plaza", "La luna sale por la tarde", "Escribo una carta larga", "El tren pasa por el pueblo",
  "Abro la ventana al mundo", "Todo empieza otra vez"];
const ES_PLAIN = ["Una canción sin tiempo", "Palabras que no corren", "Se leen como un libro", "Y nada más"];

const lrc = (lines, from = 2, every = 4) => lines.map((l, i) => {
  const t = from + i * every;
  return `[${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}.00] ${l}`;
}).join("\n");

// The songs on the stand-in Spotify, and what the stand-in LRCLIB has for them.
export const SONGS = [
  { title: "أغنية التجربة", artist: "مغني التجربة", album: "ألبوم", id: "4uLU6hMCjMI75M1A2tKUQC", lrclib: { id: 101, synced: lrc(AR), plain: AR.join("\n") } },
  { title: "Canción de Prueba", artist: "Cantante Uno, Otra Voz", album: "Disco", id: "7qiZfU4dY1lWllzX7mPBI3", lrclib: { id: 102, synced: lrc(ES), plain: ES.join("\n") } },
  { title: "Solo en Spotify", artist: "Cantante Tres", album: "Otro", id: "1301WleyT98MSxVHPZCA6M", lrclib: null, page: ES_PAGE },
  { title: "Canción Lenta", artist: "Cantante Dos", album: "Lento", id: "3n3Ppam7vgaVa1iaRUc9Lp", lrclib: { id: 104, synced: null, plain: ES_PLAIN.join("\n") } },
];
export const PAGE_EVERY = 5; // (Spotify's own lyrics of song 3: a line every 5 s from 1 s)

/** A silent WAV: what the stand-in plays (8 kHz, 8-bit, mono). */
function silence(seconds) {
  const n = 8000 * seconds;
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  return b;
}
const WAV = silence(LENGTH);

function page() {
  const songs = SONGS.map((s, k) => `<div class="row"><button type="button" data-testid="play-song" data-song="${k}">Play</button> <span>${s.title}</span> · <span>${s.artist}</span></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Spotify – Web Player</title>
<style>
html, body { margin: 0; height: 100%; background: #000; color: #fff; font: 15px system-ui; }
body { display: flex; }
#main { width: 100%; height: 100%; position: relative; }
.Root { height: 100%; display: grid; grid-template-rows: 64px 1fr 72px; }
[data-testid="global-nav-bar"] { display: flex; align-items: center; padding: 0 16px; background: #000; }
.mainview { overflow: auto; background: #121212; margin: 0 8px; border-radius: 8px; padding: 16px; }
.row { padding: 6px 0; }
[data-testid="now-playing-bar"] { display: flex; align-items: center; gap: 16px; padding: 0 16px; background: #000; }
[data-testid="progress-bar"] { width: 300px; height: 4px; background: #4d4d4d; position: relative; cursor: pointer; }
[data-testid="progress-bar"]::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: var(--progress-bar-transform, 0%); background: #fff; }
.hidden-visually { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.lyr { font-size: 28px; font-weight: 700; }
.l-past { color: #fff9; } .l-active { color: #fff; } .l-future { color: #0008; }
</style></head><body>
<div id="main"><div class="Root">
  <div data-testid="global-nav-bar"><input data-testid="search-input" placeholder="What do you want to play?"></div>
  <div class="mainview" id="view">
    <h1>Songs</h1>${songs}
    <div id="lyrics-view" hidden><div class="lyr" style="--lyrics-color-active: #fff; --lyrics-color-passed: #fff9"></div></div>
  </div>
  <aside data-testid="now-playing-bar">
    <div data-testid="now-playing-widget" aria-label="">
      <div data-testid="context-item-info-title"><a href="#"></a></div>
      <div><span data-testid="context-item-info-artist"></span></div>
    </div>
    <div data-testid="player-controls">
      <button type="button" data-testid="control-button-playpause" aria-label="Play">Play</button>
      <div data-testid="playback-position">-:--</div>
      <div data-testid="playback-progressbar"><label class="hidden-visually">Change progress<input type="range" min="0" max="0" step="5000" value="0" aria-valuetext="-:--/-:--" disabled></label>
        <div data-testid="progress-bar" style="--progress-bar-transform: 0%"></div></div>
      <div data-testid="playback-duration">-:--</div>
    </div>
    <button type="button" data-testid="lyrics-button">Lyrics</button>
  </aside>
</div></div>
<script>
(() => {
  const SONGS = ${JSON.stringify(SONGS.map((s) => ({ title: s.title, artist: s.artist, album: s.album, id: s.id, page: s.page || null })))};
  const LENGTH = ${LENGTH}, EVERY = ${PAGE_EVERY};
  const $ = (s) => document.querySelector(s);
  const log = (window.__spLog = []);
  // The sound: a media element that is not in the page (as Spotify's is often not).
  const audio = new Audio();
  audio.preload = "auto";
  let song = -1;
  const clock = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function load(k) {
    song = k;
    const s = SONGS[k];
    audio.src = "/audio/song-" + k + ".wav";
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, album: s.album });
    $('[data-testid="context-item-info-title"] a').textContent = s.title;
    $('[data-testid="context-item-info-title"] a').setAttribute("href", "/album/5C0YLr4OoRGFDaqWMn3Kv4?highlight=spotify:track:" + s.id);
    $('[data-testid="context-item-info-artist"]').textContent = s.artist;
    $('[data-testid="now-playing-widget"]').setAttribute("aria-label", "Now playing: " + s.title + " by " + s.artist);
    drawLyrics();
    return audio.play().then(() => log.push("play " + k));
  }
  document.querySelectorAll('[data-testid="play-song"]').forEach((b) => b.addEventListener("click", () => load(Number(b.dataset.song))));
  $('[data-testid="control-button-playpause"]').addEventListener("click", () => {
    if (song < 0) return;
    if (audio.paused) { audio.play(); log.push("play"); } else { audio.pause(); log.push("pause"); }
  });
  // The progress bar's slider (milliseconds), as Spotify's: moving it seeks.
  const input = $('[data-testid="playback-progressbar"] input');
  const onSlide = () => { const v = Number(input.value); if (v >= 0 && song >= 0) { audio.currentTime = v / 1000; log.push("seek " + v); paint(); } };
  input.addEventListener("change", onSlide);
  // Spotify's own lyrics view (only song 3 has lyrics there): the line being sung marked by its class.
  $('[data-testid="lyrics-button"]').addEventListener("click", () => { $("#lyrics-view").hidden = !$("#lyrics-view").hidden; drawLyrics(); });
  function drawLyrics() {
    const box = $("#lyrics-view .lyr");
    box.textContent = "";
    const s = SONGS[song];
    if ($("#lyrics-view").hidden || !s || !s.page) return;
    s.page.forEach((text, i) => {
      const line = document.createElement("div");
      line.setAttribute("data-testid", "lyrics-line");
      line.className = "l-base l-future";
      const inner = document.createElement("div");
      inner.className = "l-text";
      inner.textContent = text;
      line.append(inner);
      line.addEventListener("click", () => { audio.currentTime = 1 + i * EVERY; log.push("line " + i); paint(); });
      box.append(line);
    });
  }
  function markLyrics() {
    const els = document.querySelectorAll('[data-testid="lyrics-line"]');
    const t = audio.currentTime;
    const at = Math.floor((t - 1) / EVERY);
    els.forEach((el, i) => { el.className = "l-base " + (t < 1 ? "l-future" : i < at ? "l-past" : i === at ? "l-active" : "l-future"); });
  }
  // The bar moves once a second, as Spotify's does.
  function paint() {
    if (song < 0) return;
    const t = audio.currentTime, d = isFinite(audio.duration) ? audio.duration : LENGTH;
    $('[data-testid="playback-position"]').textContent = clock(t);
    $('[data-testid="playback-duration"]').textContent = clock(d);
    input.disabled = false;
    input.max = String(Math.round(d * 1000));
    input.value = String(Math.round(t * 1000));
    input.setAttribute("aria-valuetext", clock(t) + "/" + clock(d));
    $('[data-testid="progress-bar"]').style.setProperty("--progress-bar-transform", (t / d * 100).toFixed(3) + "%");
    $('[data-testid="control-button-playpause"]').setAttribute("aria-label", audio.paused ? "Play" : "Pause");
    navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
  }
  setInterval(paint, 1000);
  setInterval(markLyrics, 250);
  window.__sp = { audio, load, time: () => audio.currentTime, paused: () => audio.paused, song: () => song };
})();
</script></body></html>`;
}

// ---------- the stand-in LRCLIB ----------
const norm = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
function record(s) {
  return { id: s.lrclib.id, name: s.title, trackName: s.title, artistName: s.artist.split(",")[0], albumName: s.album, duration: LENGTH,
    instrumental: false, hasWordSync: false, plainLyrics: s.lrclib.plain, syncedLyrics: s.lrclib.synced, lyricsfile: "version: '1.0'" };
}

export function startSpotify() {
  const servers = [];
  const requests = [];
  servers.push(createServer((req, res) => {
    const u = new URL(req.url, SPOTIFY_HOST);
    const m = /^\/audio\/song-(\d)\.wav$/.exec(u.pathname);
    if (m) {
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1;
        res.writeHead(206, { "Content-Type": "audio/wav", "Content-Range": `bytes ${start}-${end}/${WAV.length}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
        res.end(WAV.subarray(start, end + 1));
      } else {
        res.writeHead(200, { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Content-Length": WAV.length });
        res.end(WAV);
      }
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(page());
  }).listen(SPOTIFY_PORTS.spotify, "127.0.0.1"));
  servers.push(createServer((req, res) => {
    const u = new URL(req.url, LYRICS_HOST);
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(body)); };
    if (u.pathname === "/__log") return json(200, requests);
    requests.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), client: req.headers["lrclib-client"] || "" });
    const have = SONGS.filter((s) => s.lrclib);
    if (u.pathname === "/api/get") {
      const s = have.find((x) => norm(x.title) === norm(u.searchParams.get("track_name"))
        && norm(u.searchParams.get("artist_name")).includes(norm(x.artist.split(",")[0]))
        && (!u.searchParams.get("duration") || Math.abs(Number(u.searchParams.get("duration")) - LENGTH) <= 2));
      return s ? json(200, record(s)) : json(404, { message: "Failed to find specified track", name: "TrackNotFound", statusCode: 404 });
    }
    if (u.pathname === "/api/search") {
      const q = norm(u.searchParams.get("q")), track = norm(u.searchParams.get("track_name"));
      const found = have.filter((s) => (track && norm(s.title).includes(track)) || (q && q.includes(norm(s.title))));
      return json(200, found.map(record));
    }
    json(404, { message: "not here" });
  }).listen(SPOTIFY_PORTS.lyrics, "127.0.0.1"));
  return { close: () => servers.forEach((s) => s.close()) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  startSpotify();
  console.log(`Fake Spotify on ${SPOTIFY_HOST}, fake LRCLIB on ${LYRICS_HOST}`);
}
