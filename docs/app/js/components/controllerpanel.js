// Settings → Controller (the computer's and the phones' Settings pages both call controllerSection):
// the controllers connected, how to connect one, the button guide on screen, and the buttons of
// each screen (watching videos, the word popup, studying cards, Home, the Library…): choose a screen,
// then press a button's box and then a button on the controller to give it that one; ✕ clears it,
// ↺ puts its default back. Under a screen's own buttons, those it shares with every screen.
// padmap.js is the mapping, gamepad.js reads the controller and keeps the setting.

import { esc, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { ACTIONS, AREAS, KIND_NAMES, actionFor, actionOf, assign, fullMap, inputName, resetAction, resetArea } from "../padmap.js";
import {
  captureInput, cancelCapture, connectedPads, controllerSetting, legendOn, onPadInput, onPads, padStyle,
  reloadControllerSetting, saveControllerSetting, setLegendOn,
} from "../gamepad.js";

/** The Settings home's line for this section. */
export function controllerSummary() {
  const pads = connectedPads();
  if (!pads.length) return { text: "No controller connected" };
  return { text: t("{0} connected", padLabel(pads[0].kind)) };
}

const padLabel = (kind) => (kind === "generic" ? "Controller" : `${KIND_NAMES[kind]} controller`);

/** The screen shown first: the one a search result asked for (show=pad<screen>), else the one chosen last. */
function firstArea() {
  const show = new URLSearchParams(location.hash.split("?")[1] || "").get("show") || "";
  const asked = AREAS.find((a) => `pad${a.id}` === show);
  if (asked) return asked.id;
  let kept = "";
  try { kept = localStorage.getItem("padArea") || ""; } catch { /* private window */ }
  return AREAS.some((a) => a.id === kept) ? kept : AREAS[0].id;
}

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
            <li>Use it anywhere in the app. The D-pad moves a highlight, A presses, B goes back; each screen's own buttons are below.</li>
          </ol>
          <p class="set-hint">Xbox, PlayStation and Nintendo Switch Pro controllers work, and most others. Buttons are named the way they are printed on the controller connected.</p>
        </div>
      </details>
      <label class="check" data-find="padlegend"><input type="checkbox" class="pad-legend-on">
        <span>Show what the buttons do at the bottom of the screen, while the controller is in use</span></label>
    </section>
    <section class="card set-card pad-area" data-find="padvideo padreview padgeneral padscreens">
      <h2>Buttons</h2>
      <label class="pad-pick"><span>Screen</span> <select class="pad-screen"></select></label>
      <p class="set-hint pad-about"></p>
      <div class="pad-rows"></div>
      <div class="pad-shared" hidden><h3 class="pad-shared-h">The same on every screen</h3><div class="pad-shared-rows"></div>
        <p class="set-hint">Change these under “Everywhere”.</p></div>
      <div class="row pad-foot"><button type="button" class="ghost pad-reset-area">Reset these to the defaults</button>
        <button type="button" class="ghost pad-reset-all">Reset every screen</button></div>
    </section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  const card = $(".pad-area");
  const picker = $(".pad-screen");
  let area = firstArea();
  let waiting = null; // { area, action, button }

  for (const a of AREAS) {
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.title;
    picker.append(o);
  }
  picker.value = area;
  picker.onchange = () => {
    if (waiting) cancelCapture();
    area = picker.value;
    try { localStorage.setItem("padArea", area); } catch { /* private window */ }
    draw();
  };

  const legend = $(".pad-legend-on");
  legend.checked = legendOn();
  legend.onchange = () => setLegendOn(legend.checked);

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

  const printed = (input) => padStyle().kind !== "generic" && padStyle().standard && /^b(\d|1[01]|16)$/.test(input);
  const name = (input) => {
    const { kind, standard } = padStyle();
    return inputName(input, kind, standard);
  };
  const keyText = (el, input) => {
    el.textContent = input ? name(input) : t("Not set");
    // A name printed on the controller (A, LB, Options) stays as printed; a description (D-pad up) is translated.
    if (input && printed(input)) el.setAttribute("translate", "no"); else el.removeAttribute("translate");
  };

  const draw = () => {
    const full = fullMap(controllerSetting());
    const info = AREAS.find((a) => a.id === area) || AREAS[0];
    $(".pad-about").textContent = info.about;
    const rows = $(".pad-rows");
    rows.innerHTML = "";
    for (const a of ACTIONS[area]) {
      const input = full[area][a.id];
      const changed = input !== a.def;
      const row = h(`<div class="pad-row">
        <span class="pad-act">${esc(a.label)}</span>
        <button type="button" class="pad-key${input ? "" : " unset"}" data-area="${area}" data-action="${a.id}" title="Press, then press a button on the controller"></button>
        <button type="button" class="ghost icon pad-clear" title="No button for this" aria-label="Clear" ${input ? "" : "disabled"}>✕</button>
        <button type="button" class="ghost icon pad-default" title="Back to the default button" aria-label="Default" ${changed ? "" : "disabled"}>↺</button>
      </div>`);
      const key = row.querySelector(".pad-key");
      keyText(key, input);
      key.onclick = () => ask(area, a.id, key);
      row.querySelector(".pad-clear").onclick = () => change(assign(controllerSetting(), area, a.id, ""));
      row.querySelector(".pad-default").onclick = () => change(resetAction(controllerSetting(), area, a.id));
      rows.append(row);
    }
    // What the screen leaves to "Everywhere": shown, so a screen's whole layout is in one place.
    const shared = $(".pad-shared");
    const sharedRows = $(".pad-shared-rows");
    sharedRows.innerHTML = "";
    if (area !== "general") {
      const mine = new Set(Object.values(full[area]).filter(Boolean));
      const over = area === "typing" ? ["up", "down", "left", "right"] : null;  // typing: only moving on from the box
      for (const g of ACTIONS.general) {
        const input = full.general[g.id];
        if (!input || mine.has(input) || (over && !over.includes(g.id))) continue;
        const row = h(`<div class="pad-row pad-row-shared"><span class="pad-act">${esc(g.label)}</span><span class="pad-key pad-key-shared"></span></div>`);
        keyText(row.querySelector(".pad-key"), input);
        sharedRows.append(row);
      }
    }
    shared.hidden = !sharedRows.children.length;
  };

  async function change({ setting, took }, inArea = "", input = "") {
    try {
      await saveControllerSetting(setting);
    } catch (e) {
      toast(e && e.message ? e.message : String(e), { error: true });
    }
    if (took && inArea) {
      const other = actionOf(inArea, took);
      toast(t("{0} no longer does “{1}”.", name(input), other ? t(other.label) : took));
    }
    draw();
  }

  async function ask(inArea, action, button) {
    if (waiting) {
      const same = waiting.button === button;
      cancelCapture();
      if (same) return;
    }
    waiting = { area: inArea, action, button };
    button.classList.add("waiting");
    button.textContent = t("Press a button…");
    const input = await captureInput();
    if (!waiting || waiting.button !== button) return; // another row was pressed meanwhile
    waiting = null;
    button.classList.remove("waiting");
    if (!input) { draw(); return; }
    await change(assign(controllerSetting(), inArea, action, input), inArea, input);
  }

  $(".pad-reset-area").onclick = () => change({ setting: resetArea(controllerSetting(), area), took: null });
  $(".pad-reset-all").onclick = () => change({ setting: resetArea(controllerSetting(), ""), took: null });

  // Esc while waiting: stop waiting.
  const onKey = (e) => { if (waiting && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelCapture(); } };
  document.addEventListener("keydown", onKey, true);

  const offPads = onPads(() => { drawPads(); if (!waiting) draw(); });
  const offInput = onPadInput((input) => {
    const last = $(".pad-last");
    last.hidden = false;
    const did = actionFor(fullMap(controllerSetting()), area, input);
    last.textContent = t("Last button pressed: {0}", name(input));
    if (did && actionOf(area, did)) last.title = t(actionOf(area, did).label);
  });
  drawPads();
  draw();
  // Another device may have changed the buttons since this one last looked.
  reloadControllerSetting().then(() => { if (!waiting && body.isConnected) draw(); });
  const poll = setInterval(drawPads, 2000); // some browsers tell about a controller only when asked
  return [() => { clearInterval(poll); offPads(); offInput(); cancelCapture(); document.removeEventListener("keydown", onKey, true); }];
}
