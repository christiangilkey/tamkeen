// Tamkeen for Netflix & Prime Video, in Prime Video's pages (primevideo.com, Amazon's video pages), after
// js/prime-common.js. THE LIGHT WAY (the owner, 2026-11-21): while Prime Video's player is open this
// only READS what it shows on the screen (the subtitle line, the title's name and the player's time)
// and passes it to Tamkeen's panel (prime.html, a page of the extension in a frame at the right edge).
// It never controls Amazon's player (no play, pause, seek, speed, soundtrack or subtitle choice: the
// viewer turns subtitles on in Prime Video's own menu), never changes Amazon's page (its only element
// is the panel's own box, in a closed shadow root), and never downloads anything. The frame and this
// script talk over a private MessageChannel opened with a one-time token, as for Netflix.
// Like every script inside someone else's website it uses no innerHTML.
(function () {
  if (window.top !== window || window.__tamkeenExtPrime) return;
  window.__tamkeenExtPrime = true;
  var lib = window.__tamkeenPrimeLib;
  if (!lib) return; // (it runs only on the addresses the manifest names)
  var PANEL = chrome.runtime.getURL("prime.html");
  var EXT_ORIGIN = new URL(PANEL).origin;
  // The panel's box: at the right edge, clear of the player's own buttons at the top and the bottom.
  var TOP = 76, BOTTOM = 112;

  var overlay = null; // {host, frame, port}
  var width = 0;
  var last = ""; // what was last passed on (so only changes go)

  function token() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }

  function place() {
    if (!overlay) return;
    overlay.frame.style.width = Math.max(0, Math.round(width)) + "px";
  }

  function mount() {
    var nonce = token();
    var host = document.createElement("tamkeen-prime");
    host.setAttribute("style", "all: initial; display: block; position: fixed; top: " + TOP + "px; right: 0; bottom: " + BOTTOM +
      "px; z-index: 2147483647; pointer-events: none;");
    var root = host.attachShadow({ mode: "closed" });
    var frame = document.createElement("iframe");
    frame.setAttribute("title", "Tamkeen");
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("style", "position: absolute; top: 0; right: 0; height: 100%; width: 0; border: 0; margin: 0; padding: 0;" +
      "background: transparent; color-scheme: dark; pointer-events: auto;");
    frame.src = PANEL + "#" + nonce;
    root.appendChild(frame);
    (document.fullscreenElement || document.documentElement).appendChild(host);
    overlay = { host: host, frame: frame, port: null };
    last = "";
    frame.addEventListener("load", function () {
      if (!overlay || overlay.frame !== frame || overlay.port) return;
      var channel = new MessageChannel();
      overlay.port = channel.port1;
      channel.port1.onmessage = onPanel;
      frame.contentWindow.postMessage({ tamkeenPanel: nonce }, EXT_ORIGIN, [channel.port2]);
      last = "";
      look();
    });
  }

  function unmount() {
    if (!overlay) return;
    try { overlay.port && overlay.port.close(); } catch (e) { /* closed */ }
    overlay.host.remove();
    overlay = null;
  }

  function post(msg) {
    if (overlay && overlay.port) { try { overlay.port.postMessage(msg); } catch (e) { /* closed */ } }
  }

  function onPanel(e) {
    var m = e.data || {};
    if (m.type === "layout") { width = Math.min(640, Math.max(0, Number(m.width) || 0)); place(); }
  }

  // Prime Video's own full screen puts one of its boxes on the whole screen: the panel goes with it.
  document.addEventListener("fullscreenchange", function () {
    if (!overlay) return;
    var into = document.fullscreenElement || document.documentElement;
    if (overlay.host.parentNode !== into) into.appendChild(overlay.host);
  });

  // ---------- what the screen shows ----------
  function look() {
    var open = lib.playerOpen(document);
    if (open && !overlay) mount();
    else if (!open && overlay) unmount();
    if (!overlay || !overlay.port) return;
    var cap = lib.readCaption(document);
    var name = lib.readTitle(document);
    var v = lib.playerVideo(document);
    var time = v && isFinite(v.currentTime) ? Math.round(v.currentTime * 100) / 100 : null;
    var msg = { type: "screen", text: cap.text, image: cap.image, t: time, paused: !!(v && v.paused),
      title: name.title, episode: name.episode, id: lib.titleId(location.href) };
    // (the time changes all the time: a change of line, title or pause goes at once, the time once a second)
    var key = [msg.text, msg.image, msg.paused, msg.title, msg.episode, msg.id, time === null ? "" : Math.floor(time)].join("\u0001");
    if (key === last) return;
    last = key;
    post(msg);
  }
  setInterval(look, 200);
  look();
})();
