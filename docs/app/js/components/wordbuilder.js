// "Add words": the Vocab page's card builder (its "Add words" button and ⋯ menu). Every version has it.
//
// One card or many at once, typed one by one, pasted as a list, or scanned from a photo of a list
// (components/wordscan.js: its words become rows exactly as a pasted list's do), with as much or as little done for
// the learner as they like: for each part of the cards ("For these cards") the app fills it in, leaves
// it out, or the learner types it. Whatever the learner typed is never replaced (addwords.js).
//   - Meanings: the learner's lookup setting (Settings → Word definitions): the built-in dictionary,
//     the AI, or the dictionary first and the AI for the words it hasn't got.
//   - Example sentences and their translations: the learner's AI (one request for many words); with no AI,
//     or Free chosen in Settings → Word definitions (helpersource.js aiMakes), a real sentence from Tatoeba
//     or Wiktionary with its English translation (examples.js, downloaded once).
//   - A mnemonic in Memorization notes: keywords that sound like the word, with a picture for its meaning:
//     the AI's when it makes them (the same choice), else made on the device (examples.js freeMnemonics,
//     the review card's free Mnemonic maker).
//   - Audio: the card voice chosen in Settings → Card voices (made and kept now with Azure; the
//     computer makes it with "My computer"; the device's voice says it live), or the learner's own
//     recording or sound file for each card (cardaudio.js), kept with the card like a voice.
// A card can be a phrase ("por favor", "إن شاء الله", addwords.js entryKind): its meaning is the dictionary's entry
// for the whole phrase, else the AI's for it as one unit, else (no AI) word by word, marked so; a phrase that is
// a sentence already is its own example; a long one gets no mnemonic (sound-alikes suit short ones).
// "Fill in" does the automatic parts now, so they can be looked over (and changed) before adding;
// "Add N cards" does whatever is left, saves them all (POST /vocab/batch), keeps their audio and closes.
//
// Looks: plain solid surfaces, one centred column; on a phone a full-height sheet, on a computer a
// centred box (app.css "Add words").

import { api, esc, h, platform, saveRecording, showMenu, state, toast } from "../app.js";
import { icon } from "../icons.js";
import { UI_LANGUAGES, t, uiLanguage } from "../i18n.js";
import { langAttrs, langInfo, studyLanguage } from "../languages.js";
import { askName, openModal } from "./modal.js";
import { confirmBox } from "./settingsui.js";
import { AI_CHUNK, MAX_ROWS, addable, bareText, batchPrompt, cardOf, chunks, cleanChoices, coreText, duplicates, edited, entryKind,
         fillIn, firstSense, hasValue, mnemonicFits, needs, needsAny, needsMemo, parseList, pool, readBatch, typed, usableSense,
         wordByWord, wordKey, wordsIn } from "../addwords.js";
import { NO_EXAMPLES, OWN_KEYWORDS, examplesOf, freeExample, freeMnemonics } from "../examples.js";
import { makeMnemonics, noteText, varietyOf } from "../review/mnemonic.js";
import { learnsOwn, ownExamples } from "../review/ownmnemonic.js";
import { learnFromNote } from "../review/cardtools.js";
import { sortFolders } from "../review/vocabedit.js";
import { askAi, askMnemonic, definerConfig, noAi } from "../define-service.js";
import { aiMakes, chosenSource } from "../helpersource.js";
import { pickedCountry } from "../youtube-home.js";
import { definerModeOf } from "../definer.js";
import { NO_MEANINGS, dictionaryDefine, downloadMeanings, meaningsStatus } from "../meanings.js";
import { azureReady, voiceChars, voiceMode } from "../cardvoice.js";
import { voiceMaker } from "../voiceplay.js";
import { MAX_SECONDS, canRecord, cardAudio, partFrom, previewBlob, seconds, startRecording } from "../cardaudio.js";
import { scanPanel } from "./wordscan.js";
import { offerFix } from "./fixit.js";

const CHOICES_KEY = "tk_addwords";  // this device's choices for "For these cards"
const settings = () => (state.status && state.status.settings) || {};
const lsGet = () => { try { return JSON.parse(localStorage.getItem(CHOICES_KEY) || "{}"); } catch { return {}; } };
const lsSet = (v) => { try { localStorage.setItem(CHOICES_KEY, JSON.stringify(v)); } catch { /* storage off */ } };

const AI_SETTINGS = "#/settings?s=words&show=key";
const MODE_SETTINGS = "#/settings?s=words&show=mode";
// Who makes example sentences and mnemonics, Free or AI (Settings → Word definitions, components/freehelpers.js).
const SOURCE_SETTINGS = { sentence: "#/settings?s=words&show=sentencesource", mnemonic: "#/settings?s=words&show=mnemonicsource" };
const AZURE_SETTINGS = "#/settings?s=voices&show=azurekey";

/** The words for each choice (the segmented buttons). */
const OPTIONS = {
  meaning: { label: "Meaning", items: [["auto", "Fill in for me"], ["type", "I'll type it"]] },
  sentence: { label: "Example sentence", items: [["auto", "Write one for me"], ["none", "No sentence"], ["type", "I'll type it"]] },
  audio: { label: "Audio", items: [["auto", "Make it for me"], ["none", "No audio"], ["own", "I'll add my own"]] },
  mnemonic: { label: "Mnemonic", items: [["auto", "Make one for me"], ["none", "No mnemonic"]] },
};

const clean = (s) => String(s ?? "").replace(/[⟦⟧]/g, "");

// (The small box asking for a new folder's name is modal.js askName, shared with the Vocab page.)

/**
 * Open the builder. `existing()` gives the saved words (to find repeats), `folders` the folders
 * ([{uid, name}]), `folder` the one open on the Vocab page (its cards go there unless another is
 * chosen). `onFolder(folder)` hears of a folder made here; `onAdded(cards)` gets the cards once added.
 * `mode` is the way in it opens on: "one" (one by one), "paste" or "scan" (the ⋯ menu's "Scan words").
 */
export function openWordBuilder({ existing = () => [], folders = [], folder = "", onFolder = () => {}, onAdded = () => {}, mode: startMode = "one" } = {}) {
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

  const body = h(`<div class="cb">
    <div class="segmented cb-modes" role="tablist" aria-label="How to enter the words">
      <button type="button" class="seg-btn on" role="tab" aria-selected="true" data-mode="one">${icon("edit", 16)} One by one</button>
      <button type="button" class="seg-btn" role="tab" aria-selected="false" data-mode="paste">${icon("list", 16)} Paste a list</button>
      <button type="button" class="seg-btn" role="tab" aria-selected="false" data-mode="scan">${icon("camera", 16)} Scan</button>
    </div>
    <div class="cb-scan-wrap" hidden></div>
    <div class="cb-one">
      <div class="cb-rows"></div>
      <button type="button" class="ghost cb-another">${icon("plus", 18)} Another word</button>
      <p class="small muted cb-limit" hidden>At most 100 cards can be added at a time.</p>
    </div>
    <div class="cb-paste" hidden>
      <textarea class="cb-paste-box" rows="7" dir="auto" spellcheck="false" aria-label="Your list, one card per line"></textarea>
      <p class="small muted cb-paste-help">One card per line: a word or a phrase. After it you can add its meaning with a dash, an equals sign or a semicolon (<span translate="no">word – meaning</span>), or paste columns from a spreadsheet: word, meaning, sentence, translation.</p>
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
  // Example sentences and mnemonics: the AI's only when it can be used and the learner hasn't chosen Free
  // (helpersource.js aiMakes). The meaning lookup keeps to aiReady and the lookup setting.
  const makes = (kind) => aiMakes(settings(), kind, aiReady());
  /** Chose Free although the AI could make them: the note then has the way to that choice. */
  const freeChosen = (kind) => aiReady() && chosenSource(settings(), kind) === "free";
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
            folderList = sortFolders([...folderList, made]);
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
    for (const key of Object.keys(OPTIONS)) {
      const row = $(`.cb-opt[data-opt="${key}"]`);
      for (const b of row.querySelectorAll("button")) {
        const on = b.dataset.value === choices[key];
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
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
      // With no AI: real sentences people wrote (Tatoeba, Wiktionary), downloaded once.
      if (!makes("sentence") && choices.sentence === "auto") {
        // (chose Free in Settings: the way back to that choice; AI off: to AI's mode; no key: to setting one up)
        html = freeChosen("sentence") ? `A real sentence that uses the word, from Tatoeba or Wiktionary, with its English translation. <a href="${SOURCE_SETTINGS.sentence}" class="cb-go">AI can write them instead</a>`
          : noAi() ? `A real sentence that uses the word, from Tatoeba or Wiktionary, with its English translation. <a href="${MODE_SETTINGS}" class="cb-go">AI can write them instead</a>`
          : `A real sentence that uses the word, from Tatoeba or Wiktionary, with its English translation. <a href="${AI_SETTINGS}" class="cb-go">Set up AI</a> to have them written for you.`;
      } else if (choices.sentence === "auto") html = "A short sentence that uses the word the way a native speaker would, with its translation.";
    } else if (key === "mnemonic") {
      if (choices.mnemonic === "auto" && makes("mnemonic")) {
        html = "Words that sound like the word, each with a picture for its meaning, put in Memorization notes. Made by your AI.";
      } else if (choices.mnemonic === "auto") {
        const own = OWN_KEYWORDS.has(uiLanguage()) && uiLanguage() !== lang;
        // (chose Free in Settings although the AI could make them: the way back to that choice)
        html = freeChosen("mnemonic")
          ? (own ? `Words of your language that sound like the word, each with a picture for its meaning, put in Memorization notes. Made on this device, with no AI. <a href="${SOURCE_SETTINGS.mnemonic}" class="cb-go">AI can make them instead</a>`
            : `English words that sound like the word, each with a picture for its meaning, put in Memorization notes. Made on this device, with no AI. <a href="${SOURCE_SETTINGS.mnemonic}" class="cb-go">AI can make them instead</a>`)
          : own ? "Words of your language that sound like the word, each with a picture for its meaning, put in Memorization notes. Made on this device, with no AI."
          : "English words that sound like the word, each with a picture for its meaning, put in Memorization notes. Made on this device, with no AI.";
      }
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
      memo: typed(card.memo || ""),
      audio: { word: null, sentence: null },
      open,
      anyway: false,
      status: null,  // {kind: "busy" | "error" | "ok", text}
      audioNote: null,
      fillNotes: {},     // {meaning, memo}: a line about what Fill in put there (a phrase's meaning word by word…)
      kind: "word",      // "word", "phrase" or "sentence" (addwords.js entryKind), worked out when filling in
      meaningPos: "",    // the dictionary entry's part of speech ("intj"…), for the mnemonic's picture line
      meaningFrom: "",   // "entry" (the dictionary's for the whole card), "words" (word by word), "ai"
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
        <textarea class="cb-word ar" rows="1" ${study} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="200"></textarea>
        <span class="cb-sum" dir="auto"></span>
        <button type="button" class="ghost icon cb-open" aria-expanded="false">${icon("chevron", 18)}</button>
        <button type="button" class="ghost icon cb-del">${icon("trash", 18)}</button>
      </div>
      <div class="cb-body">
        <label class="cb-field" data-f="meaning"><span class="cb-label">Meaning</span>
          <span class="cb-in"><textarea class="cb-meaning" rows="1" dir="auto" autocomplete="off" maxlength="500"></textarea><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <label class="cb-field cb-sent" data-f="sentence"><span class="cb-label">Example sentence</span>
          <span class="cb-in"><textarea class="cb-sentence ar" rows="1" ${study} maxlength="1000"></textarea><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <label class="cb-field cb-sent" data-f="translation"><span class="cb-label">Sentence translation</span>
          <span class="cb-in"><textarea class="cb-translation" rows="1" dir="auto" maxlength="1000"></textarea><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <label class="cb-field" data-f="notes"><span class="cb-label">Notes</span>
          <span class="cb-in"><input type="text" class="cb-notes" dir="auto" autocomplete="off" maxlength="2000" placeholder="Optional: grammar, usage, where you heard it"></span></label>
        <label class="cb-field" data-f="memo"><span class="cb-label">Memorization notes</span>
          <span class="cb-in"><textarea class="cb-memo" rows="1" dir="auto" maxlength="2000"></textarea><i class="cb-auto" aria-hidden="true">auto</i></span></label>
        <div class="cb-field cb-audio-field"><span class="cb-label">Audio</span><div class="cb-audio"></div></div>
      </div>
      <div class="cb-status" hidden></div>
    </div>`);
    const word = el.querySelector(".cb-word");
    word.placeholder = info.wordOrPhrase || info.word;  // (in the language being learned: "palabra o frase")
    word.setAttribute("aria-label", t("Word or phrase"));
    word.value = row.text;
    el.querySelector(".cb-open").setAttribute("aria-label", t("Show the rest of this card"));
    el.querySelector(".cb-del").setAttribute("aria-label", t("Take this card out"));
    el.querySelector(".cb-del").title = t("Take this card out");
    const sentence = el.querySelector(".cb-sentence");
    sentence.setAttribute("aria-label", t("Example sentence"));
    for (const f of ["meaning", "sentence", "translation", "memo"]) {
      const input = el.querySelector(`.cb-${f}`);
      input.oninput = () => {
        row[f] = edited(input.value);  // from now on it is the learner's: never filled in over
        if (f === "meaning") { row.meaningPos = ""; row.meaningFrom = ""; }
        if (row.fillNotes[f]) { delete row.fillNotes[f]; paintStatus(row); }  // (a note about what was filled in)
        paintField(row, f);
        if (f === "meaning") paintSummary(row);
        if (input.tagName === "TEXTAREA") grow(input);
        if (row.status && row.status.kind === "error") setStatus(row, null);
        dirtied();
      };
    }
    el.querySelector(".cb-notes").value = row.notes;
    el.querySelector(".cb-notes").oninput = (e) => { row.notes = e.target.value; dirtied(); };
    // (The word box and the meaning box wrap a long phrase onto more lines, but stay one line of text: Enter
    // moves on, and a line break pasted in becomes a space.)
    el.querySelector(".cb-meaning").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) e.preventDefault(); });
    el.querySelector(".cb-meaning").addEventListener("input", (e) => {  // (before oninput below, which keeps the value)
      if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, " ");
    }, true);
    word.oninput = () => {
      if (/[\r\n]/.test(word.value)) word.value = word.value.replace(/\s*[\r\n]+\s*/g, " ");
      grow(word);
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
    const wants = f === "meaning" ? choices.meaning === "auto" : f === "memo" ? choices.mnemonic === "auto" : choices.sentence === "auto";
    const found = !makes("sentence");  // (with no AI, or Free chosen, the sentence is found, not written)
    const ph = {
      meaning: wants ? "Filled in for you" : "Its meaning",
      sentence: wants ? (found ? "Found for you" : "Written for you") : "A sentence that uses it",
      translation: wants ? (found ? "Found for you" : "Written for you") : "The sentence in your language",
      // (with "Learn from my own mnemonics" on, a mnemonic typed here teaches the maker: its sound-alike in CAPITALS)
      memo: wants ? "A mnemonic made for you" : learnsOwn(settings()) ? "Sound-alike in CAPITALS: a duck sitting on a POT…" : "A mnemonic, a picture",
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
    for (const f of ["meaning", "sentence", "translation", "memo"]) paintField(row, f);
    grow(el.querySelector(".cb-word"));  // (a phrase on more lines than one)
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

  /** "Download the dictionary" in a row's message: downloads it, then fills in every row still waiting for a meaning. */
  function dictButton() {
    const mb = dict && dict.bytes ? Math.max(1, Math.round(dict.bytes / 1e6)) : 0;
    const b = h(`<button type="button" class="primary cb-getdict-row">${icon("import", 16)}<span></span></button>`);
    b.querySelector("span").textContent = mb ? t("Download the dictionary ({0} MB)", mb) : t("Download the dictionary");
    b.onclick = async () => {
      for (const x of document.querySelectorAll(".cb-getdict-row")) { x.disabled = true; }
      b.querySelector("span").textContent = t("Downloading…");
      try {
        await downloadMeanings(lang);
        dict = await meaningsStatus(lang).catch(() => null);
        paintOptions();
        const waiting = rows.filter((r) => r.status && r.status.getDict);
        if (waiting.length) await fill(waiting);
      } catch (err) {
        toast(err.message || String(err), { error: true });
        for (const r of rows) if (r.status && r.status.getDict) paintStatus(r);
      }
    };
    return b;
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
      // No dictionary on this device yet: download it from here, then fill in the meanings (the owner: "a button should
      // just show up to allow them to download it right there, no sending users through navigations").
      if (row.status.getDict) box.append(dictButton());
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
    for (const text of Object.values(row.fillNotes)) {
      const line = h(`<span class="cb-st cb-fill-note"></span>`);
      line.textContent = text;
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
    || $(".cb-paste-box").value.trim() || (scan && scan.hasInput()));

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
      if (err && err.kind === "mic") offerFix("mic");  // the popup with the way to allow it
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
  pasteBox.placeholder = [`${info.word} – ${meaningWord}`, `${info.word} = ${meaningWord}`, `${info.word}; ${meaningWord}; ${t("a sentence")}`,
    info.wordOrPhrase || info.word].join("\n");
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
  /** Cards from a pasted list or a photo become rows (typed = the learner's own), after the others. */
  function useCards(cards) {
    // The empty card shown at the start is replaced; otherwise the list's cards come after the others.
    if (rows.length === 1 && !rows[0].text.trim() && !hasValue(rows[0].meaning)) { rows[0].el.remove(); rows.length = 0; }
    const room = MAX_ROWS - rows.length;
    cards.slice(0, room).forEach((c, i) => addRow(c, { open: rows.length === 0 && i === 0, focus: false }));
    if (cards.length > room) toast(t("Only {0} of them fit: at most 100 cards can be added at a time.", Math.max(0, room)));
    setMode("one");
    dirty = true;
    checkRepeats();
  }
  $(".cb-use").onclick = () => {
    if (!pasted.cards.length) return;
    const cards = pasted.cards;
    pasteBox.value = "";
    preview();
    useCards(cards);
  };

  // ----- scanning a photo (components/wordscan.js), made the first time Scan is chosen -----
  let scan = null;
  function scanner() {
    if (!scan) {
      scan = scanPanel({
        lang, existing,
        onUse: (cards) => useCards(cards),
        onText: (text) => {  // "Edit as text": the paste box, with anything already in it kept
          const before = pasteBox.value.replace(/\s+$/, "");
          pasteBox.value = before ? `${before}\n${text}` : text;
          preview();
          dirty = true;
          setMode("paste");
        },
        onDirty: () => { dirty = true; },
        goTo: async (hash) => {  // going to Settings closes the builder (asking first when something would be lost)
          if (!(await beforeClose())) return;
          done = true;
          sheet.close();
          location.hash = hash;
        },
      });
      $(".cb-scan-wrap").append(scan.el);
    }
    return scan;
  }

  function setMode(m) {
    mode = m;
    for (const b of box.querySelectorAll(".cb-modes .seg-btn")) {
      b.classList.toggle("on", b.dataset.mode === m);
      b.setAttribute("aria-selected", String(b.dataset.mode === m));
    }
    $(".cb-one").hidden = m !== "one";
    $(".cb-paste").hidden = m !== "paste";
    $(".cb-scan-wrap").hidden = m !== "scan";
    if (m === "one") for (const r of rows) grow(r.el.querySelector(".cb-word"));  // (sized while hidden: again now)
    if (m === "paste") pasteBox.focus();
    if (m === "scan") scanner().shown();
  }
  for (const b of box.querySelectorAll(".cb-modes .seg-btn")) b.onclick = () => setMode(b.dataset.mode);

  // A picture dropped anywhere on the builder (or beside it: the window would otherwise open the picture
  // in place of the app), or pasted (Ctrl+V) anywhere in it, is scanned.
  const pictures = (list) => [...(list || [])].filter((f) => f && /^image\//.test(f.type || ""));
  const hasPicture = (dt) => !!dt && [...(dt.items || [])].some((i) => i.kind === "file" && /^image\//.test(i.type || ""));
  sheet.el.addEventListener("dragover", (e) => {
    if (!hasPicture(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    box.classList.add("cb-dropping");
  });
  sheet.el.addEventListener("dragleave", (e) => { if (!sheet.el.contains(e.relatedTarget)) box.classList.remove("cb-dropping"); });
  sheet.el.addEventListener("drop", (e) => {
    box.classList.remove("cb-dropping");
    const files = pictures(e.dataTransfer && e.dataTransfer.files);
    if (!files.length) return;
    e.preventDefault();
    setMode("scan");
    scanner().take(files);
  });
  const onPaste = (e) => {
    if (!sheet.el.isConnected || busy) return;
    const files = pictures([...((e.clipboardData && e.clipboardData.items) || [])].filter((i) => i.kind === "file").map((i) => i.getAsFile()));
    if (!files.length) return;
    // (A picture pasted while typing in a box would do nothing there: it is scanned too.)
    e.preventDefault();
    setMode("scan");
    scanner().take(files);
  };
  document.addEventListener("paste", onPaste);

  // ---------------------------------------------------------------- filling in

  const footNote = (text, kind = "") => {
    const p = $(".cb-foot-note");
    p.textContent = text;
    p.className = `cb-foot-note small${kind ? ` is-${kind}` : ""}`;
    p.hidden = !text;
  };

  /** A line under a card about what Fill in put in one of its fields ("" takes it away). */
  function setNote(row, field, text) {
    if (text) row.fillNotes[field] = text;
    else delete row.fillNotes[field];
    paintStatus(row);
  }

  /** The card's meaning, for finding a sentence of that sense and picturing it in a mnemonic: none when it is
   * the app's word-by-word guess at a phrase (its words would mislead both). */
  const meaningOf = (r) => (r.meaningFrom === "words" && r.meaning.auto ? "" : r.meaning.value);

  /**
   * A card's meaning from the built-in dictionary: {meaning, pos, from: "entry" | "words"}. A word as written,
   * then its core ("der Hund, -e": Hund). A phrase: only an entry for the whole phrase ("por favor", "darse
   * cuenta", "إن شاء الله"; in Japanese, Chinese and Thai also the whole as one word), and with `byWords` (no AI
   * to ask) else its words one by one, the longest runs with an entry first (addwords.js wordByWord). Throws
   * NO_MEANINGS when the dictionary isn't on this device, and an error when nothing was found.
   */
  async function dictionaryMeaning(text, { phrase = false, byWords = false } = {}) {
    const language = definerConfig().language;
    const ask = (word, several = false, quick = true) => dictionaryDefine({ word, lang, marked: "", ...(several ? { phrase: true } : {}) }, { quick, language });
    const bare = bareText(text) || text, core = coreText(text, lang);
    const tries = phrase ? [[bare, true], ...(info.unspaced ? [[bare, false]] : [])] : [[text, false], ...(core && core !== text ? [[core, false]] : [])];
    for (const [word, several] of tries) {
      try {
        const d = await ask(word, several);
        if (d && d.meaning) return { meaning: d.meaning, pos: d.pos || "", from: "entry" };
      } catch (err) { if (err && err.message === NO_MEANINGS) throw err; }
    }
    if (phrase && byWords) {
      // (all of a word's senses: its first may be no use here, "de" is first the letter D)
      const look = async (word, several) => {
        const sense = await ask(word, several, false).then((d) => usableSense(d ? [d.meaning, ...(d.other_meanings || [])] : []), () => "");
        // Arabic, Persian: "and" written onto a run of words (والحمد لله): the run's own entry, with "and" before it
        if (!sense && several && (lang === "ar" || lang === "fa") && /^و\S{2,}/u.test(word)) {
          const rest = await look(word.slice(1), true);
          return rest ? `and ${rest}` : "";
        }
        return sense;
      };
      const got = await wordByWord(wordsIn(bare, lang), look, { lang, all: !!info.unspaced });
      if (got) return { meaning: t("Word by word: {0}", got.literal), pos: "", from: "words" };
    }
    throw new Error("NOT_FOUND");
  }

  /** Fill in what the choices say is the app's to fill, for these rows: meanings from the dictionary
   * (by the lookup setting), then one AI request per AI_CHUNK words for the rest. Each row shows how
   * it went. Resolves when all is done. */
  async function fill(list) {
    const cfg = definerConfig();
    const ai = aiReady();                  // meanings: the AI, by the lookup setting
    const aiSentences = makes("sentence");  // sentences: the AI's, unless Free was chosen (else found below)
    const aiMnemonics = makes("mnemonic");
    // What the AI is asked for a row: with Free sentences, no sentence (and a translation only of a sentence it has).
    const askFor = (r) => {
      const want = needs(r, choices);
      return aiSentences ? want : { ...want, sentence: false, translation: want.translation && hasValue(r.sentence) };
    };
    // A word, a phrase, or a phrase that is a sentence already (addwords.js entryKind). That last one is its own
    // example: nothing is looked for or written for it (only its translation is).
    for (const r of list) {
      r.kind = entryKind(r.text, lang);
      if (r.kind === "sentence" && choices.sentence === "auto" && !hasValue(r.sentence)) r.sentence = fillIn(r.sentence, r.text.trim());
    }
    const todo = list.filter((r) => needsAny(r, choices) || needsMemo(r, choices));
    if (!todo.length) { for (const r of list) paintRow(r); return; }
    for (const r of todo) setStatus(r, { kind: "busy", text: t("Filling in…") });

    // 1. Meanings from the built-in dictionary first, where the lookup setting says so. A phrase: the entry for
    // the whole phrase; without one, the AI explains it (step 2), or with no AI it is put together word by word.
    const forAi = [];
    for (const r of todo) {
      const want = needs(r, choices);
      const phrase = r.kind !== "word";
      let dictionaryFailed = "";
      let noDictionary = false; // (the dictionary isn't on this device: the row offers to download it right there)
      if (want.meaning && usesDictionary()) {
        try {
          const d = await dictionaryMeaning(r.text.trim(), { phrase, byWords: phrase && !ai });
          r.meaning = fillIn(r.meaning, d.meaning);
          r.meaningPos = d.pos;
          r.meaningFrom = d.from;
          setNote(r, "meaning", d.from === "words"
            ? t("The dictionary has no entry for the whole phrase, so this is word by word. The phrase may mean something else: change it if you know.") : "");
        } catch (err) {
          noDictionary = !!err && err.message === NO_MEANINGS;
          dictionaryFailed = noDictionary
            ? t("The built-in dictionary isn't on this device yet. Download it, or type the meaning.")
            : phrase ? t("This phrase isn't in the built-in dictionary. Type its meaning.")
            : t("This word isn't in the built-in dictionary. Type its meaning.");
        }
      }
      const still = askFor(r);
      if (ai && (still.meaning || still.sentence || still.translation)) forAi.push(r);
      else if (!still.meaning && needs(r, choices).sentence) continue;  // (no AI, or Free chosen: a sentence is found below)
      else if (still.meaning) setStatus(r, { kind: "error", text: dictionaryFailed || t("No meaning was found. Type its meaning."), getDict: noDictionary });
      else setStatus(r, null);
      paintRow(r);
    }

    // 2. The AI: one request for many words, a few requests at a time.
    await pool(chunks(forAi, AI_CHUNK), 2, async (group) => {
      const items = group.map((r) => {
        const want = askFor(r);
        // (a phrase is asked about as one unit: its meaning as a whole, a sentence with all of it)
        return { word: r.text.trim(), meaning: r.meaning.value.trim(), sentence: hasValue(r.sentence) ? r.sentence.value.trim() : "",
          phrase: r.kind !== "word", want };
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
        if (want.meaning && a.meaning) { r.meaning = fillIn(r.meaning, a.meaning); r.meaningFrom = "ai"; r.meaningPos = ""; setNote(r, "meaning", ""); }
        if (want.sentence) r.sentence = fillIn(r.sentence, a.sentence);
        if (want.translation) r.translation = fillIn(r.translation, a.translation);
        const left = needs(r, choices);
        // (with Free sentences, a sentence still to come is found below, not missing)
        setStatus(r, left.meaning || (aiSentences && left.sentence) ? { kind: "error", text: t("Part of it couldn't be filled in. Type it, or press Fill in to try again.") } : null);
        paintRow(r);
      });
    });

    // 3. No AI, or Free chosen: a real sentence that uses the word (Tatoeba, Wiktionary), with its English translation.
    // A phrase: sentences that have all of it (other forms of its words too, with the word tables). A phrase that
    // is a sentence already gets its translation: the examples' own, when they have that very sentence, or the
    // dictionary's meaning of the whole phrase.
    if (!aiSentences) {
      for (const r of todo) {
        if (r.kind === "sentence" && needs(r, choices).translation && !needs(r, choices).sentence && wordKey(r.sentence.value) === wordKey(r.text)) {
          let english = "";
          try { const p = await examplesOf(lang); english = p ? p.translationOf(r.text.trim()) : ""; } catch { /* no connection the first time */ }
          if (!english && r.meaningFrom === "entry" && r.meaning.auto) english = firstSense(r.meaning.value);
          if (english) r.translation = fillIn(r.translation, english);
          paintRow(r);
          continue;
        }
        if (!needs(r, choices).sentence) continue;
        let found = null, failed = null;
        // (no connection the first time: said as such, not as "none found")
        try { found = await freeExample(r.text.trim(), lang, { meaning: meaningOf(r) }); } catch (e) { failed = e && e.code === NO_EXAMPLES ? e : null; }
        if (found) {
          r.sentence = fillIn(r.sentence, found.sentence);
          r.translation = fillIn(r.translation, found.translation);
        }
        if (!needs(r, choices).meaning) {
          setStatus(r, found ? (found.readable ? { kind: "note", text: t("Every other word in this sentence is one you know.") } : null)
            : failed ? { kind: "note", text: failed.message }
            : { kind: "note", text: r.kind === "word" ? t("No example sentence was found for this word. Type one, or leave it empty.")
              : t("No example sentence was found for this phrase. Type one, or leave it empty.") });
        }
        paintRow(r);
      }
    }

    // 4. A mnemonic in Memorization notes: the AI's when it makes them (the review card's Mnemonic maker, a
    // few words at a time), else made on this device (keywords that sound like the word); an AI that fails
    // for a word leaves it to the free one.
    // ("Learn from my own mnemonics": the learner's own sound-alikes offered again, their notes shown to the AI)
    // A phrase too long for sound-alikes (addwords.js mnemonicFits) gets none, and a line that says why. A phrase's
    // meaning is pictured being said ("a BANANA saying “you're welcome”"): its part of speech goes with it.
    const own = learnsOwn(settings()), prefs = settings().mnemonic_prefs;
    const posOf = (r) => r.meaningPos || (r.kind !== "word" ? "phrase" : "");
    const freeMemo = (r) => freeMnemonics({ text: r.text.trim(), meaning: meaningOf(r), pos: posOf(r) }, lang, { speaks: uiLanguage(), prefs, ownWords: own });
    const aiMemo = (r) => makeMnemonics({ text: r.text.trim(), meaning: meaningOf(r) }, {
      ask: askMnemonic, study: info.name, speaks: (UI_LANGUAGES[uiLanguage()] || UI_LANGUAGES.en).name,
      variety: varietyOf(lang, pickedCountry(lang), info.name),
      examples: own ? ownExamples(prefs) : [], lang,
    });
    const memoRows = todo.filter((r) => needsMemo(r, choices));
    for (const r of memoRows) {
      const fits = mnemonicFits(r.text, lang);
      setNote(r, "memo", fits ? "" : t("No mnemonic: sound-alike keywords work for words and short phrases, not for one this long."));
      if (!fits && r.status && r.status.kind === "busy") setStatus(r, null);
    }
    await pool(memoRows.filter((r) => mnemonicFits(r.text, lang)), aiMnemonics ? 2 : 1, async (r) => {
      let got = null;
      if (aiMnemonics) { try { got = await aiMemo(r); } catch { /* the free one instead */ } }
      try { if (!got) got = await freeMemo(r); } catch { /* no keyword list (no connection the first time): the card is added without one */ }
      // (the maker's own keywords: a note edited after it was filled in doesn't teach the maker its own words)
      if (got) r.made = [...(r.made || []), ...got.items.map((s) => s.keyword), ...got.parts.map((s) => s.keyword)];
      const best = got && (got.items[0] || got.parts[0]);
      if (best) r.memo = fillIn(r.memo, noteText(best));
      if (r.status && r.status.kind === "busy") setStatus(r, null);
      paintRow(r);
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
      if (list.some((r) => needsAny(r, choices) || needsMemo(r, choices))) {
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
      // (notes the learner wrote: their sound-alikes in CAPITALS teach the Mnemonic maker, in the background)
      learnFromRows(list.filter((r) => r.saved && !r.memo.auto && hasValue(r.memo)));
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

  /** Cards added with Memorization notes the learner wrote: the Mnemonic maker learns from their sound-alikes in
   * CAPITALS (review/ownmnemonic.js, cardtools.js learnFromNote), one card after another, and says so once in a
   * short note at the bottom of the screen (the sheet has closed by then). */
  async function learnFromRows(added) {
    const learned = [], failed = [];
    for (const r of added) {
      const v = { text: r.text.trim(), meaning: r.meaning.value, ...(r.saved || {}) };
      const got = await learnFromNote(v, "", r.memo.value, { lang, quiet: true, skip: r.made || [] });
      if (got) { learned.push(...got.learned); failed.push(...got.failed); }
    }
    if (learned.length) toast(t("Learned from {0}", learned.join(", ")), { timeout: 4000 });
    else if (failed.length === 1 && added.length === 1) toast(t("{0} doesn't sound like {1}, so nothing was learned.", failed[0], added[0].text.trim()), { timeout: 4000 });
  }

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
    document.removeEventListener("paste", onPaste);
    if (scan) scan.close();  // (the photos and their copies are let go of: nothing is kept)
    if (recording) { try { recording.ctl.stop(); } catch { /* gone */ } recording = null; }
    if (player) { player.pause(); try { URL.revokeObjectURL(player.src); } catch { /* gone */ } }
  }

  // ---------------------------------------------------------------- start

  $(".cb-another").onclick = () => addRow();
  drawOptions();
  addRow({}, { open: true, focus: startMode === "one" });
  if (startMode === "paste" || startMode === "scan") setMode(startMode);
  meaningsStatus(lang).then((st) => { dict = st; paintOptions(); }, () => {});
  return sheet;
}
