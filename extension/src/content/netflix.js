// Tamkeen for Netflix, in Netflix's pages (the extension's own world beside the page), after
// js/netflix-common.js and js/netflix-browser.js.
//   - On Netflix's browse pages: netflix-browser.js (the computer's Netflix window uses it too) opens
//     the titles in the language being learned. It starts once the background part has said which
//     language that is, and here it leaves picking a title to Netflix (`handOver: false`).
//   - On a watch page (/watch/<id>): Tamkeen's subtitle bar and transcript sidebar (panel.html, one
//     page of the extension shown in a frame over Netflix's page). Netflix's own player keeps playing
//     the video, its picture fitted into the space the bar and sidebar leave ("the video box"); the
//     frame lets clicks through there (clip-path). The frame and this script talk over a private
//     MessageChannel opened with a one-time token; this script passes the player's state from
//     Netflix's page (content/netflix-main.js) to the frame, and the frame's commands back.
// Like every script inside someone else's website it uses no innerHTML, and keeps its own elements
// in a closed shadow root.
(function () {
  if (window.top !== window || window.__tamkeenExtNetflix) return;
  window.__tamkeenExtNetflix = true;
  var lib = window.__tamkeenNetflixLib;
  if (!lib) return;
  var PANEL = chrome.runtime.getURL("panel.html");
  var EXT_ORIGIN = new URL(PANEL).origin;
  var cfg = null;

  // ---------- the language being learned (from the background part) ----------
  function tellPage() {
    if (cfg) document.dispatchEvent(new CustomEvent("tamkeen:nf-config", { detail: JSON.stringify({ lang: cfg.lang || "" }) }));
  }
  function askConfig() {
    try {
      chrome.runtime.sendMessage({ type: "config" }, function (c) {
        if (chrome.runtime.lastError || !c) return;
        cfg = c;
        tellPage();
        if (c.lang && window.__tamkeenNetflixStart) {
          window.__tamkeenNetflixStart({ lang: c.lang, names: c.names || [], browse: c.browse || [], text: c.text || {},
            hosts: [location.hostname], handOver: false });
        }
      });
    } catch (e) { /* the extension was reloaded: this page's copy of it is gone */ }
  }
  askConfig();
  chrome.storage.onChanged.addListener(function (changes, area) { if (area === "local" && changes.settings) askConfig(); });

  // ---------- the subtitle bar on watch pages ----------
  var overlay = null; // {host, frame, style, port, id}
  var state = null;
  var layout = { side: 0, bar: 0 };

  function token() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }

  // The video box: while a title plays (netflix-player.js marks the page tk-only-video), its picture
  // fills the space to the left of the sidebar and above the bar.
  var VIDEO_BOX = "html.tk-ext.tk-only-video video {" +
    "position: fixed !important; left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important;" +
    "width: calc(100vw - var(--tk-side, 0px)) !important; height: calc(100vh - var(--tk-bar, 0px)) !important;" +
    "max-width: none !important; max-height: none !important; margin: 0 !important; transform: none !important;" +
    "object-fit: contain !important; background: #000 !important; }";

  function clip() {
    var s = Math.max(0, Math.round(layout.side)), b = Math.max(0, Math.round(layout.bar));
    // Everything but the video box (the top-left part): an L of the sidebar and the bar.
    return "polygon(calc(100% - " + s + "px) 0, 100% 0, 100% 100%, 0 100%, 0 calc(100% - " + b + "px), calc(100% - " + s + "px) calc(100% - " + b + "px))";
  }
  function applyLayout() {
    if (!overlay) return;
    var root = document.documentElement;
    root.style.setProperty("--tk-side", Math.round(layout.side) + "px");
    root.style.setProperty("--tk-bar", Math.round(layout.bar) + "px");
    overlay.frame.style.clipPath = clip();
  }

  function mount(id) {
    var nonce = token();
    var host = document.createElement("tamkeen-netflix");
    host.setAttribute("style", "all: initial; display: block; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;");
    var root = host.attachShadow({ mode: "closed" });
    var frame = document.createElement("iframe");
    frame.setAttribute("title", "Tamkeen");
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("style", "position: absolute; inset: 0; width: 100%; height: 100%; border: 0; margin: 0; padding: 0;" +
      "background: transparent; color-scheme: dark; pointer-events: auto; clip-path: polygon(0 0, 0 0, 0 0);");
    frame.src = PANEL + "#" + nonce;
    root.appendChild(frame);
    var style = document.createElement("style");
    style.textContent = VIDEO_BOX;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(host);
    document.documentElement.classList.add("tk-ext");
    overlay = { host: host, frame: frame, style: style, port: null, id: id };
    frame.addEventListener("load", function () {
      if (!overlay || overlay.frame !== frame || overlay.port) return;
      var channel = new MessageChannel();
      overlay.port = channel.port1;
      channel.port1.onmessage = onPanel;
      frame.contentWindow.postMessage({ tamkeenPanel: nonce }, EXT_ORIGIN, [channel.port2]);
      if (state) post({ type: "state", s: state, at: Date.now() });
    });
  }

  function unmount() {
    if (!overlay) return;
    try { overlay.port && overlay.port.close(); } catch (e) { /* closed */ }
    overlay.host.remove();
    overlay.style.remove();
    document.documentElement.classList.remove("tk-ext");
    document.documentElement.style.removeProperty("--tk-side");
    document.documentElement.style.removeProperty("--tk-bar");
    overlay = null;
    infoFor = "";
  }

  function post(msg) {
    if (overlay && overlay.port) { try { overlay.port.postMessage(msg); } catch (e) { /* closed */ } }
  }

  function onPanel(e) {
    var m = e.data || {};
    if (m.type === "layout") {
      layout = { side: Number(m.side) || 0, bar: Number(m.bar) || 0 };
      applyLayout();
    } else if (m.type === "cmd" && typeof m.name === "string") {
      var track = m.name === "audio" || m.name === "text"; // (a track's key; every other command takes a number)
      var value = track ? String(m.value == null ? "" : m.value).slice(0, 200) : Number(m.value) || 0;
      document.dispatchEvent(new CustomEvent("tamkeen:nf-cmd", { detail: JSON.stringify({ name: m.name, value: value }) }));
    } else if (m.type === "fullscreen") {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else document.documentElement.requestFullscreen().catch(function () {});
    } else if (m.type === "leave") {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      if (history.length > 1) history.back(); else location.assign(location.origin + "/browse");
    }
  }

  // Netflix's own full screen puts one of its boxes on the whole screen: the bar goes with it.
  document.addEventListener("fullscreenchange", function () {
    if (!overlay) return;
    var full = document.fullscreenElement;
    var into = full && full !== document.documentElement ? full : document.documentElement;
    if (overlay.host.parentNode !== into) into.appendChild(overlay.host);
    post({ type: "fullscreen", on: !!full });
  });

  // ---------- the player's state, and the title's name ----------
  var infoFor = "";
  function fetchInfo(id) {
    var url = location.origin + "/nq/website/memberapi/release/metadata?movieid=" + encodeURIComponent(id);
    return fetch(url, { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.video ? lib.titleInfo(j.video, id) : null; })
      .catch(function () { return null; });
  }
  function pageTitle() {
    var el = document.querySelector("[data-uia='video-title']");
    if (!el) return null;
    var parts = [];
    var kids = el.children.length ? el.children : [el];
    for (var i = 0; i < kids.length; i++) {
      var t = String(kids[i].textContent || "").replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    }
    return parts.length ? { title: parts[parts.length - 1], show: parts.length > 1 ? parts[0] : "" } : null;
  }
  function findInfo(s) {
    if (!s.id || infoFor === s.id) return;
    if (s.info && (s.info.title || s.info.show)) { infoFor = s.id; post({ type: "info", id: s.id, info: s.info }); return; }
    infoFor = s.id;
    var id = s.id;
    setTimeout(function () {
      if (!overlay || !state || state.id !== id) return;
      if (state.info && (state.info.title || state.info.show)) { post({ type: "info", id: id, info: state.info }); return; }
      fetchInfo(id).then(function (info) {
        info = (info && (info.title || info.show)) ? info : pageTitle();
        if (info) post({ type: "info", id: id, info: info });
      });
    }, 1500);
  }

  document.addEventListener("tamkeen:nf-state", function (e) {
    var s;
    try { s = JSON.parse(e.detail); } catch (x) { return; }
    if (!s || typeof s !== "object") return;
    state = s;
    if (!overlay) return;
    post({ type: "state", s: s, at: Date.now() });
    findInfo(s);
  });

  function check() {
    tellPage();
    var id = lib.watchId(location.href, location.href);
    if (id && !overlay) mount(id);
    else if (!id && overlay) unmount();
    else if (id && overlay) overlay.id = id;
  }
  setInterval(check, 500);
  check();
})();
