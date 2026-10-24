// Spotify's web player as the extension reads it (extension/src/content/spotify-page.js, a plain script
// run inside Spotify's page): the times it shows, its links to songs, where the song is by its progress
// bar, and which of its own lyric lines is being sung (by their looks, whatever its class names are).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../extension/src/content/spotify-page.js", import.meta.url), "utf8");
const win = {};
win.window = win;
vm.runInNewContext(SRC, win);
const P = win.__tamkeenSpotifyPage;

test("the times Spotify shows", () => {
  assert.equal(P.clock("1:23"), 83);
  assert.equal(P.clock("0:05"), 5);
  assert.equal(P.clock("1:02:03"), 3723);
  assert.equal(P.clock("-2:26"), -146); // the time left
  assert.equal(P.clock("−2:26"), -146);
  assert.ok(Number.isNaN(P.clock("-:--")));
  assert.ok(Number.isNaN(P.clock("")));
});

test("a song's id in Spotify's links", () => {
  assert.equal(P.trackIdFrom("/track/6habFhsOp2NvshLv26DqMb"), "6habFhsOp2NvshLv26DqMb");
  assert.equal(P.trackIdFrom("https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb?si=x"), "6habFhsOp2NvshLv26DqMb");
  assert.equal(P.trackIdFrom("/album/5C0YLr4OoRGFDaqWMn3Kv4?highlight=spotify:track:6habFhsOp2NvshLv26DqMb"), "6habFhsOp2NvshLv26DqMb");
  assert.equal(P.trackIdFrom("/album/x?highlight=spotify%3Atrack%3A6habFhsOp2NvshLv26DqMb"), "6habFhsOp2NvshLv26DqMb");
  assert.equal(P.trackIdFrom("/album/5C0YLr4OoRGFDaqWMn3Kv4"), "");
  assert.equal(P.trackIdFrom("/track/short"), "");
});

test("where the song is: the progress bar's slider first (milliseconds or seconds), then the bar, then the times", () => {
  const ms = P.progressFrom({ range: { value: "83500", max: "229000", valuetext: "1:23/3:49" }, position: "1:23", duration: "3:49" });
  assert.deepEqual([ms.t, ms.d, ms.via], [83.5, 229, "range"]);
  const sec = P.progressFrom({ range: { value: "83", max: "229" }, position: "1:23", duration: "3:49" });
  assert.deepEqual([sec.t, sec.d], [83, 229]);
  const noText = P.progressFrom({ range: { value: "83500", max: "229000" } });
  assert.deepEqual([noText.t, noText.d], [83.5, 229]);
  // Nothing loaded (the slider is off, at 0): the bar's place, with the length shown.
  const bar = P.progressFrom({ range: { value: "1000", max: "0", disabled: true }, transform: "50%", position: "1:54", duration: "3:48" });
  assert.deepEqual([bar.t, bar.d, bar.via], [114, 228, "bar"]);
  // The time left is shown instead of the length.
  const left = P.progressFrom({ position: "1:00", duration: "-2:30" });
  assert.deepEqual([left.t, left.d, left.via], [60, 210, "text"]);
  const none = P.progressFrom({ range: null, position: "-:--", duration: "-:--" });
  assert.ok(Number.isNaN(none.t));
  assert.equal(P.percent("--x: 37.5%"), 0.375);
});

const look = (kinds) => kinds.map((k) => ["0:line", `0:${k}`, "1:text"]);

test("Spotify's line being sung: its own look, between the lines sung and those to come", () => {
  assert.equal(P.activeIndex(look(["past", "past", "now", "next", "next", "next"])), 2);
  assert.equal(P.activeIndex(look(["now", "next", "next", "next"])), 0);
  assert.equal(P.activeIndex(look(["past", "past", "past", "now"])), 3);
  // Before the singing starts, at the end, and lyrics without timings: no line stands out.
  assert.equal(P.activeIndex(look(["next", "next", "next"])), -1);
  assert.equal(P.activeIndex(look(["past", "past", "past"])), -1);
  assert.equal(P.activeIndex(look(["same", "same"])), -1);
  assert.equal(P.activeIndex([]), -1);
  // A look of its own for the next line too: the earlier of the two is being sung.
  assert.equal(P.activeIndex(look(["past", "past", "now", "soon", "next", "next", "next"])), 2);
  assert.equal(P.activeIndex(look(["past", "past", "past", "past", "past", "now", "soon", "next"])), 5);
  // Marked by an attribute rather than a class.
  assert.equal(P.activeIndex([["0:l"], ["0:l", "0@true"], ["0:l"], ["0:l"]]), 1);
});
