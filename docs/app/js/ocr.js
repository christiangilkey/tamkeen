// Reading the text in a photo on this device ("Add words" → Scan, components/wordscan.js), with
// Tesseract.js (Apache-2.0; web/js/vendor/tesseract, made by tools/build_ocr.mjs). Every version has it.
//
// Nothing is fetched from anywhere else while it reads, so it works offline once downloaded:
//   - the small part that runs it (tesseract.esm.min.js, worker.min.js) is part of the app;
//   - Tesseract itself (about 1.5 MB) and each language's trained data (0.4-3 MB) are downloaded once,
//     on demand, with the dictionaries (app/lexicon.py, mobile/src/js/lexicon-store.js: kind "ocr", or
//     "ocr-plain" on a device without WebAssembly SIMD), and kept on the device.
// Tesseract runs in a Web Worker made here from those files (Tesseract + its worker script in one
// blob), and it reads its language data from blob addresses made from the kept bytes, so the worker
// needs no web address of its own: the same on the computer, Android, the iPhone and the web app.

import { api } from "./app.js";
import { ocrNames, tesseractLangs } from "./scanwords.js";

const VENDOR = new URL("./vendor/tesseract/", import.meta.url);

/** Can this device run Tesseract at all (WebAssembly), and its faster build (SIMD)? */
export function ocrSupport() {
  if (typeof WebAssembly !== "object" || typeof Worker === "undefined") return { ok: false, simd: false };
  let simd = false;
  try {
    // (the smallest module that uses a SIMD instruction: the check tesseract.js makes itself)
    simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { simd = false; }
  return { ok: true, simd };
}

/** The download kind for this device. */
export const ocrKind = () => (ocrSupport().simd ? "ocr" : "ocr-plain");

const param = (pair) => encodeURIComponent(pair);
/** Is reading `pair` ("es+en") on this device downloaded? {installed, bytes, names, files}. */
export const ocrStatus = (pair) => api(`/lexicon/status?lang=${param(pair)}&kind=${ocrKind()}`);
/** Download what reading `pair` needs (once). */
export async function downloadOcr(pair) {
  const st = await api("/lexicon/download", { method: "POST", body: { lang: pair, kind: ocrKind() } });
  return st;
}

// ---------------------------------------------------------------- the reader

let reader = null;  // {pair, langs, worker: Promise<tesseract worker>, urls: [blob addresses]}
let progressTo = null;

async function bytesOf(name) {
  const data = await api(`/lexicon/data/${name}`, { bytes: true });
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  throw new Error("Text reading isn't downloaded on this device yet.");
}

async function start(pair, langs, urls) {
  const kind = ocrKind();
  const names = ocrNames(pair, kind);
  if (!names.length) throw new Error("This language can't be read on this device.");
  const [core, ...data] = await Promise.all(names.map(bytesOf));
  const workerText = await (await fetch(new URL("worker.min.js", VENDOR))).text();
  // Each language's data at a blob address, which the worker's fetch is pointed at.
  const files = {};
  names.slice(1).forEach((name, i) => {
    const url = URL.createObjectURL(new Blob([data[i]], { type: "application/octet-stream" }));
    urls.push(url);
    files[`tamkeen-ocr:/${name.replace(/^ocr-/, "")}.traineddata`] = url;
  });
  const prelude = `// Tamkeen: the trained data comes from the app, not from the web.
const TAMKEEN_FILES = ${JSON.stringify(files)};
const tamkeenFetch = self.fetch.bind(self);
self.fetch = (url, opts) => tamkeenFetch(TAMKEEN_FILES[String(url)] || url, opts);
`;
  const script = URL.createObjectURL(new Blob([prelude, core, "\n;\n", workerText], { type: "text/javascript" }));
  urls.push(script);
  const { default: Tesseract } = await import(new URL("tesseract.esm.min.js", VENDOR).href);
  // (tesseract.js never settles createWorker when the language data fails to load: its error
  // handler is told, and that ends the wait here.)
  let failed;
  const failure = new Promise((_, reject) => { failed = reject; });
  const worker = await Promise.race([failure, Tesseract.createWorker(langs, Tesseract.OEM.LSTM_ONLY, {
    workerPath: script,
    workerBlobURL: false,
    corePath: "tamkeen-ocr:/core.js",  // (never loaded: Tesseract is already in the worker)
    langPath: "tamkeen-ocr:",
    gzip: false,
    cacheMethod: "none",
    logger: (m) => { if (progressTo) progressTo(m); },
    errorHandler: (e) => { console.warn("Text reading:", e); failed(new Error("Text reading couldn't start on this device.")); },
  })]);
  return worker;
}

/** A Tesseract worker ready to read `pair` ("es+en"), made once and kept while it is used. */
async function workerFor(pair, { zhScript = "" } = {}) {
  const langs = tesseractLangs(pair, { zhScript });
  if (reader && reader.langs === langs) return reader.worker;
  await closeOcr();
  const me = { pair, langs, worker: null, urls: [] };
  me.worker = start(pair, langs, me.urls).catch((err) => {
    if (reader === me) reader = null;
    for (const url of me.urls) { try { URL.revokeObjectURL(url); } catch { /* gone */ } }
    throw err;
  });
  reader = me;
  return me.worker;
}

/**
 * Read the text in `image` (a canvas, a Blob or an ImageBitmap-able picture) for `pair` ("es+en").
 * `onProgress(fraction, what)` hears how far it has got. `psm` is how Tesseract looks for the text:
 * "3" (the page's own layout: columns, a table; the usual) or "11" (any text it can find, as a
 * flashcard with one big word needs). Resolves to Tesseract's answer ({text, blocks, confidence}),
 * which scanwords.js ocrList turns into a list.
 */
export async function readText(image, pair, { zhScript = "", psm = "3", onProgress = () => {} } = {}) {
  progressTo = (m) => {
    if (!m || typeof m.progress !== "number") return;
    onProgress(m.status === "recognizing text" ? m.progress : 0, m.status === "recognizing text" ? "reading" : "starting");
  };
  try {
    const worker = await workerFor(pair, { zhScript });
    await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    return data;
  } finally {
    progressTo = null;
  }
}

/** Stop the reader and let go of what it holds (when "Add words" closes). */
export async function closeOcr() {
  const r = reader;
  reader = null;
  if (!r) return;
  try { const w = await r.worker; await w.terminate(); } catch { /* it never started */ }
  for (const url of r.urls || []) { try { URL.revokeObjectURL(url); } catch { /* gone */ } }
}
