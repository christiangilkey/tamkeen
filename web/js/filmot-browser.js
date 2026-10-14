// Injected into every page shown in the app's own web browser (the computer's browser window,
// see app/desktop.py, and the phone's InAppBrowser.java). It does nothing except on filmot.com,
// the search engine over YouTube's captions that the Vocab page's "Find in a video" button opens
// (see web/js/filmot.js). There, tapping a link to a YouTube video hands the video and the moment
// the link points at to Tamkeen, which opens it in its own player at that moment.
//
// How the hand-over travels (the same two ways as youtube-browser.js):
//   - computer: window.pywebview.api.watch_video(id, seconds), which answers once the app has the captions;
//   - phone: the page asks to go to "tamkeen-video://watch?v=<id>&t=<seconds>".
// The moment is always sent, 0 when the link has none: that is how the app knows the video came
// from a search for a word.
//
// It only reads the links Filmot's pages already show. It asks Filmot nothing and presses nothing.
// Like the other browser scripts this is plain script (not a module) and uses no innerHTML.
(function () {
  if (window.top !== window || window.__tamkeenFilmot) return;
  if (location.hostname.replace(/^www\./, "") !== "filmot.com") return;
  window.__tamkeenFilmot = true;

  /** Seconds in a link's "t" or "start": "95", "95s", "1m35s", "1h2m3s". 0 when there is none. */
  function seconds(value) {
    var s = String(value || "").trim().toLowerCase();
    if (/^\d+(\.\d+)?s?$/.test(s)) return Math.floor(parseFloat(s));
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m || !s) return 0;
    return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  }

  /** {id, at} for a link to a YouTube video, else null. */
  function video(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    var host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    var id = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      var m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      id = m ? m[1] : u.pathname === "/watch" ? u.searchParams.get("v") : null;
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    var at = seconds(u.searchParams.get("t") || u.searchParams.get("start") || u.searchParams.get("time_continue"));
    return { id: id, at: Math.min(at, 999999) };
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
    pillTimer = setTimeout(function () { pill.__host.style.display = "none"; }, good === undefined ? 30000 : 6000);
  }

  var busy = false;
  function open(v) {
    if (busy) return;
    if (window.__tamkeenBridge === "address") { // the phone's browser
      location.href = "tamkeen-video://watch?v=" + v.id + "&t=" + v.at;
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.watch_video) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    say("Getting captions…");
    api.watch_video(v.id, v.at).then(function (r) {
      if (r && r.ok) say("✓ Opened in Tamkeen", true);
      else say((r && r.error) || "Couldn't open this video.", false);
    }).catch(function (e) {
      say("Couldn't open this video. " + (e && e.message ? e.message : ""), false);
    }).then(function () { busy = false; });
  }

  // Tapping a link to a video anywhere on Filmot (a result's time, title or picture).
  window.addEventListener("click", function (e) {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var path = e.composedPath ? e.composedPath() : [];
    var link = null;
    for (var i = 0; i < path.length && !link; i++) {
      if (path[i] && path[i].tagName === "A" && path[i].href) link = path[i];
    }
    if (!link && e.target && e.target.closest) link = e.target.closest("a[href]");
    var v = link ? video(link.href) : null;
    if (!v) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(v);
  }, true);

  if (window.__tamkeenBridge !== "address" && /^\/search\//.test(location.pathname)) {
    say("Tap a result's link to YouTube to open that moment in Tamkeen", true);
  }
})();
