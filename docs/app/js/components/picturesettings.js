// Settings → Card voices → "Pictures on cards" (prototype "card_pictures"; picturebatch.js does the work, the rules
// are in cardpicture.js). The same card on every version: pages/settings.js on the computer, the phone's
// mobile/src/js/pages/settings.js.
//   - "Add a picture to new cards": cards saved from now on get Openverse's first picture for their meaning.
//   - "Add pictures to my cards": the same for every card of the language being learned that has none, one every
//     few seconds, up to 150 a day on this device; it can be stopped, and pressed again another day for the rest.

import { api, h } from "../app.js";
import { t } from "../i18n.js";
import { NOTICE } from "../cardpicture.js";
import { addPictures, autoOn, onProgress, setAuto, stopPictures } from "../picturebatch.js";
import { picturesOn } from "./cardpic.js";

/** Put the card in `body` (nothing outside prototype mode). Returns a clean-up. */
export function pictureSettings(body) {
  if (!picturesOn()) return () => {};
  const card = h(`<section class="card set-card" data-find="pictures">
    <h2>Pictures on cards</h2>
    <p class="set-hint">A picture on the back of a flashcard, found by its meaning (in English). Tap a card's picture to change it, take your own, or remove it.</p>
    <label class="check"><input type="checkbox" class="pic-auto">
      <span>Add a picture to new cards<br><span class="small muted">Each card you save from now on gets the first picture Openverse finds for its meaning.</span></span></label>
    <div class="row pic-row"><button type="button" class="pic-all">Add pictures to my cards</button>
      <button type="button" class="ghost pic-stop" hidden>Stop</button></div>
    <p class="small pic-state" role="status" hidden></p>
    <p class="small muted pic-note">Only pictures anyone may use, with credit to their maker: CC0, public domain, CC BY and CC BY-SA. Cards get them a few seconds apart, up to 150 a day on this device.</p>
    <p class="small muted pic-notice"></p>
  </section>`);
  body.append(card);
  const $ = (s) => card.querySelector(s);
  $(".pic-notice").textContent = t(NOTICE);
  const auto = $(".pic-auto");
  auto.checked = autoOn();
  auto.onchange = () => setAuto(auto.checked);
  $(".pic-all").onclick = async () => {
    const button = $(".pic-all");
    button.disabled = true;
    try {
      const cards = await api("/vocab");
      const n = addPictures(cards);
      if (!n) show(t("Every card with a meaning already has a picture (or none was found for it)."));
    } catch (e) {
      show(e.message);
    } finally {
      button.disabled = false;
    }
  };
  $(".pic-stop").onclick = () => stopPictures();
  function show(text) { $(".pic-state").hidden = !text; $(".pic-state").textContent = text || ""; }
  const off = onProgress((p) => {
    $(".pic-stop").hidden = !p.running;
    $(".pic-all").hidden = p.running;
    show(progressText(p));
  });
  return off;
}

/** "Adding pictures: 12 of 40", or why it stopped. */
export function progressText(p) {
  if (!p.total) return "";
  const none = p.none ? ` ${t("({0} had none)", p.none)}` : "";
  if (p.running) return t("Adding pictures: {0} of {1}", p.done, p.total) + none;
  if (p.stopped === "day") return t("That's all for today on this device (Openverse's daily limit). Press again tomorrow for the rest ({0} left).", p.left);
  if (p.stopped === "rate") return t("Openverse asked Tamkeen to slow down. Press again in a while for the rest ({0} left).", p.left);
  if (p.stopped === "offline") return t("Couldn't reach Openverse. Check the internet connection and press again ({0} left).", p.left);
  return t("Pictures added to {0} cards.", p.added) + none;
}
