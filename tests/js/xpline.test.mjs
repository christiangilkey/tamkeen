// What the study screens say about XP (web/js/game/xpline.js): the line in a word's popup and the top bar's
// level badge, which replaced the floating XP chip (the owner: it "covers buttons").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { badgeFace, gainLine, ringOffset, shortXp, times, working } from "../../web/js/game/xpline.js";
import { levelOf } from "../../web/js/game/rules.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a multiplier and its working, as on screen", () => {
  assert.equal(times(2), "×2");
  assert.equal(times(1.2), "×1.2");
  assert.equal(times(1.2 * 0.4), "×0.48");
  const word = { type: "word", xp: 24, base: 12, mult: 2 };
  assert.equal(working(word, true), "12 ×2", "the big number is what was earned; the working goes beside it");
  assert.equal(working({ ...word, mult: 1 }, true), "", "nothing multiplied it");
  assert.equal(working(word, false), "", "only rewards the combo carries");
  assert.equal(working(null, true), "");
});

test("the popup line: what this lookup earned, and the next lookup's multiplier", () => {
  const first = gainLine({ type: "word", xp: 10, base: 10, mult: 1 }, { chained: true, next: "×1.2" });
  assert.deepEqual(first.parts, [{ kind: "xp", text: "+10 XP" }]);
  assert.deepEqual(first.combo, { text: "next ×1.2", hot: false }, "no flame before the combo has started");
  assert.equal(first.label, "+10 XP · next ×1.2");

  const hot = gainLine({ type: "word", xp: 12, base: 10, mult: 1.2 }, { chained: true, hot: true, next: "×1.5" });
  assert.deepEqual(hot.parts.map((p) => p.text), ["+12 XP", "10 ×1.2"]);
  assert.deepEqual(hot.combo, { text: "next ×1.5", hot: true });
});

test("the popup line for a Save, a surprise, a word looked up again", () => {
  const saved = gainLine({ type: "save", xp: 20 }, { coins: 1, next: "×2", hot: true });
  assert.deepEqual(saved.parts, [{ kind: "xp", text: "+20 XP" }, { kind: "coins", text: "+1", said: "+1 coin" }]);
  assert.equal(saved.label, "+20 XP · +1 coin · next ×2");
  assert.equal(gainLine({ type: "save", xp: 20 }, { coins: 3 }).label, "+20 XP · +3 coins");
  assert.equal(gainLine({ type: "save", xp: 20 }).combo, null, "no combo to show: nothing about it");

  const item = gainLine({ type: "word", xp: 0, item: "hint", base: 0, mult: 1.2 }, { chained: true, next: "×1.5", hot: true });
  assert.deepEqual(item.parts, [{ kind: "item", item: "hint", text: "Hint card!" }], "no +0 XP");
  assert.equal(gainLine({ type: "word", xp: 0, item: "freeze" }).parts[0].text, "Streak freeze!");

  const again = gainLine(null, { repeat: true, next: "×1.5", hot: true });
  assert.deepEqual(again.parts, [{ kind: "note", text: "Already looked up today" }]);
  assert.equal(again.combo.text, "next ×1.5");
  assert.equal(gainLine(null), null, "nothing earned and nothing to say");
});

test("XP in the badge's small space", () => {
  assert.equal(shortXp(12), "12");
  assert.equal(shortXp(999), "999");
  assert.equal(shortXp(1234), "1.2k");
  assert.equal(shortXp(15400), "15k");
  assert.equal(shortXp(-3), "0");
});

test("the level badge: level, how full its ring is, what the next level needs", () => {
  const face = badgeFace(17527); // the owner's XP in his screenshot
  const lv = levelOf(17527);
  assert.equal(face.level, lv.level);
  assert.equal(face.left, lv.need - lv.into);
  assert.ok(face.fill > 0 && face.fill < 1);
  assert.equal(badgeFace(0).fill, 0);
  assert.equal(badgeFace(0).level, 1);
  assert.equal(ringOffset(0), 100, "empty");
  assert.equal(ringOffset(1), 0, "full");
  assert.equal(ringOffset(0.5), 50);
  assert.equal(ringOffset(0.001), 96, "a sliver shows once anything is earned towards the level");
});

test("nothing floats over the page: the chip is gone, the popup keeps a slot, the top bar has the badge", () => {
  const game = read("web/js/game/game.js");
  assert.doesNotMatch(game, /game-chip|showChip/);
  assert.doesNotMatch(game, /fx-label/, "the particle burst has no floating words");
  assert.match(game, /landXp\(result, \{ from: home \? null : anchor/);
  const css = read("web/css/app.css") + read("web/css/reels.css") + read("web/css/review.css");
  assert.doesNotMatch(css, /#game-chip|\.chip-combo|\.fx-label/);
  const bubble = read("web/js/components/wordbubble.js");
  assert.match(bubble, /xpSlot\.className = "wb-xp"/);
  assert.match(bubble, /el\.querySelector\("\.wb-actions"\)\.before\(xpSlot\)/, "kept when the popup is drawn again");
  assert.match(bubble, /xpSlot\.wbAnchor = anchorEl/);
  for (const app of ["web/js/app.js", "mobile/src/js/app.js"]) assert.match(read(app), /mountXpBadge\(document\.querySelector\("\.topbar"\)/, app);
  assert.match(read("web/js/game/xpbadge.js"), /prefers-reduced-motion/);
});
