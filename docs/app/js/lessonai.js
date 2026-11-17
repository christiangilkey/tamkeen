// "Find the questions with my AI" (lesson bundles): the teacher's or learner's own AI key reads the lesson's text and
// says which lines are passage and which are questions, when Tamkeen's own rules (lessonparse.js) got a layout
// wrong. What the AI is told is here (left out of the translations: tools/i18n/extract.mjs EXCLUDE); what comes
// back is checked and turned into the same items findQuestions makes. Only the text goes, never a file or a name.

export const LESSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "The document in reading order: passage paragraphs and questions.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["text", "heading", "question"] },
          text: { type: "string", description: "A paragraph or heading of the passage (type text or heading); the question's wording (type question)." },
          kind: { type: "string", enum: ["choice", "multi", "tf", "text", ""], description: "For a question: one answer, several answers, true/false, or written." },
          options: { type: "array", items: { type: "string" }, description: "For choice, multi and tf: the choices, without their letters." },
          answer: { type: "string", description: "The right answer if the document gives it (an option's text, or for several the texts joined by \" | \"), else \"\"." },
          lines: { type: "integer", description: "For a written answer: 1 for a word or phrase, 3 or more for sentences." },
        },
        required: ["type", "text", "kind", "options", "answer", "lines"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/** {system, user, schema, maxTokens} for askAi. `study`: the lesson's language, in English. */
export function lessonPrompt(text, { study = "Arabic" } = {}) {
  const system = `You find the questions in a language lesson handed out by a teacher: a ${study} reading or listening passage followed by (or mixed with) questions for the students. You are given the document's text line by line, as it was read out of a PDF or Word file (numbering, tick boxes and layout may be lost or garbled).
Return the document in reading order as items:
- "heading" for a title or section heading, "text" for each paragraph of the passage or of instructions (join lines that belong to one paragraph).
- "question" for each question the students must answer, with its wording in "text" (without its number), and "kind": "choice" (pick one of several options), "multi" (tick every right one), "tf" (true or false: give the two options in the document's own words, e.g. "True" and "False", or "صح" and "خطأ"), or "text" (a written answer; "lines": 1 for a gap or a short answer, 3 or more for sentences).
- For choice and multi: "options" are the choices exactly as written, without their letters or tick boxes.
- "answer": only when the document itself shows the right answer (a ticked box, an "Answer:" line, an answer key at the end); else "".
Copy every word exactly as written: never translate, correct, add vowel marks, or invent questions or options. Leave out page numbers and an answer key section itself (use it only for "answer").
Answer with JSON only.`;
  return { system, user: String(text || "").slice(0, 60000), schema: LESSON_SCHEMA, maxTokens: 16000 };
}

const tidy = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** What came back, as findQuestions' {items, key}. Anything odd is dropped. */
export function readLessonAnswer(answer) {
  const list = Array.isArray(answer && answer.items) ? answer.items.slice(0, 2000) : [];
  const items = [];
  const key = {};
  let n = 0;
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const text = tidy(x.text, 20000);
    if (!text) continue;
    if (x.type === "heading") { items.push({ type: "block", kind: "h2", text: text.slice(0, 300) }); continue; }
    if (x.type !== "question") { items.push({ type: "block", kind: "p", text }); continue; }
    let kind = ["choice", "multi", "tf", "text"].includes(x.kind) ? x.kind : "text";
    const opts = (Array.isArray(x.options) ? x.options : []).map((o) => tidy(o, 500)).filter(Boolean).slice(0, 12);
    if (kind !== "text" && opts.length < 2) kind = "text";
    const id = `q${++n}`;
    const options = kind === "text" ? [] : opts.map((t, k) => ({ id: String.fromCharCode(97 + k), label: "", text: t }));
    items.push({ type: "q", q: { id, kind, prompt: text.slice(0, 2000), options, lines: kind === "text" ? Math.max(1, Math.min(12, Number(x.lines) || 1)) : 1, number: n } });
    const ans = tidy(x.answer, 500);
    if (ans) {
      if (kind === "text") key[id] = ans;
      else {
        const parts = kind === "multi" ? ans.split("|").map((s) => s.trim()) : [ans];
        const ids = parts.map((p) => (options.find((o) => o.text.toLowerCase() === p.toLowerCase()) || {}).id).filter(Boolean);
        if (ids.length) key[id] = kind === "multi" ? ids : ids[0];
      }
    }
    if (n >= 200) break;
  }
  return { items, key };
}
