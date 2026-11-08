// A word opened on the Vocab list ("My words") to look over and put right, with every tool the back of a
// review card has (pages/review.js), from the same code (review/cardtools.js, review/cardedit.js), laid
// out small so the next words stay in sight:
//   - its word, meaning, sentence and the sentence's translation, each typed over where it is with a tap
//     (Enter or a tap elsewhere saves it, Esc puts it back), with Copy under the box; a word of the
//     sentence or of the translation held down lights it up as part of what is being learned, or puts it out;
//   - Word and Sentence to hear it, and Say it to practise saying it;
//   - its Grammar notes and Memorization notes, typed over the same way (Paste under the memo's box);
//     what it hasn't got takes no room: a line of small "+" links adds it;
//   - a row of line-icon tools, each opening inside the card under the row: the Mnemonic maker, an example
//     sentence (a real one found, or one the AI writes, as in "Add words"), recording the word's audio
//     (only a card with no sound of its own: like a voice, a card keeps its first) and its folders;
//   - where it came from, when it was added, its Anki progress, "Saved", and ⋯ (copy, send to a friend,
//     delete).
// The open card has a brand-teal outline (app.css "the Vocab list: a word opened"), so it is plain which
// word is being edited; nothing else about the card changes colour. One is open at a time
// (pages/vocab.js); opening another puts this one away, saved. Which parts and tools a card gets is
// worked out in review/vocabedit.js (no screen there). Shared by the desktop app, the phone and the web app.

import { api, esc, fmtDate, h, saveRecording, showMenu, toast } from "../app.js";
import { icon } from "../icons.js";
import { t, uiLanguage } from "../i18n.js";
import { detectLanguage, setLang } from "../languages.js";
import { formatTime } from "../wordlookup.js";
import { litParts, litTextHtml, markedSentenceHtml, stripMarks } from "../cardtext.js";
import { canSay } from "../cardvoice.js";
import { cardLanguage, voiceHere } from "../voiceplay.js";
import { editPayload, editValue, holdPayload } from "../review/cardedit.js";
import { CARD_ICONS, EDIT_LABELS, copyAndSay, drawLitLine, hasMnemonics, holdWords, learnFromNote, memoPlaceholder, mnemonicHtml,
         mnemonicMaker, partSeconds, pastedInto, textBox } from "../review/cardtools.js";
import { ADDS, TOOLS, missingParts, toolsFor } from "../review/vocabedit.js";
import { addToNotes } from "../review/mnemonic.js";
import { practise, practiseButton } from "../review/pronounce.js";
import { SENTENCE_SOURCE, aiWrites, findSentence, freeChosen } from "../review/sentencefind.js";
import { sourceOf } from "../lexicon/exampledata.js";
import { MAX_SECONDS, canRecord, cardAudio, partFrom, previewBlob, seconds, startRecording } from "../cardaudio.js";
import { offerFix } from "./fixit.js";
import { troubleshootButton } from "./troubleshoot.js";

/** The notes, typed over as a whole (several lines). */
const NOTES = new Set(["notes", "memo"]);
/** Written in the language being learned (the rest in the learner's own). */
const STUDY = new Set(["text", "sentence"]);

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

/** A line icon for the Vocab page: its own (above), else icons.js's. */
export function vocabIcon(name, size = 20) {
  const body = OWN_ICONS[name];
  if (!body) return icon(name, size);
  return `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * Open word `v` for editing inside its card `el` on the Vocab list (pages/vocab.js item(): `.vi-main`
 * holds the texts, and the tools go under the card's top part). `deps`, the Vocab page's own:
 *   say(v, part)            plays the word or the sentence (voiceplay.js cardSayer: never fails)
 *   folders()               [{uid, name}]
 *   setFolder(v, uid, on)   => Promise: puts it in a folder, or takes it out
 *   newFolder()             => Promise<folder | null>
 *   send(v, x, y)           sends it to a friend (a menu of friends at x, y)
 *   remove(v)               deletes it (asks first)
 *   changed(v, change)      a change was saved ({field: value})
 *   refreshQuick()          check every card's Word and Sentence buttons again
 *   ankiLine                its Anki progress (ankisync.js ankiProgressLine), as HTML
 * Returns {close(), paintQuick()}: close() puts away an open text box (saved), the tools and the editor.
 */
export function openWordEditor(el, v, deps) {
  const { say, folders = () => [], setFolder, newFolder, send, remove, changed = () => {}, refreshQuick = () => {}, ankiLine = "" } = deps;
  const main = el.querySelector(".vi-main");
  const studyLang = () => detectLanguage(stripMarks(v.sentence) || v.text);
  const own = () => uiLanguage();
  const cuts = new Map();   // where a long sentence (and its translation) is cut, kept while the card is open
  const off = new AbortController();
  let editing = null;       // the open text box: {field, ed}
  let tool = "";            // the tool open under the row
  let closed = false;
  let audioOverAt = 0;      // when audio started from this card will have finished ("Say it" must not record over it)
  let quickKey = "";        // which of Word / Sentence are shown, so they are only drawn again when that changes
  let stopTool = () => {};  // the open tool's own clean-up (a recording in progress)

  main.innerHTML = `
    <div class="word vi-edit" data-f="text" role="button" tabindex="0"></div>
    <div class="vi-meaning vi-edit" data-f="meaning" role="button" tabindex="0" translate="no"></div>
    <div class="sentence vi-edit" data-f="sentence" role="button" tabindex="0"></div>
    <div class="vi-trans vi-edit" data-f="translation" role="button" tabindex="0" translate="no"></div>
    <div class="vi-quick" hidden></div>`;
  const body = h(`<div class="vi-body">
    <div class="vi-adds" hidden></div>
    <div class="vi-note" data-note="notes" hidden><span class="vi-note-label">Grammar notes</span><div class="vi-note-text vi-edit" data-f="notes" role="button" tabindex="0" translate="no"></div></div>
    <div class="vi-note" data-note="memo" hidden><span class="vi-note-label">Memorization notes</span><div class="vi-note-text vi-edit" data-f="memo" role="button" tabindex="0" translate="no"></div></div>
    <div class="vi-tools" role="toolbar" aria-label="Tools for this word"></div>
    <div class="vi-panel" hidden></div>
    <div class="vi-foot"><span class="vi-from"></span><span class="saved" hidden>Saved</span>
      <button type="button" class="vi-more" title="More: copy, send to a friend, delete" aria-label="More" aria-haspopup="menu">${icon("more", 18)}</button></div>
  </div>`);
  el.append(body);
  const $ = (s) => el.querySelector(s);
  const lines = {
    text: main.querySelector(".word"), meaning: main.querySelector(".vi-meaning"), sentence: main.querySelector(".sentence"),
    translation: main.querySelector(".vi-trans"), notes: body.querySelector('[data-f="notes"]'), memo: body.querySelector('[data-f="memo"]'),
  };
  const quick = main.querySelector(".vi-quick"), panel = $(".vi-panel");
  for (const f of Object.keys(lines)) lines[f].setAttribute("aria-label", t(EDIT_LABELS[f]));
  const isEditing = (field) => !!editing && editing.field === field;

  // ----- drawing -----
  function paintTexts() {
    const lang = studyLang();
    if (!isEditing("text")) { lines.text.textContent = v.text; setLang(lines.text, lang); }
    if (!isEditing("meaning")) {
      lines.meaning.textContent = v.meaning || "";
      lines.meaning.hidden = !String(v.meaning || "").trim();
    }
    lines.meaning.lang = own();
    lines.meaning.dir = "auto";
    if (!isEditing("sentence")) { setLang(lines.sentence, lang); drawLitLine(lines.sentence, v, "sentence", { cuts, lang }); }
    if (!isEditing("translation")) { lines.translation.lang = own(); lines.translation.dir = "auto"; drawLitLine(lines.translation, v, "translation", { cuts, lang: own() }); }
  }
  function paintNotes() {
    for (const field of NOTES) {
      const block = body.querySelector(`[data-note="${field}"]`);
      if (isEditing(field)) { block.hidden = false; continue; }
      const value = String(v[field] || "").trim();
      block.hidden = !value;
      lines[field].textContent = value;
      lines[field].dir = "auto";
    }
  }
  function paintAdds() {
    const adds = $(".vi-adds");
    const missing = missingParts(v).filter((f) => !isEditing(f));
    adds.innerHTML = ADDS.filter(([f]) => missing.includes(f))
      .map(([f, label]) => `<button type="button" class="vi-add" data-add="${f}">${icon("plus", 14)}<span>${label}</span></button>`).join("");
    adds.hidden = !missing.length;
  }
  function paintFoot() {
    const later = v.updated_at && v.updated_at - v.created_at > 60;
    const from = v.episode_id ? `<a href="#/episode/${v.episode_id}?t=${v.start ?? 0}">${esc(v.episode_title || "Episode")}</a>` : esc(v.episode_title || "Added manually");
    $(".vi-from").innerHTML = `${from}${v.episode_id && v.start != null ? ` · ${formatTime(v.start)}` : ""} · added ${fmtDate(v.created_at)}${later ? ` · changed ${fmtDate(v.updated_at)}` : ""}`;
    const anki = body.querySelector(".anki-progress");
    if (anki) anki.remove();
    if (ankiLine) $(".vi-foot").insertAdjacentHTML("beforebegin", ankiLine);
  }
  function paintTools() {
    const row = $(".vi-tools");
    row.innerHTML = "";
    for (const id of toolsFor(v)) {
      const [, ic, label, about] = TOOLS.find((x) => x[0] === id);
      const b = h(`<button type="button" class="vi-tool" data-tool="${id}" title="${about}" aria-pressed="${tool === id}">${vocabIcon(ic, 20)}<span>${label}</span></button>`);
      b.onclick = () => openTool(id);
      row.append(b);
    }
  }
  function paint() { paintTexts(); paintNotes(); paintAdds(); paintFoot(); }

  // ----- Word, Sentence and Say it -----
  /** Play the word or the sentence, noting when it will have finished. */
  function play(part) {
    const secs = partSeconds(v, part);
    audioOverAt = Date.now() + secs * 1000 + 400;  // until it has loaded and started
    return Promise.resolve(say(v, part)).then((playing) => {
      audioOverAt = Date.now() + secs * 1000;
      if (playing && playing.ended) playing.ended.then(() => { audioOverAt = Math.min(audioOverAt, Date.now()); });
      return playing;  // { ended }: "Say it" waits on it
    }, () => { audioOverAt = 0; return null; }).finally(refreshQuick);
  }
  function paintQuick(force = false) {
    if (closed) return;
    const voice = voiceHere(cardLanguage(v));
    const word = canSay(v, "word", voice), sentence = canSay(v, "sentence", voice);
    const key = `${word}|${sentence}`;
    if (key === quickKey && !force) return;
    quickKey = key;
    quick.innerHTML = `${word ? `<button type="button" class="play-word">${icon("sound", 15)} Word</button>` : ""}`
      + `${sentence ? `<button type="button" class="play-sent">${icon("sound", 15)} Sentence</button>` : ""}${word || sentence ? practiseButton() : ""}`;
    quick.hidden = !word && !sentence;
    const pw = quick.querySelector(".play-word"), ps = quick.querySelector(".play-sent"), sayIt = quick.querySelector(".say-it");
    if (pw) pw.onclick = () => play("word");
    if (ps) ps.onclick = () => play("sentence");
    // The native model is the whole sentence (the owner's choice, as on the review card); the word's own
    // audio only when the card has no sentence to hear.
    if (sayIt) {
      practise(sayIt, {
        sayModel: () => play(sentence ? "sentence" : "word"),
        modelSeconds: partSeconds(v, sentence ? "sentence" : "word"),
        audioBusy: () => audioOverAt - Date.now(),
        onError: (m) => toast(m, { error: true }),
      });
    }
  }

  // ----- saving -----
  let savedTimer = 0;
  function saveChange(change) {
    Object.assign(v, change);
    v.updated_at = Date.now() / 1000;
    changed(v, change);
    api(`/vocab/${v.id}`, { method: "PATCH", body: change }).then(() => {
      const mark = $(".vi-foot .saved");
      if (!mark) return;
      mark.hidden = false;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (mark.hidden = true), 1400);
    }, (e) => toast(e.message, { error: true }));
  }

  // ----- a text typed over where it is -----
  function edit(field) {
    if (editing || closed || !lines[field]) return;
    const line = lines[field];
    const multiline = NOTES.has(field);
    if (multiline) body.querySelector(`[data-note="${field}"]`).hidden = false;
    line.hidden = false;
    const me = { field };
    editing = me;
    paintAdds();  // (its "+" link goes while it is being typed)
    me.ed = textBox(line, {
      value: multiline ? String(v[field] || "") : editValue(v, field),
      label: t(EDIT_LABELS[field]),
      multiline,
      ...(STUDY.has(field) ? { study: studyLang() } : { lang: own(), dir: "auto" }),
      extra: field === "memo" ? [{ label: t("Paste"), icon: CARD_ICONS.paste, run: async (box) => {
        const notes = await pastedInto(box.value);
        if (notes !== null) box.value = notes;
      } }] : [],
      placeholder: field === "memo" ? memoPlaceholder() : "",
      onClose: (save, typed, next) => {
        if (editing !== me) return;
        editing = null;
        let change = null;
        if (save && multiline) {
          const value = typed.replace(/\s+$/, "");
          change = value !== String(v[field] || "") ? { [field]: value } : null;
        } else if (save) change = editPayload(v, field, typed);
        const memoBefore = String(v.memo || "");
        if (change) saveChange(change);
        // Words in CAPITALS new in the notes teach the Mnemonic maker (review/ownmnemonic.js), after the save.
        if (change && "memo" in change) {
          learnFromNote(v, memoBefore, change.memo, { lang: studyLang(), at: body.querySelector('[data-note="memo"]'), shown: v.text });
        }
        if (closed) return;
        paint();
        if (change && "text" in change) paintQuick(true);
        // (Enter or Esc: the keys stay on this text, so the next can be reached from here)
        if (!(next instanceof Element) && !line.hidden) line.focus({ preventScroll: true });
      },
    });
  }

  // Taps and keys on the texts open them; the "+" links add what isn't there yet.
  const onPress = (e) => {
    if (closed) return;
    const add = e.target.closest(".vi-add");
    if (add) { const f = add.dataset.add; if (f === "sentence") openTool("sentence"); else edit(f); return; }
    const line = e.target.closest(".vi-edit");
    if (!line || line.classList.contains("editing") || e.target.closest(".rv-editing, a")) return;
    edit(line.dataset.f);
  };
  const onKey = (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".vi-edit") && !editing) {
      e.preventDefault();
      edit(e.target.dataset.f);
    }
  };
  for (const area of [main, body]) {
    area.addEventListener("click", onPress, { signal: off.signal });
    area.addEventListener("keydown", onKey, { signal: off.signal });
  }
  // Holding a word of the sentence or of the translation lights it up, or puts it out.
  const stopHolding = holdWords(main, {
    can: () => !editing && !closed,
    onHold: (tok) => {
      const line = tok.closest(".sentence, .vi-trans");
      if (!line) return;
      const field = line === lines.sentence ? "sentence" : "translation";
      const range = [Number(tok.dataset.a), Number(tok.dataset.b)];
      const change = holdPayload(v, field, range);
      if (change) saveChange(change);
      drawLitLine(line, v, field, { cuts, lang: field === "sentence" ? studyLang() : own() });
      const again = line.querySelector(`.rv-tok[data-a="${range[0]}"]`);
      if (again) again.classList.add("rv-held");  // a short ring round the word that changed
    },
  });

  // ----- the tools under the row -----
  function openTool(id) {
    if (closed) return;
    if (tool === id) { closeTool(); return; }
    closeTool();
    tool = id;
    for (const b of el.querySelectorAll(".vi-tool[aria-pressed]")) b.setAttribute("aria-pressed", String(b.dataset.tool === id));
    panel.hidden = false;
    panel.innerHTML = "";
    panel.dataset.tool = id;
    if (id === "mnemonic") mnemonicTool();
    else if (id === "sentence") sentenceTool();
    else if (id === "record") recordTool();
    else if (id === "folders") foldersTool();
    // Brought into sight when it opens below the screen's edge (nothing above it moves).
    requestAnimationFrame(() => {
      const r = panel.getBoundingClientRect(), room = window.innerHeight - 24;
      if (!panel.hidden && r.top > room - 140) window.scrollBy({ top: Math.min(r.top - (room - 220), r.top - 80), behavior: "smooth" });
    });
  }
  function closeTool() {
    stopTool();
    stopTool = () => {};
    tool = "";
    panel.hidden = true;
    panel.innerHTML = "";
    delete panel.dataset.tool;
    for (const b of el.querySelectorAll(".vi-tool[aria-pressed]")) b.setAttribute("aria-pressed", "false");
  }
  const stillOpen = (id) => !closed && tool === id;

  /** The Mnemonic maker (review/cardtools.js), started at once unless it has made some for this word already. */
  function mnemonicTool() {
    panel.innerHTML = mnemonicHtml();
    const box = panel.firstElementChild;
    mnemonicMaker(box, v, {
      lang: studyLang(),
      shownWord: () => v.text,
      onUse: (text) => {
        if (String(v.memo || "").includes(text)) return;
        saveChange({ memo: addToNotes(v.memo || "", text) });
        paintNotes();
        paintAdds();
      },
    });
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
      <button type="button" class="vi-link vi-sent-type">Type my own</button>
      ${freeChosen() ? `<a class="vi-link vi-sent-source" href="${SENTENCE_SOURCE}">AI can write them instead</a>` : ""}
    </div>`;
    const box = panel.firstElementChild;
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
      from.textContent = got.by === "ai" ? t("Written for you by the AI") : t("From {0}", sourceOf(got.source).name);
      if (got.readable) from.textContent += ` · ${t("Every other word in this sentence is one you know.")}`;
      found.hidden = false;
      say("");
      box.querySelector(".vi-sent-use").hidden = false;
      pick.hidden = false;
    }
    for (const b of box.querySelectorAll("[data-way]")) b.onclick = () => { skip.length = 0; run(b.dataset.way); };
    box.querySelector(".vi-sent-again").onclick = () => run();
    box.querySelector(".vi-sent-use").onclick = () => {
      if (!got) return;
      saveChange({ sentence: got.sentence, translation: got.translation || "" });
      cuts.clear();
      closeTool();
      paint();
      paintQuick(true);
    };
    box.querySelector(".vi-sent-type").onclick = () => { closeTool(); edit("sentence"); };
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
          const row = h(`<div class="vi-rec-row"><span class="cb-rec" role="status"><i class="cb-rec-dot" aria-hidden="true"></i><span class="cb-rec-what"></span>
            <span class="cb-rec-time">0:00</span></span><button type="button" class="vi-btn">${icon("stop", 16)} Stop</button></div>`);
          row.querySelector(".cb-rec-what").textContent = which === "word" ? t("Recording the word…") : t("Recording the sentence…");
          row.querySelector("button").onclick = () => rec && rec.ctl.stop();
          rec.paint = (level, ms) => {
            row.querySelector(".cb-rec").style.setProperty("--level", String(level));
            const s = Math.floor(ms / 1000);
            row.querySelector(".cb-rec-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          };
          list.append(row);
          continue;
        }
        const part = parts[which];
        if (part) {
          const row = h(`<div class="vi-rec-row"><button type="button" class="vi-btn vi-rec-play">${icon("play", 15)} <span></span></button>
            <button type="button" class="vi-btn vi-rec-rm" title="Remove">${icon("close", 15)}</button></div>`);
          row.querySelector(".vi-rec-play span").textContent = `${t(which === "word" ? "Word" : "Sentence")} · ${seconds(part).toFixed(1)} s`;
          row.querySelector(".vi-rec-play").onclick = () => hear(part);
          row.querySelector(".vi-rec-rm").setAttribute("aria-label", which === "word" ? t("Remove the word's audio") : t("Remove the sentence's audio"));
          row.querySelector(".vi-rec-rm").onclick = () => { parts[which] = null; if (which === "word") parts.sentence = null; paintParts(); };
          list.append(row);
          continue;
        }
        const row = h(`<div class="vi-pair"></div>`);
        if (canRecord()) {
          const b = h(`<button type="button" class="vi-btn">${icon("mic", 16)} <span></span></button>`);
          b.querySelector("span").textContent = which === "word" ? t("Record the word") : t("Record the sentence");
          b.onclick = () => record(which);
          row.append(b);
        }
        const file = h(`<button type="button" class="vi-btn">${icon("upload", 16)} <span></span></button>`);
        file.querySelector("span").textContent = t("Choose a sound file");
        file.onclick = () => pickFile(which);
        row.append(file);
        list.append(row);
      }
      box.querySelector(".vi-rec-keep").hidden = !parts.word || !!rec;
      for (const b of box.querySelectorAll("button")) b.disabled = busy && !b.closest(".vi-rec-row .cb-rec");
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
        changed(v, { voice: v.voice });
        if (closed) return;
        closeTool();
        paintTools();
        paintQuick(true);
        refreshQuick();
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
    };
    draw();
  }

  /** ⋯: copy it, send it to a friend, delete it. */
  function moreMenu(button) {
    const r = button.getBoundingClientRect();
    const sentence = stripMarks(v.sentence || "").trim();
    showMenu(r.left, r.bottom + 4, "", [
      { label: "Copy the word", icon: CARD_ICONS.copy, run: () => copyAndSay(v.text) },
      sentence ? { label: "Copy the sentence", icon: CARD_ICONS.copy, run: () => copyAndSay(sentence) } : null,
      { label: "Send to a friend", icon: icon("send", 16), run: () => send(v, r.left, r.bottom + 4) },
      { label: "Delete this word", icon: icon("trash", 16), run: () => remove(v) },
    ].filter(Boolean));
  }

  function close() {
    if (closed) return;
    if (editing) editing.ed.close(true);
    closeTool();
    closed = true;
    clearTimeout(savedTimer);
    stopHolding();
    off.abort();
    body.remove();
  }

  body.querySelector(".vi-more").onclick = (e) => moreMenu(e.currentTarget);
  paint();
  paintQuick(true);
  paintTools();
  return { close, paintQuick: () => paintQuick() };
}
