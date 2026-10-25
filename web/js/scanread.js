// "Add words" → Scan: a photo made ready and read (components/wordscan.js). Every version has it.
// The photo stays in memory only: it is never saved, kept or synced. With AI it goes, made smaller,
// to the learner's own AI provider and nowhere else; on this device it never leaves it.

import { askAi } from "./define-service.js";
import { SCRIPTS, parseList } from "./addwords.js";
import { AI_SIDE, JPEG_QUALITY, OCR_SIDE, THUMB_SIDE, fitSize, markOddOnes, ocrList, readScan, readingScore, scanPrompt,
  worthAnotherLook } from "./scanwords.js";
import { readText } from "./ocr.js";

/** A picture the learner chose, took or pasted, decoded: {img, width, height}. The phone's way up
 * (from the photo's own record of how the camera was held) is applied by the browser. */
export async function openPicture(file) {
  const picture = file && (/^image\//.test(file.type || "") || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || ""));
  if (!picture) throw new Error("That isn't a picture. Choose a photo (JPEG or PNG).");
  // createImageBitmap where the device has it (it also works while the app is in the background);
  // otherwise an <img>.
  let source = null, w = 0, h = 0, url = "";
  if (typeof createImageBitmap === "function") {
    try {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
      w = source.width;
      h = source.height;
    } catch { source = null; }
  }
  try {
    if (!source) {
      url = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This picture can't be opened here (it may be in a format this device doesn't read, such as HEIC). Take or choose it as a JPEG or PNG."));
        img.src = url;
      });
      w = source.naturalWidth;
      h = source.naturalHeight;
    }
    if (!w || !h) throw new Error("This picture is empty.");
    // Drawn once, no bigger than either reader needs, so the original can go at once.
    const { width, height } = fitSize(w, h, Math.max(OCR_SIDE, AI_SIDE));
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    full.getContext("2d").drawImage(source, 0, 0, width, height);
    return { img: full, width, height };
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (source && typeof source.close === "function") source.close();
  }
}

/** The picture at most `max` pixels on its longest side, on a canvas; grey for reading on the device. */
export function scaled(pic, max, { grey = false } = {}) {
  const { width, height } = fitSize(pic.width, pic.height, max);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  if (grey) ctx.filter = "grayscale(1)";
  ctx.fillStyle = "#fff";  // (a see-through PNG reads as black text on white)
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(pic.img, 0, 0, width, height);
  return c;
}

const jpeg = (canvas, quality = JPEG_QUALITY) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The photo couldn't be prepared."))), "image/jpeg", quality);
});

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A copy to show above what was found, small, and big when tapped (to compare with the list): an
 * object address in memory, let go of when "Add words" closes. */
export async function previewCopy(pic) {
  return URL.createObjectURL(await jpeg(scaled(pic, THUMB_SIDE), 0.85));
}

/** Read the photo with the learner's AI: {cards, total, cut} (scanwords.js readScan). `study` is
 * the language's name in English. */
export async function readWithAi(pic, { study }) {
  const data = await base64(await jpeg(scaled(pic, AI_SIDE)));
  const answer = await askAi({ ...scanPrompt({ study }), images: [{ mime: "image/jpeg", data }], maxTokens: 12000 });
  return readScan(answer);
}

/** Read the photo on this device (Tesseract): {cards, total, cut, text} (the text is the list as it
 * would be pasted). A card with a word that was hard to read has `doubt` (the list says "check it").
 * `pair` is "es+en" (ocr.js). */
export async function readOnDevice(pic, { pair, lang, zhScript = "", onProgress = () => {} }) {
  const page = scaled(pic, OCR_SIDE, { grey: true });
  let lines = ocrList(await readText(page, pair, { zhScript, onProgress }));
  // Short of the language being learned: the page again, as one block of text, then (for a language
  // with its own script) as one column of lines; the reading with the most of it is kept
  // (scanwords.js worthAnotherLook). When the first found nothing at all, a shadow or a pattern can
  // look like letters read these ways: then only lines it is sure of, word for word, count.
  const strict = lines.length ? {} : { minConfidence: 70, minWord: 75 };
  const passes = ["6", ...(SCRIPTS[lang] ? ["4"] : [])];
  for (const psm of passes) {
    if (!worthAnotherLook(lines, lang)) break;
    const again = ocrList(await readText(page, pair, { zhScript, psm, onProgress: (f, what) => onProgress(f, what, true) }), strict);
    if (readingScore(again, lang) > readingScore(lines, lang)) lines = again;
  }
  const text = lines.map((l) => l.text).join("\n");
  const list = parseList(text, { lang });
  // (one card a line: parseList skips only lines with no word, and every line here has letters)
  if (list.total === lines.length) list.cards.forEach((c, i) => { if (lines[i].doubt) c.doubt = true; });
  markOddOnes(list.cards, lang);
  return { ...list, text };
}
