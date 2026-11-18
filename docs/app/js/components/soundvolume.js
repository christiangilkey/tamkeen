// Settings → Sound volume, at the top of the Settings home under the search (the computer's Settings and the phones'
// and web app's: components/settingsui.js settingsHome): one slider for Tamkeen's own sounds and one for the media
// (appvolume.js says which is which).

import { h } from "../app.js";
import { appVolumePercent, mediaVolumePercent, setAppVolume, setMediaVolume, testChime } from "../appvolume.js";
import { t } from "../i18n.js";

/** Fill `box` (a Settings card) with the two sliders. `short`: without the longer explanations under them. */
export function soundVolume(box, { short = false } = {}) {
  box.append(h(`<div class="stack">
    <h2>Sound volume</h2>
    <div class="set-slider"><label for="media-volume">Podcasts, videos &amp; lessons</label>
      <input type="range" id="media-volume" min="0" max="100" step="5" value="${mediaVolumePercent()}"><output id="media-volume-val"></output></div>
    ${short ? "" : `<p class="set-hint">Podcasts, audiobooks, your own audio and video files, recordings and the audio of lessons. YouTube,
      Netflix and reels have their own volume in their players.</p>`}
    <div class="set-slider"><label for="app-volume">App sounds</label>
      <input type="range" id="app-volume" min="0" max="100" step="5" value="${appVolumePercent()}"><output id="app-volume-val"></output></div>
    ${short ? "" : `<p class="set-hint">Card voices, word and sentence audio, the conversation partner, chimes and every other sound
      Tamkeen makes.</p>`}
  </div>`));
  const wire = (id, set, onLetGo) => {
    const slider = box.querySelector(`#${id}`), out = box.querySelector(`#${id}-val`);
    const show = () => { const v = Number(slider.value); out.textContent = v > 0 ? t("{0}%", v) : t("Off"); };
    show();
    slider.oninput = () => { set(slider.value); show(); };
    if (onLetGo) slider.onchange = onLetGo;
  };
  wire("media-volume", setMediaVolume);
  wire("app-volume", setAppVolume, () => testChime());  // let go: hear how loud the app's sounds are now
}
