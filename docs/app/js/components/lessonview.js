// One lesson (lesson bundles): its audio tracks, the passage with its questions in place, and answer boxes that keep
// what is typed or ticked. A lesson from a DLI teacher is handed in; a teacher's own lesson can be sent to a class,
// corrected and sent again, and its answers read (lessonteach.js). Shared by every version.

import { api, esc, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { LESSON_AUDIO_EXT } from "../lessonfiles.js";
import { bodyOf, mark, optionLabel, tally } from "../lessons.js";
import { addTrack, episodeByUid, passageBlocks, removeLesson, saveLesson, savePassage, trackBlob, trackOfEpisode } from "../lessonstore.js";
import { packTranscript } from "../sharetext.js";
import { confirmBox, openModal } from "./modal.js";
import { openQuestionEditor, openPassageEditor } from "./lessonedit.js";
import { openTranscriptEditor } from "./transcripteditor.js";

const dir = (text) => (/[֐-ࣿ]/.test(text) ? "rtl" : "auto");
const youTubeId = (url) => ((String(url || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1] || "");

/** Fill `el` with lesson `rec`. `roles`: {teacher: [classes], student}; `back()` returns to the list. Returns a
 *  cleanup function. */
export function lessonView(el, recIn, { roles = { teacher: [] }, back, assigned = [] } = {}) {
  let rec = recIn;
  let blocks = [];
  let passageEp = null;
  let checking = false;
  let alive = true;
  let saveTimer = 0;
  const own = !rec.from; // made here (not from a teacher): its questions can be changed
  const teacher = own && (roles.teacher || []).length > 0;
  el.innerHTML = "";
  const page = h(`<div class="lsn-view">
    <div class="lsn-bar"><button type="button" class="ghost" data-a="back">${icon("back", 18)} <span>My files</span></button><span class="lsn-bar-gap"></span>
      <button type="button" class="ghost icon" data-a="more" title="More" aria-label="More">${icon("more", 20)}</button></div>
    <h2 class="lsn-title"></h2><p class="small muted lsn-meta"></p>
    <section class="lsn-tracks"></section>
    <div class="lsn-sent" hidden></div>
    <div class="lsn-body"><p class="small muted">Loading…</p></div>
    <div class="lsn-foot set-actions"></div>
  </div>`);
  el.append(page);
  const $ = (s) => page.querySelector(s);

  page.querySelector("[data-a=back]").onclick = () => { flush(); back(); };
  page.querySelector("[data-a=more]").onclick = (e) => moreMenu(e.currentTarget);

  // ---------------------------------------------------------------- saving answers
  // Kept on the learner's own devices as they go (the synced record). A lesson from a class sends its answers online
  // only when the student presses Hand in: a teacher never sees work in progress. (What is on screen stays the
  // record to save from: a save that finishes late never puts back an older answer.)
  const keep = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; saveLesson(rec).catch((e) => toast(e.message, { error: true })); }, 600);
  };
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; saveLesson(rec).catch(() => null); }
  }

  // ---------------------------------------------------------------- the parts
  function head() {
    $(".lsn-title").textContent = rec.title;
    $(".lsn-title").dir = dir(rec.title);
    const bits = [];
    if (rec.from) bits.push(rec.from.class_name, rec.from.teachers.join(", "), rec.from.due ? t("Due {0}", rec.from.due) : "");
    if (rec.handed) bits.push(t("Handed in {0}", new Date(rec.handed * 1000).toLocaleDateString()));
    $(".lsn-meta").textContent = bits.filter(Boolean).join(" · ");
  }

  async function tracks() {
    const box = $(".lsn-tracks");
    box.innerHTML = "";
    const headRow = h(`<div class="lsn-sec"><h3>Audio</h3></div>`);
    if (own) {
      const add = h(`<label class="btn ghost small">${icon("plus", 16)} <span>Add audio</span><input type="file" multiple hidden accept="${esc(`audio/*,${LESSON_AUDIO_EXT.map((x) => `.${x}`).join(",")}`)}"></label>`);
      const input = add.querySelector("input");
      input.onchange = async () => {
        const files = [...input.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        input.value = "";
        for (const f of files) {
          try {
            toast(t("Adding {0}…", f.name));
            const tr = await addTrack(rec, f, { title: f.name.replace(/\.[^.]+$/, "") });
            rec = await saveLesson({ ...rec, tracks: [...rec.tracks, { uid: tr.uid, title: tr.title, kind: "file" }] });
          } catch (e) { toast(e.message, { error: true }); }
        }
        tracks();
      };
      headRow.append(add);
    }
    box.append(headRow);
    if (!rec.tracks.length) {
      box.append(h(`<p class="small muted">No audio in this lesson.</p>`));
      return;
    }
    for (const [n, tr] of rec.tracks.entries()) {
      const row = h(`<div class="lsn-track"><span class="lsn-track-n"></span><span class="lsn-track-text"><strong></strong><span class="small muted"></span></span>
        <span class="lsn-track-acts"></span></div>`);
      row.querySelector(".lsn-track-n").textContent = String(n + 1);
      row.querySelector("strong").textContent = tr.title || t("Track {0}", n + 1);
      box.append(row);
      const ep = await episodeByUid(tr.uid);
      if (!alive) return;
      const note = row.querySelector(".muted");
      const acts = row.querySelector(".lsn-track-acts");
      if (!ep) { note.textContent = t("Not on this device yet: it arrives with the next sync."); continue; }
      const st = ep.status;
      note.textContent = st === "done" ? (rec.from ? t("Transcript checked by your teacher") : t("Transcribed"))
        : st === "queued" ? t("Waiting to be transcribed") : st === "transcribing" || st === "downloading" ? t("Being transcribed…")
        : st === "failed" ? t("Couldn't be transcribed") : t("Not transcribed yet");
      if (rec.from && st === "done" && ep.model && ep.model !== "teacher") note.textContent = t("Transcribed");
      acts.append(h(`<a class="btn primary small" href="#/episode/${esc(ep.id)}">${icon("play", 16)} <span>Play</span></a>`));
      if (st === "done") {
        const fix = h(`<button type="button" class="ghost small">${icon("edit", 16)} <span>Correct the transcript</span></button>`);
        fix.onclick = () => openTranscriptEditor(ep, { onSaved: () => tracks() });
        acts.append(fix);
      } else if (st === "new" || st === "failed") {
        const go = h(`<button type="button" class="ghost small">Transcribe</button>`);
        go.onclick = async () => { await api("/episodes/transcribe", { method: "POST", body: { ids: [ep.id] } }).catch((e) => toast(e.message, { error: true })); tracks(); };
        acts.append(go);
      }
      if (own) {
        const drop = h(`<button type="button" class="ghost icon small" title="Take out of the lesson" aria-label="Take out of the lesson">${icon("close", 14)}</button>`);
        drop.onclick = async () => {
          if (!(await confirmBox(t("Take “{0}” out of the lesson?", tr.title), tr.kind === "file" ? t("Its audio file is removed too.") : t("It stays in your Library."), { ok: t("Take out"), danger: true }))) return;
          if (tr.kind === "file") await api(`/episodes/${ep.id}`, { method: "DELETE" }).catch(() => null);
          rec = await saveLesson({ ...rec, tracks: rec.tracks.filter((x) => x.uid !== tr.uid) });
          tracks();
        };
        acts.append(drop);
      }
    }
  }

  function questionEl(q, n) {
    const answer = rec.answers[q.id];
    const m = checking ? mark(q, rec.key, answer) : "";
    const wrap = h(`<fieldset class="lsn-q${m ? ` lsn-${m}` : ""}"><legend><span class="lsn-qn"></span> <span class="lsn-qp"></span></legend><div class="lsn-qa"></div></fieldset>`);
    wrap.querySelector(".lsn-qn").textContent = `${q.number || n + 1}.`;
    const prompt = wrap.querySelector(".lsn-qp");
    prompt.textContent = q.prompt;
    prompt.dir = dir(q.prompt);
    const area = wrap.querySelector(".lsn-qa");
    const name = `lsn-${rec.id}-${q.id}`;
    if (q.kind === "text") {
      const box = q.lines > 1 ? h(`<textarea rows="${Math.min(10, q.lines + 1)}"></textarea>`) : h(`<input type="text">`);
      box.value = typeof answer === "string" ? answer : "";
      box.dir = "auto";
      if (rec.lang) box.lang = rec.lang;
      box.setAttribute("aria-label", t("Your answer"));
      box.placeholder = t("Your answer");
      box.oninput = () => { rec = { ...rec, answers: { ...rec.answers, [q.id]: box.value } }; if (!box.value) delete rec.answers[q.id]; keep(); };
      area.append(box);
      if (checking && typeof rec.key[q.id] === "string") {
        const k = h(`<p class="small lsn-key"></p>`);
        k.textContent = t("Answer: {0}", rec.key[q.id]);
        area.append(k);
      }
    } else {
      const many = q.kind === "multi";
      for (const o of q.options) {
        const on = many ? Array.isArray(answer) && answer.includes(o.id) : answer === o.id;
        const right = checking && rec.key[q.id] !== undefined && [].concat(rec.key[q.id]).includes(o.id);
        const opt = h(`<label class="lsn-opt${right ? " lsn-right-opt" : ""}"><input type="${many ? "checkbox" : "radio"}" name="${esc(name)}" value="${esc(o.id)}"${on ? " checked" : ""}>
          <span class="lsn-ol"></span><span class="lsn-ot"></span></label>`);
        opt.querySelector(".lsn-ol").textContent = optionLabel(o.label);
        opt.querySelector(".lsn-ot").textContent = o.text;
        opt.querySelector(".lsn-ot").dir = dir(o.text);
        opt.querySelector("input").onchange = () => {
          const picked = [...area.querySelectorAll("input:checked")].map((i) => i.value);
          const answers = { ...rec.answers };
          if (!picked.length) delete answers[q.id]; else answers[q.id] = many ? picked : picked[0];
          rec = { ...rec, answers };
          keep();
          if (checking) paintBody();
        };
        area.append(opt);
      }
    }
    if (m) {
      const tag = h(`<p class="small lsn-mark"></p>`);
      tag.textContent = m === "right" ? t("Right") : m === "wrong" ? t("Not right") : rec.from ? t("Your teacher reads this one") : t("Written answers aren't marked.");
      area.append(tag);
    }
    return wrap;
  }

  function paintBody() {
    const body = $(".lsn-body");
    body.innerHTML = "";
    if (blocks.length && passageEp) {
      const read = h(`<div class="lsn-sec"><h3>Passage</h3><a class="btn ghost small" href="#/episode/${esc(passageEp.id)}">${icon("book", 16)} <span>Read with word help</span></a></div>`);
      body.append(read);
    }
    let n = 0;
    for (const it of bodyOf(blocks, rec.questions)) {
      if (it.type === "block") {
        const kind = String(it.block.kind || "p").split("|")[0];
        const tag = /^h[1-3]$/.test(kind) ? (kind === "h1" ? "h3" : "h4") : kind === "li" ? "p" : kind === "q" ? "blockquote" : "p";
        const p = document.createElement(tag);
        p.className = `lsn-p${kind === "li" ? " lsn-li" : ""}`;
        p.textContent = it.block.text;
        p.dir = dir(it.block.text);
        // (the lesson's language on its own text only, not on an English instruction: its font and line height follow)
        if (rec.lang && /[^\u0000-\u024f\u2000-\u206f]/u.test(it.block.text)) p.lang = rec.lang;
        body.append(p);
      } else body.append(questionEl(it.q, n++));
    }
    if (!rec.questions.length && !blocks.length) body.append(h(`<p class="small muted">This lesson has no text. Add questions with Edit questions.</p>`));
    foot();
  }

  function foot() {
    const f = $(".lsn-foot");
    f.innerHTML = "";
    if (rec.from && rec.questions.length) {
      const hand = h(`<button type="button" class="primary"></button>`);
      hand.textContent = rec.handed ? t("Hand in again") : t("Hand in");
      hand.onclick = handIn;
      f.append(hand);
    }
    if (own && rec.questions.some((q) => rec.key[q.id] !== undefined)) {
      const chk = h(`<button type="button"></button>`);
      chk.textContent = checking ? t("Hide the answers") : t("Check my answers");
      chk.onclick = () => {
        checking = !checking;
        paintBody();
        if (checking) {
          const s = tally(rec.questions, rec.key, rec.answers);
          toast(t("{0} right, {1} not right, {2} not answered yet.", s.right, s.wrong, s.blank));
        }
      };
      f.append(chk);
    }
    if (own) {
      const edit = h(`<button type="button">${icon("edit", 16)} <span>Edit questions</span></button>`);
      edit.onclick = () => openQuestionEditor(rec, blocks, { onSave: async (questions, key) => { rec = await saveLesson({ ...rec, questions, key }); paintBody(); paintSent(); } });
      f.append(edit);
    }
    if (teacher) {
      const send = h(`<button type="button">${icon("send", 16)} <span>Send to a class</span></button>`);
      send.onclick = () => chooseClass();
      f.append(send);
    }
  }

  async function handIn() {
    const left = rec.questions.length - Object.keys(rec.answers).length;
    if (!(await confirmBox(t("Hand in {0}?", rec.title), left > 0 ? t("{0} questions have no answer yet. Your teacher sees what you hand in.", left)
      : t("Your teacher sees your answers. You can still change them and hand in again."), { ok: t("Hand in") }))) return;
    try {
      await (await import("../dlilessons.js")).saveWork(rec.from.lesson, rec.answers, true);
      rec = await saveLesson({ ...rec, handed: Date.now() / 1000 });
      head(); foot();
      toast(t("Handed in."));
    } catch (e) { toast(e.message, { error: true }); }
  }

  // ---------------------------------------------------------------- a teacher sends it
  function paintSent() {
    const box = $(".lsn-sent");
    box.innerHTML = "";
    box.hidden = !teacher || !rec.sent.length;
    if (box.hidden) return;
    box.append(h(`<h3>Sent to</h3>`));
    for (const s of rec.sent) {
      const row = h(`<div class="lsn-sent-row"><span><strong></strong> <span class="small muted"></span></span><span class="lsn-sent-acts">
        <button type="button" class="primary small" data-a="answers">See answers</button>
        <button type="button" class="small" data-a="again">Send the corrected copy</button>
        <button type="button" class="ghost danger small" data-a="back">Take back</button></span></div>`);
      row.querySelector("strong").textContent = s.class_name;
      row.querySelector(".muted").textContent = t("Version {0}", s.version);
      row.onclick = async (e) => {
        const a = e.target.closest("button") && e.target.closest("button").dataset.a;
        if (a === "answers") (await import("./lessonteach.js")).openLessonReport(s.lesson, { rec, blocks });
        else if (a === "again") sendTo({ id: s.cls, name: s.class_name }, s);
        else if (a === "back") {
          if (!(await confirmBox(t("Take {0} back from {1}?", rec.title, s.class_name), t("It disappears for the students, with their answers. Your copy stays here."), { ok: t("Take back"), danger: true }))) return;
          try {
            await (await import("../dlilessons.js")).removeSent(s.cls, s.lesson);
            rec = await saveLesson({ ...rec, sent: rec.sent.filter((x) => x.lesson !== s.lesson) });
            paintSent();
          } catch (err) { toast(err.message, { error: true }); }
        }
      };
      box.append(row);
    }
  }

  function chooseClass() {
    const classes = (roles.teacher || []).filter((c) => !rec.sent.some((s) => s.cls === c.id));
    if (!classes.length) { toast(t("It's been sent to all your classes. To send a changed copy, use Send the corrected copy.")); return; }
    const box = openModal({ title: t("Send to a class") });
    box.body.append(h(`<p class="small muted">The students get the passage, its audio with the transcripts as you corrected them, and the questions. The answer key stays with you.</p>`));
    for (const c of classes) {
      const b = h(`<button type="button" class="lsn-class"></button>`);
      b.textContent = c.name;
      b.onclick = () => { box.close(); sendTo(c, null); };
      box.body.append(b);
    }
  }

  async function sendTo(klass, before) {
    const box = openModal({ title: t("Sending to {0}", klass.name), canClose: false });
    const say = h(`<p class="lsn-step"></p>`);
    const bar = h(`<div class="progress"><i style="width:0%"></i></div>`);
    box.body.append(say, bar);
    try {
      say.textContent = t("Getting the tracks ready…");
      const parts = [];
      for (const [n, tr] of rec.tracks.entries()) {
        const ep = await episodeByUid(tr.uid);
        if (!ep) throw new Error(t("“{0}” isn't on this device yet. Wait for the sync, then send again.", tr.title));
        const tx = ep.status === "done" ? packTranscript(await api(`/episodes/${ep.id}/transcript`)) : null;
        const kind = trackOfEpisode(ep).kind;
        const part = { title: tr.title || ep.title, kind: kind === "episode" ? "file" : kind, segments: tx && tx.segments ? tx.segments : null, mime: ep.audio_type || "" };
        if (part.kind === "file") {
          const kept = before && before.tracks[n] === tr.uid;
          if (!kept) part.blob = await trackBlob(ep);
        } else if (part.kind === "youtube") part.youtube = { id: youTubeId(ep.audio_url), title: ep.title, channel: ep.description || "" };
        else part.podcast = { feed_url: ep.feed_url, guid: ep.guid, audio_url: ep.audio_url, title: ep.title, image: ep.image || "" };
        parts.push(part);
      }
      const dl = await import("../dlilessons.js");
      const { trackFileName } = await import("../lessons.js");
      const keepNames = parts.map((p, n) => (p.kind === "file" && !p.blob ? trackFileName(n + 1, "", p.mime) : "")).filter(Boolean);
      const out = await dl.sendLesson({ classId: klass.id, rec, blocks, tracks: parts, existing: before ? before.lesson : null, keepFiles: keepNames,
        onStep: (s) => { say.textContent = s.done < s.of ? t("Uploading {0}…", s.name || "") : t("Done."); bar.firstElementChild.style.width = `${Math.round(100 * s.done / Math.max(1, s.of))}%`; } });
      const entry = { lesson: out.lesson, cls: klass.id, class_name: klass.name, version: out.version, at: Date.now() / 1000, tracks: rec.tracks.map((x) => x.uid) };
      rec = await saveLesson({ ...rec, sent: [...rec.sent.filter((x) => x.lesson !== out.lesson), entry] });
      box.close();
      toast(before ? t("The corrected copy is on its way to {0}.", klass.name) : t("Sent to {0}.", klass.name));
      paintSent();
    } catch (e) {
      box.close();
      toast(e.message || t("That didn't work. Try again in a moment."), { error: true });
    }
  }

  // ---------------------------------------------------------------- the ⋯ menu
  function moreMenu(anchor) {
    const box = openModal({ title: rec.title });
    const items = [];
    if (own) items.push(["rename", t("Rename")], ["text", t("Correct the passage's text")]);
    if (own) items.push(["ai", t("Find the questions with my AI")]);
    items.push(["remove", t("Remove the lesson")]);
    for (const [a, label] of items) {
      const b = h(`<button type="button" class="lsn-menu-item${a === "remove" ? " danger" : ""}"></button>`);
      b.textContent = label;
      b.onclick = async () => {
        box.close();
        if (a === "rename") {
          const { askName } = await import("./modal.js");
          const name = (await askName(t("Rename the lesson"), t("Title"), { value: rec.title, ok: t("Save") })).trim();
          if (name && name !== rec.title) { rec = await saveLesson({ ...rec, title: name }); await savePassage(rec, blocks); head(); }
        } else if (a === "text") {
          openPassageEditor(rec, blocks, { onSave: async (next) => { await savePassage(rec, next); blocks = next; paintBody(); } });
        } else if (a === "ai") {
          aiQuestions();
        } else if (a === "remove") {
          if (!(await confirmBox(t("Remove {0}?", rec.title), rec.from ? t("It's removed from this device and your others. Your teacher keeps what you handed in.")
            : t("Its passage, questions, answers and own audio files are removed from this device and your others."), { ok: t("Remove"), danger: true }))) return;
          await removeLesson(rec);
          back();
        }
      };
      box.body.append(b);
    }
    void anchor;
  }

  async function aiQuestions() {
    const { lessonPrompt, readLessonAnswer } = await import("../lessonai.js");
    const { askAi } = await import("../define-service.js");
    const { LANGUAGES } = await import("../languages.js");
    const study = (LANGUAGES[rec.lang] && (LANGUAGES[rec.lang].english || LANGUAGES[rec.lang].name)) || "the lesson's language";
    const text = bodyOf(blocks, rec.questions).map((it) => (it.type === "block" ? it.block.text
      : [`${it.q.number || ""} ${it.q.prompt}`.trim(), ...it.q.options.map((o) => `${optionLabel(o.label)} ${o.text}`.trim())].join("\n"))).join("\n\n");
    if (!(await confirmBox(t("Find the questions with your AI?"), t("The lesson's text goes to your AI provider only, to be read, and isn't kept. What it finds replaces the questions; you can check them after."), { ok: t("Find them") }))) return;
    toast(t("Asking your AI…"));
    try {
      const got = readLessonAnswer(await askAi(lessonPrompt(text, { study })));
      if (!got.items.some((x) => x.type === "q")) { toast(t("Your AI found no questions in it."), { error: true }); return; }
      const { splitItems } = await import("../lessons.js");
      const split = splitItems(got.items);
      await savePassage(rec, split.blocks);
      blocks = split.blocks;
      rec = await saveLesson({ ...rec, questions: split.questions, key: got.key, answers: {} });
      paintBody();
      toast(t("{0} questions found. Check them with Edit questions.", split.questions.length));
    } catch (e) { toast(e.message, { error: true }); }
  }

  // ---------------------------------------------------------------- start
  head();
  tracks();
  paintSent();
  passageBlocks(rec).then((p) => { if (!alive) return; blocks = p.blocks; passageEp = p.episode; paintBody(); })
    .catch(() => { if (alive) paintBody(); });
  void assigned;
  return () => { alive = false; flush(); };
}
