// The web app's Vocab cards from the learner's own videos (mobile/src/js/app.js audioUrl): a card's Word and
// Sentence don't fetch the whole video from Drive (the owner, 2026-11-18: "Loading video…"); the card's voice
// says it instead, unless the video is already loaded in this window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../mobile/src/js/app.js", import.meta.url), "utf8");

test("a card's word from a Drive video isn't fetched whole on the web", () => {
  const at = app.indexOf("export async function audioUrl(");
  const body = app.slice(at, app.indexOf("\n}\n", at));
  const skip = body.indexOf('if (quiet && isWeb && !objectUrls.has(uid)) return "";');
  const fetch = body.indexOf("return videoUrl(ep);");
  assert.ok(skip > 0 && fetch > skip, "the card's quiet ask stops before the whole video is fetched");
  assert.match(readFileSync(new URL("../../web/js/snippetplayer.js", import.meta.url), "utf8"), /audioUrl\(v\.episode_id, \{ quiet: true \}\)/, "the cards ask quietly");
});
