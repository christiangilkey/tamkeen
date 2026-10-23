// Settings → Card voices, on every version: who reads out flashcards that have no recording of their
// own (cardvoice.js). Laid out like Listening & transcripts (sttsetup.js): the choice as three big
// tiles, each with its one-line consequence, and a status tag; then what the chosen one needs (this
// device's voice for the language, the Azure key and region, or the computer's voices); details in
// folds at the foot. Plain surfaces, centred, line icons, no banners (owner's taste).

import { esc, platform, state, saveSettings, toast } from "../app.js";
import { icon } from "../icons.js";
import { LANGUAGES, studyLanguage } from "../languages.js";
import { AZURE_FREE, AZURE_PORTAL, AZURE_PRICING, AZURE_VOICES, azureReady, azureVoices, buildSsml, azureSpeak, cleanAzureKey,
         cleanRegion, LOCAL_VOICE_LANGUAGES, needsVoice, pickedVoices, voiceChars, voiceMode, voicesForLanguage,
         waitingForComputer, withPickedVoice } from "../cardvoice.js";
import { deviceHasVoice, deviceKind, noVoiceText, openVoiceSettings, recheckDeviceVoices, speakDevice } from "../devicevoice.js";
import { azureVoiceOf, cardLanguage, voiceMaker } from "../voiceplay.js";

/** Common Azure regions, for the region box's suggestions (any region with Speech works). */
const REGIONS = ["eastus", "eastus2", "westus", "westus2", "westus3", "centralus", "northcentralus", "southcentralus", "canadacentral",
  "brazilsouth", "westeurope", "northeurope", "uksouth", "francecentral", "germanywestcentral", "switzerlandnorth", "swedencentral",
  "norwayeast", "uaenorth", "qatarcentral", "southafricanorth", "centralindia", "southeastasia", "eastasia", "japaneast",
  "koreacentral", "australiaeast"];

/** What the home screen says Card voices is set to. */
export function voiceSummary(s, { waiting = 0 } = {}) {
  const mode = voiceMode(s);
  if (mode === "azure") return azureReady(s) ? { text: "Azure voices" } : { text: "Azure needs a key", warn: true };
  if (mode === "computer") {
    return platform === "desktop" ? { text: "Voices made on this computer" }
      : { text: waiting ? `Waiting for your computer (${waiting} cards)` : "Voices made on your computer" };
  }
  return { text: "This device's voice" };
}

/**
 * Fills `section` (the card). The app hands in:
 *   words()      resolves to the saved words (the Vocab list), for the counts
 *   computer     (the computer only) its voice models: { summary(), download(id), cancel(), remove(id),
 *                pick(lang, id), sampleUrl(lang), onChange(fn) -> stop }
 *   changed()    called after a choice here has been saved
 * Returns what to call when the page goes away.
 */
export function voiceSetup(section, { words = async () => [], computer = null, changed = () => {} } = {}) {
  const cur = () => state.status.settings;
  const phone = platform !== "desktop";
  const here = phone ? "this phone" : "this computer";
  const lang = studyLanguage();
  const name = (LANGUAGES[lang] || {}).name || lang;
  const sampleText = (LANGUAGES[lang] || {}).sample || "";
  section.classList.add("stt-card", "vo-card");
  section.innerHTML = `
    <div class="stt-top"><h2>Who reads cards without audio</h2><span id="vo-tag"></span></div>
    <p class="set-hint">Cards from a podcast or your own audio play their own recording. Cards typed in, or saved from a web page,
      a book, YouTube, Netflix or a reel, are read out by the voice you choose here: the word and its sentence.</p>
    <div class="stt-who vo-who" role="radiogroup" aria-label="Who reads cards without audio" data-find="cardvoice">
      <label class="stt-choice"><input type="radio" name="vo-mode" value="device">
        <span class="stt-choice-ico">${icon("speak", 26)}</span>
        <strong>This device's voice</strong><span class="stt-choice-line">Free. Spoken by ${here} as you listen; nothing is kept.</span></label>
      <label class="stt-choice"><input type="radio" name="vo-mode" value="azure">
        <span class="stt-choice-ico">${icon("cloud", 26)}</span>
        <strong>Azure (your own key)</strong><span class="stt-choice-line">Natural voices, Arabic by country. Made once per card and kept.</span></label>
      <label class="stt-choice"><input type="radio" name="vo-mode" value="computer">
        <span class="stt-choice-ico">${icon("computer", 26)}</span>
        <strong>${phone ? "My computer" : "This computer"}</strong><span class="stt-choice-line">${phone
          ? "Free. Your computer makes them; they arrive when it syncs." : "Free, offline. Made here with a downloaded voice and kept."}</span></label>
    </div>
    <div class="vo-panel" id="vo-device"></div>
    <div class="stt-cloud vo-azure" id="vo-azure" data-find="azurekey">
      <h3>Azure Speech</h3>
      <div class="ai-setup">
        <div class="ai-field"><label for="vo-region">Region</label>
          <input type="text" id="vo-region" list="vo-regions" autocomplete="off" spellcheck="false" placeholder="for example westeurope">
          <datalist id="vo-regions">${REGIONS.map((r) => `<option value="${r}">`).join("")}</datalist></div>
        <div class="ai-field ai-wide"><label for="vo-key">Key</label>
          <div class="ai-key" id="vo-keyrow">
            <input type="password" id="vo-key" autocomplete="off" spellcheck="false" placeholder="Paste Key 1 here">
            <button type="button" class="ghost" id="vo-show">Show</button>
          </div>
          <span class="small" id="vo-key-note" role="status"></span></div>
        <div class="ai-wide stt-buttons">
          <button type="button" id="vo-test">Test the key</button>
          <a class="btn key-get" href="${AZURE_PORTAL}" target="_blank" rel="noopener">Get an Azure key ↗</a>
        </div>
        <div class="ai-wide small" id="vo-test-result" role="status"></div>
        <div class="ai-field ai-wide"><label for="vo-voice">Voice for ${esc(name)}</label>
          <div class="vo-row"><select id="vo-voice"></select><button type="button" class="ghost" id="vo-try">${icon("sound", 16)} Play a sample</button></div>
          <span class="small muted" id="vo-voice-note"></span></div>
        <div class="ai-wide vo-all" id="vo-all"></div>
      </div>
      <details class="set-info" id="vo-guide"><summary>How to get your own free Azure key</summary><ol class="vo-steps">
        <li>Make a free Microsoft Azure account at <a href="${AZURE_FREE}" target="_blank" rel="noopener">azure.microsoft.com/free</a>. Azure asks for a phone number and a bank card when you sign up, to check that you are a person; the free tier isn't charged.</li>
        <li>In the Azure portal, create a <strong>Speech</strong> resource (<a href="${AZURE_PORTAL}" target="_blank" rel="noopener">this link opens it</a>). Pick any region near you and the pricing tier <strong>Free F0</strong>.</li>
        <li>Open the new resource → <strong>Keys and Endpoint</strong>. Copy <strong>Key 1</strong> into Key above, and the <strong>Location/Region</strong> (for example westeurope) into Region.</li>
        <li>Press <strong>Test the key</strong>.</li></ol></details>
      <details class="set-info"><summary>What does it cost?</summary><p>Each user has their own Azure account and their own allowance. The free tier
        (F0) includes about half a million characters of neural voices a month; check Azure's page for today's amount and prices:
        <a href="${AZURE_PRICING}" target="_blank" rel="noopener">Azure Speech pricing ↗</a>. A card's word and its sentence are usually 20 to 120 characters, and each card's voice
        is made only once, then kept with the card on all your devices. If the free allowance runs out, Azure refuses until next month and the cards use this device's voice.</p></details>
    </div>
    <div class="stt-cloud vo-computer" id="vo-computer" data-find="localvoice"></div>
    <div class="stt-folds">
      <details class="set-info"><summary>How it works</summary><p>A card that came with a recording always plays it. For any other card,
        <strong>This device's voice</strong> speaks the word and the sentence as you press Word or Sentence. <strong>Azure</strong> and
        <strong>${phone ? "My computer" : "This computer"}</strong> make a recording of them the first time, keep it with the card and send it
        to your other devices through Google Drive, so it is made only once. It also goes into an Anki export. Until a card's recording
        exists, this device's voice reads it.</p></details>
      <details class="set-info"><summary>What is sent, and where is my key kept?</summary>With Azure, only the word and its sentence go to
        Microsoft's speech service in the region you chose, straight from ${here}, with your key; nothing else about you or your library.
        Your key is kept on ${here} and, if you use Google Drive sync, in the app's private folder in your own Google Drive, so your other
        devices have it too. It is never part of a data export. The device's own voice and the computer's voices send nothing anywhere.</details>
    </div>`;
  const $ = (q) => section.querySelector(q);
  let refused = false;   // the last test said the key doesn't work
  let summary = null;    // (the computer) its voices
  let allWords = [];
  let stopAll = null;    // a "make them all" run in progress
  const offs = [];

  const save = async (values) => { await saveSettings(values); await changed(); };

  function paintState() {
    const mode = voiceMode(cur());
    section.querySelectorAll("input[name=vo-mode]").forEach((r) => { r.checked = r.value === mode; });
    $("#vo-azure").hidden = mode !== "azure";
    $("#vo-computer").hidden = mode !== "computer";
    const tag = $("#vo-tag");
    const waiting = phone && mode === "computer" ? waitingForComputer(allWords, cardLanguage).count : 0;
    if (mode === "azure") {
      tag.className = refused ? "req-tag" : azureReady(cur()) ? "pill done" : "req-tag";
      tag.textContent = refused ? "Key not working" : azureReady(cur()) ? "✓ In use" : "Needs a key";
    } else if (mode === "computer" && waiting) {
      tag.className = "pill";
      tag.textContent = `${waiting} waiting`;
    } else {
      tag.className = "pill done";
      tag.textContent = mode === "device" ? "Free" : "✓ In use";
    }
    $("#vo-keyrow").classList.toggle("need", mode === "azure" && (!cleanAzureKey(cur().tts_key_azure) || refused));
    paintAll();
  }

  // ----- this device's voice for the language being learned -----
  async function paintDevice() {
    const box = $("#vo-device");
    const has = await deviceHasVoice(lang);
    const android = deviceKind() === "android";
    box.innerHTML = `<div class="vo-device ${has === false ? "vo-missing" : ""}">
      <span class="vo-device-ico">${icon(has === false ? "close" : "check", 18)}</span>
      <span class="vo-device-text"></span>
      <span class="vo-device-do">
        ${has === false ? (android ? `<button type="button" class="ghost" id="vo-tts-settings">Open text-to-speech settings</button>` : "")
          + `<button type="button" class="ghost" id="vo-recheck">Check again</button>`
          : `<button type="button" class="ghost" id="vo-device-try">${icon("sound", 16)} Play a sample</button>`}
      </span></div>`;
    const only = voiceMode(cur()) === "device";
    box.querySelector(".vo-device-text").textContent = has === false ? noVoiceText(lang)
      : has ? (only ? `This device has a ${name} voice. It reads the cards that have no recording.`
        : `This device has a ${name} voice. It reads the cards that have no recording until theirs is made.`)
      : only ? "This device's voice reads the cards that have no recording."
      : "This device's voice reads the cards that have no recording until theirs is made.";
    const tryIt = box.querySelector("#vo-device-try");
    if (tryIt) tryIt.onclick = () => speakDevice(sampleText, lang).catch((e) => toast(e.message, { error: true }));
    const settingsBtn = box.querySelector("#vo-tts-settings");
    if (settingsBtn) settingsBtn.onclick = () => openVoiceSettings();
    const again = box.querySelector("#vo-recheck");
    if (again) again.onclick = () => { recheckDeviceVoices(); paintDevice(); };
  }

  // ----- Azure -----
  $("#vo-region").value = cur().tts_region_azure || "";
  $("#vo-key").value = cur().tts_key_azure || "";
  let keyTimer = 0;
  async function fieldsEntered() {
    clearTimeout(keyTimer);
    const key = cleanAzureKey($("#vo-key").value);
    const region = cleanRegion($("#vo-region").value);
    if (key !== $("#vo-key").value) $("#vo-key").value = key;
    if (region !== $("#vo-region").value) $("#vo-region").value = region;
    if (key === (cur().tts_key_azure || "") && region === (cur().tts_region_azure || "")) return;
    refused = false;
    const note = $("#vo-key-note");
    try {
      await save({ tts_key_azure: key, tts_region_azure: region });
      note.textContent = key && region ? "Saved. Press “Test the key” to check it." : key ? "Saved. Now the region, as Azure shows it next to the key." : "Key removed.";
      note.style.color = "var(--accent)";
    } catch (err) {
      note.textContent = `The key couldn't be saved: ${err.message}`;
      note.style.color = "var(--danger)";
    }
    paintState();
  }
  for (const id of ["#vo-key", "#vo-region"]) {
    $(id).addEventListener("input", (e) => {
      clearTimeout(keyTimer);
      if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") fieldsEntered();
      else keyTimer = setTimeout(fieldsEntered, 700);
    });
    $(id).addEventListener("change", fieldsEntered);
  }
  $("#vo-show").onclick = (e) => {
    const k = $("#vo-key");
    k.type = k.type === "password" ? "text" : "password";
    e.target.textContent = k.type === "password" ? "Show" : "Hide";
  };

  let offered = [];  // Azure's voices for the language, once the key has been tried
  async function paintVoices() {
    const sel = $("#vo-voice");
    const usual = AZURE_VOICES[lang] ? await azureVoiceOf(lang, { ...cur(), tts_voices: "" }) : null;
    const picked = pickedVoices(cur())[lang] || "";
    if (!usual) {
      sel.innerHTML = `<option value="">No ${esc(name)} voice on Azure</option>`;
      sel.disabled = true;
      $("#vo-try").disabled = true;
      $("#vo-voice-note").textContent = `Azure has no ${name} voice, so these cards use this device's voice.`;
      return;
    }
    const names = [...new Set([usual, picked, ...offered.map((x) => x.name)].filter(Boolean))];
    const label = (n) => (offered.find((x) => x.name === n) || {}).label || n;
    sel.innerHTML = names.map((n) => `<option value="${esc(n === usual ? "" : n)}">${esc(label(n))}${n === usual ? " · usual" : ""}</option>`).join("");
    sel.value = picked && picked !== usual ? picked : "";
    sel.disabled = false;
    $("#vo-try").disabled = false;
    $("#vo-voice-note").textContent = offered.length ? "" : "Test the key to choose from all of Azure's voices for the language.";
  }
  $("#vo-voice").onchange = async (e) => {
    await save({ tts_voices: withPickedVoice(cur(), lang, e.target.value) });
    $("#vo-voice-note").textContent = "Cards already made keep their voice; new ones use this one.";
  };
  $("#vo-try").onclick = async (e) => {
    const s = cur();
    if (!azureReady({ ...s, tts_mode: "azure" })) { toast("Paste your key and region first.", { error: true }); return; }
    e.currentTarget.disabled = true;
    try {
      const voice = await azureVoiceOf(lang, s);
      const bytes = await azureSpeak({ key: s.tts_key_azure, region: s.tts_region_azure, ssml: buildSsml(sampleText, voice) });
      const a = new Audio(URL.createObjectURL(new Blob([bytes], { type: "audio/ogg" })));
      await a.play();
    } catch (err) {
      toast(err.message, { error: true });
    } finally { e.target.disabled = false; }
  };

  $("#vo-test").onclick = async (e) => {
    const out = $("#vo-test-result");
    e.target.disabled = true;
    await fieldsEntered();
    out.textContent = "Asking Azure for its voices…";
    out.style.color = "";
    const s = cur();
    try {
      if (!cleanAzureKey(s.tts_key_azure) || !cleanRegion(s.tts_region_azure)) throw new Error("Paste Key 1 and the region first.");
      const began = Date.now();
      const list = await azureVoices({ key: s.tts_key_azure, region: s.tts_region_azure });
      offered = voicesForLanguage(list, lang);
      refused = false;
      out.textContent = `✓ Works (Azure answered in ${((Date.now() - began) / 1000).toFixed(1)} s). ${offered.length
        ? `${offered.length} ${name} voices in this region.` : `Azure has no ${name} voice in this region.`} Testing uses none of your characters.`;
      out.style.color = "var(--accent)";
      paintVoices();
    } catch (err) {
      refused = !!err.keyRejected;
      out.textContent = err.message;
      out.style.color = "var(--danger)";
    } finally {
      e.target.disabled = false;
      paintState();
    }
  };

  // "Make them all now": every card without audio in this language gets its kept voice, one by one.
  function paintAll() {
    const box = $("#vo-all");
    if (stopAll) return;
    const todo = allWords.filter((v) => needsVoice(v) && cardLanguage(v) === lang);
    if (voiceMode(cur()) !== "azure" || !azureReady(cur()) || !todo.length || !AZURE_VOICES[lang]) { box.innerHTML = ""; return; }
    const chars = todo.reduce((n, v) => n + voiceChars(v), 0);
    box.innerHTML = `<div class="vo-all-row"><span class="small muted"></span><button type="button" id="vo-make-all">Make them now</button></div>`;
    box.querySelector("span").textContent = `${todo.length} ${name} card${todo.length === 1 ? "" : "s"} have no voice yet (about ${chars.toLocaleString()} characters). Each is made the first time it is played, or all of them now, ready for an Anki export.`;
    box.querySelector("#vo-make-all").onclick = () => makeAll(todo);
  }
  async function makeAll(todo) {
    const box = $("#vo-all");
    let stop = false, done = 0;
    stopAll = () => { stop = true; };
    box.innerHTML = `<div class="vo-all-row"><span class="small" role="status"></span><button type="button" class="ghost" id="vo-stop">Stop</button></div>`;
    const line = box.querySelector("span");
    box.querySelector("#vo-stop").onclick = () => { stop = true; };
    const make = voiceMaker(cur());
    try {
      for (const v of todo) {
        if (stop || !section.isConnected) break;
        line.textContent = `Making voices: ${done} of ${todo.length}…`;
        if (make) await make(v);
        done++;
      }
      line.textContent = `${done} voice${done === 1 ? "" : "s"} made and kept.`;
    } catch (err) {
      line.textContent = `${done} made. ${err.message}`;
      line.style.color = "var(--danger)";
    } finally {
      stopAll = null;
      setTimeout(() => { if (section.isConnected) paintAll(); }, 3000);
    }
  }

  // ----- the computer's voices -----
  async function paintComputer() {
    const box = $("#vo-computer");
    if (phone) {
      const w = waitingForComputer(allWords, cardLanguage);
      box.innerHTML = `<h3>Waiting for your computer</h3><div class="vo-wait"><strong></strong><span class="small muted"></span></div>`;
      box.querySelector("strong").textContent = w.count ? `${w.count} card${w.count === 1 ? "" : "s"}` : "Nothing waiting";
      box.querySelector("span").textContent = LOCAL_VOICE_LANGUAGES.includes(lang)
        ? `Your computer makes them when Tamkeen is open there, with the ${name} voice downloaded (Settings → Card voices on the computer). They arrive here when it syncs; until then this phone's voice reads them.`
        : `Your computer has no ${name} voice, so these cards use this phone's voice. For natural ${name} voices choose Azure.`;
      return;
    }
    try { summary = await computer.summary(); } catch (err) { box.textContent = err.message; return; }
    const info = summary.languages[lang];
    const waiting = (summary.waiting.langs || {})[lang] || 0;
    if (!summary.supported) {
      box.innerHTML = `<h3>Voices on this computer</h3><p class="small muted">Voices can't run on this kind of computer. Choose Azure or this device's voice.</p>`;
      return;
    }
    if (!info) {
      const why = summary.none[lang] === "noncommercial"
        ? `The only free ${name} voices for this program may not be used freely (their recordings are licensed for non-commercial use only), so Tamkeen doesn't offer them.`
        : `There is no free ${name} voice for this computer yet.`;
      box.innerHTML = `<h3>Voices on this computer</h3><p class="small vo-none"></p>`;
      box.querySelector(".vo-none").textContent = `${why} Choose Azure for natural ${name} voices, or this device's voice.`;
      return;
    }
    const dl = summary.download || {};
    const busy = dl.state === "preparing" || dl.state === "downloading";
    const runtimeNote = summary.runtime.installed ? "" : ` + the voice program, ${summary.runtime.mb} MB, once`;
    box.innerHTML = `<h3>Voices on this computer</h3>
      <p class="small muted vo-wait-line"></p>
      <div class="stt-models vo-voices">${info.voices.map((v) => `
        <div class="stt-model vo-voice-row">
          <span class="stt-model-text"><span class="stt-model-name">${esc(v.name)}${v.id === info.voice ? ` <span class="badge">In use</span>` : ""}</span>
            <span class="small muted">${esc(v.licence)} · ${v.mb} MB${v.installed ? "" : esc(runtimeNote)}${v.note ? ` · ${esc(v.note)}` : ""}</span></span>
          ${v.installed
            ? `${v.id !== info.voice ? `<button type="button" class="ghost" data-use="${esc(v.id)}">Use</button>` : `<button type="button" class="ghost" data-try="1">${icon("sound", 16)} Sample</button>`}
               <button type="button" class="ghost danger" data-del="${esc(v.id)}">Delete</button>`
            : busy && dl.voice === v.id ? `<span class="small">${dl.total ? Math.round((dl.done / dl.total) * 100) : 0}%</span><button type="button" class="ghost" data-cancel="1">Cancel</button>`
            : `<button type="button" data-get="${esc(v.id)}" ${busy ? "disabled" : ""}>Download</button>`}
        </div>`).join("")}</div>
      ${dl.state === "error" ? `<p class="small" style="color:var(--danger)"></p>` : ""}
      <details class="set-info"><summary>About these voices</summary><p>They are Piper voices (an open-source speech program that runs on
        this computer's processor, offline). Each voice's recordings carry the licence shown. Many were trained on top of Piper's English
        voice, whose own recordings were licensed for research; Piper publishes them under their own licences.</p></details>`;
    const waitLine = box.querySelector(".vo-wait-line");
    waitLine.textContent = !info.voice ? `Download a ${name} voice: then this computer gives every ${name} card without audio its own recording, also the ones saved on your phone.`
      : waiting ? `${waiting} ${name} card${waiting === 1 ? "" : "s"} still to make: this computer is making them now.`
      : `Every ${name} card has its voice. New ones get theirs as they are saved, here or on your phone.`;
    const err = box.querySelector("p[style]");
    if (err) err.textContent = `The download failed: ${dl.error}`;
    box.querySelectorAll("[data-get]").forEach((b) => { b.onclick = () => computer.download(b.dataset.get).then(paintComputer, (e) => toast(e.message, { error: true })); });
    box.querySelectorAll("[data-del]").forEach((b) => { b.onclick = () => computer.remove(b.dataset.del).then(paintComputer); });
    box.querySelectorAll("[data-use]").forEach((b) => { b.onclick = () => computer.pick(lang, b.dataset.use).then(paintComputer); });
    box.querySelectorAll("[data-cancel]").forEach((b) => { b.onclick = () => computer.cancel().then(paintComputer); });
    box.querySelectorAll("[data-try]").forEach((b) => { b.onclick = () => new Audio(computer.sampleUrl(lang, sampleText)).play().catch((e) => toast(e.message, { error: true })); });
  }

  section.querySelectorAll("input[name=vo-mode]").forEach((r) => {
    r.onchange = async () => {
      if (!r.checked) return;
      await save({ tts_mode: r.value });
      paintState();
      paintDevice();
      if (r.value === "azure" && !cleanAzureKey(cur().tts_key_azure)) { $("#vo-guide").open = true; $("#vo-region").focus(); }
      if (r.value === "computer") paintComputer();
    };
  });

  paintState();
  paintDevice();
  paintVoices();
  paintComputer();
  words().then((list) => { allWords = list || []; paintState(); paintComputer(); }).catch(() => {});
  if (computer && computer.onChange) {
    let timer = 0;
    offs.push(computer.onChange(() => { clearTimeout(timer); timer = setTimeout(() => { if (voiceMode(cur()) === "computer") paintComputer(); }, 250); }));
  }
  return () => { clearTimeout(keyTimer); if (stopAll) stopAll(); offs.forEach((f) => f()); };
}
