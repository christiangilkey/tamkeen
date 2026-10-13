// Run with: node --test tests/js/
// The script the app's web browser runs inside YouTube's pages: tapping a video hands it to
// Tamkeen instead of playing it on YouTube.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../web/js/youtube-browser.js", import.meta.url), "utf8");

/** A pretend browser window on `href`, with the script already run in it. */
function page(href, { bridge, api } = {}) {
  const listeners = {};
  const timers = [];
  const gone = [];
  const location = new URL(href);
  const loc = {
    get href() { return location.href; },
    set href(v) { gone.push(v); },
    get hostname() { return location.hostname; },
    replace(v) { gone.push(v); },
  };
  const element = () => ({ style: {}, appendChild(c) { return c; }, attachShadow() { return element(); }, isConnected: true });
  const win = {
    location: loc, URL, setTimeout: () => 0, clearTimeout() {}, setInterval(fn) { timers.push(fn); return 0; },
    history: { length: 2, back() { gone.push("back"); } },
    document: { createElement: element, body: element(), documentElement: element(), querySelectorAll: () => [] },
    addEventListener(type, fn) { listeners[type] = fn; },
    __tamkeenBridge: bridge,
    pywebview: api ? { api } : undefined,
  };
  win.window = win;
  win.top = win;
  vm.runInNewContext(source, win);
  const click = (target, extra = {}) => {
    const e = { button: 0, target, composedPath: () => [{ tagName: "IMG" }, target, { tagName: "DIV" }], prevented: false, stopped: false,
                preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    if (listeners.click) listeners.click(e);
    return e;
  };
  return { win, click, gone, tick: () => timers.forEach((fn) => fn()), active: !!listeners.click };
}
const link = (href) => ({ tagName: "A", href });

test("it does nothing on other websites", () => {
  assert.equal(page("https://www.google.com/search?q=youtube").active, false);
  assert.equal(page("https://www.youtube.com.evil.example/").active, false);
  assert.equal(page("https://m.youtube.com/").active, true);
});

test("on the computer, tapping a video asks the app for it and YouTube never opens it", async () => {
  const asked = [];
  const p = page("https://www.youtube.com/results?search_query=x", { api: { watch_video: async (id) => { asked.push(id); return { ok: true }; } } });
  const e = p.click(link("https://www.youtube.com/watch?v=lo3KyF50IGE&pp=abc"));
  assert.ok(e.prevented && e.stopped);
  assert.deepEqual(asked, ["lo3KyF50IGE"]);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.gone, [], "the list page stays where it is");
  assert.deepEqual(p.click(link("https://www.youtube.com/shorts/abcdefghijk")).prevented, true);
});

test("other links and modified clicks are left alone", () => {
  const asked = [];
  const p = page("https://www.youtube.com/", { api: { watch_video: async (id) => { asked.push(id); return { ok: true }; } } });
  for (const href of ["https://www.youtube.com/@channel", "https://www.youtube.com/results?search_query=v", "https://example.com/watch?v=lo3KyF50IGE",
    "https://www.youtube.com/watch?v=short", "https://www.youtube.com/playlist?list=PL1"]) {
    assert.equal(p.click(link(href)).prevented, false, href);
  }
  assert.equal(p.click(link("https://www.youtube.com/watch?v=lo3KyF50IGE"), { ctrlKey: true }).prevented, false);
  assert.equal(p.click(link("https://www.youtube.com/watch?v=lo3KyF50IGE"), { button: 1 }).prevented, false);
  assert.equal(p.click({ tagName: "DIV" }).prevented, false);
  assert.deepEqual(asked, []);
});

test("on the phone, the video is handed over through an address only the app's browser knows", () => {
  const p = page("https://m.youtube.com/", { bridge: "address" });
  const e = p.click(link("https://m.youtube.com/watch?v=-_AbCdEfGh1"));
  assert.ok(e.prevented);
  assert.deepEqual(p.gone, ["tamkeen-video://watch?v=-_AbCdEfGh1"]);
});

test("a video's own page reached another way is handed over once, then left", async () => {
  const asked = [];
  const p = page("https://www.youtube.com/watch?v=lo3KyF50IGE", { api: { watch_video: async (id) => { asked.push(id); return { ok: true }; } } });
  p.tick();
  p.tick();
  assert.deepEqual(asked, ["lo3KyF50IGE"], "asked once, not on every check");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.gone, ["back"], "YouTube's own page for it is left, so it isn't playing twice");

  const stay = page("https://www.youtube.com/watch?v=lo3KyF50IGE", { api: { watch_video: async () => ({ ok: false, error: "No captions available for this video." }) } });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(stay.gone, [], "without captions the video can still be watched on YouTube's page");
});
