// Tamkeen web app: keep a copy of the app's own files so it opens offline. Build 0.41.0-mvvgumvc
const CACHE = "tamkeen-0.41.0-mvvgumvc";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
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
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
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
