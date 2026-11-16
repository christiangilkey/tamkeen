// Library → My audio → Listen: the box shown while Tamkeen records from the microphone. It shows that it
// is listening and for how long; Stop keeps the recording and saves it as a new item in My audio (the
// Library's `save`, the same upload as an audio file the learner adds), Cancel throws it away. If saving
// fails (no sign-in on a phone, no connection), the recording stays in the box to try again.
// Shared by the desktop app, the phone and the web app (listenrec.js has the file, cardaudio.js the microphone).

import { h, toast } from "../app.js";
import { icon } from "../icons.js";
import { t, uiLanguage } from "../i18n.js";
import { canRecord, startRecording } from "../cardaudio.js";
import { LISTEN_MAX_MINUTES, clock, recordingFile, recordingStamp, stampLocale } from "../listenrec.js";
import { confirmBox, openModal } from "./modal.js";
import { offerFix } from "./fixit.js";

export { canRecord };

/** A recording this long or longer is worth a question before Cancel throws it away. */
const ASK_FROM_MS = 10 * 1000;

let open = false; // (one recording at a time)

/** Keep the screen on while listening (a phone that locks itself may stop the microphone). */
async function keepAwake() {
  try { return navigator.wakeLock ? await navigator.wakeLock.request("screen") : null; } catch { return null; }
}

/**
 * Listen until Stop, then save. `save(file, {title, duration, onProgress})` keeps the recording (a File)
 * and resolves to the new item (or throws with plain words). Resolves to that item, or null when nothing
 * was kept (cancelled, or the microphone couldn't be used).
 */
export async function listenAndSave({ save }) {
  if (open) return null;
  open = true;
  const date = new Date();
  let ctl, box = null;
  try {
    ctl = await startRecording({ untilStopped: true, maxSeconds: LISTEN_MAX_MINUTES * 60, onLevel: (level, ms) => box && box.paint(level, ms) });
  } catch (err) {
    open = false;
    if (err && err.kind === "mic") offerFix("mic"); // the popup with the way to allow it
    else toast(err && err.message ? err.message : String(err), { error: true });
    return null;
  }
  const lock = await keepAwake();
  return new Promise((resolve) => {
    let ms = 0, file = null, saving = false, result = null;
    const m = openModal({ title: t("Listening"), canClose: false, cross: false, cls: "lr-back",
      onClose: () => { open = false; if (lock) lock.release().catch(() => {}); resolve(result); } });
    m.body.innerHTML = `<div class="lr-box" role="status" aria-live="polite">
        <div class="lr-meter"><i class="lr-dot" aria-hidden="true"></i><span class="lr-time">0:00</span></div>
        <p class="lr-note">Tamkeen is listening. Keep the app open, then press Stop.</p>
        <p class="lr-error" hidden></p>
      </div>
      <label class="lr-name"><span class="small muted">Name</span><input type="text" maxlength="200" autocomplete="off" dir="auto"></label>
      <div class="confirm-buttons"><button type="button" class="ghost lr-cancel">Cancel</button>
        <button type="button" class="primary lr-stop">${icon("stop", 16)} <span>Stop and save</span></button></div>`;
    const $ = (q) => m.body.querySelector(q);
    const name = $(".lr-name input");
    name.value = t("Recording, {0}", recordingStamp(date, stampLocale(uiLanguage())));
    name.setAttribute("aria-label", t("Name"));
    const time = $(".lr-time"), dot = $(".lr-dot"), note = $(".lr-note"), error = $(".lr-error");
    const cancel = $(".lr-cancel"), stop = $(".lr-stop"), stopWords = $(".lr-stop span");
    box = {
      paint(level, at) {
        ms = at;
        dot.style.setProperty("--level", String(level));
        time.textContent = clock(at);
      },
    };

    const keep = async () => {
      if (saving || !file) return;
      saving = true;
      error.hidden = true;
      cancel.disabled = stop.disabled = true;
      note.textContent = t("Saving…");
      try {
        const title = name.value.replace(/\s+/g, " ").trim() || t("Recording, {0}", recordingStamp(date, stampLocale(uiLanguage())));
        result = await save(file, { title, duration: ms / 1000,
          onProgress: (frac) => { note.textContent = t("Saving… {0}%", Math.round(frac * 100)); } });
        m.close();
      } catch (err) {
        saving = false;
        result = null;
        note.textContent = t("The recording is kept here until you save it or throw it away.");
        error.textContent = err && err.message ? err.message : String(err);
        error.hidden = false;
        cancel.disabled = stop.disabled = false;
        cancel.textContent = t("Discard");
        const sign = stop.querySelector("svg");
        if (sign) sign.remove(); // (no stop sign on "Try again")
        stopWords.textContent = t("Try again");
      }
    };

    // The recording ends at Stop or at the longest kept; either way it is saved.
    ctl.done.then(async (blob) => {
      if (!blob) return; // cancelled
      dot.classList.add("is-still");
      if (!blob.size) {
        toast(t("Nothing was recorded. Try again."), { error: true });
        m.close();
        return;
      }
      try {
        file = await recordingFile(blob, { type: ctl.type, date });
      } catch {
        toast(t("Nothing was recorded. Try again."), { error: true });
        m.close();
        return;
      }
      keep();
    });

    stop.onclick = () => {
      if (file) { keep(); return; } // (Try again)
      stop.disabled = cancel.disabled = true;
      note.textContent = t("Saving…");
      ctl.stop();
    };
    cancel.onclick = async () => {
      if (file) { // after a failed save: throw away what was recorded
        if (await confirmBox(t("Discard this recording?"), t("It hasn't been saved and can't be recovered."), { ok: t("Discard"), danger: true })) m.close();
        return;
      }
      if (ms >= ASK_FROM_MS && !(await confirmBox(t("Discard this recording?"), t("It hasn't been saved and can't be recovered."), { ok: t("Discard"), danger: true }))) return;
      ctl.cancel();
      m.close();
    };
    setTimeout(() => stop.focus(), 30);
  });
}
