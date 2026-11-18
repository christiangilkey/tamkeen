// Vocab → the microphone beside "Add words": ask out loud ("How do I say colorful in Spanish?", "What does
// bonito mean?"), see and hear the answer, and add it as a card with a press or by saying "add it".
//
// Hearing needs no key wherever it can be done without one (voiceask.js hearingWays): the computer's own
// transcription model, the phone's speech recognition (Android), or the browser's (Chrome, Edge, Safari);
// otherwise the online transcription service when the learner has set one up. With none, the question is typed
// (a phone keyboard's own microphone works there). The answer comes from the learner's AI when they have one,
// otherwise from the built-in dictionary (Wiktionary), downloaded once if it isn't here yet: no key at all.
// The card is made by "Add words" itself (components/wordbuilder.js), so its sentence, audio and mnemonic are
// filled in as there.
//
// Shared by the desktop app, the phone and the web app.

import { esc, h, platform, speechPlugin } from "../app.js";
import { icon } from "../icons.js";
import { t, uiLanguage } from "../i18n.js";
import { isLanguage, langAttrs, langInfo, studyLanguage, vocabFromDefinition } from "../languages.js";
import { openModal } from "./modal.js";
import { offerFix } from "./fixit.js";
import { askAi, definerConfig, getDefinition, noAi } from "../define-service.js";
import { PROVIDERS } from "../definer.js";
import { downloadMeanings, installedMeanings } from "../meanings.js";
import { commonWords } from "../commonwords.js";
import { hear, hearInfo } from "../hear-service.js";
import { canRecord, listen } from "../hearmic.js";
import { deviceKind } from "../devicevoice.js";
import { sayText, stopSaying } from "../saytext.js";
import { languageName } from "../converse.js";
import { chosenDialect } from "../voiceplay.js";
import { isPhrase, wordKey } from "../addwords.js";
import { askPrompt, cleanAsk, hearingTag, hearingWays, readQuestion, translationsFor } from "../voiceask.js";

const EXAMPLE = "How do I say colorful in Spanish?";
const browserRecognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

/** A way of hearing that isn't there on this device: the next one is tried. */
class Unavailable extends Error {}
/** The microphone isn't allowed: said, and the popup with the way to allow it follows (fixit.js). */
const micRefused = () => Object.assign(new Unavailable(t("Tamkeen needs permission to use the microphone to hear you.")), { said: true, mic: true });

/**
 * Open the box. `existing()` gives the saved words (an answer already among them says so instead of offering to
 * add it); `addCards(cards, added)` makes cards [{text, meaning, notes}] the way "Add words" does and calls
 * `added(saved)` once they are in.
 */
export function openVoiceAsk({ existing = () => [], addCards = () => {} } = {}) {
  const study = studyLanguage();
  let active = null;   // {stop()} while hearing
  let busy = false;    // hearing or answering
  let answer = null;   // {lang, items: [{word, meaning, notes, added}], source}
  let closed = false;

  const sheet = openModal({ title: t("Ask by voice"), onClose: () => { closed = true; if (active) active.stop(true); stopSaying(); } });
  sheet.el.querySelector(".modal-box").classList.add("vq-box");
  const body = h(`<div class="vq">
    <button type="button" class="vq-mic" data-state="idle" aria-label="Ask by voice"><span class="vq-level" aria-hidden="true"></span>${icon("mic", 34)}</button>
    <p class="vq-status muted" role="status"></p>
    <form class="vq-form">
      <input type="text" class="vq-text" enterkeyhint="go" autocomplete="off" aria-label="Your question" placeholder="${esc(t("…or type it here"))}">
      <button type="submit" class="vq-go primary">Ask</button>
    </form>
    <div class="vq-answer" hidden></div>
  </div>`);
  sheet.body.append(body);
  const $ = (s) => body.querySelector(s);
  const mic = $(".vq-mic"), status = $(".vq-status"), input = $(".vq-text"), out = $(".vq-answer");

  const say = (text, kind = "") => { status.textContent = text; status.classList.toggle("vq-err", kind === "error"); };
  const idleHint = () => say(answer ? t("Press the microphone and say “add it”, or ask another.") : t("Press the microphone and ask: “{0}”", t(EXAMPLE)));
  const micState = (s) => { mic.dataset.state = s; mic.disabled = s === "wait"; };

  // ---------------------------------------------------------------- hearing

  const ownTag = () => hearingTag(uiLanguage() || "en", navigator.language || "");
  function ways() {
    const device = deviceKind();
    let service = false;
    try { service = platform !== "desktop" && hearInfo().can; } catch { /* no transcription set up */ }
    return hearingWays({ device, browser: !!browserRecognition(), model: platform === "desktop", service });
  }

  /** What was said, by the computer's model or the transcription service: a recording, written down. */
  async function byRecording() {
    if (!canRecord()) throw new Unavailable("no microphone");
    let ctl;
    try { ctl = await listen({ onLevel: (v) => mic.style.setProperty("--level", String(v)) }); } catch (e) {
      const text = e && e.message ? e.message : String(e);
      if (/permission/i.test(text)) throw micRefused(); // (the popup with the way to allow it follows)
      throw new Error(text);
    }
    active = { stop: (cancel) => (cancel ? ctl.cancel() : ctl.stop()) };
    micState("rec");
    say(t("Listening… press again when you're done."));
    const blob = await ctl.done;
    active = null;
    if (!blob || closed) return "";
    micState("wait");
    say(t("Writing it down…"));
    try {
      return (await hear(blob, (uiLanguage() || "en").split("-")[0])).text;
    } catch (e) {
      // (no transcription model on this computer: the browser's own hearing is tried next, else typing)
      const err = new Unavailable(e && e.message ? e.message : String(e));
      err.said = true;
      throw err;
    }
  }

  /** What was said, by the browser's own speech recognition. */
  async function byBrowser() {
    const R = browserRecognition();
    if (!R) throw new Unavailable("none");
    // The browser's own question about the microphone, asked first (the owner, 2026-11-18: "I don't get a request
    // popup for mic"): its speech recognition alone can be refused with no question at all (the web app opened from a
    // phone's home screen), and then nothing said why. The sound is switched straight off again.
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      micState("wait");
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((tr) => tr.stop()); }
      catch (e) { if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) throw micRefused(); }
    }
    return new Promise((resolve, reject) => {
      const r = new R();
      r.lang = ownTag();
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      let finalText = "", partial = "", failed = "";
      r.onresult = (e) => {
        partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const piece = e.results[i][0] ? e.results[i][0].transcript : "";
          if (e.results[i].isFinal) finalText += piece; else partial += piece;
        }
        input.value = (finalText + partial).trim();
      };
      r.onerror = (e) => { failed = (e && e.error) || "error"; };
      r.onend = () => {
        active = null;
        const said = (finalText || partial).trim();
        if (said) resolve(said);
        else if (failed === "not-allowed") reject(micRefused());
        else if (["service-not-allowed", "network", "audio-capture", "language-not-supported", "error"].includes(failed)) reject(new Unavailable(failed));
        else resolve("");
      };
      active = { stop: (cancel) => { try { if (cancel) r.abort(); else r.stop(); } catch { /* ended */ } } };
      micState("rec");
      say(t("Listening…"));
      try { r.start(); } catch (e) { active = null; reject(new Unavailable(String(e))); }
    });
  }

  /** What was said, by the phone's own speech recognition (Android: its own small window). */
  async function byPhone() {
    if (!speechPlugin || !speechPlugin.recognize) throw new Unavailable("none");
    micState("wait");
    say(t("Listening…"));
    let r;
    try { r = await speechPlugin.recognize({ lang: ownTag(), prompt: t(EXAMPLE) }); } catch (e) { throw new Unavailable(e && e.message ? e.message : String(e)); }
    return String((r && r.text) || "").trim();
  }

  const BY = { model: byRecording, service: byRecording, browser: byBrowser, native: byPhone };

  async function listenOnce() {
    if (busy) { if (active) active.stop(false); return; }
    busy = true;
    stopSaying();
    let heard = null, problem = "", micBlocked = false;
    try {
      for (const way of ways()) {
        try { heard = await BY[way](); break; } catch (e) {
          if (!(e instanceof Unavailable)) throw e;
          if (e.said) problem = e.message;  // (kept to say if nothing else can hear)
          if (e.mic) micBlocked = true;
        }
      }
    } catch (e) {
      problem = e && e.message ? e.message : String(e);
      heard = null;
    } finally {
      active = null;
      busy = false;
      micState("idle");
      mic.style.setProperty("--level", "0");
    }
    if (closed) return;
    if (heard === null) {
      // Nothing here can hear: the question is typed (on a phone, the keyboard's own microphone hears it).
      say(problem ? `${problem} ${t("Type your question instead.")}` : t("This device can't hear questions here. Type it instead: on a phone, your keyboard's microphone works."), problem ? "error" : "");
      input.focus();
      if (micBlocked) offerFix("mic"); // where to allow it, and a button that asks again
      return;
    }
    if (!heard) { say(t("I didn't hear anything. Press the microphone and try again.")); return; }
    input.value = heard;
    await ask(heard);
  }

  // ---------------------------------------------------------------- answering

  const aiReady = () => { try { return !noAi() && !!definerConfig().key; } catch { return false; } };
  const aiName = () => { const c = definerConfig(); return (PROVIDERS[c.provider] && (PROVIDERS[c.provider].short || PROVIDERS[c.provider].label)) || c.provider; };
  const saved = () => new Set((existing() || []).map((v) => wordKey(v && v.text)));

  async function dictionaryFiles(lang) {
    let files = await installedMeanings(lang).catch(() => null);
    if (files) return files;
    say(t("Getting the {0} dictionary (once only)…", t(langInfo(lang).name)));
    try { await downloadMeanings(lang); } catch { return null; }  // (none for this language, or no connection)
    return installedMeanings(lang).catch(() => null);
  }

  /** How to say `phrase` in `lang`: {items, source}. */
  async function howToSay(phrase, heard, lang) {
    if (aiReady()) {
      try {
        const got = cleanAsk(await askAi(askPrompt({
          phrase, heard, language: languageName(lang, lang === "ar" ? chosenDialect() : ""),
          explain: definerConfig().language || "English", vowels: lang === "ar",
        })));
        if (got) {
          const notes = (r) => (r && lang !== "ar" && r !== got.word ? `Reading: ${r}` : "");
          return {
            items: [{ word: got.word, reading: got.reading, meaning: got.meaning, note: got.note, notes: notes(got.reading) },
              ...got.others.map((o) => ({ word: o.word, meaning: o.meaning, notes: "" }))],
            source: t("Answer from {0}", aiName()),
          };
        }
      } catch (e) {
        console.warn("Ask by voice: the AI couldn't answer", e);  // (the dictionary is asked instead)
      }
    }
    const files = await dictionaryFiles(lang);
    if (!files) throw new Error(t("The {0} dictionary couldn't be got: check the internet connection, or add an AI in Settings → Word definitions.", t(langInfo(lang).name)));
    const common = await commonWords(lang).catch(() => []);
    const found = translationsFor(files, phrase, lang, { common });
    if (found.length) {
      return {
        items: found.map((f) => ({
          word: f.word, reading: f.reading, meaning: f.meaning, note: f.sense,
          notes: [f.reading && lang !== "ar" ? `Reading: ${f.reading}` : "", f.pos].filter(Boolean).join(" · "),
        })),
        source: t("From the built-in dictionary (Wiktionary)"),
      };
    }
    return null;
  }

  /** What `phrase` (in `lang`) means: the word popup's own lookup (Settings → Word definitions). */
  async function whatItMeans(phrase, lang) {
    const word = phrase.trim();
    const def = await getDefinition({ word, marked: `⟦${word}⟧`, lang, phrase: isPhrase(word, lang) });
    const card = vocabFromDefinition(def, word, lang);
    if (!card.meaning) return null;
    return {
      items: [{ word: card.text, meaning: card.meaning, notes: card.notes, note: def.explanation || "" }],
      source: def.provider === "dictionary" ? t("From the built-in dictionary ({0})", def.model || "Wiktionary") : t("Answer from {0}", aiName()),
    };
  }

  async function ask(text) {
    stopSaying();
    const q = readQuestion(text);
    if (q.kind === "add") {
      if (!answer) { say(t("Ask for a word first, then say “add it”.")); return; }
      addItems(q.all ? answer.items : answer.items.slice(0, 1));
      return;
    }
    if (q.kind === "none" || !q.phrase) { say(t("I didn't catch a question. Try: “{0}”", t(EXAMPLE)), "error"); return; }
    const lang = q.lang && isLanguage(q.lang) ? q.lang : study;
    busy = true;
    micState("wait");
    say(t("Looking it up…"));
    let got = null;
    try {
      if (q.kind === "mean") got = await whatItMeans(q.phrase, lang).catch(() => null);
      if (!got) got = await howToSay(q.phrase, text, lang);
      // A bare word the dictionary has no English meaning for may be a word of the language itself ("bonito").
      if (!got && q.kind === "say" && !aiReady()) got = await whatItMeans(q.phrase, lang).catch(() => null);
    } catch (e) {
      busy = false;
      micState("idle");
      if (!closed) say(e && e.message ? t(e.message) : String(e), "error");
      return;
    }
    busy = false;
    micState("idle");
    if (closed) return;
    if (!got || !got.items.length) {
      say(aiReady() ? t("No answer for “{0}”. Try saying it another way.", q.phrase)
        : t("“{0}” isn't in the built-in dictionary. Try another word, or add an AI in Settings → Word definitions for whole sentences.", q.phrase), "error");
      return;
    }
    const have = saved();
    answer = { lang, items: got.items.map((it) => ({ ...it, added: lang === study && have.has(wordKey(it.word)) ? "before" : "" })), source: got.source, phrase: q.phrase };
    paint();
    idleHint();
    // (said once by itself, quietly: no "add a voice" box when the device has none; Hear it shows that)
    sayText(answer.items[0].word, lang, { dialect: lang === "ar" ? chosenDialect() : "", quiet: true }).catch(() => {});
    if (q.add) addItems(q.all ? answer.items : answer.items.slice(0, 1));
  }

  // ---------------------------------------------------------------- the answer

  function paint() {
    out.hidden = false;
    const { lang, items, source } = answer;
    const attrs = langAttrs(lang);
    const other = lang !== study;
    const button = (it, i, small) => (it.added
      ? `<span class="vq-added">${icon("check", 16)} ${it.added === "before" ? esc(t("Already in your cards")) : esc(t("Added"))}</span>`
      : other ? "" : `<button type="button" class="${small ? "ghost" : "primary"} vq-add" data-i="${i}">${icon("plus", 16)} ${esc(small ? t("Add") : t("Add as a card"))}</button>`);
    const [first, ...rest] = items;
    out.innerHTML = `<div class="vq-card">
        <div class="vq-word" ${attrs}>${esc(first.word)}</div>
        ${first.reading && first.reading !== first.word ? `<div class="vq-reading">${esc(first.reading)}</div>` : ""}
        <div class="vq-meaning">${esc(first.meaning)}</div>
        ${first.note ? `<p class="vq-note muted">${esc(first.note)}</p>` : ""}
        <div class="vq-acts">
          <button type="button" class="ghost vq-hear" data-i="0">${icon("sound", 16)} ${esc(t("Hear it"))}</button>
          ${button(first, 0, false)}
        </div>
      </div>
      ${rest.length ? `<div class="vq-others"><h3>${esc(t("Other ways"))}</h3>${rest.map((it, j) => `<div class="vq-row">
          <button type="button" class="ghost vq-hear vq-rowword" data-i="${j + 1}" ${attrs}>${esc(it.word)}</button>
          <span class="vq-rowmean muted">${esc(it.meaning)}</span>
          ${button(it, j + 1, true)}
        </div>`).join("")}</div>` : ""}
      ${other ? `<p class="vq-note muted">${esc(t("Your cards are in {0} now. To add {1} words, switch the language at the top first.", t(langInfo(study).name), t(langInfo(lang).name)))}</p>` : ""}
      <p class="vq-source muted">${esc(source)}</p>`;
    out.querySelectorAll(".vq-hear").forEach((b) => {
      b.onclick = () => { stopSaying(); sayText(items[Number(b.dataset.i)].word, lang, { dialect: lang === "ar" ? chosenDialect() : "" }).catch(() => {}); };
    });
    out.querySelectorAll(".vq-add").forEach((b) => { b.onclick = () => addItems([items[Number(b.dataset.i)]]); });
  }

  function addItems(list) {
    if (!answer) return;
    if (answer.lang !== study) { say(t("Switch the language at the top to {0} to add this one.", t(langInfo(answer.lang).name)), "error"); return; }
    const todo = list.filter((it) => !it.added);
    if (!todo.length) { say(t("That's already in your cards.")); return; }
    say(t("Making the card…"));
    addCards(todo.map((it) => ({ text: it.word, meaning: it.meaning, notes: it.notes || "" })), (cards) => {
      if (closed || !answer) return;
      const made = new Set((cards || []).map((c) => wordKey(c && c.text)));
      for (const it of todo) if (made.has(wordKey(it.word))) it.added = "now";
      paint();
      say(todo.length === 1 ? t("Added “{0}” to your cards.", todo[0].word) : t("Added {0} cards.", todo.length));
    });
  }

  // ---------------------------------------------------------------- start

  mic.onclick = () => { listenOnce(); };
  $(".vq-form").onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    ask(text);
  };
  idleHint();
  // Pressing the microphone on the Vocab page is already asking: it listens straight away.
  if (ways().length) listenOnce(); else { idleHint(); input.focus(); }
  return sheet;
}
