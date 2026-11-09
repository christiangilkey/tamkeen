// The row of tools under a word, each opening in a panel under the row: the Mnemonic maker, an example
// sentence (a real one found, or one the AI writes, as in "Add words"), recording the word's audio (only a
// card with no sound of its own: like a voice, a card keeps its first) and its folders. Shared by a word
// opened on the Vocab list (components/wordeditor.js) and the back of a review card (pages/review.js), so
// a new sentence or new mnemonics can be made the same way while reviewing. Which tools a card gets is
// worked out in review/vocabedit.js (toolsFor). Shared by the desktop app, the phone and the web app.

import { esc, h, saveRecording, toast } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { setLang } from "../languages.js";
import { litParts, litTextHtml, markedSentenceHtml, stripMarks } from "../cardtext.js";
import { hasMnemonics, mnemonicHtml, mnemonicMaker } from "../review/cardtools.js";
import { TOOLS, toolsFor } from "../review/vocabedit.js";
import { SENTENCE_SOURCE, aiWrites, findSentence, freeChosen } from "../review/sentencefind.js";
import { sourceOf } from "../lexicon/exampledata.js";
import { MAX_SECONDS, canRecord, cardAudio, partFrom, previewBlob, seconds, startRecording } from "../cardaudio.js";
import { offerFix } from "./fixit.js";
import { troubleshootButton } from "./troubleshoot.js";

// The Vocab page's own line drawings, in icons.js's style (24 x 24, thin rounded lines, a "fill" tint that
// shows when the button is on): the Mnemonic maker (a light bulb), an example sentence (a speech bubble with
// lines of text), the list's sort and filter (sliders) and its selection mode (a ticked box). Any other
// name is one of icons.js's.
const FOLDER = "M3.5 8.3A2.3 2.3 0 0 1 5.8 6h3.3a1.6 1.6 0 0 1 1.2.5l1.1 1.2a1.6 1.6 0 0 0 1.2.5h5.6a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3z";  // (icons.js folder's outline)
const OWN_ICONS = {
  bulb: `<path class="fill" d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5.9 1.1.9 1.9v.6h5v-.6c0-.8.3-1.4.9-1.9A5.8 5.8 0 0 0 12 3.5z"/>
    <path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5.9 1.1.9 1.9v.6h5v-.6c0-.8.3-1.4.9-1.9A5.8 5.8 0 0 0 12 3.5z"/><path d="M9.8 19h4.4M10.6 21.2h2.8"/>`,
  example: `<path class="fill" d="M4.5 4.5h15A1.5 1.5 0 0 1 21 6v9a1.5 1.5 0 0 1-1.5 1.5H10.5L6 20v-3.5H4.5A1.5 1.5 0 0 1 3 15V6a1.5 1.5 0 0 1 1.5-1.5z"/>
    <path d="M4.5 4.5h15A1.5 1.5 0 0 1 21 6v9a1.5 1.5 0 0 1-1.5 1.5H10.5L6 20v-3.5H4.5A1.5 1.5 0 0 1 3 15V6a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M7 9h10M7 12.5h6"/>`,
  filter: `<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>`,
  select: `<rect class="fill" x="4" y="4" width="16" height="16" rx="4"/><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.4 12.3l2.5 2.5 4.8-5.2"/>`,
  // a folder with a plus (put the chosen words in a folder) or a minus (take them out of one)
  folderin: `<path class="fill" d="${FOLDER}"/><path d="${FOLDER}"/><path d="M9.6 13h4.8M12 10.6v4.8"/>`,
  folderout: `<path class="fill" d="${FOLDER}"/><path d="${FOLDER}"/><path d="M9.6 13h4.8"/>`,
};

/** A line icon for the Vocab page and the tools: its own (above), else icons.js's. */
export function vocabIcon(name, size = 20) {
  const body = OWN_ICONS[name];
  if (!body) return icon(name, size);
  return `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** The page scrolls a tool that opened below the screen's edge into sight (nothing above it moves). */
function revealOnPage(panel) {
  const r = panel.getBoundingClientRect(), room = window.innerHeight - 24;
  if (!panel.hidden && r.top > room - 140) window.scrollBy({ top: Math.min(r.top - (room - 220), r.top - 80), behavior: "smooth" });
}

/**
 * Draw word `v`'s tools into `row` (a toolbar of `.vi-tool` tiles), each opening in `panel` (hidden while
 * none is open; a second tap on its tile puts it away). `opts`, the screen's own:
 *   studyLang()            the language being learned
 *   save(change)           saves {field: value} on the card (and puts it in `v`)
 *   useMnemonic(text)      a sound-alike's Use: put it in Memorization notes
 *   shownWord()            the word as shown (with its vowels, when they are), for the Mnemonic maker
 *   onLayout()             the panel changed size
 *   sentenceUsed()         a found or written sentence (and its translation) went on the card
 *   typeSentence()         "Type my own": the screen's own text box for the sentence
 *   recorded()             the card's own audio was kept (`v.voice` set)
 *   folders()              [{uid, name}]
 *   setFolder(v, uid, on)  => Promise: puts it in a folder, or takes it out
 *   newFolder()            => Promise<folder | null>
 *   reveal(panel)          brings a tool that opened into sight (default: the page scrolls)
 * Returns {paint(), open(id), closeTool(), close()}: paint() draws the row again (a tool comes or goes),
 * open(id) opens a tool as its tile does, closeTool() puts the open tool away, close() for good.
 */
export function wordTools(row, panel, v, opts) {
  const { studyLang, save, useMnemonic = () => {}, shownWord = () => v.text, onLayout = () => {}, sentenceUsed = () => {},
    typeSentence = null, recorded = () => {}, folders = () => [], setFolder, newFolder, reveal = revealOnPage } = opts;
  let tool = "";            // the tool open in the panel
  let closed = false;
  let stopTool = () => {};  // the open tool's own clean-up (a recording in progress)

  function paint() {
    row.innerHTML = "";
    for (const id of toolsFor(v)) {
      const [, ic, label, about] = TOOLS.find((x) => x[0] === id);
      const b = h(`<button type="button" class="vi-tool" data-tool="${id}" title="${about}" aria-pressed="${tool === id}">${vocabIcon(ic, 20)}<span>${label}</span></button>`);
      b.onclick = () => openTool(id);
      row.append(b);
    }
  }

  function openTool(id) {
    if (closed) return;
    if (tool === id) { closeTool(); return; }
    closeTool();
    tool = id;
    for (const b of row.querySelectorAll(".vi-tool[aria-pressed]")) b.setAttribute("aria-pressed", String(b.dataset.tool === id));
    panel.hidden = false;
    panel.innerHTML = "";
    panel.dataset.tool = id;
    if (id === "mnemonic") mnemonicTool();
    else if (id === "sentence") sentenceTool();
    else if (id === "record") recordTool();
    else if (id === "folders") foldersTool();
    onLayout();
    requestAnimationFrame(() => { if (!panel.hidden) reveal(panel); });
  }
  function closeTool() {
    stopTool();
    stopTool = () => {};
    const was = tool;
    tool = "";
    panel.hidden = true;
    panel.innerHTML = "";
    delete panel.dataset.tool;
    for (const b of row.querySelectorAll(".vi-tool[aria-pressed]")) b.setAttribute("aria-pressed", "false");
    if (was) onLayout();
  }
  const stillOpen = (id) => !closed && tool === id;

  /** The Mnemonic maker (review/cardtools.js), started at once unless it has made some for this word already. */
  function mnemonicTool() {
    panel.innerHTML = mnemonicHtml();
    const box = panel.firstElementChild;
    mnemonicMaker(box, v, { lang: studyLang(), shownWord, onUse: useMnemonic, onLayout });
    if (!hasMnemonics(v)) box.querySelector(".rv-mnemo-go").click();
  }

  /** An example sentence: written by the AI when it is set up (as in "Add words"), else a real one. */
  function sentenceTool() {
    const ai = aiWrites();
    panel.innerHTML = `<div class="vi-sent">
      <div class="vi-pair vi-sent-ways"${ai ? "" : " hidden"}>
        <button type="button" class="vi-btn" data-way="free">${icon("search", 16)}<span>Find a real one</span></button>
        <button type="button" class="vi-btn" data-way="ai">${icon("sparkle", 16)}<span>Write one for me</span></button>
      </div>
      <div class="vi-sent-found" hidden>
        <div class="vi-sent-text"></div>
        <div class="vi-sent-trans" translate="no"></div>
        <div class="vi-sent-from"></div>
      </div>
      <p class="vi-sent-note" hidden></p>
      <div class="vi-pair vi-sent-pick" hidden>
        <button type="button" class="primary vi-btn vi-sent-use">Use this</button>
        <button type="button" class="vi-btn vi-sent-again">Another one</button>
      </div>
      ${typeSentence ? `<button type="button" class="vi-link vi-sent-type">Type my own</button>` : ""}
      ${freeChosen() ? `<a class="vi-link vi-sent-source" href="${SENTENCE_SOURCE}">AI can write them instead</a>` : ""}
    </div>`;
    const box = panel.firstElementChild;
    // Space and Enter on its buttons press them, and never answer a review card (the reviewer's keys are on the document).
    box.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target.closest("button")) e.stopPropagation(); });
    const found = box.querySelector(".vi-sent-found"), note = box.querySelector(".vi-sent-note"), pick = box.querySelector(".vi-sent-pick");
    const say = (text, error = false) => { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("error", error); };
    const skip = [];
    let way = ai ? "ai" : "free";
    let got = null;
    async function run(w = way) {
      way = w;
      for (const b of box.querySelectorAll("[data-way]")) b.setAttribute("aria-pressed", String(b.dataset.way === way));
      for (const b of box.querySelectorAll("button")) b.disabled = true;
      found.hidden = true;
      pick.hidden = true;
      say(way === "ai" ? t("Writing a sentence…") : t("Finding a sentence…"));
      onLayout();
      const lang = studyLang();
      try {
        got = await findSentence(v, lang, { way, skip });
      } catch (e) {
        got = null;
        if (!stillOpen("sentence")) return;
        say(e && e.message ? e.message : t("That didn't work. Try again."), true);
        offerFix(e);  // no key, or a refused one: the popup with the way to Settings
        const fix = troubleshootButton(e);
        if (fix) note.append(" ", fix);
        onLayout();
        return;
      } finally {
        for (const b of box.querySelectorAll("button")) b.disabled = false;
      }
      if (!stillOpen("sentence")) return;
      if (!got) {
        say(way === "ai" ? t("The AI sent nothing back for this word. Try again.")
          : skip.length ? t("No other example sentence was found for this word.") : t("No example sentence was found for this word. Type one, or leave it empty."));
        pick.hidden = way !== "ai";
        box.querySelector(".vi-sent-use").hidden = true;
        onLayout();
        return;
      }
      skip.push(got.sentence);
      const text = box.querySelector(".vi-sent-text");
      setLang(text, lang);
      text.innerHTML = markedSentenceHtml(got.sentence, v.text, esc);
      const trans = box.querySelector(".vi-sent-trans");
      const { text: plain, marks } = litParts(got.translation || "", null);
      trans.innerHTML = marks.length ? litTextHtml(plain, marks, esc) : esc(plain);
      trans.dir = "auto";
      trans.hidden = !plain.trim();
      const from = box.querySelector(".vi-sent-from");
      from.textContent = got.by === "ai" ? t("Written for you by the AI") : t("From {0}", t(sourceOf(got.source).name));
      if (got.readable) from.textContent += ` · ${t("Every other word in this sentence is one you know.")}`;
      found.hidden = false;
      say("");
      box.querySelector(".vi-sent-use").hidden = false;
      pick.hidden = false;
      onLayout();
    }
    for (const b of box.querySelectorAll("[data-way]")) b.onclick = () => { skip.length = 0; run(b.dataset.way); };
    box.querySelector(".vi-sent-again").onclick = () => run();
    box.querySelector(".vi-sent-use").onclick = () => {
      if (!got) return;
      save({ sentence: got.sentence, translation: got.translation || "" });
      closeTool();
      sentenceUsed();
    };
    const type = box.querySelector(".vi-sent-type");
    if (type) type.onclick = () => { closeTool(); typeSentence(); };
    run();
  }

  /** The word's own recording (and then its sentence's), or a sound file: kept with the card like a voice. */
  function recordTool() {
    const parts = { word: null, sentence: null };
    let rec = null;      // {which, ctl, paint} while the microphone is listening
    let busy = false;
    let player = null;
    panel.innerHTML = `<div class="vi-rec"><div class="vi-rec-parts"></div><p class="vi-rec-note" hidden></p>
      <div class="vi-pair vi-rec-keep" hidden><button type="button" class="primary vi-btn">Save the audio</button></div></div>`;
    const box = panel.firstElementChild;
    box.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target.closest("button")) e.stopPropagation(); });
    const note = box.querySelector(".vi-rec-note");
    const say = (text, error = false) => { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("error", error); };
    stopTool = () => {
      if (rec) { const r = rec; rec = null; try { r.ctl.stop(); } catch { /* gone */ } }
      if (player) { player.pause(); URL.revokeObjectURL(player.src); player = null; }
    };
    const hasSentence = () => !!stripMarks(v.sentence || "").trim();
    function paintParts() {
      const list = box.querySelector(".vi-rec-parts");
      list.innerHTML = "";
      for (const which of ["word", "sentence"]) {
        if (which === "sentence" && (!parts.word || !hasSentence())) continue;  // (a sentence only after its word)
        if (rec && rec.which === which) {
          const line = h(`<div class="vi-rec-row"><span class="cb-rec" role="status"><i class="cb-rec-dot" aria-hidden="true"></i><span class="cb-rec-what"></span>
            <span class="cb-rec-time">0:00</span></span><button type="button" class="vi-btn">${icon("stop", 16)} Stop</button></div>`);
          line.querySelector(".cb-rec-what").textContent = which === "word" ? t("Recording the word…") : t("Recording the sentence…");
          line.querySelector("button").onclick = () => rec && rec.ctl.stop();
          rec.paint = (level, ms) => {
            line.querySelector(".cb-rec").style.setProperty("--level", String(level));
            const s = Math.floor(ms / 1000);
            line.querySelector(".cb-rec-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          };
          list.append(line);
          continue;
        }
        const part = parts[which];
        if (part) {
          const line = h(`<div class="vi-rec-row"><button type="button" class="vi-btn vi-rec-play">${icon("play", 15)} <span></span></button>
            <button type="button" class="vi-btn vi-rec-rm" title="Remove">${icon("close", 15)}</button></div>`);
          line.querySelector(".vi-rec-play span").textContent = `${t(which === "word" ? "Word" : "Sentence")} · ${seconds(part).toFixed(1)} s`;
          line.querySelector(".vi-rec-play").onclick = () => hear(part);
          line.querySelector(".vi-rec-rm").setAttribute("aria-label", which === "word" ? t("Remove the word's audio") : t("Remove the sentence's audio"));
          line.querySelector(".vi-rec-rm").onclick = () => { parts[which] = null; if (which === "word") parts.sentence = null; paintParts(); };
          list.append(line);
          continue;
        }
        const pair = h(`<div class="vi-pair"></div>`);
        if (canRecord()) {
          const b = h(`<button type="button" class="vi-btn">${icon("mic", 16)} <span></span></button>`);
          b.querySelector("span").textContent = which === "word" ? t("Record the word") : t("Record the sentence");
          b.onclick = () => record(which);
          pair.append(b);
        }
        const file = h(`<button type="button" class="vi-btn">${icon("upload", 16)} <span></span></button>`);
        file.querySelector("span").textContent = t("Choose a sound file");
        file.onclick = () => pickFile(which);
        pair.append(file);
        list.append(pair);
      }
      box.querySelector(".vi-rec-keep").hidden = !parts.word || !!rec;
      for (const b of box.querySelectorAll("button")) b.disabled = busy && !b.closest(".vi-rec-row .cb-rec");
      onLayout();
    }
    function hear(part) {
      try {
        if (player) { player.pause(); URL.revokeObjectURL(player.src); }
        player = new Audio(URL.createObjectURL(previewBlob(part)));
        player.play().catch(() => {});
      } catch { /* nothing to play */ }
    }
    async function use(which, blob) {
      busy = true;
      paintParts();
      try {
        const part = await partFrom(blob, which);
        parts[which] = part;
        say(part.cut ? t("Only the first {0} seconds are kept.", MAX_SECONDS[which]) : "");
      } catch (err) {
        say(err && err.message ? t(err.message) : String(err), true);
      } finally {
        busy = false;
        if (stillOpen("record")) paintParts();
      }
    }
    async function record(which) {
      if (rec) rec.ctl.stop();
      say("");
      let me = null;
      try {
        const ctl = await startRecording({ which, onLevel: (level, ms) => me && me.paint && me.paint(level, ms) });
        if (!stillOpen("record")) { ctl.stop(); return; }
        me = rec = { which, ctl, paint: null };
        paintParts();
        const blob = await ctl.done;
        if (rec !== me) return;  // put away meanwhile
        rec = null;
        await use(which, blob);
      } catch (err) {
        if (rec === me) rec = null;
        if (err && err.kind === "mic") offerFix("mic");  // the popup with the way to allow it
        if (stillOpen("record")) { say(err && err.message ? t(err.message) : String(err), true); paintParts(); }
      }
    }
    function pickFile(which) {
      const input = h(`<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.webm" hidden>`);
      input.onchange = () => {
        const f = input.files && input.files[0];
        input.remove();
        if (f) use(which, f);
      };
      document.body.append(input);
      input.click();  // (still inside the tap, so a phone lets the file chooser open)
    }
    box.querySelector(".vi-rec-keep button").onclick = async () => {
      if (!parts.word || busy) return;
      busy = true;
      paintParts();
      say(t("Keeping its audio…"));
      try {
        const made = await cardAudio({ word: parts.word, sentence: hasSentence() ? parts.sentence : null });
        const kept = await saveRecording(v.id, made.blob, made.times);
        v.voice = (kept && kept.voice) || JSON.stringify(made.times);
        v.updated_at = Date.now() / 1000;
        if (closed) { recorded(); return; }
        closeTool();
        paint();
        recorded();
        toast(t("Its audio is saved with the card."), { timeout: 2500 });
      } catch (err) {
        busy = false;
        if (stillOpen("record")) { say(t("Its audio couldn't be kept: {0}", t(err && err.message ? err.message : String(err))), true); paintParts(); }
      }
    };
    paintParts();
  }

  /** Its folders: a tap puts it in one or takes it out; New folder makes one and puts it there. */
  function foldersTool() {
    panel.innerHTML = `<div class="vi-folders"></div>`;
    const box = panel.firstElementChild;
    box.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && e.target.closest("button")) e.stopPropagation(); });
    const draw = () => {
      if (!stillOpen("folders")) return;
      box.innerHTML = "";
      for (const f of folders()) {
        const on = (v.folders || []).includes(f.uid);
        const b = h(`<button type="button" class="folder-chip${on ? " active" : ""}" aria-pressed="${on}">${icon(on ? "check" : "folder", 15)} <span></span></button>`);
        b.querySelector("span").textContent = f.name;
        b.onclick = async () => { b.disabled = true; await setFolder(v, f.uid, !(v.folders || []).includes(f.uid)); draw(); };
        box.append(b);
      }
      const add = h(`<button type="button" class="folder-chip ghost">${icon("plus", 15)} <span>New folder</span></button>`);
      add.onclick = async () => { const f = await newFolder(); if (f) await setFolder(v, f.uid, true); draw(); };
      box.append(add);
      onLayout();
    };
    draw();
  }

  function close() {
    if (closed) return;
    closeTool();
    closed = true;
  }

  paint();
  return { paint, open: openTool, closeTool, close };
}
