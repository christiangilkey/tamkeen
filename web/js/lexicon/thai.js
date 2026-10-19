// Thai: how a word is said, in Latin letters with tone marks (Paiboon style: สวัสดี -> sà-wàt-dii),
// drawn small over Thai text by ./readings.js.
//
// Thai is written without spaces; the device's word breaker (Intl.Segmenter, languages.js) cuts it
// into words, and each word is looked up in the reading table (docs/lexicon/th-readings.json.gz, made
// by tools/build_thai_readings.py from English Wiktionary). A word the table lacks is often two
// words it has, written together (ก็คือ = ก็ + คือ): it is read as those, but only when the pieces are
// whole words of the table that spell it exactly, a two-letter piece only when it is a common word
// (กรอก is not กร + อก), and no piece but the last comes from Pali or Sanskrit (their compounds add a
// syllable where the parts meet: กรรมการ is gam-má-gaan, not gam + gaan). Otherwise the word gets no
// reading: a gap is better than a wrong one. tools/build_thai_readings.py says how often a join is right.
//
// The file holds {format: 1, kind: "th", words: {word: reading, or [readings, likeliest first]},
// short: [two-letter words that may be a piece], nojoin: [words a join may not continue after]}.
// No screen or network code here.

const THAI = /^[\u0E00-\u0E7F]+$/;
// Marks that sit on the letter before them (vowels above and below, tone marks, ๆ's cousins): a word
// never starts with one, so a piece of a word can't either.
const MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
// Vowels written before the consonant they follow in speech: a piece can't end with one.
const LEADING = /[\u0E40-\u0E44]$/;
const MAX_PIECES = 4;

export class ThaiReadings {
  constructor(data) {
    if (!data || data.format !== 1 || data.kind !== "th") throw new Error("This Thai reading table is from a different version of the app.");
    this.name = "th";
    this.words = data.words || {};
    this.short = new Set(data.short || []);
    this.nojoin = new Set(data.nojoin || []);
    this.cache = new Map();
  }

  /** The table's reading of exactly this word ("" if it has none). */
  exact(word) {
    const r = Object.prototype.hasOwnProperty.call(this.words, word) ? this.words[word] : "";
    return Array.isArray(r) ? r[0] || "" : r || "";
  }

  /** How `word` is said: the table's reading, else one made of the table's words that spell it,
   * else "". */
  reading(word) {
    word = String(word ?? "");
    if (!word || !THAI.test(word)) return "";
    const hit = this.exact(word);
    if (hit) return hit;
    if (this.cache.has(word)) return this.cache.get(word);
    const parts = this.pieces(word);
    const out = parts ? parts.map((p) => this.exact(p)).join("-") : "";
    if (this.cache.size > 20000) this.cache.clear();
    this.cache.set(word, out);
    return out;
  }

  /** The fewest whole words of the table that spell `word` exactly (see the top of this file for
   * which may be pieces), longer first words winning a tie; null when there are none, or only one. */
  pieces(word) {
    const n = word.length; // Thai is all in the Basic Multilingual Plane: one letter, one unit
    const best = new Array(n + 1).fill(null);
    best[n] = [];
    for (let i = n - 1; i >= 0; i--) {
      if (MARK.test(word[i])) continue;
      for (let j = n; j >= i + 2; j--) { // longest first, so ties keep the longer piece
        if (best[j] === null || (j < n && MARK.test(word[j]))) continue;
        const piece = word.slice(i, j);
        if (LEADING.test(piece) || !this.exact(piece) || (piece.length < 3 && !this.short.has(piece))) continue;
        if (j < n && this.nojoin.has(piece)) continue;
        if (best[i] === null || best[j].length + 1 < best[i].length) best[i] = [piece, ...best[j]];
      }
    }
    const parts = best[0];
    return parts && parts.length > 1 && parts.length <= MAX_PIECES ? parts : null;
  }
}
