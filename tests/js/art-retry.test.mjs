// Game pictures that fail to load are tried again (web/js/game/render.js loadImage): on learntamkeen.com the owner
// saw "a lot of assets don't load ... especially with battles": one failed download used to stay blank for good.
import { test } from "node:test";
import assert from "node:assert/strict";

// A stand-in for the browser's Image: each address fails `failures[file]` times, then loads.
const failures = {};
const tries = {};
let running = 0, most = 0;
class FakeImage {
  set src(url) {
    const file = url.replace(/^.*game-art\//, "").replace(/\?.*$/, "");
    tries[file] = (tries[file] || 0) + 1;
    running++;
    most = Math.max(most, running);
    setTimeout(() => {
      running--;
      if ((failures[file] || 0) > 0) { failures[file]--; this.onerror && this.onerror(); } else this.onload && this.onload();
    }, 2);
  }
}
globalThis.Image = FakeImage;

const render = await import("../../web/js/game/render.js");
render.RETRY_MS.splice(0, render.RETRY_MS.length, 5, 5, 5); // short waits for the test

test("a picture that fails a few times still arrives", async () => {
  failures["a.png"] = 2;
  const img = await render.loadImage("a.png");
  assert.ok(img, "loaded on the third try");
  assert.equal(tries["a.png"], 3);
  assert.equal(await render.loadImage("a.png"), img, "and kept: asked again, it isn't downloaded again");
  assert.equal(tries["a.png"], 3);
});

test("one that fails every try leaves a gap, and is asked for afresh later", async () => {
  failures["gone.png"] = 99;
  assert.equal(await render.loadImage("gone.png"), null);
  assert.equal(tries["gone.png"], 1 + render.RETRY_MS.length);
  assert.equal(await render.loadImage("gone.png"), null, "straight after, the gap stays (no flood of requests)");
  assert.equal(tries["gone.png"], 1 + render.RETRY_MS.length);
});

test("a battle's hundreds of pictures download a few at a time, all of them", async () => {
  most = 0;
  const files = Array.from({ length: 300 }, (_, i) => `many/${i}.png`);
  for (const f of files.slice(0, 40)) failures[f] = 1; // some fail once
  const imgs = await Promise.all(files.map((f) => render.loadImage(f)));
  assert.ok(imgs.every(Boolean), "every one arrived");
  assert.ok(most <= render.AT_ONCE, `at most ${render.AT_ONCE} at once (${most})`);
});
