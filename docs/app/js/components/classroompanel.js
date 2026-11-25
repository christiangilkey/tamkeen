// The Classroom (prototype "classroom"): a kind in the Library that a DLI teacher and their students share.
// A teacher adds things from the rest of their Library (the paper-airplane button → "Class: …", or "Add from my
// library" here), sorts them into folders, and updates one in place after changing its transcript or their notes
// on its words. Students see the same folders and items, open one (it goes into their own Library with the
// teacher's transcript), see the teacher's notes in the word popup (components/wordbubble.js, classnotes.js), and
// can put the words the teacher marked important into their flashcards.
//
// The teacher's notes are the teacher's own flashcards of that item: a card marked "!" is an important word, the
// card's meaning is the teacher's definition, its grammar notes are the note. Nothing new to learn to use.
// The online side is supabase/v17-dli-classroom.sql (through dliclass.js); on a database without it the panel
// shows what v15 has: the plain list of things sent to the class. Shared by the computer, the phones and the web app.

import { api, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import * as cls from "../dliclass.js";
import { MEDIA_KINDS, acceptMediaInfo, classPayload, mediaFromEpisode, mineOf, openMedia, rememberMine, sendToClass } from "./sendmedia.js";
import { gunzipText } from "../sharetext.js";
import { importantKeys, keepNotes, noteKey } from "../classnotes.js";
import { askName, confirmBox, openModal } from "./modal.js";

const PICK_KEY = "tamkeenClassPick";   // the class last looked at (shared with the Class tab)
const TAKEN_KEY = "tamkeenRoomTaken";  // post id -> { ep: my local copy's id, at: the item's updated_at when I took it }
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };
const taken = () => { try { const v = JSON.parse(read(TAKEN_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const keepTaken = (id, rec) => { const m = taken(); m[id] = rec; write(TAKEN_KEY, JSON.stringify(Object.fromEntries(Object.entries(m).slice(-600)))); };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");
const KIND_ICON = { youtube: "video", podcast: "podcast", reel: "reel" };

/** Put a classroom item into my own Library (or bring my copy up to date). Resolves to { episode, hash }. */
async function take(p) {
  let raw = p.item;
  const file = await cls.postFile(p.path);
  if (file) { try { raw = { ...p.item, transcript: await gunzipText(file) }; } catch { /* without its words then */ } }
  const had = taken()[p.id];
  const r = await acceptMediaInfo(p.item, raw);
  if (r.episode && r.episode.id) {
    // My copy had a transcript already (my own, or the teacher's older one): the teacher's newest one replaces it.
    const lines = r.text && r.text.segments;
    if (lines && lines.length && (r.keptOwn || had)) {
      try { await api(`/episodes/${r.episode.id}/transcript`, { method: "PUT", body: { segments: lines, model: "teacher" } }); } catch { /* the older words stay */ }
    }
    keepNotes(r.episode.id, p.notes);
    keepTaken(p.id, { ep: r.episode.id, at: p.updated_at });
  }
  return r;
}

/** The teacher's important words of an item, into my flashcards, in a folder named after it. Resolves to how many
 * cards were made (words I have already are put in the folder, not made twice). */
async function addImportant(p, language) {
  const words = p.notes.filter((n) => n.important);
  if (!words.length) return 0;
  const lang = p.item.language || language || "";
  const name = p.item.title.slice(0, 60);
  let folder = null;
  try {
    const folders = await api(`/vocab/folders?language=${encodeURIComponent(lang)}`);
    folder = (folders || []).find((f) => f.name === name) || await api("/vocab/folders", { method: "POST", body: { name, language: lang } });
  } catch { folder = null; }
  let mine = [];
  try { const v = await api("/vocab"); mine = Array.isArray(v) ? v : (v && v.items) || []; } catch { /* make them all */ }
  const have = new Map(mine.filter((c) => !c.language || !lang || c.language === lang).map((c) => [noteKey(c.text), c]));
  const old = words.map((n) => have.get(noteKey(n.w))).filter(Boolean);
  const fresh = words.filter((n) => !have.has(noteKey(n.w)));
  if (folder && old.length) {
    try { await api("/vocab/bulk-folders", { method: "POST", body: { ids: old.map((c) => c.id), add: [folder.uid] } }); } catch { /* they stay where they are */ }
  }
  const cards = fresh.map((n) => ({ text: n.w, meaning: n.meaning, notes: n.note, sentence: n.s, source: p.item.title, language: lang, folders: folder ? [folder.uid] : [] }));
  for (let i = 0; i < cards.length; i += 100) {
    const r = await api("/vocab/batch", { method: "POST", body: { cards: cards.slice(i, i + 100) } });
    // (marked important, as the teacher marked them: first in reviews)
    for (const c of (r && r.cards) || []) { try { await api(`/vocab/${c.id}`, { method: "PATCH", body: { important: true } }); } catch { /* an ordinary card then */ } }
  }
  return cards.length;
}

/** The teacher's words of an item, in a box. */
function showNotes(p) {
  const box = openModal({ title: p.item.title, wide: true });
  const view = h(`<div class="crm-notes"></div>`);
  for (const n of p.notes) {
    const row = h(`<div class="crm-note"><div class="crm-note-top"><strong class="ar" translate="no"></strong><span class="crm-imp" hidden>Important</span></div>
      <p class="crm-note-meaning" hidden></p><p class="small muted crm-note-text" hidden></p><p class="small muted crm-note-s ar" translate="no" hidden></p></div>`);
    row.querySelector("strong").textContent = n.w;
    row.querySelector(".crm-imp").hidden = !n.important;
    for (const [sel, value] of [[".crm-note-meaning", n.meaning], [".crm-note-text", n.note], [".crm-note-s", n.s]]) {
      const el = row.querySelector(sel);
      el.textContent = value;
      el.hidden = !value;
    }
    view.append(row);
  }
  box.body.append(view);
}

export function classroomPanel(el, language) {
  let alive = true;
  let me = null;
  el.innerHTML = "";
  const page = h(`<div class="crm"><div class="crm-top"><div><h2>Classroom</h2>
    <p class="small muted crm-sub"></p></div><div class="crm-acts"></div></div>
    <div class="crm-picker" role="radiogroup" hidden></div><div class="crm-body"><p class="small muted">Loading…</p></div></div>`);
  el.append(page);
  const body = page.querySelector(".crm-body");
  const acts = page.querySelector(".crm-acts");
  const say = (words, link = null) => {
    body.innerHTML = "";
    const p = h(`<p class="muted crm-say"></p>`);
    p.textContent = words;
    body.append(p);
    if (link) { const a = h(`<div class="set-actions"><a class="btn primary"></a></div>`); a.firstChild.href = link.href; a.firstChild.textContent = link.label; body.append(a); }
  };

  async function load() {
    const r = await cls.refresh();
    if (!alive) return;
    acts.innerHTML = "";
    page.querySelector(".crm-picker").hidden = true;
    if (r.notReady) { say(t("Classes aren't switched on yet.")); return; }
    if (!r.signedIn || !r.me) {
      say(r.signedIn ? (r.error && r.error.message) || t("Couldn't reach the online service.") : t("Sign in under Settings → DLI students to see your classroom."),
        { href: "#/settings?s=dli", label: t("Open DLI students") });
      return;
    }
    me = r.me;
    if (!me.classes.length) {
      say(me.teacher || me.owner ? t("You have no classes yet. Make one in the Class tab, then add things here for your students.")
        : t("You aren't in a class yet. Your teacher can invite you by your username, or give you a class code."), { href: "#/class", label: t("Open the Class tab") });
      return;
    }
    const kept = read(PICK_KEY);
    const c = me.classes.find((x) => `${x.role}:${x.id}` === kept) || me.classes[0];
    const bar = page.querySelector(".crm-picker");
    bar.innerHTML = "";
    bar.hidden = me.classes.length < 2;
    for (const x of me.classes) {
      const b = h(`<button type="button" role="radio"><span translate="no"></span></button>`);
      b.firstChild.textContent = x.name;
      const on = x.id === c.id && x.role === c.role;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
      b.onclick = () => { write(PICK_KEY, `${x.role}:${x.id}`); load(); };
      bar.append(b);
    }
    page.querySelector(".crm-sub").textContent = c.role === "teacher"
      ? t("What you add here, your students of {0} see: its transcript as you corrected it, the words you marked important, your meanings and your notes.", c.name)
      : t("What your teachers of {0} added for you. Open one and it goes into your Library with their transcript and their notes on its words.", c.name);
    await room(c);
  }

  async function room(c) {
    const teaching = c.role === "teacher";
    let data;
    let plain = false; // a database without v17: the plain list of what was sent
    try { data = await cls.classroom(c.id); } catch (e) {
      if (!alive) return;
      if (!e.notReady) { say(e.message); return; }
      try { data = { folders: [], items: (await cls.classPosts(c.id)).map((p) => ({ ...p, notes: [], folder: "", updated_at: p.created_at })) }; plain = true; } catch (e2) {
        if (alive) say(e2.notReady ? t("The classroom isn't switched on yet.") : e2.message);
        return;
      }
    }
    if (!alive) return;
    body.innerHTML = "";
    acts.innerHTML = "";
    if (teaching) {
      const add = h(`<button type="button" class="primary">${icon("plus", 18)} <span>Add from my library</span></button>`);
      add.onclick = () => pickFromLibrary(c, data.folders, () => { if (alive) room(c); });
      acts.append(add);
      if (!plain) {
        const nf = h(`<button type="button">New folder</button>`);
        nf.onclick = async () => {
          const name = (await askName(t("Name the folder"), t("Folder name"), { ok: t("Make the folder") })).slice(0, 60);
          if (!name) return;
          try { await cls.folderSave(c.id, name); } catch (e) { toast(e.message, { error: true }); }
          if (alive) room(c);
        };
        acts.append(nf);
      }
    }
    if (!data.items.length && !data.folders.length) {
      const p = h(`<p class="muted crm-say"></p>`);
      p.textContent = teaching ? t("Nothing here yet. Add something from your Library, or press the paper-airplane button on any player or Library row and pick this class.")
        : t("Your teachers haven't added anything yet.");
      body.append(p);
      return;
    }
    const mine = taken();
    const section = (folder) => {
      const list = data.items.filter((p) => p.folder === (folder ? folder.id : ""));
      if (!folder && !list.length) return;
      const part = h(`<section class="crm-folder"><div class="crm-folder-head"><h3></h3><span class="small muted"></span><span class="crm-folder-acts"></span></div><div class="crm-list"></div></section>`);
      part.querySelector("h3").textContent = folder ? folder.name : (data.folders.length ? t("Not in a folder") : t("Everything"));
      part.querySelector(".muted").textContent = list.length === 1 ? t("1 thing") : t("{0} things", list.length);
      if (folder && teaching) {
        const ren = h(`<button type="button" class="ghost">Rename</button>`);
        ren.onclick = async () => {
          const name = (await askName(t("Rename the folder"), t("Folder name"), { value: folder.name, ok: t("Rename") })).slice(0, 60);
          if (!name || name === folder.name) return;
          try { await cls.folderSave(c.id, name, folder.id); } catch (e) { toast(e.message, { error: true }); }
          if (alive) room(c);
        };
        const del = h(`<button type="button" class="ghost danger">Remove</button>`);
        del.onclick = async () => {
          if (!(await confirmBox(t("Remove the folder {0}?", folder.name), t("What is in it stays in the classroom, outside any folder."), { ok: t("Remove"), danger: true }))) return;
          try { await cls.folderRemove(folder.id); } catch (e) { toast(e.message, { error: true }); }
          if (alive) room(c);
        };
        part.querySelector(".crm-folder-acts").append(ren, del);
      }
      if (!list.length) part.querySelector(".crm-list").append(h(`<p class="small muted crm-empty">Empty.</p>`));
      for (const p of list) part.querySelector(".crm-list").append(row(c, p, data.folders, mine[p.id], plain));
      body.append(part);
    };
    section(null);
    for (const f of data.folders) section(f);
  }

  function row(c, p, folders, had, plain) {
    const teaching = c.role === "teacher";
    const line = h(`<div class="crm-row"><span class="crm-ico">${icon(KIND_ICON[p.item.kind] || "book", 22)}</span>
      <span class="crm-row-text"><strong translate="no"></strong><span class="small muted crm-meta"></span><span class="crm-tags"></span></span>
      <span class="crm-row-acts"></span></div>`);
    line.querySelector("strong").textContent = p.item.title;
    const changed = p.updated_at && p.updated_at !== p.created_at;
    line.querySelector(".crm-meta").textContent = [t(MEDIA_KINDS[p.item.kind] || ""), p.sender ? `@${p.sender}` : "",
      changed ? t("updated {0}", day(p.updated_at)) : day(p.created_at), p.path ? t("with its words") : ""].filter(Boolean).join(" · ");
    const tags = line.querySelector(".crm-tags");
    const important = importantKeys(p.notes).size || p.notes.filter((n) => n.important).length;
    if (p.notes.length) {
      const b = h(`<button type="button" class="ghost crm-tag"></button>`);
      b.textContent = important ? t("{0} teacher's words, {1} important", p.notes.length, p.notes.filter((n) => n.important).length) : (p.notes.length === 1 ? t("1 teacher's word") : t("{0} teacher's words", p.notes.length));
      b.onclick = () => showNotes(p);
      tags.append(b);
    }
    const end = line.querySelector(".crm-row-acts");
    if (teaching) {
      if (!plain) {
        const up = h(`<button type="button" title="Send your transcript and your notes on its words again">Update</button>`);
        up.onclick = async () => {
          up.disabled = true;
          try {
            let ep = mineOf(p.id);
            if (!ep) { const r = await acceptMediaInfo(p.item, p.item); ep = r.episode && r.episode.id; if (ep) rememberMine(p.id, ep); } // (added from another device: my copy here is found by what it is)
            if (!ep) throw new Error(t("Open it in your Library on this device first, then update it."));
            const full = await api(`/episodes/${ep}`);
            const media = mediaFromEpisode(full && full.episode ? full.episode : full);
            if (!media) throw new Error(t("Your copy of it couldn't be read on this device."));
            const pay = await classPayload(media);
            await cls.roomUpdate(c.id, p.id, { item: pay.item, file: pay.file, notes: pay.notes });
            toast(pay.notes.length ? t("Updated: its transcript and {0} of your words.", pay.notes.length) : t("Updated: its transcript. You have no flashcards of it with a meaning, a note or the important mark yet."));
            if (alive) room(c);
          } catch (e) { toast(e.message, { error: true }); up.disabled = false; }
        };
        end.append(up);
        if (folders.length) {
          const sel = h(`<select aria-label="Folder" title="Folder"></select>`);
          for (const [id, name] of [["", t("No folder")], ...folders.map((f) => [f.id, f.name])]) { const o = document.createElement("option"); o.value = id; o.textContent = name; sel.append(o); }
          sel.value = p.folder;
          sel.onchange = async () => { try { await cls.roomMove(p.id, sel.value || null); } catch (e) { toast(e.message, { error: true }); } if (alive) room(c); };
          end.append(sel);
        }
      }
      const del = h(`<button type="button" class="ghost danger">Remove</button>`);
      del.onclick = async () => {
        if (!(await confirmBox(t("Remove “{0}” from the classroom?", p.item.title), t("Students who opened it keep their own copy."), { ok: t("Remove"), danger: true }))) return;
        try { await cls.deletePost(p.id); } catch (e) { toast(e.message, { error: true }); }
        if (alive) room(c);
      };
      end.append(del);
    } else {
      const fresh = had && p.updated_at && had.at !== p.updated_at;
      const open = h(`<button type="button" class="primary"></button>`);
      open.textContent = fresh ? t("Get the update") : had ? t("Open") : t("Add to my library");
      open.onclick = async () => {
        open.disabled = true;
        try {
          const r = await take(p);
          if (!had) toast(t("“{0}” is in your library.", p.item.title));
          await openMedia(p.item, r.hash);
        } catch (e) { toast(e.message, { error: true }); open.disabled = false; }
      };
      end.append(open);
      const n = p.notes.filter((x) => x.important).length;
      if (n) {
        const add = h(`<button type="button"></button>`);
        add.textContent = n === 1 ? t("Add the important word to my cards") : t("Add the {0} important words to my cards", n);
        add.onclick = async () => {
          add.disabled = true;
          try {
            const made = await addImportant(p, language);
            toast(made ? (made === 1 ? t("1 card made, in the folder {0}.", p.item.title.slice(0, 60)) : t("{0} cards made, in the folder {1}.", made, p.item.title.slice(0, 60)))
              : t("You have those words already. They are in the folder {0} now.", p.item.title.slice(0, 60)));
          } catch (e) { toast(e.message, { error: true }); }
          add.disabled = false;
        };
        end.append(add);
      }
    }
    return line;
  }

  /** A teacher picks something from their own Library to add. */
  async function pickFromLibrary(c, folders, done) {
    const box = openModal({ title: t("Add from my library"), wide: true });
    const view = h(`<div class="crm-pick"><p class="small muted">Its transcript goes along as it is now, with your notes on its words: your flashcards of it that are marked important, have a meaning you wrote, or grammar notes.</p>
      <label class="crm-field" hidden><span>Folder</span><select></select></label>
      <input type="search" class="crm-search" placeholder="Search your library…" autocomplete="off">
      <div class="crm-pick-list"><p class="small muted">Loading…</p></div></div>`);
    box.body.append(view);
    const sel = view.querySelector("select");
    for (const [id, name] of [["", t("No folder")], ...folders.map((f) => [f.id, f.name])]) { const o = document.createElement("option"); o.value = id; o.textContent = name; sel.append(o); }
    view.querySelector(".crm-field").hidden = !folders.length;
    const list = view.querySelector(".crm-pick-list");
    let turn = 0;
    const paint = async () => {
      const mine = ++turn;
      const q = view.querySelector(".crm-search").value.trim();
      let items = [];
      try { items = (await api(`/episodes?${new URLSearchParams({ limit: 120, ...(q ? { q } : {}) })}`)).items || []; } catch (e) {
        if (mine !== turn) return;
        list.innerHTML = "";
        const p = h(`<p class="small muted"></p>`);
        p.textContent = e.message;
        list.append(p);
        return;
      }
      if (mine !== turn) return; // (a newer search has been typed)
      const shown = items.map((ep) => ({ ep, media: mediaFromEpisode(ep) })).filter((x) => x.media && (x.media.kind !== "text" || x.media.ready));
      list.innerHTML = "";
      if (!shown.length) { list.append(h(`<p class="small muted">Nothing found. Things that can be shared: podcasts, YouTube videos, reels, web pages, books, and your own audio and videos once they are transcribed.</p>`)); return; }
      for (const x of shown) {
        const line = h(`<div class="crm-row"><span class="crm-ico">${icon(KIND_ICON[x.media.kind] || "book", 22)}</span>
          <span class="crm-row-text"><strong translate="no"></strong><span class="small muted" translate="no"></span></span><button type="button" class="primary">Add</button></div>`);
        line.querySelector("strong").textContent = x.media.title;
        line.querySelector(".muted").textContent = [t(MEDIA_KINDS[x.media.kind] || ""), x.ep.feed_title || ""].filter(Boolean).join(" · ");
        const b = line.querySelector("button");
        b.onclick = async () => {
          b.disabled = true;
          try {
            const r = await sendToClass(c.id, x.media, { folder: sel.value || null });
            b.textContent = t("Added");
            toast(r.notes ? t("Added, with its words and {0} of your notes.", r.notes) : r.withWords ? t("Added, with its words.") : t("Added."));
            done();
          } catch (e) { toast(e.message, { error: true }); b.disabled = false; }
        };
        list.append(line);
      }
    };
    let wait = 0;
    view.querySelector(".crm-search").oninput = () => { clearTimeout(wait); wait = setTimeout(paint, 250); };
    paint();
  }

  load();
  return () => { alive = false; };
}

if (typeof document !== "undefined" && !document.getElementById("crm-css")) {
  const style = document.createElement("style");
  style.id = "crm-css";
  style.textContent = `
    .library.classroom-kind .lib-courses, .library:not(.classroom-kind) .lib-classroom { display: none; }
    .crm { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; padding: 4px 0 24px; }
    .crm-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .crm-top h2 { margin: 0 0 4px; }
    .crm-top p { margin: 0; max-width: 560px; }
    .crm-acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .crm-acts button { min-height: 44px; }
    .crm-picker { display: flex; gap: 8px; flex-wrap: wrap; }
    .crm-picker button { min-height: 40px; border-radius: 12px; padding: 4px 14px; font-weight: 600; }
    .crm-picker button.on, .crm-picker button.on:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .crm-body { display: flex; flex-direction: column; gap: 16px; }
    .crm-say { text-align: center; margin: 24px 0 8px; }
    .crm .set-actions { justify-content: center; }
    .crm-folder-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
    .crm-folder-head h3 { margin: 0; font-size: 17px; }
    .crm-folder-acts { margin-inline-start: auto; display: flex; gap: 4px; }
    .crm-list, .crm-pick-list { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); overflow: hidden; }
    .crm-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 60px; flex-wrap: wrap; }
    .crm-row + .crm-row { border-top: 1px solid var(--border); }
    .crm-ico { display: inline-flex; color: var(--accent); flex: none; }
    .crm-row-text { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
    .crm-row-acts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .crm-row-acts select { min-height: 36px; max-width: 160px; }
    .crm-tag { align-self: flex-start; padding: 2px 10px; min-height: 28px; border: 1px solid var(--border); border-radius: 999px; font-size: 13px; }
    .crm-empty { padding: 12px 14px; margin: 0; }
    .crm-pick { display: flex; flex-direction: column; gap: 10px; }
    .crm-pick p { margin: 0; }
    .crm-pick-list > p { padding: 12px 14px; }
    .crm-field { display: flex; align-items: center; gap: 10px; }
    .crm-field select, .crm-search { min-height: 44px; font-size: 16px; }
    .crm-notes { display: flex; flex-direction: column; gap: 8px; }
    .crm-note { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: var(--surface-2); }
    .crm-note p { margin: 4px 0 0; }
    .crm-note-top { display: flex; align-items: center; gap: 10px; }
    .crm-note-top strong { font-size: 20px; }
    .crm-imp { font-size: 12px; font-weight: 700; color: var(--accent-ink); background: var(--accent); border-radius: 999px; padding: 2px 10px; }
    .crm-note-meaning { font-size: 17px; }
    .crm-note-text { white-space: pre-wrap; }
  `;
  document.head.append(style);
}
