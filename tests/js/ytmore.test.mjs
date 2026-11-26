// The web app's YouTube list, page after page (mobile/src/js/ytmore.js; the owner, 2026-11-25: "it should probably
// load another page of things instead of that"). The samples below are written in the shape of YouTube's answers
// (its mobile site's page settings, a results page's list ending in a continuation, a "more" answer); a live call to
// YouTube could not be made from where this was written, so they stand in for saved answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_PAGES, MORE_ADDRESSES, moreRequest, nextPage, pageSettings } from "../../mobile/src/js/ytmore.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const video = (id, title) => ({ videoWithContextRenderer: { videoId: id, headline: { runs: [{ text: title }] } } });
const more = (token, api) => ({ continuationItemRenderer: { trigger: "CONTINUATION_TRIGGER_ON_ITEM_SHOWN", continuationEndpoint: {
  clickTrackingParams: "x", commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: api } }, continuationCommand: { token, request: "CONTINUATION_REQUEST_TYPE_SEARCH" } } } });

// A results page (m.youtube.com/results?…): its settings in ytcfg, and its list with a topic chip bar (whose chips carry
// tokens of their own) and the list's own continuation at the end.
const PAGE_HTML = `<script>ytcfg.set({"INNERTUBE_API_KEY":"AIzaTestKey","INNERTUBE_CLIENT_NAME":"MWEB","INNERTUBE_CLIENT_VERSION":"2.20261120.01.00",`
  + `"INNERTUBE_CONTEXT":{"client":{"hl":"es","gl":"US","clientName":"MWEB","clientVersion":"2.20261120.01.00","userAgent":"x \\"y\\" {z}"},"user":{"lockedSafetyMode":false}},`
  + `"INNERTUBE_CONTEXT_CLIENT_NAME":2});</script>`;
const PAGE_DATA = { contents: { sectionListRenderer: {
  subMenu: { searchSubMenuRenderer: {} },
  contents: [
    { feedFilterChipBarRenderer: { contents: [{ chipCloudChipRenderer: { navigationEndpoint: { continuationCommand: { token: "CHIP-TOKEN" } } } }] } },
    { itemSectionRenderer: { contents: [video("aaaaaaaaaaa", "Uno"), video("bbbbbbbbbbb", "Dos")] } },
    more("PAGE-2-TOKEN", "/youtubei/v1/search"),
  ] } } };
// The answer to "more": the next videos and the next token, or none at the end.
const MORE_ANSWER = { onResponseReceivedCommands: [{ appendContinuationItemsAction: { continuationItems: [
  { itemSectionRenderer: { contents: [video("ccccccccccc", "Tres"), video("ddddddddddd", "Cuatro")] } },
  more("PAGE-3-TOKEN", "/youtubei/v1/search")] } }] };
const LAST_ANSWER = { onResponseReceivedCommands: [{ appendContinuationItemsAction: { continuationItems: [
  { itemSectionRenderer: { contents: [video("eeeeeeeeeee", "Cinco")] } }] } }] };

test("a YouTube page's settings for asking for more: its context (read whole, quotes and braces inside), key and client", () => {
  const s = pageSettings(PAGE_HTML);
  assert.equal(s.key, "AIzaTestKey");
  assert.deepEqual(s.context.client, { hl: "es", gl: "US", clientName: "MWEB", clientVersion: "2.20261120.01.00", userAgent: 'x "y" {z}' });
  assert.deepEqual(s.context.user, { lockedSafetyMode: false });
  // only a version: a context made from it
  assert.deepEqual(pageSettings(`"INNERTUBE_CLIENT_VERSION":"2.1"`).context, { client: { clientName: "MWEB", clientVersion: "2.1" } });
  assert.equal(pageSettings("<html>no settings</html>"), null);
});

test("the list's own continuation, not a topic chip's; the next one in each answer; none at the end", () => {
  assert.deepEqual(nextPage(PAGE_DATA), { token: "PAGE-2-TOKEN", api: "/youtubei/v1/search" });
  assert.deepEqual(nextPage(MORE_ANSWER), { token: "PAGE-3-TOKEN", api: "/youtubei/v1/search" });
  assert.equal(nextPage(LAST_ANSWER), null);
  assert.equal(nextPage({ contents: { feedFilterChipBarRenderer: { contents: [{ x: { continuationCommand: { token: "CHIP" } } }] } } }), null);
  // the older shape (nextContinuationData)
  assert.deepEqual(nextPage({ continuations: [{ nextContinuationData: { continuation: "OLD" } }] }), { token: "OLD", api: "" });
});

test("the request for the next page: YouTube's own address on the same site, the token and the page's context", () => {
  const s = pageSettings(PAGE_HTML);
  const ask = moreRequest("https://m.youtube.com/results?search_query=podcast&sp=EgIQAQ%3D%3D", s, nextPage(PAGE_DATA));
  assert.equal(ask.url, "https://m.youtube.com/youtubei/v1/search?prettyPrint=false&key=AIzaTestKey");
  assert.deepEqual(JSON.parse(ask.body), { context: s.context, continuation: "PAGE-2-TOKEN" });
  // no address in the answer: a results page asks /search, the home page or a channel /browse
  assert.match(moreRequest("https://m.youtube.com/results?search_query=x", s, { token: "T", api: "" }).url, /\/youtubei\/v1\/search\?/);
  assert.match(moreRequest("https://m.youtube.com/@channel/videos", s, { token: "T", api: "" }).url, /\/youtubei\/v1\/browse\?/);
  // never anywhere else (the go-between allows only these two)
  assert.equal(moreRequest("https://m.youtube.com/results?x", s, { token: "T", api: "/youtubei/v1/player" }), null);
  assert.equal(moreRequest("https://m.youtube.com/results?x", s, null), null);
  assert.equal(moreRequest("https://m.youtube.com/results?x", null, { token: "T", api: "" }), null);
  assert.deepEqual(MORE_ADDRESSES, ["/youtubei/v1/search", "/youtubei/v1/browse"]);
});

test("the go-between lets these two through, and only with the request's own address (no lookalikes)", () => {
  const worker = read("webapp/worker.js");
  const allowed = JSON.parse(worker.match(/const POST_ALLOWED = (\[[^\]]*\]);/)[1].replace(/,\s*\]/, "]"));
  assert.deepEqual(allowed, ["https://www.youtube.com/youtubei/v1/player",
    "https://m.youtube.com/youtubei/v1/search?", "https://m.youtube.com/youtubei/v1/browse?"]);
  const s = pageSettings(PAGE_HTML);
  for (const page of ["https://m.youtube.com/results?search_query=x", "https://m.youtube.com/"]) {
    const ask = moreRequest(page, s, { token: "T", api: "" });
    assert.ok(allowed.some((p) => ask.url.startsWith(p)), ask.url);
  }
  assert.ok(!allowed.some((p) => "https://m.youtube.com/youtubei/v1/searchx".startsWith(p)));
});

test("the list: more near the end with Loading more…, a quiet end, the caption and dub tags on the added cards too", () => {
  const src = read("mobile/src/js/web-youtube.js");
  assert.match(src, /return \{ videos: videosIn\(data\), settings: pageSettings\(html\), next: nextPage\(data\) \};/);
  assert.match(src, /const ask = moreRequest\(address, pageSet, next\);/);
  assert.match(src, /webFetch\(ask\.url, \{ method: "POST", headers: \{ \.\.\.askIn\(\), "Content-Type": "application\/json" \}, body: ask\.body,/);
  assert.match(src, /new IntersectionObserver\(\(entries\) => \{ if \(entries\.some\(\(e\) => e\.isIntersecting\)\) loadMore\(\); \}, \{ rootMargin: "600px 0px" \}\)/);
  assert.match(src, /more\.textContent = t\("Loading more…"\);/);
  assert.match(src, /const end = \(\) => \{ more\.textContent = t\("That's all for now\."\); watch\.disconnect\(\); \};/);
  assert.match(src, /if \(lang && cards\.length\) tagCards\(cards, lang\);/, "each new page's cards get their own caption checks");
  assert.match(src, /if \(shown\.has\(v\.id\)\) continue;/, "a video already listed isn't listed twice");
  assert.match(src, /if \(!next \|\| pages >= MAX_PAGES\) \{ end\(\); return; \}/);
  assert.ok(MAX_PAGES >= 10 && MAX_PAGES <= 50);
});

// The owner, 2026-11-25: "YOUTUBE STUFF NOT loading new videos": the list sat on "Loading more…". The go-between had
// not yet been given the two addresses, so every try was turned away, and after each failure the list tried again by
// itself (the end still in sight), putting "Loading more…" back over Try again, without end.
test("a failed “more” never hangs: a time limit, every failure caught, no trying again by itself, and the go-between's refusal said plainly", () => {
  const src = read("mobile/src/js/web-youtube.js");
  const fetchMore = src.slice(src.indexOf("async function fetchMore("), src.indexOf("const SITE ="));
  assert.match(src, /export const MORE_TIMEOUT_MS = 15000;/);
  assert.match(fetchMore, /setTimeout\(\(\) => stop\.abort\(\), MORE_TIMEOUT_MS\)/);
  assert.match(fetchMore, /signal: stop \? stop\.signal : undefined/);
  assert.match(fetchMore, /clearTimeout\(timer\);/);
  assert.match(fetchMore, /e\.helper = res\.status === 403 && \/can't be sent to\/i\.test\(text\);/, "the go-between's own words for a refused address");
  assert.match(fetchMore, /const data = JSON\.parse\(text\);/, "an HTML page instead of JSON fails like any other answer");
  assert.match(read("webapp/worker.js"), /refuse\(403, "That address can't be sent to\.", origin\)/, "…which the go-between says");
  // after a failure: Try again, and nothing more asked for until it is pressed
  assert.match(src, /if \(busy \|\| stuck \|\| !list\.isConnected\) return;/);
  assert.match(src, /\} catch \(e\) \{\s+stuck = true;/);
  assert.match(src, /again\.onclick = \(\) => \{ stuck = false; more\.textContent = ""; loadMore\(\); \};/);
  assert.match(src, /if \(!stuck && next && list\.isConnected && more\.getBoundingClientRect\(\)\.top < innerHeight \+ 600\) loadMore\(\);/);
  assert.match(src, /why\.textContent = t\("Tamkeen's online helper needs an update before more videos can load\."\);/);
});
