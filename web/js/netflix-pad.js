// A game controller on Netflix's own pages: the computer's Netflix window (app/desktop.py, after
// web/js/netflix-browser.js) and Netflix's tab with the browser extension (extension/). Netflix's
// website doesn't answer a controller, so this does what Tamkeen's own pages do (web/js/gamepad.js),
// the Xbox dashboard's way:
//   - the D-pad or the left stick move a highlight between the titles and buttons on screen (past the
//     last title in a row is Netflix's arrow, which A presses to slide the row on);
//   - A presses what is highlighted (a title: in the computer's window it opens in Tamkeen's player);
//   - B closes a title's details box, else goes back a page;
//   - LT / RT scroll a screen up / down, the right stick scrolls smoothly.
// A small guide says so in the corner while the controller is in use; the mouse or the keys put it away.
// Like the other scripts inside someone else's website it is plain script, uses no innerHTML, keeps
// what it shows in a closed shadow root, and only acts in the window that has the focus.
//
// It reads controllers as web/js/padmap.js does (kept in step by tests/js/netflix.test.mjs): only
// real controllers count (not a speaker's volume knob), an Xbox controller over Bluetooth whose layout
// the browser doesn't know is read in the usual places, and what is held when a controller appears
// does nothing until it is let go.
(function () {
  if (window.top !== window || window.__tamkeenNetflixPad || !navigator.getGamepads) return;
  window.__tamkeenNetflixPad = true;

  var PRESS = 0.5, RELEASE = 0.35, DEAD_ZONE = 0.25, TRIGGER = 0.5, HOLD_MS = 400, REPEAT_MS = 110;
  var XBOX_BT = { buttons: { 0: 0, 1: 1, 3: 2, 4: 3, 6: 4, 7: 5, 10: 8, 11: 9, 13: 10, 14: 11, 12: 16 }, lt: 3, rt: 4, sticks: [0, 1, 2, 5], hat: 9 };
  var STICK_AS_DPAD = { "a0-": "b14", "a0+": "b15", "a1-": "b12", "a1+": "b13" };
  var DIRS = { b12: "up", b13: "down", b14: "left", b15: "right" };

  function onNetflix() {
    var cfg = window.__tamkeenNetflix || {};
    var hosts = cfg.hosts || ["www.netflix.com", "netflix.com"];
    // (a title's own page in the extension's tab has Tamkeen's player and its keys there)
    return hosts.indexOf(location.hostname) >= 0 && !/^\/watch\//.test(location.pathname);
  }
  function text(key, english) {
    var t = (window.__tamkeenNetflix || {}).text || {};
    return t[key] || english;
  }

  // ---------- reading the controllers (as web/js/padmap.js) ----------
  function isController(p) {
    if (!p) return false;
    if (p.mapping === "standard") return true;
    var axes = Array.prototype.map.call(p.axes || [], Number);
    return (p.buttons || []).length >= 6 && axes.length >= 2 && axes.filter(function (v) { return Math.abs(v) < 0.3; }).length >= 2;
  }
  function standardize(pad) {
    if (!pad || pad.mapping === "standard") return pad;
    var raw = pad.buttons || [], axes = pad.axes || [];
    if (!/045e/i.test(String(pad.id || "")) || raw.length < 15 || axes.length < 10) return pad;
    var off = function () { return { pressed: false, value: 0 }; };
    var buttons = [];
    for (var i = 0; i < 17; i++) buttons.push(off());
    Object.keys(XBOX_BT.buttons).forEach(function (from) {
      var b = raw[from];
      if (!b) return;
      var pressed = typeof b === "number" ? b >= TRIGGER : !!b.pressed;
      buttons[XBOX_BT.buttons[from]] = { pressed: pressed, value: pressed ? 1 : 0 };
    });
    var trigger = function (v) {
      var t = Math.max(0, Math.min(1, ((Number(v) || 0) + 1) / 2));
      return t < 0.55 ? off() : { pressed: t >= TRIGGER, value: t };
    };
    buttons[6] = trigger(axes[XBOX_BT.lt]);
    buttons[7] = trigger(axes[XBOX_BT.rt]);
    var hat = Number(axes[XBOX_BT.hat]);
    if (isFinite(hat) && Math.abs(hat) <= 1.05) {
      var dir = ((Math.round((hat + 1) * 3.5) % 8) + 8) % 8;
      var on = { pressed: true, value: 1 };
      if (dir === 7 || dir <= 1) buttons[12] = on;
      if (dir >= 3 && dir <= 5) buttons[13] = on;
      if (dir >= 5 && dir <= 7) buttons[14] = on;
      if (dir >= 1 && dir <= 3) buttons[15] = on;
    }
    return { id: pad.id, index: pad.index, mapping: "standard", buttons: buttons, axes: XBOX_BT.sticks.map(function (i) { return Number(axes[i]) || 0; }) };
  }
  function readInputs(pad, before) {
    var down = {}, strength = {};
    var buttons = pad.buttons || [];
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var value = typeof b === "number" ? b : (b && Number(b.value)) || 0;
      var pressed = typeof b === "number" ? b >= TRIGGER : !!(b && b.pressed);
      if ((pressed && (value === 0 || value >= TRIGGER || value === 1)) || (!pressed && value >= TRIGGER)) down["b" + i] = true;
    }
    var axes = pad.axes || [];
    for (var a = 0; a < axes.length; a++) {
      var v = Number(axes[a]) || 0;
      [["+", 1], ["-", -1]].forEach(function (d) {
        var id = "a" + a + d[0], along = v * d[1];
        if (before[id] ? along >= RELEASE : along >= PRESS) down[id] = true;
        if (along > DEAD_ZONE) strength[id] = (along - DEAD_ZONE) / (1 - DEAD_ZONE);
      });
    }
    return { down: down, strength: strength };
  }
  function buttonsDown(pad) {
    var out = {};
    (pad.buttons || []).forEach(function (b, i) { if (b && (b.pressed || b === 1)) out[i] = true; });
    return out;
  }

  var pads = {};      // index -> { down, stuck, since, last, real, start }
  function counted() {
    var out = [];
    var list = [];
    try { list = Array.prototype.slice.call(navigator.getGamepads() || []); } catch (e) { /* not allowed here */ }
    list.forEach(function (raw) {
      if (!raw || raw.connected === false || !isController(raw)) return;
      var p = standardize(raw);
      var s = pads[p.index];
      if (!s) {
        s = pads[p.index] = { down: {}, stuck: {}, since: {}, last: {}, real: p.mapping === "standard", start: buttonsDown(p) };
        var first = readInputs(p, {}).down;
        s.down = first;
        s.stuck = Object.assign({}, first);  // held when it appeared: nothing until let go
      }
      if (!s.real) {  // a layout the browser doesn't know: it counts once a button is really pressed
        var now = buttonsDown(p);
        Object.keys(s.start).forEach(function (k) { if (!now[k]) delete s.start[k]; });
        if (Object.keys(now).some(function (k) { return !s.start[k]; })) s.real = true;
      }
      out.push({ pad: p, state: s });
    });
    return out;
  }

  // ---------- what the highlight can go to ----------
  var FOCUSABLE = ["a[href]", "button", "input", "select", "textarea", '[tabindex]:not([tabindex="-1"])']
    .concat(["button", "link", "tab", "menuitem", "option"].map(function (r) { return '[role="' + r + '"]'; })).join(", ");
  function visible(el) {
    if (el.disabled || el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    var st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  }
  /** A title's details box (or another box over the page): the highlight stays inside it. */
  function box() {
    var list = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .previewModal--wrapper.detail-modal');
    for (var i = list.length - 1; i >= 0; i--) if (list[i].getClientRects().length && visible(list[i])) return list[i];
    return null;
  }
  function candidates() {
    var root = box() || document;
    var out = [];
    var seen = [];
    Array.prototype.forEach.call(root.querySelectorAll(FOCUSABLE), function (el) {
      if (el === host || !visible(el)) return;
      // one stop per title: the link inside a card that is itself a stop goes
      for (var p = el.parentElement; p; p = p.parentElement) if (seen.indexOf(p) >= 0) return;
      seen.push(el);
      out.push(el);
    });
    return out;
  }
  var mid = function (r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  /** The nearest one that way: straight along first, then the one least to the side. */
  function nextFrom(from, dir, list) {
    var a = from.getBoundingClientRect(), ca = mid(a);
    var best = null, score = Infinity;
    list.forEach(function (el) {
      if (el === from || el.contains(from) || from.contains(el)) return;
      var b = el.getBoundingClientRect(), cb = mid(b);
      var along, side;
      if (dir === "right") { along = cb.x - ca.x; side = Math.abs(cb.y - ca.y); if (b.left < a.right - a.width / 2) return; }
      else if (dir === "left") { along = ca.x - cb.x; side = Math.abs(cb.y - ca.y); if (b.right > a.left + a.width / 2) return; }
      else if (dir === "down") { along = cb.y - ca.y; side = Math.abs(cb.x - ca.x); if (b.top < a.bottom - a.height / 2) return; }
      else { along = ca.y - cb.y; side = Math.abs(cb.x - ca.x); if (b.bottom > a.top + a.height / 2) return; }
      if (along <= 2) return;
      var s = along + side * (dir === "left" || dir === "right" ? 3 : 1.2);
      if (s < score) { score = s; best = el; }
    });
    return best;
  }

  // ---------- the ring and the guide (in a closed shadow root) ----------
  var host = null, ring = null, guide = null, current = null, inUse = false;
  var outside = null;  // the last one highlighted with no box open: back on it when the box closes (as on Xbox)
  function ui() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646";
    var root = host.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = ".ring{position:fixed;border:3px solid #22c7d6;border-radius:8px;box-shadow:0 0 0 4px rgba(34,199,214,.3);" +
      "transition:all .08s ease;display:none}" +
      ".guide{position:fixed;right:16px;bottom:16px;display:none;gap:12px;align-items:center;padding:8px 12px;border-radius:14px;" +
      "background:#1d1b22;color:#fff;border:1px solid #3a3642;font:13.5px/1.2 system-ui,sans-serif}" +
      ".k{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;margin-right:5px;border-radius:11px;" +
      "font-size:11.5px;font-weight:700;background:#2e2b35}.a{background:#2f9e44}.b{background:#d6336c}";
    ring = document.createElement("div");
    ring.className = "ring";
    guide = document.createElement("div");
    guide.className = "guide";
    root.append(style, ring, guide);
    document.documentElement.appendChild(host);
  }
  function kindOf(id) {
    var s = String(id || "").toLowerCase();
    if (/playstation|dualshock|dualsense|sony|054c|wireless controller/.test(s)) return "playstation";
    if (/nintendo|switch|pro controller|joy-con|057e/.test(s)) return "switch";
    return "xbox";
  }
  var NAMES = { xbox: ["A", "B", "LT", "RT"], playstation: ["✕", "○", "L2", "R2"], switch: ["B", "A", "ZL", "ZR"] };
  var guideKind = "";
  function drawGuide(kind) {
    if (guide.childNodes.length && guideKind === kind) return;
    guideKind = kind;
    while (guide.firstChild) guide.removeChild(guide.firstChild);
    var n = NAMES[kind] || NAMES.xbox;
    [[[n[0]], text("padSelect", "Select"), "a"], [[n[1]], text("padBack", "Back"), "b"], [[n[2], n[3]], text("padPage", "Page"), ""]].forEach(function (item) {
      var span = document.createElement("span");
      item[0].forEach(function (name) {
        var k = document.createElement("b");
        k.className = "k" + (kind === "xbox" && item[2] ? " " + item[2] : "");
        k.textContent = name;
        span.appendChild(k);
      });
      span.appendChild(document.createTextNode(item[1]));
      guide.appendChild(span);
    });
  }
  function show(on, kind) {
    inUse = on;
    if (!on && !host) return;
    ui();
    if (on) drawGuide(kind);
    guide.style.display = on ? "flex" : "none";
    place();
  }
  function place() {
    if (!ring) return;
    if (!inUse || !current || !current.isConnected || !visible(current)) { ring.style.display = "none"; return; }
    var r = current.getBoundingClientRect();
    ring.style.display = "block";
    ring.style.left = (r.left - 4) + "px";
    ring.style.top = (r.top - 4) + "px";
    ring.style.width = (r.width + 2) + "px";
    ring.style.height = (r.height + 2) + "px";
  }
  function highlight(el) {
    current = el;
    if (!el) { place(); return; }
    if (!box()) outside = el;
    try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable after all */ }
    var r = el.getBoundingClientRect();  // into view, up and down only (Netflix slides its rows itself)
    if (r.top < 70) window.scrollBy(0, r.top - 90);
    else if (r.bottom > innerHeight - 16) window.scrollBy(0, r.bottom - innerHeight + 60);
    place();
  }

  // ---------- what the buttons do ----------
  function typing() {
    var el = document.activeElement;
    return !!el && (el.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(button|checkbox|radio|submit)$/i.test(el.type || "")));
  }
  function move(dir) {
    if (typing() && (dir === "left" || dir === "right")) return;  // the cursor in the search box
    var list = candidates();
    if (!current || list.indexOf(current) < 0) {
      // the first press: the one nearest the top left of what is on screen (as on Xbox, the highlight shows first)
      var first = null, best = Infinity;
      list.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var s = r.top * 2 + r.left;
        if (r.top > 60 && s < best) { best = s; first = el; }
      });
      highlight(first || list[0] || null);
      return;
    }
    var next = nextFrom(current, dir, list);
    if (next) highlight(next);
    else if (dir === "up" || dir === "down") window.scrollBy(0, (dir === "up" ? -1 : 1) * innerHeight * 0.5);
  }
  function press() {
    if (!current || !current.isConnected) { move("down"); return; }
    if (/^(INPUT|TEXTAREA)$/.test(current.tagName)) { current.focus(); return; }
    current.click();
  }
  function back() {
    if (typing()) { document.activeElement.blur(); return; }
    var b = box();
    if (b) {
      var close = b.querySelector('[data-uia="previewModal-closebtn"], [aria-label="close"], [aria-label="Close"], .previewModal-close');
      if (close) close.click();
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
      current = null;
      setTimeout(function () { if (outside && outside.isConnected && !box() && visible(outside)) highlight(outside); }, 250);
      return;
    }
    history.back();
  }
  function act(id) {
    id = STICK_AS_DPAD[id] || id;
    if (DIRS[id]) move(DIRS[id]);
    else if (id === "b0") press();
    else if (id === "b1") back();
    else if (id === "b6") window.scrollBy(0, -innerHeight * 0.8);
    else if (id === "b7") window.scrollBy(0, innerHeight * 0.8);
  }
  var REPEATS = { b12: 1, b13: 1, b14: 1, b15: 1, b6: 1, b7: 1, "a0-": 1, "a0+": 1, "a1-": 1, "a1+": 1 };

  // ---------- the loop, while a controller is connected ----------
  var raf = 0, lastFrame = 0;
  function frame(now) {
    raf = 0;
    if (!onNetflix()) { show(false); return; }
    var list = counted();
    if (!list.length && !anyPad()) { lastFrame = 0; show(false); return; }
    var dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    var mine = document.hasFocus() && !document.hidden;  // (only the window in front: not Tamkeen's behind it)
    list.forEach(function (o) {
      var s = o.state;
      var got = readInputs(o.pad, s.down);
      var down = got.down;
      Object.keys(s.stuck).forEach(function (k) { if (!down[k]) delete s.stuck[k]; });
      var fire = [];
      Object.keys(down).forEach(function (id) {
        if (s.stuck[id]) return;
        if (!s.down[id]) { s.since[id] = s.last[id] = now; fire.push(id); }
        else if (REPEATS[id] && now - s.since[id] >= HOLD_MS && now - s.last[id] >= REPEAT_MS) { s.last[id] = now; fire.push(id); }
      });
      s.down = down;
      if (!s.real || !mine) return;
      if (fire.length) {
        if (!inUse) show(true, kindOf(o.pad.id));
        fire.forEach(function (id) { try { act(id); } catch (e) { /* Netflix's page changed under it */ } });
      }
      // the right stick scrolls, faster the further it is pushed
      var sy = (got.strength["a3+"] || 0) - (got.strength["a3-"] || 0);
      if (sy && !s.stuck["a3+"] && !s.stuck["a3-"]) { window.scrollBy(0, sy * 1400 * dt); if (!inUse) show(true, kindOf(o.pad.id)); }
    });
    if (inUse) place();
    loop();
  }
  function anyPad() {
    try { return Array.prototype.some.call(navigator.getGamepads() || [], function (p) { return p && isController(p); }); } catch (e) { return false; }
  }
  function loop() { if (!raf) raf = requestAnimationFrame(frame); }

  window.addEventListener("gamepadconnected", loop);
  window.addEventListener("gamepaddisconnected", function (e) { if (e.gamepad) delete pads[e.gamepad.index]; loop(); });
  var away = function (e) { if (e.isTrusted && inUse) { show(false); current = null; } };
  window.addEventListener("pointerdown", away, true);
  window.addEventListener("keydown", away, true);
  window.addEventListener("focus", function () { if (anyPad()) loop(); });
  if (anyPad()) loop();

  // (for tests/js/netflix.test.mjs)
  window.__tamkeenNetflixPadLib = { isController: isController, standardize: standardize, readInputs: readInputs, nextFrom: nextFrom };
})();
