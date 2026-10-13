// Run with: node --test tests/js/
// The script the app's web browser runs inside YouTube's pages: tapping a video hands it to
// Tamkeen instead of playing it on YouTube.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../web/js/youtube-browser.js", import.meta.url), "utf8");

/** A pretend browser window on `href`, with the script already run in it. */
function page(href, { bridge, api, pages = {}, followed } = {}) {
  const listeners = {};
  const timers = [];
  const gone = [];
  const made = [];    // every element the script created
  const fetched = []; // every address it asked for
  let location = new URL(href);
  const loc = {
    get href() { return location.href; },
    set href(v) { gone.push(v); },
    get hostname() { return location.hostname; },
    get pathname() { return location.pathname; },
    get origin() { return location.origin; },
    replace(v) { gone.push(v); },
  };
  const element = (tag = "") => {
    const el = { tag, style: {}, children: [], attrs: {}, isConnected: true, textContent: "",
                 appendChild(c) { this.children.push(c); return c; }, attachShadow() { return element("shadow"); },
                 setAttribute(k, v) { this.attrs[k] = v; } };
    made.push(el);
    return el;
  };
  const kept = new Map();
  const win = {
    location: loc, URL, setTimeout: () => 0, clearTimeout() {}, setInterval(fn) { timers.push(fn); return 0; },
    history: { length: 2, back() { gone.push("back"); } },
    document: { createElement: element, body: element(), documentElement: element(), querySelectorAll: () => [] },
    addEventListener(type, fn) { listeners[type] = fn; },
    sessionStorage: { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)) },
    // A channel's page as YouTube serves it: `pages` maps a path to that page's HTML.
    fetch: async (url) => { fetched.push(url); return { text: async () => pages[new URL(url).pathname] || "<html></html>" }; },
    encodeURIComponent, String, Number,
    __tamkeenBridge: bridge,
    __tamkeenFollowing: followed,
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
  const settle = () => new Promise((r) => setImmediate(() => setImmediate(r)));
  return {
    win, click, gone, fetched, settle, tick: () => timers.forEach((fn) => fn()), active: !!listeners.click,
    /** YouTube moving to another page without reloading. */
    go(to) { location = new URL(to, location.href); },
    /** The Follow button the script put on the page, if any ({text, shown, press()}). */
    follow() {
      const host = made.find((el) => el.attrs["data-tamkeen"] === "follow");
      const button = made.find((el) => el.tag === "button");
      return host && button ? { text: button.textContent, shown: host.style.display !== "none", filled: /background:#2bb8c6/.test(button.style.cssText), press: () => button.onclick() } : null;
    },
  };
}
const CHANNEL = "UC-4KnPMmZzwAzW7SbVATUZQ";
const channelHtml = (name, id = CHANNEL) => `<html><head><meta property="og:title" content="${name}">
  <meta property="og:image" content="https://yt3.example/pic=s900"><meta itemprop="identifier" content="${id}"></head></html>`;
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

// ----- a channel's page: the Follow button -----

test("a channel's page gets a Follow button; other pages don't", async () => {
  const calls = [];
  const api = {
    following: async (name) => { calls.push(["following", name]); return { following: false }; },
    follow_channel: async (name, id, image, on) => { calls.push(["follow", name, id, image, on]); return { ok: true, following: on }; },
  };
  const p = page("https://www.youtube.com/results?search_query=x", { api, pages: { "/@ajplus": channelHtml("AJ+ &quot;كبريت&quot; &amp; co") } });
  await p.settle();
  assert.equal(p.follow(), null, "no button on a search page");
  assert.deepEqual(p.fetched, []);

  p.go("/@ajplus/videos"); // tapped a channel: YouTube changes page without reloading
  p.tick();
  await p.settle();
  assert.deepEqual(p.fetched, ["https://www.youtube.com/@ajplus"], "the channel's own page is asked who it is");
  assert.equal(p.follow().text, '+ Follow AJ+ "كبريت" & co');
  assert.ok(p.follow().shown && !p.follow().filled, "an outline until followed");
  assert.deepEqual(calls, [["following", 'AJ+ "كبريت" & co']]);

  p.follow().press();
  await p.settle();
  assert.deepEqual(calls.at(-1), ["follow", 'AJ+ "كبريت" & co', CHANNEL, "https://yt3.example/pic=s900", true]);
  assert.equal(p.follow().text, '✓ Following AJ+ "كبريت" & co');
  assert.ok(p.follow().filled, "filled once followed");

  p.follow().press(); // pressing again stops following
  await p.settle();
  assert.equal(calls.at(-1)[4], false);
  assert.ok(p.follow().text.startsWith("+ Follow"));

  p.tick();
  assert.equal(p.fetched.length, 1, "the same page isn't asked again on every check");
  p.go("/results?search_query=y");
  p.tick();
  assert.equal(p.follow().shown, false, "leaving the channel hides the button");
});

test("a channel already followed is shown as followed", async () => {
  const api = { following: async () => ({ following: true }), follow_channel: async () => ({ ok: true, following: false }) };
  const p = page(`https://www.youtube.com/channel/${CHANNEL}`, { api, pages: { [`/channel/${CHANNEL}`]: channelHtml("AJ+") } });
  await p.settle();
  assert.equal(p.follow().text, "✓ Following AJ+");
  assert.ok(p.follow().filled);
});

test("on the phone the button hands the channel over through the app-only address", async () => {
  const p = page("https://m.youtube.com/@ajplus", { bridge: "address", followed: ["Someone else"], pages: { "/@ajplus": channelHtml("AJ+ كبريت") } });
  await p.settle();
  assert.equal(p.follow().text, "+ Follow AJ+ كبريت");
  p.follow().press();
  assert.equal(p.gone.length, 1);
  const sent = new URL(p.gone[0]);
  assert.equal(sent.protocol + "//" + sent.host, "tamkeen-video://follow");
  assert.deepEqual([sent.searchParams.get("name"), sent.searchParams.get("id"), sent.searchParams.get("image"), sent.searchParams.get("on")],
    ["AJ+ كبريت", CHANNEL, "https://yt3.example/pic=s900", "1"]);
  assert.equal(p.follow().text, "✓ Following AJ+ كبريت", "it shows as followed straight away");
  p.follow().press();
  assert.equal(new URL(p.gone[1]).searchParams.get("on"), "0");

  // The app tells the page which channels are followed already; the page remembers its own presses.
  const known = page("https://m.youtube.com/@ajplus", { bridge: "address", followed: ["AJ+ كبريت"], pages: { "/@ajplus": channelHtml("AJ+ كبريت") } });
  await known.settle();
  assert.ok(known.follow().filled && known.follow().text.startsWith("✓ Following"));
});

test("a page that doesn't say whose channel it is gets no button", async () => {
  const p = page("https://www.youtube.com/@nobody", { api: { following: async () => ({ following: false }) }, pages: { "/@nobody": "<html><title>404</title></html>" } });
  await p.settle();
  assert.equal(p.follow(), null);
  for (const path of ["/feed/subscriptions", "/playlist?list=PL1", "/shorts/abcdefghijk", "/"]) {
    const q = page("https://www.youtube.com" + path, { api: { watch_video: async () => ({ ok: true }) } });
    await q.settle();
    assert.deepEqual(q.fetched, [], path);
  }
});
