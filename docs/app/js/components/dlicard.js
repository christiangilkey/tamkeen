// Settings → Languages → "DLI students": "I'm a DLI student" (the Defense Language Institute). Ticked,
// it asks which language is studied there (one of seven) and the password that unlocks that language's
// material (dli.js: only a hash of the password is in the app). The answers follow the learner to their
// other devices (aikeys.js). Unticking locks it again after an in-app yes/no box; what was added to the
// library meanwhile, such as a podcast, stays. On the computer and the phone.

import { h, saveSettings, state, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { studyLanguage } from "../languages.js";
import { DLI_LANGUAGES, checkPassword, contentKey, dliLanguageName, dliState } from "../dli.js";
import { runDli } from "../dlicontent.js";
import { learningList, setLearning, switchTo } from "./langswitch.js";
import { confirmBox } from "./modal.js";

/** Where the material shows: Library → Courses → DLI (pages/library.js). */
export const DLI_PLACE = "#/library?show=courses&tab=dli";

const settings = () => (state.status && state.status.settings) || {};

/** Offer to add the DLI language to the languages being learned (never without asking). */
async function offerLanguage(code) {
  const name = t(dliLanguageName(code));
  if (!(await confirmBox(t("Add {0} to the languages you're learning?", name),
    t("Your DLI content shows in Library → Courses while you study {0}. You switch languages at the top of the screen.", name),
    { ok: t("Add {0}", name) }))) return false;
  await setLearning(code, true);
  return true;
}

/** The card. Appends it to `body`; returns a cleanup function. */
export function dliCard(body) {
  const card = h(`<section class="card set-card stack dli-card" data-find="dli">
    <h2>DLI students</h2>
    <label class="check dli-student"><input type="checkbox">
      <span><span class="dli-student-title">I'm a DLI student</span><span class="small muted dli-sub">Defense Language Institute</span></span></label>
    <div class="dli-more stack" hidden>
      <div class="dli-part">
        <h3 id="dli-lang-q">Which language are you studying at DLI?</h3>
        <p class="set-hint">Changing it swaps which DLI content you see. Anything already added to your library, such as a podcast, stays.</p>
        <div class="dli-chips" role="radiogroup" aria-labelledby="dli-lang-q">${DLI_LANGUAGES.map(([code, name]) =>
          `<button type="button" class="dli-chip" role="radio" aria-checked="false" data-v="${code}">${name}</button>`).join("")}</div>
        <p class="small dli-notlearning" hidden><span></span> <button type="button" class="link dli-addlang"></button></p>
      </div>
      <form class="dli-part dli-pass" hidden>
        <h3><label for="dli-pw">Password</label></h3>
        <p class="set-hint">Enter the DLI password to unlock the content for your language.</p>
        <p class="small dli-arabic" hidden>For DLI Arabic students: podcasts are added to your Library with every episode already transcribed.</p>
        <div class="dli-pw-row"><input type="password" id="dli-pw" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button type="submit" class="primary dli-unlock">Unlock</button></div>
        <p class="small dli-wrong" role="alert" hidden>That password isn't right.</p>
      </form>
      <div class="dli-part dli-open" hidden>
        <div class="set-state"><span class="dli-lock">${icon("lock", 18)}</span><strong>Unlocked.</strong><span class="dli-where"></span></div>
        <p class="small dli-arabic" hidden>For DLI Arabic students: podcasts are added to your Library with every episode already transcribed.</p>
        <div class="set-actions"><a class="btn primary dli-go" href="${DLI_PLACE}">Open DLI content</a></div>
      </div>
    </div>
  </section>`);
  body.append(card);
  const $ = (q) => card.querySelector(q);
  const box = $(".dli-student input");
  const pw = $("#dli-pw");
  let busy = false;

  function paint() {
    const s = settings(), st = dliState(s);
    const learning = learningList(s);
    box.checked = st.student;
    $(".dli-more").hidden = !st.student;
    for (const b of card.querySelectorAll(".dli-chip")) {
      const on = b.dataset.v === st.language;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    }
    const name = st.language ? t(dliLanguageName(st.language)) : "";
    const missing = !!st.language && !learning.includes(st.language);
    $(".dli-notlearning").hidden = !missing;
    if (missing) {
      $(".dli-notlearning span").textContent = t("{0} isn't one of the languages you're learning yet.", name);
      $(".dli-addlang").textContent = t("Add {0}", name);
    }
    $(".dli-pass").hidden = st.unlocked;
    $(".dli-open").hidden = !st.unlocked;
    for (const el of card.querySelectorAll(".dli-arabic")) el.hidden = st.language !== "ar";
    if (st.unlocked) {
      $(".dli-where").textContent = !st.language ? t("Choose your DLI language above to see its content.")
        : studyLanguage() === st.language ? t("Your DLI content is in Library → Courses → DLI.")
        : t("Your DLI content is in Library → Courses → DLI, while you're studying {0}.", name);
      $(".dli-go").hidden = !st.language || missing;
    }
  }

  box.onchange = async () => {
    if (busy) return;
    const st = dliState(settings());
    if (!box.checked && st.unlocked) {
      box.checked = true; // (until it is answered)
      if (!(await confirmBox(t("Lock the DLI content?"),
        t("It is hidden again on all your devices until the password is entered. Anything already added to your library, such as a podcast, stays."),
        { ok: t("Lock"), danger: true }))) return;
      box.checked = false;
    }
    busy = true;
    try {
      await saveSettings(box.checked ? { dli_student: "on" } : { dli_student: "", dli_key: "" });
    } catch (e) { toast(e.message, { error: true }); } finally { busy = false; }
    paint();
    if (box.checked) (dliState(settings()).language ? pw : card.querySelector(".dli-chip")).focus();
  };

  for (const b of card.querySelectorAll(".dli-chip")) {
    b.onclick = async () => {
      const code = b.dataset.v;
      if (busy || dliState(settings()).language === code) return;
      busy = true;
      try { await saveSettings({ dli_language: code }); } catch (e) { toast(e.message, { error: true }); busy = false; return; }
      busy = false;
      paint();
      if (!learningList(settings()).includes(code)) { await offerLanguage(code); paint(); }
      if (dliState(settings()).ready) runDli().then(paint);
    };
  }
  $(".dli-addlang").onclick = async () => {
    const code = dliState(settings()).language;
    if (code) { await setLearning(code, true); paint(); }
  };
  // Opening the content while studying another of the learner's languages switches to the DLI one first.
  $(".dli-go").onclick = async (e) => {
    const code = dliState(settings()).language;
    if (!code || studyLanguage() === code) return;
    e.preventDefault();
    await switchTo(code);
    location.hash = DLI_PLACE;
  };

  $(".dli-pass").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const typed = pw.value;
    const button = $(".dli-unlock");
    const wrong = $(".dli-wrong");
    wrong.hidden = true;
    if (!typed.trim()) { pw.focus(); return; }
    busy = true;
    button.disabled = true;
    button.textContent = t("Checking…");
    try {
      if (!(await checkPassword(typed))) {
        wrong.hidden = false;
        pw.focus();
        pw.select();
        return;
      }
      const key = await contentKey(typed);
      pw.value = "";
      await saveSettings({ dli_student: "on", dli_key: key });
      paint();
      if (dliState(settings()).ready) runDli().then(paint);
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = t("Unlock");
    }
  };
  pw.oninput = () => { $(".dli-wrong").hidden = true; };

  paint();
  return () => {};
}

// ---------- looks (added once; plain solid surfaces, like the rest of Settings) ----------
if (typeof document !== "undefined" && !document.getElementById("dli-css")) {
  const style = document.createElement("style");
  style.id = "dli-css";
  style.textContent = `
    .dli-sub { display: block; margin-top: 2px; }
    .dli-student-title { font-weight: 600; }
    .dli-student input { accent-color: var(--accent); width: 18px; height: 18px; flex: none; }
    .dli-more[hidden], .dli-part[hidden], .dli-card [hidden] { display: none; }
    .dli-part { border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .dli-part h3, .dli-part .set-hint { margin: 0; }
    .dli-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
    .dli-chip { min-height: 44px; border-radius: 12px; font-weight: 600; }
    .dli-chip.on, .dli-chip.on:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .dli-card button.link { display: inline; min-height: 0; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-weight: 650; white-space: normal; }
    .dli-card button.link:hover:not(:disabled) { background: none; text-decoration: underline; }
    .dli-pw-row { display: flex; gap: 8px; }
    .dli-pw-row input { flex: 1; min-width: 0; min-height: 44px; font-size: 16px; }
    .dli-pw-row button { min-height: 44px; flex: none; }
    .dli-wrong { color: var(--danger); margin: 0; }
    .dli-lock { display: inline-flex; color: var(--accent); }
    .dli-where { flex: 1 1 100%; color: var(--muted); font-size: 14px; }
    .dli-open .set-actions { margin-top: 2px; justify-content: center; }
    .dli-open .dli-go { min-width: 220px; justify-content: center; }
  `;
  document.head.append(style);
}
