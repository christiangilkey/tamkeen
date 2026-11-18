// Retry on a failed reel in the Library (the phone's /episodes/transcribe): a reel goes to the reels' own listener,
// which fetches its sound from Instagram, not to the queue that sent its page address to the provider (the owner,
// 2026-11-18: "Groq couldn't transcribe this (error 400): could not process file").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../../mobile/src/js/backend.js", import.meta.url), "utf8");

test("reels are sent to the reels' listener, the rest to the queue", () => {
  const at = backend.indexOf("transcribe$/, async");
  const body = backend.slice(at, backend.indexOf("}],", at));
  assert.match(body, /const reels = wanted\.filter\(\(id\) => episodeOf\(id\)\.audio_type === "video\/instagram"\);/);
  assert.match(body, /await phoneReels\.startSelected\(reels\.map\(\(id\) => episodeOf\(id\)\.guid\)\)/);
  assert.match(body, /cloud\.enqueue\(rest\)/);
  assert.doesNotMatch(body, /cloud\.enqueue\(wanted\)/);
});
