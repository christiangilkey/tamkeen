// Game controllers, USB or Bluetooth, through the browser's Gamepad API: the same code in the
// computer's window, the web app and the phones' app (Android's WebView). padmap.js is the mapping
// (pure); this file reads the controller and does what each button is set to.
//
// What a button does depends on where the learner is. It is asked of layers, the top one first:
//   1. a text box being typed in ("typing"): only leaving it (and the D-pad, which leaves it and moves on);
//   2. a box open over the page ("dialog": a popup, a guide, a menu, a game sheet): its buttons only;
//   3. the word popup ("popup"), while one is open;
//   4. the screen: the newest `controllerArea(...)` a page has claimed (players, reels, review cards,
//      books), else the screen worked out from the address (padscreens.js: Home, Library, Vocab…);
//   5. "general" (Everywhere): back, pressing the highlighted button, moving the highlight, tabs,
//      a page up or down, scrolling.
// A layer that doesn't use a button, or can't do its action just now, leaves it to the next one.
//
// Pages say what they can do: `controllerArea("video" | "review" | "reader", { action: () => … })`
// returns a function that takes it back. An action can also be { run, can, hint }: `can()` false
// leaves the button to the next layer, `hint()` names it in the on-screen guide (null: not shown).
//
// The controller is only looked at (requestAnimationFrame) while one is connected. Browsers tell a
// page about a controller once one of its buttons has been pressed.

import { api, hideMenu, saveSettings, showMenu } from "./app.js";
import {
  ACTIONS, actionFor, actionOf, cleanSetting, firstPressed, fullMap, inputName, nearest, newPressState, padKind,
  heldNow, isController, newTrust, pairName, pressesFrom, readInputs, settle, shortOf, standardize, STICK_AS_DPAD, trustNow,
} from "./padmap.js";
import { screenLayer } from "./padscreens.js";
import { icon } from "./icons.js";
import { openSelectSheet } from "./components/selectsheet.js";

const SCROLL_SPEED = 1400;  // pixels a second, a stick pushed all the way
const CAPTURE_MS = 8000;
const LEGEND_MS = 350;      // how often the button guide is brought up to date while shown

let started = false;
let setting = { at: 0, map: {} };
let full = fullMap(setting);
let raf = 0;
let lastFrame = 0;
const press = new Map();      // pad index -> press state (padmap.pressesFrom)
const held = new Map();       // pad index -> Set of inputs down now, with strengths
const areas = [];             // [{ area, handlers }], newest last
const pageEntries = new WeakSet();  // the entries pages claimed (taken back when the page closes)
const holding = new Map();    // input -> what it will do when let go (an action marked `hold`)
const padListeners = new Set();
const inputListeners = new Set();
let capture = null;           // { resolve, start: {index: snapshot}, until }
let highlighted = null;
let parked = null;            // where the highlight was when a box opened over it
let lastUsed = -1;            // the index of the controller pressed last (its buttons' names are shown)
let inUse = false;            // the controller was the last thing used (the button guide shows)
let lastInput = 0;

const hasApi = () => typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";

/** The controllers connected now: [{ index, id, kind, standard }]. */
export function connectedPads() {
  return rawPads().map((p) => ({ index: p.index, id: p.id || "", kind: padKind(p.id), standard: p.mapping === "standard" }));
}

/** The kind of controller to name buttons after: the one connected, else the one seen last. */
export function padStyle() {
  const pads = connectedPads();
  // the one pressed last, when there are several (a second, virtual one sitting there names nothing)
  const used = pads.find((p) => p.index === lastUsed) || pads[0];
  if (used) return { kind: used.kind, standard: used.standard };
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
  drawLegend();
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
  pageEntries.add(entry);
  return () => {
    const i = areas.indexOf(entry);
    if (i >= 0) areas.splice(i, 1);
    for (const [input, h] of holding) if (h.layer === entry) holding.delete(input);
  };
}

/** Is the controller the last thing the learner used (not the mouse, a finger or the keys)? */
export const padInUse = () => inUse && rawPads().length > 0;

/** Is the button for `action` being held down now (pressed, not yet let go)? The players ask, to take in more words. */
export function actionHeld(action) {
  for (const h of holding.values()) if (h.action === action) return true;
  return false;
}

/**
 * Where the controller points something that moves freely (a creature in a live battle): {x, y}, each
 * −1..1 (right and down are +). The left stick counts as far as it is pushed (past its dead zone); the
 * buttons of the battle's four walk actions (the D-pad, unless changed in Settings) count in full.
 * Nothing while another window is in front, and nothing held since the controller appeared (as for presses).
 */
export function padSteer() {
  let x = 0;
  let y = 0;
  if (typeof document === "undefined" || document.hidden || !windowInFront() || capture) return { x, y };
  const walk = full.battle || {};
  for (const p of rawPads()) {
    const h = held.get(p.index);
    const st = press.get(p.index);
    if (!h || !st) continue;
    const stuck = st.stuck || new Set();
    const amount = (input) => {
      if (!input || stuck.has(input)) return 0;
      if (input.startsWith("a")) return h.strength[input] || 0;
      return h.down.has(input) ? 1 : 0;
    };
    x += amount("a0+") - amount("a0-") + amount(walk.walkRight) - amount(walk.walkLeft);
    y += amount("a1+") - amount("a1-") + amount(walk.walkDown) - amount(walk.walkUp);
  }
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

/** The on-screen button guide: on (the default) or off, on this device. */
export function legendOn() {
  try { return localStorage.getItem("padLegend") !== "off"; } catch { return true; }
}
export function setLegendOn(on) {
  try { localStorage.setItem("padLegend", on ? "on" : "off"); } catch { /* private window */ }
  if (!on) peek = false;
  drawLegend();
  // (Settings → Controller's tick box follows the controller button in the corner)
  try { window.dispatchEvent(new CustomEvent("padlegend")); } catch { /* not in a page */ }
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

/**
 * The game controllers connected now, each in the standard layout where it can be (padmap.js
 * standardize: an Xbox controller over Bluetooth the browser doesn't know). Only real controllers
 * count (the owner: "only count things connecting that are actually controllers"): a device that only
 * says it is one (speakers' volume knob) is never listed, never counts as "in use", never names the
 * buttons and never acts; one of unknown layout counts once one of its buttons is really pressed
 * (padmap.js isController, trustNow). On such a one an axis that rests far from the middle (a trigger
 * at −1) counts from where it rests.
 */
function rawPads() {
  if (!hasApi()) return [];
  let list = [];
  try { list = Array.from(navigator.getGamepads() || []); } catch { return []; }
  const out = [];
  for (const raw of list) {
    if (!raw || raw.connected === false || !isController(raw)) continue;
    const pad = standardize(raw);
    if (!trust.has(pad.index)) trust.set(pad.index, newTrust(pad));
    if (!trustNow(trust.get(pad.index), pad)) continue;
    if (pad.mapping === "standard") { out.push(pad); continue; }
    const axes = Array.from(pad.axes || [], Number);
    if (!rests.has(pad.index)) rests.set(pad.index, axes.slice());
    const rest = rests.get(pad.index);
    out.push({ id: pad.id, index: pad.index, mapping: pad.mapping, buttons: pad.buttons,
      axes: axes.map((v, i) => (Math.abs(rest[i] || 0) > 0.5 ? (v - rest[i]) * Math.sign(-rest[i]) / 2 : v)) });
  }
  return out;
}
const rests = new Map();  // pad index -> its axes as they rested when it was first seen (an unknown layout)

/** Is anything connected that is, or could turn out to be, a game controller (not a speaker's knob)? */
function mayBePads() {
  if (!hasApi()) return false;
  try { return Array.from(navigator.getGamepads() || []).some((p) => p && p.connected !== false && isController(p)); } catch { return false; }
}
const trust = new Map();  // pad index -> padmap.js newTrust: does it count as a controller yet?

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
  // nothing connected (or only devices that aren't controllers): stop looking; a controller of unknown
  // layout not yet used is still looked at, so its first real press can make it count
  if (!pads.length && !capture && !mayBePads()) { lastFrame = 0; holding.clear(); setInUse(false); drawLegend(); return; }
  if (capture && now > capture.until) capture.resolve("");
  for (const p of pads) {
    const state = press.get(p.index) || newPressState();
    if (!press.has(p.index)) {  // just connected: what is already down is at rest until it is let go (padmap.js settle)
      settle(state, readInputs(p).down);
      press.set(p.index, state);
    }
    const { down, strength } = readInputs(p, state.down);
    held.set(p.index, { down, strength });
    if (capture) {
      const got = firstPressed(p, capture.start[p.index] || null);
      pressesFrom(state, down, now);  // kept up to date, so the button pressed now doesn't act when the wait ends
      holding.clear();
      if (got) { rememberKind(p); capture.resolve(got); }
      continue;
    }
    // (another window in front, such as the Netflix window with its own controller script, or a game:
    // the presses are its, not this page's)
    if (document.hidden || !windowInFront()) { pressesFrom(state, down, now); holding.clear(); continue; }
    const released = [...state.down].filter((id) => !down.has(id));
    const fired = pressesFrom(state, down, now, (id) => repeats(id));
    for (const id of released) letGo(id);
    if (fired.length && lastUsed !== p.index) { lastUsed = p.index; rememberKind(p); }
    for (const id of fired) {
      for (const fn of inputListeners) { try { fn(id, p); } catch (e) { console.error(e); } }
      act(id);
    }
    scrollHeld(heldNow(state, down), strength, dt);  // (never what has been held since it appeared)
  }
  if (now - legendAt > LEGEND_MS) drawLegend();  // (the controller button is there while one is connected, in use or not)
  loop();
}

/** Is this page's window the one in front (it, or a frame in it, has the focus)? */
function windowInFront() {
  try { return typeof document.hasFocus !== "function" || document.hasFocus(); } catch { return true; }
}

function rememberKind(p) {
  try { localStorage.setItem("padKind", padKind(p.id)); } catch { /* private window */ }
}

// ------------------------------------------------------------------- deciding what an input does

/** The newest page area still claimed. */
const topArea = () => areas[areas.length - 1] || null;

const bubbleEl = () => {
  for (const el of document.querySelectorAll(".word-bubble")) if (!el.hidden && el.getClientRects().length) return el;
  return null;
};

/** The layers an input is asked of now, the top one first (see the top of this file). */
function layers() {
  if (typing()) return [{ area: "typing", handlers: TYPING }, { area: "general", handlers: WHILE_TYPING }];
  const box = overlay();
  if (box) return [{ area: "dialog", handlers: DIALOG }, { area: "general", handlers: GENERAL }];
  const out = [];
  if (bubbleEl()) out.push({ area: "popup", handlers: POPUP });
  const top = topArea();
  const screen = top || screenLayer(SCREEN_TOOLS);
  if (screen) out.push(screen);
  out.push({ area: "general", handlers: GENERAL });
  return out;
}

function handlerOf(layer, id) {
  const h = layer.handlers && layer.handlers[id];
  if (!h) return null;
  if (typeof h === "function") return { run: h, can: null, hint: null };
  return typeof h.run === "function" ? { run: h.run, can: h.can || null, hint: h.hint || null } : null;
}

const safely = (fn, fallback) => { try { return fn(); } catch (e) { console.error(e); return fallback; } };

/** { layer, area, action, run, hint } for an input now, or null. */
function resolve(input, list = layers()) {
  for (const layer of list) {
    const id = actionFor(full, layer.area, input);
    if (!id) continue;
    const h = handlerOf(layer, id);
    if (!h) continue;
    if (h.can && !safely(h.can, false)) continue;
    return { layer, area: layer.area, action: id, run: h.run, hint: h.hint };
  }
  // As on Xbox, the left stick moves the highlight like the D-pad wherever nothing has it.
  if (STICK_AS_DPAD[input]) return resolve(STICK_AS_DPAD[input], list);
  return null;
}

function repeats(input) {
  const r = resolve(input);
  const a = r && actionOf(r.area, r.action);
  return !!(a && a.repeat);
}

function act(input) {
  setInUse(true);
  // a box opened (or closed) since: a ring left on what is now behind it goes
  // (where it was is kept: a button drawn again carries the highlight on from there, see nearSpot)
  if (highlighted && (!highlighted.isConnected || !padRoot().contains(highlighted))) {
    if (highlighted.isConnected && overlay()) parked = highlighted;  // behind a box: back on it when the box goes
    highlighted.classList.remove("pad-focus", "pad-focus-in");
    highlighted = null;
  }
  // a box closed: the highlight is back where it was before it opened (as on Xbox)
  if (!highlighted && parked && !overlay()) {
    if (parked.isConnected && visible(parked)) highlight(parked);
    parked = null;
  }
  const r = resolve(input);
  if (r) {
    const a = actionOf(r.area, r.action);
    if (a && a.hold) holding.set(input, r);       // it happens when the button is let go
    else if (!(a && a.scroll)) safely(() => r.run(), null);  // (scrolling happens while held: scrollHeld)
  }
  drawLegend();
}

function letGo(input) {
  const h = holding.get(input);
  if (!h) return;
  holding.delete(input);
  if (pageEntries.has(h.layer) && !areas.includes(h.layer)) return;  // its page has closed since
  safely(() => h.run(), null);
  drawLegend();
}

function typing() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return !el.readOnly;
  if (el.tagName !== "INPUT") return false;
  return !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(el.type || "text") && !el.readOnly;
}

const isTextBox = (el) => !!el && (el.isContentEditable || el.tagName === "TEXTAREA"
  || (el.tagName === "INPUT" && !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(el.type || "text")));

// ------------------------------------------------------------------- boxes over the page

// The boxes the app opens over a page, by name, and any other element that says it is one (a
// dialog role: the dictionary offer, the reviewer's "delete this word?"). The reviewer itself and
// the word popup are dialogs too, but each has a layer of its own.
const BOXES = [".fix-back", ".tour", ".modal-back", "#ctxmenu:not([hidden])", ".sel-sheet-back", "dialog[open]",
  ".game-sheet-wrap", ".battle-wrap", ".goal-pop:not([hidden])", "#def-model-menu:not([hidden])", ".lex-offer-back",
  '[role="dialog"]:not(.rv):not(.word-bubble)', '[role="alertdialog"]', '[aria-modal="true"]:not(.rv)'].join(", ");

/** The box open over the page, if any (the one on top): the controller moves inside it only. */
function overlay() {
  const all = Array.from(document.querySelectorAll(BOXES)).filter((el) => el.getClientRects().length);
  if (!all.length) return null;
  // the one drawn last is on top (a guide opened from a popup; a box inside another comes after it)
  return all[all.length - 1];
}

function escape() {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
}

/** Close the box on top: as Esc would; one that doesn't listen for Esc, by its own close button. */
function closeBox(box) {
  if (box instanceof HTMLDialogElement) { box.close(); return; }
  // a menu (a word's, View's, Menu's) is put away as such: an Esc would reach the page under it too (and close the reviewer)
  if (box.id === "ctxmenu") { hideMenu(); return; }
  escape();
  setTimeout(() => {
    if (!box.isConnected || overlay() !== box) return;
    const x = box.querySelector('[data-close], [data-cancel], [data-act="later"], [data-act="cancel"], .tour-skip, .fix-no, #b-quit, #b-done');
    if (x && visible(x, true)) { x.click(); return; }  // (also when scrolled out of sight in a tall box)
    if (box.matches(".goal-pop, #def-model-menu")) { box.hidden = true; return; }  // small popovers: just put away
    // else a tap beside it, on the dimmed page behind (the way most of them close)
    const back = box.closest(".lex-offer-back, .modal-back, .sel-sheet-back, .game-sheet-wrap") || box.parentElement;
    if (back && back !== document.body) back.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, 0);
}

/** The box's main button: the one styled as the main choice, else its Next / OK. */
function mainButton(box) {
  const pick = box.querySelectorAll("button.primary, button.danger-solid, a.btn.primary, .fix-go, .tour-next, #b-again, button[type=submit]");
  for (const el of pick) if (visible(el) && !el.disabled) return el;
  return null;
}

const DIALOG = {
  confirm: { can: () => !!overlay() && !!mainButton(overlay()), run: () => mainButton(overlay()).click() },
};

// ------------------------------------------------------------------- typing

function pressEnter(el) {
  if (!el) return;
  const opts = { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true };
  const go = el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
  if (go && el.tagName === "INPUT" && el.form) {
    const submit = el.form.querySelector("button[type=submit], input[type=submit], button:not([type])");
    if (el.form.requestSubmit) el.form.requestSubmit(submit || undefined); else if (submit) submit.click();
  }
}

/** Leave the text box: the highlight stays on it, so the learner sees where they are. */
function leaveBox() {
  const el = document.activeElement;
  if (!el || el === document.body) return;
  el.blur();
  // A window without the keyboard's focus (behind another one) sends no "blur": the page is told anyway,
  // so a box that saves and closes when it loses the cursor (a card's text) does so.
  if (!document.hasFocus()) {
    el.dispatchEvent(new FocusEvent("blur"));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }
  if (el.isConnected && visible(el)) highlight(el, { focus: false });
}

const TYPING = {
  leave: leaveBox,
  enter: { can: () => document.activeElement && document.activeElement.tagName !== "TEXTAREA", run: () => pressEnter(document.activeElement) },
};
// The D-pad, while typing: leave the box, and move on from it.
const leaveAnd = (dir) => () => { leaveBox(); move(dir); };
const WHILE_TYPING = { up: leaveAnd("up"), down: leaveAnd("down"), left: leaveAnd("left"), right: leaveAnd("right") };

// ------------------------------------------------------------------- the word popup (components/wordbubble.js)

const inBubble = (sel) => {
  const b = bubbleEl();
  if (!b) return null;
  for (const el of b.querySelectorAll(sel)) if (visible(el, true) && !el.disabled) return el;  // (it has two ✕, one shown at a time)
  return null;
};
const bubbleButton = (sel) => ({ can: () => !!inBubble(sel), run: () => inBubble(sel).click() });
/** The page under the popup moves to the next word and looks it up (players, reels, books). */
const popupStep = (dir) => ({
  can: () => { const top = topArea(); return !!(top && typeof top.handlers.popupStep === "function"); },
  run: () => topArea().handlers.popupStep(dir),
});

/** The D-pad in the word popup: between its buttons, the highlight first going to Save (its main one, as on Xbox). */
function popupMove(dir) {
  const b = bubbleEl();
  if (!b) return;
  if (!(highlighted && b.contains(highlighted) && highlighted.isConnected)) {
    const first = inBubble('[data-act="save"]') || candidates(b, { offscreen: true })[0];
    if (first) highlight(first);
    return;
  }
  if (!highlightMove(dir, { root: b })) highlightMove(dir, { root: b, linear: true });
}
function popupScroll(dir) {
  const b = bubbleEl();
  const body = b && (b.querySelector(".wb-body") || b);
  if (body) body.scrollBy({ top: dir * 0.6 * (body.clientHeight || 200), behavior: "smooth" });
}

const POPUP = {
  press: {
    run: () => {
      const b = bubbleEl();
      if (highlighted && b && b.contains(highlighted) && visible(highlighted)) { pressHighlighted(); return; }
      const save = inBubble('[data-act="save"]');
      if (save) save.click();
    },
    hint: () => {
      const b = bubbleEl();
      if (highlighted && b && b.contains(highlighted)) return "Press";
      return inBubble('[data-act="save"]') ? "Save" : null;
    },
  },
  close: bubbleButton('[data-act="close"]'),
  playWord: bubbleButton('[data-act="word"]'),
  playSentence: bubbleButton('[data-act="sentence"]'),
  up: () => popupMove("up"), down: () => popupMove("down"), left: () => popupMove("left"), right: () => popupMove("right"),
  wordLeft: popupStep("left"),
  wordRight: popupStep("right"),
  scrollUp: () => popupScroll(-1),
  scrollDown: () => popupScroll(1),
  save: bubbleButton('[data-act="save"]'),
  source: bubbleButton('[data-act="source"]'),
};

// ------------------------------------------------------------------- the highlight ("general": moving around)

const FOCUSABLE = ['a[href]', "button", "input", "select", "textarea", "summary", '[tabindex]:not([tabindex="-1"])',
  '[role="button"]', '[role="switch"]', '[role="tab"]', '[role="radio"]', '[role="checkbox"]', '[role="option"]',
  '[role="menuitem"]', '[role="menuitemradio"]', "[data-say]"].join(", ");
// Shown only on hover or when it has the focus (a chat message's Unsend): the highlight gives it the focus.
const SHOWN_ON_FOCUS = ".msg-del";

/** A strip that scrolls sideways (the Library's kinds on a phone, chips): what is off to the side can still be reached. */
function inSideStrip(el) {
  for (let p = el.parentElement, k = 0; p && k < 5; p = p.parentElement, k++) {
    const st = getComputedStyle(p);
    if (/(auto|scroll)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 2) return true;
  }
  return false;
}

function visible(el, offscreen = false) {
  if (el.disabled || el.closest("[hidden], [inert]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (!offscreen) {
    if (r.bottom < 0 || r.top > innerHeight) return false;
    if ((r.right < 0 || r.left > innerWidth) && !inSideStrip(el)) return false;
  }
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && (Number(st.opacity) > 0.05 || el.matches(SHOWN_ON_FOCUS));
}

/** Where the highlight can go now: the box on top, else the review cards, else the page. */
const padRoot = () => overlay() || document.querySelector(".rv") || document;

/** A radio or tick box drawn as its label (Settings → Theme, the transcription choices): the label is what is pressed. */
function hiddenChoice(label) {
  const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
  return !!input && !input.disabled && !visible(input, true);
}

function candidates(root = padRoot(), { include = "", offscreen = false } = {}) {
  const sel = [FOCUSABLE, include, "label"].filter(Boolean).join(", ");  // (a selector: labels are looked at below)
  const out = [];
  for (const el of root.querySelectorAll(sel)) {
    if (el.closest(".pad-skip")) continue;
    if (el.tagName === "LABEL" && !(include && el.matches(include))) {
      if (!hiddenChoice(el)) continue;
    } else if (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox") && el.closest("label") && !visible(el, true)) continue;
    if (!visible(el, offscreen)) continue;
    out.push(el);
  }
  return out;
}

// Where the highlight last was ({ x, y } on screen, and the page and box it was on), so when its
// button is drawn again (a lesson's question answered, a list redrawn) it carries on from there.
let lastSpot = null;

function unhighlight() {
  if (highlighted) highlighted.classList.remove("pad-focus", "pad-focus-in");
  highlighted = null;
  lastSpot = null;
  parked = null;
}

function highlight(el, { focus = true } = {}) {
  if (highlighted && highlighted !== el) highlighted.classList.remove("pad-focus", "pad-focus-in");
  highlighted = el;
  if (!el) return;
  el.classList.add("pad-focus");
  spotOf(el);
  // A text box is only ringed: the cursor goes in when A is pressed (a phone's keyboard would pop up,
  // and the controller would be typing, not moving).
  if (focus && !isTextBox(el)) { try { el.focus({ preventScroll: true }); } catch { /* not focusable after all */ } }
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  el.classList.toggle("pad-focus-in", ringClipped(el));
  spotOf(el);
}

const RING = 6;  // how far the ring reaches outside a button (app.css .pad-focus: 3px apart, 3px wide; its glow 6px)

/** Would something around it cut off the ring drawn outside it (a strip of tabs that scrolls sideways)? Then it goes inside. */
function ringClipped(el) {
  const r = el.getBoundingClientRect();
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const st = getComputedStyle(p);
    if (st.overflowX === "visible" && st.overflowY === "visible") continue;
    const c = p.getBoundingClientRect();
    const cutX = st.overflowX !== "visible" && (r.left - RING < c.left + p.clientLeft || r.right + RING > c.left + p.clientLeft + p.clientWidth);
    const cutY = st.overflowY !== "visible" && (r.top - RING < c.top + p.clientTop || r.bottom + RING > c.top + p.clientTop + p.clientHeight);
    if (cutX || cutY) return true;
  }
  return false;
}

function spotOf(el) {
  const r = el.getBoundingClientRect();
  lastSpot = { x: r.left + r.width / 2, y: r.top + r.height / 2, hash: location.hash, root: padRoot() };
}

/** The one nearest to where the highlight was, when its button has gone (drawn again) on the same page. */
function nearSpot(list) {
  if (!lastSpot || lastSpot.hash !== location.hash || lastSpot.root !== padRoot()) return null;
  let best = null;
  let far = Infinity;
  for (const el of list) {
    const r = el.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - lastSpot.x, (r.top + r.height / 2 - lastSpot.y) * 1.5);
    if (d < far) { far = d; best = el; }
  }
  return far < 400 ? best : null;
}

/** A slider or a number box under the highlight: left / right change it, as the arrow keys would. */
function stepValue(el, dir) {
  // (something that takes left / right itself, marked data-pad-step: the Mnemonic maker's part picker,
  // review/partbar.js, moves an end of its highlight; it is sent the arrow key)
  if (el && el.dataset && el.dataset.padStep !== undefined && (dir === "left" || dir === "right")) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: dir === "left" ? "ArrowLeft" : "ArrowRight", bubbles: true, cancelable: true }));
    return true;
  }
  if (!el || el.tagName !== "INPUT" || !/^(range|number)$/.test(el.type)) return false;
  if (dir !== "left" && dir !== "right") return false;
  const rtl = getComputedStyle(el).direction === "rtl" && el.type === "range";
  const up = (dir === "right") !== rtl;
  const before = el.value;
  try { if (up) el.stepUp(); else el.stepDown(); } catch { return true; }
  if (el.value !== before) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

/**
 * Move the highlight. `root`: only inside it; `linear`: up / down go to the one before / after in
 * the page's order (a card's boxes, a popup's buttons) rather than the nearest on screen; `include`:
 * more things that can be highlighted there (a card's texts).
 */
export function highlightMove(dir, { root = null, linear = false, include = "" } = {}) {
  if (!linear && highlighted && highlighted.isConnected && stepValue(highlighted, dir)) return true;
  const roots = Array.isArray(root) ? root.filter(Boolean) : [root || padRoot()];
  const list = roots.flatMap((r) => candidates(r, { include, offscreen: linear }));
  if (!list.length) { if (!root) scrollBy(dir === "up" ? -0.6 : dir === "down" ? 0.6 : 0); return false; }
  const cur = highlighted && highlighted.isConnected && list.includes(highlighted) ? highlighted : null;
  // Still there but no longer pressable (a lesson's answer, disabled once chosen): move on from it.
  const stale = !cur && highlighted && highlighted.isConnected && highlighted.getClientRects().length && !linear ? highlighted : null;
  if (!cur && !stale) {
    const focused = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
    const firstOnScreen = list.find((el) => visible(el)) || list[0];
    const gone = nearSpot(list);  // its button drawn again: carry on from where it was
    highlight(focused || gone || (linear && dir === "up" ? list[list.length - 1] : firstOnScreen));
    return true;
  }
  if (linear) {
    const i = list.indexOf(cur) + (dir === "up" || dir === "left" ? -1 : 1);
    if (i < 0 || i >= list.length) return false;
    highlight(list[i]);
    return true;
  }
  const from = cur || stale;
  const rect = from.getBoundingClientRect();
  const others = list.filter((el) => el !== from).map((el) => ({ el, rect: el.getBoundingClientRect() }));
  if (dir === "up" || dir === "down") {
    // Up and down stay in the part of the screen that scrolls (a lesson, a list) while it has more
    // that way: it scrolls on, rather than the highlight jumping across to a side list.
    const area = scrollArea(from);
    if (area) {
      const inside = nearest(rect, others.filter((o) => area.contains(o.el)), dir);
      if (inside) { highlight(inside.el); return true; }
      if (canScroll(area, dir)) { area.scrollBy({ top: (dir === "up" ? -0.6 : 0.6) * area.clientHeight, behavior: "smooth" }); return false; }
    }
  }
  const next = nearest(rect, others, dir);
  if (next) { highlight(next.el); return true; }
  if (dir === "up" || dir === "down") scrollBy(dir === "up" ? -0.6 : 0.6);  // nothing more on screen that way: show more
  return false;
}

/** The nearest part of the page around `el` that scrolls up and down by itself (not the whole page). */
function scrollArea(el) {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
  }
  return null;
}
const canScroll = (el, dir) => (dir === "up" ? el.scrollTop > 1 : el.scrollTop + el.clientHeight < el.scrollHeight - 1);
const move = (dir) => highlightMove(dir);

/** The element the highlight is on (still on screen), or null. */
export function highlightedEl() {
  return highlighted && highlighted.isConnected && visible(highlighted, true) ? highlighted : null;
}
export function clearHighlight() { unhighlight(); }
/** Put the highlight on `el` (a page choosing where it starts). */
export function highlightOn(el, opts) { if (el) highlight(el, opts); }

/** Press what the highlight is on: a button is clicked, a text box gets the cursor, a menu opens as a list of buttons. */
export function pressHighlighted() {
  const el = highlightedEl();
  if (!el || !visible(el, true)) { move("down"); return; }
  if (el.tagName === "SELECT") { openSelectSheet(el); return; }
  if (isTextBox(el)) { el.focus(); return; }
  if (el.tagName === "INPUT" && el.type === "range") return;  // left / right change it
  const r = el.getBoundingClientRect();
  const was = { x: r.left + r.width / 2, y: r.top + r.height / 2, hash: location.hash, root: padRoot() };
  el.click();
  // What was pressed went away or moved off (a lesson's word tile into the sentence, a list drawn
  // again): the highlight stays where it was, on what is there now.
  setTimeout(() => {
    if (highlighted !== el || location.hash !== was.hash || padRoot() !== was.root || typing()) return;
    const now = el.isConnected ? el.getBoundingClientRect() : null;
    const off = !now || !now.width || Math.hypot(now.left + now.width / 2 - was.x, now.top + now.height / 2 - was.y) > 40;
    if (!off) return;
    lastSpot = { ...was };
    const next = nearSpot(candidates().filter((c) => c !== el));
    if (next) highlight(next);
  }, 60);
}

/** Close the box open over the page (a popup, a game screen, a menu), else the word popup, if one is open. True if
 *  something was closed. Android's back gesture does this first (mobile/src/js/app.js), so swiping back from a popup
 *  closes it and leaves you on the page under it (the owner: it "should exit it and bring you back to the main page
 *  of that tab"), instead of going to another page, or leaving the app from Home, with the popup still open. */
export function closeTopBox() {
  const box = overlay();
  if (box) { closeBox(box); return true; }
  const bubble = inBubble("[data-act='close']");
  if (bubble) { bubble.click(); return true; }
  return false;
}

function back() {
  const box = overlay();
  if (box) { closeBox(box); return; }
  const top = topArea();
  const screen = top || screenLayer(SCREEN_TOOLS);
  if (screen && typeof screen.handlers.back === "function" && screen.handlers.back()) return;
  const bubble = inBubble("[data-act='close']");
  if (bubble) { bubble.click(); return; }
  const at = location.hash.replace(/^#\/?/, "");
  if (!at || at === "home") return;  // already home: "back" mustn't leave the app
  history.back();
}

function menu() {
  const tabs = Array.from(document.querySelectorAll("[data-nav]")).filter((el) => visible(el));
  if (tabs.length) { highlight(tabs.find((a) => a.classList.contains("active")) || tabs[0]); return; }
  location.hash = "#/";
}

// ----- tabs: LB / RB choose the one before / after

const TABS = ['[role="tablist"]', ".tabs", ".segmented", ".set-seg", ".key-tabs", ".reel-modes", ".feed-list", "#folders", ".goal-chips", ".game-tabs"].join(", ");
const ON = '.active, .on, [aria-selected="true"], [aria-checked="true"], [aria-pressed="true"]';

function tabItems(group) {
  return Array.from(group.querySelectorAll('[role="tab"], button, a[href], label'))
    .filter((el) => el.closest(TABS) === group && !el.disabled && !el.closest("[hidden]") && el.getClientRects().length
      && !(el.tagName === "LABEL" && el.querySelector("button")));
}

function tabGroup() {
  const root = padRoot();
  const groups = Array.from(root.querySelectorAll(TABS)).filter((g) => visible(g, false) && tabItems(g).length > 1);
  if (highlighted) { const g = groups.find((x) => x.contains(highlighted)); if (g) return g; }
  return groups[0] || null;
}

const isOn = (el) => el.matches(ON) || !!el.querySelector("input:checked");

/** Choose the tab `step` away from the one chosen now, in `group` (or the screen's first set of tabs). */
export function switchTab(step, group = tabGroup()) {
  if (!group) return false;
  const items = tabItems(group);
  if (items.length < 2) return false;
  const now = items.findIndex(isOn);
  const next = items[now < 0 ? (step > 0 ? 0 : items.length - 1) : (now + step + items.length) % items.length];
  const ringed = !!highlighted && group.contains(highlighted);
  const id = group.id;
  next.click();
  if (ringed || highlighted) {
    // the page may draw its tabs again: the ring goes to the one chosen
    requestAnimationFrame(() => {
      const g = (id && document.getElementById(id)) || (group.isConnected ? group : null);
      const on = g && tabItems(g).find(isOn);
      if (on) highlight(on); else if (next.isConnected) highlight(next);
    });
  }
  return true;
}

/// ----- a page up or down (the triggers): long lists go by faster

/** In a part that stays put while the page scrolls (a floating + button, a top bar)? */
function pinned(el) {
  for (let p = el; p && p !== document.body; p = p.parentElement) {
    const pos = getComputedStyle(p).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
}

function pageJump(dir) {
  const from = highlightedEl();
  const el = scroller(from && !pinned(from) ? from : null);
  const box = from && !pinned(from) ? from.getBoundingClientRect() : null;
  const x = box ? box.left + box.width / 2 : innerWidth / 2;
  const y = box ? box.top + box.height / 2 : innerHeight / 2;
  const before = el ? el.scrollTop : 0;
  if (el) el.scrollBy({ top: dir * 0.85 * (el.clientHeight || innerHeight), behavior: "auto" });
  const moved = el ? el.scrollTop !== before : false;
  // what scrolled into view, not the parts that stay put (the + button would win every time)
  const list = candidates().filter((c) => !pinned(c) && (!el || el === document.scrollingElement || el.contains(c)));
  if (!list.length) return;
  let best = null;
  let score = Infinity;
  for (const c of list) {
    const r = c.getBoundingClientRect();
    const s = Math.abs(r.top + r.height / 2 - y) + Math.abs(r.left + r.width / 2 - x) * 0.5;
    if (s < score) { score = s; best = c; }
  }
  // the list can't scroll further: its last (first) thing
  if (!moved || best === from) best = dir > 0 ? list[list.length - 1] : list[0];
  if (best) highlight(best);
}

// ----- scrolling (the right stick)

/** The thing that scrolls under `at` (the highlight), or in the middle of the screen. */
function scroller(at = highlighted) {
  const scrolls = (el) => {
    if (!el || el === document.body || el === document.documentElement) return false;
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2;
  };
  const top = overlay();
  if (at && at.isConnected && !top && pinned(at)) at = null;  // a floating button: the page under the middle of the screen scrolls
  let el = (at && at.isConnected && at) || document.elementFromPoint(innerWidth / 2, innerHeight / 2);
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
  const list = layers();
  for (const id of down) {
    const r = resolve(id, list);
    if (!r || r.area !== "general") continue;
    const sign = r.action === "scrollUp" ? -1 : r.action === "scrollDown" ? 1 : 0;
    if (sign) amount += sign * (strength[id] || 1) * SCROLL_SPEED * dt;
  }
  if (amount) { const el = scroller(); if (el) el.scrollTop += amount; }
}

const guideButton = () => Array.from(document.querySelectorAll(".rv-help, .top-help")).find((el) => visible(el)) || null;

// ----- View and Menu

/** A list of choices over the page (app.js's menu, which the D-pad moves through), next to `at` or in the middle. */
export function padMenu(items, at = null, label = "") {
  const list = items.filter(Boolean);
  if (!list.length) return false;
  const r = at && at.isConnected ? at.getBoundingClientRect() : null;
  showMenu(r ? r.left : innerWidth / 2 - 110, r ? r.bottom + 6 : innerHeight / 3, label, list);
  focusMenu();
  return true;
}

/** A menu just opened over the page (padMenu's, a word's): the highlight goes on its first choice, so A picks it straight away. */
export function focusMenu() {
  requestAnimationFrame(() => { const first = document.querySelector("#ctxmenu:not([hidden]) button"); if (first) highlight(first); });
}

/** The name a button goes by in a menu: its words, else its label or title. */
const nameOf = (el) => (el.getAttribute("aria-label") || el.textContent || el.title || "").replace(/\s+/g, " ").trim();

/** Choices made of buttons on the page (a list row's, a toolbar's): picking one presses it. */
export function buttonsMenu(buttons, at = null, label = "") {
  const seen = new Set();
  const items = [];
  for (const b of buttons) {
    if (!b || !visible(b, true) || b.disabled) continue;
    const name = nameOf(b);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    items.push({ label: name, run: () => (b.tagName === "SELECT" ? openSelectSheet(b) : b.click()) });
  }
  return padMenu(items, at, label);
}

// The rows of the app's lists: Menu on one of them offers its buttons.
const ROWS = ".ep, .vocab-item, .item-row, .reel-row, .site-tile, .book-card, li.cw, .msg, .disc-card, .continue-row";
const rowOf = () => { const el = highlightedEl(); return el ? el.closest(ROWS) : null; };
const rowButtons = (row) => Array.from(row.querySelectorAll("button, a[href], [role=\"button\"]"));

/** View on a screen that hasn't options of its own: the screen's guide (its "?"). */
const GENERAL = {
  back, menu,
  options: { can: () => !!guideButton(), run: () => guideButton().click(), hint: () => "Guide" },
  more: {
    can: () => { const row = rowOf(); return !!row && rowButtons(row).some((b) => visible(b, true) && !b.disabled); },
    run: () => { const row = rowOf(); buttonsMenu(rowButtons(row), highlightedEl()); },
  },
  select: pressHighlighted,
  up: () => move("up"), down: () => move("down"), left: () => move("left"), right: () => move("right"),
  prevTab: { can: () => !!tabGroup(), run: () => switchTab(-1) },
  nextTab: { can: () => !!tabGroup(), run: () => switchTab(1) },
  pageUp: () => pageJump(-1), pageDown: () => pageJump(1),
  scrollUp: () => {}, scrollDown: () => {},
  guide: { can: () => !!guideButton(), run: () => guideButton().click() },
};

/** What padscreens.js may use to do its screens' actions. */
const SCREEN_TOOLS = { highlight, highlightMove, highlightedEl, pressHighlighted, switchTab, visible, unhighlight };

// ------------------------------------------------------------------- the button guide on screen

let dockEl = null;     // the corner of the screen with the button guide and the controller button
let legendEl = null;   // the button guide
let guideBtn = null;   // the controller button, which shows and hides the guide
let guideBtnOn = null;
let peek = false;      // shown with that button (by mouse or finger): until the mouse, a finger or the keys are used elsewhere
let legendAt = 0;
let legendHtml = "";
const LEGEND = [["b0"], ["b1"], ["b2"], ["b3"], ["b4", "b5"], ["b6", "b7"], ["b8"], ["b9"]];
const FACE_CLASS = { b0: "a", b1: "b", b2: "x", b3: "y" };
const FOOT_BARS = ".controls, .rv-actions, .book-foot, .reel-controls, .tabbar";
// Full screens that keep a strip at their foot for the guide, so it covers none of them (the reviewer's card and answers)
const ROOMY = ".rv";

function setInUse(on) {
  if (on) lastInput = performance.now();
  if (inUse === on) return;
  inUse = on;
  drawLegend();
}

/** [{ inputs, label }] for the buttons that do something here now. */
function legendItems() {
  const list = layers();
  const out = [];
  const say = (input) => {
    const r = resolve(input, list);
    if (!r) return null;
    const a = actionOf(r.area, r.action);
    if (!a || a.scroll) return null;
    // the D-pad's and the sticks' moving goes without saying, and Everywhere's page up / down
    if (r.area === "general" && ["b6", "b7"].includes(input)) return null;
    if (r.hint) { const h = safely(() => r.hint(), undefined); if (h === null) return null; if (typeof h === "string") return { r, label: h }; }
    return { r, label: shortOf(r.area, r.action) };
  };
  for (const group of LEGEND) {
    const said = group.map(say);
    if (group.length === 2) {
      const both = said[0] && said[1] ? pairName(said[0].r, said[1].r) : "";
      if (both) out.push({ inputs: group, label: both });
      else group.forEach((input, k) => { if (said[k]) out.push({ inputs: [input], label: said[k].label }); });
    } else if (said[0]) out.push({ inputs: group, label: said[0].label });
  }
  return out.slice(0, 8);
}

function buildDock() {
  dockEl = document.createElement("div");
  dockEl.className = "pad-dock pad-skip";  // (the D-pad's highlight never lands on the controller button)
  legendEl = document.createElement("div");
  legendEl.className = "pad-legend";
  legendEl.setAttribute("aria-hidden", "true");
  guideBtn = document.createElement("button");
  guideBtn.type = "button";
  guideBtn.className = "pad-guide-btn";
  guideBtn.innerHTML = icon("game", 20);
  guideBtn.addEventListener("click", toggleGuide);
  dockEl.append(legendEl, guideBtn);
  document.body.append(dockEl);
  legendHtml = "";
  guideBtnOn = null;
}

/** The controller button: the guide on screen goes (and stays off); else it shows (and is on). */
function toggleGuide() {
  if (legendEl && !legendEl.hidden) { peek = false; setLegendOn(false); return; }
  peek = true;
  lastInput = performance.now();
  setLegendOn(true);
}

/** Is this (what was pressed or clicked) the controller button or the guide? */
const inDock = (el) => !!(dockEl && el && dockEl.contains(el));

function drawLegend() {
  legendAt = performance.now();
  if (typeof document === "undefined" || !document.body) return;
  // The controller button is there while a controller is connected; the guide, while one is in use (and it is on).
  if (!rawPads().length || capture) {
    if (dockEl) dockEl.hidden = true;
    peek = false;
    makeRoom(0);
    return;
  }
  if (!dockEl || !dockEl.isConnected) buildDock();
  dockEl.hidden = false;
  const { kind, standard } = padStyle();
  const items = (inUse || peek) && legendOn() ? legendItems() : [];
  const html = items.map(({ inputs, label }) => {
    const keys = inputs.map((i) => {
      const colour = kind === "xbox" && FACE_CLASS[i] ? ` pl-${FACE_CLASS[i]}` : "";  // Xbox's green A, red B…
      return `<b class="pl-key${colour}" translate="no">${escapeHtml(inputName(i, kind, standard))}</b>`;
    }).join("");
    return `<span class="pl-item">${keys}<span class="pl-label">${escapeHtml(label)}</span></span>`;
  }).join("");
  if (html !== legendHtml) { legendHtml = html; legendEl.innerHTML = html; }
  legendEl.hidden = !items.length;
  legendEl.classList.toggle("idle", performance.now() - lastInput > 5000);
  dockEl.classList.toggle("idle", !inUse && !peek);
  const shown = !legendEl.hidden;
  if (shown !== guideBtnOn) {  // (only when it changes: the page's translator puts the words in the learner's language)
    guideBtnOn = shown;
    guideBtn.classList.toggle("on", shown);
    const label = shown ? "Hide the button guide" : "Show the button guide";
    guideBtn.title = label;
    guideBtn.setAttribute("aria-label", label);
  }
  placeDock();
}

function placeDock() {
  const room = [...document.querySelectorAll(ROOMY)].some((el) => el.getClientRects().length);
  // Just above a bar of buttons at the foot of the screen (the player's controls, a book's page buttons,
  // the phone's tabs), never over it; on a screen that keeps a strip for it (the reviewer), in that strip.
  let lift = 0;
  if (!room) {
    for (const bar of document.querySelectorAll(FOOT_BARS)) {
      if (!bar.getClientRects().length) continue;
      const r = bar.getBoundingClientRect();
      if (r.height && r.top > innerHeight / 2 && r.bottom >= innerHeight - 24) lift = Math.max(lift, innerHeight - r.top);
    }
  }
  dockEl.style.bottom = lift ? `${Math.round(lift + 8)}px` : "";
  dockEl.style.top = "";
  const boxes = () => [legendEl, guideBtn].filter((el) => !el.hidden).map((el) => el.getBoundingClientRect());
  // Never over a video's captions or a reel's words: then it goes to the top, under the player's title.
  const at = boxes();
  for (const words of document.querySelectorAll(".captions, .reel-words")) {
    const r = words.getBoundingClientRect();
    if (!r.width || !words.textContent.trim()) continue;
    if (at.some((b) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)) {
      let below = 0;  // under the app's top bar and the player's own one
      for (const head of document.querySelectorAll(".player-head, .reel-bar, .topbar")) {
        if (head.getClientRects().length) below = Math.max(below, head.getBoundingClientRect().bottom);
      }
      dockEl.style.top = `${Math.round(below + 8)}px`;
      dockEl.style.bottom = "auto";
      break;
    }
  }
  makeRoom(room ? Math.ceil(innerHeight - Math.min(...boxes().map((b) => b.top)) + 6) : 0);
}

/** The strip kept at the foot of the reviewer for the guide and the controller button (app.css .pad-room). */
function makeRoom(px) {
  const root = document.documentElement;
  if (!root) return;
  root.classList.toggle("pad-room", px > 0);
  if (px > 0) root.style.setProperty("--pad-room", `${px}px`);
  else root.style.removeProperty("--pad-room");
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ------------------------------------------------------------------- starting

/** Called once by each version's app.js. */
export function startGamepad() {
  if (started || !hasApi()) return;
  started = true;
  reloadControllerSetting();
  const changed = () => { for (const fn of padListeners) { try { fn(connectedPads()); } catch (e) { console.error(e); } } };
  window.addEventListener("gamepadconnected", (e) => {
    // (a device that only says it is a controller doesn't name the buttons; a real one does once it is used)
    const pad = e.gamepad && isController(e.gamepad) ? standardize(e.gamepad) : null;
    if (pad && pad.mapping === "standard") rememberKind(pad);
    reloadControllerSetting();
    changed();
    drawLegend();  // the controller button, at once
    loop();
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad) { press.delete(e.gamepad.index); held.delete(e.gamepad.index); rests.delete(e.gamepad.index); trust.delete(e.gamepad.index); }
    if (!rawPads().length) { holding.clear(); setInUse(false); }  // (only real controllers: a speaker's knob leaving changes nothing)
    changed();
    drawLegend();
  });
  // The highlight and the button guide are for the controller: the mouse, a finger or the keyboard put them away
  // (not when they press the controller button in the corner, which shows and hides the guide).
  const away = (e) => {
    if (!e.isTrusted || inDock(e.target)) return;
    unhighlight();
    const peeked = peek;
    peek = false;
    setInUse(false);
    if (peeked) drawLegend();
  };
  window.addEventListener("pointerdown", away, true);
  window.addEventListener("keydown", away, true);
  window.addEventListener("hashchange", () => { unhighlight(); holding.clear(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { reloadControllerSetting(); if (mayBePads()) loop(); } });
  if (mayBePads()) loop();  // already connected (a page reload)
}

/** For tests and Settings: the areas' actions, with what each input does now. */
export const _internal = {
  resolve, typing, overlay, layers, legendItems, candidates, tabGroup, get full() { return full; }, ACTIONS,
  get highlighted() { return highlighted; },
};
