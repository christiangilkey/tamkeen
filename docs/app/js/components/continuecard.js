// "Continue": the last thing played, watched or read and not finished (progress.js), as a big button, and at most two
// more in progress under it. Home had it; with the Library's Home (prototype "library_home") it sits at the top of the
// Library instead (the owner, 2026-11-27: "have the last thing we listened to/used be on the library home page instead
// of in the current home page"). Shared by both, so it looks the same wherever it is.

import { api, esc, h } from "../app.js";
import { continueItems, forgetProgress, fraction, leftLabel } from "../progress.js";
import { episodeLanguage, studyLanguage } from "../languages.js";
import { icon } from "../icons.js";

// The app's own line icons (icons.js), the same as the tab bar's.
const KIND_ICON = { audio: "podcast", video: "video", page: "page" };
const KIND_VERB = { audio: "Continue listening", video: "Continue watching", page: "Continue reading" };

/** What is in progress here, newest first, at most `limit`: only what is still in the library and in the language
 *  being learned now (anything deleted since is forgotten). */
export async function inProgress(limit = 3) {
  const out = [];
  for (const item of continueItems()) {
    if (out.length >= limit) break;
    try {
      const ep = await api(`/episodes/${item.id}`);
      // (with a picture for a round cover: its own, else its podcast's or channel's; pages have none)
      if (episodeLanguage(ep) === studyLanguage()) out.push({ ...item, cover: item.image || ep.image || ep.feed_image || "" });
    } catch {
      forgetProgress(item.id);
    }
  }
  return out;
}

/** The big "Continue listening / watching / reading" button for `item`. */
export function continueButton(item) {
  const btn = h(`<a class="continue-btn" href="#/episode/${item.id}">
    <span class="continue-play" aria-hidden="true">${icon("play", 24)}</span>
    <span class="continue-text">
      <span class="continue-verb">${KIND_VERB[item.kind] || "Continue"}</span>
      <span class="continue-title" dir="auto"></span>
      <span class="continue-sub"><span dir="auto" class="continue-from"></span><span>${esc(leftLabel(item))}</span></span>
    </span>
    <span class="continue-bar"><i style="width:${Math.round(fraction(item) * 100)}%"></i></span>
  </a>`);
  btn.querySelector(".continue-title").textContent = item.title || "";
  btn.querySelector(".continue-from").textContent = item.sub ? `${item.sub} · ` : "";
  return btn;
}

/** A smaller row for another thing in progress. */
export function continueRow(item) {
  const row = h(`<a class="continue-row" href="#/episode/${item.id}">
    <span class="continue-ico">${icon(KIND_ICON[item.kind] || "video", 20)}</span>
    <span class="continue-text"><span class="t" dir="auto"></span>
      <span class="small muted">${esc(leftLabel(item))}</span></span>
    <span class="continue-bar"><i style="width:${Math.round(fraction(item) * 100)}%"></i></span>
  </a>`);
  row.querySelector(".t").textContent = item.title || "";
  return row;
}

/** Fill `main` with the button and `more` with "Also in progress" and its rows. Resolves to how many there were. */
export async function continueInto(main, more, limit = 3) {
  const items = await inProgress(limit);
  if (!items.length) return 0;
  main.append(continueButton(items[0]));
  if (items.length > 1) more.append(h(`<h2 class="home-h">Also in progress</h2>`));
  for (const item of items.slice(1)) more.append(continueRow(item));
  return items.length;
}
