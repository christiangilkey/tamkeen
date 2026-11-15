// The review calendar on the Vocab page (the maths is review/heatmap.js): a year of squares, one per day,
// darker the more flashcards were answered that day; the days still to come show, faded, how many cards
// fall due on them. Hover or tap a day for its number; the arrows (or ← → on the keyboard once the
// calendar has focus) go through the days, ‹ › through the years. Under it: the streak, the longest
// streak, the daily average and the share of days studied. A plain solid panel, centred, no shadow.

import { uiLanguage } from "../i18n.js";
import { icon } from "../icons.js";
import { dayNumber } from "./fsrs.js";
import { forecast, states } from "./deck.js";
import { dailyCounts, stepper, streaks, yearEnd, yearOf, yearStart, yearStats, yearWeeks, years } from "./heatmap.js";

const dateText = (day, opts) => {
  try { return new Date(day * 86400000).toLocaleDateString(uiLanguage() || undefined, { timeZone: "UTC", ...opts }); }
  catch { return new Date(day * 86400000).toISOString().slice(0, 10); }
};
const days = (n) => (n === 1 ? "1 day" : `${n} days`);
const DAY_NAME = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

/** Draw the calendar into `root`. Returns {update(words, log), close()}. */
export function heatmap(root) {
  root.classList.add("hm");
  root.innerHTML = `
    <div class="hm-head">
      <button type="button" class="ghost icon hm-prev" aria-label="Previous year" title="Previous year">${icon("chevron", 18)}</button>
      <h3 class="hm-year"></h3>
      <button type="button" class="ghost icon hm-next" aria-label="Next year" title="Next year">${icon("chevron", 18)}</button>
    </div>
    <div class="hm-scroll"><div class="hm-grid" tabindex="0" role="grid" aria-label="Reviews each day"></div></div>
    <p class="hm-day" role="status" aria-live="polite"></p>
    <div class="hm-stats">
      <span><b class="hm-cur"></b><small>Streak</small></span>
      <span><b class="hm-best"></b><small>Longest streak</small></span>
      <span><b class="hm-avg"></b><small>Daily average</small></span>
      <span><b class="hm-share"></b><small>Days studied</small></span>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const grid = $(".hm-grid");
  let counts = new Map(), ahead = new Map(), step = () => 0, today = dayNumber(), year = yearOf(today), picked = null;
  let drawnYear = null;

  function say(day) {
    picked = day;
    for (const el of grid.querySelectorAll(".on")) el.classList.remove("on");
    const cell = grid.querySelector(`[data-day="${day}"]`);
    if (cell) cell.classList.add("on");
    const date = dateText(day, DAY_NAME);
    const n = counts.get(day) || 0, due = ahead.get(day) || 0;
    $(".hm-day").textContent = day > today
      ? (due === 1 ? `${date}: 1 card due` : due ? `${date}: ${due} cards due` : `${date}: nothing due yet`)
      : n === 1 ? `${date}: 1 review` : n ? `${date}: ${n} reviews` : `${date}: no reviews`;
  }

  function drawYear() {
    const range = years(counts, today);
    year = Math.min(range.last, Math.max(range.first, year));
    $(".hm-year").textContent = String(year);
    $(".hm-prev").disabled = year <= range.first;
    $(".hm-next").disabled = year >= range.last;
    const weeks = yearWeeks(year);
    const fade = (n) => (n > 0 ? Math.min(4, Math.max(1, step(n))) : 0);
    grid.style.setProperty("--hm-weeks", weeks.length);
    grid.innerHTML = weeks.map((week) => `<div class="hm-week" role="row">${week.map((d) => {
      if (d === null) return `<i class="hm-none" aria-hidden="true"></i>`;
      const future = d > today;
      const lvl = future ? fade(ahead.get(d) || 0) : step(counts.get(d) || 0);
      return `<i class="hm-cell l${lvl}${future ? " ahead" : ""}${d === today ? " today" : ""}" data-day="${d}" role="gridcell"></i>`;
    }).join("")}</div>`).join("");
    drawnYear = year;
    const s = yearStats(counts, year, today);
    $(".hm-avg").textContent = s.days ? (s.average >= 10 ? String(Math.round(s.average)) : s.average.toFixed(1).replace(/\.0$/, "")) : "0";
    $(".hm-share").textContent = `${Math.round(s.share * 100)}%`;
    say(picked !== null && yearOf(picked) === year ? picked : year === yearOf(today) ? today : yearEnd(year));
  }

  function draw() {
    const st = streaks(counts, today);
    $(".hm-cur").textContent = days(st.current);
    $(".hm-best").textContent = days(st.longest);
    drawYear();
    // The current week in view on a narrow screen (the calendar scrolls sideways inside its panel).
    if (year === yearOf(today)) {
      const cell = grid.querySelector(".today"), box = $(".hm-scroll");
      if (cell && box.scrollWidth > box.clientWidth) {
        // (measured on screen, so it is the same sum left to right and right to left)
        const c = cell.getBoundingClientRect(), b = box.getBoundingClientRect();
        box.scrollLeft += (c.left + c.width / 2) - (b.left + b.width / 2);
      }
    }
  }

  $(".hm-prev").onclick = () => { year--; drawYear(); };
  $(".hm-next").onclick = () => { year++; drawYear(); };
  const dayAt = (e) => { const el = e.target.closest("[data-day]"); return el ? Number(el.dataset.day) : null; };
  grid.addEventListener("pointerover", (e) => { const d = dayAt(e); if (d !== null && e.pointerType === "mouse") say(d); });
  grid.addEventListener("click", (e) => { const d = dayAt(e); if (d !== null) say(d); });
  grid.addEventListener("keydown", (e) => {
    const move = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (!move) return;
    e.preventDefault();
    const rtl = getComputedStyle(grid).direction === "rtl";
    const d = (picked ?? today) + (rtl && Math.abs(move) === 7 ? -move : move);
    if (d < yearStart(year) || d > yearEnd(year)) { year = yearOf(d); picked = d; drawYear(); } else say(d);
  });

  return {
    update(words, log) {
      today = dayNumber();
      counts = dailyCounts(log);
      step = stepper(counts);
      const days = Math.max(0, yearEnd(yearOf(today)) - today);
      const due = forecast(words, states(log), today, days);
      ahead = new Map(due.map((n, i) => [today + i + 1, n]));
      if (drawnYear === null) year = yearOf(today);
      draw();
    },
    close() {},
  };
}

