// A small reader for parquet files (the format Hugging Face keeps datasets in), enough for the Iraqi course's texts:
// the text columns of a flat table, PLAIN or dictionary encoded, uncompressed, Snappy, gzip or zstd. Written here so
// nothing has to be installed (Chris's rule); the format is Apache Parquet's (parquet.apache.org/docs/file-format),
// its metadata in Thrift's compact protocol.
//
//   import { readColumns } from "./parquet.mjs"; readColumns(buffer, ["text", "subset"])  -> {text: [...], subset: [...]}
import { gunzipSync, zstdDecompressSync } from "node:zlib";

// ---------------------------------------------------------------- Thrift compact protocol (just reading)

class Thrift {
  constructor(buf, pos = 0) { this.buf = buf; this.pos = pos; }
  byte() { return this.buf[this.pos++]; }
  varint() { // unsigned LEB128, as a Number (the files here stay well under 2^53)
    let out = 0, mul = 1, b;
    do { b = this.byte(); out += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
    return out;
  }
  zigzag() { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  value(type) {
    switch (type) {
      case 1: return true;
      case 2: return false;
      case 3: return (this.byte() << 24) >> 24;
      case 4: case 5: case 6: return this.zigzag();
      case 7: { const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v; }
      case 8: { const n = this.varint(); const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
      case 9: case 10: {
        const h = this.byte();
        const size = (h >> 4) === 15 ? this.varint() : h >> 4;
        const t = h & 15;
        const out = [];
        for (let i = 0; i < size; i++) out.push(t === 1 || t === 2 ? this.byte() === 1 : this.value(t));
        return out;
      }
      case 11: {
        const size = this.varint();
        if (!size) return {};
        const kv = this.byte(), out = [];
        for (let i = 0; i < size; i++) out.push([this.value(kv >> 4), this.value(kv & 15)]);
        return out;
      }
      case 12: return this.struct();
      default: throw new Error(`parquet: unknown Thrift type ${type}`);
    }
  }
  struct() { // {field id: value}
    const out = {};
    let id = 0;
    for (;;) {
      const h = this.byte();
      if (h === 0) return out;
      const t = h & 15;
      id = h >> 4 ? id + (h >> 4) : this.zigzag();
      out[id] = this.value(t);
    }
  }
}

// ---------------------------------------------------------------- Snappy

export function unsnappy(src) {
  const t = new Thrift(src);
  const out = Buffer.alloc(t.varint());
  let o = 0, p = t.pos;
  while (p < src.length) {
    const tag = src[p++];
    let len, off;
    switch (tag & 3) {
      case 0:
        len = tag >> 2;
        if (len >= 60) { const n = len - 59; len = src.readUIntLE(p, n); p += n; }
        len += 1;
        src.copy(out, o, p, p + len); o += len; p += len;
        continue;
      case 1: len = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | src[p++]; break;
      case 2: len = (tag >> 2) + 1; off = src.readUInt16LE(p); p += 2; break;
      default: len = (tag >> 2) + 1; off = src.readUInt32LE(p); p += 4;
    }
    for (let i = 0; i < len; i++, o++) out[o] = out[o - off]; // (copies may overlap themselves)
  }
  return out;
}

const CODECS = { 0: (b) => b, 1: unsnappy, 2: gunzipSync, 6: zstdDecompressSync };

// ---------------------------------------------------------------- pages

/** The RLE / bit-packed hybrid encoding: `count` small numbers of `width` bits. */
function hybrid(buf, pos, end, width, count) {
  const out = [];
  const t = new Thrift(buf, pos);
  const bytes = Math.ceil(width / 8);
  while (out.length < count && t.pos < end) {
    const h = t.varint();
    if (h & 1) { // bit-packed groups of 8
      const n = (h >> 1) * 8;
      let bit = 0;
      const start = t.pos;
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let b = 0; b < width; b++, bit++) v |= ((buf[start + (bit >> 3)] >> (bit & 7)) & 1) << b;
        out.push(v);
      }
      t.pos = start + (h >> 1) * width;
    } else {
      const v = width ? buf.readUIntLE(t.pos, bytes) : 0;
      t.pos += bytes;
      for (let i = 0; i < h >> 1; i++) out.push(v);
    }
  }
  return out.slice(0, count);
}

function plainStrings(buf, pos, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt32LE(pos);
    out.push(buf.toString("utf8", pos + 4, pos + 4 + n));
    pos += 4 + n;
  }
  return out;
}

/** One column chunk's strings (null where the row has none). `optional`: the column may be empty in a row. */
function readChunk(file, meta, optional) {
  const decompress = CODECS[meta[4]];
  if (!decompress) throw new Error(`parquet: compression ${meta[4]} isn't supported`);
  let pos = meta[11] && meta[11] < meta[9] ? meta[11] : meta[9];
  const end = pos + meta[7];
  let dict = null;
  const out = [];
  while (pos < end && out.length < meta[5]) {
    const t = new Thrift(file, pos);
    const head = t.struct();
    const body = file.subarray(t.pos, t.pos + head[3]);
    pos = t.pos + head[3];
    if (head[1] === 2) { // the dictionary
      dict = plainStrings(decompress(body), 0, head[7][1]);
      continue;
    }
    let data, n, encoding, defs = null;
    if (head[1] === 0) { // data page, version 1
      data = decompress(body);
      n = head[5][1]; encoding = head[5][2];
      let p = 0;
      if (optional) { const len = data.readUInt32LE(0); defs = hybrid(data, 4, 4 + len, 1, n); p = 4 + len; }
      data = data.subarray(p);
    } else if (head[1] === 3) { // data page, version 2: levels uncompressed, then the values
      const h = head[8];
      n = h[1]; encoding = h[4];
      const dl = h[5] || 0, rl = h[6] || 0;
      if (optional && dl) defs = hybrid(body, rl, rl + dl, 1, n);
      const values = body.subarray(rl + dl);
      data = h[7] === false ? values : decompress(values);
    } else continue;
    const present = defs ? defs.filter((d) => d === 1).length : n;
    let values;
    if (encoding === 0) values = plainStrings(data, 0, present);
    else if (encoding === 2 || encoding === 8) values = hybrid(data, 1, data.length, data[0], present).map((i) => dict[i]);
    else throw new Error(`parquet: encoding ${encoding} isn't supported`);
    if (defs) { let k = 0; for (const d of defs) out.push(d === 1 ? values[k++] : null); } else for (const v of values) out.push(v);
  }
  return out;
}

/** The named columns of a flat parquet file (a Buffer), as strings: {name: [one per row]}. */
export function readColumns(file, names) {
  if (file.toString("latin1", 0, 4) !== "PAR1" || file.toString("latin1", file.length - 4) !== "PAR1") throw new Error("not a parquet file");
  const len = file.readUInt32LE(file.length - 8);
  const meta = new Thrift(file, file.length - 8 - len).struct();
  const schema = meta[2].slice(1); // (the first element is the root)
  const optional = Object.fromEntries(schema.map((s) => [s[4].toString(), s[3] === 1]));
  const out = Object.fromEntries(names.map((n) => [n, []]));
  for (const group of meta[4]) {
    for (const chunk of group[1]) {
      const name = chunk[3][3].map((x) => x.toString()).join(".");
      if (names.includes(name)) for (const v of readChunk(file, chunk[3], optional[name])) out[name].push(v);
    }
  }
  return out;
}
