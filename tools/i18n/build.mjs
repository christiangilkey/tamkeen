// Turn the translations into the dictionaries the app loads (web/i18n/<code>.json), checking them.
//   node tools/i18n/build.mjs              build every language; list what is missing or wrong
//   node tools/i18n/build.mjs --check      the same, failing (exit 1) if anything is missing or wrong
//   node tools/i18n/build.mjs --todo es    print the strings Spanish has no translation for, as
//                                          "id<TAB>English" lines, ready to be translated
//
// Translations live in tools/i18n/tr/<code>/*.txt, one per line: "id translation", where id is
// the string's id in strings.json (made by extract.mjs). "\n" in a translation is a line break.
// A translation must keep the English's formatting tags (<0>…</0>, <1/>) and use no {n} the
// English doesn't have; it may leave a {n} out (an English plural "s", say). "{0:lower}" puts the
// value in with a small first letter (a language name inside a Spanish sentence: "aprender inglés");
// "{0:upper}" with a capital one (a word that moves to the start of the line).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_LANGUAGE_CODES } from "../../web/js/i18n.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const strings = JSON.parse(readFileSync(join(here, "strings.json"), "utf8"));
const byId = new Map(strings.map((s) => [s.id, s.k]));
const CODES = UI_LANGUAGE_CODES.filter((c) => c !== "en");

const tags = (s) => (s.match(/<\/?\d+\/?>/g) || []).sort().join();
const holes = (s) => new Set((s.match(/\{\d+(?::lower|:upper)?\}/g) || []).map((h) => h.replace(/:\w+/, "")));

function read(code) {
  const dir = join(here, "tr", code);
  const out = new Map();
  const problems = [];
  if (!existsSync(dir)) return { out, problems };
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    const lines = readFileSync(join(dir, file), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.trim() || line.startsWith("#")) return;
      const m = /^([0-9a-f]{8})\s+(.*)$/.exec(line.trim());
      const id = m ? m[1] : "";
      const text = m ? m[2].trim().replace(/\\n/g, "\n") : "";
      const where = `${code}/${file}:${i + 1}`;
      if (!id || !text) { problems.push(`${where}: not "id translation"`); return; }
      const en = byId.get(id);
      if (en === undefined) return; // the English is gone from the app: nothing to translate
      if (tags(text) !== tags(en)) { problems.push(`${where}: tags differ from the English: ${en}`); return; }
      const extra = [...holes(text)].filter((h) => !holes(en).has(h));
      if (extra.length) { problems.push(`${where}: ${extra.join(" ")} is not in the English: ${en}`); return; }
      out.set(id, text);
    });
  }
  return { out, problems };
}

const todo = process.argv.indexOf("--todo");
if (todo >= 0) {
  const code = process.argv[todo + 1];
  const { out } = read(code);
  for (const s of strings) if (!out.has(s.id)) console.log(`${s.id}\t${s.k}`);
  process.exit(0);
}

let bad = false;
mkdirSync(join(root, "web", "i18n"), { recursive: true });
for (const code of CODES) {
  const { out, problems } = read(code);
  const dict = {};
  for (const s of strings) if (out.has(s.id)) dict[s.k] = out.get(s.id);
  writeFileSync(join(root, "web", "i18n", `${code}.json`), JSON.stringify(dict, null, 0).replace(/","/g, '",\n"') + "\n");
  const missing = strings.length - Object.keys(dict).length;
  console.log(`${code}: ${Object.keys(dict).length}/${strings.length} translated${missing ? `, ${missing} missing` : ""}`);
  for (const p of problems) console.log(`  ${p}`);
  if (missing || problems.length) bad = true;
}
if (process.argv.includes("--check") && bad) process.exit(1);
