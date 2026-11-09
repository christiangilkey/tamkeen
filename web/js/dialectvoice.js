// Arabic dialect words said by a voice of their own dialect (Settings → Card voices, cardvoice.js). Pure:
// tests/js/dialectvoice.test.mjs runs it as it is.
//
// Azure has a neural voice for many Arab countries, and each speaks its country's Arabic: an Egyptian
// voice reading an Egyptian word says it the Cairo way, where a Saudi voice would say it like Standard
// Arabic. So a card whose word is known to be dialect is said by that dialect's voice:
//   - a word from a dialect's basics course (its source: "Iraqi basics · word 12");
//   - else, for a word whose kind of Arabic isn't known (typed in, saved from a web page or a video),
//     the dialect the learner chose in Library → Courses (voiceplay.js), as "Add words" and the free
//     example sentences already do (examples.js courseDialect).
// The word's own dialect decides, not one setting: someone learning Iraqi and Levantine hears each word
// in its own. A grammar lesson's examples are said in its course's dialect (saytext.js).
//
// Azure's Iraqi voices skip the letters گ (the Baghdad g) and چ (ch) without a sound. Given the word's
// sound in IPA (<phoneme>), Bassel says g and ch (tools/course/build_course.py "ipa", where it was tested;
// HANDOFF "Iraqi Arabic course"). So every text sent to an Iraqi voice has its words with those letters
// said from IPA (iraqiSsml): the Iraqi course's own hand-checked list first, else worked out from the
// word's vowel marks; a word with too few marks to tell gets ق / ك, the letters those sounds come from,
// which every voice says. Other Arabic voices get ق / ك too (standardGch).

/** Each dialect's Azure voice, and the countries whose voices speak it. The voice is the one its basics
 * course was recorded with (docs/course/ar-<d>/course.json), so a card voiced later sounds like the rest
 * of the course. Levantine is Syrian (Damascus) by default; a learner who picked Lebanon or Jordan for
 * YouTube's "Popular in" hears that country's voice. Iraqi is Bassel: Azure's other Iraqi voice, Rana,
 * says the Baghdad g as j. Moroccan has none: Azure's Moroccan voices read Darija like Standard Arabic
 * (tools/course/ar-mor/README.md), so Moroccan words keep the learner's usual Arabic voice. */
export const DIALECT_VOICES = {
  lev: { voice: "ar-SY-AmanyNeural", countries: ["SY", "LB", "JO"] },
  egy: { voice: "ar-EG-SalmaNeural", countries: ["EG"] },
  irq: { voice: "ar-IQ-BasselNeural", countries: ["IQ"] },
  glf: { voice: "ar-SA-HamedNeural", countries: ["SA", "AE", "KW", "QA", "BH", "OM"] },
};

/** The Azure voice for an Arabic word of `dialect` ("lev", "egy", "irq", "glf"), or null when the dialect
 * has none (Moroccan, Standard Arabic ""). A voice the learner picked (`picked`, a voice name) is kept when
 * it is from one of the dialect's countries; else the country the learner picked (`country`, "LB") when it
 * is one of them (`byCountry`: country -> voice); else the dialect's own voice. */
export function dialectVoice(dialect, { picked = "", country = "", byCountry = {} } = {}) {
  const d = DIALECT_VOICES[dialect];
  if (!d) return null;
  const from = (name) => String(name || "").split("-")[1] || "";
  if (picked && d.countries.includes(from(picked))) return picked;
  const c = String(country || "").toUpperCase();
  if (d.countries.includes(c) && byCountry[c] && from(byCountry[c]) === c) return byCountry[c];
  return d.voice;
}

/** The basics courses' titles (docs/course/<id>/course.json "title"), which start a course card's source
 * ("Levantine basics · word 13": coursedata.js cardOf), and the kind of Arabic each teaches ("" = Standard). */
export const COURSE_TITLES = {
  "Arabic basics": "", "Levantine basics": "lev", "Egyptian basics": "egy", "Gulf Arabic basics": "glf",
  "Moroccan basics": "mor", "Iraqi basics": "irq",
};

/** The kind of Arabic card `v` is known to be in, from where it came: a dialect's id ("irq"), "" for
 * Standard Arabic (the Arabic basics course, a DLI Arabic deck: dli.js deckSource), or null when that isn't
 * known (a word typed in, or saved from a web page, a video, a podcast). Not Arabic: "". */
export function dialectOfCard(v) {
  if (!v || (v.language && v.language !== "ar")) return "";
  const src = String(v.episode_title || v.source || "");
  const m = /^(.+?) · word \d{1,6}$/.exec(src);
  if (m && Object.prototype.hasOwnProperty.call(COURSE_TITLES, m[1])) return COURSE_TITLES[m[1]];
  if (src.startsWith("DLI Arabic · ")) return "";
  return null;
}

// ---------------------------------------------------------------- the Iraqi g and ch

const UNSAID = /[گچ]/;
const MARKS = /[ً-ٰٟـ]/g; // vowel marks, shadda, sukun, dagger alef; tatweel
/** A word as the Iraqi course's sound list writes it: without vowel marks. */
export const plainWord = (word) => String(word).replace(MARKS, "");

/** گ and چ as ق and ك, for a voice that would leave them out (any Arabic voice but an Iraqi one fed IPA,
 * and the device's own voices). Persian (fa) has these letters of its own: left alone. */
export const standardGch = (text, lang = "ar") => (lang === "ar" ? String(text).replace(/گ/g, "ق").replace(/چ/g, "ك") : String(text));

/** How Azure's Iraqi voice says each word with گ or چ: tools/course/ar-irq/sounds.tsv, hand-checked with a
 * phoneme recogniser (tests/js/dialectvoice.test.mjs keeps the two the same). Word without vowel marks: IPA. */
export const IRAQI_IPA = {
  "چاي": "tʃaːj", "هيچ": "hiːtʃ", "تحچي": "tiħtʃi", "شگد": "ʃgadd", "للسوگ": "lissuːg", "حچى": "ħitʃa", "أحچي": "aħtʃi",
  "باچر": "baːtʃir", "ومرگ": "wimarag", "گعدنا": "gʕadna", "چا": "tʃaː", "ذيچ": "ðiːtʃ", "جگارة": "dʒigaːra",
  "تريگ": "trajjagg", "تريگت": "trajjagit", "وگيمر": "wiggeːmar", "طرگاعة": "tˤirgaːʕa", "خاشوگة": "xaːʃuːgga",
  "الخاشوگة": "ilxaːʃuːga", "وگعت": "wugʕat", "مگطوع": "maggtˤuːʕ", "بنچر": "pantʃar", "اگعد": "ʔugʕud",
  "دوشگ": "doːʃagg", "بالگاع": "bilgaːʕ", "چطل": "tʃatˤal", "وخاشوگة": "wixaːʃuːgga", "مگرود": "magruːd",
  "عگروگ": "ʕagruːgg", "بالحديگة": "bilħadiːgga", "چرخ": "tʃarix", "چول": "tʃoːl",
};

const FATHA = "َ", DAMMA = "ُ", KASRA = "ِ", SHADDA = "ّ", SUKUN = "ْ";
const SHORT = { [FATHA]: "a", [KASRA]: "i", [DAMMA]: "u", "ً": "an", "ٍ": "in", "ٌ": "un", "ٰ": "aː" };
// Baghdad speech: ض is said like ظ; ق stays q (the courses write the Iraqi g as گ).
const CONSONANT = {
  "ء": "ʔ", "أ": "ʔ", "إ": "ʔ", "ؤ": "ʔ", "ئ": "ʔ", "ب": "b", "پ": "p", "ت": "t", "ث": "θ", "ج": "dʒ", "ح": "ħ", "خ": "x",
  "د": "d", "ذ": "ð", "ر": "r", "ز": "z", "س": "s", "ش": "ʃ", "ص": "sˤ", "ض": "ðˤ", "ط": "tˤ", "ظ": "ðˤ", "ع": "ʕ", "غ": "ɣ",
  "ف": "f", "ڤ": "v", "ق": "q", "ك": "k", "گ": "g", "چ": "tʃ", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "j",
};
const VOWEL_SOUND = /[aeiouː]/;

/**
 * A fully vowelled Iraqi word's sound in IPA, the way the Iraqi course's list writes it (plain g, tʃ, long
 * vowels with ː, ay/aw as eː/oː, the article as "il-", a g after a vowel at the end of the word or before
 * another consonant said double, a word starting with a vowel given ʔ: the voice dropped those otherwise).
 * Null when the word lacks the vowel marks to tell (every letter but the last, a long vowel, an alef or the
 * article needs one) or has a letter it doesn't know: the caller then falls back to ق / ك.
 */
export function iraqiIpa(word) {
  const units = [];
  for (const ch of String(word).replace(/ـ/g, "").normalize("NFC")) {
    if (/[ً-ٰٟ]/.test(ch)) { if (units.length) units[units.length - 1].marks += ch; continue; }
    units.push({ letter: ch, marks: "" });
  }
  if (!units.length) return null;
  const vowelOf = (m) => { for (const c of m) if (SHORT[c]) return c; return ""; };
  let out = "";
  let lastShort = ""; // the short vowel just said ("a", "i", "u"), which a following long-vowel letter lengthens
  const said = (s, short = "") => { out += s; lastShort = short; };
  for (let i = 0; i < units.length; i++) {
    const { letter, marks } = units[i];
    const last = i === units.length - 1;
    const v = vowelOf(marks), doubled = marks.includes(SHADDA), still = marks.includes(SUKUN);
    if (letter === "ا") {
      if (i === 0) {
        const next = units[1], after = units[2];
        if (v) { said(`ʔ${SHORT[v]}`, SHORT[v]); continue; }
        if (next && next.letter === "ل" && !vowelOf(next.marks)) {   // the article: il-, or i- + a doubled sun letter
          said("ʔi", "i");
          if (after && after.marks.includes(SHADDA)) i++;           // (the ل isn't said: الشّمس = iʃʃams)
          continue;
        }
        said("ʔi", "i");
        continue;
      }
      if (lastShort === "a") { out = `${out.slice(0, -1)}aː`; lastShort = ""; }
      else if (v) said(SHORT[v], SHORT[v]);
      continue; // (an alef after another vowel, or the silent one of وِانْتَ)
    }
    if (letter === "آ") { said("ʔaː"); continue; }
    if (letter === "ل" && !marks && units[i + 1] && units[i + 1].marks.includes(SHADDA)) continue; // (لِلسُّوگ: the ل melts into the س)
    if (letter === "ى") { if (lastShort === "a") lastShort = ""; else said("a"); continue; }
    if (letter === "ة") {
      if (v && v !== FATHA) said(`t${SHORT[v]}`, SHORT[v]);
      else if (v === FATHA) said("ta", "a");
      else if (lastShort !== "a") said("a");
      else lastShort = "";
      continue;
    }
    if ((letter === "و" || letter === "ي") && !v && !doubled && i > 0) {
      // ū, ī; and ay, aw said ē, ō inside a word (بَيْت bēt), but not at its end (گَالَوْا gālaw)
      const end = units.slice(i + 1).every((u) => u.letter === "ا" && !u.marks);
      const long = letter === "و" ? { u: "uː", a: end ? "" : "oː" } : { i: "iː", a: end ? "" : "eː" };
      if (long[lastShort]) { out = out.slice(0, -1) + long[lastShort]; lastShort = ""; continue; }
    }
    const c = CONSONANT[letter];
    if (!c) return null;
    if (!v && !still && !last) return null;                         // not vowelled enough to tell
    said(doubled ? c[0] + c : c, v ? SHORT[v] : "");
    if (v) out += SHORT[v];
  }
  // A long vowel at the end of a word of two syllables or more is said short (تِحْچِي tiħtʃi, گْعَدْنَا gʕadna).
  const vowels = out.match(/[aeiou]/g) || [];
  if (vowels.length > 1) out = out.replace(/([aiu])ː$/, "$1");
  // A g at the end of the word, after a vowel: gg (said once, the voice dropped it).
  out = out.replace(/([aeiouː])g$/, "$1gg");
  if (VOWEL_SOUND.test(out[0] || "")) out = `ʔ${out}`;
  return out || null;
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const WORD = /[ء-ٰٟ-ۓ]+/g; // Arabic letters and marks (not its comma or question mark)

/** The sound of an Iraqi word with گ or چ, in IPA: the course's list, else from its vowel marks; or null. */
export const iraqiSound = (word) => IRAQI_IPA[plainWord(word)] || iraqiIpa(word);

/** `text` as the inside of SSML for Azure's Iraqi voice: escaped, each word with گ or چ said from its IPA
 * (iraqiSound), or with ق / ك when its sound can't be told. */
export function iraqiSsml(text) {
  const s = String(text ?? "");
  let out = "", last = 0;
  for (const m of s.matchAll(WORD)) {
    const token = m[0];
    out += xml(s.slice(last, m.index));
    const ipa = UNSAID.test(token) ? iraqiSound(token) : null;
    out += ipa ? `<phoneme alphabet="ipa" ph="${xml(ipa)}">${xml(token)}</phoneme>` : xml(UNSAID.test(token) ? standardGch(token) : token);
    last = m.index + token.length;
  }
  return out + xml(s.slice(last));
}

/** `text` as the inside of SSML for `voice` (a voice name, "ar-IQ-BasselNeural"): an Iraqi voice gets the
 * Iraqi g and ch in IPA, any other Arabic voice ق / ك for them, every other voice the text as it is. */
export function voiceSsmlText(text, voice) {
  const v = String(voice || "");
  if (/^ar-IQ-/i.test(v)) return iraqiSsml(text);
  return xml(/^ar-/i.test(v) ? standardGch(text) : String(text ?? ""));
}
