// Chat notifications (web/js/chatnotify.js): what each kind of message says, and when it is a banner,
// the system's notification, or nothing; and tamkeen://chat links (web/js/applink.js).
import { test } from "node:test";
import assert from "node:assert/strict";

const { howToTell, messageLine } = await import("../../web/js/chatnotify.js");
const { parseChatLink, parseTamkeenLink } = await import("../../web/js/applink.js");

test("every kind of message has its own line", () => {
  assert.equal(messageLine({ kind: "text", body: "  Hola,\n  ¿qué tal?  " }), "Hola, ¿qué tal?");
  assert.equal(messageLine({ kind: "text", body: "x".repeat(300) }).length, 140, "long text is cut");
  assert.equal(messageLine({ kind: "voice", payload: { path: "a/b.webm" } }), "Sent you a voice message");
  const media = (kind, title) => ({ kind: "share", payload: { media: { kind, title } } });
  assert.equal(messageLine(media("podcast", "Ep. 18")), "Sent you a podcast episode: Ep. 18");
  assert.equal(messageLine(media("youtube", "Clip")), "Sent you a video: Clip");
  assert.equal(messageLine(media("page", "Davao Balita")), "Sent you a web page: Davao Balita");
  assert.equal(messageLine(media("reel", "")), "Sent you a reel");
  assert.equal(messageLine(media("book", "Larawan")), "Sent you: Larawan", "a kind this version doesn't know");
  assert.equal(messageLine(media("book", "")), "Sent you something to study");
  assert.equal(messageLine({ kind: "share", payload: { words: [{ text: "lagi" }] } }), "Sent you a word: lagi");
  assert.equal(messageLine({ kind: "share", payload: { words: [{ text: "a" }, { text: "b" }] } }), "Sent you 2 words");
  assert.equal(messageLine({ kind: "share", payload: { folder: "Week 1", words: [{ text: "a" }] } }), "Sent you a folder: Week 1 (1 word)");
});

test("a banner while Tamkeen is on screen, the system's notification when it isn't, nothing in that chat", () => {
  const sender = "0a1b2c3d-1111-2222-3333-444455556666";
  assert.equal(howToTell({ shown: true, hash: `#/chat/${sender}`, sender }), "none");
  assert.equal(howToTell({ shown: true, hash: "#/library", sender }), "banner");
  assert.equal(howToTell({ shown: false, hash: `#/chat/${sender}`, sender }), "system", "that chat, but minimised");
  assert.equal(howToTell({ shown: false, hash: "#/", sender }), "system");
});

test("tamkeen://chat links open a chat, and watch links are still read as before", () => {
  const id = "0a1b2c3d-1111-2222-3333-444455556666";
  assert.equal(parseChatLink(`tamkeen://chat/${id}`), id);
  assert.equal(parseChatLink(`TAMKEEN://chat/${id.toUpperCase()}/`), id);
  for (const bad of ["tamkeen://chat/", "tamkeen://chat/../settings", `https://chat/${id}`, `tamkeen://chat/${id}/x`]) {
    assert.equal(parseChatLink(bad), null, bad);
  }
  assert.equal(parseChatLink("tamkeen://watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseTamkeenLink(`tamkeen://chat/${id}`), null);
});
