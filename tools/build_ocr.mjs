// The files Tamkeen's on-device text reading uses ("Add words" → Scan, web/js/ocr.js): Tesseract.js.
//   node tools/build_ocr.mjs
//
// Everything comes from npm, pinned to one version and checked against npm's own checksum:
//   - tesseract.js 7.0.0 (Apache-2.0): the small part that runs the reader, vendored into
//     web/js/vendor/tesseract/ (tesseract.esm.min.js, worker.min.js and their licence notes). It is
//     part of every version of the app (about 175 KB).
//   - tesseract.js-core 7.0.0 (Apache-2.0): Tesseract OCR itself, compiled to WebAssembly (about 1.5 MB
//     packed). Two builds: one for devices with WebAssembly SIMD (nearly all), one for the rest.
//   - @tesseract.js-data/<language> 1.0.0: Tesseract's trained data for each language (tessdata_best,
//     integer version; Apache-2.0, made by the Tesseract project). Tagalog only has the older 4.0.0
//     data (which also works with the LSTM reader).
// The core and the language data are NOT part of the app: they go into docs/lexicon/ beside the
// dictionaries and are downloaded once, on demand, the same way (app/lexicon.py, mobile/src/js/lexicon-store.js),
// listed in docs/lexicon/index.json with their size and SHA-256.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync, constants } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEXICON = join(root, "docs", "lexicon");
const VENDOR = join(root, "web", "js", "vendor", "tesseract");

const JS_VERSION = "7.0.0";
const CORE_VERSION = "7.0.0";
const DATA_VERSION = "1.0.0";
// Tesseract's language names, and the title shown for each (web/js/scanwords.js OCR_LANGS says which a
// study language uses: Chinese uses both of its own).
const LANGS = {
  ara: "Arabic", spa: "Spanish", fra: "French", jpn: "Japanese", chi_sim: "Chinese (simplified)", chi_tra: "Chinese (traditional)",
  rus: "Russian", ita: "Italian", tgl: "Tagalog", por: "Portuguese", cat: "Catalan", ceb: "Bisaya (Cebuano)", tha: "Thai",
  deu: "German", fas: "Persian", hin: "Hindi", kor: "Korean", eng: "English",
};
const CORES = { "ocr-core": "tesseract-core-simd-lstm.wasm.js", "ocr-core-plain": "tesseract-core-lstm.wasm.js" };

async function tarball(name, version) {
  const meta = await (await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`)).json();
  const v = meta.versions && meta.versions[version];
  if (!v) throw new Error(`${name}@${version} isn't on npm`);
  const res = await fetch(v.dist.tarball);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const tgz = Buffer.from(await res.arrayBuffer());
  const [algo, want] = v.dist.integrity.split("-");
  if (createHash(algo).update(tgz).digest("base64") !== want) throw new Error(`${name}@${version} arrived damaged`);
  return { files: untar(gunzipSync(tgz)), license: v.license };
}

/** The files in a tar archive: {path: Buffer}. */
function untar(buf) {
  const out = {};
  for (let at = 0; at + 512 <= buf.length;) {
    const head = buf.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    const str = (a, b) => head.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const prefix = str(345, 500);
    const name = (prefix ? `${prefix}/` : "") + str(0, 100);
    const type = String.fromCharCode(head[156] || 48);
    if (type === "0" || type === "\0") out[name] = buf.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const indexPath = join(LEXICON, "index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
const put = (name, file, blob, meta) => {
  writeFileSync(join(LEXICON, file), blob);
  index.files[name] = { file, bytes: blob.length, sha256: sha256(blob), ...meta };
  console.log(`${name.padEnd(16)} ${file.padEnd(36)} ${(blob.length / 1e6).toFixed(2)} MB`);
};

// 1. The part that runs in the app (vendored).
const js = await tarball("tesseract.js", JS_VERSION);
mkdirSync(VENDOR, { recursive: true });
for (const f of ["dist/tesseract.esm.min.js", "dist/worker.min.js", "dist/worker.min.js.LICENSE.txt", "dist/tesseract.min.js.LICENSE.txt", "LICENSE.md"]) {
  let data = js.files[`package/${f}`];
  if (!data) throw new Error(`tesseract.js has no ${f}`);
  // (Their source maps aren't copied, so the lines that point at them go too.)
  if (f.endsWith(".js")) data = Buffer.from(data.toString("utf8").replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n"));
  writeFileSync(join(VENDOR, f.replace(/^dist\//, "")), data);
}
writeFileSync(join(VENDOR, "VERSION.txt"), `tesseract.js ${JS_VERSION} (npm), license ${js.license}. Made by tools/build_ocr.mjs.\n`);

// 2. Tesseract itself (downloaded on demand).
const core = await tarball("tesseract.js-core", CORE_VERSION);
for (const [name, file] of Object.entries(CORES)) {
  const data = core.files[`package/${file}`];
  if (!data) throw new Error(`tesseract.js-core has no ${file}`);
  put(name, `ocr-${file.replace(/^tesseract-/, "")}.gz`, gzipSync(data, { level: constants.Z_BEST_COMPRESSION }), {
    title: name === "ocr-core" ? "Text reading (Tesseract)" : "Text reading (Tesseract, for older devices)",
    db: `tesseract.js-core ${CORE_VERSION}`, license: core.license,
  });
}

// 3. Each language's trained data (downloaded on demand).
for (const [code, title] of Object.entries(LANGS)) {
  const pkg = await tarball(`@tesseract.js-data/${code}`, DATA_VERSION);
  const variant = pkg.files[`package/4.0.0_best_int/${code}.traineddata.gz`] ? "4.0.0_best_int" : "4.0.0";
  const data = pkg.files[`package/${variant}/${code}.traineddata.gz`];
  if (!data) throw new Error(`@tesseract.js-data/${code} has no trained data`);
  put(`ocr-${code}`, `ocr-${code}.traineddata.gz`, data, {
    title: `Text reading: ${title}`, db: `tessdata ${variant} (@tesseract.js-data/${code} ${DATA_VERSION})`, license: "Apache-2.0",
  });
}

index.files = Object.fromEntries(Object.entries(index.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
console.log(`Wrote ${VENDOR} and the text-reading files in ${LEXICON}`);
