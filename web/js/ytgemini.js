// Captions for a YouTube video that has none, written by Google's Gemini from the video's link.
//
// YouTube's terms don't allow Tamkeen to download a video's sound to transcribe it itself. Google's
// Gemini API is allowed to watch public YouTube videos: it is given the link (not a file), so
// nothing is downloaded here. It is the learner's own Gemini key that pays (a few US cents a video).
// Pure logic (no page), shared by every version and unit-tested (tests/js/ytgemini.test.mjs); the
// popup that offers it is components/geminicaptions.js.

import { spread } from "./ytcaptions.js";

/** The model asked first (the most thorough Flash), then the cheaper one when the key can't use it. */
export const CAPTION_MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
/** Longer videos don't fit in one answer. */
export const MAX_SECONDS = 60 * 60;
// What a second of video costs at low picture quality (about 66 tokens a frame + 32 for the sound),
// and roughly what a second of speech comes back as (words, times and the answer's outline).
const IN_PER_SECOND = 100;
const OUT_PER_SECOND = 5;
// US cents per million tokens in and out (as definer.js PROVIDERS.gemini).
const PRICES = { "gemini-3.8-flash": { in: 75, out: 375 }, "gemini-3.1-flash-lite": { in: 25, out: 150 } };

export class GeminiCaptionError extends Error {
  /** `code`: "key" (the key was refused), "quota", "private", "long", "empty", "network" or "other". */
  constructor(message, code) { super(message); this.code = code; }
}

/** Roughly what captioning `seconds` of video costs with the first model, in whole US cents (at least 1). */
export function captionCents(seconds, model = CAPTION_MODELS[0]) {
  const p = PRICES[model] || PRICES[CAPTION_MODELS[0]];
  const s = Math.max(0, Number(seconds) || 0) || 600;
  return Math.max(1, Math.ceil((s * IN_PER_SECOND * p.in + s * OUT_PER_SECOND * p.out) / 1e6));
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING", description: "The spoken language as a two-letter ISO 639-1 code" },
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER", description: "Seconds from the start of the video" },
          end: { type: "NUMBER", description: "Seconds from the start of the video" },
          text: { type: "STRING" },
        },
        required: ["start", "end", "text"],
        propertyOrdering: ["start", "end", "text"],
      },
    },
  },
  required: ["language", "lines"],
  propertyOrdering: ["language", "lines"],
};

/** The instruction sent with the video. `languageName`: the language being learned (a hint only). */
export function captionPrompt(languageName = "") {
  return [
    "Transcribe everything that is spoken in this video, word for word, in the language it is spoken in. Do not translate.",
    languageName ? `The speech is probably in ${languageName}.` : "",
    "Split it into short caption lines of one phrase or sentence each (at most about 12 words), in order, covering the whole video.",
    "For each line give its start and end in seconds from the start of the video, as numbers (for example 83.5).",
    "Leave out music, sound effects and on-screen text that isn't spoken. If nothing is spoken, return no lines.",
    "Also give the spoken language as a two-letter ISO 639-1 code.",
  ].filter(Boolean).join(" ");
}

/** The generateContent request for video `id` (sent through the app's AI transport: {url, headers, body}). */
export function captionRequest({ id, key, model = CAPTION_MODELS[0], languageName = "" }) {
  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: SCHEMA,
    mediaResolution: "MEDIA_RESOLUTION_LOW", // the words are in the sound; fewer picture tokens costs less
    maxOutputTokens: 65536,
    temperature: 0,
  };
  if (!/^gemini-2/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: {
      contents: [{ role: "user", parts: [
        { file_data: { file_uri: `https://www.youtube.com/watch?v=${id}` } },
        { text: captionPrompt(languageName) },
      ] }],
      generationConfig,
    },
    timeout: 600, // (the computer's relay waits this long: a long video takes Gemini a while)
  };
}

/** "83.5", 83.5, "1:23.5" or "01:01:23" → seconds; anything else → NaN. */
export function seconds(value) {
  if (typeof value === "number") return value;
  const s = String(value ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

const round = (x) => Math.round(x * 1000) / 1000;
const tidy = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** Gemini's answer (the parsed JSON {language, lines}) → the app's caption lines, as YouTube's would
 * be: [{start, end, text, words: [[start, end, word], ...]}], in order, each ending where the next
 * begins, never past the video's end. Words are spread over their line, like a person's captions. */
export function captionLinesFrom(answer, duration = 0) {
  const limit = Number(duration) > 0 ? Number(duration) : Infinity;
  const raw = [];
  for (const l of (answer && Array.isArray(answer.lines) ? answer.lines : [])) {
    const text = tidy(l && l.text);
    let start = seconds(l && l.start);
    let end = seconds(l && l.end);
    if (!text || !Number.isFinite(start)) continue;
    start = Math.max(0, start);
    if (start >= limit) continue;
    if (!Number.isFinite(end) || end <= start) end = start + Math.max(1, text.length / 15);
    raw.push({ start, end: Math.min(end, limit), text });
  }
  raw.sort((a, b) => a.start - b.start);
  const lines = [];
  raw.forEach((line, i) => {
    const next = raw[i + 1];
    let end = next && next.start < line.end ? next.start : line.end;
    if (end <= line.start) end = Math.min(line.start + 0.5, limit);
    if (end <= line.start) return; // (two lines at the very same moment: the later one goes)
    lines.push({ start: round(line.start), end: round(end), text: line.text, words: spread(line.text, line.start, end) });
  });
  return lines;
}

/** The two-letter language Gemini heard, or "" when it gave none that looks like one. */
export function heardLanguage(answer) {
  const code = String((answer && answer.language) || "").toLowerCase().split(/[-_]/)[0];
  if (code === "fil") return "tl";
  return /^[a-z]{2,3}$/.test(code) ? code : "";
}

function failure(status, text) {
  let detail = "";
  try { const j = JSON.parse(text); detail = (j.error && (j.error.message || j.error.status)) || ""; } catch { detail = String(text || "").slice(0, 200); }
  if (status === 0) return new GeminiCaptionError("Couldn't reach Gemini. Check your internet connection.", "network");
  if (status === 401 || status === 403 || /API key/i.test(detail)) {
    return new GeminiCaptionError("Gemini (Google) rejected the API key. It has most likely expired, so you probably need a new one.", "key");
  }
  if (status === 429) {
    return new GeminiCaptionError("Gemini's limit is reached for now (its free allowance covers 8 hours of YouTube video a day). Try again later.", "quota");
  }
  if (/private|unlisted|not (publicly )?accessible|permission/i.test(detail)) {
    return new GeminiCaptionError("Gemini can only watch public YouTube videos, and this one isn't public.", "private");
  }
  if (status >= 500) return new GeminiCaptionError(`Gemini is having problems right now (HTTP ${status}). Try again.`, "other");
  return new GeminiCaptionError(`Gemini couldn't make captions (HTTP ${status})${detail ? `: ${detail}` : ""}`, "other");
}

/**
 * Ask Gemini for the captions of video `video` ({videoId, duration}). `transport(req)` sends one request
 * and resolves to {status, text} (the app's AI transport); `onUsage({model, in, out})` hears the tokens.
 * Resolves to {lines, language, model}; failures are GeminiCaptionErrors with plain messages.
 */
export async function geminiCaptions(video, { key, languageName = "", transport, onUsage = null }) {
  if (Number(video.duration) > MAX_SECONDS) {
    throw new GeminiCaptionError("This video is longer than an hour, too long for Gemini to caption in one go.", "long");
  }
  let res = null;
  let model = "";
  for (const m of CAPTION_MODELS) {
    model = m;
    try { res = await transport(captionRequest({ id: video.videoId, key, model: m, languageName })); } catch (e) {
      res = { status: 0, text: String((e && e.message) || e || "") };
    }
    // A key that can't use this model: try the next one (the model is unknown, or not open to it).
    if (res.status === 404 || (res.status === 403 && /model/i.test(res.text || "") && !/API key/i.test(res.text || ""))) continue;
    break;
  }
  if (!res || res.status < 200 || res.status >= 300) throw failure(res ? res.status : 0, res ? res.text : "");
  let data;
  try { data = JSON.parse(res.text); } catch { throw new GeminiCaptionError("Gemini sent back an answer Tamkeen couldn't read. Try again.", "other"); }
  const u = data.usageMetadata || {};
  if (onUsage) { try { onUsage({ model, in: u.promptTokenCount || 0, out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) }); } catch { /* only a count */ } }
  const cand = (data.candidates || [])[0];
  if (cand && cand.finishReason === "MAX_TOKENS") {
    throw new GeminiCaptionError("This video has too much speech for Gemini to caption in one go.", "long");
  }
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").replace(/^```(?:json)?\s*|\s*```$/g, "");
  let answer;
  try { answer = JSON.parse(text); } catch {
    const why = cand && cand.finishReason && cand.finishReason !== "STOP" ? ` (${cand.finishReason})` : "";
    throw new GeminiCaptionError(`Gemini didn't send captions back${why}. Try again.`, "other");
  }
  const lines = captionLinesFrom(answer, video.duration);
  if (!lines.length) throw new GeminiCaptionError("Gemini didn't hear any speech in this video.", "empty");
  return { lines, language: heardLanguage(answer), model };
}
