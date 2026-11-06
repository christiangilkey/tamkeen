// Block, report and "delete my online account" for the online features. The rules themselves are
// in the online database (supabase/v8-safety.sql), the calls in social.js and safety.js. Shared by
// the Friends page, the chat and Settings → Account & sync → Friends & sharing, on every version.
//
// Against an online database older than v8 every action answers with what to do instead
// (NotReadyError's message, shown as a toast), and nothing else changes.

import { h, toast, showMenu } from "../app.js";
import * as social from "../social.js";
import { confirmBox, openModal } from "./modal.js";
import { avatar } from "./avatar.js";
import { icon } from "../icons.js";

/** The ⋯ menu for a person ({id, username}): Block (or Unblock) and Report.
 * `onChange()` runs after they are blocked or unblocked. */
export function personMenu(x, y, person, { blocked = false, onChange = () => {} } = {}) {
  showMenu(x, y, `@${person.username}`, [
    blocked
      ? { label: "Unblock", run: async () => { if (await unblockPerson(person)) onChange(); } }
      : { label: "Block", run: async () => { if (await blockPerson(person)) onChange(); } },
    { label: "Report…", run: () => reportPerson(person, { onChange }) },
  ]);
}

/** A round ⋯ button that opens personMenu under itself. `options` may be a function, asked at
 * the moment of the click (so it can say whether they are blocked by then). */
export function moreButton(person, options = {}) {
  const b = h(`<button type="button" class="row-act more-act">${icon("more", 18)}</button>`);
  b.title = "Block or report";
  b.setAttribute("aria-label", "Block or report");
  b.onclick = (e) => {
    e.stopPropagation();
    const r = b.getBoundingClientRect();
    personMenu(r.left, r.bottom + 4, person, typeof options === "function" ? options() : options);
  };
  return b;
}

/** Call `run(x, y)` when `el` is held down (touch) or right-clicked (mouse). */
export function onHold(el, run) {
  let timer = 0;
  let from = null;
  let lastRun = 0;
  const fire = (x, y) => {
    if (Date.now() - lastRun < 800) return; // a long press can also send a right-click: once is enough
    lastRun = Date.now();
    run(x, y);
  };
  const stop = () => { clearTimeout(timer); timer = 0; from = null; };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    stop();
    from = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { const at = from; stop(); if (at) fire(at.x, at.y); }, 550);
  });
  el.addEventListener("pointermove", (e) => {
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) stop();
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, stop);
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    stop();
    fire(e.clientX, e.clientY);
  });
}

/** Ask, then block. Resolves to true when they were blocked. */
export async function blockPerson(person) {
  const name = person.username;
  const ok = await confirmBox(`Block ${name}?`,
    `${name} won't be able to message you, send you friend requests, see your card or when you're online, or challenge you, and you'll stop being friends. They aren't told. In a guild you share, your names still show. You can unblock them in Settings → Account & sync → Friends & sharing.`,
    { ok: "Block", danger: true });
  if (!ok) return false;
  try {
    await social.blockUser(person.id);
    toast(`You blocked ${name}.`);
    return true;
  } catch (e) {
    toast(e.message, { error: true });
    return false;
  }
}

/** Unblock (no question: nothing is lost). Resolves to true when it worked. */
export async function unblockPerson(person) {
  try {
    await social.unblockUser(person.id);
    toast(`You unblocked ${person.username}. You can add each other as friends again.`);
    return true;
  } catch (e) {
    toast(e.message, { error: true });
    return false;
  }
}

/** The report form: what is wrong, a note, and "also block". With `messageId`, it reports that
 * message (the online service keeps a copy of it, since messages disappear). */
export function reportPerson(person, { messageId = null, onChange = () => {} } = {}) {
  const m = openModal({ title: messageId ? "Report this message" : `Report ${person.username}` });
  const body = h(`<div class="report-form">
    <p class="muted"></p>
    <div class="report-reasons" role="radiogroup"></div>
    <textarea class="report-note" maxlength="1000" rows="3" placeholder="Anything else we should know? (optional)"></textarea>
    <label class="report-block"><input type="checkbox"> <span></span></label>
    <p class="small muted">If someone is in danger right now, call your local emergency number (911 in the US).</p>
    <div class="confirm-buttons"><button type="button" class="ghost">Cancel</button>
      <button type="button" class="primary" disabled>Send report</button></div>
  </div>`);
  body.querySelector("p").textContent = messageId
    ? "What's wrong with it? Your report goes to the Tamkeen team, with a copy of the message."
    : "What's wrong? Your report goes to the Tamkeen team.";
  body.querySelector(".report-block span").textContent = `Also block ${person.username}`;
  const list = body.querySelector(".report-reasons");
  const send = body.querySelector("button.primary");
  for (const [id, label] of social.REPORT_REASONS) {
    const row = h(`<label class="report-reason"><input type="radio" name="report-reason"> <span></span></label>`);
    row.querySelector("input").value = id;
    row.querySelector("span").textContent = label;
    row.querySelector("input").onchange = () => { send.disabled = false; };
    list.append(row);
  }
  body.querySelector("button.ghost").onclick = () => m.close();
  send.onclick = async () => {
    const reason = (list.querySelector("input:checked") || {}).value;
    if (!reason) return;
    send.disabled = true;
    send.textContent = "Sending…";
    try {
      await social.reportUser(person.id, { reason, note: body.querySelector(".report-note").value.trim(), messageId });
    } catch (e) {
      toast(e.message, { error: true });
      send.disabled = false;
      send.textContent = "Send report";
      return;
    }
    const alsoBlock = body.querySelector(".report-block input").checked;
    if (alsoBlock) {
      try { await social.blockUser(person.id); } catch (e) { toast(e.message, { error: true }); }
    }
    m.close();
    toast(social.REPORT_THANKS);
    if (alsoBlock) onChange();
  };
  m.body.append(body);
}

/** Settings: the people I blocked, each with Unblock. Hidden while the online service can't block yet. */
export function blockedSection() {
  const el = h(`<div class="blocked-people" hidden>
    <h3 class="set-sub">Blocked people</h3>
    <div class="blocked-list"></div>
  </div>`);
  const box = el.querySelector(".blocked-list");
  const paint = async () => {
    let list = null;
    try { list = await social.blockedPeople(); } catch { list = null; }
    if (!list) { el.hidden = true; return; }
    el.hidden = false;
    box.innerHTML = "";
    if (!list.length) {
      box.append(h(`<p class="small muted">You haven't blocked anyone. To block someone, use ⋯ next to their name on the Friends page, or in a chat.</p>`));
      return;
    }
    for (const p of list) {
      const person = { id: p.user_id, username: p.username || "(no username)", avatar_path: p.avatar_path };
      const row = h(`<div class="blocked-row"><span class="blocked-lead"></span><span class="blocked-name"></span>
        <span class="spacer"></span><button type="button" class="ghost">Unblock</button></div>`);
      row.querySelector(".blocked-lead").append(avatar(person, { online: null }));
      row.querySelector(".blocked-name").textContent = `@${person.username}`;
      row.querySelector("button").onclick = async (e) => {
        e.target.disabled = true;
        if (await unblockPerson(person)) paint(); else e.target.disabled = false;
      };
      box.append(row);
    }
  };
  paint();
  return el;
}

/** "Delete my online account": say exactly what goes and what stays, then do it. `done()` runs
 * once the account is gone (this device is signed out of the online features by then). */
export function deleteAccountBox(done = () => {}) {
  const m = openModal({ title: "Delete your online account?" });
  const body = h(`<div class="delete-account">
    <p>This deletes, for good, from Tamkeen's online service:</p>
    <ul class="delete-list">
      <li>your username and profile photo</li>
      <li>your friends and friend requests</li>
      <li>your messages, voice notes and everything you sent</li>
      <li>your "What I'm studying" card and online status</li>
      <li>your creature game team, battles and gifts</li>
      <li>your guild memberships, and the list of people you blocked</li>
    </ul>
    <p class="small muted">Guilds and shared folders you founded pass to their longest-standing member. Words you added
      to someone else's shared folder stay there, without your name. Reports you sent stay with us, without your name.</p>
    <p class="small muted">Your library, your words and your settings, on your devices and in your Google Drive, are not
      touched. You can connect again later, as a new account.</p>
    <div class="confirm-buttons"><button type="button" class="ghost">Cancel</button>
      <button type="button" class="danger-solid">Delete my account</button></div>
  </div>`);
  const go = body.querySelector(".danger-solid");
  body.querySelector(".ghost").onclick = () => m.close();
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = "Deleting…";
    try {
      await social.deleteMyAccount();
    } catch (e) {
      toast(e.message, { error: true });
      go.disabled = false;
      go.textContent = "Delete my account";
      return;
    }
    m.close();
    toast("Your online account has been deleted.");
    done();
  };
  m.body.append(body);
}
