// Reading a teacher's lesson files into lines and audio (lesson bundles: components/lessonpanel.js). Everything
// happens on the device; nothing is sent anywhere.
//   PDF    the text layer, a line at a time (PDF.js, vendor/pdfjs), with headings by size and paragraphs by the gaps
//          between lines; a page with no text (a scan) is drawn and read with Tesseract (ocr.js, the reader Scan
//          uses), when `ocr` is given. The audio inside: the PDF's attachments, files attached to a page, and any
//          sound embedded as a media clip (found by looking at the file's own streams: lessons made with
//          Acrobat's "Add sound" keep them there).
//   Word   .docx: each paragraph with Word's own numbering ("1.", "a)", which isn't in the text), tick boxes, and
//          headings; MP3s put inside the document are taken out too.
//   text   .txt / .md
// lessonparse.js findQuestions turns the lines into the passage and the questions.

import { linesOfText } from "./lessonparse.js";
import { unzipFile, unzipIndex } from "./bookfiles.js";

export const LESSON_DOC_ACCEPT = ".pdf,.docx,.txt,.md";
export const LESSON_AUDIO_EXT = ["mp3", "m4a", "m4b", "aac", "ogg", "oga", "opus", "wav", "flac", "webm", "wma", "amr"];
const MAX_BYTES = 200 * 1024 * 1024;

const extOf = (name) => ((String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "");
export const isLessonAudio = (file) => LESSON_AUDIO_EXT.includes(extOf(file && file.name)) || /^audio\//.test(String(file && file.type || ""));
export const isLessonDoc = (file) => ["pdf", "docx", "txt", "md"].includes(extOf(file && file.name));

/** Several files chosen together: the documents read one after another into one lesson, the audio files kept as
 *  its tracks in file-name order. Resolves to {title, lines, audio: [{name, blob, from}], scanned, problems}. */
export async function readLessonFiles(files, { onStep = () => {}, ocr = null, links = false } = {}) {
  const docs = [...files].filter(isLessonDoc);
  const audio = [...files].filter((f) => !isLessonDoc(f) && isLessonAudio(f))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((f) => ({ name: f.name, blob: f, from: "file" }));
  const out = { title: "", lines: [], audio, scanned: 0, problems: [] };
  for (const f of [...files]) if (!isLessonDoc(f) && !isLessonAudio(f)) out.problems.push({ name: f.name, why: "kind" });
  for (const f of docs) {
    if (f.size > MAX_BYTES) { out.problems.push({ name: f.name, why: "big" }); continue; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    const ext = extOf(f.name);
    let got;
    try {
      if (ext === "pdf" || isPdf(bytes)) got = await readPdfLesson(bytes, { onStep, ocr, links });
      else if (ext === "docx") got = await readDocxLesson(bytes, { links });
      else got = { title: "", lines: linesOfText(new TextDecoder().decode(bytes)), audio: [] };
    } catch (e) {
      out.problems.push({ name: f.name, why: "read", message: String(e && e.message || e) });
      continue;
    }
    if (!out.title) out.title = got.title || f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
    if (out.lines.length && got.lines.length) got.lines[0] = { ...got.lines[0], para: true };
    out.lines.push(...got.lines);
    out.audio.push(...(got.audio || []).map((a) => ({ ...a, from: ext === "pdf" ? "pdf" : "docx" })));
    out.scanned += got.scanned || 0;
  }
  return out;
}

// ---------------------------------------------------------------- links to sound files (prototype lesson_links)
/** The file name a link to a sound file gives ("1.mp3" from "/C/Users/x/Audio Files/1.mp3", "file:///…/Track%202.wav",
 *  "Audio%20Files\3.m4a"), or "" when the link isn't to a sound file (a web page, a picture…). */
export function audioLinkName(url) {
  let s = String(url || "").trim();
  if (!s) return "";
  if (/^(https?|mailto|tel|javascript):/i.test(s)) return "";
  s = s.replace(/^file:\/*/i, "/").replace(/[?#].*$/, "");
  try { s = decodeURIComponent(s); } catch { /* keep it as it is */ }
  const name = s.split(/[\\/]/).filter(Boolean).pop() || "";
  return LESSON_AUDIO_EXT.includes(extOf(name)) ? name.slice(0, 120) : "";
}

/** A page's lines with its sound links put in among them by height: a link goes just before the first line below the
 *  top of its box (PDF heights go up the page), so a speaker icon beside a question comes just before that question.
 *  Links on a page without placed lines come first, top to bottom. Each link is a line {text: "", audioLink: {name, path}}. */
export function placeLinks(pageLines, links) {
  const marks = [...(links || [])].sort((a, b) => b.top - a.top)
    .map((l) => ({ text: "", audioLink: { name: l.name, path: l.path || "" }, top: l.top }));
  if (!marks.length) return pageLines.map(({ y, ...rest }) => rest);
  const out = [];
  let k = 0;
  for (const line of pageLines) {
    while (k < marks.length && typeof line.y === "number" && line.y < marks[k].top) out.push(marks[k++]);
    out.push(line);
  }
  while (k < marks.length) out.push(marks[k++]);
  return out.map(({ y, top, ...rest }) => rest);
}

const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

// ---------------------------------------------------------------- audio by its first bytes
/** "mp3", "wav", "ogg", "m4a", "flac" or "" for bytes that start a sound file. */
export function soundKind(b) {
  if (!b || b.length < 12) return "";
  const at = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (at(0, "ID3")) return "mp3";
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) !== 0 && (b[2] >> 4) !== 15 && (b[2] >> 4) !== 0 && ((b[2] >> 2) & 3) !== 3) return "mp3";
  if (at(0, "RIFF") && at(8, "WAVE")) return "wav";
  if (at(0, "OggS")) return "ogg";
  if (at(0, "fLaC")) return "flac";
  if (at(4, "ftyp") && /^(M4A |M4B |mp42|isom|mp41|dash|iso2|3gp)/.test(String.fromCharCode(...b.subarray(8, 12)))) return "m4a";
  return "";
}

const MIME = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac" };

async function inflate(data, raw = false) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(raw ? "deflate-raw" : "deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Sound files kept inside a PDF's own streams (embedded files, media clips), with the names their file entries
 *  give them where there is one: [{name, blob}]. Works on the raw bytes, so it finds what PDF.js doesn't show. */
export async function audioInPdf(bytes, { most = 60 } = {}) {
  const text = new TextDecoder("latin1").decode(bytes);
  // the names: "/F (talk.mp3)" or "/UF (talk.mp3)" near "/EF << /F 12 0 R >>"
  const names = new Map();
  for (const m of text.matchAll(/\/EF\s*<<[^>]*?\/(?:F|UF)\s+(\d+)\s+\d+\s+R/g)) {
    const around = text.slice(Math.max(0, m.index - 600), m.index + 200);
    const n = /\/UF\s*\(([^)]{1,200})\)/.exec(around) || /\/F\s*\(([^)]{1,200})\)/.exec(around);
    if (n) names.set(Number(m[1]), pdfString(n[1]));
  }
  const found = [];
  const seen = new Set();
  // each stream, with the dictionary in front of it: from its own "N 0 obj" (the last one before it) to "stream"
  const re = />>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text)) && found.length < most) {
    const start = m.index + m[0].length;
    const before = text.slice(Math.max(0, m.index - 3000), m.index);
    const heads = [...before.matchAll(/(\d+)\s+\d+\s+obj\b/g)];
    const headAt = heads.length ? heads[heads.length - 1] : null;
    const dict = headAt ? before.slice(headAt.index) : before;
    const objNum = headAt ? Number(headAt[1]) : -1;
    if (/\/Subtype\s*\/(?:Image|Form|Type1C|CIDFontType0C|OpenType)|\/Type\s*\/(?:XRef|ObjStm|Metadata|XObject)|\/FontFile/.test(dict)) continue;
    const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let end = len ? start + Number(len[1]) : text.indexOf("endstream", start);
    if (end < start || end > bytes.length) end = text.indexOf("endstream", start);
    if (end < 0) continue;
    re.lastIndex = end;
    const embedded = /\/EmbeddedFile|\/Subtype\s*\/audio/.test(dict);
    let data = bytes.subarray(start, end);
    const filters = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict) || [])[1] || "";
    if (filters) {
      if (!/^(\[\s*)?\/FlateDecode(\s*\])?$/.test(filters.trim()) || !embedded) continue;
      try { data = await inflate(data); } catch { continue; }
    }
    if (data.length < 2048) continue; // (too small to be a recording)
    const kind = soundKind(data);
    if (!kind) continue;
    const sig = `${data.length}:${data[100]}:${data[1000]}:${data[data.length - 1]}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    let name = names.get(objNum) || `Audio ${found.length + 1}.${kind}`;
    if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += `.${kind}`;
    found.push({ name, blob: new Blob([data.slice()], { type: MIME[kind] }) });
  }
  return found;
}

/** A PDF string's text: (\(\) escapes, and UTF-16 with its byte-order mark). */
function pdfString(s) {
  let t = s.replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" })[c]);
  if (t.charCodeAt(0) === 0xfe && t.charCodeAt(1) === 0xff) {
    let u = "";
    for (let i = 2; i + 1 < t.length; i += 2) u += String.fromCharCode((t.charCodeAt(i) << 8) | t.charCodeAt(i + 1));
    t = u;
  }
  return t.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120);
}

// ---------------------------------------------------------------- PDF
async function readPdfLesson(bytes, { onStep, ocr, links: withLinks = false }) {
  const pdfjs = await import("./vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  let task;
  let pdf;
  try {
    task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href, cMapPacked: true,
                               isEvalSupported: false, disableFontFace: true });
    pdf = await task.promise;
  } catch (e) {
    throw new Error(/password/i.test(String(e && e.name)) ? "password" : "open");
  }
  const meta = await pdf.getMetadata().catch(() => null);
  const lines = [];
  const audio = [];
  let scanned = 0;
  const keep = async (name, content) => {
    const data = content instanceof Uint8Array ? content : new Uint8Array(content || []);
    const kind = soundKind(data);
    if (!kind) return;
    if (audio.some((a) => a.size === data.length)) return;
    audio.push({ name: /\.[a-z0-9]{2,4}$/i.test(name) ? name : `${name || `Audio ${audio.length + 1}`}.${kind}`,
                 blob: new Blob([data.slice()], { type: MIME[kind] }), size: data.length });
  };
  // the document's attachments
  const att = await pdf.getAttachments().catch(() => null);
  for (const a of Object.values(att || {})) await keep(a.filename, a.content);
  for (let n = 1; n <= pdf.numPages; n++) {
    if (n % 5 === 1) onStep({ page: n, pages: pdf.numPages });
    const page = await pdf.getPage(n);
    // files attached to the page (a paper-clip on it), and links that open a sound file on the teacher's own computer
    // (Acrobat's Launch links: "/C/Users/…/Audio Files/1.mp3"): only their names and places are kept (prototype lesson_links)
    const links = [];
    for (const an of await page.getAnnotations().catch(() => [])) {
      if (an && an.attachment && an.attachment.content) await keep(an.attachment.filename, an.attachment.content);
      const name = withLinks && an && an.subtype === "Link" ? audioLinkName(an.unsafeUrl || an.url || "") : "";
      if (name) links.push({ name, path: String(an.unsafeUrl || an.url || "").slice(0, 500), top: Array.isArray(an.rect) ? Number(an.rect[3]) || 0 : 0 });
    }
    const content = await page.getTextContent();
    const raw = [];
    let cur = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5], x = item.transform[4];
      const size = Math.hypot(item.transform[2], item.transform[3]) || 10;
      if (!cur || Math.abs(y - cur.y) > size * 0.5) { cur = { y, x, size, text: "" }; raw.push(cur); }
      else if (cur.text && item.str && !/\s$/.test(cur.text) && !/^\s/.test(item.str) && x - (cur.right || x) > size * 0.15) cur.text += " ";
      cur.text += item.str;
      cur.right = x + (item.width || 0);
      if (item.hasEOL) cur = null;
    }
    const kept = raw.filter((l) => l.text.trim() && !/^\s*(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?\s*$/i.test(l.text));
    if (kept.map((l) => l.text).join("").trim().length < 12) {
      // a scanned page: read the picture of it
      if (ocr) {
        try {
          const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(page.view[2], page.view[3], 1)) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          onStep({ page: n, pages: pdf.numPages, reading: true });
          const text = await ocr(canvas, n);
          const got = linesOfText(text);
          if (got.length) got[0] = { ...got[0], para: true };
          lines.push(...placeLinks([], links), ...got); // (a scan's lines have no places: its links go first)
          scanned++;
        } catch { /* left out: the teacher can type it in the editor */ }
      } else {
        if (kept.length === 0) scanned++;
        lines.push(...placeLinks([], links));
      }
      page.cleanup();
      continue;
    }
    const gaps = kept.slice(1).map((l, k) => Math.abs(kept[k].y - l.y)).filter((g) => g > 0).sort((a, b) => a - b);
    const usual = gaps.length ? gaps[Math.floor(gaps.length * 0.25)] : 0;
    const sizes = kept.map((l) => l.size).sort((a, b) => a - b);
    const textSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
    const level = (s) => (!textSize ? 0 : s >= textSize * 1.6 ? 1 : s >= textSize * 1.35 ? 2 : s >= textSize * 1.18 ? 3 : 0);
    const pageLines = kept.map((l, k) => {
      const t = l.text.replace(/\s+/g, " ").trim();
      const prev = kept[k - 1];
      const head = t.length <= 80 ? level(l.size) : 0;
      return { text: t, y: l.y, para: k === 0 || !!(usual && prev && Math.abs(prev.y - l.y) > usual * 1.45), ...(head ? { heading: head } : {}) };
    });
    lines.push(...placeLinks(pageLines, links));
    page.cleanup();
  }
  // sound embedded as a media clip (Acrobat's "Add sound"): only in the file's own streams
  if (!audio.length || audio.length < 2) {
    for (const a of await audioInPdf(bytes).catch(() => [])) {
      if (!audio.some((b) => b.size === a.blob.size)) audio.push({ ...a, size: a.blob.size });
    }
  }
  await task.destroy();
  const info = (meta && meta.info) || {};
  return { title: String(info.Title || "").trim(), lines, audio: audio.map(({ name, blob }) => ({ name, blob })), scanned };
}

// ---------------------------------------------------------------- Word (.docx)
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, "&");
const attr = (xml, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(xml); return m ? m[1] : null; };

/** numbering.xml: numId → {ilvl → {fmt, text, start}} (through each numId's abstract numbering). */
export function docxNumbering(xml) {
  const abstract = new Map();
  for (const m of String(xml || "").matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const levels = {};
    for (const l of m[2].matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      const body = l[2];
      levels[l[1]] = { fmt: attr((/<w:numFmt\b[^>]*>/.exec(body) || [""])[0], "w:val") || "decimal",
                       text: attr((/<w:lvlText\b[^>]*>/.exec(body) || [""])[0], "w:val") ?? `%${Number(l[1]) + 1}.`,
                       start: Number(attr((/<w:start\b[^>]*>/.exec(body) || [""])[0], "w:val") || 1) };
    }
    abstract.set(m[1], levels);
  }
  const nums = new Map();
  for (const m of String(xml || "").matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const a = /<w:abstractNumId\b[^>]*w:val="(\d+)"/.exec(m[2]);
    if (a && abstract.has(a[1])) nums.set(m[1], abstract.get(a[1]));
  }
  return nums;
}

const ROMAN = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
const roman = (n) => ROMAN.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, "");
const ABJAD = ["أ", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط", "ي"];
function numberText(fmt, n) {
  if (fmt === "lowerLetter") return String.fromCharCode(96 + ((n - 1) % 26) + 1);
  if (fmt === "upperLetter") return String.fromCharCode(64 + ((n - 1) % 26) + 1);
  if (fmt === "lowerRoman") return roman(n);
  if (fmt === "upperRoman") return roman(n).toUpperCase();
  if (/arabicAbjad|arabicAlpha/.test(fmt)) return ABJAD[(n - 1) % ABJAD.length];
  if (fmt === "bullet" || fmt === "none") return "";
  return String(n);
}

/** The lines of word/document.xml (with numbering.xml's labels worked out as Word shows them). */
export function docxLines(xml, numberingXml = "", rels = null) {
  const numbering = docxNumbering(numberingXml);
  const counters = new Map(); // numId → [count per level]
  const lines = [];
  const body = String(xml || "");
  for (const m of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const p = m[1] || "";
    const pPr = (/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p) || [])[1] || "";
    // the text, with tick boxes: a content-control check box, an old form field, or a Wingdings box
    let box = "";
    if (/<w14:checkbox\b/.test(p)) box = /<w14:checked\b[^>]*w14:val="(1|true)"/.test(p) ? "checked" : "empty";
    else if (/<w:checkBox\b/.test(p)) box = /<w:checked\b(?![^>]*w:val="(0|false)")|<w:default\b[^>]*w:val="1"/.test(p) ? "checked" : "empty";
    let text = "";
    for (const r of p.matchAll(/<w:(t|tab|br|cr|sym)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:\1>)/g)) {
      if (r[1] === "t") text += decode(r[3] || "");
      else if (r[1] === "tab" || r[1] === "br" || r[1] === "cr") text += " ";
      else if (r[1] === "sym") {
        const c = (attr(r[2], "w:char") || "").toUpperCase();
        if (["F0FE", "F078", "F0FD", "F0FB", "F0FC", "F052", "F053"].includes(c)) { if (!box) box = "checked"; }
        else if (["F06F", "F0A8", "F071", "F072", "F06E", "F0A1", "F0A3"].includes(c)) { if (!box) box = "empty"; }
      }
    }
    // (a check box drawn with ☐ / ☒ inside the content control: the character is in the text; take it out)
    if (box) text = text.replace(/^\s*[☐☒☑✓✔□■]\s*/u, "");
    text = text.replace(/\s+/g, " ").trim();
    // links to sound files in the paragraph (prototype lesson_links): a hyperlink through the document's link list,
    // or a HYPERLINK field; each goes in just before the paragraph's own line
    if (rels) {
      const targets = [...p.matchAll(/<w:hyperlink\b[^>]*\br:id="([^"]+)"/g)].map((h) => rels.get(h[1]) || "")
        .concat([...p.matchAll(/HYPERLINK\s+(?:\\[a-z]\s+)*"([^"]+)"/gi)].map((h) => decode(h[1])));
      for (const target of new Set(targets)) { // (a link split over several runs is one link)
        const name = audioLinkName(target);
        if (name) lines.push({ text: "", audioLink: { name, path: target.slice(0, 500) } });
      }
    }
    if (!text) continue;
    const style = attr((/<w:pStyle\b[^>]*>/.exec(pPr) || [""])[0], "w:val") || "";
    const line = { text, para: true };
    if (box) line.box = box;
    if (/^(title|titel|titre|t[ií]tulo|titolo)$/i.test(style)) line.heading = 1;
    else if (/^(heading|berschrift|titre|t[ií]tulo|titolo|kop|rubrik|nagłówek)\s*\d?/i.test(style)) line.heading = Math.min(3, Number((style.match(/\d/) || ["2"])[0]) || 2);
    else if (/quote|zitat|citation|cita/i.test(style)) line.quote = true;
    const numId = attr((/<w:numId\b[^>]*>/.exec(pPr) || [""])[0], "w:val");
    const ilvl = Number(attr((/<w:ilvl\b[^>]*>/.exec(pPr) || [""])[0], "w:val") || 0);
    if (numId && numId !== "0" && !line.heading) {
      const levels = numbering.get(numId) || {};
      const counts = counters.get(numId) || [];
      counts[ilvl] = (counts[ilvl] || (levels[ilvl] ? levels[ilvl].start - 1 : 0)) + 1;
      counts.length = ilvl + 1; // a deeper level starts again under each item
      counters.set(numId, counts);
      const lv = levels[ilvl] || { fmt: "decimal", text: `%${ilvl + 1}.` };
      const label = String(lv.text || "").replace(/%(\d)/g, (_, d) => {
        const k = Number(d) - 1;
        const f = (levels[k] || lv).fmt;
        return numberText(f, counts[k] || 1);
      }).trim();
      line.list = { level: ilvl, label, fmt: lv.fmt };
    }
    lines.push(line);
  }
  return lines;
}

/** word/_rels/document.xml.rels: link id → where it points (external links only). */
export function docxRels(xml) {
  const out = new Map();
  for (const m of String(xml || "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"), target = attr(m[0], "Target");
    if (id && target && /TargetMode="External"/.test(m[0])) out.set(id, decode(target));
  }
  return out;
}

async function readDocxLesson(bytes, { links = false } = {}) {
  const files = unzipIndex(bytes);
  const text = async (name) => { const b = await unzipFile(bytes, files, name); return b ? new TextDecoder().decode(b) : ""; };
  const xml = await text("word/document.xml");
  if (!xml) throw new Error("damaged");
  const lines = docxLines(xml, await text("word/numbering.xml"), links ? docxRels(await text("word/_rels/document.xml.rels")) : null);
  const core = await text("docProps/core.xml");
  const title = decode((/<dc:title>([\s\S]*?)<\/dc:title>/.exec(core) || [])[1] || "").trim();
  // sound files kept inside the document: word/media/*.mp3, or wrapped in an embedded object
  const audio = [];
  for (const name of files.keys()) {
    if (!/^word\/(media|embeddings)\//.test(name)) continue;
    const ext = extOf(name);
    if (!LESSON_AUDIO_EXT.includes(ext) && ext !== "bin") continue;
    let data = await unzipFile(bytes, files, name).catch(() => null);
    if (!data) continue;
    if (ext === "bin") {
      // an OLE package: find where the sound file starts inside it
      const at = findSound(data);
      if (at < 0) continue;
      data = data.subarray(at);
    }
    const kind = soundKind(data);
    if (!kind) continue;
    const base = name.split("/").pop().replace(/\.bin$/, "");
    audio.push({ name: /\.[a-z0-9]{2,4}$/i.test(base) ? base : `${base}.${kind}`, blob: new Blob([data.slice()], { type: MIME[kind] }) });
  }
  return { title, lines, audio };
}

/** Where a sound file starts inside an embedded object's bytes (ID3, RIFF…WAVE, OggS, fLaC, ftyp), or -1. */
export function findSound(b) {
  const last = Math.min(b.length - 12, 1 << 20);
  for (let i = 0; i < last; i++) {
    const c = b[i];
    if (c !== 0x49 && c !== 0x52 && c !== 0x4f && c !== 0x66 && c !== 0x00) continue;
    if (soundKind(b.subarray(i, i + 16))) return i;
  }
  return -1;
}
