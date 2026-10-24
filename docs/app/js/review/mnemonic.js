// The review card's "Mnemonic maker": five words or short phrases in the learner's own language
// that SOUND like the word being learned and, as far as possible, point to its MEANING too, to hang a
// memory on (the keyword method). They must be real words of the learner's language, never the word's
// sounds spelled out ("nah-wee-yah"): the owner, on suggestions like "now-ee-ah", asked for words of the
// learner's language that "BOTH sound like the word and also be as closely related to the meaning as
// possible". The learner copies the one they like into Personal notes and builds a picture around it.
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
  const system = `You help language learners remember words with the keyword method. Given a ${study} word, you suggest keywords: real ${speaks} words or short phrases (at most four words) that BOTH
1. SOUND like the ${study} word when said aloud: similar syllables and sounds, the closer the better; and
2. are as closely linked to the word's meaning as possible, so that the sound and the meaning lead to the same picture.
Look hardest for ones that do both. When no real ${speaks} word does both, keep the sound and choose the one whose picture best suggests the meaning.
Every suggestion must be made of words that really exist in ${speaks} and that a ${speaks} speaker knows (dictionary words, everyday phrases, well-known names), in the usual ${speaks} spelling and script. Never spell out the ${study} word's sounds (like "nah-wee-yah" or "now ee ah"), never invent words, never add notes like "sounds like", never translate the word and never repeat it.
Before answering, check each one: is it real ${speaks}, does it sound like the word, and does it point to the meaning? Replace any that fail. Return only the JSON object.`;
  const user = [
    `${study} word: ${word}`,
    meaning ? `Its meaning: ${meaning}` : "",
    avoid.length ? `Already suggested, so give different ones: ${avoid.join("; ")}` : "",
    `Give ${MNEMONIC_COUNT} keywords: real ${speaks} words or phrases that sound like it${meaning ? " and are as close to its meaning as possible" : ""}.`,
  ].filter(Boolean).join("\n");
  return { system, user, schema: MNEMONIC_SCHEMA };
}

/** Not a keyword but the word's sounds written out ("now-ee-ah", "nah-wee-yah") or a note about one
 * ("Nawiyah sounds like"): the model was asked for neither, and neither is a word the learner knows. */
export function spelledOut(text) {
  const s = String(text || "").trim();
  if (/\bsounds? (?:a bit |a little )?like\b/i.test(s)) return true;
  return /^\p{L}{1,4}(?:-\p{L}{1,4}){2,}$/u.test(s);  // three or more short syllables joined by hyphens
}

/** The answer's suggestions, tidied: numbering and quote marks off, no repeats, never the word itself,
 * nothing spelled out (spelledOut). */
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
    if (spelledOut(text)) continue;  // the word's sounds spelled out, or a note: not a word of the learner's language
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
