// The review card's "Mnemonic maker": five words or short phrases in the learner's own language
// that SOUND like the word being learned, to hang a memory on (the keyword method). The learner
// copies the one they like into My notes and builds a picture around it.
//
// The words come from the learner's own AI: the provider, key and model of their word lookups,
// asked through the same route a lookup takes on this device (`askAi` in define-service.js, which
// review.js hands in, so this file stays free of the page and can be tested on its own).
// Nothing is stored: the card keeps what came back until the reviewer is closed.

export const MNEMONIC_COUNT = 5;

/** The shape of the answer. */
export const MNEMONIC_SCHEMA = {
  type: "object",
  properties: {
    items: { type: "array", items: { type: "string" }, description: `Exactly ${MNEMONIC_COUNT} words or short phrases.` },
  },
  required: ["items"],
  additionalProperties: false,
};

/**
 * The question for the AI. `study` and `speaks` are language names in English ("Arabic", "Spanish");
 * `avoid` lists what was suggested before, so asking again brings new ones.
 */
export function mnemonicPrompt({ word, meaning = "", study = "Arabic", speaks = "English", avoid = [] }) {
  const system = `You help language learners make sound-alike mnemonics (the keyword method). Given a ${study} word, you suggest words or short phrases in ${speaks} that SOUND like it when said aloud: similar syllables and sounds, the closer the better. Each one must be real, natural ${speaks}, written in the usual ${speaks} script, and at most four words long. Where you can, prefer ones that also suggest a picture linked to the word's meaning, but the sound comes first. Never translate the word and never repeat it. Return only the JSON object.`;
  const user = [
    `${study} word: ${word}`,
    meaning ? `Its meaning: ${meaning}` : "",
    avoid.length ? `Already suggested, so give different ones: ${avoid.join("; ")}` : "",
    `Give ${MNEMONIC_COUNT} sound-alikes in ${speaks}.`,
  ].filter(Boolean).join("\n");
  return { system, user, schema: MNEMONIC_SCHEMA };
}

/** The answer's suggestions, tidied: numbering and quote marks off, no repeats, never the word itself. */
export function cleanItems(answer, word = "") {
  const list = Array.isArray(answer && answer.items) ? answer.items : [];
  const out = [];
  for (const raw of list) {
    const text = String(raw ?? "")
      .replace(/^\s*(?:\d+[.)]|[-•*])\s*/u, "")
      .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/gu, "")
      .trim()
      .slice(0, 80);
    if (!text || text === String(word).trim() || out.some((x) => x.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length === MNEMONIC_COUNT) break;
  }
  return out;
}

/**
 * Five sound-alikes for word `v` ({text, meaning}). `ask(prompt)` sends the question to the AI and
 * resolves to its JSON answer; `study` and `speaks` name the two languages.
 */
export async function soundAlikes(v, { ask, study, speaks, avoid = [] }) {
  const items = cleanItems(await ask(mnemonicPrompt({ word: v.text, meaning: v.meaning, study, speaks, avoid })), v.text);
  if (!items.length) throw new Error("No sound-alikes came back. Try again.");
  return items;
}
