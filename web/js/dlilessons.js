// DLI lessons online (supabase/v12-dli-lessons.sql): a teacher sends a lesson to a class, its students take it in,
// answer it and hand it in, the teacher reads the answers and gives study words. Every call goes through a dli_*
// function that checks who is asking; the files sit in the private storage "dli-lessons" at
// <class id>/<lesson id>/<file>, which only that class's teachers and students can open (its teachers alone add and
// remove). No names: people are their usernames. No grade is kept.

import * as social from "./social.js";
import { dliRpc } from "./dliclass.js";
import { audioMime, cleanWords, packLesson, trackFileName } from "./lessons.js";
import { gunzipText, gzipText } from "./sharetext.js";

export const BUCKET = "dli-lessons";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const line = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function bucket() { return (await social.sb()).storage.from(BUCKET); }
const folder = (cls, lesson) => `${cls}/${lesson}`;

function cleanItem(x) {
  if (!x || !UUID_RE.test(String(x.id || "")) || !UUID_RE.test(String(x.class || ""))) return null;
  return {
    id: String(x.id), class: String(x.class), class_name: line(x.class_name, 60), title: line(x.title, 120), language: line(x.language, 12),
    questions: Array.isArray(x.questions) ? x.questions : [], files: (Array.isArray(x.files) ? x.files : []).map(String).filter((f) => /^[\w.-]{1,80}$/.test(f)),
    version: Math.max(0, Number(x.version) || 0), due: /^\d{4}-\d{2}-\d{2}$/.test(String(x.due || "")) ? String(x.due) : "",
    sent_at: String(x.sent_at || ""), teachers: (Array.isArray(x.teachers) ? x.teachers : []).map((t) => line(t, 20)).filter(Boolean).slice(0, 10),
    answers: x.answers && typeof x.answers === "object" && !Array.isArray(x.answers) ? x.answers : {},
    handed_at: String(x.handed_at || ""), words: cleanWords(x.words), words_at: String(x.words_at || ""), words_taken_at: String(x.words_taken_at || ""),
  };
}

/** The packed file of the newest version ("lesson-3.json.gz") among a lesson's files. */
export const packName = (files) => [...(files || [])].filter((f) => /^lesson-\d+\.json\.gz$/.test(f))
  .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))[0] || "";

// ---------------------------------------------------------------- students
/** The lessons sent to my classes, newest first, each with my answers and study words. */
export async function myLessons() {
  return (await dliRpc("dli_my_lessons")).map(cleanItem).filter(Boolean);
}

/** One of a lesson's files, as a Blob. */
export async function downloadFile(item, name) {
  const { data, error } = await (await bucket()).download(`${folder(item.class, item.id)}/${name}`);
  if (error || !data) throw new Error("Couldn't get the lesson's files. Check your internet connection and try again.");
  return data;
}

/** The lesson's packed passage, questions and transcripts. */
export async function downloadPack(item) {
  const name = packName(item.files);
  if (!name) throw new Error("This lesson has no files yet.");
  return gunzipText(await downloadFile(item, name));
}

/** Keep my answers online (and with `handIn`, hand the lesson in). Resolves to the lesson as I see it now. */
export const saveWork = async (lessonId, answers, handIn = false) => cleanItem(await dliRpc("dli_save_work", { lesson: lessonId, answers, hand_in: !!handIn }));
/** My app has put the study words in my Vocab. */
export const tookWords = (lessonId) => dliRpc("dli_took_words", { lesson: lessonId });

// ---------------------------------------------------------------- teachers
export async function classLessons(classId) {
  return ((await dliRpc("dli_class_lessons", { class: classId })) || []).map((x) => ({
    id: String(x.id), title: line(x.title, 120), version: Number(x.version) || 0, due: String(x.due || ""), sent_at: String(x.sent_at || ""),
    updated_at: String(x.updated_at || ""), questions: Number(x.questions) || 0, handed: Number(x.handed) || 0, students: Number(x.students) || 0,
    files: Array.isArray(x.files) ? x.files.map(String) : [],
  })).filter((x) => UUID_RE.test(x.id));
}

export async function lessonReport(lessonId) {
  const r = await dliRpc("dli_lesson_report", { lesson: lessonId });
  const l = r.lesson || {};
  return {
    lesson: { id: String(l.id), class: String(l.class), title: line(l.title, 120), language: line(l.language, 12), questions: Array.isArray(l.questions) ? l.questions : [],
              key: l.answer_key && typeof l.answer_key === "object" ? l.answer_key : {}, files: Array.isArray(l.files) ? l.files.map(String) : [],
              version: Number(l.version) || 0, due: String(l.due || "") },
    students: (r.students || []).map((s) => ({ id: String(s.id), username: line(s.username, 20), answers: s.answers && typeof s.answers === "object" ? s.answers : {},
      handed_at: String(s.handed_at || ""), updated_at: String(s.updated_at || ""), words: cleanWords(s.words), words_at: String(s.words_at || ""),
      words_taken_at: String(s.words_taken_at || "") })),
  };
}

export const giveWords = (lessonId, studentId, words) => dliRpc("dli_give_words", { lesson: lessonId, student: studentId, words: cleanWords(words) });
export const setDue = (lessonId, due) => dliRpc("dli_set_lesson_due", { lesson: lessonId, due: due || null });

/** Send a lesson to a class, or (with `existing`, the online lesson sent before) send its corrected copy.
 *  `tracks`: [{title, kind, blob?, mime?, name?, youtube?, podcast?, segments?}] in order; a file track's sound is
 *  uploaded once and kept under the same name afterwards (`keepFiles`: names already there, not sent again).
 *  Resolves to {lesson, version}. `onStep({done, of})` hears the uploads. */
export async function sendLesson({ classId, rec, blocks, tracks, existing = null, keepFiles = [], onStep = () => {} }) {
  const store = await bucket();
  const lessonId = existing || await dliRpc("dli_add_lesson", { class: classId, title: rec.title.slice(0, 120), language: rec.lang || "",
                                                                  questions: rec.questions, answer_key: rec.key || {} });
  if (!UUID_RE.test(String(lessonId))) throw new Error("That didn't work. Try again in a moment.");
  const where = folder(classId, lessonId);
  const files = [];
  const packed = [];
  const steps = tracks.filter((t) => t.kind === "file" && t.blob).length + 1;
  let done = 0;
  for (const [n, t] of tracks.entries()) {
    if (t.kind === "file") {
      const name = trackFileName(n + 1, t.name, t.mime || (t.blob && t.blob.type));
      if (!keepFiles.includes(name)) {
        if (!t.blob) throw new Error("A track's sound file couldn't be found on this device.");
        if (t.blob.size > MAX_FILE_BYTES) throw new Error(`“${t.title}” is over 25 MB, too big to send. Make it smaller (a lower bit rate) and try again.`);
        onStep({ done, of: steps, name: t.title });
        const up = await store.upload(`${where}/${name}`, t.blob, { contentType: audioMime(name, t.blob.type), upsert: true });
        if (up.error) throw new Error(`Couldn't upload “${t.title}”. ${up.error.message || ""}`.trim());
        done++;
      }
      files.push(name);
      packed.push({ title: t.title, kind: "file", file: { name, mime: audioMime(name, t.mime || (t.blob && t.blob.type)), size: t.blob ? t.blob.size : 0 }, segments: t.segments || null });
    } else packed.push({ title: t.title, kind: t.kind, youtube: t.youtube || null, podcast: t.podcast || null, segments: t.segments || null });
  }
  const version = Number(existing ? (rec.sent.find((s) => s.lesson === existing) || {}).version || 0 : 0) + 1;
  const name = `lesson-${version}.json.gz`;
  onStep({ done, of: steps, name: rec.title });
  const blob = await gzipText(packLesson(rec, blocks, packed));
  const up = await store.upload(`${where}/${name}`, blob, { contentType: "application/gzip", upsert: true });
  if (up.error) throw new Error(`Couldn't upload the lesson. ${up.error.message || ""}`.trim());
  files.push(name);
  const v = await dliRpc("dli_send_lesson", { lesson: lessonId, files, questions: rec.questions, answer_key: rec.key || {}, title: rec.title.slice(0, 120) });
  // the files the lesson doesn't use any more (an older version's pack, a track taken out)
  const listed = await store.list(where, { limit: 100 }).catch(() => ({ data: [] }));
  const stale = ((listed && listed.data) || []).map((o) => o.name).filter((n) => !files.includes(n));
  if (stale.length) await store.remove(stale.map((n) => `${where}/${n}`)).catch(() => null);
  onStep({ done: steps, of: steps });
  return { lesson: String(lessonId), version: Number(v) || version };
}

/** Take a lesson back from the class: its files first (the storage lets a teacher remove them only while the lesson
 *  is there), then the lesson and every student's work on it. */
export async function removeSent(classId, lessonId) {
  const store = await bucket();
  const where = folder(classId, lessonId);
  const listed = await store.list(where, { limit: 100 }).catch(() => ({ data: [] }));
  const names = ((listed && listed.data) || []).map((o) => `${where}/${o.name}`);
  if (names.length) await store.remove(names).catch(() => null);
  return dliRpc("dli_remove_lesson", { lesson: lessonId });
}
