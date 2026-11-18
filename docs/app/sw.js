// Tamkeen web app: keep a copy of the app's own files so it opens offline. Build 0.62.1-mwm0efxq
const CACHE = "tamkeen-0.62.1-mwm0efxq";
self.addEventListener("install", () => self.skipWaiting());
// (a cache named "tamkeen-keep-…" isn't the app's files but what the learner downloaded, kept across builds:
// the courses' audio packs, web/js/coursepacks.js)
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
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const drive = url.origin === location.origin && /\/_drive\/([\w-]+)$/.exec(url.pathname);
  if (drive && e.request.method === "GET") { e.respondWith(fromDrive(e, drive[1])); return; }
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(new URL("./", location).pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(e.request);
      if (res.ok && !url.searchParams.has("share_url") && !url.searchParams.has("share_text")) cache.put(e.request, res.clone()); // not each shared page's address
      return res;
    } catch (err) {
      const saved = await cache.match(e.request, { ignoreSearch: true });
      if (saved) return saved;
      throw err;
    }
  })());
});
