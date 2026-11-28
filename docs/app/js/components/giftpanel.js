// The creator's "Give to a user" box (prototype "owner_gifts"): opened from the creator's panel
// (components/creatorbar.js). Pick a user by username (a friend or not), choose what to give, and see the record
// of everything given. Who may give is decided by the database (supabase/v16-owner-gifts.sql: creators only);
// what a gift may hold is game/gifts.js. Shared by the computer, the phones and the web app.
//
// The creator cannot see anyone's game (it is kept in that person's own Google Drive), so amounts are added or
// taken away, never set: "−50" takes 50 coins away, and nothing goes below zero.

import { h, toast } from "../app.js";
import { t } from "../i18n.js";
import { BEASTS, DECOR, ITEMS, SLOTS, TAGS, TYPES, TYPE_IDS } from "../game/data.js";
import { GIFT_CREATURES_MAX, GIFT_LIST_MAX, GIFT_MAX, GIFT_MOVES, cleanGift, giftLines } from "../game/gifts.js";
import { give, giftRecord, takeBack } from "../giftsync.js";
import { confirmBox, openModal } from "./modal.js";

const COUNTERS = [["coins", "Coins"], ["gems", "Gems"], ["xp", "XP"], ["glow", "Glow"]];
const STAGES = [["egg", "As an egg"], ["hatchling", "Hatched"], ["juvenile", "Juvenile"], ["grown", "Fully grown"]];
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");

/** A drop-down of grouped choices: groups is [[group name, [[value, label]]]]. */
function dropdown(groups, first) {
  const sel = h(`<select></select>`);
  const none = h(`<option value=""></option>`);
  none.textContent = first;
  sel.append(none);
  for (const [name, list] of groups) {
    const g = document.createElement("optgroup");
    g.label = name;
    for (const [value, label] of list) { const o = document.createElement("option"); o.value = value; o.textContent = label; g.append(o); }
    sel.append(g);
  }
  return sel;
}

export function openGiftPanel() {
  const box = openModal({ title: t("Give to a user"), wide: true, cls: "gft-back" });
  const gift = { items: [], moves: [], tags: [], creatures: [] };
  const view = h(`<div class="gft">
    <p class="small muted">The gift waits online until that person's app collects it. It is added to their game once, on whichever device opens first, and they are told what arrived. You can't see their amounts (their game is kept in their own Google Drive), so numbers are added or taken away, never set.</p>
    <label class="gft-field"><span>Username</span><input type="text" class="gft-user" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="21" placeholder="Their Tamkeen username"></label>
    <h3>Coins, gems, XP and glow</h3>
    <div class="gft-nums"></div>
    <p class="small muted">A minus number takes that many away (never below zero).</p>
    <h3>Things to wear and decorations</h3>
    <div class="gft-add" data-k="items"></div><div class="gft-chips" data-k="items"></div>
    <h3>Battle moves</h3>
    <div class="gft-add" data-k="moves"></div><div class="gft-chips" data-k="moves"></div>
    <h3>Creatures</h3>
    <div class="gft-add" data-k="creatures"></div><div class="gft-chips" data-k="creatures"></div>
    <h3>Unlocks</h3>
    <p class="small muted">Each one opens its things in the shop and its special colourings.</p>
    <div class="gft-tags"></div>
    <label class="gft-field"><span>A sentence for them (optional)</span><input type="text" class="gft-note" maxlength="200" placeholder="Thanks for testing!"></label>
    <div class="set-actions gft-go"><button type="button" class="primary">Give</button></div>
    <h3>Given so far</h3>
    <div class="gft-record"><p class="small muted">Loading…</p></div>
  </div>`);
  box.body.append(view);

  // ---- the numbers
  const nums = {};
  for (const [k, label] of COUNTERS) {
    const f = h(`<label class="gft-num"><span></span><input type="number" inputmode="numeric" step="1" placeholder="0"></label>`);
    f.querySelector("span").textContent = t(label);
    const input = f.querySelector("input");
    input.min = String(-GIFT_MAX);
    input.max = String(GIFT_MAX);
    nums[k] = input;
    view.querySelector(".gft-nums").append(f);
  }

  // ---- the lists
  const chips = (k) => view.querySelector(`.gft-chips[data-k="${k}"]`);
  const names = {
    items: (id) => t((ITEMS.find((x) => x.id === id) || DECOR.find((x) => x.id === id)).name),
    moves: (id) => t(GIFT_MOVES.find((m) => m.id === id).name),
    creatures: (c) => `${t(BEASTS.find((b) => b.id === c.beast).name)} · ${t(STAGES.find((s) => s[0] === c.stage)[1])}`,
  };
  function paintChips(k) {
    const el = chips(k);
    el.innerHTML = "";
    gift[k].forEach((x, i) => {
      const chip = h(`<span class="gft-chip"><span></span><button type="button" class="ghost" aria-label="Remove">✕</button></span>`);
      chip.firstChild.textContent = names[k](x);
      chip.querySelector("button").onclick = () => { gift[k].splice(i, 1); paintChips(k); };
      el.append(chip);
    });
  }
  const adder = (k, controls, make, most) => {
    const row = view.querySelector(`.gft-add[data-k="${k}"]`);
    const add = h(`<button type="button">Add</button>`);
    add.onclick = () => {
      const x = make();
      if (!x) return;
      if (gift[k].length >= most) { toast(t("That is the most one gift can hold."), { error: true }); return; }
      if (typeof x === "string" && gift[k].includes(x)) return;
      gift[k].push(x);
      paintChips(k);
    };
    row.append(...controls, add);
  };
  const itemPick = dropdown([
    ...Object.entries(SLOTS).map(([slot, s]) => [t(s.name), ITEMS.filter((x) => x.slot === slot).map((x) => [x.id, t(x.name)])]),
    [t("Decorations"), DECOR.map((x) => [x.id, t(x.name)])],
  ], t("Choose a thing…"));
  adder("items", [itemPick], () => itemPick.value, GIFT_LIST_MAX);
  const movePick = dropdown([[t("Battle moves"), GIFT_MOVES.map((m) => [m.id, t(m.name)])]], t("Choose a move…"));
  adder("moves", [movePick], () => movePick.value, GIFT_LIST_MAX);
  const beastPick = dropdown(TYPE_IDS.map((type) => [t(TYPES[type].name), BEASTS.filter((b) => b.type === type).map((b) => [b.id, t(b.name)])]), t("Choose a creature…"));
  const stagePick = h(`<select></select>`);
  for (const [id, label] of STAGES) { const o = document.createElement("option"); o.value = id; o.textContent = t(label); stagePick.append(o); }
  adder("creatures", [beastPick, stagePick], () => (beastPick.value ? { beast: beastPick.value, stage: stagePick.value } : null), GIFT_CREATURES_MAX);
  for (const [id, text] of Object.entries(TAGS)) {
    const line = h(`<label class="gft-tag"><input type="checkbox"><span></span></label>`);
    line.querySelector("span").textContent = t(text);
    line.querySelector("input").onchange = (e) => { gift.tags = e.target.checked ? [...gift.tags, id] : gift.tags.filter((x) => x !== id); };
    view.querySelector(".gft-tags").append(line);
  }

  // ---- give
  const user = view.querySelector(".gft-user");
  const note = view.querySelector(".gft-note");
  const go = view.querySelector(".gft-go button");
  const whatNow = () => cleanGift({ ...gift, ...Object.fromEntries(COUNTERS.map(([k]) => [k, Number(nums[k].value) || 0])) });
  go.onclick = async () => {
    const name = user.value.trim().replace(/^@/, "");
    const what = whatNow();
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(name)) { toast(t("Type their username first."), { error: true }); user.focus(); return; }
    if (!what) { toast(t("Choose something to give first."), { error: true }); return; }
    if (!(await confirmBox(t("Give this to {0}?", name), giftLines(what, t).join(" · "), { ok: t("Give") }))) return;
    go.disabled = true;
    try {
      const r = await give(name, what, note.value);
      if (r.status !== "given") toast(t("Nobody has that username."), { error: true });
      else {
        toast(t("Given to {0}. It arrives when their app next opens.", r.username || name));
        for (const [k] of COUNTERS) nums[k].value = "";
        for (const k of ["items", "moves", "creatures"]) { gift[k] = []; paintChips(k); }
        gift.tags = [];
        for (const c of view.querySelectorAll(".gft-tag input")) c.checked = false;
        note.value = "";
        record();
      }
    } catch (e) { toast(e.message, { error: true }); }
    go.disabled = false;
  };

  // ---- the record
  const list = view.querySelector(".gft-record");
  async function record() {
    let rows;
    try { rows = await giftRecord(); } catch (e) {
      list.innerHTML = "";
      const p = h(`<p class="small muted"></p>`);
      p.textContent = e.message;
      list.append(p);
      return;
    }
    list.innerHTML = "";
    if (!rows.length) { list.append(h(`<p class="small muted">Nothing given yet.</p>`)); return; }
    const table = h(`<div class="gft-rows"></div>`);
    for (const g of rows) {
      const row = h(`<div class="gft-row"><span class="gft-row-text"><strong translate="no"></strong><span class="gft-what"></span><span class="small muted"></span></span></div>`);
      row.querySelector("strong").textContent = `@${g.username}`;
      row.querySelector(".gft-what").textContent = giftLines(g.what, t).join(" · ") || t("(nothing this version knows)");
      row.querySelector(".muted").textContent = [day(g.created_at), g.got_at ? t("collected {0}", day(g.got_at)) : t("not collected yet"), g.note ? `“${g.note}”` : ""].filter(Boolean).join(" · ");
      if (!g.got_at) {
        const back = h(`<button type="button" class="ghost danger">Take back</button>`);
        back.onclick = async () => {
          back.disabled = true;
          try { if (!(await takeBack(g.id))) toast(t("It was collected a moment ago, so it can't be taken back.")); } catch (e) { toast(e.message, { error: true }); }
          record();
        };
        row.append(back);
      }
      table.append(row);
    }
    list.append(table);
  }
  record();
  return box;
}

if (typeof document !== "undefined" && !document.getElementById("gft-css")) {
  const style = document.createElement("style");
  style.id = "gft-css";
  style.textContent = `
    .gft { display: flex; flex-direction: column; gap: var(--s-12); }
    .gft h3 { margin: var(--s-12) 0 0; font-size: var(--fs-16); }
    .gft p { margin: 0; }
    .gft-field { display: flex; flex-direction: column; gap: var(--s-4); }
    .gft-field input { min-height: 44px; font-size: var(--fs-16); }
    .gft-nums { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-8); }
    .gft-num { display: flex; flex-direction: column; gap: var(--s-4); min-width: 0; }
    .gft-num input { min-height: 44px; font-size: var(--fs-16); width: 100%; box-sizing: border-box; border-radius: var(--r-s); border: 1px solid var(--line); background: var(--surface-2); color: inherit; padding: 0 var(--s-12); text-align: center; }
    .gft-add { display: flex; gap: var(--s-8); flex-wrap: wrap; }
    .gft-add select { flex: 1; min-width: 150px; min-height: 44px; }
    .gft-add button { min-height: 44px; }
    .gft-chips { display: flex; gap: var(--s-8); flex-wrap: wrap; }
    .gft-chip { display: inline-flex; align-items: center; gap: var(--s-4); border: 1px solid var(--line); border-radius: var(--r-pill); corner-shape: round; padding: var(--s-4) var(--s-4) var(--s-4) var(--s-12); background: var(--surface-2); }
    .gft-chip button { min-height: 28px; padding: 0 var(--s-8); border: none; }
    .gft-tags { display: flex; flex-direction: column; gap: var(--s-8); }
    .gft-tag { display: flex; align-items: center; gap: var(--s-12); min-height: 36px; }
    .gft-tag input { width: 20px; height: 20px; flex: none; accent-color: var(--teal); }
    .gft-go { justify-content: center; }
    .gft-go .primary { min-width: 200px; min-height: 48px; justify-content: center; font-size: var(--fs-16); }
    .gft-rows { border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; }
    .gft-row { display: flex; align-items: center; gap: var(--s-12); padding: var(--s-12) var(--s-16); }
    .gft-row + .gft-row { border-top: 1px solid var(--line); }
    .gft-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--s-4); overflow-wrap: anywhere; }
    @media (max-width: 560px) { .gft-nums { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `;
  document.head.append(style);
}
