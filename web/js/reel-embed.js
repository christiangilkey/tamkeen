// Run by the phone app inside Instagram's embed page for one reel (the page Instagram makes for
// showing a reel elsewhere), which the app shows in a small window above its own bar of words.
// It makes the reel fill that window, starts it, adds see-through Previous / Next buttons at the
// top, and keeps a note of where the reel is so the app can ask (the app has no other way in:
// this window has no bridge to the app's code). See web/js/pages/reels.js.
//
// Plain script (not a module), no innerHTML, like the other scripts that run in others' pages.
(function () {
  if (window.top !== window || window.__tkReelState) return;
  var ends = 0;      // times the reel has played to its end
  var nav = "";      // the last button pressed, numbered so a repeat press is a new value
  var presses = 0;
  var error = "";
  var started = Date.now();
  var wired = null;

  function video() { return document.querySelector("video"); }
  // Instagram's "The link to this photo or video may be broken" page: what its embed page shows for
  // a post it won't show outside Instagram (age-restricted, private, removed, or not allowed to be
  // embedded). The app tries the reel's ordinary page next, so it is known at once, not after a wait.
  function broken() { return !!document.querySelector(".EmbedBrokenMedia, .ebmMessage, a[href*='utm_campaign=invalid']"); }

  function wire(v) {
    if (wired === v) return;
    wired = v;
    v.loop = false;
    v.addEventListener("ended", function () { ends++; });
    v.addEventListener("error", function () { error = "video"; });
    // Tapping the picture pauses and plays.
    v.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (v.paused) v.play().catch(function () {}); else v.pause(); }, true);
    var p = v.play();
    if (p && p.catch) p.catch(function () { error = "blocked"; });
  }

  // The reel fills the window, on black; Instagram's own frame around it is behind.
  var style = document.createElement("style");
  style.textContent = "html,body{background:#000!important;overflow:hidden!important}" +
    "video{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;" +
    "object-fit:contain!important;background:#000!important;z-index:2147483000!important}";
  (document.head || document.documentElement).appendChild(style);

  function button(label, side, dir) {
    var b = document.createElement("button");
    b.textContent = label;
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

  setInterval(function () {
    addButtons();
    var v = video();
    if (v) wire(v);
    else if (!error && broken()) {
      error = "novideo";
      if (document.body) document.body.style.visibility = "hidden"; // not Instagram's confusing message (the buttons stay)
    }
    else if (!error && Date.now() - started > 12000) error = "novideo"; // this reel can't be shown outside Instagram
  }, 300);

  /** Where the reel is, as JSON text. The app asks a few times a second. */
  window.__tkReelState = function () {
    var v = video();
    return JSON.stringify({
      ready: !!v && v.readyState >= 1, t: v ? v.currentTime : 0, d: (v && v.duration) || 0,
      paused: v ? v.paused : true, ends: ends, nav: nav, error: error, page: location.pathname
    });
  };
  /** What the app tells the reel to do: "play", "pause", or "seek" to a time in seconds. */
  window.__tkReelDo = function (what, time) {
    var v = video();
    if (!v) return;
    if (what === "pause") v.pause();
    else if (what === "seek") { try { v.currentTime = Math.max(0, Number(time) || 0); } catch (e) { /* not ready */ } }
    else if (what === "play") { var p = v.play(); if (p && p.catch) p.catch(function () { error = "blocked"; }); }
  };
})();
