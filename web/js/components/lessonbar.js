// The lesson's audio bar (prototype lesson_links; the owner, 2026-11-19: "the audios should be selectable from a sideways
// scrollable bar on top which stays even as the user scrolls downwards"). One button per sound in the lesson, in the
// document's order (its sound spots, then any other track), in a row that scrolls sideways and stays pinned at the top of
// the lesson while the questions scroll under it. A tap plays that sound in the bar's one player (play/pause and a seek
// line beside the row); the one playing is marked. A spot whose file isn't added yet shows greyed out. The buttons are
// ordinary buttons, so Tab, the arrow keys (Left/Right move along the row) and the game controller reach them.
// Shared by every version.

import { audioUrl, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { episodeByUid } from "../lessonstore.js";
import { mediaSound } from "../appvolume.js";

/** The bar's entries for a lesson record: [{key, label, uid, title}] (uid "" = not added yet). */
export function barItems(rec) {
  const items = [];
  const used = new Set();
  for (const sp of rec.spots || []) {
    items.push({ key: `s:${sp.id}`, label: sp.name.replace(/\.[a-z0-9]{2,5}$/i, ""), uid: sp.track || "", title: sp.name });
    if (sp.track) used.add(sp.track);
  }
  for (const tr of rec.tracks || []) {
    if (used.has(tr.uid)) continue;
    items.push({ key: `t:${tr.uid}`, label: tr.title || "", uid: tr.uid, title: tr.title || "" });
  }
  return items;
}

const clock = (s) => { const x = Math.max(0, Math.floor(s || 0)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`; };

/** The bar for lesson `rec`. Returns {el, play(uid), update(rec), destroy()}; `el` is empty (hidden) with no sounds. */
export function audioBar(recIn) {
  let rec = recIn;
  let current = ""; // the uid playing (or paused) in the bar
  let sound = null;
  const el = h(`<div class="lsn-abar" role="region" aria-label="Lesson audio">
    <div class="lsn-abar-ctl"><button type="button" class="primary icon lsn-abar-play" title="Play / pause" aria-label="Play / pause">${icon("play", 18)}</button>
      <span class="lsn-abar-now small"></span><input type="range" class="lsn-abar-seek" min="0" max="0" step="0.1" value="0" aria-label="Position">
      <span class="lsn-abar-time small muted">0:00</span></div>
    <div class="lsn-abar-row" role="toolbar" aria-label="Lesson audio"></div></div>`);
  const row = el.querySelector(".lsn-abar-row");
  const playBtn = el.querySelector(".lsn-abar-play");
  const seek = el.querySelector(".lsn-abar-seek");
  const time = el.querySelector(".lsn-abar-time");
  const now = el.querySelector(".lsn-abar-now");
  let seeking = false;

  function mark() {
    for (const b of row.querySelectorAll("button")) {
      const on = !!current && b.dataset.uid === current;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    playBtn.innerHTML = icon(sound && !sound.paused ? "pause" : "play", 18);
    playBtn.disabled = !current;
  }

  function paint() {
    row.innerHTML = "";
    const items = barItems(rec);
    el.hidden = !items.length;
    for (const it of items) {
      const b = h(`<button type="button" class="lsn-abar-btn"></button>`);
      b.textContent = it.label || "♪";
      b.title = it.uid ? it.title : t("{0} (not added yet)", it.title);
      b.dataset.uid = it.uid;
      if (!it.uid) { b.disabled = true; b.classList.add("missing"); }
      else b.onclick = () => play(it.uid, it.title);
      row.append(b);
    }
    mark();
  }

  /** Play `uid` in the bar (a second tap on the one playing pauses it). */
  async function play(uid, title = "") {
    if (!uid) return;
    if (uid === current && sound) {
      if (sound.paused) sound.play().catch(() => {}); else sound.pause();
      return;
    }
    if (sound) { sound.pause(); sound.removeAttribute("src"); }
    current = uid;
    const item = barItems(rec).find((x) => x.uid === uid);
    now.textContent = (item && item.label) || title;
    const ep = await episodeByUid(uid);
    const url = ep && await audioUrl(ep.id).catch(() => "");
    if (current !== uid) return; // (another was tapped meanwhile)
    if (!url) { toast(t("Not on this device yet: it arrives with the next sync."), { error: true }); current = ""; mark(); return; }
    sound = mediaSound(new Audio(url)); // (the media volume slider, appvolume.js)
    sound.preload = "auto";
    sound.onplay = sound.onpause = sound.onended = mark;
    sound.onloadedmetadata = () => { seek.max = String(sound.duration || 0); };
    sound.ontimeupdate = () => {
      if (!seeking) seek.value = String(sound.currentTime);
      time.textContent = clock(sound.currentTime);
    };
    sound.play().catch(() => toast(t("This audio can't be played here."), { error: true }));
    mark();
    const b = row.querySelector(`button[data-uid="${CSS.escape(uid)}"]`);
    if (b) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  playBtn.onclick = () => { if (sound) { if (sound.paused) sound.play().catch(() => {}); else sound.pause(); } };
  seek.oninput = () => { seeking = true; time.textContent = clock(Number(seek.value)); };
  seek.onchange = () => { seeking = false; if (sound) sound.currentTime = Number(seek.value); };
  // Left / Right move along the row (Home / End to its ends), like a toolbar
  row.addEventListener("keydown", (e) => {
    const all = [...row.querySelectorAll("button:not([disabled])")];
    const at = all.indexOf(document.activeElement);
    if (at < 0) return;
    const rtl = getComputedStyle(row).direction === "rtl";
    let to = -1;
    if (e.key === "ArrowRight") to = at + (rtl ? -1 : 1);
    else if (e.key === "ArrowLeft") to = at + (rtl ? 1 : -1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = all.length - 1;
    if (to < 0 || to >= all.length) return;
    e.preventDefault();
    all[to].focus();
  });

  paint();
  return {
    el,
    play,
    update(next) { rec = next; paint(); },
    destroy() { if (sound) { sound.pause(); sound.removeAttribute("src"); } sound = null; },
  };
}
