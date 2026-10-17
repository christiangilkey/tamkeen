// Friends: three parts behind a segmented control at the top, so the page never turns into one
// endless scroll of different things:
//   Feed     my profile (photo, "What I'm studying") and what friends and guild-mates are studying
//   Friends  requests, adding someone, finding a friend, my friends
//   Guilds   invitations, my guilds and their members
// Every person and every guild is the same kind of row: picture or emblem, name, a status line
// (online / last seen), and the actions as line icons in the same place on the right.

import { esc, h, toast, showMenu } from "../app.js";
import * as social from "../social.js";
import { studyCard, studyEditor } from "../components/studycard.js";
import { avatar, tagChips } from "../components/avatar.js";
import { openModal } from "../components/modal.js";
import { icon } from "../icons.js";
import { gameBar } from "../game/friend-bar.js";
import { gameOn } from "../components/gameswitch.js";
import { publishNow } from "../game/friends-game.js";

// Remembered between sessions, per device: which part is showing, and whether my profile is folded.
const SEGMENT = "friends:segment";
const ME_COLLAPSED = "friends:me-collapsed";
const SEGMENTS = [["feed", "Feed"], ["friends", "Friends"], ["guilds", "Guilds"]];
const remembered = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable: it still works for now */ } };

/** "Online", "Last seen 5 min ago", ... from seconds since the person was last seen (null: never). */
export function seenText(seconds, online) {
  if (online) return "Online";
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "Not seen yet";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `Last seen ${Math.max(1, m)} min ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `Last seen ${hrs} h ago`;
  const d = Math.floor(hrs / 24);
  return d < 30 ? `Last seen ${d} day${d === 1 ? "" : "s"} ago` : "Last seen over a month ago";
}

/** A sleek in-app yes/no box instead of the browser's plain one. Resolves to true or false. */
function confirmBox(title, text, { ok = "OK", danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal({ title, onClose: () => resolve(answer) });
    const p = h(`<p class="muted"></p>`);
    p.textContent = text;
    const row = h(`<div class="confirm-buttons"><button type="button" class="ghost">Cancel</button>
      <button type="button" class="${danger ? "danger-solid" : "primary"}"></button></div>`);
    row.lastElementChild.textContent = ok;
    row.firstElementChild.onclick = () => m.close();
    row.lastElementChild.onclick = () => { answer = true; m.close(); };
    m.body.append(p, row);
    row.lastElementChild.focus();
  });
}

export async function render(view) {
  let segment = remembered(SEGMENT, "feed");
  if (!SEGMENTS.some(([id]) => id === segment)) segment = "feed";
  view.append(h(`<div class="page friends-page">
    <h1 class="friends-title">Friends</h1>
    <div class="segmented" role="tablist" aria-label="Friends sections" hidden></div>
    <div id="body"><p class="muted">Loading…</p></div>
    <input type="file" id="photo-file" accept="image/*" hidden>
  </div>`));
  const body = view.querySelector("#body");
  const segBar = view.querySelector(".segmented");
  const photoInput = view.querySelector("#photo-file");
  let disposed = false;
  let editing = false; // true while a form is open: live updates must not redraw over typing
  let friendQuery = ""; // what is typed in "Find a friend": kept across the list's live redraws
  const openGuilds = new Set(); // guilds whose member list is showing

  /** An action as a round line-icon button with a label for touch and screen readers. */
  function iconButton(name, label, run, { cls = "", count = 0 } = {}) {
    const b = h(`<button type="button" class="row-act ${cls}">${icon(name, 18)}${count ? `<span class="nav-count">${count}</span>` : ""}</button>`);
    b.title = label;
    b.setAttribute("aria-label", count ? `${label} (${count} new)` : label);
    b.onclick = async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try { await run(b, e); } catch (err) { toast(err.message, { error: true }); }
      b.disabled = false;
    };
    return b;
  }

  /** The one row layout: lead (picture or emblem), name + tags, status line, then actions on the right. */
  function itemRow({ lead, name, tags = [], status = "", statusOn = false, game = null, actions = [], extra = null, onOpen = null }) {
    const row = h(`<div class="item-row"><div class="item-main">
      <span class="item-lead"></span>
      <span class="item-text"><span class="item-name"><span class="n"></span></span><span class="item-status small"></span></span>
      <span class="item-game"></span><span class="item-actions"></span></div></div>`);
    row.querySelector(".item-lead").append(lead);
    row.querySelector(".n").textContent = name;
    if (tags.length) row.querySelector(".item-name").append(tagChips(tags));
    const st = row.querySelector(".item-status");
    st.textContent = status;
    st.classList.toggle("on", statusOn);
    const bar = game && gameOn() ? gameBar(game) : null;
    if (bar) row.querySelector(".item-game").append(bar);
    else row.querySelector(".item-game").remove();
    row.querySelector(".item-actions").append(...actions);
    if (extra) row.append(extra);
    if (onOpen) {
      const main = row.querySelector(".item-main");
      main.classList.add("openable");
      main.onclick = (e) => { if (!e.target.closest("button, a")) onOpen(); };
    }
    return row;
  }

  function sectionCard(title, countText = "") {
    const sec = h(`<section class="card stack"><h2 class="sec-title"><span></span> <span class="muted small"></span></h2></section>`);
    sec.querySelector(".sec-title span").textContent = title;
    sec.querySelector(".sec-title .small").textContent = countText;
    return sec;
  }

  async function load() {
    if (editing) return;
    let st;
    let mine = null;
    let gs = { guilds: [], invites: [], sent: [] };
    let cards = new Map();
    let unread = new Map();
    let tags = new Map();
    let seen = new Map();
    let games = new Map();
    try {
      st = await social.friendsState();
      if (st && st.me.username) {
        gs = await social.guildsState();
        const everyone = [...new Set([st.me.id, ...st.friends.map((f) => f.user.id), ...gs.guilds.flatMap((g) => g.members.map((m) => m.id))])];
        await publishNow(); // so my own bar (and what friends see of me) is current
        [mine, cards, unread, tags, seen, games] = await Promise.all([
          social.myStatus(), social.statusesOf(everyone.filter((id) => id !== st.me.id)), social.unreadCounts(),
          social.tagsOf(everyone), social.seenAgo(everyone),
          social.gameProfiles(everyone).catch(() => new Map()), // the bar is an extra: never block the list on it
        ]);
      }
    } catch (e) {
      if (disposed) return;
      segBar.hidden = true;
      body.innerHTML = "";
      const p = h(`<div class="card"><p style="color:var(--danger)"></p><button type="button">Try again</button></div>`);
      p.querySelector("p").textContent = e.message;
      p.querySelector("button").onclick = load;
      body.append(p);
      return;
    }
    if (disposed) return;
    // Typing in "Find a friend" when a live update redraws the list: remember, to give the cursor back.
    const findHadFocus = !!document.activeElement && document.activeElement.id === "friend-find";
    body.innerHTML = "";
    if (!st) {
      segBar.hidden = true;
      body.append(h(`<div class="card stack empty-state">
        <h2>Learn together</h2>
        <p class="muted">Add friends by username, form guilds, message each other (with voice notes), send words and
          folders, and see what everyone is studying. Connect your Google account in Settings to start.</p>
        <div><a class="btn primary" href="#/settings">Open Settings → Friends &amp; sharing</a></div>
      </div>`));
      return;
    }
    if (!st.me.username) {
      segBar.hidden = true;
      body.append(h(`<div class="card stack"><p>Pick a username first, so friends can find you.</p>
        <div><a class="btn primary" href="#/settings">Choose a username</a></div></div>`));
      return;
    }

    const online = (id) => (seen.get(id) ?? Infinity) < social.ONLINE_WITHIN_SECONDS;
    const statusOf = (id) => seenText(seen.has(id) ? seen.get(id) : null, online(id));
    const friendIds = new Set(st.friends.map((f) => f.user.id));
    const pendingIds = new Set([...st.outgoing, ...st.incoming].map((r) => r.user.id));
    const messageAct = (userId) => iconButton("message", "Message", async () => { location.hash = `#/chat/${userId}`; },
      { cls: unread.get(userId) ? "has-new" : "", count: unread.get(userId) || 0 });

    // ----- the segmented control (with a count of what is waiting in each part) -----
    const waiting = { feed: 0, friends: st.incoming.length, guilds: gs.invites.length };
    segBar.hidden = false;
    segBar.innerHTML = "";
    for (const [id, label] of SEGMENTS) {
      const b = h(`<button type="button" role="tab" class="seg-btn${id === segment ? " on" : ""}"><span></span></button>`);
      b.querySelector("span").textContent = label;
      b.setAttribute("aria-selected", String(id === segment));
      if (waiting[id]) b.append(h(`<span class="nav-count">${waiting[id]}</span>`));
      b.onclick = () => {
        if (segment === id) return;
        segment = id;
        remember(SEGMENT, id);
        friendQuery = "";
        load();
        view.closest("#view")?.scrollTo?.({ top: 0 });
      };
      segBar.append(b);
    }

    if (segment === "feed") drawFeed();
    else if (segment === "friends") drawFriends();
    else drawGuilds();

    // ======================================================== Feed
    function drawFeed() {
      // My profile: photo, name, tags, game bar, and my card. Folds to one line.
      const me = h(`<section class="card stack me-card">
        <div class="me-head"><button type="button" class="me-photo" title="Change your profile photo"></button>
          <div class="me-id"><div class="me-name"></div><div class="small muted">Tap your picture to change it</div></div>
          <span class="spacer"></span>
          ${st.me.avatar_path ? `<button type="button" class="ghost small-btn" id="photo-remove">Remove photo</button>` : ""}
          <button type="button" class="ghost" id="edit-card">Edit what I'm studying</button>
          <button type="button" class="ghost icon me-toggle" id="me-toggle">${icon("chevron", 18)}</button></div>
        <div id="my-card"></div></section>`);
      const fold = (closed) => {
        me.classList.toggle("collapsed", closed);
        const t = me.querySelector("#me-toggle");
        t.title = closed ? "Show my profile" : "Hide my profile";
        t.setAttribute("aria-label", t.title);
        t.setAttribute("aria-expanded", String(!closed));
      };
      fold(remembered(ME_COLLAPSED, "0") === "1");
      me.querySelector("#me-toggle").onclick = () => {
        const closed = !me.classList.contains("collapsed");
        remember(ME_COLLAPSED, closed ? "1" : "0");
        fold(closed);
      };
      me.querySelector(".me-photo").append(avatar(st.me, { online: true, large: true }));
      me.querySelector(".me-name").textContent = `@${st.me.username}`;
      if ((tags.get(st.me.id) || []).length) me.querySelector(".me-name").append(" ", tagChips(tags.get(st.me.id)));
      const myBar = gameOn() ? gameBar(games.get(st.me.id)) : null;
      if (myBar) {
        // What friends see next to my name. The favourite creature is chosen on the Creatures page of the game.
        myBar.title = "This is what friends see next to your name";
        me.querySelector(".me-head .spacer").after(myBar);
      }
      me.querySelector(".me-photo").onclick = () => photoInput.click();
      const removeBtn = me.querySelector("#photo-remove");
      if (removeBtn) {
        removeBtn.onclick = async () => {
          try { await social.removeAvatar(); toast("Photo removed."); } catch (e) { toast(e.message, { error: true }); }
          load();
        };
      }
      const myBox = me.querySelector("#my-card");
      const card = studyCard(mine, { own: true });
      if (card) myBox.append(card);
      else myBox.append(h(`<p class="small muted">Show your friends what you're learning from: a podcast episode, a YouTube
        video, a song, a film. Add a short note too.</p>`));
      me.querySelector("#edit-card").onclick = (e) => {
        editing = true;
        e.target.hidden = true;
        myBox.innerHTML = "";
        const editor = studyEditor(mine, () => { editing = false; load(); });
        const cancel = h(`<button type="button" class="ghost">Cancel</button>`);
        cancel.onclick = () => { editing = false; load(); };
        editor.querySelector("#se-save").after(cancel);
        myBox.append(editor);
      };
      body.append(me);

      // What friends and guild-mates are studying, most recently changed first.
      const people = new Map();
      for (const f of st.friends) people.set(f.user.id, f.user);
      for (const g of gs.guilds) for (const m of g.members) if (m.id !== st.me.id && !people.has(m.id)) people.set(m.id, m);
      const feed = [...people.values()].map((u) => ({ u, c: cards.get(u.id) }))
        .filter(({ c }) => c && ((c.studying && c.studying.length) || c.message))
        .sort((a, b) => String(b.c.updated_at || "").localeCompare(String(a.c.updated_at || "")));
      const sec = sectionCard("What everyone is studying");
      if (!feed.length) {
        sec.append(h(`<p class="small muted">${people.size ? "Nobody has shared what they're studying yet." :
          "Add friends or join a guild to see what they're studying here."}</p>`));
      }
      for (const { u, c } of feed) {
        sec.append(itemRow({
          lead: avatar(u, { online: online(u.id) }), name: u.username, tags: tags.get(u.id) || [],
          status: statusOf(u.id), statusOn: online(u.id), game: games.get(u.id), actions: [messageAct(u.id)], extra: studyCard(c),
        }));
      }
      body.append(sec);
    }

    // ======================================================== Friends
    function drawFriends() {
      if (st.incoming.length) {
        const sec = sectionCard("Friend requests", String(st.incoming.length));
        for (const r of st.incoming) {
          sec.append(itemRow({ lead: avatar(r.user, { online: null }), name: r.user.username, status: "Wants to be friends", actions: [
            iconButton("check", "Accept", async () => { await social.acceptFriend(r.id); toast(`You and ${r.user.username} are now friends.`); load(); }, { cls: "go" }),
            iconButton("close", "Decline", async () => { await social.removeFriendship(r.id); load(); }),
          ] }));
        }
        body.append(sec);
      }

      const add = h(`<form class="card add-friend">
        <label for="friend-name" class="sec-title">Add a friend</label>
        <div class="add-row"><input type="text" id="friend-name" placeholder="Their username" autocomplete="off" spellcheck="false" maxlength="21">
        <button type="submit" class="primary">Send request</button></div>
      </form>`);
      add.onsubmit = async (e) => {
        e.preventDefault();
        const input = add.querySelector("input");
        const btn = add.querySelector("button");
        btn.disabled = true;
        try {
          const r = await social.addFriend(input.value);
          toast(r.accepted ? `You and ${r.username} are now friends.` : `Request sent to ${r.username}.`);
          input.value = "";
          load();
        } catch (err) {
          toast(err.message, { error: true });
        } finally {
          btn.disabled = false;
        }
      };
      body.append(add);

      const onlineCount = st.friends.filter((f) => online(f.user.id)).length;
      const list = sectionCard("Your friends", st.friends.length ? `${st.friends.length} · ${onlineCount} online` : "");
      if (!st.friends.length) {
        list.append(h(`<p class="small muted">No friends yet. Share your username, <strong>@${esc(st.me.username)}</strong>,
          or add someone above.</p>`));
      }
      // Online friends first, then the most recently seen, then by name.
      const sorted = [...st.friends].sort((a, b) => (online(b.user.id) - online(a.user.id))
        || ((seen.get(a.user.id) ?? Infinity) - (seen.get(b.user.id) ?? Infinity)) || a.user.username.localeCompare(b.user.username));
      const rows = [];
      for (const f of sorted) {
        const row = itemRow({
          lead: avatar(f.user, { online: online(f.user.id) }), name: f.user.username, tags: tags.get(f.user.id) || [],
          status: statusOf(f.user.id), statusOn: online(f.user.id), game: games.get(f.user.id),
          actions: [messageAct(f.user.id), iconButton("userminus", "Remove friend", async () => {
            if (!(await confirmBox(`Remove ${f.user.username}?`, `${f.user.username} will no longer be on your friends list. You can add each other again later.`,
              { ok: "Remove", danger: true }))) return;
            await social.removeFriendship(f.id);
            load();
          }, { cls: "warn" })],
        });
        // What "Find a friend" looks through: the name and any guild tags.
        rows.push([row, [f.user.username, ...(tags.get(f.user.id) || [])].join(" ").toLowerCase()]);
      }
      if (st.friends.length) {
        // Find a friend: narrows the list as you type. The list redraws itself when friends come
        // online or message you, so the typed text (and the cursor) is put back afterwards.
        const find = h(`<input type="search" id="friend-find" class="friend-find" placeholder="Find a friend" aria-label="Find a friend"
          autocomplete="off" spellcheck="false">`);
        const none = h(`<p class="small muted" hidden></p>`);
        const filter = () => {
          const q = friendQuery.trim().replace(/^@/, "").toLowerCase();
          let shown = 0;
          for (const [row, hay] of rows) {
            row.hidden = !!q && !hay.includes(q);
            if (!row.hidden) shown++;
          }
          none.hidden = shown > 0;
          none.textContent = shown ? "" : `No friend called “${friendQuery.trim()}”.`;
        };
        find.value = friendQuery;
        find.oninput = () => { friendQuery = find.value; filter(); };
        list.append(find);
        for (const [row] of rows) list.append(row);
        list.append(none);
        filter();
        if (findHadFocus) setTimeout(() => { find.focus(); find.setSelectionRange(find.value.length, find.value.length); }, 0);
      }
      body.append(list);

      if (st.outgoing.length) {
        const sec = sectionCard("Waiting for them to accept");
        for (const r of st.outgoing) {
          sec.append(itemRow({ lead: avatar(r.user, { online: null }), name: r.user.username, status: "Request sent", actions: [
            iconButton("close", "Cancel request", async () => { await social.removeFriendship(r.id); load(); }),
          ] }));
        }
        body.append(sec);
      }
    }

    // ======================================================== Guilds
    function drawGuilds() {
      const emblem = (tag) => { const e = h(`<span class="guild-emblem"></span>`); e.textContent = tag; return e; };

      if (gs.invites.length) {
        const sec = sectionCard("Guild invitations", String(gs.invites.length));
        for (const inv of gs.invites) {
          sec.append(itemRow({ lead: emblem(inv.guild.tag), name: inv.guild.name, status: `${inv.inviter} invited you`, actions: [
            iconButton("check", "Join", async () => { await social.acceptGuildInvite(inv.id); toast(`You joined ${inv.guild.name}.`); load(); }, { cls: "go" }),
            iconButton("close", "Decline", async () => { await social.declineGuildInvite(inv.id).catch(() => {}); load(); }),
          ] }));
        }
        body.append(sec);
      }

      const sec = sectionCard("Your guilds", gs.guilds.length ? String(gs.guilds.length) : "");
      const newBtn = h(`<button type="button" class="ghost new-guild">${icon("add", 16)} New guild</button>`);
      sec.querySelector(".sec-title").append(newBtn);
      const form = h(`<div></div>`);
      sec.append(form);
      const guildForm = (target, existing, done) => {
        editing = true;
        target.innerHTML = "";
        const f = h(`<form class="guild-form">
          <div class="add-row"><input type="text" name="name" placeholder="Guild name" maxlength="40" required autocomplete="off">
          <input type="text" name="tag" class="tag-input" placeholder="TAG" maxlength="5" required autocomplete="off" title="${esc(social.GUILD_TAG_HELP)}"></div>
          <div class="small muted">The tag appears beside members' names. ${esc(social.GUILD_TAG_HELP)}</div>
          <div class="confirm-buttons"><button type="button" class="ghost" data-cancel>Cancel</button>
            <button type="submit" class="primary">${existing ? "Save" : "Create"}</button></div>
        </form>`);
        if (existing) { f.name.value = existing.name; f.tag.value = existing.tag; }
        f.querySelector("[data-cancel]").onclick = () => { editing = false; load(); };
        f.onsubmit = async (e) => {
          e.preventDefault();
          const name = f.name.value.trim();
          const tag = f.tag.value.trim().toUpperCase();
          try {
            await done(name, tag);
            editing = false;
            load();
          } catch (err) { toast(err.message, { error: true }); }
        };
        target.append(f);
        f.name.focus();
      };
      newBtn.onclick = () => guildForm(form, null,
        async (name, tag) => { await social.createGuild(name, tag); toast(`Guild “${name}” created. Invite your friends!`); });

      if (!gs.guilds.length) {
        sec.append(h(`<p class="small muted">A guild is a group of friends with its own name and tag. Everyone in it sees
          each other here, with what they're studying, and can message each other. Create one, or wait for an invitation.</p>`));
      }
      for (const g of gs.guilds) {
        const others = g.members.filter((m) => m.id !== st.me.id);
        const nOnline = others.filter((m) => online(m.id)).length;
        const actions = [];
        actions.push(iconButton("userplus", "Invite a friend", async (b) => {
          const memberIds = new Set(g.members.map((m) => m.id));
          const invited = new Set(gs.sent.filter((s) => s.guild_id === g.id).map((s) => s.invitee));
          const choices = st.friends.filter((f) => !memberIds.has(f.user.id));
          if (!choices.length) {
            toast(st.friends.length ? "All your friends are already in this guild." : "Add a friend first, then invite them.");
            return;
          }
          const r = b.getBoundingClientRect();
          showMenu(r.left, r.bottom + 4, `Invite to ${g.name}`, choices.map((f) => ({
            label: `@${f.user.username}${invited.has(f.user.id) ? " (invited)" : ""}`,
            run: async () => {
              try { await social.inviteToGuild(g.id, f.user.id); toast(`Invited ${f.user.username} to ${g.name}.`); } catch (err) { toast(err.message, { error: true }); }
              load();
            },
          })));
        }));
        if (g.mine) {
          actions.push(iconButton("edit", "Rename", async () => {
            openGuilds.add(g.id);
            const target = sec.querySelector(`[data-guild="${g.id}"] .guild-edit`);
            guildForm(target, g, (name, tag) => social.updateGuild(g.id, { name, tag }));
          }));
        }
        actions.push(iconButton("leave", "Leave guild", async () => {
          const last = g.members.length === 1;
          const ok = await confirmBox(`Leave ${g.name}?`, last ? "You're the only member, so the guild will be closed."
            : g.mine ? "The longest-standing member becomes its founder." : "You can join again if someone invites you.", { ok: "Leave", danger: true });
          if (!ok) return;
          await social.leaveGuild(g.id);
          load();
        }, { cls: "warn" }));

        const open = openGuilds.has(g.id);
        const members = h(`<div class="guild-members"><div class="guild-edit"></div></div>`);
        members.hidden = !open;
        for (const m of others) {
          const mActs = [messageAct(m.id)];
          if (!friendIds.has(m.id)) {
            mActs.push(pendingIds.has(m.id)
              ? iconButton("userplus", "Request pending", async () => {}, { cls: "muted-act" })
              : iconButton("userplus", "Add friend", async () => {
                const r = await social.addFriend(m.username);
                toast(r.accepted ? `You and ${r.username} are now friends.` : `Request sent to ${r.username}.`);
                load();
              }));
          }
          if (g.mine) {
            mActs.push(iconButton("userminus", `Remove from ${g.name}`, async () => {
              if (!(await confirmBox(`Remove ${m.username}?`, `${m.username} will no longer be in ${g.name}.`, { ok: "Remove", danger: true }))) return;
              await social.removeGuildMember(g.id, m.id);
              load();
            }, { cls: "warn" }));
          }
          members.append(itemRow({
            lead: avatar(m, { online: online(m.id) }), name: m.username, tags: (tags.get(m.id) || []).filter((t) => t !== g.tag),
            status: m.id === g.owner ? `Founder · ${statusOf(m.id)}` : statusOf(m.id), statusOn: online(m.id),
            game: games.get(m.id), actions: mActs, extra: studyCard(cards.get(m.id)),
          }));
        }
        if (!others.length) members.append(h(`<p class="small muted">Just you so far. Invite a friend to get it going.</p>`));

        const status = `${g.members.length} member${g.members.length === 1 ? "" : "s"}${nOnline ? ` · ${nOnline} online` : ""}${g.mine ? " · you founded it" : ""}`;
        const toggle = h(`<button type="button" class="row-act chev-act${open ? " open" : ""}">${icon("chevron", 18)}</button>`);
        toggle.title = open ? "Hide members" : "Show members";
        toggle.setAttribute("aria-label", toggle.title);
        toggle.setAttribute("aria-expanded", String(open));
        const flip = () => {
          const nowOpen = members.hidden;
          members.hidden = !nowOpen;
          toggle.classList.toggle("open", nowOpen);
          toggle.title = nowOpen ? "Hide members" : "Show members";
          toggle.setAttribute("aria-label", toggle.title);
          toggle.setAttribute("aria-expanded", String(nowOpen));
          if (nowOpen) openGuilds.add(g.id); else openGuilds.delete(g.id);
        };
        toggle.onclick = (e) => { e.stopPropagation(); flip(); };
        const row = itemRow({ lead: emblem(g.tag), name: g.name, status, statusOn: nOnline > 0, actions: [...actions, toggle], extra: members, onOpen: flip });
        row.classList.add("guild-row");
        row.dataset.guild = g.id;
        sec.append(row);
      }
      body.append(sec);
    }
  }

  photoInput.onchange = async () => {
    const file = photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    try {
      toast("Uploading your photo…", { timeout: 1500 });
      await social.uploadAvatar(file);
      toast("Profile photo updated.");
    } catch (e) {
      toast(e.message, { error: true });
    }
    load();
  };

  await load();
  // Live: requests, invitations, messages, cards and guild changes appear without reloading;
  // online dots refresh every minute.
  let timer;
  const off = await social.onActivity(() => { clearTimeout(timer); timer = setTimeout(load, 300); });
  const tick = setInterval(load, 60000);
  return () => { disposed = true; off(); clearTimeout(timer); clearInterval(tick); };
}
