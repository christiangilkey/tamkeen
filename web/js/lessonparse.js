// Finding the questions in a lesson's document (lesson bundles: components/lessonpanel.js). No screen code, no
// network: the same rules on the computer, the phones and the web app.
//
// In: the document's lines in reading order, as lessonfiles.js reads them out of a PDF, a Word file, plain text or
// a scanned page: [{text, para?, list?: {level, label}, box?: "empty"|"checked", heading?: 1-3}] (`para`: a new
// paragraph starts here; `list`: Word's own numbering, which isn't in the text; `box`: a tick box in front).
// Out: { items, key } where items, in the document's order, are passage blocks {type: "block", kind, text} and
// questions {type: "q", q: {id, kind, prompt, options: [{id, label, text}], lines, number}}, and key is the answer
// key found in the document itself ({question id: option id | [option ids] | text}): an "Answer: b" line, a ticked
// box, or an "Answer key" section at the end ("1. b  2. c").
// kind: "choice" (one answer), "multi" (tick every right one), "tf" (true or false), "text" (written answer; `lines`
// says how much room: 1 = a short answer, 3 or more = a paragraph).

// ---------- reading the marks at the start of a line ----------
const DIGITS = { "٠": 0, "١": 1, "٢": 2, "٣": 3, "٤": 4, "٥": 5, "٦": 6, "٧": 7, "٨": 8, "٩": 9,
  "۰": 0, "۱": 1, "۲": 2, "۳": 3, "۴": 4, "۵": 5, "۶": 6, "۷": 7, "۸": 8, "۹": 9 };
export const westernDigits = (s) => String(s || "").replace(/[٠-٩۰-۹]/g, (d) => String(DIGITS[d]));

// The letters options are labelled with: Latin a–h, Arabic أ ب ج د ه و ز ح (and ا for أ), Persian ب پ…,
// Cyrillic а б в г д е, Greek-free. Option labels are compared by these keys.
const ARABIC_LABELS = ["أ", "ب", "ج", "د", "ه", "و", "ز", "ح"];
const CYRILLIC_LABELS = ["а", "б", "в", "г", "д", "е", "ж", "з"];
export function labelKey(label) {
  let s = westernDigits(String(label || "").trim().toLowerCase()).replace(/[()[\].:)\-–]/g, "");
  if (s === "ا" || s === "آ" || s === "إ") s = "أ";
  if (s === "هـ") s = "ه";
  let i = ARABIC_LABELS.indexOf(s);
  if (i >= 0) return String.fromCharCode(97 + i);
  i = CYRILLIC_LABELS.indexOf(s);
  if (i >= 0) return String.fromCharCode(97 + i);
  if (/^[a-h]$/.test(s)) return s;
  if (/^[1-8]$/.test(s)) return String.fromCharCode(96 + Number(s));
  return s;
}

const NUM = String.raw`(?:\d{1,3}|[٠-٩]{1,3}|[۰-۹]{1,3})`;
// "1.", "1)", "(1)", "1-", "Q1.", "Question 1:", "Q 1", "١.", "س١:", "السؤال ١:", "Вопрос 1.", "问题1", "第1题"
const QUESTION_STRICT = new RegExp(String.raw`^(?:(?:q(?:uestion)?|pregunta|frage|domanda|questão|вопрос|задание|السؤال|سؤال|س|سوال|پرسش|问题|問題|문제)\s*[.:#]?\s*(${NUM})[.:)\-–،]?|[(\[](${NUM})[)\]]|(${NUM})\s*[.)\-–:،])\s*(.+)$`, "iu");
const CJK_QUESTION = new RegExp(String.raw`^第\s*(${NUM})\s*[题題]\s*[:：.]?\s*(.+)$`, "u");
// "a)", "a.", "(a)", "A)", "[a]", "أ)", "أ-", "(ب)", "а)"; a capital letter needs ")" or "." AND a following capital-
// free or any text (titles like "A. Reading" are only taken as options right after a question).
const OPTION_RE = /^[(\[]?([a-hA-H]|[أاإآبجدهوزح]|هـ|[а-зА-З])\s*[)\].:\-–]\s*(.+)$/u;
// Tick boxes and the like drawn in front of an option.
const BOX_EMPTY = /^(?:[☐□○◯⬜❍◻▢⚪◦]|\[\s?\]|\(\s?\))\s*(.+)$/u;
const BOX_TICKED = /^(?:[☒☑✓✔✅●◉■▣⬛]|\[[xX✓✔]\]|\([xX✓✔]\))\s*(.+)$/u;
// "Answer: b", "Ans. b", "Key: b", "الجواب: ب", "الإجابة: ب", "پاسخ: ب", "Réponse : b", "Respuesta: b", "Ответ: б", "答案：B"
const ANSWER_RE = /^(?:answer|ans|key|correct answer|الجواب|الإجابة|الاجابة|الإجابة الصحيحة|جواب|پاسخ|réponse|respuesta|resposta|antwort|risposta|ответ|答案|정답|答え)\s*[.:：\-–]\s*(.*)$/iu;
// An "Answer key" heading: what follows it is the key, not the lesson.
const KEY_HEAD = /^(?:answer key|answers|key|answer sheet|الإجابات|مفتاح الإجابة|مفتاح الإجابات|الأجوبة|کلید پاسخ|پاسخ‌ها|corrigé|réponses|respuestas|clave de respuestas|soluciones|lösungen|soluzioni|respostas|gabarito|ответы|ключ|答案|정답|解答)\s*[:：]?$/iu;
// Room left for writing: a line of underscores or dots, or "Answer: ______".
const BLANK_LINE = /^[\s_.…\-–—]{6,}$/u;
const HAS_BLANK = /_{3,}|\.{5,}|…{2,}/u;
// True or false, in the languages Tamkeen teaches (the words used become the two choices).
const TF_WORDS = [
  [/\b(?:true\s*(?:or|\/)\s*false|t\s*\/\s*f)\b/i, "True", "False"],
  [/صح\s*(?:أو|ام|أم|\/)\s*خطأ|صواب\s*(?:أو|أم|\/)\s*خطأ/u, "صح", "خطأ"],
  [/درست\s*(?:یا|\/)\s*نادرست/u, "درست", "نادرست"],
  [/\bvrai\s*(?:ou|\/)\s*faux\b/i, "Vrai", "Faux"],
  [/\bverdadero\s*(?:o|\/)\s*falso\b/i, "Verdadero", "Falso"],
  [/\bverdadeiro\s*(?:ou|\/)\s*falso\b/i, "Verdadeiro", "Falso"],
  [/\bvero\s*(?:o|\/)\s*falso\b/i, "Vero", "Falso"],
  [/\brichtig\s*(?:oder|\/)\s*falsch\b/i, "Richtig", "Falsch"],
  [/правда\s*(?:или|\/)\s*ложь|верно\s*(?:или|\/)\s*неверно/iu, "Верно", "Неверно"],
  [/对\s*(?:还是|或|\/)\s*错|正确\s*(?:还是|或|\/)\s*错误/u, "对", "错"],
  [/맞음\s*(?:\/|또는)\s*틀림|참\s*(?:\/|또는)\s*거짓/u, "맞음", "틀림"],
];
// "Choose all that apply", "tick two", "اختر كل", "Отметьте все": more than one answer.
const MULTI_RE = /\b(?:all that apply|select all|choose all|tick all|check all|choose two|choose three|select two|select three|more than one)\b|اختر كل|اختر جميع|اختر إجابتين|همه موارد|toutes les réponses|todas las que|все верные|отметьте все|多选|복수/iu;
// A section's instructions ("Part 2", "Section B", "Questions 1–5", "Listen to track 3…") stay passage text.
const ENDS_SENTENCE = /[.!?؟。！？:：;؛]$/u;
const ENDS_QUESTION = /[?؟？]$/u;

export const MAX_QUESTIONS = 200;
export const MAX_OPTIONS = 12;
export const MAX_PROMPT = 2000;
export const MAX_OPTION = 500;

const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

function tfOf(text) {
  for (const [re, yes, no] of TF_WORDS) if (re.test(text)) return [yes, no];
  return null;
}

/** "a) Cairo b) Rabat c) Baghdad" on one line: the options in it (two or more), or null. */
export function inlineOptions(text) {
  const s = ` ${text}`;
  const re = /\s[(\[]?([a-hA-H]|[أاإبجدهوزح]|[а-з])\s*[)\]]\s*/gu;
  const marks = [];
  let m;
  while ((m = re.exec(s))) marks.push({ at: m.index, end: m.index + m[0].length, label: m[1] });
  // labels must run a, b, c… from the first mark on
  const run = [];
  for (const mk of marks) {
    const want = String.fromCharCode(97 + run.length);
    if (labelKey(mk.label) === want) run.push(mk);
  }
  if (run.length < 2) return null;
  const head = s.slice(0, run[0].at).trim();
  const options = run.map((mk, k) => ({ label: mk.label, text: s.slice(mk.end, k + 1 < run.length ? run[k + 1].at : s.length).trim() }));
  if (options.some((o) => !o.text)) return null;
  return { head, options };
}

function questionStart(line) {
  const text = line.text;
  if (line.list && line.list.level === 0 && /\d/.test(westernDigits(line.list.label))) {
    return { number: Number(westernDigits(line.list.label).replace(/\D/g, "")) || 0, prompt: text };
  }
  let m = CJK_QUESTION.exec(text);
  if (m) return { number: Number(westernDigits(m[1])), prompt: m[2] };
  m = QUESTION_STRICT.exec(text);
  if (m) {
    const n = m[1] || m[2] || m[3];
    if (Number(westernDigits(n)) > 500) return null; // a year or a page number, not a question
    return { number: Number(westernDigits(n)), prompt: m[4] };
  }
  return null;
}

function optionStart(line, expectOptions) {
  if (line.list && line.list.level > 0) return { label: line.list.label || "", text: line.text, ticked: line.box === "checked" };
  if (line.list && /^[a-h]$/i.test(labelKey(line.list.label)) && !/^\d/.test(line.list.label)) {
    return { label: line.list.label, text: line.text, ticked: line.box === "checked" };
  }
  if (line.box) return { label: "", text: line.text, ticked: line.box === "checked" };
  let m = BOX_TICKED.exec(line.text);
  if (m) return { label: "", text: m[1], ticked: true };
  m = BOX_EMPTY.exec(line.text);
  if (m) return { label: "", text: m[1], ticked: false };
  m = OPTION_RE.exec(line.text);
  if (m) {
    const capital = /^[A-H]$/.test(m[1]);
    if (capital && !expectOptions) return null; // "A. Reading": a section, unless options are due
    let text = m[2];
    let ticked = false;
    // "b) Rabat ✓" or "c) Baghdad (correct)" or "*d) …": the teacher's key in the file
    if (/\s*(?:[✓✔✅]|\(correct\)|\*)\s*$/iu.test(text)) { ticked = true; text = text.replace(/\s*(?:[✓✔✅]|\(correct\)|\*)\s*$/iu, ""); }
    return { label: m[1], text, ticked };
  }
  return null;
}

/** The answer an "Answer: …" line, a key entry or a ticked box gives, as option ids or text. */
export function answerFor(q, raw) {
  const text = tidy(raw).replace(/[.。]$/u, "");
  if (!text || BLANK_LINE.test(text) || /^_+$/.test(text)) return null;
  if (q.kind === "text") return text;
  // "b", "B)", "(b)", "b and d", "b, d", "أ و ج"
  const parts = text.split(/\s*(?:,|،|;|\/|\band\b|\bet\b|\by\b|\bи\b| و |&|\+)\s*|\s+/u).filter(Boolean);
  const ids = [];
  for (const p of parts) {
    const key = labelKey(p);
    const byLabel = q.options.find((o) => labelKey(o.label) === key && key.length === 1);
    const byText = q.options.find((o) => tidy(o.text).toLowerCase() === p.toLowerCase());
    const hit = byLabel || byText;
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  if (!ids.length) {
    const whole = q.options.find((o) => tidy(o.text).toLowerCase() === text.toLowerCase());
    if (whole) ids.push(whole.id);
  }
  if (!ids.length) return null;
  return q.kind === "multi" ? ids : ids[0];
}

function newQuestion(number, prompt) {
  return { id: "", kind: "text", prompt: tidy(prompt), options: [], lines: 1, number, tf: null, _keyRaw: null, _ticked: [] };
}

function finishQuestion(q) {
  // "Where is Cairo? a) Egypt b) Morocco": the options were on the question's own line
  if (!q.options.length) {
    const inl = inlineOptions(q.prompt);
    if (inl && inl.head) { q.prompt = inl.head; q.options = inl.options.map((o) => ({ ...o, ticked: false })); }
  }
  q.tf = tfOf(q.prompt);
  if (q.options.length >= 2) q.kind = MULTI_RE.test(q.prompt) || q._ticked.length > 1 ? "multi" : "choice";
  else if (q.tf) {
    q.kind = "tf";
    q.options = [{ label: "", text: q.tf[0] }, { label: "", text: q.tf[1] }];
  } else {
    q.kind = "text";
    q.options = [];
  }
  // a short answer line ("The capital is ____.") or room for a paragraph
  if (q.kind === "text") q.lines = Math.max(1, Math.min(12, q.lines));
  // (a label is kept as the letter alone: Word's "a)" and "(b)" become "a" and "b"; the screen adds its own bracket)
  const bare = (l) => tidy(l).replace(/^[(\[]+|[)\].:\-–]+$/gu, "");
  q.options = q.options.slice(0, MAX_OPTIONS).map((o, k) => ({ id: String.fromCharCode(97 + k), label: bare(o.label), text: tidy(o.text).slice(0, MAX_OPTION), ticked: !!o.ticked }));
  q.prompt = q.prompt.slice(0, MAX_PROMPT);
  return q;
}

/** The key section's entries: "1. b  2. c", "1-b, 2-a", "1) True", "١- ب". */
export function keyEntries(text) {
  const out = [];
  const re = new RegExp(String.raw`(${NUM})\s*[.)\-–:،=]\s*([^\s,;،]+(?:\s*(?:,|و|and)\s*[a-hأبجده](?=[\s,;،]|$))*)`, "gu");
  let m;
  while ((m = re.exec(text))) out.push({ number: Number(westernDigits(m[1])), answer: m[2] });
  return out;
}

/** The lesson's passage and questions from the document's lines (see the top of the file). */
export function findQuestions(lines) {
  const items = [];
  const key = {};
  let q = null;
  let inKey = false;
  const keyLines = [];
  let para = null; // the passage paragraph being put together {kind, text}
  let qCount = 0;

  const flushPara = () => {
    if (para && para.text.trim()) items.push({ type: "block", kind: para.kind, text: tidy(para.text) });
    para = null;
  };
  const closeQuestion = () => {
    if (!q) return;
    finishQuestion(q);
    q.id = `q${++qCount}`;
    if (q._keyRaw != null) {
      const a = answerFor(q, q._keyRaw);
      if (a != null) key[q.id] = a;
    }
    const ticked = q.options.filter((o) => o.ticked).map((o) => o.id);
    if (ticked.length && key[q.id] == null) key[q.id] = q.kind === "multi" ? ticked : ticked[0];
    for (const o of q.options) delete o.ticked;
    const { tf, _keyRaw, _ticked, _room, ...clean } = q;
    items.push({ type: "q", q: clean });
    q = null;
  };

  const list = (lines || []).map((l) => ({ ...l, text: tidy(l.text) })).filter((l) => l.text || l.box);
  for (let i = 0; i < list.length; i++) {
    const line = list[i];
    const next = list[i + 1];
    const text = line.text;
    if (inKey) { keyLines.push(text); continue; }
    if (KEY_HEAD.test(text) && !line.list) { flushPara(); closeQuestion(); inKey = true; continue; }
    if (line.heading) { flushPara(); closeQuestion(); items.push({ type: "block", kind: `h${Math.min(3, line.heading)}`, text }); continue; }

    const expect = !!q && q.options.length > 0 || (!!q && !q.tf && !HAS_BLANK.test(q.prompt));
    // an answer line for the question just read
    const ans = q ? ANSWER_RE.exec(text) : null;
    if (ans) {
      if (BLANK_LINE.test(ans[1]) || !ans[1].trim() || HAS_BLANK.test(ans[1])) q.lines = Math.max(q.lines, 1);
      else q._keyRaw = ans[1];
      continue;
    }
    if (q && BLANK_LINE.test(text)) { q._room = (q._room || 0) + 1; q.lines = Math.max(1, q._room); continue; }
    const opt = q ? optionStart(line, expect) : null;
    if (q && opt && opt.text) {
      // "a) …  b) …" several on one line
      const inl = inlineOptions(`${opt.label ? `${opt.label}) ` : ""}${opt.text}`);
      if (inl && !inl.head && opt.label) for (const o of inl.options) q.options.push({ ...o, ticked: false });
      else { q.options.push(opt); if (opt.ticked) q._ticked.push(opt); }
      continue;
    }
    const start = questionStart(line);
    // a question either has a number, or ends with "?" and options come straight after it
    const unnumbered = !start && ENDS_QUESTION.test(text) && next && !questionStart(next) && optionStart(next, true);
    if (start || unnumbered) {
      flushPara();
      closeQuestion();
      q = newQuestion(start ? start.number : 0, start ? start.prompt : text);
      if (HAS_BLANK.test(q.prompt)) q.lines = 1;
      continue;
    }
    if (q) {
      // the question goes on over another line, until its options start or a sentence ends
      if (!q.options.length && !ENDS_SENTENCE.test(q.prompt) && !line.para && text.length < 300) { q.prompt = `${q.prompt} ${text}`; continue; }
      closeQuestion();
    }
    // passage text: lines join into paragraphs
    const kind = line.quote ? "q" : line.list ? "li" : "p";
    if (!para || line.para || line.list || kind !== para.kind || para.kind === "li") { flushPara(); para = { kind, text }; }
    else para.text = /-$/.test(para.text) ? para.text.slice(0, -1) + text : /[぀-鿿]$/.test(para.text) ? para.text + text : `${para.text} ${text}`;
  }
  flushPara();
  closeQuestion();

  // the key section at the end: "1. b 2. c …", matched to the questions by their numbers (else their order)
  if (keyLines.length) {
    const entries = keyEntries(keyLines.join("  "));
    const qs = items.filter((it) => it.type === "q").map((it) => it.q);
    const numbered = qs.some((x) => x.number);
    for (const e of entries) {
      const target = numbered ? qs.find((x) => x.number === e.number) : qs[e.number - 1];
      if (!target || key[target.id] != null) continue;
      const a = answerFor(target, e.answer);
      if (a != null) key[target.id] = a;
    }
  }
  // (a document with nothing but questions in it still makes a lesson; one with neither is empty)
  return { items: items.slice(0, 2000).filter((it, k, all) => it.type !== "q" || all.slice(0, k + 1).filter((x) => x.type === "q").length <= MAX_QUESTIONS), key };
}

/** Lines out of plain text (a .txt file, a scanned page's text, the text box): a blank line starts a paragraph. */
export function linesOfText(text) {
  const out = [];
  let gap = true;
  for (const raw of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const t = raw.trim();
    if (!t) { gap = true; continue; }
    out.push({ text: t, para: gap });
    gap = false;
  }
  return out;
}
