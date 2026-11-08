// Library → Courses → DLI: the material for the learner's DLI language (Settings → Languages → DLI
// students), opened on the device with the key the password made (dlicontent.js). Podcasts are in the
// learner's podcasts with every episode transcribed (added by themselves on unlocking; "Add to my
// podcasts" brings one back after it was removed); vocabulary decks are in the Vocab tab, a folder per chapter;
// other files open in a box. Until there is material
// for a language it says it is coming soon. Shared by the computer and the phone.

import { api, esc, h, state, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { contentFor, deckMarks, dliLanguageName, dliState } from "../dli.js";
import { addPodcast, loadIndex, onDeckProgress, openFile, runDli } from "../dlicontent.js";
import { openModal } from "./modal.js";

const settings = () => (state.status && state.status.settings) || {};

const iconFor = (type) => (type.startsWith("audio/") ? "audio" : type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image"
  : type === "application/pdf" ? "book" : "transcript");
/** "12 kB", "3.4 MB" (the app's fmtBytes says "0 MB" for anything small). */
const size = (n) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`);

/** Is the DLI tab there for this language: unlocked, and it is the DLI language? */
export function dliShown(language, s = settings()) {
  const st = dliState(s);
  return st.ready && st.language === language;
}

/** Fill `el` with the DLI material of `language`. Returns a cleanup function. */
export function dliPanel(el, language) {
  const st = dliState(settings());
  const name = t(dliLanguageName(language));
  el.innerHTML = "";
  const page = h(`<div class="dli-panel">
    <div class="dli-head"><span class="dli-head-ico">${icon("lock", 22)}</span>
      <div><h2></h2><p class="small muted">Defense Language Institute</p></div></div>
    <div class="dli-body"><p class="course-note">Loading…</p></div></div>`);
  page.querySelector("h2").textContent = t("DLI {0}", name);
  el.append(page);
  const bodyEl = page.querySelector(".dli-body");
  let alive = true;
  const urls = [];
  const cleanups = [];

  function soon() {
    bodyEl.innerHTML = "";
    const p = h(`<div class="dli-soon"><p></p></div>`);
    p.querySelector("p").textContent = t("Content for DLI {0} students is coming soon.", name);
    bodyEl.append(p);
  }

  async function podcastRow(pod) {
    const row = h(`<div class="dli-row"><span class="dli-row-ico">${icon("podcast", 22)}</span>
      <span class="dli-row-text"><strong></strong><span class="small muted"></span></span><span class="dli-row-act"></span></div>`);
    row.querySelector("strong").textContent = pod.title;
    row.querySelector(".muted").textContent = pod.episodes.length === 1 ? t("1 episode, already transcribed")
      : t("{0} episodes, already transcribed", pod.episodes.length);
    const act = row.querySelector(".dli-row-act");
    const paint = (feedId) => {
      act.innerHTML = "";
      if (feedId) {
        act.append(h(`<a class="btn" href="#/feed/${esc(feedId)}">${esc(t("Open"))}</a>`));
        return;
      }
      const add = h(`<button type="button" class="primary"></button>`);
      add.textContent = t("Add to my podcasts");
      add.onclick = async () => {
        add.disabled = true;
        add.textContent = t("Adding…");
        try {
          const r = await addPodcast(pod, language, st.key, { follow: true });
          if (r.feedId) toast(t("{0} is in your podcasts, every episode already transcribed.", pod.title));
          paint(r.feedId);
        } catch (e) {
          toast(e.message, { error: true });
          paint(null);
        }
      };
      act.append(add);
    };
    // Followed already? (the ordinary podcast door answers without changing anything)
    const r = await api("/premade", { method: "POST", body: { feed_url: pod.feed, language, follow: false, items: [] } }).catch(() => null);
    paint(r && r.feed_id);
    return row;
  }

  /** A vocabulary deck: its size, how much has audio yet, and where it is (the Vocab tab, a folder per
   *  chapter, put there by dlicontent.js addDeck on starting and after each sync; this row can start it too). */
  function deckRow(deck) {
    const row = h(`<div class="dli-row"><span class="dli-row-ico">${icon("vocab", 22)}</span>
      <span class="dli-row-text"><strong></strong><span class="small muted dli-deck-size"></span>
        <span class="small muted dli-deck-state"></span></span><span class="dli-row-act"></span></div>`);
    row.querySelector("strong").textContent = deck.title;
    const voiced = deck.chapters.reduce((s, c) => s + c.voiced, 0);
    row.querySelector(".dli-deck-size").textContent = t("{0} words in {1} chapters, each with a sentence and its translation",
      deck.words.toLocaleString(), deck.chapters.length);
    const stateEl = row.querySelector(".dli-deck-state");
    const act = row.querySelector(".dli-row-act");
    const paint = (busy) => {
      const marks = deckMarks(settings(), deck.id);
      const all = deck.chapters.every((c) => marks.has(Number(c.id.slice(1))));
      stateEl.textContent = busy ? busy
        : voiced >= deck.words ? t("With audio for every word.")
        : voiced ? t("Audio for {0} words so far; the rest comes with the next updates.", voiced.toLocaleString())
        : t("Audio comes with the next updates; until then this device's voice reads them.");
      act.innerHTML = "";
      if (busy) return;
      if (all) {
        act.append(h(`<a class="btn" href="#/vocab">${esc(t("Open Vocab"))}</a>`));
        return;
      }
      const add = h(`<button type="button" class="primary"></button>`);
      add.textContent = t("Add to my Vocab");
      add.onclick = () => { paint(t("Adding…")); runDli().finally(() => alive && paint("")); };
      act.append(add);
    };
    paint("");
    const stop = onDeckProgress((p) => {
      if (!alive) return;
      if (p && p.deck === deck.title) paint(t("Adding chapter {0} of {1}: {2}", p.step, p.of, p.chapter));
      else if (!p) paint("");
    });
    cleanups.push(stop);
    return row;
  }

  function fileRow(item) {
    const row = h(`<button type="button" class="dli-row dli-file"><span class="dli-row-ico">${icon(iconFor(item.type), 22)}</span>
      <span class="dli-row-text"><strong></strong><span class="small muted"></span></span></button>`);
    row.querySelector("strong").textContent = item.title;
    row.querySelector(".muted").textContent = item.size ? size(item.size) : "";
    row.onclick = () => showFile(item);
    return row;
  }

  async function showFile(item) {
    const box = openModal({ title: item.title, wide: true, onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)) });
    box.body.classList.add("dli-view");
    box.body.append(h(`<p class="muted">${esc(t("Opening…"))}</p>`));
    try {
      const blob = await openFile(st.key, item);
      const url = URL.createObjectURL(blob);
      urls.push(url);
      box.body.innerHTML = "";
      const type = item.type;
      if (type.startsWith("audio/")) box.body.append(h(`<audio controls src="${url}"></audio>`));
      else if (type.startsWith("video/")) box.body.append(h(`<video controls playsinline src="${url}"></video>`));
      else if (type.startsWith("image/")) box.body.append(h(`<img alt="" src="${url}">`));
      else if (type.startsWith("text/") || type === "application/json") {
        const pre = h(`<pre class="dli-text" dir="auto"></pre>`);
        pre.textContent = await blob.text();
        box.body.append(pre);
      } else if (type === "application/pdf") box.body.append(h(`<iframe class="dli-pdf" title="" src="${url}"></iframe>`));
      const save = h(`<div class="set-actions"><a class="btn" download></a></div>`);
      const a = save.querySelector("a");
      a.href = url;
      a.download = item.name || item.title;
      a.textContent = t("Save a copy");
      box.body.append(save);
    } catch (e) {
      box.body.innerHTML = "";
      box.body.append(h(`<p class="muted">${esc(t("This file couldn't be opened."))}</p>`));
      console.warn("DLI file", e);
    }
  }

  loadIndex(st.key).then(async (index) => {
    if (!alive) return;
    const items = contentFor(index, language);
    if (!items.length) { soon(); return; }
    bodyEl.innerHTML = "";
    const decks = items.filter((x) => x.kind === "deck");
    if (decks.length) {
      const sec = h(`<section class="dli-sec"><h3></h3><div class="dli-list"></div></section>`);
      sec.querySelector("h3").textContent = t("Vocabulary");
      for (const d of decks) sec.querySelector(".dli-list").append(deckRow(d));
      bodyEl.append(sec);
    }
    const pods = items.filter((x) => x.kind === "podcast");
    if (pods.length) {
      const sec = h(`<section class="dli-sec"><h3>Podcasts</h3><div class="dli-list"></div></section>`);
      bodyEl.append(sec);
      for (const pod of pods) sec.querySelector(".dli-list").append(await podcastRow(pod));
    }
    const groups = new Map();
    for (const f of items.filter((x) => x.kind === "file")) {
      if (!groups.has(f.group)) groups.set(f.group, []);
      groups.get(f.group).push(f);
    }
    for (const [group, files] of groups) {
      const sec = h(`<section class="dli-sec"><h3></h3><div class="dli-list"></div></section>`);
      sec.querySelector("h3").textContent = group || t("Files");
      for (const f of files) sec.querySelector(".dli-list").append(fileRow(f));
      bodyEl.append(sec);
    }
  }).catch((e) => {
    if (!alive) return;
    console.warn("DLI content", e);
    bodyEl.innerHTML = "";
    const p = h(`<div class="dli-soon"><p></p><a class="btn" href="#/settings?s=languages&show=dli"></a></div>`);
    p.querySelector("p").textContent = t("The DLI content couldn't be opened. Unlock it again in Settings.");
    p.querySelector("a").textContent = t("Open Settings");
    bodyEl.append(p);
  });

  return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); cleanups.forEach((fn) => fn()); };
}

// ---------- looks (added once) ----------
if (typeof document !== "undefined" && !document.getElementById("dli-panel-css")) {
  const style = document.createElement("style");
  style.id = "dli-panel-css";
  style.textContent = `
    .dli-panel { max-width: 680px; margin: 0 auto; }
    .dli-head { display: flex; align-items: center; justify-content: center; gap: 12px; text-align: start; margin: 6px 0 14px; }
    .dli-head h2 { margin: 0; font-size: 20px; }
    .dli-head p { margin: 2px 0 0; }
    .dli-head-ico { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none;
      background: var(--accent-soft); color: var(--accent); }
    .dli-soon { text-align: center; padding: 28px 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border);
      display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .dli-soon p { margin: 0; color: var(--muted); font-size: 15px; max-width: 420px; }
    .dli-sec { margin-bottom: 16px; }
    .dli-sec h3 { font-size: 15px; margin: 0 0 8px; color: var(--muted); }
    .dli-list { border-radius: 16px; background: var(--surface); border: 1px solid var(--border); overflow: hidden; }
    .dli-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 64px; width: 100%; text-align: start;
      border: 0; border-radius: 0; background: none; color: var(--text); font: inherit; }
    .dli-row + .dli-row { border-top: 1px solid var(--border); }
    button.dli-row:hover:not(:disabled) { background: var(--surface-2); }
    .dli-row-ico { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--accent-soft); color: var(--accent); }
    .dli-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; white-space: normal; }
    .dli-row-text strong { overflow-wrap: anywhere; }
    .dli-row-act { flex: none; }
    .dli-view audio, .dli-view video, .dli-view img { width: 100%; max-height: 70vh; object-fit: contain; display: block; }
    .dli-view .dli-pdf { width: 100%; height: 70vh; border: 0; border-radius: 10px; background: #fff; }
    .dli-text { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 60vh; overflow: auto; margin: 0; padding: 12px; border-radius: 10px;
      background: var(--surface-2); font: inherit; }
  `;
  document.head.append(style);
}
