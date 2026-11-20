// A long episode sent to a cloud provider from a phone or the web app (web/js/sttjob.js): dropped
// connections are tried again (and waited out while the app is out of sight), finished pieces are kept,
// and a later try carries on where the last one stopped. The owner's 2-hour episode (2026-11-20) is
// played through here with a connection that goes away part-way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Mp3Splitter, mp3Frame, parseTranscription, sendFailure } from "../../web/js/stt.js";
import { Cancelled, PATIENT_PAUSES, QUICK_PAUSES, askProvider, canResume, clock, recut, stopMessage, streamMp3, throughDrops } from "../../web/js/sttjob.js";

const FRAME = 417;                  // bytes in one frame of the fake MP3 (128 kbit/s, 44.1 kHz)
const FRAME_SECONDS = 1152 / 44100; // its length in time
function fakeMp3(n) {
  const out = new Uint8Array(n * FRAME);
  for (let i = 0; i < n; i++) { out.set([0xff, 0xfb, 0x90, 0x00], i * FRAME); out[i * FRAME + 4] = i % 251; }
  return out;
}
const join = (pieces) => { const all = new Uint8Array(pieces.reduce((n, p) => n + p.bytes.length, 0)); let at = 0; for (const p of pieces) { all.set(p.bytes, at); at += p.bytes.length; } return all; };
const firefoxDrop = () => new TypeError("NetworkError when attempting to fetch resource.");
const noWait = async () => {};
console.warn = () => {}; // (the module notes each drop in the console)

test("the splitter says where each piece ends, and a new one started there cuts the rest the same way", () => {
  const mp3 = fakeMp3(3000); // about 78 seconds
  const all = [];
  const a = new Mp3Splitter({ maxSeconds: 20 });
  for (let at = 0; at < mp3.length; at += 7001) all.push(...a.push(mp3.subarray(at, at + 7001)));
  all.push(a.finish());
  assert.equal(all.length, 4);
  for (const p of all) assert.ok(mp3Frame(mp3, p.end) || p.end === mp3.length, "every piece ends on a frame edge");
  assert.equal(all.at(-1).end, mp3.length);

  // Carry on after the second piece, as a Retry does: from its end, at its time.
  const k = all[1];
  const b = new Mp3Splitter({ maxSeconds: 20, start: k.start + k.seconds, offset: k.end });
  const rest = [];
  for (let at = k.end; at < mp3.length; at += 3 * 1024 * 1024) rest.push(...b.push(mp3.subarray(at, at + 3 * 1024 * 1024)));
  rest.push(b.finish());
  assert.deepEqual(rest.map((p) => [p.start, p.seconds, p.end]), all.slice(2).map((p) => [p.start, p.seconds, p.end]));
  assert.deepEqual(join(rest), join(all.slice(2)), "the same sound, nothing lost or sent twice");
  assert.ok(Math.abs(b.total - a.total) < 1e-9, "the length counts from the file's beginning");
});

test("a drop while the app was out of sight is waited out and not counted; real drops are tried again with growing pauses", async () => {
  const said = [];
  const job = { say: (t) => said.push(t) };
  let hidden = true; // the phone put the app away
  let backs = 0;
  const net = { mark: () => 0, troubleSince: () => hidden, waitUntilBack: async () => { backs++; hidden = false; } };
  const slept = [];
  let calls = 0;
  const out = await throughDrops(async () => { calls++; if (calls <= 4) throw firefoxDrop(); return "answer"; },
    { job, net, sleep: async (s) => slept.push(s), pauses: PATIENT_PAUSES });
  assert.equal(out, "answer");
  assert.equal(backs, 1, "the first drop happened in the background: waited for the app to come back");
  assert.deepEqual(slept, [5, 10, 20], "then three real drops, tried again after 5, 10 and 20 seconds");
  assert.match(said[0], /^The connection dropped\. Trying again in 5 seconds…$/);
  assert.equal(said.at(-1), "", "the note goes once it works again");
});

test("a connection that stays away gives up after about two minutes, saying how long it tried", async () => {
  const slept = [];
  await assert.rejects(throughDrops(async () => { throw firefoxDrop(); }, { sleep: async (s) => slept.push(s), pauses: PATIENT_PAUSES }),
    (e) => e.lostFor === 135 && /NetworkError/.test(e.message));
  assert.deepEqual(slept, PATIENT_PAUSES);
  // Test the key and reels keep the old quick tries (four in all).
  let n = 0;
  await assert.rejects(throughDrops(async () => { n++; throw firefoxDrop(); }, { sleep: noWait, pauses: QUICK_PAUSES }));
  assert.equal(n, 4);
});

test("an error that isn't the connection is not tried again", async () => {
  let n = 0;
  await assert.rejects(throughDrops(async () => { n++; throw new Error("Illegal base64 character a"); }, { sleep: noWait }), /Illegal base64/);
  assert.equal(n, 1);
});

test("a cancelled job stops while waiting", async () => {
  const job = { cancelled: false };
  await assert.rejects(throughDrops(async () => { throw firefoxDrop(); },
    { job, sleep: async () => { job.cancelled = true; throw new Cancelled(); }, pauses: PATIENT_PAUSES }), Cancelled);
});

test("the provider: slow-down answers are waited out, trouble tried again, a drop said as before", async () => {
  const said = [];
  const job = { say: (t) => said.push(t) };
  const answers = [{ status: 429, body: "{}", retryAfter: 30 }, { status: 503, body: "" }, { status: 200, body: JSON.stringify({ text: "مرحبا" }) }];
  const slept = [];
  const data = await askProvider("groq", async () => answers.shift(), { job, sleep: async (s) => slept.push(s) });
  assert.equal(data.text, "مرحبا");
  assert.deepEqual(slept, [31, 4]);
  assert.ok(said.includes("Groq asks to wait 30 seconds…"));

  await assert.rejects(askProvider("groq", async () => ({ status: 429, body: "{}", retryAfter: 3600 }), { sleep: noWait }), /limit/);
  await assert.rejects(askProvider("groq", async () => ({ status: 401, body: '{"error":{"message":"Invalid API Key"}}' }), { sleep: noWait }), /Groq/);
  await assert.rejects(askProvider("groq", async () => { throw firefoxDrop(); }, { sleep: noWait }),
    (e) => /^Couldn't reach Groq\. Check your internet connection\. \(NetworkError when attempting to fetch resource\.\)$/.test(e.message)
      && e.where === "Groq" && e.lostFor === 18);
});

test("only the very same file is carried on", () => {
  const saved = { address: "https://feed/ep.mp3", model: "cloud:whisper-large-v3:groq", language: "ar", total: 1000, src: "https://cdn/x/stitched_1.mp3?session=1",
                  byte: 400, start: 30, segments: [], at: 1000 };
  const now = { address: saved.address, model: saved.model, language: "ar", total: 1000, src: "https://cdn/x/stitched_1.mp3?session=2", now: 2000 };
  assert.ok(canResume(saved, now), "a new listening session in the address is the same file");
  assert.ok(!canResume(saved, { ...now, total: 1001 }), "a different size (other adverts put in)");
  assert.ok(!canResume(saved, { ...now, src: "https://cdn/x/stitched_2.mp3" }), "a different stitched file");
  assert.ok(!canResume(saved, { ...now, model: "cloud:whisper-large-v3-turbo:groq" }), "another model");
  assert.ok(!canResume(saved, { ...now, language: "es" }), "another language");
  assert.ok(!canResume(saved, { ...now, now: 1000 + 15 * 86400e3 }), "too old");
  assert.ok(!canResume(null, now));
  assert.ok(!canResume({ ...saved, byte: 1000 }, now), "nothing left to do");
});

test("the message says what happened, where it stopped and what to do, and keeps the browser's own words", () => {
  const e = sendFailure("groq", firefoxDrop());
  Object.assign(e, { where: "Groq", lostFor: 135, stoppedAt: 3840 });
  assert.equal(stopMessage(e, { duration: 7380 }),
    "Couldn't reach Groq for about 2 minutes, so it stopped at 1:04:00 / 2:03:00. Retry carries on from there. "
    + "Phones cut the internet to apps in the background, more so when the battery is low: keep Tamkeen open with the screen on, "
    + "and plug the phone in. (NetworkError when attempting to fetch resource.)");
  const down = Object.assign(firefoxDrop(), { where: "the episode's server", lostFor: 140, stoppedAt: 0 });
  assert.match(stopMessage(down, {}), /^Couldn't reach the episode's server for about 2 minutes, so it stopped at 0:00\. /);
  const limit = Object.assign(new Error("Groq says your account has reached its limit for now."), { stoppedAt: 600 });
  assert.equal(stopMessage(limit), "Groq says your account has reached its limit for now. Retry carries on from where it stopped.");
  assert.equal(stopMessage(new Error("This audio couldn't be read as an MP3.")), "This audio couldn't be read as an MP3.");
  assert.equal(clock(59), "0:59");
  assert.equal(clock(7380), "2:03:00");
});

// ------------------------------------------------------------------ the owner's 2-hour episode

/** A pretend podcast server (3 MB at a time, as the app asks) and a pretend Groq that writes one line per piece. */
function world(mp3) {
  const asked = [];
  const sent = [];
  const fetchRange = async (url, from, to) => {
    asked.push(from);
    if (from >= mp3.length) return { status: 416, bytes: new Uint8Array(0) };
    return { status: 206, bytes: mp3.slice(from, Math.min(mp3.length, to + 1)), total: mp3.length, url };
  };
  const answer = (p) => ({ segments: [{ start: 0, end: p.seconds, text: `piece at ${Math.round(p.start)}` }],
                           words: [{ start: 0, end: 1, word: `w${Math.round(p.start)}` }] });
  return { asked, sent, fetchRange, answer };
}
const jobFor = () => ({ cancelled: false, progress: [], set(status, pct) { this.progress.push([status, pct]); }, say() {} });

test("a 2-hour episode: the connection goes away at piece 9 for good, then Retry carries on from piece 9 and finishes", async () => {
  const seconds = 2 * 3600 + 3 * 60;                    // 2 h 3 min, as the owner's episode
  const mp3 = fakeMp3(Math.ceil(seconds / FRAME_SECONDS)); // about 118 MB, like the real file (119 MB)
  const { asked, fetchRange, answer } = world(mp3);
  const first = await fetchRange("https://cdn/ep.mp3", 0, 256 * 1024 - 1);
  first.src = first.url;

  // First try: pieces 1-8 go up, then every send of piece 9 fails (the phone cut the browser's internet).
  let kept = null;
  const sentFirst = [];
  const hear1 = async (p) => {
    if (sentFirst.length === 8) throw sendFailure("groq", firefoxDrop());
    sentFirst.push(p.start);
    return parseTranscription(answer(p), (t) => t + p.start);
  };
  const slept = [];
  // askProvider's way of trying again, with the patient pauses (the app on screen, the phone online)
  const ctx = { sleep: async (s) => slept.push(s), pauses: PATIENT_PAUSES };
  const tryHear1 = (p) => throughDrops(() => hear1(p), ctx, (e) => e.retry === true).catch((e) => { e.where = "Groq"; throw e; });
  const job1 = jobFor();
  const failed = await streamMp3({ first, fetchRange, hear: tryHear1, keep: (s) => { kept = structuredClone(s); }, job: job1, ctx })
    .then(() => null, (e) => e);
  assert.ok(failed, "it stopped");
  assert.equal(sentFirst.length, 8);
  assert.deepEqual(slept, PATIENT_PAUSES, "piece 9 was tried six times over about two minutes");
  assert.ok(Math.abs(failed.stoppedAt - 8 * 480) < 1, `stopped after 8 pieces of 8 minutes (${failed.stoppedAt})`);
  assert.match(stopMessage(failed, { duration: seconds }), /^Couldn't reach Groq for about 2 minutes, so it stopped at 1:04:0\d \/ 2:03:00\. Retry carries on from there\./);
  assert.equal(kept.segments.length, 8, "the eight pieces done are kept");

  // Retry: the same file is asked for again; it carries on from where the kept part ends.
  asked.length = 0;
  const sentSecond = [];
  const hear2 = async (p) => { sentSecond.push(p.start); return parseTranscription(answer(p), (t) => t + p.start); };
  const first2 = await fetchRange("https://cdn/ep.mp3", 0, 256 * 1024 - 1);
  first2.src = first2.url;
  const saved = { address: "a", model: "m", language: "ar", total: mp3.length, src: first2.src, at: Date.now(), ...kept };
  assert.ok(canResume(saved, { address: "a", model: "m", language: "ar", total: first2.total, src: first2.src }));
  const done = await streamMp3({ first: first2, fetchRange, hear: hear2, keep: (s) => { kept = s; }, saved, job: jobFor(), ctx: { sleep: noWait } });
  assert.equal(asked[1], saved.byte, "the download carried on from the end of piece 8, not from the beginning");
  assert.equal(sentSecond.length, 8, "only the 8 pieces not yet done were sent (and paid for) again");
  assert.ok(Math.abs(sentSecond[0] - 8 * 480) < 1);
  assert.equal(done.segments.length, 16, "all 16 pieces in the transcript, none twice");
  const starts = done.segments.map((s) => Math.round(s.start));
  assert.deepEqual(starts, [...starts].sort((x, y) => x - y), "in order");
  assert.equal(new Set(starts).size, 16);
  assert.ok(Math.abs(done.seconds - seconds) < 1, `the whole length (${done.seconds})`);
  assert.ok(Math.abs(done.segments.at(-1).end - seconds) < 1, "times run to the end of the episode");
});

test("a 2-hour episode whose connection only blinks finishes in one go", async () => {
  const seconds = 2 * 3600 + 3 * 60;
  const mp3 = fakeMp3(Math.ceil(seconds / FRAME_SECONDS));
  const { fetchRange, answer } = world(mp3);
  let downloadDrops = 0;
  const flakyFetch = async (url, from, to) => {
    if (from > 50e6 && downloadDrops < 2) { downloadDrops++; throw firefoxDrop(); } // the download drops twice too
    return fetchRange(url, from, to);
  };
  const first = await fetchRange("https://cdn/ep.mp3", 0, 256 * 1024 - 1);
  first.src = first.url;
  let tries = 0;
  const hear = (p) => throughDrops(async () => {
    tries++;
    if (tries % 3 === 0) throw sendFailure("groq", firefoxDrop()); // every third send drops
    return parseTranscription(answer(p), (t) => t + p.start);
  }, { sleep: noWait, pauses: PATIENT_PAUSES }, (e) => e.retry === true);
  const done = await streamMp3({ first, fetchRange: flakyFetch, hear, job: jobFor(), ctx: { sleep: noWait, pauses: PATIENT_PAUSES } });
  assert.equal(downloadDrops, 2);
  assert.equal(done.segments.length, 16);
  assert.ok(Math.abs(done.seconds - seconds) < 1);
});

// ------------------------------------------------------ "stuck at 8 percent": the first upload never got through

test("a piece cut again keeps its sound, its times and where it ends", () => {
  const mp3 = fakeMp3(5000);
  const s = new Mp3Splitter({ maxSeconds: 100 });
  const [p] = s.push(mp3);
  const halves = recut(p, p.seconds / 2);
  assert.equal(halves.length, 2);
  assert.deepEqual(join(halves), p.bytes, "the same sound");
  assert.equal(halves[0].start, p.start);
  assert.ok(Math.abs(halves[1].start - (p.start + halves[0].seconds)) < 1e-9);
  assert.ok(Math.abs(halves[0].seconds + halves[1].seconds - p.seconds) < 1e-9);
  assert.equal(halves[0].end, halves[0].bytes.length, "the first half ends where its bytes end in the file");
  assert.equal(halves[1].end, p.end);
});

/** A phone whose uploads die when a request is bigger than `limit` bytes. */
function slowPhone(limit, answer) {
  const tries = [];
  const hear = (p, extra = {}) => throughDrops(async () => {
    tries.push(Math.round(p.seconds));
    if (p.bytes.length > limit) throw sendFailure("groq", firefoxDrop());
    return parseTranscription(answer(p), (t) => t + p.start);
  }, { sleep: noWait, pauses: PATIENT_PAUSES, ...extra }, (e) => e.retry === true);
  return { tries, hear };
}

test("a 2-hour episode whose 8-minute pieces never get through goes up in 4-minute pieces instead", async () => {
  const seconds = 2 * 3600 + 3 * 60;
  const mp3 = fakeMp3(Math.ceil(seconds / FRAME_SECONDS));
  const { fetchRange, answer } = world(mp3);
  const first = await fetchRange("https://cdn/ep.mp3", 0, 256 * 1024 - 1);
  first.src = first.url;
  const { tries, hear } = slowPhone(4 * 1024 * 1024, answer); // 4 MB: about 4 minutes at 128 kbit/s
  const said = [];
  const job = { ...jobFor(), say: (t) => said.push(t) };
  let learnt = 0;
  const done = await streamMp3({ first, fetchRange, hear, job, ctx: { sleep: noWait }, smaller: (s) => { learnt = s; }, label: "Groq" });
  assert.deepEqual(tries.slice(0, 5), [480, 480, 480, 240, 240], "three tries of the first 8 minutes, then two halves");
  assert.equal(tries.filter((t) => t === 480).length, 3, "no later piece is tried at 8 minutes");
  assert.equal(learnt, 240, "the smaller size is passed on, for the next episodes");
  assert.equal(said[0], "Sending 0:00–8:00 to Groq…");
  assert.ok(said.includes("Sending 0:00–4:00 to Groq…") && said.includes("Sending 4:00–8:00 to Groq…"));
  const starts = done.segments.map((s) => Math.round(s.start));
  assert.equal(new Set(starts).size, starts.length, "nothing twice");
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b), "in order");
  assert.equal(starts.length, Math.ceil(seconds / 240), "the whole episode in 4-minute pieces");
  assert.ok(Math.abs(done.segments.at(-1).end - seconds) < 1);
});

test("the next episode starts at the size that went through, and a phone that can send nothing still stops", async () => {
  const mp3 = fakeMp3(Math.ceil(1800 / FRAME_SECONDS)); // half an hour
  const { fetchRange, answer } = world(mp3);
  const first = await fetchRange("https://cdn/ep.mp3", 0, 256 * 1024 - 1);
  first.src = first.url;
  const ok = slowPhone(4 * 1024 * 1024, answer);
  await streamMp3({ first, fetchRange, hear: ok.hear, job: jobFor(), ctx: { sleep: noWait }, pieceSeconds: 240 });
  assert.ok(ok.tries.every((t) => t <= 240), "never tried at 8 minutes");
  assert.equal(ok.tries.length, Math.ceil(1800 / 240), "one try a piece");

  const none = slowPhone(0, answer);
  const e = await streamMp3({ first, fetchRange, hear: none.hear, job: jobFor(), ctx: { sleep: noWait } }).then(() => null, (x) => x);
  assert.ok(e && e.lostFor > 0, "it gives up, saying how long it tried");
  assert.equal(e.stoppedAt, 0);
  assert.deepEqual([...new Set(none.tries)], [480, 240, 120, 60], "halved down to one minute, no further");
});
