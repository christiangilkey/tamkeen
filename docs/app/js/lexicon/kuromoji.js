// Japanese morphological analysis: splitting written Japanese into words, with each word's part of
// speech, dictionary form and reading.
//
// This is a port of kuromoji.js 0.1.2 by Takuya Asano (https://github.com/takuyaa/kuromoji.js,
// Apache License 2.0, see licenses/kuromoji.txt) and of its double-array trie, doublearray.js
// (MIT). Changes from the original: one ES module instead of many CommonJS files; the dictionary
// comes as one packed file (docs/lexicon/ja-ipadic.bin.gz, made by tools/build_cjk.py) whose word
// descriptions are shortened; the trie is searched on the sentence's UTF-8 bytes once instead of
// re-encoding the rest of the sentence at every character; no dictionary building code.
//
// The dictionary is IPADIC (mecab-ipadic-2.7.0-20070801, Nara Institute of Science and Technology,
// licence in licenses/kuromoji.txt), downloaded only by someone learning Japanese.
//
// No screen or network code here.

const utf8 = new TextEncoder();
const text8 = new TextDecoder();

/** The packed dictionary file, unzipped: an ArrayBuffer or Uint8Array. */
export class JapaneseDictionary {
  constructor(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 8 || text8.decode(u8.subarray(0, 4)) !== "TKJA") throw new Error("This Japanese dictionary is from a different version of the app.");
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const headLen = dv.getUint32(4, true);
    const head = JSON.parse(text8.decode(u8.subarray(8, 8 + headLen)));
    if (head.format !== 1) throw new Error("This Japanese dictionary is from a different version of the app.");
    const at = 8 + headLen;
    // Parts start on multiples of 4 bytes, but the file itself may sit anywhere in its buffer:
    // copy a part when its typed view would be misaligned.
    const part = (name, Type) => {
      const [off, len] = head.parts[name];
      const start = u8.byteOffset + at + off;
      if (Type === Uint8Array) return u8.subarray(at + off, at + off + len);
      if (start % Type.BYTES_PER_ELEMENT === 0) return new Type(u8.buffer, start, len / Type.BYTES_PER_ELEMENT);
      return new Type(u8.slice(at + off, at + off + len).buffer);
    };
    this.base = part("base", Int32Array);
    this.check = part("check", Int32Array);
    this.known = new Entries(part("tid", Uint8Array), part("tid_pos", Uint8Array), part("tid_map", Uint8Array));
    this.unknown = new Entries(part("unk", Uint8Array), part("unk_pos", Uint8Array), part("unk_map", Uint8Array));
    this.costs = part("cc", Int16Array);
    this.backward = this.costs[1];
    this.charClass = part("unk_char", Uint8Array);
    this.classes = readClasses(part("unk_invoke", Uint8Array));
    this.kinds = text8.decode(part("kinds", Uint8Array)).split("\n");
    this.defaultClass = this.classes.find((c) => c.name === "DEFAULT") || this.classes[0];
  }

  /** The trie: every dictionary word that starts at byte `from` of `bytes`, as byte lengths and record ids. */
  prefixes(bytes, from, found) {
    const { base, check } = this;
    const getBase = (i) => (i < base.length ? base[i] : -i + 1);
    const getCheck = (i) => (i < check.length ? check[i] : -i - 1);
    let parent = 0;
    for (let i = from; i < bytes.length; i++) {
      const child = getBase(parent) + bytes[i];
      if (getCheck(child) !== parent) break;
      parent = child;
      const leaf = getBase(child); // + terminal character code 0
      if (getCheck(leaf) === child) {
        const b = getBase(leaf);
        if (b <= 0) found.push(i + 1 - from, -b - 1);
      }
    }
    return found;
  }

  cost(right, left) { return this.costs[right * this.backward + left + 2]; }

  /** The character class of one character (a code point string). */
  classOf(ch) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) return this.defaultClass;
    return this.classes[this.charClass[code]] || this.defaultClass;
  }

  /** A word description: [pos, detail1, detail2, detail3, conjugation type, conjugation form, dictionary form, reading]. */
  features(entries, id, surface) {
    const [kind, basic, reading] = entries.description(id).split(",");
    const k = (this.kinds[Number(kind)] || "*,*,*,*,*,*").split(",");
    return [...k, basic || surface, reading === undefined ? "*" : reading || katakana(surface)];
  }
}

class Entries {
  constructor(records, descriptions, map) {
    this.dv = new DataView(records.buffer, records.byteOffset, records.byteLength);
    this.descriptions = descriptions;
    // record id -> where its list of entries starts in `map` (ids are counted from 0).
    const mv = new DataView(map.buffer, map.byteOffset, map.byteLength);
    const keys = mv.getInt32(0, true);
    const where = new Map();
    let max = -1;
    for (let p = 4, k = 0; k < keys; k++) {
      const key = mv.getInt32(p, true);
      const n = mv.getInt32(p + 4, true);
      where.set(key, p + 4);
      if (key > max) max = key;
      p += 8 + 4 * n;
    }
    // Dense ids: a typed array is far smaller than a Map of 400,000.
    this.at = new Int32Array(max + 1).fill(-1);
    for (const [key, p] of where) this.at[key] = p;
    this.mv = mv;
  }

  /** The entry ids (byte offsets into the records) for a trie record id or character class. */
  ids(key) {
    const p = key < this.at.length ? this.at[key] : -1;
    if (p < 0) return [];
    const n = this.mv.getInt32(p, true);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.mv.getInt32(p + 4 + 4 * i, true);
    return out;
  }

  left(id) { return this.dv.getInt16(id, true); }
  right(id) { return this.dv.getInt16(id + 2, true); }
  wordCost(id) { return this.dv.getInt16(id + 4, true); }

  description(id) {
    const p = this.dv.getInt32(id + 6, true);
    let e = p;
    while (e < this.descriptions.length && this.descriptions[e] !== 0) e++;
    return text8.decode(this.descriptions.subarray(p, e));
  }
}

function readClasses(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  let p = 0;
  while (p + 1 < buf.length) {
    const invoke = buf[p];
    const group = buf[p + 1];
    const maxLength = dv.getInt32(p + 2, true);
    let e = p + 6;
    while (e < buf.length && buf[e] !== 0) e++;
    out.push({ id: out.length, invoke: invoke === 1, group: group === 1, maxLength, name: text8.decode(buf.subarray(p + 6, e)) });
    p = e + 1;
  }
  return out;
}

/** Hiragana to katakana (the dictionary's readings are in katakana). */
export function katakana(s) {
  return String(s).replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** Split text into tokens: {surface, start, pos, pos1, pos2, pos3, ctype, cform, basic, reading, known}.
 * `start` is the token's position in `text` (UTF-16 units). The tokens cover all of `text`. */
export function tokenize(dict, text) {
  const out = [];
  // kuromoji works sentence by sentence (、 and 。 end one); line breaks do too here.
  const re = /[^、。\n]*[、。\n]?/g;
  let m;
  while ((m = re.exec(text)) && m[0]) {
    tokenizeSentence(dict, m[0], m.index, out);
  }
  return out;
}

function tokenizeSentence(dict, sentence, offset, out) {
  const chars = Array.from(sentence);
  const n = chars.length;
  const bytes = utf8.encode(sentence);
  // Where each character starts in the bytes, and which character a byte position starts.
  const byteStart = new Int32Array(n + 1);
  const charAt = new Int32Array(bytes.length + 1).fill(-1);
  const unitAt = new Int32Array(n + 1); // where each character starts in UTF-16 units
  for (let i = 0, b = 0; i <= n; i++) {
    byteStart[i] = b;
    charAt[b] = i;
    if (i < n) { b += utf8.encode(chars[i]).length; unitAt[i + 1] = unitAt[i] + chars[i].length; }
  }
  // The lattice: nodes ending at each position (1-based; 0 is the start of the sentence).
  const endAt = Array.from({ length: n + 2 }, () => []);
  endAt[0].push({ start: 0, len: 0, left: 0, right: 0, cost: 0, best: 0, prev: null, type: "BOS" });
  const found = [];
  for (let pos = 0; pos < n; pos++) {
    found.length = 0;
    dict.prefixes(bytes, byteStart[pos], found);
    for (let f = 0; f < found.length; f += 2) {
      const len = charAt[byteStart[pos] + found[f]] - pos;
      if (len <= 0) continue;
      for (const id of dict.known.ids(found[f + 1])) {
        endAt[pos + len].push({ id, start: pos + 1, len, left: dict.known.left(id), right: dict.known.right(id),
          cost: dict.known.wordCost(id), type: "KNOWN" });
      }
    }
    const cls = dict.classOf(chars[pos]);
    if (!found.length || cls.invoke) {
      let len = 1;
      if (cls.group) while (pos + len < n && dict.classOf(chars[pos + len]).name === cls.name) len++;
      for (const id of dict.unknown.ids(cls.id)) {
        endAt[pos + len].push({ id, start: pos + 1, len, left: dict.unknown.left(id), right: dict.unknown.right(id),
          cost: dict.unknown.wordCost(id), type: "UNKNOWN" });
      }
    }
  }
  const eos = { start: n + 1, len: 0, left: 0, right: 0, cost: 0, type: "EOS" };
  endAt[n + 1] = [eos];
  // Forward: the cheapest way to reach each node.
  for (let i = 1; i <= n + 1; i++) {
    for (const node of endAt[i]) {
      const before = endAt[node.start - 1];
      let best = Infinity;
      let prev = null;
      for (const p of before || []) {
        if (p.best === undefined) continue;
        const c = p.best + dict.cost(p.right, node.left) + node.cost;
        if (c < best) { best = c; prev = p; }
      }
      if (prev) { node.best = best; node.prev = prev; }
    }
  }
  // Backward: the path.
  const path = [];
  for (let node = eos.prev; node && node.type !== "BOS"; node = node.prev) path.push(node);
  path.reverse();
  let at = 0; // in chars
  for (const node of path) {
    const surface = chars.slice(node.start - 1, node.start - 1 + node.len).join("");
    const entries = node.type === "KNOWN" ? dict.known : dict.unknown;
    const [pos, pos1, pos2, pos3, ctype, cform, basic, reading] = dict.features(entries, node.id, surface);
    out.push({ surface, start: offset + unitAt[node.start - 1], pos, pos1, pos2, pos3, ctype, cform,
      basic: basic === "*" ? surface : basic, reading: reading === "*" ? "" : reading, known: node.type === "KNOWN" });
    at = node.start - 1 + node.len;
  }
  if (at < n) { // never expected: keep the text whole anyway
    const surface = chars.slice(at).join("");
    out.push({ surface, start: offset + unitAt[at], pos: "記号", pos1: "*", pos2: "*", pos3: "*",
      ctype: "*", cform: "*", basic: surface, reading: "", known: false });
  }
}
