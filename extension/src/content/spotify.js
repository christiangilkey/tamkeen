// Tamkeen's karaoke for Spotify, in Spotify's web player (open.spotify.com; the extension's own world
// beside the page), after content/spotify-page.js.
//   - Tamkeen's lyrics panel (spotify.html, a page of the extension shown in a frame) takes a column
//     at the right; Spotify's whole app is narrowed to the rest, so everything of Spotify stays there
//     to use (browse, search, pick songs, its own controls). Folded, the panel is a slim tab.
//   - It passes the panel what Spotify plays and where (content/spotify-main.js, in the page's own
//     world, reports it as page events), and the panel's commands back (play, pause, seek). The frame
//     and this script talk over a private MessageChannel opened with a one-time token.
// Like every script inside someone else's website it uses no innerHTML, and keeps its own elements in
// a closed shadow root.
(function () {
  if (window.top !== window || window.__tamkeenExtSpotify) return;
  window.__tamkeenExtSpotify = true;
  var PAGE = chrome.runtime.getURL("spotify.html");
  var EXT_ORIGIN = new URL(PAGE).origin;

  // Spotify's app is one box (#main) the width of the window: it is narrowed by the panel's width and
  // lays itself out in what is left. (Without that box, the page is given a margin instead.)
  var PUSH = "html.tk-sp #main { width: calc(100vw - var(--tk-side, 0px)) !important; max-width: calc(100vw - var(--tk-side, 0px)) !important;" +
    " flex: none !important; min-width: 0 !important; }" +
    "html.tk-sp.tk-sp-nomain body { margin-right: var(--tk-side, 0px) !important; }";

  var overlay = null; // {host, frame, style, port}
  var state = null;
  var open = null; // the panel open (a column) or folded (a slim tab); null until it says
  // The column: wide enough for big lyrics, never most of the window.
  function width() {
    if (open === null) return 0;
    if (!open) return 26;
    var w = window.innerWidth;
    return Math.round(Math.min(420, Math.max(Math.min(300, w * 0.45), w * 0.28)));
  }

  function token() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }

  function applyLayout() {
    if (!overlay) return;
    var w = width();
    document.documentElement.style.setProperty("--tk-side", w + "px");
    document.documentElement.classList.toggle("tk-sp-nomain", !document.getElementById("main"));
    overlay.host.style.width = w + "px";
  }

  function mount() {
    var nonce = token();
    var host = document.createElement("tamkeen-spotify");
    host.setAttribute("style", "all: initial; display: block; position: fixed; top: 0; right: 0; bottom: 0; width: 0;" +
      " z-index: 2147483646; pointer-events: auto;");
    var root = host.attachShadow({ mode: "closed" });
    var frame = document.createElement("iframe");
    frame.setAttribute("title", "Tamkeen");
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("style", "position: absolute; inset: 0; width: 100%; height: 100%; border: 0; margin: 0; padding: 0;" +
      " background: transparent; color-scheme: dark;");
    frame.src = PAGE + "#" + nonce;
    root.appendChild(frame);
    var style = document.createElement("style");
    style.textContent = PUSH;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(host);
    document.documentElement.classList.add("tk-sp");
    overlay = { host: host, frame: frame, style: style, port: null };
    frame.addEventListener("load", function () {
      if (!overlay || overlay.frame !== frame || overlay.port) return;
      var channel = new MessageChannel();
      overlay.port = channel.port1;
      channel.port1.onmessage = onPanel;
      frame.contentWindow.postMessage({ tamkeenPanel: nonce }, EXT_ORIGIN, [channel.port2]);
      if (state) post({ type: "state", s: state });
    });
  }

  function post(msg) {
    if (overlay && overlay.port) { try { overlay.port.postMessage(msg); } catch (e) { /* closed */ } }
  }

  function onPanel(e) {
    var m = e.data || {};
    if (m.type === "layout") {
      open = m.open !== false;
      applyLayout();
    } else if (m.type === "cmd" && typeof m.name === "string" && ["play", "pause", "seek", "line"].indexOf(m.name) >= 0) {
      document.dispatchEvent(new CustomEvent("tamkeen:sp-cmd", { detail: JSON.stringify({ name: m.name, value: Number(m.value) || 0 }) }));
    }
  }

  // Spotify's own full screen puts one of its boxes on the whole screen: the panel goes with it.
  document.addEventListener("fullscreenchange", function () {
    if (!overlay) return;
    var full = document.fullscreenElement;
    var into = full && full !== document.documentElement ? full : document.documentElement;
    if (overlay.host.parentNode !== into) into.appendChild(overlay.host);
  });

  document.addEventListener("tamkeen:sp-state", function (e) {
    var s;
    try { s = JSON.parse(e.detail); } catch (x) { return; }
    if (!s || typeof s !== "object") return;
    state = s;
    post({ type: "state", s: s });
  });

  addEventListener("resize", applyLayout);
  mount();
})();
