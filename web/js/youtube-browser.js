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
// On a channel's page it also shows a Follow button, which adds the channel to the app's followed
// channels (the same list as the Follow button in the app's player); see further down.
//
// Like browser-toolbar.js this runs inside someone else's website, so it is plain script (not a
// module), uses no innerHTML, and keeps what it shows in closed shadow roots.
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

  /** The moment a video's address asks for ("t=95", "t=1m35s"), in seconds, or null. A link from
   * a caption search (see filmot-browser.js) that ended up on YouTube's own page carries one. */
  function moment(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    var s = String(u.searchParams.get("t") || u.searchParams.get("start") || "").trim().toLowerCase();
    if (!s) return null;
    if (/^\d+(\.\d+)?s?$/.test(s)) return Math.floor(parseFloat(s));
    var m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0) : null;
  }

  var busy = false;
  /** Hand video `id` to the app. `onPage` = YouTube's own page for it is already showing. */
  function open(id, onPage) {
    if (busy) return;
    var at = onPage ? moment(location.href) : null;
    if (window.__tamkeenBridge === "address") { // the phone's browser
      location.href = "tamkeen-video://watch?v=" + id + (at === null ? "" : "&t=" + at);
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.watch_video) { say("Still loading… try again in a moment.", false); return; }
    busy = true;
    say("Getting captions…");
    (at === null ? api.watch_video(id) : api.watch_video(id, at)).then(function (r) {
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

  // ----- a channel's page: a button to follow the channel in Tamkeen -----
  // The same followed-channels list as the Follow button in the app's player (Library → YouTube).
  //   - computer: window.pywebview.api.following(name) and .follow_channel(name, id, image, on);
  //   - phone: the page asks to go to "tamkeen-video://follow?name=…&id=…&image=…&on=1|0". It
  //     cannot ask the app anything, so it is told the followed names up front
  //     (window.__tamkeenFollowing) and remembers its own presses for the rest of the visit.
  var phone = window.__tamkeenBridge === "address";
  var ACCENT = "#2bb8c6"; // the app's action colour
  var channelInfo = {};   // channel page path -> {name, id, image}
  var shownPath = "";     // the channel page the button is (being) shown for
  var channel = null;
  var following = false;
  var followBusy = false;
  var followHost = null;
  var followBtn = null;

  /** "/@name", "/channel/UC…", "/c/name" or "/user/name" when a channel's page is showing, else "". */
  function channelPath() {
    var m = location.pathname.match(/^\/(channel\/UC[\w-]{20,30}|@[^\/]+|c\/[^\/]+|user\/[^\/]+)(\/|$)/);
    return m ? "/" + m[1] : "";
  }
  function decode(s) {
    return String(s || "").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  /** What a channel page's own HTML says about the channel (the tags it offers for link previews). */
  function readChannel(html) {
    var pick = function (rx) { var m = rx.exec(html); return m ? decode(m[1]) : ""; };
    var id = pick(/<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{20,30})"/);
    var image = pick(/<meta property="og:image" content="(https:\/\/[^"]+)"/);
    return { name: pick(/<meta property="og:title" content="([^"]*)"/).replace(/\s+/g, " ").trim(), id: id, image: image };
  }
  function remembered(name) {
    try { var v = sessionStorage.getItem("tamkeen-follow:" + name); return v === null ? null : v === "1"; } catch (e) { return null; }
  }
  function remember(name, on) {
    try { sessionStorage.setItem("tamkeen-follow:" + name, on ? "1" : "0"); } catch (e) { /* not kept: the app still has it */ }
  }
  function paintFollow() {
    if (!followBtn || !channel) return;
    var name = channel.name.length > 26 ? channel.name.slice(0, 25) + "…" : channel.name;
    followBtn.textContent = (following ? "✓ Following " : "+ Follow ") + name;
    followBtn.title = following ? "You follow this channel in Tamkeen. Press to stop following." : "Follow this channel in Tamkeen: it appears in your Library under YouTube";
    followBtn.style.cssText = "font:600 15px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;box-sizing:border-box;max-width:78vw;" +
      "padding:10px 18px;border-radius:999px;border:2px solid " + ACCENT + ";cursor:pointer;white-space:nowrap;overflow:hidden;" +
      "text-overflow:ellipsis;box-shadow:0 6px 24px rgba(0,0,0,.45);direction:ltr;" +
      (following ? "background:" + ACCENT + ";color:#03262b;" : "background:#1c1c1a;color:" + ACCENT + ";");
  }
  function showFollow(info) {
    channel = info;
    if (!followHost) {
      followHost = document.createElement("div");
      // Bottom right on the computer (above the browser's bar); bottom left on the phone, where
      // the bottom right corner belongs to the Import Page button.
      followHost.style.cssText = "all:initial;position:fixed;z-index:2147483647;" + (phone ? "left:14px;bottom:18px;" : "right:18px;bottom:62px;");
      followHost.setAttribute("data-tamkeen", "follow");
      followBtn = document.createElement("button");
      followBtn.onclick = toggleFollow;
      followHost.attachShadow({ mode: "closed" }).appendChild(followBtn);
    }
    if (!followHost.isConnected) (document.body || document.documentElement).appendChild(followHost);
    followHost.style.display = "block";
    var kept = remembered(info.name);
    following = kept !== null ? kept : (window.__tamkeenFollowing || []).indexOf(info.name) >= 0;
    paintFollow();
    if (phone) return;
    var api = window.pywebview && window.pywebview.api;
    if (api && api.following) {
      api.following(info.name).then(function (r) {
        if (channel !== info) return;
        following = !!(r && r.following);
        paintFollow();
      }).catch(function () { /* drawn as not followed */ });
    }
  }
  function hideFollow() {
    channel = null;
    shownPath = "";
    if (followHost) followHost.style.display = "none";
  }
  function toggleFollow() {
    if (!channel || followBusy) return;
    var info = channel;
    var on = !following;
    if (phone) {
      following = on;
      remember(info.name, on);
      paintFollow();
      location.href = "tamkeen-video://follow?name=" + encodeURIComponent(info.name) + "&id=" + encodeURIComponent(info.id) +
        "&image=" + encodeURIComponent(info.image) + "&on=" + (on ? "1" : "0");
      return;
    }
    var api = window.pywebview && window.pywebview.api;
    if (!api || !api.follow_channel) { say("Still loading… try again in a moment.", false); return; }
    followBusy = true;
    api.follow_channel(info.name, info.id, info.image, on).then(function (r) {
      if (r && r.ok) {
        if (channel === info) { following = !!r.following; paintFollow(); }
        remember(info.name, !!r.following);
        say(r.following ? "Following " + info.name + ". It's in your Library under YouTube." : "Stopped following " + info.name + ".", true);
      } else {
        say((r && r.error) || "Couldn't follow this channel.", false);
      }
    }).catch(function (e) {
      say("Couldn't follow this channel. " + (e && e.message ? e.message : ""), false);
    }).then(function () { followBusy = false; });
  }
  /** Show the button on a channel's page, hide it everywhere else. */
  function checkChannel() {
    var path = channelPath();
    if (!path) { if (shownPath) hideFollow(); return; }
    if (path === shownPath) return;
    hideFollow();
    shownPath = path;
    if (channelInfo[path]) { showFollow(channelInfo[path]); return; }
    // YouTube changes pages without reloading, so the page's own tags may describe an earlier
    // page: ask for this channel's page afresh and read them from that.
    fetch(location.origin + path, { credentials: "same-origin" }).then(function (res) { return res.text(); }).then(function (html) {
      var info = readChannel(html);
      if (!info.name) return;
      channelInfo[path] = info;
      if (shownPath === path) showFollow(info);
    }).catch(function () { /* no button this time */ });
  }

  setInterval(function () { checkPage(); checkChannel(); }, 700);
  checkPage();
  checkChannel();
  if (window.__tamkeenBridge !== "address" && !videoId(location.href)) say("Tap a video to watch it in Tamkeen", true);
})();
