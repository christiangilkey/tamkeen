// Tamkeen web app: keep a copy of the app's own files so it opens offline. Build 0.29.0-mve46liu
const CACHE = "tamkeen-0.29.0-mve46liu";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(new URL("./", location).pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      const saved = await cache.match(e.request, { ignoreSearch: true });
      if (saved) return saved;
      throw err;
    }
  })());
});
