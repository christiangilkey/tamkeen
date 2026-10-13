// Run with: node --test tests/js/
// Followed YouTube channels: following, unfollowing, the order of the channel bar, and merging
// two devices' lists. The cases in "two devices agree" are repeated for the computer's copy in
// tests/test_media.py (test_follow_lists_merge_like_the_phones).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelAddress, cleanFollows, fillChannel, followedChannels, isFollowed, markWatched, mergeFollows, setFollow, smallImage,
} from "../../web/js/ytfollow.js";
import { fetchChannel } from "../../web/js/ytcaptions.js";

const ID = "UC-4KnPMmZzwAzW7SbVATUZQ";

test("following adds the channel; unfollowing keeps a record that says so", () => {
  let list = setFollow([], { name: "  AJ+   كبريت " }, true, 100.9);
  assert.deepEqual(list, [{ name: "AJ+ كبريت", id: "", image: "", on: 1, watched_at: 100, updated_at: 100 }]);
  assert.ok(isFollowed(list, "AJ+ كبريت") && !isFollowed(list, "Someone else"));
  list = setFollow(list, { name: "AJ+ كبريت" }, false, 200);
  assert.ok(!isFollowed(list, "AJ+ كبريت"));
  assert.deepEqual([list.length, list[0].on, list[0].updated_at, list[0].watched_at], [1, 0, 200, 100], "kept, so other devices hear of it");
  assert.deepEqual(followedChannels(list), []);
  assert.deepEqual(setFollow(list, { name: "   " }, true, 300), list, "no name: nothing changes");
});

test("the id and picture can be added later without touching anything else", () => {
  const list = setFollow([], { name: "AJ+" }, true, 100);
  const filled = fillChannel(list, "AJ+", { id: ID, image: "https://yt3.example/a=s900-c" }, 150);
  assert.deepEqual(filled[0], { name: "AJ+", id: ID, image: "https://yt3.example/a=s900-c", on: 1, watched_at: 100, updated_at: 150 });
  assert.equal(fillChannel(filled, "AJ+", { id: ID, image: "https://yt3.example/a=s900-c" }, 999)[0].updated_at, 150, "nothing new: no change");
  assert.deepEqual(fillChannel(list, "Nobody", { id: ID }, 150), list);
  assert.equal(setFollow(filled, { name: "AJ+" }, false, 300)[0].id, ID, "unfollowing keeps what is known");
});

test("the bar lists followed channels, the one watched most recently first", () => {
  let list = [];
  list = setFollow(list, { name: "First" }, true, 100);
  list = setFollow(list, { name: "Second" }, true, 200);
  list = setFollow(list, { name: "Third" }, true, 300);
  assert.deepEqual(followedChannels(list).map((c) => c.name), ["Third", "Second", "First"]);
  list = markWatched(list, "First", 400);
  assert.deepEqual(followedChannels(list).map((c) => c.name), ["First", "Third", "Second"]);
  assert.deepEqual(markWatched(list, "Not followed", 500), list);
  list = setFollow(list, { name: "Third" }, false, 600);
  assert.deepEqual(followedChannels(list).map((c) => c.name), ["First", "Second"]);
  assert.deepEqual(markWatched(list, "Third", 700), list, "an unfollowed channel isn't tracked");
});

test("stored lists are tidied: bad entries dropped, one record per name, a fixed order", () => {
  const list = cleanFollows([
    { name: "b", on: 1, updated_at: 5, id: "not an id", image: "http://insecure/x" },
    "junk", null, { on: 1 }, { name: "" },
    { name: "a", on: "yes", watched_at: "7.8", updated_at: 3 },
    { name: "b", on: 0, updated_at: 9 },
  ]);
  assert.deepEqual(list, [
    { name: "a", id: "", image: "", on: 1, watched_at: 7, updated_at: 3 },
    { name: "b", id: "", image: "", on: 0, watched_at: 0, updated_at: 9 },
  ]);
  assert.deepEqual(cleanFollows(null), []);
  assert.deepEqual(cleanFollows({ name: "x" }), []);
});

test("two devices agree: for each channel the copy that changed last wins", () => {
  const phone = [{ name: "A", on: 1, updated_at: 10, watched_at: 10 }, { name: "B", on: 1, updated_at: 20, watched_at: 20 }];
  const computer = [{ name: "B", on: 0, updated_at: 30, watched_at: 20 }, { name: "C", on: 1, updated_at: 5, watched_at: 5, id: ID }];
  const expected = [
    { name: "A", id: "", image: "", on: 1, watched_at: 10, updated_at: 10 },
    { name: "B", id: "", image: "", on: 0, watched_at: 20, updated_at: 30 },
    { name: "C", id: ID, image: "", on: 1, watched_at: 5, updated_at: 5 },
  ];
  assert.deepEqual(mergeFollows(phone, computer), expected);
  assert.deepEqual(mergeFollows(computer, phone), expected, "whichever device does the merging");
  assert.deepEqual(mergeFollows(expected, expected), expected);
  assert.deepEqual(mergeFollows([], null), []);
  // Names sort by plain character codes (the computer sorts the same way), emoji included.
  assert.deepEqual(mergeFollows([{ name: "😀 fun", on: 1 }, { name: "ﻻ", on: 1 }, { name: "Z", on: 1 }], []).map((r) => r.name), ["Z", "😀 fun", "ﻻ"]);
});

test("where to find more of a channel, and small pictures", () => {
  assert.equal(channelAddress({ name: "AJ+", id: ID }), `https://www.youtube.com/channel/${ID}/videos`);
  assert.equal(channelAddress({ name: "AJ+", id: ID }, { mobile: true }), `https://m.youtube.com/channel/${ID}/videos`);
  assert.equal(channelAddress({ name: "AJ+ كبريت", id: "" }), "https://www.youtube.com/results?search_query=AJ%2B%20%D9%83%D8%A8%D8%B1%D9%8A%D8%AA");
  assert.equal(smallImage("https://yt3.example/abc=s900-c-k-c0x00ffffff-no-rj"), "https://yt3.example/abc=s88-c-k-c0x00ffffff-no-rj");
  assert.equal(smallImage("https://other.example/pic.jpg"), "https://other.example/pic.jpg");
});

test("a video's channel is looked up from YouTube: id and name, then its picture", async () => {
  const seen = [];
  const request = async (req) => {
    seen.push(req.url);
    if (req.url.includes("/youtubei/v1/player")) return { status: 200, text: JSON.stringify({ videoDetails: { channelId: ID, author: "AJ+ كبريت" } }) };
    return { status: 200, text: `<html><meta property="og:image" content="https://yt3.example/a=s900-c?x=1&amp;y=2"></html>` };
  };
  assert.deepEqual(await fetchChannel("lo3KyF50IGE", request), { id: ID, name: "AJ+ كبريت", image: "https://yt3.example/a=s900-c?x=1&y=2" });
  assert.deepEqual(seen.map((u) => new URL(u).pathname), ["/youtubei/v1/player", `/channel/${ID}`]);
  assert.deepEqual(await fetchChannel("lo3KyF50IGE", async () => { throw new Error("offline"); }), { id: "", name: "", image: "" });
  const noPicture = async (req) => (req.url.includes("/player") ? { status: 200, text: JSON.stringify({ videoDetails: { channelId: ID, author: "X" } }) } : { status: 404, text: "" });
  assert.deepEqual(await fetchChannel("lo3KyF50IGE", noPicture), { id: ID, name: "X", image: "" });
});
