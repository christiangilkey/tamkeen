// Tamkeen web app: keep a copy of the app's own files so it opens offline. Build 0.75.0-mwxx8c2a
// (This file is the service worker's source: webapp/build-web.mjs copies it to docs/app/sw.js with the build's own
// name in the placeholder above, so each build is a new service worker. tests/js/websw.test.mjs runs it.)
const CACHE = "tamkeen-0.75.0-mwxx8c2a";
// The pictures (the game's art, the app's icons) and fonts: a copy is kept across builds, so a picture shows even
// when the network fails to bring it (the owner, desktop Chrome on learntamkeen.com, 2026-11-25: creatures, egg and
// element icons blank on the Creatures screen). Still asked of the network first, so new art shows at once.
const KEEP_ART = "tamkeen-keep-art";
const ART_WAIT_MS = 4000; // a picture the network hasn't brought by then comes from the kept copy, if there is one
const RETRY_GAP_MS = 500; // a request that failed outright is sent once more after this long (on a new connection)
const SCOPE = new URL("./", location).pathname;
const isArt = (url) => /^(game-art|icons|fonts)\//.test(url.pathname.slice(SCOPE.length));
self.addEventListener("install", () => self.skipWaiting());
// (a cache named "tamkeen-keep-…" isn't this build's files but kept across builds: the pictures above, and what the
// learner downloaded, the courses' audio packs, web/js/coursepacks.js)
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE && !key.startsWith("tamkeen-keep-")) await caches.delete(key);
  await self.clients.claim();
})()));
// A chat notification tapped (web/js/chatnotify.js via mobile/src/js/app.js): open that chat in the
// app's window, or a new one.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.hash) || "#/";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).pathname.startsWith(new URL("./", location).pathname));
    if (win) { await win.focus(); win.postMessage({ tamkeen: "open", hash }); return; }
    await self.clients.openWindow(new URL("./" + hash, location).href);
  })());
});
// The learner's own audio and video files in their Google Drive (mobile/src/js/app.js videoUrl): an <audio> can't
// send the Google sign-in, so "./_drive/<file id>" is fetched from Drive here with it, a piece at a time (the
// player's Range), as the phones' DriveMediaWebViewClient does. The sign-in comes from the page ("drive-token").
let driveToken = "";
async function askDriveToken(clientId, fresh) {
  const own = clientId ? await self.clients.get(clientId) : null;
  const wins = own ? [own] : await self.clients.matchAll({ type: "window" });
  for (const win of wins) {
    const token = await new Promise((resolve) => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => resolve(""), 10000);
      ch.port1.onmessage = (m) => { clearTimeout(timer); resolve((m.data && m.data.token) || ""); };
      win.postMessage({ tamkeen: "drive-token", fresh: !!fresh }, [ch.port2]);
    });
    if (token) return token;
  }
  return "";
}
async function fromDrive(e, id) {
  const range = e.request.headers.get("Range");
  const ask = (token) => fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media",
    { headers: Object.assign({ Authorization: "Bearer " + token }, range ? { Range: range } : {}) });
  if (!driveToken) driveToken = await askDriveToken(e.clientId, false);
  if (!driveToken) return new Response("Not signed in to Google.", { status: 401 });
  let res = await ask(driveToken);
  if (res.status === 401) { // its hour is up: the page's newer one, if it has one
    driveToken = await askDriveToken(e.clientId, false);
    if (driveToken) res = await ask(driveToken);
  }
  return res;
}
/** The network's answer; a request that failed outright (a dropped or stale connection) is sent once more. */
async function network(request) {
  try { return await fetch(request); } catch {
    await new Promise((r) => setTimeout(r, RETRY_GAP_MS));
    return fetch(request);
  }
}
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const drive = url.origin === location.origin && /\/_drive\/([\w-]+)$/.exec(url.pathname);
  if (drive && e.request.method === "GET") { e.respondWith(fromDrive(e, drive[1])); return; }
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  const art = isArt(url);
  const shared = url.searchParams.has("share_url") || url.searchParams.has("share_text"); // not each shared page's address
  e.respondWith((async () => {
    const fresh = network(e.request).then(async (res) => {
      if (res.ok && !shared) {
        // (a picture is kept by its address without the page's "?retry=…", so one copy whatever was asked)
        try { await (await caches.open(art ? KEEP_ART : CACHE)).put(art ? url.origin + url.pathname : e.request, res.clone()); } catch { /* full: still shown */ }
      }
      return res;
    });
    const saved = () => caches.match(e.request, { ignoreSearch: true });
    if (art) {
      fresh.catch(() => {}); // (answered from the copy below, its failure is no one's business)
      const first = await Promise.race([fresh.catch(() => null), new Promise((r) => setTimeout(r, ART_WAIT_MS, "slow"))]);
      if (first && first !== "slow") return first; // (a 404 too: a missing picture is missing)
      const kept = await saved();
      if (kept) return kept;
      return fresh; // no copy yet: wait for the network after all
    }
    try {
      return await fresh;
    } catch (err) {
      const kept = await saved();
      if (kept) return kept;
      throw err;
    }
  })());
});
