// Settings → Look & feel → Sound volume (the computer's Settings and the phones' and web app's): one slider for
// Tamkeen's own sounds. The media being played keeps its own volume (appvolume.js says which is which).

import { h } from "../app.js";
import { appVolumePercent, setAppVolume, testChime } from "../appvolume.js";
import { t } from "../i18n.js";

/** Fill `box` (a Settings card) with the slider. */
export function soundVolume(box) {
  const p = appVolumePercent();
  box.append(h(`<div class="stack">
    <h2>Sound volume</h2>
    <p class="set-hint">Card voices, word and sentence audio, the conversation partner, chimes and every other sound
      Tamkeen makes. Podcasts, audiobooks, videos, YouTube, Netflix and reels keep their own volume.</p>
    <div class="set-slider"><label for="app-volume">App sounds</label>
      <input type="range" id="app-volume" min="0" max="100" step="5" value="${p}"><output id="app-volume-val"></output></div>
  </div>`));
  const slider = box.querySelector("#app-volume"), out = box.querySelector("#app-volume-val");
  const show = (v) => { out.textContent = v > 0 ? t("{0}%", v) : t("Off"); };
  show(p);
  slider.oninput = () => { setAppVolume(slider.value); show(Number(slider.value)); };
  slider.onchange = () => testChime();  // let go: hear how loud it is now
}
