// "Send to Google Calendar" under the day's goal (review/goalbar.js): a small box to choose when today's
// review goes in the learner's Google Calendar. It offers the time chosen last time on this device if
// that is still ahead today, otherwise the next quarter hour (review/eventtime.js defaultTime); the
// length is the estimate shown in the bar above. Shared by the computer and the phone.

import { h, toast } from "../app.js";
import { openModal } from "../components/modal.js";
import { icon } from "../icons.js";
import { clockText, defaultTime } from "./eventtime.js";
import { remembered, rememberTime, sendReviewEvent } from "./sendtask.js";

/** Open the box for `task` (review/tasktext.js reviewTask). */
export function openCalendarPopup(task) {
  const last = remembered();
  const m = openModal({ title: "Add to Google Calendar" });
  m.el.classList.add("cal-back");
  const body = h(`<div class="cal-body">
    <label class="cal-label" for="cal-time">${icon("calendar", 18)} Today at</label>
    <input id="cal-time" class="cal-time" type="time" step="300" required>
    <div class="cal-length"></div>
    <p class="cal-note" hidden></p>
    <div class="confirm-buttons"><button type="button" class="ghost">Cancel</button>
      <button type="button" class="primary cal-add">Add to Google Calendar</button></div>
  </div>`);
  const input = body.querySelector(".cal-time"), note = body.querySelector(".cal-note"), add = body.querySelector(".cal-add");
  input.value = defaultTime(new Date(), last.time);
  body.querySelector(".cal-length").textContent = `about ${task.minutes} min`;
  if (last.sent === task.due && last.sentAt) {
    note.textContent = `Already in your calendar today at ${clockText(last.sentAt)}. Adding it again moves it.`;
    note.hidden = false;
  }
  body.querySelector(".ghost").onclick = () => m.close();
  add.onclick = async () => {
    const time = input.value;
    if (!/^\d{2}:\d{2}$/.test(time)) { input.focus(); return; }
    rememberTime(time);
    add.disabled = true;
    try {
      const r = await sendReviewEvent(task, time);
      if (r && r.needs_permission) {
        note.textContent = "Allow Tamkeen to use Google Calendar in the browser window that opened, then press Add again.";
        note.hidden = false;
      } else {
        m.close();
      }
    } catch (err) {
      toast(err.message || "Couldn't add the review to Google Calendar.", { error: true });
    } finally {
      add.disabled = false;
    }
  };
  m.body.append(body);
  add.focus({ preventScroll: true });
  return m;
}
