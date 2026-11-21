// "Get the Tamkeen extension": the browser add-on that brings Tamkeen to Netflix's and Prime Video's own
// players (extension/, "Tamkeen for Netflix & Prime Video"), offered where Netflix is (the Library's
// Netflix heading, the + sheet's Netflix step). Prototype "prime_video" (web/js/prototype.js).
//   - On a computer (the desktop app, or the web app in a browser): what it does with Prime Video, and a
//     button to get it (its store page once it is in one, else the install page: netflix.js
//     extensionLink). The desktop app opens the link in the computer's own browser, where it is added.
//     In a browser that already has it: that it is there, and "Open Prime Video".
//   - On a phone: a plain note that it works on a computer in Chrome or Edge (phones can't add it, and
//     Prime Video only plays in Amazon's own app there).
import { h } from "../app.js";
import { icon } from "../icons.js";
import { uiLanguage, t } from "../i18n.js";
import { extensionHere, extensionLink, extensionStore, storeButtonText } from "../netflix.js";
import { PRIME, primeNote } from "../primevideo.js";

const PHONE_REASONS = ["web-phone", "android", "iphone"];

/** Is this a phone? From netflixSupport()'s answer ({reason}: netflix.js unavailableReason). */
export const onPhone = (support) => PHONE_REASONS.includes(support && support.reason);

/**
 * The add-on's box: {phone} from netflixSupport() (onPhone). `compact`: a smaller look for the Library's
 * heading. The box's words are translated as the page is.
 */
export function addOnBox(phone, { compact = false } = {}) {
  // (styled inline: no new rules in the shared app.css for two small boxes)
  const box = h(`<div class="addon-box" style="margin-top:${compact ? 8 : 14}px"><p class="small${compact ? " muted" : ""} addon-note" style="margin:0 0 8px"></p></div>`);
  box.querySelector(".addon-note").textContent = primeNote(phone);
  if (phone) return box;
  const row = h(`<div class="row addon-row" style="gap:10px;align-items:center;flex-wrap:wrap"></div>`);
  if (extensionHere()) {
    const here = h(`<span class="small muted"></span>`);
    here.textContent = t("The Tamkeen extension is in this browser.");
    const open = h(`<a class="btn" target="_blank" rel="noopener">${icon("film", 16)} Open Prime Video</a>`);
    open.href = PRIME;
    row.append(here, open);
  } else {
    const store = extensionStore(navigator.userAgent);
    const get = store.url
      ? h(`<a class="btn primary" target="_blank" rel="noopener">${icon("puzzle", 16)} <span></span></a>`)
      : h(`<a class="btn primary" target="_blank" rel="noopener">${icon("puzzle", 16)} Get the Tamkeen extension</a>`);
    if (store.url) get.querySelector("span").textContent = storeButtonText(store.browser);
    get.href = extensionLink(navigator.userAgent, uiLanguage());
    row.append(get);
  }
  box.append(row);
  return box;
}
