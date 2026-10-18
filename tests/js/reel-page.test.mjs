// Run with: node --test tests/js/
// The script that runs inside a reel's ORDINARY Instagram page in the phone's reel window, for
// reels Instagram plays only to someone signed in. It has to keep the reel the way the app wants
// it against a page that mutes, restarts and covers it by itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL(`../../web/js/${name}`, import.meta.url), "utf8");

function page({ path = "/reel/Dcy9o3Hy2rl/", host = "www.instagram.com", withVideo = true, cookie = "ds_user_id=123", loginForm = false, dialogs = [], alsoEmbedScript = false } = {}) {
  const ticks = [];
  const added = [];
  const listeners = {};
  const winListeners = {};
  let now = 1000;
  const v = {
    readyState: 4, currentTime: 0, duration: 30.9, paused: true, muted: true, loop: true, playbackRate: 1, plays: 0,
    addEventListener(type, fn) { listeners[type] = fn; },
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
    pause() { this.paused = true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 }),
    attrs: {}, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, val) { this.attrs[k] = val; }, removeAttribute(k) { delete this.attrs[k]; },
  };
  // The box Instagram's page puts round the video, transformed (which would keep it from filling the window).
  const style = () => ({ props: { transform: "translateX(0px)" }, getPropertyValue(k) { return this.props[k] || ""; }, setProperty(k, val) { this.props[k] = val; } });
  const box = { style: style(), parentElement: null };
  v.parentElement = box;
  const element = () => ({ style: {}, attrs: {}, setAttribute(k, val) { this.attrs[k] = val; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(type, fn) { this[`on${type}`] = fn; }, appendChild() {} });
  const win = {
    Date: { now: () => now }, innerWidth: 400, innerHeight: 800,
    setInterval: (fn) => { ticks.push(fn); return 0; },
    location: { hostname: host, pathname: path },
    addEventListener(type, fn) { winListeners[type] = fn; },
    document: {
      cookie,
      head: { appendChild() {} }, documentElement: { appendChild() {} },
      body: { appendChild: (el) => added.push(el) },
      createElement: element,
      getElementById: (id) => added.find((el) => el.id === id) || null,
      querySelectorAll: (sel) => (sel === "video" ? (withVideo ? [v] : []) : sel.includes("dialog") ? dialogs : []),
      querySelector: (sel) => (sel.includes("input") ? (loginForm ? {} : null) : sel === "video" ? (withVideo ? v : null) : null),
    },
  };
  win.window = win;
  win.top = win;
  box.parentElement = win.document.documentElement;
  vm.runInNewContext(read("reel-page.js") + (alsoEmbedScript ? `\n${read("reel-embed.js")}` : ""), win);
  const tick = (ms = 300) => { now += ms; ticks.forEach((f) => f()); };
  return { win, v, box, tick, listeners, winListeners, added, ticks, state: () => JSON.parse(win.__tkReelState()), active: typeof win.__tkReelState === "function" };
}

test("it acts on a reel's ordinary page and steps aside elsewhere", () => {
  assert.equal(page().active, true);
  assert.equal(page({ path: "/reels/Dcy9o3Hy2rl/" }).active, true);
  assert.equal(page({ path: "/reel/Dcy9o3Hy2rl/embed/" }).active, false, "the embed page belongs to reel-embed.js");
  assert.equal(page({ host: "www.facebook.com" }).active, false);
  // Sent together with reel-embed.js: on an ordinary page only this one runs (one set of buttons).
  const both = page({ alsoEmbedScript: true });
  both.tick();
  assert.equal(both.added.length, 2);
  assert.equal(both.ticks.length, 1, "reel-embed.js stepped aside");
  // ...and on an embed page only reel-embed.js does.
  const embed = page({ path: "/reel/Dcy9o3Hy2rl/embed/", alsoEmbedScript: true });
  assert.equal(embed.active, true);
  assert.equal(embed.ticks.length, 1);
});

test("the reel is un-muted, started and kept from repeating, whatever Instagram's page does", () => {
  const p = page();
  p.tick();
  assert.deepEqual([p.v.muted, p.v.paused, p.v.loop, p.v.plays], [false, false, false, 1]);
  p.v.muted = true; // Instagram mutes it again
  p.v.pause();      // ...and pauses it
  p.tick();
  assert.deepEqual([p.v.muted, p.v.paused], [false, false], "put back");
  p.v.currentTime = 12.5;
  assert.deepEqual(p.state(), { ready: true, t: 12.5, d: 30.9, paused: false, rate: 1, ends: 0, nav: "", error: "", page: "/reel/Dcy9o3Hy2rl/" });
});

test("at the end it stops and stays stopped until the app says play", () => {
  const p = page();
  p.tick();
  p.listeners.ended();
  p.v.play(); // Instagram starts it again by itself
  p.tick();
  assert.deepEqual([p.state().ends, p.v.paused], [1, true]);
  p.tick();
  assert.equal(p.v.paused, true, "still stopped: the app is about to open the next reel");
  p.v.currentTime = 30.9;
  p.win.__tkReelDo("play");
  assert.deepEqual([p.v.paused, p.v.currentTime], [false, 0], "played again from the start");
});

test("the app can pause, jump and change speed, and those stick", () => {
  const p = page();
  p.tick();
  p.win.__tkReelDo("pause");
  p.tick();
  assert.equal(p.v.paused, true, "not restarted by the keep-playing check");
  p.win.__tkReelDo("seek", 7.5);
  p.win.__tkReelDo("rate", 0.75);
  p.win.__tkReelDo("play");
  p.v.playbackRate = 1; // Instagram resets the speed
  p.tick();
  assert.deepEqual([p.v.currentTime, p.v.playbackRate, p.v.paused, p.state().rate], [7.5, 0.75, false, 0.75]);
});

test("a tap on the picture pauses and plays, and is kept from Instagram's own handler", () => {
  const p = page();
  p.tick();
  const tap = (target) => { const e = { target, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } }; p.winListeners.click(e); return e; };
  const picture = { getAttribute: () => null, closest: () => null };
  assert.equal(tap(picture).stopped, true);
  p.tick();
  assert.equal(p.v.paused, true);
  tap(picture);
  assert.equal(p.v.paused, false);
  // Instagram's own buttons (like, comment, a dialog) are left to Instagram.
  const theirs = { getAttribute: () => null, closest: () => ({}) };
  assert.equal(tap(theirs).stopped, false);
  assert.equal(p.v.paused, false);
});

test("Previous and Next are added once and each press is a new signal", () => {
  const p = page();
  p.tick();
  p.tick();
  assert.deepEqual(p.added.map((b) => b.textContent), ["‹ Previous", "Next ›"]);
  p.added[1].onclick({ preventDefault() {}, stopPropagation() {} });
  p.added[1].onclick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(p.state().nav, "next:2");
});

test("Instagram's dialogs are answered with Not now, never with the offer", () => {
  const button = (text) => ({ innerText: text, clicks: 0, click() { this.clicks++; } });
  const make = (...texts) => { const bs = texts.map(button); return { bs, querySelectorAll: () => bs }; };
  const save = make("Save info", "Not now");
  const arabic = make("حفظ المعلومات", "ليس الآن");
  const unknown = make("Do the thing", "Whatever");
  const p = page({ dialogs: [save, arabic, unknown] });
  p.tick();
  p.tick();
  assert.deepEqual(save.bs.map((b) => b.clicks), [0, 1], "pressed once");
  assert.deepEqual(arabic.bs.map((b) => b.clicks), [0, 1]);
  assert.deepEqual(unknown.bs.map((b) => b.clicks), [0, 0], "a dialog it doesn't understand is left alone");
});

test("it says when Instagram wants a sign-in, and when a signed-in page simply has no reel", () => {
  const form = page({ withVideo: false, loginForm: true });
  form.tick();
  assert.equal(form.state().error, "signin");
  const loginPage = page({ path: "/accounts/login/", withVideo: false, cookie: "" });
  assert.equal(loginPage.active, true, "the sign-in page is reported from, not ignored");
  loginPage.tick();
  assert.equal(loginPage.state().error, "signin");
  const wall = page({ withVideo: false, cookie: "csrftoken=x" }); // "open the app / sign up", no form
  wall.tick(3000);
  assert.equal(wall.state().error, "", "give the page time first");
  wall.tick(6000);
  assert.equal(wall.state().error, "signin");
  const gone = page({ withVideo: false }); // signed in, but the reel was removed
  gone.tick(9000);
  assert.equal(gone.state().error, "");
  gone.tick(8000);
  assert.equal(gone.state().error, "novideo");
});

test("only the reel's own video is shown, and the boxes round it are kept from shrinking it", () => {
  const p = page();
  p.tick();
  assert.equal(p.v.attrs["data-tk-reel"], "1", "the video the page shows is the one marked to fill the window");
  assert.equal(p.box.style.props.transform, "none", "a transformed box round it would make it fill only that box");
  assert.equal(p.box.style.props.contain, "none");
});
