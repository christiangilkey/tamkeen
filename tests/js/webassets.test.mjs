// Every picture the game asks for, and every file the stylesheets point at, is in web/ under exactly that name.
// Windows finds "Egg/Spark.png" for "egg/spark.png"; GitHub Pages (learntamkeen.com) doesn't, so a picture can show
// on the computer and be missing on the web app. existsSync alone can't tell: the names are compared here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { artFiles } from "../../web/js/game/data.js";

const web = fileURLToPath(new URL("../../web/", import.meta.url));
const mobileSrc = fileURLToPath(new URL("../../mobile/src/", import.meta.url));
const names = (root) => {
  const out = new Set();
  (function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.add(relative(root, p).split(sep).join("/")); } })(root);
  return out;
};
const files = names(web);

test("every game picture is there under exactly its name (upper and lower case too)", () => {
  const missing = [...new Set(artFiles().map((f) => `game-art/${f.file}`))].filter((f) => !files.has(f));
  assert.deepEqual(missing, []);
});

test("the stylesheets' pictures and fonts are there under exactly their names", () => {
  const wrong = [];
  for (const [root, list] of [[web, [...files]], [mobileSrc, [...names(mobileSrc)]]]) {
    // (the app's own stylesheets: anki-card/ is the Anki card's, whose font is in Anki's media folder)
    for (const css of list.filter((f) => /^css\/.*\.css$/.test(f))) {
      const text = readFileSync(join(root, css), "utf8");
      for (const [, ref] of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        if (/^(data:|https?:|#)/.test(ref)) continue;
        // (the web app is served from the top of its address, and the stylesheet sits in css/)
        const target = ref.startsWith("/") ? ref.slice(1) : relative(web, resolve(web, dirname(css), ref)).split(sep).join("/");
        if (!files.has(target)) wrong.push(`${css}: ${ref}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});
