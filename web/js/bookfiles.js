// Reading a book file the learner uploads into headings and paragraphs: EPUB, PDF (with PDF.js,
// vendor/pdfjs), plain text and Markdown, Kindle AZW3/MOBI (without DRM), Word DOCX and the older
// DOC, and HTML. Everything happens on the device; the file is not sent anywhere.
// Shared by the desktop app, the phone and the web app (see books.js).

const MAX_BYTES = 200 * 1024 * 1024;

/** {title, author, blocks: [{kind: "h2"|"p", text}]} for a File. `onStep(text)` hears progress. */
export async function readBookFile(file, onStep = () => {}) {
  if (file.size > MAX_BYTES) throw new Error("That file is too big (over 200 MB).");
  const name = file.name.toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || [])[1] || "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  let book;
  if (ext === "epub") book = await readEpub(bytes);
  else if (ext === "pdf" || isPdf(bytes)) book = await readPdf(bytes, onStep);
  else if (ext === "docx") book = await readDocx(bytes);
  else if (ext === "doc") book = readDoc(bytes);
  else if (["azw3", "azw", "mobi", "prc"].includes(ext)) book = readMobi(bytes);
  else if (ext === "htm" || ext === "html" || ext === "xhtml") book = htmlBook(decodeText(bytes));
  else book = textBook(decodeText(bytes), ext === "md");
  return { title: tidy(book.title || ""), author: tidy(book.author || ""), blocks: tidyBlocks(book.blocks || []) };
}

// ---------- shared helpers ----------
const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isPdf = (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/** Text in UTF-8 (or UTF-16 with its mark), else in Windows-1252 (older files). */
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

// (Not \b after the word: in JavaScript that only knows Latin letters.)
const HEADING = /^(chapter|capítulo|capitulo|chapitre|capitolo|kabanata|libro|livre|book|part|parte|partie|глава|часть|باب|الفصل|الجزء|prologue|prólogo|epilogue|épilogue)(?=[\s.:,\d]|$)|^[IVXLC]+\.?$|^第[一二三四五六七八九十百零〇\d]+[回章話节節篇卷]/i;
export const looksLikeHeading = (line) => line.length <= 70 && HEADING.test(line.trim());

function tidyBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    const text = tidy(b.text);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    if (out.length && out[out.length - 1].text === text) continue;
    out.push({ kind: b.kind === "h2" ? "h2" : "p", text });
  }
  return out;
}

/** Plain text: paragraphs are separated by blank lines (or, in a text without any, each line is one). */
export function textBook(text, markdown = false) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blank = lines.filter((l) => !l.trim()).length;
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      const joined = /[぀-ヿ㐀-鿿]/.test(para.join("")) ? para.join("") : para.join(" ");
      blocks.push({ kind: para.length === 1 && looksLikeHeading(joined) ? "h2" : "p", text: joined });
    }
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (markdown && /^#{1,3}\s/.test(line)) { flush(); blocks.push({ kind: "h2", text: line.replace(/^#+\s*/, "") }); continue; }
    if (!line) { flush(); continue; }
    para.push(markdown ? line.replace(/[*_`]+/g, "") : line);
    if (blank < lines.length / 20) flush(); // no blank lines between paragraphs: one per line
  }
  flush();
  // The first short line is taken for the title, unless it is a chapter heading (then the file's name is used).
  const first = blocks.find((b) => b.text.length < 120);
  return { title: first && first.kind !== "h2" ? first.text : "", author: "", blocks };
}

/** The readable blocks of an HTML (or XHTML) document. */
export function htmlBlocks(doc) {
  const blocks = [];
  const body = doc.body || doc.documentElement;
  if (!body) return blocks;
  for (const el of body.querySelectorAll("script, style, nav, rt, rp, sup.footnote, aside")) el.remove();
  // A paragraph-like element is one block; anything holding such elements is looked into, whatever
  // it is called (div, section, header, main...); a container with only text in it is one block too.
  const LEAF = /^(P|H[1-6]|LI|BLOCKQUOTE|DD|DT|PRE|TD|TH|FIGCAPTION|CAPTION)$/;
  const INSIDE = "p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,pre,td,th,figcaption,div,section,article,header,footer,main,table,ul,ol,figure";
  const walk = (el) => {
    for (const child of el.children) {
      const tag = child.tagName.toUpperCase();
      if (!LEAF.test(tag) && child.querySelector(INSIDE)) { walk(child); continue; }
      if (LEAF.test(tag) && /^(LI|BLOCKQUOTE|TD)$/.test(tag) && child.querySelector("p,div,li")) { walk(child); continue; }
      const text = tidy(child.textContent);
      if (!text) continue;
      const heading = /^H[1-4]$/.test(tag) || (text.length <= 70 && /chapter|title|heading/i.test(child.className || ""));
      blocks.push({ kind: heading ? "h2" : "p", text });
    }
  };
  walk(body);
  if (!blocks.length) {
    const text = tidy(body.textContent);
    if (text) blocks.push({ kind: "p", text });
  }
  return blocks;
}

function htmlBook(source) {
  const doc = new DOMParser().parseFromString(source, "text/html");
  return { title: doc.title || "", author: doc.querySelector('meta[name="author"]')?.content || "", blocks: htmlBlocks(doc) };
}

// ---------- ZIP (EPUB and DOCX are zip files) ----------
/** The files in a zip: Map name -> {method, offset, size, compressed}. */
export function unzipIndex(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file is damaged (not a complete ZIP/EPUB/DOCX file).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, local, size, compressed });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** One file out of a zip, as bytes. */
export async function unzipFile(bytes, files, name) {
  const f = files.get(name) || files.get(decodeURIComponent(name));
  if (!f) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = f.local + 30 + view.getUint16(f.local + 26, true) + view.getUint16(f.local + 28, true);
  const data = bytes.subarray(start, start + f.compressed);
  if (f.method === 0) return data;
  if (f.method !== 8) throw new Error("That file uses a kind of compression Tamkeen can't read.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const unzipText = async (bytes, files, name) => {
  const b = await unzipFile(bytes, files, name);
  return b ? new TextDecoder().decode(b) : null;
};

// ---------- EPUB ----------
async function readEpub(bytes) {
  const files = unzipIndex(bytes);
  // A shop's DRM encrypts the chapters themselves (fonts alone may be "encrypted" in an ordinary book).
  const enc = files.has("META-INF/encryption.xml") ? await unzipText(bytes, files, "META-INF/encryption.xml") : "";
  if (enc && /CipherReference[^>]*URI="[^"]*\.x?html?"/i.test(enc)) {
    throw new Error("This book is protected (DRM), so its text can't be read. Only DRM-free books can be added.");
  }
  const container = await unzipText(bytes, files, "META-INF/container.xml");
  const opfPath = container && (container.match(/full-path="([^"]+)"/) || [])[1];
  if (!opfPath) throw new Error("That EPUB is damaged (no table of contents).");
  const opf = new DOMParser().parseFromString(await unzipText(bytes, files, opfPath), "application/xml");
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const meta = (tag) => tidy(opf.getElementsByTagNameNS("*", tag)[0]?.textContent || "");
  const manifest = new Map([...opf.getElementsByTagNameNS("*", "item")].map((it) => [it.getAttribute("id"), it.getAttribute("href")]));
  const spine = [...opf.getElementsByTagNameNS("*", "itemref")].map((r) => manifest.get(r.getAttribute("idref"))).filter(Boolean);
  const blocks = [];
  for (const href of spine) {
    const path = resolvePath(dir, href.split("#")[0]);
    const html = await unzipText(bytes, files, path);
    if (!html) continue;
    blocks.push(...htmlBlocks(new DOMParser().parseFromString(html, "text/html")));
  }
  return { title: meta("title"), author: meta("creator"), blocks };
}

function resolvePath(dir, href) {
  const parts = (dir + href).split("/");
  const out = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

// ---------- DOCX ----------
async function readDocx(bytes) {
  const files = unzipIndex(bytes);
  const xml = await unzipText(bytes, files, "word/document.xml");
  if (!xml) throw new Error("That Word file is damaged.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const blocks = [];
  for (const p of doc.getElementsByTagNameNS("*", "p")) {
    let text = "";
    for (const node of p.getElementsByTagNameNS("*", "*")) {
      if (node.localName === "t") text += node.textContent;
      else if (node.localName === "tab") text += " ";
      else if (node.localName === "br") text += " ";
    }
    const style = p.getElementsByTagNameNS("*", "pStyle")[0]?.getAttribute("w:val") || "";
    blocks.push({ kind: /^(heading|title|berschrift|titre|t[ií]tulo)/i.test(style) ? "h2" : "p", text });
  }
  const core = await unzipText(bytes, files, "docProps/core.xml");
  const coreDoc = core ? new DOMParser().parseFromString(core, "application/xml") : null;
  const meta = (tag) => tidy(coreDoc?.getElementsByTagNameNS("*", tag)[0]?.textContent || "");
  return { title: meta("title"), author: meta("creator"), blocks };
}

// ---------- DOC (Word 97-2003): the text out of its piece table ----------
/** A Compound File's streams (the container of .doc files): name -> bytes. */
function readCompoundFile(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0xe011cfd0) throw new Error("That isn't a Word .doc file. Try saving it as .docx.");
  const sectorSize = 1 << view.getUint16(30, true);
  const miniSize = 1 << view.getUint16(32, true);
  const dirStart = view.getUint32(48, true);
  const miniCutoff = view.getUint32(56, true);
  const miniFatStart = view.getUint32(60, true);
  const difatStart = view.getUint32(68, true);
  const sectorAt = (n) => 512 + n * sectorSize;
  // The FAT's own sectors: 109 listed in the header, more in the DIFAT chain.
  const fatSectors = [];
  for (let i = 0; i < 109; i++) { const s = view.getUint32(76 + i * 4, true); if (s < 0xfffffffa) fatSectors.push(s); }
  for (let d = difatStart, guard = 0; d < 0xfffffffa && guard < 10000; guard++) {
    for (let i = 0; i < sectorSize / 4 - 1; i++) { const s = view.getUint32(sectorAt(d) + i * 4, true); if (s < 0xfffffffa) fatSectors.push(s); }
    d = view.getUint32(sectorAt(d) + sectorSize - 4, true);
  }
  const fat = [];
  for (const s of fatSectors) for (let i = 0; i < sectorSize / 4; i++) fat.push(view.getUint32(sectorAt(s) + i * 4, true));
  const chain = (start, table, size, offsetOf, src) => {
    const out = [];
    for (let s = start, guard = 0; s < 0xfffffffa && guard < 1e6; s = table[s], guard++) out.push(src.subarray(offsetOf(s), offsetOf(s) + size));
    const all = new Uint8Array(out.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const a of out) { all.set(a, at); at += a.length; }
    return all;
  };
  const dir = chain(dirStart, fat, sectorSize, sectorAt, bytes);
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = dv.getUint16(o + 64, true);
    const name = nameLen > 2 ? new TextDecoder("utf-16le").decode(dir.subarray(o, o + nameLen - 2)) : "";
    entries.push({ name, type: dir[o + 66], start: dv.getUint32(o + 116, true), size: dv.getUint32(o + 120, true) });
  }
  const root = entries[0];
  const miniStream = root ? chain(root.start, fat, sectorSize, sectorAt, bytes) : new Uint8Array(0);
  const miniFat = [];
  if (miniFatStart < 0xfffffffa) {
    const mf = chain(miniFatStart, fat, sectorSize, sectorAt, bytes);
    const mv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mv.getUint32(i, true));
  }
  const streams = new Map();
  for (const e of entries) {
    if (e.type !== 2) continue;
    const data = e.size < miniCutoff
      ? chain(e.start, miniFat, miniSize, (s) => s * miniSize, miniStream)
      : chain(e.start, fat, sectorSize, sectorAt, bytes);
    streams.set(e.name, data.subarray(0, e.size));
  }
  return streams;
}

function readDoc(bytes) {
  const streams = readCompoundFile(bytes);
  const word = streams.get("WordDocument");
  if (!word) throw new Error("That Word file has no text.");
  const wv = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const flags = wv.getUint16(10, true);
  if (flags & 0x0100) throw new Error("This Word file is password-protected, so its text can't be read.");
  const table = streams.get(flags & 0x0200 ? "1Table" : "0Table");
  // The FIB's fcClx / lcbClx (where the piece table is) sit at a fixed place in Word 97 and later.
  const fcClx = wv.getUint32(0x01a2, true);
  const lcbClx = wv.getUint32(0x01a6, true);
  let text = "";
  if (table && lcbClx) {
    const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
    let p = fcClx;
    while (table[p] === 0x01) p += 3 + tv.getUint16(p + 1, true); // skip property records
    if (table[p] === 0x02) {
      const lcb = tv.getUint32(p + 1, true);
      const start = p + 5;
      const n = (lcb - 4) / 12;
      for (let k = 0; k < n; k++) {
        const cpStart = tv.getUint32(start + k * 4, true);
        const cpEnd = tv.getUint32(start + (k + 1) * 4, true);
        const pcd = start + (n + 1) * 4 + k * 8;
        let fc = tv.getUint32(pcd + 2, true);
        const compressed = (fc & 0x40000000) !== 0;
        fc &= 0x3fffffff;
        const len = cpEnd - cpStart;
        text += compressed
          ? new TextDecoder("windows-1252").decode(word.subarray(fc / 2, fc / 2 + len))
          : new TextDecoder("utf-16le").decode(word.subarray(fc, fc + len * 2));
      }
    }
  }
  if (!text) throw new Error("No text was found in that Word file. Try saving it as .docx.");
  // Field codes (\x13 code \x14 result \x15): keep the result. Cell and page marks become breaks.
  text = text.replace(/\x13[^\x14\x15]*\x14?([^\x15]*)\x15/g, "$1").replace(/[\x07\x0b\x0c]/g, "\r").replace(/[\x00-\x08\x0e-\x1f]/g, "");
  return { title: "", author: "", blocks: text.split("\r").map((t) => ({ kind: looksLikeHeading(t) ? "h2" : "p", text: t })) };
}

// ---------- Kindle AZW3 / MOBI (DRM-free) ----------
function palmDocDecompress(src) {
  const out = [];
  for (let i = 0; i < src.length;) {
    const c = src[i++];
    if (c === 0) out.push(0);
    else if (c <= 8) { for (let k = 0; k < c && i < src.length; k++) out.push(src[i++]); }
    else if (c <= 0x7f) out.push(c);
    else if (c <= 0xbf) {
      const pair = (c << 8) | src[i++];
      const dist = (pair >> 3) & 0x7ff;
      const len = (pair & 7) + 3;
      for (let k = 0; k < len; k++) out.push(out[out.length - dist]);
    } else { out.push(0x20, c ^ 0x80); }
  }
  return Uint8Array.from(out);
}

/** How many bytes at the end of a text record are not text (Kindle's trailing entries). */
function trailingSize(rec, flags) {
  let size = 0;
  for (let bit = 15; bit > 0; bit--) {
    if (!(flags & (1 << bit))) continue;
    // A size written backwards from the end, 7 bits a byte, the high bit marking its first byte.
    let value = 0, shift = 0;
    for (let k = rec.length - size - 1; k >= 0 && shift < 28; k--) {
      const b = rec[k];
      value |= (b & 0x7f) << shift;
      shift += 7;
      if (b & 0x80) break;
    }
    size += value;
  }
  if (flags & 1) size += (rec[rec.length - size - 1] & 3) + 1; // multibyte overlap
  return Math.min(size, rec.length);
}

function readMobi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = view.getUint16(76, false);
  const offsets = [];
  for (let i = 0; i < records; i++) offsets.push(view.getUint32(78 + i * 8, false));
  offsets.push(bytes.length);
  const record = (i) => bytes.subarray(offsets[i], offsets[i + 1]);
  const readHeader = (first) => {
    const r0 = record(first);
    const v = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
    const compression = v.getUint16(0, false);
    const textRecords = v.getUint16(8, false);
    const encryption = v.getUint16(12, false);
    const mobiLen = v.getUint32(20, false);
    const encoding = v.getUint32(28, false);
    const extraFlags = mobiLen >= 0xe4 ? v.getUint16(0xf2, false) : 0;
    const exthFlags = v.getUint32(0x80, false);
    const meta = {};
    if (exthFlags & 0x40) {
      let p = 16 + mobiLen;
      const count = v.getUint32(p + 8, false);
      p += 12;
      for (let k = 0; k < count && p + 8 <= r0.length; k++) {
        const type = v.getUint32(p, false);
        const len = v.getUint32(p + 4, false);
        meta[type] = r0.subarray(p + 8, p + len);
        p += len;
      }
    }
    return { compression, textRecords, encryption, encoding, extraFlags, meta, first };
  };
  let h = readHeader(0);
  // A Kindle file with both formats in it: the newer one (KF8, what .azw3 is) starts after the boundary.
  const boundary = h.meta[121] ? new DataView(h.meta[121].buffer, h.meta[121].byteOffset, 4).getUint32(0, false) : 0;
  if (boundary && boundary < records && boundary !== 0xffffffff) h = { ...readHeader(boundary), meta: { ...h.meta, ...readHeader(boundary).meta } };
  if (h.encryption) throw new Error("This Kindle book is protected (DRM), so its text can't be read. Only DRM-free books can be added.");
  if (h.compression === 17480) throw new Error("This Kindle file is compressed in a way Tamkeen can't read. Convert it to EPUB (for example with the free app Calibre) and add that.");
  const parts = [];
  for (let i = 1; i <= h.textRecords && h.first + i < records; i++) {
    let rec = record(h.first + i);
    rec = rec.subarray(0, rec.length - trailingSize(rec, h.extraFlags));
    parts.push(h.compression === 2 ? palmDocDecompress(rec) : rec);
  }
  const all = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of parts) { all.set(a, at); at += a.length; }
  const html = new TextDecoder(h.encoding === 1252 ? "windows-1252" : "utf-8").decode(all);
  const doc = new DOMParser().parseFromString(html.replace(/<mbp:pagebreak\s*\/?>/gi, "<p></p>"), "text/html");
  const text = (k) => (h.meta[k] ? tidy(new TextDecoder().decode(h.meta[k])) : "");
  return { title: text(503) || tidy(new TextDecoder().decode(bytes.subarray(0, 32)).replace(/\0.*$/, "").replace(/_/g, " ")), author: text(100), blocks: htmlBlocks(doc) };
}

// ---------- PDF (PDF.js) ----------
async function readPdf(bytes, onStep) {
  const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  let pdf;
  let task = null;
  try {
    task = pdfjs.getDocument({ data: bytes, cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href, cMapPacked: true,
                                    isEvalSupported: false, disableFontFace: true });
    pdf = await task.promise;
  } catch (e) {
    throw new Error(/password/i.test(String(e && e.name)) ? "This PDF is password-protected, so its text can't be read." : "That PDF couldn't be opened.");
  }
  const meta = await pdf.getMetadata().catch(() => null);
  const blocks = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    if (n % 10 === 1) onStep(`Reading page ${n} of ${pdf.numPages}…`);
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // Lines from the text pieces; a paragraph ends where the gap to the next line is bigger than usual.
    const lines = [];
    let line = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      const size = Math.hypot(item.transform[2], item.transform[3]) || 10;
      if (!line || Math.abs(y - line.y) > size * 0.5) { line = { y, size, text: "" }; lines.push(line); }
      line.text += item.str;
      if (item.hasEOL) line = null;
    }
    const kept = lines.filter((l) => l.text.trim() && !/^\s*\d+\s*$/.test(l.text)); // page numbers
    // The ordinary line spacing (most gaps between lines are that), and the ordinary text size:
    // a bigger gap ends a paragraph, bigger text on a short line is a heading.
    const gaps = kept.slice(1).map((l, k) => Math.abs(kept[k].y - l.y)).filter((g) => g > 0).sort((x, y) => x - y);
    const usual = gaps.length ? gaps[Math.floor(gaps.length * 0.25)] : 0;
    const sizes = kept.map((l) => l.size).sort((x, y) => x - y);
    const textSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
    let para = "";
    kept.forEach((l, k) => {
      const t = l.text.trim();
      if (textSize && l.size >= textSize * 1.25 && t.length <= 80) { // a heading line
        if (para) { blocks.push({ kind: looksLikeHeading(para) ? "h2" : "p", text: para }); para = ""; }
        blocks.push({ kind: "h2", text: t });
        return;
      }
      para = para ? (/-$/.test(para) ? para.slice(0, -1) + t : /[぀-鿿]$/.test(para) ? para + t : `${para} ${t}`) : t;
      const next = kept[k + 1];
      if (!next || (usual && Math.abs(l.y - next.y) > usual * 1.45) || (textSize && next.size >= textSize * 1.25)) {
        blocks.push({ kind: looksLikeHeading(para) ? "h2" : "p", text: para });
        para = "";
      }
    });
    page.cleanup();
  }
  await task.destroy();
  const info = (meta && meta.info) || {};
  return { title: info.Title || "", author: info.Author || "", blocks };
}
