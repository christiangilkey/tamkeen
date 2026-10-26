// The popup for a problem the learner can put right: centred over the dimmed page, a line icon, a
// short title, one sentence saying what is wrong and how to fix it, a teal button that goes straight
// to the fix (Settings at the exact setting, or the system's permission page) and "Dismiss". It
// replaces the red message at the bottom of the screen for every such cause (web/js/fixes.js says
// which ones and where they are fixed); each shell's toast() sends those here, so none can stack.
//
//   - One at a time: while a cause's popup is open, the same cause opens nothing more; another cause
//     waits for it. After Dismiss (Esc, or a tap beside it) the same cause stays quiet for a few
//     minutes (fixes.js QUIET_MS).
//   - It never answers or turns a review card: it takes every key while it is on top (Esc closes it,
//     Tab stays inside it, Enter and Space press its own buttons) and covers the page.
//   - A permission: when it can still be asked for, the button asks again; when only the system can
//     switch it back on, it opens the system's settings for Tamkeen (Android: App info; iPhone:
//     Tamkeen's page in Settings; Windows/macOS: the microphone privacy page). A web page can't open
//     its browser's settings, so there it says where they are and the button asks again.
// Shared by every version. The shells provide `systemAccess` (how a permission stands, and opening the
// system's settings); without it (or a part of it) the browser's own ways are used.

import * as shell from "../app.js";
import { h } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { openModal } from "./modal.js";
import { causeOf, fixFor, fixGate, goesToSettings, isCause } from "../fixes.js";

const gate = fixGate();

const access = () => shell.systemAccess || {};

/** Which kind of device this is: "android", "ios", "desktop" (the computer's own window) or "web". */
function device() {
  try { const d = access().device && access().device(); if (d) return d; } catch { /* the browser's ways */ }
  return "web";
}
function computerOs() {
  const p = `${(typeof navigator !== "undefined" && (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)) || ""}`;
  return /Mac/i.test(p) ? "mac" : /Win/i.test(p) ? "windows" : "linux";
}

/** How permission `name` stands now: "granted", "prompt", "denied" or "" (can't be told). */
async function permissionState(name) {
  const own = access().state;
  if (own) { try { const s = await own(name); if (s) return s; } catch { /* the browser's way */ } }
  try {
    const r = await navigator.permissions.query({ name });
    return r && r.state ? r.state : "";
  } catch { return ""; } // (Firefox and older browsers can't be asked about the microphone)
}

/** Ask for the microphone again (the system or the browser shows its question when it still may).
 * Resolves true once it is allowed; the sound is switched straight off again. */
async function askMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop());
    return true;
  } catch { return false; }
}

/** Open the system's settings for Tamkeen (or, on the computer, its microphone privacy page). */
async function openSystemSettings(name) {
  const open = access().openSettings;
  if (!open) return false;
  try { return !!(await open(name)); } catch { return false; }
}

/**
 * Show the popup for `what`: a cause (fixes.js CAUSES), an error or a message. Returns true when it is
 * a problem the learner can fix (the popup is on screen, waiting its turn, or quiet after Dismiss: say
 * nothing else about it), false when it isn't (show the message as before). `opts`: `run` (the
 * button's own action instead of a page, e.g. signing in), `goTo(href)` (going to a page from inside
 * another box, which closes that box first), `message` (the words, when `what` is a cause).
 */
export function offerFix(what, opts = {}) {
  if (typeof document === "undefined" || typeof location === "undefined") return false;
  if (location.pathname === "/embed") return false; // (the player inside another app: no pages to go to)
  const cause = isCause(what) ? what : causeOf(what);
  if (!cause) return false;
  const message = opts.message || (isCause(what) ? "" : String((what && what.message) || what || ""));
  const env = { device: device(), os: computerOs(), message, run: !!opts.run };
  // Already in Settings: a popup sending the learner there would be no help (the message is shown as before).
  if (goesToSettings(fixFor(cause, env)) && location.hash.startsWith("#/settings")) return false;
  const item = { cause, env, opts };
  if (gate.ask(cause, Date.now(), item) === "show") show(item);
  return true;
}

/** The popup that waited its turn, a moment after the last one closed: unless it would send the
 * learner into Settings while they are there now (they went to fix the last one), which passes it over. */
function showNext(next) {
  if (!next) return;
  setTimeout(() => {
    if (goesToSettings(fixFor(next.cause, next.item.env)) && location.hash.startsWith("#/settings")) {
      showNext(gate.closed(next.cause, "skipped", Date.now()));
      return;
    }
    show(next.item);
  }, 350);
}

async function show(item) {
  const { cause, opts } = item;
  const env = { ...item.env };
  if (cause === "mic") env.state = await permissionState("microphone");
  let fix = fixFor(cause, env);
  let how = "dismissed";  // until its button is pressed: Dismiss, Esc, a tap beside it, or another page

  const before = document.activeElement;
  const m = openModal({
    title: t(fix.title), cls: "fix-back", cross: false,
    onClose: () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("hashchange", onAway);
      window.removeEventListener("popstate", onAway);
      if (before && before.isConnected && typeof before.focus === "function") { try { before.focus({ preventScroll: true }); } catch { /* gone */ } }
      showNext(gate.closed(cause, how, Date.now()));
    },
  });
  const box = m.el.querySelector(".modal-box");
  box.classList.add("fix-box");
  box.setAttribute("role", "alertdialog");
  m.body.innerHTML = `<p class="fix-text"></p><p class="fix-note" hidden></p>
    <div class="fix-actions"><button type="button" class="primary fix-go"></button><button type="button" class="ghost fix-no"></button></div>`;
  const ico = h(`<div class="fix-ico" aria-hidden="true"></div>`);
  m.el.querySelector(".modal-head").prepend(ico);  // (the icon above the title)
  const text = m.body.querySelector(".fix-text"), note = m.body.querySelector(".fix-note");
  const go = m.body.querySelector(".fix-go"), no = m.body.querySelector(".fix-no");
  const head = m.el.querySelector(".modal-head h2");
  head.id = `fix-title-${cause}`;
  text.id = `fix-text-${cause}`;
  box.setAttribute("aria-labelledby", head.id);
  box.setAttribute("aria-describedby", text.id);
  const paint = () => {
    ico.innerHTML = icon(fix.icon || "settings", 30);
    m.setTitle(t(fix.title));
    text.textContent = t(fix.text);
    go.textContent = t(fix.button);
  };
  paint();
  no.textContent = t("Dismiss");
  no.onclick = () => m.close();

  const done = () => { how = "fixed"; m.close(); };
  go.onclick = async () => {
    if (fix.run && opts.run) { done(); opts.run(); return; }
    if (fix.href) {
      done();
      if (opts.goTo) opts.goTo(fix.href); else location.hash = fix.href;
      return;
    }
    if (fix.step === "voices") {  // Android: the phone's own text-to-speech settings
      done();
      const { openVoiceSettings } = await import("../devicevoice.js");
      if (!(await openVoiceSettings())) location.hash = "#/settings?s=voices&show=cardvoice";
      return;
    }
    if (fix.step === "system") {
      done();
      await openSystemSettings(fix.perm);
      return;
    }
    // Ask for it again.
    go.disabled = true;
    const ok = await askMicrophone();
    go.disabled = false;
    if (!m.el.isConnected) return;
    if (ok) { done(); shell.toast(t("The microphone is allowed now. Try again."), { timeout: 3000 }); return; }
    // Still not allowed: how it stands now decides what the button does next (on a phone the
    // system's settings, once Android or the iPhone won't ask any more).
    const was = fix;
    env.state = await permissionState("microphone");
    fix = fixFor(cause, env);
    paint();
    if (fix.step === was.step && fix.text === was.text) {
      note.textContent = t("The microphone is still blocked.");
      note.hidden = false;
    }
    go.focus();
  };

  // While it is on top it takes every key, so nothing reaches the page behind it (a review card).
  const onKey = (e) => {
    const all = document.querySelectorAll(".modal-back");
    if (all[all.length - 1] !== m.el) return; // another box over it answers its own keys
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); m.close(); return; }
    const inside = box.contains(document.activeElement);
    if (e.key === "Tab") {
      e.preventDefault();
      const order = [go, no].filter((b) => !b.disabled);
      const at = order.indexOf(document.activeElement);
      order[(at + (e.shiftKey ? -1 : 1) + order.length) % order.length].focus();
      return;
    }
    if (!inside && (e.key === "Enter" || e.key === " ")) e.preventDefault();
  };
  const onAway = () => m.close(); // another page, or the phone's back button
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("hashchange", onAway);
  window.addEventListener("popstate", onAway);
  go.focus();
}
