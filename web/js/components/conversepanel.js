// Library → Conversation: speaking practice with the learner's own AI playing the other person.
// Shared by the desktop app, the phone and the web app.
//
// Three screens in one panel:
//   the list    conversations by level (conversedata.js), each with how far the learner got last time
//   the talk    the situation and its goals on top, the conversation under it, the reply box at the bottom
//   the debrief what was reached, the learner's best line, up to three things to work on (each can be
//               heard and said again), phrases worth keeping, and a note on how it is really done
//
// What the AI is told and the rules the app keeps (the hidden facts, the goal ticks, the complication, the
// effort check) are in converse.js. Here: every word of the other person's lines can be tapped for its
// meaning and saved, as everywhere in Tamkeen (wordbubble.js); their lines are read out by the learner's
// card voice (saytext.js); and a reply can be typed or spoken (hearmic.js records it, hear-service.js
// writes it down: on the computer with its own model, so the voice never leaves it).
// Nothing of a conversation is kept except how many goals were reached (on this device).
//
// DLI students (Settings → DLI students, while their DLI language is the one being learned) also get a
// mock interview: a whole practice interview in the order the real one goes, under test conditions (no
// hints, no meanings, no corrections until the end), then the level the app works out from how each part
// went, and every correction at once. Everyone, DLI students included, can pick conversations as before.

import { api, buzz, esc, h, state, toast } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs, setLang, vocabFromDefinition, wordRanges } from "../languages.js";
import { wordHtml } from "../wordface.js";
import { DefinerError, markWord } from "../definer.js";
import { askAi, definerConfig, getDefinition, noAi } from "../define-service.js";
import { createWordBubble } from "./wordbubble.js";
import { confirmBox, openModal } from "./modal.js";
import { sayText, stopSaying } from "../saytext.js";
import { chosenDialect, voiceNewCard } from "../voiceplay.js";
import { ARABIC_VARIETIES } from "../coursedata.js";
import { dliState } from "../dli.js";
import { reward } from "../game/game.js";
import { hear, hearInfo } from "../hear-service.js";
import { canRecord, listen } from "../hearmic.js";
import { LEVELS, MOCK_FORMS, MOCK_PARTS, MOCK_PHASES, TASKS, levelInfo, scenario, scenariosOf } from "../conversedata.js";
import { LONG_TALK, allDone, applyMockOpening, applyMockTurn, applyOpening, applyTurn, cleanDebrief, cleanHint, cleanRating, closeness,
  corrections, debriefPrompt, hintPrompt, mockNext, mockOpeningPrompt, mockPart, mockTurnPrompt, newMock, newTalk, openingPrompt,
  ratingPrompt, said, score, turnPrompt, twistDue, withResult } from "../converse.js";

const DONE_KEY = "converseDone";       // {id: {best, total, times}} (converse.js withResult)
const LEVEL_KEY = "converseLevel";
const VARIETY_KEY = "converseVariety"; // the kind of Arabic spoken here ("" = Standard)
const SOUND_KEY = "converseSound";     // "0" = the other person's lines are not read out by themselves
const MOCK_KEY = "converseMock";       // {"2": {level, at}, "3": …}: the last estimate from each mock interview
const CLOSE_ENOUGH = 0.85;             // said again: this much of the line heard counts as said

const read = (key, fallback = "") => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };
const results = () => { try { return JSON.parse(read(DONE_KEY, "{}")) || {}; } catch { return {}; } };
const mockResults = () => { try { return JSON.parse(read(MOCK_KEY, "{}")) || {}; } catch { return {}; } };

const aiReady = () => !noAi() && !!definerConfig().key;
function problem(e) {
  if (e instanceof DefinerError && e.message === "NO_KEY") return t("Add an AI key in Settings → Word definitions first.");
  return (e && e.message) || String(e);
}

/**
 * Fill `box` with the Conversation screens for the language being learned (`lang`). Returns a function
 * that tidies up (stops any voice and microphone) when the Library is left.
 */
export function conversePanel(box, lang) {
  let talk = null;       // the conversation in progress (converse.js newTalk)
  let busy = false;      // a request for the other person's line is out
  let mic = null;        // {stop, cancel} while listening
  let closed = false;
  let variety = lang === "ar" ? (ARABIC_VARIETIES.some((v) => v.id === read(VARIETY_KEY, "?")) ? read(VARIETY_KEY) : chosenDialect()) : "";
  let level = LEVELS.some((l) => l.id === read(LEVEL_KEY)) ? read(LEVEL_KEY) : "0";
  let sound = read(SOUND_KEY, "1") !== "0";
  const lines = new WeakMap(); // a line's element -> {text, words, before}: what a tapped word is looked up in
  /** A DLI student whose DLI language is the one being learned (as the Library's DLI tab asks: dlipanel.js dliShown). */
  const isDli = () => { const st = dliState((state.status && state.status.settings) || {}); return st.ready && st.language === lang; };

  box.classList.add("cv");
  box.innerHTML = "";

  // ----- one word popup for the whole panel -----
  let target = null; // {el, word, sentence}
  const saved = new Set();
  const bubble = createWordBubble(box, {
    noAudio: true,
    voiceless: true,
    fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
    onPlayWord: () => {}, onPlaySentence: () => {}, onPlayFrom: () => {},
    onSettings: () => { location.hash = "#/settings?s=words"; },
    onSave: async (def) => {
      const w = target;
      if (!w || saved.has(`${w.word}\u0000${w.sentence}`)) return;
      try {
        const row = await api("/vocab", { method: "POST", body: {
          ...vocabFromDefinition(def, w.word, lang), sentence: w.sentence, source: "Conversation", language: lang } });
        voiceNewCard(row, "missing"); // nothing recorded to listen to: its voice, now (Settings → Card voices)
        saved.add(`${w.word}\u0000${w.sentence}`);
        reward({ type: "save" }, w.el);
      } catch (e) { toast(e.message, { error: true }); throw e; }
    },
  });

  /** A line in the language being learned, every word of it tappable. `before`: the line it answers. */
  function lineEl(text, { before = "", tag = "span", cls = "" } = {}) {
    const ranges = wordRanges(text, lang);
    let html = "", at = 0;
    ranges.forEach(([a, b], i) => {
      html += `${esc(text.slice(at, a))}<span class="w" data-i="${i}">${wordHtml(text.slice(a, b), lang)}</span>`;
      at = b;
    });
    const el = document.createElement(tag);
    el.classList.add("cv-line");
    if (cls) el.classList.add(cls);
    setLang(el, lang);
    el.innerHTML = html + esc(text.slice(at));
    lines.set(el, { text, words: ranges.map(([a, b]) => text.slice(a, b)), before });
    return el;
  }
  const onWord = (e) => {
    const w = e.target.closest && e.target.closest(".cv-line .w");
    if (!w || !box.contains(w)) { if (bubble.open && !e.target.closest(".word-bubble")) bubble.hide(); return; }
    const line = lines.get(w.closest(".cv-line"));
    if (!line) return;
    const i = Number(w.dataset.i);
    const word = line.words[i];
    target = { el: w, word, sentence: line.text };
    buzz("tick");
    bubble.show(w, { word, lang, marked: markWord(line.words, i, i, lang), before: line.before, after: "",
      podcast: "Conversation", episode: talk && talk.id ? scenario(talk.id).title : "", phrase: false },
    { saved: saved.has(`${word}\u0000${line.text}`) });
    reward({ type: "word", key: `${lang}:${word.toLowerCase()}` }, w);
  };
  box.addEventListener("click", onWord);

  const say = (text) => sayText(text, lang, { dialect: variety });
  /** A small round button that reads `text` out. */
  function sayButton(text) {
    const b = h(`<button type="button" class="ghost icon cv-say" title="Listen" aria-label="Listen">${icon("sound", 17)}</button>`);
    b.onclick = () => say(text);
    return b;
  }

  /** "Say it": the learner says a line; what was heard shows in `out`, with whether that was it. */
  function sayAgain(line, out, live) {
    if (!canRecord() || !hearInfo().can) return "";
    const b = h(`<button type="button" class="ghost icon cv-mic" data-state="idle" title="Say it yourself" aria-label="Say it yourself">${icon("mic", 17)}<i class="cv-level" aria-hidden="true"></i></button>`);
    b.onclick = async () => {
      if (mic) { mic.stop(); return; }
      stopSaying();
      let me;
      try { me = mic = await listen({ onLevel: (v) => b.style.setProperty("--level", String(v)) }); }
      catch (e) { toast(e.message, { error: true }); return; }
      b.dataset.state = "rec";
      const blob = await me.done;
      if (mic === me) mic = null;
      b.dataset.state = "idle";
      b.style.removeProperty("--level");
      if (!live() || !blob) return;
      b.dataset.state = "wait";
      b.disabled = true;
      try {
        const { text } = await hear(blob, lang);
        if (!live()) return;
        const c = closeness(text, line, lang);
        out.hidden = false;
        out.innerHTML = "";
        const heard = h(`<span><span class="cv-tag">Heard</span> <span ${langAttrs(lang)}></span></span>`);
        heard.lastElementChild.textContent = text || "…";
        const verdict = h(`<span class="cv-verdict${c.score >= CLOSE_ENOUGH ? " ok" : ""}"></span>`);
        verdict.textContent = c.score >= CLOSE_ENOUGH ? t("That's it.") : t("Not quite yet. Listen once more, then say it again.");
        out.append(heard, " ", verdict);
        if (c.score >= CLOSE_ENOUGH) buzz("success");
      } catch (e) {
        if (live()) toast(e.message || String(e), { error: true });
      } finally {
        b.dataset.state = "idle";
        b.disabled = false;
      }
    };
    return b;
  }
  /** A section of a result screen: its heading, added to `review`. */
  function section(review, title) {
    const el = h(`<section class="cv-sec"><h3></h3></section>`);
    el.firstElementChild.textContent = title;
    review.append(el);
    return el;
  }
  /** The learner's best line, and the things to work on: each with their own sentence, a better one to hear
   * and to say again, and why. */
  function bestAndFixes(review, d, live) {
    if (d.best) {
      const el = h(`<div class="cv-best"><div class="cv-better-line"></div><p class="small" translate="no"></p></div>`);
      el.querySelector(".cv-better-line").append(lineEl(d.best));
      el.querySelector("p").textContent = d.bestWhy;
      section(review, t("Your best line")).append(el);
    }
    if (!d.fixes.length) return;
    const sec = section(review, t("Work on"));
    for (const f of d.fixes) {
      const el = h(`<div class="cv-work"><strong translate="no"></strong>
        <p class="cv-said"><span class="cv-tag">You said</span> <span ${langAttrs(lang)}></span></p>
        <div class="cv-better-line"><span class="cv-tag">Better</span> </div>
        <p class="small" translate="no"></p>
        <p class="cv-heard small" hidden></p></div>`);
      el.querySelector("strong").textContent = f.point;
      el.querySelector(".cv-said span:last-child").textContent = f.said;
      el.querySelector(".cv-better-line").append(lineEl(f.better), sayButton(f.better), sayAgain(f.better, el.querySelector(".cv-heard"), live));
      el.querySelector("p.small").textContent = f.why;
      sec.append(el);
    }
  }

  function stopAll() {
    stopSaying();
    if (mic) { mic.cancel(); mic = null; }
    bubble.hide();
  }

  // ================================================================================== the list
  function showList() {
    stopAll();
    talk = null;
    busy = false;
    const done = results();
    box.innerHTML = "";
    box.append(bubble.el);
    const page = h(`<div class="cv-list">
      <p class="cv-lead">Practise speaking with someone who never tires. Pick a situation, get things done in it, and see what to work on.</p>
      <div class="cv-need" hidden>
        <p>Conversation needs an AI key: the other person is played by your own AI. Gemini has a free allowance.</p>
        <a class="btn primary" href="#/settings?s=words">Add an AI key</a>
      </div>
      <label class="course-variety" hidden><span>Dialect</span><select aria-label="Which Arabic to speak"></select></label>
      <div class="cv-mock" hidden>
        <div class="cv-mock-head"><span class="cv-card-ic">${icon("target", 22)}</span>
          <div><strong>Mock OPI</strong><span class="cv-card-task">Defense Language Institute</span></div></div>
        <p>A whole practice interview, in the order the real one goes: a warm-up, level checks, probes, a role-play and a wind-down. It takes about 15 minutes and ends with an estimated level and what to work on.</p>
        <p class="small muted">Test conditions: no hints, no meanings and no corrections until the end.</p>
        <div class="cv-mock-forms"></div>
      </div>
      <div class="cv-levels" role="tablist"></div>
      <p class="cv-about"></p>
      <div class="cv-cards"></div>
    </div>`);
    page.querySelector(".cv-need").hidden = aiReady();
    if (lang === "ar") {
      const label = page.querySelector(".course-variety"), pick = label.querySelector("select");
      label.hidden = false;
      pick.innerHTML = ARABIC_VARIETIES.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("");
      pick.value = variety;
      pick.onchange = () => { variety = pick.value; write(VARIETY_KEY, variety); };
    }
    if (isDli()) {
      const card = page.querySelector(".cv-mock"), last = mockResults();
      card.hidden = false;
      for (const f of MOCK_FORMS) {
        const b = h(`<button type="button" class="cv-mock-form"><strong></strong><span class="cv-card-task"></span><span class="cv-mock-last" translate="no"></span></button>`);
        b.querySelector("strong").textContent = t(f.name);
        b.querySelector(".cv-card-task").textContent = t(f.about);
        const was = last[f.id];
        b.querySelector(".cv-mock-last").textContent = was && was.level ? t("Last time: {0}", was.level) : "";
        b.onclick = () => startMock(f.id);
        card.querySelector(".cv-mock-forms").append(b);
      }
    }
    const tabs = page.querySelector(".cv-levels"), about = page.querySelector(".cv-about"), cards = page.querySelector(".cv-cards");
    const paint = () => {
      for (const b of tabs.children) {
        const on = b.dataset.level === level;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      }
      about.textContent = t(levelInfo(level).about);
      cards.innerHTML = "";
      for (const s of scenariosOf(level)) {
        const r = done[s.id];
        const whole = r && r.best >= r.total;
        const card = h(`<button type="button" class="cv-card${whole ? " done" : ""}">
          <span class="cv-card-ic">${icon(s.icon, 22)}</span>
          <span class="cv-card-text"><strong></strong><span class="cv-card-task"></span></span>
          <span class="cv-card-mark"></span></button>`);
        card.querySelector("strong").textContent = t(s.title);
        card.querySelector(".cv-card-task").textContent = t(TASKS[s.task].name);
        const mark = card.querySelector(".cv-card-mark");
        if (whole) mark.innerHTML = icon("check", 18);
        else if (r) mark.textContent = `${r.best}/${r.total}`;
        card.onclick = () => start(s.id);
        cards.append(card);
      }
    };
    for (const l of LEVELS) {
      const b = h(`<button type="button" role="tab" data-level="${l.id}"><strong></strong><small translate="no"></small></button>`);
      b.querySelector("strong").textContent = t(l.name);
      b.querySelector("small").textContent = l.scale;
      b.onclick = () => { level = l.id; write(LEVEL_KEY, level); paint(); };
      tabs.append(b);
    }
    paint();
    box.append(page);
  }

  // ================================================================================== the talk
  /** Can the AI be asked? Says why not when it can't. */
  function ready() {
    if (aiReady()) return true;
    toast(noAi() ? t("AI is turned off (Settings → Word definitions → No AI), so this isn't available.")
      : t("Add an AI key in Settings → Word definitions first."), { error: true });
    return false;
  }
  function start(id) {
    if (!ready()) return;
    talk = newTalk(id, { lang, variety, explain: definerConfig().language || "English" });
    if (!talk) return;
    showTalk();
  }
  /** Start a mock interview, "2" or "3" (DLI students). */
  function startMock(form) {
    if (!ready()) return;
    talk = newMock(form, { lang, variety, explain: definerConfig().language || "English" });
    if (!talk) return;
    showTalk();
  }

  // A conversation and a mock interview share this screen. In an interview (`mock`) the top shows its
  // stages instead of goals, nothing can be tapped or looked up, no hint or correction shows, the app
  // moves it from part to part (converse.js mockNext), and it ends by itself.
  function showTalk() {
    stopAll();
    const mock = !!talk.mock;
    const s = mock ? null : scenario(talk.id);
    const mine = talk; // (answers that arrive after this conversation was left are dropped)
    const live = () => !closed && talk === mine && page.isConnected;
    let hint = null, hintStep = 0;
    box.innerHTML = "";
    box.append(bubble.el);
    const page = h(`<div class="cv-talk">
      <div class="cv-top">
        <button type="button" class="ghost icon cv-back" data-act="back" title="Back to the conversations" aria-label="Back to the conversations">←</button>
        <h2></h2>
        <button type="button" class="ghost icon cv-sound" data-act="sound" aria-label="Read the other person's lines out">${icon("sound", 19)}</button>
        <button type="button" data-act="finish">Finish</button>
      </div>
      <details class="cv-brief" open>
        <summary><span class="cv-count"></span> <span>Your goals</span></summary>
        <p class="cv-you"></p>
        <ul class="cv-goals"></ul>
        <p class="cv-tip"></p>
      </details>
      <div class="cv-chat" aria-live="polite"></div>
      <div class="cv-foot">
      <div class="cv-hint" hidden></div>
      <div class="cv-allset" hidden><span>Every goal is done. Say goodbye, or see how it went.</span>
        <button type="button" class="primary" data-act="finish">See how it went</button></div>
      <form class="cv-reply">
        <button type="button" class="ghost icon" data-act="hint" title="Stuck? Get a hint on what to say" aria-label="Hint">${icon("question", 20)}</button>
        <textarea rows="1" ${langAttrs(lang)}></textarea>
        <button type="button" class="ghost icon cv-mic" data-act="mic" data-state="idle" aria-label="Say your reply">${icon("mic", 20)}<i class="cv-level" aria-hidden="true"></i></button>
        <button type="submit" class="primary icon" title="Send" aria-label="Send">${icon("send", 18)}</button>
      </form>
      <p class="cv-status small muted" aria-live="polite"></p>
      </div>
    </div>`);
    const $ = (sel) => page.querySelector(sel);
    if (mock) {
      $("h2").textContent = t("Mock OPI");
      $(".cv-brief").replaceWith(h(`<details class="cv-brief" open>
        <summary><span>The interview</span></summary>
        <ol class="cv-phases"></ol>
        <p class="cv-tip">Test conditions: no hints, no meanings and no corrections until the end.</p>
      </details>`));
      $('[data-act="hint"]').hidden = true;
      $(".cv-allset").replaceWith(h(`<div class="cv-allset" hidden><span>The interview is over.</span>
        <button type="button" class="primary" data-act="finish">See your result</button></div>`));
    } else {
      $("h2").textContent = t(s.title);
      $(".cv-you").textContent = t(s.you);
      $(".cv-tip").textContent = t(TASKS[s.task].tip);
    }
    const chat = $(".cv-chat"), input = $("textarea"), status = $(".cv-status"), micBtn = $(".cv-mic");
    // (The box is in the language being learned, so the interface's translator leaves it alone: its label is put in here.)
    input.placeholder = t("Type or say your reply");
    input.setAttribute("aria-label", t("Your reply"));
    const hintBox = $(".cv-hint");

    const paintSound = () => {
      const b = $('[data-act="sound"]');
      b.title = sound ? t("The other person's lines are read out. Press to switch that off.") : t("The other person's lines are not read out. Press to switch that on.");
      b.setAttribute("aria-pressed", String(sound));
    };
    paintSound();

    /** The interview's five stages: those behind it ticked, the one it is in marked. */
    function paintPhases() {
      const at = MOCK_PHASES.findIndex((p) => p.id === mockPart(talk).kind), list = $(".cv-phases");
      list.innerHTML = "";
      MOCK_PHASES.forEach((p, i) => {
        const past = talk.ended || i < at;
        const li = h(`<li class="${past ? "on" : i === at ? "now" : ""}"><span class="cv-tick">${past ? icon("check", 15) : ""}</span><span></span></li>`);
        li.lastElementChild.textContent = t(p.name);
        list.append(li);
      });
      $(".cv-allset").hidden = !talk.ended;
    }
    function paintGoals(fresh = []) {
      if (mock) { paintPhases(); return; }
      const { done, total } = score(talk);
      $(".cv-count").textContent = `${done}/${total}`;
      const list = $(".cv-goals");
      list.innerHTML = "";
      for (const g of talk.goals) {
        const on = talk.done.includes(g.id);
        const li = h(`<li class="${on ? "on" : ""}${fresh.includes(g.id) ? " fresh" : ""}${g.id === "tw" ? " tw" : ""}">
          <span class="cv-tick">${on ? icon("check", 15) : ""}</span><span></span></li>`);
        li.lastElementChild.textContent = t(g.text);
        list.append(li);
      }
      const set = allDone(talk);
      $(".cv-allset").hidden = !set;
      $('.cv-top [data-act="finish"]').classList.toggle("primary", !set && said(talk) >= LONG_TALK);
    }

    function setBusy(on, note = "") {
      busy = on;
      page.classList.toggle("busy", on);
      status.textContent = note;
      $('button[type="submit"]').disabled = on;
    }
    const toEnd = () => page.scrollIntoView({ block: "end" });

    function partnerLine(turn, before) {
      if (mock) { // test conditions: the line as it is, to hear again but not to look up
        const line = h(`<div class="cv-msg them"><div class="cv-bubble" ${langAttrs(lang)}></div><div class="cv-under"></div></div>`);
        line.querySelector(".cv-bubble").textContent = turn.text;
        line.querySelector(".cv-under").append(sayButton(turn.text));
        chat.append(line);
        return;
      }
      const el = h(`<div class="cv-msg them"><div class="cv-bubble"></div>
        <div class="cv-under"><button type="button" class="linkish cv-mean-btn">Meaning</button></div>
        <p class="cv-meaning" translate="no" hidden></p></div>`);
      el.querySelector(".cv-bubble").append(lineEl(turn.text, { before }));
      el.querySelector(".cv-under").prepend(sayButton(turn.text));
      const meaning = el.querySelector(".cv-meaning"), btn = el.querySelector(".cv-mean-btn");
      meaning.textContent = turn.meaning;
      btn.hidden = !turn.meaning;
      btn.onclick = () => { meaning.hidden = !meaning.hidden; };
      chat.append(el);
    }

    function myLine(turn, waiting = false) {
      const el = h(`<div class="cv-msg me"><div class="cv-bubble" ${langAttrs(lang)}></div><div class="cv-fix"></div></div>`);
      el.querySelector(".cv-bubble").textContent = turn.text;
      chat.append(el);
      if (!waiting) markMine(el, turn);
      return el;
    }
    /** Under the learner's own line: nothing to fix, or a small mark that opens the line put right. */
    function markMine(el, turn) {
      const slot = el.querySelector(".cv-fix");
      slot.innerHTML = "";
      if (mock) return; // (its corrections wait for the result)
      if (turn.effort === "low") slot.append(h(`<span class="cv-chip warn">${icon("question", 14)} <span>Say a little more</span></span>`));
      else if (turn.off) slot.append(h(`<span class="cv-chip warn">${icon("target", 14)} <span>Back to the subject</span></span>`));
      if (!turn.fix) {
        if (turn.effort !== "low" && !turn.off) slot.append(h(`<span class="cv-chip ok" title="Nothing to correct">${icon("check", 14)}</span>`));
        return;
      }
      const chip = h(`<button type="button" class="cv-chip fix" aria-expanded="false">${icon("edit", 14)} <span>Better</span></button>`);
      const more = h(`<div class="cv-better" hidden><div class="cv-better-line"></div><p class="small" translate="no"></p></div>`);
      more.querySelector(".cv-better-line").append(lineEl(turn.fix), sayButton(turn.fix));
      more.querySelector("p").textContent = turn.note;
      chip.onclick = () => { more.hidden = !more.hidden; chip.setAttribute("aria-expanded", String(!more.hidden)); };
      slot.append(chip, more);
    }

    /** Read the other person's new line out. With no voice for the language, say so once, calmly, under
     * the reply box (a popup in the middle of a conversation nobody asked for would be worse). */
    async function speak(turn) {
      if (!sound) return;
      const spoken = await sayText(turn.text, lang, { dialect: variety, quiet: true });
      if (spoken.failed && live() && sound) {
        sound = false; // (for this visit only: not written down, so it works once a voice is added)
        paintSound();
        status.textContent = t("These lines aren't read out: this device has no voice for this language yet. Press a speaker button to see how to add one.");
      }
    }

    async function open() {
      setBusy(true, t("Setting the scene…"));
      try {
        const answer = await askAi(mock ? mockOpeningPrompt(talk) : openingPrompt(talk));
        if (!live()) return;
        (mock ? applyMockOpening : applyOpening)(talk, answer);
        const turn = talk.turns[talk.turns.length - 1];
        partnerLine(turn, "");
        speak(turn);
        setBusy(false);
        input.focus({ preventScroll: true });
      } catch (e) {
        if (!live()) return;
        setBusy(false);
        status.textContent = "";
        chat.append(retryRow(problem(e), open));
      }
    }
    function retryRow(message, again) {
      const row = h(`<div class="cv-error"><span translate="no"></span> <button type="button">Try again</button></div>`);
      row.firstElementChild.textContent = message;
      row.querySelector("button").onclick = () => { row.remove(); again(); };
      return row;
    }

    async function send(textNow) {
      const text = String(textNow || "").replace(/\s+/g, " ").trim();
      if (!text || busy || !talk.turns.length || talk.ended) return;
      if (mic) { mic.cancel(); mic = null; }
      stopSaying();
      hintBox.hidden = true;
      hint = null; hintStep = 0;
      input.value = "";
      grow();
      const twist = !mock && twistDue(talk);
      const next = mock ? mockNext(talk) : null; // (decided now, before the answer: the app keeps the interview's order)
      const waitingEl = myLine({ text }, true);
      toEnd();
      setBusy(true, t("Listening to you…"));
      try {
        const answer = await askAi(mock ? mockTurnPrompt(talk, text, next) : turnPrompt(talk, text, { twist }));
        if (!live()) return;
        if (mock) {
          const m = applyMockTurn(talk, text, answer, next);
          const line = talk.turns[talk.turns.length - 1];
          // A role-play begins: the candidate gets the situation on a card, in their own language, as in the real interview.
          if (m.moved >= 0 && talk.parts[m.moved].kind === "roleplay") {
            const card = h(`<div class="cv-rolecard"><strong>Role-play</strong><p></p></div>`);
            card.querySelector("p").textContent = t(scenario(talk.parts[m.moved].scene).you);
            chat.append(card);
          }
          partnerLine(line, text);
          paintGoals();
          if (m.ended) { input.disabled = true; micBtn.disabled = true; buzz("success"); }
          speak(line);
          setBusy(false);
          if (m.ended) $('button[type="submit"]').disabled = true;
          toEnd();
          return;
        }
        const a = applyTurn(talk, text, answer, { twist });
        const [mineTurn, theirs] = talk.turns.slice(-2);
        markMine(waitingEl, mineTurn);
        partnerLine(theirs, text);
        paintGoals(a.ticked.concat(twist ? ["tw"] : []));
        if (a.ticked.length) buzz("success");
        speak(theirs);
        setBusy(false);
        toEnd();
      } catch (e) {
        if (!live()) return;
        waitingEl.remove();
        input.value = text;
        grow();
        setBusy(false);
        toast(problem(e), { error: true });
      }
    }

    // ----- a hint, a step at a time: what to say, how to start, a whole sentence -----
    async function showHint() {
      if (busy || !talk.turns.length) return;
      if (!hint) {
        hintBox.hidden = false;
        hintBox.textContent = t("Thinking of a hint…");
        try {
          hint = cleanHint(await askAi(hintPrompt(talk)));
        } catch (e) {
          if (live()) { hintBox.hidden = true; toast(problem(e), { error: true }); }
          return;
        }
        if (!live()) return;
        if (!hint) { hintBox.hidden = true; return; }
        hintStep = 0;
      }
      hintStep = Math.min(3, hintStep + 1);
      hintBox.hidden = false;
      hintBox.innerHTML = "";
      const clue = h(`<p class="cv-clue" translate="no"></p>`);
      clue.textContent = hint.clue;
      if (hint.clue) hintBox.append(clue);
      if (hintStep >= 2 || !hint.clue) {
        const row = h(`<p class="cv-starter"><span>Start with:</span> </p>`);
        row.append(lineEl(`${hint.starter}…`));
        if (hintStep < 3) hintBox.append(row);
      }
      if (hintStep >= 3) {
        const row = h(`<div class="cv-full"><div class="cv-better-line"></div><p class="small muted" translate="no"></p></div>`);
        row.querySelector(".cv-better-line").append(lineEl(hint.full), sayButton(hint.full));
        row.querySelector("p").textContent = hint.meaning;
        hintBox.append(row);
      } else {
        const more = h(`<button type="button" class="linkish">More help</button>`);
        more.onclick = showHint;
        hintBox.append(more);
      }
      const close = h(`<button type="button" class="ghost icon cv-hint-close" title="Close" aria-label="Close">${icon("close", 16)}</button>`);
      close.onclick = () => { hintBox.hidden = true; };
      hintBox.append(close);
    }

    // ----- answering by voice -----
    const where = () => {
      const info = hearInfo();
      return info.local ? t("Your voice is written down on this computer and never leaves it.")
        : t("Your voice is sent to {0} to be written down.", info.provider);
    };
    micBtn.title = hearInfo().can ? `${t("Say your reply")}. ${where()}` : t("Say your reply");
    async function useMic() {
      if (mic) { mic.stop(); return; }
      if (busy || talk.ended) return;
      if (!canRecord()) { toast(t("This device can't record sound here."), { error: true }); return; }
      if (!hearInfo().can) { noHearing(); return; }
      stopSaying();
      let me;
      try {
        me = mic = await listen({ onLevel: (v) => micBtn.style.setProperty("--level", String(v)) });
      } catch (e) {
        toast(e.message, { error: true });
        return;
      }
      micBtn.dataset.state = "rec";
      status.textContent = `${t("Listening… press the microphone again when you have finished.")} ${where()}`;
      const blob = await me.done;
      if (mic === me) mic = null;
      micBtn.dataset.state = "idle";
      micBtn.style.removeProperty("--level");
      if (!live()) return;
      if (!blob) { status.textContent = ""; toast(t("I couldn't hear you. Try again, a little closer to the microphone.")); return; }
      micBtn.dataset.state = "wait";
      micBtn.disabled = true;
      status.textContent = t("Writing down what you said…");
      try {
        const { text } = await hear(blob, lang);
        if (!live()) return;
        if (!text) toast(t("I couldn't hear you. Try again, a little closer to the microphone."));
        else {
          input.value = `${input.value ? `${input.value.trim()} ` : ""}${text}`;
          grow();
          input.focus({ preventScroll: true });
        }
      } catch (e) {
        if (live()) toast(e.message || String(e), { error: true });
      } finally {
        micBtn.dataset.state = "idle";
        micBtn.disabled = false;
        if (live()) status.textContent = input.value ? t("Check what was heard, put it right if you need to, then send it.") : "";
      }
    }
    function noHearing() {
      const m = openModal({ title: t("Answering by voice") });
      m.body.append(h(`<div class="stack">
        <p>Your keyboard has a microphone of its own: tap the reply box, then the microphone on the keyboard, and speak.</p>
        <p>Tamkeen can also write down what you say with an online service and your own key
          (<strong>Settings → Listening &amp; transcripts</strong>). On a computer, the desktop app does it by itself, and your voice never leaves it.</p>
        <div class="row"><a class="btn" href="#/settings?s=listening">Open Settings</a><button type="button" class="primary">OK</button></div></div>`));
      m.body.querySelector("button").onclick = m.close;
      m.body.querySelector("a").onclick = () => m.close();
    }

    const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(140, input.scrollHeight)}px`; };
    input.addEventListener("input", grow);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
    });
    $(".cv-reply").onsubmit = (e) => { e.preventDefault(); send(input.value); };
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "hint") showHint();
      else if (b.dataset.act === "mic") useMic();
      else if (b.dataset.act === "sound") { sound = !sound; write(SOUND_KEY, sound ? "1" : "0"); if (!sound) stopSaying(); paintSound(); }
      else if (b.dataset.act === "finish") finish();
      else if (b.dataset.act === "back") {
        if (said(talk) && !(await confirmBox(t("Leave this conversation?"), t("It isn't kept: next time it starts again from the beginning."), { ok: t("Leave") }))) return;
        if (live()) showList();
      }
    });
    async function finish() {
      if (busy) return;
      if (!said(talk)) { showList(); return; }
      if (!mock) { showDebrief(); return; }
      if (!talk.ended && !(await confirmBox(t("End the interview now?"), t("Without the whole interview there is no estimated level."), { ok: t("End it") }))) return;
      if (live()) showRating();
    }

    paintGoals();
    box.append(page);
    open();
  }

  // ================================================================================== the debrief
  function showDebrief() {
    stopAll();
    const s = scenario(talk.id);
    const mine = talk;
    write(DONE_KEY, JSON.stringify(withResult(results(), talk)));
    const { done, total } = score(talk);
    box.innerHTML = "";
    box.append(bubble.el);
    const page = h(`<div class="cv-debrief">
      <div class="cv-top">
        <button type="button" class="ghost icon cv-back" data-act="list" title="Back to the conversations" aria-label="Back to the conversations">←</button>
        <h2></h2>
      </div>
      <div class="cv-result">
        <div class="cv-result-n"><b translate="no"></b><span>goals reached</span></div>
        <ul class="cv-goals"></ul>
      </div>
      <div class="cv-review"><p class="cv-wait">Looking back over what you said…</p></div>
      <div class="cv-again">
        <button type="button" data-act="again">Try it again</button>
        <button type="button" class="primary" data-act="list">Another conversation</button>
      </div>
    </div>`);
    page.querySelector("h2").textContent = t(s.title);
    page.querySelector(".cv-result-n b").textContent = `${done}/${total}`;
    const list = page.querySelector(".cv-goals");
    for (const g of talk.goals) {
      const on = talk.done.includes(g.id);
      const li = h(`<li class="${on ? "on" : ""}"><span class="cv-tick">${on ? icon("check", 15) : ""}</span><span></span></li>`);
      li.lastElementChild.textContent = t(g.text);
      list.append(li);
    }
    page.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "list") showList();
      else if (b.dataset.act === "again") start(mine.id);
    });
    box.append(page);
    const review = page.querySelector(".cv-review");
    const live = () => !closed && talk === mine && page.isConnected;

    const REACHED = { below: "Not yet at this level: stay here a while.", at: "Right at this level.", above: "Above this level: try the next one." };

    async function load() {
      review.innerHTML = `<p class="cv-wait">${esc(t("Looking back over what you said…"))}</p>`;
      let d;
      try {
        d = cleanDebrief(await askAi(debriefPrompt(mine)), mine);
      } catch (e) {
        if (!live()) return;
        review.innerHTML = "";
        const row = h(`<div class="cv-error"><span translate="no"></span> <button type="button">Try again</button></div>`);
        row.firstElementChild.textContent = problem(e);
        row.querySelector("button").onclick = load;
        review.append(row);
        return;
      }
      if (!live()) return;
      review.innerHTML = "";
      if (d.summary || d.reached) {
        const el = h(`<div class="cv-summary"><p translate="no"></p><p class="cv-reached"></p></div>`);
        el.firstElementChild.textContent = d.summary;
        el.lastElementChild.textContent = d.reached ? t(REACHED[d.reached]) : "";
        el.lastElementChild.hidden = !d.reached;
        review.append(el);
      }
      bestAndFixes(review, d, live);
      if (!d.fixes.length && d.best && done === total) { // (said only when everything was reached: otherwise the summary says what is next)
        section(review, t("Work on")).append(h(`<p class="muted">Nothing stood out to fix. Try the same thing at the next level.</p>`));
      }
      if (d.phrases.length) {
        const sec = section(review, t("Phrases worth keeping"));
        for (const p of d.phrases) {
          const el = h(`<div class="cv-phrase"><div class="cv-better-line"></div><p class="small muted" translate="no"></p></div>`);
          el.querySelector(".cv-better-line").append(lineEl(p.text), sayButton(p.text), keepButton(p));
          el.querySelector("p").textContent = p.meaning;
          sec.append(el);
        }
      }
      if (d.culture) {
        const sec = section(review, t("How it's really done"));
        const p = h(`<p translate="no"></p>`);
        p.textContent = d.culture;
        sec.append(p);
      }
    }

    /** Keep a phrase as a word to review. */
    function keepButton(p) {
      const b = h(`<button type="button" class="linkish cv-keep">Save</button>`);
      b.onclick = async () => {
        b.disabled = true;
        try {
          const row = await api("/vocab", { method: "POST", body: { text: p.text, meaning: p.meaning, notes: "", sentence: p.text, source: "Conversation", language: lang } });
          voiceNewCard(row, "missing");
          reward({ type: "save" }, b);
          b.textContent = t("Saved");
          buzz("success");
        } catch (e) { b.disabled = false; toast(e.message, { error: true }); }
      };
      return b;
    }

    load();
  }

  // ================================================================================== the interview's result
  function showRating() {
    stopAll();
    const mine = talk;
    box.innerHTML = "";
    box.append(bubble.el);
    const page = h(`<div class="cv-debrief cv-rating">
      <div class="cv-top">
        <button type="button" class="ghost icon cv-back" data-act="list" title="Back to the conversations" aria-label="Back to the conversations">←</button>
        <h2>Mock OPI</h2>
      </div>
      <div class="cv-result">
        <div class="cv-result-n"><span>Estimated level</span><b translate="no">…</b></div>
        <p class="cv-groups small" hidden></p>
        <p class="cv-rate-note small muted">A practice estimate, worked out from one interview judged by an AI. It is not an official rating.</p>
      </div>
      <div class="cv-review"><p class="cv-wait">Working out your result…</p></div>
      <div class="cv-again"><button type="button" class="primary" data-act="list">Back to the conversations</button></div>
    </div>`);
    page.addEventListener("click", (e) => { if (e.target.closest('[data-act="list"]')) showList(); });
    box.append(page);
    const review = page.querySelector(".cv-review");
    const live = () => !closed && talk === mine && page.isConnected;
    const HELD = { held: "Level {0} tasks: held", partly: "Level {0} tasks: partly held", not: "Level {0} tasks: not held", none: "Level {0} tasks: not held" };
    const RESULT = { yes: "Done at this level", partly: "Partly", no: "Not yet", none: "Not reached" };

    async function load() {
      review.innerHTML = `<p class="cv-wait">${esc(t("Working out your result…"))}</p>`;
      let r;
      try {
        r = cleanRating(await askAi(ratingPrompt(mine)), mine);
      } catch (e) {
        if (!live()) return;
        review.innerHTML = "";
        const row = h(`<div class="cv-error"><span translate="no"></span> <button type="button">Try again</button></div>`);
        row.firstElementChild.textContent = problem(e);
        row.querySelector("button").onclick = load;
        review.append(row);
        return;
      }
      if (!live()) return;
      review.innerHTML = "";
      page.querySelector(".cv-result-n b").textContent = r.level || "–";
      const groups = page.querySelector(".cv-groups");
      groups.hidden = false;
      groups.textContent = r.complete
        ? `${t(HELD[r.check.state], mine.base)} · ${t(HELD[r.probe.state], mine.reach)}`
        : t("The interview was ended early, so there is no estimate. The parts you did are judged below.");
      if (r.level) write(MOCK_KEY, JSON.stringify({ ...mockResults(), [mine.mock]: { level: r.level, at: Math.round(Date.now() / 1000) } }));
      if (r.summary) {
        const el = h(`<div class="cv-summary"><p translate="no"></p></div>`);
        el.firstElementChild.textContent = r.summary;
        review.append(el);
      }
      const table = section(review, t("How each part went"));
      for (const p of r.parts) {
        const row = h(`<div class="cv-part ${p.result}"><div class="cv-part-head"><strong></strong><span class="cv-tag" translate="no"></span>
          <span class="cv-part-mark"></span></div><p class="small" translate="no"></p></div>`);
        row.querySelector("strong").textContent = t(MOCK_PARTS[p.id] || p.id);
        row.querySelector(".cv-tag").textContent = t(levelInfo(p.level).name); // "Level 2", as in the list of levels
        row.querySelector(".cv-part-mark").textContent = t(RESULT[p.result]);
        row.querySelector("p").textContent = p.evidence;
        row.querySelector("p").hidden = !p.evidence;
        table.append(row);
      }
      if (r.next.length) {
        const sec = section(review, t("To reach the next level"));
        const list = h(`<ol class="cv-next" translate="no"></ol>`);
        for (const line of r.next) { const li = document.createElement("li"); li.textContent = line; list.append(li); }
        sec.append(list);
      }
      bestAndFixes(review, r, live);
      const all = corrections(mine);
      if (all.length) {
        const sec = section(review, t("Every correction"));
        const box2 = h(`<details class="cv-all"><summary></summary></details>`);
        box2.firstElementChild.textContent = t("{0} of your lines could be said better", all.length);
        for (const c of all) {
          const el = h(`<div class="cv-work">
            <p class="cv-said"><span class="cv-tag">You said</span> <span ${langAttrs(lang)}></span></p>
            <div class="cv-better-line"><span class="cv-tag">Better</span> </div>
            <p class="small" translate="no"></p></div>`);
          el.querySelector(".cv-said span:last-child").textContent = c.said;
          el.querySelector(".cv-better-line").append(lineEl(c.better), sayButton(c.better));
          el.querySelector("p.small").textContent = c.note;
          box2.append(el);
        }
        sec.append(box2);
      }
    }
    load();
  }

  showList();
  return () => {
    closed = true;
    box.removeEventListener("click", onWord);
    stopAll();
  };
}
