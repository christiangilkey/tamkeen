// Tidy a course's lessons.json into the house layout (one block, example, row or question per line),
// optionally adding lessons from other files first.
//   node tools/grammar/format.mjs en-ar                     tidy tools/grammar/en-ar/lessons.json
//   node tools/grammar/format.mjs en-ar more.json …         add the lessons in more.json (a JSON list of
//                                                            lessons, or {"lessons": [...]}) at the end, then tidy
// A lesson whose id is already in the course is replaced where it stands instead of added.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const j = (v) => JSON.stringify(v);

/** The course as text, in the house layout. */
export function formatCourse(course) {
  const out = ["{"];
  const head = Object.entries(course).filter(([k]) => k !== "units" && k !== "lessons");
  for (const [k, v] of head) out.push(`  ${j(k)}: ${j(v)},`);
  out.push(`  "units": [`);
  (course.units || []).forEach((u, i, a) => out.push(`    ${j(u)}${i < a.length - 1 ? "," : ""}`));
  out.push("  ],");
  out.push(`  "lessons": [`);
  (course.lessons || []).forEach((l, i, a) => {
    out.push(...formatLesson(l).map((line) => `    ${line}`));
    if (i < a.length - 1) out[out.length - 1] += ",";
  });
  out.push("  ]");
  out.push("}");
  return `${out.join("\n")}\n`;
}

function formatLesson(l) {
  const lines = ["{"];
  const keys = Object.keys(l);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? "," : "";
    const v = l[k];
    if (k === "blocks") {
      lines.push(`  "blocks": [`);
      v.forEach((b, bi) => {
        const c = bi < v.length - 1 ? "," : "";
        if (Array.isArray(b.ex)) {
          lines.push(`    { "ex": [`);
          b.ex.forEach((e, ei) => lines.push(`      ${j(e)}${ei < b.ex.length - 1 ? "," : ""}`));
          lines.push(`    ] }${c}`);
        } else if (Array.isArray(b.table)) {
          lines.push(`    { "table": [`);
          b.table.forEach((r, ri) => lines.push(`      ${j(r)}${ri < b.table.length - 1 ? "," : ""}`));
          lines.push(`    ] }${c}`);
        } else lines.push(`    ${j(b)}${c}`);
      });
      lines.push(`  ]${comma}`);
    } else if ((k === "mistakes" || k === "practice") && Array.isArray(v)) {
      lines.push(`  ${j(k)}: [`);
      v.forEach((x, xi) => lines.push(`    ${j(x)}${xi < v.length - 1 ? "," : ""}`));
      lines.push(`  ]${comma}`);
    } else lines.push(`  ${j(k)}: ${j(v)}${comma}`);
  });
  lines.push("}");
  return lines;
}

function main([id, ...more]) {
  if (!id) { console.error("usage: node tools/grammar/format.mjs <from>-<to> [more-lessons.json …]"); process.exitCode = 1; return; }
  const path = join(here, id, "lessons.json");
  const course = JSON.parse(readFileSync(path, "utf8"));
  for (const file of more) {
    const data = JSON.parse(readFileSync(resolve(file), "utf8"));
    for (const lesson of Array.isArray(data) ? data : data.lessons || []) {
      const at = course.lessons.findIndex((l) => l.id === lesson.id);
      if (at >= 0) course.lessons[at] = lesson; else course.lessons.push(lesson);
    }
  }
  writeFileSync(path, formatCourse(course));
  console.log(`${id}: ${course.lessons.length} lessons`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) main(process.argv.slice(2));
