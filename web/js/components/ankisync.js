// The two-way Anki sync as the screens show it, the same on the computer and the phone:
// the panel in Settings, the line of review progress on a word, and the question asked the
// first time deleting a word would also delete its Anki card.
//
// The sync itself is not here. On the computer the add-on inside Anki runs it (web/anki-addon/,
// app/anki_bridge.py); on the phone anki-droid.js runs it with AnkiDroid. Both answer the same
// requests: /anki/sync/status, /anki/sync/options, /anki/sync/resolve, /anki/progress, /anki/linked/<uid>.

import { api, esc, h, on, platform, toast } from "../app.js";

const phone = () => platform === "android";
const anki = () => (phone() ? "AnkiDroid" : "Anki");

function when(ts) {
  if (!ts) return "never";
  const s = Math.round(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts * 1000).toLocaleString();
}

const tally = (c) => `${c.added} added, ${c.changed} changed, ${c.removed} removed`;
const names = (words) => {
  const shown = words.slice(0, 8).map((w) => `<strong dir="auto">${esc(w.text)}</strong>`).join(", ");
  return words.length > 8 ? `${shown} and ${words.length - 8} more` : shown;
};

/** Draws the sync's part of Settings into `box`. Returns a function that stops it listening. */
export function ankiSyncPanel(box) {
  box.innerHTML = `
    <label class="check"><input type="checkbox" class="as-on">
      <span>Keep my saved words and my ${anki()} deck in step, both ways</span></label>
    <p class="small muted">Only the one deck named below is ever read or changed: your other decks, notes and cards are never
      touched. New words, edits and deletions travel both ways. A card you make by hand in that deck becomes a word here.
      Each card's review progress is shown on the Vocab page; Tamkeen never changes ${anki()}'s schedule, a card's picture, or the card layout.</p>
    <div class="row">Deck: <input type="text" class="as-deck" maxlength="100" style="flex:1;min-width:120px">
      <button type="button" class="as-deck-save">Save name</button></div>
    <div class="as-state stack"></div>`;
  const $ = (q) => box.querySelector(q);
  let current = null;

  const ask = (path, body) => api(path, { method: "POST", body }).then(paint, (e) => toast(e.message, { error: true }));
  $(".as-on").onchange = (e) => ask("/anki/sync/options", { enabled: e.target.checked }).then(() => {
    if (e.target.checked && phone()) ask("/anki/sync/run", { ask: true });
  });
  $(".as-deck-save").onclick = () => {
    const deck = $(".as-deck").value.trim();
    if (!deck) return toast("Give the deck a name.", { error: true });
    ask("/anki/sync/options", { deck }).then(() => toast(`Syncing with the deck “${deck}”.`));
  };

  function paint(st) {
    if (!st || !box.isConnected) return;
    current = st;
    $(".as-on").checked = st.enabled;
    if (document.activeElement !== $(".as-deck")) $(".as-deck").value = st.deck;
    const out = $(".as-state");
    if (!st.enabled) {
      out.innerHTML = phone() ? "" : `<p class="small muted">Switching this on needs the add-on below (version 2 or later) installed in Anki.</p>`;
      return;
    }
    const parts = [];
    if (st.problem) parts.push(`<p class="small" style="color:var(--danger)">${esc(st.problem)}</p>`);
    parts.push(`<p class="small ${st.problem ? "muted" : ""}">Last synced ${when(st.last_sync)}${st.linked ? ` · ${st.linked} words have a card in the deck` : ""}
      <br>Sent to ${anki()}: ${tally(st.last.to_anki)}<br>Received from ${anki()}: ${tally(st.last.to_tamkeen)}
      ${st.last_change && st.last_change.at !== st.last_sync ? `<br><span class="muted">Last sync that changed anything (${when(st.last_change.at)}): sent ${tally(st.last_change.to_anki)}; received ${tally(st.last_change.to_tamkeen)}</span>` : ""}</p>`);
    if (st.other) {
      parts.push(`<div class="card stack"><p class="small"><strong>${anki()} has a different collection open</strong>${st.other.profile ? ` (profile “${esc(st.other.profile)}”)` : ""}
        than the one Tamkeen is linked to${st.profile ? ` (“${esc(st.profile)}”)` : ""}. Nothing has been read from it or written to it.</p>
        <div class="row"><button type="button" data-what="collection" data-choice="adopt">Sync with this collection instead</button></div></div>`);
    }
    if (st.held.length && st.delete_ok) {
      parts.push(`<p class="small">${st.held.length === 1 ? "One card" : `${st.held.length} cards`} (${names(st.held)}) will be removed from ${anki()} at the next sync.</p>`);
    } else if (st.held.length) {
      parts.push(`<div class="card stack"><p class="small"><strong>${st.held.length === 1 ? "A word you deleted here still has" : `${st.held.length} words you deleted here still have`} a card in ${anki()}:</strong>
        ${names(st.held)}. Removing a card from ${anki()} also removes its review history there. <strong>This cannot be undone.</strong>
        If you agree, later deletions will remove their cards without asking again.</p>
        <div class="row"><button type="button" class="danger" data-what="held" data-choice="delete">Remove ${st.held.length === 1 ? "the card" : "these cards"} from ${anki()}</button>
        <button type="button" class="ghost" data-what="held" data-choice="restore">Keep ${st.held.length === 1 ? "the card" : "the cards"} and bring ${st.held.length === 1 ? "the word" : "the words"} back</button></div></div>`);
    }
    if (st.missing.length) {
      parts.push(`<div class="card stack"><p class="small"><strong>${st.missing.length === 1 ? "A card has" : `${st.missing.length} cards have`} gone from the deck:</strong>
        ${names(st.missing)}. ${phone() ? "AnkiDroid does not tell other apps what was deleted" : "Anki has no record that you deleted them here (they may have been deleted on another device, or the collection was restored)"},
        so Tamkeen has not removed anything. What should happen to ${st.missing.length === 1 ? "this word" : "these words"}?</p>
        <div class="row"><button type="button" data-what="missing" data-choice="recreate">Make the ${st.missing.length === 1 ? "card" : "cards"} again</button>
        <button type="button" class="ghost danger" data-what="missing" data-choice="remove">Delete ${st.missing.length === 1 ? "the word" : "the words"} here too</button></div></div>`);
    }
    const notes = [];
    if (st.moved) notes.push(`${st.moved} of your words' cards are in another deck now: they are left where you put them and no longer synced.`);
    if (st.duplicates) notes.push(`${st.duplicates} extra cards of words that already have one were tagged “tamkeen-duplicate” and left alone for you to look at.`);
    if (st.skipped) notes.push(`${st.skipped} notes in the deck were left out (no Front and Back fields, nothing written on them, or one of their cards is in another deck).`);
    if (st.failed) notes.push(`${st.failed} changes could not be made last time and will be tried again.`);
    if (st.schedules === false) notes.push("This version of AnkiDroid does not tell other apps about review progress. Update AnkiDroid to 2.24 or later to see it here.");
    if (notes.length) parts.push(`<p class="small muted">${notes.map(esc).join("<br>")}</p>`);
    parts.push(phone()
      ? `<div class="row"><button type="button" class="as-run" ${st.busy ? "disabled" : ""}>${st.busy ? "Syncing…" : "Sync now"}</button>
          <span class="small muted">Also syncs when you open the app and every few minutes while it is open.</span></div>`
      : `<p class="small muted">Anki syncs with Tamkeen when you open it, every 10 minutes while it is open, after Anki's own sync, and
          whenever you choose <em>Tools → Sync Tamkeen now</em> in Anki. Tamkeen has to be open too.</p>`);
    out.innerHTML = parts.join("");
    for (const b of out.querySelectorAll("button[data-what]")) {
      b.onclick = () => ask("/anki/sync/resolve", { what: b.dataset.what, choice: b.dataset.choice }).then(() => {
        if (phone()) ask("/anki/sync/run", { ask: false });
      });
    }
    const run = out.querySelector(".as-run");
    if (run) run.onclick = () => { run.disabled = true; run.textContent = "Syncing…"; ask("/anki/sync/run", { ask: true }); };
  }

  const refresh = () => api("/anki/sync/status").then(paint, () => {});
  refresh();
  return on("anki", refresh);
}

// ----- on the Vocab page -----

/** Each word's review progress in Anki by uid, as last read ({} when there is none, or no sync). */
export async function loadAnkiProgress() {
  try { return await api("/anki/progress"); } catch { return {}; }
}

/** One line saying how a word is doing in Anki, or "" when it has no card there. Read-only. */
export function ankiProgressLine(p) {
  if (!p) return "";
  const parts = [];
  if (p.state === "new") parts.push("not studied yet");
  else if (p.state === "suspended") parts.push("suspended");
  else {
    if (p.due) {
      const days = Math.round((new Date(`${p.due}T00:00`) - new Date(new Date().toDateString())) / 86400000);
      parts.push(days < 0 ? `overdue since ${new Date(`${p.due}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : days === 0 ? "due today" : days === 1 ? "due tomorrow"
        : `due ${new Date(`${p.due}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: days > 300 ? "numeric" : undefined })}`);
    } else parts.push(p.state === "review" ? "in review" : "being learned");
    if (p.interval) parts.push(`every ${p.interval} ${p.interval === 1 ? "day" : "days"}`);
  }
  if (p.right || p.wrong) parts.push(`${p.right} right, ${p.wrong} wrong`);
  const dots = p.history ? ` <span class="anki-history" title="Your latest answers in Anki, oldest first">${[...p.history].map((a) =>
    `<i class="${a === "1" ? "ok" : "no"}"></i>`).join("")}</span>` : "";
  return `<div class="small muted anki-progress" title="Read from Anki on ${esc(p.seen || "")}. Tamkeen only shows this; it never changes Anki's schedule.">Anki: ${esc(parts.join(" · "))}${dots}</div>`;
}

/**
 * Asked before a word is deleted. Resolves true to go ahead. When the word has a card in the
 * synced deck and the learner has never agreed to cards being removed, it says plainly what
 * will be lost and remembers a yes; otherwise it is the usual short question.
 */
export async function confirmDelete(v) {
  let st = null, linked = false;
  try {
    st = await api("/anki/sync/status");
    if (st.enabled) linked = (await api(`/anki/linked/${v.uid || v.id}`)).linked;
  } catch { /* no sync on this device */ }
  if (!st || !st.enabled || !linked) return confirm(`Delete “${v.text}” from your vocab?`);
  if (st.delete_ok) return confirm(`Delete “${v.text}” from your vocab?\n\nIts card in ${anki()}, with that card's review history, will be removed too.`);
  const dlg = h(`<dialog class="help-dialog">
    <h2>This also deletes the ${anki()} card</h2>
    <p>“<span dir="auto">${esc(v.text)}</span>” has a card in your ${esc(st.deck)} deck in ${anki()}. Deleting the word here removes that card at the next sync,
      <strong>together with the card's review history in ${anki()}. That cannot be undone.</strong></p>
    <p style="margin-top:10px">If you go ahead, deleting a word will remove its card from now on without this question.</p>
    <div class="help-actions" style="margin-top:18px">
      <button type="button" class="ghost" data-go="">Cancel</button>
      <button type="button" class="danger" data-go="1">Delete the word and its card</button>
    </div>
  </dialog>`);
  document.body.append(dlg);
  const go = await new Promise((resolve) => {
    const answer = (yes) => { if (dlg.isConnected) { dlg.remove(); resolve(yes); } };
    for (const b of dlg.querySelectorAll("button")) b.onclick = () => answer(Boolean(b.dataset.go));
    dlg.addEventListener("close", () => answer(false));
    dlg.showModal();
  });
  if (go) await api("/anki/sync/options", { method: "POST", body: { delete_ok: true } });
  return go;
}
