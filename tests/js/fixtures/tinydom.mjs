// A very small HTML reader for tests that need to look at saved sample page markup without a browser
// (tests/js/primevideo.test.mjs): elements with tagName, id, className, attributes, children, textContent,
// innerText (block elements and <br> as line breaks), and querySelector / querySelectorAll for simple
// selectors: tag, #id, .class (several), [attr], [attr='v'], [attr*='v'], and lists of them ("a, b").
// Not a real HTML parser: enough for markup written to be read by it.
const VOID = new Set(["br", "img", "input", "meta", "link", "hr", "source", "wbr"]);
const BLOCK = new Set(["div", "p", "section", "article", "li", "ul", "header", "footer", "aside", "main", "nav", "h1", "h2", "h3"]);

class Node {
  constructor(tag, attrs = {}, parent = null) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.parentNode = parent;
    this.childNodes = [];
  }
  get children() { return this.childNodes.filter((c) => c instanceof Node); }
  get id() { return this.attrs.id || ""; }
  get className() { return this.attrs.class || ""; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  get textContent() { return this.childNodes.map((c) => (typeof c === "string" ? c : c.textContent)).join(""); }
  get innerText() {
    const parts = this.childNodes.map((c) => {
      if (typeof c === "string") return c.replace(/\s+/g, " ");
      if (c.tagName === "BR") return "\n";
      const t = c.innerText;
      return BLOCK.has(c.tagName.toLowerCase()) ? `\n${t}\n` : t;
    });
    return parts.join("").replace(/ *\n */g, "\n").replace(/\n+/g, "\n").trim();
  }
  getBoundingClientRect() { return { width: 640, height: 360 }; }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(sel) {
    const tests = String(sel).split(",").map((s) => compile(s.trim()));
    return [...this.walk()].filter((el) => tests.some((t) => t(el)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function compile(sel) {
  if (/\s/.test(sel)) throw new Error(`tinydom: only simple selectors, not "${sel}"`);
  const tag = (sel.match(/^[a-zA-Z][\w-]*/) || [""])[0].toUpperCase();
  const ids = [...sel.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
  const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrs = [...sel.matchAll(/\[([\w-]+)(?:([*^$]?=)['"]?([^'"\]]*)['"]?)?\]/g)].map((m) => ({ name: m[1], op: m[2], v: m[3] }));
  return (el) => {
    if (tag && el.tagName !== tag) return false;
    if (ids.some((i) => el.id !== i)) return false;
    const cls = el.className.split(/\s+/);
    if (classes.some((c) => !cls.includes(c))) return false;
    return attrs.every(({ name, op, v }) => {
      const a = el.getAttribute(name);
      if (a === null) return false;
      if (!op) return true;
      if (op === "=") return a === v;
      if (op === "*=") return a.includes(v);
      if (op === "^=") return a.startsWith(v);
      return a.endsWith(v);
    });
  };
}

/** The markup `html` as a document-like root: {querySelector, querySelectorAll, ...}. */
export function parse(html) {
  const doc = new Node("#document");
  let cur = doc;
  const src = String(html).replace(/<!--[\s\S]*?-->/g, "");
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  for (const m of src.matchAll(re)) {
    if (m[3] !== undefined) { if (m[3]) cur.childNodes.push(m[3].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); continue; }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith("</")) {
      let n = cur;
      while (n !== doc && n.tagName !== tag.toUpperCase()) n = n.parentNode;
      if (n !== doc) cur = n.parentNode;
      continue;
    }
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|(\S+)))?/g)) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
    const el = new Node(tag, attrs, cur);
    cur.childNodes.push(el);
    if (!VOID.has(tag) && !m[2].trim().endsWith("/")) cur = el;
  }
  return doc;
}
