// DESIGN.md's guard (the owner, 2026-11-27: "I want to ensure that these decisions are taken into consideration for all
// future design choices too"). A ratchet: it counts what DESIGN.md forbids in the stylesheets and the scripts' styles,
// and fails if any count goes UP compared with tests/fixtures/design-baseline.json. When you bring a count down, lower
// the baseline in the same commit (node tests/js/design.test.mjs --write-baseline), so the numbers can only shrink.
//
// What it counts (DESIGN.md's sections in brackets):
//   colour      a colour typed in directly (hex, rgb(), hsl()) anywhere but a token's definition in :root   [3]
//   radius      a border-radius that isn't 0, --r-s, --r-l, --r-pill or 50% (a circle)                      [6]
//   shadow      a box-shadow that isn't var(--shadow-float) or none                                          [6]
//   fontSize    a font size in px instead of the scale (--fs-12 ... --fs-48)                                 [4]
//   spacing     padding / margin / gap in px (over 1px) instead of the scale (--s-4 ... --s-64)              [5]
//   inline      a colour typed into a style="..." attribute or a .style.cssText string in a script           [3]
//   nestedCard  a piece of markup with a card inside a card (class="card" twice in one template)             [6]
// Fix the screen, not the baseline: a rule here beats a habit in the code (DESIGN.md). A real reason to break one goes
// to the owner first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BASELINE = join(ROOT, "tests/fixtures/design-baseline.json");
// Scripts that style other websites' pages (the in-app browser, the extensions' pages) are not the app's own screens.
const OTHER_PAGES = /vendor|browser-home|browser-toolbar|youtube-browser|netflix-browser|netflix-pad|reel-embed|reel-page/;

const RULES = {
  colour: "DESIGN.md §3 Colour: only the colour tokens; no colour is typed into a stylesheet or a script directly",
  radius: "DESIGN.md §6 Corners: only 0, --r-s, --r-l, --r-pill (and 50% for a circle)",
  shadow: "DESIGN.md §6 Depth: one shadow, --shadow-float, only on things that float above the page",
  fontSize: "DESIGN.md §4 Type: only the scale --fs-12 · 14 · 16 · 20 · 26 · 34 · 48",
  spacing: "DESIGN.md §5 Spacing: only the scale --s-4 · 8 · 12 · 16 · 24 · 32 · 48 · 64",
  inline: "DESIGN.md §3 Colour: no colour typed into a script's style=\"\" or cssText",
  nestedCard: "DESIGN.md §6 Surfaces: never a box inside a box",
};

const files = (dir, ext) => {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (name.endsWith(ext)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
};

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const RADIUS_OK = new Set(["0", "0px", "var(--r-s)", "var(--r-l)", "var(--r-pill)", "50%", "inherit", "/"]);

/** Count the forbidden values in CSS text (a stylesheet, or a script's style block). */
export function countCss(css, counts, where) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  // Innermost rules (inside @media too): selector { declarations }.
  for (const m of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const line = text.slice(0, m.index + m[1].length).split("\n").length;
    if (selector.startsWith("@font-face") || /^(from|to|\d+%)/.test(selector)) continue; // (fonts; keyframe steps)
    for (const decl of m[2].split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      const hit = (kind) => { counts[kind] = (counts[kind] || 0) + 1; (counts._where[kind] ||= []).push(`${where}:${line} ${selector.slice(-40)} { ${prop}: ${value.slice(0, 60)} }`); };
      if (prop.startsWith("--")) { if (!selector.includes(":root") && COLOUR.test(value)) hit("colour"); continue; }
      if (!prop.startsWith("mask") && !prop.startsWith("-webkit-mask") && COLOUR.test(value)) hit("colour");
      if (/^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/.test(prop)
          && value.split(/\s+/).some((v) => !RADIUS_OK.has(v.replace(/!important/, "")) && v !== "")) hit("radius");
      if (prop === "box-shadow" && !/^(none|var\(--shadow-float\))(\s*!important)?$/.test(value)) hit("shadow");
      if ((prop === "font-size" || prop === "font") && /\d(?:\.\d+)?px/.test(value)) hit("fontSize");
      if (/^(padding|margin)(-[a-z-]+)?$|^(row-|column-)?gap$/.test(prop)
          && [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].some((p) => Number(p[1]) > 1)
          && !/calc\(\(100%/.test(value)) hit("spacing");
    }
  }
}

const VOID = new Set(["img", "input", "br", "hr", "source", "meta", "link", "wbr", "track", "col", "area"]);
/** A piece of markup with an element of class "card" opened inside another one (not merely two cards side by side). */
export function cardInCard(markup) {
  const stack = [];
  for (const t of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const [, close, tag, attrs] = t;
    if (close) { const i = stack.map((s) => s.tag).lastIndexOf(tag.toLowerCase()); if (i >= 0) stack.length = i; continue; }
    if (VOID.has(tag.toLowerCase()) || attrs.endsWith("/")) continue;
    const card = /class="(?:[^"]*\s)?card(?:\s[^"]*)?"/.test(attrs);
    if (card && stack.some((s) => s.card)) return true;
    stack.push({ tag: tag.toLowerCase(), card });
  }
  return false;
}

/** Every count, over the stylesheets and the app's scripts. */
export function measure() {
  const counts = { colour: 0, radius: 0, shadow: 0, fontSize: 0, spacing: 0, inline: 0, nestedCard: 0, _where: {} };
  for (const f of [...files("web/css", ".css"), ...files("mobile/src/css", ".css")]) countCss(readFileSync(join(ROOT, f), "utf8"), counts, f);
  for (const f of [...files("web/js", ".js"), ...files("mobile/src/js", ".js")].filter((f) => !OTHER_PAGES.test(f))) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/style\.textContent = `([\s\S]*?)`;/g)) countCss(m[1], counts, f);
    for (const m of src.matchAll(/style="([^"]*)"|\.style\.cssText = "([^"]*)"/g)) {
      if (COLOUR.test(m[1] ?? m[2])) { counts.inline++; (counts._where.inline ||= []).push(`${f}: ${(m[1] ?? m[2]).slice(0, 80)}`); }
    }
    for (const m of src.matchAll(/`[^`]*`/g)) {
      if (cardInCard(m[0])) { counts.nestedCard++; (counts._where.nestedCard ||= []).push(`${f}: ${m[0].slice(0, 80).replace(/\s+/g, " ")}`); }
    }
  }
  return counts;
}

const current = measure();

if (process.argv.includes("--write-baseline")) {
  const { _where, ...plain } = current;
  writeFileSync(BASELINE, JSON.stringify({ about: "DESIGN.md's ratchet (tests/js/design.test.mjs): counts may only go down. Lower them when you fix things.", ...plain }, null, 2) + "\n");
  console.log("baseline written", plain);
}

test("DESIGN.md's rules: nothing it forbids comes back (a ratchet: counts may only go down)", () => {
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const worse = Object.keys(RULES).filter((k) => current[k] > (base[k] ?? 0));
  const message = worse.map((k) => `${RULES[k]}: ${current[k]} now, ${base[k] ?? 0} allowed. New ones (the last few found):\n  `
    + (current._where[k] || []).slice(-8).join("\n  ")).join("\n\n");
  assert.deepEqual(worse, [], `${message}\n\nFix the screen to follow DESIGN.md (read it first). Only if the owner agreed to an exception, raise tests/fixtures/design-baseline.json.`);
});

test("the baseline is no looser than it needs to be (lower it in the same commit when you fix things)", () => {
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const slack = Object.keys(RULES).filter((k) => (base[k] ?? 0) > current[k]);
  assert.deepEqual(slack, [], `Counts went down (well done): lower tests/fixtures/design-baseline.json to match, so they can't come back: `
    + slack.map((k) => `${k} ${base[k]} → ${current[k]}`).join(", ") + ". Run: node tests/js/design.test.mjs --write-baseline");
});
