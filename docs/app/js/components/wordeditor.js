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
//     (only a card with no sound of its own: like a voice, a card keeps its first) and its folders
//     (components/wordtools.js, which the back of a review card uses too);
//   - where it came from, when it was added, its Anki progress, "Saved", and ⋯ (copy, send to a friend,
//     delete).
// The open card has a brand-teal outline (app.css "the Vocab list: a word opened"), so it is plain which
// word is being edited; nothing else about the card changes colour. One is open at a time
// (pages/vocab.js); opening another puts this one away, saved. Which parts and tools a card gets is
// worked out in review/vocabedit.js (no screen there). Shared by the desktop app, the phone and the web app.

import { api, esc, fmtDate, h, showMenu, toast } from "../app.js";
import { icon } from "../icons.js";
import { t, uiLanguage } from "../i18n.js";
import { detectLanguage, setLang } from "../languages.js";
import { formatTime } from "../wordlookup.js";
import { stripMarks } from "../cardtext.js";
import { canSay } from "../cardvoice.js";
import { cardLanguage, voiceHere } from "../voiceplay.js";
import { editPayload, editValue, holdPayload } from "../review/cardedit.js";
import { CARD_ICONS, EDIT_LABELS, copyAndSay, drawLitLine, holdWords, learnFromNote, memoPlaceholder, partSeconds, pastedInto,
         textBox } from "../review/cardtools.js";
import { ADDS, missingParts } from "../review/vocabedit.js";
import { addToNotes } from "../review/mnemonic.js";
import { practise, practiseButton } from "../review/pronounce.js";
import { wordTools } from "./wordtools.js";

/** The notes, typed over as a whole (several lines). */
const NOTES = new Set(["notes", "memo"]);
/** Written in the language being learned (the rest in the learner's own). */
const STUDY = new Set(["text", "sentence"]);

// (The Vocab page's line icons, vocabIcon, live with the tools in components/wordtools.js.)
export { vocabIcon } from "./wordtools.js";

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
  let closed = false;
  let audioOverAt = 0;      // when audio started from this card will have finished ("Say it" must not record over it)
  let quickKey = "";        // which of Word / Sentence are shown, so they are only drawn again when that changes

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
  // The row of tools and the panel each opens in (components/wordtools.js, the review card's too).
  const tools = wordTools($(".vi-tools"), panel, v, {
    studyLang,
    save: saveChange,
    useMnemonic: (text) => {
      if (String(v.memo || "").includes(text)) return;
      saveChange({ memo: addToNotes(v.memo || "", text) });
      paintNotes();
      paintAdds();
    },
    sentenceUsed: () => { cuts.clear(); paint(); paintQuick(true); },
    typeSentence: () => edit("sentence"),
    recorded: () => { changed(v, { voice: v.voice }); paintQuick(true); refreshQuick(); },
    folders, setFolder, newFolder,
  });
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
    if (add) { const f = add.dataset.add; if (f === "sentence") tools.open("sentence"); else edit(f); return; }
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
    tools.close();
    closed = true;
    clearTimeout(savedTimer);
    stopHolding();
    off.abort();
    body.remove();
  }

  body.querySelector(".vi-more").onclick = (e) => moreMenu(e.currentTarget);
  paint();
  paintQuick(true);
  return { close, paintQuick: () => paintQuick() };
}
