// The Class tab (prototype "class_tab"): for DLI students who share and for DLI teachers. The tab shows for them
// only (dliclass.js syncClassNav); the rules are in supabase/v15-dli-class-tab.sql and the online side in dliclass.js.
//
//   A student sees: invitations from teachers (Accept / No thanks), their classes, each class's teachers, their
//     classmates with an activity level (once they agree that classmates see theirs too), and what the teachers
//     sent the class, each with "Add to my library".
//   A teacher sees: their classes, "Students and progress" (the class box of components/dliteach.js), a box to
//     invite a student by username, the invitations still waiting, the same list of people, and what was sent,
//     each with Remove. Sending is the paper-airplane button on any player or Library row ("Class: …").
// Usernames only, never a real name. Shared by the computer, the phones and the web app.

import { h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import * as cls from "../dliclass.js";
import { MEDIA_KINDS, acceptMedia, openMedia } from "../components/sendmedia.js";
import { gunzipText } from "../sharetext.js";
import { codeBox, dayLabel } from "../components/dlishare.js";
import { openClass } from "../components/dliteach.js";
import { feature } from "../prototype.js";
import { askName, confirmBox } from "../components/modal.js";

const PICK_KEY = "tamkeenClassPick"; // the class last looked at, on this device
const LEVEL_NAMES = { active: "Active", some: "Some", little: "A little", stopped: "Stopped", none: "Not started" };
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };

function levelTag(level) {
  const el = h(`<span class="dlt-lvl"></span>`);
  el.classList.add(`lvl-${level}`);
  el.textContent = t(LEVEL_NAMES[level] || LEVEL_NAMES.none);
  return el;
}

export async function render(view) {
  const page = h(`<div class="cls-page"><h1>Class</h1><div class="cls-body"><p class="small muted">Loading…</p></div></div>`);
  view.append(page);
  const body = page.querySelector(".cls-body");
  let alive = true;
  let me = null;

  const note = (words, link = null) => {
    const card = h(`<div class="card stack cls-card"><p class="muted"></p></div>`);
    card.querySelector("p").textContent = words;
    if (link) { const a = h(`<div><a class="btn primary"></a></div>`); a.firstChild.href = link.href; a.firstChild.textContent = link.label; card.append(a); }
    return card;
  };

  async function load() {
    const r = await cls.refresh();
    if (!alive) return;
    body.innerHTML = "";
    if (r.notReady) { body.append(note(t("Classes aren't switched on yet."))); return; }
    if (!r.signedIn || !r.me) {
      body.append(note(r.signedIn ? (r.error && r.error.message) || t("Couldn't reach the online service.") : t("Sign in under Settings → DLI students to see your class."),
        { href: "#/settings?s=dli", label: t("Open DLI students") }));
      return;
    }
    me = r.me;
    const teacher = !!(me.teacher || me.owner);
    if (!me.student && !teacher) {
      body.append(note(t("The Class tab is for DLI students and teachers. Set that up under Settings → DLI students."), { href: "#/settings?s=dli", label: t("Open DLI students") }));
      return;
    }
    if (me.student) await invitations();
    if (!alive) return;
    if (!me.classes.length) {
      body.append(note(teacher ? t("You have no classes yet. Make one, then invite your students or give them its code.")
        : t("You aren't in a class yet. Your teacher can invite you by your username, or give you a class code to type under Settings → DLI students.")));
    } else {
      const kept = read(PICK_KEY);
      const picked = me.classes.find((c) => `${c.role}:${c.id}` === kept) || me.classes[0];
      if (me.classes.length > 1) body.append(picker(picked));
      body.append(classPart(picked));
    }
    if (teacher) {
      const add = h(`<div class="set-actions cls-new"><button type="button">New class</button></div>`);
      add.querySelector("button").onclick = async () => {
        const title = (await askName(t("Name the class"), t("Class name"), { ok: t("Make the class") })).slice(0, cls.CLASS_NAME_MAX);
        if (!title) return;
        try { const made = await cls.createClass(title); if (made) write(PICK_KEY, `teacher:${made.id}`); } catch (e) { toast(e.message, { error: true }); }
        if (alive) load();
      };
      body.append(add);
    }
  }

  /** Invitations waiting for me. */
  async function invitations() {
    let list = [];
    try { list = await cls.myInvites(); } catch { return; } // (a database without v15: no invitations yet)
    for (const inv of list) {
      const card = h(`<div class="card stack cls-card cls-invite"><div><strong></strong><p class="small muted"></p></div>
        <p class="small muted">If you accept, its teachers see your username and weekly study numbers from this week on.</p>
        <div class="set-actions"><button type="button" class="primary" data-a="yes">Accept</button><button type="button" data-a="no">No thanks</button></div></div>`);
      card.querySelector("strong").textContent = t("You're invited to {0}", inv.name);
      card.querySelector("p").textContent = inv.teachers.length ? t("With {0}", inv.teachers.join(", ")) : "";
      card.onclick = async (e) => {
        const a = e.target.closest("button") && e.target.closest("button").dataset.a;
        if (!a) return;
        try {
          const r = await cls.answerInvite(inv.class, a === "yes");
          if (r.status === "joined") { write(PICK_KEY, `student:${inv.class}`); toast(t("You're in {0}.", r.name || inv.name)); }
          else if (r.status === "full") toast("That class is full.", { error: true });
        } catch (err) { toast(err.message, { error: true }); }
        if (alive) load();
      };
      body.append(card);
    }
  }

  /** My classes, one on. */
  function picker(picked) {
    const bar = h(`<div class="cls-picker" role="radiogroup"></div>`);
    for (const c of me.classes) {
      const b = h(`<button type="button" role="radio"><span translate="no"></span><span class="small"></span></button>`);
      b.firstChild.textContent = c.name;
      b.lastChild.textContent = c.role === "teacher" ? t("teaching") : "";
      const on = c.id === picked.id && c.role === picked.role;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
      b.onclick = () => { write(PICK_KEY, `${c.role}:${c.id}`); load(); };
      bar.append(b);
    }
    return bar;
  }

  function classPart(c) {
    const teaching = c.role === "teacher";
    const part = h(`<div class="cls-class">
      <div class="card stack cls-card"><div class="cls-head"><h2 translate="no"></h2><span class="small muted"></span></div>
        <div class="cls-teach"></div></div>
      <div class="card stack cls-card"><h3>People</h3><div class="cls-people"><p class="small muted">Loading…</p></div></div>
      <div class="card stack cls-card"><h3>Sent to the class</h3><p class="small muted cls-posts-hint"></p><div class="cls-posts"><p class="small muted">Loading…</p></div></div>
    </div>`);
    part.querySelector("h2").textContent = c.name;
    part.querySelector(".cls-head span").textContent = teaching ? t("You teach this class") : (c.teachers.length ? t("With {0}", c.teachers.join(", ")) : "");
    part.querySelector(".cls-posts-hint").textContent = teaching
      ? t("To send something, press the paper-airplane button on any player or Library row and pick this class. Its words go along when your app has them.")
      : t("What your teachers sent. Add one to your library and it opens with its words already there.");
    if (teaching) teacherTools(part.querySelector(".cls-teach"), c);
    else {
      const leave = h(`<div class="set-actions"><button type="button" class="ghost danger">Leave the class</button></div>`);
      leave.querySelector("button").onclick = async () => {
        if (!(await confirmBox(t("Leave the class {0}?", c.name), t("Its teachers stop seeing your numbers. You can join again with the class code."),
          { ok: t("Leave"), danger: true }))) return;
        try { await cls.leaveClass(c.id); } catch (e) { toast(e.message, { error: true }); }
        if (alive) load();
      };
      part.querySelector(".cls-teach").append(leave);
    }
    people(part.querySelector(".cls-people"), c);
    if (feature("classroom")) {
      // The class's material lives in the Library's Classroom (folders, the teacher's notes): one place, linked here.
      const card = part.querySelector(".cls-posts").closest(".cls-card");
      card.innerHTML = "";
      card.append(h(`<h3>Classroom</h3>`), Object.assign(h(`<p class="small muted"></p>`), { textContent: teaching
        ? t("What you add for this class is in the Library, under Classroom: folders, your transcript, your important words, meanings and notes.")
        : t("What your teachers added for this class is in the Library, under Classroom.") }),
        h(`<div class="set-actions"><a class="btn primary" href="#/library?show=classroom">Open the classroom</a></div>`));
      write("tamkeenClassPick", `${c.role}:${c.id}`);
    } else posts(part.querySelector(".cls-posts"), c);
    return part;
  }

  /** A teacher's tools for one class: the progress box, inviting by username, the invitations still waiting. */
  function teacherTools(el, c) {
    const row = h(`<div class="set-actions"><button type="button" class="primary">Students and progress</button></div>`);
    row.querySelector("button").onclick = () => openClass(c, { changed: () => { if (alive) load(); } });
    const code = h(`<p class="small muted"></p>`);
    code.textContent = t("Class code {0}: students can also type it under Settings → DLI students.", cls.spaced(c.code));
    const waiting = h(`<div class="dls-list cls-waiting" hidden></div>`);
    async function pending() {
      let list = [];
      try { list = await cls.classInvited(c.id); } catch { /* shown empty */ }
      waiting.innerHTML = "";
      waiting.hidden = !list.length;
      for (const who of list) {
        const line = h(`<div class="dls-row"><span class="dls-row-text"><strong translate="no"></strong><span class="small muted"></span></span>
          <button type="button" class="ghost">Cancel</button></div>`);
        line.querySelector("strong").textContent = who.username;
        line.querySelector(".muted").textContent = t("Invited {0}, hasn't answered yet", dayLabel(who.invited_at));
        line.querySelector("button").onclick = async () => { try { await cls.cancelInvite(c.id, who.id); } catch (e) { toast(e.message, { error: true }); } pending(); };
        waiting.append(line);
      }
    }
    const invite = codeBox({ label: t("A student's username"), placeholder: t("A student's username"), button: t("Invite"), go: async (name) => {
      // What happened stays written under the box (a message that flashes by was easy to miss: the owner,
      // 2026-11-25, "I added a student to my class and it didn't work"), and is said as well.
      const say = (words, { error = false, detail = "" } = {}) => {
        result.hidden = false;
        result.classList.toggle("cls-bad", error);
        result.textContent = detail ? `${words} (${detail})` : words;
        toast(words, { error });
        return !error;
      };
      let r;
      try { r = await cls.inviteStudent(c.id, name); } catch (e) {
        return say(e.notReady ? t("Inviting by username isn't switched on yet. Give the student the class code.") : e.message, { error: true, detail: e.detail || "" });
      }
      if (r.status === "invited") { pending(); return say(t("{0} is invited. They join when they press Accept under Friends → Class; their app tells them when it next opens.", r.username)); }
      if (r.status === "already") return say(t("{0} is invited already.", r.username));
      if (r.status === "in_class") return say(t("{0} is in this class already.", r.username));
      return say(r.status === "full" ? t("This class is full, or that student is in 10 classes already.")
        : r.status === "wait" ? t("Too many names that didn't work today. Try again tomorrow.")
        : t("No DLI student has the username {0}. Check the spelling. They must first sign in and agree to share under Settings → DLI students; until then, give them the class code.", String(name).trim().replace(/^@/, "").slice(0, 20)),
        { error: true });
    } });
    const result = h(`<p class="small cls-result" role="status" hidden></p>`);
    const input = invite.querySelector("input");
    input.style.textTransform = "none"; // (a username, not a code)
    input.style.letterSpacing = "0";
    input.setAttribute("autocapitalize", "none");
    el.append(row, h(`<h3>Invite a student</h3>`), invite, result, code, waiting);
    pending();
  }

  /** The class's teachers and students, as a classmate sees them. */
  async function people(el, c) {
    let list;
    try { list = await cls.classmates(c.id); } catch (e) {
      if (!alive) return;
      el.innerHTML = "";
      if (e.code === "dli_agree_first") { el.append(agreeCard(() => people(el, c))); return; }
      const p = h(`<p class="small muted"></p>`);
      p.textContent = e.notReady ? t("Seeing classmates isn't switched on yet.") : e.message;
      el.append(p);
      return;
    }
    if (!alive) return;
    el.innerHTML = "";
    const teachers = h(`<div class="cls-group"><span class="small muted">Teachers</span><div class="cls-names"></div></div>`);
    for (const name of list.teachers) { const chip = h(`<span class="cls-name" translate="no"></span>`); chip.textContent = name; teachers.querySelector(".cls-names").append(chip); }
    el.append(teachers);
    const students = h(`<div class="cls-group"><span class="small muted"></span><div class="dls-list"></div></div>`);
    students.querySelector(".muted").textContent = list.students.length === 1 ? t("1 student") : t("{0} students", list.students.length);
    if (!list.students.length) students.querySelector(".dls-list").append(h(`<p class="small muted dls-none">Nobody here yet has agreed to be seen by classmates.</p>`));
    for (const s of list.students) {
      const line = h(`<div class="dls-row"><span class="dls-row-text"><strong translate="no"></strong></span></div>`);
      line.querySelector("strong").textContent = s.me ? t("{0} (you)", s.username) : s.username;
      line.append(levelTag(s.level));
      students.querySelector(".dls-list").append(line);
    }
    if (c.role === "teacher") students.append(h(`<p class="small muted">A student shows here once they agree to be seen by classmates. All your students are under Students and progress.</p>`));
    el.append(students, h(`<p class="small muted">Activity is by days studied a week: Active 4 or more, Some 2 or 3, A little under 2, Stopped when nothing this week or last. Classmates see this word, never your numbers.</p>`));
  }

  /** A student who hasn't agreed yet that classmates see them. */
  function agreeCard(then) {
    const card = h(`<div class="cls-agree"><p><strong>See your classmates</strong></p>
      <p class="small muted">If you agree, the other students of your classes see your username and your activity level (one word, such as Active or Stopped), and you see theirs. They never see your study numbers, your words or your library. Students who haven't agreed are not listed.</p>
      <div class="set-actions"><button type="button" class="primary">Agree and show classmates</button></div></div>`);
    card.querySelector("button").onclick = async (e) => {
      e.target.disabled = true;
      try { await cls.agreeToClassmates(); then(); } catch (err) { toast(err.message, { error: true }); e.target.disabled = false; }
    };
    return card;
  }

  /** What was sent to the class. */
  async function posts(el, c) {
    let list;
    try { list = await cls.classPosts(c.id); } catch (e) {
      if (!alive) return;
      el.innerHTML = "";
      const p = h(`<p class="small muted"></p>`);
      p.textContent = e.notReady ? t("Sending to a class isn't switched on yet.") : e.message;
      el.append(p);
      return;
    }
    if (!alive) return;
    el.innerHTML = "";
    if (!list.length) { el.append(h(`<p class="small muted">Nothing has been sent yet.</p>`)); return; }
    const box = h(`<div class="dls-list"></div>`);
    for (const p of list) {
      const line = h(`<div class="dls-row cls-post"><span class="cls-post-ico">${icon(p.item.kind === "youtube" ? "video" : p.item.kind === "podcast" ? "podcast" : p.item.kind === "reel" ? "reel" : "book", 20)}</span>
        <span class="dls-row-text"><strong translate="no"></strong><span class="small muted"></span></span><button type="button"></button></div>`);
      line.querySelector("strong").textContent = p.item.title;
      line.querySelector(".muted").textContent = [t(MEDIA_KINDS[p.item.kind] || ""), p.sender ? `@${p.sender}` : "", dayLabel(p.created_at),
        p.path ? t("with its words") : ""].filter(Boolean).join(" · ");
      const b = line.querySelector("button");
      if (c.role === "teacher") {
        b.textContent = t("Remove");
        b.className = "ghost danger";
        b.onclick = async () => { try { await cls.deletePost(p.id); } catch (e) { toast(e.message, { error: true }); } posts(el, c); };
      } else {
        b.textContent = t("Add to my library");
        b.className = "primary";
        b.onclick = async () => {
          b.disabled = true;
          try {
            let raw = p.item;
            const file = await cls.postFile(p.path);
            if (file) { try { raw = { ...p.item, transcript: await gunzipText(file) }; } catch { /* without its words then */ } }
            const hash = await acceptMedia(p.item, raw);
            toast(t("“{0}” is in your library.", p.item.title));
            await openMedia(p.item, hash);
          } catch (e) { toast(e.message, { error: true }); b.disabled = false; }
        };
      }
      box.append(line);
    }
    el.append(box);
  }

  load();
  return () => { alive = false; };
}

// ---------- looks (added once; plain solid surfaces) ----------
if (typeof document !== "undefined" && !document.getElementById("cls-css")) {
  const style = document.createElement("style");
  style.id = "cls-css";
  style.textContent = `
    .cls-page { max-width: 720px; margin: 0 auto; padding: 8px 0 24px; display: flex; flex-direction: column; gap: 12px; }
    .cls-page h1 { text-align: center; margin: 8px 0 4px; }
    .friends-class .cls-page { padding-top: 0; }
    .friends-class .cls-page h1 { display: none; } /* (Friends has the heading and the tab says Class) */
    .cls-body, .cls-class { display: flex; flex-direction: column; gap: 12px; }
    .cls-card h2, .cls-card h3, .cls-card p { margin: 0; }
    .cls-card h3 { font-size: 16px; }
    .cls-head { display: flex; flex-direction: column; gap: 2px; text-align: center; }
    .cls-teach { display: flex; flex-direction: column; gap: 10px; }
    .cls-card .set-actions { justify-content: center; flex-wrap: wrap; }
    .cls-card .set-actions .primary { min-height: 44px; min-width: 200px; justify-content: center; }
    .cls-picker { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .cls-picker button { min-height: 44px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 14px; font-weight: 600; }
    .cls-picker button .small { font-weight: 400; color: var(--ink-2); }
    .cls-picker button.on, .cls-picker button.on:hover:not(:disabled) { background: var(--teal); color: var(--teal-ink); border-color: var(--teal); }
    .cls-picker button.on .small { color: var(--teal-ink); }
    .cls-new { justify-content: center; }
    .cls-people { display: flex; flex-direction: column; gap: 10px; }
    .cls-group { display: flex; flex-direction: column; gap: 6px; }
    .cls-names { display: flex; gap: 6px; flex-wrap: wrap; }
    .cls-name { border: 1px solid var(--line); border-radius: 999px; corner-shape: round; padding: 4px 12px; background: var(--surface-2); font-weight: 600; }
    .cls-agree { display: flex; flex-direction: column; gap: 8px; text-align: center; }
    .cls-post-ico { display: inline-flex; color: var(--teal); flex: none; }
    .cls-post button { flex: none; }
    .cls-invite { text-align: center; }
    .cls-result { margin: 0; }
    .cls-result.cls-bad { color: var(--danger); }
  `;
  document.head.append(style);
}
