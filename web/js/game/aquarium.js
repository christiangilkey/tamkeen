// An aquarium, alive: the fish kept in it swim back and forth in a little tank of water. Shown on the Basket screen
// (yours), in a friend's box (theirs, after remote.js has checked it) and, very small, standing in the habitat.
// Drawing only: which fish are in it is fishing.js (state.fishing.tank).

import { SPRITE, fishSprite } from "./fishart.js";

const WATER = ["#0b2440", "#0f3558", "#3fb6d8"]; // deep, middle, the surface line
const SAND = ["#8a7350", "#6b5638"];

/** A number 0..1 from two whole numbers (the same every time), to place things without Math.random. */
const scatter = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * A tank with `fish` ([{sp, t, cm}], at most a handful) swimming in it: a canvas element `w` x `h` pixels of art,
 * shown `scale` times that size. It animates while it is on the page and stops by itself once it has left.
 */
export function aquariumView(fish, { w = 160, h = 64, scale = 2 } = {}) {
  const c = document.createElement("canvas");
  c.className = "aq-view";
  c.width = w;
  c.height = h;
  c.style.width = `${w * scale}px`;
  c.style.maxWidth = "100%";
  c.style.aspectRatio = `${w} / ${h}`;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const list = (Array.isArray(fish) ? fish : []).map((f, i) => ({
    f, sprite: null, x: 8 + scatter(i, 1) * (w - SPRITE[0] - 16), y: 8 + scatter(i, 2) * (h - SPRITE[1] - 22),
    dir: scatter(i, 3) < 0.5 ? -1 : 1, speed: 5 + scatter(i, 4) * 8, phase: scatter(i, 5) * 6, pause: 0,
  }));
  for (const s of list) fishSprite(s.f.sp, s.f.t).then((img) => { s.sprite = img; });
  let seen = false;
  let last = performance.now();
  function frame(now) {
    if (!c.isConnected) { if (seen) return; } else seen = true;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // water, a lighter line at the surface, sand, two plants, bubbles
    ctx.fillStyle = WATER[1];
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = WATER[0];
    ctx.fillRect(0, Math.round(h * 0.55), w, h);
    for (let x = 0; x < w; x += 2) ctx.fillRect(x + (Math.round(h * 0.55) & 1), Math.round(h * 0.55) - 1, 1, 1);
    ctx.fillStyle = WATER[2];
    ctx.fillRect(0, 0, w, 1);
    ctx.fillStyle = SAND[0];
    ctx.fillRect(0, h - 5, w, 5);
    ctx.fillStyle = SAND[1];
    for (let x = 1; x < w; x += 5) ctx.fillRect(x + Math.round(scatter(x, 9) * 3), h - 4 + Math.round(scatter(x, 8) * 2), 2, 1);
    for (const [px, tall, colour] of [[12, 16, "#2f9e6a"], [w - 20, 22, "#3fbf7a"], [Math.round(w * 0.45), 10, "#2f9e6a"]]) {
      ctx.fillStyle = colour;
      for (let i = 0; i < tall; i++) ctx.fillRect(px + Math.round(Math.sin(now / 900 + i * 0.5 + px) * 1.2), h - 6 - i, 2, 1);
    }
    ctx.fillStyle = "rgba(200, 240, 255, .5)";
    for (let i = 0; i < 5; i++) {
      const rise = ((now / (26 + i * 7) + i * 97) % (h - 8));
      ctx.fillRect(Math.round(20 + scatter(i, 7) * (w - 40) + Math.sin(now / 400 + i) * 1.5), Math.round(h - 8 - rise), 1, 1);
    }
    for (const s of list) {
      if (s.pause > 0) s.pause -= dt;
      else {
        s.x += s.dir * s.speed * dt;
        if (s.x < 3) { s.x = 3; s.dir = 1; s.pause = 0.3; }
        if (s.x > w - SPRITE[0] - 3) { s.x = w - SPRITE[0] - 3; s.dir = -1; s.pause = 0.3; }
        if (scatter(Math.floor(now / 3000), s.phase) < 0.002) s.dir = -s.dir;
      }
      if (!s.sprite) continue;
      const y = Math.round(s.y + Math.sin(now / 700 + s.phase) * 2);
      ctx.save();
      ctx.translate(Math.round(s.x) + (s.dir < 0 ? SPRITE[0] : 0), y);
      if (s.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(s.sprite, 0, 0);
      ctx.restore();
    }
  }
  requestAnimationFrame(frame);
  return c;
}

/**
 * The tiny fish in the habitat's tank: draws up to six of `fish` as little shapes in their tier's colour inside the
 * glass at (x, y), `w` x `h` scene pixels (the tank's own picture is drawn first by whoever calls this).
 */
export function drawTinyFish(ctx, fish, colours, x, y, w, h, now) {
  (Array.isArray(fish) ? fish : []).slice(0, 6).forEach((f, i) => {
    const span = w - 5;
    const t = (now / (900 + i * 170) + scatter(i, 1) * 10) % 2;
    const go = t < 1 ? t : 2 - t;                    // back and forth
    const fx = Math.round(x + go * span);
    const fy = Math.round(y + 1 + scatter(i, 2) * (h - 4) + Math.sin(now / 600 + i) * 0.6);
    const right = t < 1;
    ctx.fillStyle = colours[f.t] || "#c9ced8";
    ctx.fillRect(fx + (right ? 1 : 0), fy, 3, 2);
    ctx.fillRect(fx + (right ? 0 : 3), fy, 1, 1);    // its tail
    ctx.fillRect(fx + (right ? 0 : 3), fy + 1, 1, 1);
  });
}
