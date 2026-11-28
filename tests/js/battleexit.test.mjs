// Run with: node --test tests/js/
// A way out of every battle (the owner, 2026-11-19: "I want to ensure that there is a back or exit button in
// battles"). Every kind of battle (wild, rental duel, gym leader, friend, a friend's folder challenge) runs in the
// one live battle screen (game/livebattle-ui.js runLiveBattle), so its X is the way out of them all: always on
// screen in the top corner, asking first with Carry on highlighted, ending the fight with no reward and nothing
// lost. The phone's back gesture presses it (gamepad.js closeTopBox), and the screens before a battle keep their
// own ✕ and Close.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const ui = read("web/js/game/livebattle-ui.js");
/** The body of a function in livebattle-ui.js, from its line to the next line indented as far that closes it. */
function body(name) {
  const start = ui.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name}() is in livebattle-ui.js`);
  const indent = ui.slice(ui.lastIndexOf("\n", start) + 1, start).match(/^\s*/)[0];
  const end = ui.indexOf(`\n${indent}}\n`, start);
  return ui.slice(start, end);
}

test("every kind of battle opens the one live battle screen", () => {
  const starts = ["web/js/game/battle-ui.js", "web/js/game/gyms-ui.js"].map(read).join("\n");
  for (const mode of ["wild", "rental", "friend"]) assert.match(starts, new RegExp(`runLiveBattle\\(\\{[^\\n]*mode: "${mode}"`), mode);
  assert.match(read("web/js/game/gyms-ui.js"), /runLiveBattle\(\{ \.\.\.gymSetup\(leader\)/);
});

test("the live battle has an X in its top bar, after the rival's card, with a name for screen readers", () => {
  const top = ui.slice(ui.indexOf(`<div class="lb-top">`), ui.indexOf(`<div class="lb-stage">`));
  const exit = /<button type="button" class="ghost icon lb-exit" title="Leave the battle" aria-label="Leave the battle">\$\{lineIcon\("close"\)\}<\/button>/;
  assert.match(top, exit);
  assert.ok(top.indexOf("lb-exit") > top.indexOf("lb-card foe"), "the X comes last: the top corner");
  assert.ok(top.indexOf("lb-pause") > 0, "the pause button stays too");
  const css = read("web/css/app.css");
  assert.match(css, /\.lb-top \{ display: grid; grid-template-columns: 1fr auto 1fr auto;/, "a place for it in the bar");
  assert.match(css, /\.lb-pause, \.lb-exit \{ color: var\(--game-on\); \}/);
});

test("the X asks first (Carry on highlighted), and leaving pays nothing and costs nothing", () => {
  assert.match(ui, /\$\("\.lb-exit"\)\.onclick = \(\) => leave\(\);/);
  const leave = body("leave");
  assert.match(leave, /pauseBox\(t\("Leave the battle\?"\), t\("The battle ends here, with no reward and nothing lost\./);
  assert.match(leave, /if \(!go \|\| closed\) return;\s+saveGame\(\);\s+close\(\);/, "only a yes leaves");
  // no reward, no result told to a friend, no skill lost: none of what the end of a battle does
  for (const paid of ["finishBattle", "reportBattle", "announce", "battleResult", "answer("]) assert.ok(!leave.includes(paid), `leaving never calls ${paid}`);
  assert.match(leave, /if \(b\.over\) \{ if \(\$\("\.lb-end"\)\.innerHTML\) close\(\); return; \}/, "after the end card is paid, the X is Done; never before it");
  assert.match(leave, /if \(quizShown\) return;/, "a question on screen isn't cut short (its word isn't marked wrong)");
  // the box: Leave as a plain button, Carry on the highlighted one that has the focus
  const box = body("pauseBox");
  assert.match(box, /<button type="button" class="ghost">Leave the battle<\/button><button type="button" class="primary">Carry on<\/button>/);
  assert.match(box, /row\.lastElementChild\.focus\(\);/);
  // the X is taken away with the battle, so a back press after it has gone does nothing to the page underneath twice
  assert.match(body("close"), /el\.remove\(\);/);
});

test("the keyboard and the controller still reach the same way out: Esc and Menu open the pause box with its Leave", () => {
  assert.match(ui, /if \(e\.key === "Escape" && !b\.over\) \{ e\.preventDefault\(\); pause\(\); \}/);
  assert.match(ui, /pause: \{ run: \(\) => pause\(\), hint: \(\) => t\("Pause"\) \}/);
  assert.match(read("web/js/padmap.js"), /\{ id: "pause", label: "Pause: carry on, or leave the battle", short: "Pause", def: "b9" \}/);
});

test("the phone's back gesture presses the battle's X instead of changing the page under it", () => {
  const pad = read("web/js/gamepad.js");
  const start = pad.indexOf("export function closeTopBox()");
  const fn = pad.slice(start, pad.indexOf("\n}\n", start));
  const exit = fn.indexOf(`document.querySelector(".live-wrap .lb-exit")`);
  assert.ok(exit > 0, "closeTopBox looks for a live battle's X");
  assert.ok(fn.indexOf("closeBox(box)") < exit, "a box open over the battle (the leave box itself) closes first: back = Carry on");
  assert.match(fn, /if \(exit\) \{ exit\.click\(\); return true; \}/);
  assert.match(read("mobile/src/js/app.js"), /App\.addListener\("backButton", \(\) => \{\s+\/\/[^\n]*\n\s+if \(closeTopBox\(\)\) return;/);
});

test("the new words are translated in every app language", () => {
  const codes = ["ar", "ca", "ceb", "de", "es", "fa", "fr", "hi", "it", "ja", "ko", "pt", "ru", "th", "tl", "zh"];
  for (const code of codes) {
    const dict = JSON.parse(read(`web/i18n/${code}.json`));
    for (const k of ["Leave the battle?", "The battle ends here, with no reward and nothing lost. The answers you gave still count for your words.", "Leave the battle", "Carry on"]) {
      assert.ok(dict[k], `${code}: ${k}`);
    }
  }
});

test("the screens before a battle keep a visible way back: the game sheet's X, and ✕ and Close on its boxes", () => {
  assert.match(read("web/js/game/shop.js"), /<button type="button" class="ghost icon gs-close" data-close title="Close" aria-label="Close">\$\{icon\("close"\)\}<\/button>/);
  const parts = read("web/js/game/screenparts.js");
  // (a details box is the app's popup with its ✕, except when drawn into the Market's stall: screenparts.inline)
  assert.match(parts, /export function details\(fill\) \{[\s\S]{0,240}?const m = into \? null : openModal\(\{ title: "", cls: "gs-detail-back" \}\);/, "details boxes (rental duel, gym leader) have the ✕");
  assert.match(parts, /let inlineInto = null;/, "only inline() draws a box without its popup");
  const battle = read("web/js/game/battle-ui.js");
  assert.ok((battle.match(/\{ word: "Close", run: \(\) => d\.close\(\) \}/g) || []).length >= 1, "the rental duel's Close");
  assert.match(read("web/js/game/gyms-ui.js"), /\{ word: "Close", run: \(\) => d\.close\(\) \}/, "a gym leader's Close");
  assert.match(read("web/js/components/modal.js"), /canClose && cross \? `<button type="button" class="ghost icon" data-close title="Close \(Esc\)" aria-label="Close">✕<\/button>`/);
});
