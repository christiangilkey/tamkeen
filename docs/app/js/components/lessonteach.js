// A DLI teacher's view of a lesson sent to a class (lesson bundles, supabase/v12-dli-lessons.sql): who handed it in,
// each student's answers marked against the answer key (multiple choice; written answers are for the teacher to
// read), and study words picked from the passage for one student, which their app puts in their Vocab. Nothing here
// is a grade and nothing is kept as one. Also the class's lessons inside the class box (dliteach.js openClass).

import { h, toast } from "../app.js";
import { t } from "../i18n.js";
import { bareWord, cleanQuestions, mark, optionLabel, sentenceAround, tally, unpackLesson } from "../lessons.js";
import { openModal } from "./modal.js";

const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const dir = (text) => (/[֐-ࣿ]/.test(text) ? "rtl" : "auto");

function answerText(q, a) {
  if (a === undefined || a === null || a === "" || (Array.isArray(a) && !a.length)) return "";
  if (q.kind === "text") return String(a);
  return [].concat(a).map((id) => { const o = q.options.find((x) => x.id === id); return o ? `${optionLabel(o.label)} ${o.text}`.trim() : ""; }).filter(Boolean).join(" · ");
}

/** The answers to lesson `lessonId`, for its teacher. `rec`/`blocks`: the teacher's own copy, when there is one
 *  (else the passage is fetched from the class's files). */
export function openLessonReport(lessonId, { rec = null, blocks = null } = {}) {
  const box = openModal({ title: rec ? rec.title : t("Answers"), wide: true, cls: "lsn-report-back" });
  const view = h(`<div class="lsn-report"><p class="small muted">Loading…</p></div>`);
  box.body.append(view);
  let report = null;
  let passage = blocks;

  async function load() {
    try {
      const dl = await import("../dlilessons.js");
      report = await dl.lessonReport(lessonId);
      if (!passage || !passage.length) {
        try { passage = unpackLesson(await dl.downloadPack({ id: report.lesson.id, class: report.lesson.class, files: report.lesson.files })).blocks; }
        catch { passage = []; }
      }
    } catch (e) { view.innerHTML = ""; const p = h(`<p class="small muted"></p>`); p.textContent = e.message; view.append(p); return; }
    box.setTitle(report.lesson.title);
    list();
  }

  function list() {
    view.innerHTML = "";
    const qs = cleanQuestions(report.lesson.questions);
    const key = report.lesson.key || {};
    const handed = report.students.filter((s) => s.handed_at).length;
    const sum = h(`<p class="lsn-sum"></p>`);
    sum.textContent = t("{0} of {1} students handed it in.", handed, report.students.length);
    view.append(sum);
    if (!report.students.length) { view.append(h(`<p class="small muted">No students in this class yet.</p>`)); return; }
    const table = h(`<div class="dls-scroll"><table class="dls-table lsn-table"><thead><tr><th>Student</th><th>Handed in</th><th>Right</th><th>To read</th><th>Study words</th></tr></thead><tbody></tbody></table></div>`);
    const body = table.querySelector("tbody");
    for (const s of report.students) {
      const tl = tally(qs, key, s.answers);
      const tr = h(`<tr tabindex="0"><td></td><td></td><td></td><td></td><td></td></tr>`);
      const cells = tr.children;
      cells[0].textContent = s.username;
      cells[1].textContent = s.handed_at ? day(s.handed_at) : Object.keys(s.answers).length ? t("Started") : t("Not yet");
      cells[2].textContent = tl.keyed ? `${tl.right} / ${tl.keyed}` : "–";
      cells[3].textContent = String(tl.open);
      cells[4].textContent = s.words.length ? (s.words_taken_at ? t("{0}, in their Vocab", s.words.length) : t("{0}, on the way", s.words.length)) : "–";
      tr.onclick = () => student(s);
      tr.onkeydown = (e) => { if (e.key === "Enter") student(s); };
      body.append(tr);
    }
    view.append(table);
    view.append(h(`<p class="small muted">Right counts the questions with an answer key (tick the right answers in Edit questions). Tap a student to read their answers and give them study words.</p>`));
  }

  function student(s) {
    view.innerHTML = "";
    const qs = cleanQuestions(report.lesson.questions);
    const key = report.lesson.key || {};
    const back = h(`<button type="button" class="ghost small">← <span>All students</span></button>`);
    back.onclick = list;
    const title = h(`<h3></h3>`);
    title.textContent = s.username;
    const meta = h(`<p class="small muted"></p>`);
    meta.textContent = s.handed_at ? t("Handed in {0}", day(s.handed_at)) : t("Not handed in yet");
    view.append(back, title, meta);
    qs.forEach((q, n) => {
      const a = s.answers[q.id];
      const m = mark(q, key, a);
      const card = h(`<div class="lsn-ans${m ? ` lsn-${m}` : ""}"><p class="lsn-ans-q"></p><p class="lsn-ans-a"></p></div>`);
      card.querySelector(".lsn-ans-q").textContent = `${q.number || n + 1}. ${q.prompt}`;
      card.querySelector(".lsn-ans-q").dir = dir(q.prompt);
      const shown = answerText(q, a);
      const ans = card.querySelector(".lsn-ans-a");
      ans.textContent = shown || t("(no answer)");
      ans.dir = dir(shown);
      if (m === "wrong" || (m === "" && key[q.id] !== undefined && q.kind !== "text")) {
        const k = h(`<p class="small lsn-key"></p>`);
        k.textContent = t("Answer: {0}", answerText(q, key[q.id]));
        card.append(k);
      }
      view.append(card);
    });
    view.append(wordPicker(s));
  }

  /** The passage with every word a button: the ones picked are this student's study words. */
  function wordPicker(s) {
    const part = h(`<div class="lsn-words"><h3>Study words for this student</h3>
      <p class="small muted">Tap words in the passage. Their app puts them in their Vocab, in a folder named after the lesson, each with its sentence.</p>
      <div class="lsn-words-text"></div><p class="lsn-words-picked small"></p>
      <div class="set-actions"><button type="button" class="primary" data-a="give">Give these words</button></div></div>`);
    const picked = new Map(s.words.map((w) => [w.word, w.sentence]));
    const text = part.querySelector(".lsn-words-text");
    const pickedEl = part.querySelector(".lsn-words-picked");
    const showPicked = () => { pickedEl.textContent = picked.size ? `${t("Picked:")} ${[...picked.keys()].join(" · ")}` : t("No words picked yet."); };
    if (!passage || !passage.length) text.append(h(`<p class="small muted">The passage couldn't be fetched.</p>`));
    for (const b of passage || []) {
      const p = h(`<p class="lsn-wp"></p>`);
      p.dir = dir(b.text);
      String(b.text).split(/\s+/).filter(Boolean).forEach((w, i) => {
        const word = bareWord(w);
        if (!word) { p.append(document.createTextNode(`${w} `)); return; }
        const btn = h(`<button type="button" class="lsn-w"></button>`);
        btn.textContent = w;
        btn.classList.toggle("on", picked.has(word));
        btn.onclick = () => {
          if (picked.has(word)) picked.delete(word); else picked.set(word, sentenceAround(b.text, i));
          for (const other of text.querySelectorAll(".lsn-w")) if (bareWord(other.textContent) === word) other.classList.toggle("on", picked.has(word));
          showPicked();
        };
        p.append(btn, document.createTextNode(" "));
      });
      text.append(p);
    }
    showPicked();
    part.querySelector("[data-a=give]").onclick = async () => {
      try {
        const words = [...picked].map(([word, sentence]) => ({ word, sentence }));
        const n = await (await import("../dlilessons.js")).giveWords(report.lesson.id, s.id, words);
        s.words = words.slice(0, n);
        s.words_taken_at = "";
        toast(n === 1 ? t("1 study word given to {0}.", s.username) : t("{0} study words given to {1}.", n, s.username));
      } catch (e) { toast(e.message, { error: true }); }
    };
    return part;
  }

  load();
  return box;
}

/** The class's lessons, for the class box (dliteach.js): each with how many handed it in and a way to the answers. */
export function classLessonsPart(classId) {
  const part = h(`<div class="lsn-class-part"><h3>Lessons</h3><div class="lsn-class-list"><p class="small muted">Loading…</p></div></div>`);
  const listEl = part.querySelector(".lsn-class-list");
  import("../dlilessons.js").then((dl) => dl.classLessons(classId)).then((items) => {
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.append(h(`<p class="small muted">No lessons sent yet. Add one in Library → Lessons, then press Send to a class.</p>`));
      return;
    }
    for (const it of items) {
      const row = h(`<div class="lsn-sent-row"><span><strong></strong> <span class="small muted"></span></span><button type="button" class="small">See answers</button></div>`);
      row.querySelector("strong").textContent = it.title;
      row.querySelector(".muted").textContent = t("{0} of {1} handed in", it.handed, it.students);
      row.querySelector("button").onclick = () => openLessonReport(it.id);
      listEl.append(row);
    }
  }).catch((e) => {
    listEl.innerHTML = "";
    const p = h(`<p class="small muted"></p>`);
    p.textContent = e && e.notReady ? t("Lessons aren't switched on yet.") : (e && e.message) || "";
    listEl.append(p);
  });
  return part;
}
