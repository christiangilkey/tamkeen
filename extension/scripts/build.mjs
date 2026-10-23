// Build the browser extension "Tamkeen for Netflix" (extension/): a folder you can load as it is
// (chrome://extensions -> Developer mode -> Load unpacked), and optionally its zip and install page.
//   node extension/scripts/build.mjs                        -> extension/build/
//   node extension/scripts/build.mjs --out DIR --zip FILE --page DIR [--version 1.2.3] [--store-zip FILE]
// webapp/build-web.mjs runs it for the web app's site: docs/extension/tamkeen-netflix.zip,
// docs/extension/index.html (how to install it) and docs/extension/privacy.html (from
// extension/privacy.html); and the zip to upload to the Chrome Web Store,
// extension/store/upload/tamkeen-chrome-web-store.zip (not kept in git).
//
// The extension is the web app's own screens, the parts the subtitle bar needs: its own files
// (extension/src) over the phone's (mobile/src) over the shared ones (web/), the same layering as the
// phone build (mobile/scripts/build-www.mjs). Only the modules its pages load are copied: they are
// found by following the imports from its entry points.
//
// FOR TESTS ONLY (never for a release): --test-netflix http://127.0.0.1:PORT makes a local stand-in
// count as Netflix, --test-subs HOST serves its subtitle files, --test-webapp http://127.0.0.1:PORT/app/
// is the web app. The manifest and config then name those too.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, "..");
const root = join(ext, "..");
const LAYERS = [join(ext, "src"), join(root, "mobile", "src"), join(root, "web")];

// ---------- options ----------
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const out = opt("out") || join(ext, "build");
const test = { netflix: opt("test-netflix"), subs: opt("test-subs"), webapp: opt("test-webapp") };
const local = (u) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(String(u || ""));
for (const [k, v] of Object.entries(test)) {
  if (v && !(k === "subs" ? /^(127\.0\.0\.1|localhost)$/.test(v) : local(v))) throw new Error(`--test-${k} must be a local address (tests only): ${v}`);
}
const testing = !!(test.netflix || test.subs || test.webapp);

let version = opt("version") || process.env.APP_VERSION || "";
if (!version) {
  try { version = execFileSync("git", ["describe", "--tags", "--abbrev=0"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* no tags */ }
}
version = String(version).replace(/^v/, "").replace(/[-+].*$/, "");
if (!/^\d+(\.\d+){0,3}$/.test(version)) version = "0.0.0";

// ---------- what the extension is told about the world ----------
const PROD = {
  netflixBase: "https://www.netflix.com",
  netflixHosts: ["www.netflix.com", "netflix.com"],
  subtitleHosts: "(^|\\.)nflxvideo\\.net$",
  subtitleUrls: ["https://*.nflxvideo.net/*"],
  webApp: "https://christiangilkey.github.io/tamkeen/app/",
};
const config = { ...PROD, version, test: testing };
if (test.netflix) { config.netflixBase = test.netflix.replace(/\/+$/, ""); config.netflixHosts = [new URL(test.netflix).hostname]; }
if (test.subs) { config.subtitleHosts = `^${test.subs.replace(/\./g, "\\.")}$`; config.subtitleUrls = [`http://${test.subs}/*`]; }
if (test.webapp) config.webApp = test.webapp.endsWith("/") ? test.webapp : `${test.webapp}/`;

// ---------- files ----------
function find(rel) {
  for (const layer of LAYERS) { const p = join(layer, rel); if (existsSync(p)) return p; }
  throw new Error(`The extension needs ${rel}, which isn't in extension/src, mobile/src or web/`);
}
const copied = new Set();
function copy(rel, from = find(rel)) {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  cpSync(from, join(out, rel), { recursive: true });
  copied.add(rel);
}

/** The modules `entries` load, following their imports (generated ones left out). */
const IMPORT = /^\s*(?:import|export)\s[^;]*?\sfrom\s*["'](\.[^"']+)["']|^\s*import\s*["'](\.[^"']+)["']|\bimport\(\s*["'](\.[^"']+)["']\s*\)/gm;
const GENERATED = new Set(["js/ext/config.js"]);
function closure(entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel) || GENERATED.has(rel)) continue;
    seen.add(rel);
    const src = readFileSync(find(rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(IMPORT)) stack.push(posix.normalize(posix.join(posix.dirname(rel), m[1] || m[2] || m[3])));
  }
  return [...seen].sort();
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The pages and scripts of the extension itself; the app's look, fonts, translations and icons.
for (const rel of ["panel.html", "css/ext.css", "content/netflix.js", "content/netflix-main.js", "content/webapp.js"]) copy(rel);
copy("css/app.css");
copy("css/media.css"); // (the word popup's pause switch and the quick/detailed switch)
copy("fonts");
copy("i18n");
copy("icons", join(ext, "icons"));
// The scripts that run inside Netflix's pages (plain scripts, shared with the computer's Netflix windows).
for (const rel of ["js/netflix-common.js", "js/netflix-player.js", "js/netflix-browser.js"]) copy(rel);
// Word lists and dictionaries' code are loaded by name at times (import(`./wordlists/${lang}.js`)).
copy("js/lexicon");
copy("js/wordlists");
// Every module the background part, the subtitle bar and the web app's part load.
const bridge = closure(["js/extbridge.js"]);
for (const rel of closure(["background.js", "js/ext/panel.js", "js/extbridge.js"])) copy(rel);

writeFileSync(join(out, "js", "ext", "config.js"),
  `// Made by extension/scripts/build.mjs.${testing ? " A TEST BUILD: it treats local stand-ins as Netflix." : ""}\nexport const CONFIG = ${JSON.stringify(config, null, 2)};\n`);
writeFileSync(join(out, "content", "config.js"),
  `// Made by extension/scripts/build.mjs: which website js/netflix-player.js treats as Netflix.\nwindow.__tamkeenNetflixCfg = ${JSON.stringify({ hosts: config.netflixHosts, lang: "" })};\n`);

// ---------- the manifest ----------
const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
manifest.version = version;
manifest.web_accessible_resources[1].resources = bridge;
if (testing) {
  manifest.name += " (test build)";
  const add = (list, pattern) => { if (!list.includes(pattern)) list.push(pattern); };
  if (test.netflix) {
    const pattern = `${new URL(test.netflix).origin.replace(/:\d+$/, "")}/*`; // match patterns take any port
    for (const cs of manifest.content_scripts.slice(0, 2)) add(cs.matches, pattern);
    add(manifest.host_permissions, pattern);
    add(manifest.web_accessible_resources[0].matches, pattern);
  }
  if (test.subs) add(manifest.host_permissions, `http://${test.subs}/*`);
  if (test.webapp) {
    const u = new URL(config.webApp);
    add(manifest.content_scripts[2].matches, `${u.protocol}//${u.hostname}${u.pathname}*`);
    add(manifest.web_accessible_resources[1].matches, `${u.protocol}//${u.hostname}/*`);
  }
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

/** The manifest for the Chrome Web Store: Firefox's own parts left out. */
function storeManifest(m) {
  const copy = JSON.parse(JSON.stringify(m));
  delete copy.browser_specific_settings;
  if (copy.background) delete copy.background.scripts;
  return copy;
}

/** The extension's Chrome Web Store listing, from the one line in web/js/netflix.js that names it
 * (CHROME_WEB_STORE_URL), or "" while it isn't there. */
function chromeWebStoreUrl() {
  const src = readFileSync(join(root, "web", "js", "netflix.js"), "utf8");
  const m = src.match(/^export const CHROME_WEB_STORE_URL = "([^"]*)";/m);
  if (!m) throw new Error("web/js/netflix.js must keep its line: export const CHROME_WEB_STORE_URL = \"…\";");
  const url = m[1].trim();
  if (url && !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/[\w\-./]+$/.test(url)) {
    throw new Error(`CHROME_WEB_STORE_URL doesn't look like a Chrome Web Store address: ${url}`);
  }
  return url;
}

/** The install page with its store parts (once listed, "Add to Chrome" first) or its by-hand parts. */
function installPage(html, storeUrl) {
  const keep = storeUrl ? "store" : "manual";
  const drop = storeUrl ? "manual" : "store";
  return html.replace(new RegExp(`[ \\t]*<!--${drop}-->[\\s\\S]*?<!--/${drop}-->\\n?`, "g"), "")
    .replace(new RegExp(`<!--/?${keep}-->`, "g"), "")
    .replaceAll("{{STORE_URL}}", storeUrl);
}

// ---------- the zip ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function walk(dir) {
  return readdirSync(dir).sort().flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
/** A plain zip of the folder (deflated; the same date on every file, so the same build gives the same
 * zip). `replace`: {"path/in/zip": Buffer} written instead of that file. */
function zip(dir, replace = {}) {
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of walk(dir)) {
    const rel = relative(dir, file).split("\\").join("/");
    const name = Buffer.from(rel, "utf8");
    const data = replace[rel] || readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10); entry.writeUInt16LE(DOS_TIME, 12); entry.writeUInt16LE(DOS_DATE, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(head, name, packed);
    central.push(entry, name);
    offset += head.length + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const zipPath = opt("zip");
let zipBytes = 0;
if (zipPath) {
  if (testing) throw new Error("A test build is never zipped for others: leave out --zip.");
  const bytes = zip(out);
  mkdirSync(dirname(zipPath), { recursive: true });
  writeFileSync(zipPath, bytes);
  zipBytes = bytes.length;
}

// ---------- the zip for the Chrome Web Store ----------
// The same files, with a manifest for Chrome alone: without the parts only Firefox reads (its
// background "scripts" and its add-on id), which Chrome ignores but would warn about. Upload this one
// to the Chrome Web Store (and Edge Add-ons); extension/store/HOW-TO-PUBLISH.md explains.
const storeZipPath = opt("store-zip");
if (storeZipPath) {
  if (testing) throw new Error("A test build is never zipped for a store: leave out --store-zip.");
  const bytes = zip(out, { "manifest.json": Buffer.from(JSON.stringify(storeManifest(manifest), null, 2) + "\n") });
  mkdirSync(dirname(storeZipPath), { recursive: true });
  writeFileSync(storeZipPath, bytes);
}

// ---------- the install page and the privacy policy ----------
const pageDir = opt("page");
if (pageDir) {
  if (testing) throw new Error("A test build has no install page.");
  const mb = zipBytes ? `${(zipBytes / 1e6).toFixed(1)} MB` : "";
  const html = installPage(readFileSync(join(ext, "install.html"), "utf8"), chromeWebStoreUrl())
    .replaceAll("{{VERSION}}", version).replaceAll("{{SIZE}}", mb);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, "index.html"), html);
  cpSync(join(ext, "icons", "icon-128.png"), join(pageDir, "icon-128.png"));
  // (served at https://christiangilkey.github.io/tamkeen/extension/privacy.html: the store listing links to it)
  cpSync(join(ext, "privacy.html"), join(pageDir, "privacy.html"));
}

console.log(`Built the Tamkeen extension ${version} in ${out}${testing ? " (TEST BUILD)" : ""}${zipPath ? `, zip ${zipPath} (${zipBytes} bytes)` : ""}${storeZipPath ? `, Chrome Web Store zip ${storeZipPath}` : ""}`);
