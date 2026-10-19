// The "Cloud transcription" card in Settings (Listening & transcripts), on the computer and the
// phone: who writes the transcripts (this computer, or a cloud provider with the user's own key), which provider and
// model, what that costs per hour of audio, the key itself, a test, and how much was sent today.
// It is laid out like the "How words are explained" card (aisetup.js) and shares its styles; the
// model and today's use wait under "More options".

import { esc, platform, state, saveSettings } from "../app.js";
import { icon } from "../icons.js";
import "./settingsui.js"; // (the looks of the "More options" fold, which holds the model and today's use)
import { STT_KEY_GUIDES, STT_PROVIDERS, cleanSttKey, describeAudioUse, hoursPerDollar, perHourText, sttConfig, sttKeyProvider } from "../stt.js";
import { showKeyHelp } from "./keyhelp.js";
import { troubleshootButton } from "./troubleshoot.js";

const OTHER = "__other__";

/**
 * Fills `section` (the card). Each app does the sending its own way, so it hands in:
 *   test({provider, key, model})  tries the key; resolves to how many seconds the provider took,
 *                                 or throws (with `keyRejected` when the key itself was refused)
 *   usage()                       resolves to today's total (see stt.js addAudioUse)
 *   onUsage(fn)                   calls fn whenever that total changes; returns how to stop
 *   changed()                     called after a choice here has been saved
 * Returns what to call when the page goes away.
 */
export function sttSetup(section, { test, usage, onUsage, changed = () => {} }) {
  const cur = () => state.status.settings;
  const phone = platform !== "desktop";
  const here = phone ? "this phone" : "this computer";
  const local = phone ? "My computer" : "This computer";
  section.classList.add("ai-card", "stt-card");
  section.innerHTML = `
    <div class="ai-head"><h2>Cloud transcription</h2><span id="stt-tag"></span></div>
    <div class="small muted ai-about">${phone
      ? "Normally your computer writes the transcripts and they arrive here by sync. A cloud provider can write them instead, straight from this phone, so nothing waits for the computer."
      : "Writing a transcript needs a strong computer, most of all for Arabic. If yours is slow, a cloud provider can write the transcripts instead."}
      You use your own key and pay them directly, a few cents per hour of audio.
      <details><summary>What is sent, and where is my key kept?</summary>The audio of what you transcribe goes to the provider you choose
        (${phone ? "the episode's file, or a reel's video" : "only the parts with speech in them"}), and nowhere else. Nothing else about you or your library is sent.
        Your key is kept on ${here} and, if you use Google Drive sync, in the app's private folder in your own Google Drive, so your other devices have it too. It is never part of a data export.</details></div>
    <div class="stt-who" role="radiogroup" aria-label="Who writes the transcripts" data-find="who">
      <label class="stt-choice"><input type="radio" name="stt-mode" value="local">
        <span><strong>${local}</strong><span class="small muted">${phone ? "Free. Transcripts arrive when it next syncs." : "Free. Uses the model chosen below."}</span></span></label>
      <label class="stt-choice"><input type="radio" name="stt-mode" value="cloud">
        <span><strong>A cloud provider</strong><span class="small muted">${phone ? "Starts at once, on this phone. A few cents an hour." : "No strong computer needed. A few cents an hour."}</span></span></label>
    </div>
    <div class="ai-setup" id="stt-fields">
      <div class="ai-field ai-wide" data-find="sttkey"><label for="stt-provider">Provider</label>
        <select id="stt-provider">${Object.entries(STT_PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></div>
      <div class="ai-field ai-wide"><label for="stt-key">API key</label>
        <div class="ai-key" id="stt-keyrow">
          <input type="password" id="stt-key" autocomplete="off" spellcheck="false" placeholder="Paste your API key here">
          <button type="button" class="ghost" id="stt-show">Show</button>
          <a class="btn key-get" id="stt-get" target="_blank" rel="noopener"></a>
          <button type="button" id="stt-stuck">I'm stuck</button>
        </div>
        <span class="small" id="stt-key-note" role="status"></span></div>
      <div class="ai-wide small stt-limit" id="stt-limit" role="note" hidden></div>
      <div class="ai-field ai-test ai-wide"><button type="button" id="stt-test">Test the key</button></div>
      <div class="ai-wide small" id="stt-test-result" role="status"></div>
      <details class="set-more ai-wide"><summary>${icon("chevron", 16)}<span>More options</span></summary>
      <div class="set-more-body ai-more">
      <div class="ai-field"><span class="ai-label" id="stt-model-label">Model</span>
        <div class="model-pick">
          <button type="button" class="model-btn" id="stt-model" aria-haspopup="listbox" aria-expanded="false"></button>
          <div class="model-menu" id="stt-model-menu" hidden>
            <div class="model-banner" id="stt-banner"></div>
            <div role="listbox" aria-labelledby="stt-model-label" id="stt-model-list"></div>
            <div class="model-foot small muted">You pay for the length of the audio, not for how long the work takes: an hour-long
              episode costs the hourly price, a one-minute reel a sixtieth of it. Prices are from each provider's price list.</div>
          </div>
        </div>
        <input type="text" id="stt-model-other" spellcheck="false" autocomplete="off" placeholder="Model name, exactly as the provider writes it" hidden></div>
      <div class="ai-use small muted">Audio sent today from ${here}: <strong id="stt-use">0 min</strong>
        <span id="stt-use-detail"></span></div>
      </div></details>
    </div>`;
  const $ = (q) => section.querySelector(q);
  const prov = () => $("#stt-provider").value;
  const price = (m) => perHourText(m);
  const borrowed = () => prov() === "openai" && !cur().stt_key_openai && !!cur().llm_key_openai;
  $("#stt-provider").value = STT_PROVIDERS[cur().stt_provider] ? cur().stt_provider : "groq";
  let model = "";
  let refused = false; // the last test said the key itself doesn't work

  // "Optional" while this computer does the work; "In use" once a provider is chosen and has a key.
  function paintState() {
    const cfg = sttConfig(cur());
    const cloud = cfg.mode === "cloud";
    section.querySelectorAll("input[name=stt-mode]").forEach((r) => { r.checked = r.value === cfg.mode; });
    $("#stt-fields").hidden = !cloud;
    const tag = $("#stt-tag");
    tag.className = refused && cloud ? "req-tag" : cfg.on ? "pill done" : cloud ? "req-tag" : "pill";
    tag.textContent = refused && cloud ? "Key not working" : cfg.on ? "✓ In use" : cloud ? "Needs a key" : "Optional";
    const info = STT_PROVIDERS[prov()];
    const has = !!cur()[`stt_key_${prov()}`] || borrowed();
    $("#stt-keyrow").classList.toggle("need", cloud && (!has || refused));
    $("#stt-get").textContent = has ? "Get a new key ↗" : `Get your ${info.short} API key ↗`;
    $("#stt-get").href = info.keyUrl;
    // On the phone, what the chosen provider does with a big episode that isn't an MP3 (the computer
    // re-encodes everything it sends, so it has no such limit).
    $("#stt-limit").hidden = !phone || !info.phoneLimit;
    $("#stt-limit").textContent = phone ? info.phoneLimit || "" : "";
    $("#stt-key").placeholder = borrowed() ? "Using your OpenAI key from Word definitions (or paste another)" : "Paste your API key here";
  }

  // ----- the model list: a menu of our own, so it can carry the banner and the prices -----
  const menu = $("#stt-model-menu");
  const button = $("#stt-model");
  function paintModel() {
    const info = STT_PROVIDERS[prov()];
    const m = info.models.find((x) => x.id === model);
    const best = info.models.find((x) => x.id === info.defaultModel);
    $("#stt-banner").textContent = `$1 ≈ ${hoursPerDollar(m || best)} hours of audio`;
    button.innerHTML = m
      ? `<span class="model-name">${esc(m.name)}${m.id === info.defaultModel ? ` <span class="badge">Recommended</span>` : ""}</span>
         <span class="model-price">${esc(price(m))}</span><span class="model-caret" aria-hidden="true">▾</span>`
      : `<span class="model-name">Another model</span><span class="model-caret" aria-hidden="true">▾</span>`;
    $("#stt-model-list").innerHTML = info.models.map((x) => `
      <button type="button" role="option" class="model-opt" data-id="${esc(x.id)}" aria-selected="${x.id === model}">
        <span class="model-name">${esc(x.name)}${x.id === info.defaultModel ? ` <span class="badge">Recommended</span>` : ""}
          <span class="small muted">${esc(x.note)}</span></span>
        <span class="model-price">${esc(price(x))}</span></button>`).join("")
      + `<button type="button" role="option" class="model-opt" data-id="${OTHER}" aria-selected="${model === OTHER}">
           <span class="model-name">Another model… <span class="small muted">type its name (it must give a time for every word)</span></span></button>`;
    $("#stt-model-other").hidden = model !== OTHER;
  }
  function openMenu(open) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) (menu.querySelector("[aria-selected=true]") || menu.querySelector(".model-opt")).focus();
  }
  button.onclick = () => openMenu(menu.hidden);
  const save = async (values) => { await saveSettings(values); await changed(); };
  // "" = the recommended model, so a later version of the app can recommend a better one.
  const saveModel = (id) => save({ [`stt_model_${prov()}`]: id === STT_PROVIDERS[prov()].defaultModel ? "" : id });
  menu.addEventListener("click", async (e) => {
    const opt = e.target.closest(".model-opt");
    if (!opt) return;
    model = opt.dataset.id;
    paintModel();
    openMenu(false);
    if (model === OTHER) $("#stt-model-other").focus();
    else { button.focus(); await saveModel(model); }
  });
  menu.addEventListener("keydown", (e) => {
    const opts = [...menu.querySelectorAll(".model-opt")];
    const at = opts.indexOf(document.activeElement);
    if (e.key === "Escape") { e.stopPropagation(); openMenu(false); button.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      opts[(at + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length].focus();
    }
  });
  const outside = (e) => { if (!menu.hidden && !e.target.closest(".model-pick")) openMenu(false); };
  document.addEventListener("pointerdown", outside, true);

  function paintProvider() {
    const p = prov();
    const chosen = cur()[`stt_model_${p}`] || STT_PROVIDERS[p].defaultModel;
    model = STT_PROVIDERS[p].models.some((m) => m.id === chosen) ? chosen : OTHER;
    $("#stt-model-other").value = model === OTHER ? chosen : "";
    $("#stt-key").value = cur()[`stt_key_${p}`] || "";
    $("#stt-test-result").textContent = "";
    $("#stt-key-note").textContent = "";
    refused = false;
    paintModel();
    paintState();
  }
  paintProvider();

  section.querySelectorAll("input[name=stt-mode]").forEach((r) => {
    r.onchange = async () => {
      if (!r.checked) return;
      await save({ stt_mode: r.value });
      paintState();
      if (r.value === "cloud" && !sttConfig(cur()).key) $("#stt-key").focus();
    };
  });
  $("#stt-provider").onchange = async () => { await save({ stt_provider: prov() }); paintProvider(); };

  // The key is saved as soon as it is pasted or typed, tidied of anything that came along with
  // it, and filed under the provider it belongs to (a Groq key pasted with OpenAI selected
  // switches the provider rather than failing later).
  let keyTimer = 0;
  async function keyEntered() {
    clearTimeout(keyTimer);
    const input = $("#stt-key");
    const key = cleanSttKey(input.value);
    if (key !== input.value) input.value = key;
    const note = $("#stt-key-note");
    const owner = key.length >= 20 ? sttKeyProvider(key) : "";
    if (key === (cur()[`stt_key_${owner || prov()}`] || "") && (!owner || owner === prov())) return; // nothing new
    refused = false;
    try {
      if (owner && owner !== prov()) {
        $("#stt-provider").value = owner;
        await save({ stt_provider: owner, [`stt_key_${owner}`]: key });
        paintProvider();
        note.textContent = `That is a ${STT_PROVIDERS[owner].short} key, so the provider is now ${STT_PROVIDERS[owner].label}. Saved: press “Test the key” to check it.`;
      } else if (key.startsWith("sk-ant-") || key.startsWith("xai-") || key.startsWith("AIza")) {
        note.textContent = "That key is for Word definitions, not for transcription. Groq keys start with gsk_.";
        note.style.color = "var(--danger)";
        return;
      } else {
        await save({ [`stt_key_${prov()}`]: key });
        paintState();
        note.textContent = key ? "Saved. Press “Test the key” to check it." : borrowed() ? "Using your OpenAI key from Word definitions." : "Key removed.";
      }
      note.style.color = "var(--accent)";
    } catch (err) {
      note.textContent = `The key couldn't be saved: ${err.message}`;
      note.style.color = "var(--danger)";
    }
  }
  $("#stt-key").addEventListener("input", (e) => {
    clearTimeout(keyTimer);
    if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") keyEntered(); // a paste: straight away
    else keyTimer = setTimeout(keyEntered, 600);                                             // typing: once it pauses
  });
  $("#stt-key").addEventListener("change", keyEntered);
  $("#stt-model-other").onchange = (e) => saveModel(e.target.value.trim());
  $("#stt-stuck").onclick = () => showKeyHelp(prov(), { providers: STT_PROVIDERS, guides: STT_KEY_GUIDES,
                                                      used: "send audio to a transcription service, which writes down what is said" });
  $("#stt-show").onclick = (e) => {
    const k = $("#stt-key");
    k.type = k.type === "password" ? "text" : "password";
    e.target.textContent = k.type === "password" ? "Show" : "Hide";
  };

  $("#stt-test").onclick = async (e) => {
    const out = $("#stt-test-result");
    e.target.disabled = true;
    await keyEntered(); // (a key typed a moment ago is saved, and filed under its provider, first)
    $("#stt-key-note").textContent = "";
    out.textContent = "Sending one second of silence…";
    out.style.color = "";
    const info = STT_PROVIDERS[prov()];
    try {
      const seconds = await test({ provider: prov(), key: sttConfig(cur()).key,
                                   model: model === OTHER ? $("#stt-model-other").value.trim() || info.defaultModel : model });
      refused = false;
      out.textContent = `✓ Works (${info.label} answered in ${Number(seconds).toFixed(1)} s). ${phone
        ? "“Transcribe” on this phone now starts straight away." : "New transcriptions will be written by " + info.label + "."}`;
      out.style.color = "var(--accent)";
    } catch (err) {
      out.textContent = err.message;
      out.style.color = "var(--danger)";
      const fix = troubleshootButton(err, { service: "stt" });
      if (fix) out.append(" ", fix);
      refused = !!err.keyRejected; // a refused key: not "in use" after all, and the key row is framed again
    } finally {
      e.target.disabled = false;
      paintState();
    }
  };

  // ----- audio sent today: a running total, moving as pieces are sent -----
  const paintUse = (total) => {
    const use = describeAudioUse(total);
    $("#stt-use").textContent = use.length;
    $("#stt-use-detail").textContent = `(${use.detail})`;
  };
  Promise.resolve(usage()).then(paintUse).catch(() => {});
  const offUsage = onUsage ? onUsage(paintUse) : () => {};

  /** Call when the page goes away. */
  return () => {
    clearTimeout(keyTimer);
    document.removeEventListener("pointerdown", outside, true);
    offUsage();
  };
}
