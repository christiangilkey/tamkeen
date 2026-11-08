// Settings → Word definitions → "Example sentences and memory tricks": for each, who makes them, Free
// (Tamkeen itself, on the device, no AI) or AI (the learner's own key), and a "How it works" button that
// explains the free way, and what the AI does instead. Kept in `sentence_source` and `mnemonic_source`
// (helpersource.js); the review card, the Vocab card and Add words read them. On the computer and the phone.

import { h, state, saveSettings } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { aiMakes, aiUsableFrom, chosenSource } from "../helpersource.js";
import { readPrefs } from "../review/freemnemonic.js";
import { learnsOwn } from "../review/ownmnemonic.js";

const SETUP = "#/settings?s=words&show=mode";

const KINDS = {
  sentence: {
    find: 'data-find="sentencesource"',
    title: () => t("Example sentences"),
    about: () => t("The sentence on each card that shows the word in use, with its translation."),
    free: () => t("Free: real sentences"),
    ai: () => t("AI writes them"),
    freeNote: () => t("Real sentences that use the word, found on this device. Free, and works offline."),
    aiNote: () => t("Your AI writes a new sentence for each word, with its translation."),
    howTitle: () => t("How the free example sentences work"),
    how: () => [
      [t("Where the sentences come from"), t("Tamkeen downloads a collection of real sentences for the language you are learning, once (0.1 to 4 MB). They come from Tatoeba, a shared collection of sentences translated by volunteers, and from the usage examples in Wiktionary, each with its English translation.")],
      [t("How one is chosen"), t("For each card, Tamkeen looks for sentences that use the word in any of its forms. It prefers one that fits the meaning you saved and is not too long, and above all one where every other word is a word you have already met, so you can read it. Then it says: “Every other word in this sentence is one you know.”")],
      [t("Dialects"), t("Learning Arabic with a dialect course chosen in Library → Courses, the sentences come from that dialect where there are any.")],
      [t("Private and free"), t("It all happens on your device: nothing is sent anywhere and nothing is paid. After the download it works offline.")],
      [t("Its limits"), t("It can only find sentences that exist: a rare word may have none, and then the card has no sentence until you write one. The translations are in English.")],
      [t("With AI instead"), t("Your AI writes a new short sentence for the word, at your level, with a translation in your own language. It works for any word, needs your AI key and costs a fraction of a cent.")],
    ],
  },
  mnemonic: {
    find: 'data-find="mnemonicsource"',
    title: () => t("Mnemonic maker"),
    about: () => t("Memory tricks: a word that sounds like the new word, with a picture that links it to the meaning."),
    free: () => t("Free: sound-alike finder"),
    ai: () => t("AI writes them"),
    freeNote: () => t("Sound-alike words found on this device. Free, and works offline."),
    aiNote: () => t("Your AI suggests the sound-alike words and writes the pictures."),
    howTitle: () => t("How the free Mnemonic maker works"),
    how: () => [
      [t("The idea"), t("The keyword method: link the new word to a word you already know that sounds like it, and picture the two together. Spanish pato, “duck”: picture a duck balanced on top of a POT.")],
      [t("Finding words that really sound alike"), t("Tamkeen breaks the new word into its speech sounds, from Wiktionary's pronunciation or the language's spelling rules. It compares them with the sounds of every word in an English pronunciation dictionary, giving extra weight to the stressed syllable, so only true sound-alikes get through. Long words also get keywords of two or three words.")],
      [t("Which ones come first"), t("A keyword that also fits the meaning comes first, marked “Fits the meaning” or “Related in meaning” (German Hund, “dog”: HOUND). Then come things that are easy to picture, such as animals, tools and food. Each keyword gets a picture line that joins it to the meaning.")],
      [t("In your language"), t("With the app in Spanish, French, German, Italian, Portuguese, Russian or Catalan, the keywords are words of that language.")],
      [t("It learns your taste"), t("Each time you press Use or thumbs down, it learns a little about the keywords you like, and a little more from the mnemonics you write yourself, on all your devices. “Forget it” under the Mnemonic maker here starts again.")],
      [t("Your own mnemonics"), t("When you write a mnemonic in Memorization notes, put the sound-alike word in CAPITALS: in “a duck sitting on a POT” it learns from POT. Only words in capitals count, and only when they really sound like the word; the rest of the note is ignored. A sound-alike of yours can come back for other words that sound like it, marked “You've used this before”. When your AI makes the mnemonics, a few of your own are sent to it as examples of your style. “Learn from my own mnemonics” here turns this off.")],
      [t("Private and free"), t("It all happens on your device, with a 0.15 MB download the first time: nothing is sent anywhere and nothing is paid.")],
      [t("With AI instead"), t("Your AI suggests keywords and writes the pictures, using the model and thinking level under More options. It can be more inventive, but sometimes suggests words that don't really sound alike. It needs your AI key, and each press costs about a cent or less.")],
    ],
  },
};

/** Shows how one free helper works, in a box over the page. */
export async function explainFreeHelper(kind) {
  const k = KINDS[kind];
  if (!k) return;
  const { openModal } = await import("./modal.js");
  const box = openModal({ title: k.howTitle() });
  box.body.classList.add("helper-how");
  for (const [head, text] of k.how()) {
    const part = h(`<div class="helper-how-part"><strong></strong><p></p></div>`);
    part.querySelector("strong").textContent = head;
    part.querySelector("p").textContent = text;
    box.body.append(part);
  }
}

/** The card. Appends it to `body`; returns a cleanup function. */
export function freeHelpersCard(body) {
  const card = h(`<section class="card stack helper-card">
    <h2></h2><span class="small muted"></span></section>`);
  card.querySelector("h2").textContent = t("Example sentences and memory tricks");
  card.querySelector(".small").textContent = t("Who makes them: Tamkeen itself, free on your device, or your AI.");
  const settings = () => (state.status && state.status.settings) || {};
  const rows = {};
  for (const [kind, k] of Object.entries(KINDS)) {
    const row = h(`<div class="helper-row" ${k.find}>
      <div class="helper-head"><strong></strong>
        <button type="button" class="ghost helper-how-btn">${icon("question", 18)}<span></span></button></div>
      <div class="small muted helper-about"></div>
      <div class="segmented helper-seg" role="radiogroup">
        <button type="button" class="seg-btn" role="radio" data-v="free"></button>
        <button type="button" class="seg-btn" role="radio" data-v="ai"></button></div>
      <div class="small muted helper-note" role="status"></div>
      ${kind === "mnemonic" ? `<label class="check helper-own" data-find="mnemonicown"><input type="checkbox" role="switch">
        <span><span class="helper-own-title"></span><span class="small muted helper-own-note"></span></span></label>
      <div class="small muted helper-taste" hidden><span></span> <button type="button" class="link">${t("Forget it")}</button></div>` : ""}</div>`);
    row.querySelector("strong").textContent = k.title();
    row.querySelector(".helper-how-btn span").textContent = t("How it works");
    row.querySelector(".helper-about").textContent = k.about();
    row.querySelector(".helper-seg").setAttribute("aria-label", k.title());
    row.querySelector('[data-v="free"]').textContent = k.free();
    row.querySelector('[data-v="ai"]').textContent = k.ai();
    row.querySelector(".helper-how-btn").onclick = () => explainFreeHelper(kind);
    for (const b of row.querySelectorAll(".seg-btn")) {
      b.onclick = async () => {
        await saveSettings({ [`${kind}_source`]: b.dataset.v });
        paint();
      };
    }
    // ("Forget it": the whole setting goes, so the weights, the learner's own sound-alikes and their example
    // notes for the AI are all forgotten together; aisetup.js's Forget it does the same)
    const taste = row.querySelector(".helper-taste button");
    if (taste) taste.onclick = async () => { await saveSettings({ mnemonic_prefs: "" }); paint(); };
    // "Learn from my own mnemonics" (review/ownmnemonic.js): the synced setting mnemonic_learn_own, on unless "off".
    const own = row.querySelector(".helper-own input");
    if (own) {
      row.querySelector(".helper-own-title").textContent = t("Learn from my own mnemonics");
      own.onchange = async () => { await saveSettings({ mnemonic_learn_own: own.checked ? "on" : "off" }); paint(); };
    }
    rows[kind] = row;
    card.append(row);
  }
  function paint() {
    const s = settings(), usable = aiUsableFrom(s);
    for (const [kind, k] of Object.entries(KINDS)) {
      const row = rows[kind], chosen = chosenSource(s, kind);
      // what will happen: the choice, or (not chosen) the AI when it can be used
      const v = chosen || (usable ? "ai" : "free");
      for (const b of row.querySelectorAll(".seg-btn")) {
        const on = b.dataset.v === v;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      }
      const note = row.querySelector(".helper-note");
      note.textContent = v === "free" ? k.freeNote() : k.aiNote();
      if (v === "ai" && !usable) {
        note.textContent = t("AI is off, or has no key yet, so the free way is used for now.") + " ";
        const go = h(`<a class="link"></a>`);
        go.href = SETUP;
        go.textContent = t("Set up AI");
        note.append(go);
      }
    }
    // learning from the learner's own mnemonics: only the words in CAPITALS (and, with AI, a few go to it)
    const on = learnsOwn(s), mine = rows.mnemonic.querySelector(".helper-own input");
    mine.checked = on;
    const aiNow = aiMakes(s, "mnemonic", usable);
    rows.mnemonic.querySelector(".helper-own-note").textContent = t("Only words in CAPITALS count: in “a duck sitting on a POT” it learns from POT. The rest of the note is ignored.")
      + (on && aiNow ? ` ${t("A few of your own mnemonics are sent to your AI as examples of your style.")}` : "");
    // what the free Mnemonic maker has learned from Use and thumbs down (and the learner's own notes), and forgetting it
    const learned = readPrefs(s.mnemonic_prefs), n = learned.n;
    const taste = rows.mnemonic.querySelector(".helper-taste");
    taste.hidden = !n && !learned.o.length && !learned.x.length;
    taste.querySelector("span").textContent = n === 1 ? t("The free Mnemonic maker has learned from 1 of your choices.")
      : t("The free Mnemonic maker has learned from {0} of your choices.", n);
  }
  paint();
  // The AI card above can turn AI off or add a key: paint again after any change in Settings.
  const again = () => setTimeout(paint, 300);
  body.addEventListener("change", again);
  body.addEventListener("click", again);
  body.append(card);
  return () => { body.removeEventListener("change", again); body.removeEventListener("click", again); };
}
