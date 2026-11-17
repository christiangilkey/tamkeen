// "Correct the transcript": an automatic transcript put right a line at a time, while hearing it (lesson bundles,
// and any audio in the Library from the player). Each line has its time (tap it to hear that line), the line's
// words to type over, and three small actions: cut it in two at the cursor, join it to the next one, put it back
// as it was. Enter goes to the next line; Alt+P (or the line's time) plays the line again; Ctrl+S saves. The
// words keep their timings (transcriptedit.js retime), so the player still lights them up as they are said.
// Saved with PUT /episodes/<id>/transcript; on a lesson sent to a class, "Send the corrected copy" passes it on.

import { api, audioUrl, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { changedLines, joinLines, linesOf, retime, splitLine, toSegments } from "../transcriptedit.js";
import { confirmBox, openModal } from "./modal.js";
import { mediaSound } from "../appvolume.js";

const clock = (s) => { const x = Math.max(0, Math.floor(s)); const h_ = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), sec = x % 60;
  return `${h_ ? `${h_}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}`; };
const rowsFor = (text) => Math.min(8, Math.max(1, Math.ceil(String(text).length / 64)));

/** Open the editor for episode `ep`. `onSaved()` after a save. */
export async function openTranscriptEditor(ep, { onSaved = () => {} } = {}) {
  let data;
  try { data = await api(`/episodes/${ep.id}/transcript`); } catch (e) { toast(e.message, { error: true }); return null; }
  const original = linesOf(data);
  if (!original.length) { toast(t("There is no transcript to correct yet.")); return null; }
  let lines = original.map((l) => ({ ...l, words: l.words.map((w) => [...w]) }));
  let saving = false;
  const dirty = () => changedLines(original, lines) > 0 || lines.length !== original.length;
  const box = openModal({ title: t("Correct the transcript"), wide: true, cls: "te-back",
    beforeClose: () => (dirty() && !saving ? confirmBox(t("Leave without saving?"), t("Your corrections to the transcript are lost."), { ok: t("Leave"), danger: true }) : true),
    onClose: () => { audio.pause(); audio.removeAttribute("src"); audio.load(); } });
  const wrap = h(`<div class="te">
    <p class="small muted te-name"></p>
    <div class="te-bar">
      <button type="button" class="primary icon te-play" title="Play / pause" aria-label="Play / pause">${icon("play", 18)}</button>
      <span class="te-time small muted">0:00</span>
      <button type="button" class="ghost small te-speed" title="Speed">1×</button>
      <label class="te-follow small"><input type="checkbox" checked> <span>Follow along</span></label>
      <span class="lsn-bar-gap"></span>
      <input type="search" class="te-find" placeholder="Find" aria-label="Find in the transcript">
      <span class="te-count small muted"></span>
      <button type="button" class="primary te-save">Save</button>
    </div>
    <p class="small muted te-help">Type over any line. Enter: next line · Alt+P: hear the line again · Ctrl+S: save.</p>
    <div class="te-lines" role="list"></div>
  </div>`);
  box.body.append(wrap);
  wrap.querySelector(".te-name").textContent = ep.title || "";
  const listEl = wrap.querySelector(".te-lines");
  const audio = mediaSound(new Audio());
  audio.preload = "metadata";
  const youtube = String(ep.audio_type || "") === "video/youtube";
  if (youtube) {
    wrap.querySelector(".te-help").textContent = t("This plays on YouTube, so it can't be heard here: open it in the player beside this. Enter: next line · Ctrl+S: save.");
    for (const el of wrap.querySelectorAll(".te-play, .te-speed, .te-follow, .te-time")) el.hidden = true;
  } else {
    audioUrl(ep.id).then((url) => { if (url) audio.src = url; }).catch(() => null);
  }
  let stopAt = Infinity;
  let current = -1;
  const playBtn = wrap.querySelector(".te-play");
  const follow = wrap.querySelector(".te-follow input");
  audio.onplay = () => { playBtn.innerHTML = icon("pause", 18); };
  audio.onpause = () => { playBtn.innerHTML = icon("play", 18); };
  audio.ontimeupdate = () => {
    const now = audio.currentTime;
    wrap.querySelector(".te-time").textContent = clock(now);
    if (now >= stopAt) { audio.pause(); stopAt = Infinity; }
    const k = lines.findIndex((l, i) => now >= l.start && (i === lines.length - 1 || now < lines[i + 1].start));
    if (k !== current) {
      const rows = listEl.children;
      if (rows[current]) rows[current].classList.remove("te-now");
      current = k;
      if (rows[k]) {
        rows[k].classList.add("te-now");
        if (follow.checked && !rows[k].contains(document.activeElement)) rows[k].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  };
  playBtn.onclick = () => { if (audio.paused) { stopAt = Infinity; audio.play().catch(() => toast(t("This audio can't be played here."), { error: true })); } else audio.pause(); };
  const speed = wrap.querySelector(".te-speed");
  speed.onclick = () => { audio.playbackRate = audio.playbackRate === 1 ? 0.75 : audio.playbackRate === 0.75 ? 0.5 : 1; speed.textContent = `${audio.playbackRate}×`; };
  const playLine = (k) => {
    if (youtube || !lines[k]) return;
    audio.currentTime = lines[k].start;
    stopAt = lines[k].end + 0.15;
    audio.play().catch(() => toast(t("This audio can't be played here."), { error: true }));
  };

  const count = () => {
    const n = changedLines(original, lines);
    wrap.querySelector(".te-count").textContent = n === 0 ? "" : n === 1 ? t("1 line changed") : t("{0} lines changed", n);
  };

  function row(l, k) {
    const r = h(`<div class="te-line" role="listitem"><button type="button" class="ghost small te-at" title="Hear this line (Alt+P)"></button>
      <textarea class="te-text" dir="auto" spellcheck="false" aria-label="Line"></textarea>
      <span class="te-acts"><button type="button" class="ghost icon small" data-a="split" title="Cut the line in two at the cursor" aria-label="Cut the line in two at the cursor">✂</button>
      <button type="button" class="ghost icon small" data-a="join" title="Join with the next line" aria-label="Join with the next line">⤓</button>
      <button type="button" class="ghost icon small" data-a="undo" title="Put the line back as it was" aria-label="Put the line back as it was">↺</button></span></div>`);
    const at = r.querySelector(".te-at");
    at.textContent = clock(l.start);
    at.onclick = () => playLine(k);
    const ta = r.querySelector("textarea");
    ta.value = l.text;
    ta.rows = rowsFor(l.text);
    if (ep.language) ta.lang = ep.language;
    const was = original[k] && original[k].start === l.start ? original[k].text : null;
    r.classList.toggle("te-changed", was !== null ? was.trim() !== l.text.trim() : true);
    ta.oninput = () => {
      lines[k] = { ...lines[k], text: ta.value.replace(/\n/g, " ") };
      ta.rows = rowsFor(ta.value);
      r.classList.toggle("te-changed", was === null || was.trim() !== ta.value.trim());
      count();
    };
    ta.onblur = () => { lines[k] = retime(lines[k], lines[k].text); };
    ta.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const next = listEl.children[k + 1];
        if (next) { const n = next.querySelector("textarea"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      } else if (e.altKey && (e.key === "p" || e.key === "P" || e.code === "KeyP")) { e.preventDefault(); playLine(k); }
    };
    r.querySelector(".te-acts").onclick = (e) => {
      const a = e.target.closest("button") && e.target.closest("button").dataset.a;
      if (a === "split") {
        const cut = ta.selectionStart || 0;
        const before = ta.value.slice(0, cut).trim().split(/\s+/).filter(Boolean).length;
        const timed = retime(lines[k], ta.value);
        const parts = splitLine(timed, before);
        if (parts.length < 2) { toast(t("Put the cursor between two words first.")); return; }
        lines.splice(k, 1, ...parts);
      } else if (a === "join") {
        if (k >= lines.length - 1) return;
        lines.splice(k, 2, joinLines(retime(lines[k], lines[k].text), retime(lines[k + 1], lines[k + 1].text)));
      } else if (a === "undo") {
        const o = original.find((x) => x.start === lines[k].start);
        if (!o) return;
        lines[k] = { ...o, words: o.words.map((w) => [...w]) };
      } else return;
      paint();
      count();
      const keepFocus = listEl.children[k] && listEl.children[k].querySelector("textarea");
      if (keepFocus) keepFocus.focus();
    };
    return r;
  }

  function paint() {
    listEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    lines.forEach((l, k) => frag.append(row(l, k)));
    listEl.append(frag);
    current = -1;
  }

  const find = wrap.querySelector(".te-find");
  find.oninput = () => {
    const q = find.value.trim().toLowerCase();
    const rows = [...listEl.children];
    rows.forEach((r, k) => { r.hidden = !!q && !String(lines[k].text).toLowerCase().includes(q); });
  };

  async function save() {
    if (saving) return;
    if (!dirty()) { toast(t("Nothing has changed.")); return; }
    saving = true;
    const btn = wrap.querySelector(".te-save");
    btn.disabled = true;
    try {
      const segments = toSegments(lines.map((l) => retime(l, l.text)));
      await api(`/episodes/${ep.id}/transcript`, { method: "PUT", body: { segments, model: "edited" } });
      toast(t("Transcript saved."));
      box.close();
      onSaved();
    } catch (e) {
      toast(e.message, { error: true });
    } finally { saving = false; btn.disabled = false; }
  }
  wrap.querySelector(".te-save").onclick = save;
  wrap.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); save(); }
  });
  paint();
  count();
  return box;
}
