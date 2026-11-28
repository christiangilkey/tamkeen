// Home: one obvious next step. If something is unfinished (see progress.js for the rules) the
// screen is a big "Continue" button; otherwise it says you're caught up and offers at most
// three things to do next. Deliberately short: no feed, nothing endless. A brand-new learner (nothing
// in the library yet) gets "Start here" instead: a lesson, a video or a podcast.
// With the Library's Home (prototype "library_home") "Continue" and "You're all caught up" move there
// (components/continuecard.js); with "games_content" (the owner, 2026-11-27: "rename the home page to games") the
// greeting goes ("I also don't think the good morning thing in the home page is necessary").

import { api, esc, h } from "../app.js";
import { langAttrs, langInfo, studyLanguage } from "../languages.js";
import { continueInto } from "../components/continuecard.js";
import { habitat } from "../game/habitat.js";
import { gameOn } from "../components/gameswitch.js";
import { feature } from "../prototype.js";
import { dliShown } from "../components/dlipanel.js";
import { creatorBar } from "../components/creatorbar.js";
import { icon } from "../icons.js";
import { firstVisitTour } from "../components/tour.js";
import { t } from "../i18n.js";

function greeting() {
  const hour = new Date().getHours();
  const [morning, afternoon, evening] = langInfo(studyLanguage()).greet;
  if (hour < 5) return [evening, "Good evening"];
  if (hour < 12) return [morning, "Good morning"];
  if (hour < 18) return [afternoon, "Good afternoon"];
  return [evening, "Good evening"];
}

/** Nothing in the library yet (a new learner): no episode, video, page or book at all. */
async function libraryEmpty() {
  try { return Number((await api("/episodes?limit=1")).total) === 0; } catch { return false; }
}

export async function render(view) {
  const [ar, en] = greeting();
  const greet = !feature("games_content");
  view.append(h(`<div class="home">
    <div id="home-creator" class="home-creator" hidden></div>
    <section class="hero">
      <div class="hero-top">
        ${greet ? `<div><div class="hero-ar ar" ${langAttrs(studyLanguage())}>${esc(ar)}</div><div class="hero-en">${en}</div></div>` : "<div></div>"}
        <div class="hero-streak" id="hero-streak" role="img" hidden>${icon("flame", 20)}<span></span></div>
      </div>
      <div class="hero-main" id="main"><div class="hero-loading">…</div></div>
    </section>
    <div class="home-more" id="more"></div>
    <div id="home-oldgame" class="home-oldgame" hidden></div>
    <div id="habitat"></div>
    <div id="home-tavern" class="home-tavern" hidden></div>
    <div id="home-raid" class="home-raid" hidden></div>
  </div>`));
  // Tamkeen's creator only (prototype "creator_bar"): people online and the nearest limit (components/creatorbar.js).
  if (feature("creator_bar")) creatorBar(view.querySelector("#home-creator"));
  // A class invitation waiting for me is said here, where a student looks (dliclass.js noticeInvites).
  if (feature("class_tab")) import("../dliclass.js").then(({ noticeInvites }) => noticeInvites()).catch(() => {});
  // Gifts from Tamkeen's creator waiting for me are added to my game (prototype "owner_gifts": giftsync.js).
  if (feature("owner_gifts")) import("../giftsync.js").then(({ collectGifts }) => collectGifts()).catch(() => {});
  // The daily streak (days in a row the flashcard goal was met: review/flame.js), at the right of the
  // greeting, in its gold: the owner wanted it there, a flame icon rather than an emoji.
  import("../review/flame.js").then(({ myStreak }) => myStreak()).then(({ result }) => {
    const el = view.querySelector("#hero-streak");
    if (!el || !result) return;
    const n = result.days || 0;
    el.querySelector("span").textContent = String(n);
    el.classList.toggle("cold", n === 0);
    el.classList.toggle("open", result.today === "open" && n > 0);
    const label = n === 1 ? "Daily streak: 1 day" : `Daily streak: ${n} days`;
    el.title = `${label}. Each day you meet your flashcard goal, new words and reviews, adds a day.${result.today === "open" ? " Today's cards are still to do." : ""}`;
    el.setAttribute("aria-label", label);
    el.hidden = false;
  }).catch(() => {});
  // The creature's habitat lives at the bottom of Home (unless the game is switched off in Settings).
  if (gameOn()) view.querySelector("#habitat").append(habitat().el);
  // Above it, once: an older copy of the game in Google Drive has clearly more progress (lost before the sync
  // combined copies): a note offering to bring it back (game/oldgames-ui.js; a prototype).
  if (gameOn() && feature("old_games")) import("../game/oldgames-ui.js").then((m) => m.homeHint(view.querySelector("#home-oldgame"))).catch(() => {});
  // Under it, in a guild: the guild raid (game/friends-game.js), loaded on its own so Home never waits for it.
  if (gameOn()) import("../game/friends-game.js").then((m) => m.homeRaids(view.querySelector("#home-raid"))).catch(() => {});
  // In a guild: its tavern, with the members' favourite creatures (a prototype: game/tavern.js).
  if (gameOn() && feature("guild_tavern")) import("../game/tavern.js").then((m) => m.tavernBlock(view.querySelector("#home-tavern"))).catch(() => {});
  const main = view.querySelector("#main");
  const more = view.querySelector("#more");

  main.innerHTML = "";
  // (With the Library's Home, what is in progress shows there instead: components/continuecard.js.)
  const moved = feature("library_home");
  if (!moved && await continueInto(main, more, 3)) {
    // (the button and at most two more: three choices in total)
  } else if (await libraryEmpty()) {
    const name = langInfo(studyLanguage()).name;
    main.append(h(`<div class="caught-up home-start">
      <div class="caught-up-title">Start here</div>
      <div class="caught-up-sub">Pick something to learn from, then tap any word in it to see what it means.</div>
    </div>`));
    more.append(h(`<div class="home-choices">
      <a class="choice" href="#/library?show=courses"><span class="choice-ico">${icon("learn", 20)}</span><span><strong>New to the language? Start with Basics</strong>
        <span class="small muted">The first words and a little grammar, to get you ready for real content</span></span></a>
      <a class="choice" href="#/library?show=youtube"><span class="choice-ico">${icon("video", 20)}</span><span><strong>Watch a video</strong>
        <span class="small muted">YouTube videos with captions you can tap</span></span></a>
      <a class="choice" href="#/discover"><span class="choice-ico">${icon("podcast", 20)}</span><span><strong>Listen to a podcast</strong>
        <span class="small muted"></span></span></a>
    </div>`));
    more.querySelector('a[href="#/discover"] .muted').textContent = t("Popular {0} podcasts", t(name));
    // A DLI student has their DLI course and no Basics (prototype "dli_basics", pages/library.js), so no Basics card either.
    if (feature("dli_basics") && dliShown(studyLanguage())) more.querySelector('a[href="#/library?show=courses"]').remove();
  } else if (moved) {
    view.querySelector(".hero-main").hidden = true; // ("caught up" is the Library's to say now)
    more.remove(); // (empty: no gap left where it was)
  } else {
    main.append(h(`<div class="caught-up">
      <div class="caught-up-mark">✓</div>
      <div class="caught-up-title">You're all caught up</div>
      <div class="caught-up-sub">Nothing left unfinished. Pick something new whenever you like.</div>
    </div>`));
    more.append(h(`<div class="home-choices">
      <a class="choice" href="#/library"><span class="choice-ico">${icon("library", 20)}</span><span><strong>Open your library</strong>
        <span class="small muted">Podcasts, videos and web pages</span></span></a>
      <a class="choice" href="#/vocab"><span class="choice-ico">${icon("vocab", 20)}</span><span><strong>Look over your vocab</strong>
        <span class="small muted">The words you've saved</span></span></a>
      <a class="choice" href="#/friends"><span class="choice-ico">${icon("friends", 20)}</span><span><strong>See what friends are studying</strong>
        <span class="small muted">Messages and shared words</span></span></a>
    </div>`));
  }

  firstVisitTour("home", view.querySelector(".home"), [
    { target: ".lang-switch", anywhere: true, title: "The language you're learning",
      text: "Switch to another language you're learning, or add one. Each keeps its own library, words and reviews." },
    { target: ".home-start", title: "Start here",
      text: "Pick a lesson, a video or a podcast. In any of them, tap a word to see what it means and hear it." },
    { target: ".continue-btn", title: "Carry on",
      text: "Picks up your latest episode, video or page where you stopped." },
    { target: ".habitat-scene", title: "Your creature", text: "It grows with the XP you earn while studying, and the ring round it fills toward today's goal." },
    { target: ".hud-actions", title: "Play",
      text: "Battle and challenge friends, raise creatures, and spend what you earn in the shop and garden. A red dot means something is waiting." },
    { target: ".top-search", anywhere: true, title: "Search",
      text: "Find a word in everything you've read or listened to." },
  ]);

  // (No "N words saved today · N in your vocab" line here any more: the owner, 2026-11-28, "should be removed from
  // games screen". The words are counted on the Vocab tab.)
}
