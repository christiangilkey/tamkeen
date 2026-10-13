// Injected into every page shown in the app's own web browser (the computer's browser window,
// see app/desktop.py, and the phone's InAppBrowser.java). It does nothing except on youtube.com,
// where tapping a video hands that video to Tamkeen, which opens it in its own player (YouTube's
// embedded player with clickable captions) instead of on YouTube's page.
//
// How the hand-over travels:
//   - computer: window.pywebview.api.watch_video(id), which answers once the app has the captions;
//   - phone: the page asks to go to "tamkeen-video://watch?v=<id>", an address only the app's browser
//     understands (it has no other way to talk to the app, on purpose).
//
// Like browser-toolbar.js this runs inside someone else's website, so it is plain script (not a
// module), uses no innerHTML, and keeps its one visible element in a closed shadow root.
(function () {
  if (window.top !== window || window.__tamkeenYouTube) return;
  if (location.hostname.replace(/^(www|m|music)\./, "") !== "youtube.com") return;
  window.__tamkeenYouTube = true;

  /** The video id in a YouTube address, or null (same rules as videoId in ytcaptions.js). */
  function videoId(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    var host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    var id = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1];
    else if (host === "youtube.com") {
      var m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") : null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  // ----- a small message near the bottom of the page (computer only; the phone shows its own) -----
  var pill = null;
  var pillTimer = 0;
  function say(text, good) {
    if (!text) return;
    if (!pill) {
      var host = document.createElement("div");
      host.style.cssText = "all:initial;position:fixed;left:0;right:0;bottom:62px;z-index:2147483647;display:flex;justify-content:center;pointer-events:none;";
      pill = document.createElement("div");
      host.attachShadow({ mode: "closed" }).appendChild(pill);
      (document.body || document.documentElement).appendChild(host);
      pill.__host = host;
    }
    if (!pill.__host.isConnected) (document.body || document.documentElement).appendChild(pill.__host);
    pill.style.cssText = "font:600 15px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;padding:10px 18px;border-radius:999px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.45);max-width:80vw;text-align:center;direction:ltr;" +
      (good === false ? "background:#7f1d1d;color:#fee2e2;" : good ? "background:#2dd4bf;color:#062a26;" : "background:#1c1c1a;color:#f2f1ec;");
    pill.textContent = text;
    pill.__host.style.display = "flex";
    clearTimeout(pillTimer);
    pillTimer = setTimeout(function () { pill.__host.style.display = "none"; }, good === undefined ? 30000 : 5000);
  }

  function pauseVideos() {
    try {
      var list = document.querySelectorAll("video");
      for (var i = 0; i < list.length; i++) list[i].pause();
    } catch (e) { /* nothing playing */ }
  }

  var busy = false;
  /** Hand video `id` to the app. `onPage` = YouTube's own page for it is already showing. */
  function open(id, onPage) {
    if (busy) return;
    if (window.__tamkeenBridge === "address") { // the phone's browser
      location.href = "tamkeen-video://watch?v=" + id;
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.watch_video) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    say("Getting captions…");
    api.watch_video(id).then(function (r) {
      if (r && r.ok) {
        say("✓ Opened in Tamkeen", true);
        if (onPage) { // leave YouTube's page for the video, so it isn't playing in two places
          pauseVideos();
          if (history.length > 1) history.back(); else location.replace("https://www.youtube.com/");
        }
      } else {
        say((r && r.error) || "Couldn't open this video.", false);
      }
    }).catch(function (e) {
      say("Couldn't open this video. " + (e && e.message ? e.message : ""), false);
    }).then(function () { busy = false; });
  }

  // Tapping a video anywhere on YouTube (thumbnail, title, short): take it before YouTube does.
  window.addEventListener("click", function (e) {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var path = e.composedPath ? e.composedPath() : [];
    var link = null;
    for (var i = 0; i < path.length && !link; i++) {
      if (path[i] && path[i].tagName === "A" && path[i].href) link = path[i];
    }
    if (!link && e.target && e.target.closest) link = e.target.closest("a[href]");
    var id = link ? videoId(link.href) : null;
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(id, false);
  }, true);

  // A video's page reached some other way (a typed address, a link opened from elsewhere).
  var handled = "";
  function checkPage() {
    var id = videoId(location.href);
    if (!id) { handled = ""; return; }
    if (id === handled || busy) return;
    handled = id;
    pauseVideos();
    open(id, true);
  }
  setInterval(checkPage, 700);
  checkPage();
  if (window.__tamkeenBridge !== "address" && !videoId(location.href)) say("Tap a video to watch it in Tamkeen", true);
})();
