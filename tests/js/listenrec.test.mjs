// Library → My audio → Listen (web/js/listenrec.js): the recording's name and clock, and a browser
// recorder's WebM turned into Ogg Opus without decoding it, so every version can play it and jump about in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LISTEN_MAX_MINUTES, clock, recorderKind, recordingFile, recordingName, recordingStamp, stampLocale, webmOpus, webmToOgg } from "../../web/js/listenrec.js";
import { opusHead, opusPackets, packetSamples } from "../../web/js/oggjoin.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

// ---- a small WebM writer, as a browser's recorder lays one out (Segment and Clusters of unknown size)

const UNKNOWN = Symbol("unknown size");
const idBytes = (id) => { const out = []; for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256); return out; };
function sizeBytes(n) {
  if (n === UNKNOWN) return [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const out = [];
      for (let i = 0, v = n; i < len; i++, v = Math.floor(v / 256)) out.unshift(v % 256);
      out[0] |= 0x80 >> (len - 1);
      return out;
    }
  }
  throw new Error("too big");
}
const flat = (parts) => parts.flatMap((p) => (p instanceof Uint8Array ? [...p] : Array.isArray(p) ? p : [p]));
const el = (id, body, size) => { const b = flat(body); return [...idBytes(id), ...sizeBytes(size === UNKNOWN ? UNKNOWN : b.length), ...b]; };
const uint = (n) => (n < 256 ? [n] : [n >> 8, n & 255]);
const str = (s) => [...s].map((c) => c.charCodeAt(0));

/** Opus packets of 20 ms (one frame each), each its own bytes so they can be told apart. */
const packets = (n) => Array.from({ length: n }, (_, i) => new Uint8Array([0x78, (i * 7) & 255, i & 255, 0x55]));
const block = (track, time, packet, flags = 0x80) => el(0xa3, [...sizeBytes(track), time >> 8, time & 255, flags, ...packet]);

function webm({ codec = "A_OPUS", head = opusHead({ skip: 312 }), audio = packets(120), clusterSize = UNKNOWN, laced = false, extraTrack = false } = {}) {
  const tracks = el(0x1654ae6b, [
    ...(extraTrack ? el(0xae, [...el(0xd7, uint(2)), ...el(0x86, str("V_VP8"))]) : []),
    ...el(0xae, [...el(0xd7, uint(1)), ...el(0x86, str(codec)), ...el(0x63a2, [...head]), ...el(0xe1, [...el(0x9f, [1])])]),
  ]);
  const clusters = [];
  for (let at = 0; at < audio.length; at += 50) {
    const body = [...el(0xe7, uint(at * 20))];
    audio.slice(at, at + 50).forEach((p, i) => {
      body.push(...block(1, i * 20, p, laced ? 0x82 : 0x80));
      if (extraTrack && i === 0) body.push(...block(2, 0, new Uint8Array([1, 2, 3])));
    });
    clusters.push(...el(0x1f43b675, body, clusterSize === UNKNOWN ? UNKNOWN : undefined));
  }
  return new Uint8Array([
    ...el(0x1a45dfa3, [...el(0x4282, str("webm"))]),
    ...el(0x18538067, [...el(0x1549a966, [...el(0x2ad7b1, [0x0f, 0x42, 0x40])]), ...tracks, ...el(0xec, [0, 0, 0]), ...clusters], UNKNOWN),
  ]);
}

test("a recording is named after when it was made, and the clock reads plainly", () => {
  const when = new Date(2026, 10, 16, 14, 5);
  assert.equal(recordingStamp(when), "16 Nov 14:05");
  assert.equal(recordingStamp(new Date(2026, 0, 3, 9, 7)), "3 Jan 09:07");
  assert.equal(stampLocale("en"), "en-GB");
  assert.equal(stampLocale("ar"), "ar");
  assert.match(recordingStamp(when, "no-such-locale-xx"), /14:05$/, "a locale the device lacks still gives a name");
  assert.equal(recordingName(when, ".ogg"), "recording-20261116-1405.ogg");
  assert.deepEqual([0, 999, 7000, 65000, 3599000, 3723000].map(clock), ["0:00", "0:00", "0:07", "1:05", "59:59", "1:02:03"]);
  assert.ok(LISTEN_MAX_MINUTES * 60 * 32000 / 8 < 24 * 1024 * 1024, "the longest recording fits a cloud service's 24 MB");
});

test("the recorder's own file keeps an ending every version knows", () => {
  assert.deepEqual(recorderKind("audio/webm;codecs=opus"), { ext: ".webm", mime: "audio/webm" });
  assert.deepEqual(recorderKind("audio/ogg; codecs=opus"), { ext: ".ogg", mime: "audio/ogg" });
  assert.deepEqual(recorderKind("audio/mp4;codecs=mp4a.40.2"), { ext: ".m4a", mime: "audio/mp4" });
  assert.deepEqual(recorderKind(""), { ext: ".webm", mime: "audio/webm" });
  // The phone takes .ogg and .m4a as audio, and so does the computer.
  const phone = read("mobile/src/js/app.js").match(/const AUDIO_EXT = \/\\\.\(([^)]+)\)/)[1].split("|");
  assert.ok(phone.includes("ogg") && phone.includes("m4a"));
  const computer = read("app/videos.py");
  assert.match(computer, /"\.ogg": "audio\/ogg"/);
  assert.match(computer, /"\.m4a": "audio\/mp4"/);
});

test("a recorder's WebM becomes Ogg Opus with the very same packets", () => {
  const audio = packets(120);
  const head = opusHead({ skip: 312 });
  for (const clusterSize of [UNKNOWN, "known"]) {
    const found = webmOpus(webm({ audio, head, clusterSize, extraTrack: clusterSize === "known" }));
    assert.ok(found, `read (${String(clusterSize)})`);
    assert.deepEqual([...found.head], [...head]);
    assert.equal(found.channels, 1);
    assert.deepEqual(found.packets.map((p) => [...p]), audio.map((p) => [...p]), "only the Opus track's packets, in order");
  }
  const ogg = webmToOgg(webm({ audio, head }));
  const back = opusPackets(ogg);
  assert.ok(back, "a readable Ogg Opus file");
  assert.deepEqual(back.audio.map((p) => [...p]), audio.map((p) => [...p]));
  assert.equal(back.skip, 312);
  assert.equal(back.samples, 120 * packetSamples(audio[0]));
  assert.equal(back.samples / 48000, 2.4, "2.4 seconds of sound");
});

test("what isn't a recorder's Opus WebM is left alone", () => {
  assert.equal(webmOpus(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0])), null, "Ogg, not WebM");
  assert.equal(webmOpus(new Uint8Array(0)), null);
  assert.equal(webmOpus(webm({ codec: "A_VORBIS" })), null, "not Opus");
  assert.equal(webmOpus(webm({ head: new Uint8Array(19) })), null, "no OpusHead");
  assert.equal(webmOpus(webm({ laced: true })), null, "laced blocks");
  assert.equal(webmOpus(webm({ audio: [] })), null, "no sound");
  // Cut short (the last block half written): what came before is kept.
  const whole = webm({ audio: packets(10) });
  const cut = webmOpus(whole.subarray(0, whole.length - 2));
  assert.equal(cut.packets.length, 9);
});

test("the file kept: Ogg from a WebM, the recorder's own file otherwise", async () => {
  const when = new Date(2026, 10, 16, 14, 5);
  const fromWebm = await recordingFile(new Blob([webm()], { type: "audio/webm;codecs=opus" }), { type: "audio/webm;codecs=opus", date: when });
  assert.equal(fromWebm.name, "recording-20261116-1405.ogg");
  assert.equal(fromWebm.type, "audio/ogg");
  assert.ok(opusPackets(new Uint8Array(await fromWebm.arrayBuffer())));
  const m4a = await recordingFile(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mp4" }), { type: "audio/mp4", date: when });
  assert.equal(m4a.name, "recording-20261116-1405.m4a");
  assert.equal(m4a.size, 3, "kept as it is");
  const broken = await recordingFile(new Blob([new Uint8Array([1, 2, 3])]), { type: "audio/webm", date: when });
  assert.equal(broken.name, "recording-20261116-1405.webm", "sent as it is: the computer turns it into Ogg");
});

// (Two seconds of a tone recorded by Chromium's MediaRecorder at 32 kbit/s: no length, no index, 60 ms
// stereo packets. In Chromium the Ogg made from it played 1.98 s and could be jumped about in; the WebM itself
// said its length was Infinity.)
test("a real browser recording (Chromium's MediaRecorder) is read", () => {
  const bytes = new Uint8Array(readFileSync(new URL("tests/fixtures/chromium-recording.webm", ROOT)));
  const found = webmOpus(bytes);
  assert.ok(found && found.packets.length > 20);
  const back = opusPackets(webmToOgg(bytes));
  assert.equal(back.audio.length, found.packets.length);
  assert.equal(back.head[9], 2, "Chromium's channels kept");
  const seconds = (back.samples - back.skip) / 48000;
  assert.ok(Math.abs(seconds - 1.98) < 0.001, `the length Chromium played (${seconds})`);
});

test("Listen is wired in every version", () => {
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/listenrec.js", "js/components/listenbox.js"]) assert.ok(build.includes(`"${f}"`), `${f} is in the phone build`);
  const lib = read("web/js/pages/library.js");
  assert.match(lib, /listenAndSave\(/);
  assert.match(lib, /recording: true/);
  // A phone or the web app asks for the Google sign-in before recording, not after.
  assert.match(lib, /const blocked = ownFilesBlocked\(\);[\s\S]*listenAndSave/);
  assert.match(read("mobile/src/js/app.js"), /export function ownFilesBlocked\(\) \{\n  return settings\.signed_in \? "" :/);
  // Both shells' uploads take a recording's name and treat it as audio.
  assert.match(read("web/js/app.js"), /q\.set\("recording", "true"\)/);
  assert.match(read("mobile/src/js/app.js"), /\(book \|\| recording\) && !audioExt/);
  assert.match(read("app/api/episodes.py"), /recording: bool = False/);
});
