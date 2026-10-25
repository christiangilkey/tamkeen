// The Vocab page's "Grammar" tab: the grammar course of the language being learned, explained in the
// learner's own language (grammardata.js says which course that is; tools/grammar/README.md what a course
// is). Every version has it.
//
//   - The course: how many lessons are done (a bar), "Continue" to the first lesson not done, and the
//     lessons by unit, each with its level and a tick once done.
//   - A lesson: its explanation, examples (tap one to hear it with the learner's card voice: saytext.js),
//     common mistakes, and practice; finishing the practice marks it done (setting grammar_progress,
//     synced to the learner's other devices).
//   - A course explained in English for someone who speaks another language: an offer to make the lessons
//     in their language with their own AI key (define-service.js askAi). Only the explanations are sent;
//     every lesson made is kept on this device (grammarstore.js), so it is paid for once.

import { api, esc, h, platform, saveSettings, toast } from "../app.js";
import { icon } from "../icons.js";
import { langAttrs, langInfo } from "../languages.js";
import { UI_LANGUAGES, uiLanguage } from "../i18n.js";
import { DefinerError, PROVIDERS } from "../definer.js";
import { askAi, definerConfig, noAi } from "../define-service.js";
import { cleanProgress, costCents, courseFor, finished, grammarUrl, listVersion, makeLesson, makeList, orderIsRight, progressOf,
         richHtml, shuffled } from "../grammardata.js";
import { courseKey, keep, kept, lessonKey, listKey } from "../grammarstore.js";
import { sayText, stopSaying } from "../saytext.js";

const AI_SETTINGS = "#/settings?s=words&show=key";
const url = (name) => grammarUrl(name, { platform, host: typeof location !== "undefined" ? location.hostname : "" });
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };
const uiName = (code) => (UI_LANGUAGES[code] || {}).native || code;
const uiEnglishName = (code) => (UI_LANGUAGES[code] || {}).name || code;
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
  let alive = true;

  const mode = () => (into ? lsGet(modeKey) : null); // "on", "off", or null (not chosen yet)
  const names = () => ({ from: uiEnglishName(course.from), into: uiEnglishName(into), taught });
  const ask = (prompt) => askAi(prompt);
  const readingsOn = () => lsGet("grammar:readings") !== "off";

  const target = (t, r) => `<span class="gt" ${attrs} translate="no" data-say="${esc(t)}">${esc(t)}</span>${r ? `<span class="gt-r" dir="ltr" translate="no">${esc(r)}</span>` : ""}`;
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
      ${p.next ? `<button type="button" class="primary ch-go">${icon("play", 16)} <span>${p.count ? "Continue" : "Start"}: lesson ${course.lessons.indexOf(p.next) + 1}</span></button>` : ""}
    </section>`);
    head.querySelector("h2").textContent = title;
    head.querySelector("h2").dir = listDir();
    head.querySelector(".ch-variety").textContent = course.variety ? `${course.variety} · ` : "";
    if (p.next) head.querySelector(".ch-go").onclick = () => drawLesson(p.next.id);
    box.append(head);

    if (into) box.append(offerCard());

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
      const again = h(`<p class="course-credit"><button type="button" class="linkish g-offer-again">${icon("sparkle", 15)} Make these lessons in ${esc(uiName(into))} with my AI key</button></p>`);
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
    let text, go;
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
      const cost = cents == null ? "" : cents < 1 ? " It costs less than 1 US cent for the whole course." : ` It costs about ${Math.ceil(cents)} US cents for the whole course.`;
      text = `These lessons are written in ${from}. Tamkeen can put them into ${lang2} for you with your AI key (${esc(model ? model.name : cfg.model)}): only the explanations are translated, the ${esc(taught)} stays exactly as checked.${cost} Each lesson is made once and kept on this device.`;
      go = `<button type="button" class="primary g-yes">${icon("sparkle", 16)} Make them in ${lang2}</button>`;
    }
    card.innerHTML = `<div class="g-offer-text">${icon("sparkle", 18)} <span>${text}</span></div>
      <div class="g-offer-actions">${go}<button type="button" class="ghost g-no">Keep ${from}</button></div>`;
    card.querySelector(".g-no").onclick = () => { lsSet(modeKey, "off"); drawCourse(); };
    const yes = card.querySelector(".g-yes");
    if (yes) {
      yes.onclick = async () => {
        yes.disabled = true;
        yes.innerHTML = `<span class="spinner"></span> Making the list of lessons…`;
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
    btn.innerHTML = `${icon("sparkle", 15)} Make the other ${course.lessons.length - n} now`;
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
        if (btn.isConnected) btn.innerHTML = `<span class="spinner"></span> Making lesson ${done + 1} of ${todo.length}… (Stop)`;
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
        box.innerHTML = `<div class="course-note"><span class="spinner"></span> Making lesson ${n} in ${esc(uiName(into))}…</div>`;
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
        ${before ? `<p class="gl-before small">${icon("check", 14)} Done: ${before.right} of ${before.of} right</p>` : ""}
      </header>
      <div class="gl-body" dir="${dir}"></div>
    </article>`);
    view.querySelector(".gl-title").innerHTML = rich(lesson.title);
    view.querySelector(".gl-summary").innerHTML = rich(lesson.summary);
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
    // Tapping a piece of the language taught says it.
    view.addEventListener("click", (e) => {
      const el = e.target.closest("[data-say]");
      if (!el || !view.contains(el) || e.target.closest("button:not([data-say])")) return;
      el.classList.add("saying");
      sayText(el.dataset.say, lang).then(({ ended }) => ended).finally(() => el.classList.remove("saying"));
    });
    box.append(view);
    box.scrollIntoView({ block: "start" });
  }

  function block(b) {
    if ("p" in b) return h(`<p class="gb-p" translate="no">${rich(b.p)}</p>`);
    if ("tip" in b) {
      const el = h(`<div class="gb-tip"><span class="gb-tag">${icon("star", 14)} Tip</span><p translate="no">${rich(b.tip)}</p></div>`);
      return el;
    }
    if ("term" in b) {
      return h(`<div class="gb-term"><span class="gb-tag">${icon("learn", 14)} Grammar word</span><p translate="no"><b class="gb-term-word">${rich(b.term)}</b>: ${rich(b.means)}</p></div>`);
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

  function example(t, r, tr, note) {
    return h(`<li class="gx" data-say="${esc(t)}" role="button" tabindex="0" title="Listen">
      <span class="gx-say" aria-hidden="true">${icon("sound", 18)}</span>
      <span class="gx-body">
        <span class="gx-t" ${attrs} translate="no">${esc(t)}</span>
        ${r ? `<span class="gx-r" dir="ltr" translate="no">${esc(r)}</span>` : ""}
        ${tr ? `<span class="gx-tr" translate="no">${rich(tr)}</span>` : ""}
        ${note ? `<span class="gx-note small muted" translate="no">${rich(note)}</span>` : ""}
      </span>
    </li>`);
  }

  function mistakes(list) {
    const sec = h(`<section class="gm-list"><h3>${icon("close", 18)} Common mistakes</h3><ul></ul></section>`);
    const ul = sec.querySelector("ul");
    for (const m of list) {
      ul.append(h(`<li class="gm">
        <div class="gm-wrong"><span class="gm-mark" aria-label="Wrong">${icon("close", 15)}</span><span class="gm-text" ${attrs} translate="no">${esc(m.wrong)}</span></div>
        <div class="gm-right" data-say="${esc(m.right)}"><span class="gm-mark" aria-label="Right">${icon("check", 15)}</span><span class="gm-text" ${attrs} translate="no">${esc(m.right)}</span><span class="gm-say" aria-hidden="true">${icon("sound", 15)}</span></div>
        ${m.tr ? `<div class="gm-tr small muted" translate="no">${rich(m.tr)}</div>` : ""}
        <div class="gm-why" translate="no">${rich(m.why)}</div>
      </li>`));
    }
    return sec;
  }

  // ----- practice -----
  function practice(src, lesson, key) {
    const qs = lesson.practice || [];
    const results = new Array(qs.length).fill(null); // true / false once answered (the first try counts)
    const sec = h(`<section class="gp"><h3>${icon("puzzle", 18)} Practice</h3><ol class="gp-list"></ol><div class="gp-done" hidden></div></section>`);
    const ol = sec.querySelector("ol");
    const doneBox = sec.querySelector(".gp-done");
    const answered = (i, right) => {
      if (results[i] !== null) return;
      results[i] = right;
      if (results.every((x) => x !== null)) finish();
    };
    qs.forEach((q, i) => {
      const li = h(`<li class="gq" data-type="${esc(q.type)}"><div class="gq-q" translate="no">${rich(q.q)}</div></li>`);
      if (q.type === "choice") choiceQ(li, q, (ok) => answered(i, ok));
      else if (q.type === "order") orderQ(li, q, (ok) => answered(i, ok));
      else if (q.type === "say") sayQ(li, q, (ok) => answered(i, ok));
      ol.append(li);
    });

    async function finish() {
      const right = results.filter(Boolean).length;
      const next = course.lessons[course.lessons.indexOf(src) + 1];
      doneBox.hidden = false;
      doneBox.innerHTML = `<p class="gp-score"><strong>${right} of ${results.length} right.</strong> ${right === results.length ? "Well done!" : "Lesson done: look again at the ones you missed."}</p>`;
      if (next) {
        const b = h(`<button type="button" class="primary">${icon("play", 16)} <span>Next lesson</span></button>`);
        b.onclick = () => drawLesson(next.id);
        doneBox.append(b);
      } else {
        const b = h(`<button type="button" class="primary">${icon("check", 16)} <span>All lessons</span></button>`);
        b.onclick = () => drawCourse();
        doneBox.append(b);
      }
      try {
        const now = cleanProgress((await api("/settings")).grammar_progress);
        const s = await saveSettings({ grammar_progress: finished(now, key, right, results.length) });
        progress = cleanProgress(s && s.grammar_progress);
      } catch (e) {
        toast(`This lesson couldn't be marked as done: ${(e && e.message) || e}`, { error: true });
      }
    }
    return sec;
  }

  function feedback(li, ok, why) {
    li.classList.add(ok ? "right" : "wrong");
    const f = h(`<div class="gq-fb"><strong>${ok ? `${icon("check", 15)} Right!` : `${icon("close", 15)} Not quite.`}</strong></div>`);
    if (why) f.append(h(`<span translate="no">${rich(why)}</span>`));
    li.append(f);
  }

  function choiceQ(li, q, done) {
    const opts = h(`<div class="gq-options"></div>`);
    q.options.forEach((o, k) => {
      const b = h(`<button type="button" class="gq-opt" translate="no">${rich(o)}</button>`);
      b.onclick = (e) => {
        if (e.target.closest(".gt") && li.classList.contains("answered")) return;
        if (li.classList.contains("answered")) return;
        li.classList.add("answered");
        const ok = k === q.answer;
        for (const [j, x] of [...opts.children].entries()) {
          x.disabled = true;
          if (j === q.answer) x.classList.add("right");
          else if (j === k) x.classList.add("wrong");
        }
        feedback(li, ok, q.why);
        done(ok);
      };
      opts.append(b);
    });
    li.append(opts);
  }

  function orderQ(li, q, done) {
    li.append(h(`<div class="gq-tr" translate="no">“${rich(q.tr)}”</div>`));
    const line = h(`<div class="gq-line" ${attrs} translate="no" aria-label="Your sentence"></div>`);
    const pool = h(`<div class="gq-pool" ${attrs} translate="no"></div>`);
    const again = h(`<button type="button" class="ghost gq-again" hidden>Try again</button>`);
    li.append(line, pool, again);
    let tries = 0;
    const tiles = shuffled(q).map(({ word }) => {
      const t = h(`<button type="button" class="gq-tile"></button>`);
      t.textContent = word;
      t.onclick = () => {
        if (li.classList.contains("checked")) return;
        (t.parentNode === pool ? line : pool).append(t);
        if (!pool.children.length) check();
      };
      pool.append(t);
      return t;
    });
    function check() {
      const picked = [...line.children].map((t) => t.textContent);
      const ok = orderIsRight(q, picked);
      li.classList.add("checked");
      li.querySelector(".gq-fb")?.remove();
      li.classList.remove("right", "wrong");
      if (ok) sayText(picked.join(" "), lang);
      feedback(li, ok, ok ? q.why : "");
      if (!ok) {
        const fb = li.querySelector(".gq-fb");
        fb.append(h(`<span>The right order:</span>`));
        const right = h(`<span class="gq-right" ${attrs} translate="no" data-say="${esc(q.words.join(" "))}">${esc(q.words.join(" "))}</span>`);
        fb.append(right);
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

  function sayQ(li, q, done) {
    const show = h(`<button type="button" class="ghost gq-show">${icon("speak", 16)} Say it, then show the answer</button>`);
    li.append(show);
    show.onclick = () => {
      show.remove();
      const ans = h(`<div class="gq-answer" data-say="${esc(q.answer)}">
        <span class="gx-say" aria-hidden="true">${icon("sound", 18)}</span>
        <span class="gx-body"><span class="gx-t" ${attrs} translate="no">${esc(q.answer)}</span>${q.r ? `<span class="gx-r" dir="ltr" translate="no">${esc(q.r)}</span>` : ""}</span>
      </div>`);
      li.append(ans);
      sayText(q.answer, lang);
      if (q.why) li.append(h(`<div class="gq-why" translate="no">${rich(q.why)}</div>`));
      const ask2 = h(`<div class="gq-self"><span>Did you get it?</span><button type="button" class="ghost gq-yes">${icon("check", 15)} Yes</button><button type="button" class="ghost gq-no">${icon("close", 15)} Not quite</button></div>`);
      li.append(ask2);
      const pick = (ok) => {
        ask2.remove();
        li.classList.add(ok ? "right" : "wrong");
        done(ok);
      };
      ask2.querySelector(".gq-yes").onclick = () => pick(true);
      ask2.querySelector(".gq-no").onclick = () => pick(false);
    };
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
