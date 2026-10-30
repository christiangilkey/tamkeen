// "What I'm studying" cards on the Friends tab: up to three things (a podcast episode, a
// YouTube video, an Instagram reel, a web page, a Spotify or Apple Music song, an IMDb film or
// series) plus a short personal note. `studyCard` shows a card; `studyEditor` edits your own.
// Everything a friend typed is inserted as plain text, and only https links are ever used.
//
// Tapping an item opens it in Tamkeen's own player for its kind (see openItem): the players
// are reached through their ordinary doors (youtube.js, pageimport.js, the reels and episode
// routes), never changed from here. Spotify and Apple Music play in their mini-player in the
// card; IMDb, which has no player, opens its page.

import { api, esc, h, toast } from "../app.js";
import * as social from "../social.js";
import { confirmBox } from "./modal.js";
import { t } from "../i18n.js";

const KINDS = { podcast: "🎧 Podcast", youtube: "▶ YouTube", reel: "🎞 Instagram reel", page: "📄 Web page",
                spotify: "♫ Spotify", apple: "♪ Apple Music", imdb: "🎬 IMDb" };
/** What the button on each kind that opens inside Tamkeen says. */
const OPEN_LABEL = { podcast: "▶ Listen", youtube: "▶ Watch", reel: "▶ Watch", page: "Read" };

function feedUrl(text) {
  try {
    const u = new URL(String(text || ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** The episode of `feedId` that a card's podcast item means, or null. Newer cards carry the
 * episode's own id (guid) and audio address; older ones only its title. */
async function findEpisode(feedId, s) {
  const list = async (q) => (await api(`/episodes?feed_id=${feedId}&limit=${q ? 50 : 500}${q ? `&q=${encodeURIComponent(q)}` : ""}`)).items;
  const exact = (eps) => eps.find((ep) => (s.guid && ep.guid === s.guid) || (s.audio_url && ep.audio_url === s.audio_url));
  let found = s.guid || s.audio_url ? exact(await list("")) : null;
  if (!found && s.title) {
    const byTitle = await list(String(s.title).slice(0, 80));
    found = exact(byTitle) || byTitle.find((ep) => sameText(ep.title, s.title)) || null;
  }
  return found || null;
}

/** Open a podcast episode from a card in the podcast player. A podcast the viewer doesn't
 * follow is added first, after asking. */
async function openPodcast(s) {
  const url = feedUrl(s.feed_url);
  if (!url) throw new Error("This card doesn't say which podcast the episode is from.");
  let feed = (await api("/feeds")).find((f) => sameText(f.url, url));
  let added = false;
  if (!feed) {
    if (!(await confirmBox(s.subtitle ? t("Add “{0}” to your library and open this episode?", s.subtitle) : t("Add this podcast to your library and open this episode?"), "", { ok: "Add" }))) return;
    feed = await api("/feeds", { method: "POST", body: { url } });
    added = true;
  }
  const ep = await findEpisode(feed.id, s);
  if (ep) { location.hash = `#/episode/${ep.id}`; return; }
  // The phone gets a new podcast's episodes from the computer, and old episodes can leave a feed.
  toast(added ? `Added ${feed.title}. The episode will be here once its episode list has arrived.`
    : `“${s.title}” isn't in ${feed.title}'s episode list any more.`);
  location.hash = `#/feed/${feed.id}`;
}

/** Open a reel in the reel player. One that isn't in the library yet is fetched the usual way
 * (the Reels page shows it arriving), which needs Instagram and a way to transcribe. */
async function openReel(s) {
  const code = social.reelCode(s.url);
  if (!code) throw new Error("That isn't a reel link.");
  const feed = (await api("/feeds")).find((f) => f.url === "local:reels");
  const mine = feed ? (await api(`/episodes?feed_id=${feed.id}&limit=500`)).items.find((ep) => ep.guid === code) : null;
  if (mine && mine.status === "done") { location.hash = `#/reels/play?at=${mine.id}`; return; }
  try {
    await api("/reels/saved/send", { method: "POST", body: { codes: [code] } });
  } catch (e) {
    toast(`Couldn't get this reel into the reel player: ${e.message}`,
          { error: true, action: { label: "Open on Instagram", run: () => window.open(social.safeUrl(s.url), "_blank", "noopener") } });
    return;
  }
  toast("Getting this reel ready: it opens in the reel player from the Reels page when it's done.");
  location.hash = "#/reels";
}

/** Open a web page in the reader, importing it first unless it is already in the library. */
async function openPage(s) {
  const url = social.safeUrl(s.url);
  if (!url) throw new Error("That isn't a web link.");
  const feed = (await api("/feeds")).find((f) => f.url === "local:pages");
  const mine = feed ? (await api(`/episodes?feed_id=${feed.id}&limit=500`)).items.find((ep) => ep.audio_url === url || ep.guid === url) : null;
  if (mine) { location.hash = `#/episode/${mine.id}`; return; }
  const { importUrl } = await import("../pageimport.js");
  const ep = await importUrl(url);
  location.hash = `#/episode/${ep.id}`;
}

/** The kinds that open inside Tamkeen, each through its player's own entry point. */
const OPENERS = {
  podcast: openPodcast,
  youtube: async (s) => { await (await import("../youtube.js")).watchVideo(social.safeUrl(s.url)); },
  reel: openReel,
  page: openPage,
};

/** Open an item in Tamkeen's player for its kind (throws with a message if it can't). */
export async function openItem(s) {
  if (!s || !OPENERS[s.kind]) throw new Error("This kind of thing has no player in Tamkeen.");
  await OPENERS[s.kind](s);
}

/** One item's card (picture, title, and the action that fits its kind). */
function itemCard(s, { own = false } = {}) {
  const image = social.safeUrl(s.image);
  const wrap = h(`<div class="study-item"></div>`);
  const card = h(`<div class="study-card${s.kind === "imdb" ? " poster" : ""}">
    ${image ? `<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph"></div>`}
    <div class="study-text"><div class="study-kind small muted"></div><div class="study-title" dir="auto"></div>
      <div class="study-sub small muted" dir="auto"></div></div>
    <div class="study-actions"></div>
  </div>`);
  card.querySelector(".study-kind").textContent = KINDS[s.kind];
  card.querySelector(".study-title").textContent = s.title || "";
  card.querySelector(".study-sub").textContent = s.subtitle || "";
  const actions = card.querySelector(".study-actions");
  const link = social.safeUrl(s.url);
  wrap.append(card);
  const embed = s.kind === "spotify" ? social.spotifyEmbedUrl(link) : s.kind === "apple" ? social.appleEmbedUrl(link) : "";
  if (embed) {
    const play = h(`<button type="button">▶ Play</button>`);
    let frame = null;
    play.onclick = () => {
      if (frame) { frame.remove(); frame = null; play.textContent = "▶ Play"; return; }
      frame = h(`<iframe class="music-frame ${s.kind}" loading="lazy" allow="autoplay *; encrypted-media *; clipboard-write" title="Music player"></iframe>`);
      frame.src = embed;
      card.after(frame);
      play.textContent = "✕ Close";
    };
    actions.append(play);
    // The whole card works like its button (Spotify and Apple Music stay in their mini-player).
    card.classList.add("tappable");
    card.onclick = (e) => { if (!e.target.closest("button, a")) play.click(); };
  } else if (OPENERS[s.kind] && (s.kind === "podcast" ? feedUrl(s.feed_url) : link)) {
    // Opens inside Tamkeen, in the player for this kind of thing.
    const open = h(`<button type="button" class="primary"></button>`);
    open.textContent = OPEN_LABEL[s.kind];
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      open.disabled = true;
      card.classList.add("busy");
      try {
        await OPENERS[s.kind](s);
      } catch (e) {
        // Still reachable when Tamkeen's player can't take it (say, a video with no captions
        // in the language being studied): offer the page itself.
        toast(e.message, { error: true, action: link ? { label: s.kind === "youtube" ? "Open on YouTube" : "Open the link",
                                                         run: () => window.open(link, "_blank", "noopener") } : undefined });
      } finally {
        busy = false;
        open.disabled = false;
        card.classList.remove("busy");
      }
    };
    open.onclick = (e) => { e.stopPropagation(); run(); };
    actions.append(open);
    card.classList.add("tappable");
    card.title = `Open in Tamkeen: ${s.title || ""}`;
    card.onclick = (e) => { if (!e.target.closest("button, a")) run(); };
  } else if ((s.kind === "imdb" || s.kind === "apple" || s.kind === "spotify") && link) {
    // No player in Tamkeen for these: the page itself opens.
    const open = h(`<a class="btn" target="_blank" rel="noopener"></a>`);
    open.textContent = "Open ↗";
    open.href = link;
    actions.append(open);
    card.classList.add("tappable");
    card.onclick = (e) => { if (!e.target.closest("button, a")) open.click(); };
  }
  return wrap;
}

/** Element showing a status {studying, message}, or null when there's nothing to show. */
export function studyCard(status, { own = false } = {}) {
  const items = social.studyItems(status && status.studying).filter((s) => KINDS[s.kind]);
  const note = status && status.message ? String(status.message) : "";
  if (!items.length && !note) return null;
  const wrap = h(`<div class="study"></div>`);
  if (items.length) {
    const label = h(`<div class="study-label small muted"></div>`);
    label.textContent = own ? "You're studying" : "Is studying";
    wrap.append(label);
    for (const s of items) wrap.append(itemCard(s, { own }));
  }
  if (note) {
    const n = h(`<div class="study-note" dir="auto"></div>`);
    n.textContent = note;
    wrap.append(n);
  }
  return wrap;
}

/** Editor for your own card: three link bars, a note, and a guide to what can be pasted.
 * Calls onSaved() after saving. Empty bars are simply left out of the card. */
export function studyEditor(current, onSaved) {
  const items = social.studyItems(current && current.studying).filter((s) => KINDS[s.kind]);
  const slots = Array.from({ length: social.MAX_STUDY_ITEMS }, (_, i) => items[i] || null);

  const el = h(`<div class="study-editor stack">
    <div class="row">
      <span class="small muted">Add up to ${social.MAX_STUDY_ITEMS} things. Leave a bar empty and it isn't shown.</span>
      <span class="spacer"></span>
      <button type="button" class="ghost small-btn" id="se-help-btn" aria-expanded="false">ⓘ What can I paste?</button>
    </div>
    <div class="se-help card" id="se-help" hidden>
      <strong>Links that work here</strong>
      <ul>${social.LINK_TYPES.map(([name, what, example]) =>
        `<li><strong>${esc(name)}</strong>: ${esc(what)}${example ? `<br><span class="small muted">${esc(example)}</span>` : ""}</li>`).join("")}</ul>
      <p class="small muted">Paste a link into a bar and its title and picture appear. Nothing else is read from the link.</p>
    </div>
    <div id="se-slots" class="stack"></div>
    <label class="stack-label small muted">Your note (optional)
      <input type="text" id="se-note" maxlength="300" placeholder="e.g. Working on Levantine listening this month" dir="auto"></label>
    <div class="row" id="se-buttons"><button type="button" class="primary" id="se-save">Save</button>
      <span class="small muted">Only your friends see this, on their Friends tab.</span></div>
  </div>`);
  const $ = (q) => el.querySelector(q);
  $("#se-note").value = (current && current.message) || "";
  $("#se-help-btn").onclick = (e) => {
    const box = $("#se-help");
    box.hidden = !box.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!box.hidden));
  };

  function paintSlot(i) {
    const box = $("#se-slots").children[i];
    box.innerHTML = "";
    const item = slots[i];
    if (item) {
      const row = h(`<div class="se-filled"></div>`);
      const preview = itemCard(item, { own: true });
      // While editing, the card is only a preview: tapping it must not leave the editor.
      preview.querySelectorAll(".study-card").forEach((c) => { c.onclick = null; c.classList.remove("tappable"); c.removeAttribute("title"); });
      preview.querySelectorAll(".study-actions button.primary").forEach((b) => b.remove());
      row.append(preview);
      const clear = h(`<button type="button" class="ghost" title="Remove this one">✕</button>`);
      clear.onclick = () => { slots[i] = null; paintSlot(i); };
      row.append(clear);
      box.append(row);
      return;
    }
    const bar = h(`<form class="se-bar row">
      <span class="se-num small muted">${i + 1}</span>
      <input type="url" placeholder="Paste a link: YouTube, a reel, a web page, Spotify, Apple Music, IMDb" autocomplete="off" style="flex:1;min-width:160px">
      <button type="submit">Add</button>
      <button type="button" class="ghost se-pod" title="Pick a podcast episode from your library">🎧</button>
    </form>
    `);
    const input = bar.querySelector("input");
    const add = async () => {
      const text = input.value.trim();
      if (!text) return;
      const btn = bar.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "…";
      try {
        slots[i] = await social.previewLink(text);
        paintSlot(i);
      } catch (err) {
        toast(err.message, { error: true });
        btn.disabled = false;
        btn.textContent = "Add";
      }
    };
    bar.onsubmit = (e) => { e.preventDefault(); add(); };
    input.addEventListener("paste", () => setTimeout(add, 0));
    box.append(bar);

    // Podcast picker (opens under the bar).
    const picker = h(`<div class="stack" hidden>
      <input type="search" placeholder="Search your episodes by title…" autocomplete="off">
      <div class="se-results"></div></div>`);
    const results = picker.querySelector(".se-results");
    async function search(q) {
      try {
        const data = await api(`/episodes?limit=8${q ? `&q=${encodeURIComponent(q)}` : ""}`);
        results.innerHTML = "";
        const eps = data.items.filter((ep) => !(ep.feed_url || "").startsWith("local:"));
        if (!eps.length) results.append(h(`<div class="small muted">No episodes found.</div>`));
        for (const ep of eps) {
          const row = h(`<button type="button" class="se-result"><span class="t" dir="auto"></span><span class="small muted" dir="auto"></span></button>`);
          row.querySelector(".t").textContent = ep.title;
          row.querySelector(".muted").textContent = ep.feed_title || "";
          row.onclick = () => {
            slots[i] = { kind: "podcast", title: String(ep.title || "").slice(0, 200), subtitle: String(ep.feed_title || "").slice(0, 120),
                         image: social.safeUrl(ep.image || ep.feed_image || ""), feed_url: feedUrl(ep.feed_url),
                         guid: String(ep.guid || "").slice(0, 200), audio_url: /^https?:/.test(ep.audio_url || "") && String(ep.audio_url).length <= 300 ? String(ep.audio_url) : "" };
            paintSlot(i);
          };
          results.append(row);
        }
      } catch (e) {
        results.textContent = e.message;
      }
    }
    let timer;
    picker.querySelector("input").oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => search(e.target.value.trim()), 250); };
    bar.querySelector(".se-pod").onclick = () => {
      picker.hidden = !picker.hidden;
      if (!picker.hidden) { picker.querySelector("input").focus(); search(""); }
    };
    box.append(picker);
  }
  for (let i = 0; i < slots.length; i++) {
    $("#se-slots").append(h(`<div class="se-slot"></div>`));
    paintSlot(i);
  }

  $("#se-save").onclick = async (e) => {
    e.target.disabled = true;
    try {
      // A link typed but not yet added still counts.
      for (let i = 0; i < slots.length; i++) {
        const pending = $("#se-slots").children[i].querySelector(".se-bar input");
        if (!slots[i] && pending && pending.value.trim()) slots[i] = await social.previewLink(pending.value);
      }
      await social.setStatus({ studying: slots.filter(Boolean), message: $("#se-note").value });
      toast("Saved. Your friends will see it on their Friends tab.");
      if (onSaved) onSaved();
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      e.target.disabled = false;
    }
  };

  return el;
}
