// Tokens used today: a running total of what the AI lookups on this device have used since
// midnight, shown in Settings → Word definitions. Each provider's answer says how many tokens the
// request read and wrote (definer.js reports it); this file adds them up. Kept on the device, like
// reading progress: a computer and a phone each count their own. Answers served from the saved
// cache use no tokens and are not counted. Shared with the phone.

import { PROVIDERS, onUsage } from "./definer.js";

const KEY = "tokenUse";
export const TOKENS_EVENT = "tamkeen:tokens"; // fired on `window` whenever the total changes

/** The local calendar day, e.g. "2026-10-12". */
export function dayKey(date = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

const blank = (day) => ({ day, in: 0, out: 0, requests: 0, cents: 0, unpriced: 0 });

/** What one request cost in US cents, from the model's listed prices; null for a model typed in
 * by hand, whose price the app doesn't know. */
export function costCents(use) {
  const model = ((PROVIDERS[use.provider] || {}).models || []).find((m) => m.id === use.model);
  return model ? (use.in * model.in + use.out * model.out) / 1e6 : null;
}

/** `saved` with one more request added. A total from an earlier day starts again from zero. */
export function addUsage(saved, use, day = dayKey()) {
  const t = saved && saved.day === day ? { ...blank(day), ...saved } : blank(day);
  const cents = costCents(use);
  return { day, in: t.in + (use.in || 0), out: t.out + (use.out || 0), requests: t.requests + 1,
           cents: t.cents + (cents || 0), unpriced: t.unpriced + (cents === null ? 1 : 0) };
}

/** Today's total: {day, in, out, requests, cents, unpriced}. */
export function tokensToday() {
  const day = dayKey();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.day === day ? { ...blank(day), ...saved } : blank(day);
  } catch {
    return blank(day);
  }
}

/** "0.3¢", "12¢", "$1.25": a cost in cents, as short as is honest. */
export function formatCents(cents) {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  if (cents >= 10) return `${Math.round(cents)}¢`;
  if (cents >= 0.05) return `${cents.toFixed(1)}¢`;
  return "less than 0.1¢";
}

/** The line Settings shows. */
export function describeUsage(t) {
  const tokens = t.in + t.out;
  if (!t.requests) return { tokens, detail: "No lookups yet today." };
  const cost = t.unpriced ? "" : t.cents < 0.05 ? `, ${formatCents(t.cents)}` : `, about ${formatCents(t.cents)}`;
  return { tokens, detail: `${t.requests.toLocaleString()} lookup${t.requests === 1 ? "" : "s"}${cost}` };
}

// Keep the total: every answered request, whichever screen asked.
if (typeof localStorage !== "undefined") {
  onUsage((use) => {
    try { localStorage.setItem(KEY, JSON.stringify(addUsage(tokensToday(), use))); } catch { /* storage unavailable */ }
    if (typeof window !== "undefined") window.dispatchEvent(new Event(TOKENS_EVENT));
  });
}
