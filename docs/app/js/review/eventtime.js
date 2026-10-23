// Today's review as an event in Google Calendar (review/calpopup.js, mobile/src/js/googlecalendar.js;
// the computer's twin is app/googlecalendar.py): which time to offer, the event Google is given, and
// whether a send updates today's event or adds one. No screen or network code here.

const pad = (n) => String(n).padStart(2, "0");
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "HH:MM" for a Date (its own clock). */
export const clockOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The time the popup offers: the one chosen last time on this device (`remembered`, "HH:MM") if it
 *  is still ahead today, otherwise the next quarter hour (never past 23:45: the event is today's). */
export function defaultTime(now = new Date(), remembered = "") {
  const mins = now.getHours() * 60 + now.getMinutes();
  const m = TIME.exec(String(remembered || ""));
  if (m && Number(m[1]) * 60 + Number(m[2]) > mins) return remembered;
  const next = Math.min(23 * 60 + 45, Math.floor(mins / 15) * 15 + 15);
  return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
}

/** The device's time zone ("Europe/London"), "UTC" when the browser doesn't say. */
export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

/** "7:30 pm" (or "19:30", as the device's language writes times) for "19:30". */
export function clockText(time, locale = undefined) {
  const m = TIME.exec(String(time || ""));
  if (!m) return String(time || "");
  try {
    const text = new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    return text.replace(/\s?\b(AM|PM)\b/, (s) => s.toLowerCase().replace(/^\s?/, " "));
  } catch { return time; }
}

/** The Calendar API's event for today's review (`task` from review/tasktext.js reviewTask): it starts
 *  on the task's day at `time` ("HH:MM", the device's clock in `timeZone`) and lasts its minutes. */
export function eventBody(task, time, timeZone) {
  const d = DAY.exec(String(task.due || ""));
  const t = TIME.exec(String(time || ""));
  if (!d) throw new Error("The task needs a day.");
  if (!t) throw new Error("Choose a time.");
  const minutes = Math.min(600, Math.max(1, Math.round(Number(task.minutes) || 1)));
  // Worked out on a clock without a time zone, so it is the wall-clock time Google shows in `timeZone`.
  const at = (extra) => {
    const x = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]) + extra));
    return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:00`;
  };
  const zone = String(timeZone || "") || "UTC";
  return {
    summary: String(task.title || "Tamkeen review").slice(0, 200),
    description: String(task.notes || "").slice(0, 2000),
    start: { dateTime: at(0), timeZone: zone },
    end: { dateTime: at(minutes), timeZone: zone },
    extendedProperties: { private: { tamkeen: String(task.id || `tamkeen-review-${task.due}`) } },
  };
}

/** Send to Google Calendar: update today's event if one was sent today (`kept` = setting
 *  `review_event` {day, id}), otherwise add one. */
export function eventAction(kept, day) {
  return kept && kept.day === day && kept.id ? { method: "PATCH", id: String(kept.id) } : { method: "POST" };
}

/** After trying to update today's event: was it updated? No when Google says it is gone (404/410),
 *  or it was deleted in Google Calendar (still found, but "cancelled"): then a new one is added. */
export function patchKept(status, event) {
  return status >= 200 && status < 300 && !(event && event.status === "cancelled");
}

/** A Google Calendar refusal in words. */
export function calendarError(status, text) {
  if (status === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(text || "")) {
    return "The Google Calendar API isn't switched on for Tamkeen's Google project yet.";
  }
  if (status === 401 || (status === 403 && /insufficient|scope/i.test(text || ""))) {
    return "Google Calendar wasn't allowed, so the review couldn't be added.";
  }
  return `Google Calendar answered with an error (${status}).`;
}
