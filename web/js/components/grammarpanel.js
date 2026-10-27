// The Library's Courses → "Grammar" tab (pages/library.js): the grammar course of the language being learned, explained in the
// learner's own language (grammardata.js says which course that is; tools/grammar/README.md what a course
// is). Every version has it.
//
//   - The course: how many lessons are done (a bar), "Continue" to the first lesson not done, and the
//     lessons by unit, each with its level and a tick once done.
//   - A lesson: its explanation, examples (tap one to hear it with the learner's card voice: saytext.js),
//     common mistakes, and practice; finishing the practice marks it done (setting grammar_progress,
//     synced to the learner's other devices).
//   - XP in the creature game (game/rules.js earn): finishing a lesson's practice ("grammar", more for more
//     right answers and the first time), and tapping an example to hear it ("hear", once a day each).
//   - A course explained in English for someone who speaks another language: an offer to make the lessons
//     in their language with their own AI key (define-service.js askAi). Only the explanations are sent;
//     every lesson made is kept on this device (grammarstore.js), so it is paid for once.

import { api, esc, h, platform, saveSettings, toast } from "../app.js";
import { icon } from "../icons.js";
import { langAttrs, langInfo } from "../languages.js";
import { UI_LANGUAGES, uiLanguage } from "../i18n.js";
import { DefinerError, PROVIDERS } from "../definer.js";
import { askAi, definerConfig, noAi } from "../define-service.js";
import { checkPrompt, cleanProgress, costCents, courseFor, finished, grammarUrl, listVersion, makeLesson, makeList, orderIsRight,
         optionOrder, plainText, progressOf, reviewQuestions, richHtml, shuffled } from "../grammardata.js";
import { courseKey, keep, kept, lessonKey, listKey } from "../grammarstore.js";
import { sayText, stopSaying } from "../saytext.js";

const AI_SETTINGS = "#/settings?s=words&show=key";
const url = (name) => grammarUrl(name, { platform, host: typeof location !== "undefined" ? location.hostname : "" });
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };
// A language's name in English ("Chinese"): on screen the app's dictionary puts it in the learner's language.
const uiName = (code) => (UI_LANGUAGES[code] || {}).name || code;
const uiEnglishName = uiName;
const uiDir = (code) => (UI_LANGUAGES[code] || {}).dir || "ltr";

/** The published list of grammar courses ({courses: {"en-ar": {...}}}), or null when it can't be reached. */
export async function grammarIndex() {
  try {
    const r = await fetch(url("index.json"), { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** The grammar course for someone learning `lang` in the app's language: {course, made} or null. */
export async function grammarFor(lang) {
  return courseFor(uiLanguage(), lang, await grammarIndex());
}

/** The course as published, or the copy kept from the last time (no connection), or null. */
async function loadCourse(id) {
  try {
    const r = await fetch(url(`${id}/course.json`), { cache: "no-cache" });
    if (r.ok) {
      const course = await r.json();
      keep(courseKey(id), course);
      return course;
    }
  } catch { /* offline: the kept copy */ }
  return kept(courseKey(id));
}

/** Words for an error from the AI (DefinerError messages are already plain). */
function aiMessage(e) {
  if (e instanceof DefinerError && e.message === "NO_KEY") return "Add an AI key in Settings → Word definitions first.";
  return (e && e.message) || String(e);
}

/**
 * Draw the grammar course `choice` ({course: "en-ar", made: "zh" or null}) for language `lang` into `box`.
 * Returns a function that tidies up.
 */
export function grammarPanel(box, lang, choice) {
  const id = choice.course;
  const into = choice.made;           // the learner's language, when the lessons can be made in it
  const modeKey = `grammar:${id}:${into}`;
  const attrs = langAttrs(lang);
  const taught = (langInfo(lang) || {}).name || lang;
  let course = null, list = null, progress = {};
  let making = null;                  // {stop: false} while "Make the rest now" runs
  let currentTopic = "";              // the grammar of the lesson on screen (for the AI's look at "your turn")
  let alive = true;

  const mode = () => (into ? lsGet(modeKey) : null); // "on", "off", or null (not chosen yet)
  const names = () => ({ from: uiEnglishName(course.from), into: uiEnglishName(into), taught });
  const ask = (prompt) => askAi(prompt);
  const readingsOn = () => lsGet("grammar:readings") !== "off";

  const target = (t, r) => `<span class="gt${t.length <= 24 ? " short" : ""}" ${attrs} translate="no" data-say="${esc(t)}">${esc(t)}</span>${r ? `<span class="gt-r" dir="ltr" translate="no">${esc(r)}</span>` : ""}`;
  const rich = (s) => richHtml(s, esc, target);

  async function load() {
    box.innerHTML = `<div class="course-note muted">Loading the course…</div>`;
    course = await loadCourse(id);
    if (!alive) return;
    if (!course) {
      box.innerHTML = `<div class="course-note">The grammar course couldn't be loaded. Check your connection and try again.</div>`;
      return;
    }
    await refreshProgress();
    if (into && mode() === "on") await loadList();
    const open = lsGet(`grammar:${id}:lesson`);
    if (open && course.lessons.some((l) => l.id === open)) drawLesson(open);
    else drawCourse();
  }

  async function refreshProgress() {
    try { progress = cleanProgress((await api("/settings")).grammar_progress); } catch { progress = {}; }
  }

  /** The course list in the learner's language, made once (kept) and again when the course changes. */
  async function loadList(make = false) {
    const have = await kept(listKey(id, into));
    if (have && have.v === listVersion(course)) { list = have.list; return true; }
    list = have ? have.list : null;  // (an older one is better than none while the new one is made)
    if (!make && have) { loadList(true).then((ok) => { if (ok && alive && !box.querySelector(".gl-lesson")) drawCourse(); }); return true; }
    try {
      const made = await makeList(course, { names: names(), ask });
      list = made;
      await keep(listKey(id, into), { v: listVersion(course), list: made, at: Date.now() });
      return true;
    } catch (e) {
      if (make) toast(aiMessage(e), { error: true });
      return false;
    }
  }

  const listed = (l) => {
    const i = course.lessons.indexOf(l);
    const t = mode() === "on" && list && list.lessons && list.lessons[i] && list.lessons[i].id === l.id ? list.lessons[i] : l;
    return { title: t.title, summary: t.summary };
  };
  const unitTitle = (u) => {
    const i = course.units.indexOf(u);
    return mode() === "on" && list && list.units && list.units[i] ? list.units[i].title : u.title;
  };
  const listDir = () => (mode() === "on" && list ? uiDir(into) : uiDir(course.from));

  // ----- the course -----
  async function drawCourse() {
    lsSet(`grammar:${id}:lesson`, null);
    stopSaying();
    const p = progressOf(course, id, progress);
    const pct = p.total ? Math.round((p.count / p.total) * 100) : 0;
    const shownIn = mode() === "on" && list ? into : course.from;
    const title = mode() === "on" && list ? list.title : course.title;
    box.innerHTML = "";
    const head = h(`<section class="course-head grammar-head">
      <div class="ch-title"><h2 translate="no"></h2><span class="ch-sub"><span class="ch-variety" translate="no"></span><span>Explained in ${esc(uiName(shownIn))}</span></span></div>
      <div class="ch-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.count}"><span style="width:${Math.max(pct, p.count ? 1 : 0)}%"></span></div>
      <div class="ch-stats">${p.count} of ${p.total} lessons done</div>
      ${p.next ? `<button type="button" class="primary ch-go">${icon("play", 16)} <span>${p.count ? `Continue: lesson ${course.lessons.indexOf(p.next) + 1}` : `Start: lesson ${course.lessons.indexOf(p.next) + 1}`}</span></button>` : ""}
    </section>`);
    head.querySelector("h2").textContent = title;
    head.querySelector("h2").dir = listDir();
    head.querySelector(".ch-variety").textContent = course.variety ? `${course.variety} · ` : "";
    if (p.next) head.querySelector(".ch-go").onclick = () => drawLesson(p.next.id);
    box.append(head);

    if (into) box.append(offerCard());
    if (p.count) {
      const n = Math.min(8, reviewQuestions(course, id, progress, { count: 8 }).length);
      const card = h(`<button type="button" class="g-review">${icon("refresh", 18)}
        <span class="g-review-text"><strong>Mixed review</strong><span class="small muted">${n} questions from the lessons you've done, so they stick</span></span>
        <span class="g-review-go">${icon("play", 16)}</span></button>`);
      card.onclick = () => drawReview();
      box.append(card);
    }

    const units = h(`<div class="gu-list"></div>`);
    for (const u of p.units) {
      if (!u.lessons.length) continue;
      const sec = h(`<section class="gu">
        <div class="gu-head"><span class="gu-n">${u.n}</span><h3 translate="no"></h3><span class="gu-count muted">${u.done} of ${u.lessons.length}</span></div>
        <ol class="gu-lessons"></ol>
      </section>`);
      sec.querySelector("h3").textContent = unitTitle(course.units.find((x) => x.n === u.n));
      sec.querySelector("h3").dir = listDir();
      const ol = sec.querySelector("ol");
      for (const l of u.lessons) {
        const n = course.lessons.indexOf(l) + 1;
        const rec = progress[`${id}/${l.id}`];
        const t = listed(l);
        const row = h(`<li><button type="button" class="gl-row${rec ? " done" : ""}">
          <span class="gl-n">${n}</span>
          <span class="gl-text"><span class="gl-name" translate="no"></span><span class="gl-sum" translate="no"></span></span>
          <span class="gl-level">${esc(l.level)}</span>
          <span class="gl-state">${rec ? `${icon("check", 16)}<span class="small">${rec.right}/${rec.of}</span>` : ""}</span>
        </button></li>`);
        const name = row.querySelector(".gl-name"), sum = row.querySelector(".gl-sum");
        name.innerHTML = rich(t.title);
        sum.innerHTML = rich(t.summary);
        row.querySelector(".gl-text").dir = listDir();
        row.querySelector("button").onclick = () => drawLesson(l.id);
        ol.append(row);
      }
      units.append(sec);
    }
    box.append(units);
    box.append(h(`<p class="small muted course-credit">Tap an example to hear it, in your card voice (Settings → Card voices).</p>`));
    if (into && mode() === "off") {
      const again = h(`<p class="course-credit"><button type="button" class="linkish g-offer-again">${icon("sparkle", 15)} <span>Make these lessons in ${esc(uiName(into))} with my AI key</span></button></p>`);
      again.querySelector("button").onclick = () => { lsSet(modeKey, null); drawCourse(); };
      box.append(again);
    }
  }

  /** The offer (or, once taken, the bar) for making the lessons in the learner's language. */
  function offerCard() {
    const m = mode();
    if (m === "off") return document.createTextNode("");
    const card = h(`<section class="g-offer"></section>`);
    const lang2 = esc(uiName(into)), from = esc(uiName(course.from));
    const cfg = definerConfig();
    if (m === "on") {
      card.classList.add("on");
      card.innerHTML = `<div class="g-offer-text">${icon("sparkle", 18)} <span>Lessons in ${lang2}, made with your AI key the first time you open them, and kept on this device.</span></div>
        <div class="g-offer-actions"><button type="button" class="ghost g-all"></button><button type="button" class="ghost g-english">Show in ${from}</button></div>`;
      const all = card.querySelector(".g-all");
      paintAll(all);
      all.onclick = () => (making ? (making.stop = true) : makeAll(all));
      card.querySelector(".g-english").onclick = () => { if (making) making.stop = true; lsSet(modeKey, "off"); drawCourse(); };
      return card;
    }
    let text, go, cost = "";
    if (noAi()) {
      text = `These lessons are written in ${from}. With AI turned on (Settings → Word definitions), Tamkeen could put them into ${lang2} for you.`;
      go = `<a class="btn primary" href="${AI_SETTINGS}">Open Settings</a>`;
    } else if (!cfg.key) {
      text = `These lessons are written in ${from}. Tamkeen can put them into ${lang2} for you with your own AI key: add one in Settings → Word definitions.`;
      go = `<a class="btn primary" href="${AI_SETTINGS}">Add an AI key</a>`;
    } else {
      const provider = PROVIDERS[cfg.provider];
      const model = provider && provider.models.find((x) => x.id === cfg.model);
      const cents = costCents(course, model, into);
      cost = cents == null ? "" : cents < 1 ? "It costs less than 1 US cent for the whole course." : `It costs about ${Math.ceil(cents)} US cents for the whole course.`;
      text = `These lessons are written in ${from}. Tamkeen can put them into ${lang2} for you with your AI key (${esc(model ? model.name : cfg.model)}): only the explanations are translated, the ${esc(taught)} stays exactly as checked. Each lesson is made once and kept on this device.`;
      go = `<button type="button" class="primary g-yes">${icon("sparkle", 16)} <span>Make them in ${lang2}</span></button>`;
    }
    card.innerHTML = `<div class="g-offer-text">${icon("sparkle", 18)} <span><span>${text}</span>${cost ? ` <span>${cost}</span>` : ""}</span></div>
      <div class="g-offer-actions">${go}<button type="button" class="ghost g-no">Keep ${from}</button></div>`;
    card.querySelector(".g-no").onclick = () => { lsSet(modeKey, "off"); drawCourse(); };
    const yes = card.querySelector(".g-yes");
    if (yes) {
      yes.onclick = async () => {
        yes.disabled = true;
        yes.innerHTML = `<span class="spinner"></span> <span>Making the list of lessons…</span>`;
        const ok = await loadList(true);
        if (!alive) return;
        if (!ok) { drawCourse(); return; }
        lsSet(modeKey, "on");
        drawCourse();
      };
    }
    return card;
  }

  async function madeCount() {
    let n = 0;
    for (const l of course.lessons) { const m = await kept(lessonKey(id, into, l.id)); if (m && m.v === l.v) n++; }
    return n;
  }
  async function paintAll(btn) {
    if (making) return;
    const n = await madeCount();
    if (!btn.isConnected) return;
    btn.hidden = n >= course.lessons.length;
    btn.innerHTML = `${icon("sparkle", 15)} <span>Make the other ${course.lessons.length - n} now</span>`;
    btn.title = "So they are all here, also without a connection";
  }

  async function makeAll(btn) {
    making = { stop: false };
    const job = making;
    try {
      const todo = [];
      for (const l of course.lessons) { const m = await kept(lessonKey(id, into, l.id)); if (!m || m.v !== l.v) todo.push(l); }
      let done = 0;
      for (const l of todo) {
        if (job.stop || !alive) break;
        if (btn.isConnected) btn.innerHTML = `<span class="spinner"></span> <span>Making lesson ${done + 1} of ${todo.length}…</span> <b>Stop</b>`;
        const { lesson } = await makeLesson(l, { names: names(), ask });
        await keep(lessonKey(id, into, l.id), { v: l.v, lesson, at: Date.now() });
        done++;
      }
      if (!job.stop && done) toast(`${done} lessons made in ${uiName(into)}.`);
    } catch (e) {
      toast(aiMessage(e), { error: true });
    } finally {
      making = null;
      if (btn.isConnected) paintAll(btn);
    }
  }

  // ----- a lesson -----
  async function drawLesson(lessonId, { english = false } = {}) {
    const src = course.lessons.find((l) => l.id === lessonId);
    if (!src) return drawCourse();
    lsSet(`grammar:${id}:lesson`, lessonId);
    stopSaying();
    const n = course.lessons.indexOf(src) + 1;
    let lesson = src, shownIn = course.from, problem = "";
    if (into && mode() === "on" && !english) {
      const have = await kept(lessonKey(id, into, src.id));
      if (have && have.v === src.v) { lesson = have.lesson; shownIn = into; }
      else {
        box.innerHTML = `<div class="course-note"><span class="spinner"></span> <span>Making lesson ${n} in ${esc(uiName(into))}…</span></div>`;
        box.scrollIntoView({ block: "start" });
        try {
          const made = await makeLesson(src, { names: names(), ask });
          await keep(lessonKey(id, into, src.id), { v: src.v, lesson: made.lesson, at: Date.now() });
          lesson = made.lesson;
          shownIn = into;
        } catch (e) {
          problem = aiMessage(e);
        }
        if (!alive || lsGet(`grammar:${id}:lesson`) !== lessonId) return;
      }
    }
    renderLesson(src, lesson, shownIn, problem);
  }

  function renderLesson(src, lesson, shownIn, problem) {
    const n = course.lessons.indexOf(src) + 1;
    const key = `${id}/${src.id}`;
    const before = progress[key];
    const dir = uiDir(shownIn);
    box.innerHTML = "";
    const view = h(`<article class="gl-lesson${readingsOn() ? "" : " no-readings"}">
      <div class="gl-top">
        <button type="button" class="btn ghost gl-back" title="All lessons" aria-label="All lessons">←</button>
        <span class="gl-where muted">Lesson ${n} of ${course.lessons.length} · ${esc(src.level)}</span>
        <span class="spacer"></span>
        ${course.reading ? `<button type="button" class="ghost gl-readings" aria-pressed="${readingsOn()}">${readingsOn() ? "Hide readings" : "Show readings"}</button>` : ""}
        ${into && mode() === "on" ? `<button type="button" class="ghost gl-switch">${shownIn === into ? `In ${esc(uiName(course.from))}` : `In ${esc(uiName(into))}`}</button>` : ""}
      </div>
      ${problem ? `<div class="g-problem"></div>` : ""}
      <header class="gl-header" dir="${dir}">
        <h2 class="gl-title" translate="no"></h2>
        <p class="gl-summary" translate="no"></p>
        ${lesson.topic ? `<p class="gl-topic"><span class="gb-tag">${icon("learn", 13)} <span>Grammar</span></span><span class="gl-topic-text" translate="no"></span></p>` : ""}
        ${before ? `<p class="gl-before small">${icon("check", 14)} <span>Done: ${before.right} of ${before.of} right</span></p>` : ""}
      </header>
      <div class="gl-body" dir="${dir}" data-lang="${esc(shownIn)}"></div>
    </article>`);
    view.querySelector(".gl-title").innerHTML = rich(lesson.title);
    view.querySelector(".gl-summary").innerHTML = rich(lesson.summary);
    if (lesson.topic) view.querySelector(".gl-topic-text").innerHTML = rich(lesson.topic);
    currentTopic = lesson.topic || lesson.title;
    if (problem) {
      const p = view.querySelector(".g-problem");
      p.append(h(`<span>This lesson couldn't be made in ${esc(uiName(into))} now, so it's shown in ${esc(uiName(course.from))}.</span>`));
      const why = document.createElement("span");
      why.className = "small muted";
      why.textContent = problem;
      p.append(why);
      const again = h(`<button type="button" class="ghost">Try again</button>`);
      again.onclick = () => drawLesson(src.id);
      p.append(again);
    }
    view.querySelector(".gl-back").onclick = () => { refreshProgress().then(drawCourse); };
    const rd = view.querySelector(".gl-readings");
    if (rd) rd.onclick = () => {
      lsSet("grammar:readings", readingsOn() ? "off" : "on");
      view.classList.toggle("no-readings", !readingsOn());
      rd.textContent = readingsOn() ? "Hide readings" : "Show readings";
      rd.setAttribute("aria-pressed", String(readingsOn()));
    };
    const sw = view.querySelector(".gl-switch");
    if (sw) sw.onclick = () => (shownIn === into ? renderLesson(src, src, course.from, "") : drawLesson(src.id));

    const body = view.querySelector(".gl-body");
    for (const b of lesson.blocks || []) body.append(block(b));
    if ((lesson.mistakes || []).length) body.append(mistakes(lesson.mistakes));
    body.append(practice(src, lesson, key));
    body.append(lessonNav(src));
    sayOnTap(view);
    box.append(view);
    box.scrollIntoView({ block: "start" });
  }

  function block(b) {
    if ("goal" in b) {
      const g = h(`<section class="gb-goal"><span class="gb-tag">${icon("target", 14)} <span>By the end of this lesson, you can say</span></span></section>`);
      g.append(example(b.goal.t, b.goal.r, b.goal.tr, b.goal.note, "div"));
      return g;
    }
    if ("dialog" in b) {
      const d = h(`<section class="gb-dialog"><div class="gb-dialog-top"><span class="gb-tag">${icon("message", 14)} <span>Conversation</span></span>
        <button type="button" class="ghost gb-playall">${icon("play", 14)} <span>Listen to it all</span></button></div></section>`);
      const lines = b.dialog.map((line, k) => {
        const el = bubble(line, false);
        el.classList.add(k % 2 ? "right-side" : "left-side");
        d.append(el);
        return el;
      });
      d.querySelector(".gb-playall").onclick = async (e) => {
        heard(b.dialog.map((line) => line.t).join("\n"), e.currentTarget); // the whole conversation: one listen
        for (const el of lines) {
          if (!el.isConnected) return;
          el.classList.add("saying");
          const { ended } = await sayText(el.dataset.say, lang);
          await ended;
          el.classList.remove("saying");
          await new Promise((ok) => setTimeout(ok, 250));
        }
      };
      return d;
    }
    if ("p" in b) return h(`<p class="gb-p" translate="no">${rich(b.p)}</p>`);
    if ("tip" in b) {
      const el = h(`<div class="gb-tip"><span class="gb-tag">${icon("star", 14)} <span>Tip</span></span><p translate="no">${rich(b.tip)}</p></div>`);
      return el;
    }
    if ("term" in b) {
      return h(`<div class="gb-term"><span class="gb-tag">${icon("learn", 14)} <span>Grammar word</span></span><p translate="no"><b class="gb-term-word">${rich(b.term)}</b>: ${rich(b.means)}</p></div>`);
    }
    if ("ex" in b) {
      const ul = h(`<ul class="gx-list"></ul>`);
      for (const e of b.ex) ul.append(example(e.t, e.r, e.tr, e.note));
      return ul;
    }
    if ("table" in b) {
      const [head, ...rows] = b.table;
      return h(`<div class="gb-table"><table translate="no">
        <thead><tr>${head.map((c) => `<th>${rich(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`);
    }
    return document.createTextNode("");
  }

  function example(t, r, tr, note, tag = "li") {
    return h(`<${tag} class="gx" data-say="${esc(t)}" role="button" tabindex="0" title="Listen">
      <span class="gx-say" aria-hidden="true">${icon("sound", 18)}</span>
      <span class="gx-body">
        <span class="gx-t" ${attrs} translate="no">${esc(t)}</span>
        ${r ? `<span class="gx-r" dir="ltr" translate="no">${esc(r)}</span>` : ""}
        ${tr ? `<span class="gx-tr" translate="no">${rich(tr)}</span>` : ""}
        ${note ? `<span class="gx-note small muted" translate="no">${rich(note)}</span>` : ""}
      </span>
    </${tag}>`);
  }

  function mistakes(list) {
    const sec = h(`<section class="gm-list"><h3>${icon("close", 18)} <span>Common mistakes</span></h3><ul></ul></section>`);
    const ul = sec.querySelector("ul");
    // A mistake's wrong and right forms, each with its reading under it when the course gives one (rw, rr).
    const form = (t, r) => `<span class="gm-body"><span class="gm-text" ${attrs} translate="no">${esc(t)}</span>${r ? `<span class="gx-r" dir="ltr" translate="no">${esc(r)}</span>` : ""}</span>`;
    for (const m of list) {
      ul.append(h(`<li class="gm">
        <div class="gm-wrong"><span class="gm-mark" aria-label="Wrong">${icon("close", 15)}</span>${form(m.wrong, m.rw)}</div>
        <div class="gm-right" data-say="${esc(m.right)}"><span class="gm-mark" aria-label="Right">${icon("check", 15)}</span>${form(m.right, m.rr)}<span class="gm-say" aria-hidden="true">${icon("sound", 15)}</span></div>
        ${m.tr ? `<div class="gm-tr small muted" translate="no">${rich(m.tr)}</div>` : ""}
        <div class="gm-why" translate="no">${rich(m.why)}</div>
      </li>`));
    }
    return sec;
  }

  // ----- practice -----
  /** Questions as a list: each answered once (the first try counts), `onFinish(right, of, box)` when all are. */
  function questions(list, { title, from = true, onFinish }) {
    const results = new Array(list.length).fill(null);
    const sec = h(`<section class="gp"><h3>${icon("puzzle", 18)} <span></span></h3><ol class="gp-list"></ol><div class="gp-done" hidden></div></section>`);
    sec.querySelector("h3 span").textContent = title;
    const ol = sec.querySelector("ol");
    const doneBox = sec.querySelector(".gp-done");
    const answered = (i, right) => {
      if (results[i] !== null) return;
      results[i] = right;
      if (results.every((x) => x !== null)) onFinish(results.filter(Boolean).length, results.length, doneBox);
    };
    list.forEach((q, i) => {
      const li = h(`<li class="gq" data-type="${esc(q.type)}"></li>`);
      const was = from && q.from && course.lessons.find((l) => l.id === q.from);
      if (was) {
        const tag = h(`<span class="gq-from small">${icon("refresh", 13)} <span>From lesson ${course.lessons.indexOf(was) + 1}</span></span>`);
        tag.title = plainText(listed(was).title);
        li.append(tag);
      }
      li.append(h(`<div class="gq-q" translate="no">${rich(q.q)}</div>`));
      const done = (ok) => answered(i, ok);
      ({ choice: choiceQ, fill: fillQ, order: orderQ, dialogue: dialogueQ, say: sayQ, free: freeQ }[q.type] || ((x, y, d) => d(true)))(li, q, done);
      ol.append(li);
    });
    return sec;
  }

  function practice(src, lesson, key) {
    return questions(lesson.practice || [], {
      title: "Practice",
      onFinish: async (right, of, doneBox) => {
        const next = course.lessons[course.lessons.indexOf(src) + 1];
        const first = !progress[key];
        doneBox.hidden = false;
        doneBox.innerHTML = `<p class="gp-score"><strong></strong> <span></span></p>`;
        doneBox.querySelector("strong").textContent = `${right} of ${of} right.`;
        doneBox.querySelector(".gp-score span").textContent = right === of ? "Well done!" : "Lesson done: look again at the ones you missed.";
        const b = next ? h(`<button type="button" class="primary">${icon("play", 16)} <span>Next lesson</span></button>`)
          : h(`<button type="button" class="primary">${icon("check", 16)} <span>All lessons</span></button>`);
        b.onclick = () => (next ? drawLesson(next.id) : refreshProgress().then(drawCourse));
        doneBox.append(b);
        earnXp({ type: "grammar", key, right, of, first }, doneBox);
        try {
          const now = cleanProgress((await api("/settings")).grammar_progress);
          const s = await saveSettings({ grammar_progress: finished(now, key, right, of) });
          progress = cleanProgress(s && s.grammar_progress);
        } catch (e) {
          toast(`This lesson couldn't be marked as done: ${(e && e.message) || e}`, { error: true });
        }
      },
    });
  }

  /** XP in the creature game (game/game.js reward: nothing when the game is switched off). */
  async function earnXp(event, anchor) {
    try {
      const { reward } = await import("../game/game.js");
      reward(event, anchor);
    } catch { /* no game here */ }
  }

  /** Tapping a piece of the language taught (an example, a word in the text, a line of a conversation)
   * says it, and earns a little XP ("hear" in game/rules.js: once a day for each one). */
  function sayOnTap(view) {
    view.addEventListener("click", (e) => {
      const el = e.target.closest("[data-say]");
      if (!el || !view.contains(el) || e.target.closest("button:not([data-say])")) return;
      el.classList.add("saying");
      sayText(el.dataset.say, lang).then(({ ended }) => ended).finally(() => el.classList.remove("saying"));
      heard(el.dataset.say, el);
    });
  }
  /** The XP for hearing `text`, its effects at the speaker icon (or the text itself). */
  function heard(text, el) {
    const anchor = (el && el.querySelector(".gx-say, .gm-say")) || el;
    earnXp({ type: "hear", key: `${lang}:${text}` }, anchor);
  }

  function feedback(li, ok, why) {
    li.querySelector(".gq-fb")?.remove();
    li.classList.remove("right", "wrong");
    li.classList.add(ok ? "right" : "wrong");
    const f = h(`<div class="gq-fb"><strong>${ok ? `${icon("check", 15)} <span>Right!</span>` : `${icon("close", 15)} <span>Not quite.</span>`}</strong></div>`);
    if (why) f.append(h(`<span translate="no">${rich(why)}</span>`));
    li.append(f);
    return f;
  }

  function choiceQ(li, q, done) {
    const opts = h(`<div class="gq-options"></div>`);
    for (const k of optionOrder(q.options)) {
      const b = h(`<button type="button" class="gq-opt" translate="no" data-k="${k}">${rich(q.options[k])}</button>`);
      b.onclick = () => {
        if (li.classList.contains("answered")) return;
        li.classList.add("answered");
        const ok = k === q.answer;
        for (const x of opts.children) {
          const j = Number(x.dataset.k);
          x.disabled = true;
          if (j === q.answer) x.classList.add("right");
          else if (j === k) x.classList.add("wrong");
        }
        feedback(li, ok, q.why);
        done(ok);
      };
      opts.append(b);
    }
    li.append(opts);
  }

  /** Select the word: tap the word that fills the gap. */
  function fillQ(li, q, done) {
    const [before, after] = String(q.t).split("___");
    const sentence = h(`<div class="gq-fill" ${attrs} translate="no"><span></span><span class="gq-gap" aria-label="gap">…</span><span></span></div>`);
    sentence.children[0].textContent = before;
    sentence.children[2].textContent = after;
    const gap = sentence.querySelector(".gq-gap");
    li.append(sentence);
    const reading = q.r ? h(`<div class="gx-r gq-fill-r" dir="ltr" translate="no"></div>`) : null;
    if (reading) { reading.textContent = String(q.r).replace("___", "…"); li.append(reading); }
    li.append(h(`<div class="gq-tr" translate="no">“${rich(q.tr)}”</div>`));
    const opts = h(`<div class="gq-words" ${attrs}></div>`);
    for (const k of optionOrder(q.options)) {
      const b = tile(q.options[k], q.rs?.[k]);
      b.dataset.k = k;
      b.onclick = () => {
        if (li.classList.contains("answered")) return;
        li.classList.add("answered");
        const ok = k === q.answer;
        gap.textContent = q.options[q.answer];
        gap.classList.add(ok ? "right" : "wrong");
        if (reading && q.rs) reading.textContent = String(q.r).replace("___", q.rs[q.answer]);
        for (const x of opts.children) {
          const j = Number(x.dataset.k);
          x.disabled = true;
          if (j === q.answer) x.classList.add("right");
          else if (j === k) x.classList.add("wrong");
        }
        feedback(li, ok, q.why);
        if (ok) sayText(`${before}${q.options[q.answer]}${after}`, lang);
        done(ok);
      };
      opts.append(b);
    }
    li.append(opts);
  }

  function orderQ(li, q, done) {
    li.append(h(`<div class="gq-tr" translate="no">“${rich(q.tr)}”</div>`));
    const line = h(`<div class="gq-line" ${attrs} translate="no" aria-label="Your sentence"></div>`);
    const pool = h(`<div class="gq-pool" ${attrs} translate="no"></div>`);
    const again = h(`<button type="button" class="ghost gq-again" hidden>Try again</button>`);
    li.append(line, pool, again);
    let tries = 0;
    const tiles = shuffled(q).map(({ i, word }) => {
      const t = tile(word, q.rs?.[i]);
      t.onclick = () => {
        if (li.classList.contains("checked")) return;
        (t.parentNode === pool ? line : pool).append(t);
        if (!pool.children.length) check();
      };
      pool.append(t);
      return t;
    });
    function check() {
      const picked = [...line.children].map((t) => t.dataset.word);
      const ok = orderIsRight(q, picked);
      li.classList.add("checked");
      if (ok) sayText(picked.join(" "), lang);
      const fb = feedback(li, ok, ok ? q.why : "");
      if (!ok) {
        fb.append(h(`<span>The right order:</span>`));
        fb.append(h(`<span class="gq-right" ${attrs} translate="no" data-say="${esc(q.words.join(" "))}">${esc(q.words.join(" "))}</span>`));
        if (q.why) fb.append(h(`<span translate="no">${rich(q.why)}</span>`));
        again.hidden = false;
      }
      if (tries++ === 0) done(ok);
    }
    again.onclick = () => {
      li.classList.remove("checked", "right", "wrong");
      li.querySelector(".gq-fb")?.remove();
      again.hidden = true;
      for (const t of tiles) pool.append(t);
    };
  }

  /** A conversation: the other person's lines appear one by one; at the learner's turns they pick a reply. */
  function dialogueQ(li, q, done) {
    const chat = h(`<div class="gq-chat"></div>`);
    li.append(chat);
    let allRight = true;
    let i = 0;
    const next = () => {
      while (i < q.lines.length && !q.lines[i].options) chat.append(bubble(q.lines[i++], false));
      if (i >= q.lines.length) {
        li.classList.add(allRight ? "right" : "wrong");
        done(allRight);
        return;
      }
      const line = q.lines[i];
      const opts = h(`<div class="gq-replies"></div>`);
      for (const k of optionOrder(line.options)) {
        const b = h(`<button type="button" class="gq-opt gq-reply" ${attrs} translate="no"><span class="gq-reply-t"></span></button>`);
        b.firstChild.textContent = line.options[k];
        if (line.rs?.[k]) { const r = h(`<span class="gx-r" dir="ltr" translate="no"></span>`); r.textContent = line.rs[k]; b.append(r); }
        b.onclick = () => {
          const ok = k === line.answer;
          if (!ok) allRight = false;
          opts.remove();
          chat.append(bubble({ t: line.options[line.answer], r: line.rs?.[line.answer] }, true));
          const fb = h(`<div class="gq-fb small ${ok ? "ok" : "no"}"><strong>${ok ? `${icon("check", 14)} <span>Right!</span>` : `${icon("close", 14)} <span>Not quite.</span>`}</strong></div>`);
          if (line.why) fb.append(h(`<span translate="no">${rich(line.why)}</span>`));
          chat.append(fb);
          sayText(line.options[line.answer], lang);
          i++;
          setTimeout(next, 350);
        };
        opts.append(b);
      }
      chat.append(opts);
    };
    next();
  }

  /** A word tile to tap: the word, and its reading under it when there is one (hidden with readings off). */
  function tile(word, reading) {
    const t = h(`<button type="button" class="gq-tile" translate="no"><span class="gq-tile-t"></span></button>`);
    t.dataset.word = word;
    t.firstChild.textContent = word;
    if (reading) { const r = h(`<span class="gx-r" dir="ltr" translate="no"></span>`); r.textContent = reading; t.append(r); }
    return t;
  }

  function bubble(line, mine) {
    const el = h(`<div class="gb-line${mine ? " mine" : ""}" data-say="${esc(line.t)}">
      ${line.who && !mine ? `<span class="gb-who small" translate="no"></span>` : ""}
      <span class="gx-t" ${attrs} translate="no"></span>
      ${line.r ? `<span class="gx-r" dir="ltr" translate="no"></span>` : ""}
      ${line.tr ? `<span class="gx-tr" translate="no"></span>` : ""}
    </div>`);
    if (el.querySelector(".gb-who")) el.querySelector(".gb-who").innerHTML = rich(line.who);
    el.querySelector(".gx-t").textContent = line.t;
    if (line.r) el.querySelector(".gx-r").textContent = line.r;
    if (line.tr) el.querySelector(".gx-tr").innerHTML = rich(line.tr);
    return el;
  }

  function sayQ(li, q, done) {
    const show = h(`<button type="button" class="ghost gq-show">${icon("speak", 16)} <span>Say it, then show the answer</span></button>`);
    li.append(show);
    show.onclick = () => {
      show.remove();
      li.append(answerCard(q.answer, q.r));
      sayText(q.answer, lang);
      if (q.why) li.append(h(`<div class="gq-why" translate="no">${rich(q.why)}</div>`));
      selfCheck(li, done, "Did you get it?");
    };
  }

  function answerCard(t, r, tr = "") {
    return h(`<div class="gq-answer" data-say="${esc(t)}">
      <span class="gx-say" aria-hidden="true">${icon("sound", 18)}</span>
      <span class="gx-body"><span class="gx-t" ${attrs} translate="no">${esc(t)}</span>${r ? `<span class="gx-r" dir="ltr" translate="no">${esc(r)}</span>` : ""}${tr ? `<span class="gx-tr" translate="no">${rich(tr)}</span>` : ""}</span>
    </div>`);
  }

  function selfCheck(li, done, question) {
    const box2 = h(`<div class="gq-self"><span></span><button type="button" class="ghost gq-yes">${icon("check", 15)} <span>Yes</span></button><button type="button" class="ghost gq-no">${icon("close", 15)} <span>Not quite</span></button></div>`);
    box2.querySelector("span").textContent = question;
    li.append(box2);
    const pick = (ok) => { box2.remove(); li.classList.add(ok ? "right" : "wrong"); done(ok); };
    box2.querySelector(".gq-yes").onclick = () => pick(true);
    box2.querySelector(".gq-no").onclick = () => pick(false);
  }

  /** "Your turn": the learner's own sentence, typed or said; model answers; the AI's look if there is a key. */
  function freeQ(li, q, done) {
    const input = h(`<textarea class="gq-input" rows="2" ${attrs} placeholder="Write your answer here, or just say it aloud" aria-label="Your answer"></textarea>`);
    const row = h(`<div class="gq-free-actions"></div>`);
    const canCheck = !noAi() && !!definerConfig().key;
    const check = canCheck ? h(`<button type="button" class="ghost gq-check">${icon("sparkle", 15)} <span>Check with AI</span></button>`) : null;
    const show = h(`<button type="button" class="ghost gq-show">${icon("speak", 16)} <span>Show example answers</span></button>`);
    if (check) row.append(check);
    row.append(show);
    li.append(input, row);
    if (check) {
      check.onclick = async () => {
        const answer = input.value.trim();
        if (!answer) { input.focus(); return; }
        check.disabled = true;
        check.innerHTML = `<span class="spinner"></span> <span>Checking…</span>`;
        try {
          const shownIn = li.closest(".gl-body") ? li.closest(".gl-body").dataset.lang : course.from;
          const verdict = await askAi(checkPrompt({ explain: uiEnglishName(shownIn || course.from), taught }, {
            topic: plainText(currentTopic || ""), question: q.q, models: (q.answers || []).map((a) => a.t), answer, variety: course.variety,
          }));
          li.querySelector(".gq-ai")?.remove();
          const ai = h(`<div class="gq-ai ${verdict.ok ? "ok" : "no"}"><strong>${verdict.ok ? `${icon("check", 15)} <span>Looks right!</span>` : `${icon("edit", 15)} <span>A suggestion:</span>`}</strong></div>`);
          if (!verdict.ok && verdict.corrected) ai.append(answerCard(String(verdict.corrected)));
          if (verdict.note) { const n = document.createElement("span"); n.textContent = String(verdict.note); n.setAttribute("translate", "no"); ai.append(n); }
          row.after(ai);
        } catch (e) {
          toast(aiMessage(e), { error: true });
        } finally {
          check.disabled = false;
          check.innerHTML = `${icon("sparkle", 15)} <span>Check with AI</span>`;
        }
      };
    }
    show.onclick = () => {
      show.remove();
      const models = h(`<div class="gq-models"><span class="small muted">For example:</span></div>`);
      for (const a of q.answers || []) models.append(answerCard(a.t, a.r, a.tr));
      row.after(models);
      selfCheck(li, done, "Could you say something like this?");
    };
  }

  // ----- the mixed review: questions from lessons already done (grammardata.js reviewQuestions) -----
  function drawReview() {
    lsSet(`grammar:${id}:lesson`, null);
    stopSaying();
    const picks = reviewQuestions(course, id, progress, { count: 8 });
    if (!picks.length) return drawCourse();
    box.innerHTML = "";
    const view = h(`<article class="gl-lesson${readingsOn() ? "" : " no-readings"}">
      <div class="gl-top">
        <button type="button" class="btn ghost gl-back" title="All lessons" aria-label="All lessons">←</button>
        <span class="gl-where muted">Mixed review</span>
      </div>
      <header class="gl-header"><h2 class="gl-title">Mixed review</h2>
        <p class="gl-summary">Questions from the lessons you've done, the ones longest ago and the ones you found hardest first. Getting them back out of your memory is what makes them stick.</p></header>
      <div class="gl-body" dir="${uiDir(course.from)}"></div>
    </article>`);
    view.querySelector(".gl-back").onclick = () => refreshProgress().then(drawCourse);
    const qs = picks.map((p) => ({ ...p.q, from: p.lesson }));
    view.querySelector(".gl-body").append(questions(qs, {
      title: "Practice",
      onFinish: (right, of, doneBox) => {
        doneBox.hidden = false;
        doneBox.innerHTML = `<p class="gp-score"><strong></strong></p>`;
        doneBox.querySelector("strong").textContent = `${right} of ${of} right.`;
        const b = h(`<button type="button" class="primary">${icon("check", 16)} <span>All lessons</span></button>`);
        b.onclick = () => refreshProgress().then(drawCourse);
        doneBox.append(b);
        earnXp({ type: "grammar", key: `review:${id}:${new Date().toDateString()}`, right, of }, doneBox);
      },
    }));
    sayOnTap(view);
    box.append(view);
    box.scrollIntoView({ block: "start" });
  }

  function lessonNav(src) {
    const i = course.lessons.indexOf(src);
    const prev = course.lessons[i - 1], next = course.lessons[i + 1];
    const nav = h(`<nav class="gl-nav"></nav>`);
    if (prev) { const b = h(`<button type="button" class="ghost">← Previous</button>`); b.onclick = () => drawLesson(prev.id); nav.append(b); }
    nav.append(h(`<span class="spacer"></span>`));
    const all = h(`<button type="button" class="ghost">All lessons</button>`);
    all.onclick = () => refreshProgress().then(drawCourse);
    nav.append(all);
    nav.append(h(`<span class="spacer"></span>`));
    if (next) { const b = h(`<button type="button" class="ghost">Next →</button>`); b.onclick = () => drawLesson(next.id); nav.append(b); }
    return nav;
  }

  const onSynced = () => { refreshProgress().then(() => { if (alive && course && !box.querySelector(".gl-lesson")) drawCourse(); }); };
  window.addEventListener("tamkeen:grammar", onSynced);
  load();
  return () => { alive = false; if (making) making.stop = true; stopSaying(); window.removeEventListener("tamkeen:grammar", onSynced); };
}
