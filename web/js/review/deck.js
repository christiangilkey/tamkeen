// What the reviewer asks and in which order. Pure functions (no screen, no storage), shared with
// the phone and tested in tests/js/review.test.mjs. The memory model itself is fsrs.js.

import { RETENTION, nextWait, recall, replay } from "./fsrs.js";

export const NEW_CHOICES = [0, 5, 10, 20, 50];
export const NEW_PER_DAY = 20;   // new words a day unless the learner chooses otherwise
export const REQUEUE_GAP = 4;    // a missed word comes back after about this many other cards

const MARKED = /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u;
const clean = (s) => String(s || "").trim();
export const uidOf = (v) => String(v.uid || v.id);

/**
 * The front of a word's card, in the learner's own language: the word's meaning, and the
 * sentence it was saved from, translated. `sentence` is a list of [text, isTheWord] pieces so
 * the part that renders the word can be lit up (a translation saved without ⟦ ⟧ marks is one
 * plain piece). A word with a marked translation but no meaning shows the marked part as its
 * meaning. Null when there is nothing to ask with.
 */
export function prompt(v) {
  const translation = clean(v.translation);
  const marked = MARKED.test(translation);
  const pieces = marked
    ? translation.split(/⟦([^⟦⟧]+)⟧/u).map((text, i) => [text, i % 2 === 1]).filter(([text]) => text)
    : translation.replace(/[⟦⟧]/gu, "") ? [[translation.replace(/[⟦⟧]/gu, ""), false]] : [];
  const meaning = clean(v.meaning) || (marked ? pieces.filter(([, hit]) => hit).map(([text]) => text.trim()).join(" … ") : "");
  if (!clean(v.text) || !meaning) return null;
  return { meaning, sentence: pieces };
}

export const reviewable = (v) => Boolean(v && !v.deleted && prompt(v));

/** Every word's state now: Map of uid -> state (see fsrs.js `answer`), only for words answered. */
export function states(log) {
  const out = new Map();
  for (const [uid, entries] of Object.entries(log || {})) {
    const card = replay(entries);
    if (card) out.set(uid, card);
  }
  return out;
}

/**
 * What there is to do today among `words`:
 *   due    words whose wait is over, most overdue first (ones still to be remembered today lead)
 *   fresh  words never answered, newest saved first, cut to what is left of the day's allowance
 *   waiting  how many never-answered words there are in all
 * `cards` is `states(log)` for the WHOLE log, so new words started today in another folder
 * count against the allowance too.
 */
export function plan(words, cards, today, newPerDay = NEW_PER_DAY) {
  const list = (words || []).filter(reviewable);
  const due = list.filter((v) => { const c = cards.get(uidOf(v)); return c && (c.learning || c.due <= today); })
    .sort((a, b) => {
      const x = cards.get(uidOf(a)), y = cards.get(uidOf(b));
      return (y.learning - x.learning) || (x.due - y.due) || (uidOf(a) < uidOf(b) ? -1 : 1);
    });
  const unseen = list.filter((v) => !cards.has(uidOf(v)))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0) || (uidOf(a) < uidOf(b) ? -1 : 1));
  let startedToday = 0;
  for (const c of cards.values()) if (c.first === today) startedToday++;
  const allowance = Math.max(0, newPerDay - startedToday);
  return { due, fresh: unseen.slice(0, allowance), waiting: unseen.length, startedToday };
}

/** One session's order: the due words with the new ones spread evenly among them. */
export function queue(due, fresh) {
  const out = [...due];
  fresh.forEach((v, i) => {
    const at = Math.round(((i + 1) * (due.length + fresh.length)) / (fresh.length + 1));
    out.splice(Math.min(out.length, at), 0, v);
  });
  return out;
}

/** Put a missed word back into what is left of the session, a few cards on. */
export function requeue(rest, word, gap = REQUEUE_GAP) {
  const out = rest.filter((v) => v !== word);
  out.splice(Math.min(out.length, gap), 0, word);
  return out;
}

/** How many of `words` come due on each of the next `days` days after today: [n tomorrow, ...].
 * A word answered today that is still to be remembered is not counted (it is today's work). */
export function forecast(words, cards, today, days = 7) {
  const out = new Array(days).fill(0);
  for (const v of (words || []).filter(reviewable)) {
    const c = cards.get(uidOf(v));
    if (!c || c.learning) continue;
    const ahead = c.due - today;
    if (ahead >= 1 && ahead <= days) out[ahead - 1]++;
  }
  return out;
}

/** A wait in days the way the buttons and summaries say it: "tomorrow", "4 days", "3 weeks"… */
export function waitText(days) {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 21) return `${days} days`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30.4)} months`;
  const years = Math.round(days / 36.5) / 10;
  return `${years} year${years === 1 ? "" : "s"}`;
}

/** What the "Remembered" button would do for this word today, in words. */
export const waitIfRemembered = (card, today) => waitText(nextWait(card, today));

/** How firmly `words` sit in memory right now: {learned, strong, memory}. `learned` = remembered
 * at least once; `strong` = waiting three weeks or more; `memory` = the average chance (0..1) of
 * recalling a learned word today, or null when none is learned yet. */
export function strength(words, cards, today) {
  let learned = 0, strong = 0, sum = 0;
  for (const v of (words || []).filter(reviewable)) {
    const c = cards.get(uidOf(v));
    if (!c || !c.known) continue;
    learned++;
    if (c.ivl >= 21) strong++;
    sum += c.learning ? 0 : recall(Math.max(0, today - c.day), c.s);
  }
  return { learned, strong, memory: learned ? sum / learned : null, target: RETENTION };
}
