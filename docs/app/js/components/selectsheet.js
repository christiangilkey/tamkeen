// Tamkeen's own list for drop-down menus on touch screens, instead of the system's (on Android a plain
// grey box of radio buttons, which the owner didn't want: "Do the same with all the drop down that show
// the default android drop down"). Every <select> in the app keeps working as it is: the page builds
// it, reads its value and listens for "change" as before. Only how it is opened changes:
//   - on a touch screen (or always, with `always`), selects take no taps themselves (html.sel-sheets
//     select { pointer-events: none } in app.css), so the system's list never opens;
//   - a tap on one is caught here (the tap lands on the select's parent, which contains it) and a sheet
//     in the app's own colours slides up from the bottom: the menu's label, then its choices (groups
//     kept, the chosen one ticked, ones that can't be chosen greyed out);
//   - choosing sets the select's value and sends "input" and "change", exactly as the system's list does.
// Escape, a tap outside the sheet, or moving to another screen closes it without changing anything.
// Installed once by each app shell (web/js/app.js, mobile/src/js/app.js).

import { icon } from "../icons.js";

let installed = false;
let open = null; // the sheet on screen: {close}

/** Turn the sheets on. `always`: on every screen, not only touch screens (the phone apps). */
export function installSelectSheets({ always = false } = {}) {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  const apply = () => document.documentElement.classList.toggle("sel-sheets", always || !!(coarse && coarse.matches));
  apply();
  if (coarse && coarse.addEventListener) coarse.addEventListener("change", apply);
  document.addEventListener("click", (e) => {
    if (!document.documentElement.classList.contains("sel-sheets")) return;
    const sel = selectAt(e.clientX, e.clientY, e.target);
    if (!sel) return;
    e.preventDefault();
    e.stopPropagation();
    openSelectSheet(sel);
  }, true);
  // Keyboards still reach a select (it can be focused): Enter or Space opens the sheet too.
  document.addEventListener("keydown", (e) => {
    if (!document.documentElement.classList.contains("sel-sheets")) return;
    const sel = e.target;
    if (!(sel instanceof HTMLSelectElement) || !usable(sel) || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    openSelectSheet(sel);
  }, true);
  window.addEventListener("hashchange", () => { if (open) open.close(); });
}

const usable = (s) => !s.disabled && !s.multiple && !(s.size > 1);

/** The select drawn under (x, y). It takes no taps itself, so the tap lands on an element that contains
 * it; one covered by something else (a popup over the page) is never chosen. */
export function selectAt(x, y, target) {
  if (!(target instanceof Element)) return null;
  for (const s of target.querySelectorAll("select")) {
    if (!usable(s)) continue;
    const r = s.getBoundingClientRect();
    if (r.width && r.height && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s;
  }
  return null;
}

/** What the menu is called: its label, aria-label or title ("" when it has none). */
export function selectTitle(sel) {
  const lab = sel.labels && sel.labels[0];
  const fromLabel = lab ? [...lab.childNodes].filter((n) => n !== sel && !(n instanceof HTMLSelectElement))
    .map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim() : "";
  return sel.getAttribute("aria-label") || fromLabel || sel.title || "";
}

/** The sheet for `sel`. */
export function openSelectSheet(sel) {
  if (open) open.close();
  const back = document.createElement("div");
  back.className = "sel-sheet-back";
  const sheet = document.createElement("div");
  sheet.className = "sel-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  const title = selectTitle(sel);
  if (title) {
    const head = document.createElement("div");
    head.className = "sel-sheet-title";
    head.textContent = title;
    sheet.setAttribute("aria-label", title);
    sheet.append(head);
  }
  const list = document.createElement("div");
  list.className = "sel-sheet-list";
  list.setAttribute("role", "listbox");
  let current = null;
  const add = (opt, parentDisabled) => {
    if (opt.hidden) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-opt";
    b.setAttribute("role", "option");
    const chosen = opt.selected;
    b.setAttribute("aria-selected", String(chosen));
    if (chosen) { b.classList.add("on"); current = b; }
    b.disabled = opt.disabled || parentDisabled;
    const text = document.createElement("span");
    text.className = "sel-opt-text";
    text.dir = "auto";
    text.textContent = opt.textContent;
    const mark = document.createElement("span");
    mark.className = "sel-opt-mark";
    mark.innerHTML = chosen ? icon("check", 18) : "";
    b.append(text, mark);
    b.onclick = () => {
      close();
      if (sel.value === opt.value && opt.selected) return;
      opt.selected = true;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    };
    list.append(b);
  };
  for (const child of sel.children) {
    if (child instanceof HTMLOptGroupElement) {
      if (child.hidden) continue;
      const g = document.createElement("div");
      g.className = "sel-group";
      g.textContent = child.label;
      list.append(g);
      for (const o of child.children) if (o instanceof HTMLOptionElement) add(o, child.disabled);
    } else if (child instanceof HTMLOptionElement) add(child, false);
  }
  sheet.append(list);
  back.append(sheet);
  document.body.append(back);
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  function close() {
    if (!back.isConnected) return;
    document.removeEventListener("keydown", onKey, true);
    back.classList.add("closing");
    setTimeout(() => back.remove(), 160);
    open = null;
    try { sel.focus({ preventScroll: true }); } catch { /* gone meanwhile */ }
  }
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onKey, true);
  open = { close };
  requestAnimationFrame(() => {
    back.classList.add("shown");
    if (current) {
      current.scrollIntoView({ block: "center" });
      current.focus({ preventScroll: true });
    } else {
      const first = list.querySelector(".sel-opt:not(:disabled)");
      if (first) first.focus({ preventScroll: true });
    }
  });
  return { close };
}
