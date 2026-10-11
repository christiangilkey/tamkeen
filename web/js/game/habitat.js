// The creature's habitat: a small living scene at the bottom of Home. The creature (or its egg)
// wanders, reacts to being petted and to what you earn while studying; the bar underneath shows
// today's goal, level and streak.

import { api, h, toast } from "../app.js";
import { EMOTES, FX_FRAMES, HABITAT, PLOTS, SCENES, SHADOW, SPECIES, STAGES, TYPES, BRANCHES } from "./data.js";
import { collect, garden, tick as gardenTick, totalRate } from "./idle.js";
import { heartsRow } from "./garden.js";
import { describe, formOf, readyToEvolve, stageOf } from "./genome.js";
import { icon } from "./render.js";
import { badgeToast, openBattleMenu } from "./battle-ui.js";
import { publishNow } from "./friends-game.js";
import { GOALS, checkBadges, levelOf } from "./rules.js";
import { FRAME, composeCreature, drawSheet, loadImage } from "./render.js";
import { getGame, onGame, rollNumber, saveGame, sfx } from "./game.js";
import { openShop } from "./shop.js";

const [W, H] = HABITAT.size;
const STAGE_LABEL = { egg: "Egg", hatchling: "Hatchling", juvenile: "Juvenile", adult: "Adult" };

/** Build the habitat section. Returns {el, dispose}. */
export function habitat() {
  const game = getGame();
  const el = h(`<section class="habitat card">
    <div class="habitat-scene"><canvas width="${W}" height="${H}" aria-label="Your creature's habitat"></canvas>
      <button type="button" class="habitat-name" title="Rename"></button></div>
    <div class="habitat-hud">
      <div class="hud-row">
        <span class="hud-level" title="Your level">Lv <b id="g-level"></b></span>
        <span class="hud-bar" title="XP to the next level"><i id="g-xpbar"></i></span>
        <span class="hud-xp"><b id="g-xp"></b> XP</span>
      </div>
      <div class="hud-row">
        <span class="hud-goal" id="g-goal"></span>
        <span class="hud-bar goal"><i id="g-goalbar"></i></span>
        <button type="button" class="ghost hud-goal-btn" id="g-goalbtn" title="Change your daily goal"></button>
      </div>
      <div class="hud-chips">
        <span class="today-chip" id="g-stage"></span>
        <span class="today-chip" id="g-streak" title="Days in a row">${icon("streak")} <span></span></span>
        <span class="today-chip" id="g-coins" title="Coins, for the shop (coming)">${icon("coin")} <span></span></span>
        <span class="today-chip" id="g-freeze" title="A streak freeze covers a missed day">${icon("freeze")} <span></span></span>
        <button type="button" class="today-chip" id="g-glow" title="Glow from your buildings: open the garden">${icon("glow")} <span></span></button>
        <span class="today-chip" id="g-gems" title="Gems, earned from badges, raids and rising a league">${icon("gem")} <span></span></span>
        <span class="today-chip" id="g-hearts"></span>
        <button type="button" class="today-chip" id="g-scene" title="Move your creature to another habitat">${icon("nav_habitat")} <span></span></button>
      </div>
      <div class="hud-actions">
        <button type="button" class="primary" id="g-battle">${icon("battle")} Battle</button>
        <button type="button" id="g-friends">${icon("trade")} Friends</button>
        <button type="button" id="g-creatures">${icon("nav_roster")} Creatures</button>
        <button type="button" id="g-shop">${icon("nav_shop")} Shop</button>
        <button type="button" id="g-garden">${icon("glow")} Garden</button>
      </div>
    </div>
  </section>`);
  const $ = (q) => el.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const scene = () => (HABITAT.themes.includes(game.scene) ? game.scene : HABITAT.themes[0]);

  // ----- the bar under the scene -----
  function paintHud(animate = false) {
    const lv = levelOf(game.xp);
    $("#g-level").textContent = lv.level;
    $("#g-xpbar").style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
    if (animate) rollNumber($("#g-xp"), game.xp, (n) => n.toLocaleString());
    else { $("#g-xp").dataset.value = String(game.xp); $("#g-xp").textContent = game.xp.toLocaleString(); }
    const mins = Math.floor(game.day.seconds / 60);
    $("#g-goal").textContent = game.day.done ? " Daily goal reached" : `Today: ${mins} / ${game.goal} min`;
    $("#g-goal").prepend(h(icon(game.day.done ? "check" : "clock")), game.day.done ? "" : " ");
    $("#g-goal").classList.toggle("done", game.day.done);
    $("#g-goalbar").style.width = `${Math.min(100, Math.round((game.day.seconds / (game.goal * 60)) * 100))}%`;
    $("#g-goalbtn").textContent = `Goal: ${game.goal} min`;
    const look = describe(game.creature);
    const stage = formOf(game.creature);
    const ready = readyToEvolve(game.creature);
    const next = ready || game.creature.show ? null : STAGES[STAGES.indexOf(stageOf(game.creature.growth)) + 1];
    const pct = next ? Math.round(((game.creature.growth - stage.from) / (next.from - stage.from)) * 100) : 100;
    $("#g-stage").textContent = `${TYPES[look.type].name} ${stage.id === "egg" ? "egg" : SPECIES[look.species].name.toLowerCase()} · ${STAGE_LABEL[stage.id]}`
      + (look.branch ? ` (${BRANCHES[look.branch].name})` : "") + (ready ? " · ready to evolve: tap it" : next ? ` · ${pct}% to ${STAGE_LABEL[next.id].toLowerCase()}` : "");
    $("#g-stage").classList.toggle("lit", ready);
    if (ready) $("#g-stage").prepend(h(icon("evolve")), " ");
    $("#g-streak span").textContent = `${game.streak} day${game.streak === 1 ? "" : "s"}`;
    $("#g-streak").classList.toggle("lit", game.streak > 0);
    $("#g-coins span").textContent = game.coins;
    $("#g-freeze span").textContent = game.items.freeze;
    $(".habitat-name").textContent = game.creature.name || (stage.id === "egg" ? "Your egg" : "Name me ");
    if (!game.creature.name && stage.id !== "egg") $(".habitat-name").append(h(icon("edit")));
    $("#g-scene span").textContent = SCENES[scene()];
    const g = garden(game);
    const waiting = g.plots.reduce((n, p) => n + p.stored, 0);
    $("#g-glow span").textContent = `${Math.floor(g.glow).toLocaleString()}${waiting >= 1 ? ` +${Math.floor(waiting).toLocaleString()}` : ""}`;
    $("#g-glow").classList.toggle("lit", waiting >= 1);
    $("#g-gems span").textContent = game.gems;
    $("#g-hearts").innerHTML = stage.id === "egg" ? "" : heartsRow(game.creature);
    $("#g-hearts").hidden = stage.id === "egg";
  }
  // The garden keeps time: glow builds up, and what studying earned here is paid out.
  function gardenBeat() {
    const r = gardenTick(game);
    if (r.burst) toast(`Daily goal: your buildings sent ${r.burst.toLocaleString()} glow at once.`);
    if (r.gems) toast(`You earned ${r.gems} gem${r.gems === 1 ? "" : "s"}.`);
    if (r.bloom) toast("Full bloom: every plot holds a fully grown building.");
    if (r.burst || r.gems) saveGame();
    paintHud();
  }
  $("#g-garden").onclick = $("#g-glow").onclick = () => openShop("garden", () => paintHud());
  api("/vocab").then((words) => { checkBadges(game, { words: words.length }); gardenBeat(); }).catch(() => {});
  $("#g-scene").onclick = () => {
    game.scene = HABITAT.themes[(HABITAT.themes.indexOf(scene()) + 1) % HABITAT.themes.length];
    saveGame();
    paintHud();
  };
  $("#g-goalbtn").onclick = () => {
    game.goal = GOALS[(GOALS.indexOf(game.goal) + 1) % GOALS.length];
    saveGame();
    paintHud();
  };
  $("#g-shop").onclick = () => openShop("shop", () => paintHud());
  $("#g-creatures").onclick = () => openShop("creatures", () => paintHud());
  $("#g-battle").onclick = () => openBattleMenu();
  $("#g-friends").onclick = () => openShop("friends", () => paintHud());
  setTimeout(() => publishNow(), 4000); // keep what friends see of me fresh (only when connected)
  $(".habitat-name").onclick = () => {
    const name = window.prompt("Name your creature", game.creature.name || "");
    if (name === null) return;
    game.creature.name = name.trim().slice(0, 20);
    saveGame();
    paintHud();
  };

  // ----- the scene -----
  const art = {};
  const files = { sun: "habitat/sun.png", moon: "habitat/moon.png", cloud1: "habitat/cloud_1.png", cloud2: "habitat/cloud_2.png",
                  heart: "fx/heart.png", zzz: "fx/zzz.png", star: "fx/star.png" };
  for (const theme of HABITAT.themes) for (const layer of HABITAT.layers) files[`${theme}_${layer}`] = `habitat/${theme}/${layer}.png`;
  for (const id of EMOTES) files[`emote_${id}`] = `fx/emote_${id}.png`;
  files.rain = "habitat/rain.png";
  for (const id of Object.keys(FX_FRAMES)) files[id] = `fx/${id}.png`;
  for (const size of Object.keys(SHADOW)) files[`shadow_${size}`] = `fx/shadow_${size}.png`;
  files.glowIcon = "icon/glow.png";
  for (const [k, f] of Object.entries(files)) loadImage(f).then((img) => { art[k] = img; });
  const plotArt = {}; // building picture by file name

  const pet = { x: W / 2, dir: 1, target: W / 2, wait: 2, step: 0, stepT: 0, mood: "", moodT: 0, hop: 0, blinkT: 3, emote: "", emoteT: 0, idleT: 6 };
  const emote = (id, secs = 1.8) => { if (id) { pet.emote = id; pet.emoteT = secs; } };
  // It rains on about one day in four (the same days for everyone, so it is weather and not a glitch).
  const rainy = () => { const d = new Date(); return (d.getDate() * 7 + d.getMonth()) % 4 === 0; };
  const decorArt = {}; // decoration id -> image
  const bursts = [];   // {id, x, y, t}
  const floats = [];   // {img, x, y, t}
  let frames = {};     // pose key -> canvas (composed creature)
  let lookKey = "";
  let egg = null;
  let cracks = [];
  let disposed = false;
  let last = performance.now();
  let raf = 0;
  let timer = 0;
  let seen = false;

  function refreshLook() {
    const look = describe(game.creature);
    const key = JSON.stringify([game.creature.seed, look.stage, look.branch, look.variant, look.size, look.equipped]);
    if (key === lookKey) return look;
    lookKey = key;
    frames = {};
    if (look.stage === "egg") {
      loadImage(`egg/${look.type}.png`).then((img) => { egg = img; });
      Promise.all([1, 2, 3].map((n) => loadImage(`egg/crack_${n}.png`))).then((imgs) => { cracks = imgs; });
    }
    return look;
  }

  function creatureFrame(look, pose) {
    const key = `${pose.step}|${pose.bob}|${pose.eyes}|${pose.mouth}`;
    if (!(key in frames)) {
      frames[key] = null; // being made; draw the previous frame meanwhile
      composeCreature(look, pose).then((c) => { frames[key] = c; });
    }
    return frames[key] || Object.values(frames).find(Boolean) || null;
  }

  function tick(dt, now) {
    const look = refreshLook();
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const night = hour < 6 || hour >= 20;
    const asleep = night && !pet.moodT;
    // Wander: walk to a spot, wait, pick another. Eggs just wobble.
    if (look.stage !== "egg" && !asleep) {
      if (pet.wait > 0) pet.wait -= dt;
      else if (Math.abs(pet.target - pet.x) < 1) { pet.wait = 1.5 + Math.random() * 4; pet.target = 30 + Math.random() * (W - 60); }
      else {
        pet.dir = pet.target > pet.x ? 1 : -1;
        pet.x += pet.dir * (look.size === "s" ? 14 : 20) * dt;
        pet.stepT += dt;
        if (pet.stepT > 0.18) { pet.stepT = 0; pet.step ^= 1; }
      }
    }
    if (pet.moodT > 0) { pet.moodT -= dt; if (pet.moodT <= 0) pet.mood = ""; }
    pet.hop = pet.mood === "happy" ? Math.abs(Math.sin(now / 110)) * 6 : 0;
    pet.blinkT -= dt;
    if (pet.blinkT < -0.15) pet.blinkT = 2 + Math.random() * 4;
    // Now and then it says how it feels, in a little bubble.
    if (pet.emoteT > 0) pet.emoteT -= dt;
    else if ((pet.idleT -= dt) < 0) {
      pet.idleT = 7 + Math.random() * 8;
      if (look.stage !== "egg") {
        emote(asleep ? "sleepy" : readyToEvolve(game.creature) ? "exclaim" : !game.day.seconds && hour >= 12 ? "hungry"
          : !game.day.done && game.streak > 0 && hour >= 18 ? "sweat" : Math.random() < 0.3 ? "question" : "");
      }
    }

    // Sky: day and night, with a little dusk.
    const dark = night ? 0.55 : hour > 18 ? (hour - 18) * 0.22 : hour < 7.5 ? (7.5 - hour) * 0.3 : 0;
    ctx.clearRect(0, 0, W, H);
    const here = scene();
    if (art[`${here}_sky`]) ctx.drawImage(art[`${here}_sky`], 0, 0);
    const arc = (hour >= 6 && hour < 20 ? (hour - 6) / 14 : ((hour + 4) % 24) / 10);
    const orb = night ? art.moon : art.sun;
    if (orb) ctx.drawImage(orb, Math.round(20 + arc * (W - 64)), Math.round(34 - Math.sin(arc * Math.PI) * 26));
    if (art.cloud1) ctx.drawImage(art.cloud1, Math.round(((now / 90) % (W + 60)) - 50), 16);
    if (art.cloud2) ctx.drawImage(art.cloud2, Math.round(((now / 140 + 150) % (W + 40)) - 36), 34);
    for (const layer of ["far", "mid", "ground"]) if (art[`${here}_${layer}`]) ctx.drawImage(art[`${here}_${layer}`], 0, 0);
    if (art.rain && rainy()) {
      const fall = Math.floor(now / 14) % 32; // the tile repeats, sliding down and a little to the left
      for (let x = 0; x < W + 32; x += 32) for (let y = -32; y < H; y += 32) ctx.drawImage(art.rain, x - Math.floor(fall / 2), y + fall);
    }
    if (dark) { ctx.fillStyle = `rgba(20, 12, 48, ${dark})`; ctx.fillRect(0, 0, W, H); }

    const groundY = HABITAT.ground;
    // Decorations stand on the ground, behind the creature.
    for (const d of game.decor) {
      if (!(d.id in decorArt)) { decorArt[d.id] = null; loadImage(`${d.id}.png`).then((img) => { decorArt[d.id] = img; }); }
      const img = decorArt[d.id];
      if (img) ctx.drawImage(img, Math.round(d.x - img.width / 2), groundY - img.height + 2);
    }
    // Building plots: an empty plot, or the building on it, with a bobbing light when glow is waiting.
    const plots = garden(game).plots;
    for (let i = 0; i < PLOTS.length; i++) {
      const p = plots[i];
      if (!p.open) continue;
      const file = p.tier ? `structure/${p.id}_${p.tier}.png` : "structure/plot.png";
      if (!(file in plotArt)) { plotArt[file] = null; loadImage(file).then((img) => { plotArt[file] = img; }); }
      const img = plotArt[file];
      if (!img) continue;
      ctx.drawImage(img, Math.round(PLOTS[i].x - img.width / 2), groundY - img.height + 3);
      if (p.stored >= 1 && art.glowIcon) ctx.drawImage(art.glowIcon, PLOTS[i].x - 8, groundY - img.height - 14 + Math.round(Math.sin(now / 300 + i) * 2));
    }
    if (dark && (game.decor.length || plots.some((p) => p.open))) { ctx.fillStyle = `rgba(20, 12, 48, ${dark * 0.6})`; ctx.fillRect(0, groundY - 48, W, 50); }
    if (look.stage === "egg") {
      const wobble = Math.sin(now / 260) * (pet.mood ? 3 : 1);
      if (egg) {
        ctx.save();
        ctx.translate(Math.round(W / 2 + wobble), groundY);
        ctx.drawImage(egg, -16, -32 - Math.round(pet.hop));
        // Cracks spread as the egg nears hatching.
        const n = Math.min(2, Math.floor((game.creature.growth / STAGES[1].from) * 4) - 1);
        if (n >= 0 && cracks[n]) ctx.drawImage(cracks[n], -16, -32 - Math.round(pet.hop));
        ctx.restore();
      }
    } else {
      const pose = {
        step: pet.wait > 0 || asleep ? 0 : pet.step,
        bob: asleep ? 2 : pet.wait > 0 ? (Math.floor(now / 500) % 2) : pet.step,
        eyes: asleep ? "sleepy" : pet.mood === "happy" ? "happy" : pet.blinkT < 0 ? "blink" : "open",
        mouth: asleep ? "sleep" : pet.mood === "happy" ? "smile" : "neutral",
      };
      const frame = creatureFrame(look, pose);
      const body = pet.x - pet.dir * 3; // the body sits 3px behind the middle of its frame (the head leans forward)
      const shadow = art[`shadow_${look.size}`];
      if (frame && shadow) ctx.drawImage(shadow, Math.round(body - shadow.width / 2), groundY - Math.floor(shadow.height / 2)); // stays on the ground through a hop
      if (frame) {
        ctx.save();
        ctx.translate(Math.round(pet.x), groundY - Math.round(pet.hop));
        if (pet.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(frame, -FRAME / 2, -FRAME);
        ctx.restore();
      }
      if (readyToEvolve(game.creature) && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, (now / 140) % FX_FRAMES.ready, body, groundY - 28 - Math.round(pet.hop));
      const bubble = pet.emoteT > 0 && art[`emote_${pet.emote}`];
      if (bubble) ctx.drawImage(bubble, Math.round(pet.x + pet.dir * 12 - 6), groundY - { s: 48, m: 58, l: 70 }[look.size] - Math.round(pet.hop));
      else if (asleep && art.zzz && Math.floor(now / 900) % 2) ctx.drawImage(art.zzz, Math.round(pet.x + 10), groundY - 44 - (Math.floor(now / 300) % 3));
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      if (f.t > 1.1) { floats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      if (f.img) ctx.drawImage(f.img, Math.round(f.x + Math.sin(f.t * 8 + i) * 3), Math.round(f.y - f.t * 26));
      ctx.globalAlpha = 1;
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const n = FX_FRAMES[b.id];
      if (b.t * 14 >= n) { bursts.splice(i, 1); continue; }
      drawSheet(ctx, art[b.id], n, b.t * 14, b.x, b.y);
    }
  }

  // Animation frames pause in a hidden window, so a slow timer keeps the scene honest there.
  function loop() {
    if (disposed) return;
    if (!el.isConnected && seen) { dispose(); return; } // the page was left
    seen = seen || el.isConnected;
    const now = performance.now();
    tick(Math.min(0.1, (now - last) / 1000), now);
    last = now;
    raf = requestAnimationFrame(loop);
  }
  timer = setInterval(() => { if (document.hidden) { const now = performance.now(); tick(0.1, now); last = now; } }, 1000);
  const gardenTimer = setInterval(gardenBeat, 5000);

  function cheer(kind) {
    pet.mood = "happy";
    pet.moodT = kind === "jackpot" ? 3 : 1.4;
    const y = HABITAT.ground - (stageOf(game.creature.growth).id === "egg" ? 36 : 50);
    const x = stageOf(game.creature.growth).id === "egg" ? W / 2 : pet.x;
    const img = kind === "pet" ? art.heart : art.star;
    for (let i = 0; i < (kind === "jackpot" ? 6 : 3); i++) floats.push({ img, x: x - 12 + Math.random() * 24, y: y + Math.random() * 10, t: -i * 0.12 });
    if (kind === "jackpot") bursts.push({ id: "burst_jackpot", x, y: y + 16, t: 0 });
    emote({ pet: "love", jackpot: "love", lucky: "music", surprise: "question" }[kind]);
  }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    // A building with glow waiting is gathered with a tap; an empty plot opens the garden.
    const plots = garden(game).plots;
    const hit = PLOTS.findIndex((spot, i) => plots[i].open && Math.abs(x - spot.x) < 16 && y > HABITAT.ground - 50);
    if (hit >= 0 && plots[hit].stored >= 1) {
      const got = collect(game, hit);
      for (let i = 0; i < 4; i++) floats.push({ img: art.glowIcon, x: PLOTS[hit].x - 12 + Math.random() * 16, y: HABITAT.ground - 40 + Math.random() * 8, t: -i * 0.1 });
      sfx("lucky");
      toast(`+${got.toLocaleString()} glow`);
      saveGame();
      paintHud();
      return;
    }
    if (hit >= 0 && !plots[hit].tier && Math.abs(x - pet.x) > 24) { openShop("garden", () => paintHud()); return; }
    const egg = stageOf(game.creature.growth).id === "egg";
    if (Math.abs(x - (egg ? W / 2 : pet.x)) < 30) {
      cheer("pet");
      sfx("pet");
      if (readyToEvolve(game.creature)) openShop("creatures", () => paintHud()); // evolving starts with a tap
    }
    else if (!egg) { pet.target = Math.max(30, Math.min(W - 30, x)); pet.wait = 0; } // "come here"
  });

  const stop = onGame((result) => {
    if (result.type === "sync") { paintHud(); return; } // a newer save arrived from another device
    if (result.type === "evolve") { // chosen on the Creatures page: the light gathers on the creature, then bursts
      paintHud();
      if (result.active) { bursts.push({ id: "evolve", x: pet.x - pet.dir * 3, y: HABITAT.ground - 30, t: 0 }); cheer("lucky"); }
      return;
    }
    paintHud(true);
    for (const id of result.badges || []) badgeToast(id);
    if (result.stage === "ready") toast("Your creature is ready to evolve. Tap it when you want to.").prepend(h(icon("evolve")), " ");
    if (result.stage) {
      const x = result.stage === "hatchling" ? W / 2 : pet.x;
      bursts.push({ id: result.stage === "hatchling" ? "hatch" : "levelup", x, y: HABITAT.ground - 30, t: 0 });
      if (result.stage === "hatchling") pet.x = pet.target = W / 2;
      sfx("jackpot");
    } else if (result.levelUp) {
      bursts.push({ id: "levelup", x: pet.x, y: HABITAT.ground - 30, t: 0 });
      emote("idea", 2.4);
    }
    if (result.type !== "study" || result.goalDone) cheer(result.goalDone ? "jackpot" : result.tier); // quiet while time ticks by
  });

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    clearInterval(timer);
    clearInterval(gardenTimer);
    stop();
  }
  paintHud();
  loop();
  return { el, dispose };
}
