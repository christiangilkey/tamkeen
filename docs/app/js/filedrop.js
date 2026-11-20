// Drag and drop for files (the owner, 2026-11-19: "drag and drop capability for desktop webapp and for desktop app
// of tamkeen, allowing users to drag and drop files to upload them in all the sections where uploads are possible").
// Prototype `drag_drop` (prototype.js).
//
//   - dropZone(el, …): a place that takes files. Dragging files over it shows a plain drop area on top of it that says
//     what will happen ("Drop to add to My audio"); dropping hands the files to exactly the import its button uses.
//     A file of the wrong kind gets a message, never silence.
//   - blockStrayDrops(): a file dropped anywhere else does nothing (a browser, and the desktop app's window, would
//     otherwise open the file in place of the app). This part is on for everyone: it only stops that.
//
// The desktop app needs nothing of its own: its window (pywebview on WebView2) gives the page the dropped files as
// ordinary files, and every import here sends the file's own bytes, as the buttons' file choosers do.
// Phones never drag files onto a page, so nothing here shows there. Shared by every version.

import { feature } from "./prototype.js";

/** Whether a drag carries files (not text or a link being dragged inside the page). */
export function hasFiles(dt) {
  if (!dt) return false;
  const types = dt.types ? [...dt.types] : [];
  return types.includes("Files") || [...(dt.items || [])].some((i) => i && i.kind === "file");
}

/** Whether `file` is what a file chooser with this `accept` list ("audio/*,.mkv,application/zip") would offer:
 *  a type with a star, an exact type, or an ending. An empty list takes anything. */
export function matchesAccept(file, accept) {
  const parts = String(accept || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return true;
  const name = String((file && file.name) || "").toLowerCase();
  const type = String((file && file.type) || "").toLowerCase();
  return parts.some((p) => {
    if (p.startsWith(".")) return name.endsWith(p);
    if (p.endsWith("/*")) return !!type && type.startsWith(p.slice(0, -1));
    return !!type && type === p;
  });
}

/**
 * What to do with dropped `files` for a zone: {files} to import, or {problem: "none" | "many" | "kind"}.
 * `accept` is the button's list; with `check: "some"` the zone's import sorts the files itself (a lesson, an
 * audiobook), so they all go to it when any of them fits; `multiple: false` takes one file only.
 */
export function sortDrop(files, { accept = "", multiple = true, check = "all" } = {}) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return { problem: "none" };
  if (!multiple && list.length > 1) return { problem: "many" };
  const fits = list.filter((f) => matchesAccept(f, accept));
  if (!fits.length) return { problem: "kind" };
  return { files: check === "some" ? list : fits, left: check === "some" ? [] : list.filter((f) => !fits.includes(f)) };
}

let overlay = null;
let shownFor = null;
let hideTimer = 0;

function overlayEl() {
  if (overlay && overlay.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.className = "file-drop";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `<div class="file-drop-box"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/>
    <path d="M4.5 14.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"/></svg><strong></strong><span class="small"></span></div>`;
  overlay.hidden = true;
  document.body.append(overlay);
  return overlay;
}

function show(zone) {
  clearTimeout(hideTimer);
  // (while files are over it, a drag sends "dragover" many times a second: no more for a moment means they left)
  hideTimer = setTimeout(hide, 350);
  const el = overlayEl();
  const r = zone.el.getBoundingClientRect();
  const top = Math.max(0, r.top), left = Math.max(0, r.left);
  const bottom = Math.min(window.innerHeight, r.bottom), right = Math.min(window.innerWidth, r.right);
  Object.assign(el.style, { top: `${top}px`, left: `${left}px`, width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px` });
  if (shownFor !== zone) {
    el.querySelector("strong").textContent = zone.label();
    const hint = zone.hint();
    el.querySelector("span").textContent = hint;
    el.querySelector("span").hidden = !hint;
    shownFor = zone;
  }
  el.hidden = false;
}

function hide() {
  clearTimeout(hideTimer);
  shownFor = null;
  if (overlay) overlay.hidden = true;
}

/**
 * Let `el` take dropped files (with prototype `drag_drop` on). Options:
 *   label   what dropping does, shown while files are over it ("Drop to add to My audio"); a string or a function
 *   hint    a smaller line under it (what kinds of file), or ""
 *   accept  the same list as its button's file chooser; `check: "some"` when its import sorts the files itself
 *   multiple  false: one file at a time (its button takes one)
 *   wrongKind  the message for files of the wrong kind; `many` for several files where one is taken
 *   active  a function: false while the place isn't the one showing (the zone is then left to the ones around it)
 *   onFiles(files)  the import: the same function its button calls
 *   say(message, {error})  how to show a message (the app's toast)
 * The innermost active zone takes the drop. Returns a function that stops it.
 */
export function dropZone(el, opts) {
  if (!el) return () => {};
  const fn = (v) => (typeof v === "function" ? v : () => v || "");
  const zone = {
    el,
    label: fn(opts.label),
    hint: fn(opts.hint),
    active: typeof opts.active === "function" ? opts.active : () => true,
  };
  const say = typeof opts.say === "function" ? opts.say : () => {};
  const usable = (e) => feature("drag_drop") && !e.__tamkeenDrop && hasFiles(e.dataTransfer) && el.isConnected && zone.active();
  const over = (e) => {
    if (!usable(e)) return;
    e.__tamkeenDrop = zone; // (a zone around this one leaves it alone)
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "copy"; } catch { /* some browsers refuse it during dragenter */ }
    show(zone);
  };
  const drop = (e) => {
    if (!usable(e)) return;
    e.__tamkeenDrop = zone;
    e.preventDefault();
    hide();
    const r = sortDrop(e.dataTransfer.files, opts);
    if (r.problem === "many") { say(opts.many || "Drop one file at a time here.", { error: true }); return; }
    if (r.problem) { say(opts.wrongKind || "That kind of file can't be added here.", { error: true }); return; }
    if (r.left.length) say(opts.wrongKind || "That kind of file can't be added here.", { error: true });
    try {
      const done = opts.onFiles(r.files);
      if (done && typeof done.catch === "function") done.catch((err) => say(err && err.message ? err.message : String(err), { error: true }));
    } catch (err) {
      say(err && err.message ? err.message : String(err), { error: true });
    }
  };
  el.addEventListener("dragenter", over);
  el.addEventListener("dragover", over);
  el.addEventListener("drop", drop);
  return () => {
    el.removeEventListener("dragenter", over);
    el.removeEventListener("dragover", over);
    el.removeEventListener("drop", drop);
    if (shownFor === zone) hide();
  };
}

let blocking = false;
/**
 * App-wide: a file dragged over a place that takes none shows the "can't drop here" pointer, and a file dropped
 * there does nothing, instead of the window opening the file in place of the app. Places with their own drop
 * (dropZone, the Add words picture drop) handle theirs first. Call once when the app starts.
 */
export function blockStrayDrops(win = typeof window === "undefined" ? null : window) {
  if (!win || blocking) return;
  blocking = true;
  const stray = (e) => {
    if (e.defaultPrevented || e.__tamkeenDrop || !hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "none"; } catch { /* (read-only in some browsers) */ }
  };
  win.addEventListener("dragover", stray);
  win.addEventListener("dragenter", stray);
  win.addEventListener("drop", (e) => {
    if (e.__tamkeenDrop || !hasFiles(e.dataTransfer)) return;
    e.preventDefault(); // (even after another handler: the file must never replace the app)
    hide();
  });
  win.addEventListener("dragend", hide);
}
