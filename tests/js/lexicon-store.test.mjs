// The phone's and web app's dictionary store (mobile/src/js/lexicon-store.js): a file downloaded before is
// replaced when a newer one is published (another checksum in index.json), in the background, and the stored
// copy keeps working until then. Run with stand-ins for the device storage and the download site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHash } from "node:crypto";

// Stand-ins for the store's own imports (IndexedDB, Drive and photo-reading code aren't wanted here).
const kvData = new Map();
globalThis.__lexiconTestKv = { get: async (k) => kvData.get(k), set: async (k, v) => { kvData.set(k, v); } };
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = {
  "./store.js": stub("export const kv = globalThis.__lexiconTestKv;"),
  "./drive.js": stub("export async function gunzipJson(b) { return JSON.parse(new TextDecoder().decode(b)); }"),
  "./scanwords.js": stub("export const OCR_BYTES = {}; export const OCR_CORES = {}; export const ocrNames = () => [];"),
};
register(stub(`const S = ${JSON.stringify(STUBS)};
export async function resolve(spec, ctx, next) { return S[spec] && /lexicon-store/.test(ctx.parentURL || "") ? { url: S[spec], shortCircuit: true } : next(spec, ctx); }`));

// The download site: index.json and the files, changeable.
const site = new Map();
const publish = (name, file, text) => {
  const bytes = new TextEncoder().encode(text);
  site.set(file, bytes);
  const index = JSON.parse(new TextDecoder().decode(site.get("index.json") || new TextEncoder().encode('{"files":{}}')));
  index.files[name] = { file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  site.set("index.json", new TextEncoder().encode(JSON.stringify(index)));
};
let fetches = 0;
globalThis.fetch = async (url) => {
  fetches++;
  const name = String(url).split("/").pop();
  const body = site.get(name);
  return body ? { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) } : { ok: false };
};
const text = (buf) => new TextDecoder().decode(new Uint8Array(buf));
const settle = async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 2)); };

test("a newer published file replaces the stored one, in the background", async () => {
  const store = await import("../../mobile/src/js/lexicon-store.js");
  publish("ex-ceb", "ceb-examples.json.gz", '{"v":1}');
  let st = await store.lexiconDownload("ceb", "examples");
  assert.ok(st.installed);
  assert.deepEqual(st.stale, []);
  assert.equal(text(kvData.get("lexicon:ex-ceb")), '{"v":1}');
  await settle();

  // A newer file is published; a day later the app looks at the list again.
  publish("ex-ceb", "ceb-examples.json.gz", '{"v":2}');
  kvData.set("lexicon:indexAt", Date.now() - 25 * 3600 * 1000);
  st = await store.lexiconStatus("ceb", "examples");
  assert.ok(st.installed, "the stored copy keeps working meanwhile");
  await settle();
  assert.equal(text(kvData.get("lexicon:ex-ceb")), '{"v":2}', "replaced by the newer one");
  assert.deepEqual((await store.lexiconStatus("ceb", "examples")).stale, []);

  // Within a day the list isn't fetched again; with no connection nothing breaks.
  await settle();
  const before = fetches;
  await store.lexiconStatus("ceb", "examples");
  await settle();
  assert.equal(fetches, before, "not looked at again within a day");
  kvData.set("lexicon:indexAt", 0);
  globalThis.fetch = async () => { throw new Error("offline"); };
  st = await store.lexiconStatus("ceb", "examples");
  await settle();
  assert.ok(st.installed);
  assert.equal(text(kvData.get("lexicon:ex-ceb")), '{"v":2}');
});

test("a file stored before checksums were kept gets its checksum worked out once", async () => {
  const store = await import("../../mobile/src/js/lexicon-store.js");
  const shas = kvData.get("lexicon:shas");
  delete shas["ex-ceb"];
  kvData.set("lexicon:shas", shas);
  const st = await store.lexiconStatus("ceb", "examples");
  assert.deepEqual(st.stale, [], "the same as the published one: nothing to fetch");
  assert.ok(kvData.get("lexicon:shas")["ex-ceb"]);
});
