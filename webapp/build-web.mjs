// Build the web app: the phone app's screens (mobile/www) as a website, into docs/app, which
// GitHub Pages serves at https://christiangilkey.github.io/tamkeen/app/
//   node webapp/build-web.mjs
// The web app reads other websites through the go-between server (webapp/worker.js); its address
// is in webapp/proxy-url.txt (or TAMKEEN_PROXY). The page itself works the same way as on a
// phone: the library lives in the browser and syncs through the learner's own Google Drive.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const www = join(root, "mobile", "www");
const out = join(root, "docs", "app");

const proxyFile = join(here, "proxy-url.txt");
const proxy = (process.env.TAMKEEN_PROXY || (existsSync(proxyFile) ? readFileSync(proxyFile, "utf8") : "")).trim();
if (proxy && !/^(https:\/\/[\w.-]+|http:\/\/localhost:\d+)\/?$/.test(proxy)) throw new Error(`The go-between server's address doesn't look right: ${proxy}`);
// The latest release's number (its git tag), unless one is given.
let version = process.env.APP_VERSION || "";
if (!version) {
  try { version = execFileSync("git", ["describe", "--tags", "--abbrev=0"], { cwd: root, encoding: "utf8" }).trim().replace(/^v/, ""); } catch { /* no tags here */ }
}
version = version || "0.0.0-web";

// 1. The phone bundle, freshly built.
execFileSync(process.execPath, [join(root, "mobile", "scripts", "build-www.mjs")], { stdio: "inherit", env: { ...process.env, APP_VERSION: version } });

// 2. Copied into docs/app, leaving out what only a development preview uses.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(www, out, { recursive: true, filter: (src) => !/dev-reel-\d+\.mp4$|dev-seed\.js$/.test(src) });

// 3. The page: say it is the web app (and where the go-between server is) before anything loads,
//    and make it installable (a home-screen icon that opens like an app, also offline).
const index = join(out, "index.html");
let html = readFileSync(index, "utf8");
const head = `
  <script>window.TAMKEEN_WEB = true; window.TAMKEEN_PROXY = ${JSON.stringify(proxy)}; document.documentElement.dataset.theme = "dark";</script>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#111318">
  <link rel="apple-touch-icon" href="icons/icon-256.png">
  <script>if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));</script>
`;
if (!html.includes("</head>")) throw new Error("index.html has no </head>");
html = html.replace("</head>", `${head}</head>`);
// The web app is always dark (the owner's choice; app.js applySettings): the browser's own parts too.
html = html.replace('<meta name="color-scheme" content="light dark">', '<meta name="color-scheme" content="dark">');
writeFileSync(index, html);

const icons = ["icon-256.png", "icon-64.png"].filter((f) => existsSync(join(out, "icons", f)));
writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify({
  name: "Tamkeen",
  short_name: "Tamkeen",
  description: "Learn a language from podcasts, videos and pages you choose.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#111318",
  theme_color: "#111318",
  icons: (icons.length ? icons : ["icon-64.png"]).map((f) => ({ src: `icons/${f}`, sizes: f.match(/(\d+)/)[1] + "x" + f.match(/(\d+)/)[1], type: "image/png" })),
}, null, 2));

// 4. The service worker: the page's own files come from the network when it is reachable
//    (so a new build shows at once) and from the browser's copy when it isn't.
const build = `${version}-${Date.now().toString(36)}`;
writeFileSync(join(out, "sw.js"), `// Tamkeen web app: keep a copy of the app's own files so it opens offline. Build ${build}
const CACHE = "tamkeen-${build}";
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
`);
console.log(`Built the web app in ${out} (version ${version}, go-between server ${proxy || "NOT SET YET"})`);
