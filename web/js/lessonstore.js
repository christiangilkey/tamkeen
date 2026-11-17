// Lesson bundles on this device: making a lesson from what was read out of the files, keeping its record, putting
// its parts back together, and taking in a lesson a DLI teacher sent (lessons.js has the rules; this file talks to
// the app's /api, which the computer's server and the phones' backend.js both answer the same way).

import { api, audioUrl, saveSettings, state, uploadVideo } from "./app.js";
import { STATE_KEY, cleanLesson, cleanState, cleanWords, dropLesson, fromClass, liveLessons, newLessonId, putLesson, splitItems, unpackLesson } from "./lessons.js";
import { acceptInto, unpackTranscript } from "./sharetext.js";

const settings = () => (state.status && state.status.settings) || {};
export const EVENT = "tamkeen:lessons";

/** Every lesson kept here ({id: record}), read afresh. */
export async function readState() {
  try {
    const s = await api("/settings");
    if (state.status && state.status.settings) state.status.settings[STATE_KEY] = s[STATE_KEY];
    return cleanState(s[STATE_KEY]);
  } catch { return cleanState(settings()[STATE_KEY]); }
}

async function writeState(next) {
  // (the app's own saver: the computer merges it with what is kept; a phone keeps it and syncs it soon after)
  const out = await saveSettings({ [STATE_KEY]: next });
  const kept = cleanState((out && out[STATE_KEY]) || next);
  if (state.status && state.status.settings) state.status.settings[STATE_KEY] = kept;
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* no window (tests) */ }
  return kept;
}

/** The lessons to show for `lang` (and those with no language), newest first. */
export async function lessonList(lang = "") { return liveLessons(await readState(), lang); }
export async function getLesson(id) { const s = await readState(); const r = s[id]; return r && !r.gone ? r : null; }

/** Keep a changed record (its answers, its questions…). Resolves to the record as kept. */
export async function saveLesson(rec) {
  const next = putLesson(await readState(), rec);
  const kept = await writeState(next);
  return kept[rec.id] || cleanLesson(rec);
}

/** Remove a lesson from this device and the learner's others: its record, its passage and its own audio files
 *  (a YouTube video or podcast it pointed at stays in the Library). */
export async function removeLesson(rec) {
  const ids = [];
  for (const uid of [rec.passage, ...rec.tracks.filter((t) => t.kind === "file").map((t) => t.uid)]) {
    const ep = await episodeByUid(uid);
    if (ep) ids.push(ep.id);
  }
  if (ids.length) await api("/episodes/delete", { method: "POST", body: { ids } }).catch(() => null);
  await writeState(dropLesson(await readState(), rec.id));
}

/** The episode an uid names on this device, or null. */
export async function episodeByUid(uid) {
  if (!uid) return null;
  try { return await api(`/episodes/uid/${encodeURIComponent(uid)}`); } catch { return null; }
}

/** The passage's blocks (headings, paragraphs) as stored. */
export async function passageBlocks(rec) {
  const ep = await episodeByUid(rec.passage);
  if (!ep) return { episode: null, blocks: [] };
  const t = await api(`/episodes/${ep.id}/transcript`);
  return { episode: ep, blocks: (t.segments || []).map((s) => ({ kind: String(s.kind || "p"), text: String(s.text || "") })) };
}

/** Store (or replace) a lesson's passage. Resolves to its episode. */
export async function savePassage(rec, blocks) {
  return api("/books", { method: "POST", body: {
    guid: `file:lesson:${rec.id}`, title: rec.title, author: "", lang: rec.lang || "", list: "lessons",
    blocks: blocks.length ? blocks : [{ kind: "p", text: rec.title }],
  } });
}

/** Add one audio file to a lesson as a track (own audio, in the lessons' list). `transcribe: false` when its
 *  transcript comes with it (a teacher's). Resolves to {uid, id, title}. */
export async function addTrack(rec, file, { title = "", transcribe = true, onProgress = () => {} } = {}) {
  // (a sound taken out of a PDF or Word file is a Blob with no name: it gets one, with the ending its type says,
  // since the app tells audio by the file's ending)
  const ext = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/flac": "flac",
                "audio/webm": "webm", "audio/aac": "aac" }[String(file.type || "").toLowerCase()] || "mp3";
  const named = file instanceof File && /\.[a-z0-9]{2,4}$/i.test(file.name) ? file
    : new File([file], `${(title || "track").replace(/[\\/:*?"<>|]+/g, " ").trim() || "track"}.${ext}`, { type: file.type || "audio/mpeg" });
  const ep = await uploadVideo(named, onProgress, { lesson: true, transcribe, title: title || named.name.replace(/\.[^.]+$/, "") });
  return { uid: ep.uid || ep.id, id: ep.id, title: ep.title || title };
}

/** A new lesson from what the files gave (lessonfiles.js + lessonparse.js findQuestions):
 *  {title, lang, items, key, audio: [{name, blob}]}. `onStep({done, of, name})` hears each track's upload. */
export async function createLesson({ title, lang, items, key = {}, audio = [], onStep = () => {} }) {
  const { blocks, questions } = splitItems(items);
  let rec = cleanLesson({ id: newLessonId(), title, lang, made: Date.now() / 1000, updated: Date.now() / 1000, questions, key, tracks: [] });
  const ep = await savePassage(rec, blocks);
  rec = { ...rec, passage: ep.uid || ep.id, lang: rec.lang || ep.language || "" };
  rec = await saveLesson(rec);
  for (const [n, a] of audio.entries()) {
    onStep({ done: n, of: audio.length, name: a.name });
    const file = a.blob instanceof File ? a.blob : new File([a.blob], a.name, { type: a.blob.type || "" });
    const t = await addTrack(rec, file, { title: a.name.replace(/\.[^.]+$/, ""),
      onProgress: (f) => onStep({ done: n + f, of: audio.length, name: a.name }) });
    rec = await saveLesson({ ...rec, tracks: [...rec.tracks, { uid: t.uid, title: t.title, kind: "file" }] });
  }
  onStep({ done: audio.length, of: audio.length });
  return rec;
}

/** An item already in the Library (a podcast episode, YouTube video, own audio…) as a lesson's track. */
export function trackOfEpisode(ep) {
  const type = String(ep.audio_type || "");
  const kind = type === "video/youtube" ? "youtube" : /^https?:/i.test(String(ep.feed_url || "")) ? "podcast" : "episode";
  return { uid: ep.uid || ep.id, title: ep.title || "", kind };
}

/** A track's sound file, for sending it to a class: the file itself (own audio) as a Blob. */
export async function trackBlob(ep) {
  const url = await audioUrl(ep.id);
  if (!url) throw new Error("no audio");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  return res.blob();
}

// ---------------------------------------------------------------- a lesson from a DLI teacher
/** Take in a lesson a class received (dlilessons.js myLessons item + its downloaded pack): its passage, each track
 *  with the teacher's transcript, and a record that remembers where it came from. `download(name)` resolves to one
 *  of its files as a Blob. Done again for a newer version, the same lesson is brought up to date in place (answers
 *  are kept). Resolves to the record. */
export async function takeAssigned(item, packRaw, download, { onStep = () => {} } = {}) {
  const pack = unpackLesson(packRaw);
  const before = fromClass(await readState(), item.id);
  let rec = cleanLesson({
    ...(before || {}), id: before ? before.id : newLessonId(), title: pack.title || item.title, lang: pack.lang || item.language || "",
    made: before ? before.made : Date.now() / 1000, questions: pack.questions, key: {},
    answers: before ? before.answers : item.answers, handed: before ? before.handed : Date.parse(item.handed_at || "") / 1000 || 0,
    tracks: before ? before.tracks : [],
    from: { lesson: item.id, cls: item.class, class_name: item.class_name, teachers: item.teachers, version: 0, due: item.due || "",
            words_at: before && before.from ? before.from.words_at : "", took: before && before.from ? before.from.took : 0 },
  });
  const ep = await savePassage(rec, pack.blocks);
  rec = { ...rec, passage: ep.uid || ep.id, lang: rec.lang || ep.language || "" };
  const tracks = [];
  for (const [n, t] of pack.tracks.entries()) {
    onStep({ done: n, of: pack.tracks.length, name: t.title });
    const text = t.segments ? unpackTranscript({ segments: t.segments }) : null;
    const old = rec.tracks[n];
    if (t.kind === "file") {
      let target = old && old.kind === "file" ? await episodeByUid(old.uid) : null;
      if (!target) {
        const blob = await download(t.file.name);
        const made = await addTrack(rec, new File([blob], `${t.title}.${t.file.name.split(".").pop()}`, { type: t.file.mime }),
          { title: t.title, transcribe: !text });
        target = { id: made.id, uid: made.uid };
      }
      if (text && text.segments) await api(`/episodes/${target.id}/transcript`, { method: "PUT", body: { segments: text.segments, model: "teacher" } });
      tracks.push({ uid: target.uid || target.id, title: t.title, kind: "file" });
    } else if (t.kind === "youtube") {
      const got = await acceptInto(api, { kind: "youtube", url: `https://www.youtube.com/watch?v=${t.youtube.id}`, title: t.youtube.title || t.title,
                                          subtitle: t.youtube.channel, language: rec.lang || null }, { ...(text || {}), model: "teacher" });
      if (got.episode) tracks.push({ uid: got.episode.uid || got.episode.id, title: t.title, kind: "youtube" });
    } else if (t.kind === "podcast") {
      const got = await acceptInto(api, { kind: "podcast", ...t.podcast, title: t.podcast.title || t.title, language: rec.lang || null },
        { ...(text || {}), model: "teacher" });
      if (got.episode) {
        // (a podcast episode this device had transcribed itself kept its own words: the teacher's go over them)
        if (got.keptOwn && text && text.segments) await api(`/episodes/${got.episode.id}/transcript`, { method: "PUT", body: { segments: text.segments, model: "teacher" } });
        tracks.push({ uid: got.episode.uid || got.episode.id, title: t.title, kind: "podcast" });
      }
    }
  }
  onStep({ done: pack.tracks.length, of: pack.tracks.length });
  rec = await saveLesson({ ...rec, tracks, from: { ...rec.from, version: item.version } });
  return rec;
}

/** Study words a teacher gave from a lesson, put in the Vocab once, in a folder named after the lesson. Resolves
 *  to how many cards were added. */
export async function addStudyWords(rec, words, language) {
  const list = cleanWords(words);
  if (!list.length) return 0;
  const name = `${rec.title}`.slice(0, 60);
  let folder = null;
  try {
    const folders = await api(`/vocab/folders?language=${encodeURIComponent(language || rec.lang || "")}`);
    folder = (folders || []).find((f) => f.name === name) || null;
    if (!folder) folder = await api("/vocab/folders", { method: "POST", body: { name, language: language || rec.lang || "" } });
  } catch { folder = null; }
  const have = new Set();
  if (folder) {
    try {
      const v = await api(`/vocab?folder=${encodeURIComponent(folder.uid)}`);
      for (const c of (Array.isArray(v) ? v : v.items || [])) have.add(c.text);
    } catch { /* add them all */ }
  }
  const cards = list.filter((w) => !have.has(w.word)).map((w) => ({
    text: w.word, sentence: w.sentence, source: rec.title, language: language || rec.lang || "", folders: folder ? [folder.uid] : [],
  }));
  for (let i = 0; i < cards.length; i += 100) await api("/vocab/batch", { method: "POST", body: { cards: cards.slice(i, i + 100) } });
  return cards.length;
}
