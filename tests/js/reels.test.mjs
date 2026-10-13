// Run with: node --test tests/js/
// The two scripts that run inside Instagram's pages for reels: the one that notes which posts
// the site describes (computer), and the one that plays a reel in the phone's small window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL(`../../web/js/${name}`, import.meta.url), "utf8");

// ----- instagram-worker.js: noting the posts a page is told about -----

function workerPage({ cookie = "", scripts = [], nav = false, form = false, host = "www.instagram.com", path = "/", buttons = [], password = false } = {}) {
  const loads = [];
  class XHR {
    addEventListener(type, fn) { if (type === "load") loads.push(() => fn.call(this)); }
    send() {}
  }
  const win = {
    document: {
      cookie,
      querySelectorAll: (sel) => (sel.includes("script") ? scripts.map((t) => ({ textContent: t })) : sel.includes("button") ? buttons : []),
      querySelector: (sel) => (sel.includes('type="password"') ? (password ? {} : null) : sel.includes("input") ? (form ? {} : null) : nav ? {} : null),
    },
    location: { hostname: host, pathname: path },
    fetch: async () => ({ headers: { get: () => "application/json" }, clone: () => ({ text: async () => "{}" }) }),
    XMLHttpRequest: XHR,
  };
  win.window = win;
  vm.runInNewContext(read("instagram-worker.js"), win);
  return { win, posts: () => JSON.parse(win.__tkReels.posts()), xhr: () => new win.XMLHttpRequest(), fire: () => loads.splice(0).forEach((f) => f()) };
}

test("posts are noted from every shape Instagram describes them in", () => {
  const profile = JSON.stringify({ data: { clips: { edges: [{ node: { media: {
    code: "DeSCO3mCt_S", user: { username: "bbcarabic", is_verified: true }, play_count: 31277, like_count: 226,
    media_type: 2, product_type: "clips", video_duration: 64.3, caption: { text: "عنوان المقطع" }, taken_at: 1791000000 } } }] } } });
  const search = JSON.stringify({ data: { results: [
    { code: "DMKpNtJz3-d", media_type: 2, user: { username: "timo.timo122" }, like_count: 97374, view_count: null },
    { shortcode: "CzWuViONM9n", is_video: true, owner: { username: "comedia.mix" }, edge_liked_by: { count: 90810 },
      edge_media_to_caption: { edges: [{ node: { text: "ضحك" } }] }, taken_at_timestamp: 1700000000 },
    { code: "PHOTO000001", media_type: 1, user: { username: "someone" }, like_count: 5 },
    { code: "no-owner", media_type: 2 },
  ] } });
  const p = workerPage({ scripts: [profile, "not json at all, but longer than the shortest thing worth reading, so it is tried and ignored"] });
  const x = p.xhr();
  x.responseType = "";
  x.responseText = search;
  x.send();
  p.fire();
  const byCode = Object.fromEntries(p.posts().map((q) => [q.code, q]));
  assert.deepEqual(Object.keys(byCode).sort(), ["CzWuViONM9n", "DMKpNtJz3-d", "DeSCO3mCt_S", "PHOTO000001"]);
  assert.deepEqual(byCode.DeSCO3mCt_S, { code: "DeSCO3mCt_S", user: "bbcarabic", verified: true, plays: 31277, likes: 226, video: true,
    taken: 1791000000, seconds: 64, caption: "عنوان المقطع" });
  assert.equal(byCode["DMKpNtJz3-d"].likes, 97374);
  assert.equal(byCode["DMKpNtJz3-d"].plays, 0, "no play count given");
  assert.deepEqual([byCode.CzWuViONM9n.user, byCode.CzWuViONM9n.likes, byCode.CzWuViONM9n.video, byCode.CzWuViONM9n.caption], ["comedia.mix", 90810, true, "ضحك"]);
  assert.equal(byCode.PHOTO000001.video, false, "a photo is noted as not a video, so it is never tried");
});

test("it can tell whether the window is signed in, without saying who", () => {
  assert.equal(workerPage({ cookie: "csrftoken=x; ds_user_id=12345" }).win.__tkReels.signedIn(), "yes");
  assert.equal(workerPage({ nav: true }).win.__tkReels.signedIn(), "yes");
  assert.equal(workerPage({ nav: true, form: true }).win.__tkReels.signedIn(), "", "a sign-in form on screen means not yet");
  assert.equal(workerPage({ cookie: "csrftoken=x" }).win.__tkReels.signedIn(), "");
});

test("on Facebook's pages nobody counts as signed in to Instagram", () => {
  assert.equal(workerPage({ host: "www.facebook.com", nav: true }).win.__tkReels.signedIn(), "");
  assert.equal(workerPage({ host: "instagram.com.evil.example", cookie: "ds_user_id=1" }).win.__tkReels.signedIn(), "");
});

test("a Facebook sign-in is ready to carry over only once Facebook has finished asking", () => {
  const fb = (more) => workerPage({ host: "www.facebook.com", cookie: "c_user=1000123; xs=x", ...more }).win.__tkReels.facebookReady();
  assert.equal(fb({ path: "/" }), "yes");
  assert.equal(fb({ path: "/home.php" }), "yes");
  for (const path of ["/login/", "/dialog/oauth", "/checkpoint/123", "/two_step_verification/", "/oidc/", "/v19.0/dialog/oauth"]) assert.equal(fb({ path }), "", path);
  assert.equal(fb({ path: "/", password: true }), "", "still asking for a password");
  assert.equal(workerPage({ host: "www.facebook.com", cookie: "datr=x" }).win.__tkReels.facebookReady(), "", "not signed in to Facebook");
  assert.equal(workerPage({ cookie: "c_user=1" }).win.__tkReels.facebookReady(), "", "this is Instagram, not Facebook");
});

test("Instagram's own continue-with-Facebook button is pressed, and only on its sign-in page", () => {
  const button = (text) => ({ innerText: text, clicks: 0, click() { this.clicks++; } });
  const make = () => [button("Log in"), button("Log in with Facebook"), button("Continue as Chris"), button("Forgot password?")];
  let b = make();
  assert.equal(workerPage({ path: "/accounts/login/", buttons: b }).win.__tkReels.continueWithFacebook(), "continue-as");
  assert.deepEqual(b.map((x) => x.clicks), [0, 0, 1, 0], "the one-press button is preferred");
  b = [button("Log in"), button("تسجيل الدخول بفيسبوك")];
  assert.equal(workerPage({ path: "/", buttons: b }).win.__tkReels.continueWithFacebook(), "facebook");
  assert.equal(b[1].clicks, 1);
  assert.equal(workerPage({ path: "/accounts/login/", buttons: [button("Log in")] }).win.__tkReels.continueWithFacebook(), "");
  // Never on a page that would create an account, and never off Instagram.
  for (const where of [{ path: "/accounts/emailsignup/" }, { path: "/accounts/signup/" }, { path: "/someone/" }, { host: "www.facebook.com", path: "/" }]) {
    b = make();
    assert.equal(workerPage({ ...where, buttons: b }).win.__tkReels.continueWithFacebook(), "", JSON.stringify(where));
    assert.deepEqual(b.map((x) => x.clicks), [0, 0, 0, 0]);
  }
});

// ----- reel-embed.js: the reel in the phone's small window -----

function embedPage({ withVideo = true } = {}) {
  const ticks = [];
  const added = [];
  let now = 1000;
  const listeners = {};
  const v = {
    readyState: 4, currentTime: 0, duration: 16.7, paused: true, loop: true, plays: 0, playbackRate: 1,
    addEventListener(type, fn) { listeners[type] = fn; },
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
  const element = (tag) => ({ tag, style: {}, addEventListener(type, fn) { this[`on${type}`] = fn; }, appendChild() {} });
  const win = {
    Date: { now: () => now },
    setInterval: (fn) => { ticks.push(fn); return 0; },
    location: { pathname: "/reel/DeWoCVZJA3M/embed/" },
    document: {
      head: { appendChild() {} }, documentElement: { appendChild() {} },
      body: { appendChild: (el) => added.push(el) },
      createElement: element,
      getElementById: (id) => added.find((el) => el.id === id) || null,
      querySelector: (sel) => (sel === "video" && withVideo ? v : null),
    },
  };
  win.window = win;
  win.top = win;
  vm.runInNewContext(read("reel-embed.js"), win);
  const tick = (ms = 300) => { now += ms; ticks.forEach((f) => f()); };
  return { win, v, tick, listeners, added, state: () => JSON.parse(win.__tkReelState()) };
}

test("the reel starts by itself, does not repeat, and its end is counted", () => {
  const p = embedPage();
  p.tick();
  assert.equal(p.v.plays, 1);
  assert.equal(p.v.loop, false, "it must stop at the end so the next reel can start");
  p.tick();
  assert.equal(p.v.plays, 1, "started once, not on every check");
  p.v.currentTime = 4.2;
  assert.deepEqual(p.state(), { ready: true, t: 4.2, d: 16.7, paused: false, rate: 1, ends: 0, nav: "", error: "", page: "/reel/DeWoCVZJA3M/embed/" });
  p.listeners.ended();
  assert.equal(p.state().ends, 1);
});

test("Previous and Next are added once and each press is a new signal", () => {
  const p = embedPage();
  p.tick();
  p.tick();
  assert.deepEqual(p.added.map((b) => b.textContent), ["‹ Previous", "Next ›"]);
  const press = (b) => b.onclick({ preventDefault() {}, stopPropagation() {} });
  press(p.added[1]);
  assert.equal(p.state().nav, "next:1");
  press(p.added[1]);
  assert.equal(p.state().nav, "next:2", "pressing Next twice is two presses");
  press(p.added[0]);
  assert.equal(p.state().nav, "prev:3");
});

test("the app can pause, play and jump, and tapping the picture pauses", () => {
  const p = embedPage();
  p.tick();
  p.win.__tkReelDo("pause");
  assert.equal(p.v.paused, true);
  p.win.__tkReelDo("seek", 7.5);
  assert.equal(p.v.currentTime, 7.5);
  p.win.__tkReelDo("play");
  // The speed chosen under the reel, kept within what a video can do.
  p.win.__tkReelDo("rate", 0.75);
  assert.deepEqual([p.v.playbackRate, p.state().rate], [0.75, 0.75]);
  p.win.__tkReelDo("rate", 9);
  assert.equal(p.v.playbackRate, 2);
  p.win.__tkReelDo("rate", "nonsense");
  assert.equal(p.v.playbackRate, 1);
  assert.equal(p.v.paused, false);
  p.listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(p.v.paused, true);
});

test("a reel that never shows a video is reported, so the app can skip it", () => {
  const p = embedPage({ withVideo: false });
  p.tick(5000);
  assert.equal(p.state().error, "");
  p.tick(8000);
  assert.deepEqual([p.state().error, p.state().ready], ["novideo", false]);
});
