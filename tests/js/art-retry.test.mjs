// Game pictures that fail to load are tried again (web/js/game/render.js loadImage, artImageFailed, healArt). On
// learntamkeen.com the owner saw "a lot of assets don't load ... especially with battles" (2026-11-23), then, on
// desktop Chrome, every picture new to the Creatures screen blank for good: the element icons, the egg and two
// creatures' bodies (2026-11-25). A picture the server says is missing leaves a gap; one that failed for want of a
// network is asked for again when the network or the tab comes back.
import { test } from "node:test";
import assert from "node:assert/strict";

// A stand-in for the server: `down` = no network at all; files in `missing` answer 404; `failures[file]` = how many
// more downloads of that file fail before it loads (a blip).
const server = { down: false, missing: new Set() };
const failures = {};
const tries = {};
const fileOf = (url) => String(url).replace(/^.*game-art\//, "").replace(/\?.*$/, "");
const answers = (file) => !server.down && !server.missing.has(file) && !((failures[file] || 0) > 0 && failures[file]--);
globalThis.fetch = async (url, opts = {}) => {
  assert.equal(opts.method, "HEAD", "only asks whether a picture exists");
  if (server.down) throw new TypeError("Failed to fetch");
  return { status: server.missing.has(fileOf(url)) ? 404 : 200 };
};

// ...and for the browser's Image: a download that loads or fails as the server above says.
let running = 0, most = 0;
class FakeImage {
  set src(url) {
    const file = fileOf(url);
    tries[file] = (tries[file] || 0) + 1;
    running++;
    most = Math.max(most, running);
    setTimeout(() => {
      running--;
      if (answers(file)) this.onload && this.onload(); else this.onerror && this.onerror();
    }, 2);
  }
}
globalThis.Image = FakeImage;

const render = await import("../../web/js/game/render.js");
render.RETRY_MS.splice(0, render.RETRY_MS.length, 5, 5, 5); // short waits for the test
render.PATIENCE.ms = 40;
render.PATIENCE.tries = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a picture that fails a few times still arrives", async () => {
  failures["a.png"] = 2;
  const img = await render.loadImage("a.png");
  assert.ok(img, "loaded on the third try");
  assert.equal(tries["a.png"], 3);
  assert.equal(await render.loadImage("a.png"), img, "and kept: asked again, it isn't downloaded again");
  assert.equal(tries["a.png"], 3);
});

test("one the server says is missing leaves a gap, and is asked for afresh only later", async () => {
  server.missing.add("gone.png");
  assert.equal(await render.loadImage("gone.png"), null);
  assert.equal(tries["gone.png"], 1 + render.RETRY_MS.length, "no waiting for the network: it is missing");
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

test("with the network gone for longer than the quick tries, the picture waits and arrives once it is back", async () => {
  // (the owner's Creatures screen: the body of a creature not yet drawn, while the connection was failing)
  server.down = true;
  let got;
  const asked = render.loadImage("creature/beast/dragon_whelp/idle.png").then((img) => { got = img; });
  await sleep(30); // every quick try has failed by now
  assert.equal(got, undefined, "not given up on: still waiting, not a gap");
  server.down = false;
  render.healArt(); // the browser says it is back online (or the tab is shown again)
  await asked;
  assert.ok(got, "drawn once the network is back");
});

test("without any sign from the browser, it is asked for again every PATIENCE.ms", async () => {
  server.down = true;
  const asked = render.loadImage("egg/spark.png");
  await sleep(30);
  server.down = false;
  assert.ok(await asked, "arrived on the next round by itself");
});

test("given up after PATIENCE.tries rounds when the network never comes back", async () => {
  server.down = true;
  assert.equal(await render.loadImage("icon/never.png"), null);
  assert.equal(tries["icon/never.png"], 1 + render.RETRY_MS.length + render.PATIENCE.tries);
  server.down = false;
});

// A picture written into the page (icon("type_spark"), the egg): what the page's error listener does with it.
class FakeImg {
  constructor(file) { this.dataset = {}; this.isConnected = true; this.complete = false; this.naturalWidth = 0; this.src = render.ART + file; }
  get src() { return this._src; }
  set src(url) {
    this._src = url;
    const file = fileOf(url);
    tries[file] = (tries[file] || 0) + 1;
    this.complete = false;
    setTimeout(() => {
      this.complete = true;
      if (answers(file)) this.naturalWidth = 16; else render.artImageFailed(this); // (the page's "error" listener)
    }, 2);
  }
}

/** Wait until `ok()` (timers run late when the whole test suite runs at once). */
async function until(ok, ms = 5000) {
  for (const end = Date.now() + ms; !ok(); await sleep(5)) if (Date.now() > end) throw new Error("waited too long");
}

test("an icon in the page that failed while the network was gone loads again when it is back", async () => {
  server.down = true;
  const img = new FakeImg("icon/type_spark.png");
  await until(() => img.dataset.artRounds === "1"); // the quick tries are over: it is broken, kept to be asked again
  await sleep(20);
  assert.equal(img.naturalWidth, 0);
  server.down = false;
  render.healArt();
  await until(() => img.naturalWidth === 16); // shown again without reopening the app
  assert.match(img.src, /\?retry=\d+$/, "asked afresh, round any copy of the failure");
});

test("an icon the server says is missing is not asked for over and over", async () => {
  server.missing.add("icon/none.png");
  const img = new FakeImg("icon/none.png");
  await until(() => img.dataset.artRounds === "1");
  await sleep(20); // (the server has been asked whether it exists)
  const asked = tries["icon/none.png"];
  assert.equal(asked, 1 + render.RETRY_MS.length);
  render.healArt();
  await sleep(render.PATIENCE.ms * 2);
  assert.equal(tries["icon/none.png"], asked, "left alone");
  assert.equal(img.naturalWidth, 0);
});
