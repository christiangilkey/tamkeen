// Run by the phone app inside a reel's ORDINARY Instagram page (instagram.com/reel/<code>/), for
// reels that Instagram does not let play on its embed page (mostly ones using a song from its music
// library). The ordinary page only plays for someone signed in to Instagram, so the phone has to be
// signed in (once, in the app's own browser; the sign-in is shared with this window).
//
// It does the same job as reel-embed.js and answers the app in the same way (__tkReelState,
// __tkReelDo), so the screen around the reel doesn't care which page it is showing. The differences
// are all about Instagram's page being a live app of its own: it mutes and restarts the reel by
// itself, puts dialogs in front of it, and scrolls on to other reels.
//
// The app sends this file followed by reel-embed.js to every page of its reel window. On an embed
// page this one steps aside; on an ordinary page it claims __tkReelState first, which makes
// reel-embed.js step aside.
//
// Plain script (not a module), no innerHTML, like the other scripts that run in others' pages.
(function () {
  if (window.top !== window || window.__tkReelState) return;
  if (!/(^|\.)instagram\.com$/.test(location.hostname) || /\/embed(\/|$)/.test(location.pathname)) return;

  var ends = 0;          // times the reel has played to its end
  var nav = "";          // the last Previous/Next press, numbered so a repeat press is a new value
  var presses = 0;
  var error = "";
  var started = Date.now();
  var wired = null;
  var want = true;       // should the reel be playing? (the app and taps on the picture change this)
  var finished = false;  // it reached its end: stay stopped until the app says otherwise
  var rate = 1;

  // "Not now" in the languages the app teaches and a few more: the choice that declines whatever
  // Instagram's dialog offers (saving the login, notifications, opening its own app).
  var NOT_NOW = /^(not now|ahora no|plus tard|pas maintenant|ليس الآن|لاحقًا|не сейчас|後で|以后再说|稍后再说|jetzt nicht|non ora|agora não|şimdi değil)$/i;

  function video() {
    var all = document.querySelectorAll("video");
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < all.length; i++) {
      var r = all[i].getBoundingClientRect();
      var h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      var w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      if (h * w >= bestArea) { bestArea = h * w; best = all[i]; }
    }
    return best;
  }

  function wire(v) {
    if (wired === v) return;
    wired = v;
    v.addEventListener("ended", function () { ends++; finished = true; });
    v.addEventListener("error", function () { error = "video"; });
  }

  // Keep the reel the way the app wants it, whatever Instagram's own page does to it.
  function hold(v) {
    try { if (v.loop) v.loop = false; } catch (e) { /* read-only here */ }
    if (v.muted) v.muted = false;
    if (v.playbackRate !== rate) { try { v.playbackRate = rate; } catch (e) { /* not ready */ } }
    var play = want && !finished;
    if (play && v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () { error = "blocked"; }); }
    else if (!play && !v.paused) v.pause(); // also stops Instagram replaying it after the end
  }

  /** Is Instagram asking for a sign-in instead of showing the reel? */
  function wantsSignIn(v) {
    if (/^\/accounts\/(login|emailsignup|signup)/.test(location.pathname)) return true;
    if (document.querySelector('input[name="username"], input[name="password"]')) return true;
    // No reel after a good wait, and no sign of being signed in: Instagram is showing its
    // "open the app / sign up" page instead.
    return !v && Date.now() - started > 8000 && !/(^|; )ds_user_id=\d/.test(document.cookie);
  }

  // Dialogs Instagram puts in front of the reel: press their "Not now".
  function dismissDialogs() {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    for (var i = 0; i < dialogs.length; i++) {
      if (dialogs[i].__tkDone) continue;
      var buttons = dialogs[i].querySelectorAll('button, [role="button"]');
      for (var k = 0; k < buttons.length; k++) {
        if (NOT_NOW.test((buttons[k].innerText || "").replace(/\s+/g, " ").trim())) {
          dialogs[i].__tkDone = true;
          buttons[k].click();
          break;
        }
      }
    }
  }

  // The reel fills the window, on black. Instagram's page stays as it is underneath.
  var style = document.createElement("style");
  style.textContent = "html,body{background:#000!important;overflow:hidden!important}" +
    "video{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;" +
    "object-fit:contain!important;background:#000!important;z-index:2147483000!important}";
  (document.head || document.documentElement).appendChild(style);

  function button(label, side, dir) {
    var b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("data-tk", "1");
    b.style.cssText = "all:initial;position:fixed;top:8px;" + side + ":8px;z-index:2147483600;padding:9px 16px;border-radius:999px;" +
      "background:rgba(0,0,0,.28);color:rgba(255,255,255,.92);font:600 15px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
      "border:1px solid rgba(255,255,255,.28);-webkit-tap-highlight-color:transparent;";
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); presses++; nav = dir + ":" + presses; }, true);
    return b;
  }
  function addButtons() {
    if (!document.body || document.getElementById("tk-reel-prev")) return;
    var prev = button("‹ Previous", "left", "prev");
    var next = button("Next ›", "right", "next");
    prev.id = "tk-reel-prev";
    document.body.appendChild(prev);
    document.body.appendChild(next);
  }

  // A tap on the picture pauses and plays. It is handled here and kept from Instagram's page, which
  // would otherwise pause it too (and then be overruled a moment later).
  window.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-tk")) return;
    if (t && t.closest && t.closest('[role="dialog"], a, button, [role="button"]')) return; // Instagram's own controls
    var v = video();
    if (!v) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (finished) { finished = false; want = true; try { v.currentTime = 0; } catch (err) { /* not ready */ } }
    else want = !want;
    hold(v);
  }, true);
  // No sliding on to other reels: this window shows one reel; Previous/Next change it.
  ["touchmove", "wheel"].forEach(function (type) {
    window.addEventListener(type, function (e) { if (e.cancelable) e.preventDefault(); }, { capture: true, passive: false });
  });

  setInterval(function () {
    addButtons();
    dismissDialogs();
    var v = video();
    if (wantsSignIn(v)) { error = "signin"; return; }
    if (error === "signin") error = "";
    if (v) { wire(v); hold(v); }
    else if (!error && Date.now() - started > 15000) error = "novideo";
  }, 300);

  /** Where the reel is, as JSON text. The app asks a few times a second. */
  window.__tkReelState = function () {
    var v = video();
    return JSON.stringify({
      ready: !!v && v.readyState >= 1, t: v ? v.currentTime : 0, d: (v && v.duration) || 0,
      paused: v ? v.paused : true, rate: rate, ends: ends, nav: nav, error: error, page: location.pathname
    });
  };
  /** What the app tells the reel to do: "play", "pause", "seek" to a time in seconds, or play at a
   * "rate" (1 = normal speed). */
  window.__tkReelDo = function (what, time) {
    var v = video();
    if (what === "pause") want = false;
    else if (what === "play") { want = true; if (finished && v) { try { if (v.currentTime >= (v.duration || 0) - 0.3) v.currentTime = 0; } catch (e) { /* not ready */ } } finished = false; }
    else if (what === "rate") rate = Math.max(0.25, Math.min(2, Number(time) || 1));
    else if (what === "seek") { finished = false; if (v) { try { v.currentTime = Math.max(0, Number(time) || 0); } catch (e) { /* not ready */ } } }
    if (v) hold(v);
  };
})();
