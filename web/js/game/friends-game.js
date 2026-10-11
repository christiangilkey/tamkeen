// The game's "Friends" page: gifts and battle results waiting for you, the friend league, the
// guild raid, and challenging a friend's team. Needs the online features (Connect with Google);
// everything else in the game works without them.

import { h, toast } from "../app.js";
import * as social from "../social.js";
import { BOSSES, LEAGUES, RAID_HP_PER_MEMBER } from "./data.js";
import { claimRaid, giveEgg, giveItem, leaguePercent, raidDamage, receiveGift, recordDefence, weekNumber, weeklyBoss, weeklyRule } from "./rules.js";
import { publicProfile } from "./battle.js";
import { announce, getGame, saveGame, sfx } from "./game.js";
import { icon } from "./render.js";

const ART = new URL("../../game-art/", import.meta.url).href;
let lastPublish = 0;

/** Share my team and this week's numbers with friends (at most every few minutes unless forced). */
export async function publishNow(force = false) {
  if (!force && Date.now() - lastPublish < 5 * 60000) return false;
  try {
    if (!(await social.currentUser())) return false;
    lastPublish = Date.now();
    return await social.publishGame(publicProfile(getGame(), weeklyRule()));
  } catch {
    return false; // offline, or the online service isn't set up for the game yet
  }
}

/** Ask which friend (or guild-mate). Resolves to {id, username} or null. */
export async function chooseFriend(title) {
  const state = await social.friendsState().catch(() => null);
  if (!state) { toast("Connect with Google first (Settings → Friends & sharing)."); return null; }
  if (!state.friends.length) { toast("Add a friend first, on the Friends tab."); return null; }
  return new Promise((resolve) => {
    const wrap = h(`<div class="game-sheet-wrap" style="z-index:75"><div class="game-sheet" role="dialog">
      <div class="game-sheet-head"><strong></strong><span class="spacer"></span><button type="button" class="ghost icon" data-close title="Close">${icon("close")}</button></div>
      <div class="game-sheet-body pick-row"></div></div></div>`);
    wrap.querySelector("strong").textContent = title;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) done(null); });
    for (const f of state.friends) {
      const b = h(`<button type="button" class="pick"></button>`);
      b.textContent = f.user.username;
      b.onclick = () => done(f.user);
      wrap.querySelector(".game-sheet-body").append(b);
    }
    document.body.append(wrap);
  });
}

/** Give an owned item, or an unhatched egg (by roster index), to a friend. */
export async function gift(kind, what, changed) {
  const game = getGame();
  const friend = await chooseFriend(kind === "egg" ? "Give this egg to…" : "Give this to…");
  if (!friend) return;
  // Send first, then take it out of the game: a failed send must not lose the item.
  const payload = kind === "egg" ? (() => { const g = game.roster[what]; return g ? { seed: g.seed, type: g.type } : null; })() : { id: what };
  if (!payload) return;
  try {
    await social.sendGift(friend.id, kind, payload);
  } catch (e) { toast(e.message, { error: true }); return; }
  if (kind === "egg") giveEgg(game, what); else giveItem(game, what);
  saveGame();
  sfx("lucky");
  toast(`Sent to ${friend.username}.`);
  changed();
}

/** Fill `body` with the Friends page. `challenge(friend, profile)` starts a battle. */
export async function friendsPanel(body, game, changed, challenge) {
  body.innerHTML = `<p class="muted">Loading…</p>`;
  let me = null;
  let friends = null;
  let guilds = null;
  try {
    me = await social.currentUser();
    if (me) { friends = await social.friendsState(); guilds = await social.guildsState(); }
  } catch (e) { body.innerHTML = ""; body.append(h(`<p class="muted">Couldn't reach the online service. Check your connection.</p>`)); return; }
  if (!body.isConnected) return;
  body.innerHTML = "";
  if (!me || !friends) {
    body.append(h(`<div class="stack"><p>Battling friends, the league, guild raids and gifts need the online features.</p>
      <p class="small muted">Choose <strong>Connect with Google</strong> under Settings → Friends &amp; sharing. Your words and
      study material are never sent: only your team of creatures, how accurately you answer, and this week's totals.</p>
      <a class="btn primary" href="#/settings" data-close>Open Settings</a></div>`));
    return;
  }
  await publishNow(true);
  const now = new Date();
  const week = weekNumber(now);
  const people = new Map(friends.friends.map((f) => [f.user.id, f.user]));
  for (const g of (guilds && guilds.guilds) || []) for (const m of g.members) if (m.id !== me.id && !people.has(m.id)) people.set(m.id, m);
  let profiles = new Map();
  let gifts = [];
  let inbox = [];
  try {
    [profiles, gifts, inbox] = await Promise.all([social.gameProfiles([...people.keys()]), social.giftInbox(), social.battleInbox()]);
  } catch (e) { body.append(h(`<p class="muted small">The game's online data isn't available yet (${e.message}).</p>`)); return; }
  if (!body.isConnected) return;

  // ----- waiting for you -----
  if (gifts.length || inbox.length) {
    const box = h(`<div class="creature-card on stack"><strong>Waiting for you</strong></div>`);
    for (const g of gifts) {
      const row = h(`<div class="row"><span>${icon("gift")} ${g.kind === "egg" ? "An egg" : "A gift"} from <b></b></span><span class="spacer"></span><button type="button" class="primary">Open</button></div>`);
      row.querySelector("b").textContent = g.from;
      row.querySelector("button").onclick = async (e) => {
        e.target.disabled = true;
        try {
          const got = await social.claimGift(g.id);
          toast(receiveGift(game, got.kind, got.payload));
          sfx("jackpot");
          saveGame();
          changed();
          row.remove();
        } catch (err) { toast(err.message, { error: true }); e.target.disabled = false; }
      };
      box.append(row);
    }
    for (const r of inbox) {
      recordDefence(game, r.rival, r.won);
      const row = h(`<div class="row"><span>${icon("defence")} <b></b> challenged your team and ${r.won ? "won" : "lost"}.</span><span class="spacer"></span><button type="button">Rematch</button></div>`);
      row.querySelector("b").textContent = r.rival.name;
      row.querySelector("button").onclick = () => challenge(people.get(r.rival.id) || { id: r.rival.id, username: r.rival.name }, profiles.get(r.rival.id));
      box.append(row);
    }
    if (inbox.length) { saveGame(); social.markBattlesSeen().catch(() => {}); }
    body.append(box);
  }

  // ----- the league: who kept their own promise this week -----
  const rule = weeklyRule(now);
  const rows = [{ id: me.id, name: "You", league: game.league, rating: game.rating, pct: leaguePercent(game.goalWeek.n === week ? game.goalWeek.days : 0, now), mine: true }];
  for (const [id, p] of people) {
    const gp = profiles.get(id);
    rows.push({ id, name: p.username, league: gp ? gp.league : 0, rating: gp ? gp.rating : null, pct: gp && gp.week === week ? leaguePercent(gp.goal_days, now) : 0,
                team: gp && Array.isArray(gp.team) ? gp.team : [], profile: gp, user: p });
  }
  rows.sort((a, b) => b.pct - a.pct || (b.rating || 0) - (a.rating || 0));
  const league = h(`<div class="stack"><div class="row"><img class="league-ico" alt="" src="${ART}icon/league_${LEAGUES[game.league].toLowerCase()}.png">
    <div><strong>${LEAGUES[game.league]} league</strong><div class="small muted">Ranked by the share of days this week each of you reached
    your own daily goal, whatever its size. Five or more days in a week moves you up a league; one or none moves you down.</div></div></div>
    <div class="league-table"></div>
    <p class="small muted">This week's battle rule: ${icon(`rule_${rule.id}`)} <strong>${rule.name}</strong>. ${rule.text}</p></div>`);
  rows.forEach((r, i) => {
    const record = game.rivals[r.id];
    const row = h(`<div class="league-row${r.mine ? " mine" : ""}"><span class="league-rank">${i + 1}</span>
      <img class="league-ico small" alt="" src="${ART}icon/league_${LEAGUES[Math.max(0, Math.min(3, r.league))].toLowerCase()}.png">
      <span class="league-name"></span><span class="hud-bar goal"><i style="width:${r.pct}%"></i></span><span class="league-pct">${r.pct}%</span>
      <span class="league-act"></span></div>`);
    row.querySelector(".league-name").textContent = r.name + (record ? ` · ${record.wins}–${record.losses}` : "");
    if (record) row.querySelector(".league-name").prepend(h(icon("rival")), " "); // someone you have fought
    if (!r.mine) {
      const btn = h(`<button type="button" class="primary small"${r.team.length ? "" : " disabled"}>${r.team.length ? "Challenge" : "No team yet"}</button>`);
      btn.title = r.team.length ? `Skill ${r.rating}` : "They haven't opened the game online yet";
      btn.onclick = () => challenge(r.user, r.profile);
      row.querySelector(".league-act").append(btn);
    }
    league.querySelector(".league-table").append(row);
  });
  body.append(league);
  if (!people.size) body.append(h(`<p class="small muted">Add friends on the Friends tab to fill the league and challenge their teams.</p>`));

  // ----- the guild raid: everyone's right answers this week wear the boss down -----
  const boss = weeklyBoss(now);
  for (const g of (guilds && guilds.guilds) || []) {
    const hp = g.members.length * RAID_HP_PER_MEMBER;
    let dealt = raidDamage(game, now);
    const parts = [["You", dealt]];
    for (const m of g.members) {
      if (m.id === me.id) continue;
      const gp = profiles.get(m.id);
      const d = gp && gp.week === week ? gp.reviews : 0;
      dealt += d;
      parts.push([m.username, d]);
    }
    const left = Math.max(0, hp - dealt);
    const down = left === 0;
    const raid = h(`<div class="creature-card stack"><div class="row"><span class="boss${down ? " down" : ""}" style="background-image:url(${ART}boss/${boss.id}_${down ? "down" : "idle"}.png)"></span>
      <div class="creature-info"><strong></strong><span class="small muted"></span>
        <div class="hud-bar"><i style="width:${Math.round((left / hp) * 100)}%;background:var(--alert)"></i></div>
        <span class="small">${down ? "Defeated!" : `${left} of ${hp} left`}</span></div></div>
      <div class="small muted" id="raid-parts"></div><div id="raid-claim"></div></div>`);
    raid.querySelector("strong").textContent = `${g.name} raid: ${boss.name}`;
    raid.querySelector("strong").prepend(h(icon("raid")), " ");
    raid.querySelector(".creature-info .small").textContent = `${boss.text} Every right answer in a battle this week, by anyone in the guild, takes one off.`;
    raid.querySelector("#raid-parts").textContent = parts.sort((a, b) => b[1] - a[1]).map(([n, d]) => `${n} ${d}`).join(" · ");
    if (down && game.raid !== week) {
      const btn = h(`<button type="button" class="primary">Claim the reward</button>`);
      btn.onclick = () => {
        const pay = claimRaid(game, new Date());
        if (!pay) return;
        saveGame();
        sfx("jackpot");
        announce({ type: "raid", xp: pay.xp, tier: "jackpot", badges: pay.badges });
        toast(`Raid won: +${pay.xp} XP and ${pay.coins} coins.`);
        changed();
        btn.remove();
      };
      raid.querySelector("#raid-claim").append(btn);
    } else if (down) raid.querySelector("#raid-claim").append(h(`<span class="small muted">${icon("clock")} Reward claimed. A new boss arrives on Monday.</span>`));
    body.append(raid);
  }
  if (guilds && !guilds.guilds.length) body.append(h(`<p class="small muted">Join or found a guild (Friends tab) to take on the weekly raid boss together. This week: ${BOSSES.length ? boss.name : ""}.</p>`));
}
