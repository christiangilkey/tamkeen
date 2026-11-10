// Run with: node --test tests/js/
// The colourings earned by feats done while a creature is the main one (game/data.js FEATS, rules.featUp): the counts
// per creature, the no-skipping book rule, "watched / heard to near the end" (playcover.js), and how they are drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATS, VARIANTS, featVariant } from "../../web/js/game/data.js";
import { describe, featCount, newGenome } from "../../web/js/game/genome.js";
import {
  BOOK_DONE, PAGE_MIN, PAGE_WPM, claimRaid, earn, featUp, finishedEpisode, newState, normalize, pageNeeds, readPage, reshape, setActive,
  variantOptions,
} from "../../web/js/game/rules.js";
import { DONE_SHARE, STEP, loadCover, nearEnd, newCover, saveCover, share, track } from "../../web/js/playcover.js";
import { FORM_KINDS, formFinish, formParticles, formPixels, formRows, formSweep } from "../../web/js/game/forms.js";
import { cleanGenome } from "../../web/js/game/remote.js";

const at = (iso) => new Date(iso);
/** A state with two hatched creatures (both juveniles), the first one out. */
function twoCreatures() {
  const s = newState(7);
  s.roster.push(newGenome(99, "tide"));
  for (const g of s.roster) g.growth = 0.35;
  return s;
}

test("every feat has a colouring, and every colouring of a feat has its goal", () => {
  for (const kind of Object.keys(FEATS)) assert.ok(VARIANTS[featVariant(kind)], kind);
  const feats = Object.values(VARIANTS).filter((v) => v.feat).map((v) => v.feat);
  assert.deepEqual(feats.sort(), Object.keys(FEATS).sort(), "one colouring per feat");
  assert.equal(FEATS.words.goal, 200);
  assert.equal(FEATS.listen.goal, 10 * 3600, "10 hours, counted in seconds");
  assert.equal(FEATS.cards.goal, 1000);
  assert.equal(FEATS.book.goal, 1);
  assert.equal(FEATS.netflix.goal, 10);
  assert.equal(FEATS.raid.goal, 1);
  assert.equal(FEATS.podcast.goal, 10);
  for (const id of Object.keys(VARIANTS).filter((k) => VARIANTS[k].feat)) assert.ok(FORM_KINDS.has(id), `${id} is drawn by forms.js`);
});

test("feats are counted per creature, and only for the main one", () => {
  const s = twoCreatures();
  const [a, b] = s.roster;
  const now = at("2026-11-09T10:00:00");
  for (let i = 0; i < 5; i++) earn(s, { type: "save" }, { now });
  earn(s, { type: "review" }, { now, rand: () => 0.5 });
  earn(s, { type: "study", seconds: 30, mode: "listen" }, { now });
  earn(s, { type: "study", seconds: 30, mode: "read" }, { now });
  earn(s, { type: "study", seconds: 30, mode: "listen", source: "youtube" }, { now });
  assert.equal(featCount(a, "words"), 5);
  assert.equal(featCount(a, "cards"), 1);
  assert.equal(featCount(a, "listen"), 30, "listening counts; reading doesn't; YouTube earns nothing (UNPAID_TIME)");
  assert.equal(featCount(b, "words"), 0, "the creature not out counts nothing");
  setActive(s, 1);
  earn(s, { type: "save" }, { now });
  assert.equal(featCount(a, "words"), 5, "its count stays put while another is out");
  assert.equal(featCount(b, "words"), 1);
  // Past the day's fade a saved word pays nothing, but it still counts toward the colouring.
  for (let i = 0; i < 80; i++) earn(s, { type: "save" }, { now });
  assert.equal(featCount(b, "words"), 81);
});

test("reaching a feat's goal opens its colouring for that creature, and says so once", () => {
  const s = twoCreatures();
  const g = s.creature;
  const now = at("2026-11-09T10:00:00");
  let told = [];
  for (let i = 0; i < 200; i++) { const r = earn(s, { type: "save" }, { now }); if (r && r.colouring) told.push(r.colouring); }
  assert.deepEqual(told, ["glyph"], "the 200th word earns Glyph, and only it says so");
  const opt = variantOptions(s, g).find((o) => o.id === "glyph");
  assert.ok(opt.open);
  assert.deepEqual(opt.progress, [200, 200]);
  reshape(s, 0, { variant: "glyph" });
  assert.equal(g.variant, "glyph");
  assert.equal(describe(g).tint.kind, "glyph");
  assert.ok(!variantOptions(s, s.roster[1]).find((o) => o.id === "glyph").open, "the other creature hasn't earned it");
  reshape(s, 1, { variant: "glyph" });
  assert.equal(s.roster[1].variant, null);
  // Listening shows in hours.
  featUp(s, "listen", 3.5 * 3600);
  assert.deepEqual(variantOptions(s, g).find((o) => o.id === "synth").progress, [3.5, 10]);
  told = [];
  for (let i = 0; i < 1000; i++) { const r = earn(s, { type: "review" }, { now, rand: () => 0.5 }); if (r && r.colouring) told.push(r.colouring); }
  assert.deepEqual(told, ["holo"]);
});

test("older saves load with every count at 0; nonsense in a save is dropped", () => {
  const s = newState(3);
  delete s.roster[0].feats;
  delete s.reading;
  delete s.finished;
  const back = normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.roster[0].feats, {});
  assert.deepEqual(back.reading, {});
  assert.deepEqual(back.finished, { netflix: [], podcast: [] });
  s.roster[0].feats = { words: 12, cards: "x", listen: -5, __proto__: { words: 1e12 }, nope: 3 };
  const n = normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(n.roster[0].feats, { words: 12 });
});

test("a friend's creature keeps a colouring the game knows (a new one too), and nothing else", () => {
  const g = cleanGenome({ seed: 5, type: "ember", growth: 0.5, variant: "holo" });
  assert.equal(g.variant, "holo");
  assert.equal(describe(g).tint.kind, "holo");
  assert.equal(cleanGenome({ seed: 5, type: "ember", growth: 0.5, variant: "constructor" }).variant, null);
  assert.equal(cleanGenome({ seed: 5, type: "ember", growth: 0.5, variant: "rainbow" }).variant, null);
});

test("an episode watched or heard to the end counts once, for the creature out at the time", () => {
  const s = twoCreatures();
  const r = finishedEpisode(s, "podcast", "ep-1");
  assert.deepEqual([r.n, r.goal, r.colouring], [1, 10, null]);
  assert.equal(finishedEpisode(s, "podcast", "ep-1"), null, "the same episode again counts nothing");
  assert.equal(finishedEpisode(s, "youtube", "x"), null);
  assert.equal(finishedEpisode(s, "netflix", ""), null);
  for (let i = 2; i <= 9; i++) finishedEpisode(s, "podcast", `ep-${i}`);
  assert.equal(finishedEpisode(s, "podcast", "ep-10").colouring, "chorus");
  setActive(s, 1);
  finishedEpisode(s, "netflix", "81946364");
  assert.equal(featCount(s.roster[0], "netflix"), 0);
  assert.equal(featCount(s.roster[1], "netflix"), 1);
});

test("beating a raid boss earns Raidforged for the creature out", () => {
  const s = twoCreatures();
  const pay = claimRaid(s, at("2026-11-09T10:00:00"));
  assert.equal(pay.colouring, "molten");
  assert.ok(variantOptions(s, s.roster[0]).find((o) => o.id === "molten").open);
  assert.ok(!variantOptions(s, s.roster[1]).find((o) => o.id === "molten").open);
  assert.equal(claimRaid(s, at("2026-11-10T10:00:00")), null, "once a week");
});

// ---------- the book rule ----------
const N = 30000; // words in the book
const PAGE = 250; // words a page
/** Read pages [from, to) of the book (page numbers), each for long enough. */
const readPages = (s, key, from, to) => { let r = null; for (let p = from; p < to; p++) r = readPage(s, key, { from: p * PAGE, to: Math.min(N, (p + 1) * PAGE), total: N }) || r; return r; };
const LAST = N / PAGE; // 120 pages

test("a page counts only after long enough on screen to read it", () => {
  assert.equal(pageNeeds(PAGE), (PAGE * 60) / PAGE_WPM, "250 words: 37.5 seconds at the fastest reading that counts");
  assert.equal(pageNeeds(3), PAGE_MIN, "a page with a heading on it still needs a moment");
});

test("skipping to the end of a book doesn't finish it", () => {
  const s = twoCreatures();
  const r = readPages(s, "book1", LAST - 1, LAST); // only the last page
  assert.equal(r.done, false);
  assert.ok(r.share < 0.01);
  assert.equal(featCount(s.creature, "book"), 0);
  // Reading most of it, then the end: finished.
  readPages(s, "book1", 0, Math.ceil(LAST * BOOK_DONE) - 2);
  const end = readPages(s, "book1", LAST - 2, LAST);
  assert.equal(end.done, true);
  assert.equal(end.credited, true);
  assert.equal(end.colouring, "papercut");
  assert.equal(featCount(s.creature, "book"), 1);
  // It counts once: reading it again counts nothing.
  const again = readPages(s, "book1", 0, LAST);
  assert.equal(again.colouring, null);
  assert.equal(featCount(s.creature, "book"), 1);
});

test("reading most of a book but not its end doesn't finish it; reading the end later does", () => {
  const s = twoCreatures();
  const r = readPages(s, "book2", 0, LAST - 5);
  assert.equal(r.done, false, "the last page hasn't been read");
  assert.ok(r.share > 0.9);
  assert.equal(readPages(s, "book2", LAST - 5, LAST).done, true);
});

test("a book read partly with another creature out counts for the one that read most of it, if it's out at the end", () => {
  const s = twoCreatures();
  readPages(s, "book3", 0, 70);      // creature 0 reads 70 of 120 pages
  setActive(s, 1);
  const end = readPages(s, "book3", 70, LAST); // creature 1 reads the rest and finishes it
  assert.equal(end.done, true);
  assert.equal(end.credited, false, "creature 1 read less than half: it doesn't count for it");
  assert.equal(featCount(s.roster[1], "book"), 0);
  assert.equal(featCount(s.roster[0], "book"), 0, "nor for creature 0, which wasn't out when it was finished");
  // Mostly with creature 1 out, finished with it out: it counts for creature 1.
  const t = twoCreatures();
  readPages(t, "book4", 0, 20);
  setActive(t, 1);
  assert.equal(readPages(t, "book4", 20, LAST).credited, true);
  assert.equal(featCount(t.roster[1], "book"), 1);
});

test("reading the same pages again doesn't count twice toward the share", () => {
  const s = twoCreatures();
  readPages(s, "book5", 0, 10);
  readPages(s, "book5", 0, 10);
  const r = readPages(s, "book5", 0, 10);
  assert.ok(Math.abs(r.share - 10 / LAST) < 0.001);
  assert.equal(readPage(s, "__proto__", { from: 0, to: 10, total: 100 }), null);
  assert.equal(readPage(s, "b", { from: 5, to: 5, total: 100 }), null, "an empty page counts nothing");
});

// ---------- near the end, without skipping (playcover.js) ----------
/** Play `c` from `from` to `to` seconds at `rate`, the player saying where it is every `tick` seconds of real time. */
function play(c, from, to, { rate = 1, tick = 0.25, wall0 = 0 } = {}) {
  let wall = wall0, t = from, done = false;
  track(c, t, true, rate, wall);
  while (t < to) { wall += tick * 1000; t = Math.min(to, t + tick * rate); if (track(c, t, true, rate, wall)) done = true; }
  return { done, wall };
}

test("near the end: the last 10%, at most the last 3 minutes, at least the last 20 seconds", () => {
  assert.equal(nearEnd(2700 - 181, 2700), false);
  assert.equal(nearEnd(2700 - 179, 2700), true, "a 45-minute episode: its last 3 minutes");
  assert.equal(nearEnd(600 - 61, 600), false);
  assert.equal(nearEnd(600 - 59, 600), true, "a 10-minute one: its last minute");
  assert.equal(nearEnd(100 - 21, 100), false);
  assert.equal(nearEnd(100 - 19, 100), true, "a short one: its last 20 seconds");
});

test("an episode played through counts; at double speed too", () => {
  const c = newCover(1800);
  assert.equal(play(c, 0, 1800).done, true);
  assert.equal(share(c) >= DONE_SHARE, true);
  const fast = newCover(1800);
  assert.equal(play(fast, 0, 1800, { rate: 2 }).done, true);
});

test("skipping to the end doesn't count, nor seeking through it", () => {
  const c = newCover(1800);
  play(c, 0, 60);
  assert.equal(play(c, 1700, 1800, { wall0: 1e6 }).done, false, "a minute, then a jump to the end");
  // Seeking ahead in steps of a minute, playing a few seconds each time.
  const d = newCover(1800);
  let wall = 0, done = false;
  for (let t = 0; t < 1800; t += 60) { const r = play(d, t, t + 3, { wall0: wall }); wall = r.wall + 5000; done = done || r.done; track(d, t + 3, false); }
  assert.equal(done, false);
  assert.ok(share(d) < 0.2);
  // The skip button (10 s ahead) every 15 s: a third of it skipped.
  const e = newCover(1800);
  wall = 0; done = false;
  for (let t = 0; t < 1800; t += 15) { const r = play(e, t, Math.min(1800, t + 5), { wall0: wall }); wall = r.wall; done = done || r.done; }
  assert.equal(done, false, "only a third of it really played");
  assert.ok(share(e) < DONE_SHARE);
});

test("a pause or replaying a part doesn't add up to more than was played", () => {
  const c = newCover(600);
  play(c, 0, 300);
  track(c, 300, false);
  play(c, 0, 300, { wall0: 1e6 }); // the first half again
  assert.ok(Math.abs(share(c) - 300 / 600) < 2 * STEP / 600);
  assert.equal(play(c, 300, 600, { wall0: 2e6 }).done, true, "then the second half: done");
  assert.equal(track(c, 600, true, 1, 3e6), false, "it says so only once");
});

test("what was played is kept, so an episode can be finished another day", () => {
  const store = new Map();
  const fake = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const c = loadCover("podcast:e1", 1200, fake);
  play(c, 0, 1000);
  saveCover("podcast:e1", c, fake);
  const later = loadCover("podcast:e1", 1200, fake);
  assert.ok(Math.abs(share(later) - share(c)) < 1e-9);
  assert.equal(play(later, 1000, 1200).done, true);
  assert.equal(share(loadCover("podcast:e1", 3000, fake)), 0, "another length: another episode");
  for (let i = 0; i < 60; i++) saveCover(`podcast:x${i}`, newCover(100), fake);
  assert.ok([...store.keys()].filter((k) => k.startsWith("cover:podcast")).length <= 40, "only the newest are kept");
});

// ---------- how they are drawn (forms.js) ----------
/** A small made-up creature: a blob of mid colours with a dark edge and a white eye glint. */
function blob(w = 40, h = 40) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 20, y - 22);
    if (d > 14) continue;
    const i = (y * w + x) * 4;
    const [r, g, b] = d > 13 ? [27, 20, 32] : x === 24 && y === 18 ? [255, 255, 255] : [200 - y * 2, 90 + x, 60];
    px.set([r, g, b, 255], i);
  }
  return px;
}

test("each colouring looks clearly different from the creature and from the others", () => {
  const base = blob();
  const looks = {};
  for (const kind of FORM_KINDS) {
    const px = base.slice();
    formPixels(px, 40, 40, kind, [6, 8, 34, 36]);
    formFinish(px, 40, 40, kind, 0, 0, [6, 8, 34, 36]);
    looks[kind] = px;
    let changed = 0;
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - base[i]) + Math.abs(px[i + 1] - base[i + 1]) + Math.abs(px[i + 2] - base[i + 2]) + Math.abs(px[i + 3] - base[i + 3]) > 40) changed++;
    assert.ok(changed > 200, `${kind} changes much of the creature (${changed} pixels)`);
  }
  const kinds = [...FORM_KINDS];
  for (let a = 0; a < kinds.length; a++) for (let b = a + 1; b < kinds.length; b++) {
    let diff = 0;
    const p = looks[kinds[a]], q = looks[kinds[b]];
    for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) + Math.abs(p[i + 3] - q[i + 3]) > 60) diff++;
    assert.ok(diff > 150, `${kinds[a]} and ${kinds[b]} differ (${diff} pixels)`);
  }
  // The eye's glint stays white where the colouring keeps whites.
  for (const kind of ["glyph", "synth", "holo", "chorus"]) assert.deepEqual([...looks[kind].slice((18 * 40 + 24) * 4, (18 * 40 + 24) * 4 + 3)].map((v) => v > 200), [true, true, true], kind);
});

test("the colourings' movement is light: a few particles, a ripple or a glitch only now and then", () => {
  for (const kind of FORM_KINDS) {
    for (let ms = 0; ms < 6000; ms += 97) {
      const parts = formParticles(kind, ms, [12, 20, 76, 87], 3);
      assert.ok(parts.length <= 60, `${kind}: ${parts.length} particles`);
      for (const p of parts) assert.ok(p.a > 0 && p.a <= 1 && Number.isInteger(p.x) && Number.isInteger(p.y));
    }
  }
  let glitching = 0;
  for (let ms = 0; ms < 23000; ms += 10) if (formRows("broadcast", ms, 1)) glitching++;
  assert.ok(glitching > 0 && glitching < 2300 * 0.12, "Broadcast glitches now and then");
  assert.equal(formRows("glyph", 500), null);
  assert.ok(formSweep("holo", 100) && formSweep("holo", 2000) === null, "the foil shine sweeps by, then rests");
  // the same moment draws the same (nothing random): a frame can be redrawn and look the same
  assert.deepEqual(formParticles("molten", 1234, [0, 0, 60, 60], 5), formParticles("molten", 1234, [0, 0, 60, 60], 5));
});
