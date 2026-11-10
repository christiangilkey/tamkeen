// The Battle screen's Friends side (the game sheet's "friends" section, shop.js openShop): gifts and battle results
// waiting for you, the friend league with a Challenge button for each friend's team, this week's rule for friend
// battles, and the guild raid. In blocks like the other game screens; the explanations are behind its "?"
// (friendsHelp). Needs the online features (Connect with Google); everything else in the game works without them.
// Also here: publishing my team for friends, and giving a friend an item or an egg.

import { h, toast } from "../app.js";
import * as social from "../social.js";
import { BOSSES, LEAGUES } from "./data.js";
import { claimRaid, giveEgg, giveItem, receiveGift, recordDefence, showcaseOf, weekNumber, weeklyBoss, weeklyRule } from "./rules.js";
import { publicProfile, showcaseGenome } from "./battle.js";
import { challengeChoice, portrait, startFriendBattle } from "./battle-ui.js";
import { canChallenge } from "./challenge.js";
import { announce, getGame, saveGame, sfx, tellColouring } from "./game.js";
import { icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { cleanName, cleanProfiles, cleanRival } from "./remote.js";
import { hasStudyLanguage, studyLanguage } from "../languages.js";
import { myStreak } from "../review/flame.js";
import { t } from "../i18n.js";
import { sheet as helpSheet } from "./info.js";
import { openModal } from "../components/modal.js";
import { block, fmt, row } from "./screenparts.js";
import { leagueRows, raidState } from "./battlescreen.js";

const ART = new URL("../../game-art/", import.meta.url).href;
let lastPublish = 0;
let lastFlame = null; // the flashcard streak as last sent (JSON)

/** Everything friends may see of my game: team, league, week numbers, today's XP, favourite
 * creature and the language I'm learning. Never words. */
export const myPublicRow = () => ({ ...publicProfile(getGame(), weeklyRule()), language: hasStudyLanguage() ? studyLanguage() : null });

/** Share my team, this week's numbers and my flashcard streak with friends (at most every few
 * minutes unless forced, or the streak has changed since it was last sent). */
export async function publishNow(force = false) {
  try {
    if (!(await social.currentUser())) return false;
    let flame = null;
    try { flame = (await myStreak()).row; } catch { /* no words or log to read: sent without it */ }
    const changed = flame && JSON.stringify(flame) !== lastFlame;
    if (!force && !changed && Date.now() - lastPublish < 5 * 60000) return false;
    lastPublish = Date.now();
    const ok = await social.publishGame({ ...myPublicRow(), ...(flame || {}) });
    if (flame) lastFlame = JSON.stringify(flame);
    return ok;
  } catch {
    return false; // offline, or the online service isn't set up for the game yet
  }
}

/** Ask which friend, in the app's own box: a row for each friend. Resolves to {id, username}, or null when the box
 * is closed. */
export async function chooseFriend(title) {
  const state = await social.friendsState().catch(() => null);
  if (!state) { toast("Connect with Google first (Settings → Friends & sharing)."); return null; }
  if (!state.friends.length) { toast("Add a friend first, on the Friends tab."); return null; }
  return new Promise((resolve) => {
    let picked = null;
    const box = openModal({ title, cls: "gs-detail-back", onClose: () => resolve(picked) });
    const view = h(`<div class="gs-detail"><div class="gs-build-list"></div><div class="confirm-buttons"><button type="button" data-close>Cancel</button></div></div>`);
    for (const f of state.friends) {
      const r = row({ pic: lineIcon("friends", 24), name: f.user.username, end: `<span class="gs-chev">${lineIcon("chevron", 18)}</span>`,
        open: () => { picked = f.user; box.close(); } });
      theirs(r.querySelector(".gs-row-name"));
      view.querySelector(".gs-build-list").append(r);
    }
    box.body.append(view);
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

// ---------- the Friends side of the Battle screen ----------

/** A block with one line in it: loading, or why nothing can be shown. */
function stateBlock(text) {
  const b = block();
  const p = h(`<p class="gs-state muted"></p>`);
  p.textContent = text;
  b.append(p);
  return b;
}
/** A league's picture ("Bronze", "Silver", "Gold", "Diamond": 0 to 3). */
const leagueIcon = (n, px = 24) => icon(`league_${LEAGUES[Math.max(0, Math.min(3, Math.floor(Number(n) || 0)))].toLowerCase()}`, px);
/** Text that came from another person (a name): shown as written, never translated. */
const theirs = (el) => { el.setAttribute("translate", "no"); return el; };

/**
 * Fill `body` with the Friends side. `challenge(friend, profile, opts)` starts a battle against a friend's team (opts:
 * { words, folder } for a folder challenge, challenge.js). Everything
 * drawn here that came from friends' devices is checked first (remote.js) and put in as text, never as markup.
 */
export async function friendsPanel(body, game, changed, challenge) {
  const page = h(`<div class="bt-page"></div>`);
  page.append(stateBlock("Loading…"));
  body.append(page);
  const gone = () => !page.isConnected; // closed, or turned back to Battle meanwhile
  let me = null;
  let friends = null;
  let guilds = null;
  try {
    me = await social.currentUser();
    if (me) { friends = await social.friendsState(); guilds = await social.guildsState(); }
  } catch { if (!gone()) page.replaceChildren(stateBlock("Couldn't reach the online service. Check your connection.")); return; }
  if (gone()) return;
  if (!me || !friends) { page.replaceChildren(offlineBlock()); return; }
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
  } catch (e) {
    if (!gone()) page.replaceChildren(stateBlock(`The game's online data isn't available yet (${e.message}).`));
    return;
  }
  if (gone()) return;
  // Everything here came from friends' devices: checked before anything uses it (remote.js).
  profiles = cleanProfiles(profiles);
  gifts = (Array.isArray(gifts) ? gifts : []).map((g) => ({ id: g.id, kind: g.kind === "egg" ? "egg" : "item", from: cleanName(g.from, 40) || "A friend" }));
  inbox = (Array.isArray(inbox) ? inbox : []).map((r) => ({ id: r.id, won: r.won === true, rival: cleanRival(r.rival), folder: cleanName(r.folder, 80) || null }));
  for (const r of inbox) recordDefence(game, r.rival, r.won);
  if (inbox.length) { saveGame(); social.markBattlesSeen().catch(() => {}); }

  const blocks = [];
  if (gifts.length || inbox.length) blocks.push(waitingBlock(game, gifts, inbox, people, profiles, changed, challenge));
  const friendIds = new Set(friends.friends.map((f) => f.user.id)); // (a folder challenge goes in a chat: friends only)
  blocks.push(leagueBlock(game, me, people, profiles, now, challenge, friendIds));
  blocks.push(ruleBlock(now));
  for (const g of (guilds && guilds.guilds) || []) blocks.push(raidBlock(game, me, g, profiles, now, week, changed));
  if (guilds && !guilds.guilds.length) blocks.push(noGuildBlock(now));
  page.replaceChildren(...blocks);
}

/** Not signed in: what the Friends side needs, and the way to Settings. */
function offlineBlock() {
  const b = block();
  b.append(h(`<div class="gs-empty">${icon("rival", 48)}<span>Battling friends, the league, guild raids and gifts need the online features.</span>
    <a class="btn primary" href="#/settings?s=account&show=friends" data-close>Open Settings</a></div>`));
  return b;
}

/** Gifts to open and challenges your team answered while you were away. */
function waitingBlock(game, gifts, inbox, people, profiles, changed, challenge) {
  const b = block("Waiting for you", String(gifts.length + inbox.length));
  const count = () => {
    const n = b.querySelectorAll(".gs-row").length;
    if (!n) b.remove(); else b.querySelector(".gs-block-end").textContent = String(n);
  };
  for (const g of gifts) {
    const open = h(`<button type="button" class="gs-row-btn primary">Open</button>`);
    const r = row({ pic: icon(g.kind === "egg" ? "egg" : "gift", 32), name: g.kind === "egg" ? "An egg" : "A gift", end: open });
    r.querySelector(".gs-row-sub").append(theirs(Object.assign(h(`<span></span>`), { textContent: t("Sent by {0}", g.from) })));
    open.onclick = async () => {
      open.disabled = true;
      try {
        const got = await social.claimGift(g.id);
        toast(receiveGift(game, got.kind, got.payload));
        sfx("jackpot");
        saveGame();
        changed();
        r.remove();
        count();
      } catch (err) { toast(err.message, { error: true }); open.disabled = false; }
    };
    b.append(r);
  }
  for (const x of inbox) {
    const again = h(`<button type="button" class="gs-row-btn">Rematch</button>`);
    const sub = x.folder ? (x.won ? t("Beat your team on “{0}”", x.folder) : t("Lost to your team on “{0}”", x.folder)) : x.won ? "Beat your team" : "Lost to your team";
    const r = row({ pic: icon("defence", 32), name: x.rival.name, end: again });
    r.querySelector(".gs-row-sub").textContent = sub; // (the folder's name came from their device: text, never markup)
    theirs(r.querySelector(".gs-row-name"));
    again.onclick = () => challenge(people.get(x.rival.id) || { id: x.rival.id, username: x.rival.name }, profiles.get(x.rival.id));
    b.append(r);
  }
  return b;
}

/** The league: everyone, best first, with their favourite creature, this week's share of goal days, my record against
 * them, and Challenge. */
function leagueBlock(game, me, people, profiles, now, challenge, friendIds = new Set()) {
  const lg = Math.max(0, Math.min(3, Math.floor(Number(game.league) || 0)));
  const b = block(`${LEAGUES[lg]} league`, h(`<span class="bt-league">${leagueIcon(lg, 24)}</span>`));
  leagueRows({ me, game, people, profiles, now }).forEach((r, i) => {
    const record = !r.mine && Object.prototype.hasOwnProperty.call(game.rivals, r.id) ? game.rivals[r.id] : null;
    const sub = `<span>${t("{0}% of days", String(r.pct))}</span>`
      + (record ? `<span class="fr-record">${icon("rival")}${fmt(record.wins)}–${fmt(record.losses)}</span>` : "");
    let end = "";
    if (!r.mine) {
      end = h(`<button type="button" class="gs-row-btn${r.team.length ? " primary" : ""}"></button>`);
      end.textContent = r.team.length ? "Challenge" : "No team yet";
      end.disabled = !r.team.length;
      end.title = r.team.length ? t("Skill {0}", String(r.rating)) : "They haven't opened the game online yet";
      // a battle as usual, or (a friend studying the same language) a challenge on one of my folders
      end.onclick = async () => {
        const same = friendIds.has(r.id) && canChallenge(r.profile, hasStudyLanguage() ? studyLanguage() : null);
        const pick = await challengeChoice(r.user, r.name, same);
        if (pick) challenge(r.user, r.profile, pick);
      };
    }
    const el = row({ pic: "", name: r.name, sub, end });
    el.classList.add("fr-row");
    el.classList.toggle("fr-me", r.mine);
    if (!r.mine) theirs(el.querySelector(".gs-row-name"));
    const fav = r.mine ? showcaseOf(game) : showcaseGenome(r.profile);
    const pic = el.querySelector(".gs-row-pic");
    // their favourite creature with their league in its corner; without one, the league's picture
    if (fav) pic.append(portrait(fav, 48), h(`<span class="fr-league">${leagueIcon(r.league, 24)}</span>`)); else pic.innerHTML = leagueIcon(r.league, 48);
    pic.append(h(`<span class="fr-rank">${i + 1}</span>`));
    b.append(el);
  });
  if (!people.size) {
    b.append(h(`<div class="gs-empty"><span>Add friends on the Friends tab to fill the league and challenge their teams.</span>
      <a class="btn" href="#/friends" data-close>${lineIcon("userplus", 18)}<span>Add a friend</span></a></div>`));
  }
  return b;
}

/** This week's rule for friend battles. */
function ruleBlock(now) {
  const rule = weeklyRule(now);
  const b = block("This week's rule");
  b.append(row({ pic: icon(`rule_${rule.icon || rule.id}`, 32), name: rule.name, sub: rule.text }));
  return b;
}

/** A guild's raid: the boss, how much of it is left, who has hit it, and the reward once it is down. */
function raidBlock(game, me, guild, profiles, now, week, changed) {
  const boss = weeklyBoss(now);
  const r = raidState({ me, game, members: guild.members, profiles, now });
  const b = block(t("Guild raid: {0}", guild.name));
  theirs(b.querySelector(".gs-label"));
  const stage = h(`<div class="fr-boss"><span class="boss${r.down ? " down" : ""}"></span><span class="fr-boss-text"><strong></strong><span></span></span></div>`);
  stage.querySelector(".boss").style.backgroundImage = `url(${ART}boss/${boss.id}_${r.down ? "down" : "idle"}.png)`;
  stage.querySelector("strong").textContent = boss.name;
  stage.querySelector(".fr-boss-text span").textContent = boss.text;
  b.append(stage);
  const hp = h(`<div class="cr-grow fr-hp"><span class="gs-label">Health</span><span class="cr-bar"><i></i></span><span class="small cr-pct"></span></div>`);
  hp.querySelector("i").style.width = `${Math.round((r.left / r.hp) * 100)}%`;
  hp.querySelector(".cr-pct").textContent = r.down ? t("Defeated!") : `${fmt(r.left)} / ${fmt(r.hp)}`;
  if (!r.down) hp.querySelector(".cr-pct").dir = "ltr"; // ("252 / 450" reads the same way round in Arabic)
  b.append(hp);
  const parts = h(`<div class="fr-parts"></div>`);
  for (const [name, dealt] of r.parts) {
    const who = h(`<span class="fr-part-name"></span>`);
    who.textContent = name;
    if (name !== "You") theirs(who);
    parts.append(who, Object.assign(h(`<b class="fr-part-n"></b>`), { textContent: fmt(dealt) }));
  }
  b.append(parts);
  if (r.down && game.raid !== week) {
    const btn = h(`<button type="button" class="primary gs-wide">${icon("trophy")}<span>Claim the reward</span></button>`);
    btn.onclick = () => {
      const pay = claimRaid(game, new Date());
      if (!pay) return;
      saveGame();
      sfx("jackpot");
      announce({ type: "raid", xp: pay.xp, tier: "jackpot", badges: pay.badges });
      toast(`Raid won: +${pay.xp} XP and ${pay.coins} coins.`);
      if (pay.colouring) tellColouring(pay.colouring);
      changed();
      btn.replaceWith(h(`<p class="gs-state muted">${icon("clock")}<span>Reward claimed. A new boss arrives on Monday.</span></p>`));
    };
    b.append(btn);
  } else if (r.down) b.append(h(`<p class="gs-state muted">${icon("clock")}<span>Reward claimed. A new boss arrives on Monday.</span></p>`));
  return b;
}

/**
 * The Battle button on each friend on the Friends tab (pages/friends.js): the same choice as the league's Challenge
 * (battle their team as usual, or challenge them on one of my folders), then the battle (the owner: "a battle button
 * on each friend", with "the selector for all the different battle types"). `user` = { id, username }, a friend.
 */
export async function battleFriend(user) {
  let profile = null;
  try { profile = cleanProfiles(await social.gameProfiles([user.id])).get(user.id) || null; } // (from their device: checked, remote.js)
  catch (e) { toast(e.message, { error: true }); return; }
  if (!profile || !profile.team || !profile.team.length) { toast("They haven't opened the game online yet"); return; }
  const name = cleanName(user.username, 40) || "A friend";
  const pick = await challengeChoice(user, name, canChallenge(profile, hasStudyLanguage() ? studyLanguage() : null));
  if (pick) startFriendBattle(user, profile, pick);
}

/**
 * Home, under the creature and its buttons (pages/home.js): the raid of each guild the player is in, the same block as
 * on the Battle screen's Friends side (the owner: it "shouldn't be tucked away in a menu", but "directly on the home
 * screen underneath the player's habitat"). Nothing at all when signed out, offline or in no guild. `host` is shown
 * once there is something in it.
 */
export async function homeRaids(host) {
  let me = null;
  let list = [];
  let profiles = new Map();
  try {
    me = await social.currentUser();
    if (!me) return;
    const guilds = await social.guildsState();
    list = (guilds && guilds.guilds) || [];
    if (!list.length) return;
    const ids = new Set();
    for (const g of list) for (const m of g.members) if (m.id !== me.id) ids.add(m.id);
    profiles = cleanProfiles(await social.gameProfiles([...ids])); // (from their devices: checked first, remote.js)
  } catch { return; }
  if (!host.isConnected) return; // Home was left meanwhile
  const now = new Date();
  host.replaceChildren(...list.map((g) => raidBlock(getGame(), me, g, profiles, now, weekNumber(now), () => {})));
  host.hidden = false;
}

/** No guild yet: the week's boss, and where guilds are made. */
function noGuildBlock(now) {
  const boss = weeklyBoss(now);
  const b = block("Guild raid");
  const box = h(`<div class="gs-empty"><span class="boss"></span><span></span>
    <a class="btn" href="#/friends" data-close>${lineIcon("friends", 18)}<span>Open the Friends tab</span></a></div>`);
  box.querySelector(".boss").style.backgroundImage = `url(${ART}boss/${boss.id}_idle.png)`;
  box.querySelector("span:not(.boss)").textContent = `Join or found a guild (Friends tab) to take on the weekly raid boss together. This week: ${BOSSES.length ? boss.name : ""}.`;
  b.append(box);
  return b;
}

// ---------- the "?": how battling friends works ----------

/** A part of an explanation: a heading, then its points (markup), as arguments (see battle-ui.js helpPart). */
function helpPart(title, ...items) {
  const part = h(`<div><strong></strong><ul class="info-list"></ul></div>`);
  part.querySelector("strong").textContent = title;
  for (const it of items) part.querySelector("ul").append(h(`<li>${it}</li>`));
  return part;
}

/** How the Friends side works, over it (its "?"): challenges, the league, the raid, gifts, and what friends see. */
export function friendsHelp(game, go, opts = {}) {
  const { body } = helpSheet("Battling friends", "rival", opts);
  body.append(
    helpPart("Challenges",
      "Challenge a friend's team: their creatures fight with the moves they chose, and answer as accurately as their owner usually answers their own words. You answer yours.",
      "Each week has its own rule for friend battles: it is under This week's rule.",
      "Friend battles count for your skill rating, and your record against each friend is kept."),
    helpPart("The league",
      "Ranked by the share of days this week each of you reached your own daily goal, whatever its size. Five or more days in a week moves you up a league; one or none moves you down."),
    helpPart("Guild raid",
      "Every right answer in a battle this week, by anyone in the guild, takes one off.",
      "Beat the boss together for 150 XP and 20 coins each. A new boss arrives on Monday."),
    helpPart("Gifts", "Friends can give you things to wear, decorations and eggs. They wait here until you open them."),
    helpPart("What friends see",
      "Your words and study material are never sent: only your team of creatures, how accurately you answer, and this week's totals."),
  );
}
