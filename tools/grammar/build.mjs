// Check the grammar courses and publish them with the website (tools/grammar/README.md).
//   node tools/grammar/build.mjs            every course in tools/grammar/<from>-<to>/lessons.json
//   node tools/grammar/build.mjs en-ar      just that one
// Writes docs/grammar/<from>-<to>/course.json and the course's entry in docs/grammar/index.json (the
// other courses' entries are kept). Stops, listing what is wrong, if a course doesn't pass the checks
// (web/js/grammardata.js checkCourse). The output has no date in it, so building twice gives the same
// files and tests/js/grammar.test.mjs can tell whether the published copy is up to date.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCourse, lessonVersion } from "../../web/js/grammardata.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
export const PUBLISHED = join(root, "docs", "grammar");
const PAIR = /^[a-z]{2,3}-[a-z]{2,3}$/;

/** The courses written so far: ["en-ar", …]. */
export function sources() {
  return readdirSync(here).filter((n) => PAIR.test(n) && existsSync(join(here, n, "lessons.json"))).sort();
}

export const readSource = (id) => JSON.parse(readFileSync(join(here, id, "lessons.json"), "utf8"));

/** A course as published: {problems, text (course.json), entry (its line in index.json)}. */
export function buildCourse(id, source = readSource(id)) {
  const problems = checkCourse(source, { languages: LANGUAGE_CODES });
  if (`${source.from}-${source.to}` !== id) problems.unshift(`course: its folder is ${id} but it says ${source.from}-${source.to}`);
  const course = {
    format: 1,
    id,
    from: source.from,
    to: source.to,
    title: source.title,
    variety: source.variety || "",
    about: source.about,
    reading: source.reading || "",
    units: source.units,
    lessons: (source.lessons || []).map((l) => ({ ...l, v: lessonVersion(l) })),
  };
  const text = `${JSON.stringify(course)}\n`;
  const levels = [...new Set(course.lessons.map((l) => l.level))];
  const entry = {
    file: `${id}/course.json`,
    from: course.from,
    to: course.to,
    title: course.title,
    variety: course.variety,
    units: course.units.length,
    lessons: course.lessons.length,
    levels,
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
  };
  return { problems, text, entry };
}

export function readIndex() {
  const path = join(PUBLISHED, "index.json");
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return { format: 1, courses: {} }; }
}

function main(args) {
  const ids = args.length ? args : sources();
  let failed = false;
  const index = readIndex();
  index.format = 1;
  index.courses = index.courses || {};
  for (const id of ids) {
    if (!PAIR.test(id) || !existsSync(join(here, id, "lessons.json"))) {
      console.error(`${id}: there is no tools/grammar/${id}/lessons.json`);
      failed = true;
      continue;
    }
    const { problems, text, entry } = buildCourse(id);
    if (problems.length) {
      failed = true;
      console.error(`${id}: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
      for (const p of problems) console.error(`  - ${p}`);
      continue;
    }
    mkdirSync(join(PUBLISHED, id), { recursive: true });
    writeFileSync(join(PUBLISHED, id, "course.json"), text);
    index.courses[id] = entry;
    console.log(`${id}: ${entry.lessons} lessons in ${entry.units} units (${entry.levels.join(", ")}), ${Math.round(entry.bytes / 1024)} KB`);
  }
  index.courses = Object.fromEntries(Object.keys(index.courses).sort().map((k) => [k, index.courses[k]]));
  mkdirSync(PUBLISHED, { recursive: true });
  writeFileSync(join(PUBLISHED, "index.json"), `${JSON.stringify(index, null, 1)}\n`);
  if (failed) process.exitCode = 1;
}

const invoked = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) main(process.argv.slice(2));
