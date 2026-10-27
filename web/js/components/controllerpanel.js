// Settings → Controller (the computer's and the phones' Settings pages both call controllerSection):
// the controllers connected, how to connect one, and for each place it works (watching videos,
// studying cards, everywhere) each action with its button: press "Set" and then a button on the
// controller to give it that one; ✕ clears it, ↺ puts its default back.
// padmap.js is the mapping, gamepad.js reads the controller and keeps the setting.

import { esc, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { ACTIONS, AREAS, KIND_NAMES, actionOf, assign, fullMap, inputName, resetAction, resetArea } from "../padmap.js";
import {
  captureInput, cancelCapture, connectedPads, controllerSetting, onPadInput, onPads, padStyle,
  reloadControllerSetting, saveControllerSetting,
} from "../gamepad.js";

/** The Settings home's line for this section. */
export function controllerSummary() {
  const pads = connectedPads();
  if (!pads.length) return { text: "No controller connected" };
  return { text: t("{0} connected", padLabel(pads[0].kind)) };
}

const padLabel = (kind) => (kind === "generic" ? "Controller" : `${KIND_NAMES[kind]} controller`);

/** Fill the section's body; returns the cleanups. */
export function controllerSection(body) {
  const supported = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
  body.append(h(`<div class="stack">
    <section class="card set-card" data-find="padconnect">
      <h2>Controllers</h2>
      <div class="pad-list"></div>
      <p class="pad-last small muted" hidden></p>
      <details class="set-more pad-how" data-find="padhow"><summary><span>How to connect a controller</span></summary>
        <div class="set-more-body stack">
          <ol class="pad-steps">
            <li>Plug the controller in with a USB cable, or pair it over Bluetooth in your device's own settings (on Windows: Settings → Bluetooth & devices; on Android: Settings → Connected devices; on a Mac: System Settings → Bluetooth).</li>
            <li>With Tamkeen open, press any button on the controller. Tamkeen only sees a controller after one of its buttons has been pressed.</li>
            <li>Open a video or your review cards and use it. The buttons below say what each one does there.</li>
          </ol>
          <p class="set-hint">Xbox, PlayStation and Nintendo Switch Pro controllers work, and most others. Buttons are named the way they are printed on the controller connected.</p>
        </div>
      </details>
    </section>
    <div class="pad-areas stack">
      <section class="card set-card pad-area" data-area="video" data-find="padvideo"></section>
      <section class="card set-card pad-area" data-area="review" data-find="padreview"></section>
      <section class="card set-card pad-area" data-area="general" data-find="padgeneral"></section>
    </div>
  </div>`));
  const $ = (q) => body.querySelector(q);
  const areasEl = $(".pad-areas");
  let waiting = null; // { area, action, button }

  let padsHtml = "";
  const drawPads = () => {
    const list = $(".pad-list");
    const put = (html) => { if (html !== padsHtml) { padsHtml = html; list.innerHTML = html; } };
    if (!supported) {
      put(`<p class="set-hint">This browser can't read game controllers.</p>`);
      return;
    }
    const pads = connectedPads();
    if (!pads.length) {
      put(`<p class="pad-none">No controller connected. Connect one, then press any of its buttons.</p>`);
      return;
    }
    put(pads.map((p) => `<div class="pad-item"><span class="pad-dot" aria-hidden="true"></span>
      <div><div class="pad-kind">${esc(padLabel(p.kind))}</div><div class="small muted" translate="no">${esc(p.id)}</div>
      ${p.standard ? "" : `<div class="small muted">Its buttons have no standard layout here, so they are numbered.</div>`}</div></div>`).join(""));
  };

  const printed = (input) => padStyle().kind !== "generic" && padStyle().standard && /^b(d|1[01]|16)$/.test(input);
  const name = (input) => {
    const { kind, standard } = padStyle();
    return inputName(input, kind, standard);
  };

  const draw = () => {
    const full = fullMap(controllerSetting());
    for (const area of AREAS) {
      const card = areasEl.querySelector(`[data-area="${area.id}"]`);
      card.innerHTML = `<h2>${esc(area.title)}</h2>
        <p class="set-hint">${esc(area.about)}</p>
        <div class="pad-rows"></div>
        <div class="row pad-foot"><button type="button" class="ghost pad-reset-area">Reset these to the defaults</button></div>`;
      const rows = card.querySelector(".pad-rows");
      for (const a of ACTIONS[area.id]) {
        const input = full[area.id][a.id];
        const changed = input !== a.def;
        const row = h(`<div class="pad-row">
          <span class="pad-act">${esc(a.label)}</span>
          <button type="button" class="pad-key${input ? "" : " unset"}" data-area="${area.id}" data-action="${a.id}" title="Press, then press a button on the controller"></button>
          <button type="button" class="ghost icon pad-clear" title="No button for this" aria-label="Clear" ${input ? "" : "disabled"}>✕</button>
          <button type="button" class="ghost icon pad-default" title="Back to the default button" aria-label="Default" ${changed ? "" : "disabled"}>↺</button>
        </div>`);
        const key = row.querySelector(".pad-key");
        key.textContent = input ? name(input) : "Not set";
        // A name printed on the controller (A, LB, Options) stays as printed; a description (D-pad up) is translated.
        if (input && printed(input)) key.setAttribute("translate", "no");
        key.onclick = () => ask(area.id, a.id, key);
        row.querySelector(".pad-clear").onclick = () => change(assign(controllerSetting(), area.id, a.id, ""));
        row.querySelector(".pad-default").onclick = () => change(resetAction(controllerSetting(), area.id, a.id));
        rows.append(row);
      }
      card.querySelector(".pad-reset-area").onclick = () => change({ setting: resetArea(controllerSetting(), area.id), took: null });
    }
  };

  async function change({ setting, took }, area = "", input = "") {
    try {
      await saveControllerSetting(setting);
    } catch (e) {
      toast(e && e.message ? e.message : String(e), { error: true });
    }
    if (took && area) {
      const other = actionOf(area, took);
      toast(t("{0} no longer does “{1}”.", name(input), other ? t(other.label) : took));
    }
    draw();
  }

  async function ask(area, action, button) {
    if (waiting) {
      const same = waiting.button === button;
      cancelCapture();
      if (same) return;
    }
    waiting = { area, action, button };
    button.classList.add("waiting");
    button.textContent = "Press a button…";
    const input = await captureInput();
    if (!waiting || waiting.button !== button) return; // another row was pressed meanwhile
    waiting = null;
    button.classList.remove("waiting");
    if (!input) { draw(); return; }
    await change(assign(controllerSetting(), area, action, input), area, input);
  }

  // Esc while waiting: stop waiting.
  const onKey = (e) => { if (waiting && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelCapture(); } };
  document.addEventListener("keydown", onKey, true);

  const offPads = onPads(() => { drawPads(); if (!waiting) draw(); });
  const offInput = onPadInput((input) => {
    const last = $(".pad-last");
    last.hidden = false;
    last.textContent = t("Last button pressed: {0}", name(input));
  });
  drawPads();
  draw();
  // Another device may have changed the buttons since this one last looked.
  reloadControllerSetting().then(() => { if (!waiting && body.isConnected) draw(); });
  const poll = setInterval(drawPads, 2000); // some browsers tell about a controller only when asked
  return [() => { clearInterval(poll); offPads(); offInput(); cancelCapture(); document.removeEventListener("keydown", onKey, true); }];
}
