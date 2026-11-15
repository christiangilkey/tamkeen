// Desktop glue for hearing the learner (Library → Conversation): a spoken message goes to this computer's
// own server, which writes it down with the same engine as the transcripts (app/api/system.py stt_say).
// With a transcription model on the computer, the voice never leaves it.
// (The phone and the web app have their own version of this file, which uses the online service.)

import { api, state } from "./app.js";
import { STT_PROVIDERS, sttConfig } from "./stt.js";

/** Can a spoken message be written down here, and where: {can, local, provider}. `local`: on this
 * device, nothing sent anywhere; otherwise `provider` is the online service's name. */
export function hearInfo() {
  const cfg = sttConfig((state.status && state.status.settings) || {});
  return { can: true, local: !cfg.on, provider: cfg.on ? STT_PROVIDERS[cfg.provider].label : "" };
}

/** Write down what was said in `blob` (a recording), in language `lang`: {text, local}. */
export async function hear(blob, lang) {
  const r = await api(`/stt/say?lang=${encodeURIComponent(lang || "")}`, { method: "POST", raw: blob });
  return { text: String((r && r.text) || "").trim(), local: !!(r && r.local) };
}
