// The second step of docs/lexicon/ja-jmdict-meanings.json.gz (the first is tools/build_jmdict.py): keeps only the words
// Tamkeen's Japanese splitter gives as one word (web/js/lexicon/kuromoji.js with docs/lexicon/ja-ipadic.bin.gz: a word
// tapped in Japanese text is always one of those) and the ones JMdict marks as common (they are still found when several
// words are looked up together, and in Add words). The owner asked for the files to be as small as they can be
// (2026-11-17): this keeps about a third. Then docs/lexicon/index.json gets the file's new size and sha256.
//
//   node tools/trim_jmdict.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { JapaneseDictionary, tokenize } from "../web/js/lexicon/kuromoji.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEX = path.join(ROOT, "docs", "lexicon");
const FILE = path.join(LEX, "ja-jmdict-meanings.json.gz");

const ja = new JapaneseDictionary(zlib.gunzipSync(fs.readFileSync(path.join(LEX, "ja-ipadic.bin.gz"))));
const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8"));
const common = new Set(data.common || []);
const oneWord = (w) => { const t = tokenize(ja, w); return t.length === 1 && t[0].surface === w; };
const before = Object.keys(data.words).length;
data.words = Object.fromEntries(Object.entries(data.words).filter(([k]) => common.has(k) || oneWord(k)));
delete data.common;
const packed = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
fs.writeFileSync(FILE, packed);
const indexPath = path.join(LEX, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
Object.assign(index.files["mean-jaj"], { bytes: packed.length, sha256: crypto.createHash("sha256").update(packed).digest("hex"),
  words: Object.keys(data.words).length });
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
console.log(`ja-jmdict-meanings: ${before} -> ${Object.keys(data.words).length} words, ${(packed.length / 1e6).toFixed(2)} MB`);
