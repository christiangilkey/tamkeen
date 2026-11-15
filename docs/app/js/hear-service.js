// Phone and web app glue for hearing the learner (Library → Conversation): a spoken message is written
// down by the online transcription service the learner set up (Settings → Listening & transcripts), with
// their own key. Without one there is nothing here that can do it: the conversation says so and points to
// the keyboard's own microphone instead.
// (The computer has its own version of this file, which uses its transcription model.)

import { STT_PROVIDERS, parseTranscription, sttConfig } from "./stt.js";
import { postAudio } from "./transcribe-service.js";
import { settings } from "./store.js";

/** Can a spoken message be written down here, and where: {can, local, provider}. */
export function hearInfo() {
  const cfg = sttConfig(settings);
  const can = !!cfg.key && !cfg.blocked;
  return { can, local: false, provider: can ? STT_PROVIDERS[cfg.provider].label : "" };
}

/** Write down what was said in `blob` (a recording), in language `lang`: {text, local}. */
export async function hear(blob, lang) {
  const cfg = sttConfig(settings);
  const type = String(blob.type || "audio/webm").split(";")[0];
  const ext = /mp4|m4a|aac/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : "webm";
  // (A "slow down" from the service is waited out for a few seconds only: someone is waiting to speak.)
  const data = await postAudio(cfg, { bytes: blob, name: `say.${ext}`, type, language: lang || "" }, { longestWait: 15 });
  const { segments } = parseTranscription(data);
  return { text: segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim(), local: false };
}
