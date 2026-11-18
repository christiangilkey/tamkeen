// The guild tavern (a prototype: "guild_tavern" in prototype.js): a room where the favourite creatures of a guild's
// members spend their time. They wander between the hearth, the bar and the tables, and tapping one shows whose it
// is and what they are studying. One tavern is shown at a time, on Home and on the Friends tab's Guilds page; arrows
// switch between my guilds, and the last one looked at is remembered on this device.
// The owner's choices (2026-11-17): a plain fantasy tavern; one tavern with arrows; creatures live there and a tap
// shows the owner. The art is web/game-art/tavern/ (tools/game_art/tavern.py); who is inside: tavernrules.js.

import { h } from "../app.js";
import { t } from "../i18n.js";
import { icon as lineIcon } from "../icons.js";
import * as social from "../social.js";
import { beastById } from "./data.js";
import { describe } from "./genome.js";
import { showcaseGenome } from "./battle.js";
import { showcaseOf } from "./rules.js";
import { cleanProfiles } from "./remote.js";
import { animAt, beastHeight, composeCreature, drawLiving, loadImage } from "./render.js";
import { getGame } from "./game.js";
import { BANNER, FIRE, FLAMES, PROPS, ROOM, SPOTS, castOf, nextSpot, pickGuild } from "./tavernrules.js";

const KEY = "tamkeenTavernGuild"; // the guild last looked at, on this device
const SPEED = 24;                 // px a second a creature walks
const SAY_MS = 4000;              // how long "whose creature is this" stays up

const remembered = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const remember = (id) => { try { localStorage.setItem(KEY, id); } catch { /* nothing kept: the first guild shows */ } };

/**
 * Fill `host` with the tavern (it stays hidden when I'm in no guild or not signed in). `given` = {me, guilds} when
 * the caller has them already (the Guilds page), so nothing is asked for twice.
 */
export async function tavernBlock(host, given = null) {
  let meId = null;
  let guilds = [];
  try {
    if (given) { meId = given.me; guilds = given.guilds || []; }
    else {
      const me = await social.currentUser();
      if (!me) return;
      const gs = await social.guildsState();
      meId = me.id;
      guilds = (gs && gs.guilds) || [];
    }
  } catch { return; }
  if (!guilds.length || !host.isConnected) return;
  const others = [...new Set(guilds.flatMap((g) => g.members.map((m) => m.id)))].filter((id) => id !== meId);
  const [profiles, statuses, seen] = await Promise.all([
    social.gameProfiles(others).then(cleanProfiles, () => new Map()), // (from their devices: checked first, remote.js)
    social.statusesOf(others).catch(() => new Map()),
    social.seenAgo(others).catch(() => new Map()),
  ]);
  if (!host.isConnected) return; // the page was left meanwhile
  const genomes = new Map();
  for (const [id, p] of profiles) { const g = showcaseGenome(p); if (g) genomes.set(id, g); }
  const mine = showcaseOf(getGame());
  if (mine) genomes.set(meId, mine);

  const card = h(`<section class="tavern card">
    <div class="tavern-head">
      <button type="button" class="ghost icon tavern-prev" title="Previous guild" aria-label="Previous guild">${lineIcon("back", 18)}</button>
      <div class="tavern-title"><strong></strong><span class="small muted">Guild tavern</span></div>
      <button type="button" class="ghost icon tavern-next" title="Next guild" aria-label="Next guild">${lineIcon("ahead", 18)}</button>
    </div>
    <div class="tavern-scene"></div>
    <p class="small muted tavern-foot"></p>
  </section>`);
  const prev = card.querySelector(".tavern-prev");
  const next = card.querySelector(".tavern-next");
  prev.hidden = next.hidden = guilds.length < 2;
  let current = pickGuild(guilds, remembered());
  let scene = null;
  function show(g) {
    if (scene) scene.dispose();
    current = g;
    remember(g.id);
    card.querySelector(".tavern-title strong").textContent = g.name;
    const cast = castOf(g.members, { meId, genomes, seen });
    // (whole sentences, each translated on its own: joined into one line the page's translator can't match them)
    const n = cast.inside.length;
    const foot = [n === 0 ? t("No one's creature is here yet.")
      : n === 1 ? t("1 creature inside: tap it to see whose it is.") : t("{0} creatures inside: tap one to see whose it is.", n)];
    if (cast.out) foot.push(cast.out === 1 ? t("1 more is out for now.") : t("{0} more are out for now.", cast.out));
    if (cast.none) foot.push(cast.none === 1 ? t("1 member hasn't hatched a creature to show yet.")
      : t("{0} members haven't hatched a creature to show yet.", cast.none));
    card.querySelector(".tavern-foot").textContent = foot.join(" ");
    scene = tavernScene(card.querySelector(".tavern-scene"), cast.inside, g, statuses);
  }
  const step = (by) => show(guilds[(guilds.indexOf(current) + by + guilds.length) % guilds.length]);
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  host.replaceChildren(card);
  host.hidden = false;
  show(current);
}

/** "What I'm studying" in a few words, from a status card. */
function studyingLine(status) {
  const item = status && Array.isArray(status.studying) ? status.studying.find((x) => x && x.title) : null;
  if (item) return `Studying: ${item.title}`;
  return status && status.message ? status.message : "";
}

/** The room, drawn and alive in `box`: `inside` from tavernrules.castOf. Returns {dispose}. */
export function tavernScene(box, inside, guild, statuses) {
  const { w: W, h: H } = ROOM;
  const canvas = h(`<canvas width="${W}" height="${H}"></canvas>`);
  canvas.setAttribute("aria-label", `${guild.name}'s tavern`);
  const tag = h(`<span class="tavern-tag" translate="no"></span>`);
  tag.textContent = guild.tag || "";
  tag.style.left = `${(BANNER.x / W) * 100}%`;
  tag.style.top = `${(BANNER.y / H) * 100}%`;
  const say = h(`<div class="tavern-say" hidden><b></b><span></span></div>`);
  box.replaceChildren(canvas, tag, say);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const art = {};
  const files = { room: "tavern/room.png", fire: "tavern/fire.png", flame: "tavern/flame.png", shadow: "fx/shadow_m.png" };
  for (const p of PROPS) files[p.id] = `tavern/${p.id}.png`;
  for (const [k, f] of Object.entries(files)) loadImage(f).then((img) => { art[k] = img; });

  // Each creature starts at its own spot (the seats first, so the tavern looks lived in), then wanders.
  const order = SPOTS.map((_, i) => i).sort((a, b) => (SPOTS[a].kind === "seat" ? -1 : 0) - (SPOTS[b].kind === "seat" ? -1 : 0) || Math.random() - 0.5);
  const cast = inside.map((m, i) => {
    const at = order[i % order.length];
    return { ...m, look: describe(m.genome), at, to: null, x: SPOTS[at].x, y: SPOTS[at].y, dir: Math.random() < 0.5 ? -1 : 1,
             wait: 2 + Math.random() * 8, walkMs: 0, seed: i * 7 + 3, frames: {}, lastPic: null };
  });
  const status = new Map(statuses);

  function frameOf(c, pose) {
    const key = `${pose.anim}|${pose.frame}|${pose.eyes}`;
    if (!(key in c.frames)) {
      c.frames[key] = null; // being made: the last picture shows meanwhile
      composeCreature(c.look, pose).then((pic) => { c.frames[key] = pic; }, () => { delete c.frames[key]; });
    }
    const pic = c.frames[key] || c.lastPic;
    if (pic) c.lastPic = pic;
    return pic;
  }

  function move(c, dt) {
    if (c.to === null) {
      if ((c.wait -= dt) > 0) return false;
      const taken = new Set(cast.filter((o) => o !== c).flatMap((o) => [o.at, o.to]).filter((i) => i !== null));
      c.to = nextSpot(Math.random, taken, c.at);
      if (c.to === null) { c.wait = 3; return false; }
    }
    const goal = SPOTS[c.to];
    const dx = goal.x - c.x, dy = goal.y - c.y;
    const d = Math.hypot(dx, dy);
    const stepPx = SPEED * dt;
    if (d <= stepPx) {
      c.x = goal.x; c.y = goal.y; c.at = c.to; c.to = null;
      c.wait = 5 + Math.random() * 10;
      if (goal.kind === "bar") c.dir = 1; else if (goal.kind === "fire") c.dir = -1; else if (goal.kind === "seat") c.dir = Math.random() < 0.5 ? -1 : 1;
      return false;
    }
    c.x += (dx / d) * stepPx;
    c.y += (dy / d) * stepPx;
    if (Math.abs(dx) > 1) c.dir = dx < 0 ? -1 : 1;
    c.walkMs += dt * 1000;
    return true;
  }

  function draw(now, dt) {
    ctx.clearRect(0, 0, W, H);
    if (art.room) ctx.drawImage(art.room, 0, 0);
    if (art.fire) {
      const f = Math.floor(now / 110) % FIRE.frames;
      ctx.drawImage(art.fire, f * FIRE.w, 0, FIRE.w, FIRE.h, FIRE.x, FIRE.y, FIRE.w, FIRE.h);
    }
    if (art.flame) FLAMES.forEach((p, i) => {
      const f = Math.floor(now / 160 + i * 1.7) % 4;
      ctx.drawImage(art.flame, f * 5, 0, 5, 7, p.x, p.y, 5, 7);
    });
    // Furniture and creatures, back to front, so a table hides the legs of whoever sits behind it.
    const things = [...PROPS.map((p) => ({ base: p.base, prop: p })), ...cast.map((c) => ({ base: c.y, c }))].sort((a, b) => a.base - b.base);
    for (const t of things) {
      if (t.prop) { const img = art[t.prop.id]; if (img) ctx.drawImage(img, t.prop.x, t.prop.y); continue; }
      const c = t.c;
      const moving = move(c, dt);
      const pose = moving ? animAt(c.look, "walk", c.walkMs) : animAt(c.look, "idle", now, c.seed);
      const pic = frameOf(c, pose);
      if (!pic) continue;
      if (art.shadow) ctx.drawImage(art.shadow, Math.round(c.x - c.dir * 3 - art.shadow.width / 2), Math.round(c.y - art.shadow.height / 2));
      ctx.save();
      ctx.translate(Math.round(c.x), Math.round(c.y));
      if (c.dir < 0) ctx.scale(-1, 1);
      drawLiving(ctx, pic, c.look, now); // (as drawImage(pic, -FRAME / 2, -FRAME): render.js)
      ctx.restore();
    }
    if (shown) placeSay();
  }

  // Tapping a creature: whose it is, and what they are studying.
  let shown = null;
  let sayTimer = 0;
  function placeSay() {
    const top = shown.y - beastHeight(shown.look) - 4;
    say.style.left = `${(Math.max(50, Math.min(W - 50, shown.x)) / W) * 100}%`;
    say.style.bottom = `${(Math.min(H - 30, H - top) / H) * 100}%`;
  }
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const hit = cast.filter((c) => Math.abs(x - c.x) < 20 && y <= c.y + 4 && y >= c.y - beastHeight(c.look)).sort((a, b) => b.y - a.y)[0];
    if (!hit) { say.hidden = true; shown = null; return; }
    shown = hit;
    const name = hit.genome.name || beastById(hit.look.beast).name;
    say.querySelector("b").textContent = hit.me ? `You · ${name}` : `${hit.username} · ${name}`;
    const line = hit.me ? "Your favourite creature" : studyingLine(status.get(hit.id)) || (hit.online ? "Online now" : "");
    say.querySelector("span").textContent = line;
    say.querySelector("span").hidden = !line;
    say.hidden = false;
    say.classList.remove("show"); void say.offsetWidth; say.classList.add("show"); // (measuring restarts the fade)
    placeSay();
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { say.hidden = true; shown = null; }, SAY_MS);
  });

  let raf = 0;
  let last = performance.now();
  let disposed = false;
  let seen = false;
  function loop(now) {
    if (disposed) return;
    if (!canvas.isConnected && seen) { dispose(); return; } // the page was left
    seen = seen || canvas.isConnected;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    draw(now, dt);
    raf = requestAnimationFrame(loop);
  }
  function dispose() { disposed = true; cancelAnimationFrame(raf); clearTimeout(sayTimer); }
  raf = requestAnimationFrame(loop);
  return { dispose };
}

