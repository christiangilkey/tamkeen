// The Muffles (prototype "habitat_room", web/js/game/muffles.js; art tools/game_art/muffles.py): the village's folk, and
// the owner's rule for what they say: "every word they say will only show as random symbols unless the user knows that
// word, once a user knows that word it will show in the speech bubble of the message".
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FOLK, GLYPH_COUNT, LINES, glyphsFor, knownKeys, lineFor, readLine } from "../../web/js/game/muffles.js";
import { STATIONS } from "../../web/js/game/yard.js";

const art = (f) => new URL(`../../web/game-art/muffle/${f}`, import.meta.url);

test("every Muffle has its picture (one of the three hooded bodies, its job on top), and every station its keeper", () => {
  for (const f of FOLK) assert.ok(existsSync(art(`${f.id}.png`)), f.id);
  assert.ok(existsSync(art("glyphs.png")), "the forgotten script");
  const jobs = new Set(FOLK.map((f) => f.id));
  for (const st of STATIONS) assert.ok(jobs.has(st.job), `${st.id}'s ${st.job}`);
  assert.ok(FOLK.filter((f) => f.walk).length >= 2, "some just walk about");
});

test("lines for each place in Arabic and Spanish; another language gets their own words only", () => {
  for (const lang of ["ar", "es"]) for (const place of ["market", "tavern", "hall", "pier", "square"]) assert.ok(LINES[lang][place].length >= 6, `${lang} ${place}`);
  const grocer = FOLK.find((f) => f.id === "grocer");
  assert.equal(lineFor(grocer, "zz"), null);
  assert.notEqual(lineFor(grocer, "ar", 0), lineFor(grocer, "ar", 1), "it says something else next time");
});

test("a word shows when it is known; the rest are letters of the forgotten script, the same ones every time", () => {
  const ar = readLine("التفاح أحمر والموز أصفر.", new Set(["تفاح", "موز"]), "ar");
  assert.deepEqual(ar.words.map((w) => w.known), [true, false, true, false], "'the' and 'and' in front are seen through");
  assert.equal(ar.known, 2);
  assert.equal(ar.total, 4);
  const es = readLine("¡Hola! Hoy tengo fruta fresca.", new Set(["hola", "fruta"]), "es");
  assert.deepEqual(es.words.map((w) => w.known), [true, false, false, true, false]);
  assert.equal(es.words[0].text, "¡Hola!", "shown with its punctuation");
  const g = glyphsFor("أحمر");
  assert.deepEqual(g, glyphsFor("أحمر"));
  assert.ok(g.length >= 2 && g.length <= 6 && g.every((i) => i >= 0 && i < GLYPH_COUNT));
  assert.equal(es.words[1].glyphs.length, glyphsFor("Hoy").length);
});

test("known: saved words remembered in the flashcards or well known from battles, not just saved", () => {
  const vocab = [{ uid: "a", text: "تفاح" }, { uid: "b", text: "موز" }, { uid: "c", text: "خبز" }];
  const keys = knownKeys(vocab, new Set(["a"]), { b: [4, 0, 3, 0], c: [1, 0, 1, 0] }, "ar");
  assert.deepEqual([...keys].sort(), ["تفاح", "موز"].sort());
});

test("habitat.js: tap a Muffle and it speaks; it speaks as the creature passes; the bubble's glyphs are pictures", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes("if (mf) { muffleSpeak(mf); return; }"));
  assert.ok(h.includes("Math.hypot(f.x - pet.x, (f.y - pet.y) * 1.5) < 30"));
  const css = readFileSync(new URL("../../web/css/app.css", import.meta.url), "utf8");
  assert.ok(css.includes('url("../game-art/muffle/glyphs.png")'));
});
