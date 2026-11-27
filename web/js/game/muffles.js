// The Muffles: the village's folk (prototype "habitat_room"; the owner, 2026-11-25: "The Villagers are called Muffles").
// Pure: no screen code (habitat.js draws them and their speech bubbles; the art is tools/game_art/muffles.py).
//
// The lore (the owner's): the Muffles once spoke a language so full their village sang, until their words faded. Every
// word you learn wakes one of theirs. So a Muffle talks to you in the language you are learning, about where it is (the
// market, the tavern, the hall, the pier, the square), and the owner's rule: "every word they say will only show as
// random symbols unless the user knows that word, once a user knows that word it will show in the speech bubble".
// A word is known when it is one of your saved words that you know: remembered in the flashcards, or well known from
// battles (rules.js knownWords). Unknown words show as letters of their forgotten script (glyphs.png), the same letters
// every time for the same word.

import { wordKey } from "../coursedata.js";
import { wordRanges } from "../languages.js";
import { LINES } from "./muffle-lines.js";

/** Who lives where: each keeps its station (yard.js STATIONS) or walks about. x, y: where it stands (its feet, world
 * px); `walk`: the box it wanders in instead. `place`: what it talks about. */
export const FOLK = [
  { id: "grocer", x: 24 * 16 + 4, y: 66, place: "market" },
  { id: "tailor", x: 27 * 16 + 4, y: 66, place: "market" },
  { id: "baker", x: 30 * 16 + 4, y: 66, place: "market" },
  { id: "florist", x: 29 * 16 + 8, y: 124, place: "market" },
  { id: "barkeep", x: 36 * 16 + 10, y: 74, place: "tavern" },
  { id: "herald", x: 42 * 16, y: 74, place: "hall" },
  { id: "fisher", x: 54 * 16 + 10, y: 104, place: "pier" },
  { id: "villager1", x: 25 * 16, y: 100, place: "square", walk: [23 * 16, 88, 31 * 16, 118] },
  { id: "villager2", x: 40 * 16, y: 96, place: "square", walk: [33 * 16, 88, 48 * 16, 100] },
  // The market, alive (the owner, 2026-11-26: "muffles eating things on benches, cooking things, playing music (not
  // audible to player), dancing"): `act` is what each is busy with (POSE), at the bench, the pot, by the well.
  { id: "diner1", x: 22 * 16 + 9, y: 104, place: "market", act: "eat" },
  { id: "diner2", x: 23 * 16 + 9, y: 104, place: "square", act: "eat", phase: 0.5 },
  { id: "cook", x: 24 * 16 + 10, y: 124, place: "market", act: "cook" },
  { id: "musician", x: 28 * 16 + 6, y: 92, place: "square", act: "lute" },
  { id: "dancer1", x: 27 * 16 + 12, y: 112, place: "square", act: "dance" },
  { id: "dancer2", x: 29 * 16, y: 106, place: "square", act: "dance", phase: 0.5 },
  // Inside the championship hall (hall.js): the custodian behind the counter, who keeps the gym register.
  { id: "custodian", x: 9 * 16 + 8, y: 44, place: "hall", scene: "hall" },
];

/** Which frame of a Muffle's strip (tools/game_art/muffles.py POSES, 40 x 40 each) shows what. */
export const POSE = {
  front: 0, frontWalk: [1, 2], side: 3, sideWalk: [4, 5], back: 6, backWalk: [7, 8],
  eat: [9, 10], cook: [11, 12], lute: [13, 14], dance: [15, 16],
};
/** How long each frame of a busy Muffle lasts (ms). */
export const ACT_MS = { eat: 900, cook: 380, lute: 320, dance: 420 };
/** The frame a Muffle shows at time `now` (ms) and which way it faces (1 right, -1 left): busy with its `act`; walking
 * (`move`: {dx, dy}, the way it is going) side on, away or towards you, a step every 180 ms; else standing, facing you. */
export function poseOf(f, now, move = null) {
  const t = now + (f.phase || 0) * 1000;
  if (f.act && POSE[f.act]) {
    const k = Math.floor(t / ACT_MS[f.act]);
    if (f.act === "dance") return { frame: POSE.dance[k % 2], dir: k % 4 === 3 ? -1 : 1 }; // (it turns as it dances)
    return { frame: POSE[f.act][k % 2], dir: 1 };
  }
  if (move && (move.dx || move.dy)) {
    const step = Math.floor(t / 180) % 2;
    if (Math.abs(move.dx) >= Math.abs(move.dy) * 0.8) return { frame: POSE.sideWalk[step], dir: move.dx < 0 ? -1 : 1 };
    return { frame: (move.dy < 0 ? POSE.backWalk : POSE.frontWalk)[step], dir: 1 };
  }
  return { frame: POSE.front, dir: 1 };
}

// What they say, by place and by the language being learned: muffle-lines.js (every language Tamkeen teaches). A
// language with none: the Muffles speak only their own forgotten words (the whole line in glyphs).
export { LINES };

/** How many letters the forgotten script has (glyphs.png, 7 x 9 each, 1 apart). */
export const GLYPH_COUNT = 12;

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; };
const PUNCT = /^[\s.,!?¡¿،؛؟:;"'«»()…\-–—]+|[\s.,!?¡¿،؛؟:;"'«»()…\-–—]+$/g;

/** The letters of the forgotten script an unknown word shows as: 2 to 6 of them, by its length, the same every time. */
export function glyphsFor(word) {
  const w = String(word).replace(PUNCT, "");
  const n = Math.max(2, Math.min(6, Math.round([...w].length * 0.8)));
  let h = hash(w);
  const out = [];
  for (let i = 0; i < n; i++) { out.push(h % GLYPH_COUNT); h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; }
  return out;
}

// What may be written onto a word, so the word saved on its own is still found: Arabic's "و" (and), "ال" (the) and the
// like in front ("والسوق" is "سوق" saved); French, Italian and Catalan's l', d', qu'... in front ("l'eau" is "eau");
// Korean's particles behind ("사과는" is "사과").
const AR_FRONT = ["وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل"];
const ELIDED = /^(?:l|d|j|m|n|s|t|c|qu|lorsqu|puisqu|dell|dall|nell|sull|all|un)['’]/;
const KO_BACK = ["에서", "으로", "하고", "은", "는", "이", "가", "을", "를", "에", "의", "도", "로", "와", "과", "요"];
/** The forms a word in a line may be saved as: itself, and without what is written onto it. */
function formsOf(word, lang) {
  const k = wordKey(String(word).replace(PUNCT, ""), lang);
  const out = new Set([k]);
  if (lang === "ar") for (const p of AR_FRONT) if (k.startsWith(p) && k.length - p.length >= 2) out.add(k.slice(p.length));
  if (lang === "fr" || lang === "it" || lang === "ca") { const m = ELIDED.exec(k); if (m && k.length > m[0].length + 1) out.add(k.slice(m[0].length)); }
  if (lang === "ko") for (const p of KO_BACK) if (k.endsWith(p) && k.length - p.length >= 1) out.add(k.slice(0, -p.length));
  return [...out];
}

/** The keys of the words the owner knows (wordKey): their saved words (`vocab`: [{uid, text}]) that are remembered in
 * the flashcards (`learned`: a Set of uids) or well known from battles (`review`: game.review, box at least `mature`). */
export function knownKeys(vocab, learned, review, lang, mature = 4) {
  const out = new Set();
  for (const v of vocab || []) {
    const uid = String(v.uid || v.id);
    const r = review && review[uid];
    if ((learned && learned.has(uid)) || (Array.isArray(r) && r[0] >= mature)) out.add(wordKey(String(v.text || "").trim(), lang));
  }
  return out;
}

/** A line as the bubble shows it: [{text, known, glyphs}] word by word (`text` with the punctuation after it), and how
 * many of its words are known. Its words are found as the app's word popups find them (languages.wordRanges: at the
 * spaces, or for Japanese, Chinese and Thai by the word breaker). */
export function readLine(line, known, lang) {
  line = String(line);
  const ranges = wordRanges(line, lang);
  const out = ranges.map(([from, to], i) => {
    const word = line.slice(from, to);
    const text = line.slice(i ? from : 0, i + 1 < ranges.length ? ranges[i + 1][0] : line.length).trim();
    const forms = formsOf(word, lang);
    const ok = forms.some((k) => known.has(k));
    return { text, known: ok, glyphs: ok ? null : glyphsFor(word), key: forms[0] }; // (key: how a woken word is kept, farmuses.wake)
  });
  return { words: out, known: out.filter((w) => w.known).length, total: out.length };
}

/** A Muffle's next line for this language (by place), or null when there are none in it yet. `n`: how many it has said. */
export function lineFor(folk, lang, n = 0) {
  const lines = LINES[lang] && LINES[lang][folk.place];
  if (!lines || !lines.length) return null;
  return lines[(hash(folk.id) + n) % lines.length];
}
