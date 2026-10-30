// The popup for a YouTube video with no captions at all: one short line on why Tamkeen can't make
// them itself (YouTube's terms don't allow downloading its sound) and that Gemini can (it watches
// the video from its link), with a button that has the learner's Gemini key write them. Without a
// Gemini key the button goes to Settings → Word definitions to add one. Shared by every version;
// youtube.js importVideo opens it (ytgemini.js does the asking).

import { h } from "../app.js";
import { icon } from "../icons.js";
import { openModal } from "./modal.js";
import { settingsHref } from "../fixes.js";
import { captionCents, MAX_SECONDS } from "../ytgemini.js";

/**
 * Offer Gemini captions for `video` ({videoId, title, channel, duration}). `make(video)` writes and keeps
 * them (youtube.js makeGeminiCaptions) and resolves to the episode. Resolves to that episode, or null
 * when the learner turns it down (or goes to Settings for a key).
 */
export function offerGeminiCaptions(video, { hasKey, make, goTo = (href) => { location.hash = href; } }) {
  return new Promise((resolve) => {
    let result = null;
    let working = false;
    const m = openModal({
      title: "No captions on YouTube", cls: "fix-back", cross: false,
      beforeClose: async () => !working,
      onClose: () => resolve(result),
    });
    const box = m.el.querySelector(".modal-box");
    box.classList.add("fix-box");
    m.el.querySelector(".modal-head").prepend(h(`<div class="fix-ico" aria-hidden="true">${icon("sparkle", 30)}</div>`));
    const tooLong = Number(video.duration) > MAX_SECONDS;
    m.body.innerHTML = `<p class="fix-text">YouTube's terms don't let Tamkeen download a video's sound to make captions, but Google's Gemini can watch the video itself and write them.</p>
      <p class="muted gem-cost"></p><p class="fix-note" hidden></p>
      <div class="fix-actions"><button type="button" class="primary fix-go"></button><button type="button" class="ghost fix-no">Not now</button></div>`;
    const cost = m.body.querySelector(".gem-cost");
    const note = m.body.querySelector(".fix-note");
    const go = m.body.querySelector(".fix-go");
    const no = m.body.querySelector(".fix-no");
    no.onclick = () => { if (!working) m.close(); };
    if (tooLong) {
      cost.textContent = "This video is longer than an hour, too long for Gemini to caption in one go.";
      go.hidden = true;
      no.textContent = "Close";
    } else if (!hasKey) {
      cost.textContent = "This needs your own Gemini key: add one in Settings → Word definitions.";
      go.textContent = "Add a Gemini key";
      go.onclick = () => { m.close(); goTo(settingsHref("words", "key")); };
    } else {
      cost.textContent = `Uses your Gemini key: about ${captionCents(video.duration)} US cents.`;
      go.textContent = "Make captions with Gemini";
      go.onclick = async () => {
        working = true;
        go.disabled = no.disabled = true;
        note.hidden = true;
        go.textContent = "Gemini is watching the video…";
        cost.textContent = "This can take a minute or two.";
        try {
          result = await make(video);
          working = false;
          m.close();
        } catch (e) {
          working = false;
          go.disabled = no.disabled = false;
          go.textContent = "Try again";
          cost.textContent = "";
          note.textContent = (e && e.message) || "Gemini couldn't make captions. Try again.";
          note.hidden = false;
        }
      };
    }
    (go.hidden ? no : go).focus();
  });
}
