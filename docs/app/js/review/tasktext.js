// Today's review session as a to-do (review/sendtask.js): its title, time and notes, and the
// onyx:// link that hands it to Onyx Calendar. No screen or network code here.

import { roundMinutes, timeText } from "./goal.js";

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Today's review as a task: {title, minutes, notes, due, id}. `t` is review/goal.js today(),
 *  `left` its estimate(). */
export function reviewTask(t, left, now = new Date()) {
  const minutes = Math.max(1, roundMinutes((left.ms || 0) / 60000));
  const due = localDay(now);
  const parts = [];
  if (t.revLeft) parts.push(plural(t.revLeft, "review"));
  if (t.newLeft) parts.push(plural(t.newLeft, "new word"));
  return {
    title: `Tamkeen review (${minutes} min)`,
    minutes,
    due,
    id: `tamkeen-review-${due}`,
    notes: `${parts.join(" and ") || "Your cards"} left today: about ${timeText(left) || `${minutes} min`}, by Tamkeen's estimate.`,
  };
}

/** The link that hands a task to Onyx Calendar (the contract agreed with Onyx's chat, Onyx 1.43.0):
 *  onyx://task?title&minutes&due&notes&id&from&n. The same `id` updates the task in Onyx rather than
 *  adding another; `n` (when it was sent) makes each send count as new on Android. */
export function onyxLink(task, now = Date.now()) {
  // (Onyx takes titles up to 120 characters, notes up to 1000 and 1-600 minutes.)
  const q = new URLSearchParams({ title: String(task.title).slice(0, 120), minutes: String(Math.min(600, Math.max(1, task.minutes))),
                                  due: task.due, notes: String(task.notes || "").slice(0, 1000), id: task.id, from: "tamkeen", n: String(now) });
  return `onyx://task?${q}`;
}

