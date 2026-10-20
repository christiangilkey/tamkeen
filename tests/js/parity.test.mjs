// Run with: node --test tests/js/
// Tamkeen comes in four versions: the computer app (web/js + the Python server in app/), the Android
// app and the iPhone app (the same screens, answered by mobile/src/js/backend.js; native code in
// mobile/android and mobile/native-ios), and the web app (the phone build, served from docs/app).
// The screens are shared, so a feature built on one version easily goes missing on another. These
// checks fail as soon as that happens, unless the difference is written down below with its reason:
//  1. every request a shared screen makes is answered by the phone and by the computer;
//  2. every file a screen loads is copied into the phone build (mobile/scripts/build-www.mjs);
//  3. every name a file imports is exported by the file it comes from (computer and phone layouts);
//  4. Settings: each setting the search lists for a device is on that device's page, and a setting on
//     one page only says so (settingsui.js FINDS `on`);
//  5. the iPhone's native code answers every plugin call and event the Android code has;
//  6. the computer (app/db.py) and the phone (store.js) keep the same list of settings;
//  7. the open-source licences list (licenses/index.json) and the licence files agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const slash = (p) => p.split("\\").join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The phone build as build-www.mjs lays it out: published path -> source file.

const SHARED = [...read("mobile/scripts/build-www.mjs").match(/const SHARED = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
/** Made by the build itself, not copied. */
const GENERATED = ["js/vendor/capacitor-core.js", "js/version.js"];

function phoneLayout() {
  const files = new Map();
  for (const rel of SHARED) {
    const src = join(root, "web", rel);
    if (!existsSync(src)) continue; // (check 2 reports it)
    if (statSync(src).isDirectory()) for (const f of walk(src)) files.set(slash(join(rel, relative(src, f))), f);
    else files.set(rel, src);
  }
  for (const f of walk(join(root, "mobile", "src"))) files.set(slash(relative(join(root, "mobile", "src"), f)), f);
  return files;
}
const phone = phoneLayout();
const isPhoneFile = (path) => phone.has(path) || GENERATED.includes(path) || path.startsWith("licenses/");

// The computer serves web/ as it is.
const desktop = new Map(walk(join(root, "web")).map((f) => [slash(relative(join(root, "web"), f)), f]));

// ---------------------------------------------------------------------------------------------
// Reading JavaScript: imports, exports and api() calls (plain text scans, no running of the code).

/** Every module a file loads: static imports and re-exports, and import("...") with a plain address. */
function importsOf(src) {
  src = src.replace(/^\s*(?:\/\/|\/?\*)[^\n]*/gm, ""); // (comment lines, which may say "import ... from")
  const out = [];
  const re = /(?:^|[\s;}])(?:import|export)\s*(?:([\w$*{}\s,]+?)\s*from\s*)?["']([^"']+)["']|import\(\s*["']([^"'`$]+)["']\s*\)/g;
  for (const m of src.matchAll(re)) {
    const spec = m[2] || m[3];
    if (!spec || !spec.startsWith(".")) continue;
    const names = [];
    const what = m[1] || "";
    const braces = what.match(/\{([^}]*)\}/);
    if (braces && /^\s*import/.test(m[0].replace(/^[\s;}]/, ""))) {
      for (const n of braces[1].split(",")) { const name = n.trim().split(/\s+as\s+/)[0].trim(); if (name) names.push(name); }
    }
    out.push({ spec, names, dynamic: !!m[3] });
  }
  return out;
}

/** The names a file exports. `export const a = 1, b = 2;` gives both. */
function exportsOf(src, resolveFrom) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+/g)) {
    // The rest of one declaration, up to its ";" outside brackets, strings and comments: each
    // top-level "name =" (export const AGAIN = 1, GOOD = 3;). Regular expressions inside can
    // confuse it; the first name is taken above whatever happens here.
    let depth = 0, i = m.index + m[0].length, start = i, quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
      if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i); if (i < 0) break; i++; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (depth === 0 && (c === ";" || c === ",")) {
        const decl = src.slice(start, i).trim().match(/^([\w$]+)\s*=/) || src.slice(start, i).trim().match(/^\{([^}]*)\}\s*=/);
        if (decl) for (const n of decl[1].split(",")) { const k = n.split(":").pop().trim(); if (k) names.add(k); }
        if (c === ";") break;
        start = i + 1;
      }
    }
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const n of m[1].split(",")) { const parts = n.trim().split(/\s+as\s+/); const k = (parts[1] || parts[0]).trim(); if (k) names.add(k); }
  }
  for (const m of src.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) for (const k of resolveFrom(m[1])) names.add(k);
  if (/export\s+default\b/.test(src)) names.add("default");
  return names;
}

const SAMPLE = "Abcdefghij1"; // stands for any id in an address
/** The literal api("/...") calls in a file: [{method, path, line}]; a path built at run time is skipped. */
function apiCalls(src) {
  const calls = [];
  const re = /(?<![\w.$])api\(\s*(["'`])/g;
  let m;
  while ((m = re.exec(src))) {
    const q = m[1];
    let j = m.index + m[0].length, path = "";
    while (j < src.length && src[j] !== q) {
      if (q === "`" && src[j] === "$" && src[j + 1] === "{") {
        let depth = 1, k = j + 2;
        while (k < src.length && depth) { if (src[k] === "{") depth++; else if (src[k] === "}") depth--; k++; }
        path += "${}";
        j = k;
        continue;
      }
      path += src[j++];
    }
    // The options: up to the call's closing bracket.
    let depth = 1, k = j + 1;
    while (k < src.length && depth) { if ("([{".includes(src[k])) depth++; else if (")]}".includes(src[k])) depth--; k++; }
    const opts = src.slice(j + 1, k);
    const method = opts.match(/method\s*:\s*([^,}]+)/);
    const methods = method ? [...method[1].matchAll(/["'](GET|POST|PUT|PATCH|DELETE)["']/g)].map((x) => x[1]) : ["GET"];
    // "/vocab${query}": a value glued on without a "/" is a query, not part of the route.
    let p = path.replace(/([^/])\$\{\}.*$/, "$1").replace(/\$\{\}/g, SAMPLE).split("?")[0];
    for (const verb of methods) calls.push({ method: verb, path: p, line: src.slice(0, m.index).split("\n").length });
  }
  return calls;
}

// ---------------------------------------------------------------------------------------------
// The two servers' routes.

/** The phone's: the `routes` list in backend.js, as [method, RegExp, a sample address]. */
const phoneRoutes = [...read("mobile/src/js/backend.js").matchAll(/\["(GET|POST|PUT|PATCH|DELETE)",\s*\/(\^.*?\$)\/,/g)]
  .map(([, verb, source]) => [verb, new RegExp(source),
    source.replace(/\((?:\?:)?[^)]*\)/g, SAMPLE).replace(/^\^|\$$/g, "").replace(/\\\//g, "/").replace(/\\/g, "")]);

/** The computer's: each app/api/*.py router's prefix and decorators, as [method, RegExp, template]. */
const desktopRoutes = [];
for (const f of readdirSync(join(root, "app", "api")).filter((n) => n.endsWith(".py"))) {
  const py = read(`app/api/${f}`);
  const prefix = (py.match(/router\s*=\s*APIRouter\(([^)]*)\)/) || [, ""])[1].match(/prefix\s*=\s*"([^"]*)"/);
  for (const [, verb, path] of py.matchAll(/@router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
    const full = (prefix ? prefix[1] : "") + path;
    desktopRoutes.push([verb.toUpperCase(),
      new RegExp(`^${full.replace(/\{[^}:]+:path\}/g, ".+").replace(/\{[^}]+\}/g, "[^/]+")}$`), full]);
  }
}
const answers = (table, verb, path) => table.some(([v, re]) => v === verb && re.test(path));

/** Requests the shared screens make that only the computer answers, and why that is right. */
const COMPUTER_ONLY_REQUESTS = {
  "GET /anki/days": "the Anki add-on reports reviews to the computer only; game.js checkAnki gives up quietly on a phone",
  "GET /settings": "youtube.js asks the computer's server for the newest follow list (platform check); phones read their own settings",
  "POST /reels/batch": "a batch of reels needs the computer's own Instagram window; reels.js offers it on the computer only",
  "POST /vowels/download": "the Arabic vowel model runs in the computer's Python; phones get the vowels inside synced transcripts (vowels.js checks status.phone)",
  "POST /vowels/remove": "as /vowels/download",
};
/** Requests only the phone answers, and why. */
const PHONE_ONLY_REQUESTS = {
  "POST /anki/sync/run": "AnkiDroid's sync runs inside the phone app; on the computer Anki's add-on runs it",
};

// ---------------------------------------------------------------------------------------------

test("1. every request a shared screen makes is answered by the phone and by the computer", () => {
  const missing = [];
  const used = new Set();
  for (const [path, file] of phone) {
    if (!path.endsWith(".js") || path.startsWith("js/vendor/")) continue;
    const shared = file.startsWith(join(root, "web"));
    for (const c of apiCalls(readFileSync(file, "utf8"))) {
      const key = `${c.method} ${c.path.replace(SAMPLE, "{id}")}`;
      const where = `${slash(relative(root, file))}:${c.line}`;
      if (!answers(phoneRoutes, c.method, c.path)) {
        const allowed = Object.keys(COMPUTER_ONLY_REQUESTS).find((k) => { const [v, p] = k.split(" "); return v === c.method && p === c.path; });
        if (allowed && shared) used.add(allowed);
        else missing.push(`${key} has no answer in mobile/src/js/backend.js (${where})`);
      }
      if (shared && !answers(desktopRoutes, c.method, c.path)) {
        if (!Object.keys(PHONE_ONLY_REQUESTS).includes(`${c.method} ${c.path}`)) missing.push(`${key} has no route in app/api (${where})`);
      }
    }
  }
  // The computer's own screens (web/js files the phone doesn't use) need the computer's server.
  for (const [path, file] of desktop) {
    if (!path.startsWith("js/") || !path.endsWith(".js") || path.startsWith("js/vendor/")) continue;
    for (const c of apiCalls(readFileSync(file, "utf8"))) {
      if (!answers(desktopRoutes, c.method, c.path)) missing.push(`${c.method} ${c.path} has no route in app/api (web/${path}:${c.line})`);
    }
  }
  assert.deepEqual(missing, [], "add the route (or the phone's twin in backend.js), or list it with its reason");
  for (const key of Object.keys(COMPUTER_ONLY_REQUESTS)) assert.ok(used.has(key), `${key} is listed as computer-only but no shared screen asks for it any more: take it off the list`);
});

test("1b. every request the phone answers, the computer answers too (or the list says why not)", () => {
  const missing = phoneRoutes.filter(([verb, , sample]) => !answers(desktopRoutes, verb, sample) && !PHONE_ONLY_REQUESTS[`${verb} ${sample}`])
    .map(([verb, , sample]) => `${verb} ${sample}`);
  assert.deepEqual(missing, []);
});

test("2. every file the phone and web app load is copied into their build", () => {
  for (const rel of SHARED) assert.ok(existsSync(join(root, "web", rel)), `build-www.mjs copies web/${rel}, which doesn't exist`);
  const missing = [];
  for (const [path, file] of phone) {
    if (!path.endsWith(".js") || path.startsWith("js/vendor/")) continue;
    for (const { spec } of importsOf(readFileSync(file, "utf8"))) {
      const target = posix.normalize(posix.join(posix.dirname(path), spec.split("?")[0]));
      if (!isPhoneFile(target)) missing.push(`${path} loads ${target}${desktop.has(target) ? ": add it to SHARED in mobile/scripts/build-www.mjs" : ""}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("3. every name a file imports is exported by the file it comes from (computer and phone layouts)", () => {
  for (const [label, layout, exists] of [["phone", phone, isPhoneFile], ["computer", desktop, (p) => desktop.has(p)]]) {
    const cache = new Map();
    const exported = (path) => {
      if (!cache.has(path)) {
        cache.set(path, new Set());
        const file = layout.get(path);
        const src = file ? readFileSync(file, "utf8") : "";
        cache.set(path, exportsOf(src, (spec) => exported(posix.normalize(posix.join(posix.dirname(path), spec)))));
      }
      return cache.get(path);
    };
    const missing = [];
    for (const [path, file] of layout) {
      if (!path.startsWith("js/") || !path.endsWith(".js") || path.startsWith("js/vendor/")) continue;
      for (const { spec, names, dynamic } of importsOf(readFileSync(file, "utf8"))) {
        const target = posix.normalize(posix.join(posix.dirname(path), spec.split("?")[0]));
        if (dynamic || !exists(target) || !layout.has(target)) continue;
        for (const n of names) if (!exported(target).has(n)) missing.push(`${path} imports { ${n} } from ${target}, which doesn't export it`);
      }
    }
    assert.deepEqual(missing, [], `${label} layout`);
  }
});

// ----- Settings -----

/** The search list in settingsui.js: [{id, s, on}] (one entry per line there). */
const FINDS = [...read("web/js/components/settingsui.js").match(/export const FINDS = \[([\s\S]*?)\n\];/)[1].matchAll(/\{\s*s:\s*"([^"]+)",\s*id:\s*"([^"]+)"[^\n]*/g)]
  .map(([line, s, id]) => ({ s, id, on: line.match(/on:\s*\[([^\]]*)\]/) ? [...line.match(/on:\s*\[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null }));
const PHONE_DEVICES = ["phone", "android", "ios", "web", "vibrates"];
const onDesktop = (f) => !f.on || f.on.includes("desktop");
const onPhone = (f) => !f.on || f.on.some((o) => PHONE_DEVICES.includes(o));

/** The data-find ids drawn by a Settings page and everything it loads. */
function settingsIds(layout, start) {
  const seen = new Set(), ids = new Set();
  const visit = (path) => {
    if (seen.has(path) || !layout.has(path)) return;
    seen.add(path);
    const src = readFileSync(layout.get(path), "utf8");
    for (const m of src.matchAll(/data-find="([^"$]+)"/g)) for (const id of m[1].split(/\s+/)) if (/^\w+$/.test(id)) ids.add(id);
    for (const { spec } of importsOf(src)) visit(posix.normalize(posix.join(posix.dirname(path), spec.split("?")[0])));
  };
  visit(start);
  return ids;
}
const desktopIds = settingsIds(desktop, "js/pages/settings.js");
const phoneIds = settingsIds(phone, "js/pages/settings.js");

test("4. each setting the search finds is on the Settings page of every device it is listed for", () => {
  const missing = [];
  for (const f of FINDS) {
    if (onDesktop(f) && !desktopIds.has(f.id)) missing.push(`"${f.id}" is listed for the computer but isn't on web/js/pages/settings.js`);
    if (onPhone(f) && !phoneIds.has(f.id)) missing.push(`"${f.id}" is listed for phones/the web app but isn't on mobile/src/js/pages/settings.js`);
  }
  assert.deepEqual(missing, []);
});

test("4b. a setting on one Settings page but not the other says which devices have it", () => {
  const problems = [];
  for (const [ids, others, here, there, fits] of [[desktopIds, phoneIds, "computer", "phone", (f) => !onPhone(f)],
                                                  [phoneIds, desktopIds, "phone", "computer", (f) => !onDesktop(f)]]) {
    for (const id of ids) {
      const finds = FINDS.filter((f) => f.id === id);
      if (!finds.length) problems.push(`"${id}" (${here}) isn't in settingsui.js FINDS, so Settings' search can't find it`);
      else if (!others.has(id) && !finds.every(fits)) problems.push(`"${id}" is only on the ${here}'s Settings page: build it for the ${there} too, or give its FINDS entry an \`on\` list without the ${there}`);
    }
  }
  assert.deepEqual(problems, []);
});

// ----- native code -----

const JAVA = "mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio";
const SWIFT = "mobile/native-ios/ios/Sources/TamkeenNative";
/** Android plugins the iPhone does without, and why. */
const ANDROID_ONLY_PLUGINS = {
  AnkiDroid: "AnkiDroid is an Android app; the iPhone's AnkiMobile can't be reached by another app (the export works there)",
  AppUpdater: "the iPhone app is installed and updated through AltStore, not from inside the app",
  TamkeenClipboard: "the iPhone's web view reads the clipboard itself (navigator.clipboard), Android's refuses",
};

function plugins(dir, ext) {
  const out = {};
  for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith(ext))) {
    const src = read(`${dir}/${f}`);
    const name = ext === ".java" ? (src.match(/@CapacitorPlugin\(\s*name\s*=\s*"(\w+)"/) || [])[1] : (src.match(/jsName\s*=\s*"(\w+)"/) || [])[1];
    if (!name) continue;
    const methods = ext === ".java" ? [...src.matchAll(/@PluginMethod[^\n]*\n\s*public\s+void\s+(\w+)/g)].map((m) => m[1])
      : [...src.matchAll(/CAPPluginMethod\(name:\s*"(\w+)"/g)].map((m) => m[1]);
    out[name] = { file: `${dir}/${f}`, methods, events: [...src.matchAll(/notifyListeners\(\s*"(\w+)"/g)].map((m) => m[1]) };
  }
  return out;
}

test("5. the iPhone's native code answers every call and event Android's has", () => {
  const android = plugins(JAVA, ".java"), ios = plugins(SWIFT, ".swift");
  // (The reel window and the in-app browser speak through GoogleDriveAuth on both phones.)
  const missing = [];
  for (const [name, a] of Object.entries(android)) {
    if (ANDROID_ONLY_PLUGINS[name]) { assert.ok(!ios[name], `${name} is on the iPhone now: take it off ANDROID_ONLY_PLUGINS`); continue; }
    if (!ios[name]) { missing.push(`plugin ${name} (${a.file}) has no iPhone twin in ${SWIFT}`); continue; }
    for (const m of a.methods) if (!ios[name].methods.includes(m)) missing.push(`${name}.${m} is missing on the iPhone (${ios[name].file})`);
    for (const e of new Set(a.events)) if (!ios[name].events.includes(e)) missing.push(`${name} never sends "${e}" on the iPhone (${ios[name].file})`);
  }
  assert.deepEqual(missing, []);
  // native.js registers each plugin on the phones that have it, and only those.
  const nativeJs = read("mobile/src/js/native.js");
  for (const name of Object.keys(android)) {
    const line = nativeJs.split("\n").find((l) => l.includes(`registerPlugin("${name}")`));
    if (!line) continue;
    const androidOnly = /!isIOS|=== "android"/.test(line);
    assert.equal(androidOnly, !!ANDROID_ONLY_PLUGINS[name], `native.js: ${name} should be registered ${ANDROID_ONLY_PLUGINS[name] ? "on Android only" : "on both phones"}`);
  }
});

test("5b. links to Tamkeen (tamkeen://watch) open both phone apps", () => {
  assert.match(read("mobile/android/app/src/main/AndroidManifest.xml"), /android:scheme="tamkeen"/);
  assert.match(read("mobile/ios/App/App/Info.plist"), /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>tamkeen<\/string>/);
});

test("5c. the iPhone shows Tamkeen's own screen (Drive videos, swipe back), not Capacitor's plain one", () => {
  // SceneDelegate makes the window's screen itself, so Main.storyboard's choice alone is not enough.
  assert.match(read("mobile/ios/App/App/SceneDelegate.swift"), /rootViewController\s*=\s*TamkeenViewController\(\)/);
  assert.match(read("mobile/ios/App/App/AppDelegate.swift"), /class TamkeenViewController: CAPBridgeViewController/);
});

// ----- settings kept on each device -----

/** Settings only one side keeps, and why. */
const COMPUTER_ONLY_SETTINGS = {
  model_size: "the computer's own transcription model", beam_size: "the computer's own transcription model",
  delete_audio_after: "audio downloaded for transcription on the computer", stream_from_source: "as delete_audio_after",
  anki_token: "the Anki add-on's secret", anki_days: "the Anki add-on's reports", anki_last_report: "the Anki add-on's reports",
  anki_sync_state: "the Anki add-on's sync; AnkiDroid's is kept by anki-droid.js",
  stt_usage: "the computer's count of audio sent today; the phone counts its own (transcribe-service.js)",
  google_refresh_token: "the phones' own sign-in keeps it (Android's Google services, the iPhone's keychain)",
  google_scopes: "what the computer's Google sign-in allows; the phones ask their sign-in each time",
  sync_audio: "the computer uploads compressed audio copies; phones only play them",
  device_id: "the phones sync as \"android\"",
};
const PHONE_ONLY_SETTINGS = {
  signed_in: "the phone's own record of its Google sign-in (the computer keeps a token instead)",
  haptics: "vibration",
  ig_collections: "the computer keeps the synced Instagram collections with its reels (app/reels.py)",
};

test("6. the computer and the phone keep the same settings", () => {
  const py = read("app/db.py").match(/DEFAULT_SETTINGS[^=]*=\s*\{([\s\S]*?)\n\}/)[1].replace(/#[^\n]*/g, "");
  const desk = new Set([...py.matchAll(/"(\w+)"\s*:/g)].map((m) => m[1]));
  const js = read("mobile/src/js/store.js").match(/export const DEFAULTS = \{([\s\S]*?)\n\};/)[1].replace(/\/\/[^\n]*/g, "");
  const ph = new Set([...js.matchAll(/(?:^|[\s,{])(\w+)\s*:/g)].map((m) => m[1]));
  const missing = [];
  for (const k of desk) if (!ph.has(k) && !COMPUTER_ONLY_SETTINGS[k]) missing.push(`${k} is in app/db.py but not mobile/src/js/store.js`);
  for (const k of ph) if (!desk.has(k) && !PHONE_ONLY_SETTINGS[k]) missing.push(`${k} is in mobile/src/js/store.js but not app/db.py`);
  for (const k of Object.keys(COMPUTER_ONLY_SETTINGS)) if (ph.has(k)) missing.push(`${k} is on both now: take it off COMPUTER_ONLY_SETTINGS`);
  for (const k of Object.keys(PHONE_ONLY_SETTINGS)) if (desk.has(k)) missing.push(`${k} is on both now: take it off PHONE_ONLY_SETTINGS`);
  assert.deepEqual(missing, []);
});

test("7. the open-source licences list and the licence files agree", () => {
  const list = JSON.parse(read("licenses/index.json"));
  const files = readdirSync(join(root, "licenses")).filter((n) => n.endsWith(".txt"));
  for (const l of list) {
    assert.ok(l.name && l.license && l.file, JSON.stringify(l));
    assert.ok(files.includes(l.file), `licenses/${l.file} is listed but missing`);
    for (const o of l.on || []) assert.ok(["desktop", "phone"].includes(o), `${l.file}: "on" is "desktop" or "phone"`);
  }
  for (const f of files) assert.ok(list.some((l) => l.file === f), `licenses/${f} isn't in licenses/index.json, so no About page shows it`);
});
