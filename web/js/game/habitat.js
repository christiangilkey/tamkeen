// The creature's habitat: a small living scene at the bottom of Home. The creature (or its egg)
// wanders, reacts to being petted and to what you earn while studying; the bar underneath shows
// today's goal, level and streak.

import { h } from "../app.js";
import { FX_FRAMES, HABITAT, SPECIES, STAGES, TYPES, BRANCHES } from "./data.js";
import { describe, stageOf } from "./genome.js";
import { GOALS, levelOf } from "./rules.js";
import { FRAME, composeCreature, drawSheet, loadImage } from "./render.js";
import { getGame, onGame, rollNumber, saveGame, sfx } from "./game.js";

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
        <span class="today-chip" id="g-streak"></span>
        <span class="today-chip" id="g-coins" title="Coins, for the shop (coming)"></span>
        <span class="today-chip" id="g-freeze" title="A streak freeze covers a missed day"></span>
      </div>
    </div>
  </section>`);
  const $ = (q) => el.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ----- the bar under the scene -----
  function paintHud(animate = false) {
    const lv = levelOf(game.xp);
    $("#g-level").textContent = lv.level;
    $("#g-xpbar").style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
    if (animate) rollNumber($("#g-xp"), game.xp, (n) => n.toLocaleString());
    else { $("#g-xp").dataset.value = String(game.xp); $("#g-xp").textContent = game.xp.toLocaleString(); }
    const mins = Math.floor(game.day.seconds / 60);
    $("#g-goal").textContent = game.day.done ? "✓ Daily goal reached" : `Today: ${mins} / ${game.goal} min`;
    $("#g-goal").classList.toggle("done", game.day.done);
    $("#g-goalbar").style.width = `${Math.min(100, Math.round((game.day.seconds / (game.goal * 60)) * 100))}%`;
    $("#g-goalbtn").textContent = `Goal: ${game.goal} min`;
    const look = describe(game.creature);
    const stage = stageOf(game.creature.growth);
    const next = STAGES[STAGES.indexOf(stage) + 1];
    const pct = next ? Math.round(((game.creature.growth - stage.from) / (next.from - stage.from)) * 100) : 100;
    $("#g-stage").textContent = `${TYPES[look.type].name} ${stage.id === "egg" ? "egg" : SPECIES[look.species].name.toLowerCase()} · ${STAGE_LABEL[stage.id]}`
      + (look.branch ? ` (${BRANCHES[look.branch].name})` : "") + (next ? ` · ${pct}% to ${STAGE_LABEL[next.id].toLowerCase()}` : "");
    $("#g-streak").textContent = `🔥 ${game.streak} day${game.streak === 1 ? "" : "s"}`;
    $("#g-streak").classList.toggle("lit", game.streak > 0);
    $("#g-coins").textContent = `◉ ${game.coins}`;
    $("#g-freeze").textContent = `❄ ${game.items.freeze}`;
    $(".habitat-name").textContent = game.creature.name || (stage.id === "egg" ? "Your egg" : "Name me ✎");
  }
  $("#g-goalbtn").onclick = () => {
    game.goal = GOALS[(GOALS.indexOf(game.goal) + 1) % GOALS.length];
    saveGame();
    paintHud();
  };
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
  for (const layer of HABITAT.layers) files[layer] = `habitat/${HABITAT.themes[0]}/${layer}.png`;
  for (const id of Object.keys(FX_FRAMES)) files[id] = `fx/${id}.png`;
  for (const [k, f] of Object.entries(files)) loadImage(f).then((img) => { art[k] = img; });

  const pet = { x: W / 2, dir: 1, target: W / 2, wait: 2, step: 0, stepT: 0, mood: "", moodT: 0, hop: 0, blinkT: 3 };
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
    const key = JSON.stringify([look.stage, look.branch, look.size]);
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

    // Sky: day and night, with a little dusk.
    const dark = night ? 0.55 : hour > 18 ? (hour - 18) * 0.22 : hour < 7.5 ? (7.5 - hour) * 0.3 : 0;
    ctx.clearRect(0, 0, W, H);
    if (art.sky) ctx.drawImage(art.sky, 0, 0);
    const arc = (hour >= 6 && hour < 20 ? (hour - 6) / 14 : ((hour + 4) % 24) / 10);
    const orb = night ? art.moon : art.sun;
    if (orb) ctx.drawImage(orb, Math.round(20 + arc * (W - 64)), Math.round(34 - Math.sin(arc * Math.PI) * 26));
    if (art.cloud1) ctx.drawImage(art.cloud1, Math.round(((now / 90) % (W + 60)) - 50), 16);
    if (art.cloud2) ctx.drawImage(art.cloud2, Math.round(((now / 140 + 150) % (W + 40)) - 36), 34);
    if (art.far) ctx.drawImage(art.far, 0, 0);
    if (art.mid) ctx.drawImage(art.mid, 0, 0);
    if (art.ground) ctx.drawImage(art.ground, 0, 0);
    if (dark) { ctx.fillStyle = `rgba(20, 12, 48, ${dark})`; ctx.fillRect(0, 0, W, H); }

    const groundY = HABITAT.ground;
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
      if (frame) {
        ctx.save();
        ctx.translate(Math.round(pet.x), groundY - Math.round(pet.hop));
        if (pet.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(frame, -FRAME / 2, -FRAME);
        ctx.restore();
      }
      if (asleep && art.zzz && Math.floor(now / 900) % 2) ctx.drawImage(art.zzz, Math.round(pet.x + 10), groundY - 44 - (Math.floor(now / 300) % 3));
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

  function cheer(kind) {
    pet.mood = "happy";
    pet.moodT = kind === "jackpot" ? 3 : 1.4;
    const y = HABITAT.ground - (stageOf(game.creature.growth).id === "egg" ? 36 : 50);
    const x = stageOf(game.creature.growth).id === "egg" ? W / 2 : pet.x;
    const img = kind === "pet" ? art.heart : art.star;
    for (let i = 0; i < (kind === "jackpot" ? 6 : 3); i++) floats.push({ img, x: x - 12 + Math.random() * 24, y: y + Math.random() * 10, t: -i * 0.12 });
    if (kind === "jackpot") bursts.push({ id: "burst_jackpot", x, y: y + 16, t: 0 });
  }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const egg = stageOf(game.creature.growth).id === "egg";
    if (Math.abs(x - (egg ? W / 2 : pet.x)) < 30) { cheer("pet"); sfx("pet"); }
    else if (!egg) { pet.target = Math.max(30, Math.min(W - 30, x)); pet.wait = 0; } // "come here"
  });

  const stop = onGame((result) => {
    paintHud(true);
    if (result.stage) {
      const x = result.stage === "hatchling" ? W / 2 : pet.x;
      bursts.push({ id: result.stage === "hatchling" ? "hatch" : "levelup", x, y: HABITAT.ground - 30, t: 0 });
      if (result.stage === "hatchling") pet.x = pet.target = W / 2;
      sfx("jackpot");
    } else if (result.levelUp) {
      bursts.push({ id: "levelup", x: pet.x, y: HABITAT.ground - 30, t: 0 });
    }
    if (result.type !== "study" || result.goalDone) cheer(result.goalDone ? "jackpot" : result.tier); // quiet while time ticks by
  });

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    clearInterval(timer);
    stop();
  }
  paintHud();
  loop();
  return { el, dispose };
}
