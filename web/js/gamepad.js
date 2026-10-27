// Game controllers, USB or Bluetooth, through the browser's Gamepad API: the same code in the
// computer's window, the web app and the phones' app (Android's WebView). padmap.js is the mapping
// (pure); this file reads the controller and does what each button is set to.
//
// Pages say what they can do: `controllerArea("video" | "review", { action: () => … })` returns a
// function that takes it back. The newest area wins; an input the area doesn't use (or whose action
// the page can't do) falls through to "general": back, the highlight moved with the D-pad, scrolling.
// While a box is open over the page (a dialog, the fix popup, a guide, a menu) only "general" works,
// so its buttons can be reached. Nothing happens while the learner is typing in a text box, except
// "back", which leaves the box.
//
// The controller is only looked at (requestAnimationFrame) while one is connected. Browsers tell a
// page about a controller once one of its buttons has been pressed.

import { api, saveSettings } from "./app.js";
import {
  ACTIONS, actionFor, actionOf, cleanSetting, firstPressed, fullMap, nearest, newPressState, padKind,
  pressesFrom, readInputs,
} from "./padmap.js";

const SCROLL_SPEED = 1400;  // pixels a second, a stick pushed all the way
const CAPTURE_MS = 8000;

let started = false;
let setting = { at: 0, map: {} };
let full = fullMap(setting);
let raf = 0;
let lastFrame = 0;
const press = new Map();      // pad index -> press state (padmap.pressesFrom)
const held = new Map();       // pad index -> Set of inputs down now, with strengths
const areas = [];             // [{ area, handlers }], newest last
const padListeners = new Set();
const inputListeners = new Set();
let capture = null;           // { resolve, start: {index: snapshot}, until }
let highlighted = null;

const hasApi = () => typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";

/** The controllers connected now: [{ index, id, kind, standard }]. */
export function connectedPads() {
  if (!hasApi()) return [];
  let list = [];
  try { list = Array.from(navigator.getGamepads() || []); } catch { return []; }
  return list.filter((p) => p && p.connected !== false).map((p) => ({
    index: p.index, id: p.id || "", kind: padKind(p.id), standard: p.mapping === "standard",
  }));
}

/** The kind of controller to name buttons after: the one connected, else the one seen last. */
export function padStyle() {
  const pads = connectedPads();
  if (pads.length) return { kind: pads[0].kind, standard: pads[0].standard };
  let kind = "generic";
  try { kind = localStorage.getItem("padKind") || "generic"; } catch { /* private window */ }
  return { kind, standard: true };
}

export function onPads(fn) { padListeners.add(fn); return () => padListeners.delete(fn); }
/** Each input as it is pressed (Settings shows the last one), whatever it does. */
export function onPadInput(fn) { inputListeners.add(fn); return () => inputListeners.delete(fn); }

export function controllerSetting() { return setting; }

/** Use (and keep) a new mapping: Settings calls this after a change. */
export async function saveControllerSetting(next) {
  setting = cleanSetting(next);
  full = fullMap(setting);
  await saveSettings({ controller_map: setting });
}

/** The mapping as stored, read again (at start, when a controller connects, back on screen: another device may have changed it). */
export async function reloadControllerSetting() {
  try {
    const s = await api("/settings");
    if (s && s.controller_map) { setting = cleanSetting(s.controller_map); full = fullMap(setting); }
  } catch { /* the defaults stay */ }
  return setting;
}

/** A page's actions; returns the function that takes them back. */
export function controllerArea(area, handlers) {
  const entry = { area, handlers };
  areas.push(entry);
  return () => { const i = areas.indexOf(entry); if (i >= 0) areas.splice(i, 1); };
}

/**
 * "Press a button to assign": resolves to the next input pressed on any controller (or "" if none
 * within a few seconds, or `cancelCapture()`). Nothing else happens while it waits.
 */
export function captureInput(ms = CAPTURE_MS) {
  if (capture) capture.resolve("");
  return new Promise((resolve) => {
    const start = {};
    for (const p of rawPads()) start[p.index] = snapshot(p);
    capture = { resolve: (v) => { capture = null; resolve(v); }, start, until: performance.now() + ms };
    loop();
  });
}
export function cancelCapture() { if (capture) capture.resolve(""); }

// ------------------------------------------------------------------- reading

function rawPads() {
  if (!hasApi()) return [];
  try { return Array.from(navigator.getGamepads() || []).filter((p) => p && p.connected !== false); } catch { return []; }
}

// Firefox hands back live objects that keep changing; a copy holds still.
const snapshot = (p) => ({
  buttons: Array.from(p.buttons || [], (b) => ({ pressed: !!b.pressed, value: Number(b.value) || 0 })),
  axes: Array.from(p.axes || [], Number),
});

function loop() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;
  const pads = rawPads();
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (!pads.length && !capture) { lastFrame = 0; return; }  // nothing connected: stop looking
  if (capture && now > capture.until) capture.resolve("");
  for (const p of pads) {
    const state = press.get(p.index) || newPressState();
    if (!press.has(p.index)) {  // just connected: what is already down counts as pressed before, not as a press now
      state.down = readInputs(p).down;
      press.set(p.index, state);
    }
    const { down, strength } = readInputs(p, state.down);
    held.set(p.index, { down, strength });
    if (capture) {
      const got = firstPressed(p, capture.start[p.index] || null);
      pressesFrom(state, down, now);  // kept up to date, so the button pressed now doesn't act when the wait ends
      if (got) { rememberKind(p); capture.resolve(got); }
      continue;
    }
    if (document.hidden) { pressesFrom(state, down, now); continue; }
    const fired = pressesFrom(state, down, now, (id) => repeats(id));
    for (const id of fired) {
      for (const fn of inputListeners) { try { fn(id, p); } catch (e) { console.error(e); } }
      act(id);
    }
    scrollHeld(down, strength, dt);
  }
  loop();
}

function rememberKind(p) {
  try { localStorage.setItem("padKind", padKind(p.id)); } catch { /* private window */ }
}

// ------------------------------------------------------------------- deciding what an input does

const topArea = () => (overlay() ? null : areas[areas.length - 1] || null);

/** { area, action, run } for an input now, or null. */
function resolve(input) {
  const top = topArea();
  if (top) {
    const id = actionFor(full, top.area, input);
    if (id && typeof top.handlers[id] === "function") return { area: top.area, action: id, run: top.handlers[id] };
  }
  const g = actionFor(full, "general", input);
  if (g && GENERAL[g]) return { area: "general", action: g, run: GENERAL[g] };
  return null;
}

function repeats(input) {
  const r = resolve(input);
  const a = r && actionOf(r.area, r.action);
  return !!(a && a.repeat);
}

function act(input) {
  // a box opened (or closed) since: a ring left on what is now behind it goes
  if (highlighted && (!highlighted.isConnected || !padRoot().contains(highlighted))) { highlighted.classList.remove("pad-focus"); highlighted = null; }
  if (typing()) {  // the box being typed in keeps every button, except "back", which leaves it
    if (actionFor(full, "general", input) === "back") document.activeElement.blur();
    return;
  }
  const r = resolve(input);
  if (!r) return;
  const a = actionOf(r.area, r.action);
  if (a && a.scroll) return;  // scrolling happens while held (scrollHeld)
  try { r.run(); } catch (e) { console.error(e); }
}

function typing() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return !el.readOnly;
  if (el.tagName !== "INPUT") return false;
  return !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(el.type || "text") && !el.readOnly;
}

// ------------------------------------------------------------------- "general": moving around

/** The box open over the page, if any: the controller moves inside it only. */
function overlay() {
  const pick = [".fix-back", ".tour", ".modal-back", "#ctxmenu:not([hidden])", ".sel-sheet-back"];
  for (const sel of pick) {
    const all = document.querySelectorAll(sel);
    if (all.length) return all[all.length - 1];
  }
  return null;
}

function escape() {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="switch"]';

function visible(el) {
  if (el.disabled || el.closest("[hidden], [inert]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
}

/** Where the highlight can go now: the box on top, else the review cards, else the page. */
const padRoot = () => overlay() || document.querySelector(".rv") || document;

function candidates() {
  const root = padRoot();
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => visible(el) && !el.closest(".pad-skip"));
}

function highlight(el) {
  if (highlighted && highlighted !== el) highlighted.classList.remove("pad-focus");
  highlighted = el;
  if (!el) return;
  el.classList.add("pad-focus");
  try { el.focus({ preventScroll: true }); } catch { /* not focusable after all */ }
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function move(dir) {
  const list = candidates();
  if (!list.length) { scrollBy(dir === "up" ? -0.6 : dir === "down" ? 0.6 : 0); return; }
  const cur = highlighted && highlighted.isConnected && list.includes(highlighted) ? highlighted : null;
  if (!cur) {
    const focused = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
    highlight(focused || list[0]);
    return;
  }
  const next = nearest(cur.getBoundingClientRect(), list.filter((el) => el !== cur).map((el) => ({ el, rect: el.getBoundingClientRect() })), dir);
  if (next) highlight(next.el);
  else if (dir === "up" || dir === "down") scrollBy(dir === "up" ? -0.6 : 0.6);  // nothing more on screen that way: show more
}

function select() {
  const el = highlighted && highlighted.isConnected && visible(highlighted) ? highlighted : null;
  if (!el) { move("down"); return; }
  if (el.tagName === "SELECT") {
    try { el.focus(); if (el.showPicker) { el.showPicker(); return; } } catch { /* falls back to a click */ }
  }
  if (el.tagName === "INPUT" && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/i.test(el.type || "text")) { el.focus(); return; }
  el.click();
}

function back() {
  if (overlay()) { escape(); return; }
  const top = areas[areas.length - 1];
  if (top && typeof top.handlers.back === "function" && top.handlers.back()) return;
  const bubble = document.querySelector(".word-bubble:not([hidden]) [data-act='close']");
  if (bubble) { bubble.click(); return; }
  const at = location.hash.replace(/^#\/?/, "");
  if (!at || at === "home") return;  // already home: "back" mustn't leave the app
  history.back();
}

function menu() {
  const tabs = Array.from(document.querySelectorAll("[data-nav]")).filter(visible);
  if (tabs.length) { highlight(tabs.find((a) => a.classList.contains("active")) || tabs[0]); return; }
  location.hash = "#/";
}

/** The thing that scrolls under the highlight, or in the middle of the screen. */
function scroller() {
  const scrolls = (el) => {
    if (!el || el === document.body || el === document.documentElement) return false;
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2;
  };
  const top = overlay();
  let el = (highlighted && highlighted.isConnected && highlighted) || document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  while (el && !scrolls(el)) el = el.parentElement;
  if (el && (!top || top.contains(el))) return el;
  return top ? null : document.scrollingElement || document.documentElement;
}

function scrollBy(screens) {
  const el = scroller();
  if (el && screens) el.scrollBy({ top: screens * (el.clientHeight || innerHeight), behavior: "smooth" });
}

function scrollHeld(down, strength, dt) {
  if (!dt || typing()) return;
  let amount = 0;
  for (const id of down) {
    const r = resolve(id);
    if (!r || r.area !== "general") continue;
    const sign = r.action === "scrollUp" ? -1 : r.action === "scrollDown" ? 1 : 0;
    if (sign) amount += sign * (strength[id] || 1) * SCROLL_SPEED * dt;
  }
  if (amount) { const el = scroller(); if (el) el.scrollTop += amount; }
}

const GENERAL = {
  back, select, menu,
  up: () => move("up"), down: () => move("down"), left: () => move("left"), right: () => move("right"),
  scrollUp: () => {}, scrollDown: () => {},
};

// ------------------------------------------------------------------- starting

/** Called once by each version's app.js. */
export function startGamepad() {
  if (started || !hasApi()) return;
  started = true;
  reloadControllerSetting();
  const changed = () => { for (const fn of padListeners) { try { fn(connectedPads()); } catch (e) { console.error(e); } } };
  window.addEventListener("gamepadconnected", (e) => {
    if (e.gamepad) rememberKind(e.gamepad);
    reloadControllerSetting();
    changed();
    loop();
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad) { press.delete(e.gamepad.index); held.delete(e.gamepad.index); }
    changed();
  });
  // The highlight is for the controller: the mouse, a finger or the keyboard put it away.
  const away = () => { if (highlighted) { highlighted.classList.remove("pad-focus"); highlighted = null; } };
  window.addEventListener("pointerdown", away, true);
  window.addEventListener("keydown", (e) => { if (e.isTrusted) away(); }, true);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { reloadControllerSetting(); if (rawPads().length) loop(); } });
  if (rawPads().length) loop();  // already connected (a page reload)
}

/** For tests and Settings: the areas' actions, with what each input does now. */
export const _internal = { resolve, typing, overlay, get full() { return full; }, ACTIONS };
