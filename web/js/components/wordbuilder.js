// "Add words": the Vocab page's card builder (its "Add words" button and ⋯ menu). Every version has it.
//
// One card or many at once, typed one by one or pasted as a list, with as much or as little done for
// the learner as they like: for each part of the cards ("For these cards") the app fills it in, leaves
// it out, or the learner types it. Whatever the learner typed is never replaced (addwords.js).
//   - Meanings: the learner's lookup setting (Settings → Word definitions): the built-in dictionary,
//     the AI, or the dictionary first and the AI for the words it hasn't got.
//   - Example sentences and their translations: the learner's AI (one request for many words).
//   - Audio: the card voice chosen in Settings → Card voices (made and kept now with Azure; the
//     computer makes it with "My computer"; the device's voice says it live), or the learner's own
//     recording or sound file for each card (cardaudio.js), kept with the card like a voice.
// "Fill in" does the automatic parts now, so they can be looked over (and changed) before adding;
// "Add N cards" does whatever is left, saves them all (POST /vocab/batch), keeps their audio and closes.
//
// Looks: plain solid surfaces, one centred column; on a phone a full-height sheet, on a computer a
// centred box (app.css "Add words").

import { api, esc, h, platform, saveRecording, showMenu, state, toast } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs, langInfo, studyLanguage } from "../languages.js";
import { openModal } from "./modal.js";
import { confirmBox } from "./settingsui.js";
import { AI_CHUNK, MAX_ROWS, addable, batchPrompt, cardOf, chunks, cleanChoices, duplicates, edited, fillIn, hasValue,
         needs, needsAny, parseList, pool, readBatch, typed } from "../addwords.js";
import { askAi, definerConfig, noAi } from "../define-service.js";
import { definerModeOf } from "../definer.js";
import { NO_MEANINGS, dictionaryDefine, downloadMeanings, meaningsStatus } from "../meanings.js";
import { azureReady, voiceChars, voiceMode } from "../cardvoice.js";
import { voiceMaker } from "../voiceplay.js";
import { MAX_SECONDS, canRecord, cardAudio, partFrom, previewBlob, seconds, startRecording } from "../cardaudio.js";

const CHOICES_KEY = "tk_addwords";  // this device's choices for "For these cards"
const settings = () => (state.status && state.status.settings) || {};
const lsGet = () => { try { return JSON.parse(localStorage.getItem(CHOICES_KEY) || "{}"); } catch { return {}; } };
const lsSet = (v) => { try { localStorage.setItem(CHOICES_KEY, JSON.stringify(v)); } catch { /* storage off */ } };

const AI_SETTINGS = "#/settings?s=words&show=key";
const MODE_SETTINGS = "#/settings?s=words&show=mode";
const AZURE_SETTINGS = "#/settings?s=voices&show=azurekey";

/** The words for each choice (the segmented buttons). */
const OPTIONS = {
  meaning: { label: "Meaning", items: [["auto", "Fill in for me"], ["type", "I'll type it"]] },
  sentence: { label: "Example sentence", items: [["auto", "Write one for me"], ["none", "No sentence"], ["type", "I'll type it"]] },
  audio: { label: "Audio", items: [["auto", "Make it for me"], ["none", "No audio"], ["own", "I'll add my own"]] },
};

const clean = (s) => String(s ?? "").replace(/[⟦⟧]/g, "");

/** A small box asking for a name (a new folder), instead of the browser's own. Resolves to the name or "". */
function askName(title, label) {
  return new Promise((resolve) => {
    let answer = "";
    const m = openModal({ title, onClose: () => resolve(answer) });
    const form = h(`<form class="cb-ask"><input type="text" maxlength="80" autocomplete="off" dir="auto">
      <div class="confirm-buttons"><button type="button" class="ghost">Cancel</button><button type="submit" class="primary">Make the folder</button></div></form>`);
    const input = form.querySelector("input");
    input.setAttribute("aria-label", label);
    input.placeholder = label;
    form.querySelector("button.ghost").onclick = () => m.close();
    form.onsubmit = (e) => { e.preventDefault(); answer = input.value.trim(); if (answer) m.close(); };
    m.body.append(form);
    setTimeout(() => input.focus(), 30);
  });
}

/**
 * Open the builder. `existing()` gives the saved words (to find repeats), `folders` the folders
 * ([{uid, name}]), `folder` the one open on the Vocab page (its cards go there unless another is
 * chosen). `onFolder(folder)` hears of a folder made here; `onAdded(cards)` gets the cards once added.
 */
export function openWordBuilder({ existing = () => [], folders = [], folder = "", onFolder = () => {}, onAdded = () => {} } = {}) {
  const lang = studyLanguage();
  const info = langInfo(lang);
  const choices = cleanChoices(lsGet());
  if (folder) choices.folder = folder;
  let folderList = [...folders];
  if (choices.folder && !folderList.some((f) => f.uid === choices.folder)) choices.folder = "";

  const rows = [];
  let nextKey = 1;
  let mode = "one";
  let busy = false;      // filling in or adding
  let warned = false;    // the first "Add" found cards that need a look
  let done = false;      // added: nothing left to lose
  let recording = null;  // {row, which, ctl} while the microphone is listening
  let dict = null;       // this language's built-in dictionary here (meaningsStatus), once known
  let player = null;     // the <audio> playing a part

  const sheet = openModal({ title: "Add words", wide: true, beforeClose, onClose: cleanUp });
  const box = sheet.el.querySelector(".modal-box");
  box.classList.add("cb-box");
  sheet.el.classList.add("cb-back");

  const body = h(`<div class="wb">
    <div class="segmented cb-modes" role="tablist" aria-label="How to enter the words">
      <button type="button" class="seg-btn on" role="tab" aria-selected="true" data-mode="one">${icon("edit", 16)} One by one</button>
      <button type="button" class="seg-btn" role="tab" aria-selected="false" data-mode="paste">${icon("list", 16)} Paste a list</button>
    </div>
    <div class="cb-one">
      <div class="cb-rows"></div>
      <button type="button" class="ghost cb-another">${icon("plus", 18)} Another word</button>
      <p class="small muted cb-limit" hidden>At most 100 cards can be added at a time.</p>
    </div>
    <div class="cb-paste" hidden>
      <textarea class="cb-paste-box" rows="7" dir="auto" spellcheck="false" aria-label="Your list, one card per line"></textarea>
      <p class="small muted cb-paste-help">One card per line. After the word you can add its meaning with a dash, an equals sign or a semicolon (<span translate="no">word – meaning</span>), or paste columns from a spreadsheet: word, meaning, sentence, translation.</p>
      <div class="cb-preview" aria-live="polite"></div>
      <div class="cb-paste-go"><button type="button" class="primary cb-use" disabled>Use these</button></div>
    </div>
    <section class="cb-for" aria-label="For these cards">
      <h3>For these cards</h3>
      <div class="cb-opts"></div>
    </section>
  </div>`);
  sheet.body.append(body);
  const foot = h(`<div class="cb-foot">
    <p class="cb-foot-note small" aria-live="polite" hidden></p>
    <div class="cb-foot-buttons">
      <button type="button" class="cb-fill" title="Fill in the meanings and sentences now, to look them over before adding">${icon("sparkle", 18)} Fill in</button>
      <button type="button" class="primary cb-add" disabled>Add cards</button>
    </div>
  </div>`);
  box.append(foot);
  const $ = (s) => box.querySelector(s);
  const rowsEl = $(".cb-rows");

  // ---------------------------------------------------------------- the choices

  const aiReady = () => !noAi() && !!definerConfig().key;
  const lookupMode = () => definerModeOf(settings());
  const usesDictionary = () => lookupMode() !== "ai" || !aiReady();

  function drawOptions() {
    const box = $(".cb-opts");
    box.innerHTML = "";
    for (const [key, opt] of Object.entries(OPTIONS)) {
      const row = h(`<div class="cb-opt" data-opt="${key}">
        <span class="cb-opt-name"></span>
        <div class="cb-seg" role="radiogroup"></div>
        <p class="cb-note small muted" hidden></p>
      </div>`);
      row.querySelector(".cb-opt-name").textContent = opt.label;
      row.querySelector(".cb-seg").setAttribute("aria-label", opt.label);
      for (const [value, label] of opt.items) {
        const b = h(`<button type="button" role="radio"></button>`);
        b.textContent = label;
        b.dataset.value = value;
        b.onclick = () => { if (!b.disabled) choose(key, value); };
        row.querySelector(".cb-seg").append(b);
      }
      box.append(row);
    }
    const f = h(`<div class="cb-opt" data-opt="folder">
      <label class="cb-opt-name" for="cb-folder">Folder</label>
      <select id="cb-folder" class="cb-folder"></select>
      <p class="cb-note small muted" hidden></p>
    </div>`);
    box.append(f);
    f.querySelector("select").onchange = async (e) => {
      if (e.target.value === "+new") {
        const name = await askName("New folder", "Name for the new folder");
        if (name) {
          try {
            const made = await api("/vocab/folders", { method: "POST", body: { name } });
            folderList = [...folderList, made].sort((a, b) => a.name.localeCompare(b.name));
            onFolder(made);
            choices.folder = made.uid;
          } catch (err) { toast(err.message, { error: true }); }
        }
        paintOptions();
        remember();
        return;
      }
      choices.folder = e.target.value;
      remember();
    };
    paintOptions();
  }

  function paintOptions() {
    // Writing sentences needs the AI: without one the choice can't be made.
    if (!aiReady() && choices.sentence === "auto") choices.sentence = "type";
    for (const key of Object.keys(OPTIONS)) {
      const row = $(`.cb-opt[data-opt="${key}"]`);
      for (const b of row.querySelectorAll("button")) {
        const on = b.dataset.value === choices[key];
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
        b.disabled = key === "sentence" && b.dataset.value === "auto" && !aiReady();
      }
      note(row, key);
    }
    const select = $(".cb-folder");
    select.innerHTML = "";
    select.append(new Option(t("No folder"), ""));
    for (const f of folderList) select.append(new Option(f.name, f.uid));
    select.append(new Option(t("New folder…"), "+new"));
    select.value = choices.folder || "";
    for (const r of rows) paintRow(r);
    countUp();
  }

  /** The one line under a choice: where its parts come from, or what is missing and where to set it up. */
  function note(row, key) {
    const p = row.querySelector(".cb-note");
    let html = "";
    if (key === "meaning" && choices.meaning === "auto") {
      const missing = dict && dict.needed && !dict.installed && usesDictionary();
      if (missing) {
        const mb = Math.max(1, Math.round((dict.bytes || 0) / 1e6));
        html = `The built-in ${esc(info.name)} dictionary isn't on this device yet. <button type="button" class="link cb-getdict">${
          dict.bytes ? `Download it (${mb} MB)` : "Download it"}</button>`;
      } else if (!aiReady()) {
        html = noAi() ? "From the built-in dictionary (AI is off)."
          : `From the built-in dictionary. <a href="${AI_SETTINGS}" class="cb-go">Set up AI</a> for the words it doesn't have.`;
      } else if (lookupMode() === "dictionary_first") html = "From the built-in dictionary, and AI for the words it doesn't have.";
      else html = "Filled in by your AI.";
    } else if (key === "sentence") {
      if (!aiReady()) {
        html = noAi() ? `Writing sentences for you needs AI, which is turned off. <a href="${MODE_SETTINGS}" class="cb-go">Change it in Settings</a>`
          : `Writing sentences for you needs AI, which isn't set up yet. <a href="${AI_SETTINGS}" class="cb-go">Set it up in Settings</a>`;
      } else if (choices.sentence === "auto") html = "A short, natural sentence at a beginner to intermediate level, with its translation.";
    } else if (key === "audio") {
      const s = settings();
      if (choices.audio === "auto") {
        if (azureReady(s)) {
          // (A sentence still to be written counts as a usual one, about 60 characters.)
          const chars = rows.filter((r) => hasValue(typed(r.text)) && !r.audio.word)
            .reduce((n, r) => n + voiceChars({ text: r.text, sentence: choices.sentence === "none" ? "" : r.sentence.value })
              + (choices.sentence === "auto" && !hasValue(r.sentence) ? 60 : 0), 0);
          html = chars ? `Azure makes each card's voice when you add them: about ${chars} characters of your allowance.`
            : "Azure makes each card's voice when you add them.";
        } else if (voiceMode(s) === "computer") {
          html = platform === "desktop" ? "This computer makes each card's voice, with the voices downloaded in Settings."
            : "Your computer makes each card's voice the next time it syncs. Until then this device's voice reads them.";
        } else {
          html = `This device's voice reads them. Azure gives the most natural voice: <a href="${AZURE_SETTINGS}" class="cb-go">set it up</a>.`;
        }
      } else if (choices.audio === "own") {
        html = canRecord() ? "Record each card, or choose a sound file, under Audio on the card." : "Choose a sound file for each card, under Audio on the card.";
      } else html = "Nothing is kept now. When you play a card, the voice in Settings → Card voices reads it.";
    }
    p.innerHTML = html;
    p.hidden = !html;
    const get = p.querySelector(".cb-getdict");
    if (get) {
      get.onclick = async () => {
        get.disabled = true;
        get.textContent = t("Downloading…");
        try {
          await downloadMeanings(lang);
          dict = await meaningsStatus(lang).catch(() => null);
          toast(t("The dictionary is on this device now."));
        } catch (err) { toast(err.message || String(err), { error: true }); }
        paintOptions();
      };
    }
    // Going to Settings closes the builder (asking first when something typed would be lost).
    for (const a of p.querySelectorAll("a.cb-go")) {
      a.onclick = async (e) => {
        e.preventDefault();
        if (!(await beforeClose())) return;
        done = true;
        sheet.close();
        location.hash = a.getAttribute("href");
      };
    }
  }

  function choose(key, value) {
    if (choices[key] === value) return;
    choices[key] = value;
    remember();
    paintOptions();
  }
  const remember = () => lsSet(choices);

  // ---------------------------------------------------------------- the cards

  function newRow(card = {}, open = false) {
    const row = {
      key: nextKey++,
      text: String(card.text || ""),
      meaning: typed(card.meaning || ""),
      sentence: typed(card.sentence || ""),
      translation: typed(card.translation || ""),
      notes: String(card.notes || ""),
      audio: { word: null, sentence: null },
      open,
      anyway: false,
      status: null,  // {kind: "busy" | "error" | "ok", text}
      audioNote: null,
      el: null,
    };
    row.el = rowElement(row);
    return row;
  }

  function rowElement(row) {
    const study = langAttrs(lang);
    const el = h(`<div class="cb-row">
      <div class="cb-head">
        <span class="cb-num" aria-hidden="true"></span>
        <input type="text" class="cb-word ar" ${study} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="200">
        <span class="cb-sum" dir="auto"></span>
        <button type="button" class="ghost icon cb-open" aria-expanded="false">${icon("chevron", 18)}</button>
        <button type="button" class="ghost icon cb-del">${icon("trash", 18)}</button>
      </div>
      <div class="cb-body">
        <label class="cb-field" data-f="meaning"><span class="cb-label">Meaning</span>
          <span class="cb-in"><input type="text" class="cb-meaning" dir="auto" autocomplete="off" maxlength="500"><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <label class="cb-field cb-sent" data-f="sentence"><span class="cb-label">Example sentence</span>
          <span class="cb-in"><textarea class="cb-sentence ar" rows="1" ${study} maxlength="1000"></textarea><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <label class="cb-field cb-sent" data-f="translation"><span class="cb-label">Sentence translation</span>
          <span class="cb-in"><textarea class="cb-translation" rows="1" dir="auto" maxlength="1000"></textarea><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <label class="cb-field" data-f="notes"><span class="cb-label">Notes</span>
          <span class="cb-in"><input type="text" class="cb-notes" dir="auto" autocomplete="off" maxlength="2000" placeholder="Optional: grammar, a mnemonic, where you heard it"></span></label>
        <div class="cb-field cb-audio-field"><span class="cb-label">Audio</span><div class="cb-audio"></div></div>
      </div>
      <div class="cb-status" hidden></div>
    </div>`);
    const word = el.querySelector(".cb-word");
    word.placeholder = info.word;  // (in the language being learned)
    word.setAttribute("aria-label", t("Word"));
    word.value = row.text;
    el.querySelector(".cb-open").setAttribute("aria-label", t("Show the rest of this card"));
    el.querySelector(".cb-del").setAttribute("aria-label", t("Take this card out"));
    el.querySelector(".cb-del").title = t("Take this card out");
    const sentence = el.querySelector(".cb-sentence");
    sentence.setAttribute("aria-label", t("Example sentence"));
    for (const f of ["meaning", "sentence", "translation"]) {
      const input = el.querySelector(`.cb-${f}`);
      input.oninput = () => {
        row[f] = edited(input.value);  // from now on it is the learner's: never filled in over
        paintField(row, f);
        if (f === "meaning") paintSummary(row);
        if (input.tagName === "TEXTAREA") grow(input);
        if (row.status && row.status.kind === "error") setStatus(row, null);
        dirtied();
      };
    }
    el.querySelector(".cb-notes").value = row.notes;
    el.querySelector(".cb-notes").oninput = (e) => { row.notes = e.target.value; dirtied(); };
    word.oninput = () => {
      row.text = word.value;
      if (row.status && row.status.kind === "error") setStatus(row, null);
      dirtied();
      checkRepeats();
    };
    word.onkeydown = (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      const at = rows.indexOf(row);
      if (at === rows.length - 1) { if (word.value.trim()) addRow(); }
      else rows[at + 1].el.querySelector(".cb-word").focus();
    };
    el.querySelector(".cb-open").onclick = () => { row.open = !row.open; paintRow(row); };
    el.querySelector(".cb-del").onclick = () => removeRow(row);
    el.addEventListener("change", (e) => {
      if (e.target.matches(".cb-anyway")) { row.anyway = e.target.checked; paintStatus(row); countUp(); }
    });
    return el;
  }

  const grow = (ta) => { ta.style.height = "auto"; ta.style.height = `${Math.min(220, ta.scrollHeight + 2)}px`; };

  /** One field as it stands: the learner's own words, or the app's (lighter, marked "auto"). */
  function paintField(row, f) {
    const input = row.el.querySelector(`.cb-${f}`);
    const field = row[f];
    const shown = f === "translation" ? clean(field.value) : field.value;
    if (input.value !== shown) input.value = shown;
    const auto = field.auto && hasValue(field);
    input.closest(".cb-field").classList.toggle("is-auto", auto);
    const wants = f === "meaning" ? choices.meaning === "auto" : choices.sentence === "auto";
    const ph = {
      meaning: wants ? "Filled in for you" : "Its meaning",
      sentence: wants ? "Written for you" : "A sentence that uses it",
      translation: wants ? "Written for you" : "The sentence in your language",
    }[f];
    // (A text box's placeholder isn't translated again by itself when it changes, and the sentence box is in
    // the language being learned: so those are translated here.)
    input.placeholder = input.tagName === "TEXTAREA" ? t(ph) : ph;
    if (input.tagName === "TEXTAREA") grow(input);
  }

  function paintSummary(row) {
    const sum = row.el.querySelector(".cb-sum");
    sum.textContent = row.open ? "" : clean(row.meaning.value);
  }

  function paintRow(row) {
    const el = row.el;
    el.querySelector(".cb-num").textContent = String(rows.indexOf(row) + 1);
    el.classList.toggle("open", row.open);
    el.querySelector(".cb-body").hidden = !row.open;
    const toggle = el.querySelector(".cb-open");
    toggle.setAttribute("aria-expanded", String(row.open));
    for (const f of ["meaning", "sentence", "translation"]) paintField(row, f);
    for (const s of el.querySelectorAll(".cb-sent")) s.hidden = choices.sentence === "none";
    el.querySelector(".cb-audio-field").hidden = choices.audio === "none";
    paintAudio(row);
    paintSummary(row);
    paintStatus(row);
  }

  function addRow(card, { open = false, focus = true } = {}) {
    if (rows.length >= MAX_ROWS) { $(".cb-limit").hidden = false; return null; }
    const row = newRow(card, open || rows.length === 0);
    rows.push(row);
    rowsEl.append(row.el);
    paintRow(row);
    $(".cb-limit").hidden = rows.length < MAX_ROWS;
    $(".cb-another").disabled = rows.length >= MAX_ROWS;
    if (focus) row.el.querySelector(".cb-word").focus();
    checkRepeats();
    return row;
  }

  function removeRow(row) {
    if (recording && recording.row === row) recording.ctl.stop();
    if (rows.length === 1) {  // the only card: emptied rather than taken away
      const fresh = newRow({}, true);
      rows.splice(0, 1, fresh);
      row.el.replaceWith(fresh.el);
      paintRow(fresh);
      fresh.el.querySelector(".cb-word").focus();
    } else {
      const at = rows.indexOf(row);
      rows.splice(at, 1);
      row.el.remove();
      for (const r of rows) r.el.querySelector(".cb-num").textContent = String(rows.indexOf(r) + 1);
      const next = rows[Math.min(at, rows.length - 1)];
      if (next) next.el.querySelector(".cb-word").focus();
    }
    $(".cb-limit").hidden = rows.length < MAX_ROWS;
    $(".cb-another").disabled = rows.length >= MAX_ROWS;
    checkRepeats();
  }

  // ----- repeats: already saved, or twice in this batch -----
  let repeats = [];
  function checkRepeats() {
    repeats = duplicates(rows.map((r) => r.text), existing().map((v) => v.text));
    for (const r of rows) paintStatus(r);
    countUp();
  }

  function setStatus(row, status) {
    row.status = status;
    paintStatus(row);
  }

  function paintStatus(row) {
    const box = row.el.querySelector(".cb-status");
    const i = rows.indexOf(row);
    const rep = repeats[i] || {};
    box.innerHTML = "";
    box.className = "cb-status";
    if (row.status) {
      box.classList.add(`is-${row.status.kind}`);
      const line = h(`<span class="cb-st">${row.status.kind === "busy" ? `<i class="cb-spin" aria-hidden="true"></i>` : row.status.kind === "ok" ? icon("check", 16) : ""}<span></span></span>`);
      line.querySelector("span:last-child").textContent = row.status.text;
      box.append(line);
    }
    if (rep.saved || rep.sameAs !== undefined) {
      const line = h(`<label class="cb-st cb-dup"><span></span> <span class="cb-anyway-box"><input type="checkbox" class="cb-anyway"> Add anyway</span></label>`);
      line.querySelector("span").textContent = rep.saved ? t("Already in your words.") : t("The same word as card {0}.", rep.sameAs + 1);
      line.querySelector(".cb-anyway").checked = row.anyway;
      box.append(line);
    }
    if (row.audioNote) {
      const line = h(`<span class="cb-st is-error-text"></span>`);
      line.textContent = row.audioNote;
      box.append(line);
    }
    box.hidden = !box.childNodes.length;
    row.el.classList.toggle("is-repeat", !!(rep.saved || rep.sameAs !== undefined) && !row.anyway);
  }

  /** The cards that would be added now, and the button that adds them. */
  function countUp() {
    const n = addable(rows, repeats).length;
    const add = $(".cb-add");
    add.textContent = n ? `Add ${n} card${n === 1 ? "" : "s"}` : "Add cards";
    add.disabled = busy || !n;
    $(".cb-fill").disabled = busy || !n || !addable(rows, repeats).some((r) => needsAny(r, choices));
    const audioRow = $(`.cb-opt[data-opt="audio"]`);
    if (audioRow && choices.audio === "auto" && azureReady(settings())) note(audioRow, "audio");  // (the characters it will use)
  }

  let dirty = false;
  const dirtied = () => { dirty = true; warned = false; footNote(""); countUp(); };
  const hasInput = () => !done && (dirty || rows.some((r) => r.text.trim() || hasValue(r.meaning) || r.audio.word)
    || $(".cb-paste-box").value.trim());

  // ---------------------------------------------------------------- the card's own audio

  function paintAudio(row) {
    const box = row.el.querySelector(".cb-audio");
    box.innerHTML = "";
    const parts = [["word", "Word"], ["sentence", "Sentence"]];
    for (const [which, label] of parts) {
      if (recording && recording.row === row && recording.which === which) {
        const rec = h(`<span class="cb-rec" role="status"><i class="cb-rec-dot" aria-hidden="true"></i><span class="cb-rec-what"></span>
          <span class="cb-rec-time">0:00</span></span>`);
        rec.querySelector(".cb-rec-what").textContent = which === "word" ? t("Recording the word…") : t("Recording the sentence…");
        const stop = h(`<button type="button" class="cb-rec-stop">${icon("stop", 16)} Stop</button>`);
        stop.onclick = () => recording && recording.ctl.stop();
        box.append(rec, stop);
        recording.paint = (level, ms) => {
          rec.style.setProperty("--level", String(level));
          const s = Math.floor(ms / 1000);
          rec.querySelector(".cb-rec-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        };
        continue;
      }
      if (row.audio[`${which}Busy`]) {
        box.append(h(`<span class="cb-rec muted"><i class="cb-spin" aria-hidden="true"></i> Getting it ready…</span>`));
        continue;
      }
      const part = row.audio[which];
      if (part) {
        const chip = h(`<span class="cb-chip"><button type="button" class="ghost cb-play">${icon("play", 15)} <span></span></button>
          <button type="button" class="ghost icon cb-rm">${icon("close", 15)}</button></span>`);
        chip.querySelector(".cb-play span").textContent = `${t(label)} · ${seconds(part).toFixed(1)} s`;
        chip.querySelector(".cb-play").onclick = () => play(part);
        chip.querySelector(".cb-rm").setAttribute("aria-label", which === "word" ? t("Remove the word's audio") : t("Remove the sentence's audio"));
        chip.querySelector(".cb-rm").title = t("Remove");
        chip.querySelector(".cb-rm").onclick = () => {
          row.audio[which] = null;
          if (which === "word") row.audio.sentence = null;  // (a sentence is kept only after its word)
          paintAudio(row);
          if (choices.audio === "auto") note($(`.cb-opt[data-opt="audio"]`), "audio");
        };
        box.append(chip);
        continue;
      }
      // Nothing yet: the word first; the sentence once the word has its audio and the card has a sentence.
      if (which === "sentence" && (!row.audio.word || choices.sentence === "none")) continue;
      const add = h(`<button type="button" class="cb-aud-add">${icon(canRecord() ? "mic" : "upload", 16)} <span></span></button>`);
      add.querySelector("span").textContent = which === "word" ? (canRecord() ? t("Add audio") : t("Choose a sound file")) : t("Add the sentence");
      add.onclick = (e) => {
        if (!canRecord()) { pickFile(row, which); return; }
        const r = e.currentTarget.getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, "", [
          { label: which === "word" ? t("Record the word") : t("Record the sentence"), icon: icon("mic", 16), run: () => record(row, which) },
          { label: t("Choose a sound file"), icon: icon("upload", 16), run: () => pickFile(row, which) },
        ]);
      };
      box.append(add);
    }
  }

  function play(part) {
    try {
      if (player) { player.pause(); URL.revokeObjectURL(player.src); }
      player = new Audio(URL.createObjectURL(previewBlob(part)));
      player.play().catch(() => {});
    } catch { /* nothing to play */ }
  }

  async function record(row, which) {
    if (recording) recording.ctl.stop();
    row.audioNote = null;
    paintStatus(row);
    let me = null;
    try {
      const ctl = await startRecording({ which, onLevel: (level, ms) => me && me.paint && me.paint(level, ms) });
      me = recording = { row, which, ctl, paint: null };
      paintAudio(row);
      const blob = await ctl.done;
      if (recording === me) recording = null;
      await usePart(row, which, blob);
    } catch (err) {
      if (recording === me) recording = null;
      row.audioNote = err && err.message ? err.message : String(err);
      paintAudio(row);
      paintStatus(row);
    }
  }

  function pickFile(row, which) {
    const input = h(`<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.webm" hidden>`);
    input.onchange = () => {
      const file = input.files && input.files[0];
      input.remove();
      if (file) usePart(row, which, file);
    };
    document.body.append(input);
    input.click();  // (still inside the tap, so a phone lets the file chooser open)
  }

  async function usePart(row, which, blob) {
    row.audio[`${which}Busy`] = true;
    row.audioNote = null;
    paintAudio(row);
    try {
      const part = await partFrom(blob, which);
      row.audio[which] = part;
      if (part.cut) row.audioNote = t("Only the first {0} seconds are kept.", MAX_SECONDS[which]);
      dirtied();
    } catch (err) {
      row.audioNote = err && err.message ? err.message : String(err);
    } finally {
      row.audio[`${which}Busy`] = false;
      paintAudio(row);
      paintStatus(row);
      if (choices.audio === "auto") note($(`.cb-opt[data-opt="audio"]`), "audio");
    }
  }

  // ---------------------------------------------------------------- pasting a list

  const pasteBox = $(".cb-paste-box");
  const meaningWord = t("its meaning");
  pasteBox.placeholder = [`${info.word} – ${meaningWord}`, `${info.word} = ${meaningWord}`, `${info.word}; ${meaningWord}; ${t("a sentence")}`, info.word].join("\n");
  let pasted = { cards: [], total: 0, cut: false };
  function preview() {
    pasted = parseList(pasteBox.value, { lang, max: MAX_ROWS });
    const box = $(".cb-preview");
    box.innerHTML = "";
    $(".cb-use").disabled = !pasted.cards.length;
    if (!pasted.cards.length) return;
    const saved = duplicates(pasted.cards.map((c) => c.text), existing().map((v) => v.text));
    const head = h(`<p class="cb-pv-count"><strong></strong></p>`);
    head.querySelector("strong").textContent = `${pasted.cards.length} card${pasted.cards.length === 1 ? "" : "s"}`;
    if (pasted.cut) head.append(" ", h(`<span class="muted">Only the first 100 are used: at most 100 cards can be added at a time.</span>`));
    box.append(head);
    const list = h(`<ol class="cb-pv"></ol>`);
    pasted.cards.forEach((c, i) => {
      const li = h(`<li><span class="cb-pv-word ar" ${langAttrs(lang)}></span><span class="cb-pv-rest" dir="auto"></span></li>`);
      li.querySelector(".cb-pv-word").textContent = c.text;
      li.querySelector(".cb-pv-rest").textContent = [c.meaning, c.sentence, clean(c.translation)].filter(Boolean).join(" · ");
      if (saved[i].saved || saved[i].sameAs !== undefined) {
        const tag = h(`<span class="cb-pv-tag"></span>`);
        tag.textContent = saved[i].saved ? t("Already saved") : t("Twice in the list");
        li.append(tag);
      }
      list.append(li);
    });
    box.append(list);
  }
  pasteBox.oninput = () => { preview(); dirty = true; };
  $(".cb-use").onclick = () => {
    if (!pasted.cards.length) return;
    // The empty card shown at the start is replaced; otherwise the list's cards come after the others.
    if (rows.length === 1 && !rows[0].text.trim() && !hasValue(rows[0].meaning)) { rows[0].el.remove(); rows.length = 0; }
    const room = MAX_ROWS - rows.length;
    pasted.cards.slice(0, room).forEach((c, i) => addRow(c, { open: rows.length === 0 && i === 0, focus: false }));
    if (pasted.cards.length > room) toast(t("Only {0} of them fit: at most 100 cards can be added at a time.", Math.max(0, room)));
    pasteBox.value = "";
    preview();
    setMode("one");
    dirty = true;
    checkRepeats();
  };

  function setMode(m) {
    mode = m;
    for (const b of box.querySelectorAll(".cb-modes .seg-btn")) {
      b.classList.toggle("on", b.dataset.mode === m);
      b.setAttribute("aria-selected", String(b.dataset.mode === m));
    }
    $(".cb-one").hidden = m !== "one";
    $(".cb-paste").hidden = m !== "paste";
    if (m === "paste") pasteBox.focus();
  }
  for (const b of box.querySelectorAll(".cb-modes .seg-btn")) b.onclick = () => setMode(b.dataset.mode);

  // ---------------------------------------------------------------- filling in

  const footNote = (text, kind = "") => {
    const p = $(".cb-foot-note");
    p.textContent = text;
    p.className = `cb-foot-note small${kind ? ` is-${kind}` : ""}`;
    p.hidden = !text;
  };

  /** Fill in what the choices say is the app's to fill, for these rows: meanings from the dictionary
   * (by the lookup setting), then one AI request per AI_CHUNK words for the rest. Each row shows how
   * it went. Resolves when all is done. */
  async function fill(list) {
    const cfg = definerConfig();
    const ai = aiReady();
    const todo = list.filter((r) => needsAny(r, choices));
    if (!todo.length) return;
    for (const r of todo) setStatus(r, { kind: "busy", text: t("Filling in…") });

    // 1. Meanings from the built-in dictionary first, where the lookup setting says so.
    const forAi = [];
    for (const r of todo) {
      const want = needs(r, choices);
      let dictionaryFailed = "";
      if (want.meaning && usesDictionary()) {
        try {
          const d = await dictionaryDefine({ word: r.text.trim(), lang, marked: "" }, { quick: true, language: cfg.language });
          r.meaning = fillIn(r.meaning, d && d.meaning);
        } catch (err) {
          dictionaryFailed = err && err.message === NO_MEANINGS
            ? t("The built-in dictionary isn't on this device yet: download it under Meaning, or type the meaning.")
            : t("This word isn't in the built-in dictionary. Type its meaning.");
        }
      }
      const still = needs(r, choices);
      if (ai && (still.meaning || still.sentence || still.translation)) forAi.push(r);
      else if (still.meaning) setStatus(r, { kind: "error", text: dictionaryFailed || t("No meaning was found. Type its meaning.") });
      else setStatus(r, null);
      paintRow(r);
    }

    // 2. The AI: one request for many words, a few requests at a time.
    await pool(chunks(forAi, AI_CHUNK), 2, async (group) => {
      const items = group.map((r) => {
        const want = needs(r, choices);
        return { word: r.text.trim(), meaning: r.meaning.value.trim(), sentence: hasValue(r.sentence) ? r.sentence.value.trim() : "", want };
      });
      let answers;
      try {
        answers = readBatch(await askAi(batchPrompt(items, { study: info.name, speaks: cfg.language || "English" })), items);
      } catch (err) {
        const text = err && err.message ? err.message : String(err);
        for (const r of group) setStatus(r, { kind: "error", text });
        return;
      }
      group.forEach((r, i) => {
        const a = answers[i];
        if (!a) { setStatus(r, { kind: "error", text: t("The AI sent nothing back for this word. Press Fill in to try again.") }); return; }
        const want = items[i].want;
        if (want.meaning) r.meaning = fillIn(r.meaning, a.meaning);
        if (want.sentence) r.sentence = fillIn(r.sentence, a.sentence);
        if (want.translation) r.translation = fillIn(r.translation, a.translation);
        const left = needs(r, choices);
        setStatus(r, left.meaning || left.sentence ? { kind: "error", text: t("Part of it couldn't be filled in. Type it, or press Fill in to try again.") } : null);
        paintRow(r);
      });
    });
  }

  $(".cb-fill").onclick = async () => {
    if (busy) return;
    busy = true;
    countUp();
    footNote(t("Filling in…"));
    try {
      await fill(addable(rows, repeats));
      const bad = rows.filter((r) => r.status && r.status.kind === "error").length;
      footNote(bad ? t("{0} of the cards need a look: see the red notes.", bad) : t("Filled in. Look them over, then add them."), bad ? "error" : "");
    } finally {
      busy = false;
      countUp();
    }
  };

  // ---------------------------------------------------------------- adding

  $(".cb-add").onclick = async () => {
    if (busy) return;
    const list = addable(rows, repeats);
    if (!list.length) return;
    busy = true;
    countUp();
    try {
      // 1. Whatever is still the app's to fill and empty.
      if (list.some((r) => needsAny(r, choices))) {
        footNote(t("Filling in…"));
        await fill(list);
      }
      const troubled = list.filter((r) => r.status && r.status.kind === "error");
      if (troubled.length && !warned) {
        warned = true;
        for (const r of troubled) { r.open = true; paintRow(r); }
        troubled[0].el.scrollIntoView({ block: "center", behavior: "smooth" });
        footNote(t("{0} of the cards need a look (the red notes). Press Add again to add them as they are.", troubled.length), "error");
        return;
      }
      // 2. The cards themselves, all in one go.
      footNote(t("Adding…"));
      for (const r of list) setStatus(r, { kind: "busy", text: t("Adding…") });
      const answer = await api("/vocab/batch", { method: "POST", body: { cards: list.map((r) => cardOf(r, { choices, folder: choices.folder })) } });
      const cards = (answer && answer.cards) || [];
      list.forEach((r, i) => { r.saved = cards[i] || null; setStatus(r, { kind: "ok", text: t("Added") }); });
      done = true;
      // 3. Their audio: the learner's own recordings, then voices made now (Azure). A few at a time.
      const problems = [];
      const own = choices.audio !== "none" ? list.filter((r) => r.saved && r.audio.word) : [];
      const voiced = choices.audio === "auto" && azureReady(settings()) ? list.filter((r) => r.saved && !r.audio.word) : [];
      if (own.length || voiced.length) footNote(t("Keeping their audio…"));
      await pool(own, 2, async (r) => {
        setStatus(r, { kind: "busy", text: t("Keeping its audio…") });
        try {
          const made = await cardAudio({ word: r.audio.word, sentence: choices.sentence === "none" ? null : r.audio.sentence });
          const kept = await saveRecording(r.saved.id, made.blob, made.times);
          r.saved.voice = (kept && kept.voice) || JSON.stringify(made.times);
          setStatus(r, { kind: "ok", text: t("Added, with your audio") });
        } catch (err) {
          problems.push(r);
          setStatus(r, { kind: "error", text: t("Added, but its audio couldn't be kept: {0}", t(err && err.message ? err.message : String(err))) });
        }
      });
      const make = voiceMaker(settings());
      await pool(voiced, 3, async (r) => {
        setStatus(r, { kind: "busy", text: t("Making its voice…") });
        try {
          if (make) await make(r.saved);
          setStatus(r, { kind: "ok", text: t("Added, with its voice") });
        } catch (err) {
          problems.push(r);
          setStatus(r, { kind: "error", text: t("Added, but its voice couldn't be made: {0} This device's voice reads it meanwhile.", t(err && err.message ? err.message : String(err))) });
        }
      });
      onAdded(cards);
      const n = cards.length, skipped = rows.filter((r) => r.text.trim()).length - list.length;
      if (!problems.length) {
        sheet.close();
        toast(skipped ? `Added ${n} card${n === 1 ? "" : "s"}. ${skipped} repeated word${skipped === 1 ? " was" : "s were"} left out.`
          : `Added ${n} card${n === 1 ? "" : "s"}.`);
        return;
      }
      showResult(cards.length, problems);
    } catch (err) {
      footNote(err && err.message ? err.message : String(err), "error");
      for (const r of list) if (r.status && r.status.kind === "busy") setStatus(r, null);
    } finally {
      busy = false;
      countUp();
    }
  };

  /** Added, but some audio couldn't be kept or made: say so card by card, then close. */
  function showResult(n, problems) {
    sheet.setTitle(t("Added"));
    sheet.body.innerHTML = "";
    const res = h(`<div class="cb-result">
      <span class="cb-result-ico">${icon("check", 30)}</span>
      <p class="cb-result-head"></p>
      <ul class="cb-result-list"></ul>
      <p class="small muted">You can make their voices later in Settings → Card voices → Make them now.</p>
    </div>`);
    res.querySelector(".cb-result-head").textContent = `Added ${n} card${n === 1 ? "" : "s"}. The audio of ${problems.length} couldn't be kept or made:`;
    for (const r of problems) {
      const li = h(`<li><span class="ar" ${langAttrs(lang)}></span><span class="muted"></span></li>`);
      li.querySelector(".ar").textContent = r.text.trim();
      li.querySelector(".muted").textContent = r.status ? r.status.text : "";
      res.querySelector("ul").append(li);
    }
    sheet.body.append(res);
    foot.innerHTML = "";
    const close = h(`<div class="cb-foot-buttons"><button type="button" class="primary cb-done">Done</button></div>`);
    close.querySelector("button").onclick = () => sheet.close();
    foot.append(close);
    close.querySelector("button").focus();
  }

  // ---------------------------------------------------------------- closing

  async function beforeClose() {
    if (busy && !done) return false;  // (adding: wait for it to finish)
    if (!hasInput()) return true;
    return confirmBox(t("Leave without adding?"), t("What you typed here isn't saved yet, and will be lost."), { ok: t("Leave"), danger: true });
  }

  function cleanUp() {
    if (recording) { try { recording.ctl.stop(); } catch { /* gone */ } recording = null; }
    if (player) { player.pause(); try { URL.revokeObjectURL(player.src); } catch { /* gone */ } }
  }

  // ---------------------------------------------------------------- start

  $(".cb-another").onclick = () => addRow();
  drawOptions();
  addRow({}, { open: true });
  meaningsStatus(lang).then((st) => { dict = st; paintOptions(); }, () => {});
  return sheet;
}
