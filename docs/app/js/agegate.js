// The age check for Tamkeen's online features (Friends, chat, guilds, usernames, sending things): the only
// features where Tamkeen's own online service (Supabase) keeps personal data. The owner's rule (2026-11-06):
// 16 or older everywhere. Younger learners use everything else as usual, with nothing collected.
//
// Asked once, neutrally (month and year of birth, nothing filled in, no hint of the "right" answer), and kept
// in the synced setting `online_from` so another device doesn't ask again: "" not asked yet, "ok" 16 or older,
// "YYYY-MM" the month the learner turns 16. The birth date itself is not kept, and none of it goes online.

export const ONLINE_MIN_AGE = 16;

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The `online_from` value for a birth month and year (month 1–12) on date `now`. During the birth month
 *  itself the birthday may not have come yet, so that month still counts as younger (the safe side). */
export function onlineFrom(year, month, now = new Date()) {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 1900 || y > now.getFullYear()) return "";
  const turns = `${y + ONLINE_MIN_AGE}-${String(m).padStart(2, "0")}`; // the month of the 16th birthday
  return turns < ym(now) ? "ok" : turns;
}

/** "ok" (may use the online features), "young" (not yet) or "ask" (not asked yet), from the setting. */
export function onlineAge(value, now = new Date()) {
  const v = String(value || "");
  if (v === "ok") return "ok";
  if (!/^\d{4}-\d{2}$/.test(v)) return "ask";
  return v < ym(now) ? "ok" : "young";
}

/** When a younger learner can use the online features, in words ("June 2028"). */
export function opensOn(value) {
  const [y, m] = String(value || "").split("-").map(Number);
  if (!y || !m) return "";
  const after = new Date(y, m, 1); // the month after the birthday month (see onlineFrom)
  return after.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const settingsNow = async () => {
  const { state } = await import("./app.js");
  return (state.status && state.status.settings) || {};
};

/** The learner's status for the online features, from the synced settings. */
export async function onlineStatus() {
  return onlineAge((await settingsNow()).online_from);
}

/** The words shown to a learner under 16 (where Friends would be). */
export function youngNote(value) {
  const when = opensOn(value);
  return `Friends, chat and guilds open when you turn ${ONLINE_MIN_AGE}${when ? ` (${when})` : ""}. Everything else in Tamkeen works as usual.`;
}

/**
 * Before connecting to the online features: true when the learner may. Asks the month and year of birth the
 * first time (and saves the answer, so it isn't asked again); says when Friends opens for a younger learner.
 */
export async function requireOnlineAge() {
  const status = await onlineStatus();
  if (status === "ok") return true;
  const { openModal } = await import("./components/modal.js");
  const { h, saveSettings } = await import("./app.js");
  if (status === "young") {
    const box = openModal({ title: "Friends & chat" });
    box.body.append(h(`<p></p>`));
    box.body.firstChild.textContent = youngNote((await settingsNow()).online_from);
    const ok = h(`<div class="row" style="justify-content:flex-end"><button type="button" class="primary">OK</button></div>`);
    ok.querySelector("button").onclick = box.close;
    box.body.append(ok);
    return false;
  }
  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" }));
  return new Promise((resolve) => {
    let answered = false;
    const box = openModal({ title: "Your date of birth", onClose: () => { if (!answered) resolve(false); } });
    box.body.append(h(`<form class="stack" id="age-form">
      <p>Before you go online with Friends, chat and guilds, please enter your month and year of birth.</p>
      <div class="row">
        <select id="age-month" aria-label="Month"><option value="">Month</option>${months.map((m, i) => `<option value="${i + 1}"></option>`).join("")}</select>
        <select id="age-year" aria-label="Year"><option value="">Year</option>${Array.from({ length: 110 }, (_, i) => `<option>${year - i}</option>`).join("")}</select>
      </div>
      <p class="small muted">Tamkeen keeps only whether you can use the online features, on your own devices and Drive, not your date of birth.</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="ghost" id="age-cancel">Cancel</button>
        <button type="submit" class="primary" id="age-ok" disabled>Continue</button></div>
    </form>`));
    const $ = (q) => box.body.querySelector(q);
    $("#age-month").querySelectorAll("option[value]:not([value=''])").forEach((o, i) => { o.textContent = months[i]; });
    const ready = () => { $("#age-ok").disabled = !onlineFrom($("#age-year").value, $("#age-month").value); };
    $("#age-month").onchange = ready;
    $("#age-year").onchange = ready;
    $("#age-cancel").onclick = box.close;
    $("#age-form").onsubmit = async (e) => {
      e.preventDefault();
      const value = onlineFrom($("#age-year").value, $("#age-month").value);
      if (!value) return;
      answered = true;
      try { await saveSettings({ online_from: value }); } catch { /* not saved: asked again next time */ }
      box.close();
      if (value === "ok") { resolve(true); return; }
      resolve(await requireOnlineAge()); // shows when Friends opens
    };
  });
}
