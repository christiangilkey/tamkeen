// Run with: node --test tests/js/
// Captions written by Gemini for a YouTube video that has none (web/js/ytgemini.js): the request
// (the video goes as its link, nothing is downloaded), reading the answer into timed lines, the
// fallback model, the cost estimate and the plain messages when it can't be done.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTION_MODELS, MAX_SECONDS, captionCents, captionLinesFrom, captionRequest, geminiCaptions, heardLanguage, seconds }
  from "../../web/js/ytgemini.js";

const VIDEO = { videoId: "lo3KyF50IGE", title: "A video", channel: "A channel", duration: 120 };
const answer = (obj, extra = {}) => ({ status: 200, text: JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP", ...extra }],
  usageMetadata: { promptTokenCount: 12000, candidatesTokenCount: 800 },
}) });

test("the request gives Gemini the video's YouTube link, not a file, with the learner's key", () => {
  const req = captionRequest({ id: "lo3KyF50IGE", key: "AIza-test", languageName: "Arabic" });
  assert.match(req.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(req.headers["x-goog-api-key"], "AIza-test");
  const parts = req.body.contents[0].parts;
  assert.deepEqual(parts[0], { file_data: { file_uri: "https://www.youtube.com/watch?v=lo3KyF50IGE" } });
  assert.match(parts[1].text, /word for word.*Do not translate.*probably in Arabic/);
  const cfg = req.body.generationConfig;
  assert.equal(cfg.responseMimeType, "application/json");
  assert.equal(cfg.mediaResolution, "MEDIA_RESOLUTION_LOW");
  assert.deepEqual(cfg.thinkingConfig, { thinkingLevel: "minimal" });
  assert.ok(req.timeout >= 300, "the computer's relay is told to wait long enough");
  assert.equal(captionRequest({ id: "x", key: "k", model: "gemini-2.5-flash-lite" }).body.generationConfig.thinkingConfig, undefined);
});

test("times come as seconds or as clock times", () => {
  assert.equal(seconds(83.5), 83.5);
  assert.equal(seconds("83.5"), 83.5);
  assert.equal(seconds("1:23.5"), 83.5);
  assert.equal(seconds("01:01:23"), 3683);
  assert.ok(Number.isNaN(seconds("soon")));
});

test("the answer becomes ordered lines that end where the next begins, with words spread over them", () => {
  const lines = captionLinesFrom({ language: "ar", lines: [
    { start: 5, end: 9, text: "  مرحبا   بكم " },
    { start: "0:00", end: "0:06", text: "أهلا وسهلا" },
    { start: 9, end: 8, text: "end before start" },
    { start: 130, end: 140, text: "after the video's end" },
    { start: 50, end: 60, text: "" },
  ] }, 120);
  assert.deepEqual(lines.map((l) => [l.start, l.end, l.text]), [[0, 5, "أهلا وسهلا"], [5, 9, "مرحبا بكم"], [9, 10.067, "end before start"]]);
  assert.deepEqual(lines[1].words.map((w) => w[2]), ["مرحبا", "بكم"]);
  assert.equal(lines[1].words[0][0], 5);
  assert.equal(lines[1].words.at(-1)[1], 9);
  assert.deepEqual(captionLinesFrom(null), []);
  assert.deepEqual(captionLinesFrom({ lines: "nope" }), []);
});

test("the language Gemini heard", () => {
  assert.equal(heardLanguage({ language: "AR" }), "ar");
  assert.equal(heardLanguage({ language: "es-MX" }), "es");
  assert.equal(heardLanguage({ language: "fil" }), "tl");
  assert.equal(heardLanguage({ language: "Arabic language" }), "");
});

test("captions come back from Gemini, and the tokens are counted", async () => {
  const sent = [];
  const used = [];
  const r = await geminiCaptions(VIDEO, {
    key: "k", languageName: "Arabic", onUsage: (u) => used.push(u),
    transport: async (req) => { sent.push(req); return answer({ language: "ar", lines: [{ start: 1, end: 3, text: "كيف حالك" }] }); },
  });
  assert.equal(sent.length, 1);
  assert.deepEqual([r.language, r.model, r.lines.length, r.lines[0].text], ["ar", CAPTION_MODELS[0], 1, "كيف حالك"]);
  assert.deepEqual(used, [{ model: CAPTION_MODELS[0], in: 12000, out: 800 }]);
});

test("a key that can't use the first model tries the cheaper one", async () => {
  const models = [];
  const r = await geminiCaptions(VIDEO, { key: "k", transport: async (req) => {
    models.push(req.url.match(/models\/([^:]+)/)[1]);
    return models.length === 1 ? { status: 404, text: '{"error":{"message":"models/x is not found"}}' }
      : answer({ language: "ar", lines: [{ start: 0, end: 2, text: "نعم" }] });
  } });
  assert.deepEqual(models, CAPTION_MODELS);
  assert.equal(r.model, CAPTION_MODELS[1]);
});

test("plain messages when Gemini can't make them", async () => {
  const fails = async (res, code, pattern, video = VIDEO) => {
    await assert.rejects(geminiCaptions(video, { key: "k", transport: async () => res }),
      (e) => e.code === code && pattern.test(e.message), code);
  };
  await fails({ status: 400, text: '{"error":{"message":"API key not valid. Please pass a valid API key."}}' }, "key", /rejected the API key/);
  await fails({ status: 429, text: "{}" }, "quota", /limit is reached.*8 hours/);
  await fails({ status: 400, text: '{"error":{"message":"The video is private"}}' }, "private", /only watch public YouTube videos/);
  await fails({ status: 503, text: "" }, "other", /having problems right now \(HTTP 503\)/);
  await fails(answer({ language: "ar", lines: [] }), "empty", /didn't hear any speech/);
  await fails(answer({ lines: [] }, { finishReason: "MAX_TOKENS" }), "long", /too much speech/);
  await fails({ status: 200, text: JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] }, finishReason: "SAFETY" }] }) },
    "other", /didn't send captions back \(SAFETY\)/);
  await fails(answer({}), "long", /longer than an hour/, { ...VIDEO, duration: MAX_SECONDS + 1 });
  await assert.rejects(geminiCaptions(VIDEO, { key: "k", transport: async () => { throw new Error("offline"); } }), (e) => e.code === "network");
});

test("the cost estimate grows with the video, in whole US cents", () => {
  assert.equal(captionCents(1), 1);
  assert.ok(captionCents(600) >= 4 && captionCents(600) <= 8, String(captionCents(600)));
  assert.ok(captionCents(3600) > captionCents(600));
  assert.equal(captionCents(0), captionCents(600), "an unknown length counts as ten minutes");
});
