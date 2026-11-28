// Gifts from Tamkeen's creator (prototype "owner_gifts"), the online part: collecting the gifts waiting for me
// and adding them to my game, and the creator's three calls. The rules are in supabase/v16-owner-gifts.sql, what
// a gift may hold and how it is added exactly once in game/gifts.js, the creator's screen in
// components/giftpanel.js. Shared by the computer, the phones and the web app (pages/home.js calls collectGifts).

import { h } from "./app.js";
import { t } from "./i18n.js";
import * as social from "./social.js";
import { feature } from "./prototype.js";
import { gameOn } from "./components/gameswitch.js";
import { announce, getGame, saveGame, sfx } from "./game/game.js";
import { applyGift, cleanGift, cleanRecord, cleanWaiting, giftLines } from "./game/gifts.js";
import { openModal } from "./components/modal.js";

const EVERY_MS = 5 * 60000;   // Home asks at most this often
const MARK_AFTER_MS = 4000;   // a gift is marked collected once the game holding it has had time to be saved
let lastAsked = 0;
let asking = null;

async function rpc(name, args) {
  let res;
  try { res = await (await social.sb()).rpc(name, args); } catch { throw new Error("Couldn't reach the online service. Check your internet connection."); }
  if (res.error) {
    const msg = String(res.error.message || "");
    const code = String(res.error.code || "");
    const e = new Error(/not_creator/.test(msg) ? "Only Tamkeen's creator can do that."
      : /gift_bad/.test(msg) ? "That gift couldn't be sent: it is empty or too big."
      : code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg) ? "Gifts aren't switched on yet."
      : /fetch|network|Failed to/i.test(msg) ? "Couldn't reach the online service. Check your internet connection."
      : "That didn't work. Try again in a moment.");
    e.notReady = code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg);
    throw e;
  }
  return res.data;
}

/** Tell the person what arrived. */
function notice(gifts) {
  const box = openModal({ title: t("From the Tamkeen team") });
  const view = h(`<div class="gft-notice"></div>`);
  for (const g of gifts) {
    const part = h(`<div class="gft-one"><ul></ul><p class="gft-note" hidden></p></div>`);
    for (const line of giftLines(g.what, t)) { const li = h(`<li></li>`); li.textContent = line; part.querySelector("ul").append(li); }
    if (g.note) { const p = part.querySelector(".gft-note"); p.textContent = g.note; p.hidden = false; }
    view.append(part);
  }
  const ok = h(`<div class="set-actions"><button type="button" class="primary">OK</button></div>`);
  ok.querySelector("button").onclick = () => box.close();
  view.append(h(`<p class="small muted">It has been added to your game.</p>`), ok);
  box.body.append(view);
}

/**
 * Collect the gifts waiting for me and add them to my game. Safe to call often (Home does, each time it opens):
 * it asks at most every five minutes, only when signed in with the game on, and never throws. A gift the game
 * has had already (collected on another device) is only marked. Resolves to how many were added now.
 */
export function collectGifts({ force = false } = {}) {
  if (!feature("owner_gifts") || !gameOn()) return Promise.resolve(0);
  if (asking) return asking;
  if (!force && Date.now() - lastAsked < EVERY_MS) return Promise.resolve(0);
  asking = (async () => {
    try {
      if (!(await social.currentUser())) return 0;
      lastAsked = Date.now();
      const waiting = cleanWaiting(await rpc("my_gifts"));
      if (!waiting.length) return 0;
      const game = getGame();
      const fresh = [];
      for (const g of waiting) if (g.what && applyGift(game, g.id, g.what)) fresh.push(g);
      if (fresh.length) {
        saveGame();
        announce({ type: "sync" });
        try { sfx("jackpot"); } catch { /* no sound */ }
        notice(fresh);
      }
      const ids = waiting.map((g) => g.id);
      // (marked a moment later, so a gift is never marked collected before the game that holds it is saved; if the
      // app closes first, it is offered again and the game, which remembers it, only marks it)
      setTimeout(() => { rpc("gifts_got", { ids }).catch(() => {}); }, fresh.length ? MARK_AFTER_MS : 0);
      return fresh.length;
    } catch { return 0; } finally { asking = null; }
  })();
  return asking;
}

// ---------- the creator's side ----------
/** Leave a gift for the user with this username. Resolves to { status: "given" | "no", username }. */
export async function give(username, what, note = "") {
  const gift = cleanGift(what);
  if (!gift) throw new Error("Choose something to give first.");
  const r = (await rpc("creator_give", { username: String(username || "").slice(0, 40), what: gift, note: String(note || "").slice(0, 200) })) || {};
  return { status: r.status === "given" ? "given" : "no", username: /^[A-Za-z0-9_.]{3,20}$/.test(String(r.username || "")) ? String(r.username) : "" };
}
/** The record of what was given, newest first. */
export const giftRecord = async () => cleanRecord(await rpc("creator_gifts", { most: 100 }));
/** Take back a gift nobody has collected yet. Resolves to true when it was removed. */
export const takeBack = async (id) => (await rpc("creator_take_back", { gift: id })) === true;

if (typeof document !== "undefined" && !document.getElementById("gft-notice-css")) {
  const style = document.createElement("style");
  style.id = "gft-notice-css";
  style.textContent = `
    .gft-notice { display: flex; flex-direction: column; gap: var(--s-12); text-align: center; }
    .gft-one { border: 1px solid var(--line); border-radius: var(--r-s); padding: var(--s-12); background: var(--surface-2); }
    .gft-one ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-4); font-weight: 600; font-size: var(--fs-16); }
    .gft-note { margin: var(--s-8) 0 0; color: var(--ink-2); }
    .gft-notice .set-actions { justify-content: center; }
    .gft-notice .set-actions .primary { min-width: 160px; min-height: 44px; justify-content: center; }
  `;
  document.head.append(style);
}
