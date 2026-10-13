// Run with: node --test tests/js/
// The script the phone runs inside a page of instagram.com while the user picks reels from their
// own saves (mobile/src/js/instagram-phone.js). It is tried here against a pretend Instagram:
// what it asks the site for, and how it reports the answers through __tkReelState().
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../mobile/src/js/instagram-phone.js", import.meta.url), "utf8");

const media = (code, more = {}) => ({
  code, media_type: 2, video_duration: 31.6, user: { username: "some.creator" }, caption: { text: "ضحك 😂 #comedy" },
  image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/${code}-big.jpg`, width: 1080, height: 1920 },
                                  { url: `https://scontent.cdninstagram.com/${code}-small.jpg`, width: 240, height: 426 }] },
  video_versions: [{ url: `https://scontent.cdninstagram.com/${code}-720.mp4`, width: 720, height: 1280 },
                   { url: `https://scontent.cdninstagram.com/${code}-360.mp4`, width: 360, height: 640 }],
  clips_metadata: { audio_type: "original_sounds", music_info: null }, ...more,
});

/** A pretend page of instagram.com. `answers` maps the start of a requested path to what the site says. */
function page(answers, { top = true } = {}) {
  const asked = [];
  const win = {
    location: { hostname: "www.instagram.com", pathname: "/reel/tamkeen/" },
    BigInt, Promise, JSON, Math, Number, String, Error, encodeURIComponent,
    fetch: (path, options) => {
      asked.push({ path, options });
      const key = Object.keys(answers).find((k) => path.startsWith(k));
      const hit = key ? answers[key] : null;
      const body = typeof hit === "function" ? hit(path) : hit;
      return Promise.resolve({ ok: !!body, status: body ? 200 : 404, json: () => Promise.resolve(body) });
    },
  };
  win.window = win;
  win.top = top ? win : {};
  vm.runInNewContext(SOURCE, win);
  const state = () => JSON.parse(win.__tkReelState());
  let n = 0;
  const ask = async (what, arg) => {
    win.__tkIg(++n, what, arg);
    assert.equal(state().done, false, "a job is under way as soon as it is started");
    for (let i = 0; i < 50 && !state().done; i++) await new Promise((r) => setImmediate(r));
    return state();
  };
  return { win, asked, state, ask };
}

test("it says who is signed in, or that nobody is", async () => {
  const signedIn = page({ "/api/v1/accounts/edit/web_form_data/": { form_data: { username: "learner" } } });
  assert.deepEqual((await signedIn.ask("whoami")).result, { username: "learner" });
  assert.equal(signedIn.asked[0].options.credentials, "include");
  assert.equal(signedIn.asked[0].options.headers["X-IG-App-ID"], "936619743392459");
  const signedOut = page({});
  const s = await signedOut.ask("whoami");
  assert.deepEqual([s.result, s.error], [{ username: "" }, ""], "a refusal means nobody is signed in, not a failure");
});

test("everything saved is listed in Instagram's order, page after page, with the smallest video and a small picture", async () => {
  const p = page({ "/api/v1/feed/saved/posts/": (path) => (path.includes("max_id=NEXT")
    ? { items: [{ media: media("Third00003", { media_type: 1, video_versions: undefined }) }], more_available: false }
    : { items: [{ media: media("First00001") }, { media: media("Second0002", { clips_metadata: { audio_type: "licensed_music" } }) }],
        more_available: true, next_max_id: "NEXT" }) });
  const s = await p.ask("list", { collection: "all", limit: 80 });
  assert.equal(s.error, "");
  assert.deepEqual(s.result.posts.map((x) => x.code), ["First00001", "Second0002", "Third00003"]);
  const [first, second, third] = s.result.posts;
  assert.deepEqual({ ...first }, { code: "First00001", user: "some.creator", caption: "ضحك 😂 #comedy", video: true, seconds: 32,
    thumb: "https://scontent.cdninstagram.com/First00001-small.jpg", src: "https://scontent.cdninstagram.com/First00001-360.mp4", music: false });
  assert.equal(second.music, true, "a song from Instagram's library: plays only signed in");
  assert.deepEqual([third.video, third.src], [false, ""], "a photo");
  assert.deepEqual(p.asked.map((a) => a.path), ["/api/v1/feed/saved/posts/", "/api/v1/feed/saved/posts/?max_id=NEXT"]);
});

test("one collection is asked for by its number, and no more than the limit comes back", async () => {
  const p = page({ "/api/v1/feed/collection/17900000000000001/posts/": { items: [1, 2, 3, 4].map((i) => ({ media: media(`Coll${i}00000`) })) } });
  const s = await p.ask("list", { collection: "17900000000000001", limit: 3 });
  assert.equal(s.result.posts.length, 3);
});

test("the user's own collections are listed by name", async () => {
  const p = page({ "/api/v1/collections/list/": { items: [
    { collection_id: "1", collection_name: "All posts", collection_type: "ALL_MEDIA_AUTO_COLLECTION" },
    { collection_id: "17900000000000001", collection_name: "Arabic", collection_type: "MEDIA" },
    { collection_id: "17900000000000002", collection_name: "Funny", collection_type: "MEDIA" }] } });
  assert.deepEqual((await p.ask("collections")).result.collections,
    [{ id: "17900000000000001", name: "Arabic" }, { id: "17900000000000002", name: "Funny" }]);
});

test("a site that won't list collections is reported as an error, not as none", async () => {
  const s = await page({}).ask("collections");
  assert.equal(s.error, "http 404");
});

test("one post is asked for afresh by the number its short code stands for", async () => {
  // "B" is 1 in Instagram's alphabet, so the code "BA" is post number 64.
  const p = page({ "/api/v1/media/64/info/": { items: [media("BA")] } });
  const s = await p.ask("info", { code: "BA" });
  assert.equal(s.result.post.src, "https://scontent.cdninstagram.com/BA-360.mp4");
});

test("the answer is let go of when the app says it has it, and a late answer to an old job is ignored", async () => {
  const p = page({ "/api/v1/accounts/edit/web_form_data/": { form_data: { username: "learner" } } });
  await p.ask("whoami");
  const cleared = await p.ask("clear");
  assert.equal(cleared.result, null);
  p.win.__tkIg(98, "whoami");
  p.win.__tkIg(99, "clear");
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual([p.state().job, p.state().result], [99, null]);
});

test("it does nothing inside a frame of another page", () => {
  const framed = page({}, { top: false });
  assert.equal(framed.win.__tkIg, undefined);
});
