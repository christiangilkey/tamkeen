// The Vocab page's "Basics" tab: the basics course of the language being learned (coursedata.js says
// what a course is). Every version has it.
//
//   - The course: how many of its 1000 words are in the learner's cards (a bar), "Continue" to the
//     first unit not finished, and the 20 units as tiles (50 words each; units still being made say so).
//   - A unit: its 50 words, each with its meaning, its everyday sentence and translation, Word and
//     Sentence to hear them, and "Add" to put it in the learner's cards; "Add all" for the unit.
// An added word is an ordinary card (POST /vocab/batch, in a folder named after the course, e.g.
// "Arabic basics") with the course's audio kept as its voice (saveVoice, the road a card voice takes),
// so it is reviewed, synced, played and put in an Anki export like any other card.

import { api, esc, h, platform, saveVoice, toast } from "../app.js";
import { icon } from "../icons.js";
import { langAttrs, langInfo } from "../languages.js";
import { findWord } from "../cardtext.js";
import { cardOf, courseUrl, markedHtml, progress, unitsOf } from "../coursedata.js";

const url = (name) => courseUrl(name, { platform, host: typeof location !== "undefined" ? location.hostname : "" });
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };

/** The courses there are ({courses: {lang: {...}}}), or null when they can't be reached. */
export async function courseIndex() {
  try {
    const r = await fetch(url("index.json"), { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Is there a basics course for `lang`? */
export async function hasCourse(lang) {
  const index = await courseIndex();
  return !!(index && index.courses && index.courses[lang]);
}

/**
 * Draw the basics course of `lang` into `box`. `onCards` runs after words were added (the page reloads
 * its list and the Review counts). Returns a function that tidies up (stops the audio).
 */
export function coursePanel(box, lang, { onCards = () => {} } = {}) {
  const player = new Audio();
  let stopAt = Infinity;
  player.addEventListener("timeupdate", () => { if (player.currentTime >= stopAt) player.pause(); });
  let course = null, cards = [], prog = null;
  const attrs = langAttrs(lang);
  const name = (langInfo(lang) || {}).name || lang;

  async function load() {
    box.innerHTML = `<div class="course-note muted">Loading the course…</div>`;
    try {
      const r = await fetch(url(`${lang}/course.json`), { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status === 404 ? "none" : "unreachable");
      course = await r.json();
    } catch (e) {
      box.innerHTML = `<div class="course-note"></div>`;
      box.firstChild.textContent = e.message === "none"
        ? `A basics course for ${name} is on its way. Until then, add words with “Add words” on the My words tab.`
        : "The course couldn't be loaded. Check your connection and try again.";
      return;
    }
    await refreshCards();
    const open = Number(lsGet(`course:${lang}:unit`)) || 0;
    if (open && unitsOf(course).some((u) => u.n === open && u.ready)) drawUnit(open);
    else drawCourse();
  }

  async function refreshCards() {
    try { cards = await api("/vocab"); } catch { cards = []; }
    prog = progress(course, cards);
  }

  // ----- the course -----
  function drawCourse() {
    lsSet(`course:${lang}:unit`, "");
    const inCards = prog.have.size;
    const pct = Math.round((inCards / prog.planned) * 100);
    const next = prog.next;
    box.innerHTML = "";
    const head = h(`<section class="course-head">
      <div class="ch-title"><h2 translate="no"></h2><span class="ch-sub"><span class="ch-variety" translate="no"></span><span>The ${prog.planned} most common words, 50 at a time</span></span></div>
      <div class="ch-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${prog.planned}" aria-valuenow="${inCards}"><span style="width:${Math.max(pct, inCards ? 1 : 0)}%"></span></div>
      <div class="ch-stats">${inCards} of ${prog.planned} words in your cards</div>
      ${next ? `<button type="button" class="primary ch-go">${icon("play", 16)} <span>Continue: unit ${next.n}</span></button>` : ""}
    </section>`);
    head.querySelector("h2").textContent = course.title;
    head.querySelector(".ch-variety").textContent = course.variety ? `${course.variety} · ` : "";
    if (next) head.querySelector(".ch-go").onclick = () => drawUnit(next.n);
    box.append(head);
    const grid = h(`<div class="course-units"></div>`);
    for (const u of prog.units) {
      const done = u.ready && u.have === u.count;
      const tile = h(`<button type="button" class="cu-tile${u.ready ? "" : " soon"}${done ? " done" : u.have ? " started" : ""}" ${u.ready ? "" : "disabled"}>
        <span class="cu-n">${u.n}</span>
        <span class="cu-range">Words ${u.from}–${u.to}</span>
        <span class="cu-state">${!u.ready ? "Coming soon" : done ? `${icon("check", 14)} All in your cards` : `${u.have} of ${u.count}`}</span>
        <span class="cu-meter"><span style="width:${u.count ? Math.round((u.have / u.count) * 100) : 0}%"></span></span>
      </button>`);
      if (u.ready) tile.onclick = () => drawUnit(u.n);
      grid.append(tile);
    }
    box.append(grid);
    box.append(h(`<p class="small muted course-credit">The audio is a computer voice (${esc(course.voice && course.voice.name ? course.voice.name : "text to speech")}).
      Meanings and translations are in English for now.</p>`));
  }

  // ----- a unit -----
  function drawUnit(n) {
    const unit = unitsOf(course).find((u) => u.n === n);
    if (!unit) return drawCourse();
    lsSet(`course:${lang}:unit`, String(n));
    const missing = () => unit.words.filter((w) => !prog.have.has(w.n));
    box.innerHTML = "";
    const head = h(`<div class="cu-head">
      <button type="button" class="btn ghost cu-back" title="All units" aria-label="All units">←</button>
      <div class="cu-headtext"><h2>Unit ${n}</h2><span class="muted cu-count"></span></div>
      <button type="button" class="primary cu-addall"></button>
    </div>`);
    head.querySelector(".cu-back").onclick = () => { player.pause(); drawCourse(); };
    const addAll = head.querySelector(".cu-addall");
    const paintHead = () => {
      const left = missing().length;
      head.querySelector(".cu-count").textContent = `Words ${unit.from}–${unit.to} · ${unit.words.length - left} of ${unit.words.length} in your cards`;
      addAll.hidden = !left;
      addAll.textContent = left === unit.words.length ? `Add all ${left} to my cards` : `Add the other ${left}`;
    };
    paintHead();
    box.append(head);
    const list = h(`<ol class="cu-words"></ol>`);
    const rows = new Map();
    for (const w of unit.words) {
      const at = findWord(w.sentence, w.word);
      const sentence = at ? `${esc(w.sentence.slice(0, at[0]))}<b>${esc(w.sentence.slice(at[0], at[1]))}</b>${esc(w.sentence.slice(at[1]))}` : esc(w.sentence);
      const row = h(`<li class="cw">
        <div class="cw-top"><span class="cw-n">${w.n}</span><span class="cw-word ar" ${attrs} translate="no"></span><span class="cw-meaning" translate="no"></span></div>
        <div class="cw-sent ar" ${attrs} translate="no">${sentence}</div>
        <div class="cw-trans" translate="no">${markedHtml(w.translation, esc)}</div>
        <div class="cw-actions">
          <button type="button" class="ghost cw-play" data-part="word">${icon("sound", 15)} Word</button>
          <button type="button" class="ghost cw-play" data-part="sentence">${icon("sound", 15)} Sentence</button>
          <span class="spacer"></span>
          <button type="button" class="cw-add"></button>
        </div>
      </li>`);
      row.querySelector(".cw-word").textContent = w.word;
      row.querySelector(".cw-meaning").textContent = w.meaning;
      for (const b of row.querySelectorAll(".cw-play")) b.onclick = () => play(w, b.dataset.part);
      row.querySelector(".cw-add").onclick = () => add([w]);
      rows.set(w.n, row);
      list.append(row);
    }
    const paintRows = () => {
      for (const [num, row] of rows) {
        const inCards = prog.have.has(num);
        row.classList.toggle("in", inCards);
        const b = row.querySelector(".cw-add");
        b.disabled = inCards;
        b.className = inCards ? "cw-add done" : "cw-add";
        b.innerHTML = inCards ? `${icon("check", 15)} In my cards` : `${icon("plus", 15)} Add`;
      }
    };
    paintRows();
    box.append(list);
    addAll.onclick = () => add(missing());
    box.scrollIntoView({ block: "start" });

    let adding = false;
    async function add(words) {
      if (adding || !words.length) return;
      adding = true;
      addAll.disabled = true;
      for (const w of words) { const b = rows.get(w.n).querySelector(".cw-add"); b.disabled = true; b.textContent = "Adding…"; }
      try {
        const n = await addToCards(words);
        await refreshCards();
        toast(n === 1 ? "Added to your cards, with its audio." : `${n} words added to your cards, with their audio.`);
        onCards();
      } catch (e) {
        toast(e.message || String(e), { error: true });
        await refreshCards();
      } finally {
        adding = false;
        addAll.disabled = false;
        paintRows();
        paintHead();
      }
    }
  }

  /** Put `words` in the learner's cards, in the course's folder, each with its audio. Resolves to how many. */
  async function addToCards(words) {
    const folder = await courseFolder();
    const made = [];
    for (let i = 0; i < words.length; i += 100) {
      const part = words.slice(i, i + 100);
      const answer = await api("/vocab/batch", { method: "POST", body: { cards: part.map((w) => cardOf(w, course, folder)) } });
      (answer.cards || []).forEach((c, k) => made.push([c, part[k]]));
    }
    // Their audio, a few at a time. A word whose audio couldn't be kept is still a card (its voice
    // then comes from Settings → Card voices, as for any card without one).
    let failed = 0;
    for (let i = 0; i < made.length; i += 4) {
      await Promise.all(made.slice(i, i + 4).map(async ([card, w]) => {
        try {
          const r = await fetch(url(`${course.lang}/${w.audio}`));
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          await saveVoice(card.id, await r.blob(), w.times);
        } catch { failed++; }
      }));
    }
    if (failed) toast(`${failed} of the new cards couldn't get their audio now; the card voice reads them.`);
    return made.length;
  }

  /** The folder the course's words go in (made the first time). */
  async function courseFolder() {
    try {
      const folders = await api("/vocab/folders");
      const have = folders.find((f) => f.name === course.title);
      if (have) return have.uid;
      return (await api("/vocab/folders", { method: "POST", body: { name: course.title } })).uid;
    } catch { return ""; }
  }

  async function play(w, part) {
    const t = w.times || {};
    const [from, to] = part === "word" ? [t.start, t.end] : [t.sent_start, t.sent_end];
    if (!Number.isFinite(from)) return;
    const src = url(`${course.lang}/${w.audio}`);
    try {
      if (player.dataset.src !== src) {
        player.src = src;
        player.dataset.src = src;
        await new Promise((ok, bad) => {
          player.addEventListener("loadedmetadata", ok, { once: true });
          player.addEventListener("error", () => bad(new Error("This word's audio couldn't be loaded.")), { once: true });
        });
      }
      player.currentTime = Math.max(0, from - 0.05);
      stopAt = (Number.isFinite(to) ? to : from + 3) + 0.15;
      await player.play();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(e && e.message ? e.message : "This word's audio couldn't be played.", { error: true });
    }
  }

  load();
  return () => { player.pause(); player.removeAttribute("src"); };
}
