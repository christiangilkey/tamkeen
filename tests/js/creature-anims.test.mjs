// The creatures' frame animations (tools/game_art/anim.py -> web/game-art/creature/beast/<id>/[hatchling/]<anim>.png
// and beasts.js `anims`): every creature walks and idles in both looks, the winged ones fly, every frame says where
// worn things sit, and render.animAt picks the frame for a moment in time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BEASTS } from "../../web/js/game/data.js";
import { animAt } from "../../web/js/game/render.js";

const pngSize = (file) => {
  const b = readFileSync(new URL(`../../web/game-art/${file}`, import.meta.url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const SLOTS = ["hat", "face", "neck", "held", "back"];

test("every creature walks and idles, and the winged ones fly, in both looks", () => {
  for (const b of BEASTS) {
    for (const [look, dir] of [[b, ""], [b.young, "hatchling/"]]) {
      const a = look.anims;
      assert.ok(a, `${b.id} ${dir || "juvenile"} has animations`);
      assert.equal(a.idle.frames, 4, `${b.id} idle`);
      assert.equal(a.walk.frames, 6, `${b.id} walk`);
      assert.equal(!!a.fly, !!b.wings, `${b.id}: flies exactly when it has wings`);
      const [cw, ch] = a.cell;
      for (const name of ["idle", "walk", "fly"]) {
        if (!a[name]) continue;
        const n = a[name].frames;
        assert.equal(a[name].ms.length, n);
        assert.ok(a[name].ms.every((ms) => ms >= 60 && ms <= 1000), `${b.id} ${name} times`);
        for (const slot of SLOTS) {
          assert.equal(a[name].at[slot].length, n, `${b.id} ${name} ${slot}`);
          assert.ok(a[name].at[slot].every(([dx, dy]) => Math.abs(dx) <= 20 && Math.abs(dy) <= 20));
        }
        // the frames on top, their eyelids below; the shirt mask one row of frames
        assert.deepEqual(pngSize(`creature/beast/${b.id}/${dir}${name}.png`), [cw * n, ch * 2], `${b.id} ${dir}${name}.png`);
        if (look.shirt) assert.deepEqual(pngSize(`creature/beast/${b.id}/${dir}${name}_shirt.png`), [cw * n, ch]);
      }
    }
  }
});

test("animAt steps through the frames in time, blinks now and then while still, and walks for one that can't fly", () => {
  const griffin = { beast: "griffin", size: "m" };
  const g = BEASTS.find((b) => b.id === "griffin").anims;
  let t = 0;
  const seen = [];
  for (let i = 0; i < g.walk.frames; i++) { seen.push(animAt(griffin, "walk", t + 1).frame); t += g.walk.ms[i]; }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5]);
  assert.equal(animAt(griffin, "walk", t + 1).frame, 0, "and round again");
  const loop = g.idle.ms.reduce((s, v) => s + v, 0);
  const blinks = Array.from({ length: 9 }, (_, k) => animAt(griffin, "idle", k * loop + 10).eyes).filter((e) => e === "blink").length;
  assert.equal(blinks, 3, "a blink about one loop in three");
  assert.equal(animAt(griffin, "idle", loop * 3 + 400).eyes, "open", "only for a moment");
  assert.ok(Array.from({ length: 40 }, (_, k) => animAt(griffin, "walk", k * 37).eyes).every((e) => e === "open"), "no blinking mid-walk");
  assert.equal(animAt(griffin, "fly", 0).anim, "fly");
  assert.equal(animAt({ beast: "cat", size: "m" }, "fly", 0).anim, "walk");
  assert.equal(animAt({ beast: "griffin", size: "s" }, "fly", 0).anim, "fly", "the hatchling flies too");
});
