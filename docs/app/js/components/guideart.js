// The page guides' small drawings (tour.js "picture" steps), and the players' walk-through, shared by
// the podcast and video player (pages/player.js) and the reel player (pages/reels.js): how to tap a
// word, hold and slide across several, the word popup and its buttons, where a meaning comes from and
// how to change it, and the player's own buttons. The drawings are made from the app's own icons,
// so they look like the real thing; a soft pulse marks the part a step is about.

import { esc } from "../app.js";
import { icon } from "../icons.js";

/** A word from the screen to show in the drawings (the first one in the transcript), or "palabra". */
function wordOn(root) {
  const w = root && root.querySelector(".w");
  const text = w ? w.textContent.trim() : "";
  return text && text.length <= 24 ? text : "palabra";
}

/** The word popup, with its parts: `mark` pulses one of them ("source" or "save"). */
export function popupArt(root, mark = "") {
  return `<div class="ga-pop" aria-hidden="true">
    <div class="ga-head"><span class="ga-word" dir="auto">${esc(wordOn(root))}</span>
      <span class="ga-src${mark === "source" ? " ga-pulse" : ""}">AI ${icon("chevron", 10)}</span></div>
    <div class="ga-mean"></div><div class="ga-line"></div><div class="ga-line short"></div>
    <div class="ga-btns">
      <span class="ga-btn">${icon("sound", 14)}</span><span class="ga-btn">${icon("sentence", 14)}</span>
      <span class="ga-btn">${icon("play", 14)}</span>
      <span class="ga-btn primary${mark === "save" ? " ga-pulse" : ""}">${icon("star", 14)} <span>Save</span></span>
    </div></div>`;
}

/** What each of the popup's buttons does: its icon and a few words. */
export function buttonsArt() {
  const rows = [["sound", "Word", "Hear the word again"], ["sentence", "Sentence", "Hear its whole sentence"],
    ["play", "Continue", "Carry on playing from that word"], ["star", "Save", "Add the word to your review cards"],
    ["mic", "Add audio", "Choose a voice for cards saved from here"], ["refresh", "Ask again", "Explain the word afresh"],
    ["target", "More", "Quick lookup: open the full explanation"]];
  return `<div class="ga-legend" aria-hidden="true">${rows.map(([ic, name, what]) =>
    `<div class="ga-row"><span class="ga-btn">${icon(ic, 15)}</span><span><strong>${name}</strong><span class="muted"> · ${what}</span></span></div>`).join("")}</div>`;
}

/** The "Explain words with" menu, the dictionary choice pulsing. */
export function sourceArt() {
  const opt = (name, detail, on, pulse) => `<div class="ga-opt${on ? " on" : ""}${pulse ? " ga-pulse" : ""}">
    <span class="ga-check">${on ? icon("check", 13) : ""}</span><span><strong>${name}</strong><small>${detail}</small></span></div>`;
  return `<div class="ga-menu" aria-hidden="true"><div class="ga-menu-title">Explain words with</div>
    ${opt("AI", "Claude, ChatGPT, Gemini…", true, false)}
    ${opt("Built-in dictionary", "Wiktionary · free, works offline", false, true)}
    ${opt("Dictionary first, AI when it has nothing", "The best of both", false, false)}</div>`;
}

/** Quick or detailed lookup: the two buttons of the switch. */
export function lookupArt() {
  return `<div class="ga-legend" aria-hidden="true">
    <div class="ga-row"><span class="ga-btn on">${icon("bolt", 15)}</span><span><strong>Quick</strong><span class="muted"> · just the meaning</span></span></div>
    <div class="ga-row"><span class="ga-btn">${icon("target", 15)}</span><span><strong>Detailed</strong><span class="muted"> · the full explanation</span></span></div></div>`;
}

/** The pause / keep playing switch, flipping back and forth. */
export function switchArt() {
  return `<div class="ga-switchrow" aria-hidden="true"><span class="muted">Pause</span><span class="ga-switch"><span></span></span><span class="muted">Keep playing</span></div>`;
}

/**
 * The players' guide.
 * @param {"player"|"reel"|"reader"} kind (the reader: a webpage or a book, words with no sound)
 */
export function playerSteps(kind = "player") {
  const reel = kind === "reel";
  const reader = kind === "reader";
  return [
    { target: [".w.cur", ".w"], demo: "tap", title: "Tap a word",
      text: "Tap any word to see what it means. A popup opens with its meaning." },
    { target: [".w.cur", ".w"], demo: "drag", title: "Several words at once",
      text: "Press and hold a word until it lights up, then slide across the next words and let go: they are explained together, as one phrase. With a mouse, press and drag." },
    { art: (root) => popupArt(root), title: "The word popup",
      text: "It shows the meaning, how the word is used here and its dictionary form. Scroll it for more." },
    reader ? null : { art: buttonsArt, title: "The popup's buttons", text: "Along its bottom, these buttons:" },
    { art: (root) => popupArt(root, "save"), title: "Save it to learn",
      text: "Save turns the word into a review card, with this sentence and its sound. Find your cards in Vocab." },
    { art: (root) => popupArt(root, "source"), title: "Who explained it",
      text: "The small label at the top of the popup says where the meaning came from. Tap it to choose another source." },
    { art: sourceArt, title: "Change the source",
      text: "AI explains every word in context. The built-in dictionary (Wiktionary) is free and works offline. Your choice is kept for every language." },
    { target: ".lookup-toggle", art: lookupArt, title: "Quick or detailed",
      text: "Choose how much a tapped word shows: just its meaning, or the full explanation." },
    reader ? null : reel ? { target: ".wb-mode", title: "Pause or keep playing",
      text: "After a word you tapped, the reel pauses so you can read, or keeps playing. Flip this to choose." }
      : { art: switchArt, title: "Pause or keep playing",
        text: "The switch at the top of the popup: after a word you tapped, pause so you can read, or keep playing." },
    { target: reel ? "#rc-play" : "#play", title: "Play and pause", text: reel ? "Play or pause the reel." : "Play or pause. On a computer, the space bar does it too." },
    { target: reel ? "#rc-back" : "#back5", title: "Back or forward 5 seconds", text: "Hear a bit again, or skip ahead." },
    { target: "#restart", title: "The line again", text: "Back to the start of the line you're hearing. Twice quickly: the line before." },
    { target: "#speed", title: "Speed", text: "Slow it down while you get used to the language." },
    { target: "#toggle-panel", title: "The whole transcript", text: "Show or hide every line of the video's words beside it." },
    { target: "#toggle-cc", title: "Captions", text: "Show or hide the tappable captions over the video." },
    { target: "#font-up", title: "Text size", text: "Make the words larger or smaller." },
    { target: "#exp-txt", title: "Keep the transcript", text: "Save the words as a text file, or as subtitles (SRT, VTT)." },
    { target: "#reel-next", title: "The next reel", text: "Go on to the next reel, or back to the one before." },
    { target: "#next", title: "Turn the page", text: "The next page, or the one before. The slider jumps to any page." },
    { target: "#original", title: "The original page", text: "Open the page as it is on its own website." },
  ].filter(Boolean);
}
