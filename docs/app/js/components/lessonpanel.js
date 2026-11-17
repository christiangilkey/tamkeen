// Library → Lessons: lesson bundles (lessons.js). A teacher's PDF (with its sounds inside) or Word file (with its
// MP3s beside it) becomes one lesson: the passage to read, its audio tracks, and its questions to answer. Learners
// add their own; a DLI student also gets the lessons their teachers sent (dlilessons.js), with any study words.
// Shared by the computer, the phones and the web app.

import { esc, h, state, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { studyLanguage } from "../languages.js";
import { findQuestions } from "../lessonparse.js";
import { LESSON_AUDIO_EXT, LESSON_DOC_ACCEPT, isLessonAudio, isLessonDoc, readLessonFiles } from "../lessonfiles.js";
import { liveLessons } from "../lessons.js";
import { EVENT, addStudyWords, createLesson, readState, saveLesson, takeAssigned } from "../lessonstore.js";
import { openModal } from "./modal.js";
import { lessonView } from "./lessonview.js";

const settings = () => (state.status && state.status.settings) || {};
const dateText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

/** Who I am in DLI classes, asked once per panel: {teacher: [classes I teach], student: bool}. Never throws. */
async function dliRoles() {
  try {
    const { dliState } = await import("../dli.js");
    const cls = await import("../dliclass.js");
    const r = await cls.refresh();
    const me = r && r.me;
    if (!me) return { teacher: [], student: false, cls };
    const classes = me.classes || [];
    return { teacher: classes.filter((c) => c.role === "teacher"), student: classes.some((c) => c.role === "student") && cls.gate(settings()) === "open" && !!dliState(settings()).ready, cls };
  } catch { return { teacher: [], student: false, cls: null }; }
}

/** Read the chosen files into a new lesson (a box shows how it is going), then open it. */
async function importFiles(files, { onDone }) {
  const docs = [...files].filter(isLessonDoc);
  const sounds = [...files].filter((f) => !isLessonDoc(f) && isLessonAudio(f));
  if (!docs.length && !sounds.length) { toast(t("Choose a PDF, a Word file (.docx) or a text file, and any MP3s that go with it."), { error: true }); return; }
  const box = openModal({ title: t("Making the lesson"), canClose: false });
  const say = h(`<p class="lsn-step"></p>`);
  const bar = h(`<div class="progress"><i style="width:0%"></i></div>`);
  box.body.append(say, bar);
  const step = (text, frac = null) => { say.textContent = text; if (frac !== null) bar.firstElementChild.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; };
  try {
    step(t("Reading the file…"), 0.05);
    const lang = studyLanguage();
    const ocr = async (canvas, page) => {
      step(t("Reading scanned page {0}…", page));
      const { ocrPage } = await import("../lessonocr.js");
      return ocrPage(canvas, lang);
    };
    const read = await readLessonFiles([...docs, ...sounds], { ocr, onStep: (s) => s && s.pages && step(s.reading ? t("Reading scanned page {0}…", s.page) : t("Reading page {0} of {1}…", s.page, s.pages), 0.05 + 0.4 * (s.page / s.pages)) });
    for (const p of read.problems) toast(p.why === "big" ? t("{0} is too big (over 200 MB).", p.name) : p.why === "kind" ? t("{0} isn't a kind of file a lesson can use.", p.name)
      : p.message === "password" ? t("{0} is password-protected, so its text can't be read.", p.name) : t("{0} couldn't be read.", p.name), { error: true });
    const found = findQuestions(read.lines);
    if (!found.items.length && !read.audio.length) throw new Error(t("Nothing could be read from those files."));
    const title = read.title || (sounds[0] ? sounds[0].name.replace(/\.[^.]+$/, "") : t("Lesson"));
    const rec = await createLesson({ title, lang, items: found.items, key: found.key, audio: read.audio,
      onStep: (s) => s.of && step(s.done < s.of ? t("Adding track {0} of {1}…", Math.floor(s.done) + 1, s.of) : t("Done."), 0.45 + 0.55 * (s.done / s.of)) });
    box.close();
    const n = rec.questions.length;
    toast(read.scanned ? t("{0} scanned pages were read with the text reader: check the text and the questions.", read.scanned)
      : n ? t("{0} questions found. Check them with Edit questions.", n) : t("No questions were found: add them with Edit questions."));
    onDone(rec);
  } catch (e) {
    box.close();
    toast(e.message || t("That didn't work. Try again in a moment."), { error: true });
  }
}

/** Fill `el` with the Lessons tab. Returns a cleanup function. */
export function lessonPanel(el, language) {
  let alive = true;
  let roles = { teacher: [], student: false, cls: null };
  let assigned = [];
  let open = null; // the lesson screen's cleanup while one is open
  el.innerHTML = "";
  const page = h(`<div class="lsn-panel">
    <div class="lsn-top"><div><h2>Lessons</h2>
      <p class="small muted">A reading passage with its audio and its questions. Add a PDF (its sounds come with it) or a Word file with its MP3s.</p></div>
      <label class="btn primary lsn-add">${icon("upload", 18)} <span>Add a lesson</span>
        <input type="file" multiple hidden accept="${esc(`${LESSON_DOC_ACCEPT},audio/*,${LESSON_AUDIO_EXT.map((e) => `.${e}`).join(",")}`)}"></label></div>
    <div class="lsn-assigned" hidden></div>
    <div class="lsn-list"></div>
  </div>`);
  el.append(page);
  const listEl = page.querySelector(".lsn-list");
  const assignedEl = page.querySelector(".lsn-assigned");
  const input = page.querySelector("input[type=file]");
  input.onchange = () => {
    const files = [...input.files];
    input.value = "";
    if (files.length) importFiles(files, { onDone: (rec) => show(rec) });
  };

  function show(rec) {
    if (open) open();
    page.hidden = true;
    const spot = h(`<div class="lsn-open"></div>`);
    el.append(spot);
    const close = lessonView(spot, rec, { roles, back: () => { if (open) open(); open = null; spot.remove(); page.hidden = false; paint(); }, assigned });
    open = () => { close(); spot.remove(); };
  }

  async function paint() {
    if (!alive) return; // (it may be built a moment before it is on the page: it draws anyway)
    const lessons = liveLessons(await readState(), language);
    listEl.innerHTML = "";
    if (!lessons.length) {
      listEl.append(h(`<div class="lsn-empty"><p>No lessons yet.</p><p class="small muted">Choose a teacher's PDF or Word file with Add a lesson. Pick its MP3s at the same time, or add them later.</p></div>`));
    }
    for (const rec of lessons) {
      const answered = Object.keys(rec.answers).length;
      const row = h(`<button type="button" class="lsn-row"><span class="lsn-row-ico">${icon("list", 22)}</span>
        <span class="lsn-row-text"><strong></strong><span class="small muted"></span></span><span class="lsn-row-tag"></span></button>`);
      row.querySelector("strong").textContent = rec.title;
      const bits = [rec.questions.length === 1 ? t("1 question") : t("{0} questions", rec.questions.length),
        rec.tracks.length === 1 ? t("1 track") : t("{0} tracks", rec.tracks.length)];
      if (rec.questions.length) bits.push(t("{0} of {1} answered", answered, rec.questions.length));
      row.querySelector(".muted").textContent = bits.join(" · ");
      const tag = row.querySelector(".lsn-row-tag");
      if (rec.from) tag.textContent = rec.handed ? t("Handed in") : rec.from.class_name;
      else if (rec.sent.length) tag.textContent = t("Sent to {0}", rec.sent.map((s) => s.class_name).join(", "));
      row.onclick = () => show(rec);
      listEl.append(row);
    }
    paintAssigned(lessons);
  }

  function paintAssigned(lessons) {
    assignedEl.innerHTML = "";
    const fresh = assigned.filter((a) => !lessons.some((r) => r.from && r.from.lesson === a.id));
    assignedEl.hidden = !fresh.length;
    if (!fresh.length) return;
    assignedEl.append(h(`<h3>From your teachers</h3>`));
    for (const a of fresh) {
      const row = h(`<div class="lsn-row lsn-new"><span class="lsn-row-ico">${icon("send", 22)}</span>
        <span class="lsn-row-text"><strong></strong><span class="small muted"></span></span><button type="button" class="primary">Open</button></div>`);
      row.querySelector("strong").textContent = a.title;
      row.querySelector(".muted").textContent = [a.class_name, a.due ? t("Due {0}", dateText(a.due)) : "", a.teachers.join(", ")].filter(Boolean).join(" · ");
      const btn = row.querySelector("button");
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = t("Getting it…");
        try { show(await take(a, (s) => { if (s.of) btn.textContent = t("Track {0} of {1}…", Math.min(s.of, Math.floor(s.done) + 1), s.of); })); }
        catch (e) { toast(e.message || t("That didn't work. Try again in a moment."), { error: true }); btn.disabled = false; btn.textContent = t("Open"); }
      };
      assignedEl.append(row);
    }
  }

  async function take(item, onStep) {
    const dl = await import("../dlilessons.js");
    const pack = await dl.downloadPack(item);
    return takeAssigned(item, pack, (name) => dl.downloadFile(item, name), { onStep });
  }

  /** Lessons from teachers: a newer version is taken in by itself (the corrected transcripts and passage); study
   *  words go in the Vocab once. */
  async function checkAssigned() {
    roles = await dliRoles();
    if (!alive || !roles.student) return;
    let items = [];
    try { items = await (await import("../dlilessons.js")).myLessons(); } catch { return; }
    assigned = items.filter((a) => !a.language || a.language === language);
    const st = await readState();
    for (const a of assigned) {
      const rec = liveLessons(st).find((r) => r.from && r.from.lesson === a.id);
      if (!rec) continue;
      try {
        let cur = rec;
        if (a.version > rec.from.version) {
          cur = await take(a, () => {});
          toast(t("{0} was updated by your teacher.", a.title));
        }
        if (a.words.length && a.words_at && (!a.words_taken_at || a.words_at > a.words_taken_at) && a.words_at !== cur.from.words_at) {
          const n = await addStudyWords(cur, a.words, a.language || cur.lang);
          await (await import("../dlilessons.js")).tookWords(a.id);
          await saveLesson({ ...cur, from: { ...cur.from, words_at: a.words_at, took: Date.now() / 1000 } });
          if (n) toast(n === 1 ? t("Your teacher gave you 1 study word from {0}. It's in your Vocab.", a.title)
            : t("Your teacher gave you {0} study words from {1}. They're in your Vocab.", n, a.title));
        }
      } catch { /* next time */ }
    }
    paint();
  }

  const redraw = () => { if (!open) paint(); };
  window.addEventListener(EVENT, redraw);
  paint();
  checkAssigned();
  return () => { alive = false; window.removeEventListener(EVENT, redraw); if (open) open(); };
}
