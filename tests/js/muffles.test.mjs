// The Muffles (prototype "habitat_room", web/js/game/muffles.js; art tools/game_art/muffles.py): the village's folk, and
// the owner's rule for what they say: "every word they say will only show as random symbols unless the user knows that
// word, once a user knows that word it will show in the speech bubble of the message".
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FOLK, GLYPH_COUNT, LINES, glyphsFor, knownKeys, lineFor, readLine } from "../../web/js/game/muffles.js";
import { STATIONS } from "../../web/js/game/yard.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

const art = (f) => new URL(`../../web/game-art/muffle/${f}`, import.meta.url);

test("every Muffle has its picture (one of the three hooded bodies, its job on top), and every station its keeper", () => {
  for (const f of FOLK) assert.ok(existsSync(art(`${f.id}.png`)), f.id);
  assert.ok(existsSync(art("glyphs.png")), "the forgotten script");
  const jobs = new Set(FOLK.map((f) => f.id));
  for (const st of STATIONS) assert.ok(jobs.has(st.job), `${st.id}'s ${st.job}`);
  assert.ok(FOLK.filter((f) => f.walk).length >= 2, "some just walk about");
});

test("lines for each place in every language Tamkeen teaches (6-8 a place); a language without any gets their own words only", () => {
  for (const lang of LANGUAGE_CODES) for (const place of ["market", "tavern", "hall", "pier", "square"]) {
    const ls = LINES[lang] && LINES[lang][place];
    assert.ok(ls && ls.length >= 6 && ls.length <= 8, `${lang} ${place}`);
    for (const l of ls) assert.ok(l.length > 3 && l.length <= 80, `${lang}: "${l}" is short`);
  }
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

test("words are found as the app finds them: Japanese, Chinese and Thai by the word breaker, Korean's particles and French l' seen through", () => {
  const ja = readLine("今日は海が静かです。", new Set(["海"]), "ja");
  assert.ok(ja.total >= 4, "split into words, not one long one");
  assert.equal(ja.known, 1);
  assert.equal(readLine("사과는 빨갛고 바나나는 노래요.", new Set(["사과", "바나나"]), "ko").known, 2);
  assert.equal(readLine("L'eau est froide mais belle.", new Set(["eau", "belle"]), "fr").known, 2);
  assert.equal(readLine("Der Apfel ist rot.", new Set(["apfel"]), "de").known, 1, "capitals don't matter");
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
