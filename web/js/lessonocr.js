// A scanned page of a lesson (a PDF page with no text in it) read on the device with Tesseract, the reader "Add
// words" → Scan already uses (ocr.js; Apache-2.0, downloaded once on demand like the dictionaries). The lesson's
// language is read together with English, since DLI handouts give their instructions in English. Every line is
// kept (Scan keeps only the language being learned; a lesson needs its questions and instructions too).

import { OCR_LANGS } from "./scanwords.js";

/** The pair Tesseract reads a lesson in `lang` with: "ar+en", or "en". */
export const lessonOcrPair = (lang) => (OCR_LANGS[lang] && lang !== "en" ? `${lang}+en` : OCR_LANGS[lang] ? lang : "en");

/** Tesseract's text with its lines tidied: no empty runs, no lines of one stray mark. */
export function tidyOcr(text) {
  const out = [];
  for (const raw of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/[ \t ]+/g, " ").trim();
    if (!line) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
    if (/^[\p{P}\p{S}\s]{1,2}$/u.test(line)) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** Read a drawn page (a canvas). The reader's files are fetched the first time. */
export async function ocrPage(canvas, lang) {
  const { downloadOcr, ocrStatus, readText } = await import("./ocr.js");
  const pair = lessonOcrPair(lang);
  const st = await ocrStatus(pair).catch(() => null);
  if (!st || !st.installed) await downloadOcr(pair);
  const data = await readText(canvas, pair, { psm: "3" });
  return tidyOcr(data && data.text);
}
