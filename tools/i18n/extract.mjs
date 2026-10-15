// Find every piece of English the app shows, for translating (see web/js/i18n.js).
//   node tools/i18n/extract.mjs          writes tools/i18n/strings.json and reports what is new
//   then node tools/i18n/build.mjs       turns the translations into web/i18n/<code>.json
//
// It reads the code's strings and templates. A template with HTML in it is turned into a small
// copy of the page it makes and walked with i18n.js's own `units`, so its keys are exactly the
// ones the app will look up. ${…} in text becomes {0}, {1}…; one that makes HTML (an icon, a list)
// becomes a thing inside the sentence (<n/>), as it will be on screen.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { units, norm, hasWords, UI_LANGUAGE_CODES } from "../../web/js/i18n.js";
import { LANGUAGES } from "../../web/js/languages.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCES = ["web/js", "mobile/src/js", "app", "web/index.html", "mobile/src/index.html", "web/browser-home.html"];
// Not interface: other people's code, word lists, and the instructions sent to the AI.
const EXCLUDE = [/\/vendor\//, /\/wordlists\//, /lexicon\/arabic\.js$/, /web\/js\/i18n\.js$/, /dev-seed\.js$/,
  /instagram-worker\.js$/, /web\/js\/languages\.js$/, /__pycache__/, /app\/smoke\.py$/];

function files(p) {
  const full = join(root, p);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((n) => files(`${p}/${n}`));
}

// ---------- reading JavaScript: its strings and templates ----------

const KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw",
  "yield", "await", "instanceof"]);

function lex(src) {
  const out = [];
  let i = 0;
  let prev = "op"; // what came last: "op" (a regex may follow) or "val"

  const cook = (s) => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs, (all, e) => {
    if (e[0] === "u") return String.fromCodePoint(parseInt(e[1] === "{" ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", t: "\t", r: "", b: "", f: "", v: "", 0: "", "\n": "" }[e] ?? e;
  });

  function string(q) {
    const start = i++;
    let s = "";
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") { s += src.slice(i, i + 2); i += 2; } else s += src[i++];
    }
    i++;
    push({ kind: "string", text: cook(s), exprs: [], before: src.slice(Math.max(0, start - 60), start), at: start, end: i });
    prev = "val";
  }

  // "One sentence " + "written on two lines" is one string (also with templates).
  function push(lit) {
    const last = out[out.length - 1];
    if (last && /^\s*\+\s*$/.test(src.slice(last.end, lit.at))) {
      const shift = last.exprs.length;
      last.text += lit.text.replace(/\u0001(\d+)\u0001/g, (all, n) => `\u0001${Number(n) + shift}\u0001`);
      last.exprs.push(...lit.exprs);
      last.end = lit.end;
      if (lit.kind === "template") last.kind = "template";
      return;
    }
    out.push(lit);
  }

  function template() {
    const start = i++;
    let s = "";
    const exprs = [];
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { s += src.slice(i, i + 2); i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        const from = i;
        code(true);
        exprs.push(src.slice(from, i - 1));
        s += `\u0001${exprs.length - 1}\u0001`;
        continue;
      }
      s += src[i++];
    }
    i++;
    push({ kind: "template", text: cook(s), exprs, before: src.slice(Math.max(0, start - 60), start), at: start, end: i });
    prev = "val";
  }

  function regex() {
    i++;
    let cls = false;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") break;
      if (cls) { if (c === "]") cls = false; } else if (c === "[") cls = true; else if (c === "/") break;
      i++;
    }
    i++;
    while (/[a-z]/i.test(src[i] || "")) i++;
    prev = "val";
  }

  function code(inExpr) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === "'" || c === '"') { string(c); continue; }
      if (c === "`") { template(); continue; }
      if (c === "/") { if (prev === "op") regex(); else { i++; prev = "op"; } continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z_$\d]/.test(c)) {
        let w = "";
        while (i < src.length && /[\w$]/.test(src[i])) w += src[i++];
        prev = KEYWORDS.has(w) ? "op" : "val";
        continue;
      }
      if (c === "{") { depth++; i++; prev = "op"; continue; }
      if (c === "}") {
        i++;
        if (inExpr && depth === 0) return;
        depth--; prev = "op"; continue;
      }
      prev = c === ")" || c === "]" ? "val" : "op";
      i++;
    }
  }

  code(false);
  return out;
}


// ---------- reading Python (the desktop app's server: its error and progress messages) ----------

function lexPy(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    const pm = /^([rRbBfFuU]{0,2})('''|"""|'|")/.exec(src.slice(i, i + 5));
    if (pm && (pm[1] === "" || !/[\w]/.test(src[i - 1] || ""))) {
      const start = i;
      const prefix = pm[1].toLowerCase(), q = pm[2];
      i += pm[0].length;
      let s = "";
      while (i < src.length && !src.startsWith(q, i)) {
        if (src[i] === "\\" && !prefix.includes("r")) { s += src.slice(i, i + 2); i += 2; } else if (q.length === 1 && src[i] === "\n") break; else s += src[i++];
      }
      i += q.length;
      if (q.length === 3 || prefix.includes("b")) continue; // docstrings, long prompts, bytes
      const exprs = [];
      if (prefix.includes("f")) {
        s = s.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (all, e) => {
          if (all === "{{") return "{";
          if (all === "}}") return "}";
          exprs.push(e);
          return `\u0001${exprs.length - 1}\u0001`;
        });
      }
      const text = prefix.includes("r") ? s : s.replace(/\\(.)/gs, (all, e) => ({ n: "\n", t: "\t", "\\": "\\", "'": "'", '"': '"' }[e] ?? all));
      const last = out[out.length - 1];
      if (last && /^\s*$/.test(src.slice(last.end, start))) { // "one " "sentence" written on two lines is one string
        const shift = last.exprs.length;
        last.text += text.replace(/\u0001(\d+)\u0001/g, (all, n) => `\u0001${Number(n) + shift}\u0001`);
        last.exprs.push(...exprs);
        last.end = i;
        continue;
      }
      out.push({ kind: "string", text, exprs, before: src.slice(Math.max(0, start - 60), start), at: start, end: i });
      continue;
    }
    if (/[\w]/.test(c)) { while (i < src.length && /[\w]/.test(src[i])) i++; continue; }
    i++;
  }
  return out;
}

// ---------- a small copy of the page a template makes ----------

const VOID = new Set(["AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT", "LINK", "META", "SOURCE", "TRACK", "WBR"]);
const RAW = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", times: "×",
  hellip: "…", rarr: "→", larr: "←", mdash: "—", ndash: "–", copy: "©", laquo: "«", raquo: "»", bull: "•",
  check: "✓", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", uarr: "↑", darr: "↓", deg: "°", minus: "−" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? all;
});

function el(name, attrs, parent) {
  return { nodeType: 1, nodeName: name, attrs, childNodes: [], parentNode: parent,
           getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; } };
}

/** Parse template HTML. `htmlExpr(n)`: does ${n} put elements on the page (rather than text)? */
function parse(html, htmlExpr) {
  const doc = el("BODY", {}, null);
  let cur = doc;
  let i = 0;
  const addText = (s) => {
    if (!s) return;
    // a ${…} that makes HTML is a thing of its own, not text
    for (const [k, part] of s.split(/(\u0001\d+\u0001)/).entries()) {
      if (k % 2 && htmlExpr(Number(part.slice(1, -1)))) { cur.childNodes.push(el("X-HTML", {}, cur)); continue; }
      if (!part) continue;
      const last = cur.childNodes[cur.childNodes.length - 1];
      if (last && last.nodeType === 3) last.data += decode(part);
      else cur.childNodes.push({ nodeType: 3, data: decode(part), parentNode: cur });
    }
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { addText(html.slice(i)); break; }
    addText(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) { const e = html.indexOf("-->", lt); i = e < 0 ? html.length : e + 3; continue; }
    if (html[lt + 1] === "!") { i = html.indexOf(">", lt) + 1 || html.length; continue; }
    const m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(html.slice(lt));
    if (!m) { addText("<"); i = lt + 1; continue; }
    // read to the end of the tag, minding quotes
    let j = lt + m[0].length, q = "";
    const attrsSrc = [];
    while (j < html.length) {
      const c = html[j];
      if (q) { if (c === q) q = ""; } else if (c === '"' || c === "'") q = c; else if (c === ">") break;
      attrsSrc.push(c); j++;
    }
    i = j + 1;
    const name = m[2].toUpperCase();
    if (m[1]) { // closing tag: close up to the matching open one
      let e = cur;
      while (e && e.nodeName !== name) e = e.parentNode;
      if (e && e.parentNode) cur = e.parentNode;
      continue;
    }
    const attrs = {};
    const a = attrsSrc.join("");
    for (const am of a.matchAll(/([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[am[1].toLowerCase()] = decode(am[2] ?? am[3] ?? am[4] ?? "");
    }
    const node = el(name, attrs, cur);
    cur.childNodes.push(node);
    if (VOID.has(name) || /\/\s*$/.test(a)) continue;
    if (RAW.has(name)) {
      const e = html.toLowerCase().indexOf(`</${name.toLowerCase()}`, i);
      i = e < 0 ? html.length : html.indexOf(">", e) + 1;
      continue;
    }
    cur = node;
  }
  return doc;
}

const MARK = /\u0001(\d+)\u0001/g;
/** Markers -> {0}, {1}… numbered in the order they appear in this key. */
function placeholders(s) {
  const seen = [];
  return s.replace(MARK, (all, n) => {
    let k = seen.indexOf(n);
    if (k < 0) k = seen.push(n) - 1;
    return `{${k}}`;
  });
}

// ${…} that put HTML on the page rather than text.
const HTML_EXPR = /\bicon\(|\.map\(|\.join\(|\bh\(|Html\b|html\b|<\w|\bavatar\w*\(|Row\(|Card\(|\bchip|\bbadge|\bsvg|Svg|\bdots\(|\bbutton\w*\(/;
// (text run through esc() is text, whatever it was made from)
const htmlExpr = (e) => !/^\s*esc\(/.test(e) && HTML_EXPR.test(e);

// ---------- which plain strings are interface ----------

const CODE_BEFORE = /(querySelector(All)?|closest|matches|addEventListener|removeEventListener|getElementById|classList\.\w+|toggleAttribute|getAttribute|hasAttribute|removeAttribute|createElement|import|from|api|fetch|dispatchEvent|CustomEvent|getItem|setItem|removeItem|setProperty|getPropertyValue|console\.\w+|startsWith|endsWith|includes|indexOf|split|join|replace|test|exec|match|on|off|emit|require|get|getenv|print|execute|executemany|compile|search|sub|fullmatch|findall|logw*|debug|info|warning|Path|open|environ.get|setdefault|pop|encode|decode|strftime|strptime|startswith|endswith|postMessage|sendPrompt|navigate|execCommand|setStudyLanguage|mime|accept)\s*\(\s*$/;

function isUiString(key, before) {
  if (!hasWords(key)) return false;
  const s = key.replace(/\{\d+\}/g, "0"); // (a {0} is not code)
  if (CODE_BEFORE.test(before)) return false;
  if (/\[\s*$/.test(before) || /\b(case|typeof\s+\w+\s*[!=]==?)\s*$/.test(before)) return false; // obj["key"], case "x":
  if (/[!=]==?\s*$/.test(before)) return false; // compared with: a value, not words
  if (/\b(type|kind|mode|stage|status|state|event|key|code|id|cls|className|lang|dir|role|method|provider|unit|via)\s*[:=]\s*$/.test(before)) return false;
  if (/(https?:|www\.|\.(js|mjs|css|json|png|jpe?g|svg|webp|gif|mp3|m4a|ogg|wav|html?|py|apk|exe|zip)\b|^[./#@]|^--|=>|[{}]|;(?! [a-z])|\$\{|\\u)/i.test(s)) return false;
  if (/^[\w-]+:\s*[\w#-]/.test(s) && !/\s\w+\s\w+/.test(s)) return false; // css "display: none"
  if (!/\s/.test(s)) {
    // one word: interface only when it reads like one ("Save", "Library", "Back…")
    if (!/^\p{Lu}[\p{Ll}'’]+[.!?…:]?$/u.test(s)) return false;
  } else if (/^[a-z][\w-]*( [a-z][\w-]*)*$/.test(s) && !/\b(a|the|to|of|and|or|is|not|no|in|on|for|your|this|it|me|my|you|with)\b/.test(s)) {
    return false; // "primary big", "btn ghost": lists of class names
  }
  if (/^[A-Z_\d]+$/.test(s)) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|WITH|REPLACE)\b/.test(s)) return false; // SQL
  if (/\b(WHERE|JOIN|ORDER BY|VALUES|COALESCE|NOT NULL|ON CONFLICT|AND|LIKE)\b|= \?|\?,\?|\bwindow\.|\bdocument\.|%s|%\(|max-age|\breturn \(|\d(px|em|ms)\b|\bmonospace\b|\w_\w+,|\$\w|2>|\brgba?\(/.test(s)) return false;
  return true;
}

// ---------- go ----------

// The study language's own sample sentences are not interface; its labels are.
const LANGUAGE_FIELDS = ["name", "root", "standard", "note", "searchNote"];

function extract() {
  const found = new Map(); // key -> first file
  const add = (k, f) => { if (k && hasWords(k) && !found.has(k)) found.set(k, f); };
  const fromHtml = (html, htmlExpr, f) => {
    units(parse(html, htmlExpr), (kind, x) => {
      if (kind === "text") add(placeholders(norm(x.data)), f);
      else if (kind === "attr") add(placeholders(norm(x.value)), f);
      else { add(placeholders(x.key), f); return true; }
    });
  };
  const fromString = (lit, f) => {
    // a message in paragraphs (for a confirm box) is also looked up one paragraph at a time
    const paras = lit.text.split(/\n\s*\n/);
    for (const text of paras.length > 1 ? [lit.text, ...paras] : paras) {
      const k = placeholders(norm(text));
      if (isUiString(k.replace(/\{\d+\}/g, "").trim() ? k : "", lit.before)) add(k, f);
    }
  };
  for (const [code, info] of Object.entries(LANGUAGES)) {
    for (const field of LANGUAGE_FIELDS) if (info[field]) add(info[field], "web/js/languages.js");
  }
  // Words the rules above pass over (single lower-case words) that the code puts into sentences:
  // tools/i18n/extra.txt, one per line.
  const extraPath = join(root, "tools", "i18n", "extra.txt");
  if (existsSync(extraPath)) {
    for (const line of readFileSync(extraPath, "utf8").split(/\r?\n/)) {
      const k = line.replace(/#.*/, "").trim();
      if (k) found.set(k, "tools/i18n/extra.txt"); // taken as written, even "{0} {1}"
    }
  }
  for (const f of SOURCES.flatMap(files)) {
    if (EXCLUDE.some((re) => re.test(f))) continue;
    const src = readFileSync(join(root, f), "utf8");
    if (f.endsWith(".html")) { fromHtml(src, () => false, f); continue; }
    if (f.endsWith(".py")) { for (const lit of lexPy(src)) fromString(lit, f); continue; }
    if (!f.endsWith(".js") && !f.endsWith(".mjs")) continue;
    // definer.js: what it tells the AI about each language is not shown to the user
    const teach = f.endsWith("definer.js") ? [src.indexOf("const TEACH = {"), src.indexOf("const teach =")] : [-1, -1];
    for (const lit of lex(src)) {
      if (lit.at > teach[0] && lit.at < teach[1]) continue;
      if (/description:\s*$/.test(lit.before)) continue;
      const isHtml = /<[a-zA-Z][\w-]*[\s>\/]|<\/[a-zA-Z]/.test(lit.text);
      if (isHtml) { fromHtml(lit.text, (n) => htmlExpr(lit.exprs[n] || ""), f); continue; }
      fromString(lit, f);
    }
  }
  return found;
}

const found = extract();
const out = join(root, "tools", "i18n", "strings.json");
const before = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : [];
// Each string's id: the first 8 hex digits of its SHA-1, so it stays the same when others come and go.
// Strings the rules above take for interface but aren't (instructions to the AI, protocol text):
// tools/i18n/ignore.txt, one id per line ("#" starts a note).
const ignorePath = join(root, "tools", "i18n", "ignore.txt");
const ignored = new Set(existsSync(ignorePath)
  ? readFileSync(ignorePath, "utf8").split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean) : []);
const list = [...found].map(([k, f]) => ({ id: createHash("sha1").update(k).digest("hex").slice(0, 8), k, f }))
  .filter((x) => !ignored.has(x.id));
const ids = new Set(list.map((x) => x.id));
if (ids.size !== list.length) throw new Error("two strings got the same id: make the ids longer");
writeFileSync(out, JSON.stringify(list, null, 1) + "\n");
const old = new Set(before.map((x) => x.k));
console.log(`${list.length} strings (${list.filter((x) => !old.has(x.k)).length} new) -> ${relative(root, out)}`);
