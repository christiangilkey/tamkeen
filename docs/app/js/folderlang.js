// Vocab folders belong to the language they were made in: the Vocab page, battles and the word tools list only
// the language being learned's folders (the owner: "vocab folders should only show in the language that they
// were created in"). Pure rules, shared by the phone and web app's library (mobile/src/js/backend.js) and tested
// (tests/js/folderlang.test.mjs); the computer's are in app/db.py folder_languages and app/api/vocab.py.

/** Does folder `f` show while `lang` is being learned? One with no language (an empty folder from before
 *  folders had one) shows in every language. */
export const folderShows = (f, lang) => !f.language || f.language === lang;

/** The language a folder from before folders had one belongs to: the one most of its words are in (a word
 *  with no language is Arabic, as everything was then; a tie goes to the first code alphabetically, as on the
 *  computer). "" when none of its words are left. */
export function folderLanguageOf(uid, vocab) {
  const count = new Map();
  for (const v of vocab || []) {
    if (v.deleted || !(v.folders || []).includes(uid)) continue;
    const lang = v.language || "ar";
    count.set(lang, (count.get(lang) || 0) + 1);
  }
  const best = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return best ? best[0] : "";
}
