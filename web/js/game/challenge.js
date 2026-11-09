// Folder challenges between friends. The owner (2026-11-09): "Users learning the same language should be able to
// challenge another player to a specific folder that they'll both use".
//
// The challenger picks a friend who studies the same language (their game profile says which) and one of their own
// folders with at least MIN_SET words that have a meaning. The folder's words go to the friend in a chat message, like
// any shared folder (friends only, the messages' own rules; social.sendChallenge marks it as a challenge). Each of
// them then battles the other's team with exactly those words, and each result reaches the other in the battle inbox
// with the folder's name. Nothing new online: the words travel as a share always could.
//
// Pure: no DOM, no network (the tests use it as it is).

import { MIN_SET, quizzable } from "./rules.js";

export const CHALLENGE_MIN = MIN_SET;   // words with a meaning a folder needs (as for battles from one folder)
export const CHALLENGE_MAX = 500;       // words one challenge carries (a share's limit)

const key = (s) => String(s || "").normalize("NFC").trim().toLowerCase();

/** May I challenge this friend on a folder: do we both study `language`? (`profile`: their checked game profile.) */
export const canChallenge = (profile, language) => !!language && !!profile && typeof profile.language === "string" && profile.language === language;

/** One of my folders' words as they travel: text, meaning, the example sentence; nothing else (no notes, no audio). */
export function folderWords(vocab, folderUid) {
  return quizzable(vocab).filter((v) => Array.isArray(v.folders) && v.folders.includes(folderUid)).slice(0, CHALLENGE_MAX)
    .map((v) => ({ text: String(v.text).slice(0, 300), meaning: String(v.meaning).slice(0, 2000), sentence: String(v.sentence || "").slice(0, 2000) }));
}

/** The words a challenge battle asks, for one player: their own copy of a word when they have it (so its progress
 * counts as in any battle), else the word as it came, its uid marked `challenge:` (the flashcards never see it). Words
 * without a meaning, and repeats, are left out. */
export function challengeWords(words, vocab) {
  const mine = new Map(quizzable(vocab).map((v) => [key(v.text), v]));
  const out = [];
  const seen = new Set();
  for (const w of Array.isArray(words) ? words : []) {
    const k = key(w && w.text);
    if (!k || seen.has(k) || !String((w && w.meaning) || "").trim()) continue;
    seen.add(k);
    out.push(mine.get(k) || { uid: `challenge:${k}`, text: String(w.text), meaning: String(w.meaning), sentence: String(w.sentence || ""), challenge: true });
    if (out.length >= CHALLENGE_MAX) break;
  }
  return out;
}

/** A word that came with a challenge and isn't the player's own (its answers aren't kept). */
export const isChallengeWord = (uid) => String(uid || "").startsWith("challenge:");

/** A challenge message's payload, checked (it came from another device): { folder, words, language } or null. */
export function readChallenge(payload) {
  if (!payload || typeof payload !== "object" || !payload.challenge || typeof payload.challenge !== "object") return null;
  const words = Array.isArray(payload.words) ? payload.words.filter((w) => w && typeof w.text === "string" && typeof w.meaning === "string") : [];
  if (!words.length) return null;
  const language = typeof payload.challenge.language === "string" ? payload.challenge.language.slice(0, 12) : "";
  return { folder: typeof payload.folder === "string" ? payload.folder.slice(0, 80) : "", words: words.slice(0, CHALLENGE_MAX), language };
}
