// Lesson bundles: a readable passage, its audio tracks and its questions, made from a teacher's PDF or Word file
// (components/lessonpanel.js). No screen code, no network: the same on the computer, the phones and the web app.
//
// Where a lesson lives (every version):
//   the passage   a book-like episode in the built-in list "local:lessons" (POST /books {list: "lessons"}), so it
//                 opens in the book reader with the word popup, is searched, and syncs through Drive like a book
//   the tracks    the lesson's MP3s as own audio files in the same list (uploadVideo {lesson}), transcribed by the
//                 usual pipeline; a YouTube video or podcast episode stays where it is and is pointed at
//   the record    everything else, one per lesson, in the synced setting `lesson_state` ({id: record}): title,
//                 language, the questions, the answer key (a teacher's own), the learner's answers, where the
//                 tracks are (episode uids), and, for a lesson from a DLI class, which one. Merged between devices
//                 lesson by lesson: the copy changed last wins (app/lessons.py is the computer's twin).
//
// A lesson sent to a class travels as one packed file (packLesson: the passage, the questions without the key, and
// each track's transcript as the teacher corrected it) plus the audio files (dlilessons.js, supabase/v12).

export const STATE_KEY = "lesson_state";
export const LESSON_LIST = "lessons";
export const LESSONS_FEED = "local:lessons";
export const PACK_FORMAT = "tamkeen-lesson";
export const PACK_VERSION = 1;
export const KINDS = ["choice", "multi", "tf", "text"];
export const TRACK_KINDS = ["file", "youtube", "podcast", "episode"];
export const MAX_LESSONS = 300;
export const MAX_TRACKS = 60;
export const MAX_QUESTIONS = 200;
export const MAX_OPTIONS = 12;
export const MAX_ANSWER = 4000;
export const MAX_WORDS = 200;
export const MAX_SPOTS = 100;
export const GONE_DAYS = 60;
const DAY = 86400;

const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const QID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{1,8})?$/;

const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
const line = (v, max) => str(v, max * 2).replace(/\s+/g, " ").trim().slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

export function newLessonId() {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------- questions, keys and answers ----------
export function cleanQuestion(x, k = 0) {
  if (!x || typeof x !== "object") return null;
  const kind = KINDS.includes(x.kind) ? x.kind : "text";
  const id = QID_RE.test(String(x.id || "")) ? String(x.id) : `q${k + 1}`;
  const prompt = str(x.prompt, 2000).trim();
  const options = kind === "text" ? [] : (Array.isArray(x.options) ? x.options : []).slice(0, MAX_OPTIONS)
    .map((o, i) => ({ id: QID_RE.test(String(o && o.id || "")) ? String(o.id) : String.fromCharCode(97 + i),
                      label: line(o && o.label, 8), text: line(o && o.text, 500) }))
    .filter((o, i, all) => all.findIndex((p) => p.id === o.id) === i);
  if (kind !== "text" && options.length < 2) return { id, kind: "text", prompt, options: [], lines: 1, at: Math.max(0, Math.floor(num(x.at))) };
  const out = { id, kind, prompt, options, lines: kind === "text" ? Math.max(1, Math.min(12, Math.floor(num(x.lines)) || 1)) : 1,
                at: Math.max(0, Math.floor(num(x.at))) };
  if (num(x.number)) out.number = Math.floor(num(x.number));
  return out;
}

export function cleanQuestions(list) {
  const out = [];
  for (const [k, x] of (Array.isArray(list) ? list : []).entries()) {
    const q = cleanQuestion(x, k);
    if (q && !out.some((p) => p.id === q.id)) out.push(q);
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

/** One answer as kept: an option id (choice, true/false), option ids (multi) or text (written). */
export function cleanAnswer(q, v) {
  if (!q) return undefined;
  const ids = new Set(q.options.map((o) => o.id));
  if (q.kind === "text") return typeof v === "string" ? str(v, MAX_ANSWER) : undefined;
  if (q.kind === "multi") {
    const arr = (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(String).filter((x) => ids.has(x));
    return [...new Set(arr)];
  }
  const one = Array.isArray(v) ? v[0] : v;
  return ids.has(String(one)) ? String(one) : undefined;
}

export function cleanAnswers(questions, answers) {
  const out = {};
  if (!answers || typeof answers !== "object") return out;
  for (const q of questions) {
    if (!(q.id in answers)) continue;
    const a = cleanAnswer(q, answers[q.id]);
    if (a !== undefined && !(Array.isArray(a) && !a.length) && a !== "") out[q.id] = a;
  }
  return out;
}

/** Is an answer right? "right" / "wrong" against the key; "open" for a written answer (a teacher reads it); ""
 *  when nothing was answered or there is no key for it. Typed answers that match the key letter for letter
 *  (ignoring case, marks and spaces) count as right. */
export function mark(q, key, answer) {
  if (answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && !answer.length)) return "";
  const k = key ? key[q.id] : undefined;
  if (q.kind === "text") {
    if (typeof k === "string" && k && loose(k) === loose(answer)) return "right";
    return "open";
  }
  if (k === undefined || k === null || (Array.isArray(k) && !k.length)) return "";
  const want = [].concat(k).map(String).sort().join(",");
  const got = [].concat(answer).map(String).sort().join(",");
  return want === got ? "right" : "wrong";
}

const loose = (s) => String(s || "").normalize("NFKD").replace(/[ً-ٰٟـ̀-ͯ]/g, "")
  .replace(/[\s.,;:!?؟،。、"'«»()[\]-]+/g, "").toLowerCase();

/** How many are right, wrong, to read (written) and not answered. */
export function tally(questions, key, answers) {
  const t = { right: 0, wrong: 0, open: 0, blank: 0, keyed: 0 };
  for (const q of questions) {
    const m = mark(q, key, answers ? answers[q.id] : undefined);
    if (m === "right") t.right++; else if (m === "wrong") t.wrong++; else if (m === "open") t.open++; else t.blank++;
    if (key && key[q.id] !== undefined && q.kind !== "text") t.keyed++;
  }
  return t;
}

// ---------- the record of one lesson ----------
function cleanTrack(x) {
  if (!x || typeof x !== "object") return null;
  const uid = str(x.uid, 64).trim();
  if (!/^[\w-]{1,64}$/.test(uid)) return null;
  return { uid, title: line(x.title, 200), kind: TRACK_KINDS.includes(x.kind) ? x.kind : "file" };
}

function cleanFrom(x) {
  if (!x || typeof x !== "object" || !UUID_RE.test(String(x.lesson || "")) || !UUID_RE.test(String(x.cls || ""))) return null;
  return { lesson: String(x.lesson), cls: String(x.cls), class_name: line(x.class_name, 60),
           teachers: (Array.isArray(x.teachers) ? x.teachers : []).slice(0, 10).map((t) => line(t, 20)).filter(Boolean),
           version: Math.floor(num(x.version)), due: /^\d{4}-\d{2}-\d{2}$/.test(String(x.due || "")) ? String(x.due) : "",
           words_at: str(x.words_at, 40), took: num(x.took), saved: num(x.saved) };
}

function cleanSent(x) {
  if (!x || typeof x !== "object" || !UUID_RE.test(String(x.lesson || "")) || !UUID_RE.test(String(x.cls || ""))) return null;
  // (`tracks`: the uids of the tracks whose sound was uploaded, in order, so a corrected copy sends only new ones)
  return { lesson: String(x.lesson), cls: String(x.cls), class_name: line(x.class_name, 60), version: Math.floor(num(x.version)), at: num(x.at),
           tracks: (Array.isArray(x.tracks) ? x.tracks : []).map((u) => String(u)).filter((u) => /^[\w-]{1,64}$/.test(u)).slice(0, MAX_TRACKS) };
}

// ---------- sound spots (prototype lesson_links) ----------
// A PDF or Word file can link to sound files on the teacher's own computer instead of carrying them ("Audio Files/1.mp3"
// in a Launch link). Each link is a spot: the file's name, where it sits (beside question `qid`, or before passage block
// `at`), and the track that plays it once the file is added (`track`, a uid; "" = not added yet).
export function cleanSpot(x, k = 0) {
  if (!x || typeof x !== "object") return null;
  const name = line(x.name, 120);
  if (!name) return null;
  return { id: QID_RE.test(String(x.id || "")) ? String(x.id) : `s${k + 1}`, name, at: Math.max(0, Math.floor(num(x.at))),
           qid: QID_RE.test(String(x.qid || "")) ? String(x.qid) : "", track: /^[\w-]{1,64}$/.test(String(x.track || "")) ? String(x.track) : "" };
}

export function cleanSpots(list, questions = null) {
  const out = [];
  for (const [k, x] of (Array.isArray(list) ? list : []).entries()) {
    const sp = cleanSpot(x, k);
    if (!sp || out.some((o) => o.id === sp.id)) continue;
    if (questions && sp.qid && !questions.some((q) => q.id === sp.qid)) sp.qid = "";
    out.push(sp);
    if (out.length >= MAX_SPOTS) break;
  }
  return out;
}

/** A sound file's name as it is matched: no folder, no ending, small letters, spaces/dashes/underscores alike, and a
 *  name that is only a number without its leading zeros ("01.mp3" = "1.mp3"). */
export function spotKey(name) {
  let s = String(name || "").split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,5}$/i, "").normalize("NFKC").toLowerCase()
    .replace(/[\s_\-.]+/g, " ").trim();
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}
const lastNumber = (key) => { const m = /(\d+)\D*$/.exec(key); return m ? Number(m[1]) : null; };

/** Which spot each added file is for: [spot id or ""] in the files' order. Each spot takes one file: first the files with
 *  the same name, then (when it is the only one that fits) the file whose last number is the spot's ("Track 01.mp3" for
 *  "1.mp3"). Spots that have a track already are matched last. */
export function matchFiles(spots, names) {
  const keys = names.map(spotKey);
  const out = names.map(() => "");
  const taken = new Set();
  const order = [...spots].sort((a, b) => (a.track ? 1 : 0) - (b.track ? 1 : 0));
  keys.forEach((k, i) => {
    const sp = order.find((x) => !taken.has(x.id) && spotKey(x.name) === k);
    if (sp) { out[i] = sp.id; taken.add(sp.id); }
  });
  keys.forEach((k, i) => {
    if (out[i]) return;
    const n = lastNumber(k);
    if (n === null) return;
    const fits = order.filter((x) => !taken.has(x.id) && lastNumber(spotKey(x.name)) === n);
    const rivals = keys.filter((k2, j) => !out[j] && lastNumber(k2) === n);
    if (fits.length === 1 && rivals.length === 1) { out[i] = fits[0].id; taken.add(fits[0].id); }
  });
  return out;
}

/** The sound spots a lesson's file gives when it is read again (a lesson made before links were read: v0.64.0), put on
 *  the lesson as it is now. `found` is splitItems() of the file read again; `blocks` the lesson's passage blocks now.
 *  A question's spot goes to the question with the same wording (else the same number); a passage spot before the
 *  block with the same text (else after the one before it, else at the same share of the way through). The lesson's
 *  tracks that no spot plays yet fill the spots with their name ("1" for "1.mp3"). */
export function respot(rec, blocks, found) {
  const norm = (x) => String(x || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const qs = rec.questions || [];
  const byPrompt = new Map();
  for (const q of qs) if (!byPrompt.has(norm(q.prompt))) byPrompt.set(norm(q.prompt), q);
  const texts = (blocks || []).map((b) => norm(b.text));
  const oldTexts = (found.blocks || []).map((b) => norm(b.text));
  const spots = [];
  for (const sp of found.spots || []) {
    let qid = "";
    let at = 0;
    if (sp.qid) {
      const was = (found.questions || []).find((q) => q.id === sp.qid);
      const q = (was && byPrompt.get(norm(was.prompt))) || qs.find((x) => x.id === sp.qid);
      if (q) { qid = q.id; at = q.at; }
    }
    if (!qid) {
      const after = oldTexts[sp.at] ? texts.indexOf(oldTexts[sp.at]) : -1;
      const before = sp.at > 0 && oldTexts[sp.at - 1] ? texts.indexOf(oldTexts[sp.at - 1]) : -1;
      at = after >= 0 ? after : before >= 0 ? before + 1
        : Math.round(sp.at * texts.length / Math.max(1, oldTexts.length));
    }
    spots.push({ id: `s${spots.length + 1}`, name: sp.name, at: Math.min(at, texts.length), qid, track: "" });
  }
  const out = cleanSpots(spots, qs);
  const used = new Set((rec.spots || []).map((sp) => sp.track).filter(Boolean));
  const free = (rec.tracks || []).filter((t) => t.kind === "file" && !used.has(t.uid));
  const forSpot = matchFiles(out, free.map((t) => t.title));
  free.forEach((t, i) => { const sp = out.find((x) => x.id === forSpot[i]); if (sp) sp.track = t.uid; });
  return out;
}

/** A lesson record as kept, or null. */
export function cleanLesson(x) {
  if (!x || typeof x !== "object" || !ID_RE.test(String(x.id || ""))) return null;
  const id = String(x.id);
  const updated = num(x.updated);
  if (num(x.gone)) return { id, gone: num(x.gone), updated: updated || num(x.gone) };
  const questions = cleanQuestions(x.questions);
  const qs = new Map(questions.map((q) => [q.id, q]));
  const key = {};
  if (x.key && typeof x.key === "object") {
    for (const [qid, v] of Object.entries(x.key)) {
      const q = qs.get(qid);
      const a = q && (q.kind === "text" ? (typeof v === "string" ? str(v, 500) : undefined) : cleanAnswer(q, v));
      if (a !== undefined && a !== "" && !(Array.isArray(a) && !a.length)) key[qid] = a;
    }
  }
  const tracks = [];
  for (const tr of (Array.isArray(x.tracks) ? x.tracks : [])) {
    const t = cleanTrack(tr);
    if (t && !tracks.some((o) => o.uid === t.uid)) tracks.push(t);
    if (tracks.length >= MAX_TRACKS) break;
  }
  const sent = (Array.isArray(x.sent) ? x.sent : []).map(cleanSent).filter(Boolean).slice(0, 20);
  const spots = cleanSpots(x.spots, questions);
  return {
    id, title: line(x.title, 200) || "Lesson", lang: LANG_RE.test(String(x.lang || "")) ? String(x.lang) : "",
    made: num(x.made) || updated, updated, passage: /^[\w-]{1,64}$/.test(String(x.passage || "")) ? String(x.passage) : "",
    tracks, questions, key, answers: cleanAnswers(questions, x.answers), handed: num(x.handed),
    from: cleanFrom(x.from), sent, spots,
    // (its file was read for links to sound files: lessons made before that was done can have it read again)
    ...(x.linked || spots.length ? { linked: 1 } : {}),
  };
}

/** Every lesson in the synced setting, cleaned: {id: record}. Too many: the oldest go first. */
export function cleanState(raw) {
  let obj = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { obj = {}; } }
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  const list = Object.values(obj).map(cleanLesson).filter(Boolean).sort((a, b) => b.updated - a.updated).slice(0, MAX_LESSONS);
  for (const r of list) out[r.id] = r;
  return out;
}

/** Two devices' lessons put together: for each lesson, the copy changed last wins (mine on a tie). Removed lessons
 *  are remembered GONE_DAYS days so the other device doesn't bring them back. (app/lessons.py merge_state, twin.) */
export function mergeStates(mine, theirs, now = Date.now() / 1000) {
  const a = cleanState(mine), b = cleanState(theirs);
  const out = { ...a };
  for (const [id, r] of Object.entries(b)) if (!out[id] || r.updated > out[id].updated) out[id] = r;
  for (const [id, r] of Object.entries(out)) if (r.gone && now - r.gone > GONE_DAYS * DAY) delete out[id];
  return cleanState(out);
}

export const liveLessons = (state, lang = "") => Object.values(cleanState(state))
  .filter((r) => !r.gone && (!lang || !r.lang || r.lang === lang)).sort((a, b) => b.made - a.made);

export function putLesson(state, rec, now = Date.now() / 1000) {
  const r = cleanLesson({ ...rec, updated: Math.max(now, num(rec.updated) + 0.001) });
  if (!r) throw new Error("bad lesson");
  return { ...cleanState(state), [r.id]: r };
}

export function dropLesson(state, id, now = Date.now() / 1000) {
  const s = cleanState(state);
  if (!s[id]) return s;
  return { ...s, [id]: { id, gone: now, updated: now } };
}

/** The lesson from a DLI class with this online id, if this device has it. */
export const fromClass = (state, lessonId) => liveLessons(state).find((r) => r.from && r.from.lesson === lessonId) || null;

// ---------- the passage and where the questions go ----------
/** findQuestions' items → the passage's blocks (for POST /books) and the questions, each with `at` = how many
 *  passage blocks come before it. */
export function splitItems(items) {
  const blocks = [];
  const questions = [];
  const spots = [];
  const list = items || [];
  list.forEach((it, i) => {
    if (it.type === "q") questions.push({ ...it.q, at: blocks.length });
    else if (it.type === "audio") {
      // (a sound link straight before a question is that question's)
      const next = list[i + 1];
      const qid = it.qid || (next && next.type === "q" ? next.q.id : "");
      spots.push({ id: `s${spots.length + 1}`, name: it.name, at: blocks.length, qid, track: "" });
    } else if (it.text && String(it.text).trim()) blocks.push({ kind: it.kind || "p", text: it.text, ...(it.marks ? { marks: it.marks } : {}) });
  });
  const qs = cleanQuestions(questions);
  return { blocks, questions: qs, spots: cleanSpots(spots, qs) };
}

/** The lesson in reading order again: [{type: "block", block, index} | {type: "q", q} | {type: "spot", spot}]. A question's
 *  sound spots come just before it; the other spots after the questions at their place, before the next block. */
export function bodyOf(blocks, questions, spots = []) {
  const out = [];
  const qs = [...(questions || [])].sort((a, b) => a.at - b.at);
  const byQ = new Map();
  const loose = [];
  for (const sp of spots || []) {
    if (sp.qid && qs.some((q) => q.id === sp.qid)) byQ.set(sp.qid, [...(byQ.get(sp.qid) || []), sp]);
    else loose.push(sp);
  }
  loose.sort((a, b) => a.at - b.at);
  let k = 0, j = 0;
  const pushQ = (q) => { for (const sp of byQ.get(q.id) || []) out.push({ type: "spot", spot: sp }); out.push({ type: "q", q }); };
  const upTo = (at) => {
    while (k < qs.length && qs[k].at <= at) pushQ(qs[k++]);
    while (j < loose.length && loose[j].at <= at) out.push({ type: "spot", spot: loose[j++] });
  };
  (blocks || []).forEach((b, i) => {
    // (a sound beside a short heading, "Passage 1", plays under it rather than above it)
    const title = /^h[1-3]/.test(String(b.kind || "")) || (String(b.text || "").length <= 40 && !/[.?!؟:;]\s*$/.test(String(b.text || "")));
    if (title) {
      while (k < qs.length && qs[k].at <= i) pushQ(qs[k++]);
      while (j < loose.length && loose[j].at < i) out.push({ type: "spot", spot: loose[j++] });
      out.push({ type: "block", block: b, index: i });
      while (j < loose.length && loose[j].at <= i) out.push({ type: "spot", spot: loose[j++] });
      return;
    }
    upTo(i);
    out.push({ type: "block", block: b, index: i });
  });
  upTo(Infinity);
  return out;
}

// ---------- study words from the passage ----------
/** The sentence of `text` that word number `index` (counted at spaces, from 0) is in. */
export function sentenceAround(text, index) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const i = Math.max(0, Math.min(words.length - 1, index));
  const ends = (w) => /[.!?؟。！？]["'»)\]]*$/u.test(w);
  let a = i, b = i;
  while (a > 0 && !ends(words[a - 1])) a--;
  while (b < words.length - 1 && !ends(words[b])) b++;
  return words.slice(a, b + 1).join(" ").slice(0, 400);
}

/** A word as a study word: its edge punctuation off. */
export const bareWord = (w) => String(w || "").replace(/^[\s"'«»“”‘’()[\]{}.,;:!?؟،。、…-]+|[\s"'«»“”‘’()[\]{}.,;:!?؟،。、…-]+$/gu, "").slice(0, 80);

export function cleanWords(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const word = bareWord(x && x.word);
    if (!word || out.some((o) => o.word === word)) continue;
    out.push({ word, sentence: line(x.sentence, 400) });
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

// ---------- the packed lesson a class receives ----------
/** What a class's students download: never the answer key, the teacher's own answers or what the lesson was sent
 *  to. `tracks`: [{title, kind, file: {name, mime, size} | null, youtube: {id, title, channel} | null,
 *  podcast: {feed_url, guid, audio_url, title, image} | null, segments (sharetext.js packTranscript's) | null}]. */
export function packLesson(rec, blocks, tracks) {
  const r = cleanLesson(rec);
  return {
    format: PACK_FORMAT, v: PACK_VERSION, title: r.title, lang: r.lang,
    blocks: (blocks || []).slice(0, 20000).map((b) => ({ kind: String(b.kind || "p").slice(0, 200), text: str(b.text, 20000) })),
    questions: r.questions,
    tracks: (tracks || []).slice(0, MAX_TRACKS).map(packTrack).filter(Boolean),
    // (each spot with the number of the track that plays it, in this list: the students' own copies have their own uids)
    spots: r.spots.map((sp) => ({ name: sp.name, at: sp.at, qid: sp.qid, track: r.tracks.findIndex((t) => t.uid === sp.track) })),
  };
}

function packTrack(t) {
  if (!t || typeof t !== "object") return null;
  const kind = ["file", "youtube", "podcast"].includes(t.kind) ? t.kind : "file";
  const out = { title: line(t.title, 200) || "Track", kind };
  if (kind === "file") {
    const f = t.file || {};
    if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/.test(String(f.name || ""))) return null;
    out.file = { name: String(f.name), mime: line(f.mime, 60) || "audio/mpeg", size: Math.floor(num(f.size)) };
  } else if (kind === "youtube") {
    if (!/^[\w-]{11}$/.test(String(t.youtube && t.youtube.id || ""))) return null;
    out.youtube = { id: t.youtube.id, title: line(t.youtube.title, 300), channel: line(t.youtube.channel, 200) };
  } else {
    const p = t.podcast || {};
    if (!/^https?:\/\//i.test(String(p.feed_url || ""))) return null;
    out.podcast = { feed_url: str(p.feed_url, 1000), guid: str(p.guid, 500), audio_url: /^https?:\/\//i.test(String(p.audio_url || "")) ? str(p.audio_url, 1000) : "",
                    title: line(p.title, 500), image: String(p.image || "").startsWith("https://") ? str(p.image, 1000) : "" };
  }
  if (t.segments && Array.isArray(t.segments)) out.segments = t.segments;
  return out;
}

/** A packed lesson that arrived, checked; throws when it isn't one. (Each track's `segments` are checked again by
 *  sharetext.js unpackTranscript before they are stored.) */
export function unpackLesson(x) {
  if (!x || x.format !== PACK_FORMAT || Number(x.v) > PACK_VERSION) throw new Error("not a lesson");
  return {
    title: line(x.title, 200) || "Lesson", lang: LANG_RE.test(String(x.lang || "")) ? String(x.lang) : "",
    blocks: (Array.isArray(x.blocks) ? x.blocks : []).slice(0, 20000)
      .map((b) => ({ kind: String(b && b.kind || "p").slice(0, 200), text: str(b && b.text, 20000) })).filter((b) => b.text.trim()),
    questions: cleanQuestions(x.questions),
    tracks: (Array.isArray(x.tracks) ? x.tracks : []).slice(0, MAX_TRACKS).map(packTrack).filter(Boolean),
    spots: (Array.isArray(x.spots) ? x.spots : []).slice(0, MAX_SPOTS).map((sp, k) => {
      const c = cleanSpot({ ...sp, track: "" }, k);
      return c && { ...c, trackIndex: Number.isInteger(sp.track) && sp.track >= 0 ? sp.track : -1 };
    }).filter(Boolean),
  };
}

/** A storage-safe file name for track `n` of a lesson ("track-3.mp3"). */
export function trackFileName(n, name, mime = "") {
  const ext = (String(name || "").toLowerCase().match(/\.(mp3|m4a|m4b|aac|ogg|oga|opus|wav|flac|webm|mp4)$/) || [])[1]
    || ({ "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
          "audio/flac": "flac", "audio/webm": "webm", "audio/opus": "opus", "audio/x-m4a": "m4a" })[String(mime).toLowerCase()] || "mp3";
  return `track-${n}.${ext}`;
}

/** The type storage is told for a track file (the bucket takes audio of these types only). */
export function audioMime(name, mime = "") {
  const ext = (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  return ({ mp3: "audio/mpeg", m4a: "audio/mp4", m4b: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg",
            opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac", webm: "audio/webm" })[ext] || (String(mime).startsWith("audio/") ? mime : "audio/mpeg");
}

/** A choice's label as shown: "a)" (the label is kept as the letter alone; older ones may still carry Word's own ")"). */
export function optionLabel(label) {
  const s = String(label || "").trim().replace(/^[([]+|[)\].:\-–]+$/gu, "");
  return s ? `${s})` : "";
}
