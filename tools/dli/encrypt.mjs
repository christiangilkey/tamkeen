// Package the DLI students' material: encrypt it into web/dli/ so it can ship inside the public
// repository and web app without anyone being able to read it without the password (web/js/dli.js).
//
//   set DLI_PASSWORD=<the password>          (PowerShell: $env:DLI_PASSWORD = "<the password>")
//   node tools/dli/encrypt.mjs                 encrypts the content folder into web/dli/
//   node tools/dli/encrypt.mjs --empty         writes an index with nothing in it (every language "coming soon")
//   node tools/dli/encrypt.mjs --from <folder> --out <folder>   other folders (tests use these)
//
// The password is only ever read from the environment variable DLI_PASSWORD, never from a file; it is
// checked against the app's own hash first, so material can't be packaged with a wrong one.
//
// The content folder (default: the folder `dli-content` beside this repository,
// C:\Users\chris\Documents\arabic-tts\dli-content; or the environment variable DLI_CONTENT) has one
// folder per DLI language, named by the app's code: ar (Arabic), zh (Chinese), fa (Farsi), fr (French),
// ko (Korean), ru (Russian), es (Spanish). Inside one:
// - a folder holding an index.json with a "feed" is a podcast: it is added to the learner's podcasts,
//   each episode with its ready-made transcript (index.json: feed, title, and episodes, each with guid,
//   audio_url, title and its transcript's file name; each transcript in the sync's own format, as
//   app/sync/engine.py transcript_payload writes it);
// - any other file is a file to open from Library -> Courses -> DLI (sub-folders are its groups).
// For now `dli-content\arabic101` (where the Arabic101 transcripts were first written) counts as
// `dli-content\ar\arabic101` while that doesn't exist (ALIASES). Some podcasts' transcripts get a fix
// on the way (tools/dli/fixes.mjs: Arabic101's spoken English intro, written in Latin letters).
//
// Each file becomes web/dli/<random id>.bin; the list of everything, web/dli/index.bin, is encrypted
// too, so not even the names show. A file whose content hasn't changed keeps its encrypted copy (found
// through the index made last time), so a new run changes only what changed.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import * as dli from "../../web/js/dli.js";
import { FIXES } from "./fixes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_FROM = resolve(root, "..", "dli-content");
export const DEFAULT_OUT = join(root, "web", "dli");
// The decks' audio is too big to ship inside the apps: it is published with the website beside the basics
// courses' audio (app/course.py and web/js/coursedata.js fetch it), and fetched only when a learner adds a chapter.
export const DEFAULT_AUDIO_OUT = join(root, "docs", "course", "dli");
/** Folders at the top of the content folder that stand for a podcast of one language. */
export const ALIASES = { arabic101: "ar" };
const SKIP = /^(\.|readme(\.\w+)?$|thumbs\.db$|desktop\.ini$)/i;

const TYPES = {
  ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
  ".opus": "audio/ogg", ".wav": "audio/wav", ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv", ".json": "application/json", ".vtt": "text/vtt",
  ".srt": "text/plain",
};
const typeOf = (name) => TYPES[extname(name).toLowerCase()] || "application/octet-stream";
const textual = (type) => type.startsWith("text/") || type === "application/json";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const newId = () => randomBytes(16).toString("hex");
// "Unit 2" before "Unit 10".
const byName = (a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

function list(folder) {
  return existsSync(folder) ? readdirSync(folder).filter((n) => !SKIP.test(n)).sort(byName) : [];
}

/** A podcast folder's index.json, read whatever the exact names of its parts. */
function readPodcastIndex(folder) {
  const file = join(folder, "index.json");
  if (!existsSync(file)) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file} isn't readable JSON: ${e.message}`); }
  const feed = raw.feed || raw.feed_url || raw.url || "";
  if (!feed) return null;
  const episodes = (raw.episodes || raw.items || []).map((e) => ({
    guid: e.guid || e.id || "",
    audio: e.audio_url || e.audio || e.enclosure || "",
    title: e.title || "",
    file: e.transcript || e.transcript_file || e.file || e.payload || "",
  }));
  return { feed, title: raw.title || raw.feed_title || "", episodes };
}

function readPayload(path) {
  let bytes = readFileSync(path);
  if (path.toLowerCase().endsWith(".gz")) bytes = gunzipSync(bytes);
  return JSON.parse(bytes.toString("utf8"));
}

/** The index made last time (to keep the encrypted copies of what hasn't changed), or an empty one. */
async function lastIndex(out, key) {
  const file = join(out, "index.bin");
  if (!existsSync(file)) return dli.emptyIndex();
  try {
    return dli.cleanIndex(await dli.openJson(key, readFileSync(file), { name: dli.INDEX_NAME }));
  } catch {
    return dli.emptyIndex(); // made with another key: everything is encrypted again
  }
}

/**
 * Encrypt the content folder `from` into `out`. `password` must pass `check` (the app's own unless a
 * test gives its own, with its own `keyParams`). `empty`: an index with nothing in it. Returns
 * { index, written, kept, skipped: [messages] }.
 */
export async function packContent({ from = DEFAULT_FROM, out = DEFAULT_OUT, audioOut, password, check = dli.CHECK,
                                    keyParams = dli.KEY, empty = false, log = () => {} } = {}) {
  // (the website's audio folder only for the app's own package; any other package keeps its audio beside it)
  audioOut = audioOut || (resolve(out) === resolve(DEFAULT_OUT) ? DEFAULT_AUDIO_OUT : join(out, "audio"));
  if (!password) throw new Error("Set the environment variable DLI_PASSWORD to the DLI password first.");
  if (!(await dli.checkPassword(password, check))) throw new Error("DLI_PASSWORD isn't the DLI password: nothing was written.");
  const key = await dli.contentKey(password, keyParams);
  mkdirSync(out, { recursive: true });
  const before = await lastIndex(out, key);
  const known = new Map(); // plain sha -> encrypted file id made last time
  for (const items of Object.values(before.content)) {
    for (const it of items) {
      if (it.kind === "file" && it.sha) known.set(it.sha, it.id);
      if (it.kind === "podcast") for (const e of it.episodes) if (e.sha) known.set(e.sha, e.file);
      if (it.kind === "deck") {
        for (const c of it.chapters) {
          if (c.sha) known.set(c.sha, c.file);
          if (c.audio_sha && c.audio) known.set(c.audio_sha, c.audio);
        }
      }
    }
  }
  const result = { written: 0, kept: 0, skipped: [], fixed: {}, notes: [] };
  const used = new Set();
  /** Encrypt one file's plain bytes (or keep last time's copy), returning its id. */
  async function store(plain, { gzip, json, to = out }) {
    const digest = sha(plain);
    const old = known.get(digest);
    if (old && !used.has(old) && existsSync(join(to, `${old}.bin`))) {
      used.add(old);
      result.kept++;
      return { id: old, sha: digest };
    }
    const id = newId();
    const sealed = json ? await dli.sealJson(key, json, { name: id }) : await dli.sealBytes(key, plain, { name: id, gzip });
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, `${id}.bin`), sealed);
    used.add(id);
    result.written++;
    return { id, sha: digest };
  }

  async function podcast(folder, info, code) {
    const id = basename(folder).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").slice(0, 64) || "podcast";
    const episodes = [];
    for (const e of info.episodes) {
      if (!e.file) { result.skipped.push(`${code}/${id}: an episode without a transcript file (${e.title || e.guid})`); continue; }
      const path = join(folder, e.file);
      let payload;
      try { payload = dli.checkPayload(readPayload(path)); } catch (err) { payload = null; }
      if (!payload) { result.skipped.push(`${relative(from, path)}: not a transcript in the sync's format`); continue; }
      for (const fix of FIXES[id] || []) {
        const r = fix(payload, e);
        const fixed = dli.checkPayload(r.payload);
        if (fixed) payload = fixed;
        const tally = (result.fixed[`${id}: ${fix.name}`] = result.fixed[`${id}: ${fix.name}`] || {});
        tally[fixed ? r.how : "failed"] = (tally[fixed ? r.how : "failed"] || 0) + 1;
      }
      // (stored as its cleaned JSON, so the sha is of what the app will get)
      const plain = Buffer.from(JSON.stringify(payload));
      const { id: file, sha: digest } = await store(plain, { json: payload });
      episodes.push({ guid: e.guid, audio: e.audio, title: e.title, file, sha: digest });
    }
    const item = dli.cleanIndex({ content: { [code]: [{ kind: "podcast", id, title: info.title || id, feed: info.feed, episodes }] } }).content[code][0];
    if (!item) { result.skipped.push(`${code}/${id}: its feed address isn't a web address`); return null; }
    log(`  ${code}: podcast "${item.title}", ${item.episodes.length} transcripts`);
    return item;
  }

  /** A vocabulary deck (tools/dli/DECKS.md): each chapter whose sentences are all written becomes its word list
   *  (in `out`) and, as far as it is voiced, its audio bundle (in `audioOut`, published with the website). */
  async function deck(folder, code) {
    const d = JSON.parse(readFileSync(join(folder, "deck.json"), "utf8"));
    const written = new Map();
    for (const f of list(join(folder, "sentences")).filter((n) => /^c\d{3}\.json$/.test(n))) {
      for (const e of JSON.parse(readFileSync(join(folder, "sentences", f), "utf8")).words || []) written.set(e.n, e);
    }
    const madeFile = join(folder, "audio", "made.json");
    const made = existsSync(madeFile) ? JSON.parse(readFileSync(madeFile, "utf8")) : {};
    const unmark = (s) => String(s || "").replace(/[⟦⟧]/gu, "").trim();
    const chapters = [];
    let words = 0, left = 0;
    for (const ch of d.chapters) {
      const due = ch.words.filter((n) => d.words[n - 1].chapters[0] === ch.id);
      if (!due.every((n) => written.has(n) && unmark(written.get(n).sentence) && written.get(n).translation)) { left++; continue; }
      const list_ = ch.words.map((n) => {
        const w = d.words[n - 1];
        if (w.chapters[0] !== ch.id) return { n, also: true };
        const e = written.get(n);
        const fix = e.fix || {};
        return { n, text: fix.word || w.word, meaning: fix.meaning || w.meaning, notes: w.notes || "", sentence: e.sentence,
                 translation: e.translation, in: w.chapters };
      });
      const payload = { id: ch.id, words: list_ };
      const { id: file, sha: digest } = await store(Buffer.from(JSON.stringify(payload)), { json: payload });
      // The audio made for exactly this text (voice_deck.py notes what it said).
      const files = [];
      for (const w of list_.filter((x) => !x.also)) {
        const m = made[String(w.n)];
        const path = join(folder, "audio", `${w.n}.ogg`);
        if (m && m.word === w.text && m.sentence === unmark(w.sentence) && m.times && existsSync(path)) {
          files.push({ n: w.n, bytes: readFileSync(path), times: m.times });
        }
      }
      let audio = "", audioSha = "";
      if (files.length) ({ id: audio, sha: audioSha } = await store(Buffer.from(dli.makeBundle(files)), { gzip: false, to: audioOut }));
      chapters.push({ id: ch.id, title: ch.title, words: ch.words.length, file, audio, voiced: files.length, sha: digest, audio_sha: audioSha });
      words += due.length;
    }
    if (left) result.notes.push(`${code}/${d.id}: ${left} chapter(s) not finished yet (their sentences), left out for now`);
    const item = dli.cleanIndex({ content: { [code]: [{ kind: "deck", id: d.id, title: d.title, short: d.short, words, chapters }] } }).content[code][0];
    if (!item) return null;
    log(`  ${code}: deck "${item.title}", ${item.chapters.length} chapters, ${words} words, `
        + `${item.chapters.reduce((s, c) => s + c.voiced, 0)} with audio`);
    return item;
  }

  async function walk(folder, code, group, items) {
    for (const name of list(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) {
        if (existsSync(join(path, "deck.json"))) { const k = await deck(path, code); if (k) items.push(k); continue; }
        const info = readPodcastIndex(path);
        if (info) { const p = await podcast(path, info, code); if (p) items.push(p); }
        else await walk(path, code, group ? `${group} / ${name}` : name, items);
        continue;
      }
      const plain = readFileSync(path);
      const type = typeOf(name);
      const { id, sha: digest } = await store(plain, { gzip: textual(type) });
      items.push({ kind: "file", id, title: basename(name, extname(name)), name, type, size: plain.length, group, sha: digest });
    }
  }

  const content = Object.fromEntries(dli.DLI_CODES.map((c) => [c, []]));
  if (!empty) {
    if (!existsSync(from)) throw new Error(`There is no content folder at ${from}.`);
    for (const code of dli.DLI_CODES) await walk(join(from, code), code, "", content[code]);
    for (const [name, code] of Object.entries(ALIASES)) {
      const path = join(from, name);
      if (existsSync(path) && !existsSync(join(from, code, name))) {
        const info = readPodcastIndex(path);
        if (info) { const p = await podcast(path, info, code); if (p) content[code].push(p); }
      }
    }
  }
  const index = dli.cleanIndex({ v: 1, made: Math.floor(Date.now() / 1000), content });
  writeFileSync(join(out, "index.bin"), await dli.sealJson(key, index, { name: dli.INDEX_NAME }));
  // Encrypted copies nothing refers to any more go (the audio folder holds only this tool's files).
  for (const folder of [out, audioOut]) {
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) {
      const m = /^([0-9a-f]{32})\.bin$/.exec(name);
      if (m && !used.has(m[1])) rmSync(join(folder, name));
    }
  }
  return { index, ...result };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const from = resolve(arg("--from") || process.env.DLI_CONTENT || DEFAULT_FROM);
    const out = resolve(arg("--out") || DEFAULT_OUT);
    const audioOut = resolve(arg("--audio-out") || (arg("--out") ? join(out, "audio") : DEFAULT_AUDIO_OUT));
    console.log(args.includes("--empty") ? `Writing an empty DLI index to ${out}` : `Packaging ${from}\n  into ${out}\n  (audio into ${audioOut})`);
    const r = await packContent({ from, out, audioOut, password: process.env.DLI_PASSWORD, empty: args.includes("--empty"), log: console.log });
    for (const code of dli.DLI_CODES) {
      const items = r.index.content[code];
      console.log(`  ${dli.dliLanguageName(code)}: ${items.length ? `${items.length} item(s)` : "nothing yet (coming soon)"}`);
    }
    for (const [name, tally] of Object.entries(r.fixed)) console.log(`  Fixed on the way, ${name}: ${JSON.stringify(tally)}`);
    console.log(`Done: ${r.written} file(s) encrypted, ${r.kept} unchanged.`);
    for (const s of r.notes) console.log(`  Note: ${s}`);
    if (r.skipped.length) {
      console.log(`Left out (${r.skipped.length}):`);
      for (const s of r.skipped) console.log(`  ${s}`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
