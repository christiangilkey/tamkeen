// Spotify in Tamkeen (web/js/spotify.js): where the lyrics panel works (the web app on a computer with
// the browser extension) and what every other version says instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOTIFY, spotifyReason, spotifyText } from "../../web/js/spotify.js";

test("where Spotify's lyrics panel works: the web app on a computer, with the extension", () => {
  assert.equal(spotifyReason({ platform: "android", reason: "", extension: true }), "");
  assert.equal(spotifyReason({ platform: "android", reason: "web-computer", extension: false }), "web-computer");
  assert.equal(spotifyReason({ platform: "android", reason: "web-phone" }), "web-phone");
  assert.equal(spotifyReason({ platform: "android", reason: "android" }), "phone-app");
  assert.equal(spotifyReason({ platform: "android", reason: "iphone" }), "phone-app");
  // The computer app: Spotify plays in a web browser with the extension, not in the app.
  assert.equal(spotifyReason({ platform: "desktop", reason: "" }), "desktop");
  assert.equal(spotifyReason({ platform: "desktop", reason: "web-computer" }), "desktop");
  assert.equal(spotifyReason(), "phone-app");
  assert.equal(SPOTIFY, "https://open.spotify.com/");
});

test("what each version says", () => {
  for (const reason of ["web-computer", "desktop", "web-phone", "phone-app"]) {
    const { title, lines } = spotifyText(reason);
    assert.ok(title && lines.length >= 2 && lines.every((l) => typeof l === "string" && l.length > 20), reason);
  }
  assert.match(spotifyText("web-computer").lines.join(" "), /extension/);
  assert.match(spotifyText("web-phone").lines[0], /phone/);
  assert.match(spotifyText("phone-app").lines[0], /Spotify's own app/);
});
