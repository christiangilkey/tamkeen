// The weekly goal for new things in the Library, on Home beside the coins, gems and goal streak (prototype
// "content_rewards"; the rules are content.js): a chip that says how many new things have been finished this week,
// and the sheet it opens, which says what new things pay and how far each badge for them has come.

import { h } from "../app.js";
import { feature } from "../prototype.js";
import { t } from "../i18n.js";
import { BADGES } from "./data.js";
import { PAY, PROTO, WEEK_GOAL, WEEK_PAY, record, weekly } from "./content.js";
import { sheet } from "./info.js";
import { icon } from "./render.js";

/** The chip's markup, for the Home card's row of counters ("" with the prototype off). */
export const weekChipHtml = () => (feature(PROTO)
  ? `<button type="button" class="hud-count cur-week" id="g-week" title="Weekly goal: new things finished this week">${icon("week_goal")}<b></b></button>`
  : "");

/** Show the week's count on the chip (when there is one). */
export function paintWeekChip(el, game, now = new Date()) {
  if (!el) return;
  const w = weekly(game, now);
  el.classList.toggle("done", w.paid);
  el.querySelector("b").textContent = `${w.done}/${w.goal}`;
  el.setAttribute("aria-label", w.paid ? t("Weekly goal reached: {0} new things finished", w.goal)
    : t("Weekly goal: {0} of {1} new things finished", w.done, w.goal));
}

/** Each badge's target, for the progress lines: [id, what is counted, goal]. */
const BADGE_GOALS = [
  ["content_first", "add", 1], ["content_done_10", "done", 10], ["content_done_50", "done", 50], ["content_done_200", "done", 200],
  ["content_kinds_5", "kinds", 5], ["content_share_1", "sent", 1], ["content_share_25", "sent", 25],
];

/** The sheet the chip opens: the week, what new things pay, and the badges for them. */
export function openWeekly(game, now = new Date()) {
  const w = weekly(game, now);
  const c = record(game);
  const { body } = sheet(t("New things"), "week_goal");
  const now1 = w.paid ? t("Weekly goal reached: +{0} XP and {1} coins. A new week starts on Monday.", WEEK_PAY.xp, WEEK_PAY.coins)
    : w.left === 1 ? t("This week: {0} of {1} new things finished. Today is the last day.", w.done, w.goal)
    : t("This week: {0} of {1} new things finished, {2} days left.", w.done, w.goal, w.left);
  const p = h(`<p class="info-now"></p>`);
  p.textContent = now1;
  body.append(p);
  const pays = [
    t("Add something new to your Library: +{0} XP and {1} coin ({2} a day).", PAY.add.xp, PAY.add.coins, PAY.add.day),
    t("Finish something new to the end (an episode, a chapter, a book, a film): +{0} XP and {1} coins ({2} a day).", PAY.done.xp, PAY.done.coins, PAY.done.day),
    t("A reel or a web page read to the end: +{0} XP and {1} coin ({2} a day).", PAY.short.xp, PAY.short.coins, PAY.short.day),
    t("Share words, a folder or something from your Library with a friend or your class: +{0} XP and {1} coins, once per thing and person ({2} a day).", PAY.sent.xp, PAY.sent.coins, PAY.sent.day),
    t("Finish {0} new things in a week (reels don't count): +{1} XP and {2} coins.", WEEK_GOAL, WEEK_PAY.xp, WEEK_PAY.coins),
  ];
  body.append(listOf(t("What new things pay"), pays));
  body.append(listOf(t("What counts"), [
    t("Each thing counts once: adding the same link or file again, or finishing it again, isn't new."),
    t("Finishing means really listening, watching or reading to the end: skipping there counts nothing."),
    t("YouTube videos and your own recordings don't count."),
  ]));
  const have = { add: c.n.add, done: c.n.done, sent: c.n.sent, kinds: c.kinds.length };
  const rows = BADGE_GOALS.map(([id, what, goal]) => {
    const b = BADGES.find((x) => x.id === id);
    if (!b) return null;
    const got = game.badges.includes(id);
    const row = h(`<li class="week-badge${got ? " got" : ""}">${icon(`badge/${b.art || b.id}`, 24)}<span><b></b> <small></small></span></li>`);
    row.querySelector("b").textContent = t(b.name);
    row.querySelector("small").textContent = got ? t("Earned") : `${t(b.text)} · ${Math.min(goal, have[what])}/${goal}`;
    return row;
  }).filter(Boolean);
  const list = h(`<div><strong></strong><ul class="week-badges"></ul></div>`);
  list.querySelector("strong").textContent = t("Badges");
  list.querySelector("ul").append(...rows);
  body.append(list);
}

function listOf(title, lines) {
  const box = h(`<div><strong></strong><ul></ul></div>`);
  box.querySelector("strong").textContent = title;
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    box.querySelector("ul").append(li);
  }
  return box;
}
