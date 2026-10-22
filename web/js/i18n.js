// The app's own words (buttons, headings, messages, tooltips) in the language the user speaks.
//
// The screens are written in English. Rather than change every line that puts text on screen,
// this file watches the page and swaps each piece of English for its translation as it appears,
// using one dictionary per language: web/i18n/<code>.json, { "English": "translation" }.
// Those dictionaries are made by tools/i18n/extract.mjs, which finds every piece of English in
// the code with the same rules as below (`units`), so what it finds is exactly what is looked up.
//
// - A piece of text with formatting inside ("<b>Note:</b> tap a word") is translated as one
//   sentence: the formatting appears as numbered tags, <0>Note:</0>, which the translation keeps.
//   Things inside a sentence that are not text (an icon, a button, a word being studied) are <1/>.
// - Text built from values ("3 words saved") is matched against keys with {0}, {1}: "{0} words saved".
// - Never translated: anything in the language being studied (elements with a `lang` attribute or
//   the `ar` class), and anything marked translate="no".
//
// Shared by the desktop app and the phone. The pure part (no `document`) is also used by the extractor.

/** The languages the app can be shown in, by their own names. English is what the code is written in. */
export const UI_LANGUAGES = {
  en: { native: "English", name: "English", dir: "ltr" },
  es: { native: "Español", name: "Spanish", dir: "ltr" },
  ar: { native: "العربية", name: "Arabic", dir: "rtl" },
  fr: { native: "Français", name: "French", dir: "ltr" },
  ja: { native: "日本語", name: "Japanese", dir: "ltr" },
  zh: { native: "中文", name: "Chinese", dir: "ltr" },
  ru: { native: "Русский", name: "Russian", dir: "ltr" },
  it: { native: "Italiano", name: "Italian", dir: "ltr" },
  tl: { native: "Tagalog", name: "Tagalog", dir: "ltr" },
  pt: { native: "Português (Brasil)", name: "Brazilian Portuguese", dir: "ltr" },
  ca: { native: "Català", name: "Catalan", dir: "ltr" },
  ceb: { native: "Binisaya", name: "Bisaya (Cebuano)", dir: "ltr" },
  th: { native: "ไทย", name: "Thai", dir: "ltr" },
  fa: { native: "فارسی", name: "Persian", dir: "rtl" },
};
export const UI_LANGUAGE_CODES = Object.keys(UI_LANGUAGES);
export const isUiLanguage = (code) => Object.prototype.hasOwnProperty.call(UI_LANGUAGES, code);

/** The question "Which language do you speak?" in every language, for the very first box
 * (shown before the app knows which one to use). */
export const SPEAK_QUESTION = {
  en: "Which language do you speak?",
  es: "¿Qué idioma hablas?",
  ar: "ما اللغة التي تتحدثها؟",
  fr: "Quelle langue parlez-vous ?",
  ja: "あなたが話す言語はどれですか？",
  zh: "你说哪种语言？",
  ru: "На каком языке вы говорите?",
  it: "Che lingua parli?",
  tl: "Anong wika ang sinasalita mo?",
  pt: "Que idioma você fala?",
  ca: "Quina llengua parles?",
  ceb: "Unsang pinulongan ang imong ginasulti?",
  th: "คุณพูดภาษาอะไร",
  fa: "به چه زبانی صحبت می‌کنید؟",
};

// ---------- the rules (pure: also run by the extractor on its own small copy of the page) ----------

// Tags that sit inside a sentence: their text is part of the sentence around them.
const INLINE = new Set(["A", "ABBR", "B", "BDI", "CITE", "EM", "I", "KBD", "MARK", "Q", "S", "SMALL", "SPAN", "STRONG",
  "SUB", "SUP", "TIME", "U"]);
// Tags whose insides are never words of the interface.
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "SVG", "CODE", "PRE", "CANVAS", "VIDEO", "AUDIO", "IFRAME",
  "TEMPLATE", "MATH", "NOSCRIPT"]);
/** The attributes that hold words the user reads (or hears from a screen reader). */
export const ATTRS = ["placeholder", "title", "aria-label", "alt"];

/** Spaces as the screen shows them: runs of spaces and line breaks are one space; none at the ends. */
export const norm = (s) => String(s).replace(/\s+/g, " ").trim();
/** Is there something to translate: two letters in a row, not counting tags and {0}? */
export const hasWords = (s) => /\p{L}{2}/u.test(String(s).replace(/<\/?\d+\/?>|\{\d+\}/g, ""));

const tag = (el) => String(el.nodeName || "").toUpperCase();
const attr = (el, name) => (el.getAttribute ? el.getAttribute(name) : null);

/** Is this element something not to translate at all (study text, or marked so)? */
export function isContent(el) {
  if (!el || el.nodeType !== 1) return false;
  if (tag(el) === "HTML") return false;
  if (attr(el, "lang") != null) return true;
  if (attr(el, "translate") === "no") return true;
  const ce = attr(el, "contenteditable");
  if (ce != null && ce !== "false") return true;
  return /(^|\s)ar(\s|$)/.test(attr(el, "class") || "");
}
export const isSkipped = (el) => SKIP.has(tag(el)) || isContent(el);

// Text that comes from outside the app (podcast and video titles, messages from friends, names,
// captions) is drawn in elements with dir="auto" or one of these classes. Their text is never
// translated, so a podcast called "History" stays "History"; their tooltips still are.
const CONTENT_CLASSES = new Set(["title", "name", "d", "cap", "what", "msg-text", "continue-title", "study-title",
  "study-sub", "guild-name"]);
function isContentText(el) {
  if (attr(el, "dir") === "auto" || attr(el, "id") === "chat-name") return true;
  return (attr(el, "class") || "").split(/\s+/).some((c) => CONTENT_CLASSES.has(c));
}

/** An inline tag holding only text and other such tags: it can be moved around inside a sentence. */
function isInline(el) {
  if (el.nodeType !== 1 || !INLINE.has(tag(el)) || isContent(el)) return false;
  for (const c of el.childNodes) if (c.nodeType === 1 ? !isInline(c) : c.nodeType !== 3) return false;
  return true;
}
const isWordText = (n) => n.nodeType === 3 && hasWords(n.data);

/** Is this element's text one sentence with formatting or other things inside it? */
function isSentence(el) {
  let texts = 0, inline = 0;
  for (const c of el.childNodes) {
    if (isWordText(c)) texts++;
    else if (isInline(c) && hasWords(c.textContent ?? textOf(c))) inline++;
  }
  return texts >= 2 || (texts >= 1 && inline >= 1);
}
function textOf(n) { // textContent for the extractor's small copy of the page
  if (n.nodeType === 3) return n.data;
  return (n.childNodes || []).map(textOf).join("");
}

/** The part of a sentence element's children that the sentence covers (first to last piece of text). */
function sentenceRange(el) {
  const kids = [...el.childNodes];
  const counts = (c) => (c.nodeType === 3 ? norm(c.data) !== "" : isInline(c));
  let a = 0, b = kids.length - 1;
  while (a <= b && !counts(kids[a])) a++;
  while (b >= a && !counts(kids[b])) b--;
  return kids.slice(a, b + 1);
}

/** A sentence element as its dictionary key: text with <n>…</n> for formatting and <n/> for the rest.
 * `nodes[n]` is the element tag n stands for. */
export function sentenceKey(el) {
  const nodes = [];
  const walk = (list) => list.map((c) => {
    if (c.nodeType === 3) return c.data.replace(/[<>]/g, "");
    if (c.nodeType !== 1) return "";
    const n = nodes.push(c) - 1;
    return isInline(c) ? `<${n}>${walk([...c.childNodes])}</${n}>` : `<${n}/>`;
  }).join("");
  const range = sentenceRange(el);
  return { key: norm(walk(range)), nodes, range };
}

/**
 * Every piece of the interface in this element and below, in the order a reader meets them.
 * visit(kind, payload): kind "text" (a text node), "sentence" (an element translated as a whole,
 * with its sentenceKey) or "attr" ({ el, name }).
 */
export function units(root, visit) {
  const walk = (el) => {
    if (el.nodeType !== 1 || isContent(el)) return;
    for (const name of ATTRS) {
      const v = attr(el, name);
      if (v && hasWords(v)) visit("attr", { el, name, value: v });
    }
    if (tag(el) === "INPUT" && /^(button|submit|reset)$/i.test(attr(el, "type") || "")) {
      const v = attr(el, "value");
      if (v && hasWords(v)) visit("attr", { el, name: "value", value: v });
    }
    if (SKIP.has(tag(el)) || isContentText(el)) return; // (a canvas's label is translated, not its insides)
    // A sentence is translated whole; visit returns false when it has no translation, and then
    // its pieces are looked at one by one instead ("Whisper Large v3 <b>Recommended</b>").
    if (isSentence(el)) {
      const s = sentenceKey(el);
      if (hasWords(s.key) && visit("sentence", { el, ...s }) !== false) {
        // things that are not part of the sentence (buttons, icons) may hold words of their own
        for (const c of s.nodes) if (!isInline(c)) walk(c);
        for (const c of el.childNodes) if (!s.range.includes(c)) c.nodeType === 1 ? walk(c) : c.nodeType === 3 && isWordText(c) && visit("text", c);
        return;
      }
    }
    for (const c of [...el.childNodes]) {
      if (c.nodeType === 3) { if (isWordText(c)) visit("text", c); }
      else walk(c);
    }
  };
  if (root.nodeType === 3) { if (isWordText(root) && !insideSkipped(root.parentNode, true)) root.parentNode && isSentence(root.parentNode) ? walk(root.parentNode) : visit("text", root); }
  else if (!insideSkipped(root.parentNode, true)) walk(root);
}
/** Is this element (or one around it) never translated? With `text`, also: is its text content? */
function insideSkipped(el, text = false) {
  for (let e = el; e && e.nodeType === 1; e = e.parentNode) if (isSkipped(e) || (text && isContentText(e))) return true;
  return false;
}

// ---------- the dictionary ----------

let dict = null;      // English -> translation, for keys without {0}
let patterns = [];    // keys with {0}: [{ re, out, literal }] most specific first
const cache = new Map();

/** Use this dictionary ({ "English": "translation" }); null = show English. */
export function setDictionary(d) {
  dict = d ? Object.create(null) : null;
  patterns = [];
  cache.clear();
  if (!d) return;
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== "string" || !v || k.startsWith("//")) continue;
    if (!/\{\d+\}/.test(k)) { dict[k] = v; continue; }
    const parts = k.split(/(\{\d+\})/);
    const literal = parts.filter((p, i) => i % 2 === 0).join("");
    if (!hasWords(literal)) { dict[k] = v; continue; } // only for t("{0} {1}"): as a pattern it would match anything
    const order = [];
    const free = []; // holes not closed in by quotes, brackets or a colon, which could swallow a sentence
    const re = parts.map((p, i) => {
      if (i % 2 === 0) return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      order.push(Number(p.slice(1, -1)));
      free.push(!/(["“‘«(\[]|: )$/u.test(parts[i - 1]) && !/^["”’»)\]]/u.test(parts[i + 1]));
      // straight after a letter it is an English plural ending ("word{1}" = "word" or "words")
      return /\p{L}$/u.test(parts[i - 1]) ? "((?:e?s)?)" : "([^<>]*?)";
    }).join("");
    patterns.push({ re: new RegExp(`^${re}$`, "u"), order, free, out: v, literal: literal.length });
  }
  patterns.sort((a, b) => b.literal - a.literal);
}

/** The translation of one normalised key, or null. */
export function lookup(key) {
  if (!dict || !key) return null;
  if (key in dict) return dict[key];
  if (cache.has(key)) return cache.get(key);
  let found = null;
  // a known phrase in brackets or quotes, or followed by a colon or full stop: "(No lookups yet today.)"
  const wrapped = /^([(\[«“"‘']+)(.+?)([)\]»”"’']+)$/u.exec(key) || /^()(.+?)([:.…]+)$/u.exec(key);
  if (wrapped && wrapped[2] in dict) found = wrapped[1] + dict[wrapped[2]] + wrapped[3];
  for (const p of found == null ? patterns : []) {
    const m = p.re.exec(key);
    if (!m) continue;
    // "{0} and {1}" isn't the sentence "Good for clear speech; more mistakes on accents and fast talk."
    const loose = p.free.reduce((n, f, i) => n + (f ? m[i + 1].length : 0), 0);
    if (p.literal * 6 < loose) continue;
    // A value that is itself a word of the interface ("Spanish") is translated too; "{0:lower}"/"{0:upper}"
    // in a translation starts it with a small or capital letter ("aprender inglés").
    found = p.out.replace(/\{(\d+)(?::(lower|upper))?\}/g, (all, n, how) => {
      const i = p.order.indexOf(Number(n));
      if (i < 0) return all;
      const v = m[i + 1];
      // ...and so is a whole sentence the code put in front of another ("{0} Changing the model…"),
      // though never a name in quotes or brackets ("Delete “{0}”?")
      const out = dict[norm(v)] ?? (p.free[i] && /\s/.test(v) ? lookup(norm(v)) : null) ?? v;
      return caseAs(out, how);
    });
    break;
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, found);
  return found;
}

/** Translate a string written in the code: t("Saved {0} words", 3). Returns the English when
 * there is no translation. Values replace {0}, {1}… in order. */
export function t(english, ...values) {
  const out = lookup(norm(english)) ?? english;
  return values.length ? out.replace(/\{(\d+)(?::(lower|upper))?\}/g, (all, n, how) => {
    if (Number(n) >= values.length) return all;
    const v = String(values[n]);
    return caseAs(v, how);
  }) : out;
}

// ---------- on the page ----------

let current = "en";
let observer = null;
const writtenText = new WeakMap(); // text node -> the text this file put in it
const writtenAttr = new WeakMap(); // element -> { name: the value this file put in it }
const sentences = new WeakMap();   // sentence element -> its key once translated

export const uiLanguage = () => current;

function translateText(node) {
  if (writtenText.get(node) === node.data) return;
  const s = node.data;
  const tr = lookup(norm(s));
  if (tr == null) return;
  const out = s.match(/^\s*/)[0] + tr + s.match(/\s*$/)[0];
  writtenText.set(node, out);
  if (out !== s) node.data = out;
}

function translateAttr({ el, name, value }) {
  const mine = writtenAttr.get(el);
  if (mine && mine[name] === value) return;
  const tr = lookup(norm(value));
  if (tr == null) return;
  const m = mine || {};
  m[name] = tr;
  writtenAttr.set(el, m);
  if (tr !== value) el.setAttribute(name, tr);
}

/** Rebuild a sentence element's children from its translation, reusing the original elements
 * (so click handlers and ids stay). A translation whose tags don't match the key is not used.
 * Returns false when there is no translation (its pieces are then translated one by one). */
function translateSentence({ el, key, nodes, range }) {
  if (sentences.get(el) === key) return true;
  const tr = lookup(key);
  if (tr == null) return false;
  const tags = (s) => (s.match(/<\/?\d+\/?>/g) || []).sort().join();
  if (tags(tr) !== tags(key)) return false;
  const first = range[0], last = range[range.length - 1];
  const lead = first.nodeType === 3 ? first.data.match(/^\s*/)[0] : "";
  const trail = last.nodeType === 3 ? last.data.match(/\s*$/)[0] : "";
  const frag = document.createDocumentFragment();
  const stack = [frag];
  const top = () => stack[stack.length - 1];
  for (const p of (lead + tr + trail).split(/(<\/?\d+\/?>)/)) {
    const m = /^<(\/?)(\d+)(\/?)>$/.exec(p);
    if (!m) {
      if (p) { const n = document.createTextNode(p); writtenText.set(n, p); top().append(n); }
      continue;
    }
    const node = nodes[Number(m[2])];
    if (m[1]) { stack.pop(); continue; }
    if (m[3]) { top().append(node); continue; }
    node.textContent = "";
    top().append(node);
    stack.push(node);
  }
  const after = last.nextSibling;
  for (const c of range) if (c.parentNode === el) c.remove();
  el.insertBefore(frag, after);
  sentences.set(el, sentenceKey(el).key);
  return true;
}

/** Translate everything in this part of the page. */
export function translateTree(root) {
  if (!dict || !root) return;
  units(root, (kind, x) => {
    if (kind === "text") translateText(x);
    else if (kind === "attr") translateAttr(x);
    else return translateSentence(x);
  });
}

function onMutations(list) {
  if (!dict) return;
  const trees = new Set(), attrs = new Set();
  const textChanged = (n) => {
    if (writtenText.get(n) === n.data) return;
    if (n.parentNode && n.parentNode.nodeType === 1) trees.add(n.parentNode);
  };
  for (const m of list) {
    if (m.type === "childList") for (const n of m.addedNodes) n.nodeType === 3 ? textChanged(n) : trees.add(n);
    else if (m.type === "characterData") textChanged(m.target);
    else if (m.type === "attributes") attrs.add(m.target);
  }
  for (const el of trees) if (el.isConnected) translateTree(el);
  for (const el of attrs) {
    if (trees.has(el) || !el.isConnected || insideSkipped(el)) continue;
    for (const name of ATTRS) {
      const v = el.getAttribute(name);
      if (v && hasWords(v)) translateAttr({ el, name, value: v });
    }
  }
}

/** A whole HTML document (a page the app hands to its web browser) with its words translated. */
export function translateHtml(html) {
  if (!dict || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.documentElement.lang = current;
  doc.documentElement.dir = UI_LANGUAGES[current].dir;
  translateTree(doc.body);
  if (doc.title) doc.title = t(doc.title);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

/**
 * Show the app in this language from now on: load its dictionary, translate what is on screen and
 * keep translating what appears. `base` is where web/i18n/ is served from ("/" on the desktop).
 * English (or an unknown code) leaves the page as it is. Going from one language to another needs
 * a reload, since the English is not kept.
 */
export async function startTranslating(code, base = "") {
  if (!isUiLanguage(code)) code = "en";
  const root = document.documentElement;
  root.lang = code;
  root.dir = UI_LANGUAGES[code].dir;
  if (code === current && (code === "en" || observer)) return;
  current = code;
  if (code === "en") return;
  try {
    const res = await fetch(`${base}i18n/${code}.json`);
    setDictionary(await res.json());
  } catch {
    setDictionary(null); // no dictionary: stay in English rather than break the app
    return;
  }
  translateTree(document.body);
  if (document.title) document.title = t(document.title);
  // The browser's own boxes (confirm, alert, prompt) take plain text: translate it on the way in,
  // a paragraph at a time when the whole message isn't known.
  const message = (m) => {
    const s = String(m ?? "");
    const whole = lookup(norm(s));
    return whole ?? s.split(/(\n\s*\n)/).map((p, i) => (i % 2 ? p : lookup(norm(p)) ?? p)).join("");
  };
  for (const name of ["confirm", "alert", "prompt"]) {
    const original = window[name];
    if (typeof original === "function") window[name] = (m, ...rest) => original.call(window, message(m), ...rest);
  }
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
                                    attributes: true, attributeFilter: ATTRS });
}

/** A value put into a translation, its first letter made small ("lower") or capital ("upper"). */
function caseAs(v, how) {
  if (how === "lower") return v.charAt(0).toLocaleLowerCase(current) + v.slice(1);
  if (how === "upper") return v.charAt(0).toLocaleUpperCase(current) + v.slice(1);
  return v;
}
