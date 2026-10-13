// Run with: node --test tests/js/
// The phone's podcast-feed reader must agree with the computer's (app/feeds.py), above all on
// each episode's id. tests/fixtures/rss_parity.json is what the Python code makes of the sample
// feeds (tests/test_rss_parity.py keeps it up to date).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newEpisodeRecords, parseDuration, parseFeed } from "../../mobile/src/js/rss.js";

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const py = JSON.parse(fixture("rss_parity.json"));
// What identifies and plays an episode. (Descriptions may differ in small ways: the computer's
// reader tidies HTML more thoroughly, and its version replaces the phone's on the next sync.)
const FIELDS = ["guid", "title", "audio_url", "audio_type", "published", "duration", "image"];

for (const name of Object.keys(py)) {
  test(`${name}: episodes match the computer's reader`, async () => {
    const js = await parseFeed(fixture(name));
    assert.equal(js.title, py[name].title);
    assert.equal(js.image ?? null, py[name].image ?? null);
    assert.equal(js.link ?? null, py[name].link ?? null);
    assert.equal(js.episodes.length, py[name].episodes.length);
    js.episodes.forEach((ep, i) => {
      for (const f of FIELDS) assert.equal(ep[f] ?? null, py[name].episodes[i][f] ?? null, `episode ${i} ${f}`);
    });
  });
}

test("durations are read the same way", () => {
  for (const [value, expected] of [["3723", 3723], ["1:02:03", 3723], ["62:03", 3723], ["00:45.5", 45.5], ["", null],
    [null, null], ["about an hour", null], ["1:2:3:4", null], [" 95 ", 95]]) {
    assert.equal(parseDuration(value), expected, String(value));
  }
});

test("a feed with a mistake in it is still read", async () => {
  // A bare "&" and an unclosed tag would make a strict XML reader refuse the whole feed.
  const feed = await parseFeed(`﻿<?xml version="1.0"?><rss><channel><title>Salt & Pepper</title>
    <item><title>One</title><guid>1</guid><br><enclosure url="https://x.example/1.mp3" type="audio/mpeg"></item>
    <item><title>Two &amp; a half</title><guid>2</guid><enclosure url='https://x.example/2.mp3'/></item>
  </channel></rss>`);
  assert.equal(feed.title, "Salt & Pepper");
  assert.deepEqual(feed.episodes.map((e) => [e.guid, e.title, e.audio_url]),
    [["1", "One", "https://x.example/1.mp3"], ["2", "Two & a half", "https://x.example/2.mp3"]]);
});

test("an Atom feed is read too", async () => {
  const feed = await parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom show</title>
    <link rel="alternate" href="https://example.com/"/>
    <entry><title>First</title><id>tag:example.com,2026:1</id><published>2026-10-01T10:00:00Z</published>
      <link rel="enclosure" href="https://x.example/a.mp3" type="audio/mpeg"/><summary>Hello</summary></entry>
  </feed>`);
  assert.equal(feed.title, "Atom show");
  assert.deepEqual(feed.episodes, [{ guid: "tag:example.com,2026:1", title: "First", audio_url: "https://x.example/a.mp3",
    audio_type: "audio/mpeg", description: "Hello", published: 1790848800, duration: null, image: null }]);
});

test("something that isn't a feed is refused", async () => {
  await assert.rejects(parseFeed("<html><body>Not a feed</body></html>"), /doesn't look like a podcast/);
  await assert.rejects(parseFeed(""), /doesn't look like a podcast/);
});

// ----- looking at a podcast again for new episodes -----
const ep = (n) => ({ guid: `g${n}`, title: `Episode ${n}`, audio_url: `https://x.example/${n}.mp3`, audio_type: "audio/mpeg",
  description: "d".repeat(3000), published: 1000 + n, duration: 60, image: null });

test("only episodes the phone doesn't have are added", () => {
  const feed = { uid: "f1", auto_transcribe: 0 };
  const fresh = newEpisodeRecords(feed, [ep(3), ep(2), ep(1)], ["e3", "e2", "e1"], new Set(["e1", "e2"]), 5000);
  assert.deepEqual(fresh.map((e) => e.uid), ["e3"]);
  assert.deepEqual(fresh[0], { uid: "e3", feed_uid: "f1", guid: "g3", title: "Episode 3", description: "d".repeat(1500),
    published: 1003, duration: 60, image: null, audio_url: "https://x.example/3.mp3", audio_type: "audio/mpeg",
    transcript_rev: null, model: null, transcribe_requested_at: null, remote_audio: 0, deleted: 0, created_at: 5000, updated_at: 5000 });
  assert.deepEqual(newEpisodeRecords(feed, [ep(1)], ["e1"], new Set(["e1"]), 5000), [], "nothing new: nothing added");
  assert.equal(newEpisodeRecords(feed, [ep(1), ep(1)], ["e1", "e1"], new Set(), 5000).length, 1, "the same episode twice in a feed is added once");
});

test("new episodes of an auto-transcribe podcast are queued for the computer, but never a whole back catalogue", () => {
  const auto = { uid: "f1", auto_transcribe: 1 };
  assert.equal(newEpisodeRecords(auto, [ep(3)], ["e3"], new Set(["e1", "e2"]), 5000)[0].transcribe_requested_at, 5000);
  const firstRead = newEpisodeRecords(auto, [ep(2), ep(1)], ["e2", "e1"], new Set(), 5000);
  assert.deepEqual(firstRead.map((e) => e.transcribe_requested_at), [null, null]);
  assert.equal(newEpisodeRecords({ uid: "f1", auto_transcribe: 0 }, [ep(3)], ["e3"], new Set(["e1"]), 5000)[0].transcribe_requested_at, null);
});
