// Settings → Contact (the owner's wish, 2026-11-16): a way to send SGT Gilkey a problem or a question. The buttons
// open the learner's own email with the address, a subject and the app's version and device filled in; nothing is
// sent by Tamkeen itself. The address is shown too, with a Copy button, for a device with no email app set up.
// Shared by the computer's Settings (web/js/pages/settings.js) and the phones' and web app's
// (mobile/src/js/pages/settings.js).

import { h, toast } from "../app.js";
import { t } from "../i18n.js";

export const CONTACT_EMAIL = "christiangilkey@gmail.com";
export const CONTACT_NAME = "SGT Gilkey, MLI UAD";

/** A mailto: link with `subject` and `body` (English: the email is to the developer). */
export function mailto(subject, body) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The email's first lines: which Tamkeen, then room to write. `kind`: "problem" or "question". */
export function mailBody(kind, { version = "", device = "" } = {}) {
  const about = `Tamkeen ${version || "(version unknown)"} on ${device || "(device unknown)"}`;
  return kind === "problem"
    ? `${about}\n\nWhat happened:\n\n\nWhat I did just before:\n\n`
    : `${about}\n\n`;
}

/** The Contact card. `version`: the app's version; `device`: "a Windows computer", "Android", "iPhone", "the web app"…
 * `outside`: open the links outside the page (the computer's window hands target=_blank links to the system, which
 * opens the email program; a phone's web view and a browser open mailto: links by themselves). */
export function contactCard({ version = "", device = "", outside = false } = {}) {
  const el = h(`<section class="card set-card stack" data-find="contact">
    <h2>Contact</h2>
    <p class="set-hint">Found a problem, or have a question or an idea? Write to SGT Gilkey, MLI UAD, who makes Tamkeen.</p>
    <div class="row">
      <a class="btn primary contact-problem">Report a problem</a>
      <a class="btn contact-question">Ask a question</a>
    </div>
    <div class="row contact-address"><span class="contact-mail" translate="no"></span><span class="spacer"></span>
      <button type="button" class="ghost contact-copy">Copy</button></div>
    <p class="small muted">Your message goes from your own email. For a problem, say what you did just before it happened: it helps to find it.</p>
  </section>`);
  el.querySelector(".contact-mail").textContent = CONTACT_EMAIL;
  el.querySelector(".contact-problem").href = mailto("Tamkeen: a problem", mailBody("problem", { version, device }));
  el.querySelector(".contact-question").href = mailto("Tamkeen: a question", mailBody("question", { version, device }));
  if (outside) for (const a of el.querySelectorAll("a.btn")) { a.target = "_blank"; a.rel = "noopener"; }
  el.querySelector(".contact-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(CONTACT_EMAIL); toast(t("Email address copied")); }
    catch { toast(CONTACT_EMAIL); }  // (no clipboard: at least show it)
  };
  return el;
}
