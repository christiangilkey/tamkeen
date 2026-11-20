// A YouTube video whose own sound is in another language, with a dubbed track in the one being learned (YouTube's
// "multi-language audio"): YouTube's player starts with the original, and Tamkeen can't choose the track from outside
// it (YouTube's IFrame API has no way to). So the way to it is shown as the video opens (the owner, 2026-11-20), with
// "Don't show this again" (this device). Once that is ticked, the old short note under the video says it instead
// (player.js).
//
// Not a box over the page: nothing may be drawn in front of YouTube's player, a dimmed page included. It opens on the
// black band under the video (as the word popup does on YouTube), and the video gets shorter while it is open.
//
// Shared by the desktop app, the phone and the web app.

import { h } from "../app.js";
import { t } from "../i18n.js";

const KEY = "dubTipOff";

/** Whether the learner ticked "Don't show this again". */
export function dubTipOff() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Show it after `after` (the band's last line: the note under the captions). `language`: the name of the language
 * being learned ("Arabic"); `translated`: the words under the video are YouTube's translation of the original (they
 * won't match the dubbed sound). Returns a function that takes it away; `onClose` once it is gone.
 */
export function showDubTip({ after, language, translated = false, onClose = () => {} }) {
  const el = h(`<section class="dub-tip" role="dialog" aria-labelledby="dub-tip-title">
      <div class="dub-tip-head"><h3 id="dub-tip-title"></h3>
        <button type="button" class="ghost icon dub-tip-x" title="Close" aria-label="Close">✕</button></div>
      <p class="dub-tip-text"></p>
      <ol class="dub-steps"><li></li><li></li><li></li></ol>
      <p class="dub-tr" hidden></p>
      <div class="dub-tip-end">
        <label class="dub-off"><input type="checkbox"> <span>Don't show this again</span></label>
        <button type="button" class="primary dub-ok">OK</button>
      </div>
    </section>`);
  el.querySelector("h3").textContent = t("Hear it in {0}", language);
  el.querySelector(".dub-tip-text").textContent = t("YouTube plays this video in its original language first. It has {0} sound too, but Tamkeen can't switch to it for you. In the YouTube player:", language);
  const steps = el.querySelectorAll(".dub-steps li");
  steps[0].textContent = t("Tap ⚙ (Settings).");
  steps[1].textContent = t("Tap Audio track.");
  steps[2].textContent = t("Choose {0}.", language);
  const tr = el.querySelector(".dub-tr");
  tr.hidden = !translated;
  if (translated) tr.textContent = t("The words under the video are YouTube's translation of the original, so they won't match the {0} sound exactly.", language);
  const off = el.querySelector("input");
  const close = () => {
    if (!el.isConnected) return;
    // (The tick counts however it is closed: OK or ✕.)
    if (off.checked) { try { localStorage.setItem(KEY, "1"); } catch { /* storage off: shown again next time */ } }
    el.remove();
    onClose();
  };
  el.querySelector(".dub-ok").onclick = close;
  el.querySelector(".dub-tip-x").onclick = close;
  after.after(el);
  return close;
}
